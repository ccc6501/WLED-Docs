'use client';

import { useMemo, useState } from 'react';
import { Menu, X, Activity, MessageSquare, Notebook, ListTodo, KanbanSquare, FlaskConical, Wrench, Rocket } from 'lucide-react';
import { TabLink } from './TabLink';
import { cn } from '@/lib/utils';

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const enableFuture = process.env.NEXT_PUBLIC_ENABLE_FUTURE === 'true';

  const navItems = useMemo(
    () => [
      { href: '/', label: 'Overview', icon: Activity },
      { href: '/chat', label: 'Communication', icon: MessageSquare },
      { href: '/notes', label: 'Notes', icon: Notebook },
      { href: '/tasks', label: 'Tasks', icon: KanbanSquare },
      { href: '/projects', label: 'Projects', icon: ListTodo },
      { href: '/lab', label: 'Laboratory', icon: FlaskConical },
      { href: '/dev', label: 'Dev Tools', icon: Wrench },
      { href: '/future', label: 'Future', icon: Rocket, hidden: !enableFuture }
    ],
    [enableFuture]
  );

  return (
    <aside className="relative">
      <button
        className="absolute left-4 top-4 z-50 rounded-full border border-border bg-background/90 p-2 text-muted-foreground shadow-lg lg:hidden"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Toggle navigation"
      >
        {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 transform border-r border-border bg-black/60 backdrop-blur-xl transition-transform duration-300 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        <div className="flex h-full flex-col gap-6 px-6 py-8">
          <div className="flex items-center gap-3 text-lg font-semibold">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/30 text-primary-foreground shadow-glass">猿</span>
            <div>
              <p className="text-sm uppercase text-muted-foreground">Genesis Ops</p>
              <p>MONKY Dashboard</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto pr-2">
            {navItems.map((item) => (
              <TabLink key={item.href} {...item} />
            ))}
          </nav>
          <div className="rounded-2xl border border-border bg-muted/50 p-4 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Status</p>
            <p className="mt-1">All systems nominal. Chrome-optimized UI with GPU-accelerated transitions.</p>
          </div>
        </div>
      </div>
      {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
    </aside>
  );
}
