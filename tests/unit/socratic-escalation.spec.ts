import { describe, it, expect } from 'vitest';
import { SocraticLoop } from '../../src/pedagogy/socratic.js';

/**
 * socratic-escalation.spec — S4-T4 support gate.
 * Stage sequence, scaffold depth policy, and the Tier-1 escalation FSM with
 * de-escalation hysteresis (SOLID ×2) per the Sprint risk mitigation.
 */

describe('Socratic loop', () => {
  it('walks the 4-stage inquiry in order and completes', () => {
    const loop = new SocraticLoop();
    const stages: string[] = [];
    for (const verdict of ['SOLID', 'SOLID', 'SOLID', 'SOLID'] as const) {
      stages.push(loop.currentStage);
      const r = loop.recordResponse(verdict);
      if (verdict === 'SOLID') expect(r.tier1).toBe(false);
    }
    expect(stages).toEqual(['OWN_WORDS', 'APPLICATION', 'DEVILS_ADVOCATE', 'CONNECTION_BRIDGE']);
  });

  it('NEEDS_WORK repeats the stage and escalates immediately', () => {
    const loop = new SocraticLoop();
    expect(loop.currentStage).toBe('OWN_WORDS');
    let r = loop.recordResponse('NEEDS_WORK');
    expect(r.tier1).toBe(true);
    expect(r.stageIndex).toBe(0); // repeated
    expect(r.scaffoldDepth).toBeGreaterThanOrEqual(2);

    r = loop.recordResponse('PARTIAL');
    expect(r.tier1).toBe(true); // hysteresis holds escalation
    expect(r.stageIndex).toBe(1); // PARTIAL advanced
  });

  it('two consecutive PARTIALs escalate; a lone PARTIAL does not', () => {
    const solo = new SocraticLoop();
    expect(solo.recordResponse('PARTIAL').tier1).toBe(false);
    // streak broken by SOLID
    solo.recordResponse('SOLID');
    expect(solo.recordResponse('PARTIAL').tier1).toBe(false);

    const pair = new SocraticLoop();
    pair.recordResponse('PARTIAL');
    expect(pair.recordResponse('PARTIAL').tier1).toBe(true);
  });

  it('de-escalates only after a SOLID streak of 2', () => {
    const loop = new SocraticLoop();
    loop.recordResponse('NEEDS_WORK');
    expect(loop.isEscalated).toBe(true);

    expect(loop.recordResponse('SOLID').tier1).toBe(true); // streak 1 — still hot
    expect(loop.recordResponse('SOLID').tier1).toBe(false); // streak 2 — cool down
    expect(loop.isEscalated).toBe(false);
  });

  it('scaffold depth saturates at 3 and relaxes on SOLID', () => {
    const loop = new SocraticLoop();
    let r = loop.recordResponse('NEEDS_WORK');
    for (let i = 0; i < 4; i++) {
      r = loop.recordResponse('NEEDS_WORK'); // stays on OWN_WORDS at depth cap
    }
    expect(r.scaffoldDepth).toBe(3);
    const relaxed = loop.recordResponse('SOLID');
    expect(relaxed.scaffoldDepth).toBe(2);
    expect(relaxed.loopComplete).toBe(false);
  });

  it('throws when responses arrive after completion', () => {
    const loop = new SocraticLoop();
    for (let i = 0; i < 4; i++) loop.recordResponse('SOLID');
    expect(() => loop.recordResponse('SOLID')).toThrow(/complete/i);
  });
});
