import type pg from 'pg';

/**
 * S1-T6 Phase 1 — atomic checkpoint commit (B-01 / Doc 04 §6.1).
 *
 * One transaction per turn: append the session turn AND write the
 * state checkpoint. Idempotency key = UNIQUE(session_id, step_number);
 * duplicate commits no-op and report `replayed: true`.
 *
 * The sink interface keeps the streaming route testable without Postgres.
 */

export interface CommitTurnInput {
  sessionId: string;
  userId: string;
  stepNumber: number;
  activeMode: string;
  statePayload: unknown;
  userMessage: string;
  assistantResponse: string;
  latencyMs: number;
}

export interface CommitResult {
  committed: boolean;
  /** true when an identical (session_id, step_number) row already existed */
  replayed: boolean;
}

export interface CheckpointStore {
  commitCheckpoint(input: CommitTurnInput): Promise<CommitResult>;
  getLatestCheckpoint(sessionId: string): Promise<{ stepNumber: number; statePayload: unknown } | null>;
}

interface SessionLookupRow {
  session_exists: boolean;
  owner_user_id: string | null;
}

export class PgCheckpointStore implements CheckpointStore {
  constructor(private readonly pool: pg.Pool) {}

  async commitCheckpoint(input: CommitTurnInput): Promise<CommitResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Guard: session must exist; also pins the owning user for tenancy.
      const lookup = await client.query<SessionLookupRow>(
        `SELECT true AS session_exists, user_id AS owner_user_id FROM sessions WHERE id = $1 FOR UPDATE`,
        [input.sessionId]
      );
      const row = lookup.rows[0];
      if (!row?.session_exists) {
        throw new Error(`SESSION_NOT_FOUND:${input.sessionId}`);
      }

      // Idempotent checkpoint write — unique (session_id, step_number).
      const insert = await client.query<{ id: string | null; created_at: Date | null; xmax: number }>(
        `INSERT INTO session_checkpoints (session_id, step_number, active_mode, state_payload)
         VALUES ($1, $2, $3::ai_mode, $4::jsonb)
         ON CONFLICT (session_id, step_number) DO NOTHING
         RETURNING id`,
        [input.sessionId, input.stepNumber, input.activeMode, JSON.stringify(input.statePayload ?? {})]
      );
      const replayed = insert.rows.length === 0;

      // Append the transcript turn only on first commit (replays skip it).
      if (!replayed) {
        await client.query(
          `INSERT INTO session_turns (session_id, turn_index, user_message, assistant_response, latency_ms)
           SELECT $1,
                  COALESCE((SELECT max(turn_index) + 1 FROM session_turns WHERE session_id = $1), 0),
                  $2, $3, $4`,
          [input.sessionId, input.userMessage, input.assistantResponse, input.latencyMs]
        );
        // Touch learner activity cursor.
        await client.query(`UPDATE users SET last_active_at = now() WHERE id = $1`, [
          row.owner_user_id
        ]);
      }

      await client.query('COMMIT');
      return { committed: true, replayed };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getLatestCheckpoint(sessionId: string): Promise<{ stepNumber: number; statePayload: unknown } | null> {
    const res = await this.pool.query<{
      step_number: number;
      state_payload: unknown;
    }>(
      `SELECT step_number, state_payload FROM session_checkpoints
       WHERE session_id = $1 ORDER BY step_number DESC LIMIT 1`,
      [sessionId]
    );
    const row = res.rows[0];
    if (!row) return null;
    return { stepNumber: row.step_number, statePayload: row.state_payload };
  }
}

/** In-memory store for unit tests & offline dev. Mirrors idempotency semantics. */
export class InMemoryCheckpointStore implements CheckpointStore {
  private readonly rows = new Map<string, { stepNumber: number; statePayload: unknown }>();
  private readonly turns: CommitTurnInput[] = [];

  async commitCheckpoint(input: CommitTurnInput): Promise<CommitResult> {
    const key = `${input.sessionId}:${input.stepNumber}`;
    if (this.rows.has(key)) return { committed: true, replayed: true };
    this.rows.set(key, { stepNumber: input.stepNumber, statePayload: input.statePayload });
    this.turns.push(input);
    return { committed: true, replayed: false };
  }

  async getLatestCheckpoint(sessionId: string): Promise<{ stepNumber: number; statePayload: unknown } | null> {
    let latest: { stepNumber: number; statePayload: unknown } | null = null;
    for (const [key, value] of this.rows) {
      if (key.startsWith(`${sessionId}:`) && (!latest || value.stepNumber > latest.stepNumber)) {
        latest = value;
      }
    }
    return latest;
  }

  get committedTurns(): readonly CommitTurnInput[] {
    return this.turns;
  }
}
