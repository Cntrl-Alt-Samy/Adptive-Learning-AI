import { readFileSync } from 'node:fs';
import { CurriculumDocSchema, type CurriculumDoc } from './types.js';
import type { ValidationIssue } from './dag-validator.js';

export interface LoadResult {
  ok: boolean;
  doc?: CurriculumDoc;
  issues: ValidationIssue[];
}

/** Pipeline step ① — schema check. Pure aside from file read at the edge. */
export function parseCurriculum(raw: string): LoadResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      issues: [
        {
          code: 'SCHEMA',
          severity: 'error',
          message: `Invalid JSON: ${(err as Error).message}`,
          conceptIds: []
        }
      ]
    };
  }

  const parsed = CurriculumDocSchema.safeParse(json);
  if (!parsed.success) {
    const rawDoc = json as { concepts?: Array<{ id?: unknown }> };
    const issues = parsed.error.issues.map((issue): ValidationIssue => {
      const conceptIndex =
        issue.path[0] === 'concepts' && typeof issue.path[1] === 'number' ? issue.path[1] : null;
      const conceptId =
        conceptIndex !== null
          ? (rawDoc.concepts?.[conceptIndex]?.id as string | undefined)
          : undefined;
      return {
        code: 'SCHEMA',
        severity: 'error',
        message: `Schema violation at ${issue.path.join('.') || '<root>'}: ${issue.message}`,
        conceptIds: typeof conceptId === 'string' ? [conceptId] : []
      };
    });
    return { ok: false, issues };
  }
  return { ok: true, doc: parsed.data, issues: [] };
}

export function loadCurriculumFile(filePath: string): LoadResult {
  return parseCurriculum(readFileSync(filePath, 'utf8'));
}
