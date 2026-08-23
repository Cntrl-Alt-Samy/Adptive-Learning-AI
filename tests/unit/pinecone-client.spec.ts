import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * S0-T7 index bootstrap — the Pinecone SDK is mocked; we verify OUR wiring
 * (index name defaulting, serverless spec, readiness polling) not theirs.
 */
const listIndexes = vi.fn();
const createIndex = vi.fn();
const describeIndex = vi.fn();
const indexHandle = vi.fn();

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn().mockImplementation(() => ({ listIndexes, createIndex, describeIndex, index: indexHandle }))
}));

import { ensureCurriculumIndex, getPineconeClient, getPineconeIndex, INDEX_DIMENSION } from '../../src/pinecone/client.js';

describe('pinecone client bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PINECONE_INDEX = 'learnos-curriculum-rag';
    delete process.env.PINECONE_API_KEY;
  });

  it('getPineconeClient fails fast without an API key', () => {
    expect(() => getPineconeClient()).toThrow(/PINECONE_API_KEY/);
  });

  it('creates a serverless cosine/1536 index in eu-west-1 when absent', async () => {
    process.env.PINECONE_API_KEY = 'k';
    listIndexes.mockResolvedValue({ indexes: [] });
    describeIndex.mockResolvedValue({ status: { ready: true } });

    const name = await ensureCurriculumIndex();

    expect(name).toBe('learnos-curriculum-rag');
    expect(INDEX_DIMENSION).toBe(1536);
    expect(createIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'learnos-curriculum-rag',
        dimension: 1536,
        metric: 'cosine',
        spec: { serverless: { cloud: 'aws', region: 'eu-west-1' } }
      })
    );
  });

  it('skips creation when the index already exists', async () => {
    process.env.PINECONE_API_KEY = 'k';
    listIndexes.mockResolvedValue({
      indexes: [{ name: 'learnos-curriculum-rag' }, { name: 'other' }]
    });

    const name = await ensureCurriculumIndex();
    expect(name).toBe('learnos-curriculum-rag');
    expect(createIndex).not.toHaveBeenCalled();
  });

  it('polls describeIndex until the serverless index reports ready', async () => {
    process.env.PINECONE_API_KEY = 'k';
    listIndexes.mockResolvedValue({ indexes: [] });
    describeIndex
      .mockResolvedValueOnce({ status: { ready: false } })
      .mockResolvedValue({ status: { ready: true } });

    await ensureCurriculumIndex('poll-index');
    expect(describeIndex.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('getPineconeIndex ensures the index then returns the SDK handle', async () => {
    process.env.PINECONE_API_KEY = 'k';
    process.env.PINECONE_INDEX = 'learnos-curriculum-rag';
    listIndexes.mockResolvedValue({ indexes: [{ name: 'learnos-curriculum-rag' }] });
    indexHandle.mockReturnValue({ upsert: vi.fn() });

    const handle = await getPineconeIndex();
    expect(handle).toEqual({ upsert: expect.anything() });
    expect(indexHandle).toHaveBeenCalledWith('learnos-curriculum-rag');
    expect(createIndex).not.toHaveBeenCalled();
  });
});
