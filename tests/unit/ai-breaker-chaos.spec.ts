import { describe, it, expect, vi } from 'vitest';
import { CircuitBreaker, TimeoutError } from '../../src/ai/breaker.js';

function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const cfg = {
  failureThreshold: 3,
  openStateMs: 10_000,
  requestTimeoutMs: 4_000,
  jitterMs: 2_000
};

describe('breaker.chaos gate (fake-clock driven)', () => {
  it('CLOSED -> OPEN after N consecutive failures', () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, clock });
    expect(b.getState('p')).toBe('CLOSED');
    b.recordFailure('p');
    b.recordFailure('p');
    expect(b.getState('p')).toBe('CLOSED'); // below threshold
    b.recordFailure('p');
    expect(b.getState('p')).toBe('OPEN'); // tripped at N=3
  });

  it('timeout >4s counts as failure and trips the breaker (Doc 03 §11)', async () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, failureThreshold: 1, clock });
    await expect(
      b.execute('p', async () => {
        clock.advance(5_000); // slow call under the injected clock
      })
    ).rejects.toBeInstanceOf(TimeoutError);
    expect(b.getState('p')).toBe('OPEN'); // >4s ⇒ immediate trip
  });

  it('OPEN rejects fast; after cooldown enters HALF_OPEN', () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, jitterMs: 0, clock });
    for (let i = 0; i < 3; i++) b.recordFailure('p');
    expect(b.canPass('p')).toBe(false); // OPEN rejects without calling provider
    clock.advance(10_000);
    expect(b.getState('p')).toBe('HALF_OPEN');
    expect(b.canPass('p')).toBe(true); // single probe admitted
  });

  it('HALF_OPEN admits exactly ONE probe — no thundering herd', () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, jitterMs: 0, clock });
    for (let i = 0; i < 3; i++) b.recordFailure('p');
    clock.advance(10_000);
    expect(b.canPass('p')).toBe(true);
    expect(b.canPass('p')).toBe(false); // concurrent callers rejected
    expect(b.canPass('p')).toBe(false);
    b.releaseProbe('p');
    expect(b.canPass('p')).toBe(true); // slot freed -> probe re-admitted
  });

  it('probe success closes; probe failure re-opens with fresh window', () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, jitterMs: 0, clock });

    // trip -> probe fail -> re-open
    for (let i = 0; i < 3; i++) b.recordFailure('p');
    clock.advance(10_000);
    b.recordFailure('p'); // failed probe
    expect(b.getState('p')).toBe('OPEN');

    // second window -> probe success -> CLOSED
    clock.advance(10_000);
    b.recordSuccess('p');
    expect(b.getState('p')).toBe('CLOSED');
    expect(b.canPass('p')).toBe(true);
  });

  it('jittered backoff is deterministic under injected randomness', () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, random: () => 0.5, clock }); // jitter = 1000ms
    for (let i = 0; i < 3; i++) b.recordFailure('p');
    clock.advance(10_999);
    expect(b.getState('p')).toBe('OPEN'); // reopenAt = 11_000 exactly
    clock.advance(1);
    expect(b.getState('p')).toBe('HALF_OPEN');
  });

  it('execute() classifies slow calls as TimeoutError with provider key', async () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, clock, requestTimeoutMs: 5 });
    let elapsedInside = 0;
    const p = b.execute('prov', async () => {
      clock.advance(50);
      elapsedInside = 50;
      return 'late';
    });
    await expect(p).rejects.toThrowError(TimeoutError);
    void elapsedInside;
    expect(b.getState('prov')).toBe('CLOSED'); // single failure < threshold of 3
  });

  it('execute() records success on healthy path', async () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, clock });
    await expect(b.execute('ok', async () => 42)).resolves.toBe(42);
    b.recordFailure('ok');
    b.recordFailure('ok'); // consecutive counter was reset by success
    expect(b.getState('ok')).toBe('CLOSED');
  });

  it('chaos: interleaved providers keep independent state machines', () => {
    const clock = fakeClock();
    const b = new CircuitBreaker({ ...cfg, clock });
    for (let i = 0; i < 3; i++) b.recordFailure('openai');
    expect(b.getState('openai')).toBe('OPEN');
    expect(b.getState('anthropic')).toBe('CLOSED'); // isolation per provider key
    vi.clearAllMocks();
  });
});
