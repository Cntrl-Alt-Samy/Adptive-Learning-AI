# Sprint 1 — Gateway, Security & Model Orchestration
**Phase 1** | **Window:** 2026-09-15 → 2026-09-28 | **Owner:** BE/AI Eng
**Epic ref:** Doc 07 · EPIC 2 (TASK 2.1–2.2) | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Deliver the secured streaming spine: an Edge SSE gateway with injection defense, asymmetric model routing with prompt-prefix caching and failover, and the **two-phase commit protocol** that makes state writes survive client disconnects (fixes B-01).

## 2. Entry Criteria

- S0 exit met: DB reachable via Supavisor pooler, mutex primitive available, Prisma types generated.
- Model API keys provisioned (OpenAI, Anthropic) in secret store (never in repo/env commits).

## 3. Scope & Tasks

| ID | Task | Subtasks / Algorithm Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S1-T1** | tRPC API scaffold + Edge SSE route | Router skeleton (session, health); SSE endpoint streaming normalized events (`token`, `checkpoint_confirmed`, `error`). Event contract versioned as Zod schema. | Doc 04 §6 |
| **S1-T2** | Edge Prompt-Injection Sanitizer | Layered filter: ① blocklist regex families (instruction-leak attempts e.g. "repeat the above instructions", jailbreak roleplay "DAN/developer mode") ② LaTeX delimiter neutralization (anti-XSS) ③ control-char/zero-width stripper ④ size clamp. Pure function `sanitize(input) -> {clean, flags[]}`; every rule ships with adversarial fixtures. | Doc 04 §14.1 |
| **S1-T3** | Asymmetric model router | Pure decision table: Mode 3 + Step 4 → Tier 1 (GPT-4o/Sonnet); Modes 2/4/5 grading → Tier 2 (4o-mini/Haiku); Modes 1/6 parsing/formatting → Tier 3. Unknown mode ⇒ default Tier 2 (fail-safe cheap). Emits chosen model + cache directives into request context. | Doc 03 §3 |
| **S1-T4** | Static prompt-prefix caching | Fixed 1,100-token prefix assembled from immutable constants; cache headers set for OpenAI/Anthropic; Langfuse hook records `prompt_cache_hit`. Target metric wired into dashboards now (≥85% hit rate asserted at S6). | Doc 04 §11 |
| **S1-T5** | Failover circuit breaker | Per-provider breaker: OPEN after N consecutive failures or timeout >4s → route to Claude 3.5 Sonnet; half-open probe recovery. State machine as explicit table (`CLOSED/HALF_OPEN/OPEN`) with jittered retry. | Doc 03 §11; M-01 resilience |
| **S1-T6** | Two-phase commit streaming route | Phase 1: server-side tool execution of `commit_state_checkpoint(statePayload)` inside one atomic Postgres transaction **before** emitting terminal event. Phase 2: emit `checkpoint_confirmed`. Client disconnect mid-stream must never lose committed state. Idempotency key = (sessionId, stepNumber) unique constraint. | Doc 04 §6.1; B-01 |
| **S1-T7** | Cost audit rows | Every LLM call writes `ai_execution_audits` row (model, tokens, cost_gbp, latency, cache_hit). | Doc 05 §12 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `sanitizer.adversarial.spec` | Unit (fixture corpus) | 100% of checked-in injection/XSS payloads blocked or defanged; benign corpus zero false-positive regressions |
| `router.decision-table.spec` | Unit | Exhaustive mode×step matrix routes to correct tier; unknown inputs fail safe |
| `breaker.chaos.spec` | Unit w/ fake clock | Timeout >4s trips breaker; fallback engages; half-open recovery works; no thundering-herd on probe |
| `twophase.spec` | Integration (mock LLM transport, real PG) | **Client killed mid-stream ⇒ committed checkpoint present in DB**; duplicate commit attempts no-op via idempotency key |
| `sse.contract.spec` | Contract | Stream events round-trip against Zod schemas; malformed upstream chunks degrade to typed `error` event, never raw crash |
| `cache.audit.spec` | Integration | Second identical turn hits cache path (asserted via audit rows + mocked SDK counters) |
| Coverage G1/G2 | CI | ≥85%; strict types on all boundary crossings |

## 5. Exit Criteria / DoD

- [ ] End-to-end streamed turn over staging: sanitize → route → stream → two-phase commit → confirmed event
- [ ] Forced provider outage drill: traffic fails over to Sonnet within budget; breaker metrics visible
- [ ] Audit rows populated for every call type; cost-per-turn visible in dashboard
- [ ] Runbook: breaker states, manual drain, flag toggles for routing overrides

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| Cache-key drift breaks prefix caching silently | Snapshot test pins prefix bytes; any change requires deliberate bump + review |
| Sanitizer false positives harming pedagogy tone | Benign-corpus suite; flags logged (not silently dropped) for tuning |
