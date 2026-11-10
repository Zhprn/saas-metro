import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as ExcelJS from 'exceljs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  CreateEmailContactDto,
  CreateWhatsAppContactDto,
  UpdateEmailContactDto,
  UpdateWhatsAppContactDto,
} from './dto';
import { WaService } from 'src/wa/wa.service';

type ImportSummary = {
  rows: number;
  emails: { created: number; updated: number; skipped: number };
  phones: { created: number; updated: number; skipped: number };
  errors: Array<{ row: number; reason: string }>;
};

const emailSchema = z.string().email();

@Injectable()
export class ContactsService {
  private readonly logger = new Logger('ContactsService');
  private readonly emailContactSelect = {
    id: true,
    email: true,
    name: true,
    status: true,
    createdAt: true,
    updatedAt: true,
  };

  private readonly whatsappContactSelect = {
    id: true,
    phone: true,
    name: true,
    status: true,
    source: true,
    createdAt: true,
    updatedAt: true,
  };

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => WaService))
    private readonly waService: WaService,
  ) {}

  async importFromExcel(ownerId: string, file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('File buffer missing');

    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(file.buffer);
    } catch (err) {
      this.logger.warn(`Failed to parse Excel: ${(err as Error).message}`);
      throw new BadRequestException(
        'Unable to read Excel file. Ensure it is a valid .xlsx document.',
      );
    }

    const worksheet = workbook.worksheets[0];
    if (!worksheet)
      throw new BadRequestException(
        'Excel file does not contain any worksheet.',
      );

    const headerRow = worksheet.getRow(1);
    if (!headerRow || headerRow.actualCellCount === 0) {
      throw new BadRequestException(
        'Missing header row (first row) in Excel file.',
      );
    }

    const columnMap = new Map<number, 'email' | 'phone' | 'name'>();
    headerRow.eachCell((cell, col) => {
      const header = `${cell.text ?? ''}`.trim().toLowerCase();
      const normalized = this.normalizeHeader(header);
      if (normalized) columnMap.set(col, normalized);
    });

    if (!columnMap.size) {
      throw new BadRequestException(
        'No recognized headers found. Allowed headers: email, name, phone/no_hp/wa.',
      );
    }

    const summary: ImportSummary = {
      rows: 0,
      emails: { created: 0, updated: 0, skipped: 0 },
      phones: { created: 0, updated: 0, skipped: 0 },
      errors: [],
    };

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      if (this.isRowEmpty(row)) continue;

      summary.rows++;
      const collected: { email?: string; phone?: string; name?: string } = {};

      columnMap.forEach((key, col) => {
        const cell = row.getCell(col);
        const value = `${cell.text ?? ''}`.trim();
        if (!value) return;
        if (key === 'email') collected.email = value;
        if (key === 'phone') collected.phone = value;
        if (key === 'name') collected.name = value;
      });

      if (!collected.email && !collected.phone) {
        summary.errors.push({
          row: rowNumber,
          reason: 'Row missing both email and phone values',
        });
        summary.emails.skipped++;
        summary.phones.skipped++;
        continue;
      }

      const processErrors: string[] = [];

      if (collected.email) {
        const emailResult = emailSchema.safeParse(
          collected.email.trim().toLowerCase(),
        );
        if (!emailResult.success) {
          summary.emails.skipped++;
          processErrors.push('Invalid email format');
        } else {
          const email = emailResult.data;
          const name = collected.name;
          const existing = await this.prisma.emailContact.findUnique({
            where: { ownerId_email: { ownerId, email } },
          });
          if (existing) {
            await this.prisma.emailContact.update({
              where: { ownerId_email: { ownerId, email } },
              data: {
                ...(name ? { name } : {}),
                status:
                  existing.status === 'BOUNCED'
                    ? existing.status
                    : (existing.status ?? 'ACTIVE'),
              },
            });
            summary.emails.updated++;
          } else {
            await this.prisma.emailContact.create({
              data: {
                ownerId,
                email,
                name,
                status: 'ACTIVE',
              },
            });
            summary.emails.created++;
          }
        }
      }

      if (collected.phone) {
        const phone = this.normalizePhone(collected.phone);
        if (!phone) {
          summary.phones.skipped++;
          processErrors.push('Invalid phone/WhatsApp number');
        } else {
          const existing = await this.prisma.whatsAppContact.findUnique({
            where: { ownerId_phone: { ownerId, phone } },
          });
          if (existing) {
            await this.prisma.whatsAppContact.update({
              where: { ownerId_phone: { ownerId, phone } },
              data: {
                ...(collected.name ? { name: collected.name } : {}),
                status: existing.status ?? 'ACTIVE',
                source: 'IMPORT',
              },
            });
            summary.phones.updated++;
          } else {
            await this.prisma.whatsAppContact.create({
              data: {
                ownerId,
                phone,
                name: collected.name,
                status: 'ACTIVE',
                source: 'IMPORT',
              },
            });
            summary.phones.created++;
          }
        }
      }

      if (processErrors.length) {
        summary.errors.push({
          row: rowNumber,
          reason: processErrors.join('; '),
        });
      }
    }

    return {
      success: true,
      message: 'Contacts imported successfully',
      summary,
    };
  }

  // ─── Import group members as WhatsApp contacts ──────────────────────────────

  async importGroupMembersAsContacts(
    ownerId: string,
    sessionId: string,
    groupJid: string,
  ) {
    // Fetch group members via WaService (reuses the existing getGroupMembers method)
    const meta = await this.waService.getGroupMembers(sessionId, groupJid);

    const summary = { imported: 0, updated: 0, skipped: 0, lidCount: 0 };
    const details: Array<{
      phone: string | null;
      jid: string;
      result: 'IMPORTED' | 'UPDATED' | 'SKIPPED';
      isLid: boolean;
    }> = [];

    for (const member of meta.members) {
      // If the member is LID-only or has no phone, use their JID as the contact phone
      const isLid = member.lid !== null || !member.phone;
      const phone = member.phone || member.jid;

      if (isLid) {
        summary.lidCount++;
      }

      try {
        const existing = await this.prisma.whatsAppContact.findUnique({
          where: { ownerId_phone: { ownerId, phone } },
          select: { id: true },
        });

        if (existing) {
          await this.prisma.whatsAppContact.update({
            where: { id: existing.id },
            data: { source: 'GROUP_IMPORT', status: 'ACTIVE' },
          });
          summary.updated++;
          details.push({ phone, jid: member.jid, result: 'UPDATED', isLid });
        } else {
          await this.prisma.whatsAppContact.create({
            data: {
              ownerId,
              phone,
              name: null, // WA group metadata does not expose display names
              status: 'ACTIVE',
              source: 'GROUP_IMPORT',
            },
          });
          summary.imported++;
          details.push({ phone, jid: member.jid, result: 'IMPORTED', isLid });
        }
      } catch {
        summary.skipped++;
        details.push({ phone, jid: member.jid, result: 'SKIPPED', isLid });
      }
    }

    return {
      groupJid: meta.groupJid,
      groupSubject: meta.groupSubject,
      totalMembers: meta.total,
      summary,
      ...(summary.lidCount > 0 && {
        note: `${summary.lidCount} member(s) are LID-only accounts. They were imported using their hidden JID so you can still send messages to them.`,
      }),
      details,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────────

  async listContacts(ownerId: string) {
    const [emails, whatsapp] = await Promise.all([
      this.prisma.emailContact.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        select: this.emailContactSelect,
      }),
      this.prisma.whatsAppContact.findMany({
        where: { ownerId },
        orderBy: { createdAt: 'desc' },
        select: this.whatsappContactSelect,
      }),
    ]);

    return { emails, whatsapp };
  }

  async createEmailContact(ownerId: string, payload: CreateEmailContactDto) {
    const email = this.normalizeEmail(payload.email);
    emailSchema.parse(email);

    try {
      return await this.prisma.emailContact.create({
        data: {
          ownerId,
          email,
          name: this.normalizeName(payload.name),
          status: payload.status ?? 'ACTIVE',
        },
        select: this.emailContactSelect,
      });
    } catch (error) {
      this.handleUniqueConstraint(error, 'email');
    }
  }

  async updateEmailContact(
    ownerId: string,
    contactId: string,
    payload: UpdateEmailContactDto,
  ) {
    await this.ensureEmailContact(ownerId, contactId);

    const data: Prisma.EmailContactUpdateInput = {};

    if (payload.email) {
      const email = this.normalizeEmail(payload.email);
      emailSchema.parse(email);
      data.email = email;
    }
    if (payload.name !== undefined) {
      data.name = this.normalizeName(payload.name);
    }
    if (payload.status) {
      data.status = payload.status;
    }

    try {
      return await this.prisma.emailContact.update({
        where: { id: contactId },
        data,
        select: this.emailContactSelect,
      });
    } catch (error) {
      this.handleUniqueConstraint(error, 'email');
    }
  }

  async deleteEmailContact(ownerId: string, contactId: string) {
    await this.ensureEmailContact(ownerId, contactId);
    await this.prisma.emailContact.delete({ where: { id: contactId } });
    return { id: contactId };
  }

  async createWhatsAppContact(
    ownerId: string,
    payload: CreateWhatsAppContactDto,
  ) {
    const phone = this.normalizePhone(payload.phone);
    if (!phone) {
      throw new BadRequestException('Invalid phone/WhatsApp number');
    }

    try {
      return await this.prisma.whatsAppContact.create({
        data: {
          ownerId,
          phone,
          name: this.normalizeName(payload.name),
          status: payload.status ?? 'ACTIVE',
          source: this.normalizeSource(payload.source) ?? 'MANUAL',
        },
        select: this.whatsappContactSelect,
      });
    } catch (error) {
      this.handleUniqueConstraint(error, 'phone');
    }
  }

  async updateWhatsAppContact(
    ownerId: string,
    contactId: string,
    payload: UpdateWhatsAppContactDto,
  ) {
    await this.ensureWhatsAppContact(ownerId, contactId);

    const data: Prisma.WhatsAppContactUpdateInput = {};

    if (payload.phone) {
      const phone = this.normalizePhone(payload.phone);
      if (!phone) {
        throw new BadRequestException('Invalid phone/WhatsApp number');
      }
      data.phone = phone;
    }
    if (payload.name !== undefined) {
      data.name = this.normalizeName(payload.name);
    }
    if (payload.status) {
      data.status = payload.status;
    }
    if (payload.source !== undefined) {
      data.source = this.normalizeSource(payload.source);
    }

    try {
      return await this.prisma.whatsAppContact.update({
        where: { id: contactId },
        data,
        select: this.whatsappContactSelect,
      });
    } catch (error) {
      this.handleUniqueConstraint(error, 'phone');
    }
  }

  async deleteWhatsAppContact(ownerId: string, contactId: string) {
    await this.ensureWhatsAppContact(ownerId, contactId);
    await this.prisma.whatsAppContact.delete({ where: { id: contactId } });
    return { id: contactId };
  }

  private async ensureEmailContact(ownerId: string, contactId: string) {
    const contact = await this.prisma.emailContact.findFirst({
      where: { id: contactId, ownerId },
    });
    if (!contact) {
      throw new NotFoundException('Email contact not found');
    }
  }

  private async ensureWhatsAppContact(ownerId: string, contactId: string) {
    const contact = await this.prisma.whatsAppContact.findFirst({
      where: { id: contactId, ownerId },
    });
    if (!contact) {
      throw new NotFoundException('WhatsApp contact not found');
    }
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private normalizeName(name?: string) {
    const trimmed = name?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
  }

  private normalizeSource(source?: string) {
    const trimmed = source?.trim();
    return trimmed && trimmed.length ? trimmed : undefined;
  }

  private handleUniqueConstraint(
    error: unknown,
    field: 'email' | 'phone',
  ): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        `A contact with this ${field} already exists`,
      );
    }
    throw error;
  }

  private normalizeHeader(header: string): 'email' | 'phone' | 'name' | null {
    if (!header) return null;
    const emailHeaders = ['email', 'e-mail', 'mail', 'alamat email'];
    const phoneHeaders = [
      'phone',
      'no_hp',
      'no. hp',
      'no hp',
      'nohp',
      'hp',
      'no handphone',
      'no. handphone',
      'whatsapp',
      'wa',
      'no wa',
      'whatsapp number',
    ];
    const nameHeaders = ['name', 'nama', 'full name'];

    if (emailHeaders.includes(header)) return 'email';
    if (phoneHeaders.includes(header)) return 'phone';
    if (nameHeaders.includes(header)) return 'name';
    return null;
  }

  private normalizePhone(input: string): string | null {
    if (input.endsWith('@lid')) return input.trim();
    const digits = input.replace(/\D/g, '');
    if (digits.length < 6) return null;
    if (digits.startsWith('0')) {
      return `62${digits.slice(1)}`;
    }
    return digits;
  }

  private isRowEmpty(row: ExcelJS.Row) {
    for (let i = 1; i <= row.cellCount; i++) {
      const cell = row.getCell(i);
      if (cell?.text && cell.text.trim().length > 0) {
        return false;
      }
    }
    return true;
  }
}
