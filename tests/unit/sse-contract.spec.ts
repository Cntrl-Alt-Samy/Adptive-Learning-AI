import { describe, it, expect } from 'vitest';
import {
  STREAM_EVENT_SCHEMA_VERSION,
  formatSseFrame,
  parseSseFrame,
  StreamEventSchema,
  TokenEventSchema,
  CheckpointConfirmedEventSchema,
  ErrorEventSchema
} from '../../src/api/sse/events.js';

const token = { v: 1 as const, type: 'token' as const, text: 'hello' };
const confirmed = {
  v: 1 as const,
  type: 'checkpoint_confirmed' as const,
  sessionId: '11111111-1111-4111-8111-111111111111',
  stepNumber: 3,
  replayed: false,
  statePayload: { step: 3, status: 'calibrated' }
};
const error = {
  v: 1 as const,
  type: 'error' as const,
  code: 'MODEL_UNAVAILABLE',
  message: 'all routes failed',
  retryable: true
};

describe('sse.contract gate', () => {
  it('event schema is versioned', () => {
    expect(STREAM_EVENT_SCHEMA_VERSION).toBe(1);
    for (const e of [token, confirmed, error]) {
      expect(StreamEventSchema.parse(e).v).toBe(1);
    }
  });

  it('format -> parse round-trips all three event types byte-stable', () => {
    for (const e of [token, confirmed, error]) {
      const frame = formatSseFrame(e as never);
      expect(frame.startsWith(`event: ${e.type}\ndata: `)).toBe(true);
      expect(frame.endsWith('\n\n')).toBe(true);
      const parsed = parseSseFrame(frame);
      expect(parsed).toEqual(e);
    }
  });

  it('rejects unversioned / wrong-version frames', () => {
    expect(TokenEventSchema.safeParse({ type: 'token', text: 'x' }).success).toBe(false);
    expect(TokenEventSchema.safeParse({ v: 99, type: 'token', text: 'x' }).success).toBe(false);
  });

  it('rejects malformed frames (missing event/data lines, mismatched name)', () => {
    expect(() => parseSseFrame('data: {"v":1}')).toThrow();
    const frame = formatSseFrame(token).replace('event: token', 'event: error');
    expect(() => parseSseFrame(frame)).toThrow(/mismatch/);
  });

  it('rejects invalid payloads per type', () => {
    expect(
      CheckpointConfirmedEventSchema.safeParse({ ...confirmed, sessionId: 'not-a-uuid' }).success
    ).toBe(false);
    expect(CheckpointConfirmedEventSchema.safeParse({ ...confirmed, stepNumber: -1 }).success).toBe(false);
    expect(ErrorEventSchema.safeParse({ ...error, retryable: 'yes' }).success).toBe(false);
    expect(StreamEventSchema.safeParse({ v: 1, type: 'unknown_kind' }).success).toBe(false);
  });
});
