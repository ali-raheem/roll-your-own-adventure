// Brazilian jiu-jitsu, IBJJF-style: points, advantages, penalties. Matches end
// by submission (an authored @win/@lose) or on the scoresheet at time.

export default {
  id: 'bjj',
  name: 'Brazilian jiu-jitsu',
  theme: 'bjj',

  // Counters, in scoreboard order left to right. `role` is what the @points,
  // @advantage and @penalty shorthands refer to.
  counters: [
    { id: 'pen', role: 'penalty', label: 'Penalties', short: 'PEN', aliases: ['penalties'] },
    { id: 'adv', role: 'advantage', label: 'Advantages', short: 'ADV', aliases: ['advantages'] },
    { id: 'pts', role: 'points', label: 'Points', short: 'PTS', aliases: ['points'] },
  ],
  primary: 'pts',
  ranks: true,

  // Opponent card fields: [front-matter key, label].
  profile: [
    ['team', 'Team'], ['art', 'Background'], ['height', 'Height'], ['weight', 'Weight'],
    ['record', 'Record'], ['time', 'Match time'],
  ],

  settings: { clockTick: 20 },

  text: {
    position: 'Position',
    start: 'Bow in. Oss.',
    retry: 'Shake hands. Run it back.',
    winStamp: 'Hand raised',
    loseStamp: 'Tap',
    decisionLoseStamp: 'Decision lost',
    winBy: 'Victory by',
    tie: 'Dead even on the scoresheet. The referee’s decision goes to your opponent.',
    played: 'matches wrestled',
    stamp: 'OSS',
    footer: 'Train safe. Tap early. Tap often.',
    showEndings: true,
  },

  endRules: () => [],

  // Decision at time: criteria in order, then text.tie. A sport can instead
  // define decide(score, settings) for rules that aren't a simple tally.
  decision: [['pts', 'most'], ['adv', 'most'], ['pen', 'fewest']],
};
