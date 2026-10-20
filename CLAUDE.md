# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Roll Your Own Adventure**: a static, offline-capable (PWA) choose-your-own-adventure engine for
combat sports, plus two bundled packs: **Road to Gold** (BJJ: three-match gi absolute against a judoka, a
closed-guard specialist and a 10th Planet purple belt) and **Point in Line** (épée: three direct
elimination bouts to 15 against a tall counter-attacker, a flèche specialist and a second-intention
tactician). Live at https://shoryuken.me/roll/.

Plain HTML/CSS/ES modules. No build step, no runtime dependencies, no framework. Keep it that way.

## Commands

```bash
python3 -m http.server 8080   # run locally (npm run serve); must be HTTP, not file://
node tools/validate.mjs       # validate all packs (npm run validate); run after every pack edit
node tools/validate.mjs packs/point-in-line   # one pack (any folder, e.g. an unbundled draft)
node --test tools/test.mjs    # engine and sport tests (npm test); run after every engine change
node --test --test-name-pattern='fencing' tools/test.mjs   # single test(s) by name
tools/deploy.sh               # validate, test, rsync to server, check live URLs
```

The validator output gives more than pass/fail: per-match section, win, loss and decision counts, the
shortest winning line, and (for sports with end rules) simulated win rates for a first run and for a
run with every codeword. Use those numbers to check difficulty after editing a match. CI
(`.github/workflows/ci.yml`) runs `npm run validate && npm test` on Node 24, and `pages.yml`
publishes the GitHub Pages mirror from `main`.

## Layout

| Path | Role |
|---|---|
| `js/parser.js` | Pack format parser, `lintPack`, book numbering. Sport-neutral: score directives become generic effects resolved against the pack's sport |
| `js/engine.js` | Match engine (start, enter section, end rules, decisions, clock). Pure: used by the app, the validator's path simulation and `tools/test.mjs` |
| `js/sports/` | One module per sport (`bjj.js`, `fencing.js`), shared rule helpers (`common.js`) and the registry/pack-override merge (`index.js`). See `docs/SPORTS.md` |
| `css/sports/<theme>.css` | Per-sport look, scoped to `body[data-theme]`, loaded when a pack of that sport opens |
| `js/markdown.js` | Tiny markdown renderer; escapes all author HTML. `:::kind` callouts |
| `js/store.js` | Fetch packs, import packs from files, progress in localStorage (all access try/catch guarded) |
| `js/app.js` | Hash router and screens: `#/`, `#/pack/<id>`, `/match/<n>`, `/play`, `/book` |
| `js/book.js` | Printable gamebook (numbered paragraphs, scoresheet, codeword instructions) |
| `css/style.css` | Shared layout and components incl. print CSS for the book; no sport looks |
| `sw.js` | Service worker: network-first with cache fallback. Bump `VERSION` if you change the precache list. Only touches caches under its own `CACHE_PREFIX` and requests inside its scope (other apps share the origin) |
| `packs/<id>/techniques.md` | Optional technique library; `packFiles()` in `parser.js` is the one list of files a pack loads (used by the store, import, validator and tests) |
| `packs/index.json` | Lists bundled packs (also what the validator checks by default); `packs/<id>/pack.md` lists its match files. Pack files are not in the precache list: the service worker caches them as they are fetched |
| `docs/WRITING_PACKS.md` | Authoring format reference (keep in sync with parser changes) |

All asset paths are relative so the app works under any subpath (it is served from `/roll/`).

## Pack format (summary; full spec in docs/WRITING_PACKS.md)

- Section: `## Title {#id}`. IDs are unique across the whole pack; prefix per match (`j-`, `p-`, `l-`).
- Choice: `- [Label](#target)` optionally `{if CODEWORD}` / `{if !CODEWORD}`. Links stay within one match.
- Directives: `@points you|them N reason`, `@advantage`, `@penalty`, `@clock m:ss`, `@position`,
  `@learn [CODE |] text`, `@win text`, `@lose text`, `@decision`.
- Technique links: `[[name]]` or `[[name|shown text]]` in prose, resolved against the pack's optional
  technique library (`techniques: techniques.md` in `pack.md`; `## Title {#id}`, `@also` aliases,
  `- [Label](https://...)` links). Unknown names fail validation. Link sources: judo-derived techniques
  use judo.acmiyaguchi.me/waza/<slug> plus its Kodokan YouTube video (the site's own `youtube_link`);
  jiu-jitsu-only techniques use Bernardo Faria's channel (@BernardoFariaBJJ, including his guests);
  fencing uses Coach Tyler's Fencer's Edge (@FencersEdge). Check each video's channel and title with
  `https://www.youtube.com/oembed?format=json&url=<video url>` before adding it. `@score you|them <counter> N reason`
  targets any sport counter by id or alias; `@points`/`@advantage`/`@penalty` are shorthands by role.
- Effects fire on entering a section. Decision = points, then advantages, then fewer penalties; full tie
  goes to the opponent. The clock auto-ticks `clock_tick` seconds per move (default 20, floor 0:10); `@clock` never runs it backwards.
- Every non-ending section needs at least one ungated choice; the validator enforces this.
- A pack names its sport (`sport: fencing`; BJJ if omitted). Everything sport-specific lives in
  `js/sports/<id>.js`: counters, end rules, decision criteria, profile fields, UI text, book wording.
  **Never put sport knowledge in `app.js`, `book.js`, `engine.js`, `parser.js` or `css/style.css`**;
  add a field to the sport module (and its resolution in `js/sports/index.js`) instead.
- Pack-level overrides (`target`, `clock_tick`, `*_label`, stamps, `tie_text`, `theme`) are merged by
  `resolveSport()`; keep them working for existing and imported packs.
- New rule shapes go in `js/sports/common.js` as reusable end rules (`firstTo`, `leadBy`,
  `limitLoses`) with tests in `tools/test.mjs`.
- `@clock m:ss reset` starts a new period. With end rules, reaching N ends the bout mid-section; the
  validator's path simulation reports win rates; keep first runs hard and the final the hardest.

## Content rules for Point in Line

- Épée only: whole-body target, no right of way, doubles count (annulled at 14–14), DE to 15 or three
  3-minute periods, priority minute on a tie, rear-line crossing gives a touch, P-cards for passivity
  go to the fencer behind (both if level), refusing to salute is a black card.
- Each decision covers about a minute of fencing and several touches; prose must agree with the
  `@points` numbers in the same section. Don't state running scores.

## Content rules for Road to Gold

- **Technical accuracy is the point.** Outcomes must be realistic for that opponent (e.g. standing with
  a judoka loses; struggling in kesa gatame fails; pushing the head in kesa gets armlocked). Explain
  *why* in a `:::coach` callout. Rules claims go in `:::rule`.
- Event ruleset (stated in `pack.md`): IBJJF-style points, blue/purple submission rules, 6-minute
  matches. House rule: penalties only break ties. Twister, calf/bicep slicers, heel hooks, toe holds and
  knee bars are illegal; the straight ankle lock is legal. Don't contradict this in match text.
- Keep a few narrow winning lines per match plus decision wins; every loss should `@learn` something.
- Use they/them for anyone whose pronouns aren't established; opponents are fictional.

## Deploy

Server: `root@185.163.204.17`, web root `/var/www/shoryuken.me/roll/` (nginx site
`/etc/nginx/sites-enabled/shoryuken.me`, `location /roll/` block with no-cache headers and explicit MIME
types including `text/markdown` for `.md`). Deploy with `tools/deploy.sh`; it excludes `.git*`, `.github/`, `.claude/`, `tools/`,
`docs/`, `README.md`, `package.json` and this file. New JS/CSS files must be added to `SHELL` in
`sw.js` (and `VERSION` bumped) so installed copies work offline.

- The manifest `id` is `/roll/roll-your-own-adventure`: a distinct, app-specific value, never `./` or
  anything generic. Don't change it casually: a new id is a new app identity, so installed copies are
  offered a fresh install.
- nginx changes: back up the config to `/root/`, edit, `nginx -t`, then `systemctl reload nginx`.
- The site homepage `/var/www/shoryuken.me/index.html` links here from its Apps card list
  (`<a class="card" href="./roll/">`). Edit it locally in `../webroot/index.html` and deploy it (see `../webroot/CLAUDE.md`).
- After deploying, check in a browser that a match starts and the book view loads offline.
