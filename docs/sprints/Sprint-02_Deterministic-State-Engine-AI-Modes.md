# Sprint 2 — Deterministic State Engine & AI Mode Cores
**Phase 1** | **Window:** 2026-09-29 → 2026-10-12 | **Owner:** BE/AI Eng
**Epic ref:** Doc 07 · EPIC 2 (TASK 2.x state-machine engine) | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Implement the brain-stem: the external deterministic state machine across all 6 AI modes, the checkpoint parser/validator interceptor, and tool registry T01–T05. After this sprint, every session turn has a **database-guaranteed** next state regardless of LLM whimsy (PRD upgrade #2).

## 2. Entry Criteria

- S1 exit met: SSE route + two-phase commit path live.
- Mode prompts frozen (Doc 03 §4) as versioned constants.

## 3. Scope & Tasks

| ID | Task | Subtasks / Algorithm Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S2-T1** | Mode state machine | Explicit transition table over steps 0–8 × modes {PROFILER, DIAGNOSTICIAN, TUTOR, SOCRATIC_COACH, ASSESSOR, SESSION_REVIEWER}; illegal transitions throw `IllegalTransitionError(current, attempted)`. Table is data — testable exhaustively. | Doc 03 §1; PRD F3 |
| **S2-T2** | Checkpoint parser interceptor | Extract `[STATE_CHECKPOINT: {...}]` from stream tail → Zod validation per mode contract → on parse failure: regex fallback extraction → mark `soft_sync_pending` (never block stream). Payload stripped from client view. | Doc 03 §5, §8, §11 |
| **S2-T3** | Tool: `retrieve_curriculum_grounding` (T01) | Top-3 Pinecone query by concept_id w/ subject scoping; returns canonical definitions + misconceptions; result shape versioned. | Doc 03 §6 |
| **S2-T4** | Tool: `commit_state_checkpoint` (T02) | Server-side execution wired to S1 two-phase route; validates against transition table before write. | Doc 04 §6.1 |
| **S2-T5** | Tool: `get_learner_dna` (T03) | Snapshot assembler: mastery matrix for subject → compact deterministic JSON injected each turn (`DETERMINISTIC_LEARNER_STATE`). Pure serializer + DB fetch adapter. | PRD F3.3 |
| **S2-T6** | Tool: `enqueue_spaced_repetition` (T04) | Writes Redis ZSET `queue:spaced_rep:{userId}` scored by due timestamp. | Doc 05 §8 |
| **S2-T7** | Tool: `flag_academic_integrity` (T05) | Classifier (rules first, LLM fallback): learning vs cheating intent; cheating ⇒ refuse direct solution + return scaffold guidance template. Fixture corpus of homework phrasings. | Doc 03 §9.2 |
| **S2-T8** | Mastery writers | On SOCRATIC/ASSESSOR completion: upsert `learning_dna` (masteryScore, status, lastReviewedAt) in same tx as checkpoint commit. | Doc 05 §4 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `transition-table.spec` | Unit (exhaustive) | Every legal transition accepted & produces expected side-effect list; every illegal pair throws typed error; table covers all 6 modes × 8 steps |
| `parser.fuzz.spec` | Property-based/fuzz | Truncated/malformed/oversized/injected checkpoints degrade to fallback or typed error — never unhandled rejection; valid payloads 100% parsed |
| `tools.contract.spec` | Integration | Each tool round-trips against real PG/Redis/Pinecone (staging index); failure modes return typed errors with retry semantics documented |
| `integrity.classifier.spec` | Unit (fixture corpus) | ≥95% classification accuracy on labeled learning-vs-cheating corpus; refusal path emits scaffold, never a solution |
| `mode-replay.goldenspec` | Golden replay | Pre-recorded mock-LLM streams per mode produce byte-identical committed states across runs (determinism proof) |
| Coverage G1/G2 | CI | ≥85%; zero `any` on schema boundaries |

## 5. Exit Criteria / DoD

- [ ] Scripted headless session walks all 8 steps via mock LLM with state persisted at every checkpoint
- [ ] Kill-and-resume drill: process death after Phase-1 commit resumes at correct step (with S1 test extended here)
- [ ] All five tools registered, versioned, documented in tool registry README
- [ ] Soft-sync flag observable; re-drive job scheduled design note merged

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| LLM emits near-miss checkpoint JSON | Fallback extractor + soft-sync; fuzz suite guards regressions |
| Transition table drifts from prompt contracts | Single source-of-truth constants file consumed by prompts + tests |
