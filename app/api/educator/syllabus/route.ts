import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { verifySignedSession } from '@/lib/auth/session';

/**
 * GET /api/educator/syllabus — List all syllabus documents for the tenant.
 * Educator-only (INSTRUCTOR|ADMIN).
 */
export function GET(): Response {
  const docsDir = join(process.cwd(), 'syllabus-docs', 'records');
  if (!existsSync(docsDir)) {
    return Response.json({ documents: [] });
  }

  const files = readdirSync(docsDir).filter((f) => f.endsWith('.json'));
  const documents = files.map((f) => {
    const data = JSON.parse(readFileSync(join(docsDir, f), 'utf8'));
    return {
      id: data.id,
      title: data.title,
      subject: data.subject,
      examBoard: data.examBoard,
      stage: data.stage,
      fileName: data.fileName,
      fileSizeBytes: data.fileSizeBytes,
      pageCount: data.pageCount,
      chunkCount: data.chunkCount,
      status: data.status,
      sourceUrl: data.sourceUrl,
      processedAt: data.processedAt,
      createdAt: data.createdAt
    };
  });

  return Response.json({ documents });
}
