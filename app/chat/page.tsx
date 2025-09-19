import { prisma } from '@/lib/prisma';
import { ChatScreen } from './ChatScreen';

export default async function ChatPage() {
  const threads = await prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } }
  });

  let provider = 'Configure providers';
  if (process.env.GENESIS_API_KEY && process.env.GENESIS_API_BASE && process.env.GENESIS_ASSISTANT_ID) {
    provider = 'Genesis';
  } else if (process.env.OPENROUTER_API_KEY) {
    provider = `OpenRouter (${process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.1-8b-instruct'})`;
  }

  return <ChatScreen initialThreads={threads} provider={provider} />;
}
