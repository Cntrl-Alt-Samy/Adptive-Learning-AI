import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadCurriculumFile } from '../../src/curriculum/loader.js';
// Static import: ensures `dotenv/config` side-effect runs before any test
// mutates process.env (dotenv never overrides existing variables).
import { getEmbeddingProvider } from '../../src/pinecone/embed.js';

const CURRICULA = join(process.cwd(), 'curricula');

describe('loader — file access', () => {
  it('loadCurriculumFile parses a real fixture from disk', () => {
    const result = loadCurriculumFile(join(CURRICULA, 'gcse_maths_edexcel.json'));
    expect(result.ok).toBe(true);
    expect(result.doc?.subject.id).toBe('gcse_maths_edexcel');
  });

  it('propagates filesystem errors for missing files', () => {
    expect(() => loadCurriculumFile(join(CURRICULA, 'does_not_exist.json'))).toThrow();
  });
});

describe('embeddings — default endpoint fallback', () => {
  let snapshot: NodeJS.ProcessEnv;

  beforeEach(() => {
    snapshot = { ...process.env };
    process.env.LEARNOS_EMBEDDINGS = '';
    process.env.OPENAI_API_KEY = 'k';
    delete process.env.OPENAI_BASE_URL;
  });

  afterEach(() => {
    process.env = snapshot;
    vi.unstubAllGlobals();
  });

  it('defaults to the OpenAI public API when OPENAI_BASE_URL unset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ embedding: [1] }] }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await getEmbeddingProvider().embed('x');
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://api.openai.com/v1/embeddings');
  });
});
