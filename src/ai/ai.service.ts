import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { AiResponseService } from './ai-response.service';
import { AiProvider } from './providers/ai-provider.interface';
import { AiKnowledgeService } from './ai-knowledge.service';
import { KnowledgeFileType } from '@prisma/client';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiResponseService: AiResponseService,
    @Inject('AI_PROVIDER')
    private readonly aiProvider: AiProvider,
    private readonly aiKnowledgeService: AiKnowledgeService,
  ) {}
  async handleIncomingMessage(params: {
    sessionId: string;
    jid: string;
    message: string;
    fromMe: boolean;
    isGroup: boolean;
  }) {
    const { sessionId, jid, message, fromMe, isGroup } = params;

    if (fromMe || isGroup) return null;

    const agent = await this.prisma.aiAgent.findUnique({
      where: { sessionId },
    });

    if (!agent || !agent.isEnabled) return null;
    if (agent.mode === 'HUMAN') return null;

    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { sessionId_jid: { sessionId, jid } },
    });

    if (conversation?.aiMode === 'HUMAN') return null;

    // 🔥 NEW: FORMAT RULES
    const formatInstruction = `
  IMPORTANT RESPONSE RULES:
  - Keep reply SHORT (max 3-5 sentences)
  - Use WhatsApp casual style
  - DO NOT use markdown (no **, *, etc)
  - Use "-" for bullet points if needed
  - Be direct, friendly, and persuasive
  - Focus on helping user take next action (chat, order, consult)
  - End with a simple question when possible
  `;

    // 🔥 helper to clean output
    const cleanReply = (text: string) => {
      return text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    };

    // ─── INTENT DETECTION ─────────────────────────────────────────────
    const intentRaw = await this.aiProvider.generateReply({
      systemPrompt: `
  You are an intent classifier.
  Return ONLY one category:
  GREETING, PRODUCT_QUESTION, PRICE_QUESTION, FAQ_QUESTION, SPEAK_TO_ADMIN, SMALL_TALK, OUT_OF_CONTEXT
  `,
      userMessage: message,
      temperature: 0,
      maxTokens: 10,
      model: agent.model,
    });

    const intent = (intentRaw ?? 'OTHER').trim().toUpperCase();

    // ─── MEMORY ───────────────────────────────────────────────────────
    const memories = await this.prisma.aiConversationMemory.findMany({
      where: { agentId: agent.id, jid },
      orderBy: { createdAt: 'desc' },
      take: 6,
    });

    const historyText = memories
      .reverse()
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const persona =
      agent.systemPrompt?.trim() ||
      'You are a friendly business assistant focused on helping customers and increasing sales.';

    const languageInstruction =
      agent.language === 'en'
        ? 'Respond in English.'
        : 'Respond in Indonesian.';

    let reply = '';

    // ─── GREETING ─────────────────────────────────────────────────────
    if (intent === 'GREETING') {
      reply =
        (await this.aiProvider.generateReply({
          systemPrompt: `
  ${persona}
  ${languageInstruction}
  ${formatInstruction}

  Greet warmly and offer help.

  Conversation history:
  ${historyText}
  `,
          userMessage: message,
          temperature: agent.temperature,
          maxTokens: 120,
          model: agent.model,
        })) ?? 'Halo! Ada yang bisa saya bantu?';

      reply = cleanReply(reply);
      await this.saveMemory(agent.id, jid, message, reply);
      return reply;
    }

    // ─── PRODUCT QUESTION (RAG) ───────────────────────────────────────
    if (intent === 'PRODUCT_QUESTION') {
      const queryEmbedding = await this.aiProvider.generateEmbedding(message);

      const matches = await this.aiKnowledgeService.searchSimilarChunks(
        agent.id,
        queryEmbedding,
        5,
        [KnowledgeFileType.COMPANY_PROFILE, KnowledgeFileType.PRICELIST],
      );

      const context = matches.map((m) => m.content).join('\n\n');

      reply =
        (await this.aiProvider.generateReply({
          systemPrompt: `
  ${persona}
  ${languageInstruction}
  ${formatInstruction}

  Use knowledge to answer clearly and persuasively.

  Conversation history:
  ${historyText}

  Company Knowledge:
  ${context}
  `,
          userMessage: message,
          temperature: agent.temperature,
          maxTokens: 150,
          model: agent.model,
        })) ?? 'Maaf, saya belum bisa menjawab saat ini, saya arahkan ke admin ya.';

      reply = cleanReply(reply);
      await this.saveMemory(agent.id, jid, message, reply);
      return reply;
    }

    // ─── PRICE QUESTION ───────────────────────────────────────────────
    if (intent === 'PRICE_QUESTION') {
      const queryEmbedding = await this.aiProvider.generateEmbedding(message);

      const matches = await this.aiKnowledgeService.searchSimilarChunks(
        agent.id,
        queryEmbedding,
        5,
        [KnowledgeFileType.PRICELIST],
      );

      const context = matches.map((m) => m.content).join('\n\n');

      reply =
        (await this.aiProvider.generateReply({
          systemPrompt: `
  ${persona}
  ${languageInstruction}
  ${formatInstruction}

  Answer pricing clearly and suggest best option.

  Conversation history:
  ${historyText}

  Price List:
  ${context}
  `,
          userMessage: message,
          temperature: agent.temperature,
          maxTokens: 120,
          model: agent.model,
        })) ?? 'Maaf, saya belum bisa menjawab saat ini, saya arahkan ke admin ya.';

      reply = cleanReply(reply);
      await this.saveMemory(agent.id, jid, message, reply);
      return reply;
    }

    // ─── FAQ ──────────────────────────────────────────────────────────
    if (intent === 'FAQ_QUESTION') {
      const queryEmbedding = await this.aiProvider.generateEmbedding(message);

      const matches = await this.aiKnowledgeService.searchSimilarChunks(
        agent.id,
        queryEmbedding,
        5,
        [KnowledgeFileType.FAQ],
      );

      const context = matches.map((m) => m.content).join('\n\n');

      reply =
        (await this.aiProvider.generateReply({
          systemPrompt: `
  ${persona}
  ${languageInstruction}
  ${formatInstruction}

  Answer clearly based on FAQ.

  Conversation history:
  ${historyText}

  FAQ Knowledge:
  ${context}
  `,
          userMessage: message,
          temperature: agent.temperature,
          maxTokens: 120,
          model: agent.model,
        })) ?? 'Maaf, saya belum bisa menjawab saat ini, saya arahkan ke admin ya.';

      reply = cleanReply(reply);
      await this.saveMemory(agent.id, jid, message, reply);
      return reply;
    }

    // ─── FALLBACK ─────────────────────────────────────────────────────
    reply =
      (await this.aiProvider.generateReply({
        systemPrompt: `
  ${persona}
  ${languageInstruction}
  ${formatInstruction}

  Keep it natural and short.

  Conversation history:
  ${historyText}
  `,
        userMessage: message,
        temperature: agent.temperature,
        maxTokens: 100,
        model: agent.model,
      })) ?? 'Maaf, saya belum bisa membantu, saya arahkan ke admin ya.';

    reply = cleanReply(reply);
    await this.saveMemory(agent.id, jid, message, reply);
    return reply;
  }

  async uploadKnowledge(
    agentId: string,
    fileName: string,
    fileUrl: string,
    status: 'PROCESSING' | 'READY' | 'FAILED',
    fileType: KnowledgeFileType = KnowledgeFileType.FAQ,
  ) {
    const agent = await this.prisma.aiAgent.findUnique({
      where: {
        id: agentId,
      },
    });

    if (!agent) {
      throw new BadRequestException('Agent not found');
    }

    const fileRecord = await this.prisma.aiKnowledgeFile.create({
      data: {
        agentId,
        fileName,
        fileUrl,
        status,
        fileType,
      },
    });

    return fileRecord;
  }

  async searchSimilarChunks(
    agentId: string,
    queryEmbedding: number[],
    limit = 5,
  ) {
    const embeddings = await this.prisma.aiEmbedding.findMany({
      where: { agentId },
    });

    const scored = embeddings.map((item) => ({
      content: item.content,
      score: this.cosineSimilarity(queryEmbedding, item.embedding as any),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dot / (normA * normB);
  }

  private async saveMemory(
    agentId: string,
    jid: string,
    userMessage: string,
    assistantReply: string,
  ) {
    await this.prisma.aiConversationMemory.createMany({
      data: [
        {
          agentId,
          jid,
          role: 'user',
          content: userMessage,
        },
        {
          agentId,
          jid,
          role: 'assistant',
          content: assistantReply,
        },
      ],
    });
  }
}
