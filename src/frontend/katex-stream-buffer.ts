/**
 * S3-T1 — KaTeX split-stream segmentation core (Doc 04 §4.1).
 * Framework-agnostic: a .tsx wrapper renders segments; this module decides
 * what is complete math vs pending skeleton. Never throws on any input.
 */

export type Segment =
  | { kind: 'text'; content: string }
  | { kind: 'math'; content: string; display: boolean; complete: boolean };

const OPENERS = ['$$', '\\[', '\\(', '$'] as const;

function openerAt(text: string, i: number): { op: string; display: boolean } | null {
  for (const op of OPENERS) {
    if (text.startsWith(op, i)) return { op, display: op === '$$' || op === '\\[' };
  }
  return null;
}

function closerFor(op: string): string {
  switch (op) {
    case '$$':
      return '$$';
    case '\\[':
      return '\\]';
    case '\\(':
      return '\\)';
    default:
      return '$';
  }
}

/** Segment arbitrary (possibly mid-stream) text into renderable pieces. */
export function segmentStream(text: string): Segment[] {
  const segments: Segment[] = [];
  let plain = '';
  let i = 0;

  const flushText = () => {
    if (plain.length > 0) segments.push({ kind: 'text', content: plain });
    plain = '';
  };

  while (i < text.length) {
    const hit = openerAt(text, i);
    if (!hit || (hit.op === '$' && text[i + 1] === '$')) {
      // guard: "$$" handled as its own opener on next iteration
      if (hit && hit.op === '$' && text[i + 1] === '$') {
        plain += text[i]!;
        i += 1;
        continue;
      }
      plain += text[i]!;
      i += 1;
      continue;
    }
    flushText();
    const close = closerFor(hit.op);
    const end = text.indexOf(close, i + hit.op.length);
    if (end === -1) {
      segments.push({
        kind: 'math',
        content: text.slice(i + hit.op.length),
        display: hit.display,
        complete: false
      });
      return segments; // incomplete tail stays open while streaming
    }
    segments.push({
      kind: 'math',
      content: text.slice(i + hit.op.length, end),
      display: hit.display,
      complete: true
    });
    i = end + close.length;
  }
  flushText();
  return segments;
}

export function hasPendingMath(segments: Segment[]): boolean {
  return segments.some((s) => s.kind === 'math' && !s.complete);
}
