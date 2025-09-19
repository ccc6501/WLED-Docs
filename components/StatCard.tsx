import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  accent?: string;
}

export function StatCard({ label, value, trend, accent }: StatCardProps) {
  return (
    <div className={cn('rounded-3xl border border-border/60 bg-gradient-to-br from-black/40 via-black/20 to-black/60 p-6 shadow-glass')}
    >
      <p className="text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-foreground">{value}</p>
      {trend && <p className="mt-2 text-xs text-accent">{trend}</p>}
      {accent && <p className="mt-3 text-xs text-muted-foreground">{accent}</p>}
    </div>
  );
}
