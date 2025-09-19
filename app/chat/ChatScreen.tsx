'use client';

import { useState } from 'react';
import { ChatComposer } from '@/components/ChatComposer';
import { ThreadList } from '@/components/ThreadList';
import { MessageList } from '@/components/MessageList';
import type { ChatMessage } from '@/lib/chat-types';

interface ThreadWithMessages {
  id: string;
  title: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: 'system' | 'user' | 'assistant';
    content: string;
    createdAt: string;
  }>;
}

interface ChatScreenProps {
  initialThreads: ThreadWithMessages[];
  provider: string;
}

export function ChatScreen({ initialThreads, provider }: ChatScreenProps) {
  const [threads, setThreads] = useState(initialThreads);
  const [activeThreadId, setActiveThreadId] = useState(initialThreads[0]?.id);
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const [citations, setCitations] = useState<Array<{ source: string; chunkId?: number; text?: string }> | undefined>();

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null;

  async function refreshThreads() {
    const response = await fetch('/api/threads');
    const data = await response.json();
    setThreads(data);
    if (!activeThreadId && data[0]) {
      setActiveThreadId(data[0].id);
    }
  }

  async function handleCreateThread() {
    const response = await fetch('/api/threads', { method: 'POST' });
    const thread = await response.json();
    setActiveThreadId(thread.id);
    await refreshThreads();
  }

  async function handleDeleteThread(id: string) {
    setActiveThreadId((current) => (current === id ? undefined : current));
    await fetch(`/api/threads/${id}`, { method: 'DELETE' });
    await refreshThreads();
  }

  async function indexFiles(files: FileList | null) {
    if (!files?.length) return;
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append('files', file));
    const uploadResponse = await fetch('/api/rag/upload', {
      method: 'POST',
      body: formData
    });
    const uploaded = (await uploadResponse.json()) as { files?: Array<{ name: string }> };
    if (uploaded?.files?.length) {
      await fetch('/api/rag/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: uploaded.files.map((file) => file.name) })
      });
    }
  }

  async function handleSend(message: string, options?: { indexToRag?: boolean; files?: FileList | null }) {
    if (!activeThread && !threads.length) {
      await handleCreateThread();
    }

    if (options?.indexToRag) {
      await indexFiles(options.files ?? null);
    }

    let threadId = activeThread?.id;
    if (!threadId) {
      const created = await (await fetch('/api/threads', { method: 'POST' })).json();
      threadId = created.id;
    }

    const baseThread = threads.find((thread) => thread.id === threadId) ?? activeThread;
    const history: ChatMessage[] = baseThread
      ? baseThread.messages.map((entry) => ({ role: entry.role, content: entry.content }))
      : [];

    const payloadMessages: ChatMessage[] = [...history, { role: 'user', content: message }];

    setThreads((prev) => {
      const existing = prev.find((thread) => thread.id === threadId);
      const newMessage = {
        id: `temp-${Date.now()}`,
        role: 'user' as const,
        content: message,
        createdAt: new Date().toISOString()
      };
      if (!existing) {
        return [
          ...prev,
          {
            id: threadId!,
            title: 'Untitled thread',
            updatedAt: new Date().toISOString(),
            messages: [newMessage]
          }
        ];
      }
      return prev.map((thread) =>
        thread.id === threadId
          ? { ...thread, messages: [...thread.messages, newMessage], updatedAt: new Date().toISOString() }
          : thread
      );
    });

    setActiveThreadId(threadId!);
    setStreamingMessage('…');
    setCitations(undefined);

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, messages: payloadMessages, stream: true })
    });

    if (!response.ok || !response.body) {
      if (!response.ok) {
        const error = await response.json();
        console.error('Chat error', error);
      }
      await refreshThreads();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      for (let i = 0; i < parts.length - 1; i += 1) {
        const part = parts[i];
        if (!part.startsWith('event:')) continue;
        const [eventLine, dataLine] = part.split('\n');
        const eventName = eventLine.replace('event: ', '').trim();
        const data = dataLine?.replace('data: ', '') ?? '';
        if (eventName === 'message') {
          const payload = JSON.parse(data);
          setStreamingMessage(payload.content);
        }
        if (eventName === 'citations') {
          setCitations(JSON.parse(data));
        }
        if (eventName === 'done') {
          setStreamingMessage(null);
          await refreshThreads();
        }
      }
      buffer = parts[parts.length - 1];
    }
    await refreshThreads();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
      <div className="xl:h-[calc(100vh-7rem)]">
        <ThreadList
          threads={threads}
          selectedId={activeThread?.id}
          onSelect={(thread) => setActiveThreadId(thread.id)}
          onCreate={handleCreateThread}
          onDelete={handleDeleteThread}
        />
      </div>
      <div className="flex h-[calc(100vh-7rem)] flex-col gap-4">
        <div className="flex flex-1 gap-4">
          <div className="flex flex-1 flex-col rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
            <h1 className="text-lg font-semibold text-foreground">Conversation</h1>
            <MessageList messages={activeThread?.messages ?? []} streamingMessage={streamingMessage ?? undefined} citations={citations} />
          </div>
          <aside className="hidden w-64 flex-none space-y-4 rounded-3xl border border-border/60 bg-black/40 p-4 text-sm text-muted-foreground shadow-glass xl:block">
            <div>
              <h2 className="text-xs uppercase text-muted-foreground">Provider</h2>
              <p className="mt-1 text-foreground">{provider}</p>
              <p className="mt-1 text-xs">Temperature fixed for reliability. Adjust via environment.</p>
            </div>
            <div>
              <h2 className="text-xs uppercase text-muted-foreground">System Note</h2>
              <p>MONKY is tuned for ops workflow assistance with Chrome-optimized experience.</p>
            </div>
          </aside>
        </div>
        <ChatComposer onSend={handleSend} />
      </div>
    </div>
  );
}
