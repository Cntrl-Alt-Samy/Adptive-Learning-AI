# LearnOS � Adaptive AI Tutor Platform

> *Making the world's best tutor available to every learner, at every level, in every subject.*

Built on the **AI-Native Startup Product Development Framework**.

---

## Project Specification Suite

| # | File | Framework Section | Description |
|---|------|-------------------|-------------|
| 01 | [docs/01_10-Step-Tutor-Prompt-Framework.md](./docs/01_10-Step-Tutor-Prompt-Framework.md) | Operational Prompts | 10-step prompt system for running adaptive AI tutor sessions (v1.1 Hardened) |
| 02 | [docs/02_LearnOS-PRD.md](./docs/02_LearnOS-PRD.md) | �3 Product Requirements | Full Product Requirements Document (v1.1 Hardened) |
| 03 | [docs/03_LearnOS-AI-System-Specification.md](./docs/03_LearnOS-AI-System-Specification.md) | �8 AI System Specification | Comprehensive AI System Specification & Mode Contracts |
| 04 | [docs/04_LearnOS-TDD.md](./docs/04_LearnOS-TDD.md) | �6 Technical Design | Complete Technical Design Document & Streaming Architecture |
| 05 | [docs/05_LearnOS-Schema-Data-Model.md](./docs/05_LearnOS-Schema-Data-Model.md) | �7 Schema & Data Model | PostgreSQL DDL, Prisma Schema & Redis Data Model |
| 06 | [docs/06_LearnOS-Design-Brief.md](./docs/06_LearnOS-Design-Brief.md) | �5 Design Brief | UI/UX Design System, Tokens & AI-Native Interface Brief |
| 07 | [docs/07_LearnOS-Engineering-Plan.md](./docs/07_LearnOS-Engineering-Plan.md) | �9 Engineering Plan | Sprint Breakdown, Dependency Graph & Implementation Plan |
| 08 | [docs/08_LearnOS-Sprint-Execution-Plan.md](./docs/08_LearnOS-Sprint-Execution-Plan.md) | �9 Execution Layer | Master Sprint Plan: 8 sprints, quality gates, traceability, DoD |
| S0–S7 | [docs/sprints/](./docs/sprints/) | Per-Sprint Docs | Individual sprint scopes, testing gates & exit criteria |

---

## Document Pipeline Status

| Document | Status |
|----------|--------|
| 10-Step Prompt Framework | ? Complete |
| PRD (Product Requirements Document) | ? Complete |
| AI System Specification (�8) | ? Complete |
| Technical Design Document � TDD (�6) | ? Complete |
| Back-End Schema & Data Model (�7) | ? Complete |
| Design Brief (�5) | ? Complete |
| Engineering Plan (�9) | ? Complete |
| Sprint Execution Plan (S0–S7) | ? Complete |

---

## Development (Sprint 0 — Foundations & Tooling)

```bash
npm install          # deps + prisma generate
npm run typecheck    # tsc --noEmit gate
npm test             # unit + e2e (+ integration when datastores reachable)
docker compose up -d # local postgres:5433 / redis:6380 for integration suites
```

Local bootstrap, migration apply, CLI usage and Pinecone seeding:
see [docs/runbooks/sprint0-local-bootstrap.md](./docs/runbooks/sprint0-local-bootstrap.md).

Key entry points:

| Task | Command |
|------|---------|
| Curriculum DAG validation (dry) | `npx tsx scripts/ingest-curriculum.ts --file=<curriculum.json> --validate-dag` |
| Index curriculum to Pinecone | `... --index` |
| Seed all 3 subjects | `npm run pinecone:seed -- --sanity-query` |
| Apply DB migration | `npm run db:migrate` |

---

*Framework: AI-Native Startup Product Development Framework*
