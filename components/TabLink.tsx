'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface TabLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string | number;
  hidden?: boolean;
}

export function TabLink({ href, label, icon: Icon, badge, hidden }: TabLinkProps) {
  const pathname = usePathname();
  const active = pathname === href;

  if (hidden) return null;

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors',
        active ? 'bg-primary/20 text-primary-foreground shadow-glass' : 'text-muted-foreground hover:bg-muted'
      )}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/80">{badge}</span>}
    </Link>
  );
}
