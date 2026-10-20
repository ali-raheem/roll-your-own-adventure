#!/usr/bin/env node
// Engine and sport tests. Run: node --test tools/test.mjs  (or npm test)
//
// Replays fixed paths through the real packs and checks outcomes, and unit
// tests the sport building blocks so new sports start from known-good parts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildPack, packFiles, parseFrontmatter, lintPack, findTechnique, parseTechniques } from '../js/parser.js';
import { enterSection, startMatch, visibleChoices, endingHeadline } from '../js/engine.js';
import { resolveSport } from '../js/sports/index.js';
import { firstTo, leadBy, limitLoses, emptyScore, scoreLine } from '../js/sports/common.js';

const root = resolve(import.meta.dirname, '..');

async function load(id) {
  const dir = join(root, 'packs', id);
  const packText = await readFile(join(dir, 'pack.md'), 'utf8');
  const texts = {};
  for (const f of packFiles(parseFrontmatter(packText).meta)) texts[f] = await readFile(join(dir, f), 'utf8');
  return buildPack(id, packText, texts);
}

const blank = (codewords = {}) => ({ codewords, notes: [], endings: {}, attempts: {}, wins: {}, current: 0, medal: false, run: null });

/** Play `path` (section ids) from the start of match `i`; every step must be a visible choice. */
function play(pack, i, path, prog = blank()) {
  startMatch(pack, prog, i);
  for (const target of path) {
    if (prog.run.ended) break;
    const c = visibleChoices(pack, prog).find((x) => x.target === target);
    assert.ok(c, `"${target}" is not a visible choice at "${prog.run.section}"`);
    enterSection(pack, prog, c.target, c.label);
  }
  return prog;
}

test('packs load with no authoring problems', async () => {
  for (const id of ['road-to-gold', 'point-in-line']) assert.deepEqual(lintPack(await load(id)), [], id);
});

test('bjj: bow and arrow wins match 1', async () => {
  const pack = await load('road-to-gold');
  const { run } = play(pack, 0, ['j-pull', 'j-closedguard', 'j-cg-break', 'j-stands', 'j-tripod', 'j-turtle-top', 'j-hooks', 'j-back', 'j-bowarrow']);
  assert.equal(run.ended.win, true);
  assert.equal(run.ended.type, 'win');
  assert.equal(endingHeadline(pack, run), 'submission: bow and arrow choke');
  assert.equal(scoreLine(run.score, pack.sport), '6–0');
});

test('bjj: a loss teaches a codeword that unlocks a choice next time', async () => {
  const pack = await load('road-to-gold');
  const prog = play(pack, 1, ['p-letpull', 'p-deepcollar', 'p-collarchoke']);
  assert.equal(prog.run.ended.win, false);
  assert.equal(endingHeadline(pack, prog.run), 'Submission: cross collar choke');
  assert.ok('COLLAR' in prog.codewords);
  startMatch(pack, prog, 1);
  assert.ok(visibleChoices(pack, prog).some((c) => c.target === 'p-wristcontrol'));
});

test('bjj: decision on points, clock runs to 0:00', async () => {
  const pack = await load('road-to-gold');
  const { run } = play(pack, 1, ['p-single', 'p-closedguard', 'p-posture', 'p-standbreak', 'p-spider', 'p-gripbreak', 'p-toreando', 'p-side', 'p-heavy', 'p-decision']);
  assert.equal(run.ended.type, 'decision');
  assert.equal(run.ended.win, true);
  assert.equal(endingHeadline(pack, run), 'Decision on points: 5–0.');
  assert.equal(run.clock, '0:00');
});

test('fencing: first to 15 ends the bout mid-section', async () => {
  const pack = await load('point-in-line');
  const lose = play(pack, 0, ['h-p1a', 'h-lunge', 'h-p1b', 'h-fleche', 'h-break', 'h-p2', 'h-retreat', 'h-p3', 'h-allout']).run;
  assert.equal(lose.ended.type, 'rule');
  assert.equal(endingHeadline(pack, lose), 'Your opponent reaches 15 first: 3–15.');
  const win = play(pack, 0, ['h-p1a', 'h-beat', 'h-p1b', 'h-bind', 'h-break', 'h-p2', 'h-prep', 'h-p3', 'h-prep2', 'h-last', 'h-lastdoubles']).run;
  assert.equal(endingHeadline(pack, win), 'First to 15: 15–7.');
});

test('fencing: period resets and a decision on touches', async () => {
  const pack = await load('point-in-line');
  const prog = play(pack, 0, ['h-p1a', 'h-beat', 'h-p1b', 'h-bind', 'h-break', 'h-p2']);
  assert.equal(prog.run.clock, '3:00');
  const { run } = play(pack, 2, ['f-p1a', 'f-bait', 'f-p1b', 'f-third', 'f-break', 'f-p2', 'f-third2', 'f-p3', 'f-third3', 'f-last', 'f-lastdoubles', 'f-time']);
  assert.equal(endingHeadline(pack, run), 'Decision on touches: 13–10.');
  assert.equal(run.ended.win, true);
});

test('fencing: cards do not break a tie on touches', () => {
  const sport = resolveSport({ sport: 'fencing' });
  const score = emptyScore(sport);
  score.you.pts = 9; score.them.pts = 9; score.them.pen = 2;
  assert.deepEqual(sport.decide(score), { win: false, by: 'tie' });
});

test('firstTo: annuls a double from level, otherwise the leader gets there first', () => {
  const sport = resolveSport({ sport: 'fencing' });
  const rule = firstTo('pts', 15);
  const at = (y, t, by, bt) => {
    const score = emptyScore(sport); const before = emptyScore(sport);
    score.you.pts = y; score.them.pts = t; before.you.pts = by; before.them.pts = bt;
    return { r: rule({ score, before }), score };
  };
  let { r, score } = at(15, 15, 14, 14);
  assert.equal(r.reason, 'annulled'); assert.equal(score.you.pts, 14); assert.equal(score.them.pts, 14);
  ({ r, score } = at(16, 15, 14, 13));
  assert.equal(r.winner, 'you'); assert.equal(score.you.pts, 15); assert.equal(score.them.pts, 14);
  ({ r } = at(12, 11, 10, 10));
  assert.equal(r, null);
});

test('leadBy and limitLoses (wrestling technical superiority, judo hansoku-make)', () => {
  const s = { you: { pts: 12, sh: 0 }, them: { pts: 2, sh: 3 } };
  assert.deepEqual(leadBy('pts', 10)({ score: s }), { winner: 'you', reason: 'lead', value: 10 });
  assert.equal(leadBy('pts', 11)({ score: s }), null);
  assert.deepEqual(limitLoses('sh', 3)({ score: s }), { winner: 'you', reason: 'limit', value: 3 });
});

test('resolveSport: pack overrides, removed counters, legacy target, unknown sport', () => {
  const bjj = resolveSport({ advantage_label: 'none', points_label: 'Score', tie_text: 'Coin toss.' });
  assert.deepEqual(bjj.board, ['pen', 'pts']);
  assert.equal(bjj.counter('pts').label, 'Score');
  assert.equal(bjj.decisionText(), 'most score wins; if level, fewest penalties; if still level: Coin toss.');
  assert.equal(bjj.counterFor('advantage'), null);
  // Pre-sport packs set target on the default sport: still first to N.
  assert.equal(resolveSport({ target: 5 }).rules().length, 1);
  assert.equal(resolveSport({}).rules().length, 0);
  assert.match(resolveSport({ sport: 'curling' }).errors[0], /unknown sport "curling"/);
});

test('parser: @score resolves counters by id, role or alias; unknown counters are errors', () => {
  const pack = buildPack('t', '---\nsport: fencing\nmatches:\n  - m.md\n---\n', {
    'm.md': '## A {#a}\n@score you touch 2\n@score them cards 1\n@advantage you\n@win done\n',
  });
  const fx = pack.sections.get('a').effects;
  assert.deepEqual(fx.map((f) => f.counter), ['pts', 'pen', null]);
  assert.ok(pack.errors.some((e) => /no "advantage" counter/.test(e)));
});

test('techniques: lookups by id, title or alias; refs are checked; choice labels drop the link', () => {
  const lib = '## Seoi nage {#seoi-nage}\n@also shoulder throw\nOver the back.\n- [Page](https://example.com/seoi)\n- [Video](https://youtu.be/x)\n' +
    '## Kesa {#kesa}\n@also Shoulder Throw\nNo links here.\n';
  const pack = buildPack('t', '---\nmatches:\n  - m.md\ntechniques: t.md\n---\nSee [[seoi nage]].\n', {
    't.md': lib,
    'm.md': '## A {#a}\nA [[Shoulder throw|big throw]] and a [[harai goshi]].\n- [Try [[seoi-nage]]](#b)\n## B {#b}\n@win done\n',
  });
  assert.equal(findTechnique(pack, 'Seoi Nage').links[1].url, 'https://youtu.be/x');
  assert.equal(findTechnique(pack, 'shoulder-throw').id, 'seoi-nage');
  assert.equal(findTechnique(pack, 'harai goshi'), null);
  assert.equal(pack.sections.get('a').choices[0].label, 'Try seoi-nage');
  assert.ok(pack.errors.some((e) => /m\.md:2: technique "harai goshi" is not in the technique library/.test(e)));
  assert.ok(pack.errors.some((e) => /"kesa" has no links/.test(e)));
  assert.ok(pack.errors.some((e) => /"Shoulder Throw" already names technique "seoi-nage"/.test(e)));
  assert.equal(parseTechniques('Intro.\n## X {#x}\n@clock 1:00\n- [L](https://e.com)\n').errors.length, 1);
});

test('techniques: a ref without a technique file is an error', () => {
  const pack = buildPack('t', '---\nmatches:\n  - m.md\n---\n', { 'm.md': '## A {#a}\n[[armbar]]\n@win done\n' });
  assert.ok(pack.errors.some((e) => /no "techniques:" file/.test(e)));
});
