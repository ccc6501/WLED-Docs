import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  params: { id: string };
}

export async function GET(_: Request, { params }: Params) {
  const thread = await prisma.thread.findUnique({
    where: { id: params.id },
    include: { messages: { orderBy: { createdAt: 'asc' } } }
  });
  if (!thread) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function PATCH(request: Request, { params }: Params) {
  const body = await request.json().catch(() => ({}));
  const thread = await prisma.thread.update({
    where: { id: params.id },
    data: { title: body.title ?? 'Untitled thread' }
  });
  return NextResponse.json(thread);
}

export async function DELETE(_: Request, { params }: Params) {
  await prisma.message.deleteMany({ where: { threadId: params.id } });
  await prisma.thread.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
