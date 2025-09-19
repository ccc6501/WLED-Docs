import { NextResponse } from 'next/server';
import { orchestrateChat } from '@/lib/chat-orchestrator';
import type { ChatMessage } from '@/lib/chat-types';
import { addLog } from '@/lib/activity-log';

interface ChatRequestBody {
  threadId?: string;
  messages: ChatMessage[];
  stream?: boolean;
}

export async function POST(request: Request) {
  let body: ChatRequestBody;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  if (!body.messages?.length) {
    return NextResponse.json({ error: 'messages are required' }, { status: 400 });
  }

  const start = Date.now();
  const shouldStream = body.stream !== false;

  if (!shouldStream) {
    try {
      const result = await orchestrateChat(body);
      addLog({ type: 'chat', detail: `Thread ${result.threadId} (no-stream)`, durationMs: Date.now() - start, status: 200 });
      return NextResponse.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Chat provider error';
      addLog({ type: 'chat', detail: message, durationMs: Date.now() - start, status: 500 });
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  try {
    const result = await orchestrateChat(body);
    addLog({ type: 'chat', detail: `Thread ${result.threadId}`, durationMs: Date.now() - start, status: 200 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: message\ndata: ${JSON.stringify({ content: result.content, threadId: result.threadId })}\n\n`)
        );
        if (result.citations?.length) {
          controller.enqueue(encoder.encode(`event: citations\ndata: ${JSON.stringify(result.citations)}\n\n`));
        }
        controller.enqueue(encoder.encode('event: done\ndata: {"status":"ok"}\n\n'));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chat provider error';
    addLog({ type: 'chat', detail: message, durationMs: Date.now() - start, status: 500 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
