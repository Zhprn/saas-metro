export interface AiProvider {
  generateReply(params: {
    systemPrompt?: string | null;
    userMessage: string;
    temperature?: number;
    maxTokens?: number;
    model: string;
  }): Promise<string | null>;

  generateEmbedding(text: string): Promise<number[]>;
}
