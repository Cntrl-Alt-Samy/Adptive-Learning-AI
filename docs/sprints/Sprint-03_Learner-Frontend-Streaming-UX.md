# Sprint 3 — Learner Frontend Workspace & Streaming UX
**Phase 2** | **Window:** 2026-10-13 → 2026-10-26 | **Owner:** FE Eng
**Epic ref:** Doc 07 · EPIC 3 (TASK 3.1 partial) + PRD F1 UI | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Ship the crash-proof learner experience shell: KaTeX streaming buffer that cannot be broken by fragmented LaTeX, the 3-column workspace with HUD, hybrid intake (rapid <60s + conversational), and reconnect/resume from server-committed state. FE lane runs parallel to backend hardening (Doc 07 §12).

## 2. Entry Criteria

- S1 SSE event contract frozen (Zod schemas published).
- Design tokens from Doc 06 applied to theme layer.

## 3. Scope & Tasks

| ID | Task | Subtasks / Algorithm Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S3-T1** | `KaTeXStreamBuffer.tsx` | Split-stream renderer: completed `$$…$$` blocks render via KaTeX (`throwOnError:false` + try/catch fallback span); incomplete tail delimiters render pulsing skeleton while `isStreaming`. Error boundary wrapper isolates math crashes from chat shell. | Doc 04 §4.1 |
| **S3-T2** | 3-column workspace shell | Sidebar (roadmap/DNA), Center Stage (streamed tutor canvas), Right HUD (step indicator, mode badge, timer). Responsive collapse ≤1024px. | Doc 06; Doc 07 TASK 3.1.2 |
| **S3-T3** | Accessibility layer | OpenDyslexic toggle (persisted), WCAG AA contrast audit, screen-reader semantics on HUD/steps, reduced-motion respect. | PRD §8 |
| **S3-T4** | Hybrid intake screens (F1) | Option A: single-screen multi-select widget (subject, level, goal, frustration, time, modality) submits one turn — target end-to-end <60s incl. profile confirmation. Option B: conversational discovery reusing Profiler Mode 1 parser. Both converge to identical `LearnerPersona` payload. | PRD F1.1–F1.3 |
| **S3-T5** | Reconnect/resume UX | On socket loss: exponential backoff; on rejoin, hydrate transcript + HUD from last `checkpoint_confirmed` state (server is source of truth). Superseded-device banner on `4009_SESSION_SUPERSEDED`. | Doc 04 §13.2; §11 fallbacks |
| **S3-T6** | Stream resilience UI | Skeleton states, typed error banners with retry, offline indicator. No raw stack traces ever rendered. | Doc 06 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `katex-buffer.stress.spec` | Property-based (G5) | Synthetic corpus of fragmented LaTeX streams (split at every byte offset class) renders or safely degrades 100% — zero white-screen crashes |
| `intake.e2e.spec` | Playwright | Rapid intake completes profile→confirmation in <60s on throttled CPU profile; both options emit identical persona payload |
| `resume.e2e.spec` | Playwright + route kill | Kill WS/SSE mid-turn → auto-reconnect → state restored exactly from last confirmed checkpoint |
| `a11y.audit` | axe-core CI | Zero critical violations on workspace + intake routes |
| `visual.regression` | Storybook snapshots | HUD/buffer states pinned (streaming, error, empty, complete) |
| Coverage G1/G2 | CI | ≥85% on hooks/utils; components covered by interaction tests |

## 5. Exit Criteria / DoD

- [ ] Demo: full streamed concept delivery in workspace with live math rendering, HUD stepping, dyslexia font toggle
- [ ] Stress gate G5 green in CI (runs on every FE PR)
- [ ] Intake timing budget verified on staging (not just local)
- [ ] Component library documented in Storybook with a11y annotations

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| KaTeX edge cases beyond buffer (e.g. `\begin{align}` spanning chunks) | Corpus grown from beta telemetry; buffer treats any unterminated environment as pending |
| Intake churn if rapid form feels interrogative | Copy review vs Doc 06 tone; analytics event on abandonment field |
