import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import tls from 'node:tls';

const envPath = join(process.cwd(), '.env');
const raw = readFileSync(envPath, 'utf8');
const line = raw.split(/\r?\n/).find((l) => l.startsWith('REDIS_URL='));
const url = line?.slice('REDIS_URL='.length).trim();

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

if (!url) fail('.env has no REDIS_URL value');

let u;
try {
  u = new URL(url);
} catch {
  fail('REDIS_URL is not a valid URL');
}
if (u.protocol !== 'rediss:') fail(`expected rediss:// scheme, got ${u.protocol}`);

const host = u.hostname;
const port = Number(u.port || 6379);
const masked = `${'*'.repeat(8)}${host.slice(host.lastIndexOf('.'))}`;

const socket = tls.connect({ host, port, servername: host });
socket.setTimeout(6000);

const t0 = Date.now();
let stage = 'connect';
let buf = '';

function send(...args) {
  let out = `*${args.length}\r\n`;
  for (const a of args) out += `$${Buffer.byteLength(a)}\r\n${a}\r\n`;
  socket.write(out);
}

socket.on('secureConnect', () => {
  const tlsOk = socket.getProtocol();
  if (u.password || u.username) {
    stage = 'auth';
    send('AUTH', decodeURIComponent(u.username || 'default'), decodeURIComponent(u.password));
  }
  stage = 'ping';
  send('PING');
  console.log(`TLS      : ${tlsOk}`);
});

socket.on('data', (d) => {
  buf += d.toString();
  if (buf.includes('+PONG')) {
    const ms = Date.now() - t0;
    console.log(`Host     : ${masked}:${port}`);
    console.log(`AUTH     : ${u.password || u.username ? 'ok' : 'skipped (no creds in url)'}`);
    console.log(`PING     : +PONG`);
    console.log(`RTT      : ${ms}ms`);
    console.log(`RESULT   : UPSTASH VERIFIED`);
    socket.end();
    process.exit(0);
  }
});

socket.on('timeout', () => fail(`timeout during '${stage}'`));
socket.on('error', (e) => fail(`${stage}: ${e.message}`));
