import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { verifySignedSession } from '@/lib/auth/session';
import { parseSyllabusBuffer } from '@/src/syllabus/parser.js';
import { chunkSyllabusText } from '@/src/syllabus/chunker.js';
import { ingestSyllabusChunks } from '@/src/syllabus/ingester.js';

/**
 * POST /api/educator/syllabus/upload — Upload and process a syllabus PDF.
 * Accepts multipart/form-data with a PDF file and metadata fields.
 * Educator-only (INSTRUCTOR|ADMIN).
 */
export async function POST(request: Request): Promise<Response> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const token = store.get('learnos_session')?.value ?? null;
  const session = verifySignedSession(token);

  if (!session || (session.role !== 'INSTRUCTOR' && session.role !== 'ADMIN')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const title = (formData.get('title') as string) || '';
    const subject = (formData.get('subject') as string) || '';
    const examBoard = (formData.get('examBoard') as string) || 'DfE';
    const stage = (formData.get('stage') as string) || 'gcse';

    if (!file || !title || !subject) {
      return Response.json(
        { error: 'Missing required fields: file, title, subject' },
        { status: 400 }
      );
    }

    if (file.type !== 'application/pdf') {
      return Response.json({ error: 'Only PDF files are supported' }, { status: 400 });
    }

    const MAX_SIZE = 20 * 1024 * 1024; // 20MB
    if (file.size > MAX_SIZE) {
      return Response.json({ error: 'File too large (max 20MB)' }, { status: 400 });
    }

    // Store file on disk
    const uploadsDir = join(process.cwd(), 'syllabus-docs', 'uploads');
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    const docId = randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFileName = `${docId}_${safeName}`;
    const filePath = join(uploadsDir, storedFileName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    writeFileSync(filePath, buffer);

    // Parse the PDF
    const parsed = await parseSyllabusBuffer(buffer, file.name);

    // Chunk the text
    const chunks = chunkSyllabusText(parsed.pages);

    // Store document record (we'll use a simple JSON store since DB may not be running)
    const docRecord = {
      id: docId,
      tenantId: session.tenantId,
      uploadedBy: session.userId,
      title,
      subject,
      examBoard,
      stage,
      fileName: file.name,
      filePath: storedFileName,
      fileSizeBytes: file.size,
      pageCount: parsed.pageCount,
      chunkCount: chunks.length,
      status: 'indexed' as 'indexed' | 'uploaded',
      sourceUrl: null as string | null,
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save document record
    const docsDir = join(process.cwd(), 'syllabus-docs', 'records');
    if (!existsSync(docsDir)) {
      mkdirSync(docsDir, { recursive: true });
    }
    writeFileSync(
      join(docsDir, `${docId}.json`),
      JSON.stringify(docRecord, null, 2)
    );

    // Ingest into Pinecone (gracefully handle missing API key)
    let pineconeResult = { upsertedCount: 0, namespace: '' };
    try {
      pineconeResult = await ingestSyllabusChunks(docId, subject, chunks, {
        examBoard,
        stage,
        sourceTitle: parsed.title
      });
    } catch (err) {
      console.warn('Pinecone ingestion skipped (no API key or unavailable):', (err as Error).message);
      docRecord.status = 'uploaded' as 'uploaded';
      writeFileSync(
        join(docsDir, `${docId}.json`),
        JSON.stringify({ ...docRecord, status: 'uploaded' as const, errorMessage: 'Pinecone unavailable' }, null, 2)
      );
    }

    return Response.json({
      document: docRecord,
      parsed: {
        title: parsed.title,
        pageCount: parsed.pageCount,
        chunkCount: chunks.length
      },
      ingested: pineconeResult
    });
  } catch (err) {
    console.error('Syllabus upload error:', err);
    return Response.json(
      { error: 'Failed to process syllabus document' },
      { status: 500 }
    );
  }
}
