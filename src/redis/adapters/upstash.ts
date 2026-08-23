import { Redis } from 'ioredis';

/**
 * Production adapter for Upstash Redis (rediss://) or any RESP-compatible
 * Redis (local compose). BullMQ-compatible options included.
 */
export function createRedisConnection(url: string): Redis {
  if (!url || url.length === 0) {
    throw new Error('REDIS_URL is not configured — cannot create Redis connection');
  }
  const isUpstash = url.includes('upstash.io');
  return new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: null,
    ...(isUpstash ? { tls: {}, enableAutoPipelining: true } : {})
  });
}

/** Adapter exposing the minimal `RedisLike` surface over ioredis. */
export class IoredisRedisLike {
  constructor(private readonly client: Redis) {}

  eval(script: string, numKeys: number, ...keysAndArgs: string[]): Promise<unknown> {
    return this.client.eval(script, numKeys, ...keysAndArgs) as Promise<unknown>;
  }
}
