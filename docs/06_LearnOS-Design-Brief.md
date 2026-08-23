# Design Brief & UI/UX Specification
## LearnOS — The Adaptive AI Tutor Platform
**Version:** 1.0 | **Status:** Approved | **Date:** August 2026
**Owner:** Product Design & UI/UX Team | **Framework:** AI-Native Startup Product Development Framework §5
**Parent Documents:** [02_LearnOS-PRD.md](./02_LearnOS-PRD.md) · [03_LearnOS-AI-System-Specification.md](./03_LearnOS-AI-System-Specification.md) · [04_LearnOS-TDD.md](./04_LearnOS-TDD.md)

---

> [!IMPORTANT]
> This Design Brief establishes the comprehensive design system, visual direction, interface ergonomics, accessibility rules, and AI-native component specifications for LearnOS. All front-end engineering must build directly from these tokens and component standards.

---

## Table of Contents

1. [Purpose & Design Philosophy](#1-purpose--design-philosophy)
2. [Brand Positioning & Personality](#2-brand-positioning--personality)
3. [Visual Direction & Aesthetic Standards](#3-visual-direction--aesthetic-standards)
4. [Color System & Semantic Tokens](#4-color-system--semantic-tokens)
5. [Typography System & Accessibility Fonts](#5-typography-system--accessibility-fonts)
6. [Spacing, Grid & Responsive Layout](#6-spacing-grid--responsive-layout)
7. [Core Component System & UI Primitives](#7-core-component-system--ui-primitives)
8. [Buttons, Inputs & Form Elements](#8-buttons-inputs--form-elements)
9. [Cards, Matrices & Progress Dashboards](#9-cards-matrices--progress-dashboards)
10. [Interface States, Empty States & Feedback Loops](#10-interface-states-empty-states--feedback-loops)
11. [Motion, Micro-Interactions & Animation Curves](#11-motion-micro-interactions--animation-curves)
12. [Responsive Breakpoints & Mobile Ergonimics](#12-responsive-breakpoints--mobile-ergonomics)
13. [Accessibility (a11y) & Neurodiversity Standards](#13-accessibility-a11y--neurodiversity-standards)
14. [AI-Native Interface Patterns & Streaming HUD](#14-ai-native-interface-patterns--streaming-hud)
15. [Design System Governance & Token Export](#15-design-system-governance--token-export)

---

## 1. Purpose & Design Philosophy

LearnOS is an **AI-Native Learning Operating System**. Its user interface must balance two vital psychological states:
1. **Zero Cognitive Friction**: The interface must never compete with educational content for the learner's attention. Toolbars, chrome, and navigation recede into the background during active instruction.
2. **Visible Momentum & Positive Reinforcement**: Learning creates cognitive fatigue; the UI counters this by making progress, mastery growth, and knowledge retention immediately tactile, measurable, and rewarding.

### Core Design Principles
- **Tutor-First Focus**: The central canvas is reserved for high-fidelity pedagogy, LaTeX rendering, and conversational reasoning.
- **Progress is Always Visible**: Real-time progress bars, mastery chips, and concept matrices eliminate the "am I getting anywhere?" anxiety.
- **Confidence Over Shame**: Visual feedback treats misconceptions as natural discovery checkpoints, never failure states.
- **Calm, Premium Modernism**: Dark-mode-first aesthetic with rich slate backgrounds, vibrant electric indigo accents, and subtle glassmorphic elevation.

---

## 2. Brand Positioning & Personality

| Dimension | Brand Attribute | Design Translation |
| :--- | :--- | :--- |
| **Tone** | Intellectual, Empathetic, Sharp, Rigorous | Clean typography, precise spacing, clear visual hierarchy. |
| **Character** | The world's most patient, brilliant professor | Warm encouragement paired with undeniable academic precision. |
| **Feel** | Premium, State-of-the-Art, Calming | Deep slate tones, smooth framer-motion transitions, subtle glows. |
| **Target Appeal** | Universal (GCSE Zara to Corporate David) | Adaptable themes: youth-friendly gamification without feeling childish; professional clarity without feeling sterile. |

---

## 3. Visual Direction & Aesthetic Standards

LearnOS uses a modern **Dark-Glass Minimalist** aesthetic:
- **Base Canvas**: Deep Slate (`#0B0F19`) providing deep contrast and reducing eye strain during late-night study sessions.
- **Surface Elevation**: Glassmorphism with `backdrop-blur-md`, subtle `1px` translucent borders (`rgba(255, 255, 255, 0.08)`), and soft layered drop-shadows.
- **Accent Radiance**: Electric Indigo (`#6366F1`) and Neon Cyan (`#06B6D4`) glows demarcating active AI thought states and streaming tokens.

---

## 4. Color System & Semantic Tokens

### 4.1 Palette Tokens (Dark Mode Primary / Light Mode Alternate)

```
COLOR PALETTE TOKENS

BRAND ACCENTS:
- Electric Indigo (Primary):   hsl(239, 84%, 67%)   #6366F1
- Electric Indigo Hover:       hsl(239, 84%, 60%)   #4F46E5
- Radiant Cyan (Secondary):     hsl(189, 94%, 43%)   #06B6D4
- Violet Glow (Tertiary):      hsl(262, 83%, 58%)   #8B5CF6

SEMANTIC MASTERY STATES:
- Solid Mastery (Success):     hsl(158, 64%, 52%)   #10B981 (Emerald)
- Partial Mastery (Warning):   hsl(38, 92%, 50%)    #F59E0B (Amber)
- Needs Work (Gap / Action):   hsl(350, 89%, 60%)   #F43F5E (Rose)

DARK SURFACES (Default Canvas):
- Canvas Base:                 hsl(222, 47%, 7%)    #0B0F19
- Surface 1 (Cards/Panels):    hsl(217, 33%, 12%)   #131B2E
- Surface 2 (Hover/Active):    hsl(215, 28%, 17%)   #1E293B
- Border Translucent:          rgba(255, 255, 255, 0.08)

LIGHT SURFACES (Alternative):
- Canvas Base:                 hsl(210, 40%, 98%)   #F8FAFC
- Surface 1 (Cards):           hsl(0, 0%, 100%)     #FFFFFF
- Surface 2 (Muted):           hsl(210, 40%, 96%)   #F1F5F9
- Border Neutral:              hsl(214, 32%, 91%)   #E2E8F0
```

---

## 5. Typography System & Accessibility Fonts

### 5.1 Font Stack
- **Headings & Display**: `Outfit`, sans-serif (Modern, confident geometric sans).
- **Body & Dialogue**: `Inter`, sans-serif (Engineered for ultra-high legibility on screens).
- **Code & Syntax**: `JetBrains Mono`, monospace (Clear ligatures and character differentiation).
- **Accessibility Mode (Neurodiversity)**: `OpenDyslexic`, sans-serif (One-click toggle for dyslexic learners).

### 5.2 Typographic Hierarchy

| Token | Font | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text-display-2xl` | Outfit | 36px / 2.25rem | 700 (Bold) | 1.2 | Hero banners, Session Complete titles |
| `text-display-xl` | Outfit | 28px / 1.75rem | 600 (SemiBold) | 1.25 | Major Section Headings |
| `text-heading-lg` | Outfit | 22px / 1.375rem | 600 (SemiBold) | 1.3 | Concept Names, Card Titles |
| `text-body-md` | Inter | 16px / 1.0rem | 400 (Regular) | 1.6 | Core AI Explanations, User Chat |
| `text-body-sm` | Inter | 14px / 0.875rem | 400 (Regular) | 1.5 | Checkpoint metadata, tooltips |
| `text-caption` | Inter | 12px / 0.75rem | 500 (Medium) | 1.4 | Timestamps, token counters, badges |
| `text-code` | JetBrains Mono | 14px / 0.875rem | 500 (Medium) | 1.5 | Python code blocks, LaTeX formulas |

---

## 6. Spacing, Grid & Responsive Layout

- **Base Unit**: 8-point spatial grid system (4px, 8px, 16px, 24px, 32px, 48px, 64px).
- **Application Shell Layout**: 3-Column Responsive Workspace:

```
┌─────────────────┬──────────────────────────────────┬─────────────────┐
│ LEFT SIDEBAR    │ CENTER STAGE (Main Tutoring)     │ RIGHT HUD       │
│ (260px)         │ (Flexible max-w-4xl)             │ (320px)         │
│                 │                                  │                 │
│ - Subject Nav   │ - Top Stream Banner / Mode HUD   │ - Learning DNA  │
│ - Session Timer │ - 5-Part Concept Canvas          │   Mastery Graph │
│ - Roadmap Nodes │ - LaTeX & Code Viewer            │ - Current Gaps  │
│ - Quick Switch  │ - Socratic Active Input Box      │ - Spaced Queue  │
└─────────────────┴──────────────────────────────────┴─────────────────┘
```

---

## 7. Core Component System & UI Primitives

### 7.1 The 5-Part Concept Card (`ConceptDeliveryCard.tsx`)
A dedicated visual container that structures AI concept delivery into 5 distinct accordion/block tabs:
1. **The Big Picture** (Indigo badge + italicized overview).
2. **Core Principle** (Elevated slate card with KaTeX math rendering and code syntax highlighting).
3. **Targeted Example** (Cyan accented block grounded in user's persona).
4. **Common Pitfall** (Rose border with warning icon highlighting misconceptions).
5. **Interactive Check-In** (Embedded micro-quiz widget with instant validation).

---

## 8. Buttons, Inputs & Form Elements

```
BUTTON DESIGN SPECIFICATIONS

1. Primary Action (e.g. "Start Session", "Submit Answer")
   - Background: linear-gradient(135deg, #6366F1, #4F46E5)
   - Text: #FFFFFF, Font-Weight: 600, Shadow: 0 4px 14px rgba(99, 102, 241, 0.35)
   - Hover: translateY(-1px), shadow intensifies
   - Active: translateY(0px), opacity: 0.9

2. Socratic Input Field
   - Background: rgba(30, 41, 59, 0.7), Border: 1px solid rgba(255, 255, 255, 0.12)
   - Focus: Border-color: #6366F1, Ring: 3px solid rgba(99, 102, 241, 0.25)
   - Integrated Voice Button + Send Icon (Cyan glowing state on input)
```

---

## 9. Cards, Matrices & Progress Dashboards

### 9.1 The Learning Progress Matrix Card
Rendered at the conclusion of Step 8:
- **Header**: Circular progress gauge showing **Knowledge Gain Percentage ($\Delta$)**.
- **Table**: Concept rows featuring status badges (`Solid` in Emerald, `Partial` in Amber, `Needs Revisit` in Rose).
- **Spaced Review Countdown**: Pill tags displaying `Due in 24h`, `Due in 3d` with interactive bell reminder toggles.

---

## 10. Interface States, Empty States & Feedback Loops

| State | Visual Treatment | Trigger |
| :--- | :--- | :--- |
| **AI Thinking / Reasoning** | Subtle pulsing cyan aura around input box; shimmering skeleton line | Token processing (<800ms) |
| **Streaming Token Feed** | Smooth typewriter opacity fade-in with blinking electric cursor | Active LLM generation |
| **Check-In Passed** | Emerald border burst + gentle chime + automatic unlock transition | Correct answer submitted |
| **Check-In Struggling** | Amber soft glow + "Let's look at this another way" card flip | Incorrect check-in attempt |
| **Offline / State Recovery** | Top bar banner: "Session restored from cloud checkpoint 🎯" | Network reconnect |

---

## 11. Motion, Micro-Interactions & Animation Curves

- **Engine**: Framer Motion / CSS Transitions.
- **Standard Ease**: `cubic-bezier(0.16, 1, 0.3, 1)` (Spring-like natural deceleration).
- **Durations**:
  - Micro-interactions (Button hover, tab switch): `150ms`.
  - Card expansion & modal entrances: `250ms`.
  - Concept step transition: `400ms`.

---

## 12. Responsive Breakpoints & Mobile Ergonomics

| Breakpoint | Target Screen | Layout Behavior |
| :--- | :--- | :--- |
| **Mobile (`< 768px`)** | iPhone, Android | Single column stack. Right HUD collapses into swipeable bottom sheet; Left Sidebar collapses into hamburger drawer. Fixed bottom input bar. |
| **Tablet (`768px - 1024px`)**| iPad, Tablets | 2-column layout (Main stage + Collapsible HUD tab). |
| **Desktop (`> 1024px`)** | Laptops, Displays | Full 3-column expanded workspace. |

---

## 13. Accessibility (a11y) & Neurodiversity Standards

- **WCAG Compliance**: Strict adherence to **WCAG 2.1 AA** across all color contrasts (Minimum 4.5:1 for body text, 3:1 for large text and UI components).
- **Keyboard Navigation**: Complete focus-trap management and `Tab / Shift+Tab / Enter` navigation for all interactive check-ins.
- **Dyslexia Support**: Toggle in header to switch global font stack to `OpenDyslexic` with increased letter spacing and line heights.
- **Reduced Motion Support**: Respects `@media (prefers-reduced-motion: reduce)` by disabling all animated card flips and glow pulses.

---

## 14. AI-Native Interface Patterns & Streaming HUD

```
STREAMING HUD SPECIFICATION

[TOP HUD BAR]
├── Current Mode Badge: [MODE: 3 - CONCEPT DELIVERY]
├── Progress Indicator: [●●●○○ Module 2 of 4]
├── Latency Pill: [🟢 42ms streaming]
└── Time Remaining: [⏱️ 22 min remaining]
```

- **Interactive Checkpoint Interceptors**: When the AI emits `[STATE_CHECKPOINT]`, the front-end parser suppresses the raw text and automatically updates the HUD progress bar in real time.
- **Formula Live Preview**: In-line rendering of math equations as they stream using KaTeX without UI reflow glitches.

---

## 15. Design System Governance & Token Export

Tailwind CSS configuration tokens exported to `tailwind.config.ts`:

```typescript
// tailwind.config.ts snippet
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: {
          dark: '#0B0F19',
          light: '#F8FAFC',
        },
        surface: {
          100: '#131B2E',
          200: '#1E293B',
          300: '#334155',
        },
        brand: {
          primary: '#6366F1',
          hover: '#4F46E5',
          secondary: '#06B6D4',
        },
        mastery: {
          solid: '#10B981',
          partial: '#F59E0B',
          gap: '#F43F5E',
        },
      },
      fontFamily: {
        display: ['var(--font-outfit)', 'sans-serif'],
        sans: ['var(--font-inter)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
        dyslexic: ['var(--font-opendyslexic)', 'sans-serif'],
      },
    },
  },
};
```

---

*Document Version: 1.0 | Owner: Product Design Team | Framework: AI-Native Startup Framework §5.1–5.15*
*Related Documents: [02_LearnOS-PRD.md](./02_LearnOS-PRD.md) · [04_LearnOS-TDD.md](./04_LearnOS-TDD.md) · [05_LearnOS-Schema-Data-Model.md](./05_LearnOS-Schema-Data-Model.md)*
