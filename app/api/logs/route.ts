import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/activity-log';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 25);
  return NextResponse.json({ logs: getLogs(limit) });
}
