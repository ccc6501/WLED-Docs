'use client';

import { useState } from 'react';
import { Paperclip, Send, Loader2, Database } from 'lucide-react';

interface ChatComposerProps {
  onSend: (message: string, options?: { indexToRag?: boolean; files?: FileList | null }) => Promise<void>;
}

export function ChatComposer({ onSend }: ChatComposerProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [shouldIndex, setShouldIndex] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileInputKey, setFileInputKey] = useState(() => Date.now());

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setIsSending(true);
    try {
      await onSend(message, { indexToRag: shouldIndex, files });
      setMessage('');
      setFiles(null);
      setFileInputKey(Date.now());
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-3xl border border-border/60 bg-black/40 p-4 shadow-glass">
      <textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={2}
        placeholder="Ask MONKY about ops, incidents, or procedures..."
        className="w-full resize-none rounded-2xl border border-border/40 bg-black/30 p-4 text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-black/30 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground transition hover:text-foreground">
          <Paperclip className="h-4 w-4" /> Attach
          <input key={fileInputKey} type="file" multiple className="hidden" onChange={(event) => setFiles(event.target.files)} />
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-black/30 px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground transition hover:text-foreground">
          <input type="checkbox" className="accent-accent" checked={shouldIndex} onChange={(event) => setShouldIndex(event.target.checked)} />
          <Database className="h-4 w-4" />
          Index to RAG
        </label>
        <button
          type="submit"
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-accent px-4 py-2 text-sm font-semibold text-primary-foreground shadow-glass transition hover:opacity-90"
          disabled={isSending}
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send
        </button>
      </div>
    </form>
  );
}
