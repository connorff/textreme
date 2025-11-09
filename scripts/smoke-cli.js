import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findCli() {
  const env = process.env.IMESSAGE_QUERY_PATH;
  if (env && existsSync(env)) return env;
  const dev = resolve(__dirname, '../ml/imessage_query/target/release/imessage_query');
  if (existsSync(dev)) return dev;
  const prod = resolve(process.resourcesPath ?? '', 'imessage_query');
  if (existsSync(prod)) return prod;
  throw new Error('imessage_query binary not found');
}

function run(args) {
  const bin = findCli();
  const out = spawnSync(bin, args, { encoding: 'utf8' });
  if (out.status !== 0) {
    throw new Error(`CLI failed: ${out.stderr || out.stdout}`);
  }
  const json = JSON.parse(out.stdout);
  return json;
}

try {
  const stats = run(['stats']);
  console.log('[SMOKE] stats ok:', stats?.data?.total_messages);
  const unread = run(['unread', '--limit', '3']);
  console.log('[SMOKE] unread ok:', Array.isArray(unread?.data));
  const convs = run(['conversations', '--limit', '2']);
  console.log('[SMOKE] conversations ok:', Array.isArray(convs?.data));
  console.log('[SMOKE] SUCCESS');
  process.exit(0);
} catch (err) {
  console.error('[SMOKE] FAILURE:', err?.message || String(err));
  process.exit(1);
}

