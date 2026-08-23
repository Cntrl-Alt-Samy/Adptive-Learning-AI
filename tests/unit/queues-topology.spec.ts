import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * S0-T5 topology wiring — BullMQ Queue is mocked; we verify connection
 * config, queue names, DLQ wiring and schema-parsed payloads.
 */
const queueInstances: Array<{ name: string; opts?: Record<string, unknown>; add: ReturnType<typeof vi.fn> }> = [];

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string, opts: Record<string, unknown>) => {
    const instance = { name, opts, add: vi.fn().mockResolvedValue(undefined) };
    queueInstances.push(instance);
    return instance;
  })
}));

import {
  createDecayQueues,
  enqueueDecayChunk,
  parkDecayDeadLetter,
  DECAY_QUEUE_NAME,
  DECAY_DLQ_QUEUE_NAME,
  type DecayQueueTopology
} from '../../src/queues/decay.js';

describe('decay queue topology (S0-T5)', () => {
  let topology: DecayQueueTopology;

  beforeEach(() => {
    queueInstances.length = 0;
    topology = createDecayQueues({ url: 'redis://localhost:6380' });
  });

  it('declares decay-processing + DLQ with BullMQ-safe connection options', () => {
    expect(topology.queue.name).toBe(DECAY_QUEUE_NAME);
    expect(topology.dlq.name).toBe(DECAY_DLQ_QUEUE_NAME);
    expect(queueInstances.every((q) => q.opts && 'connection' in q.opts)).toBe(true);
    // retry budget before DLQ parking
    const opts = topology.queue.opts as { defaultJobOptions?: { attempts?: number } };
    expect(opts.defaultJobOptions?.attempts).toBeGreaterThan(0);
  });

  it('enqueueDecayChunk validates then forwards chunk jobs', async () => {
    await enqueueDecayChunk(topology, { cursorId: null, batchSize: 500 });
    await enqueueDecayChunk(topology, {}); // defaults applied by zod
    expect(topology.queue.add).toHaveBeenNthCalledWith(
      1,
      'process-chunk',
      { cursorId: null, batchSize: 500 }
    );
    expect(topology.queue.add).toHaveBeenNthCalledWith(
      2,
      'process-chunk',
      { cursorId: undefined, batchSize: 500 }
    );
    await expect(enqueueDecayChunk(topology, { batchSize: 9999 })).rejects.toThrow();
  });

  it('parkDecayDeadLetter writes validated envelopes to the DLQ', async () => {
    const dead = {
      originalJobId: 'job-42',
      failedReason: 'boom after retries',
      attemptsMade: 5,
      originalData: { cursorId: null, batchSize: 500 }
    };
    await parkDecayDeadLetter(topology, dead);
    expect(topology.dlq.add).toHaveBeenCalledWith('dead-chunk', dead);
    await expect(parkDecayDeadLetter(topology, { ...dead, attemptsMade: -3 })).rejects.toThrow();
    expect(topology.dlq.add).toHaveBeenCalledTimes(1);
  });
});
