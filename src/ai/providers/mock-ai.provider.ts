import { Injectable } from '@nestjs/common';
import { AiProvider } from './ai-provider.interface';

@Injectable()
export class MockAiProvider implements AiProvider {
  async generateReply(params: {
    systemPrompt?: string | null;
    userMessage: string;
    temperature?: number;
    maxTokens?: number;
    model?: string;
  }): Promise<string> {
    return `MOCK REPLY: ${params.userMessage}`;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Return random vector (dimension 768 for example)
    return Array.from({ length: 768 }, () => Math.random());
  }
}
