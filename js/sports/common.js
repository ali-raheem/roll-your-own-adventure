// Building blocks for sport modules. A sport composes these instead of
// writing scoring logic from scratch; see docs/SPORTS.md.
//
// Scores are { you: { <counterId>: n }, them: { ... } }. Counter ids are short
// and stable (BJJ uses pts/adv/pen) because saved runs store them.

export const SIDES = ['you', 'them'];
export const other = (who) => (who === 'you' ? 'them' : 'you');

export function emptyScore(sport) {
  const side = () => Object.fromEntries(sport.counters.map((c) => [c.id, 0]));
  return { you: side(), them: side() };
}

/** Apply one { type: 'score', who, counter, value } effect. Counters never go below zero. */
export function applyScore(score, fx) {
  const side = score[fx.who];
  side[fx.counter] = Math.max(0, (side[fx.counter] || 0) + fx.value);
}

/**
 * "15–7 (card 1–0)": primary counter first, then any other non-zero counters,
 * reading the scoreboard from the primary (rightmost) column leftwards.
 */
export function scoreLine(score, sport) {
  const p = sport.primary;
  const extras = sport.board.slice().reverse()
    .filter((id) => id !== p && (score.you[id] || score.them[id]))
    .map((id) => ` (${sport.counter(id).short.toLowerCase()} ${score.you[id] || 0}–${score.them[id] || 0})`);
  return `${score.you[p] || 0}–${score.them[p] || 0}${extras.join('')}`;
}

/**
 * Decision by an ordered list of criteria, e.g. BJJ:
 *   [['pts', 'most'], ['adv', 'most'], ['pen', 'fewest']]
 * Returns { win, by } where `by` is the deciding counter id, or 'tie'.
 */
export function decideInOrder(score, criteria) {
  for (const [id, want] of criteria) {
    const y = score.you[id] || 0;
    const t = score.them[id] || 0;
    if (y !== t) return { win: want === 'most' ? y > t : y < t, by: id };
  }
  return { win: false, by: 'tie' };
}

// ---- end rules --------------------------------------------------------------
// Each returns a function (ctx) => null | { winner, reason, adjust? }.
// ctx = { score, before, settings }. `before` is the score before this section.

/**
 * First to N on a counter (fencing touches, kendo points). If both sides reach N
 * in the same section, the side that was ahead got there first; from level it
 * was a simultaneous hit, which `onDouble` decides: 'annul' (épée at 14–14: both
 * stay at N-1 and fence on) or 'none' (nobody wins yet).
 */
export function firstTo(counter, target, { onDouble = 'annul' } = {}) {
  return ({ score, before }) => {
    const n = typeof target === 'function' ? target() : target;
    if (!n) return null;
    const y = score.you[counter] || 0;
    const t = score.them[counter] || 0;
    if (y >= n && t >= n) {
      if (before.you[counter] === before.them[counter]) {
        if (onDouble === 'annul') {
          score.you[counter] = n - 1;
          score.them[counter] = n - 1;
          return { winner: null, reason: 'annulled', value: n - 1 };
        }
        return null;
      }
      const first = before.you[counter] > before.them[counter] ? 'you' : 'them';
      score[first][counter] = n;
      score[other(first)][counter] = n - 1;
      return { winner: first, reason: 'target', value: n };
    }
    if (y >= n) { score.you[counter] = n; return { winner: 'you', reason: 'target', value: n }; }
    if (t >= n) { score.them[counter] = n; return { winner: 'them', reason: 'target', value: n }; }
    return null;
  };
}

/** Win on a lead of N or more (wrestling technical superiority, karate's 8-point gap). */
export function leadBy(counter, margin) {
  return ({ score }) => {
    const n = typeof margin === 'function' ? margin() : margin;
    if (!n) return null;
    const d = (score.you[counter] || 0) - (score.them[counter] || 0);
    if (d >= n) return { winner: 'you', reason: 'lead', value: n };
    if (-d >= n) return { winner: 'them', reason: 'lead', value: n };
    return null;
  };
}

/** Reaching N on a counter loses (judo: third shido is hansoku-make). */
export function limitLoses(counter, limit) {
  return ({ score }) => {
    const n = typeof limit === 'function' ? limit() : limit;
    if (!n) return null;
    if ((score.you[counter] || 0) >= n) return { winner: 'them', reason: 'limit', value: n };
    if ((score.them[counter] || 0) >= n) return { winner: 'you', reason: 'limit', value: n };
    return null;
  };
}

/** Run end rules in order; the first one that fires wins. */
export function firstRule(rules, ctx) {
  for (const rule of rules) {
    const r = rule(ctx);
    if (r) return r;
  }
  return null;
}
