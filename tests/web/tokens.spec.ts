import { describe, expect, it } from 'vitest';

/**
 * Sprint 8a §6 — every §4 token must resolve in light AND dark.
 * tokens.css is the single source of truth; this spec fails if a token
 * goes missing from either mode block.
 */

const fs = await import('node:fs');
const path = await import('node:path');

const cssPath = path.join(process.cwd(), 'styles', 'tokens.css');
const css = fs.readFileSync(cssPath, 'utf-8');

function extractBlock(selector: string): string {
  const idx = css.indexOf(selector);
  expect(idx, `${selector} block present`).toBeGreaterThan(-1);
  const open = css.indexOf('{', idx);
  let depth = 1;
  let i = open + 1;
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') depth -= 1;
    i += 1;
  }
  return css.slice(open + 1, i - 1);
}

function declarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  const flat = block
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[\r\n]+/g, ' ');
  for (const line of flat.split(';')) {
    const m = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (m !== null) map.set(m[1]!, m[2]!);
  }
  return map;
}

const REQUIRED_TOKENS = [
  '--sys-blue',
  '--sys-green',
  '--sys-orange',
  '--sys-red',
  '--sys-purple',
  '--sys-teal',
  '--sys-indigo',
  '--sys-mint',
  '--sys-yellow',
  '--sys-gray',
  '--sys-gray2',
  '--sys-gray3',
  '--sys-gray4',
  '--sys-gray5',
  '--sys-gray6',
  '--label',
  '--secondary-label',
  '--tertiary-label',
  '--separator',
  '--window',
  '--text-background',
  '--mat-sidebar',
  '--mat-hud',
  '--mat-chrome',
  '--radius-control',
  '--radius-card',
  '--radius-sheet'
];

describe('S8A-T2 tokens.css', () => {
  it('declares every §4 token in the light (:root) block', () => {
    const light = declarations(extractBlock(':root'));
    for (const token of REQUIRED_TOKENS) {
      expect(light.has(token), `missing ${token} in :root`).toBe(true);
      expect(light.get(token), `${token} empty`).not.toBe('');
    }
  });

  it('re-declares every §4 color/material token in the dark block', () => {
    const dark = declarations(extractBlock("[data-theme='dark']"));
    for (const token of REQUIRED_TOKENS.filter((t) => t.startsWith('--sys-') || t.startsWith('--mat-') || t.startsWith('--label') || ['--secondary-label', '--tertiary-label', '--separator', '--window', '--text-background'].includes(t))) {
      expect(dark.has(token), `missing ${token} in dark`).toBe(true);
    }
  });

  it('dark values differ from light values (auto-flip sanity)', () => {
    const light = declarations(extractBlock(':root'));
    const dark = declarations(extractBlock("[data-theme='dark']"));
    expect(light.get('--sys-blue')).not.toBe(dark.get('--sys-blue'));
    expect(light.get('--window')).not.toBe(dark.get('--window'));
  });

  it('defines UI and mono font stacks', () => {
    expect(css).toContain('-apple-system');
    expect(css).toContain('ui-monospace');
    expect(declarations(extractBlock(':root')).get('--font-ui')).toBeDefined();
    expect(declarations(extractBlock(':root')).get('--font-mono-stack')).toBeDefined();
  });
});
