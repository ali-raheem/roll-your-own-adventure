// Match engine: pure state transitions on a progress object, no DOM and no
// storage. The app saves progress after each call; the validator and the
// tests (tools/test.mjs) drive the same functions directly.
//
// progress.run = {
//   match, section, score, clock, log[], learned[], fresh[], ended
// }
// ended = { type: 'win'|'lose'|'decision'|'rule', win, by?, how }

import { choiceVisible } from './parser.js';
import { applyScore, emptyScore, firstRule, scoreLine } from './sports/common.js';

export function toSecs(c) {
  const m = /^(\d+):(\d{2})$/.exec(c || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function fmtClock(n) {
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/**
 * Each decision costs match time. An authored @clock wins but never runs the
 * clock backwards, unless it is a period reset. Auto-ticking stops at 0:10 so
 * that only an authored ending says "time".
 */
export function nextClock(current, authored, moved, tick, reset) {
  const cur = toSecs(current);
  const set = toSecs(authored);
  if (set != null && (reset || cur == null)) return authored;
  if (cur == null) return authored || current;
  if (set != null) return fmtClock(Math.min(cur, set));
  return moved && tick ? fmtClock(Math.max(Math.min(cur, 10), cur - tick)) : current;
}

export function startMatch(pack, prog, i) {
  prog.attempts[i] = (prog.attempts[i] || 0) + 1;
  prog.run = {
    match: i,
    section: null,
    score: emptyScore(pack.sport),
    clock: pack.matches[i].meta.time || null,
    log: [],
    learned: [],
    fresh: [],
    ended: null,
  };
  enterSection(pack, prog, pack.matches[i].start, null);
  return prog;
}

export function visibleChoices(pack, prog) {
  const run = prog.run;
  if (!run || run.ended) return [];
  return pack.sections.get(run.section).choices.filter((c) => choiceVisible(c, prog.codewords));
}

function finish(pack, prog, id, ended) {
  const run = prog.run;
  prog.endings[id] = true;
  run.ended = ended;
  if (ended.win) {
    prog.wins[run.match] = true;
    if (run.match === pack.matches.length - 1) prog.medal = true;
    prog.current = Math.max(prog.current, run.match + 1);
  }
}

/** Move the run into section `id` (the player picked `choiceLabel`, or null at the start). */
export function enterSection(pack, prog, id, choiceLabel) {
  const sport = pack.sport;
  const run = prog.run;
  const s = pack.sections.get(id);
  if (!s) throw new Error(`Section "${id}" does not exist in this pack.`);
  if (choiceLabel) run.log.push({ at: pack.sections.get(run.section).title, choice: choiceLabel });
  run.section = id;
  run.fresh = [];
  run.clock = nextClock(run.clock, s.clock, !!choiceLabel, sport.settings.clockTick, s.clockReset);
  const before = structuredClone(run.score);

  for (const fx of s.effects) {
    if (fx.type === 'learn') {
      const isNew = fx.key ? !(fx.key in prog.codewords) : !prog.notes.some((n) => n.text === fx.text);
      if (isNew) {
        if (fx.key) prog.codewords[fx.key] = fx.text;
        prog.notes.push({ match: run.match, key: fx.key, text: fx.text });
      }
      if (!run.learned.some((l) => l.text === fx.text)) run.learned.push({ key: fx.key, text: fx.text, isNew });
      run.fresh.push({ ...fx, isNew });
    } else if (fx.type === 'score' && fx.counter) {
      applyScore(run.score, fx);
      run.fresh.push(fx);
    }
  }

  // Sport end rules (first to 15, a winning lead, a penalty limit...) outrank
  // whatever the section says: the bout is over the moment one fires.
  const r = firstRule(sport.rules(), { score: run.score, before, settings: sport.settings });
  if (r && r.winner) {
    const win = r.winner === 'you';
    finish(pack, prog, id, { type: 'rule', win, by: r.reason, how: sport.ruleText(r, win, scoreLine(run.score, sport)) });
  } else {
    if (r) {
      const html = sport.noticeText(r);
      if (html) run.fresh.push({ type: 'notice', html });
    }
    if (s.ending) {
      if (s.ending.type === 'decision') {
        const { win, by } = sport.decide(run.score);
        const how = by === 'tie' ? sport.text.tie : `Decision on ${sport.decidedBy(by)}: ${scoreLine(run.score, sport)}.`;
        finish(pack, prog, id, { type: 'decision', win, by, how });
      } else {
        finish(pack, prog, id, { type: s.ending.type, win: s.ending.type === 'win', how: s.ending.text });
      }
    }
  }
  return prog;
}

/** Headline for an ended run; tolerates runs saved by older versions. */
export function endingHeadline(pack, run) {
  const e = run.ended;
  if (e.how != null) return e.how;
  if (e.text) return e.text;
  return scoreLine(run.score, pack.sport);
}
