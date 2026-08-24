/**
 * S4 shared — deterministic seeded randomness.
 * Every Sprint 4 engine must be reproducible: identical inputs + seed ⇒
 * identical output. mulberry32 is tiny, fast and has a proven 2^32 period;
 * fnv1a maps string keys into the 32-bit seed space for stable tie-breaks.
 */

/** Deterministic PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FNV_OFFSET = 0x811c9dc5;

/** Stable 32-bit FNV-1a hash — used for seeded tie-break ordering. */
export function hash32(input: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Force unsigned.
  return h >>> 0;
}

/** Seeded unit-interval tie-break key in [0,1) for an id under a seed. */
export function tieBreak(seed: number, id: string): number {
  return hash32(`${seed}:${id}`) / 4294967296;
}
