import { describe, it, expect, afterEach } from 'vitest';
import { loadEnv, resetEnvCache } from '../../src/config/env.js';

describe('env config', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL };
    resetEnvCache();
  });

  it('applies the Pinecone index default and tolerates optional keys', () => {
    resetEnvCache();
    delete process.env.PINECONE_INDEX;
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    const env = loadEnv();
    expect(env.PINECONE_INDEX).toBe('learnos-curriculum-rag');
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('rejects an empty PINECONE_INDEX override and memoises success', () => {
    resetEnvCache();
    process.env.PINECONE_INDEX = '';
    expect(() => loadEnv()).toThrow();

    resetEnvCache();
    process.env.PINECONE_INDEX = 'custom-index';
    expect(loadEnv().PINECONE_INDEX).toBe('custom-index');
    // memoised: second call returns same object without re-parsing
    expect(loadEnv()).toBe(loadEnv());
  });
});
