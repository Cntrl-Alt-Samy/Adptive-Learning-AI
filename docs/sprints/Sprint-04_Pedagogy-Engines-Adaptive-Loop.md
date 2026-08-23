# Sprint 4 — Pedagogy Engines & Adaptive Loop
**Phase 2** | **Window:** 2026-10-27 → 2026-11-09 | **Owner:** BE/AI Eng + FE support
**Epic ref:** Doc 07 · EPIC 3 (TASK 3.2–3.3) + PRD F2, F4–F8 | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Build the complete adaptive teaching loop as **pure, tested engines**: CAT diagnostic calibration (F2), prerequisite-respecting roadmap planner (F4), 5-part delivery gating + 3-strike breaker (F5), Socratic scaffolding with dynamic escalation (F6), tiered practice with uniqueness windows (F7), progress matrix + spaced-rep scheduling (F8), the rolling Ebbinghaus decay worker (B-02 fix), and Roadmap RAG pre-fetch (B-04 fix). This is the algorithmic heart of the product — every engine is a pure module with golden tests before wiring.

## 2. Entry Criteria

- S2 exit: state machine + tools live; `learning_dna` writers verified.
- S3 exit: workspace renders streamed delivery + check-in events.

## 3. Scope & Tasks

| ID | Task | Subtasks / Algorithm Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S4-T1** | CAT diagnostic engine (F2) | Pure selection policy over concept-tagged question bank: pick next item targeting current ability estimate (1PL-style difficulty targeting; deterministic w/ seed); stop rule at 4–5 items or confidence band; output = Calibrated Level + Gap Map (3–6) + Strength Map. **No intermediate pass/fail surfaced.** | PRD F2.1–F2.3 |
| **S4-T2** | Roadmap generator (F4) | Input: gap map + time budget {15/30/45/60/90} + prereq DAG (from S0 store). Topological packing by difficulty & estimated minutes; emits roadmap + **explicit exclusions list**; deterministic given seed. Complexity O(V+E log V). | PRD F4.1–F4.2 |
| **S4-T3** | 5-part delivery gating + check-in (F5) | Delivery card enforces part order; check-in verdict gate blocks progression until pass; confusion ⇒ auto-reteach with rotated analogy bank (no immediate repeat). Grounded context injected from T01 only. | PRD F5.1–F5.3 |
| **S4-T4** | Socratic loop + escalation (F6, M-01) | 4-stage inquiry sequence state machine; per-response classification SOLID/PARTIAL/NEEDS_WORK drives scaffold depth; struggle signal (NEEDS_WORK ×1 or PARTIAL ×2 on prior turns) flips router to Tier-1 model via S1 context flag. | Doc 04 §10.1 |
| **S4-T5** | 3-strike circuit breaker | Counter per concept: strike 1 ⇒ hint + everyday analogy; strike 2 ⇒ decompose into sub-steps; strike 3 ⇒ tag `NEEDS_REVISIT` in DNA + pivot to prerequisite node or breather offer; PostHog event emitted. Explicit FSM, reset on mastery. | Doc 04 §13.1 |
| **S4-T6** | Tiered practice generator (F7) | 3 tiers (Recall/Application/Synthesis); uniqueness via content-hash registry checked across rolling 30-day window (Redis set + TTL); every wrong answer requires structured 'Why' + remediation steps payload. | PRD F7.1–F7.2 |
| **S4-T7** | Progress matrix + spaced rep (F8) | Pre/post delta calc (Step 8 contract: pre_score, post_score, knowledge_gain_pct); schedule reviews at 24h/3d/7d/14d via T04 into ZSET; Reviewer Mode 6 emits portable starter prompt. | PRD F8.1–F8.2 |
| **S4-T8** | Rolling decay worker (B-02) | BullMQ processor: cursor-paginated chunks of 500 (`learning_dna` where stale), formula `score' = max(10, score·e^(−decayRate·Δdays))`, status re-band (≥80 SOLID / ≥50 PARTIAL / else NEEDS_WORK), single tx per chunk, then enqueue next chunk. Concurrency 2; kill-safe resume from last committed cursor. | Doc 04 §5.1 |
| **S4-T9** | Roadmap RAG pre-fetch (B-04) | On Step-4 approval: batch-fetch ~12 chunks for roadmap concepts → Redis `session:{id}:rag_cache` TTL 7200s; tutor turns read cache-first (<3ms path), Pinecone only on miss. | Doc 04 §12.1 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `cat.simulation.spec` | Monte Carlo unit sim | ≥90% of 10k synthetic learners calibrated within ±1 level band of ground truth; no intermediate verdict leakage possible by construction |
| `roadmap.planner.spec` | Unit + property | Always fits time budget; never violates prereq order; exclusions non-empty when truncation occurs; identical inputs+seed ⇒ identical plan |
| `strike-breaker.fsm.spec` | Unit (exhaustive) | All sequences of pass/fail map to correct intervention; 3rd fail always pivots/flags; counter resets only on mastery event |
| `practice.uniqueness.spec` | Integration | Same learner cannot receive duplicate question hash within window; registry expiry honored |
| `decay.math.spec` | Golden values | Formula goldens incl. boundaries: floor clamps at 10.0; Δ=0 ⇒ unchanged; status bands flip exactly at 50/80 |
| `decay.worker.integration.spec` | Integration (real PG) | 5k-row synthetic set processed in ≤500-chunks; **zero lock contention** (`pg_stat` assertions); kill mid-chunk ⇒ resume, no double-decay (idempotency proven by replaying chunk) |
| `prefetch.latency.spec` | Integration | Warm path serves tutor turn from Redis <3ms; cold path falls back to Pinecone and backfills |
| `spacedrep.interval.spec` | Golden values | Due timestamps land exactly at 24h/72h/168h/336h offsets; ZSET ordering correct under clock skew fixtures |
| Coverage G1/G2 | CI | ≥85%; all engines pure (adapters mocked at edge only) |

## 5. Exit Criteria / DoD

- [ ] Headless full-session replay: intake→CAT→roadmap→teach(check-in gate)→socratic(escalation fires)→practice→review→spaced-rep queued
- [ ] Decay worker running against staging DB for 48h with dashboards (chunks/h, lock count = 0)
- [ ] All engines exported from pure-core package with documented complexity + invariants
- [ ] Demo: scripted "struggling learner" journey triggering strikes → pivot to prerequisite → recovery

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| CAT bank too thin for stable calibration | Bank minimum-size check as sprint exit; expand via curriculum fixtures |
| Escalation flapping between tiers (cost spikes) | Hysteresis: escalate fast, de-escalate only after SOLID streak of 2; cost audit rows watched daily |
