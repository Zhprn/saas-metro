import { BadRequestException, Injectable } from '@nestjs/common';
import { gmail_v1 } from 'googleapis';
import { GoogleEmailService } from './google.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class GmailReadService {
  constructor(
    private readonly googleEmailService: GoogleEmailService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * STEP 1: Manual inbox sync (use Gmail email address)
   */
  async syncLatestMessages(fromEmail: string, maxResults = 20): Promise<void> {
    const gmail = await this.getGmailClient(fromEmail);

    const account = await this.prisma.gmailAccount.findUnique({
      where: { email: fromEmail },
    });

    if (!account) {
      throw new BadRequestException('Gmail account not found in the system');
    }

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
    });

    const messages = listRes.data.messages ?? [];

    for (const msg of messages) {
      if (!msg.id) continue;

      const full = await this.getMessageDetail(fromEmail, msg.id);

      await this.prisma.gmailMessage.upsert({
        where: {
          gmailMessageId: full.id,
        },
        update: {
          subject: full.subject,
          snippet: full.snippet,
          from: full.from,
          to: full.to,
          labels: full.labels ?? [],
          internalDate: full.internalDate,
          raw: JSON.parse(JSON.stringify(full.raw)),
        },
        create: {
          gmailMessageId: full.id,
          threadId: full.threadId,
          subject: full.subject,
          snippet: full.snippet,
          from: full.from,
          to: full.to,
          labels: full.labels ?? [],
          internalDate: full.internalDate,
          raw: JSON.parse(JSON.stringify(full.raw)),
          gmailAccountId: account.id,
        },
      });
    }
  }

  /**
   * Get full message and normalize it
   */
  async getMessageDetail(fromEmail: string, messageId: string) {
    const gmail = await this.getGmailClient(fromEmail);

    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    const msg = res.data;

    return {
      id: msg.id!,
      threadId: msg.threadId!,
      snippet: msg.snippet ?? '',
      internalDate: msg.internalDate
        ? new Date(Number(msg.internalDate))
        : null,
      from: this.getHeader(msg, 'From'),
      to: this.getHeader(msg, 'To'),
      subject: this.getHeader(msg, 'Subject'),
      labels: msg.labelIds ?? [],
      raw: msg,
    };
  }

  /**
   * Reuse your existing GoogleEmailService
   */
  private async getGmailClient(fromEmail: string): Promise<gmail_v1.Gmail> {
    return this.googleEmailService.getAuthorizedClient(fromEmail);
  }

  /**
   * Safe header extraction
   */
  private getHeader(msg: gmail_v1.Schema$Message, name: string): string | null {
    return (
      msg.payload?.headers?.find(
        (h) => h.name?.toLowerCase() === name.toLowerCase(),
      )?.value ?? null
    );
  }
}
