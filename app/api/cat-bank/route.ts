import { readFileSync } from 'node:fs';
import path from 'node:path';

import { loadCurriculumFile } from '@/src/curriculum/loader.js';

/**
 * GET /api/cat-bank?subjectId=… — CAT item bank (F2). Two Rasch items per
 * concept (at difficulty b and b+0.5) derived deterministically from the
 * validated curriculum doc; the CatEngine itself runs client-side (pure).
 */
export function GET(req: Request): Response {
  const url = new URL(req.url);
  const subjectId = url.searchParams.get('subjectId') ?? '';
  if (!/^[\w-]+$/.test(subjectId)) {
    return Response.json({ error: 'INVALID_SUBJECT' }, { status: 400 });
  }
  const file = path.join(process.cwd(), 'curricula', `${subjectId}.json`);
  const loaded = loadCurriculumFile(file);
  if (!loaded.ok || loaded.doc === undefined) {
    return Response.json({ error: 'CURRICULUM_NOT_FOUND' }, { status: 404 });
  }
  const items = loaded.doc.concepts.flatMap((c) => [
    { itemId: `${c.id}#a`, conceptId: c.id, difficulty: c.difficultyLevel },
    { itemId: `${c.id}#b`, conceptId: c.id, difficulty: Math.min(10, c.difficultyLevel + 0.5) }
  ]);
  return Response.json({ subjectId, items, conceptTitles: Object.fromEntries(loaded.doc.concepts.map((c) => [c.id, c.title])) });
}
