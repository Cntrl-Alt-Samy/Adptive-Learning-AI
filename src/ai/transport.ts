/**
 * Model transport abstraction (Doc 04 §3/§6). The streaming route depends on
 * this interface only, so failover between OpenAI- and Anthropic-dialect
 * providers is uniform and tests inject scripted transports.
 */

export type TransportChunk =
  | { type: 'token'; text: string }
  | {
      type: 'usage';
      inputTokens?: number;
      outputTokens?: number;
      /** provider reported a prefix-cache hit */
      cacheHit?: boolean;
    };

export interface TransportRequest {
  provider: 'openai' | 'anthropic';
  model: string;
  /** Immutable ~1,100-token static prefix (S1-T4) — first system message. */
  systemPrefix: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ModelTransport {
  stream(req: TransportRequest): AsyncIterable<TransportChunk>;
}

export interface TransportEnvConfig {
  openaiBaseUrl?: string;
  openaiApiKey?: string;
  anthropicBaseUrl?: string;
  anthropicApiKey?: string;
  fetchImpl?: typeof fetch;
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path}`;
}

/** Minimal SSE line reader over a fetch body. */
async function* sseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        yield buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
      }
    }
    if (buffer.length > 0) yield buffer;
  } finally {
    reader.releaseLock();
  }
}

interface SseDataEvent {
  data: unknown | '[DONE]';
}

async function* sseDataEvents(res: Response): AsyncGenerator<SseDataEvent> {
  if (!res.body) throw new Error('Upstream returned no body');
  let eventName = '';
  for await (const line of sseLines(res.body)) {
    if (line.startsWith('event: ')) {
      eventName = line.slice('event: '.length).trim();
      continue;
    }
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    if (payload === '[DONE]') return;
    try {
      void eventName;
      yield { data: JSON.parse(payload) };
    } catch {
      // Malformed upstream chunk — skip; contract layer degrades to error events.
    }
  }
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/* -------------------------------------------------------------------------- */
/* OpenAI-compatible chat completions dialect                                 */
/* -------------------------------------------------------------------------- */

interface OpenAiDelta {
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export class OpenAiChatTransport implements ModelTransport {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TransportEnvConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async *stream(req: TransportRequest): AsyncIterable<TransportChunk> {
    const base = this.config.openaiBaseUrl ?? process.env.OPENAI_BASE_URL ?? '';
    const key = this.config.openaiApiKey ?? process.env.OPENAI_API_KEY ?? '';
    if (!base || !key) throw new UpstreamError('OpenAI gateway not configured', 500);

    const res = await this.fetchImpl(joinUrl(base, 'chat/completions'), {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: req.model,
        stream: true,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1_200,
        messages: [
          { role: 'system', content: req.systemPrefix },
          ...req.messages.map((m) => ({ role: m.role, content: m.content }))
        ]
      })
    });

    if (!res.ok) {
      throw new UpstreamError(`OpenAI upstream ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
    }

    for await (const evt of sseDataEvents(res)) {
      const delta = evt.data as OpenAiDelta;
      const text = delta.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        yield { type: 'token', text };
      }
      if (delta.usage) {
        yield {
          type: 'usage',
          inputTokens: delta.usage.prompt_tokens,
          outputTokens: delta.usage.completion_tokens,
          cacheHit: (delta.usage.prompt_tokens_details?.cached_tokens ?? 0) > 0
        };
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Anthropic messages dialect                                                 */
/* -------------------------------------------------------------------------- */

interface AnthropicStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string };
  message?: { usage?: { input_tokens?: number; cache_read_input_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
}

export class AnthropicMessagesTransport implements ModelTransport {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: TransportEnvConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async *stream(req: TransportRequest): AsyncIterable<TransportChunk> {
    const base = this.config.anthropicBaseUrl ?? process.env.ANTHROPIC_BASE_URL ?? '';
    const key = this.config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
    if (!base || !key) throw new UpstreamError('Anthropic gateway not configured', 500);

    const res = await this.fetchImpl(joinUrl(base, 'messages'), {
      method: 'POST',
      signal: req.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: req.model,
        stream: true,
        max_tokens: req.maxTokens ?? 1_200,
        temperature: req.temperature ?? 0.7,
        // Static prefix carries the ephemeral cache_control breakpoint (S1-T4).
        system: [
          { type: 'text', text: req.systemPrefix, cache_control: { type: 'ephemeral' } }
        ],
        messages: req.messages.map((m) => ({ role: m.role, content: m.content }))
      })
    });

    if (!res.ok) {
      throw new UpstreamError(`Anthropic upstream ${res.status}: ${(await res.text()).slice(0, 300)}`, res.status);
    }

    for await (const evt of sseDataEvents(res)) {
      const payload = evt.data as AnthropicStreamEvent;
      if (payload.type === 'content_block_delta' && typeof payload.delta?.text === 'string') {
        yield { type: 'token', text: payload.delta.text };
      }
      if (payload.type === 'message_start' && payload.message?.usage) {
        const cached = payload.message.usage.cache_read_input_tokens ?? 0;
        yield {
          type: 'usage',
          inputTokens: payload.message.usage.input_tokens,
          cacheHit: cached > 0
        };
      }
      if (payload.type === 'message_delta' && payload.usage) {
        yield {
          type: 'usage',
          inputTokens: payload.usage.input_tokens,
          outputTokens: payload.usage.output_tokens,
          cacheHit: (payload.usage.cache_read_input_tokens ?? 0) > 0
        };
      }
    }
  }
}

/** Dialect-dispatching composite transport. */
export function createModelTransport(config: TransportEnvConfig = {}): ModelTransport {
  const openai = new OpenAiChatTransport(config);
  const anthropic = new AnthropicMessagesTransport(config);
  return {
    stream(req: TransportRequest) {
      return req.provider === 'anthropic' ? anthropic.stream(req) : openai.stream(req);
    }
  };
}
