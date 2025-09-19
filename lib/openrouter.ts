import { z } from 'zod';
import type { ChatMessage } from './chat-types';

const OpenRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({ content: z.string() }),
      finish_reason: z.string().optional()
    })
  )
});

export async function callOpenRouter(messages: ChatMessage[]): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct';

  if (!key) {
    throw new Error('OpenRouter provider is not configured.');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'MONKY Ops Dashboard'
    },
    body: JSON.stringify({
      model,
      messages
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter API error: ${response.statusText} ${text}`);
  }

  const payload = await response.json();
  const parsed = OpenRouterResponseSchema.parse(payload);
  return parsed.choices[0]?.message.content ?? '';
}
