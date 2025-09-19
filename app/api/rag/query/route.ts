import { NextResponse } from 'next/server';
import { queryIndex } from '@/lib/rag';
import { addLog } from '@/lib/activity-log';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const q = body.q as string | undefined;
  const k = typeof body.k === 'number' ? body.k : 5;

  if (!q) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  const start = Date.now();
  const matches = await queryIndex(q, k);
  addLog({ type: 'rag', detail: `Query "${q}"`, durationMs: Date.now() - start, status: 200 });

  return NextResponse.json({ matches });
}
