/**
 * Dynamic learner context builder — assembles the per-turn context message
 * that sits between the static prefix and the user message.
 *
 * This gives the LLM the three things it needs to tutor effectively:
 * 1. Who the learner is (persona: subject, level, goal, modality)
 * 2. What to teach (curriculum RAG chunks for the current concept)
 * 3. What the learner already knows (DNA: mastery matrix + due reviews)
 *
 * The static prefix is byte-pinned and immutable. This dynamic context
 * is injected as a SEPARATE system message — no pin tests are affected.
 */

import type { CurriculumContext } from '@/src/curriculum/context-resolver.js';

export interface LearnerPersona {
  subjectId: string;
  subjectTitle: string;
  selfLevel: 'beginner' | 'some_exposure' | 'intermediate' | 'advanced';
  goal: string;
  timeMinutes: number;
  modality: 'stepwise' | 'examples' | 'visual' | 'hands_on';
}

export interface MasteryEntry {
  conceptId: string;
  masteryScore: number;
  status: 'SOLID' | 'PARTIAL' | 'NEEDS_WORK';
}

export interface LearnerDnaContext {
  mastery: MasteryEntry[];
  dueReviews: Array<{ conceptId: string; dueAtMs: number }>;
}

export interface DynamicContextOptions {
  persona: LearnerPersona;
  curriculum: CurriculumContext | null;
  dna: LearnerDnaContext | null;
  mode: string;
  step: number;
}

const LEVEL_MAP: Record<LearnerPersona['selfLevel'], string> = {
  beginner: 'Complete beginner — start from first principles',
  some_exposure: 'Some prior exposure — can assume basic familiarity',
  intermediate: 'Intermediate — comfortable with fundamentals',
  advanced: 'Advanced — can move fast, focus on edge cases and depth'
};

const MODALITY_MAP: Record<LearnerPersona['modality'], string> = {
  stepwise: 'Step-by-step explanations with clear progression',
  examples: 'Example-driven — lead with worked examples',
  visual: 'Visual/intuitive explanations preferred',
  hands_on: 'Hands-on practice — minimal theory, maximum doing'
};

/**
 * Build the dynamic context system message. Returns null when no
 * meaningful context can be assembled (caller should skip injection).
 */
export function buildDynamicContext(opts: DynamicContextOptions): string | null {
  const sections: string[] = [];

  // ── Section 1: Learner Profile ──
  sections.push(
    [
      'LEARNER PROFILE',
      `Subject: ${opts.persona.subjectTitle} (${opts.persona.subjectId})`,
      `Level: ${LEVEL_MAP[opts.persona.selfLevel]}`,
      `Goal: ${opts.persona.goal}`,
      `Session budget: ${opts.persona.timeMinutes} minutes`,
      `Preferred modality: ${MODALITY_MAP[opts.persona.modality]}`
    ].join('\n')
  );

  // ── Section 2: Curriculum RAG Context ──
  if (opts.curriculum !== null) {
    const lines: string[] = [
      'CURRICULUM_RAG_CONTEXT (ground all factual claims in this content):',
      `Concept: "${opts.curriculum.conceptTitle}" (${opts.curriculum.conceptId})`,
      `Subject: ${opts.curriculum.subjectTitle}${opts.curriculum.examBoard !== undefined ? ` [${opts.curriculum.examBoard}]` : ''}`,
      `Difficulty: ${opts.curriculum.difficultyLevel}/10 · Spec ref: ${opts.curriculum.specRef}`
    ];
    for (const chunk of opts.curriculum.chunks) {
      const label =
        chunk.contentType === 'canonical_definition'
          ? 'DEFINITION'
          : chunk.contentType === 'misconception'
            ? 'MISCONCEPTION'
            : 'WORKED_EXAMPLE';
      lines.push(`[${label}] ${chunk.text}`);
    }
    sections.push(lines.join('\n'));
  } else {
    sections.push(
      'CURRICULUM_RAG_CONTEXT: Not available for this concept. Teach from general knowledge but say so plainly.'
    );
  }

  // ── Section 3: Learning DNA (mastery + due reviews) ──
  if (opts.dna !== null && opts.dna.mastery.length > 0) {
    const matrix = opts.dna.mastery
      .map((m) => `  ${m.conceptId}: ${Math.round(m.masteryScore * 100)}% (${m.status})`)
      .join('\n');
    const dueList =
      opts.dna.dueReviews.length > 0
        ? opts.dna.dueReviews
            .slice(0, 10)
            .map((d) => `  ${d.conceptId} — due ${new Date(d.dueAtMs).toISOString().slice(0, 16)}`)
            .join('\n')
        : '  (none due)';

    sections.push(
      [
        'LEARNING DNA (learner mastery state — adapt your teaching to these gaps):',
        `Mastery matrix:\n${matrix}`,
        `Due for spaced review:\n${dueList}`
      ].join('\n')
    );
  }

  return sections.join('\n\n');
}
