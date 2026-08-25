#!/usr/bin/env tsx
/**
 * ingest-syllabus.ts — Batch ingest pre-downloaded DfE GCSE syllabus PDFs.
 *
 * Usage:
 *   npx tsx scripts/ingest-syllabus.ts                    # Ingest all PDFs in syllabus-docs/
 *   npx tsx scripts/ingest-syllabus.ts --file maths.pdf   # Ingest a single file
 *   npx tsx scripts/ingest-syllabus.ts --dry-run           # Parse + chunk without Pinecone upsert
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseSyllabusBuffer } from '../src/syllabus/parser.js';
import { chunkSyllabusText } from '../src/syllabus/chunker.js';

const PDF_DIR = join(process.cwd(), 'syllabus-docs');
const RECORDS_DIR = join(PDF_DIR, 'records');

// Map of known DfE PDFs to their metadata
const KNOWN_SYLLABI: Record<string, { title: string; subject: string; examBoard: string }> = {
  'gcse-mathematics.pdf': { title: 'GCSE Mathematics Subject Content', subject: 'Mathematics', examBoard: 'DfE' },
  'gcse-english-language.pdf': { title: 'GCSE English Language Subject Content', subject: 'English Language', examBoard: 'DfE' },
  'gcse-english-literature.pdf': { title: 'GCSE English Literature Subject Content', subject: 'English Literature', examBoard: 'DfE' },
  'gcse-combined-science.pdf': { title: 'GCSE Combined Science Subject Content', subject: 'Combined Science', examBoard: 'DfE' },
  'gcse-geography.pdf': { title: 'GCSE Geography Subject Content', subject: 'Geography', examBoard: 'DfE' },
  'gcse-history.pdf': { title: 'GCSE History Subject Content', subject: 'History', examBoard: 'DfE' },
  'gcse-economics.pdf': { title: 'GCSE Economics Subject Content', subject: 'Economics', examBoard: 'DfE' }
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.indexOf('--file');
  const targetFile = fileArg >= 0 ? args[fileArg + 1] : null;

  if (!existsSync(PDF_DIR)) {
    console.error(`Syllabus directory not found: ${PDF_DIR}`);
    process.exit(1);
  }

  const files = readdirSync(PDF_DIR).filter((f) => f.endsWith('.pdf'));
  const toProcess = targetFile ? files.filter((f) => f === targetFile) : files;

  if (toProcess.length === 0) {
    console.error('No PDF files found to process.');
    process.exit(1);
  }

  console.log(`\nSyllabus Ingestion Pipeline`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no Pinecone upsert)' : 'FULL (parse + embed + upsert)'}`);
  console.log(`Files to process: ${toProcess.length}\n`);

  if (!existsSync(RECORDS_DIR)) {
    mkdirSync(RECORDS_DIR, { recursive: true });
  }

  for (const fileName of toProcess) {
    console.log(`\n--- Processing: ${fileName} ---`);

    const known = KNOWN_SYLLABI[fileName];
    const filePath = join(PDF_DIR, fileName);
    const buffer = readFileSync(filePath);

    // Parse
    console.log('  Parsing PDF...');
    const parsed = await parseSyllabusBuffer(buffer, fileName);
    console.log(`  Title: ${parsed.title}`);
    console.log(`  Pages: ${parsed.pageCount}`);
    console.log(`  Text length: ${parsed.text.length} chars`);

    // Chunk
    console.log('  Chunking text...');
    const chunks = chunkSyllabusText(parsed.pages);
    console.log(`  Chunks: ${chunks.length}`);
    console.log(`  Avg chunk size: ${Math.round(chunks.reduce((s, c) => s + c.text.length, 0) / chunks.length)} chars`);

    // Create record
    const docId = randomUUID();
    const docRecord = {
      id: docId,
      tenantId: '00000000-0000-0000-0000-000000000000',
      uploadedBy: '00000000-0000-0000-0000-000000000000',
      title: known?.title ?? parsed.title,
      subject: known?.subject ?? fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' '),
      examBoard: known?.examBoard ?? 'DfE',
      stage: 'gcse',
      fileName,
      filePath: fileName,
      fileSizeBytes: buffer.length,
      pageCount: parsed.pageCount,
      chunkCount: chunks.length,
      status: dryRun ? 'uploaded' : 'indexed',
      sourceUrl: `https://www.gov.uk/government/collections/gcse-subject-content`,
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    writeFileSync(join(RECORDS_DIR, `${docId}.json`), JSON.stringify(docRecord, null, 2));
    console.log(`  Record saved: ${docId}.json`);

    // Pinecone ingestion (skip in dry-run mode or if no API key)
    if (!dryRun && process.env.PINECONE_API_KEY) {
      try {
        const { ingestSyllabusChunks } = await import('../src/syllabus/ingester.js');
        const result = await ingestSyllabusChunks(docId, docRecord.subject, chunks, {
          examBoard: docRecord.examBoard,
          stage: docRecord.stage,
          sourceTitle: parsed.title
        });
        console.log(`  Pinecone: ${result.upsertedCount} vectors upserted to namespace "${result.namespace}"`);
      } catch (err) {
        console.warn(`  Pinecone ingestion failed: ${(err as Error).message}`);
        docRecord.status = 'uploaded';
        writeFileSync(join(RECORDS_DIR, `${docId}.json`), JSON.stringify(docRecord, null, 2));
      }
    } else if (dryRun) {
      console.log('  [Dry run] Skipping Pinecone ingestion');
    } else {
      console.log('  [No API key] Skipping Pinecone ingestion');
    }

    console.log(`  Done: ${docRecord.title}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Ingestion complete. ${toProcess.length} document(s) processed.`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
