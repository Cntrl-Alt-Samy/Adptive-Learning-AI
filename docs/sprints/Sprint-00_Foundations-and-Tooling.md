# Sprint 0 — Foundations & Tooling
**Phase 0** | **Window:** 2026-09-01 → 2026-09-14 | **Owner:** Infra/Data Eng
**Epic ref:** Doc 07 · EPIC 1 (TASK 1.1–1.3) | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Stand up the deterministic substrate of LearnOS: provisioned datastores with hardened schema + verified RLS, Redis session-mutex primitive, BullMQ queue topology, a curriculum ingestion CLI that mathematically guarantees DAG integrity, and three seeded subjects in Pinecone. **Nothing else ships until this sprint's RLS truth table is green.**

## 2. Entry Criteria

- Approved schema v1.1 (Doc 05 §4 Prisma + §7 RLS policy).
- Cloud accounts + secrets matrix available (Doc 07 §10).

## 3. Scope & Tasks

| ID | Task | Subtasks / Algorithm Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S0-T1** | Database provisioning & initial migration | 1. Supabase PostgreSQL project: pooled URL (`DATABASE_URL`, Supavisor transaction mode :6543, `pgbouncer=true`) + direct URL (`DIRECT_URL`, :5432 for migrations). 2. Author `db/migrations/20260822_learnos_initial_schema.sql`: all 14 tables, enums, FKs, indexes (incl. `learning_dna(last_reviewed_at)` cursor index), `gen_random_uuid()`. 3. Generate Prisma client types; assert schema ↔ DDL parity via introspection diff; verify native RLS enabled on project. | Doc 05 §4–6 |
| **S0-T2** | Row-Level Security enclaves | 1. `CREATE POLICY educator_cohort_transcript_policy` on `session_turns` per Doc 05 §7. 2. Non-superuser app roles (`app_learner`, `app_instructor`, `app_admin`) with `FORCE RLS`. 3. Truth-table test harness setting `app.current_user_id` / `role` / `tenant_id` GUCs. | Doc 05 §7; B-03 |
| **S0-T3** | Tenant precedence resolver (pure module) | `resolveAccess(requester, targetUser) -> ALLOW_RAW \| ALLOW_AGGREGATE_ONLY \| DENY`, encoding Tier B > A > C. Pure function — no I/O; consumed by API layer later. | Doc 04 §7 |
| **S0-T4** | Redis provisioning + session mutex | Key `lock:session:user:{userId}`, TTL 30s heartbeat. Atomic acquire/release via single-round-trip Lua (GET+SET NX+TTL fused). Heartbeat refresher; supersede semantics return existing sessionId for `4009_SESSION_SUPERSEDED`. | Doc 05 §8; Doc 04 §13.2 |
| **S0-T5** | BullMQ queue topology | `decay-processing` queue declared with connection config, DLQ, and job schemas (worker logic lands S4). | Doc 04 §5.1 |
| **S0-T6** | Curriculum ingestion CLI (`scripts/ingest-curriculum.ts`) | Parse curriculum JSON → validate → (flag) upsert to Pinecone. Validation pipeline (pure): ① schema check ② unique concept IDs ③ referential integrity of prereq edges ④ self-loop rejection ⑤ **cycle detection = Kahn's algorithm; on failure report full cycle path**, not boolean ⑥ difficulty monotonicity warning along prereq chains ⑦ cross-subject edge guard. Exit codes distinguish validation vs indexing failures; `--validate-dag` runs dry by default. | Doc 07 TASK 1.3; Doc 04 §12.2 |
| **S0-T7** | Pinecone init + seed | Create serverless index `learnos-curriculum-rag`; chunk-by-concept-node metadata schema (subject_id, concept_id, prereq_ids, difficulty); ingest GCSE Maths (Edexcel), Python, Economics fixtures. | Doc 05 §9 |

## 4. Testing Gates (blockers for exit)

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `migration.spec` | Integration (real PG 16 container) | Applies clean on fresh DB; re-run is idempotent-safe (forward-only enforced); introspection matches `schema.prisma` |
| `rls-truth-table.spec` | Integration | All cells pass: {learner, instructor, admin} × {adult, minor+consent, minor−consent} × {own, cohort, cross-tenant} — minor transcripts locked unless consent flag true (B-03) |
| `precedence.spec` | Unit (property-based) | Precedence resolver exhaustive over requester/target tier matrix; fails closed on unknown tiers |
| `mutex.spec` | Integration (real Redis) | Dual concurrent acquire ⇒ exactly one winner; release requires ownership token; TTL expiry frees lock; heartbeat extends |
| `dag-validator.spec` | Unit | Valid DAG passes; cycle/dangling-ref/self-loop/dup-ID each rejected **with precise diagnostic incl. cycle path**; O(V+E) holds on 10k-node synthetic graph (<1s) |
| `cli-e2e.spec` | E2E (dry run) | Fixture curricula for 3 subjects validate; malformed fixture exits non-zero with human-readable error report |
| Coverage gate G1/G2 | CI | ≥85% on all new modules; `tsc --noEmit` clean |

## 5. Exit Criteria / DoD

- [ ] Staging DB migrated; RLS active under non-superuser roles (G3, G4 green)
- [ ] Mutex primitive merged behind interface (Upstash prod adapter + in-memory test adapter)
- [ ] CLI validates all 3 subject fixtures; Pinecone seeded & queryable (top-3 retrieval sanity check)
- [ ] Runbook: local env bootstrap (compose file: postgres+redis), migration apply, CLI usage
- [ ] Demo: ingest→validate cycle demo incl. deliberately corrupt curriculum failing loudly

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| RLS bypassed accidentally via superuser/pooled roles | `FORCE ROW LEVEL SECURITY`; integration tests connect only as app roles |
| Prisma↔DDL drift over time | Introspection-diff step added to CI from day one |
