// HUD: dew counter, distance, chain, seed icon, dash pip, Tide gap meter,
// tutorial sign echo, and the F3 perf overlay. All DOM — crisp at any dpr.

import { TIDE } from '../config.js';
import { clamp } from '../core/math.js';

export class Hud {
  constructor(uiRoot, input) {
    this.input = input;
    this.root = document.createElement('div');
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <span id="hud-dew">💧 0</span>
          <span id="hud-chain"></span>
          <span id="hud-seed" hidden>🌰</span>
        </div>
        <div class="hud-mid" id="hud-name"></div>
        <div class="hud-right">
          <span id="hud-dash">✦</span>
          <span id="hud-dist">0m</span>
        </div>
      </div>
      <div class="hud-sign" id="hud-sign"></div>
      <div class="hud-tide"><div class="hud-tide-fill" id="hud-tide-fill"></div><span class="hud-tide-label">ROT TIDE</span></div>
      <div class="hud-f3" id="hud-f3" hidden></div>`;
    uiRoot.appendChild(this.root);
    this.el = Object.fromEntries(
      ['hud-dew', 'hud-chain', 'hud-seed', 'hud-name', 'hud-dash', 'hud-dist', 'hud-sign', 'hud-tide-fill', 'hud-f3']
        .map((id) => [id.slice(4).replace('-', ''), this.root.querySelector('#' + id)]));
    this._signT = 0;
  }

  setRunName(name) { this.el.name.textContent = name; }

  handleEvent(ev) {
    if (ev.t === 'sign') {
      this.el.sign.textContent = ev.text
        .replace(/%(\w+)%/g, (_, v) => this.input.labelFor(v))
        .replace(/_/g, ' ');
      this.el.sign.classList.add('show');
      this._signT = 220;
    }
  }

  update(world, dtFrames, fps, renderer) {
    const p = world.player;
    this.el.dew.textContent = `💧 ${world.dew}`;
    this.el.chain.textContent = world.chain >= 5 ? `×${world.chain}` : '';
    this.el.seed.hidden = !world.carrying;
    this.el.dist.textContent = `${Math.floor(p.d)}m`;
    this.el.dash.style.opacity = p.dashCd <= 0 ? 1 : 0.25;
    this.el.dash.style.color = p.dashCd <= 0 ? '#9fe8ff' : '#888';

    const frac = clamp((world.tide.gap - TIDE.catchGap) / (world.tideCfg.maxGap - TIDE.catchGap), 0, 1);
    this.el.tidefill.style.width = `${(1 - frac) * 100}%`;
    this.el.tidefill.style.background = frac < 0.25 ? '#ff3860' : frac < 0.5 ? '#d873a0' : '#7a4a8a';

    if (this._signT > 0) {
      this._signT -= dtFrames;
      if (this._signT <= 0) this.el.sign.classList.remove('show');
    }

    if (!this.el.f3.hidden) {
      this.el.f3.textContent =
        `fps ${fps.toFixed(0)} | draws ${renderer.drawCalls} | tris ${(renderer.triangles / 1000).toFixed(0)}k | ` +
        `fx ${renderer.fx.live.length} | d ${p.d.toFixed(1)} x ${p.x.toFixed(2)} y ${p.y.toFixed(2)} | ` +
        `${p.state}${p.stumbleT > 0 ? '+stumble' : ''} | tide ${world.tide.gap.toFixed(1)} | chunk ${world.track.chunkAt(p.d)}`;
    }
  }

  toggleF3() { this.el.f3.hidden = !this.el.f3.hidden; }
}
