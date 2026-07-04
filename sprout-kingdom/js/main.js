// Bootstrap + run/session state + flow control between states.

// Session (one "run" of the game; reset on game over / new game)
let Run = {
  lives: START_LIVES, coins: 0, score: 0, power: POWER.SMALL, reserve: null,
};

const Main = {
  newRun() {
    Run = { lives: START_LIVES, coins: 0, score: 0, power: POWER.SMALL, reserve: null };
  },

  toTitle() {
    Music.stop();
    Game.setState(new TitleState());
  },

  toOverworld(focusId) {
    Game.setState(new OverworldState(focusId));
  },

  startLevel(id, opts = {}) {
    Game.setState(new LevelState(id, opts));
  },

  startDemo() {
    Music.stop();
    this.newRun();
    Game.anyKey = false;
    Game.setState(new LevelState('1-1', { demo: true }));
  },

  afterDeath(level) {
    Run.lives--;
    Run.power = POWER.SMALL;
    if (Run.lives <= 0) {
      Save.data.highScore = Math.max(Save.data.highScore, Run.score);
      Save.write();
      Game.setState(new GameOverState());
      return;
    }
    // fast respawn at checkpoint
    Game.wipe(() => Main.startLevel(level.def.id, {
      checkpoint: level.checkpoint,
      starsGot: level.starsGot,
    }));
  },

  levelCleared(level, secret) {
    const def = level.def;
    const rec = Save.levelRec(def.id);
    rec.clear = true;
    // merge dew stars
    for (let i = 0; i < 3; i++) rec.stars[i] = rec.stars[i] || !!level.starsGot[i];
    // best time (normal exits on timed levels)
    if (def.time > 0) {
      const elapsed = Math.round(def.time - level.time / 60);
      if (rec.bestTime == null || elapsed < rec.bestTime) rec.bestTime = elapsed;
    }
    // unlocks + sun seeds
    if (secret) {
      rec.secret = true;
      Save.unlock(def.secretNext);
      Save.addSeed(def.id + '-secret');
    } else {
      Save.unlock(def.next);
    }
    if (def.boss) Save.addSeed(def.id);
    Save.data.highScore = Math.max(Save.data.highScore, Run.score);
    Save.write();
    Music.stop();
    if (def.id === '4-B') {
      Game.wipe(() => Game.setState(new CreditsState()));
    } else {
      const focus = secret ? def.secretNext : (def.next || def.id);
      Game.wipe(() => Main.toOverworld(focus));
    }
  },
};

// ---- boot ----
window.addEventListener('load', () => {
  Sprites.init();
  Game.init();
  Main.toTitle();
});
