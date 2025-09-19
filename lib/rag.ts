import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { IndexFlatIP } from 'faiss-node';
import { prisma } from './prisma';
import { parseFileToChunks } from './parse';
import { embedText, normalizeEmbedding, type EmbeddingMode } from './embeddings';

const VECTOR_STORE_DIR = process.env.VECTOR_STORE_DIR || '.vectorstore/faiss';
const INDEX_FILE = path.join(VECTOR_STORE_DIR, 'index.faiss');
const METADATA_FILE = path.join(VECTOR_STORE_DIR, 'metadata.json');
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

interface MetadataRecord {
  id: string;
  source: string;
  chunkId: number;
  text: string;
  textHash: string;
}

interface PersistedMetadata {
  dimension: number;
  mode: EmbeddingMode;
  records: MetadataRecord[];
}

interface VectorStore {
  index: IndexFlatIP | null;
  metadata: MetadataRecord[];
  dimension: number;
  mode: EmbeddingMode;
  hashes: Set<string>;
}

export interface RagMatch {
  source: string;
  chunkId: number;
  text: string;
  score: number;
}

const globalRef = globalThis as unknown as { __vectorStore?: VectorStore };

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirs() {
  await fs.mkdir(VECTOR_STORE_DIR, { recursive: true });
}

async function loadVectorStoreFromDisk(): Promise<VectorStore> {
  await ensureDirs();

  let metadata: MetadataRecord[] = [];
  let dimension = 0;
  let mode: EmbeddingMode = 'deterministic';

  if (await fileExists(METADATA_FILE)) {
    try {
      const raw = await fs.readFile(METADATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedMetadata>;
      if (Array.isArray(parsed.records)) {
        metadata = parsed.records;
      }
      if (typeof parsed.dimension === 'number' && Number.isFinite(parsed.dimension)) {
        dimension = parsed.dimension;
      }
      if (parsed.mode === 'provider' || parsed.mode === 'deterministic') {
        mode = parsed.mode;
      }
    } catch (error) {
      console.error('Failed to read vector metadata, starting fresh.', error);
    }
  }

  let index: IndexFlatIP | null = null;
  if (await fileExists(INDEX_FILE)) {
    try {
      const buffer = await fs.readFile(INDEX_FILE);
      index = IndexFlatIP.fromBuffer(buffer);
      if (!dimension) {
        dimension = index.getDimension();
      }
    } catch (error) {
      console.error('Failed to read FAISS index, ignoring existing file.', error);
      index = null;
    }
  }

  if (index && index.ntotal() !== metadata.length) {
    const total = index.ntotal();
    console.warn('Vector index and metadata length mismatch. Truncating metadata to index size.');
    metadata = metadata.slice(0, total);
  }

  return {
    index,
    metadata,
    dimension,
    mode,
    hashes: new Set(metadata.map((record) => record.textHash))
  };
}

async function getVectorStore(): Promise<VectorStore> {
  if (!globalRef.__vectorStore) {
    globalRef.__vectorStore = await loadVectorStoreFromDisk();
  }
  return globalRef.__vectorStore;
}

async function saveVectorStore(store: VectorStore) {
  await ensureDirs();

  const payload: PersistedMetadata = {
    dimension: store.dimension,
    mode: store.mode,
    records: store.metadata
  };

  await fs.writeFile(METADATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');

  if (store.index) {
    const buffer = store.index.toBuffer();
    await fs.writeFile(INDEX_FILE, buffer);
  } else if (await fileExists(INDEX_FILE)) {
    await fs.unlink(INDEX_FILE).catch(() => undefined);
  }

  globalRef.__vectorStore = store;
}

function hashText(text: string) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function clearVectorStoreCache() {
  delete globalRef.__vectorStore;
}

export async function flushVectorStore() {
  if (globalRef.__vectorStore) {
    await saveVectorStore(globalRef.__vectorStore);
  }
}

export async function indexSources(sources: string[]) {
  const store = await getVectorStore();
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

    for (const [chunkIndex, chunk] of parsed.chunks.entries()) {
      const textHash = hashText(chunk);
      if (store.hashes.has(textHash)) {
        skipped += 1;
        continue;
      }

      let embedding;
      try {
        embedding = await embedText(chunk);
      } catch (error) {
        console.error('Embedding failed for chunk', chunkIndex, error);
        skipped += 1;
        continue;
      }

      const vector = embedding.vector;
      if (!vector.length) {
        skipped += 1;
        continue;
      }

      if (!store.index) {
        store.index = new IndexFlatIP(vector.length);
        store.dimension = vector.length;
        store.mode = embedding.mode;
      } else {
        if (vector.length !== store.dimension) {
          throw new Error('Embedding dimension mismatch. Clear the vector store directory and re-index.');
        }
        if (embedding.mode !== store.mode) {
          throw new Error('Embedding mode changed. Clear the vector store directory before re-indexing.');
        }
      }

      const normalized = normalizeEmbedding(vector);
      store.index.add(Array.from(normalized));

      const record: MetadataRecord = {
        id: crypto.randomUUID(),
        source: parsed.source,
        chunkId: chunkIndex,
        text: chunk,
        textHash
      };

      store.metadata.push(record);
      store.hashes.add(textHash);
      indexed += 1;

      try {
        await prisma.docMeta.create({
          data: {
            source: parsed.source,
            chunkId: chunkIndex,
            textHash
          }
        });
      } catch {
        // ignore duplicates
      }
    }
  }

  await saveVectorStore(store);

  return { indexed, skipped, mode: store.mode };
}

export async function queryIndex(query: string, k = 5): Promise<RagMatch[]> {
  const store = await getVectorStore();
  if (!store.index || !store.metadata.length) {
    return [];
  }

  let embedding;
  try {
    embedding = await embedText(query, { preferredMode: store.mode });
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to compute query embedding.');
  }

  if (embedding.vector.length !== store.dimension) {
    throw new Error('Embedding dimension mismatch for query. Clear the vector store and rebuild.');
  }

  const normalized = normalizeEmbedding(embedding.vector);
  const limit = Math.max(1, Math.min(k, store.metadata.length));
  const results = store.index.search(Array.from(normalized), limit);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const matches: RagMatch[] = [];
  for (let index = 0; index < results.labels.length; index += 1) {
    const label = results.labels[index];
    if (label < 0) continue;
    const metadata = store.metadata[label];
    if (!metadata) continue;

    const baseScore = results.distances[index];
    const keywordBoost = terms.reduce((acc, term) => {
      return acc + (metadata.text.toLowerCase().includes(term) ? 0.05 : 0);
    }, 0);

    matches.push({
      source: metadata.source,
      chunkId: metadata.chunkId,
      text: metadata.text,
      score: baseScore + keywordBoost
    });
  }

  return matches
    .filter((match) => Number.isFinite(match.score))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
