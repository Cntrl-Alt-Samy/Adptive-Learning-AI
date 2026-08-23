# Sprint 6 — Integration, Golden Evals & Closed Beta
**Phase 3** | **Window:** 2026-11-24 → 2026-12-07 | **Owner:** Whole team
**Epic ref:** Doc 07 · EPIC 4 (TASK 4.3 beta) + Doc 03 §12 eval framework | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Prove the whole system against reality: run the complete 10-step journey end-to-end across all modes, stand up the golden evaluation framework (200 benchmark dialogues ≥95%), verify unit economics ≤£0.05/session, and operate a 500-learner closed beta with live quality dashboards.

## 2. Entry Criteria

- S0–S5 exits met; all engines on staging behind flags.
- Beta cohort recruited + consent/onboarding pack ready (minors only enter post-S5 enclave verification).

## 3. Scope & Tasks

| ID | Task | Subtasks / Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S6-T1** | Full-journey E2E hardening | Scripted + exploratory runs of intake→CAT→roadmap→delivery→socratic→practice→review→spaced-rep return visit; happy path AND struggle paths (strikes, escalation, failover, reconnect). Defect burn-down with daily triage. | All prior sprints |
| **S6-T2** | Golden eval framework | 200 benchmark dialogues (per subject × persona × struggle-profile); automated rubric scoring (grounding citations present, pedagogy standard adherence, verdict accuracy); weekly scheduled run wired into CI dashboard. Gates: ≥95% pass, factual syllabus accuracy ≥99.2%, calibration agreement ≥82%. | Doc 03 §12–13; G6 |
| **S6-T3** | Cost verification | Replay representative session corpus through audit rows: blended inference cost/session ≤£0.05 (target ~£0.035); cache hit rate ≥85%; per-mode cost table published. Router/breaker flags tuned if drift detected. | G7; Doc 03 §14 |
| **S6-T4** | Observability completion | Dashboards: TTFT P95, stream error rate, checkpoint commit latency, decay chunk lag, strike-breaker events, cache hits. Alerts wired to on-call channel. | Doc 04 §15 |
| **S6-T5** | Closed beta launch (n=500) | Staged waves 50→150→500; Sentry/PostHog live monitoring; weekly expert spot-check of 50 random sessions; in-product feedback + "Flag Explanation" queue triage SLA 48h. | Doc 07 TASK 4.3.2; Doc 03 §10 |
| **S6-T6** | Beta exit review | Metrics vs targets: completion ≥75%, knowledge gain trending ≥35%, Sev-1 count = 0, eval gate green; Go/No-Go recommendation for GA with launch-blocking list. | PRD §11 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `journey.e2e.regression` | Playwright suite on staging | All critical journeys green including failure/restore paths |
| `golden-evals` | Eval harness (G6) | ≥95% / 200 dialogues; accuracy and calibration KPIs met (Doc 03 §13) |
| `cost.audit.report` | Replay analytics (G7) | ≤£0.05/session blended; anomalies itemized with owner + fix |
| `beta.health` | Production telemetry | Crash-free sessions ≥99.5%; p95 turn latency within budget; no unbounded queue growth |
| Coverage G1/G2 | CI | Maintained ≥85% on fixes |

## 5. Exit Criteria / DoD

- [ ] 500 learners onboarded; ≥75% session completion evidenced
- [ ] Golden eval gate green two consecutive weekly runs
- [ ] Cost report signed off; router config frozen for GA
- [ ] Launch-blocking defect list empty; Go recommendation recorded

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| Eval rubric gaming / goodharting | Rubric locked before beta; expert spot-checks sample independently |
| Beta load surprises at modest scale | Waves cap blast radius; autoscaling rehearsal pulled forward from S7 if wave-2 saturates |
