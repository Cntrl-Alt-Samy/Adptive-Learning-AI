import { describe, it, expect, afterEach } from 'vitest';
import {
  OpenAiChatTransport,
  AnthropicMessagesTransport,
  UpstreamError,
  createModelTransport
} from '../../src/ai/transport.js';

function sseResponse(frames: string[], status = 200): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    }
  });
  return new Response(body, { status });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const baseReq = {
  model: 'test-model',
  systemPrefix: 'STATIC',
  messages: [{ role: 'user' as const, content: 'hi' }]
};

describe('transport gate (fetch-stubbed streaming)', () => {
  it('openai dialect streams delta tokens and usage with cache detection', async () => {
    let capturedBody = '';
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
        'data: {"usage":{"prompt_tokens":100,"completion_tokens":5,"prompt_tokens_details":{"cached_tokens":96}}}\n',
        'data: [DONE]\n'
      ]);
    }) as typeof fetch;

    const t = new OpenAiChatTransport({ openaiBaseUrl: 'https://x/v1', openaiApiKey: 'k' });
    const chunks = [];
    for await (const c of t.stream(baseReq)) chunks.push(c);

    expect(chunks.filter((c) => c.type === 'token').map((c) => c.text).join('')).toBe('Hello');
    const usage = chunks.find((c) => c.type === 'usage');
    expect(usage && usage.cacheHit).toBe(true); // cached_tokens > 0
    expect(capturedBody).toContain('"system"'); // prefix sent as system message
    expect(capturedBody).toContain('STATIC');
  });

  it('openai dialect raises UpstreamError on non-2xx', async () => {
    globalThis.fetch = (async () => new Response('boom', { status: 503 })) as typeof fetch;
    const t = new OpenAiChatTransport({ openaiBaseUrl: 'https://x', openaiApiKey: 'k' });
    await expect(async () => {
      for await (const _ of t.stream(baseReq)) void _;
    }).rejects.toBeInstanceOf(UpstreamError);
  });

  it('anthropic dialect parses content_block_delta + cache_read usage', async () => {
    let capturedBody = '';
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      capturedBody = String(init?.body);
      return sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":1100,"cache_read_input_tokens":1100}}}\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Yo"}}\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"!"}}\n',
        'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":42}}\n'
      ]);
    }) as typeof fetch;

    const t = new AnthropicMessagesTransport({ anthropicBaseUrl: 'https://y', anthropicApiKey: 'k' });
    const chunks = [];
    for await (const c of t.stream(baseReq)) chunks.push(c);

    expect(chunks.filter((c) => c.type === 'token').map((c) => c.text).join('')).toBe('Yo!');
    const starts = chunks.filter((c) => c.type === 'usage');
    expect(starts.some((c) => c.cacheHit)).toBe(true);
    expect(starts.some((c) => c.outputTokens === 42)).toBe(true);
    // Prefix carries ephemeral cache_control breakpoint.
    expect(capturedBody).toContain('"cache_control":{"type":"ephemeral"}');
  });

  it('composite transport routes by provider field', async () => {
    const seen: string[] = [];
    globalThis.fetch = (async (url: unknown) => {
      seen.push(String(url));
      return sseResponse(['data: [DONE]\n']);
    }) as typeof fetch;

    const t = createModelTransport({
      openaiBaseUrl: 'https://oai',
      openaiApiKey: 'k',
      anthropicBaseUrl: 'https://ant',
      anthropicApiKey: 'k'
    });
    for await (const _ of t.stream({ ...baseReq, provider: 'anthropic' })) void _;
    for await (const _ of t.stream({ ...baseReq, provider: 'openai' })) void _;
    expect(seen[0]).toContain('ant/messages');
    expect(seen[1]).toContain('oai/chat/completions');
  });

  it('malformed upstream JSON chunks are skipped, not fatal', async () => {
    globalThis.fetch = (async () =>
      sseResponse(['data: {not-json}\n', 'data: {"choices":[{"delta":{"content":"ok"}}]}\n'])) as typeof fetch;
    const t = new OpenAiChatTransport({ openaiBaseUrl: 'https://x', openaiApiKey: 'k' });
    const out = [];
    for await (const c of t.stream(baseReq)) out.push(c);
    expect(out.map((c) => (c.type === 'token' ? c.text : '')).join('')).toBe('ok');
  });
});
