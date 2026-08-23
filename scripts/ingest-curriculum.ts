#!/usr/bin/env tsx
/**
 * S0-T6 — Curriculum ingestion CLI (Doc 04 §12.2 / Doc 07 TASK 1.3).
 *
 * Usage:
 *   npx tsx scripts/ingest-curriculum.ts --file=./curricula/gcse_maths_edexcel.json [--validate-dag] [--index] [--json]
 *
 * Pipeline: parse → validate (7-step DAG pipeline) → optionally index to Pinecone.
 * `--validate-dag` runs dry by default; nothing is written unless --index is passed.
 *
 * Exit codes:
 *   0 — success (validated, and indexed when --index)
 *   1 — validation failure
 *   2 — indexing failure
 *   3 — usage error
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { loadCurriculumFile } from '../src/curriculum/loader.js';
import { validateCurriculum } from '../src/curriculum/dag-validator.js';
import { documentToChunkVectors } from '../src/pinecone/chunking.js';

const EXIT_OK = 0;
const EXIT_VALIDATION = 1;
const EXIT_INDEXING = 2;
const EXIT_USAGE = 3;

interface CliArgs {
  file?: string;
  validateDag: boolean;
  index: boolean;
  json: boolean;
  report?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { validateDag: false, index: false, json: false };
  for (const arg of argv) {
    if (arg.startsWith('--file=')) args.file = arg.slice('--file='.length);
    else if (arg.startsWith('--report=')) args.report = arg.slice('--report='.length);
    else if (arg === '--validate-dag') args.validateDag = true;
    else if (arg === '--index') args.index = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: ingest-curriculum.ts --file=<path> [--validate-dag] [--index] [--json] [--report=<path>]');
      process.exit(EXIT_USAGE);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(EXIT_USAGE);
    }
  }
  return args;
}

function printReport(subjectId: string, result: ReturnType<typeof validateCurriculum>): void {
  const { errors, warnings, stats } = result;
  console.log(`\n=== LearnOS curriculum validation — ${subjectId} ===`);
  console.log(
    `concepts=${stats.conceptCount} edges=${stats.edgeCount} checked in ${stats.durationMs.toFixed(1)}ms`
  );
  for (const issue of errors) {
    console.error(`  [${issue.code}] ${issue.message}`);
  }
  for (const warning of warnings) {
    console.warn(`  [${warning.code}] ${warning.message}`);
  }
  console.log(result.valid ? `RESULT: VALID ✓` : `RESULT: INVALID ✗ (${errors.length} error(s))`);
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('Missing required --file=<path>');
    return EXIT_USAGE;
  }

  const loaded = loadCurriculumFile(args.file);
  if (!loaded.ok || !loaded.doc) {
    for (const issue of loaded.issues) {
      console.error(`  [${issue.code}] ${issue.message}`);
    }
    console.error('RESULT: INVALID ✗ (schema)');
    return EXIT_VALIDATION;
  }

  const doc = loaded.doc;
  const result = validateCurriculum(doc);
  if (args.json) {
    console.log(JSON.stringify({ subject: doc.subject.id, ...result }, null, 2));
  } else {
    printReport(doc.subject.id, result);
  }

  // Persist a machine-readable report when requested (CI artefacts).
  if (args.report) {
    try {
      writeFileSync(args.report, JSON.stringify({ subject: doc.subject.id, valid: result.valid, errors: result.errors, warnings: result.warnings }, null, 2));
    } catch {
      // Report persistence is best-effort only.
    }
  }

  if (!result.valid) return EXIT_VALIDATION;

  if (args.index) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      console.error('PINECONE_API_KEY missing — cannot index');
      return EXIT_INDEXING;
    }
    try {
      const { getPineconeIndex } = await import('../src/pinecone/client.js');
      const { getEmbeddingProvider } = await import('../src/pinecone/embed.js');
      const embedder = getEmbeddingProvider();
      const vectors = documentToChunkVectors(doc);
      const index = await getPineconeIndex();
      const batchSize = 100;
      let upserted = 0;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = [];
        for (const v of vectors.slice(i, i + batchSize)) {
          batch.push({ id: v.id, values: await embedder.embed(v.metadata.text), metadata: v.metadata });
        }
        await index.upsert(batch);
        upserted += batch.length;
        console.log(`  upserted ${upserted}/${vectors.length}`);
      }
      console.log(`INDEXED ✓ ${vectors.length} chunks into '${process.env.PINECONE_INDEX ?? 'learnos-curriculum-rag'}'`);
    } catch (err) {
      console.error(`INDEXING FAILED ✗ ${(err as Error).message}`);
      return EXIT_INDEXING;
    }
  } else if (!args.json && !args.validateDag) {
    console.log('(dry run — pass --index to upsert to Pinecone)');
  }

  return EXIT_OK;
}

process.exitCode = await main();
