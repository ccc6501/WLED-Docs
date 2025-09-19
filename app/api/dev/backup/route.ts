import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { flushVectorStore } from '@/lib/rag';

const DB_PATH = path.resolve('dev.db');
const VECTOR_DIR = path.resolve(process.env.VECTOR_STORE_DIR || '.vectorstore/faiss');
const INDEX_PATH = path.join(VECTOR_DIR, 'index.faiss');
const METADATA_PATH = path.join(VECTOR_DIR, 'metadata.json');

export const runtime = 'nodejs';

export async function GET() {
  const payload: Record<string, string | null> = { db: null, index: null, metadata: null };

  async function toBase64(filePath: string) {
    try {
      const file = await fs.readFile(filePath);
      return Buffer.from(file).toString('base64');
    } catch {
      return null;
    }
  }

  await flushVectorStore();

  try {
    const db = await fs.readFile(DB_PATH);
    payload.db = Buffer.from(db).toString('base64');
  } catch {
    payload.db = null;
  }

  payload.index = await toBase64(INDEX_PATH);
  payload.metadata = await toBase64(METADATA_PATH);

  return NextResponse.json(payload);
}
