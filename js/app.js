// Roll Your Own Adventure: app shell, routing and screens.
//
// Routes (hash based so the site works from any static host and offline):
//   #/                          pack picker
//   #/pack/<id>                 tournament bracket
//   #/pack/<id>/match/<n>       opponent profile + scouting report
//   #/pack/<id>/play            the match in progress
//   #/pack/<id>/book            printable gamebook edition

import { renderMarkdown, escapeHtml, inline } from './markdown.js';
import {
  applyScoreEffect, choiceVisible, decide, emptyScore, endingsOf,
} from './parser.js';
import {
  listPacks, loadPack, prefetchAll, importPackFiles, removeImported,
  loadProgress, saveProgress, resetProgress,
} from './store.js';
import { renderBook } from './book.js';

const $app = document.getElementById('app');
let packEntries = [];
let installPrompt = null;

// ---- helpers ---------------------------------------------------------------

const h = escapeHtml;

export function beltHtml(color = 'white', stripes = 0, extraClass = '') {
  const n = Math.max(0, Math.min(4, Number(stripes) || 0));
  return `<span class="belt belt-${h(color)} ${extraClass}" title="${h(color)} belt${n ? `, ${n} stripe${n > 1 ? 's' : ''}` : ''}">` +
    `<span class="belt-bar">${'<i></i>'.repeat(n)}</span></span>`;
}

function roundName(match, i, total) {
  if (match.meta.round) return match.meta.round;
  const fromEnd = total - i;
  return fromEnd === 1 ? 'Final' : fromEnd === 2 ? 'Semifinal' : fromEnd === 3 ? 'Quarterfinal' : `Round ${i + 1}`;
}

function setTitle(t) {
  document.title = t ? `${t} · Roll Your Own Adventure` : 'Roll Your Own Adventure';
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function entryFor(id) {
  return packEntries.find((p) => p.id === id);
}

async function getPack(id) {
  const entry = entryFor(id);
  if (!entry) throw new Error(`No adventure pack called "${id}".`);
  return loadPack(entry);
}

function showError(err) {
  console.error(err);
  $app.innerHTML = `<section class="panel paper"><h2>Something went sideways</h2>
    <p>${h(err.message || err)}</p><p><a class="btn" href="#/">Back to the packs</a></p></section>`;
}

// ---- router ----------------------------------------------------------------

async function route() {
  document.body.classList.remove('book-mode');
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  try {
    if (parts[0] !== 'pack') return renderHome();
    const pack = await getPack(decodeURIComponent(parts[1]));
    if (parts[2] === 'match') return renderIntro(pack, Number(parts[3]) || 0);
    if (parts[2] === 'play') return renderPlay(pack);
    if (parts[2] === 'book') return renderBookRoute(pack);
    return renderBracket(pack);
  } catch (e) {
    showError(e);
  } finally {
    window.scrollTo(0, 0);
  }
}

// ---- home: pack picker -----------------------------------------------------

async function renderHome() {
  setTitle('');
  const cards = await Promise.all(packEntries.map(async (e) => {
    let pack = null;
    try { pack = await loadPack(e); } catch { /* shown as unavailable */ }
    const meta = pack ? pack.meta : { title: e.title || e.id };
    const prog = loadProgress(e.id);
    const total = pack ? pack.matches.length : 0;
    const won = Object.keys(prog.wins).length;
    return `<article class="pack-card gi">
      <div class="pack-card-top">
        <span class="kicker">${h(meta.event || 'Adventure pack')}</span>
        ${prog.medal ? '<span class="medal-mini" title="Gold medal won">🥇</span>' : ''}
      </div>
      <h2>${h(meta.title)}</h2>
      ${meta.subtitle ? `<p class="subtitle">${h(meta.subtitle)}</p>` : ''}
      ${pack ? `<p class="pack-stats">${total} matches · ${won}/${total} won · ${prog.notes.length} scouting notes</p>` : '<p class="pack-stats">Unavailable offline</p>'}
      <div class="row">
        <a class="btn btn-primary" href="#/pack/${encodeURIComponent(e.id)}">${won ? 'Continue' : 'Enter the bracket'}</a>
        ${pack ? `<a class="btn" href="#/pack/${encodeURIComponent(e.id)}/book">Book edition</a>` : ''}
        ${e.imported ? `<button class="btn btn-ghost" data-remove="${h(e.id)}">Remove</button>` : ''}
      </div>
    </article>`;
  }));

  $app.innerHTML = `
    <section class="hero">
      <p class="kicker">A choose-your-own-adventure engine for grapplers</p>
      <h1 class="hero-title">Roll Your Own <span>Adventure</span></h1>
      <p class="hero-lede">Step onto the mat. Read your opponent. Pick your grips. Every choice has a
      realistic consequence, and every loss teaches you something about the person across from you.
      There are only a few narrow roads to gold.</p>
    </section>
    <section class="pack-grid">${cards.join('') || '<p>No packs found.</p>'}</section>
    <section class="panel tools-panel">
      <h3>Bring your own pack</h3>
      <p>Packs are plain markdown files. Select a <code>pack.md</code> and its match files to load
      your own adventure (stored only in this browser). See <code>docs/WRITING_PACKS.md</code>.</p>
      <div class="row">
        <label class="btn">Import pack files<input type="file" id="import" accept=".md,text/markdown,text/plain" multiple hidden></label>
        <button class="btn" id="install" ${installPrompt ? '' : 'hidden'}>Install app</button>
      </div>
      <p class="import-msg" id="import-msg" role="status"></p>
    </section>`;

  $app.querySelector('#import').addEventListener('change', async (ev) => {
    const msg = $app.querySelector('#import-msg');
    try {
      const id = await importPackFiles(ev.target.files);
      packEntries = await listPacks();
      go(`#/pack/${encodeURIComponent(id)}`);
    } catch (e) {
      msg.textContent = e.message;
    }
  });
  $app.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Remove this imported pack and its progress?')) return;
    removeImported(b.dataset.remove);
    resetProgress(b.dataset.remove);
    packEntries = await listPacks();
    renderHome();
  }));
  const install = $app.querySelector('#install');
  install.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    install.hidden = true;
  });
}

// ---- bracket ---------------------------------------------------------------

function opponentLine(m) {
  const bits = [m.meta.team, m.meta.art].filter(Boolean).map(h);
  return bits.join(' · ');
}

function renderBracket(pack) {
  setTitle(pack.meta.title);
  const prog = loadProgress(pack.id);
  const total = pack.matches.length;

  const rounds = pack.matches.map((m, i) => {
    const won = !!prog.wins[i];
    const unlocked = i === 0 || prog.wins[i - 1];
    const endings = endingsOf(m);
    const found = endings.filter((id) => prog.endings[id]).length;
    const state = won ? 'won' : unlocked ? 'open' : 'locked';
    return `<li class="bracket-round bracket-${state}">
      <div class="bracket-label">${h(roundName(m, i, total))}</div>
      <div class="bracket-card gi">
        <div class="bracket-opp">
          ${beltHtml(m.meta.belt, m.meta.stripes)}
          <div>
            <strong>${unlocked ? h(m.meta.opponent || 'Unknown') : '???'}</strong>
            <span class="muted">${unlocked ? opponentLine(m) : 'Win the previous round to find out'}</span>
          </div>
        </div>
        <div class="bracket-meta">
          <span>${won ? '✔ Won' : unlocked ? 'Up next' : 'Locked'}</span>
          <span>${prog.attempts[i] || 0} attempts</span>
          <span>${found}/${endings.length} endings</span>
        </div>
        ${unlocked ? `<a class="btn ${won ? '' : 'btn-primary'}" href="#/pack/${encodeURIComponent(pack.id)}/match/${i}">${won ? 'Rematch' : 'Scout &amp; step on'}</a>` : ''}
      </div>
    </li>`;
  }).join('');

  const run = prog.run && !prog.run.ended ? prog.run : null;
  const problems = pack.errors.length
    ? `<details class="panel warn"><summary>This pack has ${pack.errors.length} authoring problems</summary><ul>${pack.errors.map((e) => `<li>${h(e)}</li>`).join('')}</ul></details>`
    : '';

  $app.innerHTML = `
    <nav class="crumbs"><a href="#/">← All packs</a></nav>
    <section class="pack-head">
      <p class="kicker">${h(pack.meta.event || '')}</p>
      <h1>${h(pack.meta.title)}</h1>
      ${pack.meta.subtitle ? `<p class="subtitle">${h(pack.meta.subtitle)}</p>` : ''}
      <div class="you-card">
        ${beltHtml(pack.meta.player_belt || 'white', pack.meta.player_stripes)}
        <span>${h(pack.meta.player || 'You')}</span>
      </div>
    </section>
    ${problems}
    ${run ? `<section class="panel resume"><p>Match in progress against <strong>${h(pack.matches[run.match].meta.opponent)}</strong>.</p>
      <a class="btn btn-primary" href="#/pack/${encodeURIComponent(pack.id)}/play">Back to the mat</a></section>` : ''}
    <ol class="bracket">${rounds}
      <li class="bracket-round bracket-${prog.medal ? 'won' : 'locked'}">
        <div class="bracket-label">Podium</div>
        <div class="bracket-card gold-card">${prog.medal ? '🥇 <strong>Gold.</strong> You did it.' : 'Gold is waiting.'}</div>
      </li>
    </ol>
    <section class="panel paper intro-text">${renderMarkdown(pack.intro)}</section>
    ${scoutingReportHtml(pack, prog)}
    <section class="row center">
      <a class="btn" href="#/pack/${encodeURIComponent(pack.id)}/book">📖 Book edition / print</a>
      <button class="btn btn-ghost" id="reset">Reset all progress</button>
    </section>`;

  $app.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('Forget every scouting note, ending and win for this pack?')) return;
    resetProgress(pack.id);
    renderBracket(pack);
  });
}

function scoutingReportHtml(pack, prog, onlyMatch = null) {
  const groups = pack.matches
    .map((m, i) => ({ m, i, notes: prog.notes.filter((n) => n.match === i) }))
    .filter((g) => g.notes.length && (onlyMatch == null || g.i === onlyMatch));
  if (!groups.length) {
    return `<section class="panel notebook"><h3>Scouting report</h3>
      <p class="muted">Empty. You learn about opponents the hard way: by playing, and by losing.</p></section>`;
  }
  return `<section class="panel notebook"><h3>Scouting report</h3>${groups.map((g) => `
    <h4>${h(g.m.meta.opponent)}</h4>
    <ul class="notes">${g.notes.map((n) => `<li>${n.key ? `<span class="codeword">${h(n.key)}</span>` : ''}${inline(n.text)}</li>`).join('')}</ul>`).join('')}
  </section>`;
}

// ---- opponent intro --------------------------------------------------------

function renderIntro(pack, i) {
  const m = pack.matches[i];
  if (!m) return go(`#/pack/${encodeURIComponent(pack.id)}`);
  const prog = loadProgress(pack.id);
  if (i > 0 && !prog.wins[i - 1]) return go(`#/pack/${encodeURIComponent(pack.id)}`);
  setTitle(`${roundName(m, i, pack.matches.length)} vs ${m.meta.opponent}`);
  const meta = m.meta;
  const stat = (k, label) => (meta[k] ? `<div><dt>${label}</dt><dd>${h(meta[k])}</dd></div>` : '');

  $app.innerHTML = `
    <nav class="crumbs"><a href="#/pack/${encodeURIComponent(pack.id)}">← Bracket</a></nav>
    <section class="versus">
      <div class="versus-side you">
        ${beltHtml(pack.meta.player_belt, pack.meta.player_stripes, 'belt-lg')}
        <strong>${h(pack.meta.player || 'You')}</strong>
      </div>
      <div class="versus-mid"><span class="kicker">${h(roundName(m, i, pack.matches.length))}</span><span class="vs">VS</span></div>
      <div class="versus-side them">
        ${beltHtml(meta.belt, meta.stripes, 'belt-lg')}
        <strong>${h(meta.opponent)}</strong>
        ${meta.nickname ? `<span class="nickname">“${h(meta.nickname)}”</span>` : ''}
      </div>
    </section>
    <section class="panel gi profile">
      <dl class="stats">
        ${stat('team', 'Team')}${stat('art', 'Background')}${stat('height', 'Height')}${stat('weight', 'Weight')}${stat('record', 'Record')}${stat('time', 'Match time')}
      </dl>
      ${meta.blurb ? `<p class="blurb">${inline(meta.blurb)}</p>` : ''}
    </section>
    ${m.intro ? `<section class="panel paper intro-text">${renderMarkdown(m.intro)}</section>` : ''}
    ${scoutingReportHtml(pack, prog, i)}
    <section class="row center">
      <button class="btn btn-primary btn-big" id="bow">Bow in. Oss.</button>
    </section>`;

  $app.querySelector('#bow').addEventListener('click', () => {
    startMatch(pack, i);
    go(`#/pack/${encodeURIComponent(pack.id)}/play`);
  });
}

// ---- match engine ----------------------------------------------------------

function startMatch(pack, i) {
  const prog = loadProgress(pack.id);
  prog.attempts[i] = (prog.attempts[i] || 0) + 1;
  prog.run = {
    match: i,
    section: null,
    score: emptyScore(),
    clock: pack.matches[i].meta.time || null,
    log: [],
    learned: [],
    fresh: [],
    ended: null,
  };
  enterSection(pack, prog, pack.matches[i].start, null);
}

const toSecs = (c) => {
  const m = /^(\d+):(\d{2})$/.exec(c || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fmtClock = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;

// Each decision costs match time. An authored @clock wins, but the clock never
// runs backwards; auto-ticking stops at 0:10 so only an authored ending says "time".
function nextClock(current, authored, moved) {
  const cur = toSecs(current);
  const set = toSecs(authored);
  if (cur == null) return authored || current;
  if (set != null) return fmtClock(Math.min(cur, set));
  return moved ? fmtClock(Math.max(Math.min(cur, 10), cur - 20)) : current;
}

function enterSection(pack, prog, id, choiceLabel) {
  const run = prog.run;
  const s = pack.sections.get(id);
  if (!s) throw new Error(`Section "${id}" does not exist in this pack.`);
  if (choiceLabel) run.log.push({ at: pack.sections.get(run.section).title, choice: choiceLabel });
  run.section = id;
  run.fresh = [];
  run.clock = nextClock(run.clock, s.clock, !!choiceLabel);

  for (const fx of s.effects) {
    if (fx.type === 'learn') {
      const isNew = fx.key ? !(fx.key in prog.codewords) : !prog.notes.some((n) => n.text === fx.text);
      if (isNew) {
        if (fx.key) prog.codewords[fx.key] = fx.text;
        prog.notes.push({ match: run.match, key: fx.key, text: fx.text });
      }
      if (!run.learned.some((l) => l.text === fx.text)) run.learned.push({ key: fx.key, text: fx.text, isNew });
      run.fresh.push({ ...fx, isNew });
    } else {
      applyScoreEffect(run.score, fx);
      run.fresh.push(fx);
    }
  }

  if (s.ending) {
    prog.endings[id] = true;
    let win = s.ending.type === 'win';
    let by = s.ending.type === 'decision' ? null : 'submission';
    if (s.ending.type === 'decision') ({ win, by } = decide(run.score));
    run.ended = { type: s.ending.type, win, by, text: s.ending.text };
    if (win) {
      prog.wins[run.match] = true;
      if (run.match === pack.matches.length - 1) prog.medal = true;
      prog.current = Math.max(prog.current, run.match + 1);
    }
  }
  saveProgress(pack.id, prog);
}

function scoreboardHtml(pack, run) {
  const m = pack.matches[run.match];
  const row = (who, name, belt, stripes) => {
    const sc = run.score[who];
    const bumped = run.fresh.filter((f) => f.who === who);
    const pulse = (type) => (bumped.some((f) => f.type === type) ? ' pulse' : '');
    return `<div class="sb-row sb-${who}">
      <div class="sb-name">${beltHtml(belt, stripes)}<span>${h(name)}</span></div>
      <div class="sb-pen${pulse('penalty')}" title="Penalties">${sc.pen}</div>
      <div class="sb-adv${pulse('advantage')}" title="Advantages">${sc.adv}</div>
      <div class="sb-pts${pulse('points')}" title="Points">${sc.pts}</div>
    </div>`;
  };
  return `<header class="scoreboard" aria-label="Scoreboard">
    <div class="sb-rows">
      <div class="sb-head"><span></span><span class="l-pen">PEN</span><span class="l-adv">ADV</span><span>PTS</span></div>
      ${row('you', pack.meta.player || 'You', pack.meta.player_belt, pack.meta.player_stripes)}
      ${row('them', m.meta.opponent, m.meta.belt, m.meta.stripes)}
    </div>
    <div class="sb-side">
      <div class="sb-time">TIME</div>
      <div class="sb-clock" title="Time remaining">${h(run.clock || '--:--')}</div>
    </div>
  </header>`;
}

function effectsHtml(run) {
  return run.fresh.map((fx) => {
    const who = fx.who === 'you' ? 'You' : 'Opponent';
    if (fx.type === 'points') return `<div class="fx fx-${fx.who}"><b>+${fx.value}</b> ${who}${fx.label ? ` · ${h(fx.label)}` : ''}</div>`;
    if (fx.type === 'advantage') return `<div class="fx fx-adv fx-${fx.who}"><b>ADV</b> ${who}${fx.label ? ` · ${h(fx.label)}` : ''}</div>`;
    if (fx.type === 'penalty') return `<div class="fx fx-pen fx-${fx.who}"><b>PEN</b> ${who}${fx.label ? ` · ${h(fx.label)}` : ''}</div>`;
    if (fx.type === 'learn') {
      return `<div class="fx fx-learn">✎ <b>${fx.isNew ? 'New scouting note' : 'Confirmed'}</b>${fx.key ? ` <span class="codeword">${h(fx.key)}</span>` : ''} ${inline(fx.text)}</div>`;
    }
    return '';
  }).join('');
}

function endingHtml(pack, prog, run) {
  const e = run.ended;
  const m = pack.matches[run.match];
  const last = run.match === pack.matches.length - 1;
  const base = `#/pack/${encodeURIComponent(pack.id)}`;
  const y = run.score.you;
  const t = run.score.them;
  const scoreLine = `${y.pts}–${t.pts}` + (y.adv || t.adv ? ` (adv ${y.adv}–${t.adv})` : '') + (y.pen || t.pen ? ` (pen ${y.pen}–${t.pen})` : '');
  const how = e.type === 'decision'
    ? (e.by === 'referee'
      ? 'Dead even on the scoresheet. The referee’s decision goes to your opponent.'
      : `Decision on ${e.by}: ${scoreLine}.`)
    : h(e.text);

  const learned = run.learned.length
    ? `<div class="lessons"><h4>What this match taught you</h4><ul class="notes">${run.learned.map((l) =>
      `<li>${l.key ? `<span class="codeword">${h(l.key)}</span>` : ''}${inline(l.text)}${l.isNew ? ' <em class="new">new</em>' : ''}</li>`).join('')}</ul></div>`
    : '';

  const replay = run.log.length
    ? `<details class="replay"><summary>Match replay (${run.log.length} decisions)</summary><ol>${run.log.map((l) =>
      `<li><span class="muted">${h(l.at)}:</span> ${inline(l.choice)}</li>`).join('')}</ol></details>`
    : '';

  const endings = endingsOf(m);
  const found = endings.filter((id) => prog.endings[id]).length;

  if (e.win) {
    const next = last
      ? `<button class="btn btn-primary btn-big" id="gold">Step onto the podium</button>`
      : `<a class="btn btn-primary btn-big" href="${base}/match/${run.match + 1}">Next: ${h(roundName(pack.matches[run.match + 1], run.match + 1, pack.matches.length))}</a>`;
    return `<section class="ending ending-win">
      <div class="ending-stamp">Hand raised</div>
      <p class="ending-how">${e.type === 'decision' ? how : `Victory by ${how}`}</p>
      <p class="muted">Final score ${scoreLine} · ${found}/${endings.length} endings found</p>
      ${learned}${replay}
      <div class="row center">${next}<a class="btn" href="${base}">Bracket</a></div>
    </section>`;
  }
  return `<section class="ending ending-lose">
    <div class="ending-stamp">${e.type === 'decision' ? 'Decision lost' : 'Tap'}</div>
    <p class="ending-how">${how}</p>
    <p class="muted">Final score ${scoreLine} · ${found}/${endings.length} endings found</p>
    ${learned}${replay}
    <div class="row center">
      <button class="btn btn-primary btn-big" id="again">Shake hands. Run it back.</button>
      <a class="btn" href="${base}/match/${run.match}">Review scouting report</a>
      <a class="btn" href="${base}">Bracket</a>
    </div>
  </section>`;
}

function renderPlay(pack) {
  const prog = loadProgress(pack.id);
  const run = prog.run;
  if (!run || !pack.sections.has(run.section)) return go(`#/pack/${encodeURIComponent(pack.id)}`);
  const m = pack.matches[run.match];
  const s = pack.sections.get(run.section);
  setTitle(`vs ${m.meta.opponent}`);

  const choices = run.ended ? [] : s.choices.filter((c) => choiceVisible(c, prog.codewords));
  const choicesHtml = choices.map((c, n) => `
    <li><button class="choice${c.cond && !c.cond.negate ? ' choice-scouted' : ''}" data-target="${h(c.target)}" data-label="${h(c.label)}">
      <span class="choice-key">${n + 1}</span>
      <span class="choice-label">${inline(c.label)}</span>
      ${c.cond && !c.cond.negate ? `<span class="codeword" title="Unlocked by your scouting report">${h(c.cond.key)}</span>` : ''}
    </button></li>`).join('');

  $app.innerHTML = `
    ${scoreboardHtml(pack, run)}
    <div class="play-bar">
      ${s.position ? `<span class="position"><span class="kicker">Position</span> ${h(s.position)}</span>` : '<span></span>'}
      <span class="row">
        <button class="btn btn-small btn-ghost" id="notes-btn">Scouting report</button>
        <button class="btn btn-small btn-ghost" id="quit">Restart match</button>
      </span>
    </div>
    <article class="story paper">
      <h2 class="story-title">${inline(s.title)}</h2>
      ${renderMarkdown(s.body)}
      ${effectsHtml(run)}
    </article>
    ${run.ended ? endingHtml(pack, prog, run) : `<ol class="choices">${choicesHtml}</ol>`}
    <dialog id="notes-dlg" class="paper">${scoutingReportHtml(pack, prog)}<form method="dialog"><button class="btn">Close</button></form></dialog>`;

  $app.querySelectorAll('.choice').forEach((b) => b.addEventListener('click', () => {
    const p = loadProgress(pack.id);
    enterSection(pack, p, b.dataset.target, b.dataset.label);
    renderPlay(pack);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  $app.querySelector('#notes-btn').addEventListener('click', () => $app.querySelector('#notes-dlg').showModal());
  $app.querySelector('#quit').addEventListener('click', () => {
    if (!run.ended && !confirm('Restart this match from the handshake? Your scouting notes are kept.')) return;
    startMatch(pack, run.match);
    renderPlay(pack);
  });
  const again = $app.querySelector('#again');
  if (again) again.addEventListener('click', () => { startMatch(pack, run.match); renderPlay(pack); });
  const gold = $app.querySelector('#gold');
  if (gold) gold.addEventListener('click', () => renderGold(pack));
}

function renderGold(pack) {
  const prog = loadProgress(pack.id);
  const attempts = Object.values(prog.attempts).reduce((a, b) => a + b, 0);
  const endings = pack.matches.reduce((a, m) => a + endingsOf(m).length, 0);
  const found = Object.keys(prog.endings).length;
  setTitle('Gold');
  $app.innerHTML = `
    <section class="podium">
      <div class="medal" aria-hidden="true"><span>1</span></div>
      <h1>Gold</h1>
      <p class="hero-lede">${inline(pack.meta.gold || 'Top of the podium. Somewhere, your coach is pretending not to cry.')}</p>
      <p class="muted">${attempts} matches wrestled · ${prog.notes.length} scouting notes · ${found}/${endings} endings discovered</p>
      <div class="row center">
        <a class="btn btn-primary" href="#/pack/${encodeURIComponent(pack.id)}">Back to the bracket</a>
        <a class="btn" href="#/">Other packs</a>
      </div>
    </section>`;
}

function renderBookRoute(pack) {
  setTitle(`${pack.meta.title} (book)`);
  document.body.classList.add('book-mode');
  $app.innerHTML = `<div class="book-toolbar no-print">
      <a class="btn" href="#/pack/${encodeURIComponent(pack.id)}">← Back to the app</a>
      <button class="btn btn-primary" id="print">Print / save as PDF</button>
    </div>${renderBook(pack, beltHtml)}`;
  $app.querySelector('#print').addEventListener('click', () => window.print());
}

// ---- keyboard: 1–9 picks a choice -----------------------------------------

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input, textarea, dialog[open]') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const n = Number(ev.key);
  if (n >= 1 && n <= 9) {
    const btn = $app.querySelectorAll('.choice')[n - 1];
    if (btn) { ev.preventDefault(); btn.click(); }
  }
});

// ---- boot ------------------------------------------------------------------

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();
  installPrompt = ev;
  const b = document.getElementById('install');
  if (b) b.hidden = false;
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker failed', e));
}

window.addEventListener('hashchange', route);

(async () => {
  packEntries = await listPacks();
  await route();
  prefetchAll(packEntries);
})();
