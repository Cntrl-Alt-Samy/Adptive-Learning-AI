import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).optional(),
  PINECONE_API_KEY: z.string().min(1).optional(),
  PINECONE_INDEX: z.string().min(1).default('learnos-curriculum-rag'),
  TEST_DATABASE_URL: z.string().min(1).optional(),
  TEST_REDIS_URL: z.string().min(1).optional()
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  cached = EnvSchema.parse(process.env);
  return cached;
}

/** Test seam — clears the memoised env so mutated process.env is re-read. */
export function resetEnvCache(): void {
  cached = null;
}
