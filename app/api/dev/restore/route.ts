import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { clearVectorStoreCache } from '@/lib/rag';

const DB_PATH = path.resolve('dev.db');
const VECTOR_DIR = path.resolve(process.env.VECTOR_STORE_DIR || '.vectorstore/faiss');
const INDEX_PATH = path.join(VECTOR_DIR, 'index.faiss');
const METADATA_PATH = path.join(VECTOR_DIR, 'metadata.json');

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const hasDb = typeof body.db === 'string' && body.db.length > 0;
  const hasIndex = typeof body.index === 'string' && body.index.length > 0;
  const hasMetadata = typeof body.metadata === 'string' && body.metadata.length > 0;

  if (!hasDb && !hasIndex && !hasMetadata) {
    return NextResponse.json({ error: 'No payload supplied' }, { status: 400 });
  }

  if (hasDb) {
    const buffer = Buffer.from(body.db, 'base64');
    await fs.writeFile(DB_PATH, buffer);
  }

  await fs.mkdir(VECTOR_DIR, { recursive: true });

  if (hasIndex) {
    const buffer = Buffer.from(body.index, 'base64');
    await fs.writeFile(INDEX_PATH, buffer);
  }

  if (hasMetadata) {
    const buffer = Buffer.from(body.metadata, 'base64');
    await fs.writeFile(METADATA_PATH, buffer);
  }

  await clearVectorStoreCache();

  return NextResponse.json({ ok: true });
}
