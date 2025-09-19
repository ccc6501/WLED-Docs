import { NextResponse } from 'next/server';
import { embedText } from '@/lib/embeddings';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  try {
    const result = await embedText(text);
    return NextResponse.json({
      vector: Array.from(result.vector),
      dimension: result.vector.length,
      mode: result.mode,
      provider: result.provider
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Embedding error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
