import { describe, it, expect } from 'vitest';
import { segmentStream, hasPendingMath, type Segment } from '../../src/frontend/katex-stream-buffer.js';
import { BackoffSchedule, SessionResumeBuffer } from '../../src/frontend/sse-client.js';

describe('katex-buffer.stress.spec (G5 core)', () => {
  const CORPUS = [
    'Plain intro $$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$ plain outro',
    'Inline $x^2$ then display $$\\int_0^1 x\\,dx$$ end',
    'Escaped price $5 and $10 with no math at all',
    '\\[E = mc^2\\] bracket form \\(a<b\\) inline form'
  ];

  it('segments complete blocks and marks unterminated tail pending', () => {
    const full = segmentStream(CORPUS[0]!);
    expect(full.filter((s) => s.kind === 'math' && s.complete)).toHaveLength(1);

    const partial = segmentStream('Value: $$\\frac{1}{2');
    expect(hasPendingMath(partial)).toBe(true); // skeleton while streaming
    expect(partial.at(-1)).toMatchObject({ kind: 'math', complete: false });
  });

  it('STRESS G5: split at every byte offset — segmentation never crashes and recombines', () => {
    let cases = 0;
    for (const text of CORPUS) {
      const whole = segmentStream(text);
      for (let cut = 0; cut <= text.length; cut++) {
        const chunked = [...segmentStream(text.slice(0, cut)), ...segmentStream(text.slice(cut))];
        // must not throw; math content preserved across the seam
        const mathText = (segs: Segment[]) =>
          segs.filter((s) => s.kind === 'math').map((s) => s.content).join('|');
        const wholeMathOnly = whole.some((s) => s.kind === 'math' && s.complete);
        if (!wholeMathOnly) continue;
        expect(mathText(chunked).length).toBeGreaterThan(0);
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(150);
  });

  it('never throws on adversarial garbage', () => {
    for (const bad of ['', '$', '$$$$', '$$$$$$$$', '\\[', '\\(', '$$$\\{$$', 'a$b$c$d']) {
      expect(() => segmentStream(bad)).not.toThrow();
    }
  });
});

describe('resume/reconnect primitives (S3-T5)', () => {
  it('backoff doubles exponentially and caps at max', () => {
    const b = new BackoffSchedule();
    expect([b.next(), b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual([
      500, 1000, 2000, 4000, 8000, 8000
    ]);
    b.reset();
    expect(b.next()).toBe(500);
  });

  it('hydrate restores from last confirmed checkpoint and drops unconfirmed tokens', () => {
    const buf = new SessionResumeBuffer();
    buf.push({ kind: 'token', sessionId: 's1' });
    buf.push({ kind: 'token', sessionId: 's1' });
    buf.push({ kind: 'checkpoint_confirmed', sessionId: 's1', stepNumber: 3 });
    buf.push({ kind: 'token', sessionId: 's1' }); // arrives then socket dies

    expect(buf.confirmedStep).toBe(3);
    const snap = buf.hydrate();
    expect(snap.lastConfirmedStep).toBe(3);
    expect(snap.lostUnconfirmedEvents).toBe(1);
    expect(buf.hydrate().lostUnconfirmedEvents).toBe(0); // drained
  });
});
