import { loadCurriculumFile } from '@/src/curriculum/loader.js';
import { planRoadmap, plannerNodesFromCurriculum, type TimeBudget } from '@/src/pedagogy/roadmap.js';
import path from 'node:path';

/**
 * POST /api/plan — time-scoped roadmap (F4). The curriculum doc is read
 * server-side only (fs stays out of client bundles); planning itself is the
 * deterministic S4 engine.
 */

interface PlanBody {
  subjectId?: unknown;
  budgetMinutes?: unknown;
  focusIds?: unknown;
  lockedIds?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: PlanBody = {};
  try {
    body = (await req.json()) as PlanBody;
  } catch {
    return Response.json({ error: 'INVALID_BODY' }, { status: 400 });
  }
  const subjectId = typeof body.subjectId === 'string' && /^[\w-]+$/.test(body.subjectId) ? body.subjectId : null;
  const budget = typeof body.budgetMinutes === 'number' ? (body.budgetMinutes as TimeBudget) : null;
  if (subjectId === null || budget === null || ![15, 30, 45, 60, 90].includes(budget)) {
    return Response.json({ error: 'SUBJECT_AND_BUDGET_REQUIRED' }, { status: 400 });
  }

  const loaded = loadCurriculumFile(path.join(process.cwd(), 'curricula', `${subjectId}.json`));
  if (!loaded.ok || loaded.doc === undefined) {
    return Response.json({ error: 'CURRICULUM_NOT_FOUND' }, { status: 404 });
  }

  const nodes = plannerNodesFromCurriculum(loaded.doc);
  const focus =
    Array.isArray(body.focusIds) && body.focusIds.every((x) => typeof x === 'string')
      ? (body.focusIds as string[])
      : nodes.map((n) => n.id);
  if (Array.isArray(body.lockedIds)) {
    for (const node of nodes) {
      if (body.lockedIds.includes(node.id)) node.locked = true;
    }
  }

  const plan = planRoadmap(nodes, focus, budget, 7);
  const titles = Object.fromEntries(loaded.doc.concepts.map((c) => [c.id, c.title]));

  return Response.json({
    subjectId,
    budget,
    planned: plan.planned.map((p) => ({ ...p, title: titles[p.conceptId] ?? p.conceptId })),
    excluded: plan.excluded.map((e) => ({ ...e, title: titles[e.conceptId] ?? e.conceptId })),
    totalMinutes: plan.totalMinutes
  });
}
