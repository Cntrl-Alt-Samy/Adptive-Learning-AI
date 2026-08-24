import type { ModelTransport, TransportChunk, TransportRequest } from '@/src/ai/transport.js';

/**
 * Dev/demo transport (LEARNOS_MOCK_TRANSPORT=1) — streams canned tutor prose
 * embedding a contract-valid [STATE_CHECKPOINT] so the full pipeline
 * (sanitize → stream → checkpoint commit → confirm event) runs offline
 * with zero provider keys. Never used in production.
 */

const PROSE = [
  'Let’s build this up step by step. ',
  'A force acting over a displacement transfers energy: ',
  '$W = \\vec{F} \\cdot \\Delta\\vec{x}$, measured in joules. ',
  '[STATE_CHECKPOINT: __PAYLOAD__] ',
  'Notice how the angle matters — pushing perpendicular to motion does no work at all. ',
  'Try the check-in when ready.'
];

function checkpointPayload(step: number): string {
  const base: Record<number, Record<string, unknown>> = {
    1: { step: 1, status: 'profile_ready', self_level: 'some_exposure', goal: 'Master the mechanics unit' },
    2: {
      step: 2,
      status: 'calibrated',
      calibrated_level: 'low_intermediate',
      gap_map: ['vector components', 'unit consistency'],
      strength_map: ['algebraic manipulation']
    },
    3: { step: 3, status: 'roadmap_ready', subject: 'physics-mechanics', time_minutes: 30, modality: 'stepwise' },
    4: { step: 4, status: 'concept_delivered', concept_id: 'mech-work-energy', mastery: 'partial' },
    5: { step: 5, status: 'socratic_loop_complete', concept_id: 'mech-work-energy', mastery: 'solid' },
    6: { step: 6, status: 'assessment_graded', score_percent: 87, tier1_pass: true, tier2_pass: true },
    7: { step: 7, status: 'review_complete', pre_score: 42, post_score: 87, knowledge_gain_pct: 45 },
    8: {
      step: 8,
      status: 'spaced_rep_scheduled',
      spaced_rep_queue: [
        { concept_id: 'mech-work-energy', due_hours: 24 },
        { concept_id: 'mech-kinematics', due_hours: 72 }
      ]
    }
  };
  const payload = base[step] ?? base[4];
  return JSON.stringify(payload);
}

export function createDevMockTransport(): ModelTransport {
  const stream = async function* (req: TransportRequest): AsyncGenerator<TransportChunk> {
    const last = req.messages.at(-1)?.content ?? '';
    const stepMatch = /STEP:\s*(\d+)/.exec(last);
    const step = stepMatch?.[1] !== undefined ? Number.parseInt(stepMatch[1], 10) : 4;
    const text = PROSE.join('').replace('__PAYLOAD__', checkpointPayload(step));
    // Split mid-checkpoint-opener on purpose — exercises CheckpointGate.
    const cut = text.indexOf('[STATE_CHECK');
    const chunks = [text.slice(0, cut + 5), text.slice(cut + 5)];
    for (const chunk of chunks) {
      if (chunk.length > 0) yield { type: 'token', text: chunk };
    }
    yield { type: 'usage', inputTokens: 1200, outputTokens: 96, cacheHit: true };
  };
  return { stream };
}
