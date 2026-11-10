import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AiAgentService {
  constructor(private readonly prisma: PrismaService) {}

  async getAgent(sessionId: string) {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { sessionId },
    });

    return agent;
  }

  // Low (0.2–0.4): Strict Fact Based
  // Medium (0.6–0.8): Conversational
  // High (0.9+): Creative but risky halucination
  async createAgent(
    sessionId: string,
    ownerId: string,
    name: string,
    isEnabled: boolean,
    systemPrompt: string,
    fallbackReply: string,
    language: string,
  ) {
    const agent = await this.prisma.aiAgent.upsert({
      where: { sessionId },
      update: {
        ownerId,
        name,
        isEnabled,
        systemPrompt,
        fallbackReply,
        language,
      },
      create: {
        sessionId,
        ownerId,
        name,
        isEnabled,
        mode: 'BOT',
        model: 'gemini-2.5-flash',
        temperature: 0.7,
        maxTokens: 100,
        systemPrompt,
        fallbackReply,
        language,
      },
    });

    return agent;
  }

  async switchMode(id: string, mode: 'BOT' | 'HUMAN') {
    const agent = await this.prisma.aiAgent.update({
      where: { id },
      data: { mode },
    });

    return agent;
  }

  async updateAgent(
    id: string,
    data: {
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
    const agent = await this.prisma.aiAgent.update({
      where: { id },
      data,
      include: { knowledgeFiles: true },
    });

    return agent;
  }

  async toggleEnabled(id: string) {
    const current = await this.prisma.aiAgent.findUnique({ where: { id } });
    if (!current) throw new Error('Agent not found');

    const agent = await this.prisma.aiAgent.update({
      where: { id },
      data: { isEnabled: !current.isEnabled },
    });

    return agent;
  }

  async deleteAgent(id: string) {
    return this.prisma.aiAgent.delete({
      where: { id },
    });
  }
}
