import type { BadgeDefinition } from '@/src/credentialing/badges.js';

/**
 * S8B-T3 — starter badge catalog. Subject-specific mastery badges are built
 * per persona from the planned concept ids; the rest are universal.
 */

export interface CatalogBadge extends BadgeDefinition {
  title: string;
  description: string;
  glyph: string;
}

export const UNIVERSAL_BADGES: CatalogBadge[] = [
  {
    id: 'first-steps',
    title: 'First Steps',
    description: 'Reach PARTIAL mastery on any concept.',
    glyph: '🌱',
    criteria: { kind: 'CONCEPT_COUNT', minCount: 1, atOrAbove: 'PARTIAL' }
  },
  {
    id: 'solid-three',
    title: 'Solid Foundation',
    description: 'Bring three concepts to SOLID mastery.',
    glyph: '🧱',
    criteria: { kind: 'CONCEPT_COUNT', minCount: 3, atOrAbove: 'SOLID' }
  },
  {
    id: 'streak-three',
    title: 'Three-Day Streak',
    description: 'Learn on three consecutive calendar days.',
    glyph: '🔥',
    criteria: { kind: 'SESSION_STREAK', minDays: 3 }
  },
  {
    id: 'practice-ten',
    title: 'Deliberate Practitioner',
    description: 'Attempt ten practice questions in total.',
    glyph: '🎯',
    criteria: { kind: 'PRACTICE_COUNT', minCount: 10 }
  }
];

export function subjectBadge(subjectTitle: string, conceptIds: string[]): CatalogBadge {
  return {
    id: `mastery-${subjectTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: `${subjectTitle} Mastery`,
    description: `Hold every core concept of ${subjectTitle} at 75% or above.`,
    glyph: '🎓',
    criteria: { kind: 'MASTERY_THRESHOLD', conceptIds, threshold: 75 }
  };
}

/** Full catalog for a learner: universal + their subject badge (if planned). */
export function buildCatalog(subjectTitle: string | null, plannedConceptIds: string[]): CatalogBadge[] {
  return [
    ...UNIVERSAL_BADGES,
    ...(subjectTitle !== null && plannedConceptIds.length > 0 ? [subjectBadge(subjectTitle, plannedConceptIds)] : [])
  ];
}
