import type { ConceptNode, CurriculumDoc } from '../curriculum/types.js';

/**
 * Maps curriculum concepts onto the Pinecone vector contract (Doc 05 §9).
 * One vector per atomic content chunk; chunking unit = concept node.
 */
export interface RagChunkVector {
  id: string;
  metadata: {
    subject_id: string;
    stage: string;
    concept_id: string;
    title: string;
    difficulty_level: number;
    prerequisite_ids: string[];
    exam_board: string;
    spec_ref: string;
    content_type: 'canonical_definition' | 'misconception' | 'worked_example';
    curriculum_version: string;
    text: string;
  };
}

export function conceptToChunkVectors(doc: CurriculumDoc, concept: ConceptNode): RagChunkVector[] {
  const subjectId = concept.subjectId ?? doc.subject.id;
  return concept.contentChunks.map((chunk, i) => ({
    id: `${subjectId}:${concept.id}:${chunk.contentType}:${i}`,
    metadata: {
      subject_id: subjectId,
      stage: doc.subject.stage ?? 'gcse',
      concept_id: concept.id,
      title: concept.title,
      difficulty_level: concept.difficultyLevel,
      prerequisite_ids: [...concept.prerequisiteIds],
      exam_board: doc.subject.examBoard ?? 'n/a',
      spec_ref: chunk.specRef,
      content_type: chunk.contentType,
      curriculum_version: doc.curriculumVersion,
      text: chunk.text
    }
  }));
}

export function documentToChunkVectors(doc: CurriculumDoc): RagChunkVector[] {
  return doc.concepts.flatMap((concept) => conceptToChunkVectors(doc, concept));
}
