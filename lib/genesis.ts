import { z } from 'zod';
import type { ChatMessage } from './chat-types';

const GenesisResponseSchema = z.object({
  content: z.string(),
  citations: z.array(z.any()).optional()
});

export async function callGenesis(messages: ChatMessage[]): Promise<z.infer<typeof GenesisResponseSchema>> {
  const baseUrl = process.env.GENESIS_API_BASE;
  const key = process.env.GENESIS_API_KEY;
  const assistantId = process.env.GENESIS_ASSISTANT_ID;

  if (!baseUrl || !key || !assistantId) {
    throw new Error('Genesis provider is not fully configured.');
  }

  const response = await fetch(`${baseUrl}/assistants/${assistantId}/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({ messages, stream: false })
  });

  if (!response.ok) {
    throw new Error(`Genesis API error: ${response.statusText}`);
  }

  const payload = await response.json();
  return GenesisResponseSchema.parse(payload);
}
