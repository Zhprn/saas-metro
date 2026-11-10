import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { WaService } from './wa.service';
import { ZodValidationPipe } from 'src/common/pipes/zod-validation.pipe';
import { SendDto, SendSchema } from './dto/send.dto';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import {
  BroadcastImageDto,
  BroadcastImageSchema,
  BroadcastTextDto,
  BroadcastTextSchema,
} from './dto/broadcast.dto';
import {
  GroupSendTextDto,
  GroupSendTextSchema,
  GroupSendImageDto,
  GroupSendImageSchema,
  GroupDmMembersTextDto,
  GroupDmMembersTextSchema,
  GroupDmMembersImageDto,
  GroupDmMembersImageSchema,
} from './dto/group.dto';
import { User } from 'src/common/decorators/user.decorator';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('wa')
export class WaController {
  constructor(private readonly wa: WaService) {}

  @Get('sessions')
  async listSessions(@User('id') ownerId: string) {
    return this.wa.listSessions(ownerId);
  }

  @Get('session/:id/qr')
  async qr(@Param('id') id: string) {
    return this.wa.getQr(id);
  }

  @Post('session/:id/connect')
  async connect(
    @Param('id') id: string,
    @User('id') ownerId: string,
    @Body() body?: { label?: string },
  ) {
    return this.wa.connect(id, ownerId, body?.label);
  }

  @Post('send')
  async send(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(SendSchema)) dto: SendDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.sendText(sessionId, dto.to, dto.text);
  }

  @Get('check/:phone')
  async check(@User('id') ownerId: string, @Param('phone') phone: string) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.checkNumber(sessionId, phone);
  }

  @Get('groups')
  async groups(@User('id') ownerId: string) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.fetchGroups(sessionId);
  }

  @Get('group/:groupJid/members')
  async groupMembers(
    @User('id') ownerId: string,
    @Param('groupJid') groupJid: string,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.getGroupMembers(sessionId, groupJid);
  }

  @Post('logout')
  async logout(@User('id') ownerId: string) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.logout(sessionId);
  }

  @Post('broadcast/text')
  async broadcastText(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(BroadcastTextSchema)) dto: BroadcastTextDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    const result = await this.wa.broadcastText(ownerId, sessionId, dto);
    return { success: true, ...result };
  }

  @Post('broadcast/image')
  async broadcastImage(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(BroadcastImageSchema)) dto: BroadcastImageDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    const result = await this.wa.broadcastImage(ownerId, sessionId, dto);
    return { success: true, ...result };
  }

  @Post('group/send-text')
  async groupSendText(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(GroupSendTextSchema)) dto: GroupSendTextDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    const data = await this.wa.groupSendText(sessionId, dto);
    return { success: true, ...data };
  }

  @Post('group/send-image')
  async groupSendImage(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(GroupSendImageSchema)) dto: GroupSendImageDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    const data = await this.wa.groupSendImage(sessionId, dto);
    return { success: true, ...data };
  }

  @Post('group/dm-members-text')
  async groupDmMembersText(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(GroupDmMembersTextSchema))
    dto: GroupDmMembersTextDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    const data = await this.wa.groupDmMembersText(sessionId, dto);
    return data;
  }

  @Post('group/dm-members-image')
  async groupDmMembersImage(
    @User('id') ownerId: string,
    @Body(new ZodValidationPipe(GroupDmMembersImageSchema))
    dto: GroupDmMembersImageDto,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    const data = await this.wa.groupDmMembersImage(sessionId, dto);
    return data;
  }

  @Get('campaigns')
  async campaigns(@User('id') ownerId: string) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.getCampaigns(sessionId);
  }

  @Get('list-conversations')
  async listConversations(@User('id') ownerId: string) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.listConversations({ sessionId });
  }

  @Get('conversations/:jid')
  async conversations(@User('id') ownerId: string, @Param('jid') jid: string) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.getConversations({ sessionId, jid });
  }

  @Post('conversations/:jid/mark-as-read')
  async markConversationAsRead(
    @User('id') ownerId: string,
    @Param('jid') jid: string,
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.markConversationAsRead(sessionId, jid);
  }

  @Post('conversations/:jid/mode')
  async toggleConversationMode(
    @User('id') ownerId: string,
    @Param('jid') jid: string,
    @Body() body: { mode: 'BOT' | 'HUMAN' },
  ) {
    const sessionId = await this.wa.getSessionByOwner(ownerId);
    return this.wa.toggleConversationAiMode(sessionId, jid, body.mode);
  }
}
