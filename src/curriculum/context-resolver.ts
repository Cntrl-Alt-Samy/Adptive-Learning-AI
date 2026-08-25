/**
 * Curriculum content resolver — loads concept-specific RAG chunks from
 * the local curriculum JSON files for prompt injection.
 *
 * The system prompt references CURRICULUM_RAG_CONTEXT; this module
 * resolves it by looking up contentChunks for a given concept + subject.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCurriculum } from './loader.js';
import type { ContentChunk } from './types.js';

export interface CurriculumContext {
  subjectTitle: string;
  examBoard: string | undefined;
  conceptTitle: string;
  conceptId: string;
  difficultyLevel: number;
  specRef: string;
  chunks: ContentChunk[];
}

/**
 * Resolve curriculum context for a single concept. Returns null if the
 * curriculum file or concept cannot be found (caller should degrade gracefully).
 */
export function resolveConceptContext(
  subjectId: string,
  conceptId: string
): CurriculumContext | null {
  try {
    const file = path.join(process.cwd(), 'curricula', `${subjectId}.json`);
    const loaded = parseCurriculum(readFileSync(file, 'utf8'));
    if (!loaded.ok || loaded.doc === undefined) return null;

    const concept = loaded.doc.concepts.find((c) => c.id === conceptId);
    if (concept === undefined) return null;

    return {
      subjectTitle: loaded.doc.subject.title,
      examBoard: loaded.doc.subject.examBoard,
      conceptTitle: concept.title,
      conceptId: concept.id,
      difficultyLevel: concept.difficultyLevel,
      specRef: concept.specRef,
      chunks: concept.contentChunks
    };
  } catch {
    return null;
  }
}

/**
 * Build the CURRICULUM_RAG_CONTEXT string for prompt injection.
 * Format is compact but human-readable for the LLM.
 */
export function formatCurriculumContext(ctx: CurriculumContext): string {
  const lines: string[] = [
    `CURRICULUM_RAG_CONTEXT for "${ctx.conceptTitle}" (${ctx.conceptId})`,
    `Subject: ${ctx.subjectTitle}${ctx.examBoard !== undefined ? ` [${ctx.examBoard}]` : ''}`,
    `Difficulty: ${ctx.difficultyLevel}/10 · Spec ref: ${ctx.specRef}`
  ];

  for (const chunk of ctx.chunks) {
    const label =
      chunk.contentType === 'canonical_definition'
        ? 'DEFINITION'
        : chunk.contentType === 'misconception'
          ? 'MISCONCEPTION'
          : 'WORKED_EXAMPLE';
    lines.push(`[${label}] ${chunk.text}`);
  }

  return lines.join('\n');
}
