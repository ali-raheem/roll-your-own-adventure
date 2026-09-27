# Sports

The engine knows nothing about any particular sport. Everything sport-specific lives in a **sport
module** in `js/sports/`, and a pack names its sport in `pack.md`:

```yaml
sport: fencing        # bjj if omitted
```

| Sport | Module | Theme | Ends by | Decision at time |
|---|---|---|---|---|
| BJJ (IBJJF-style) | `bjj.js` | `css/sports/bjj.css` | authored submission (`@win`/`@lose`) | points, advantages, fewest penalties |
| Épée | `fencing.js` | `css/sports/fencing.css` | first to 15 touches (end rule) | touches, then priority (tie text) |

## Anatomy of a sport module

```js
import { firstTo } from './common.js';

export default {
  id: 'fencing',                // what packs write in `sport:`
  name: 'Épée fencing',         // used in validator messages
  theme: 'fencing',             // body[data-theme] and css/sports/<theme>.css

  // Score counters, in scoreboard order left to right. Ids are short and stable
  // (saved games store them). `role` is what the @points / @advantage / @penalty
  // shorthands target; aliases are extra names for @score.
  counters: [
    { id: 'pen', role: 'penalty', label: 'Cards', short: 'CARD', aliases: ['card', 'cards'] },
    { id: 'pts', role: 'points', label: 'Touches', short: 'TOUCH', aliases: ['touch', 'touches'] },
  ],
  primary: 'pts',               // the big scoreboard column, and the lamp trigger
  ranks: false,                 // show belts (player_belt / belt) if the pack gives them
  lamps: true,                  // optional: scoring lamps on the scoreboard

  profile: [['team', 'Club'], ['hand', 'Hand'], /* ... */],  // opponent card fields

  settings: { clockTick: 60, target: 15 },   // defaults; packs override (target, clock_tick)

  text: {                       // every sport-flavoured string in the UI
    position, start, retry, winStamp, loseStamp, decisionLoseStamp, winBy,
    tie, played, stamp, footer, showEndings,
  },

  endRules: (settings) => [firstTo('pts', settings.target, { onDouble: 'annul' })],
  decision: [['pts', 'most']],  // or decide(score, settings) for anything else

  // Optional presentation hooks:
  ruleText(rule, win, scoreLine) {},  // ending headline when an end rule fires
  noticeText(rule) {},                // inline notice when a rule adjusts but doesn't end
  boardNote(settings) {},             // scoreboard corner, e.g. "First to 15"
  bookRule(settings, { onward, restart }) {},  // how bouts end, for the printed book
  decisionText(settings) {},          // book wording, if `decision` isn't enough
};
```

Then register it in `js/sports/index.js` and, if it has a look of its own, add
`css/sports/<theme>.css` with every rule scoped to `body[data-theme="<theme>"]`. The app loads that
file when a pack of that sport opens (and prefetches it for offline use). Add the new files to the
`SHELL` list in `sw.js` and bump `CACHE`.

### How a section is scored

1. The section's effects apply in order: `@score`/`@points`/`@advantage`/`@penalty` change counters,
   `@learn` adds scouting notes.
2. The sport's **end rules** run on the new score. The first one that returns a winner ends the bout
   immediately, whatever the section says. A rule can also adjust the score without ending anything
   (épée's annulled double) and show a notice.
3. Otherwise, a `@win`/`@lose` ending ends the bout, and a `@decision` ending asks the sport's
   `decision` criteria (or `decide()`); a complete tie shows `text.tie` and goes to the opponent.

### Building blocks (`js/sports/common.js`)

| Helper | Use |
|---|---|
| `firstTo(counter, n, { onDouble })` | First to N wins: fencing (15/5), kendo (2 points), table-tennis style formats. `onDouble: 'annul'` (épée) or `'none'` |
| `leadBy(counter, n)` | Win on a lead of N: wrestling technical superiority, karate's 8-point gap, taekwondo's point gap |
| `limitLoses(counter, n)` | Reaching N loses: judo's third shido (hansoku-make), accumulated fouls |
| `decideInOrder(score, criteria)` | Tally decisions: `[['pts','most'], ['adv','most'], ['pen','fewest']]` |

End rules are tested in `tools/test.mjs`, including the ones no bundled sport uses yet.

## Sketches for other sports

These aren't implemented; they show how the pieces fit.

**Judo.** Counters `waza` (waza-ari) and `shido`. `endRules: () => [firstTo('waza', 2, { onDouble: 'none' }), limitLoses('shido', 3)]`.
An ippon is an authored `@win ippon: uchi mata`. `decision: [['waza', 'most']]`: under IJF rules
shidos don't decide a bout at the end of regular time, so a tie goes to golden score, which the pack
writes as sections (sudden death: the next score ends it, so any `@score` there can be followed by
`@win`/`@lose`). `ranks: true`.

**Freestyle wrestling.** Counters `pts` and `caution`. `endRules: () => [leadBy('pts', 10)]` for
technical superiority; a fall is an authored `@win fall`. Ties go by criteria (highest-value move, then
fewest cautions, then the last point scored), which needs a small `decide()` plus counters the pack
updates for the biggest move and who scored last.

**Boxing / MMA.** Rounds are judged, so the useful counters are per-side round tallies (`rounds`, and
`knockdowns`), with `@score you rounds 1` at the end of each round's sections. KO/TKO/submission are
authored `@win`/`@lose` endings. `decide()` can model three judges (for example, each round's winner
per judge) if the pack tracks it; a simple version is `decision: [['rounds', 'most']]`. No end rules.

**Kendo.** `firstTo('ippon', 2, { onDouble: 'none' })` for sanbon shobu, and `limitLoses('hansoku', 2)`
(two hansoku give the opponent an ippon, so that one is better written as a pack-side `@score`).

**Foil and sabre.** The fencing module with right-of-way prose; there are no doubles (the referee
awards priority), so `onDouble: 'none'` and authors never score both sides in one exchange.

## Packs that override a sport

Any pack can relabel counters and text without writing a module (see WRITING_PACKS.md):
`points_label`, `advantage_label: none` (removes that counter), `start_label`, `tie_text`, `target`,
`clock_tick`, `theme`... A `target` on a sport with no end rules of its own means "first to N on the
main score".
