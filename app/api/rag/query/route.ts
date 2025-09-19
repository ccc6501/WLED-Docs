import { NextResponse } from 'next/server';
import { queryIndex } from '@/lib/rag';
import { addLog } from '@/lib/activity-log';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const q = body.q as string | undefined;
  const k = typeof body.k === 'number' ? body.k : 5;

  if (!q) {
    return NextResponse.json({ error: 'q is required' }, { status: 400 });
  }

  const start = Date.now();
  try {
    const matches = await queryIndex(q, k);
    addLog({ type: 'rag', detail: `Query "${q}"`, durationMs: Date.now() - start, status: 200 });
    return NextResponse.json({ matches });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Query failed';
    addLog({ type: 'rag', detail: message, durationMs: Date.now() - start, status: 500 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
