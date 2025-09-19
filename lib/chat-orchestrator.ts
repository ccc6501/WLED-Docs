import { prisma } from './prisma';
import { callGenesis } from './genesis';
import { callOpenRouter } from './openrouter';
import type { ChatMessage } from './chat-types';

export type Provider = 'genesis' | 'openrouter';

function getProvider(): Provider {
  if (process.env.GENESIS_API_BASE && process.env.GENESIS_API_KEY && process.env.GENESIS_ASSISTANT_ID) {
    return 'genesis';
  }
  if (process.env.OPENROUTER_API_KEY) {
    return 'openrouter';
  }
  throw new Error('No chat provider configured. Set Genesis or OpenRouter credentials.');
}

async function ensureThread(threadId?: string) {
  if (threadId) {
    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (thread) return thread;
  }

  const created = await prisma.thread.create({
    data: {
      title: 'Untitled thread'
    }
  });
  return created;
}

export async function orchestrateChat({
  threadId,
  messages
}: {
  threadId?: string;
  messages: ChatMessage[];
}) {
  const provider = getProvider();
  const thread = await ensureThread(threadId);

  const timestamp = new Date();

  const userFacingMessages = messages.filter((message) => message.role !== 'system');

  if (userFacingMessages.length) {
    await prisma.$transaction(
      userFacingMessages.map((message) =>
        prisma.message.create({
          data: {
            threadId: thread.id,
            role: message.role,
            content: message.content,
            createdAt: timestamp
          }
        })
      )
    );

    const firstUserMessage = userFacingMessages.find((message) => message.role === 'user');
    if (firstUserMessage && (!thread.title || thread.title === 'Untitled thread')) {
      await prisma.thread.update({
        where: { id: thread.id },
        data: { title: firstUserMessage.content.slice(0, 60) || thread.title }
      });
    }
  }

  const providerMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are MONKY, an AI ops assistant. Provide concise, actionable responses. Cite sources when supplied. Use markdown.'
    },
    ...messages
  ];

  let content = '';
  let citations: Array<{ source: string; chunkId?: number; text?: string }> | undefined;

  if (provider === 'genesis') {
    const response = await callGenesis(providerMessages);
    content = response.content;
    citations = response.citations?.map((entry: { source?: string; chunkId?: number; text?: string }) => ({
      source: entry?.source ?? 'knowledge-base',
      chunkId: entry?.chunkId,
      text: entry?.text
    }));
  } else {
    content = await callOpenRouter(providerMessages);
  }

  await prisma.message.create({
    data: {
      threadId: thread.id,
      role: 'assistant',
      content
    }
  });

  await prisma.thread.update({
    where: { id: thread.id },
    data: { updatedAt: new Date() }
  });

  return {
    threadId: thread.id,
    content,
    citations
  };
}

export async function listThreads() {
  return prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' } } }
  });
}

export async function renameThread(id: string, title: string) {
  return prisma.thread.update({ where: { id }, data: { title } });
}

export async function deleteThread(id: string) {
  await prisma.message.deleteMany({ where: { threadId: id } });
  await prisma.thread.delete({ where: { id } });
}
