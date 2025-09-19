import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from './prisma';
import { parseFileToChunks } from './parse';

const VECTOR_STORE_DIR = process.env.VECTOR_STORE_DIR || '.vectorstore/faiss';
const VECTOR_INDEX_FILE = path.join(VECTOR_STORE_DIR, 'vectors.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

interface VectorRecord {
  id: string;
  source: string;
  chunkId: number;
  text: string;
  vector: number[];
  textHash: string;
}

export interface RagMatch {
  source: string;
  chunkId: number;
  text: string;
  score: number;
}

async function ensureStoreDir() {
  await fs.mkdir(VECTOR_STORE_DIR, { recursive: true });
}

async function loadRecords(): Promise<VectorRecord[]> {
  await ensureStoreDir();
  try {
    const data = await fs.readFile(VECTOR_INDEX_FILE, 'utf-8');
    return JSON.parse(data) as VectorRecord[];
  } catch {
    return [];
  }
}

async function saveRecords(records: VectorRecord[]) {
  await ensureStoreDir();
  await fs.writeFile(VECTOR_INDEX_FILE, JSON.stringify(records, null, 2), 'utf-8');
}

function hashText(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function createEmbedding(text: string): number[] {
  const hash = crypto.createHash('sha512').update(text).digest();
  const vector: number[] = [];
  for (let i = 0; i < hash.length; i += 4) {
    const segment = hash.subarray(i, i + 4);
    vector.push(segment.readInt32BE(0) / 2 ** 31);
  }
  return vector;
}

function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function indexSources(sources: string[]) {
  const records = await loadRecords();
  const existingHashes = new Set(records.map((record) => record.textHash));

  let indexed = 0;
  let skipped = 0;

  for (const source of sources) {
    const filePath = path.join(UPLOAD_DIR, source);
    let parsed;
    try {
      parsed = await parseFileToChunks(filePath);
      } catch (error) {
        console.error('Failed to parse source', source, error);
        skipped += 1;
        continue;
      }

    for (const [index, chunk] of parsed.chunks.entries()) {
      const textHash = hashText(chunk);
      if (existingHashes.has(textHash)) {
        skipped += 1;
        continue;
      }

      const vector = createEmbedding(chunk);
      const record: VectorRecord = {
        id: crypto.randomUUID(),
        source: parsed.source,
        chunkId: index,
        text: chunk,
        vector,
        textHash
      };
      records.push(record);
      existingHashes.add(textHash);
      indexed += 1;

      try {
        await prisma.docMeta.create({
          data: {
            source: parsed.source,
            chunkId: index,
            textHash
          }
        });
      } catch {
        // ignore duplicates
      }
    }
  }

  await saveRecords(records);
  return { indexed, skipped };
}

export async function queryIndex(query: string, k = 5): Promise<RagMatch[]> {
  const records = await loadRecords();
  if (!records.length) return [];

  const queryVector = createEmbedding(query);
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = records.map((record) => {
    const score = cosineSimilarity(queryVector, record.vector);
    const keywordBoost = queryTerms.reduce((acc, term) => {
      return acc + (record.text.toLowerCase().includes(term) ? 0.05 : 0);
    }, 0);
    return {
      source: record.source,
      chunkId: record.chunkId,
      text: record.text,
      score: score + keywordBoost
    };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .filter((item) => item.score > 0.01);
}
