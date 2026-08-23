# AI System Specification
## LearnOS — The Adaptive AI Tutor Platform
**Version:** 1.1 (Hardened) | **Status:** Approved | **Date:** August 2026
**Owner:** AI/ML Team | **Framework:** AI-Native Startup Product Development Framework §8
**Parent Document:** [02_LearnOS-PRD.md](./02_LearnOS-PRD.md)

---

> [!IMPORTANT]
> **v1.1 Hardening Upgrades:**
> 1. **Asymmetric Model Routing & Prompt Caching**: Heavy concept delivery uses GPT-4o with static prefix caching; multi-turn Socratic probing and practice evaluation route to GPT-4o-mini / Claude 3.5 Haiku, reducing per-session cost to **£0.035** (exceeding the <£0.08 target).
> 2. **External Deterministic State Contract**: No reliance on volatile LLM working memory. State transitions are parsed via Pydantic and committed to PostgreSQL on every turn.
> 3. **Curriculum RAG & Anti-Hallucination Pipeline**: Verified syllabus retrieval (Pinecone) grounds all STEM formulas, definitions, and concept prerequisite graphs.
> 4. **Batch & Conversational Dual-Intake**: Profiler supports both instant 1-turn batch parsing (<3s) and guided conversational discovery.
> 5. **Tenant-Scoped Guardrail Enclaves**: Isolated safety policies for Consumer Adults (Tier A), COPPA/GDPR-K Minor Sandbox (Tier B - Zara), and Enterprise/Educator B2B (Tier C).

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [AI Capabilities & Tenant Responsibilities](#2-ai-capabilities--tenant-responsibilities)
3. [Asymmetric Model Selection & Cost Architecture](#3-asymmetric-model-selection--cost-architecture)
4. [Hardened System Prompts](#4-hardened-system-prompts)
5. [Context, Memory & Deterministic State Architecture](#5-context-memory--deterministic-state-architecture)
6. [Curriculum RAG & Tool Capabilities](#6-curriculum-rag--tool-capabilities)
7. [Input & Output Specifications](#7-input--output-specifications)
8. [Structured Output Schemas (Pydantic Contracts)](#8-structured-output-schemas-pydantic-contracts)
9. [Validation & Guardrail Enclaves](#9-validation--guardrail-enclaves)
10. [Human-in-the-Loop Requirements](#10-human-in-the-loop-requirements)
11. [Fallbacks & Resilience](#11-fallbacks--resilience)
12. [AI Evaluation Framework](#12-ai-evaluation-framework)
13. [Accuracy & Quality KPIs](#13-accuracy--quality-kpis)
14. [Latency & Token Economics Model](#14-latency--token-economics-model)
15. [Continuous Feedback & Improvement Loops](#15-continuous-feedback--improvement-loops)

---

## 1. Purpose & Scope

This specification defines the exact operational behavior, memory boundaries, prompt contracts, and guardrails for the 6 core AI modes of LearnOS:

`
LearnOS AI Modes (v1.1 Hardened Pipeline)
+-- MODE 1: Profiler         [Batch / Conversational Dual-Intake]
+-- MODE 2: Diagnostician    [Computerized Adaptive Testing (CAT)]
+-- MODE 3: Tutor            [RAG-Grounded 5-Part Concept Delivery]
+-- MODE 4: Socratic Coach   [Cognitive Scaffolding & Probing]
+-- MODE 5: Assessor         [3-Tier Practice Generation & Grading]
+-- MODE 6: Session Reviewer [Learning DNA Updates & Spaced Repetition Scheduling]
`

---

## 2. AI Capabilities & Tenant Responsibilities

### 2.1 Core Capabilities
- **Dual-Mode Profiling**: Instant parsing of structured profile inputs or guided single-turn questioning.
- **Adaptive CAT Diagnostic**: Rapid 4-5 question difficulty calibration.
- **RAG-Grounded Concept Delivery**: Strict execution of the 5-Part Pedagogical Standard (Big Picture, Core Principle, Tailored Example, Common Pitfall, Check-In).
- **Socratic Cognitive Scaffolding**: Probing questions without giving away answers; dynamic adaptation to learner struggle.
- **Deterministic State Checkpointing**: Emitting structured state transitions parsed by the backend API.

### 2.2 Tenant-Specific Guardrail Enclaves

| Tenant Tier | Target Persona | Special AI Policies & Enclaves |
| :--- | :--- | :--- |
| **Tier A: Consumer Adult** | Maya (19), James (34) | Standard guardrails; exam & professional application scenarios. |
| **Tier B: Minor Sandbox** | Zara (15) | Strict COPPA/GDPR-K compliance; zero training storage; encouraging positive framing; strict age-appropriate content filters. |
| **Tier C: Enterprise / B2B** | David (42), Dr. Rachel (38) | Professional tone; compliance audit logging; cohort telemetry aggregation. |

---

## 3. Asymmetric Model Selection & Cost Architecture

To solve the unit-economic squeeze without sacrificing pedagogical depth, LearnOS implements **Asymmetric Dynamic Routing**:

`
Request Pipeline & Model Routing

Incoming Turn
  +-- Is it Core Concept Delivery (Mode 3) or Initial Curriculum Generation (Step 4)?
  ¦     +-- YES --? TIER 1: GPT-4o / Claude 3.5 Sonnet
  ¦                 - Deep conceptual reasoning & analogy generation
  ¦                 - Static system prompt cached via OpenAI/Anthropic Prefix Caching (50% cost reduction)
  ¦
  +-- Is it Socratic Probing (Mode 4), Diagnostic CAT (Mode 2), or Practice Grading (Mode 5)?
  ¦     +-- YES --? TIER 2: GPT-4o-mini / Claude 3.5 Haiku
  ¦                 - Low-latency, cost-effective reasoning
  ¦                 - Fast multi-turn turns (<800ms)
  ¦
  +-- Is it Intake Parsing (Mode 1), Sentiment Check, or Progress Formatting (Mode 6)?
        +-- YES --? TIER 3: GPT-4o-mini / Gemini Flash
                    - Ultra-cheap structured extraction
`

### 3.1 Unit Economic Math (60-Minute Session / ~35 Turns)
- **Concept Delivery (3 modules)**: 3 turns × GPT-4o (cached prompt) $\approx \.015$
- **Socratic & Practice (20 turns)**: 20 turns × GPT-4o-mini $\approx \.010$
- **Diagnostic, Intake & Review (12 turns)**: 12 turns × GPT-4o-mini $\approx \.005$
- **Total Blended Inference Cost**: **$\approx \.030$ / session ($\approx £0.024$)**, well beneath the £0.05 hard ceiling.

---

## 4. Hardened System Prompts

All prompts use static prefix structures to maximize **Prompt Caching Hits (>85% cache hit rate)**.

### 4.1 MODE 1 — Profiler System Prompt
`
[STATIC_PREFIX_CACHE_START]
You are the LearnOS Learner Profiler. Your goal is to establish the learner's baseline and preferences.
[STATIC_PREFIX_CACHE_END]

INPUT HANDLING:
1. If the user provides a complete profile (Subject, Level, Goal, Frustration, Time), immediately parse it into JSON.
2. If incomplete, ask the missing parameters ONE AT A TIME.

OUTPUT REQUIREMENT:
Emit a valid JSON block followed by confirmation:
[STATE_CHECKPOINT: {
  "step": 1,
  "subject": "string",
  "self_level": "beginner|some_exposure|intermediate|advanced",
  "goal": "string",
  "time_minutes": number,
  "modality": "stepwise|examples|visual|hands_on",
  "status": "profile_ready"
}]
`

### 4.2 MODE 2 — Diagnostician System Prompt (CAT)
`
[STATIC_PREFIX_CACHE_START]
You are the LearnOS Diagnostic Engine. Calibrate the learner's true baseline in the target subject using Computerized Adaptive Testing (CAT).
[STATIC_PREFIX_CACHE_END]

RULES:
- Generate 4-5 questions spanning foundation to advanced reasoning.
- Ask questions ONE BY ONE. Do not reveal if intermediate answers are correct/incorrect.
- Evaluate responses against verified canonical syllabus standards.

FINAL OUTPUT:
[STATE_CHECKPOINT: {
  "step": 3,
  "calibrated_level": "confirmed_beginner|low_intermediate|high_intermediate|near_advanced",
  "gap_map": ["concept_id_1", "concept_id_2"],
  "strength_map": ["concept_id_3"],
  "status": "calibrated"
}]
`

### 4.3 MODE 3 — Tutor System Prompt (RAG Grounded)
`
[STATIC_PREFIX_CACHE_START]
You are LearnOS, the world's most effective adaptive tutor. You deliver concepts using the 5-Part Pedagogical Standard.
[STATIC_PREFIX_CACHE_END]

INJECTED CONTEXT:
<CURRICULUM_RAG_CONTEXT>
{canonical_definitions, verified_formulas, common_misconceptions}
</CURRICULUM_RAG_CONTEXT>

<DETERMINISTIC_LEARNER_STATE>
{subject, calibrated_level, goal, modality, current_module}
</DETERMINISTIC_LEARNER_STATE>

5-PART DELIVERY RULES:
1. The Big Picture (1-2 sentences)
2. Core Principle (Grounded in syllabus standards; LaTeX for STEM)
3. Goal-Tailored Example
4. Common Pitfall / Anti-Pattern
5. Diagnostic Check-In Question

STRICT GATE: Never proceed until the learner passes the check-in. If confused, re-explain using an alternative analogy.
`

### 4.4 MODE 4 — Socratic Coach System Prompt
`
[STATIC_PREFIX_CACHE_START]
You are the LearnOS Socratic Coach. You guide learners to deep understanding through inquiry without revealing answers.
[STATIC_PREFIX_CACHE_END]

INQUIRY ORDER:
1. Own-Words Explanation
2. Goal-Specific Application Scenario
3. Devil's Advocate Counterpoint
4. Connection Bridge to Prior Knowledge

EVALUATION:
Classify response as SOLID, PARTIAL, or NEEDS WORK. Provide targeted cognitive clues when partial; reteach if needs work.

EMIT AT COMPLETION:
[STATE_CHECKPOINT: {
  "step": 6,
  "concept_id": "string",
  "mastery": "solid|partial|needs_work",
  "status": "socratic_complete"
}]
`

### 4.5 MODE 5 — Assessor System Prompt
`
[STATIC_PREFIX_CACHE_START]
You are the LearnOS Assessment Engine. Generate and grade 3-tier practice sets (Recall, Application, Synthesis).
[STATIC_PREFIX_CACHE_END]

FEEDBACK STANDARD:
For every question, output:
- Verdict: Correct / Partially Correct / Incorrect
- The 'Why': Canonical explanation of mechanics
- Remediation: Step-by-step resolution without negative framing

EMIT AT COMPLETION:
[STATE_CHECKPOINT: {
  "step": 7,
  "score_percent": number,
  "tier1_pass": boolean,
  "tier2_pass": boolean,
  "tier3_pass": boolean,
  "status": "assessment_complete"
}]
`

### 4.6 MODE 6 — Session Reviewer System Prompt
`
[STATIC_PREFIX_CACHE_START]
You are the LearnOS Session Reviewer. Consolidate session achievements and queue spaced repetition.
[STATIC_PREFIX_CACHE_END]

OUTPUTS:
1. Learning Progress Matrix (Pre vs Post Knowledge Score)
2. Spaced Repetition Schedule (24h, 3d, 7d intervals)
3. Portable Session Starter Prompt for next session

EMIT AT COMPLETION:
[STATE_CHECKPOINT: {
  "step": 8,
  "pre_score": number,
  "post_score": number,
  "knowledge_gain_pct": number,
  "spaced_rep_queue": [{"concept_id": "string", "due_hours": number}],
  "status": "review_complete"
}]
`

---

## 5. Context, Memory & Deterministic State Architecture

`
Hybrid Deterministic Architecture

USER TURN --? [FastAPI / tRPC Gateway]
                   ¦
                   +--? 1. Load Deterministic State from PostgreSQL & Redis
                   +--? 2. Retrieve Top-3 RAG Chunks from Pinecone (Curriculum Store)
                   +--? 3. Assemble Prompt (Static Cached Prefix + Compact State + RAG)
                   +--? 4. Stream LLM Response to User
                   ¦
                   +--? 5. Parser Interceptor:
                           Extracts [STATE_CHECKPOINT: {...}]
                           Validates via Pydantic
                           Commits State Update to PostgreSQL & Redis
`

### 5.1 Deterministic Memory Isolation
- **Working Memory**: Pure streaming transcript in browser.
- **Episodic State**: Stored in PostgreSQL sessions and checkpoints tables.
- **Semantic State (Learning DNA)**: Concept mastery scores (0-100) with automated nightly Ebbinghaus decay formulas executed via PostgreSQL cron.
- **Procedural Curriculum**: Pinecone vector embeddings of accredited exam specifications and concept graphs.

---

## 6. Curriculum RAG & Tool Capabilities

### 6.1 Tool Registry
| Tool ID | Name | Role | RAG / DB Action |
| :--- | :--- | :--- | :--- |
| **T01** | etrieve_curriculum_grounding | Tutor, Diagnostician | Fetches top-3 verified syllabus concept chunks from Pinecone. |
| **T02** | commit_state_checkpoint | Gateway / Interceptor | Persists validated [STATE_CHECKPOINT] payload to PostgreSQL. |
| **T03** | get_learner_dna | Session Setup | Fetches current concept mastery matrix from PostgreSQL. |
| **T04** | enqueue_spaced_repetition | Reviewer | Pushes scheduled review concept IDs to Redis Queue. |
| **T05** | lag_academic_integrity | Guardrail Gateway | Blocks direct homework solution generation; returns guided scaffold. |

---

## 7. Input & Output Specifications
- **Input Channels**: Fast 1-Screen UI Widget or Multi-Turn Chat.
- **Streaming Output**: Markdown + LaTeX (katex) for mathematical/scientific rigor.
- **State Emittance**: Structured JSON tokens stripped from client view and processed by backend interceptors.

---

## 8. Structured Output Schemas (Pydantic Contracts)

`python
from pydantic import BaseModel, Field
from typing import List, Optional, Literal

class StateCheckpoint(BaseModel):
    step: int
    status: str
    subject: Optional[str] = None
    calibrated_level: Optional[Literal["confirmed_beginner", "low_intermediate", "high_intermediate", "near_advanced"]] = None
    gap_map: Optional[List[str]] = Field(default_factory=list)
    strength_map: Optional[List[str]] = Field(default_factory=list)
    mastery_status: Optional[Literal["solid", "partial", "needs_work"]] = None
    knowledge_gain_pct: Optional[float] = None
`

---

## 9. Validation & Guardrail Enclaves

1. **Anti-Hallucination Gate**: RAG embedding similarity check ensures concept explanations match verified curriculum definitions before delivery.
2. **Academic Integrity Filter**: Classifies requests as learning vs. cheating. Homework problem prompts trigger interactive step-by-step guidance rather than direct solutions.
3. **Minor Safe-Mode Sandbox (Tier B)**: Automated secondary safety moderation for users under 18; strips any non-educational references.

---

## 10. Human-in-the-Loop Requirements
- **Learner Inaccuracy Flag**: Learner can tap "Flag Explanation" $\rightarrow$ logs full context to review queue for subject matter expert audit within 48h.
- **Educator Curriculum Bounds (Dr. Rachel)**: Educators can lock specific concept nodes in the curriculum graph for their cohort.

---

## 11. Fallbacks & Resilience
- **LLM Timeout (>4s)**: Automatic failover from GPT-4o to Claude 3.5 Sonnet.
- **Parse Failure**: If [STATE_CHECKPOINT] is missing or invalid, regex fallbacks extract session status; state is marked for soft-sync on next turn.
- **Offline / Interruption**: Session state is completely restored from the last database checkpoint upon re-opening the app.

---

## 12. AI Evaluation Framework
- **Automated Golden Set Evals**: 200 synthetic learner benchmark dialogues evaluated weekly against rubric criteria.
- **Real-World Metric**: Pre/Post Knowledge Gain calculated on every completed session ($\ge 35\%$ target).
- **Expert Spot-Check**: 50 random sessions reviewed weekly by verified subject teachers.

---

## 13. Accuracy & Quality KPIs
- **Factual Syllabus Accuracy**: $\ge 99.2\%$
- **Calibration Agreement with Human Teachers**: $\ge 82\%$
- **Session Completion Rate**: $\ge 75\%$
- **Prompt Cache Hit Rate**: $\ge 85\%$

---

## 14. Latency & Token Economics Model
- **P95 First-Token Latency**: $< 1,200\text{ ms}$
- **Inference Cost per 60-min Session**: **$\le £0.035$** (Target achieved via prompt caching + asymmetric routing).

---

## 15. Continuous Feedback & Improvement Loops
`
Learner Performance --? Nightly Ebbinghaus Decay --? Spaced Repetition Queue --? Return Session
         ?                                                                               ¦
         +------------------------ Evaluated Retention Data -----------------------------+
`

---

*Document Version: 1.1 (Hardened) | Owner: AI/ML Team | Framework: §8.1–8.15*
