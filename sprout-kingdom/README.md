# Sprout Kingdom

A complete, original 16-bit-style browser platformer. Vanilla JavaScript +
HTML5 Canvas — no frameworks, no build step, no external assets. Every sprite
is procedurally drawn pixel art generated at load time, and every sound and
song is synthesized live with the Web Audio API (pulse-wave instruments,
vibrato, tempo-synced echo, and a synthesized drum kit driving multi-voice
compositions per world).

## Run it

```
python3 -m http.server 8377   # from the repo root
# open http://localhost:8377/sprout-kingdom/
```

(Opening `index.html` directly from disk also works.)

## How to play

You are **Pip**, a small gardener out to recover the six Sun Seeds stolen by
**General Bramble**. Move with **arrows/WASD**, jump with **Z/Space** (hold to
jump higher; you jump higher still with a run-up), run and carry shells with
**X/Shift**, and **spin-hop** with **C** (or double-tap jump) to break bricks
beneath you and bounce safely off spiky enemies. Press **Down** on a burrow to
enter bonus cellars. Stomp enemies, bump `?` blocks, eat Sun Fruit to grow,
find Fire Blossoms to throw seeds, grab a maple Glider Cap to soar, and ride
**Moss** the beetle (bump the beetle blocks) — he eats enemies with his tongue
and takes a hit for you. Sprint at full speed to charge the **P-meter**
(chevrons in the HUD): full meter means higher jumps, and with the Glider Cap
a run-up jump becomes genuine soaring flight. Press **Down + jump** to drop
through one-way platforms. Each level hides **3 Dew Stars** and ends with a
timing-dial goal gate; two levels hide **secret exits**. 100 coins = extra
life. **Esc/P/Enter** pauses, **M** mutes. **Gamepads** work too (standard
mapping: dpad/stick moves, A jumps, X/B runs, LB/B spin, Start pauses).

## Structure

- 4 worlds (Meadow, Cavern, Cloudline, Bramble Keep), 4 levels + 1 multi-phase
  boss each, connected by a node-and-path overworld map.
- Two secret exits (1-2, 3-2) open shortcut paths and hold bonus Sun Seeds:
  4 boss seeds + 2 secret seeds = 6.
- Progress (unlocks, Dew Stars, secrets, best times, high score) persists in
  localStorage. Hold X + Enter on the title to erase the save.

## Code layout

| file | contents |
|---|---|
| `js/constants.js` | physics tuning, tile ids, scoring |
| `js/font.js` | 5x7 procedural pixel font |
| `js/sprites.js` | all pixel art, generated to offscreen canvases |
| `js/audio.js` | SFX synthesis + chiptune step-sequencer and songs |
| `js/engine.js` | fixed-timestep loop, input, camera, particles, save |
| `js/levels.js` / `js/levels2.js` | ASCII level DSL + all 20 hand-authored levels + map graph |
| `js/player.js` | Pip physics, power-ups, carrying, riding |
| `js/items.js` | coins, Dew Stars, power items, Moss, projectiles |
| `js/enemies.js` | Bumbles, Snapcaps/shells, Spikelets, Puffhawks, Lobbers, Wisps, Pods |
| `js/bosses.js` | King Snapjaw, Grubmaw, Gale Talon, General Bramble |
| `js/gameplay.js` | level simulation, HUD, hazards (dark/wind/lava), goal flow |
| `js/overworld.js`, `js/ui.js`, `js/main.js` | map, title/pause/credits, glue |

## Level QA tooling

Every level is validated headlessly — this ran green before shipping:

```
node tools/verify-levels.js            # structure + jump-physics reachability BFS
node tools/check-songs.js              # music: per-song track alignment + note sanity
NODE_PATH=$(npm root -g) node tools/browser-test.js     # drives the real game in headless Chrome
NODE_PATH=$(npm root -g) node tools/mechanics-test.js   # stomp/bump/power-up/shell/P-meter/boss probes
```

The verifier parses each level with the real DSL parser and BFS-checks that the
goal, checkpoint, every Dew Star, and every burrow door are reachable from the
start under conservative jump physics (≤4 tiles up, ≤6 across, movers as
bridges). Browser tests confirmed all 20 levels load and play, all four bosses
can be damaged and defeated through their intended mechanics, secret exits
unlock their shortcut paths, and the title → map → level → clear → credits flow
works end to end at 60fps with zero console errors.

## About the prompt

The game grew from [`platformer-prompt.md`](platformer-prompt.md) — a single
~1,100-word build brief. In hindsight, a handful of its clauses did most of
the work of making the result an actual game rather than a demo:

**It pinned down *feel* before features.** The prompt's core-physics section
is explicit and numeric where it matters:

> *"Momentum-based movement: walk → run acceleration, skidding when reversing
> at speed, shorter/taller jumps based on button hold time, higher jump apex
> when running. Coyote time (~5 frames) and jump buffering (~5 frames)."*

Naming coyote time and jump buffering with frame counts turned "make it feel
good" from taste into spec. Everything else in a platformer sits on top of
whether those five lines are right.

**It demanded the game test itself.** The process section is the most
load-bearing paragraph in the file:

> *"Build QA tooling as you go and keep it green: a headless reachability
> verifier for every level (goal, checkpoint, every Dew Star, every door
> reachable under conservative jump physics), the song-alignment checker,
> browser-driven playtests of all levels and full boss fights, and focused
> mechanics probes…"*

Twenty hand-authored ASCII levels invite twenty typos. The verifier caught
unreachable stars and impossible gaps at authoring time instead of at play
time, and it's the reason later tuning passes (physics, new mechanics) could
be made without silently breaking old levels.

**It legislated against boilerplate bosses.** Rather than "add four bosses,"
the prompt said:

> *"The fights must not share a skeleton: give each boss its own vulnerability
> logic, not four variations of 'wait for the window, stomp three times.'
> Punish passive play… and reward aggression with a skill-based shortcut."*

That single constraint produced four genuinely different fights instead of
one fight wearing four hats.

**It forced order-of-operations.** *"Engine + physics feel first (build a
test level and tune it until movement feels great), then… World 1 complete
end-to-end including its boss, then remaining worlds, then polish"* — building
one vertical slice before scaling out meant every later level was authored
against a finished, tuned movement model.

**It made the soundtrack a requirement, not an afterthought** — down to duty
cycles, vibrato, an echo bus for the cave world, and a headless checker for
song alignment. "Treat the music as a real soundtrack, not a placeholder" is
the difference between three beeps and four world themes.

**Testing honesty:** at the time of writing, everything above has been
verified by the game's own automated QA (the verifier, browser playthroughs,
mechanics probes) plus Fable's scripted bot runs — **not yet by a full human
playthrough**. Automation proves completability; only hands on keys prove fun.
