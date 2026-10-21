// What the page looks like to a model that reads structure, not pixels.
const esc = (s) => String(s == null ? '' : s);

export function renderAgentView(p, opts = {}) {
  const maxLinks = opts.maxLinks ?? 40;
  const maxText = opts.maxText ?? 2600;
  const lines = [];
  const push = (depth, text) => lines.push('  '.repeat(depth) + text);

  push(0, `url: ${p.url}`);
  push(0, `title: ${p.title || '(none)'}`);
  if (p.description) push(0, `description: ${p.description}`);
  push(0, `lang: ${p.lang || '(unset)'}  headings: ${p.headings.length}  links: ${p.links.length}  forms: ${p.forms.length}  images: ${p.images.length}`);
  push(0, '');

  const lm = p.landmarks;
  if (lm.header) push(0, '[header]');
  if (lm.nav) {
    push(0, '[nav]');
    for (const l of p.links.slice(0, 8)) push(1, `- link "${l.label || l.text || '(unlabeled)'}" -> ${short(l.abs || l.href)}`);
    if (p.links.length > 8) push(1, `- … ${p.links.length - 8} more links`);
  }
  push(0, '[main]');

  let budget = maxText;
  let usedHeadings = new Set();
  for (const h of p.headings.slice(0, 14)) {
    push(1, `${'#'.repeat(Math.min(6, h.level))} ${h.text}`);
    usedHeadings.add(h.text);
  }

  if (p.mainText) {
    const body = p.mainText.slice(0, budget);
    budget -= body.length;
    for (const para of wrap(body, 78)) push(1, para);
    if (p.mainText.length > body.length) push(1, '…');
  }

  for (const f of p.forms.slice(0, 3)) {
    push(1, `[form] action=${f.action || '(self)'} method=${f.method}`);
    for (const fld of p.fields.slice(0, 8)) {
      push(2, `- input type=${fld.type} name="${fld.name || ''}" label="${fld.label || '(none)'}"${fld.required ? ' required' : ''}`);
    }
  }
  if (p.buttons.length) {
    push(1, `[buttons] ${p.buttons.slice(0, 10).map((b) => `"${b.text}"`).join(' ')}`);
  }
  if (p.images.length) {
    const missing = p.images.filter((i) => !i.alt).length;
    push(1, `[images] ${p.images.length} total, ${missing} with no alt text`);
    for (const im of p.images.filter((i) => !i.alt).slice(0, 4)) push(2, `- img src="${short(im.src)}" alt=(empty)`);
  }
  if (lm.footer) push(0, '[footer]');
  if (p.jsonld.length) push(0, `[json-ld] ${p.jsonld.flatMap((x) => x.types).slice(0, 6).join(', ') || 'untyped'}`);

  return lines.join('\n');
}

function short(u, n = 46) {
  if (!u) return '';
  const s = String(u).replace(/^https?:\/\/(www\.)?/, '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function wrap(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) line = w;
    else if ((line + ' ' + w).length <= width) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
    }
    if (lines.length > 40) break;
  }
  if (line) lines.push(line);
  return lines.slice(0, 40);
}

// One-line summary an agent would keep if it only had 140 characters.
export function tlDr(p, scored) {
  const problems = scored.fails.slice(0, 2).map((f) => f.title.toLowerCase());
  return `${p.host} scores ${scored.score}/100 for agents. ${problems.length ? 'Blockers: ' + problems.join('; ') + '.' : 'No blockers found.'}`;
}
