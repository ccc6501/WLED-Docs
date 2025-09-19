export default function FuturePage() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_FUTURE === 'true';
  if (!enabled) {
    return (
      <div className="rounded-3xl border border-border/60 bg-black/40 p-10 text-center text-sm text-muted-foreground shadow-glass">
        Future module placeholder. Set NEXT_PUBLIC_ENABLE_FUTURE=true to reveal upcoming ops tools.
      </div>
    );
  }
  return (
    <div className="rounded-3xl border border-border/60 bg-black/40 p-10 text-sm text-foreground shadow-glass">
      <h1 className="text-2xl font-semibold">Future Module</h1>
      <p className="mt-3 text-muted-foreground">
        This space is wired for future expansion: observability widgets, runbooks, or auto-remediation consoles. Toggle via
        NEXT_PUBLIC_ENABLE_FUTURE.
      </p>
    </div>
  );
}
