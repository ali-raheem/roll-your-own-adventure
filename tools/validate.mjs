#!/usr/bin/env node
// Validate every adventure pack listed in packs/index.json (or one pack folder
// given as an argument). Uses the same parser as the app.
//
//   node tools/validate.mjs
//   node tools/validate.mjs packs/road-to-gold

import { readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { buildPack, lintPack, parseFrontmatter, endingsOf } from '../js/parser.js';
import { enterSection, startMatch, visibleChoices } from '../js/engine.js';

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

/**
 * Sports with end rules (first to 15, a winning lead...): play every path
 * through a match with the real engine and report how many win. `known` is the
 * codeword set the player starts with; codewords learned along a path unlock
 * choices later on that same path.
 */
function simulate(pack, m, known, limit = 200000) {
  const res = { paths: 0, wins: 0, best: null, worst: null, truncated: false };
  const primary = pack.sport.primary;
  const blank = () => ({ codewords: { ...known }, notes: [], endings: {}, attempts: {}, wins: {}, current: 0, medal: false, run: null });
  const walk = (prog, depth) => {
    if (res.paths >= limit || depth > 60) { res.truncated = true; return; }
    const run = prog.run;
    if (run.ended) {
      res.paths++;
      if (run.ended.win) res.wins++;
      const margin = run.score.you[primary] - run.score.them[primary];
      const line = `${run.score.you[primary]}-${run.score.them[primary]}`;
      if (!res.best || margin > res.best.margin) res.best = { margin, line };
      if (!res.worst || margin < res.worst.margin) res.worst = { margin, line };
      return;
    }
    for (const c of visibleChoices(pack, prog)) walk(enterSection(pack, structuredClone(prog), c.target, c.label), depth + 1);
  };
  walk(startMatch(pack, blank(), m.index), 0);
  return res;
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
    if (pack.sport.rules().length) {
      const all = {};
      for (const s of pack.sections.values()) for (const f of s.effects) if (f.type === 'learn' && f.key) all[f.key] = true;
      for (const m of pack.matches) {
        const fmt = (r) => `${r.wins}/${r.paths} paths win (${Math.round((100 * r.wins) / Math.max(1, r.paths))}%), best ${r.best?.line}, worst ${r.worst?.line}${r.truncated ? ', truncated' : ''}`;
        console.log(`  ${m.file} first run: ${fmt(simulate(pack, m, {}))}`);
        console.log(`  ${m.file} all codewords: ${fmt(simulate(pack, m, all))}`);
      }
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
