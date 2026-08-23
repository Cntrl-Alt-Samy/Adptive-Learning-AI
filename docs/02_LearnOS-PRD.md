# Product Requirements Document (PRD)
## LearnOS � The Adaptive AI Tutor Platform
**Version:** 1.1 (Hardened) | **Status:** Approved | **Date:** August 2026
**Owner:** Product Team | **Framework:** AI-Native Startup Product Development Framework �3

---

> [!IMPORTANT]
> **v1.1 Architectural Upgrades:**
> 1. **Hybrid Intake Engine**: Combined rapid 1-screen intake (<60s) + conversational discovery to eliminate onboarding churn.
> 2. **External Deterministic State Engine**: Database-backed state machine (PostgreSQL/Redis) guarantees zero memory drift across turns.
> 3. **Curriculum RAG Grounding**: Strict retrieval-augmented grounding against accredited syllabi (GCSE, A-Level, AP, college) preventing STEM/niche hallucinations.
> 4. **Asymmetric Token Economics**: Prompt prefix caching + multi-tier model routing locks 60-min session inference cost under �0.05.
> 5. **Three-Tier Tenant Architecture**: Strict isolated data pipelines for Consumer (Adult), COPPA/GDPR-K Minor Sandbox (Zara), and Enterprise/B2B SSO (David/Rachel).

---

## Table of Contents

1. [Background & Problem Statement](#1-background--problem-statement)
2. [Market Opportunity](#2-market-opportunity)
3. [Product Vision & Objectives](#3-product-vision--objectives)
4. [User Personas & Jobs-to-be-Done](#4-user-personas--jobs-to-be-done)
5. [Product Origin & Research Foundation](#5-product-origin--research-foundation)
6. [Core Features & Requirements](#6-core-features--requirements)
7. [AI System Requirements & RAG Architecture](#7-ai-system-requirements--rag-architecture)
8. [User Experience & Interface](#8-user-experience--interface)
9. [Technical & Security Requirements](#9-technical--security-requirements)
10. [MVP Scope & Prioritisation](#10-mvp-scope--prioritisation)
11. [Success Metrics & Unit Economics](#11-success-metrics--unit-economics)
12. [Milestones & Delivery Plan](#12-milestones--delivery-plan)
13. [Risk Register & Mitigation](#13-risk-register--mitigation)
14. [Out-of-Scope Requirements](#14-out-of-scope-requirements)

---

## 1. Background & Problem Statement

### 1.1 The Problem

Education is fundamentally broken at the personalisation layer. Despite decades of pedagogical research proving that individualised instruction dramatically outperforms one-size-fits-all teaching, the vast majority of learners worldwide still experience education delivered as a broadcast � the same content, at the same pace, in the same format, regardless of who is receiving it.

Three compounding problems drive this:

**Problem 1 � The Tutor Access Gap**
One-to-one tutoring is universally accepted as the most effective form of instruction (Bloom's 2 Sigma Problem, 1984 � students with personal tutors outperform 98% of classroom-taught peers). Yet private tutoring costs �40��150 per hour in most markets, making it inaccessible to the majority of learners globally.

**Problem 2 � Static Content in a Dynamic Learning World**
Online learning platforms (Coursera, Udemy, Khan Academy) democratised access to content but did not solve personalisation. Pre-recorded videos deliver fixed explanations regardless of whether the learner understood the first attempt.

**Problem 3 � No Diagnostic Intelligence & Memory Decay**
Existing platforms cannot assess what a learner actually knows before teaching begins and have no programmatic defense against Ebbinghaus memory decay.

---

## 2. Market Opportunity

| Market Segment | 2024 Value | 2030 Projection | CAGR |
| :--- | :--- | :--- | :--- |
| Global EdTech |  |  | 16.1% |
| AI in Education | .8B | .3B | 31.2% |
| Online Tutoring | .6B | .5B | 20.5% |
| Corporate L&D |  |  | 6.1% |

---

## 3. Product Vision & Objectives

### 3.1 Vision Statement
> **LearnOS makes the world's best tutor available to every learner, at every level, in every subject � at a fraction of the cost of human instruction.**

---

## 4. User Personas & Jobs-to-be-Done (5 Validated Personas)

### 4.1 Persona 1 � The Exam Battler (Maya, 19)
- **Context:** University Economics finals in 6 weeks.
- **JTBD:** When I sit down to study, I want to know exactly what I don't understand so I can focus my limited time on high-yield revision without passive video fatigue.
- **Tenant Tier:** Tier A (Consumer Adult).

### 4.2 Persona 2 � The Career Switcher (James, 34)
- **Context:** Transitioning from Marketing to Data Science; learning evenings/weekends.
- **JTBD:** When I have 30 minutes, I want focused concept delivery with analogies grounded in marketing, not abstract CS theory.
- **Tenant Tier:** Tier A (Consumer Adult).

### 4.3 Persona 3 � The Secondary School Student (Zara, 15)
- **Context:** GCSE Maths & Chemistry; family cannot afford private tutoring.
- **JTBD:** When I struggle with a concept, I want encouraging, step-by-step guidance without feeling embarrassed, completely aligned with my GCSE exam board syllabus.
- **Tenant Tier:** Tier B (COPPA/GDPR-K Minor Sandbox � strict privacy isolation, parental consent flow, enhanced safe-mode guardrails).

### 4.4 Persona 4 � The Corporate Learner (David, 42)
- **Context:** Operations Manager taking mandatory AI & Analytics training.
- **JTBD:** I want efficient, fluff-free instruction that proves practical application to operations and awards employer-verifiable credentials.
- **Tenant Tier:** Tier C (Enterprise B2B � SSO, LMS integration, employer audit trail).

### 4.5 Persona 5 � The Educator (Dr. Rachel, 38)
- **Context:** University Lecturer managing 200+ students.
- **JTBD:** When my students use LearnOS, I want aggregated formative analytics to see cohort-wide misconceptions and assign curriculum bounds.
- **Tenant Tier:** Tier C (Educator Console & Analytics Portal).

---

## 5. Product Origin & Research Foundation
Grounded in **Bloom's 2-Sigma Problem (1984)**, **Ebbinghaus Spaced Repetition (1885)**, **Testing Effect (2006)**, **Zone of Proximal Development (Vygotsky)**, and **Socratic Inquiry**.

---

## 6. Core Features & Requirements

### 6.1 Functional Requirements

#### F1 � Hybrid Learner Profiling & Intake
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F1.1 | Provide dual intake options: **Option A (Rapid 1-Screen Intake <60s)** for high-velocity learners; **Option B (Conversational Discovery)** for guided onboarding. | Must Have |
| F1.2 | Generate structured LearnerPersona entity with subject, goal, level, time, and learning style. | Must Have |
| F1.3 | Emit deterministic state checkpoint committed to PostgreSQL on confirmation. | Must Have |

#### F2 � Diagnostic Assessment Engine (CAT)
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F2.1 | Run 4-5 question Computerized Adaptive Testing (CAT) spanning foundation to edge-case. | Must Have |
| F2.2 | Real-time difficulty calibration without revealing intermediate pass/fail state. | Must Have |
| F2.3 | Output Calibrated Level, Gap Map (3-6 concepts), and Strength Map. | Must Have |

#### F3 � Learning DNA & Deterministic State Engine
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F3.1 | Maintain persistent knowledge graph per learner per subject in PostgreSQL (not LLM memory). | Must Have |
| F3.2 | Track concept-level mastery scores (0-100%) with automated nightly Ebbinghaus decay calculations. | Must Have |
| F3.3 | Inject deterministic state snapshots into AI context on every turn to prevent state drift. | Must Have |

#### F4 � Adaptive Curriculum Generator
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F4.1 | Generate time-scoped session roadmap (15/30/45/60/90 min modes) respecting prerequisite graphs. | Must Have |
| F4.2 | Explicitly list excluded out-of-scope topics to preserve session pacing. | Must Have |

#### F5 � Grounded Multi-Modal Concept Delivery (RAG-Enabled)
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F5.1 | Deliver concepts strictly via the **5-Part Pedagogical Standard** (Big Picture, Core Principle, Tailored Example, Common Pitfall, Check-In). | Must Have |
| F5.2 | Ground all explanations, formulas, and definitions in verified syllabus RAG vector store. | Must Have |
| F5.3 | Require check-in passage before unlocking subsequent stages; auto-reteach with fresh analogies on confusion. | Must Have |

#### F6 � Socratic Dialogue & Scaffolding Engine
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F6.1 | Execute 4-stage Socratic inquiry (Own-words, Application, Devil's advocate, Connection bridge). | Must Have |
| F6.2 | Evaluate responses as Solid / Partial / Needs Work and dynamically adjust cognitive scaffolding. | Must Have |

#### F7 � Tiered Practice & Mastery Engine
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F7.1 | Generate 3-Tier practice (Recall, Application, Synthesis) unique across 30-day windows. | Must Have |
| F7.2 | Provide granular 'Why' and pedagogical remediation for every incorrect response. | Must Have |

#### F8 � Progress Matrix & Spaced Repetition (F9)
| Req ID | Requirement | Priority |
| :--- | :--- | :--- |
| F8.1 | Generate end-of-session Learning Progress Matrix with calculated pre/post knowledge gain. | Must Have |
| F8.2 | Queue spaced review alerts at 24h, 3d, 7d, and 14d intervals via Redis queue. | Must Have |

---

## 7. AI System Requirements & RAG Architecture

### 7.1 Verified Curriculum RAG Pipeline
To prevent domain hallucinations in STEM, Law, and Medicine:
- **Corpus**: Accredited examination boards (AQA, Edexcel, OCR, AP), open college syllabi, canonical reference literature.
- **Chunking**: Chunked by atomic concept nodes with prerequisite graph metadata.
- **Query Pipeline**: Every concept delivery query retrieves top-3 canonical definitions and standard misconceptions from vector store (Pinecone) before generating prompt completions.

### 7.2 Strict AI Guardrails
- **Academic Integrity**: Automated refusal to solve active homework/exam problem sets; reroutes into pedagogical step-by-step guidance.
- **Age-Appropriate Sandbox (Tier B)**: Secondary filter enforcing COPPA/GDPR-K safe content moderation.
- **Hallucination Blocker**: Fact-verification check comparing generated formulas against vector embeddings.

---

## 8. User Experience & Interface
- **Hybrid Intake Screen**: Clean, responsive onboarding offering 30-second multi-select or voice/chat input.
- **Distraction-Free Tutoring Workspace**: Real-time markdown rendering with LaTeX math notation, interactive syntax highlighting, and progress HUD.
- **Accessible Design**: Full WCAG AA compliance, dyslexia-friendly typography option (OpenDyslexic), screen-reader semantics.

---

## 9. Technical & Security Requirements

### 9.1 Tech Stack & Cost-Optimized Architecture
| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14 (App Router) + Tailwind | High performance streaming UI, server components |
| **Mobile** | React Native (Expo) | Cross-platform mobile parity |
| **Backend & API** | Node.js (TypeScript) + tRPC | End-to-end type safety, real-time WebSocket sessions |
| **Primary LLM** | GPT-4o / Claude 3.5 Sonnet | Deep reasoning for Concept Delivery & Socratic Engine |
| **Socratic / Fast LLM**| GPT-4o-mini / Claude 3.5 Haiku | Low-cost Socratic probing, practice grading, summaries |
| **Database** | PostgreSQL (Supabase) | Deterministic state machine, relational entity store |
| **Cache & Queues** | Redis (Upstash) | Spaced repetition queues, session tokens, prompt cache |
| **Vector Database** | Pinecone | Concept dependency graphs & curriculum RAG |
| **Auth & Tenancy** | Clerk | Multi-tenant auth, COPPA age-gates, Enterprise SSO |

### 9.2 Security & Compliance Tiers
- **Tier A (Consumer)**: Standard GDPR/CCPA data rights, AES-256 encryption.
- **Tier B (Minor - Zara)**: Isolated database partition, zero data training, parental consent verification, no external telemetry.
- **Tier C (Enterprise - David/Rachel)**: SAML/SSO, SCIM provisioning, audit logging, FERPA compliance for universities.

---

## 10. MVP Scope & Prioritisation (MoSCoW)
- **Must Have**: F1 (Hybrid Intake), F2 (CAT Diagnostic), F3 (Deterministic State), F4 (Curriculum Roadmap), F5 (RAG Concept Delivery), F6 (Socratic Engine), F7 (Tiered Practice), F8 (Progress Matrix & Spaced Rep).
- **Should Have**: F11 (Educator Portal), Tier B Minor Guardrail Sandbox, Offline Session Cache.
- **Could Have**: F10 (LinkedIn Credentialing), Voice-based interactive tutoring.
- **Won't Have (v1)**: Video generation, Peer-to-peer chat, Automated essay grading.

---

## 11. Success Metrics & Unit Economics

### 11.1 Unit Economics Target (Hard Limit)
| Metric | Target | Method |
| :--- | :--- | :--- |
| **Inference Cost / 60-min Session** | **< �0.05** | Prompt prefix caching (50% discount) + Asymmetric routing (GPT-4o for core concept, 4o-mini for Socratic/evaluation) |
| **Onboarding Time to First Concept** | **< 90 seconds** | Rapid 1-Screen Intake option |
| **Session Completion Rate** | **= 75%** | Scoped timeframes & real-time re-explanation |
| **Pre/Post Knowledge Delta** | **= 35% gain** | Validated via Step 8 progress calculation |

---

## 12. Milestones & Delivery Plan
- **Phase 0 (Foundation - 3 Wks)**: RAG Concept Graph setup, DB schema, Prompt Caching Pipeline.
- **Phase 1 (Core Engine - 6 Wks)**: Hybrid intake, CAT Diagnostic, 5-Part Concept Delivery, Socratic loop.
- **Phase 2 (State & Spaced Rep - 4 Wks)**: Learning DNA persistence, Redis spaced repetition queue, Tier B Minor Sandbox.
- **Phase 3 (B2B & Beta Launch - 4 Wks)**: Educator Portal, 500-user closed beta, unit economic verification.

---

## 13. Risk Register & Mitigation

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Onboarding Churn** | High | Added 1-Screen Rapid Intake (<60s) bypassing multi-turn chat. |
| **Memory/State Drift** | High | Replaced LLM working memory with PostgreSQL deterministic state machine. |
| **STEM Hallucinations** | High | Implemented verified syllabus RAG pipeline in Pinecone. |
| **Token Cost Explosion** | High | Enforced prompt prefix caching & asymmetric model routing (<�0.05/session). |
| **Minor Compliance Breach**| Critical | Built isolated Tier B COPPA/GDPR-K sandbox with strict safety moderation. |

---

## 14. Out-of-Scope Requirements
- Live human video/voice bridge.
- Unsupervised autonomous web search during active tutoring sessions.
- Homework completion generation tools (anti-cheating boundary).

---

*Document Version: 1.1 (Hardened) | Owner: Product Team | Framework: �3.1�3.14*
