# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**Roll Your Own Adventure**: a static, offline-capable (PWA) choose-your-own-adventure engine for
grappling stories, plus the bundled BJJ pack **Road to Gold** (three-match gi absolute: a judoka, a
closed-guard specialist, a 10th Planet purple belt). Live at https://shoryuken.me/roll/.

Plain HTML/CSS/ES modules. No build step, no runtime dependencies, no framework. Keep it that way.

## Commands

```bash
python3 -m http.server 8080   # run locally (npm run serve); must be HTTP, not file://
node tools/validate.mjs       # validate all packs (npm run validate); run after every pack edit
tools/deploy.sh               # validate, rsync to server, check live URLs
```

## Layout

| Path | Role |
|---|---|
| `js/parser.js` | Pack format parser, `lintPack`, decision rule, scoring, book numbering. Pure JS, no DOM: shared by the app and `tools/validate.mjs` |
| `js/markdown.js` | Tiny markdown renderer; escapes all author HTML. `:::kind` callouts |
| `js/store.js` | Fetch packs, import packs from files, progress in localStorage (all access try/catch guarded) |
| `js/app.js` | Hash router and screens: `#/`, `#/pack/<id>`, `/match/<n>`, `/play`, `/book` |
| `js/book.js` | Printable gamebook (numbered paragraphs, scoresheet, codeword instructions) |
| `css/style.css` | Whole theme incl. print CSS for the book |
| `sw.js` | Service worker: network-first with cache fallback. Bump `CACHE` if you change the precache list |
| `packs/index.json` | Lists bundled packs; `packs/<id>/pack.md` lists its match files |
| `docs/WRITING_PACKS.md` | Authoring format reference (keep in sync with parser changes) |

All asset paths are relative so the app works under any subpath (it is served from `/roll/`).

## Pack format (summary; full spec in docs/WRITING_PACKS.md)

- Section: `## Title {#id}`. IDs are unique across the whole pack; prefix per match (`j-`, `p-`, `l-`).
- Choice: `- [Label](#target)` optionally `{if CODEWORD}` / `{if !CODEWORD}`. Links stay within one match.
- Directives: `@points you|them N reason`, `@advantage`, `@penalty`, `@clock m:ss`, `@position`,
  `@learn [CODE |] text`, `@win text`, `@lose text`, `@decision`.
- Effects fire on entering a section. Decision = points, then advantages, then fewer penalties; full tie
  goes to the opponent. The clock auto-ticks 20s per move (floor 0:10); `@clock` never runs it backwards.
- Every non-ending section needs at least one ungated choice; the validator enforces this.

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
types including `text/markdown` for `.md`). Deploy with `tools/deploy.sh`; it excludes `tools/`,
`docs/`, `README.md`, `package.json` and this file.

- nginx changes: back up the config to `/root/`, edit, `nginx -t`, then `systemctl reload nginx`.
- The site homepage `/var/www/shoryuken.me/index.html` links here from its Apps card list
  (`<a class="card" href="./roll/">`). It is hand-edited on the server.
- After deploying, check in a browser that a match starts and the book view loads offline.
