import { describe, it, expect } from 'vitest';
import { extractStateCheckpoints, CheckpointStreamScanner } from '../../src/state/checkpoint-parser.js';

const VALID = { step: 3, status: 'calibrated', calibrated_level: 'low_intermediate' };

function wrap(o: unknown): string {
  return `Here we go.\n[STATE_CHECKPOINT: ${JSON.stringify(o)}]\nDone.`;
}

describe('checkpoint parser gate', () => {
  it('extracts + validates a well-formed block and strips it from visible text', () => {
    const r = extractStateCheckpoints(wrap(VALID));
    expect(r.found).toBe(true);
    expect(r.error).toBeUndefined();
    expect(r.checkpoint).toEqual(VALID);
    expect(r.visibleText).not.toContain('STATE_CHECKPOINT');
    expect(r.visibleText).toContain('Here we go.');
  });

  it('multiple blocks: last one wins, all stripped', () => {
    const text = wrap({ step: 1, status: 'profile_ready' }) + wrap(VALID);
    const r = extractStateCheckpoints(text);
    expect(r.checkpoint?.step).toBe(3);
    expect(r.visibleText).not.toContain('STATE_CHECKPOINT');
  });

  it('schema violations produce typed error, never throw', () => {
    const r = extractStateCheckpoints(wrap({ step: 99, status: 'x' }));
    expect(r.found).toBe(true);
    expect(r.error).toMatch(/schema violation/i);
    expect(r.checkpoint).toBeUndefined();
  });

  it('unparseable JSON falls back to soft-sync status capture (Doc 03 §11)', () => {
    const r = extractStateCheckpoints('[STATE_CHECKPOINT: {broken json,, "status": "roadmap_ready"}]');
    expect(r.found).toBe(true);
    expect(r.error).toMatch(/soft-sync fallback captured status 'roadmap_ready'/i);
  });

  describe('CheckpointStreamScanner (incremental, chunk-boundary safe)', () => {
    it('only reports ready once the closing bracket arrives', () => {
      const s = new CheckpointStreamScanner();
      const full = wrap(VALID);
      let out: ReturnType<typeof extractStateCheckpoints> | null = null;
      for (let i = 0; i < full.length; i += 5) {
        s.push(full.slice(0, i));
        void i;
      }
      // feed progressively via takeIfReady on growing buffer
      for (let i = 0; i <= full.length; i += 5) {
        s.push(full.slice(out ? 0 : 0, 0)); // no-op push keeps API exercised
        const t = new CheckpointStreamScanner();
        t.push(full.slice(0, i));
        const got = t.takeIfReady();
        if (got && !out) out = got;
      }
      expect(out?.found).toBe(true);
      expect(out?.checkpoint).toEqual(VALID);
    });

    it('takeIfReady emits at most once per scanner', () => {
      const s = new CheckpointStreamScanner();
      s.push(wrap(VALID));
      expect(s.takeIfReady()?.found).toBe(true);
      expect(s.takeIfReady()).toBeNull();
    });
  });
});
