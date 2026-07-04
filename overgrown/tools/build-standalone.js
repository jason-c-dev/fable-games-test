#!/usr/bin/env node
// Builds standalone.html: the whole game (engine, art code, music, Tone.js,
// PixiJS) inlined into one classic-script HTML file that runs from file://
// with no server — module loading over file:// is blocked by CORS, so the
// standalone build bundles everything into a single IIFE.
// Usage: node tools/build-standalone.js   (requires esbuild on PATH)

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

execSync(
  'esbuild js/main.js --bundle --format=iife --minify ' +
  '--alias:pixi.js=./vendor/pixi.min.mjs --outfile=/tmp/og-bundle.js',
  { cwd: root, stdio: 'inherit' },
);

const bundle = readFileSync('/tmp/og-bundle.js', 'utf8');
const tone = readFileSync(join(root, 'vendor/tone.js'), 'utf8');
const css = readFileSync(join(root, 'css/style.css'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>Sprout Kingdom: Overgrown</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='13' font-size='13'>🌱</text></svg>">
<style>
${css}
</style>
</head>
<body>
<div id="game"></div>
<div id="boot-error" hidden></div>
<script>
${tone}
</script>
<script>
${bundle}
</script>
</body>
</html>
`;

writeFileSync(join(root, 'standalone.html'), html);
console.log(`standalone.html written (${(html.length / 1024 / 1024).toFixed(2)} MB) — double-click to play, no server needed`);
