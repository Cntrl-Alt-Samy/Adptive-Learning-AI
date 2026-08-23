import { describe, it, expect } from 'vitest';
import {
  DecayChunkJobSchema,
  DecayDeadJobSchema,
  DECAY_QUEUE_NAME,
  DECAY_DLQ_QUEUE_NAME
} from '../../src/queues/decay.js';
import { conceptToChunkVectors, documentToChunkVectors } from '../../src/pinecone/chunking.js';
import type { CurriculumDoc } from '../../src/curriculum/types.js';

describe('S0-T5 decay queue topology contract', () => {
  it('queue names follow the declared topology', () => {
    expect(DECAY_QUEUE_NAME).toBe('decay-processing');
    expect(DECAY_DLQ_QUEUE_NAME).toBe('decay-processing-dlq');
  });

  it('DecayChunkJobSchema enforces the 500-row B-02 cap and cursor shape', () => {
    expect(DecayChunkJobSchema.safeParse({ batchSize: 500 }).success).toBe(true);
    expect(DecayChunkJobSchema.safeParse({ batchSize: 501 }).success).toBe(false);
    expect(DecayChunkJobSchema.safeParse({ batchSize: 0 }).success).toBe(false);
    expect(
      DecayChunkJobSchema.safeParse({ cursorId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301', batchSize: 100 }).success
    ).toBe(true);
    expect(DecayChunkJobSchema.safeParse({ cursorId: 'not-a-uuid' }).success).toBe(false);
    // defaults apply
    const parsed = DecayChunkJobSchema.parse({});
    expect(parsed.batchSize).toBe(500);
  });

  it('DecayDeadJobSchema validates DLQ envelopes end-to-end', () => {
    const envelope = {
      originalJobId: 'job-1',
      failedReason: 'ECONNRESET after 5 attempts',
      attemptsMade: 5,
      originalData: { cursorId: null, batchSize: 500 }
    };
    expect(DecayDeadJobSchema.safeParse(envelope).success).toBe(true);
    expect(DecayDeadJobSchema.safeParse({ ...envelope, failedReason: '' }).success).toBe(true);
    expect(DecayDeadJobSchema.safeParse({ ...envelope, attemptsMade: -1 }).success).toBe(false);
  });
});

describe('S0-T7 pinecone chunk metadata contract (Doc 05 §9)', () => {
  const doc: CurriculumDoc = {
    subject: { id: 'gcse_maths_edexcel', title: 'GCSE Maths', category: 'maths', examBoard: 'edexcel', stage: 'gcse' },
    curriculumVersion: '2026.1',
    concepts: [
      {
        id: 'alg_quadratic_factoring',
        title: 'Factorising quadratics',
        difficultyLevel: 7,
        specRef: '2.4b',
        prerequisiteIds: ['alg_linear_equations'],
        contentChunks: [
          { contentType: 'canonical_definition', text: 'def', specRef: '2.4b' },
          { contentType: 'misconception', text: 'mis', specRef: '2.4b' }
        ]
      }
    ]
  };

  it('one vector per atomic chunk with full metadata payload', () => {
    const vectors = conceptToChunkVectors(doc, doc.concepts[0]!);
    expect(vectors).toHaveLength(2);
    expect(vectors[0]!.id).toBe('gcse_maths_edexcel:alg_quadratic_factoring:canonical_definition:0');
    expect(vectors[1]!.metadata.content_type).toBe('misconception');

    const meta = vectors[0]!.metadata;
    expect(meta).toMatchObject({
      subject_id: 'gcse_maths_edexcel',
      stage: 'gcse',
      concept_id: 'alg_quadratic_factoring',
      title: 'Factorising quadratics',
      difficulty_level: 7,
      prerequisite_ids: ['alg_linear_equations'],
      exam_board: 'edexcel',
      spec_ref: '2.4b',
      curriculum_version: '2026.1'
    });
  });

  it('subject override propagates for cross-published nodes', () => {
    const overridden = { ...doc.concepts[0]!, subjectId: 'other_subject' };
    const [v] = conceptToChunkVectors(doc, overridden);
    expect(v?.metadata.subject_id).toBe('other_subject');
  });

  it('documentToChunkVectors flattens every concept; empty chunks contribute none', () => {
    const vectors = documentToChunkVectors(doc);
    expect(vectors).toHaveLength(2);
    const emptyDoc: CurriculumDoc = {
      ...doc,
      concepts: [{ ...doc.concepts[0]!, contentChunks: [] }]
    };
    expect(documentToChunkVectors(emptyDoc)).toEqual([]);
  });
});
