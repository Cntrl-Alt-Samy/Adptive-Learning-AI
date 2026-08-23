import { z } from 'zod';

/**
 * Deterministic state checkpoint contract — TS mirror of Doc 03 §8
 * (Pydantic StateCheckpoint). The gateway parses [STATE_CHECKPOINT: {...}]
 * blocks out of model output, validates here, then commits server-side.
 */

const CALIBRATED_LEVELS = ['confirmed_beginner', 'low_intermediate', 'high_intermediate', 'near_advanced'] as const;

export const StateCheckpointSchema = z.object({
  step: z.number().int().min(1).max(10),
  status: z.string().min(3).max(64),
  subject: z.string().max(128).optional(),
  calibrated_level: z.enum(CALIBRATED_LEVELS).optional(),
  self_level: z.enum(['beginner', 'some_exposure', 'intermediate', 'advanced']).optional(),
  goal: z.string().max(512).optional(),
  time_minutes: z.number().positive().optional(),
  modality: z.enum(['stepwise', 'examples', 'visual', 'hands_on']).optional(),
  gap_map: z.array(z.string()).optional(),
  strength_map: z.array(z.string()).optional(),
  concept_id: z.string().max(64).optional(),
  mastery: z.enum(['solid', 'partial', 'needs_work']).optional(),
  score_percent: z.number().min(0).max(100).optional(),
  tier1_pass: z.boolean().optional(),
  tier2_pass: z.boolean().optional(),
  tier3_pass: z.boolean().optional(),
  pre_score: z.number().optional(),
  post_score: z.number().optional(),
  knowledge_gain_pct: z.number().optional(),
  spaced_rep_queue: z
    .array(z.object({ concept_id: z.string(), due_hours: z.number() }))
    .optional()
});
export type StateCheckpoint = z.infer<typeof StateCheckpointSchema>;

/** Step numbers that legitimately emit checkpoints (Doc 01 pipeline). */
export const CHECKPOINT_STEPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
