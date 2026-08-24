import { describe, it, expect } from 'vitest';
import { DeliveryGate } from '../../src/pedagogy/delivery-gate.js';

/**
 * delivery-gate.spec — S4-T3 support gate.
 * 5-part order enforcement, grounded-only content, check-in verdict gating,
 * and analogy rotation without immediate repeats on auto-reteach.
 */

describe('5-part delivery gate', () => {
  const bank = ['pizza slices', 'train timetables', 'bank account'];

  function deliveredThroughPitfall(gate: DeliveryGate): void {
    for (const part of ['BIG_PICTURE', 'CORE_PRINCIPLE', 'TAILORED_EXAMPLE', 'COMMON_PITFALL'] as const) {
      gate.markDelivered(part, { grounded: true });
    }
  }

  it('enforces strict part order — skipping throws', () => {
    const gate = new DeliveryGate(bank);
    expect(() => gate.markDelivered('TAILORED_EXAMPLE', { grounded: true })).toThrow(/out-of-order/i);
    gate.markDelivered('BIG_PICTURE', { grounded: true });
    expect(() => gate.markDelivered('COMMON_PITFALL', { grounded: true })).toThrow(/out-of-order/i);
  });

  it('rejects ungrounded teaching (T01 RAG injection only)', () => {
    const gate = new DeliveryGate(bank);
    expect(() => gate.markDelivered('BIG_PICTURE', { grounded: false })).toThrow(/grounded/i);
    // CHECK_IN is not a taught segment — grounding flag irrelevant.
    deliveredThroughPitfall(gate);
    expect(() => gate.submitCheckIn('PASS')).not.toThrow();
  });

  it('blocks progression until a PASS verdict', () => {
    const gate = new DeliveryGate(bank);
    deliveredThroughPitfall(gate);
    const confused = gate.submitCheckIn('CONFUSED');
    expect(confused.canProgress).toBe(false);
    expect(gate.currentPart).toBe('CORE_PRINCIPLE'); // rewound for reteach
  });

  it('auto-reteach rotates analogies with no immediate repeat', () => {
    const gate = new DeliveryGate(bank);
    deliveredThroughPitfall(gate);

    const r1 = gate.submitCheckIn('CONFUSED');
    expect(r1.reteach?.analogy).toBe('pizza slices');

    // Re-deliver the reteach pass back to CHECK_IN.
    gate.markDelivered('CORE_PRINCIPLE', { grounded: true });
    gate.markDelivered('TAILORED_EXAMPLE', { grounded: true });
    gate.markDelivered('COMMON_PITFALL', { grounded: true });
    const r2 = gate.submitCheckIn('CONFUSED');
    expect(r2.reteach?.analogy).toBe('train timetables');
    expect(r2.reteach?.analogy).not.toBe(r1.reteach?.analogy);
    expect(gate.snapshot().reteachCount).toBe(2);

    // Rotation wraps without repeating the last-used entry.
    gate.markDelivered('CORE_PRINCIPLE', { grounded: true });
    gate.markDelivered('TAILORED_EXAMPLE', { grounded: true });
    gate.markDelivered('COMMON_PITFALL', { grounded: true });
    const r3 = gate.submitCheckIn('PASS');
    expect(r3.canProgress).toBe(true);
    expect(gate.snapshot().passedCheckIn).toBe(true);
  });

  it('check-in submitted before the final part throws', () => {
    const gate = new DeliveryGate(bank);
    expect(() => gate.submitCheckIn('PASS')).toThrow(/wrong part/i);
  });

  it('analogy banks must be unique and rotatable', () => {
    expect(() => new DeliveryGate(['only-one'])).toThrow(/≥ 2/);
    expect(() => new DeliveryGate(['dup', 'dup'])).toThrow(/unique/);
  });
});
