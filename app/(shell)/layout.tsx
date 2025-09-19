import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import type { ReactNode } from 'react';

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-[radial-gradient(circle_at_top,_rgba(70,70,150,0.25),_transparent_60%)] text-foreground lg:grid-cols-[18rem_1fr]">
      <Sidebar />
      <main className="flex flex-col">
        <Topbar />
        <div className="flex-1 overflow-y-auto bg-black/30 p-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-6">{children}</div>
        </div>
      </main>
    </div>
  );
}
