/**
 * S3-T5/S3-T6 — Reconnect & resume primitives (Doc 04 §13.2, §11 fallbacks).
 * Pure state machines consumed by the UI layer.
 */

export class BackoffSchedule {
  private attempt = 0;
  constructor(
    private readonly baseMs: number = 500,
    private readonly maxMs: number = 8_000
  ) {}

  /** Exponential backoff with cap; resets on successful connection. */
  next(): number {
    const delay = Math.min(this.maxMs, this.baseMs * 2 ** this.attempt);
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }

  get attempts(): number {
    return this.attempt;
  }
}

export type ResumeEvent =
  | { kind: 'token'; sessionId: string; stepNumber?: number }
  | { kind: 'checkpoint_confirmed'; sessionId: string; stepNumber: number };

/**
 * Buffers events between confirmed checkpoints. After a socket loss the UI
 * hydrates transcript/HUD from the last `checkpoint_confirmed` only —
 * server is source of truth (B-01 semantics on the client side).
 */
export class SessionResumeBuffer {
  private unconfirmed: ResumeEvent[] = [];
  private lastConfirmedStep = -1;

  push(event: ResumeEvent): void {
    if (event.kind === 'checkpoint_confirmed' && event.sessionId !== '') {
      this.lastConfirmedStep = event.stepNumber;
      this.unconfirmed = []; // everything before the checkpoint is durable server-side
      return;
    }
    this.unconfirmed.push(event);
  }

  /** State snapshot to rehydrate from after reconnect. */
  hydrate(): { lastConfirmedStep: number; lostUnconfirmedEvents: number } {
    const lost = this.unconfirmed.length;
    this.unconfirmed = [];
    return { lastConfirmedStep: this.lastConfirmedStep, lostUnconfirmedEvents: lost };
  }

  get confirmedStep(): number {
    return this.lastConfirmedStep;
  }
}
