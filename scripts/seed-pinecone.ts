#!/usr/bin/env tsx
/**
 * S0-T7 — Seed Pinecone with the three subject fixtures (Doc 05 §9).
 *
 *   npx tsx scripts/seed-pinecone.ts [--sanity-query]
 *
 * Validates each curriculum (7-step DAG pipeline) before any upsert; aborts
 * the whole run on the first invalid fixture. Pass --sanity-query to verify
 * top-3 retrieval per subject after seeding.
 */
import 'dotenv/config';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCurriculumFile } from '../src/curriculum/loader.js';
import { validateCurriculum } from '../src/curriculum/dag-validator.js';
import { documentToChunkVectors } from '../src/pinecone/chunking.js';
import { getPineconeIndex } from '../src/pinecone/client.js';
import { getEmbeddingProvider } from '../src/pinecone/embed.js';

const CURRICULA_DIR = 'curricula';

async function main(): Promise<number> {
  const sanity = process.argv.includes('--sanity-query');
  const files = readdirSync(CURRICULA_DIR)
    .filter((f) => f.endsWith('.json') && !f.endsWith('.malformed.json'))
    .sort()
    .map((f) => join(CURRICULA_DIR, f));

  if (files.length === 0) {
    console.error(`No curricula found in ${CURRICULA_DIR}`);
    return 3;
  }

  const embedder = getEmbeddingProvider();
  const index = await getPineconeIndex();
  let totalChunks = 0;

  for (const file of files) {
    const loaded = loadCurriculumFile(file);
    if (!loaded.ok || !loaded.doc) {
      console.error(`${file}: schema invalid — aborting seed`);
      return 1;
    }
    const result = validateCurriculum(loaded.doc);
    if (!result.valid) {
      console.error(`${file}: DAG invalid — ${result.errors.map((e) => e.message).join('; ')}`);
      return 1;
    }

    const vectors = documentToChunkVectors(loaded.doc);
    const batchSize = 100;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = [];
      for (const v of vectors.slice(i, i + batchSize)) {
        batch.push({ id: v.id, values: await embedder.embed(v.metadata.text), metadata: v.metadata });
      }
      await index.upsert(batch);
    }
    totalChunks += vectors.length;
    console.log(`✓ seeded ${loaded.doc.subject.id}: ${vectors.length} chunks`);
  }

  if (sanity) {
    for (const file of files) {
      const loaded = loadCurriculumFile(file);
      if (!loaded.ok || !loaded.doc) continue;
      const probe = loaded.doc.concepts[0]?.title ?? 'foundations';
      const vector = await embedder.embed(probe);
      const res = await index.query({
        vector,
        topK: 3,
        includeMetadata: true,
        filter: { subject_id: loaded.doc.subject.id }
      });
      const hits = res.matches?.map((m) => m.metadata?.concept_id).join(', ');
      console.log(`  top-3 [${loaded.doc.subject.id}] probe='${probe}' -> ${hits}`);
    }
  }

  console.log(`SEED COMPLETE ✓ ${totalChunks} chunks across ${files.length} subjects`);
  return 0;
}

process.exitCode = await main().catch((err: Error) => {
  console.error(`Seed failed: ${err.message}`);
  return 2;
});
