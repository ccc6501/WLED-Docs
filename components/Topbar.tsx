'use client';

import { useState } from 'react';
import { Search, Bell, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Topbar() {
  const [query, setQuery] = useState('');

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-black/40 px-6 backdrop-blur">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Command palette / Search"
          className={cn(
            'w-full rounded-full border border-border bg-black/40 py-2 pl-12 pr-6 text-sm outline-none transition focus:border-primary focus:shadow-glass'
          )}
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="relative rounded-full border border-border bg-black/50 p-2 text-muted-foreground transition hover:text-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" />
        </button>
        <button className="hidden items-center gap-2 rounded-full border border-border bg-gradient-to-r from-primary/40 to-accent/30 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:shadow-glass sm:flex">
          <Sparkles className="h-4 w-4" />
          Quick Actions
        </button>
        <div className="flex items-center gap-3 rounded-full border border-border bg-black/50 px-3 py-2 text-sm">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Operator</p>
            <p>chrome@ops</p>
          </div>
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary to-accent" />
        </div>
      </div>
    </header>
  );
}
