import type { ModelTransport, TransportChunk, TransportRequest } from './transport.js';

/**
 * Deterministic scripted transport for tests and offline dev. Scripts are
 * matched in order; the first `when` that passes serves its chunks. The
 * default script (no matcher) handles everything else.
 */

export interface ScriptedCall {
  request: TransportRequest;
}

export interface TransportScript {
  when?: (req: TransportRequest, callIndex: number) => boolean;
  chunks: TransportChunk[];
  /** Throw instead of streaming (simulates provider failure). */
  error?: Error;
}

export interface ScriptedTransport extends ModelTransport {
  calls: ScriptedCall[];
}

export function createScriptedTransport(scripts: TransportScript[]): ScriptedTransport {
  const calls: ScriptedCall[] = [];
  return {
    calls,
    async *stream(req: TransportRequest): AsyncIterable<TransportChunk> {
      const callIndex = calls.length;
      calls.push({ request: req });
      const script =
        scripts.find((s) => s.when?.(req, callIndex)) ??
        scripts.find((s) => !s.when) ??
        scripts[scripts.length - 1];
      if (!script) throw new Error('No scripted response configured');
      if (script.error) throw script.error;
      yield* script.chunks;
    }
  };
}

/**
 * Convenience: emits the given text token-by-token, optionally followed by a
 * checkpoint block and a usage chunk.
 */
export function textTurn(
  text: string,
  options: { checkpoint?: unknown; cacheHit?: boolean; chunkSize?: number } = {}
): TransportScript {
  const chunks: TransportChunk[] = [];
  const size = options.chunkSize ?? 8;
  for (let i = 0; i < text.length; i += size) {
    chunks.push({ type: 'token', text: text.slice(i, i + size) });
  }
  if (options.checkpoint !== undefined) {
    chunks.push({
      type: 'token',
      text: `\n\n[STATE_CHECKPOINT: ${JSON.stringify(options.checkpoint)}]`
    });
  }
  chunks.push({
    type: 'usage',
    inputTokens: 1_200,
    outputTokens: 320,
    cacheHit: options.cacheHit ?? false
  });
  return { chunks };
}
