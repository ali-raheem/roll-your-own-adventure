// Pack loading (bundled packs over fetch, imported packs from localStorage) and
// per-pack progress persistence. Every storage access is guarded: private
// windows and blocked storage must never break play.

import { buildPack, parseFrontmatter } from './parser.js';

// Historical prefix from when this was BJJ-only; changing it would orphan saved progress.
const PREFIX = 'bjjcyoa:';
const IMPORTED_KEY = PREFIX + 'imported';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** List of { id, path|imported, title, subtitle } for the pack picker. */
export async function listPacks() {
  let bundled = [];
  try {
    const res = await fetch('packs/index.json', { cache: 'no-cache' });
    bundled = (await res.json()).packs || [];
  } catch (e) {
    console.warn('Could not load packs/index.json', e);
  }
  const imported = Object.values(readJSON(IMPORTED_KEY, {})).map((p) => ({
    id: p.id,
    imported: true,
    title: p.title,
    subtitle: p.subtitle,
  }));
  return [...bundled, ...imported];
}

const cache = new Map();

export async function loadPack(entry) {
  if (cache.has(entry.id)) return cache.get(entry.id);
  let pack;
  if (entry.imported) {
    const saved = readJSON(IMPORTED_KEY, {})[entry.id];
    if (!saved) throw new Error(`Imported pack "${entry.id}" is missing`);
    pack = buildPack(entry.id, saved.pack, saved.matches);
  } else {
    const base = entry.path.endsWith('/') ? entry.path : entry.path + '/';
    const packText = await fetchText(base + 'pack.md');
    const { meta } = parseFrontmatter(packText);
    const files = Array.isArray(meta.matches) ? meta.matches : [];
    const texts = {};
    await Promise.all(files.map(async (f) => {
      try { texts[f] = await fetchText(base + f); } catch (e) { console.warn(e); }
    }));
    pack = buildPack(entry.id, packText, texts);
    pack.base = base;
  }
  pack.entry = entry;
  cache.set(entry.id, pack);
  return pack;
}

/** Warm the service worker cache with every bundled pack so the app works offline. */
export async function prefetchAll(entries) {
  for (const e of entries) {
    if (e.imported) continue;
    try { await loadPack(e); } catch { /* offline or broken pack: ignore */ }
  }
}

/**
 * Import a pack from user-selected files. Needs a pack.md whose `matches:`
 * list names the other selected files.
 */
export async function importPackFiles(fileList) {
  const files = Array.from(fileList);
  const byName = {};
  await Promise.all(files.map(async (f) => { byName[f.name] = await f.text(); }));
  const packText = byName['pack.md'];
  if (!packText) throw new Error('Select a pack.md together with its match files.');
  const { meta } = parseFrontmatter(packText);
  const id = 'import-' + (meta.id || meta.title || 'pack').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const matches = {};
  for (const f of meta.matches || []) {
    if (byName[f] == null) throw new Error(`pack.md lists "${f}" but it was not selected.`);
    matches[f] = byName[f];
  }
  const all = readJSON(IMPORTED_KEY, {});
  all[id] = { id, title: meta.title || id, subtitle: meta.subtitle || '', pack: packText, matches };
  if (!writeJSON(IMPORTED_KEY, all)) throw new Error('Browser storage is unavailable; cannot import.');
  cache.delete(id);
  return id;
}

export function removeImported(id) {
  const all = readJSON(IMPORTED_KEY, {});
  delete all[id];
  writeJSON(IMPORTED_KEY, all);
  cache.delete(id);
}

// ---- progress ------------------------------------------------------------

function blankProgress() {
  return {
    codewords: {},      // KEY -> note text (persist across attempts: that's the learning)
    notes: [],          // [{ match, key|null, text }] in the order learned
    endings: {},        // section id -> true
    attempts: {},       // match index -> count
    wins: {},           // match index -> true
    current: 0,         // match index the bracket is on
    medal: false,
    run: null,          // in-progress match (see app.js)
  };
}

export function loadProgress(packId) {
  return { ...blankProgress(), ...readJSON(PREFIX + 'progress:' + packId, {}) };
}

export function saveProgress(packId, progress) {
  writeJSON(PREFIX + 'progress:' + packId, progress);
}

export function resetProgress(packId) {
  try { localStorage.removeItem(PREFIX + 'progress:' + packId); } catch { /* ignore */ }
}

export function getPref(name, fallback) {
  return readJSON(PREFIX + 'pref:' + name, fallback);
}

export function setPref(name, value) {
  writeJSON(PREFIX + 'pref:' + name, value);
}
