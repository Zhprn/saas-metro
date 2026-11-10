import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type GroupMetadata,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode';
import pino from 'pino';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import axios from 'axios';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
import { WaGateway } from './wa.gateway';
import { CloudinaryService } from 'src/common/services/cloudinary.service';
import { AiService } from 'src/ai/ai.service';
import { useDbAuthState } from './baileys-db-auth';
import { CryptoService } from 'src/common/services/crypto.service';

type SessionRuntime = {
  qr?: string;
  sock?: ReturnType<typeof makeWASocket>;
  ready: boolean;
  ownerId?: string;
  connecting: boolean;
  rejected?: boolean;
  error?: string;
};

type BroadcastTextInput = {
  name?: string;
  isScheduled?: boolean;
  scheduleType?: string;
  timetableRepeater?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  recipients?: string[];
  contactIds?: string[];
  useAllContacts?: boolean;
  text: string;
  delayMs: number;
  jitterMs: number;
  checkNumber: boolean;
};

type BroadcastImageInput = {
  name?: string;
  isScheduled?: boolean;
  scheduleType?: string;
  timetableRepeater?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  recipients?: string[];
  contactIds?: string[];
  useAllContacts?: boolean;
  caption?: string;
  imageUrl: string;
  delayMs: number;
  jitterMs: number;
  checkNumber: boolean;
};

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

function withJitter(base: number, jitter: number) {
  if (jitter <= 0) return base;
  const delta = Math.floor((Math.random() * 2 - 1) * jitter);
  return Math.max(0, base + delta);
}

function countStatuses(items: { status: string }[]) {
  return items.reduce(
    (acc, it) => {
      acc[it.status] = ((acc[it.status] || 0) as number) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
}

@Injectable()
export class WaService implements OnModuleInit {
  private readonly logger = new Logger('WaService');
  private sessions = new Map<string, SessionRuntime>();

  constructor(
    private prisma: PrismaService,
    private gateway: WaGateway,
    private cloudinary: CloudinaryService,
    private aiService: AiService,
    private crypto: CryptoService,
  ) {}
  async onModuleInit() {
    this.logger.log('Auto-reconnecting WhatsApp sessions...');
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { connected: true },
    });
    for (const s of sessions) {
      if (!s.ownerId) {
        this.logger.warn(`Skipping session ${s.id} because ownerId is null`);
        continue;
      }
      try {
        await this.connect(s.id, s.ownerId, s.label ?? undefined);
        this.logger.log(`Auto-reconnected session ${s.id}`);
      } catch (err: any) {
        this.logger.error(`Failed to auto-reconnect ${s.id}: ${err.message}`);
      }
    }
  }
  /** Create/(re)connect a session; returns QR (if needed) */
  async connect(sessionId: string, ownerId: string, label?: string) {
    // Check session limits first if this is a new session
    const existingDb = await this.prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
      select: { id: true },
    });

    if (!existingDb) {
      // Trying to connect a NEW session. Check how many this user has
      const sessionCount = await this.prisma.whatsAppSession.count({
        where: { ownerId },
      });

      if (sessionCount >= 1) {
        throw new BadRequestException(
          'You already have a WhatsApp session. Premium membership is required for multiple sessions.',
        );
      }
    }

    // Singleton guard
    const existing = this.sessions.get(sessionId);
    if (existing?.connecting || existing?.sock) {
      return {
        sessionId,
        connected: existing.ready,
        qr: existing.qr ?? null,
      };
    }

    // Prepare runtime
    const runtime: SessionRuntime & {
      __resolve?: (v: { connected: boolean; qr?: string | null }) => void;
      __reject?: (e: any) => void;
    } = {
      ready: false,
      ownerId,
      connecting: true,
    };
    this.sessions.set(sessionId, runtime);

    // Prepare auth
    const { state, saveCreds } = await useDbAuthState(sessionId, this.prisma);
    const { version } = await fetchLatestBaileysVersion();

    // Create socket
    const sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(
          state.keys,
          pino({ level: 'silent' }),
        ),
      },
      logger: pino({ level: 'info' }),
      browser: [
        'Mitbiz',
        process.env.NODE_ENV ?? 'local',
        sessionId.slice(0, 6),
      ],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    runtime.sock = sock;
    this.registerMessageListener(sock, sessionId);

    // Persist credentials
    sock.ev.on('creds.update', saveCreds);

    // Handle connection lifecycle
    sock.ev.on('connection.update', async (u) => {
      const { connection, qr, lastDisconnect } = u;

      if (qr) {
        runtime.qr = await qrcode.toDataURL(qr);
        runtime.ready = false;
        this.logger.log(`QR generated for ${sessionId}`);
      }

      if (connection === 'open') {
        runtime.qr = undefined;

        const me = sock.user?.id ?? null;

        // Telephone validation
        // Extract bare phone from JID (e.g. "628xxx:12@s.whatsapp.net" → "628xxx")
        const connectedPhone = me ? me.split('@')[0].split(':')[0] : null;

        const user = await this.prisma.user.findUnique({
          where: { id: ownerId },
          select: { telephone: true },
        });

        if (user?.telephone && connectedPhone) {
          // Normalize both sides: strip +, spaces, and leading zeros
          const normalize = (p: string) =>
            p.replace(/^\+/, '').replace(/\s+/g, '').replace(/^0+/, '');
          const expectedPhone = normalize(user.telephone);
          const actualPhone = normalize(connectedPhone);
          this.logger.log(
            `Session ${sessionId}: telephone check — DB="${expectedPhone}" vs WA="${actualPhone}"`,
          );

          if (expectedPhone !== actualPhone) {
            this.logger.warn(
              `Session ${sessionId}: WA number ${actualPhone} does not match user telephone ${expectedPhone}. Rejecting.`,
            );

            runtime.connecting = false;
            runtime.ready = false;
            runtime.rejected = true;
            runtime.error = `WhatsApp number (${actualPhone}) does not match your registered telephone number (${expectedPhone}). Please logout and use the correct number.`;
            try {
              sock.end(new Error('Telephone mismatch'));
            } catch {}

            // Reject the awaiting Promise directly
            runtime.__reject?.(new BadRequestException(runtime.error));
            return;
          }
        }
        runtime.ready = true;

        // create once, update later
        const exists = await this.prisma.whatsAppSession.findUnique({
          where: { id: sessionId },
          select: { id: true },
        });

        if (!exists) {
          await this.prisma.whatsAppSession.create({
            data: {
              id: sessionId,
              label,
              ownerId,
              meJid: me,
              connected: true,
            },
          });
        } else {
          await this.prisma.whatsAppSession.update({
            where: { id: sessionId },
            data: {
              connected: true,
              meJid: me,
            },
          });
        }

        this.logger.log(`Session ${sessionId} connected as ${me}`);

        // Resolve the awaiting Promise
        runtime.__resolve?.({ connected: true, qr: null });
      }

      if (connection === 'close') {
        const code = (lastDisconnect as any)?.error?.output?.statusCode;
        this.logger.warn(`Session ${sessionId} closed (${code})`);

        runtime.ready = false;
        runtime.qr = undefined;

        await this.prisma.whatsAppSession.updateMany({
          where: { id: sessionId },
          data: { connected: false },
        });

        // Destroy socket BEFORE reconnect
        try {
          sock.end(new Error('Socket restart'));
        } catch (error: any) {
          this.logger.warn(
            `Error ending socket for session ${sessionId}: ${error.message}`,
          );
        }

        this.sessions.delete(sessionId);

        // reconnect only if not logged out and not rejected due to telephone mismatch
        if (code !== DisconnectReason.loggedOut && !runtime.rejected) {
          setTimeout(() => {
            this.connect(sessionId, ownerId, label).catch(() => {});
          }, 3000);
        }
      }
    });

    // Wait for QR or open (optional API response)
    const result = await new Promise<{
      connected: boolean;
      qr?: string | null;
    }>((resolve, reject) => {
      // Store callbacks so the async connection.update handler can settle this promise
      runtime.__resolve = (v) => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          resolve(v);
        }
      };
      runtime.__reject = (e) => {
        if (!done) {
          done = true;
          clearTimeout(timeout);
          reject(e);
        }
      };

      let done = false;

      const timeout = setTimeout(() => {
        if (!done) {
          done = true;
          resolve({ connected: runtime.ready, qr: runtime.qr ?? null });
        }
      }, 20000);

      // QR events are still handled here (they do not need async DB work)
      sock.ev.on('connection.update', (u) => {
        if (done) return;
        if (u.qr) {
          clearTimeout(timeout);
          done = true;
          resolve({ connected: false, qr: runtime.qr ?? null });
        }
        // 'open' is handled asynchronously in the other listener above
      });
    });

    return { sessionId, ...result };
  }

  /** Resolve the active WhatsApp session ID for a given owner */
  async getSessionByOwner(ownerId: string): Promise<string> {
    const session = await this.prisma.whatsAppSession.findFirst({
      where: { ownerId, connected: true },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundException(
        'No active WhatsApp session found. Please connect first.',
      );
    }
    return session.id;
  }

  /** List all sessions from database */
  async listSessions(ownerId: string) {
    const sessions = await this.prisma.whatsAppSession.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
    return { sessions };
  }

  /** Return current QR (if any) */
  getQr(sessionId: string) {
    const rt = this.sessions.get(sessionId);
    if (!rt)
      throw new NotFoundException(
        'Session not initialized. Call /wa/session/:id/connect first.',
      );

    if (rt.error) {
      throw new BadRequestException(rt.error);
    }

    return { sessionId, qr: rt.qr ?? null, connected: rt.ready };
  }

  /** Send text message — accepts phone number OR full JID (e.g. xxx@lid, xxx@s.whatsapp.net) */
  async sendText(sessionId: string, toPhoneOrJid: string, text: string) {
    const rt = await this.ensureConnected(sessionId);

    // If already a full JID (contains @), use as-is; otherwise convert phone→JID
    const jid = toPhoneOrJid.includes('@')
      ? toPhoneOrJid
      : this.phoneToJid(toPhoneOrJid);
    const res = await rt.sock.sendMessage(jid, { text });

    // Narrowing & fallback for strict TS
    const messageId = res && res.key ? (res.key.id ?? null) : null;
    if (!messageId) {
      this.logger.warn(`sendMessage returned no messageId for ${jid}`);
    }

    if (messageId) {
      // Save outgoing message to DB immediately (don't wait for Baileys echo)
      await this.prisma.whatsAppMessage.upsert({
        where: { messageId },
        update: {},
        create: {
          sessionId,
          phone: jid,
          direction: 'OUTGOING',
          messageId,
          text: this.crypto.encrypt(text),
          type: 'conversation',
          status: 'SENT',
        },
      });

      await this.upsertConversation({
        sessionId,
        jid,
        text,
        messageType: 'conversation',
        messageId,
        fromMe: true,
      });

      // Emit websocket events so FE updates in real-time
      this.gateway.server.to(sessionId).emit('new-message', {
        id: messageId,
        sessionId,
        jid,
        text,
        type: 'conversation',
        fromMe: true,
        createdAt: new Date(),
      });

      this.gateway.server.to(sessionId).emit('conversation-updated', {
        sessionId,
        jid,
      });
    }

    return { messageId, to: jid };
  }

  /** Send image message */
  async sendImage(
    sessionId: string,
    toPhoneOrJid: string,
    imageUrl: string,
    caption?: string,
  ) {
    const rt = await this.ensureConnected(sessionId);
    const jid = toPhoneOrJid.includes('@')
      ? toPhoneOrJid
      : this.phoneToJid(toPhoneOrJid);

    const imgBuf = await this.fetchImageBuffer(imageUrl);
    const res = await rt.sock!.sendMessage(jid, {
      image: imgBuf,
      caption: caption || undefined,
    });

    const messageId = res && res.key ? (res.key.id ?? null) : null;

    if (messageId) {
      await this.prisma.whatsAppMessage.upsert({
        where: { messageId },
        update: {},
        create: {
          sessionId,
          phone: jid,
          direction: 'OUTGOING',
          messageId,
          text: caption ?? null,
          mediaUrl: imageUrl,
          type: 'image',
          status: 'SENT',
        },
      });

      this.gateway.server.to(sessionId).emit('new-message', {
        id: messageId,
        sessionId,
        jid,
        text: caption || '[Image]',
        type: 'image',
        fromMe: true,
        createdAt: new Date(),
      });
      this.gateway.server
        .to(sessionId)
        .emit('conversation-updated', { sessionId, jid });
    }
    return { messageId, to: jid };
  }

  /** Check if number has WhatsApp account */
  async checkNumber(sessionId: string, toPhoneE164: string) {
    // LID JIDs cannot be checked via onWhatsApp, but they are guaranteed to exist
    // since they only come from WhatsApp's internal group metadata.
    if (toPhoneE164.includes('@lid')) {
      return { exists: true, jid: toPhoneE164 };
    }

    const rt = await this.ensureConnected(sessionId);

    const jid = this.phoneToJid(toPhoneE164);
    const info = await rt.sock.onWhatsApp(jid);

    // Ensure array & pick first
    const first = Array.isArray(info) ? info[0] : undefined;
    const exists = !!first?.exists;
    const resolvedJid = first?.jid ?? null;

    return { exists, jid: resolvedJid };
  }

  /** Ensure session is connected (reconnect if needed) */
  private async ensureConnected(
    sessionId: string,
  ): Promise<SessionRuntime & { sock: ReturnType<typeof makeWASocket> }> {
    let rt = this.sessions.get(sessionId);

    // If session exists in memory and socket is ready, return it
    if (rt?.sock && rt.ready) {
      return rt as SessionRuntime & { sock: ReturnType<typeof makeWASocket> };
    }

    // Check if session exists in database and is marked as connected
    const dbSession = await this.prisma.whatsAppSession.findUnique({
      where: { id: sessionId },
    });

    // If session exists in DB and marked as connected, try to reconnect
    if (dbSession?.connected) {
      this.logger.log(
        `Reconnecting session ${sessionId} that was lost from memory`,
      );
      try {
        const ownerForReconnect = dbSession.ownerId ?? rt?.ownerId;
        if (!ownerForReconnect) {
          throw new BadRequestException('Owner not found for this session');
        }
        await this.connect(
          sessionId,
          ownerForReconnect,
          dbSession.label ?? undefined,
        );
        // Wait a bit for connection to establish
        await new Promise((resolve) => setTimeout(resolve, 2000));
        rt = this.sessions.get(sessionId);
        if (rt?.sock && rt.ready) {
          return rt as SessionRuntime & {
            sock: ReturnType<typeof makeWASocket>;
          };
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to reconnect session ${sessionId}:`,
          error.message,
        );
      }
    }

    throw new NotFoundException(
      'Session not connected. Please connect the session first.',
    );
  }

  /** Fetch groups & members (POC; mind ToS) */
  async fetchGroups(sessionId: string) {
    const rt = await this.ensureConnected(sessionId);

    const participating = await rt.sock.groupFetchAllParticipating();
    const metaMap = participating as unknown as Record<string, GroupMetadata>;
    const groups = Object.values(metaMap)
      .filter((g) => !g.isCommunity)
      .map((g) => ({
        id: g.id,
        subject: g.subject,
        size: g.size,
        participants: g.participants?.length ?? 0,
      }));

    return { count: groups.length, groups };
  }

  /** Logout */
  async logout(sessionId: string) {
    const rt = this.sessions.get(sessionId);

    try {
      if (rt?.sock) {
        await rt.sock.logout();
      }
    } catch {}

    this.sessions.delete(sessionId);

    // Get the agent first to delete its dependents
    const agent = await this.prisma.aiAgent.findUnique({
      where: { sessionId },
      select: { id: true },
    });

    if (agent) {
      // Delete dependents in order
      await this.prisma.aiKnowledgeFile.deleteMany({
        where: { agentId: agent.id },
      });
      await this.prisma.aiEmbedding.deleteMany({
        where: { agentId: agent.id },
      });
      await this.prisma.aiConversationMemory.deleteMany({
        where: { agentId: agent.id },
      });
      await this.prisma.aiUsageLog.deleteMany({
        where: { agentId: agent.id },
      });

      // Now delete the agent
      await this.prisma.aiAgent.delete({ where: { id: agent.id } });
    }

    // delete session from DB
    await this.prisma.waSession.deleteMany({
      where: { id: sessionId },
    });

    await this.prisma.whatsAppSession.deleteMany({
      where: { id: sessionId },
    });

    return { success: true, requireQr: true };
  }

  async broadcastText(
    ownerId: string,
    sessionId: string,
    dto: BroadcastTextInput,
  ) {
    const {
      text,
      delayMs,
      jitterMs,
      checkNumber,
      isScheduled,
      scheduleType,
      timetableRepeater,
      scheduledDate,
      scheduledTime,
      name,
    } = dto;
    const recipients = await this.resolveWhatsAppRecipients(ownerId, dto);
    if (!recipients.length) {
      throw new BadRequestException(
        'No recipients resolved from request or stored contacts.',
      );
    }

    await this.ensureConnected(sessionId);

    // If scheduled, save to db and return
    if (isScheduled && scheduleType === 'SCHEDULE_LATER') {
      const camp = await this.prisma.waCampaign.create({
        data: {
          sessionId,
          name,
          type: 'TEXT',
          text,
          delayMs,
          jitterMs,
          isScheduled,
          scheduleType,
          timetableRepeater,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
          scheduledTime,
          status: 'ACTIVE',
          recipients: JSON.stringify(recipients),
        },
      });
      return {
        campaignId: camp.id,
        status: 'SCHEDULED',
        total: recipients.length,
        message: 'Campaign scheduled successfully.',
      };
    }

    // optional: create a campaign row for SEND_NOW
    let campaignId: string | undefined;
    try {
      const camp = await this.prisma.waCampaign.create({
        data: { sessionId, name, type: 'TEXT', text, delayMs, jitterMs },
        select: { id: true },
      });
      campaignId = camp.id;
    } catch {
      /* schema optional */
    }

    const results: Array<{
      phone: string;
      status: 'SENT' | 'SKIPPED' | 'FAILED';
      error?: string;
    }> = [];

    for (const entry of recipients) {
      const phone = entry.phone;
      try {
        if (checkNumber) {
          const check = await this.checkNumber(sessionId, phone);
          if (!check.exists) {
            results.push({
              phone,
              status: 'SKIPPED',
              error: 'Not on WhatsApp',
            });
            // optional: mark contact inactive in DB
            await this.prisma.whatsAppMessage
              ?.create?.({
                data: {
                  phone,
                  contactId: entry.contactId ?? null,
                  sessionId,
                  campaignId,
                  direction: 'OUTGOING',
                  text: this.crypto.encrypt(text),
                  status: 'FAILED',
                  errorMessage: 'Not on WhatsApp',
                },
              })
              .catch(() => {});
            continue;
          }
        }

        const sendRes = await this.sendText(sessionId, phone, text);
        results.push({ phone, status: 'SENT' });

        await this.prisma.whatsAppMessage
          ?.create?.({
            data: {
              phone,
              contactId: entry.contactId ?? null,
              sessionId,
              campaignId,
              direction: 'OUTGOING',
              text: this.crypto.encrypt(text),
              status: 'SENT',
            },
          })
          .catch(() => {});

        await sleep(withJitter(delayMs, jitterMs)); // atur jarak kirim
      } catch (e: any) {
        const msg = e?.message || 'Send failed';
        results.push({ phone, status: 'FAILED', error: msg });
        await this.prisma.whatsAppMessage
          ?.create?.({
            data: {
              phone,
              contactId: entry.contactId ?? null,
              sessionId,
              campaignId,
              direction: 'OUTGOING',
              text: this.crypto.encrypt(text),
              status: 'FAILED',
              errorMessage: msg,
            },
          })
          .catch(() => {});
        // backoff a bit before next number
        await sleep(withJitter(Math.max(delayMs, 1200), jitterMs));
      }
    }

    return {
      campaignId,
      total: recipients.length,
      summary: countStatuses(results),
      results,
    };
  }

  async broadcastImage(
    ownerId: string,
    sessionId: string,
    dto: BroadcastImageInput,
  ) {
    const {
      caption,
      imageUrl,
      delayMs,
      jitterMs,
      checkNumber,
      isScheduled,
      scheduleType,
      timetableRepeater,
      scheduledDate,
      scheduledTime,
      name,
    } = dto;
    const recipients = await this.resolveWhatsAppRecipients(ownerId, dto);
    if (!recipients.length) {
      throw new BadRequestException(
        'No recipients resolved from request or stored contacts.',
      );
    }

    const rt = await this.ensureConnected(sessionId);

    if (isScheduled && scheduleType === 'SCHEDULE_LATER') {
      const camp = await this.prisma.waCampaign.create({
        data: {
          sessionId,
          name,
          type: 'IMAGE',
          imageUrl,
          text: caption ?? null,
          delayMs,
          jitterMs,
          isScheduled,
          scheduleType,
          timetableRepeater,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : null,
          scheduledTime,
          status: 'ACTIVE',
          recipients: JSON.stringify(recipients),
        },
      });
      return {
        campaignId: camp.id,
        status: 'SCHEDULED',
        total: recipients.length,
        message: 'Campaign scheduled successfully.',
      };
    }

    // prefetch the image once (to avoid downloading for every recipient)
    const imgBuf = await this.fetchImageBuffer(imageUrl);

    // optional: campaign row
    let campaignId: string | undefined;
    try {
      const camp = await this.prisma.waCampaign.create({
        data: {
          sessionId,
          name,
          type: 'IMAGE',
          imageUrl,
          text: caption ?? null,
          delayMs,
          jitterMs,
        },
        select: { id: true },
      });
      campaignId = camp.id;
    } catch {}

    const results: Array<{
      phone: string;
      status: 'SENT' | 'SKIPPED' | 'FAILED';
      error?: string;
    }> = [];

    for (const entry of recipients) {
      const phone = entry.phone;
      try {
        if (checkNumber) {
          const check = await this.checkNumber(sessionId, phone);
          if (!check.exists) {
            results.push({
              phone,
              status: 'SKIPPED',
              error: 'Not on WhatsApp',
            });
            await this.prisma.whatsAppMessage
              ?.create?.({
                data: {
                  phone,
                  contactId: entry.contactId ?? null,
                  sessionId,
                  campaignId,
                  direction: 'OUTGOING',
                  text: caption ?? null,
                  mediaUrl: imageUrl,
                  status: 'FAILED',
                  errorMessage: 'Not on WhatsApp',
                },
              })
              .catch(() => {});
            continue;
          }
        }

        const jid = this.phoneToJid(phone);
        const res = await rt.sock!.sendMessage(jid, {
          image: imgBuf, // Buffer
          caption: caption || undefined,
        });

        // update log
        results.push({ phone, status: 'SENT' });
        await this.prisma.whatsAppMessage
          ?.create?.({
            data: {
              phone,
              contactId: entry.contactId ?? null,
              sessionId,
              campaignId,
              direction: 'OUTGOING',
              text: caption ?? null,
              mediaUrl: imageUrl,
              status: 'SENT',
            },
          })
          .catch(() => {});

        await sleep(withJitter(delayMs, jitterMs));
      } catch (e: any) {
        const msg = e?.message || 'Send failed';
        results.push({ phone, status: 'FAILED', error: msg });
        await this.prisma.whatsAppMessage
          ?.create?.({
            data: {
              phone,
              contactId: entry.contactId ?? null,
              sessionId,
              campaignId,
              direction: 'OUTGOING',
              text: caption ?? null,
              mediaUrl: imageUrl,
              status: 'FAILED',
              errorMessage: msg,
            },
          })
          .catch(() => {});
        await sleep(withJitter(Math.max(delayMs, 1500), jitterMs));
      }
    }

    return {
      campaignId,
      total: recipients.length,
      summary: countStatuses(results),
      results,
    };
  }

  // 1) Send into a group chat (text)
  public async groupSendText(
    sessionId: string,
    dto: { groupJid: string; text: string },
  ) {
    const rt = await this.ensureConnected(sessionId);

    const res = await rt.sock.sendMessage(dto.groupJid, { text: dto.text });
    return { groupJid: dto.groupJid, messageId: res?.key?.id ?? null };
  }

  // 2) Send into a group chat (image+caption)
  public async groupSendImage(
    sessionId: string,
    dto: { groupJid: string; imageUrl: string; caption?: string },
  ) {
    const rt = await this.ensureConnected(sessionId);

    const img = await this.fetchImageBuffer(dto.imageUrl);
    const res = await rt.sock.sendMessage(dto.groupJid, {
      image: img,
      caption: dto.caption || undefined,
    });
    return { groupJid: dto.groupJid, messageId: res?.key?.id ?? null };
  }

  // helper to get group metadata & participants
  private async getGroupParticipants(sessionId: string, groupJid: string) {
    const rt = await this.ensureConnected(sessionId);

    const meta = await rt.sock.groupMetadata(groupJid); // returns id, subject, participants[]
    // participants[].id is a JID like '62812...@s.whatsapp.net', .isAdmin/.isSuperAdmin flags exist
    return meta;
  }

  // Get group members (public method for preview)
  public async getGroupMembers(sessionId: string, groupJid: string) {
    const rt = await this.ensureConnected(sessionId);
    const meta = await this.getGroupParticipants(sessionId, groupJid);
    const participants = meta.participants ?? [];

    // Note: LID (Lightweight ID) users don't share their phone numbers
    // We can only identify them by their LID, not by phone number

    return {
      groupJid: meta.id,
      groupSubject: meta.subject,
      total: participants.length,
      members: participants.map((p) => {
        const jid = p.id; // '62xxxxx@s.whatsapp.net' or '226697148420194@lid'
        const isLid = jid.includes('@lid');
        const phone = isLid ? null : jid.split('@')[0];
        const lid = isLid ? jid.split('@')[0] : null;

        return {
          phone,
          lid,
          jid,
          isAdmin: p.admin === 'admin' || p.admin === 'superadmin',
          adminType: p.admin || null,
          hasPhoneNumber: !isLid,
        };
      }),
    };
  }

  // 3) DM every member (text)
  public async groupDmMembersText(
    sessionId: string,
    dto: {
      groupJid: string;
      text: string;
      delayMs?: number;
      jitterMs?: number;
      includeAdmins?: boolean;
    },
  ) {
    const {
      groupJid,
      text,
      delayMs = 1500,
      jitterMs = 600,
      includeAdmins = true,
    } = dto;

    const rt = await this.ensureConnected(sessionId);

    if (!rt.sock) {
      throw new BadRequestException('WhatsApp session not found');
    }

    // Get group metadata
    const meta = await rt.sock.groupMetadata(groupJid);
    const participants = meta.participants ?? [];

    // Filter participants
    const targets = participants.filter((p) =>
      includeAdmins ? true : !(p.admin === 'admin' || p.admin === 'superadmin'),
    );

    const results: Array<{
      jid: string;
      status: 'SENT' | 'FAILED';
      error?: string;
    }> = [];

    // Loop safely
    for (const participant of targets) {
      const jid = participant.id; // FULL JID (MD safe)

      try {
        // Skip yourself
        if (jid === rt.sock.user?.id) {
          continue;
        }

        await rt.sock.sendMessage(jid, { text });

        results.push({
          jid,
          status: 'SENT',
        });

        await this.sleepJitter(delayMs, jitterMs);
      } catch (error: any) {
        results.push({
          jid,
          status: 'FAILED',
          error: error?.message || 'Send failed',
        });

        // Longer delay on failure (anti-ban safety)
        await this.sleepJitter(Math.max(delayMs, 2000), jitterMs);
      }
    }

    return {
      success: true,
      groupJid,
      groupSubject: meta.subject,
      totalTargeted: targets.length,
      totalProcessed: results.length,
      summary: this.countStatuses(results),
      results,
    };
  }

  // 4) DM every member (image)
  public async groupDmMembersImage(
    sessionId: string,
    dto: {
      groupJid: string;
      imageUrl: string;
      caption?: string;
      delayMs?: number;
      jitterMs?: number;
      includeAdmins?: boolean;
    },
  ) {
    const {
      groupJid,
      imageUrl,
      caption,
      delayMs = 1800,
      jitterMs = 700,
      includeAdmins = true,
    } = dto;

    const rt = await this.ensureConnected(sessionId);

    if (!rt.sock) {
      throw new BadRequestException('WhatsApp session not found');
    }

    const meta = await this.getGroupParticipants(sessionId, groupJid);
    const img = await this.fetchImageBuffer(imageUrl);

    const people = meta.participants ?? [];
    const targets = people.filter((p) =>
      includeAdmins ? true : !(p.admin === 'admin' || p.admin === 'superadmin'),
    );

    const results: Array<{
      jid: string;
      status: 'SENT' | 'FAILED';
      error?: string;
    }> = [];

    for (const participant of targets) {
      const jid = participant.id;

      try {
        if (jid === rt.sock.user?.id) {
          continue;
        }
        await rt.sock.sendMessage(jid, {
          image: img,
          caption: caption || undefined,
        });
        results.push({ jid, status: 'SENT' });
        await this.sleepJitter(delayMs, jitterMs);
      } catch (e: any) {
        results.push({
          jid,
          status: 'FAILED',
          error: e?.message || 'Send failed',
        });
        await this.sleepJitter(Math.max(delayMs, 2000), jitterMs);
      }
    }

    return {
      success: true,
      groupJid,
      groupSubject: meta.subject,
      total: results.length,
      summary: this.countStatuses(results),
      results,
    };
  }

  public async listConversations(params: { sessionId: string }) {
    const { sessionId } = params;

    // Fetch all conversations for this session
    const conversations = await this.prisma.whatsAppConversation.findMany({
      where: { sessionId },
      orderBy: { updatedAt: 'desc' },
    });

    // Group conversations by the NUMERIC PREFIX of the JID.
    // e.g. 210870160343103@s.whatsapp.net and 210870160343103@lid
    // share the same prefix → same contact.
    const grouped = new Map<string, typeof conversations>();

    for (const conv of conversations) {
      let groupKey: string;

      if (conv.isGroup) {
        // Groups are never merged
        groupKey = `group:${conv.jid}`;
      } else {
        // Extract the numeric part before '@'
        const prefix = conv.jid.split('@')[0].replace(/\D/g, '');
        groupKey = prefix ? `id:${prefix}` : `jid:${conv.jid}`;
      }

      const existing = grouped.get(groupKey);
      if (existing) {
        existing.push(conv);
      } else {
        grouped.set(groupKey, [conv]);
      }
    }

    // Merge grouped conversations
    const merged = Array.from(grouped.values()).map((group) => {
      if (group.length === 1) {
        return {
          ...group[0],
          alternativeJids: [group[0].jid],
        };
      }

      // Sort by lastMessageAt descending to pick the most recent as primary
      const sorted = group.sort((a, b) => {
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });

      const primary = sorted[0];
      const allJids = group.map((c) => c.jid);
      const totalUnread = group.reduce(
        (sum, c) => sum + (c.unreadCount || 0),
        0,
      );

      // Pick the best name from any conversation in the group
      const bestName = group.find((c) => c.name && c.name.trim())?.name ?? null;

      return {
        ...primary,
        name: bestName,
        unreadCount: totalUnread,
        alternativeJids: allJids,
      };
    });

    // Sort by lastMessageAt descending
    merged.sort((a, b) => {
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });

    return merged;
  }

  public async getConversations(params: {
    sessionId: string;
    jid: string; // supports comma-separated JIDs for merged conversations
    cursor?: string; // messageId cursor
    limit?: number;
  }) {
    const { sessionId, jid, cursor, limit = 50 } = params;

    // Support comma-separated JIDs so merged conversations show all messages
    const jids = jid
      .split(',')
      .map((j) => j.trim())
      .filter(Boolean);

    // Fetch latest messages (desc to get newest), then reverse for chronological order
    const messages = await this.prisma.whatsAppMessage.findMany({
      where: {
        sessionId,
        phone: jids.length > 1 ? { in: jids } : jids[0],
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      ...(cursor && {
        skip: 1,
        cursor: { id: cursor },
      }),
    });

    // Reverse so FE gets oldest→newest (chronological) order, then decrypt text
    return messages.reverse().map((m) => ({
      ...m,
      text: this.crypto.decrypt(m.text),
    }));
  }

  public async markConversationAsRead(sessionId: string, jid: string) {
    // Support comma-separated JIDs for merged conversations
    const jids = jid
      .split(',')
      .map((j) => j.trim())
      .filter(Boolean);

    // Mark all alternative JIDs as read
    await this.prisma.whatsAppConversation.updateMany({
      where: {
        sessionId,
        jid: jids.length > 1 ? { in: jids } : jids[0],
      },
      data: {
        unreadCount: 0,
      },
    });

    return { success: true };
  }

  public async toggleConversationAiMode(
    sessionId: string,
    jid: string,
    mode: 'BOT' | 'HUMAN',
  ) {
    // Support comma-separated JIDs for merged conversations
    const jids = jid
      .split(',')
      .map((j) => j.trim())
      .filter(Boolean);

    await this.prisma.whatsAppConversation.updateMany({
      where: {
        sessionId,
        jid: jids.length > 1 ? { in: jids } : jids[0],
      },
      data: {
        aiMode: mode,
      },
    });

    return { success: true, mode };
  }

  // small helpers you can place near top/bottom:
  private sleep(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }
  private withJitter(base: number, jitter: number) {
    if (jitter <= 0) return base;
    const delta = Math.floor((Math.random() * 2 - 1) * jitter);
    return Math.max(0, base + delta);
  }
  private async sleepJitter(base: number, jitter: number) {
    await this.sleep(this.withJitter(base, jitter));
  }
  private countStatuses(items: { status: string }[]) {
    return items.reduce(
      (acc, it) => {
        acc[it.status] = (acc[it.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  private async resolveWhatsAppRecipients(
    ownerId: string,
    dto: {
      recipients?: string[];
      contactIds?: string[];
      useAllContacts?: boolean;
    },
  ): Promise<Array<{ phone: string; contactId?: string }>> {
    const recipients = new Map<string, { phone: string; contactId?: string }>();

    if (dto.useAllContacts || (dto.contactIds?.length ?? 0) > 0) {
      const where: any = { ownerId };
      if (!dto.useAllContacts && dto.contactIds?.length) {
        where.id = { in: dto.contactIds };
      }

      const contacts = await this.prisma.whatsAppContact.findMany({
        where,
        select: { id: true, phone: true },
      });

      for (const contact of contacts) {
        const normalized = this.normalizePhoneInput(contact.phone);
        if (!normalized) continue;
        recipients.set(normalized, {
          phone: normalized,
          contactId: contact.id,
        });
      }
    }

    for (const raw of dto.recipients ?? []) {
      const normalized = this.normalizePhoneInput(raw);
      if (!normalized) continue;
      const existing = recipients.get(normalized);
      recipients.set(normalized, {
        phone: normalized,
        contactId: existing?.contactId,
      });
    }

    return Array.from(recipients.values());
  }

  private normalizePhoneInput(input?: string | null): string | null {
    if (!input) return null;
    if (input.endsWith('@lid')) return input.trim();
    const digits = `${input}`.replace(/\D/g, '');
    if (digits.length < 6) return null;
    if (digits.startsWith('0')) {
      return `62${digits.slice(1)}`;
    }
    return digits;
  }

  private phoneToJid(e164NoPlus: string) {
    if (e164NoPlus.includes('@')) return e164NoPlus;
    const num = e164NoPlus.replace(/[^\d]/g, '');
    return `${num}@s.whatsapp.net`;
  }

  private async fetchImageBuffer(url: string): Promise<Buffer> {
    const r = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
    });
    return Buffer.from(r.data as any);
  }

  private registerMessageListener(
    sock: ReturnType<typeof makeWASocket>,
    sessionId: string,
  ) {
    sock.ev.on('messages.upsert', async (m) => {
      // Handle both 'notify' (real-time) and 'append' (sync/echo) types
      if (m.type !== 'notify' && m.type !== 'append') return;

      for (const msg of m.messages ?? []) {
        try {
          await this.handleIncomingMessage(sock, sessionId, msg);
        } catch (err: any) {
          this.logger.error(
            `Failed processing message ${msg?.key?.id}: ${err.message}`,
          );
        }
      }
    });
  }

  private async handleIncomingMessage(
    sock: ReturnType<typeof makeWASocket>,
    sessionId: string,
    msg: any,
  ) {
    if (!msg?.message) return;

    const remoteJid = msg.key?.remoteJid;
    const messageId = msg.key?.id;
    const fromMe = msg.key?.fromMe;

    if (!remoteJid || !messageId) return;
    if (remoteJid === 'status@broadcast') return;

    const isGroup = remoteJid.endsWith('@g.us');

    // Only use pushName for INCOMING messages to get the contact's name
    // When fromMe is true, pushName would be our own name — skip it
    const name = !isGroup && !fromMe ? (msg.pushName ?? null) : null;

    const messageContent = msg.message;
    const messageType = messageContent
      ? Object.keys(messageContent)[0]
      : 'unknown';
    let mediaUrl: string | null = null;

    if (messageContent?.imageMessage) {
      const stream = await downloadContentFromMessage(
        messageContent.imageMessage,
        'image',
      );

      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);

      const uploadResult: any = await this.cloudinary.uploadBuffer(
        buffer,
        'whatsapp-image',
      );

      mediaUrl = uploadResult.secure_url;
    }

    const text =
      messageContent?.conversation ||
      messageContent?.extendedTextMessage?.text ||
      messageContent?.imageMessage?.caption ||
      messageContent?.videoMessage?.caption ||
      null;

    await this.prisma.whatsAppMessage.upsert({
      where: { messageId },
      update: {},
      create: {
        sessionId,
        phone: remoteJid,
        direction: fromMe ? 'OUTGOING' : 'INCOMING',
        messageId,
        text: this.crypto.encrypt(text),
        type: messageType,
        mediaUrl,
        rawJson: msg,
        status: fromMe ? 'SENT' : 'RECEIVED',
      },
    });

    await this.upsertConversation({
      sessionId,
      jid: remoteJid,
      text,
      name,
      messageType,
      messageId,
      fromMe,
    });

    // AI AUTO REPLY
    if (!fromMe && !isGroup && text) {
      const aiReply = await this.aiService.handleIncomingMessage({
        sessionId,
        jid: remoteJid,
        message: text,
        fromMe,
        isGroup,
      });
      console.log({ aiReply });
      if (aiReply) {
        await sock.sendMessage(remoteJid, {
          text: aiReply,
        });
      }
    }

    this.gateway.server.to(sessionId).emit('new-message', {
      id: messageId,
      sessionId,
      jid: remoteJid,
      name,
      text,
      mediaUrl,
      type: messageType,
      fromMe,
      createdAt: new Date(),
    });

    this.gateway.server.to(sessionId).emit('conversation-updated', {
      sessionId,
      jid: remoteJid,
    });

    this.logger.log(
      `Saved ${messageType} (${fromMe ? 'OUT' : 'IN'}) in ${remoteJid}`,
    );
  }

  async getCampaigns(sessionId: string) {
    const campaigns = await this.prisma.waCampaign.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { messages: true },
        },
        messages: {
          select: { status: true },
        },
      },
    });

    return campaigns.map((c) => {
      const sent = c.messages.filter((m) => m.status === 'SENT').length;
      const failed = c.messages.filter((m) => m.status === 'FAILED').length;
      const skipped = c.messages.filter((m) => m.status === 'SKIPPED').length;
      const total = c._count.messages;

      let displayRecipients = total;
      if (c.recipients) {
        try {
          const parsed =
            typeof c.recipients === 'string'
              ? JSON.parse(c.recipients)
              : c.recipients;
          displayRecipients = Array.isArray(parsed) ? parsed.length : total;
        } catch {}
      }

      return {
        id: c.id,
        name: c.name || c.type,
        type: c.type,
        scheduleType: c.scheduleType,
        isScheduled: c.isScheduled,
        status: c.status,
        createdAt: c.createdAt,
        scheduledDate: c.scheduledDate,
        scheduledTime: c.scheduledTime,
        timetableRepeater: c.timetableRepeater,
        stats: {
          total: displayRecipients > 0 ? displayRecipients : total,
          sent,
          failed,
          skipped,
        },
      };
    });
  }

  private async upsertConversation(params: {
    sessionId: string;
    jid: string;
    text: string | null;
    name?: string | null;
    messageType: string;
    messageId: string;
    fromMe: boolean;
  }) {
    const { sessionId, jid, text, name, messageType, messageId, fromMe } =
      params;

    await this.prisma.whatsAppConversation.upsert({
      where: {
        sessionId_jid: {
          sessionId,
          jid,
        },
      },
      update: {
        lastMessageId: messageId,
        lastMessageText: this.crypto.encrypt(text),
        lastMessageType: messageType,
        lastMessageAt: new Date(),
        unreadCount: fromMe
          ? { set: 0 } // reset if we sent it
          : { increment: 1 },
        ...(name && { name }),
      },
      create: {
        sessionId,
        jid,
        name: name ?? null,
        isGroup: jid.endsWith('@g.us'),
        lastMessageId: messageId,
        lastMessageText: this.crypto.encrypt(text),
        lastMessageType: messageType,
        lastMessageAt: new Date(),
        unreadCount: fromMe ? 0 : 1,
      },
    });
  }
}
