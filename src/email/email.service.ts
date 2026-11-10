import { BadRequestException, Injectable } from '@nestjs/common';
import { GoogleEmailService } from './google.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { buildMime } from './dto/email.dto';

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}
function withJitter(base: number, jitter: number) {
  const delta = Math.floor((Math.random() * 2 - 1) * jitter);
  return Math.max(0, base + delta);
}

@Injectable()
export class EmailService {
  constructor(
    private prisma: PrismaService,
    private gsvc: GoogleEmailService,
  ) {}

  /** Single test email */
  async sendTest(
    fromEmail: string,
    toEmail: string,
    subject: string,
    html: string,
  ) {
    const gmail = await this.gsvc.getAuthorizedClient(fromEmail);
    const raw = Buffer.from(buildMime(fromEmail, toEmail, subject, html))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return { success: true };
  }

  /** Broadcast to many recipients with throttle */
  async broadcast(
    ownerId: string,
    dto: {
      fromEmail: string;
      subject: string;
      html: string;
      recipients?: { email: string; name?: string }[];
      contactIds?: string[];
      useAllContacts?: boolean;
      delayMs: number;
      jitterMs: number;
    },
  ) {
    const gmail = await this.gsvc.getAuthorizedClient(dto.fromEmail);

    const recipients = await this.resolveEmailRecipients(ownerId, dto);
    if (!recipients.length) {
      throw new BadRequestException(
        'No recipients resolved from request or stored contacts.',
      );
    }

    const camp = await this.prisma.emailCampaign.create({
      data: {
        ownerId,
        fromEmail: dto.fromEmail,
        subject: dto.subject,
        html: dto.html,
        delayMs: dto.delayMs,
        jitterMs: dto.jitterMs,
      },
      select: { id: true },
    });

    const results: Array<{
      email: string;
      status: 'SENT' | 'FAILED';
      error?: string;
    }> = [];

    for (const r of recipients) {
      const to = r.email.toLowerCase().trim();
      const personalizedSubject = dto.subject.replace(
        /\{\{name\}\}/g,
        r.name ?? '',
      );
      const personalizedHtml = dto.html.replace(/\{\{name\}\}/g, r.name ?? '');
      try {
        const raw = Buffer.from(
          buildMime(dto.fromEmail, to, personalizedSubject, personalizedHtml),
        )
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });

        results.push({ email: to, status: 'SENT' });
        await this.prisma.emailMessage.create({
          data: {
            campaignId: camp.id,
            contactId: r.contactId ?? null,
            toEmail: to,
            subject: personalizedSubject,
            status: 'SENT',
          },
        });

        await sleep(withJitter(dto.delayMs, dto.jitterMs));
      } catch (e: any) {
        const msg = e?.message || 'Send failed';
        results.push({ email: to, status: 'FAILED', error: msg });
        await this.prisma.emailMessage.create({
          data: {
            campaignId: camp.id,
            contactId: r.contactId ?? null,
            toEmail: to,
            subject: personalizedSubject,
            status: 'FAILED',
            error: msg,
          },
        });
        await sleep(withJitter(Math.max(dto.delayMs, 1200), dto.jitterMs));
      }
    }

    const summary = results.reduce(
      (a, r) => {
        a[r.status] = (a[r.status] || 0) + 1;
        return a;
      },
      {} as Record<string, number>,
    );

    return { campaignId: camp.id, total: results.length, summary, results };
  }

  private async resolveEmailRecipients(
    ownerId: string,
    dto: {
      recipients?: { email: string; name?: string }[];
      contactIds?: string[];
      useAllContacts?: boolean;
    },
  ): Promise<Array<{ email: string; name?: string; contactId?: string }>> {
    const recipientsMap = new Map<
      string,
      { email: string; name?: string; contactId?: string }
    >();
    const manualRecipients =
      dto.recipients
        ?.map((r) => ({
          email: r.email.toLowerCase().trim(),
          name: r.name?.trim(),
        }))
        .filter((r) => !!r.email) ?? [];

    if (dto.useAllContacts || (dto.contactIds?.length ?? 0) > 0) {
      const where: any = {
        ownerId,
        status: 'ACTIVE',
      };
      if (!dto.useAllContacts && dto.contactIds?.length) {
        where.id = { in: dto.contactIds };
      }

      const contacts = await this.prisma.emailContact.findMany({
        where,
        select: { id: true, email: true, name: true },
      });

      for (const contact of contacts) {
        const email = contact.email?.toLowerCase().trim();
        if (!email) continue;
        recipientsMap.set(email, {
          email,
          name: contact.name ?? undefined,
          contactId: contact.id,
        });
      }
    }

    for (const manual of manualRecipients) {
      const existing = recipientsMap.get(manual.email);
      recipientsMap.set(manual.email, {
        email: manual.email,
        name: manual.name ?? existing?.name,
        contactId: existing?.contactId,
      });
    }

    return Array.from(recipientsMap.values());
  }

  async getInbox(
    ownerId: string,
    params: {
      limit?: number;
      cursor?: Date;
      label?: string;
      accountId?: string;
    },
  ) {
    const { limit = 20, cursor, label, accountId } = params;

    return this.prisma.gmailMessage.findMany({
      where: {
        gmailAccount: {
          ownerId,
          ...(accountId ? { id: accountId } : {}),
        },
        ...(label
          ? {
              labels: {
                has: label,
              },
            }
          : {}),
        ...(cursor
          ? {
              internalDate: {
                lt: cursor,
              },
            }
          : {}),
      },
      orderBy: {
        internalDate: 'desc',
      },
      take: limit,
      select: {
        id: true,
        from: true,
        subject: true,
        snippet: true,
        internalDate: true,
        labels: true,
        gmailAccountId: true,
      },
    });
  }
}
