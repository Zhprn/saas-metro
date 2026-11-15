import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class AiResponseService {
  private _openai?: OpenAI;

  // Created lazily so the app can start without OPENAI_API_KEY (e.g. AI_PROVIDER=claude)
  private get openai(): OpenAI {
    if (!this._openai) {
      this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._openai;
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
