// Adventure pack parser. Pure JS with no DOM access, so the browser app and the
// Node validator (tools/validate.mjs) share exactly the same rules.
//
// Pack layout:
//   packs/<id>/pack.md      front matter (title, matches: [...files]) + intro markdown
//   packs/<id>/<match>.md   front matter (opponent profile) + "## Title {#id}" sections
//   packs/<id>/techniques.md  optional technique library ("techniques:" in pack.md)
//
// See docs/WRITING_PACKS.md for the authoring format. The parser knows nothing
// about any particular sport: score directives become generic effects whose
// counter names the pack's sport resolves (js/sports/).

import { resolveSport } from './sports/index.js';

const SECTION_RE = /^##\s+(.*?)\s*\{#([A-Za-z0-9_-]+)\}\s*$/;
const CHOICE_RE = /^[-*]\s+\[(.+?)\]\(#([A-Za-z0-9_-]+)\)\s*(?:\{if\s+(!?)([A-Za-z0-9_-]+)\})?\s*$/;
const DIRECTIVE_RE = /^@([a-z]+)\b\s*(.*)$/;
const LINK_RE = /^[-*]\s+\[(.+?)\]\((https?:\/\/[^)\s]+)\)\s*$/;
// [[ref]] or [[ref|shown text]] links to an entry in the pack's technique library.
export const TECH_REF_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

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
    // @score you|them <counter> <n> [reason] is the general form; @points,
    // @advantage and @penalty are shorthands for the sport's counter of that role.
    case 'score': {
      const m = arg.match(/^(you|them)\s+([A-Za-z][\w-]*)\s+(-?\d+)\s*(.*)$/);
      if (!m) return errors.push(`${where}: @score needs "you|them <counter> <n> [reason]"`);
      fx.push({ type: 'score', who: m[1], name: m[2].toLowerCase(), value: Number(m[3]), label: m[4].trim(), where });
      break;
    }
    case 'points': {
      const m = arg.match(/^(you|them)\s+(-?\d+)\s*(.*)$/);
      if (!m) return errors.push(`${where}: @points needs "you|them <n> [reason]"`);
      fx.push({ type: 'score', who: m[1], name: 'points', value: Number(m[2]), label: m[3].trim(), where });
      break;
    }
    case 'advantage':
    case 'penalty': {
      const m = arg.match(/^(you|them)\s*(.*)$/);
      if (!m) return errors.push(`${where}: @${name} needs "you|them [reason]"`);
      fx.push({ type: 'score', who: m[1], name, value: 1, label: m[2].trim(), where });
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
    case 'clock': {
      // "@clock 3:00 reset" starts a new period: the clock may go back up.
      const m = arg.trim().match(/^(\S+)(\s+reset)?$/);
      section.clock = m ? m[1] : arg.trim();
      section.clockReset = !!(m && m[2]);
      break;
    }
    case 'position':
      if (arg.includes('[[')) errors.push(`${where}: technique links ([[...]]) don't work in @${name}`);
      section.position = arg.trim();
      break;
    case 'win':
    case 'lose':
      if (arg.includes('[[')) errors.push(`${where}: technique links ([[...]]) don't work in @${name}`);
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
        clockReset: false,
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
        // Choices are buttons, so a technique link in a label shows as plain text.
        cur.choices.push({
          label: c[1].replace(TECH_REF_RE, (_, ref, text) => text || ref),
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

/** Every file a pack folder needs besides pack.md: its matches, then its technique library. */
export function packFiles(meta) {
  return [...(Array.isArray(meta.matches) ? meta.matches : []), ...(meta.techniques ? [meta.techniques] : [])];
}

/** Technique ids and lookups ignore case, accents and punctuation: "Seoi nage" finds seoi-nage. */
export function techniqueKey(s) {
  return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Parse a technique library: "## Name {#id}" entries, each with optional
 * "@also alias, alias" lines, a markdown description and "- [Label](https://...)"
 * links (the first is the main one). Text before the first entry is the intro.
 */
export function parseTechniques(text, file = 'techniques.md') {
  const errors = [];
  const list = [];
  const preamble = [];
  let cur = null;
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    const head = line.match(SECTION_RE);
    if (head) {
      cur = { id: techniqueKey(head[2]), title: head[1], aliases: [], links: [], lines: [], where };
      list.push(cur);
      return;
    }
    if (!cur) return preamble.push(line);
    const also = line.match(/^@also\s+(.*)$/);
    if (also) {
      // Names that only repeat the id or title add nothing to look up or show.
      const same = new Set([cur.id, techniqueKey(cur.title), ...cur.aliases.map(techniqueKey)]);
      for (const a of also[1].split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!same.has(techniqueKey(a))) { same.add(techniqueKey(a)); cur.aliases.push(a); }
      }
      return;
    }
    if (DIRECTIVE_RE.test(line)) return errors.push(`${where}: only @also works in a technique entry`);
    const link = line.match(LINK_RE);
    if (link) return cur.links.push({ label: link[1], url: link[2] });
    cur.lines.push(line);
  });
  for (const t of list) {
    t.description = t.lines.join('\n').trim();
    delete t.lines;
    if (!t.links.length) errors.push(`${t.where}: technique "${t.id}" has no links`);
  }
  return { intro: preamble.join('\n').trim(), list, errors };
}

/** Find a technique by id, title or alias; null if the pack has none by that name. */
export function findTechnique(pack, ref) {
  const id = pack.techniques.index.get(techniqueKey(ref));
  return id ? pack.techniques.byId.get(id) : null;
}

function buildTechniques(meta, texts, errors) {
  const lib = { intro: '', list: [], byId: new Map(), index: new Map() };
  if (!meta.techniques) return lib;
  const text = texts[meta.techniques];
  if (text == null) {
    errors.push(`pack.md: technique file "${meta.techniques}" could not be loaded`);
    return lib;
  }
  const parsed = parseTechniques(text, meta.techniques);
  errors.push(...parsed.errors);
  lib.intro = parsed.intro;
  lib.list = parsed.list;
  for (const t of parsed.list) {
    if (lib.byId.has(t.id)) errors.push(`${t.where}: duplicate technique "${t.id}"`);
    lib.byId.set(t.id, t);
  }
  for (const t of parsed.list) {
    for (const name of [t.id, t.title, ...t.aliases]) {
      const k = techniqueKey(name);
      const prev = lib.index.get(k);
      if (prev && prev !== t.id) errors.push(`${t.where}: "${name}" already names technique "${prev}"`);
      else lib.index.set(k, t.id);
    }
  }
  return lib;
}

/** Every [[ref]] in the pack's text must name a technique in its library. */
function checkTechniqueRefs(pack, sources, errors) {
  for (const [file, text] of sources) {
    text.split('\n').forEach((line, i) => {
      for (const [, ref] of line.matchAll(TECH_REF_RE)) {
        if (!findTechnique(pack, ref)) {
          errors.push(`${file}:${i + 1}: technique "${ref}" is not in the technique library` +
            (pack.meta.techniques ? '' : ' (pack.md has no "techniques:" file)'));
        }
      }
    });
  }
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

  // Resolve every score effect to one of the sport's counters.
  const sport = resolveSport(meta);
  errors.push(...sport.errors);
  for (const s of sections.values()) {
    for (const fx of s.effects) {
      if (fx.type !== 'score') continue;
      fx.counter = sport.counterFor(fx.name);
      if (!fx.counter) errors.push(`${fx.where}: ${sport.name} has no "${fx.name}" counter (has: ${sport.board.join(', ')})`);
    }
  }

  const pack = { id, meta, sport, intro: body.trim(), matches, sections, errors };
  pack.techniques = buildTechniques(meta, matchTexts, errors);
  checkTechniqueRefs(pack, [['pack.md', packText], ...files.filter((f) => matchTexts[f] != null).map((f) => [f, matchTexts[f]])], errors);
  return pack;
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
    // Sports with end rules (first to 15, a big lead...) can be won by scoring.
    const winsByRule = pack.sport && pack.sport.rules().length > 0 &&
      m.sections.some((s) => reach.has(s.id) && s.effects.some((f) => f.type === 'score' && f.who === 'you' && f.value > 0));
    if (!wins && !winsByRule) problems.push(`${m.file}: no reachable way to win`);
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
