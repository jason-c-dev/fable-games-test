// UI states: title (with animated logo + attract demo), pause, game over, credits.

class TitleState {
  constructor() {
    this.t = 0;
    this.idle = 0;
    Music.play('title');
    this.eraseHeld = 0;
  }
  update() {
    this.t++;
    this.idle++;
    if (Input.held.run && Input.pressed.start) {
      // erase save
      Save.reset();
      AudioSys.brick();
      this.idle = 0;
      return;
    }
    if (Input.pressed.start || Input.pressed.jump) {
      AudioSys.select();
      Music.stop();
      Main.newRun();
      Game.wipe(() => Main.toOverworld());
      return;
    }
    if (Object.keys(Input.pressed).length) this.idle = 0;
    if (this.idle > 720) {
      Main.startDemo();
    }
  }
  draw(ctx) {
    // meadow backdrop
    ctx.drawImage(Sprites.bg[0].far, 0, 0);
    const scroll = (this.t * 0.5) % VIEW_W;
    ctx.drawImage(Sprites.bg[0].near, -scroll, VIEW_H - 120);
    ctx.drawImage(Sprites.bg[0].near, VIEW_W - scroll, VIEW_H - 120);
    // ground strip
    const tiles = Sprites.tiles[0];
    for (let x = 0; x < VIEW_W + TILE; x += TILE) {
      ctx.drawImage(tiles.groundTop, x - (this.t % TILE), VIEW_H - 32);
      ctx.drawImage(tiles.groundFill, x - (this.t % TILE), VIEW_H - 16);
    }
    // pip running in place
    const sheet = Sprites.pip[POWER.SPROUT];
    drawSprite(ctx, sheet.walk[(this.t >> 3) % 2], VIEW_W / 2 - 90, VIEW_H - 32, false, { x: 0, y: 0 });
    drawSprite(ctx, Sprites.moss.walk[(this.t >> 3) % 2], VIEW_W / 2 - 120, VIEW_H - 32, false, { x: 0, y: 0 });
    drawSprite(ctx, Sprites.bumble.walk[(this.t >> 4) % 2], VIEW_W / 2 + 110, VIEW_H - 32, true, { x: 0, y: 0 });

    // animated logo: letters bounce in
    const title1 = 'SPROUT', title2 = 'KINGDOM';
    const drawLogo = (word, cx, y, scale, color) => {
      const step = (FONT_W + 1) * scale;
      let x = cx - (word.length * step - scale) / 2;
      for (let i = 0; i < word.length; i++) {
        const delay = i * 5;
        const p = clamp((this.t - delay) / 30, 0, 1);
        const drop = (1 - p) * -80;
        const bounce = p >= 1 ? Math.sin(this.t / 20 + i * 0.8) * 2 : 0;
        drawText(ctx, word[i], x + i * step, y + drop + bounce, color, scale, '#3a1c10');
      }
    };
    drawLogo(title1, VIEW_W / 2, 42, 4, '#9ee55c');
    drawLogo(title2, VIEW_W / 2, 76, 4, '#ffd23e');
    // sun seed over the logo
    if (this.t > 70) {
      const g = Math.sin(this.t / 15) * 0.15 + 0.85;
      ctx.globalAlpha = g;
      ctx.drawImage(Sprites.sunSeed, VIEW_W / 2 - 8, 10);
      ctx.globalAlpha = 1;
    }

    if (this.t > 80 && (this.t >> 4) % 2) {
      drawTextC(ctx, 'PRESS ENTER', VIEW_W / 2, 118, '#ffffff', 2, '#00000080');
    }
    drawTextC(ctx, 'HI SCORE ' + Save.data.highScore + '   SUN SEEDS ' + Save.data.seeds.length + '/6',
      VIEW_W / 2, 136, '#aef7ff', 1, '#00000080');

    // controls overlay
    ctx.fillStyle = '#00000065';
    ctx.fillRect(VIEW_W / 2 - 150, 146, 300, 84);
    drawTextC(ctx, 'CONTROLS', VIEW_W / 2, 152, '#ffd23e', 1);
    const lines = [
      'ARROWS / WASD  MOVE + CROUCH',
      'Z / SPACE  JUMP    C  SPIN-HOP',
      'X / SHIFT  RUN, CARRY, THROW',
      'DOWN  ENTER BURROWS   M  MUTE',
      'ESC / P  PAUSE',
    ];
    lines.forEach((l, i) => drawTextC(ctx, l, VIEW_W / 2, 164 + i * 12, '#ffffff'));

    drawTextC(ctx, 'AN ORIGINAL SPROUT KINGDOM ADVENTURE', VIEW_W / 2, 262, '#f5e6c8', 1, '#00000060');
    drawTextC(ctx, 'HOLD X AND PRESS ENTER TO ERASE SAVE', VIEW_W / 2, 275, '#ffffff60', 1, '#00000060');
  }
}

// ---------------- pause ----------------
class PauseState {
  constructor(level) {
    this.level = level;
    this.sel = 0;
    this.items = ['RESUME', 'RESTART LEVEL', 'EXIT TO MAP', 'QUIT TO TITLE'];
  }
  update() {
    if (Input.pressed.down) { this.sel = (this.sel + 1) % this.items.length; AudioSys.moveCursor(); }
    if (Input.pressed.up) { this.sel = (this.sel + 3) % this.items.length; AudioSys.moveCursor(); }
    if (Input.pressed.pause) { Game.setState(this.level); AudioSys.pause(); return; }
    if (Input.pressed.start || Input.pressed.jump) {
      AudioSys.select();
      const choice = this.items[this.sel];
      if (choice === 'RESUME') Game.setState(this.level);
      else if (choice === 'RESTART LEVEL') {
        Music.stop();
        Game.wipe(() => Main.startLevel(this.level.def.id));
      } else if (choice === 'EXIT TO MAP') {
        Music.stop();
        Game.wipe(() => Main.toOverworld(this.level.def.id));
      } else {
        Music.stop();
        Game.wipe(() => Main.toTitle());
      }
    }
  }
  draw(ctx) {
    this.level.draw(ctx);
    ctx.fillStyle = 'rgba(8,5,10,0.72)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextC(ctx, 'PAUSED', VIEW_W / 2, 70, '#ffd23e', 3, '#00000080');
    this.items.forEach((it, i) => {
      const sel = i === this.sel;
      drawTextC(ctx, (sel ? '> ' : '  ') + it + (sel ? ' <' : '  '), VIEW_W / 2, 120 + i * 20,
        sel ? '#ffffff' : '#b0a8a0', sel ? 2 : 1, '#00000080');
    });
    drawTextC(ctx, 'M: ' + (AudioSys.muted ? 'UNMUTE' : 'MUTE'), VIEW_W / 2, 220, '#ffffff70', 1);
  }
}

// ---------------- game over ----------------
class GameOverState {
  constructor() {
    this.t = 0;
    Music.play('gameover');
  }
  update() {
    this.t++;
    if (this.t > 60 && (Input.pressed.start || Input.pressed.jump)) {
      AudioSys.select();
      Main.newRun();
      Music.stop();
      Game.wipe(() => Main.toOverworld());
    }
    if (this.t > 60 && Input.pressed.pause) {
      Music.stop();
      Game.wipe(() => Main.toTitle());
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#120a14';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    drawTextC(ctx, 'GAME OVER', VIEW_W / 2, 100, '#ff5f45', 3, '#3a0a08');
    const img = Sprites.pip[POWER.SMALL].idle;
    drawSprite(ctx, img, VIEW_W / 2, 150, false, { x: 0, y: 0 });
    if (this.t > 60) {
      drawTextC(ctx, 'ENTER: CONTINUE FROM THE MAP', VIEW_W / 2, 180, (this.t >> 4) % 2 ? '#ffffff' : '#ffd23e', 1);
      drawTextC(ctx, 'ESC: TITLE', VIEW_W / 2, 196, '#ffffff70', 1);
    }
    drawTextC(ctx, 'SCORE ' + Run.score, VIEW_W / 2, 226, '#ffffff', 1);
  }
}

// ---------------- credits ----------------
class CreditsState {
  constructor() {
    this.t = 0;
    Music.play('credits');
    this.cast = [
      ['PIP THE GARDENER', () => Sprites.pip[POWER.SPROUT].idle],
      ['MOSS THE BEETLE', () => Sprites.moss.walk[0]],
      ['BUMBLE', () => Sprites.bumble.walk[0]],
      ['SNAPCAP', () => Sprites.snapcap.walk[0]],
      ['SPIKELET', () => Sprites.spikelet.walk[0]],
      ['PUFFHAWK', () => Sprites.puffhawk.fly[0]],
      ['THORN LOBBER', () => Sprites.lobber.idle[0]],
      ['WISP', () => Sprites.wisp.chase],
      ['KING SNAPJAW', () => Sprites.boss.snapjaw.walk[0]],
      ['GRUBMAW', () => Sprites.boss.grubmaw.up[0]],
      ['GALE TALON', () => Sprites.boss.gale.fly[0]],
      ['GENERAL BRAMBLE', () => Sprites.boss.bramble.walk[0]],
    ];
    // total stars collected
    this.stars = 0;
    for (const id of LEVEL_ORDER) {
      const rec = Save.data.levels[id];
      if (rec) this.stars += rec.stars.filter(Boolean).length;
    }
  }
  update() {
    this.t++;
    if (this.t > 400 && (Input.pressed.start || Input.pressed.pause)) {
      Music.stop();
      Game.wipe(() => Main.toTitle());
    }
  }
  draw(ctx) {
    ctx.fillStyle = '#0e0a18';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // starfield of dew stars
    for (let i = 0; i < 40; i++) {
      const sx = (i * 97) % VIEW_W, sy = (i * 61 + this.t * 0.2) % VIEW_H;
      ctx.fillStyle = i % 3 ? '#ffffff30' : '#aef7ff50';
      ctx.fillRect(sx, sy, 2, 2);
    }
    const scroll = this.t * 0.45;
    let y = VIEW_H + 20 - scroll;
    const line = (txt, color = '#ffffff', scale = 1, dy = 18) => {
      if (y > -20 && y < VIEW_H + 20) drawTextC(ctx, txt, VIEW_W / 2, y, color, scale, '#00000080');
      y += dy * scale;
    };
    line('SPROUT KINGDOM', '#9ee55c', 3, 12);
    line('', '#fff', 1, 10);
    line('THE SIX SUN SEEDS SHINE AGAIN.', '#ffd23e');
    line('THE KINGDOM BLOOMS. GENERAL BRAMBLE', '#fff');
    line('HAS RETIRED TO A QUIET HEDGE.', '#fff');
    y += 20;
    line('STARRING', '#aef7ff', 2, 14);
    y += 8;
    for (const [name, sprite] of this.cast) {
      const img = sprite();
      if (y > -50 && y < VIEW_H + 50) {
        ctx.drawImage(img, VIEW_W / 2 - img.width / 2, y);
      }
      y += img.height + 6;
      line(name, '#ffffff', 1, 20);
    }
    y += 16;
    line('FINAL SCORE ' + Run.score, '#ffd23e', 2, 14);
    y += 6;
    line('SUN SEEDS ' + Save.data.seeds.length + '/6', '#ffd23e');
    line('DEW STARS ' + this.stars + '/60', '#aef7ff');
    if (Save.data.seeds.length >= 6 && this.stars >= 60) {
      y += 10;
      line('PERFECT HARVEST! 100 PERCENT!', '#9ee55c', 2, 14);
    }
    y += 30;
    line('MADE WITH CANVAS, CHIPTUNES', '#b0a8a0');
    line('AND NO EXTERNAL ASSETS', '#b0a8a0');
    y += 20;
    line('THANK YOU FOR PLAYING!', '#ffffff', 2, 14);
    y += 40;
    if (y < VIEW_H / 2) {
      drawTextC(ctx, 'THE END', VIEW_W / 2, VIEW_H / 2 - 8, '#ffd23e', 3, '#3a1c10');
      if ((this.t >> 4) % 2) drawTextC(ctx, 'PRESS ENTER', VIEW_W / 2, VIEW_H / 2 + 30, '#ffffff', 1);
    }
  }
}
