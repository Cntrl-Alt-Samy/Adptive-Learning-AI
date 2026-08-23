import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

/**
 * S0-T7 — Pinecone serverless index bootstrap (Doc 05 §9).
 * Index: learnos-curriculum-rag · 1536-d (text-embedding-3-small) · cosine
 * · AWS eu-west-1 (UK region alignment).
 */
export const INDEX_DIMENSION = 1536;

export function getPineconeClient(): Pinecone {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is not configured');
  }
  return new Pinecone({ apiKey });
}

export async function ensureCurriculumIndex(indexName = process.env.PINECONE_INDEX ?? 'learnos-curriculum-rag'): Promise<string> {
  const pc = getPineconeClient();
  const existing = await pc.listIndexes();
  if (existing.indexes?.some((idx) => idx.name === indexName)) {
    return indexName;
  }
  await pc.createIndex({
    name: indexName,
    dimension: INDEX_DIMENSION,
    metric: 'cosine',
    spec: {
      serverless: {
        cloud: 'aws',
        region: 'eu-west-1'
      }
    }
  });
  // Serverless indexes initialise asynchronously; block until ready for upserts.
  let ready = false;
  while (!ready) {
    const desc = await pc.describeIndex(indexName);
    ready = desc.status?.ready === true;
    if (!ready) await new Promise((r) => setTimeout(r, 2000));
  }
  return indexName;
}

export async function getPineconeIndex() {
  await ensureCurriculumIndex();
  const pc = getPineconeClient();
  return pc.index(process.env.PINECONE_INDEX ?? 'learnos-curriculum-rag');
}
