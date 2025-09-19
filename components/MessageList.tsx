'use client';

import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { cn, formatDate } from '@/lib/utils';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt?: string;
}

interface MessageListProps {
  messages: Message[];
  streamingMessage?: string | null;
  citations?: Array<{ source: string; chunkId?: number; text?: string }>;
}

export function MessageList({ messages, streamingMessage, citations }: MessageListProps) {
  return (
    <div className="flex-1 space-y-4 overflow-y-auto pr-2">
      {messages.map((message) => (
        <article
          key={message.id}
          className={cn(
            'rounded-3xl border border-border/40 bg-black/40 p-4 shadow-glass transition',
            message.role === 'user' ? 'border-primary/60 bg-primary/10' : ''
          )}
        >
          <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
            <span>{message.role}</span>
            {message.createdAt && <span>{formatDate(message.createdAt)}</span>}
          </div>
          <div className="prose prose-invert mt-2 max-w-none text-sm">
            <ReactMarkdown rehypePlugins={[rehypeRaw, rehypeHighlight]}>{message.content}</ReactMarkdown>
          </div>
        </article>
      ))}
      {streamingMessage && (
        <article className="rounded-3xl border border-primary/60 bg-primary/10 p-4 text-sm text-primary-foreground shadow-glass">
          {streamingMessage}
        </article>
      )}
      {citations?.length ? (
        <div className="rounded-3xl border border-border/60 bg-black/40 p-4 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">Citations</p>
          <ul className="mt-2 space-y-2">
            {citations.map((citation, index) => (
              <li key={`${citation.source}-${citation.chunkId}-${index}`} className="rounded-2xl bg-black/40 p-3">
                <p className="font-medium text-foreground">{citation.source}</p>
                {citation.chunkId !== undefined && <p>Chunk #{citation.chunkId}</p>}
                {citation.text && <p className="mt-1 text-muted-foreground">{citation.text}</p>}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
