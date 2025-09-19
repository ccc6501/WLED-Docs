import crypto from 'node:crypto';
import { z } from 'zod';

export type EmbeddingMode = 'provider' | 'deterministic';

export interface EmbeddingResult {
  vector: Float32Array;
  mode: EmbeddingMode;
  provider: string;
}

interface EmbedOptions {
  preferredMode?: EmbeddingMode;
}

interface ProviderConfig {
  name: string;
  baseUrl: string;
  key: string;
  extraHeaders?: Record<string, string>;
}

const EmbeddingResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number())
    })
  )
});

function getFallbackDimension() {
  const raw = process.env.EMBEDDINGS_FALLBACK_DIM;
  const parsed = raw ? Number(raw) : 384;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 384;
  }
  return Math.floor(parsed);
}

function deterministicEmbedding(text: string, dimension = getFallbackDimension()): Float32Array {
  const vector = new Float32Array(dimension);
  for (let index = 0; index < dimension; index += 1) {
    const hash = crypto.createHash('sha256').update(`${index}:${text}`).digest();
    vector[index] = hash.readInt32BE(0) / 2 ** 31;
  }
  return vector;
}

function resolveProvider(): ProviderConfig | null {
  const explicitBase = process.env.EMBEDDINGS_API_BASE?.trim();
  const explicitKey = process.env.EMBEDDINGS_API_KEY?.trim();
  if (explicitBase && explicitKey) {
    return {
      name: 'custom',
      baseUrl: explicitBase,
      key: explicitKey
    };
  }

  const genesisBase = process.env.GENESIS_API_BASE?.trim();
  const genesisKey = process.env.GENESIS_API_KEY?.trim();
  if (genesisBase && genesisKey) {
    return {
      name: 'genesis',
      baseUrl: genesisBase,
      key: genesisKey
    };
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    return {
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      key: openaiKey
    };
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (openrouterKey) {
    return {
      name: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      key: openrouterKey,
      extraHeaders: {
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'MONKY Ops Dashboard'
      }
    };
  }

  return null;
}

async function tryProviderEmbedding(text: string, force: boolean): Promise<EmbeddingResult | null> {
  const provider = resolveProvider();
  if (!provider) {
    if (force) {
      throw new Error('Embedding provider is not configured.');
    }
    return null;
  }

  const trimmedBase = provider.baseUrl.replace(/\/$/, '');
  const endpoint = `${trimmedBase}/embeddings`;
  const model = process.env.EMBEDDINGS_MODEL || 'text-embedding-3-small';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.key}`,
        ...(provider.extraHeaders ?? {})
      },
      body: JSON.stringify({
        model,
        input: text
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Embedding provider error (${provider.name}): ${response.status} ${errorText}`.trim());
    }

    const payload = EmbeddingResponseSchema.parse(await response.json());
    const embedding = payload.data[0]?.embedding ?? [];
    if (!embedding.length) {
      throw new Error('Embedding provider returned an empty vector.');
    }

    return {
      vector: Float32Array.from(embedding),
      mode: 'provider',
      provider: provider.name
    };
  } catch (error) {
    if (force) {
      throw error instanceof Error ? error : new Error('Embedding provider failed.');
    }
    console.error('Embedding provider error', error);
    return null;
  }
}

export async function embedText(text: string, options: EmbedOptions = {}): Promise<EmbeddingResult> {
  const trimmed = text.length > 16000 ? text.slice(0, 16000) : text;
  const preferred = options.preferredMode;

  if (!trimmed.trim()) {
    return {
      vector: deterministicEmbedding('', getFallbackDimension()),
      mode: preferred ?? 'deterministic',
      provider: 'deterministic-hash'
    };
  }

  if (preferred === 'deterministic') {
    return {
      vector: deterministicEmbedding(trimmed),
      mode: 'deterministic',
      provider: 'deterministic-hash'
    };
  }

  const providerResult = await tryProviderEmbedding(trimmed, preferred === 'provider');
  if (providerResult) {
    return providerResult;
  }

  if (preferred === 'provider') {
    throw new Error('Unable to compute embeddings with the configured provider.');
  }

  return {
    vector: deterministicEmbedding(trimmed),
    mode: 'deterministic',
    provider: 'deterministic-hash'
  };
}

export function normalizeEmbedding(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let index = 0; index < vector.length; index += 1) {
    norm += vector[index] * vector[index];
  }
  if (!norm) {
    return Float32Array.from(vector);
  }
  const factor = 1 / Math.sqrt(norm);
  const normalized = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) {
    normalized[index] = vector[index] * factor;
  }
  return normalized;
}

export function deterministicEmbeddingVector(text: string): Float32Array {
  return deterministicEmbedding(text);
}
