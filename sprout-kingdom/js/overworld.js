// Overworld map: node-and-path navigation across the four worlds.

class OverworldState {
  constructor(focusId) {
    this.sel = focusId && Save.data.unlocked.includes(focusId) ? focusId :
      Save.data.unlocked[Save.data.unlocked.length - 1] || '1-1';
    const n = WORLD_MAP.nodes[this.sel];
    this.tokenX = n.x; this.tokenY = n.y;
    this.moving = null;
    this.camX = clamp(n.x - VIEW_W / 2, 0, WORLD_MAP.width - VIEW_W);
    this.animT = 0;
    Music.play('map');
  }

  // a path is open if the "far" node is unlocked
  openPaths(fromId) {
    const out = [];
    for (const [a, b, kind] of WORLD_MAP.paths) {
      let other = null;
      if (a === fromId) other = b;
      else if (b === fromId) other = a;
      if (!other) continue;
      if (!Save.data.unlocked.includes(other)) continue;
      out.push({ to: other, kind });
    }
    return out;
  }

  update() {
    this.animT++;
    const nodes = WORLD_MAP.nodes;

    if (this.moving) {
      const m = this.moving;
      m.t++;
      const p = Math.min(1, m.t / 24);
      const e = p * p * (3 - 2 * p);
      this.tokenX = lerp(m.x0, m.x1, e);
      this.tokenY = lerp(m.y0, m.y1, e) - Math.sin(p * Math.PI * 3) * 4;
      if (p >= 1) { this.sel = m.to; this.moving = null; }
    } else {
      let dir = null;
      if (Input.pressed.left) dir = { x: -1, y: 0 };
      else if (Input.pressed.right) dir = { x: 1, y: 0 };
      else if (Input.pressed.up) dir = { x: 0, y: -1 };
      else if (Input.pressed.down) dir = { x: 0, y: 1 };
      if (dir) {
        const from = nodes[this.sel];
        let best = null, bestScore = 0.35;
        for (const p of this.openPaths(this.sel)) {
          const to = nodes[p.to];
          const dx = to.x - from.x, dy = to.y - from.y;
          const len = Math.hypot(dx, dy) || 1;
          const dot = (dx * dir.x + dy * dir.y) / len;
          if (dot > bestScore) { bestScore = dot; best = p; }
        }
        if (best) {
          const to = nodes[best.to];
          this.moving = { t: 0, x0: this.tokenX, y0: this.tokenY, x1: to.x, y1: to.y, to: best.to };
          AudioSys.moveCursor();
        }
      }
      if (Input.pressed.start || Input.pressed.jump) {
        AudioSys.select();
        Music.stop();
        Game.wipe(() => Main.startLevel(this.sel));
      }
      if (Input.pressed.pause) {
        Game.wipe(() => Main.toTitle());
      }
    }

    // camera eases toward token
    const target = clamp(this.tokenX - VIEW_W / 2, 0, WORLD_MAP.width - VIEW_W);
    this.camX += (target - this.camX) * 0.08;
  }

  draw(ctx) {
    const camX = Math.round(this.camX);
    // background: blend world zone colors
    const zoneW = WORLD_MAP.width / 4;
    for (let w = 0; w < 4; w++) {
      const wp = Sprites.worldPal[w];
      const x0 = Math.round(w * zoneW - camX);
      if (x0 > VIEW_W || x0 + zoneW < 0) continue;
      const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
      grad.addColorStop(0, wp.skyTop);
      grad.addColorStop(1, wp.skyBot);
      ctx.fillStyle = grad;
      ctx.fillRect(x0, 0, zoneW + 1, VIEW_H);
      // zone label
      drawTextC(ctx, WORLD_NAMES[w], x0 + zoneW / 2, 34, '#ffffff', 1, '#00000060');
    }
    // decorative near layer
    for (let w = 0; w < 4; w++) {
      const x0 = Math.round(w * zoneW - camX);
      if (x0 > VIEW_W || x0 + zoneW < -VIEW_W) continue;
      ctx.globalAlpha = 0.5;
      ctx.drawImage(Sprites.bg[w].near, x0, VIEW_H - 100, zoneW, 100);
      ctx.globalAlpha = 1;
    }

    // paths
    const nodes = WORLD_MAP.nodes;
    for (const [a, b, kind] of WORLD_MAP.paths) {
      const na = nodes[a], nb = nodes[b];
      const open = Save.data.unlocked.includes(a) && Save.data.unlocked.includes(b);
      if (!open && kind === 'secret') continue; // hidden until found
      const dots = Math.floor(Math.hypot(nb.x - na.x, nb.y - na.y) / 10);
      for (let i = 1; i < dots; i++) {
        const t = i / dots;
        const x = lerp(na.x, nb.x, t) - camX;
        const y = lerp(na.y, nb.y, t) - Math.sin(t * Math.PI) * (kind === 'secret' ? 26 : 8);
        ctx.fillStyle = open ? (kind === 'secret' ? '#ffd23e' : '#fff8e8') : '#00000040';
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
      }
    }

    // nodes
    for (const id of LEVEL_ORDER) {
      const n = nodes[id];
      const x = Math.round(n.x - camX), y = Math.round(n.y);
      if (x < -30 || x > VIEW_W + 30) continue;
      const unlocked = Save.data.unlocked.includes(id);
      const rec = Save.data.levels[id];
      const isBoss = id.endsWith('B');
      // node base
      if (isBoss) {
        ctx.fillStyle = unlocked ? '#6a4a3a' : '#33241e';
        ctx.fillRect(x - 9, y - 10, 18, 16);
        ctx.fillStyle = unlocked ? '#8a6a50' : '#443028';
        ctx.fillRect(x - 11, y - 14, 6, 20); ctx.fillRect(x + 5, y - 14, 6, 20);
        ctx.fillStyle = unlocked ? '#ffd23e' : '#555';
        ctx.fillRect(x - 2, y - 4, 4, 10);
      } else {
        ctx.fillStyle = '#00000050';
        ctx.beginPath(); ctx.arc(x, y + 2, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = !unlocked ? '#4a4048' : (rec && rec.clear ? '#63c94f' : '#e8a83a');
        ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff70';
        ctx.fillRect(x - 4, y - 5, 4, 2);
      }
      if (rec && rec.secret) {
        drawText(ctx, '*', x + 8, y - 12, '#ffd23e', 1);
      }
    }

    // token (Pip's head bobbing)
    const ty = this.tokenY - 14 + Math.sin(this.animT / 16) * 2;
    ctx.drawImage(Sprites.hud.pipHead, Math.round(this.tokenX - camX - 7), Math.round(ty - 6));

    // top bar: seeds + score
    ctx.fillStyle = '#00000060';
    ctx.fillRect(0, 0, VIEW_W, 20);
    ctx.drawImage(Sprites.sunSeed, 8, 1, 12, 15);
    drawText(ctx, 'x' + Save.data.seeds.length + '/6', 24, 7, '#ffd23e', 1, '#00000080');
    ctx.drawImage(Sprites.hud.pipHead, 80, 4);
    drawText(ctx, 'x' + Run.lives, 96, 7, '#ffffff', 1, '#00000080');
    drawTextR(ctx, 'HI ' + Save.data.highScore, VIEW_W - 8, 7, '#ffffff', 1, '#00000080');

    // bottom panel: selected level info
    const def = LEVELS[this.sel];
    const rec = Save.levelRec(this.sel);
    ctx.fillStyle = '#00000070';
    ctx.fillRect(0, VIEW_H - 46, VIEW_W, 46);
    drawText(ctx, this.sel + '  ' + def.name, 12, VIEW_H - 38, '#ffffff', 1, '#00000080');
    if (!def.boss) {
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = rec.stars[i] ? 1 : 0.25;
        ctx.drawImage(Sprites.dewStar[0], 12 + i * 15, VIEW_H - 26);
        ctx.globalAlpha = 1;
      }
      if (rec.bestTime != null) {
        drawText(ctx, 'BEST ' + fmtTime(rec.bestTime), 70, VIEW_H - 22, '#9ee55c', 1, '#00000080');
      }
    } else {
      drawText(ctx, 'BOSS: ' + (def.bossName || ''), 12, VIEW_H - 24, '#ff8a7a', 1, '#00000080');
    }
    if (rec.secret) drawText(ctx, 'SECRET FOUND', 170, VIEW_H - 22, '#ffd23e', 1, '#00000080');
    drawTextR(ctx, ((Game.frame >> 4) % 2 ? '> ' : '  ') + 'ENTER: PLAY', VIEW_W - 10, VIEW_H - 38, '#ffffff', 1, '#00000080');
    drawTextR(ctx, 'ESC: TITLE', VIEW_W - 10, VIEW_H - 24, '#ffffff80', 1);
  }
}
