// Gamebook edition: renders a whole pack as numbered paragraphs, the way a
// printed choose-your-own-adventure works. Scores and codewords become
// instructions for a paper scoresheet. Print it from the browser (or save as PDF).

import { renderMarkdown, escapeHtml as h, inline } from './markdown.js';
import { bookNumbers } from './parser.js';

function roundName(m, i, total) {
  if (m.meta.round) return m.meta.round;
  const fromEnd = total - i;
  return fromEnd === 1 ? 'Final' : fromEnd === 2 ? 'Semifinal' : fromEnd === 3 ? 'Quarterfinal' : `Round ${i + 1}`;
}

function effectLine(fx, sport) {
  const who = fx.who === 'you' ? 'yourself' : 'your opponent';
  const why = fx.label ? ` (${h(fx.label)})` : '';
  switch (fx.type) {
    case 'score': {
      const c = sport.counter(fx.counter);
      const whose = who === 'yourself' ? 'your' : 'your opponent’s';
      const label = h(c.label.toLowerCase());
      if (c.id !== sport.primary && fx.value === 1) return `✎ Mark <b>one</b> in ${whose} ${label}${why}.`;
      return `✎ Add <b>${fx.value > 0 ? '+' : ''}${fx.value}</b> to ${whose} ${label}${why}.`;
    }
    case 'learn':
      return fx.key
        ? `✎ Write the codeword <span class="codeword">${h(fx.key)}</span> in your scouting report: ${inline(fx.text)}`
        : `✎ Scouting note: ${inline(fx.text)}`;
    default: return '';
  }
}

function choiceLine(c, nums) {
  const n = nums.get(c.target);
  if (!c.cond) return `<li>${inline(c.label)} <span class="turn">turn to <b>${n}</b></span></li>`;
  const cw = `<span class="codeword">${h(c.cond.key)}</span>`;
  const pre = c.cond.negate ? `If you do <em>not</em> have the codeword ${cw}: ` : `If you have the codeword ${cw}: `;
  return `<li class="gated">${pre}${inline(c.label)} <span class="turn">turn to <b>${n}</b></span></li>`;
}

function endingBlock(s, pack, nums) {
  const m = pack.matches[s.match];
  const next = pack.matches[s.match + 1];
  const restart = `start this match again at <b>${nums.get(m.start)}</b> with a fresh scoresheet. Keep your codewords.`;
  const onward = next
    ? `Turn to <b>${nums.get(next.start)}</b> to begin the ${h(roundName(next, s.match + 1, pack.matches.length))}.`
    : 'Turn to <b>the Podium</b> at the end of this book.';
  if (s.ending.type === 'win') {
    return `<div class="book-end win"><b>You win by ${h(s.ending.text)}.</b> ${onward}</div>`;
  }
  if (s.ending.type === 'lose') {
    return `<div class="book-end lose"><b>You lose: ${h(s.ending.text)}.</b> Your run ends here; ${restart}</div>`;
  }
  return `<div class="book-end decision"><b>Time. Decision.</b> ${s.ending.text ? h(s.ending.text) + ' ' : ''}
    Check your scoresheet: ${h(pack.sport.decisionText())} <b>If you won:</b> ${onward}
    <b>If you lost:</b> ${restart}</div>`;
}

export function renderBook(pack, beltHtml) {
  const nums = bookNumbers(pack);
  const meta = pack.meta;
  const total = pack.matches.length;
  const first = pack.matches[0];
  const sport = pack.sport;
  // Scoresheet columns read like the score line: primary first, then leftwards along the board.
  const cols = sport.board.slice().reverse().map((id) => sport.counter(id).label);

  const scoresheet = `
    <section class="book-page scoresheet">
      <h2>Scoresheet</h2>
      <p>Photocopy this page or use pencil. Clear the score table every time you start a match; never erase codewords.</p>
      <table>
        <thead><tr><th></th>${cols.map((c) => `<th>${h(c)}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><th>You</th>${cols.map(() => '<td></td>').join('')}</tr>
          <tr><th>Opponent</th>${cols.map(() => '<td></td>').join('')}</tr>
        </tbody>
      </table>
      <h3>Scouting report (codewords)</h3>
      <div class="lines">${'<div></div>'.repeat(14)}</div>
      <h3>Bracket</h3>
      <ol class="book-bracket">${pack.matches.map((m, i) => `<li>${h(roundName(m, i, total))}: ${h(m.meta.opponent)} <span class="box"></span> won</li>`).join('')}</ol>
    </section>`;

  const matches = pack.matches.map((m, i) => {
    const ordered = m.sections.slice().sort((a, b) => nums.get(a.id) - nums.get(b.id));
    const stats = sport.profile
      .filter(([k]) => m.meta[k]).map(([k, label]) => `<span><b>${h(label.toLowerCase())}:</b> ${h(m.meta[k])}</span>`).join(' · ');
    return `
      <section class="book-page book-match">
        <p class="kicker">${h(roundName(m, i, total))}</p>
        <h2>${h(m.meta.opponent)}${m.meta.nickname ? ` <span class="nickname">“${h(m.meta.nickname)}”</span>` : ''}</h2>
        ${m.meta.belt ? `<p>${beltHtml(m.meta.belt, m.meta.stripes)}</p>` : ''}
        <p class="book-stats">${stats}</p>
        ${m.meta.blurb ? `<p class="blurb">${inline(m.meta.blurb)}</p>` : ''}
        ${renderMarkdown(m.intro)}
        ${(() => {
          const rule = sport.bookRule({
            onward: pack.matches[i + 1] ? `turn to <b>${nums.get(pack.matches[i + 1].start)}</b>` : 'turn to <b>the Podium</b>',
            restart: `start again at <b>${nums.get(m.start)}</b>.`,
          });
          return rule ? `<p class="book-target">${rule}</p>` : '';
        })()}
        <p class="begin">Clear your score table. Begin at <b>${nums.get(m.start)}</b>.</p>
      </section>
      <section class="book-sections">
        ${ordered.map((s) => `
          <article class="book-sec" id="p${nums.get(s.id)}">
            <header><span class="num">${nums.get(s.id)}</span>
              <span class="sec-meta">${[s.clock && `⏱ ${h(s.clock)}`, s.position && h(s.position)].filter(Boolean).join(' · ')}</span></header>
            ${renderMarkdown(s.body)}
            ${s.effects.length ? `<ul class="book-fx">${s.effects.map((fx) => `<li>${effectLine(fx, sport)}</li>`).join('')}</ul>` : ''}
            ${s.ending ? endingBlock(s, pack, nums) : `<ul class="book-choices">${s.choices.map((c) => choiceLine(c, nums)).join('')}</ul>`}
          </article>`).join('')}
      </section>`;
  }).join('');

  return `<div class="book">
    <section class="book-page book-title">
      <p class="kicker">${h(meta.event || '')}</p>
      <h1>${h(meta.title)}</h1>
      ${meta.subtitle ? `<p class="subtitle">${h(meta.subtitle)}</p>` : ''}
      ${meta.author ? `<p class="byline">by ${h(meta.author)}</p>` : ''}
      ${meta.player_belt ? `<p class="book-belt">${beltHtml(meta.player_belt, meta.player_stripes, 'belt-lg')}</p>` : ''}
    </section>
    <section class="book-page">
      <h2>How to play this book</h2>
      <p>Do not read this book from front to back. Each numbered paragraph describes a moment of a match
      and ends with choices; pick one and turn to the paragraph it names.</p>
      <ul>
        <li><b>Scoresheet.</b> When a paragraph tells you to score ${h(cols.map((c) => c.toLowerCase()).join(', '))}, mark them on
        your scoresheet. If a match goes to the buzzer, the scoresheet decides it.</li>
        <li><b>Codewords.</b> When you learn something about an opponent, write the codeword down. Codewords
        survive losses: some choices are only open to fighters who have done their scouting.</li>
        <li><b>Losing.</b> When you lose, clear the score table and start the match again. You keep what you learned.</li>
      </ul>
      <p>Your tournament begins at <b>${nums.get(first.start)}</b>.</p>
    </section>
    <section class="book-page book-intro">${renderMarkdown(pack.intro)}</section>
    ${scoresheet}
    ${matches}
    <section class="book-page book-podium">
      <h2>The Podium</h2>
      <div class="medal" aria-hidden="true"><span>1</span></div>
      <p>${inline(meta.gold || 'Gold.')}</p>
    </section>
  </div>`;
}
