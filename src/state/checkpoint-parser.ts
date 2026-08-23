import { StateCheckpointSchema, type StateCheckpoint } from './checkpoint-contract.js';

/**
 * Parser Interceptor (Doc 03 §5 step 5): extracts [STATE_CHECKPOINT: {...}]
 * blocks from model output. Includes Doc 03 §11 fallbacks — a missing or
 * invalid block yields typed failures, never crashes the stream.
 */

export interface ParseOutcome {
  found: boolean;
  checkpoint?: StateCheckpoint;
  error?: string;
  /** Text with the checkpoint block stripped (safe to stream to client). */
  visibleText: string;
}

const CHECKPOINT_REGEX = /\[STATE_CHECKPOINT\s*:\s*(\{[\s\S]*?\})\s*\]/g;

export function extractStateCheckpoints(fullText: string): ParseOutcome {
  const matches = [...fullText.matchAll(CHECKPOINT_REGEX)];

  if (matches.length === 0) {
    return { found: false, visibleText: fullText };
  }

  // Multiple blocks: last one wins; earlier ones are stripped as noise.
  const raw = matches[matches.length - 1]?.[1] ?? '';

  try {
    const json: unknown = JSON.parse(raw);
    const parsed = StateCheckpointSchema.safeParse(json);
    if (!parsed.success) {
      return {
        found: true,
        error: `Checkpoint schema violation: ${parsed.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join('; ')}`,
        visibleText: fullText.replace(CHECKPOINT_REGEX, '')
      };
    }
    return { found: true, checkpoint: parsed.data, visibleText: fullText.replace(CHECKPOINT_REGEX, '') };
  } catch (err) {
    // Fallback: salvage bare "status": "..." pairs for soft-sync marking.
    const statusMatch = /"status"\s*:\s*"([a-z_]+)"/i.exec(raw);
    return {
      found: true,
      error: statusMatch
        ? `Checkpoint JSON unparseable; soft-sync fallback captured status '${statusMatch[1]}'`
        : `Checkpoint JSON unparseable: ${(err as Error).message}`,
      visibleText: fullText.replace(CHECKPOINT_REGEX, '')
    };
  }
}

/** Incremental scanner for streaming: detects whether a complete block has arrived. */
export class CheckpointStreamScanner {
  private buffer = '';
  private emitted = false;

  push(chunk: string): void {
    this.buffer += chunk;
  }

  /** True once at least one complete checkpoint block exists in the buffer. */
  hasCompleteBlock(): boolean {
    return /\[STATE_CHECKPOINT\s*:\s*\{[\s\S]*?\}\s*\]/.test(this.buffer);
  }

  /** Extract + reset when complete; safe to call every chunk. */
  takeIfReady(): ParseOutcome | null {
    if (this.emitted || !this.hasCompleteBlock()) return null;
    this.emitted = true;
    return extractStateCheckpoints(this.buffer);
  }
}
