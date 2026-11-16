import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiResponseService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateBasicReply(params: {
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt?: string | null;
    userMessage: string;
  }) {
    const completion = await this.openai.chat.completions.create({
      model: params.model,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      messages: [
        {
          role: 'system',
          content: params.systemPrompt || 'You are a helpful assistant.',
        },
        {
          role: 'user',
          content: params.userMessage,
        },
      ],
    });

    return completion.choices[0].message.content;
  }
}
