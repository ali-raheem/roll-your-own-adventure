// Small, dependency-free markdown renderer covering what adventure packs need:
// paragraphs, ### headings, **bold**, *italic*, `code`, lists, > quotes, ---,
// and ":::kind Optional title" callout blocks. All author text is HTML-escaped.

const CALLOUT_TITLES = {
  coach: "Coach's corner",
  rule: 'Rulebook',
  note: 'Mat note',
  danger: 'Danger',
  scout: 'Scouting',
};

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_(?!\s)(.+?)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/ -- /g, ' &ndash; ');
}

export function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  const isBlockStart = (l) =>
    /^\s*$/.test(l) || /^#{1,6}\s/.test(l) || /^:::/.test(l.trim()) || /^>\s?/.test(l) ||
    /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l) || /^---+\s*$/.test(l);

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) { i++; continue; }

    if (t.startsWith(':::') && t !== ':::') {
      const [, kind = 'note', title = ''] = t.match(/^:::\s*([a-z]+)?\s*(.*)$/) || [];
      const inner = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') inner.push(lines[i++]);
      i++;
      const label = title || CALLOUT_TITLES[kind] || kind;
      out.push(
        `<aside class="callout callout-${escapeHtml(kind)}"><div class="callout-title">${inline(label)}</div>` +
        renderMarkdown(inner.join('\n')) + '</aside>'
      );
      continue;
    }

    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(6, h[1].length + 1);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^---+$/.test(t)) { out.push('<hr>'); i++; continue; }

    if (/^>\s?/.test(t)) {
      const inner = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) inner.push(lines[i++].trim().replace(/^>\s?/, ''));
      out.push(`<blockquote>${renderMarkdown(inner.join('\n'))}</blockquote>`);
      continue;
    }

    const ordered = /^\d+\.\s+/.test(t);
    if (ordered || /^[-*]\s+/.test(t)) {
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items = [];
      while (i < lines.length && re.test(lines[i].trim())) {
        let item = lines[i++].trim().replace(re, '');
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !re.test(lines[i].trim())) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    const para = [];
    while (i < lines.length && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
