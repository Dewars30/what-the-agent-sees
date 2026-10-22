// Markup fix kit. Uses the real scorer as-is. Does not invent facts.
import { parseHtml, textOf, elementsOf, decodeEntities } from './core/parse.mjs';
import { extractModel } from './core/extract.mjs';
import { scorePage } from './core/score.mjs';

const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAWTEXT = new Set('script style noscript template svg canvas iframe video audio picture object map'.split(' '));

// Same list as core/aux.mjs. A suggested "Allow: /" marks each of these allowed.
const AI_AGENTS = [
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'claudebot', 'claude-web', 'anthropic-ai',
  'perplexitybot', 'google-extended', 'ccbot', 'bytespider', 'applebot-extended',
  'meta-externalagent', 'amazonbot', 'cohere-ai', 'youbot', 'timpibot',
];

const ALT_MAX = 120;

function clean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function clip(s, n = ALT_MAX) {
  const t = clean(s);
  return t.length <= n ? t : t.slice(0, n).trimEnd();
}

function htmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function attrEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function parseAttrs(raw) {
  const attrs = Object.create(null);
  if (!raw) return attrs;
  const re = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (name === '/' || name === '') continue;
    const val = m[2] ?? m[3] ?? m[4] ?? '';
    if (!(name in attrs)) attrs[name] = decodeEntities(val);
  }
  return attrs;
}

function preorder(root) {
  const out = [];
  const walk = (n) => {
    for (const c of n.children) {
      if (!c || c.tag === '#text') continue;
      out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}

// Tag spans in the same order parseHtml emits elements. picture/svg/script stay raw.
function scanSpans(html) {
  const spans = [];
  const stack = [];
  const len = html.length;
  let i = 0;
  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    if (html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      i = end === -1 ? len : end + 3;
      continue;
    }
    if (html.startsWith('<!', lt) || html.startsWith('<?', lt)) {
      const end = html.indexOf('>', lt);
      i = end === -1 ? len : end + 1;
      continue;
    }
    if (html[lt + 1] === '/') {
      const end = html.indexOf('>', lt);
      const tag = html.slice(lt + 2, end === -1 ? len : end).trim().toLowerCase().split(/\s/)[0];
      const closeStart = lt;
      const closeEnd = end === -1 ? len : end + 1;
      i = closeEnd;
      for (let s = stack.length - 1; s >= 0; s--) {
        if (stack[s].tag === tag) {
          stack[s].sourceCloseStart = closeStart;
          stack[s].sourceEnd = closeEnd;
          stack.length = s;
          break;
        }
      }
      continue;
    }
    let j = lt + 1;
    let quote = null;
    while (j < len) {
      const ch = html[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
      j++;
    }
    const inner = html.slice(lt + 1, j);
    const openEnd = j < len ? j + 1 : len;
    i = openEnd;
    const m = /^([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)$/.exec(inner);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    const span = {
      tag,
      attrs: parseAttrs(m[2]),
      sourceStart: lt,
      sourceOpenEnd: openEnd,
      sourceCloseStart: undefined,
      sourceEnd: openEnd,
    };
    spans.push(span);
    if (RAWTEXT.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = html.slice(i);
      const found = close.exec(rest);
      if (found) {
        span.sourceCloseStart = i + found.index;
        span.sourceEnd = i + found.index + found[0].length;
        i = span.sourceEnd;
      } else {
        i = len;
        span.sourceEnd = len;
      }
      continue;
    }
    if (VOID.has(tag) || inner.trim().endsWith('/')) continue;
    stack.push(span);
  }
  return spans;
}

export function countTags(html, tag) {
  const want = String(tag || '').toLowerCase();
  return scanSpans(html).filter((s) => s.tag === want).length;
}

function attachSources(html) {
  const tree = parseHtml(html);
  const nodes = preorder(tree);
  const spans = scanSpans(html);
  if (nodes.length !== spans.length) {
    throw new Error(`fix kit tag count ${nodes.length} vs ${spans.length}`);
  }
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].tag !== spans[i].tag) {
      throw new Error(`fix kit tag mismatch at ${i}: ${nodes[i].tag} vs ${spans[i].tag}`);
    }
    nodes[i].sourceStart = spans[i].sourceStart;
    nodes[i].sourceOpenEnd = spans[i].sourceOpenEnd;
    nodes[i].sourceCloseStart = spans[i].sourceCloseStart;
    nodes[i].sourceEnd = spans[i].sourceEnd;
  }
  return tree;
}

function upsertAttr(open, name, value) {
  if (!open || !open.includes('>')) return open;
  const esc = attrEscape(value);
  const re = new RegExp(`(^|\\s)(${name})\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+)`, 'i');
  if (re.test(open)) return open.replace(re, `$1$2="${esc}"`);
  if (/\/\s*>$/.test(open)) return open.replace(/\/\s*>$/, ` ${name}="${esc}" />`);
  return open.replace(/>$/, ` ${name}="${esc}">`);
}

function fragmentUrl(pageUrl, text) {
  let u;
  try {
    u = new URL(pageUrl);
  } catch {
    return pageUrl;
  }
  const frag = clean(text).slice(0, 60);
  if (!frag) return u.toString();
  u.hash = ':~:text=' + encodeURIComponent(frag);
  return u.toString();
}

function cssIdent(s) {
  return String(s || '').replace(/[^A-Za-z0-9_-]/g, '');
}

function explicitDecorative(el) {
  const role = clean(el.attrs.role).toLowerCase();
  if (role === 'presentation' || role === 'none') return true;
  return clean(el.attrs['aria-hidden']).toLowerCase() === 'true';
}

function figcaptionText(el) {
  let p = el.parent;
  while (p) {
    if (p.tag === 'figure') {
      const cap = elementsOf(p, ['figcaption'])[0];
      return cap ? clip(textOf(cap)) : '';
    }
    p = p.parent;
  }
  return '';
}

function linkText(el) {
  let p = el.parent;
  while (p) {
    if (p.tag === 'a') return clip(textOf(p));
    p = p.parent;
  }
  return '';
}

function nearbyAlt(el, heading) {
  const cap = figcaptionText(el);
  if (cap) return { text: cap, from: 'figcaption' };
  const link = linkText(el);
  if (link) return { text: link, from: 'link' };
  if (heading) return { text: clip(heading), from: 'heading' };
  return null;
}

function imgSelector(el) {
  const src = el.attrs.src || '';
  if (src && src.length <= 120 && !/["'\\<>]/.test(src)) return `img[src="${src}"]`;
  if (src && !/["'\\<>]/.test(src.slice(0, 40))) return `img[src^="${src.slice(0, 40)}"]`;
  const id = cssIdent(el.attrs.id);
  if (id) return `img#${id}`;
  return 'img';
}

function fieldSelector(el) {
  const id = cssIdent(el.attrs.id);
  if (id) return `${el.tag}#${id}`;
  const name = el.attrs.name || '';
  if (name && !/["'\\<>]/.test(name)) return `${el.tag}[name="${name}"]`;
  return el.tag;
}

function isSkippableControl(el) {
  if (el.tag !== 'input' && el.tag !== 'textarea' && el.tag !== 'select') return true;
  const type = (el.attrs.type || (el.tag === 'textarea' ? 'textarea' : el.tag === 'select' ? 'select' : 'text')).toLowerCase();
  return ['hidden', 'submit', 'button', 'reset', 'image'].includes(type);
}

function existingFieldLabel(el, labelsFor) {
  const id = el.attrs.id;
  if (id && labelsFor.get(id)) return labelsFor.get(id);
  let p = el.parent;
  while (p) {
    if (p.tag === 'label') return clean(textOf(p));
    p = p.parent;
  }
  return clean(el.attrs['aria-label'] || '');
}

function labelMap(root) {
  const labelsFor = new Map();
  for (const l of elementsOf(root, ['label'])) {
    const forId = l.attrs.for;
    const text = clean(textOf(l));
    if (forId && text) labelsFor.set(forId, text);
  }
  return labelsFor;
}

function metaContent(root, key) {
  const want = key.toLowerCase();
  for (const m of elementsOf(root, ['meta'])) {
    const name = (m.attrs.name || m.attrs.property || m.attrs.itemprop || '').toLowerCase();
    if (name !== want) continue;
    const content = clean(m.attrs.content);
    if (content) return content;
  }
  return '';
}

function jsonTypes(model) {
  return new Set(model.jsonld.flatMap((x) => x.types).map((t) => t.toLowerCase()));
}

function shortName(s) {
  const t = clean(s);
  if (!t || t.length > 80) return '';
  return t;
}

function orgName(root, model) {
  return shortName(metaContent(root, 'og:site_name'))
    || shortName(metaContent(root, 'application-name'))
    || shortName(model.headings.find((h) => h.level === 1)?.text || '')
    || shortName(model.title);
}

function crumbName(model) {
  const h1 = model.headings.find((h) => h.level === 1)?.text || '';
  return clip(h1 || model.title || '');
}

function factUrl(model) {
  if (/^https?:\/\//i.test(model.canonical || '')) return model.canonical;
  return model.url;
}

function jsonScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

function buildJsonLd(root, model) {
  const types = jsonTypes(model);
  const url = factUrl(model);
  const nodes = [];
  const name = orgName(root, model);
  if (name && !types.has('organization')) {
    const org = { '@type': 'Organization', name, url };
    if (model.description) org.description = model.description;
    nodes.push(org);
  }
  const crumb = crumbName(model);
  if (crumb && !types.has('breadcrumblist')) {
    nodes.push({
      '@type': 'BreadcrumbList',
      itemListElement: [{ '@type': 'ListItem', position: 1, name: crumb, item: url }],
    });
  }
  if (!nodes.length) return null;
  if (nodes.length === 1) return { '@context': 'https://schema.org', ...nodes[0] };
  return { '@context': 'https://schema.org', '@graph': nodes };
}

function internalLinks(model, limit) {
  const out = [];
  const seen = new Set();
  for (const l of model.links) {
    if (!l.abs || l.external || !clean(l.text)) continue;
    if (/^(javascript|mailto|tel):/i.test(l.href || '')) continue;
    if (/["'<>]/.test(l.href) || /["'<>]/.test(l.text)) continue;
    const key = l.href + '\n' + l.text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

function suggestRobots(extras) {
  if (extras && extras.robots) return null;
  return 'User-agent: *\nAllow: /\n';
}

function suggestLlms(model, extras) {
  if (extras && extras.llmsTxt) return null;
  const title = model.headings.find((h) => h.level === 1)?.text || model.title;
  const links = internalLinks(model, 12);
  if (!title && !model.description && !links.length) return null;
  const lines = [];
  if (title) lines.push(`# ${title}`);
  if (model.description) lines.push('', `> ${model.description}`);
  if (links.length) {
    lines.push('', '## Links');
    for (const l of links) lines.push(`- [${l.text}](${l.abs})`);
  }
  return lines.join('\n').trim() + '\n';
}

function extrasWithFiles(extras, suggestions) {
  const next = {
    robots: extras?.robots || null,
    sitemap: Boolean(extras?.sitemap),
    llmsTxt: Boolean(extras?.llmsTxt),
    llmsFull: Boolean(extras?.llmsFull),
    agents: extras?.agents || {},
  };
  if (suggestions.robots && !extras?.robots) {
    const agents = {};
    for (const a of AI_AGENTS) agents[a] = 'allowed';
    next.robots = { groups: 1, agents };
    next.agents = agents;
  }
  if (suggestions.llms && !extras?.llmsTxt && suggestions.llms.trim().length > 20) next.llmsTxt = true;
  return next;
}

function publicScore(scored) {
  return {
    score: scored.score,
    grade: scored.grade,
    verdict: scored.verdict,
    dims: scored.dims.map((d) => ({ key: d.key, label: d.label, weight: d.weight, score: d.score, points: d.points })),
  };
}

function dimDeltas(before, after) {
  return before.dims.map((d) => {
    const a = after.dims.find((x) => x.key === d.key);
    const afterScore = a ? a.score : d.score;
    return { key: d.key, label: d.label, before: d.score, after: afterScore, delta: afterScore - d.score };
  });
}

function spliceOpen(html, el, nextOpen) {
  return html.slice(0, el.sourceStart) + nextOpen + html.slice(el.sourceOpenEnd);
}

function findImg(html, index) {
  const doc = attachSources(html);
  const imgs = elementsOf(doc, ['img']);
  return { doc, el: imgs[index] || null };
}

function findField(html, index) {
  const doc = attachSources(html);
  const fields = elementsOf(doc, ['input', 'textarea', 'select']).filter((el) => !isSkippableControl(el));
  return { doc, el: fields[index] || null, labelsFor: labelMap(doc) };
}

function qualifyingHeader(doc) {
  if (elementsOf(doc, ['nav']).length) return null;
  for (const header of elementsOf(doc, ['header'])) {
    if (!elementsOf(header, ['a']).length) continue;
    if (elementsOf(header, ['nav']).length) continue;
    if (elementsOf(header, ['main']).length) continue;
    if (header.sourceCloseStart == null) continue;
    return header;
  }
  return null;
}

function applyDescribed(fix, html) {
  if (fix.kind === 'alt' || fix.kind === 'decorative') {
    const { el } = findImg(html, fix.index);
    if (!el || explicitDecorative(el)) return html;
    const current = clean(el.attrs.alt);
    if (current) return html;
    let open = html.slice(el.sourceStart, el.sourceOpenEnd);
    if (fix.kind === 'alt') open = upsertAttr(open, 'alt', fix.alt);
    else {
      open = upsertAttr(open, 'alt', '');
      if (!clean(el.attrs.role)) open = upsertAttr(open, 'role', 'presentation');
    }
    return spliceOpen(html, el, open);
  }
  if (fix.kind === 'nav') {
    const doc = attachSources(html);
    const header = qualifyingHeader(doc);
    if (!header) return html;
    return html.slice(0, header.sourceOpenEnd) + '<nav>' + html.slice(header.sourceOpenEnd, header.sourceCloseStart) + '</nav>' + html.slice(header.sourceCloseStart);
  }
  if (fix.kind === 'jsonld') {
    const doc = attachSources(html);
    const head = elementsOf(doc, ['head'])[0];
    if (!head || head.sourceCloseStart == null) return html;
    const model = extractModel(html, fix.pageUrl);
    const data = buildJsonLd(doc, model);
    if (!data) return html;
    const block = jsonScript(data);
    return html.slice(0, head.sourceCloseStart) + block + html.slice(head.sourceCloseStart);
  }
  if (fix.kind === 'label') {
    const { doc, el, labelsFor } = findField(html, fix.index);
    if (!el) return html;
    if (existingFieldLabel(el, labelsFor)) return html;
    const text = clean(el.attrs.placeholder) || clean(el.attrs.name);
    if (!text || text !== fix.labelText) return html;
    let id = el.attrs.id || '';
    let open = html.slice(el.sourceStart, el.sourceOpenEnd);
    if (!id || !/^[A-Za-z][\w:.-]*$/.test(id)) {
      const ids = new Set();
      for (const node of preorder(doc)) if (node.attrs && node.attrs.id) ids.add(node.attrs.id);
      let n = fix.slot;
      do {
        id = `agentscore-f-${n}`;
        n += 1;
      } while (ids.has(id));
      open = upsertAttr(open, 'id', id);
    }
    const label = `<label for="${attrEscape(id)}">${htmlEscape(text)}</label>`;
    return html.slice(0, el.sourceStart) + label + open + html.slice(el.sourceOpenEnd);
  }
  if (fix.kind === 'noscript') {
    const model = extractModel(html, fix.pageUrl);
    if (clean(model.noscript)) return html;
    const doc = attachSources(html);
    const body = elementsOf(doc, ['body'])[0];
    if (!body) return html;
    return html.slice(0, body.sourceOpenEnd) + fix.block + html.slice(body.sourceOpenEnd);
  }
  return html;
}

function snippet(s) {
  const t = String(s || '');
  return t.length <= 700 ? t : t.slice(0, 700);
}

export function buildFix(html, pageUrl, extras = {}) {
  const source = String(html || '');
  const beforeModel = extractModel(source, pageUrl);
  const before = publicScore(scorePage(beforeModel, extras));
  const scoreHtml = (body) => publicScore(scorePage(extractModel(body, pageUrl), extras));

  const doc = attachSources(source);
  const fixes = [];
  const notes = [];
  let heading = '';
  const imgs = elementsOf(doc, ['img']);
  const imgIndex = new Map(imgs.map((el, i) => [el, i]));

  for (const el of preorder(doc)) {
    if (/^h[1-6]$/.test(el.tag)) {
      const t = clip(textOf(el));
      if (t) heading = t;
    }
    if (el.tag !== 'img') continue;
    const alt = clean(el.attrs.alt);
    if (alt) continue;
    const index = imgIndex.get(el);
    const selector = imgSelector(el);
    if (explicitDecorative(el)) {
      notes.push({
        kind: 'decorative',
        title: 'Decorative image left unchanged',
        explanation: 'This image is marked presentation or aria-hidden. No alt text was invented.',
        points: 0,
        selector,
        openUrl: fragmentUrl(pageUrl, heading),
      });
      continue;
    }
    const near = nearbyAlt(el, heading);
    const open = source.slice(el.sourceStart, el.sourceOpenEnd);
    if (!near) {
      const draft = {
        kind: 'decorative',
        index,
        title: 'Image flagged decorative',
        explanation: 'No figcaption, link text, or earlier heading. Marked with empty alt and role=presentation. Empty alt still scores as missing. No description was invented.',
        selector,
        openUrl: fragmentUrl(pageUrl, el.attrs.src ? '' : heading),
        beforeSnippet: snippet(open),
      };
      const patched = applyDescribed(draft, source);
      const afterOpen = patched === source ? open : snippet(patched.slice(el.sourceStart, el.sourceStart + open.length + 40));
      draft.afterSnippet = patched === source ? open : snippet(findImg(patched, index).el ? patched.slice(findImg(patched, index).el.sourceStart, findImg(patched, index).el.sourceOpenEnd) : afterOpen);
      draft.points = scoreHtml(patched).score - before.score;
      fixes.push(draft);
      continue;
    }
    const fromWord = near.from === 'figcaption' ? 'figcaption' : near.from === 'link' ? 'link text' : 'heading';
    const draft = {
      kind: 'alt',
      index,
      alt: near.text,
      title: `Alt from ${fromWord}`,
      explanation: `Alt set to text already on the page (${fromWord}): ${near.text}`,
      selector,
      openUrl: fragmentUrl(pageUrl, near.text),
      beforeSnippet: snippet(open),
    };
    const patched = applyDescribed(draft, source);
    const located = findImg(patched, index).el;
    draft.afterSnippet = located ? snippet(patched.slice(located.sourceStart, located.sourceOpenEnd)) : snippet(open);
    draft.points = scoreHtml(patched).score - before.score;
    fixes.push(draft);
  }

  const header = qualifyingHeader(doc);
  if (header) {
    const open = source.slice(header.sourceStart, header.sourceOpenEnd);
    const link = elementsOf(header, ['a']).map((a) => clean(textOf(a))).find(Boolean) || '';
    const draft = {
      kind: 'nav',
      title: 'Wrap header links in nav',
      explanation: 'The first header that has links and no nav or main is wrapped in <nav>. No links were added.',
      selector: header.attrs.id ? `header#${cssIdent(header.attrs.id)}` : 'header',
      openUrl: fragmentUrl(pageUrl, link),
      beforeSnippet: snippet(open),
    };
    const patched = applyDescribed(draft, source);
    draft.afterSnippet = snippet(open + '<nav>');
    draft.points = scoreHtml(patched).score - before.score;
    fixes.push(draft);
  }

  const head = elementsOf(doc, ['head'])[0];
  const ld = buildJsonLd(doc, beforeModel);
  if (head && head.sourceCloseStart != null && ld) {
    const block = jsonScript(ld);
    const names = [].concat(ld['@type'] || (ld['@graph'] || []).map((n) => n['@type'])).filter(Boolean);
    const draft = {
      kind: 'jsonld',
      pageUrl,
      title: 'JSON-LD from page facts',
      explanation: `Added ${names.join(' and ')} using the page name, URL, and description already on the page. No parent path was invented.`,
      selector: 'script[type="application/ld+json"]',
      openUrl: fragmentUrl(pageUrl, crumbName(beforeModel) || orgName(doc, beforeModel)),
      beforeSnippet: '(no JSON-LD block for the missing type)',
      afterSnippet: snippet(block),
    };
    const patched = applyDescribed(draft, source);
    draft.points = scoreHtml(patched).score - before.score;
    fixes.push(draft);
  }

  const fields = elementsOf(doc, ['input', 'textarea', 'select']).filter((el) => !isSkippableControl(el));
  const labelsFor = labelMap(doc);
  fields.forEach((el, index) => {
    if (existingFieldLabel(el, labelsFor)) return;
    const labelText = clean(el.attrs.placeholder) || clean(el.attrs.name);
    if (!labelText) return;
    const open = source.slice(el.sourceStart, el.sourceOpenEnd);
    const from = clean(el.attrs.placeholder) ? 'placeholder' : 'name';
    const draft = {
      kind: 'label',
      index,
      slot: index + 1,
      labelText,
      title: `Label from ${from}`,
      explanation: `Label text is the ${from} already on the control: ${labelText}`,
      selector: fieldSelector(el),
      openUrl: fragmentUrl(pageUrl, labelText),
      beforeSnippet: snippet(open),
    };
    const patched = applyDescribed(draft, source);
    const located = findField(patched, index).el;
    const start = located ? located.sourceStart : el.sourceStart;
    draft.afterSnippet = snippet(patched.slice(Math.max(0, start - (labelText.length + 40)), located ? located.sourceOpenEnd : start + open.length));
    draft.points = scoreHtml(patched).score - before.score;
    fixes.push(draft);
  });

  if (!clean(beforeModel.noscript)) {
    const lead = beforeModel.description || beforeModel.title || '';
    const links = internalLinks(beforeModel, 6);
    if (lead || links.length) {
      const parts = ['<noscript>'];
      if (lead) parts.push(`<p>${htmlEscape(lead)}</p>`);
      if (links.length) {
        parts.push('<ul>');
        for (const l of links) parts.push(`<li><a href="${attrEscape(l.href)}">${htmlEscape(clean(l.text))}</a></li>`);
        parts.push('</ul>');
      }
      parts.push('</noscript>');
      const block = parts.join('');
      const draft = {
        kind: 'noscript',
        pageUrl,
        block,
        title: 'Noscript fallback',
        explanation: 'Fallback uses the meta description or title, plus internal links already on the page.',
        selector: 'noscript',
        openUrl: fragmentUrl(pageUrl, lead || links[0]?.text || ''),
        beforeSnippet: '(no noscript text)',
        afterSnippet: snippet(block),
      };
      const patched = applyDescribed(draft, source);
      draft.points = scoreHtml(patched).score - before.score;
      fixes.push(draft);
    }
  }

  fixes.sort((a, b) => b.points - a.points || String(a.title).localeCompare(String(b.title)) || (a.index || 0) - (b.index || 0));

  let current = source;
  let currentScore = before.score;
  const applied = [];
  for (const fix of fixes) {
    let next;
    try {
      next = applyDescribed(fix, current);
    } catch {
      continue;
    }
    if (next === current) continue;
    const scored = scoreHtml(next);
    if (scored.score < currentScore) continue;
    current = next;
    currentScore = scored.score;
    applied.push(fix);
  }

  const after = scoreHtml(current);
  const suggestions = {
    robots: suggestRobots(extras),
    llms: suggestLlms(beforeModel, extras),
  };
  let withFiles = null;
  if (suggestions.robots || suggestions.llms) {
    withFiles = publicScore(scorePage(extractModel(current, pageUrl), extrasWithFiles(extras, suggestions)));
  }

  return {
    url: pageUrl,
    before,
    after,
    deltas: dimDeltas(before, after),
    withFiles,
    patchedHtml: current,
    fixes: applied,
    notes,
    suggestions,
  };
}
