# Sprint 5 — Privacy Enclaves, Credentialing & Educator Portal
**Phase 3** | **Window:** 2026-11-10 → 2026-11-23 | **Owner:** BE Eng + FE support
**Epic ref:** Doc 07 · EPIC 4 (TASK 4.1–4.3 partial) | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Make LearnOS safe for minors and valuable to institutions: enforce the Tier B COPPA/GDPR-K enclave end-to-end (PII scrubbing, consent-gated transcript access), ship F10 badge/certificate credentialing, and deliver the educator analytics portal (F11) that can **only** see aggregate data for minors.

## 2. Entry Criteria

- S0 RLS truth table still green (re-run required).
- S4 adaptive loop stable on staging (badges consume its mastery events).

## 3. Scope & Tasks

| ID | Task | Subtasks / Algorithm Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S5-T1** | PII scrubber pipeline | Layered scrub for Tier B outbound logs/transcripts/analytics: ① regex families (emails, phones, postcodes) ② name-entity detection via lightweight NER pass ③ allowlist dictionary (subject vocabulary must not be scrubbed) ④ replacement tokens preserving message shape. Pure function; runs before any persistence/telemetry write. | Doc 07 TASK 4.2.1 |
| **S5-T2** | Parental consent flow | Signed consent token (Ed25519): issue → verify → store `parental_consent_verified`; tamper/expiry rejection paths; verification unlocks raw transcript access ONLY via precedence resolver ALLOW_RAW branch. | Doc 04 §7.1 |
| **S5-T3** | Transcript lock enforcement | Educator console queries route through precedence resolver + RLS (defense in depth): minors without consent return aggregates-only API shape; attempt to query raw rows returns typed `TRANSCRIPT_LOCKED`. Re-run full RLS truth table incl. new roles. | B-03; Doc 05 §7 |
| **S5-T4** | Badge unlock evaluator (F10) | Rule engine over badge `criteria` JSON (e.g., mastery ≥X on concept set, session streak); triggered on mastery-write events; idempotent awarding via unique (userId,badgeId). Decision table pure module. | Doc 05 §4 badges |
| **S5-T5** | Certificate engine (F10) | Verifiable PDF/SVG generation: template render + unique `verification_code` (Crockford base32, collision-checked) + public verification endpoint; asset storage signed URLs. | Doc 07 TASK 4.1.2 |
| **S5-T6** | Educator portal (F11) | Cohort misconception matrix (aggregate % failed-by-concept), syllabus topic locking (writes cohort bounds consumed by S4 roadmap planner), roster view. All educator queries go through aggregation service — no row-level transcript fetches for locked cohorts. | Doc 03 §10; PRD F11 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `pii.redteam.spec` | Adversarial corpus | ≥99% recall on checked-in corpus (500+ synthetic PII variants incl. obfuscation "name dot surname at"); zero subject-vocabulary false positives; property test: output contains no corpus PII |
| `consent.crypto.spec` | Unit | Valid token verifies; expired/tampered/wrong-key/replayed all rejected with distinct typed errors |
| `lock.enforcement.e2e` | E2E + integration | Educator on minor−consent cohort: API returns aggregates only; direct raw query blocked by app layer AND RLS (both independently asserted) |
| `badge.rules.table.spec` | Unit (decision table) | Every criteria shape awards exactly once; duplicate event replays are no-ops; revocation semantics documented |
| `certificate.roundtrip.spec` | Integration | Generate → verify endpoint accepts genuine code; rejects unknown/altered codes; PDF/SVG opens with correct fields |
| `rls-truth-table.regression` | Integration (G4 re-run) | 100% cells green incl. instructor/admin roles added in S5 |
| Coverage G1/G2 | CI | ≥85% |

## 5. Exit Criteria / DoD

- [ ] End-to-end drill: minor account → session → educator console shows aggregates-only; consent granted → raw view unlocks; consent revoked → re-locks
- [ ] Badge awarded on staged mastery event; certificate verifiable via public URL
- [ ] Educator can lock topics and roadmap planner demonstrably respects bounds
- [ ] DPIA checklist updated; data-flow diagram annotated with scrub points

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| Scrubber degrades pedagogy text quality | Shape-preserving tokens; diff-review tooling for sampled outputs during beta |
| Aggregate re-identification on tiny cohorts | k-anonymity floor (suppress cells <5 learners) built into aggregation service |
