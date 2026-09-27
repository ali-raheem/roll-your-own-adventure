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
```

To bundle a pack, add it to `packs/index.json`:

```json
{ "packs": [ { "id": "my-pack", "path": "packs/my-pack/", "title": "My Pack" } ] }
```

You can also try a pack without touching the site: on the home screen, use **Import pack files** and
select `pack.md` together with its match files. Imported packs are stored only in that browser.

Run the validator after every edit:

```bash
node tools/validate.mjs                  # every pack in index.json
node tools/validate.mjs packs/my-pack    # one folder
```

It reports broken links, dead ends, unreachable sections, matches with no way to win, and codewords
that are required but never taught.

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
---

Intro markdown: the event, the ruleset, anything the reader needs before match one.
```

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
| `@points you 2 Takedown` | Add points (`you` or `them`), with an optional reason |
| `@advantage them Near sweep` | Add an advantage |
| `@penalty you Stalling` | Add a penalty |
| `@clock 4:30` | Set the match clock (it never runs backwards) |
| `@position Kesa gatame · bottom` | Position label above the story |
| `@learn Note text` | Add a note to the scouting report |
| `@learn CODEWORD \| Note text` | Add a note and a **codeword** that can unlock choices |
| `@win submission: armbar` | Winning ending (shown as "Victory by ...") |
| `@lose Submission: triangle` | Losing ending |
| `@decision` | Match ends; the scoresheet decides |

Effects fire when the player *enters* the section. The clock also ticks down 20 seconds per decision
on its own (stopping at 0:10); authored `@clock` values take over whenever you set them.

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
