import { describe, it, expect } from 'vitest';
import {
  RUNBOOKS,
  REQUIRED_RUNBOOK_CODES,
  getRunbook
} from '../../src/ops/runbooks.js';

/**
 * S7-T6 — launch-readiness gate: every incident class has a complete,
 * actionable runbook. This spec fails GA readiness when coverage lapses.
 */

describe('ops.runbooks — launch coverage gate', () => {
  it('every required incident class has a runbook', () => {
    for (const code of REQUIRED_RUNBOOK_CODES) {
      expect(RUNBOOKS[code], `missing runbook: ${code}`).toBeDefined();
    }
  });

  it('every runbook has triggers, owned steps and a rollback reference', () => {
    for (const [code, rb] of Object.entries(RUNBOOKS)) {
      expect(rb.triggers.length, `${code} triggers`).toBeGreaterThan(0);
      expect(rb.steps.length, `${code} steps`).toBeGreaterThan(0);
      expect(rb.rollback.length, `${code} rollback`).toBeGreaterThan(0);
      for (const step of rb.steps) {
        expect(['on-call', 'secondary', 'lead']).toContain(step.owner);
        expect(step.action.length).toBeGreaterThan(8);
      }
    }
  });

  it('rollback references point at real runbooks or are self-contained', () => {
    const codes = new Set(Object.keys(RUNBOOKS));
    for (const rb of Object.values(RUNBOOKS)) {
      if (codes.has(rb.rollback as never)) continue; // chained runbook
      // Self-contained guidance must mention an action verb.
      expect(/flip|scale|forward|re-flip/i.test(rb.rollback)).toBe(true);
    }
  });

  it('getRunbook returns entries and throws on unknown codes', () => {
    expect(getRunbook('POOL_EXHAUSTION').title).toContain('pool');
    expect(() => getRunbook('NOPE' as never)).toThrow('Missing runbook');
  });
});
