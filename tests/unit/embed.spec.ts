import { describe, it, expect, afterEach, vi } from 'vitest';
import { EMBEDDING_DIMENSIONS, getEmbeddingProvider } from '../../src/pinecone/embed.js';

describe('embedding provider', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    vi.unstubAllGlobals();
  });

  it('hash provider is deterministic and unit-norm over 1536 dims', async () => {
    process.env.LEARNOS_EMBEDDINGS = 'hash';
    const provider = getEmbeddingProvider();
    const a = await provider.embed('quadratic factoring');
    const b = await provider.embed('quadratic factoring');
    const c = await provider.embed('photosynthesis');
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
    expect(a).toHaveLength(1536);
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
    const norm = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('OpenAI-compatible provider posts to /embeddings with bearer auth', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example/v1/';
    process.env.OPENAI_API_KEY = 'test-key-123';
    process.env.LEARNOS_EMBEDDING_MODEL = 'text-embedding-3-small';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const vec = await getEmbeddingProvider().embed('hello world');
    expect(vec).toEqual([0.1, 0.2]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://gateway.example/v1/embeddings');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key-123');
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'text-embedding-3-small',
      input: 'hello world',
      dimensions: 1536
    });
  });

  it('surfaces non-200 responses as errors', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example/v1';
    process.env.OPENAI_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
    await expect(getEmbeddingProvider().embed('x')).rejects.toThrow(/429/);
  });

  it('rejects malformed embedding payloads', async () => {
    process.env.OPENAI_BASE_URL = 'https://gateway.example/v1';
    process.env.OPENAI_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }))
    );
    await expect(getEmbeddingProvider().embed('x')).rejects.toThrow(/no embedding/i);
  });

  it('throws when no API key configured', () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.LEARNOS_EMBEDDINGS;
    expect(() => getEmbeddingProvider()).toThrow(/OPENAI_API_KEY/);
  });
});
