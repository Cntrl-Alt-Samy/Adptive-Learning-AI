import { generateUniqueQuestions, type UniquenessRegistry } from '@/src/pedagogy/practice.js';

/**
 * POST /api/practice — tier-badged questions (F7) with the rolling 30-day
 * uniqueness registry living server-side so every client shares one window.
 */

interface Entry {
  expiresAt: number;
}

class MemoryUniquenessRegistry implements UniquenessRegistry {
  private readonly store = new Map<string, Entry>();

  async has(hash: string): Promise<boolean> {
    const hit = this.store.get(hash);
    if (hit === undefined) return false;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(hash);
      return false;
    }
    return true;
  }

  async add(hash: string, ttlSeconds: number): Promise<void> {
    this.store.set(hash, { expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

const registry = new MemoryUniquenessRegistry();

export async function POST(req: Request): Promise<Response> {
  let body: { conceptId?: unknown; count?: unknown; seed?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const conceptId = typeof body.conceptId === 'string' && body.conceptId.length > 0 ? body.conceptId : null;
  if (conceptId === null) return Response.json({ error: 'CONCEPT_REQUIRED' }, { status: 400 });

  try {
    const questions = await generateUniqueQuestions(
      registry,
      { conceptId, count: typeof body.count === 'number' ? body.count : 3 },
      typeof body.seed === 'number' ? body.seed : 7
    );
    return Response.json({ questions });
  } catch {
    // F7.1 — 30-day uniqueness notice when the registry rejects.
    return Response.json(
      {
        error: 'UNIQUENESS_WINDOW',
        message:
          'All fresh question variants for this concept were served within the last 30 days. Review your earlier answers instead.'
      },
      { status: 409 }
    );
  }
}
