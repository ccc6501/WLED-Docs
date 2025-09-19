import { NextResponse } from 'next/server';
import { indexSources } from '@/lib/rag';
import { addLog } from '@/lib/activity-log';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sources: string[] = Array.isArray(body.sources)
    ? Array.from(new Set(body.sources.map((source: string) => source.split(/[/\\]/).pop() || source)))
    : [];
  if (!sources.length) {
    return NextResponse.json({ error: 'sources is required' }, { status: 400 });
  }

  const start = Date.now();
  try {
    const result = await indexSources(sources);
    addLog({ type: 'rag', detail: `Indexed ${result.indexed} chunks`, durationMs: Date.now() - start, status: 200 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Indexing failed';
    addLog({ type: 'rag', detail: message, durationMs: Date.now() - start, status: 500 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
