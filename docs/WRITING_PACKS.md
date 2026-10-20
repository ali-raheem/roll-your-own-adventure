# Writing adventure packs

A pack is a folder of markdown files. Nothing gets compiled: the app reads the markdown directly, and
the same files print as a numbered gamebook.

```
packs/
  index.json               list of bundled packs
  my-pack/
    pack.md                pack front matter + intro text
    01-first-opponent.md   one file per match, in bracket order
    02-second-opponent.md
    techniques.md          optional technique library (videos and study links)
```

To bundle a pack, add it to `packs/index.json`:

```json
{ "packs": [ { "id": "my-pack", "path": "packs/my-pack/", "title": "My Pack" } ] }
```

You can also try a pack without touching the site: on the home screen, use **Import pack files** and
select `pack.md` together with its match files (and its technique file, if it has one). Imported packs are stored only in that browser.

Run the validator after every edit:

```bash
node tools/validate.mjs                  # every pack in index.json
node tools/validate.mjs packs/my-pack    # one folder
```

It reports broken links, dead ends, unreachable sections, matches with no way to win, codewords
that are required but never taught, and technique links the library doesn't know.

## pack.md

```markdown
---
title: Road to Gold
subtitle: Three opponents. Three styles. One medal.
author: Your Name
event: Harbour Open · Adult Absolute · Gi
player: You
player_belt: blue          # white | blue | purple | brown | black
player_stripes: 2
gold: Text shown on the podium screen after winning the final.
matches:
  - 01-the-judoka.md
  - 02-the-python.md
techniques: techniques.md  # optional, see "Technique links"
---

Intro markdown: the event, the ruleset, anything the reader needs before match one.
```

### Sport

`sport:` picks the rules, scoreboard, labels and look: `bjj` (the default) or `fencing`. Each sport
module (see [SPORTS.md](SPORTS.md)) defines its score counters, how bouts end, how decisions work,
the opponent card fields and all the flavour text.

| Sport | Counters (id: names you can use in `@score`) | Ends by | Opponent card fields |
|---|---|---|---|
| `bjj` | `pts`: points · `adv`: advantage(s) · `pen`: penalty/penalties | `@win`/`@lose`, or `@decision` | team, art, height, weight, record, time |
| `fencing` | `pts`: touch(es), points · `pen`: card(s), penalty | first to `target` (15), or `@decision` | team, art, hand, grip, height, record, time |

### Overriding the sport (optional)

A pack can adjust its sport without writing a module:

| Key | Effect |
|---|---|
| `target` | Bout length for first-to-N sports (fencing pools: `5`). On a sport with no end rules, `target` adds "first to N on the main score" |
| `clock_tick` | Seconds the clock runs down per decision (`0` to disable) |
| `points_label` / `points_short` | Relabel the main score |
| `advantage_label` / `advantage_short` | Relabel advantages; `advantage_label: none` removes the counter |
| `penalty_label` / `penalty_short` | Relabel penalties |
| `position_label`, `start_label`, `retry_label` | Label above the story, and the start and retry buttons |
| `win_stamp`, `lose_stamp`, `decision_lose_stamp` | Ending stamps |
| `tie_text` | Shown when a decision is dead level |
| `theme` | Use a different sport's look |

`player_belt` and each opponent's `belt` are optional; leave them out for sports without belts.

## Match files

```markdown
---
round: Quarterfinal        # optional; defaults to Quarterfinal/Semifinal/Final by position
opponent: Darek Nowak
nickname: The Freight Train
belt: blue
stripes: 1
team: Kolejarz Judo / Northside BJJ
art: Judo 2nd dan
height: 183 cm
weight: 88 kg
record: Former junior national judo medallist
time: 6:00                 # starting clock
start: j-start             # optional; defaults to the first section
blurb: One line shown on the opponent card.
---

Pre-match text shown on the opponent screen (scouting from the stands, the coach's advice).

## Bow In {#j-start}
@clock 6:00
@position Standing · neutral

Story text in markdown.

- [Meet him in the grip fight](#j-gripfight)
- [Pull guard with grips](#j-pull)
```

### Sections

Every section starts with `## Title {#id}`. IDs must be unique across the **whole pack**, so prefix
them per match (`j-`, `p-`, `l-`...). Choices can only link to sections in the same match.

### Choices

A list item that is *only* a link to a section becomes a choice button:

```markdown
- [Label shown to the player](#target-id)
- [Only visible once the player has learned DROP-SEOI](#j-seoi-stuff) {if DROP-SEOI}
- [Only visible if they have NOT learned it](#j-naive) {if !DROP-SEOI}
```

Every section needs at least one choice with no codeword condition, so a first-time player is never
stuck. The validator checks this.

### Directives

Lines starting with `@` inside a section:

| Directive | Effect |
|---|---|
| `@score you pts 2 Takedown` | Add to any of the sport's counters (by id or name), with an optional reason |
| `@points you 2 Takedown` | Shorthand for the sport's main score |
| `@advantage them Near sweep` | Shorthand: one advantage (if the sport has them) |
| `@penalty you Stalling` | Shorthand: one penalty (BJJ penalty, fencing card) |
| `@clock 4:30` | Set the match clock (it never runs backwards) |
| `@clock 3:00 reset` | Start a new period: set the clock even if that's later than the current time |
| `@position Kesa gatame · bottom` | Position label above the story |
| `@learn Note text` | Add a note to the scouting report |
| `@learn CODEWORD \| Note text` | Add a note and a **codeword** that can unlock choices |
| `@win submission: armbar` | Winning ending (shown as "Victory by ...") |
| `@lose Submission: triangle` | Losing ending |
| `@decision` | Match ends; the scoresheet decides |

Effects fire when the player *enters* the section. The clock also ticks down on its own (`clock_tick`
seconds per decision, default 20, stopping at 0:10); authored `@clock` values take over whenever you set them.

In a first-to-N sport (fencing), a bout usually ends mid-way through a section when a score reaches N,
so don't state exact scores in the prose, and do end the final period with a `@decision` section. The
validator plays every path with the real scoring rules and reports the win rate for a first-time player
and for one who knows every codeword. Aim for a clearly lower first-run rate, with the final bout the hardest.

Decisions use: points, then advantages, then fewer penalties; a complete tie goes to the opponent.

### Callouts

```markdown
:::coach
Why this happened, in real jiu-jitsu terms.
:::

:::rule
A rules note (IBJJF or your event's house rules).
:::
```

Kinds: `coach`, `rule`, `note`, `danger`, `scout`. Add a custom title after the kind:
`:::coach Coach Teo says`.

Other supported markdown: paragraphs, `**bold**`, `*italic*`, `` `code` ``, `###` headings, lists,
`>` quotes and `---`. Raw HTML is escaped, never rendered.

### Technique links

Write `[[seoi nage]]` anywhere in a pack's prose (section text, callouts, intros, blurbs, `@learn`
notes) and the player can tap it to see that technique's description and links: a study page, a
video, an escapes page. Use `[[seoi nage|his favourite throw]]` to show different words. The printed
book underlines them and prints every link in a **Technique library** appendix, and the pack's
bracket screen gets a Technique library page.

The links live in one file per pack, named by `techniques:` in `pack.md`:

```markdown
Optional intro, shown at the top of the library page. Good for general links.

## Seoi nage {#seoi-nage}
@also shoulder throw, drop seoi

The shoulder throw. One or two sentences of markdown.

- [Technique page](https://judo.acmiyaguchi.me/waza/seoi-nage)
- [Kodokan video](https://youtu.be/zIq0xI0ogxk)
```

- A link matches an entry by its id, its title or any `@also` name. Case, accents and punctuation are
  ignored, so `[[Seoi-Nage]]` and `[[seoi nage]]` are the same. Add plurals you write in the prose
  (`armbars`) as `@also` names.
- Every entry needs at least one `- [Label](https://...)` link; the first is shown as the main one.
- For judo techniques (and the many jiu-jitsu techniques that are judo under another name), prefer the
  page on [judo.acmiyaguchi.me](https://judo.acmiyaguchi.me/waza) and its matching video from the
  [Kodokan waza series](https://www.youtube.com/watch?v=_GxcFx8LZRk&list=PLtz539PTepc16H2iu5F3Q3D7_He1EYlIQ).
  For jiu-jitsu-only techniques, use [Bernardo Faria's channel](https://www.youtube.com/@BernardoFariaBJJ);
  for fencing, Coach Tyler's [Fencer's Edge](https://www.youtube.com/@FencersEdge).
- Link a technique the first time it comes up in a section, not every time.
- Choice labels are buttons, so a link there shows as plain text. `@position`, `@win` and `@lose`
  text can't hold links; the validator says so.

## Designing a good match

- **Narrow roads to gold.** Two to four realistic winning lines per match, plus decision wins. Most
  choices should fail, and *say why*.
- **Losses teach.** Every losing ending should `@learn` something. The best notes are codewords that
  open a better option next time (`{if CODEWORD}`), the way a real scouting report changes your game plan.
- **Hubs keep it manageable.** Funnel branches into shared positions (`j-kesa`, `j-turtle-top`), and let
  the scoreboard carry the difference between paths.
- **Points matter.** Use `@decision` endings so that being ahead on points is a real strategy, and
  include moments where protecting the lead is the smart choice.
- **Be accurate.** If a choice would work in real life against this person, it should work here. If it
  wouldn't, the coach callout is where you explain the mechanics.

## Printing

Open a pack's **Book edition** and print it (or save as PDF). Sections get stable shuffled paragraph
numbers, each match's start comes first in its block, scores become scoresheet instructions, and
codeword choices read "If you have the codeword X, turn to N".
