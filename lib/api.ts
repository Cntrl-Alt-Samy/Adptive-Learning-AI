import type { CatItem } from '@/src/pedagogy/cat.js';
import type { PracticeQuestion } from '@/src/pedagogy/practice.js';

/** Typed fetch layer between client components and Route Handlers. */

export interface SubjectSummary {
  id: string;
  title: string;
  category: string;
  conceptCount: number;
}

export interface PlannedConcept {
  conceptId: string;
  title: string;
  estimatedMinutes: number;
  difficultyLevel: number;
}

export type ExclusionReason = 'BUDGET_EXCEEDED' | 'PREREQ_EXCLUDED' | 'TOPIC_LOCKED';

export interface ExcludedConcept {
  conceptId: string;
  title: string;
  reason: ExclusionReason;
}

export interface PlanResponse {
  subjectId: string;
  budget: number;
  planned: PlannedConcept[];
  excluded: ExcludedConcept[];
  totalMinutes: number;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    body: string
  ) {
    super(`API ${status}: ${body.slice(0, 200)}`);
    this.name = 'ApiError';
  }
}

export const api = {
  subjects: (): Promise<{ subjects: SubjectSummary[] }> => getJson('/api/subjects'),

  catBank: (subjectId: string): Promise<{ items: CatItem[]; conceptTitles: Record<string, string> }> =>
    getJson(`/api/cat-bank?subjectId=${encodeURIComponent(subjectId)}`),

  plan: (subjectId: string, budgetMinutes: number): Promise<PlanResponse> =>
    postJson('/api/plan', { subjectId, budgetMinutes }),

  practice: (
    conceptId: string,
    count = 3
  ): Promise<{ questions: PracticeQuestion[] } | { error: 'UNIQUENESS_WINDOW'; message: string }> =>
    postJson('/api/practice', { conceptId, count }),

  consentIssue: (
    guardianRef: string
  ): Promise<{ token: string; payload: { sub: string; exp: number; iat: number } }> =>
    postJson('/api/consent', { action: 'issue', guardianRef }),

  consentVerify: (
    token: string
  ): Promise<{ ok: true; payload: { sub: string; exp: number } } | { ok: false; reason: string }> =>
    postJson('/api/consent', { action: 'verify', token })
};
