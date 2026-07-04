// Campaign state: everything that outlives a single level attempt. Node-safe.

import { COMBAT as C, START_LIVES, COINS_PER_LIFE, UPGRADES } from '../config.js';

export class Run {
  constructor() {
    this.lives = START_LIVES;
    this.coins = 0;
    this.score = 0;
    this.maxHearts = C.heartsStart;
    this.hearts = C.heartsStart;
    this.sap = 0;
    this.relic = null;              // 'glider' once found
    this.hasBeam = false;           // Sunbeam Lance, unlocked in World 2
    this.upgrades = {};             // shrine purchases by key
    this.stars = {};                // levelId -> Set(starIndex) collected (permanent record)
    this.starsSpent = 0;
    this.unlocked = ['1-1'];        // overworld nodes reachable
    this.cleared = {};              // levelId -> { normal: true, secret: true }
    this.bestTimes = {};            // levelId -> frames
    this.checkpoint = null;         // { levelId, x, y, room }
    this.currentLevel = null;
  }

  get starsAvailable() {
    let total = 0;
    for (const k in this.stars) total += this.stars[k].size;
    return total - this.starsSpent;
  }
  get starsCollected() {
    let total = 0;
    for (const k in this.stars) total += this.stars[k].size;
    return total;
  }

  addCoin(n = 1) {
    this.coins += n;
    while (this.coins >= COINS_PER_LIFE) { this.coins -= COINS_PER_LIFE; this.lives++; }
  }
  addScore(n) { this.score += n; }
  addSap(n) { this.sap = Math.min(C.sapMax, this.sap + n); }

  hasStar(levelId, idx) { return this.stars[levelId]?.has(idx) || false; }
  collectStar(levelId, idx) {
    (this.stars[levelId] ||= new Set()).add(idx);
  }

  canBuy(key) {
    const u = UPGRADES[key];
    if (!u || this.upgrades[key]) return false;
    if (u.needs && !this.upgrades[u.needs]) return false;
    if (key.startsWith('heart') && this.maxHearts >= C.heartsCap) return false;
    return this.starsAvailable >= u.cost;
  }
  buy(key) {
    if (!this.canBuy(key)) return false;
    this.starsSpent += UPGRADES[key].cost;
    this.upgrades[key] = true;
    if (key.startsWith('heart')) {
      this.maxHearts = Math.min(C.heartsCap, this.maxHearts + 1);
      this.hearts = this.maxHearts;
    }
    return true;
  }

  refill() { this.hearts = this.maxHearts; }

  serialize() {
    return {
      v: 1,
      lives: this.lives, coins: this.coins, score: this.score,
      maxHearts: this.maxHearts, relic: this.relic, hasBeam: this.hasBeam,
      upgrades: this.upgrades,
      stars: Object.fromEntries(Object.entries(this.stars).map(([k, s]) => [k, [...s]])),
      starsSpent: this.starsSpent,
      unlocked: this.unlocked, cleared: this.cleared,
      bestTimes: this.bestTimes,
    };
  }
  static deserialize(data) {
    const r = new Run();
    if (!data) return r;
    Object.assign(r, {
      lives: data.lives ?? START_LIVES, coins: data.coins ?? 0, score: data.score ?? 0,
      maxHearts: data.maxHearts ?? C.heartsStart, relic: data.relic ?? null,
      hasBeam: data.hasBeam ?? false, upgrades: data.upgrades ?? {},
      starsSpent: data.starsSpent ?? 0,
      unlocked: data.unlocked ?? ['1-1'], cleared: data.cleared ?? {},
      bestTimes: data.bestTimes ?? {},
    });
    r.stars = {};
    for (const [k, arr] of Object.entries(data.stars || {})) r.stars[k] = new Set(arr);
    r.hearts = r.maxHearts;
    return r;
  }
}
