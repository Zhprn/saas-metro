import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { AiAgentService } from './ai-agent.service';
import { ApiBearerAuth, ApiBody, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from 'src/common/services/cloudinary.service';
import { AiKnowledgeService } from './ai-knowledge.service';
import { KnowledgeFileType } from '@prisma/client';
import { WaService } from 'src/wa/wa.service';
import { JwtAuthGuard } from 'src/auth/guard/jwt-guard.auth';
import { User } from 'src/common/decorators/user.decorator';

@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly aiAgentService: AiAgentService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly aiKnowledgeService: AiKnowledgeService,
    private readonly waService: WaService,
  ) {}

  @Get()
  async getAgent(@User('id') ownerId: string) {
    const sessionId = await this.waService.getSessionByOwner(ownerId);
    return this.aiAgentService.getAgent(sessionId);
  }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { example: 'mitsuha' },
        isEnabled: { example: true },
        systemPrompt: {
          example:
            'You are a friendly sales assistant for Umroh packages. Be persuasive but polite',
        },
        fallbackReply: {
          example: 'Maaf kak, untuk informasi tersebut silakan hubungi admin',
        },
        language: { example: 'id' },
      },
    },
  })
  @Post()
  async createAgent(
    @User('id') ownerId: string,
    @Body('name') name: string,
    @Body('isEnabled') isEnabled: boolean,
    @Body('systemPrompt') systemPrompt: string,
    @Body('fallbackReply') fallbackReply: string,
    @Body('language') language: string,
  ) {
    const sessionId = await this.waService.getSessionByOwner(ownerId);
    return this.aiAgentService.createAgent(
      sessionId,
      ownerId,
      name,
      isEnabled,
      systemPrompt,
      fallbackReply,
      language,
    );
  }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: { example: 'cmlha0mid0000mezwjmb13x6j' },
        mode: { example: 'HUMAN' },
      },
    },
  })
  @Patch(':id/mode')
  async switchMode(
    @Param('id') id: string,
    @Body('mode') mode: 'BOT' | 'HUMAN',
  ) {
    return this.aiAgentService.switchMode(id, mode);
  }

  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF file to upload',
        },
        fileType: {
          type: 'string',
          enum: ['COMPANY_PROFILE', 'PRICELIST', 'FAQ'],
          default: 'FAQ',
          description: 'Knowledge category: COMPANY_PROFILE, PRICELIST, or FAQ',
        },
      },
    },
  })
  @Post(':agentId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadKnowledge(
    @Param('agentId') agentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('fileType') fileTypeRaw?: string,
  ) {
    // Default to FAQ if not provided or unrecognised
    const fileType: KnowledgeFileType =
      (fileTypeRaw as KnowledgeFileType) ?? KnowledgeFileType.FAQ;

    const fileName = file.originalname;
    if (!file || file.size > 5 * 1024 * 1024) {
      return { success: false, message: 'Pdf file max size is 5MB' };
    }
    // 1. upload first (fast)
    const uploaded = await this.cloudinaryService.uploadPdf(
      file.buffer,
      `${Date.now()}-${file.originalname}`,
    );

    // 2. save DB
    const fileRecord = await this.aiService.uploadKnowledge(
      agentId,
      file.originalname,
      uploaded.secure_url,
      'PROCESSING',
      fileType,
    );

    // 3. process in background
    setImmediate(() => {
      this.aiKnowledgeService.processPdfBuffer(
        agentId,
        fileRecord.id,
        file.buffer,
        fileType,
      );
    });

    return { success: true, fileType };
  }

  @Get(':agentId/knowledge')
  async getKnowledge(@Param('agentId') agentId: string) {
    return this.aiKnowledgeService.getAIKnowledge(agentId);
  }

  @Delete(':agentId/knowledge/:fileId')
  async deleteKnowledge(
    @Param('agentId') agentId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.aiKnowledgeService.deleteKnowledge(agentId, fileId);
  }

  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { example: 'CS Bot' },
        isEnabled: { example: true },
        model: { example: 'gpt-4o-mini' },
        temperature: { example: 0.7 },
        maxTokens: { example: 500 },
        systemPrompt: { example: 'You are a helpful assistant.' },
        fallbackReply: {
          example: 'Maaf, saya tidak bisa menjawab pertanyaan itu.',
        },
        language: { example: 'id' },
      },
    },
  })
  @Patch(':id')
  async updateAgent(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      isEnabled?: boolean;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      systemPrompt?: string | null;
      fallbackReply?: string | null;
      language?: string;
    },
  ) {
    return this.aiAgentService.updateAgent(id, body);
  }

  @Delete(':id')
  async deleteAgent(@Param('id') id: string) {
    return this.aiAgentService.deleteAgent(id);
  }

  @Patch(':id/toggle')
  async toggleEnabled(@Param('id') id: string) {
    return this.aiAgentService.toggleEnabled(id);
  }
}
