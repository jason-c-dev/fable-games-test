// The assembled track for one run: chunks laid end to end into a single
// sorted item stream with absolute distances, plus the spatial queries the
// player, tide, renderer, and bot all share. Node-safe.

import { getChunk } from './chunks.js';
import { OBSTACLES } from '../config.js';

export class Track {
  constructor() {
    this.items = [];        // sorted by d (absolute meters)
    this.chunkEnds = [];    // [{d, biome, id}] — biome lookup by segment end
    this.length = 0;
  }

  append(chunkId, biomeOverride) {
    const chunk = getChunk(chunkId);
    const base = this.length;
    for (const src of chunk.items) {
      const it = { ...src, d: src.d + base, chunk: chunkId };
      if (src.dEnd != null) it.dEnd = src.dEnd + base;
      this.items.push(it);
    }
    this.length += chunk.len;
    this.chunkEnds.push({ d: this.length, biome: biomeOverride ?? chunk.biome, id: chunkId });
    // items within a chunk are pre-sorted and chunks are appended in order,
    // so the global array stays sorted by d
    return this;
  }

  // binary search: first index with items[i].d >= d
  _lower(d) {
    let lo = 0, hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].d < d) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // items whose [d, dEnd] interval could touch [d0, d1]. maxSpan covers
  // interval items (gaps/winds run up to ~30 m long).
  itemsInRange(d0, d1, maxSpan = 40) {
    const out = [];
    const from = this._lower(d0 - maxSpan);
    for (let i = from; i < this.items.length; i++) {
      const it = this.items[i];
      if (it.d > d1) break;
      if ((it.dEnd ?? it.d) >= d0) out.push(it);
    }
    return out;
  }

  gapAt(d, lane) {
    for (const it of this.itemsInRange(d, d)) {
      if (it.type === 'gap' && it.lane === lane && d >= it.d && d <= it.dEnd) return it;
    }
    return null;
  }

  windAt(d) {
    for (const it of this.itemsInRange(d, d)) {
      if (it.type === 'wind' && d >= it.d && d <= it.dEnd) return it;
    }
    return null;
  }

  // cavern darkness: is track position d inside a lantern pool?
  litAt(d) {
    for (const it of this.itemsInRange(d - OBSTACLES.lanternR, d + OBSTACLES.lanternR)) {
      if (it.type === 'lantern' && Math.abs(it.d - d) <= OBSTACLES.lanternR) return true;
    }
    return false;
  }

  biomeAt(d) {
    for (const seg of this.chunkEnds) if (d < seg.d) return seg.biome;
    return this.chunkEnds.length ? this.chunkEnds[this.chunkEnds.length - 1].biome : 'meadow';
  }

  chunkAt(d) {
    for (const seg of this.chunkEnds) if (d < seg.d) return seg.id;
    return null;
  }

  // drop consumed history so endless runs don't grow unbounded
  trimBefore(d) {
    const cut = this._lower(d - 60);
    if (cut > 400) {
      this.items.splice(0, cut);
      while (this.chunkEnds.length > 2 && this.chunkEnds[0].d < d - 120) this.chunkEnds.shift();
    }
  }
}
