# Runbook — Sprint 0 Local Environment Bootstrap

## Prerequisites

- Node.js ≥ 20 (`node --version`)
- Docker Desktop (for integration tests) — **not** required for unit tests
- A `.env` file (copy `.env.example`)

## 1. Install dependencies

```bash
npm install
```

If your npm shim blocks install scripts, regenerate Prisma once:

```bash
npx prisma generate
```

## 2. Local datastores (compose: postgres + redis)

```bash
docker compose up -d
docker compose ps          # wait for healthy
```

| Service  | Host port | Connection string for .env                                        |
| -------- | --------- | ----------------------------------------------------------------- |
| Postgres | 5433      | `TEST_DATABASE_URL=postgresql://learnos:learnos-dev@localhost:5433/learnos_test` |
| Redis    | 6380      | `TEST_REDIS_URL=redis://localhost:6380`                            |

> Runtime secrets (Supabase pooled `DATABASE_URL`, Upstash `REDIS_URL`,
> Pinecone keys) live in `.env` per Doc 07 §10 secrets matrix.

## 3. Apply the migration

```bash
# against the ephemeral test DB:
TEST_DATABASE_URL=postgresql://learnos:learnos-dev@localhost:5433/learnos_test \
  npm run db:migrate

# or against staging via DIRECT_URL from .env:
npm run db:migrate
```

The migration is forward-only and idempotent-safe on re-run.

## 4. Test gates

```bash
npm run typecheck        # tsc --noEmit must be clean
npm run test             # everything reachable; integration suites skip gracefully
npm run test:unit        # precedence · dag-validator · mutex(memory) · cli-e2e
npm run test:integration # migration · rls-truth-table · mutex(real Redis)
npm run test:coverage    # G1/G2 gate: ≥85% on src/**
```

Integration suites auto-skip when their datastore is unreachable, so the suite
stays green on machines without Docker.

## 5. Curriculum CLI usage

```bash
# Dry validation (default behaviour):
npx tsx scripts/ingest-curriculum.ts --file=./curricula/gcse_maths_edexcel.json --validate-dag

# Machine-readable result:
npx tsx scripts/ingest-curriculum.ts --file=./curricula/python_programming.json --json

# Validate then index into Pinecone (requires PINECONE_API_KEY):
npx tsx scripts/ingest-curriculum.ts --file=./curricula/gcse_maths_edexcel.json --index
```

Exit codes: `0` ok · `1` validation failure · `2` indexing failure · `3` usage error.

Demo of deliberate corruption failing loudly:

```bash
npx tsx scripts/ingest-curriculum.ts --file=./tests/fixtures/curricula.cycle.json
# → [CYCLE] Prerequisite cycle detected ... Cycle path: topic_a -> topic_c -> topic_b -> topic_a
```

## 6. Pinecone init & seed (S0-T7)

```bash
npm run pinecone:init                      # create learnos-curriculum-rag if missing
npm run pinecone:seed -- --sanity-query    # seed 3 subjects + top-3 retrieval check
```

For CI/dev without paid embeddings set `LEARNOS_EMBEDDINGS=hash`
(deterministic local vectors — never use in production).

## 7. Sprint 0 exit-criteria checklist

- [ ] Staging DB migrated; RLS truth table green under app roles (`rls-truth-table.spec`)
- [ ] Mutex merged behind interface (Upstash adapter + in-memory adapter)
- [ ] CLI validates all 3 subject fixtures; Pinecone seeded & top-3 queryable
- [x] Compose bootstrap (this runbook §2)
- [ ] Demo: ingest→validate cycle incl. corrupt curriculum failing loudly (§5)
