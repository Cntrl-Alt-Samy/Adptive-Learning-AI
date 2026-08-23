# Sprint 7 — Scale, Security Audit & Public Launch
**Phase 4** | **Window:** 2026-12-08 → 2026-12-21 | **Owner:** Infra Eng + whole team
**Epic ref:** Doc 07 · EPIC 5 (TASK 5.1–5.2) | **Master plan:** [08_LearnOS-Sprint-Execution-Plan.md](../08_LearnOS-Sprint-Execution-Plan.md)

---

## 1. Sprint Goal

Certify the platform under production stress: pass 10k-concurrent streaming load with zero decay-worker lock contention, close all penetration-test and prompt-injection findings, execute blue-green deployment, and flip to public GA inside the Dec 8–18 window.

## 2. Entry Criteria

- S6 Go recommendation approved; launch-blocking beta fixes merged.
- Pen-test vendor engaged with staging access provisioned.

## 3. Scope & Tasks

| ID | Task | Subtasks / Notes | Refs |
| :--- | :--- | :--- | :--- |
| **S7-T1** | k6 load certification | Scenario: 10,000 concurrent SSE sessions with realistic turn pacing (think-time distributions), mixed modes per persona mix; soak variant 4h. Asserts: error rate <0.1%, TTFT P95 <1,200ms (G8), no connection-pool exhaustion via Supavisor pool caps (20/container). | Doc 07 §16 |
| **S7-T2** | Decay worker under load proof | Run decay processing during peak synthetic load: assert zero blocking locks (`pg_stat_activity` monitoring), flat CPU, chunk throughput SLO met. | B-02; G9 |
| **S7-T3** | Autoscaling drills | ECS Fargate scale-out/in under load; Vercel Edge behavior; Redis evictions policy check; chaos drills: kill worker mid-chunk, kill API pod mid-stream (resume correctness re-verified at scale). | Doc 04 §8 |
| **S7-T4** | Security remediation | External pen test + prompt-injection/red-team audit; SLA: criticals fixed before GA, highs fixed or risk-accepted by CTO with mitigation; sanitizer corpus extended with any novel bypasses found. | G10 |
| **S7-T5** | Blue-green production deploy | AWS ECS + Vercel Edge cutover plan: green env soak with mirrored traffic → smoke suite (journey set from S6) → DNS/traffic shift → instant rollback drill rehearsed. Migrations verified forward-only compatible during window. | Doc 07 TASK 5.2.2 |
| **S7-T6** | Launch operations | On-call rota + runbooks (breaker states, queue drain, flag toggles, rollback), status page, support macros, telemetry freeze checklist, GA announcement. PostHog milestone conversion live from minute one. | Doc 04 §15 |

## 4. Testing Gates

| Suite | Type | Pass Condition |
| :--- | :--- | :--- |
| `k6.certification` | Load (G8/G9) | Targets in §3 S7-T1/T2 met on two consecutive runs (flake-proofing) |
| Chaos suite | Resilience | Worker/pod kills at load cause zero state corruption; resume paths proven |
| Smoke suite (GA gate) | E2E prod-green | Full journey set green against green environment pre-cutover and post-cutover |
| Security sign-off | External | Zero open criticals; highs closed or formally accepted |
| RLS regression (final) | Integration | Truth table green against production schema snapshot |

## 5. Exit Criteria / DoD

- [ ] Public GA traffic served; SLOs green for 7 consecutive days post-launch
- [ ] Load, chaos, security evidence archived in compliance folder
- [ ] Runbook library complete; on-call handed over with game-day exercise done
- [ ] Program retrospective held; v1.1 backlog seeded from beta + eval insights

## 6. Risks & Watch Items

| Risk | Mitigation |
| :--- | :--- |
| Holiday-season freeze compressing remediation time | Pen test booked to start day 1; criticals-only launch blocker rule agreed upfront |
| Load reveals Supabase/Supavisor pool ceiling | Pool headroom tested at 1.5× target in rehearsal; connection-count alarm at 70% |
