// HUD: hearts, Sap Gauge, coins, Dew Stars, relic, timer, beam heat,
// boss health bar, level name card. Drawn in screen space (512x288).

import { Container, Sprite, Graphics, Text } from 'pixi.js';
import { VIEW_W, VIEW_H, COMBAT as C } from '../config.js';
import { TEX } from './gfx.js';
import { clamp } from '../core/math.js';

export function makeText(str, size = 8, opts = {}) {
  const t = new Text({
    text: str,
    style: {
      fontFamily: 'Trebuchet MS, Verdana, sans-serif',
      fontSize: size,
      fontWeight: opts.weight || '900',
      fill: opts.fill ?? 0xffffff,
      stroke: { color: opts.stroke ?? 0x1a2418, width: opts.strokeW ?? Math.max(1.2, size * 0.18) },
      letterSpacing: opts.spacing ?? 0.5,
      align: opts.align || 'left',
      dropShadow: opts.shadow === false ? undefined : { color: 0x000000, alpha: 0.4, blur: 0, distance: 1, angle: Math.PI / 3 },
    },
  });
  if (opts.anchor !== undefined) t.anchor.set(...(Array.isArray(opts.anchor) ? opts.anchor : [opts.anchor, opts.anchor]));
  return t;
}

export class Hud {
  constructor(input) {
    this.c = new Container();
    this.input = input;
    this.t = 0;

    // hearts
    this.heartSprites = [];
    this.heartsC = new Container();
    this.heartsC.position.set(8, 7);
    this.c.addChild(this.heartsC);

    // sap gauge
    this.sapBack = new Graphics();
    this.sapFill = new Graphics();
    this.sapGlow = new Sprite(TEX.glowSmall);
    this.sapGlow.anchor.set(0.5); this.sapGlow.blendMode = 'add';
    this.sapGlow.tint = 0xa8e05a; this.sapGlow.visible = false;
    this.c.addChild(this.sapBack, this.sapFill, this.sapGlow);

    // heat
    this.heatG = new Graphics();
    this.c.addChild(this.heatG);

    // right cluster
    this.timerT = makeText('0:00.00', 8, { anchor: [1, 0] });
    this.timerT.position.set(VIEW_W - 8, 6);
    this.coinIcon = new Sprite(TEX.items.coin);
    this.coinIcon.width = 8; this.coinIcon.height = 9.5;
    this.coinIcon.position.set(VIEW_W - 66, 18);
    this.coinT = makeText('x00', 8, { anchor: [0, 0] });
    this.coinT.position.set(VIEW_W - 56, 17);
    this.starIcon = new Sprite(TEX.items.star);
    this.starIcon.width = 10; this.starIcon.height = 10;
    this.starIcon.position.set(VIEW_W - 36, 17.5);
    this.starT = makeText('x00', 8, { anchor: [0, 0] });
    this.starT.position.set(VIEW_W - 24, 17);
    this.livesT = makeText('PIP x5', 8, { anchor: [1, 0] });
    this.livesT.position.set(VIEW_W - 8, 30);
    this.c.addChild(this.timerT, this.coinIcon, this.coinT, this.starIcon, this.starT, this.livesT);

    // relic box
    this.relicIcon = new Sprite(TEX.items.glider);
    this.relicIcon.width = 14; this.relicIcon.height = 10;
    this.relicIcon.position.set(10, 34);
    this.relicIcon.visible = false;
    this.c.addChild(this.relicIcon);

    // boss bar
    this.bossC = new Container();
    this.bossC.visible = false;
    this.bossBack = new Graphics();
    this.bossFill = new Graphics();
    this.bossName = makeText('', 7, { anchor: [0.5, 1] });
    this.bossName.position.set(VIEW_W / 2, VIEW_H - 16);
    this.bossC.addChild(this.bossBack, this.bossFill, this.bossName);
    this.c.addChild(this.bossC);

    // level card
    this.card = new Container();
    this.cardBack = new Graphics();
    this.cardT = makeText('', 14, { anchor: 0.5 });
    this.cardSub = makeText('', 7, { anchor: 0.5, fill: 0xd8e8c8 });
    this.card.addChild(this.cardBack, this.cardT, this.cardSub);
    this.card.visible = false;
    this.c.addChild(this.card);
    this.cardTimer = 0;
  }

  showCard(title, sub = '') {
    this.cardT.text = title;
    this.cardSub.text = sub;
    this.cardSub.position.set(VIEW_W / 2, VIEW_H / 2 - 18);
    this.cardT.position.set(VIEW_W / 2, VIEW_H / 2 - 32);
    this.cardBack.clear();
    const w = Math.max(this.cardT.width + 40, 160);
    this.cardBack.roundRect(VIEW_W / 2 - w / 2, VIEW_H / 2 - 48, w, 42, 6)
      .fill({ color: 0x101a12, alpha: 0.82 })
      .stroke({ width: 1.5, color: 0x8fce58, alpha: 0.8 });
    this.card.visible = true;
    this.cardTimer = 130;
  }

  update(world, run, dt) {
    this.t += dt;

    // hearts
    if (this.heartSprites.length !== run.maxHearts) {
      this.heartsC.removeChildren();
      this.heartSprites = [];
      for (let i = 0; i < run.maxHearts; i++) {
        const s = new Sprite(TEX.items.heart);
        s.width = 11; s.height = 10;
        s.x = i * 13;
        this.heartsC.addChild(s);
        this.heartSprites.push(s);
      }
    }
    const low = run.hearts <= 1;
    for (let i = 0; i < this.heartSprites.length; i++) {
      const s = this.heartSprites[i];
      s.texture = i < run.hearts ? TEX.items.heart : TEX.items.heartEmpty;
      const pulse = low && i < run.hearts ? 1 + Math.sin(this.t * 0.25) * 0.15 : 1;
      s.scale.set((11 / (TEX.items.heart.width / 6)) / 6 * pulse);
    }

    // sap
    const sapY = 21, sapW = 46;
    const frac = run.sap / C.sapMax;
    this.sapBack.clear();
    this.sapBack.roundRect(8, sapY, sapW, 5, 2.5).fill({ color: 0x101a12, alpha: 0.75 })
      .stroke({ width: 1, color: 0x3c5e28, alpha: 0.9 });
    this.sapFill.clear();
    if (frac > 0.01) {
      this.sapFill.roundRect(9, sapY + 1, (sapW - 2) * frac, 3, 1.5)
        .fill({ color: frac >= 1 ? 0xd6ff8a : 0xa8e05a });
    }
    this.sapGlow.visible = frac >= 1;
    if (this.sapGlow.visible) {
      this.sapGlow.position.set(8 + sapW, sapY + 2.5);
      this.sapGlow.width = this.sapGlow.height = 14 + Math.sin(this.t * 0.2) * 3;
      this.sapGlow.alpha = 0.5;
    }

    // heat
    this.heatG.clear();
    if (run.hasBeam) {
      const p = world.player;
      const hfrac = clamp(p.heat / C.beamHeatMax, 0, 1);
      this.heatG.roundRect(8, 28.5, 34, 3.5, 1.7).fill({ color: 0x101a12, alpha: 0.7 });
      if (hfrac > 0.02) {
        this.heatG.roundRect(8.7, 29.2, 32.6 * hfrac, 2.1, 1)
          .fill({ color: p.overheat > 0 ? (Math.floor(this.t / 4) % 2 ? 0xff3c3c : 0xffa03c) : hfrac > 0.75 ? 0xff6b3d : 0xffd76e });
      }
    }

    // right cluster
    const secs = world.timeF / 60;
    const m = Math.floor(secs / 60), s2 = (secs % 60);
    this.timerT.text = `${m}:${s2 < 10 ? '0' : ''}${s2.toFixed(2)}`;
    this.coinT.text = 'x' + String(run.coins).padStart(2, '0');
    this.starT.text = 'x' + String(run.starsCollected).padStart(2, '0');
    this.livesT.text = 'PIP x' + run.lives;
    this.relicIcon.visible = run.relic === 'glider';

    // boss bar
    const boss = world.boss && !world.boss.removed && world.boss.engaged ? world.boss : null;
    this.bossC.visible = !!boss;
    if (boss) {
      const bw = 200;
      this.bossName.text = boss.displayName || 'BOSS';
      this.bossBack.clear();
      this.bossBack.roundRect(VIEW_W / 2 - bw / 2, VIEW_H - 14, bw, 7, 3.5)
        .fill({ color: 0x140a0e, alpha: 0.85 })
        .stroke({ width: 1.2, color: 0xff6b3d, alpha: 0.8 });
      this.bossFill.clear();
      const bfrac = clamp(boss.hp / boss.maxHp, 0, 1);
      if (bfrac > 0.01) {
        this.bossFill.roundRect(VIEW_W / 2 - bw / 2 + 1.5, VIEW_H - 12.7, (bw - 3) * bfrac, 4.4, 2.2)
          .fill({ color: bfrac < 0.34 ? 0xff3c3c : 0xff9d5c });
      }
    }

    // card
    if (this.card.visible) {
      this.cardTimer -= dt;
      this.card.alpha = clamp(Math.min(this.cardTimer / 24, (130 - this.cardTimer) / 14), 0, 1);
      if (this.cardTimer <= 0) this.card.visible = false;
    }
  }
}
