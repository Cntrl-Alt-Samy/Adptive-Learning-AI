import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { parseCurriculum } from '@/src/curriculum/loader.js';

/** GET /api/subjects — subject picker reads curriculum docs server-side (F1). */
export function GET(): Response {
  const dir = path.join(process.cwd(), 'curricula');
  const subjects = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const result = parseCurriculum(readFileSync(path.join(dir, f), 'utf8'));
      if (!result.ok || result.doc === undefined) return null;
      return {
        id: result.doc.subject.id,
        title: result.doc.subject.title,
        category: result.doc.subject.category,
        conceptCount: result.doc.concepts.length
      };
    })
    .filter((s) => s !== null);
  return Response.json({ subjects });
}
