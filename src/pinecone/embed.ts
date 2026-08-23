import 'dotenv/config';

/**
 * Embedding provider for curriculum ingestion (Doc 05 §9: text-embedding-3-small,
 * 1536-d). Talks to any OpenAI-compatible /embeddings endpoint via OPENAI_BASE_URL.
 *
 * LEARNOS_EMBEDDINGS=hash selects a deterministic local hashing embedding —
 * DEV/CI ONLY so DAG→index pipelines are exercisable without paid API calls.
 */
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

function hashEmbedding(text: string): number[] {
  // Deterministic feature-hashing fallback (unit-test/dev only).
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().split(/\s+/);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBEDDING_DIMENSIONS;
    vector[idx] = (vector[idx] ?? 0) + (h % 2 === 0 ? 1 : -1);
  }
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) || 1;
  return vector.map((v) => v / norm);
}

class OpenAICompatibleEmbeddings implements EmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({ model: this.model, input: text, dimensions: EMBEDDING_DIMENSIONS })
    });
    if (!response.ok) {
      throw new Error(`Embeddings API ${response.status}: ${await response.text()}`);
    }
    const payload = (await response.json()) as { data?: Array<{ embedding?: number[] }> };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new Error('Embeddings API returned no embedding');
    return embedding;
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (process.env.LEARNOS_EMBEDDINGS === 'hash') {
    return { embed: (t) => Promise.resolve(hashEmbedding(t)) };
  }
  const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing for embeddings provider');
  return new OpenAICompatibleEmbeddings(baseUrl, apiKey, process.env.LEARNOS_EMBEDDING_MODEL ?? 'text-embedding-3-small');
}
