import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AiProvider } from './ai-provider.interface';

@Injectable()
export class GeminiProvider implements AiProvider {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    // this.testConnection();
  }

  async testConnection() {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const result = await model.generateContent('Say hello');
    const response = await result.response;

    console.log('Gemini test:', response.text());
  }

  async generateReply(params: {
    systemPrompt?: string | null;
    userMessage: string;
    temperature: number;
    maxTokens: number;
    model: string;
  }): Promise<string | null> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const prompt = `${params.systemPrompt || 'You are a helpful assistant.'} User: ${params.userMessage}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;

    return response.text();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-embedding-001',
    });

    const result = await model.embedContent({
      content: {
        role: 'user',
        parts: [{ text }],
      },
    });

    return result.embedding.values;
  }
}
