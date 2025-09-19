import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const threads = await prisma.thread.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' }
      }
    }
  });
  return NextResponse.json(threads);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const title = body?.title ?? 'Untitled thread';
  const thread = await prisma.thread.create({
    data: { title }
  });
  return NextResponse.json(thread, { status: 201 });
}
