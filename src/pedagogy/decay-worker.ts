import type pg from 'pg';
import { bandFor, decayedScore } from './decay-math.js';

/**
 * S4-T8 — Rolling decay chunk processor (Doc 04 §5.1, B-02 fix).
 *
 * Cursor-keyset pagination over stale learning_dna rows (500 per chunk),
 * ONE transaction per chunk, then the caller enqueues the next cursor.
 * Concurrency 2 lives in the BullMQ Worker wiring (deploy layer); this module
 * is the pure-ish DB processor so integration tests can drive it directly.
 *
 * Idempotency / kill-safety:
 *  - A chunk is all-or-nothing: a crash mid-chunk rolls back the whole tx,
 *    so replay applies decay exactly once per logical pass.
 *  - `last_decayed_at` guards re-entry: rows decayed within the last 24h are
 *    skipped even if the same cursor is replayed after a commit — a repeated
 *    chunk can never double-decay (structural, not procedural).
 */

export interface DecayChunkResult {
  processed: number;
  /** Last row id of the processed window; null when the scan is finished. */
  nextCursorId: string | null;
  finished: boolean;
}

const STALE_AFTER = '24 hours';

interface DnaRow {
  id: string;
  mastery_score: number;
  decay_rate: number;
  last_reviewed_at: Date;
}

/** Fetch one keyset window of stale rows. Exposed for test instrumentation. */
export async function fetchStaleChunk(
  client: pg.Client | pg.PoolClient,
  cursorId: string | null,
  batchSize: number
): Promise<DnaRow[]> {
  const res = await client.query<DnaRow>(
    `SELECT id, mastery_score, decay_rate, last_reviewed_at
       FROM learning_dna
      WHERE last_reviewed_at < now() - interval '${STALE_AFTER}'
        AND (last_decayed_at IS NULL OR last_decayed_at <= now() - interval '${STALE_AFTER}')
        AND ($1::uuid IS NULL OR id > $1::uuid)
      ORDER BY id ASC
      LIMIT $2`,
    [cursorId, batchSize]
  );
  return res.rows;
}

/**
 * Process exactly one chunk. Returns the next cursor; `finished: true` when
 * no further stale rows exist past it.
 */
export async function processDecayChunk(
  pool: pg.Pool,
  cursorId: string | null,
  batchSize = 500
): Promise<DecayChunkResult> {
  const client = await pool.connect();
  try {
    const rows = await fetchStaleChunk(client, cursorId, batchSize);
    if (rows.length === 0) {
      return { processed: 0, nextCursorId: null, finished: true };
    }

    await client.query('BEGIN');
    try {
      for (const row of rows) {
        const deltaDays = Math.max(
          0,
          (Date.now() - new Date(row.last_reviewed_at).getTime()) / 86_400_000
        );
        const score = decayedScore(row.mastery_score, row.decay_rate, deltaDays);
        const status = bandFor(score);
        await client.query(
          `UPDATE learning_dna
              SET mastery_score = $2, status = $3, last_decayed_at = now()
            WHERE id = $1`,
          [row.id, score, status]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }

    return { processed: rows.length, nextCursorId: rows[rows.length - 1]!.id, finished: false };
  } finally {
    client.release();
  }
}

/** Drain the whole backlog chunk-by-chunk (test + backfill convenience). */
export async function drainDecayBacklog(
  pool: pg.Pool,
  batchSize = 500
): Promise<{ chunks: number; processed: number }> {
  let cursor: string | null = null;
  let chunks = 0;
  let processed = 0;
  for (;;) {
    const res = await processDecayChunk(pool, cursor, batchSize);
    chunks++;
    processed += res.processed;
    if (res.finished) break;
    cursor = res.nextCursorId;
  }
  return { chunks, processed };
}
