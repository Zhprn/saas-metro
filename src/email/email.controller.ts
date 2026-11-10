import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  Post,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { GoogleEmailService } from './google.service';
import { EmailService } from './email.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import {
  ConnectSchema,
  SendTestSchema,
  SendTestDto,
  EmailBroadcastDto,
  EmailBroadcastSchema,
} from './dto/email.dto';
import { GmailReadService } from './gmail-read.service';

@Controller('email')
export class EmailController {
  constructor(
    private gsvc: GoogleEmailService,
    private emailSvc: EmailService,
    private GmailReadService: GmailReadService,
  ) {}

  /** 1) Start Google connect – redirects to Google */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('google/connect')
  startConnect(@Req() req: Request, @Res() res: Response) {
    // attach your app user id to state so you know who connected
    const ownerId = (req as any).user?.sub ?? 'anon';
    const url = this.gsvc.getAuthUrl(ownerId);
    return res.redirect(url);
  }
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('google/connect-url')
  getConnectUrl(@Req() req) {
    const ownerId = req.user?.sub ?? req.user?.id ?? req.user?.userId;
    if (!ownerId) {
      throw new Error(
        'No user on request; add JwtAuthGuard or pass state manually.',
      );
    }
    const url = this.gsvc.getAuthUrl(ownerId);
    return { url };
  }

  /** 2) Google OAuth callback */
  @Get('google/callback')
  async callback(
    @Query(new ZodValidationPipe(ConnectSchema))
    q: { code: string; state: string },
    @Res() res: Response,
  ) {
    await this.gsvc.handleCallback(q.code, q.state);
    // redirect to your frontend success page with connected query param
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    return res.redirect(`${frontendUrl}/email/connect?connected=true`);
  }

  /** Get list of connected Gmail accounts */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('accounts')
  async getAccounts(@Req() req) {
    const ownerId = req.user?.sub ?? req.user?.id ?? req.user?.userId;
    if (!ownerId) throw new BadRequestException('Missing ownerId in JWT');
    const accounts = await this.gsvc.getAccounts(ownerId);
    return { accounts };
  }

  /** 3) Send a single test email */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('send-test')
  async sendTest(
    @Body(new ZodValidationPipe(SendTestSchema)) dto: SendTestDto,
  ) {
    const r = await this.emailSvc.sendTest(
      dto.fromEmail,
      dto.toEmail,
      dto.subject,
      dto.html,
    );
    return r;
  }

  /** 4) Broadcast */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('broadcast')
  async broadcast(
    @Req() req,
    @Body(new ZodValidationPipe(EmailBroadcastSchema)) dto: EmailBroadcastDto,
  ) {
    const ownerId: string = req.user?.sub ?? req.user?.id ?? req.user?.userId;
    if (!ownerId) throw new BadRequestException('Missing ownerId in JWT');
    const r = await this.emailSvc.broadcast(ownerId, dto);
    return { success: true, ...r };
  }

  @Post('sync')
  async sync(@Body('email') email: string) {
    await this.GmailReadService.syncLatestMessages(email);
    return { success: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('inbox')
  async inbox(
    @Req() req,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('label') label?: string,
    @Query('accountId') accountId?: string,
  ) {
    const ownerId = req.user.sub;

    return this.emailSvc.getInbox(ownerId, {
      limit: limit ? Number(limit) : 20,
      cursor: cursor ? new Date(cursor) : undefined,
      label,
      accountId,
    });
  }
}
