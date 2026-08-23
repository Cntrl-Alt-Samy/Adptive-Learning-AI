import { z } from 'zod';

/**
 * Curriculum authoring format (Doc 04 §12.2 / Doc 05 §9).
 * One file describes exactly one subject; concept nodes carry atomic RAG
 * chunks that map 1:1 onto the Pinecone metadata contract.
 */

export const ContentChunkSchema = z.object({
  contentType: z.enum(['canonical_definition', 'misconception', 'worked_example']),
  text: z.string().min(1),
  specRef: z.string().min(1)
});
export type ContentChunk = z.infer<typeof ContentChunkSchema>;

export const ConceptNodeSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{3,64}$/, 'concept ids must be snake_case, 3–64 chars'),
  /** Optional override; defaults to the document subject (used by the cross-subject edge guard). */
  subjectId: z.string().min(3).max(64).optional(),
  title: z.string().min(1).max(255),
  difficultyLevel: z.number().int().min(1).max(10).default(1),
  specRef: z.string().min(1),
  prerequisiteIds: z.array(z.string()).default([]),
  contentChunks: z.array(ContentChunkSchema).default([])
});
export type ConceptNode = z.infer<typeof ConceptNodeSchema>;

export const SubjectHeaderSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{3,64}$/),
  title: z.string().min(1).max(255),
  category: z.string().min(1).max(128),
  examBoard: z.string().min(1).max(128).optional(),
  stage: z.enum(['gcse', 'alevel']).optional()
});
export type SubjectHeader = z.infer<typeof SubjectHeaderSchema>;

export const CurriculumDocSchema = z.object({
  subject: SubjectHeaderSchema,
  curriculumVersion: z.string().min(1).max(32),
  concepts: z.array(ConceptNodeSchema).min(1)
});
export type CurriculumDoc = z.infer<typeof CurriculumDocSchema>;

/** Resolve the effective owning subject of a concept. */
export function effectiveSubjectId(doc: CurriculumDoc, concept: ConceptNode): string {
  return concept.subjectId ?? doc.subject.id;
}
