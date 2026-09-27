// Épée fencing, direct elimination: first to 15 touches (or `target`), three
// periods, doubles count, a double at 14–14 is annulled, cards. Foil and sabre
// would reuse this with right-of-way prose and onDouble: 'none'.

import { firstTo } from './common.js';

export default {
  id: 'fencing',
  name: 'Épée fencing',
  theme: 'fencing',

  counters: [
    { id: 'pen', role: 'penalty', label: 'Cards', short: 'CARD', aliases: ['cards', 'card'] },
    { id: 'pts', role: 'points', label: 'Touches', short: 'TOUCH', aliases: ['touches', 'touch'] },
  ],
  primary: 'pts',
  ranks: false,
  lamps: true,

  profile: [
    ['team', 'Club'], ['art', 'Style'], ['hand', 'Hand'], ['grip', 'Grip'], ['height', 'Height'],
    ['record', 'Record'], ['time', 'Period'],
  ],

  // `target` is the bout length: 15 for direct elimination, 5 for pools.
  settings: { clockTick: 60, target: 15 },

  text: {
    position: 'Phase',
    start: 'Salute. En garde.',
    retry: 'Salute, shake hands. Again.',
    winStamp: 'Victory',
    loseStamp: 'Eliminated',
    decisionLoseStamp: 'Time',
    winBy: 'Victory by',
    tie: 'Level at time. The priority minute ends without a touch, and priority was drawn for your opponent.',
    played: 'bouts fenced',
    stamp: 'ALLEZ',
    footer: 'Salute your opponent. Check your body wire. Keep your point in line.',
    showEndings: false,
  },

  endRules: (s) => [firstTo('pts', s.target, { onDouble: 'annul' })],

  decision: [['pts', 'most']],

  /** Headline for an end rule firing, shown on the ending screen. */
  ruleText(r, win, line) {
    if (r.reason === 'target') return win ? `First to ${r.value}: ${line}.` : `Your opponent reaches ${r.value} first: ${line}.`;
    return line;
  },

  /** Shown in the scoreboard corner. */
  boardNote: (s) => (s.target ? `First to ${s.target}` : ''),

  /** Inline notice when an end rule adjusts the score without ending the bout. */
  noticeText(r) {
    if (r.reason === 'annulled') return `<b>DOUBLE ANNULLED</b> A double at ${r.value}–${r.value} doesn't count. Fence the last touch again.`;
    return '';
  },

  /** Book edition: how a bout ends, in reader instructions. */
  bookRule(s, { onward, restart }) {
    if (!s.target) return '';
    const n = s.target;
    return `<b>First to ${n}.</b> The moment either score reaches ${n}, the bout is over
      (if both reach it in the same paragraph from level, it was a double at ${n - 1}–${n - 1}, which doesn't count:
      set both to ${n - 1} and read on). If you got there, ${onward}; if your opponent did, ${restart}`;
  },
};
