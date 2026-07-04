// Chunk DSL: hand-authored track pieces parsed into item lists.
// Node-safe. One item per line:
//
//   type lane d            e.g.  block L 12
//   type lane d..dEnd      e.g.  dew C 8..16 step=2
//   key=value args         e.g.  gap R 20 len=6   wind A 5 len=18 dir=1
//
// Lanes: L C R (single) or A (all three). Distances are meters from the
// chunk start. Types: block arch barrier gap ramp dew lantern wind sign
// seed checkpoint shrine. Authoring rule (Lessons Ledger #8): never
// hand-retype rows — patch programmatically, then re-verify.

import { LANES } from '../config.js';

const LANE_IDX = { L: -1, C: 0, R: 1 };
export const laneX = (lane) => lane * LANES.width;

const registry = new Map();

export function defineChunk(def) {
  if (registry.has(def.id)) throw new Error(`duplicate chunk id ${def.id}`);
  const chunk = { ...def, items: parseLines(def.id, def.lines) };
  for (const it of chunk.items) {
    if (it.d < 0 || (it.dEnd ?? it.d) > def.len) {
      throw new Error(`${def.id}: item ${it.type}@${it.d} outside chunk len ${def.len}`);
    }
  }
  registry.set(def.id, chunk);
  return chunk;
}

export function getChunk(id) {
  const c = registry.get(id);
  if (!c) throw new Error(`unknown chunk ${id}`);
  return c;
}

export function allChunks() { return [...registry.values()]; }

function parseLines(id, lines) {
  const items = [];
  for (const raw of lines.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const [type, laneCh, dSpec] = parts;
    if (!(laneCh in LANE_IDX) && laneCh !== 'A') throw new Error(`${id}: bad lane "${laneCh}" in "${line}"`);
    const args = {};
    for (const p of parts.slice(3)) {
      const eq = p.indexOf('=');
      if (eq < 0) throw new Error(`${id}: bad arg "${p}" in "${line}"`);
      const k = p.slice(0, eq), v = p.slice(eq + 1);
      args[k] = isNaN(Number(v)) ? v : Number(v);
    }
    const lanes = laneCh === 'A' ? [-1, 0, 1] : [LANE_IDX[laneCh]];
    const range = String(dSpec).split('..').map(Number);
    if (range.some(isNaN)) throw new Error(`${id}: bad distance "${dSpec}" in "${line}"`);

    for (const lane of lanes) {
      if (range.length === 2) {
        if (type === 'dew') {
          const step = args.step ?? 2;
          for (let d = range[0]; d <= range[1] + 1e-6; d += step) {
            items.push({ type, lane, d, y: args.y ?? 0, arc: args.arc });
          }
        } else {
          items.push({ type, lane, d: range[0], dEnd: range[1], ...args });
        }
      } else {
        const it = { type, lane, d: range[0], ...args };
        if (it.len != null) it.dEnd = it.d + it.len;
        items.push(it);
      }
    }
  }
  items.sort((a, b) => a.d - b.d);
  return items;
}

// dew arcs: helper used by authoring — a jump-shaped dew trail
export function dewArc(dStart, lane, span, peak = 2.1, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = peak * Math.sin(Math.PI * t);
    out.push(`dew ${lane} ${(dStart + span * t).toFixed(1)} y=${y.toFixed(2)}`);
  }
  return out.join('\n');
}
