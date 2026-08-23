import { z } from 'zod';

/**
 * S1-T1 — Normalized SSE stream event contract (Doc 04 §6), versioned.
 * Every frame crossing the wire validates against this schema; malformed
 * upstream chunks degrade to typed `error` events, never raw crashes.
 */
export const STREAM_EVENT_SCHEMA_VERSION = 1 as const;

const baseEvent = { v: z.literal(STREAM_EVENT_SCHEMA_VERSION) };

export const TokenEventSchema = z.object({
  ...baseEvent,
  type: z.literal('token'),
  text: z.string()
});

export const CheckpointConfirmedEventSchema = z.object({
  ...baseEvent,
  type: z.literal('checkpoint_confirmed'),
  sessionId: z.string().uuid(),
  stepNumber: z.number().int().min(0),
  /** true when the unique-constraint idempotency key replayed an existing row */
  replayed: z.boolean(),
  statePayload: z.unknown()
});

export const ErrorEventSchema = z.object({
  ...baseEvent,
  type: z.literal('error'),
  code: z.string(),
  message: z.string(),
  retryable: z.boolean()
});

export const StreamEventSchema = z.discriminatedUnion('type', [
  TokenEventSchema,
  CheckpointConfirmedEventSchema,
  ErrorEventSchema
]);

export type TokenEvent = z.infer<typeof TokenEventSchema>;
export type CheckpointConfirmedEvent = z.infer<typeof CheckpointConfirmedEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;

/** Serialize one event into an SSE frame (`event:` + `data:`). */
export function formatSseFrame(event: StreamEvent): string {
  const parsed = StreamEventSchema.parse(event); // never emit unvalidated frames
  return `event: ${parsed.type}\ndata: ${JSON.stringify(parsed)}\n\n`;
}

/** Parse a wire frame back into a typed event; throws on contract violation. */
export function parseSseFrame(frame: string): StreamEvent {
  const lines = frame.split('\n');
  let eventName = '';
  let data = '';
  for (const line of lines) {
    if (line.startsWith('event: ')) eventName = line.slice('event: '.length);
    else if (line.startsWith('data: ')) data += line.slice('data: '.length);
  }
  if (!eventName || !data) throw new Error('Malformed SSE frame');
  const json: unknown = JSON.parse(data);
  const parsed = StreamEventSchema.parse(json);
  if (parsed.type !== eventName) throw new Error('SSE frame name/data mismatch');
  return parsed;
}
