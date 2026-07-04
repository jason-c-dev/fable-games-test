#!/usr/bin/env node
// Sums API-metered usage per session from the Claude Code project logs
// (~/.claude/projects/<project>/*.jsonl), the same way the repo README's
// experiment tables were produced for generations 1-2. Also counts model
// attestations for the safety-controls note.
// Usage: node tools/token-report.js [sessionIdPrefix]

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const dir = join(homedir(), '.claude', 'projects', '-Users-claude-dev-sprout-kingdom');
const prefix = process.argv[2] || '';

const sessions = new Map();
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.jsonl')) continue;
  const id = f.replace('.jsonl', '');
  if (prefix && !id.startsWith(prefix)) continue;
  const s = { turns: 0, input: 0, cacheW: 0, cacheR: 0, output: 0, models: {} };
  for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    const u = ev?.message?.usage;
    if (ev?.type !== 'assistant' || !u) continue;
    s.turns++;
    s.input += u.input_tokens || 0;
    s.cacheW += u.cache_creation_input_tokens || 0;
    s.cacheR += u.cache_read_input_tokens || 0;
    s.output += u.output_tokens || 0;
    const m = ev.message.model || 'unknown';
    s.models[m] = (s.models[m] || 0) + 1;
  }
  if (s.turns > 0) sessions.set(id, s);
}

const fmt = (n) => n.toLocaleString('en-US');
for (const [id, s] of [...sessions.entries()].sort((a, b) => b[1].output - a[1].output)) {
  const cost = s.input * 10e-6 + s.cacheW * 12.5e-6 + s.cacheR * 1e-6 + s.output * 50e-6;
  console.log(`${id.slice(0, 8)}  turns=${s.turns}  input=${fmt(s.input)}  cacheW=${fmt(s.cacheW)}  cacheR=${fmt(s.cacheR)}  output=${fmt(s.output)}  ≈$${cost.toFixed(0)}  models=${JSON.stringify(s.models)}`);
}
