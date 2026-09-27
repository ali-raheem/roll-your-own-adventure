// Adventure pack parser. Pure JS with no DOM access, so the browser app and the
// Node validator (tools/validate.mjs) share exactly the same rules.
//
// Pack layout:
//   packs/<id>/pack.md      front matter (title, matches: [...files]) + intro markdown
//   packs/<id>/<match>.md   front matter (opponent profile) + "## Title {#id}" sections
//
// See docs/WRITING_PACKS.md for the authoring format.

const SECTION_RE = /^##\s+(.*?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/;
const CHOICE_RE = /^[-*]\s+\[(.+?)\]\(#([A-Za-z0-9_-]+)\)\s*(?:\{if\s+(!?)([A-Za-z0-9_-]+)\})?\s*$/;
const DIRECTIVE_RE = /^@([a-z]+)\b\s*(.*)$/;

export const WHO = ['you', 'them'];

/** Minimal YAML subset: `key: value`, and `key:` followed by `  - item` lines. */
export function parseFrontmatter(text) {
  const src = text.replace(/\r\n?/g, '\n');
  if (!src.startsWith('---\n')) return { meta: {}, body: src };
  const end = src.indexOf('\n---', 4);
  if (end === -1) return { meta: {}, body: src };
  const head = src.slice(4, end);
  const body = src.slice(src.indexOf('\n', end + 1) + 1);
  const meta = {};
  let listKey = null;
  for (const raw of head.split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = raw.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      meta[listKey].push(unquote(item[1]));
      continue;
    }
    const kv = raw.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    if (kv[2] === '') {
      listKey = kv[1];
      meta[listKey] = [];
    } else {
      listKey = null;
      meta[kv[1]] = unquote(kv[2]);
    }
  }
  return { meta, body };
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function parseDirective(name, arg, section, errors, where) {
  const fx = section.effects;
  switch (name) {
    case 'points': {
      const m = arg.match(/^(you|them)\s+(-?\d+)\s*(.*)$/);
      if (!m) return errors.push(`${where}: @points needs "you|them <n> [reason]"`);
      fx.push({ type: 'points', who: m[1], value: Number(m[2]), label: m[3].trim() });
      break;
    }
    case 'advantage':
    case 'penalty': {
      const m = arg.match(/^(you|them)\s*(.*)$/);
      if (!m) return errors.push(`${where}: @${name} needs "you|them [reason]"`);
      fx.push({ type: name, who: m[1], label: m[2].trim() });
      break;
    }
    case 'learn': {
      const bar = arg.indexOf('|');
      if (bar === -1) {
        fx.push({ type: 'learn', key: null, text: arg.trim() });
      } else {
        const key = arg.slice(0, bar).trim().toUpperCase();
        if (!/^[A-Z0-9_-]+$/.test(key)) return errors.push(`${where}: bad codeword "${key}"`);
        fx.push({ type: 'learn', key, text: arg.slice(bar + 1).trim() });
      }
      break;
    }
    case 'clock':
      section.clock = arg.trim();
      break;
    case 'position':
      section.position = arg.trim();
      break;
    case 'win':
    case 'lose':
      section.ending = { type: name, text: arg.trim() };
      break;
    case 'decision':
      section.ending = { type: 'decision', text: arg.trim() };
      break;
    default:
      errors.push(`${where}: unknown directive @${name}`);
  }
}

/** Parse one match file into its profile and sections. */
export function parseMatch(text, file = 'match.md') {
  const { meta, body } = parseFrontmatter(text);
  const errors = [];
  const sections = [];
  const preamble = [];
  let cur = null;
  let inFence = false;

  body.split('\n').forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    const head = !inFence && line.match(SECTION_RE);
    if (head) {
      cur = {
        id: head[2],
        title: head[1],
        file,
        lines: [],
        effects: [],
        choices: [],
        ending: null,
        clock: null,
        position: null,
      };
      sections.push(cur);
      return;
    }
    // ":::kind" opens a callout, a bare ":::" closes it. Directives and choices
    // inside a callout are treated as plain text.
    if (line.trim().startsWith(':::')) inFence = line.trim() === ':::' ? !inFence : true;
    if (!cur) {
      preamble.push(line);
      return;
    }
    if (!inFence) {
      const d = line.match(DIRECTIVE_RE);
      if (d) return parseDirective(d[1], d[2], cur, errors, where);
      const c = line.match(CHOICE_RE);
      if (c) {
        cur.choices.push({
          label: c[1],
          target: c[2],
          cond: c[4] ? { key: c[4].toUpperCase(), negate: c[3] === '!' } : null,
        });
        return;
      }
    }
    cur.lines.push(line);
  });

  for (const s of sections) {
    s.body = s.lines.join('\n').trim();
    delete s.lines;
    if (s.ending && s.choices.length) {
      errors.push(`${file}: section "${s.id}" is an ending but also has choices`);
    }
  }

  return {
    file,
    meta,
    intro: preamble.join('\n').trim(),
    start: meta.start || (sections[0] && sections[0].id),
    sections,
    errors,
  };
}

/**
 * Build a full pack from pack.md text and a { filename: text } map of match files.
 * Returns { id, meta, intro, matches[], sections: Map, errors[] }.
 */
export function buildPack(id, packText, matchTexts) {
  const { meta, body } = parseFrontmatter(packText);
  const errors = [];
  const files = Array.isArray(meta.matches) ? meta.matches : [];
  if (!files.length) errors.push('pack.md: front matter needs a "matches:" list');

  const sections = new Map();
  const matches = files.map((f, index) => {
    const text = matchTexts[f];
    if (text == null) {
      errors.push(`pack.md: match file "${f}" could not be loaded`);
      return null;
    }
    const m = parseMatch(text, f);
    m.index = index;
    errors.push(...m.errors);
    for (const s of m.sections) {
      if (sections.has(s.id)) errors.push(`${f}: duplicate section id "${s.id}"`);
      s.match = index;
      sections.set(s.id, s);
    }
    return m;
  }).filter(Boolean);

  return { id, meta, intro: body.trim(), matches, sections, errors };
}

/** Structural checks shared by the validator and the in-app debug view. */
export function lintPack(pack) {
  const problems = [...pack.errors];
  const learned = new Set();
  const required = new Set();

  for (const m of pack.matches) {
    if (!pack.sections.has(m.start)) problems.push(`${m.file}: start section "${m.start}" not found`);
    const reach = new Set();
    const stack = [m.start];
    while (stack.length) {
      const id = stack.pop();
      if (reach.has(id) || !pack.sections.has(id)) continue;
      reach.add(id);
      for (const c of pack.sections.get(id).choices) stack.push(c.target);
    }
    let wins = 0;
    for (const s of m.sections) {
      for (const fx of s.effects) if (fx.type === 'learn' && fx.key) learned.add(fx.key);
      for (const c of s.choices) {
        if (!pack.sections.has(c.target)) problems.push(`${m.file}: "${s.id}" links to missing "${c.target}"`);
        else if (pack.sections.get(c.target).match !== m.index) {
          problems.push(`${m.file}: "${s.id}" links into another match ("${c.target}")`);
        }
        if (c.cond) required.add(c.cond.key);
      }
      if (!s.ending && !s.choices.length) problems.push(`${m.file}: "${s.id}" is a dead end (no choices, no ending)`);
      if (s.ending && s.ending.type !== 'lose' && reach.has(s.id)) wins++;
      if (!reach.has(s.id)) problems.push(`${m.file}: "${s.id}" is unreachable from "${m.start}"`);
      const unconditional = s.choices.filter((c) => !c.cond || c.cond.negate);
      if (!s.ending && s.choices.length && !unconditional.length) {
        problems.push(`${m.file}: "${s.id}" only has codeword-gated choices; a first-time player is stuck`);
      }
    }
    if (!wins) problems.push(`${m.file}: no reachable way to win`);
  }
  for (const k of required) if (!learned.has(k)) problems.push(`codeword ${k} is required but never learned`);
  return problems;
}

/** Ending sections per match, used for "endings found" progress. */
export function endingsOf(match) {
  return match.sections.filter((s) => s.ending).map((s) => s.id);
}

/** A choice is visible when its codeword condition is satisfied. */
export function choiceVisible(choice, codewords) {
  if (!choice.cond) return true;
  const has = Object.prototype.hasOwnProperty.call(codewords, choice.cond.key);
  return choice.cond.negate ? !has : has;
}

/** IBJJF-style decision: points, then advantages, then fewer penalties. */
export function decide(score) {
  const y = score.you;
  const t = score.them;
  if (y.pts !== t.pts) return { win: y.pts > t.pts, by: 'points' };
  if (y.adv !== t.adv) return { win: y.adv > t.adv, by: 'advantages' };
  if (y.pen !== t.pen) return { win: y.pen < t.pen, by: 'penalties' };
  return { win: false, by: 'referee' };
}

export function emptyScore() {
  return { you: { pts: 0, adv: 0, pen: 0 }, them: { pts: 0, adv: 0, pen: 0 } };
}

export function applyScoreEffect(score, fx) {
  const side = score[fx.who];
  if (fx.type === 'points') side.pts = Math.max(0, side.pts + fx.value);
  if (fx.type === 'advantage') side.adv += 1;
  if (fx.type === 'penalty') side.pen += 1;
}

/** Deterministic PRNG so the printed book numbering is stable between prints. */
export function seededShuffle(arr, seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Map section id -> paragraph number for the printed book. Each match's start comes first in its block. */
export function bookNumbers(pack) {
  const nums = new Map();
  let n = 1;
  for (const m of pack.matches) {
    const rest = m.sections.map((s) => s.id).filter((id) => id !== m.start);
    for (const id of [m.start, ...seededShuffle(rest, pack.id + m.file)]) nums.set(id, n++);
  }
  return nums;
}
