// Validates SONGS in js/audio.js: equal track lengths per song, parseable
// note tokens in a sane frequency range, valid drum tokens.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'js', 'audio.js');
const ctx = { window: {}, setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0, console };
vm.createContext(ctx);
const { SONGS, parseTrack, noteFreq } = vm.runInContext(
  fs.readFileSync(SRC, 'utf8') + '\n;({ SONGS, parseTrack, noteFreq })', ctx);
const DRUMS = new Set(['k', 's', 'h', 'o']);
let problems = 0;

for (const [name, song] of Object.entries(SONGS)) {
  const lens = [];
  song.tracks.forEach((tr, i) => {
    const parsed = parseTrack(tr.notes);
    lens.push(parsed.len);
    for (const ev of parsed.events) {
      if (tr.wave === 'noise') {
        if (!DRUMS.has(ev.n)) { console.log(`PROBLEM ${name} track${i}: bad drum token '${ev.n}' at step ${ev.t}`); problems++; }
      } else {
        const f = noteFreq(ev.n);
        if (!isFinite(f) || f < 27 || f > 4500) { console.log(`PROBLEM ${name} track${i}: bad note '${ev.n}' (${f}Hz) at step ${ev.t}`); problems++; }
      }
    }
  });
  const allEq = lens.every(l => l === lens[0]);
  const bars = lens[0] / 8;
  if (!allEq) { console.log(`PROBLEM ${name}: track lengths differ: [${lens.join(', ')}]`); problems++; }
  else if (song.loop && lens[0] % 8 !== 0) { console.log(`WARN ${name}: length ${lens[0]} not bar-aligned`); }
  console.log(`${allEq ? 'ok  ' : 'BAD '}${name.padEnd(10)} tracks=${lens.length} len=[${lens.join(',')}] (${bars} bars)`);
}
console.log(problems ? `\n${problems} problems` : '\nall songs aligned');
process.exit(problems ? 1 : 0);
