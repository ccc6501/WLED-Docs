export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatResponseChunk {
  content: string;
  citations?: Array<{ source: string; chunkId?: number; text?: string }>;
  threadId: string;
}
