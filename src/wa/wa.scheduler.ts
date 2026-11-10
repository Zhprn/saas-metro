import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from 'src/prisma/prisma.service';
import { WaService } from './wa.service';
import { parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

@Injectable()
export class WaScheduler {
  private readonly logger = new Logger(WaScheduler.name);

  constructor(
    private prisma: PrismaService,
    private waService: WaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'Asia/Jakarta' })
  async handleScheduledCampaigns() {
    this.logger.debug('Running campaign scheduler check...');

    // Find all active scheduled campaigns
    const campaigns = await this.prisma.waCampaign.findMany({
      where: {
        isScheduled: true,
        status: 'ACTIVE',
      },
    });

    const now = toZonedTime(new Date(), 'Asia/Jakarta');
    // Use local timezone mapping for comparisons. In production, consider standardizing on UTC.
    const currentHourMin = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    for (const campaign of campaigns) {
      try {
        if (this.shouldRunCampaign(campaign, now, currentHourMin)) {
          this.logger.log(`Executing scheduled campaign ${campaign.id}`);

          await this.executeCampaign(campaign);

          // Update status if it's a one-time execution
          if (campaign.timetableRepeater === 'ONCE') {
            await this.prisma.waCampaign.update({
              where: { id: campaign.id },
              data: { status: 'COMPLETED' },
            });
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to execute campaign ${campaign.id}: ${error.message}`,
        );
      }
    }
  }

  private shouldRunCampaign(
    campaign: any,
    now: Date,
    currentHourMin: string,
  ): boolean {
    if (!campaign.scheduledTime) return false;

    // Time must match first
    if (campaign.scheduledTime !== currentHourMin) {
      return false;
    }

    switch (campaign.timetableRepeater) {
      case 'ONCE':
        if (!campaign.scheduledDate) return false;
        const scheduledDate = toZonedTime(
          new Date(campaign.scheduledDate),
          'Asia/Jakarta',
        );
        return (
          scheduledDate.getFullYear() === now.getFullYear() &&
          scheduledDate.getMonth() === now.getMonth() &&
          scheduledDate.getDate() === now.getDate()
        );

      case 'EVERY_DAY':
        return true;

      case 'EVERY_WEEK':
        if (!campaign.scheduledDate) return false;
        const startDay = toZonedTime(
          new Date(campaign.scheduledDate),
          'Asia/Jakarta',
        ).getDay();
        return now.getDay() === startDay;

      case 'EVERY_MONTH':
        if (!campaign.scheduledDate) return false;
        const startDate = toZonedTime(
          new Date(campaign.scheduledDate),
          'Asia/Jakarta',
        ).getDate();
        return now.getDate() === startDate;

      default:
        return false;
    }
  }

  private async executeCampaign(campaign: any) {
    if (!campaign.recipients) {
      this.logger.warn(`Campaign ${campaign.id} has no recipients data.`);
      return;
    }

    // Recipients should have been resolved and stored as an array of { phone, contactId? } when scheduling
    let recipients: { phone: string; contactId?: string }[] = [];
    try {
      recipients =
        typeof campaign.recipients === 'string'
          ? JSON.parse(campaign.recipients)
          : campaign.recipients;
    } catch {
      this.logger.error(`Campaign ${campaign.id} has invalid recipients JSON.`);
      return;
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      this.logger.warn(
        `Campaign ${campaign.id} recipients is empty or not an array.`,
      );
      return;
    }

    // Use existing service methods under the hood but bypass the broadcast wrappers since
    // broadcast wrappers create a new campaign record and we already have one.

    for (const entry of recipients) {
      const phone = entry.phone;

      try {
        if (campaign.type === 'TEXT') {
          await this.waService.sendText(
            campaign.sessionId,
            phone,
            campaign.text || '',
          );
        } else if (campaign.type === 'IMAGE' && campaign.imageUrl) {
          await this.waService.sendImage(
            campaign.sessionId,
            phone,
            campaign.imageUrl,
            campaign.text || undefined,
          );
        }
      } catch (err: any) {
        this.logger.error(
          `Error sending to ${phone} on campaign ${campaign.id}: ${err.message}`,
        );
      }
    }
  }
}
