import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { verifySignedSession } from '@/lib/auth/session';

/**
 * DELETE /api/educator/syllabus/[id] — Delete a syllabus document and its chunks.
 * Educator-only (INSTRUCTOR|ADMIN).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { cookies } = await import('next/headers');
  const store = await cookies();
  const token = store.get('learnos_session')?.value ?? null;
  const session = verifySignedSession(token);

  if (!session || (session.role !== 'INSTRUCTOR' && session.role !== 'ADMIN')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const docPath = join(process.cwd(), 'syllabus-docs', 'records', `${id}.json`);

  if (!existsSync(docPath)) {
    return Response.json({ error: 'Document not found' }, { status: 404 });
  }

  try {
    const doc = JSON.parse(readFileSync(docPath, 'utf8'));

    // Delete stored PDF
    const pdfPath = join(process.cwd(), 'syllabus-docs', 'uploads', doc.filePath);
    if (existsSync(pdfPath)) {
      unlinkSync(pdfPath);
    }

    // Delete record
    unlinkSync(docPath);

    return Response.json({ deleted: true, id });
  } catch (err) {
    console.error('Syllabus delete error:', err);
    return Response.json({ error: 'Failed to delete document' }, { status: 500 });
  }
}
