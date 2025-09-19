'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

interface ThreadListItem {
  id: string;
  title: string;
  updatedAt: string;
  messages?: Array<{ content: string }>;
}

interface ThreadListProps {
  threads: ThreadListItem[];
  selectedId?: string;
  onSelect: (thread: ThreadListItem) => void;
  onCreate: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ThreadList({ threads, selectedId, onSelect, onCreate, onDelete }: ThreadListProps) {
  const [filter, setFilter] = useState('');

  const filtered = threads.filter((thread) => {
    const lastMessage = thread.messages && thread.messages.length
      ? thread.messages[thread.messages.length - 1]?.content ?? ''
      : '';
    return (
      thread.title.toLowerCase().includes(filter.toLowerCase()) ||
      lastMessage.toLowerCase().includes(filter.toLowerCase())
    );
  });

  return (
    <div className="flex h-full flex-col rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
      <div className="flex items-center gap-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search threads"
          className="flex-1 rounded-2xl border border-border/40 bg-black/30 px-3 py-2 text-xs outline-none focus:border-primary"
        />
        <button
          onClick={() => void onCreate()}
          className="rounded-full bg-primary/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-black shadow-glass transition hover:bg-primary"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-2">
        {filtered.map((thread) => (
          <button
            key={thread.id}
            onClick={() => onSelect(thread)}
            className={cn(
              'group w-full rounded-2xl border border-transparent bg-black/20 p-3 text-left transition hover:border-border/80',
              selectedId === thread.id ? 'border-primary/60 bg-primary/10' : ''
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{thread.title}</p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {thread.messages && thread.messages.length
                    ? thread.messages[thread.messages.length - 1]?.content ?? 'No messages yet.'
                    : 'No messages yet.'}
                </p>
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">{formatDate(thread.updatedAt)}</div>
            </div>
            <button
              className="mt-2 hidden items-center gap-1 rounded-full border border-border/40 px-2 py-1 text-[10px] uppercase text-muted-foreground transition group-hover:flex hover:text-destructive"
              onClick={(event) => {
                event.stopPropagation();
                void onDelete(thread.id);
              }}
            >
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </button>
        ))}
        {!filtered.length && <p className="text-center text-xs text-muted-foreground">No threads yet.</p>}
      </div>
    </div>
  );
}
