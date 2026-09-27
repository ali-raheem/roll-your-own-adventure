// Sport registry. A pack names its sport in pack.md (`sport: fencing`; BJJ if
// omitted) and may override labels and settings. resolveSport() merges the two
// into the single object the engine, app, book and validator use.
//
// Adding a sport: write js/sports/<id>.js (see docs/SPORTS.md), register it
// below, and optionally add css/sports/<theme>.css.

import bjj from './bjj.js';
import fencing from './fencing.js';
import { decideInOrder, firstTo } from './common.js';

export const SPORTS = { bjj, fencing };
export const DEFAULT_SPORT = 'bjj';

// pack.md keys that override sport text, for packs that want their own voice.
const TEXT_KEYS = {
  position_label: 'position',
  start_label: 'start',
  retry_label: 'retry',
  win_stamp: 'winStamp',
  lose_stamp: 'loseStamp',
  decision_lose_stamp: 'decisionLoseStamp',
  tie_text: 'tie',
};

// pack.md keys that relabel a counter by role; `<role>_label: none` removes it.
const COUNTER_KEYS = {
  points: ['points_label', 'points_short'],
  advantage: ['advantage_label', 'advantage_short'],
  penalty: ['penalty_label', 'penalty_short'],
};

const given = (v) => v != null && v !== '';

export function resolveSport(meta = {}) {
  const id = given(meta.sport) ? String(meta.sport).toLowerCase() : DEFAULT_SPORT;
  const base = SPORTS[id];
  const errors = base ? [] : [`pack.md: unknown sport "${meta.sport}" (known: ${Object.keys(SPORTS).join(', ')})`];
  const def = base || SPORTS[DEFAULT_SPORT];

  const counters = def.counters
    .map((c) => {
      const [labelKey, shortKey] = COUNTER_KEYS[c.role] || [];
      if (labelKey && String(meta[labelKey] || '').toLowerCase() === 'none') return null;
      return {
        ...c,
        label: labelKey && given(meta[labelKey]) ? meta[labelKey] : c.label,
        short: shortKey && given(meta[shortKey]) ? meta[shortKey] : c.short,
      };
    })
    .filter(Boolean);

  const settings = { ...def.settings };
  if (given(meta.target)) settings.target = Number(meta.target) || 0;
  if (given(meta.clock_tick)) settings.clockTick = Number(meta.clock_tick) || 0;

  const text = { ...def.text };
  for (const [key, field] of Object.entries(TEXT_KEYS)) if (given(meta[key])) text[field] = meta[key];

  const byId = new Map(counters.map((c) => [c.id, c]));
  const sport = {
    ...def,
    id: def.id,
    theme: given(meta.theme) ? meta.theme : def.theme,
    counters,
    board: counters.map((c) => c.id),
    settings,
    text,
    errors,
    counter: (cid) => byId.get(cid),
    /** Map a directive's counter name (id, role or alias) to a counter id, or null. */
    counterFor(name) {
      const n = String(name).toLowerCase();
      const c = counters.find((k) => k.id === n || k.role === n || (k.aliases || []).includes(n));
      return c ? c.id : null;
    },
    /**
     * End rules for this pack. A `target` on a sport with no end rules of its
     * own means "first to N" on the main score (how pre-sport packs worked).
     */
    rules() {
      const own = def.endRules ? def.endRules(settings) : [];
      return own.length || !settings.target ? own : [firstTo(def.primary, settings.target)];
    },
    /** Decision criteria that apply to this pack (removed counters drop out). */
    decision: (def.decision || []).filter(([cid]) => byId.has(cid)),
    decide(score) {
      return def.decide ? def.decide(score, settings) : decideInOrder(score, this.decision);
    },
    /** Reader-facing decision rule for the book edition. */
    decisionText() {
      if (def.decisionText) return def.decisionText(settings);
      const parts = this.decision.map(([cid, want], i) =>
        `${i === 0 ? '' : i === 1 ? 'if level, ' : 'if still level, '}${want} ${byId.get(cid).label.toLowerCase()}${i === 0 ? ' wins' : ''}`);
      return `${parts.join('; ')}; if still level: ${text.tie}`;
    },
    boardNote: () => (def.boardNote ? def.boardNote(settings) : ''),
    bookRule: (refs) => (def.bookRule ? def.bookRule(settings, refs) : ''),
    ruleText: (r, win, line) => (def.ruleText ? def.ruleText(r, win, line) : line),
    noticeText: (r) => (def.noticeText ? def.noticeText(r) : ''),
    /** Label used in a decision headline ("Decision on touches"). */
    decidedBy(by) {
      const c = byId.get(by);
      return c ? c.label.toLowerCase() : by;
    },
  };
  return sport;
}
