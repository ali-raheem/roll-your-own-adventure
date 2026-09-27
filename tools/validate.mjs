#!/usr/bin/env node
// Validate every adventure pack listed in packs/index.json (or one pack folder
// given as an argument). Uses the same parser as the app.
//
//   node tools/validate.mjs
//   node tools/validate.mjs packs/road-to-gold

import { readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { buildPack, lintPack, parseFrontmatter, endingsOf } from '../js/parser.js';

const root = resolve(import.meta.dirname, '..');

async function loadFolder(dir) {
  const packText = await readFile(join(dir, 'pack.md'), 'utf8');
  const { meta } = parseFrontmatter(packText);
  const texts = {};
  for (const f of meta.matches || []) {
    try { texts[f] = await readFile(join(dir, f), 'utf8'); } catch { /* reported by buildPack */ }
  }
  return buildPack(basename(dir), packText, texts);
}

/** Shortest number of decisions from a match's start to any winning ending. */
function shortestWin(pack, m) {
  const dist = new Map([[m.start, 0]]);
  const queue = [m.start];
  while (queue.length) {
    const id = queue.shift();
    const s = pack.sections.get(id);
    if (!s) continue;
    if (s.ending && s.ending.type === 'win') return dist.get(id);
    for (const c of s.choices) {
      if (!dist.has(c.target)) { dist.set(c.target, dist.get(id) + 1); queue.push(c.target); }
    }
  }
  return null;
}

async function main() {
  let dirs = process.argv.slice(2).map((d) => resolve(d));
  if (!dirs.length) {
    const index = JSON.parse(await readFile(join(root, 'packs/index.json'), 'utf8'));
    dirs = index.packs.map((p) => join(root, p.path));
  }
  let failed = false;
  for (const dir of dirs) {
    const pack = await loadFolder(dir);
    const problems = lintPack(pack);
    const words = [...pack.sections.values()].reduce((n, s) => n + s.body.split(/\s+/).length, 0);
    console.log(`\n${pack.meta.title || pack.id}  (${dir})`);
    for (const m of pack.matches) {
      const ends = endingsOf(m).map((id) => pack.sections.get(id).ending.type);
      const count = (t) => ends.filter((e) => e === t).length;
      const codes = new Set(m.sections.flatMap((s) => s.effects.filter((f) => f.type === 'learn' && f.key).map((f) => f.key)));
      console.log(`  ${m.file}: ${m.sections.length} sections, ${count('win')} wins / ${count('lose')} losses / ${count('decision')} decisions, ` +
        `${codes.size} codewords, shortest win ${shortestWin(pack, m) ?? 'none (decision only)'} moves`);
    }
    console.log(`  ${pack.sections.size} sections, ~${words} words`);
    if (problems.length) {
      failed = true;
      console.log(`  ✗ ${problems.length} problem(s):`);
      for (const p of problems) console.log(`    - ${p}`);
    } else {
      console.log('  ✓ no problems');
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
