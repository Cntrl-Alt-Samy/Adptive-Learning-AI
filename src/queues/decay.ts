import { Queue, type ConnectionOptions } from 'bullmq';
import { z } from 'zod';

export const DECAY_QUEUE_NAME = 'decay-processing';
export const DECAY_DLQ_QUEUE_NAME = 'decay-processing-dlq';

/**
 * S0-T5 — BullMQ queue topology (Doc 04 §5.1). Worker logic lands in Sprint 4;
 * this module fixes the contract: connection config, job schemas, DLQ wiring.
 */

/** One rolling-decay chunk: cursor-batched scan of stale learning_dna rows. */
export const DecayChunkJobSchema = z.object({
  cursorId: z.string().uuid().nullable().optional(),
  batchSize: z.number().int().min(1).max(500).default(500)
});
export type DecayChunkJob = z.infer<typeof DecayChunkJobSchema>;

/** Envelope placed on the DLQ after a chunk exhausts its retry budget. */
export const DecayDeadJobSchema = z.object({
  originalJobId: z.string(),
  failedReason: z.string().max(2000),
  attemptsMade: z.number().int().min(0),
  originalData: DecayChunkJobSchema
});
export type DecayDeadJob = z.infer<typeof DecayDeadJobSchema>;

export interface DecayQueueTopology {
  queue: Queue<DecayChunkJob>;
  dlq: Queue<DecayDeadJob>;
}

export function createDecayQueues(connection: ConnectionOptions): DecayQueueTopology {
  const defaultJobOptions = {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2_000 },
    removeOnComplete: { age: 24 * 3600, count: 10_000 },
    removeOnFail: false
  };

  const queue = new Queue<DecayChunkJob>(DECAY_QUEUE_NAME, {
    connection,
    defaultJobOptions,
    streams: { events: { maxLen: 10_000 } }
  });

  const dlq = new Queue<DecayDeadJob>(DECAY_DLQ_QUEUE_NAME, {
    connection,
    defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
    streams: { events: { maxLen: 10_000 } }
  });

  return { queue, dlq };
}

/** Enqueue the first (or next) cursor batch; capped at 500 rows per B-02. */
export async function enqueueDecayChunk(
  topology: DecayQueueTopology,
  data: z.input<typeof DecayChunkJobSchema>
): Promise<void> {
  await topology.queue.add('process-chunk', DecayChunkJobSchema.parse(data));
}

/** Park an exhausted chunk on the DLQ for operator triage / replay (S4 worker). */
export async function parkDecayDeadLetter(
  topology: DecayQueueTopology,
  dead: DecayDeadJob
): Promise<void> {
  await topology.dlq.add('dead-chunk', DecayDeadJobSchema.parse(dead));
}
