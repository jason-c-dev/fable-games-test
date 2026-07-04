#!/usr/bin/env node
// Records webm clips for the README GIFs: the title screen (live world
// behind the logo) and a run6 gameplay stretch (parry shatters + a
// near-Tide surge). Convert with ffmpeg per PLAN.md.
// Usage: node tools/record.js <title|play> <outDir> [seconds]

import { createRequire } from 'module';
import { execSync } from 'child_process';
import { readdirSync, renameSync } from 'fs';
import { join } from 'path';
const require = createRequire(execSync('npm root -g').toString().trim() + '/');
const { chromium } = require('playwright');

const kind = process.argv[2] || 'title';
const outDir = process.argv[3] || '/tmp/sr-rec';
const seconds = Number(process.argv[4] || (kind === 'title' ? 8 : 30));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await browser.newContext({
  viewport: { width: 960, height: 540 },
  recordVideo: { dir: outDir, size: { width: 960, height: 540 } },
});
const page = await ctx.newPage();

if (kind === 'title') {
  await page.goto('http://localhost:8378/seedrunner/index.html');
} else {
  await page.goto('http://localhost:8378/seedrunner/index.html?run=run6&bot=1&seed=3');
}
await page.waitForTimeout(seconds * 1000);
await ctx.close();
await browser.close();

const webm = readdirSync(outDir).find((f) => f.endsWith('.webm'));
renameSync(join(outDir, webm), join(outDir, `${kind}.webm`));
console.log(join(outDir, `${kind}.webm`));
