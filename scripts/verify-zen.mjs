import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(process.cwd(), '.env');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

const key = env.OPENAI_API_KEY;
if (!key || key === 'PASTE_ZEN_KEY_HERE') fail('OPENAI_API_KEY not set in .env');
const base = (env.OPENAI_BASE_URL || 'https://opencode.ai/zen/v1').replace(/\/$/, '');
const model = env.LEARNOS_TUTOR_MODEL || 'x-preview-f-free';

const t0 = Date.now();
const res = await fetch(`${base}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
  }),
});

console.log(`Endpoint : ${base}`);
console.log(`Model    : ${model}`);
console.log(`HTTP     : ${res.status}`);

if (!res.ok) {
  const body = await res.text();
  fail(body.slice(0, 300));
}

const data = await res.json();
const reply = data.choices?.[0]?.message?.content ?? '(empty)';
const usage = data.usage ?? {};
console.log(`Reply    : ${JSON.stringify(reply.trim().slice(0, 60))}`);
console.log(`Tokens   : in=${usage.prompt_tokens ?? '?'} out=${usage.completion_tokens ?? '?'}`);
console.log(`RTT      : ${Date.now() - t0}ms`);
console.log('RESULT   : ZEN VERIFIED');
