// Turn a parsed document into the facts we score and render.
import { parseHtml, textOf, find, findFirst, elementsOf, rawTextOf } from './parse.mjs';

const CLEAN = (s) => (s || '').replace(/\s+/g, ' ').trim();
const GENERIC_LINK = /^(click here|here|read more|learn more|more|this|link|see more|details|view|go|this page|this link|continue|next|previous|→|>)$/i;

function metaMap(root) {
  const out = Object.create(null);
  for (const m of elementsOf(root, ['meta'])) {
    const name = (m.attrs.name || m.attrs.property || m.attrs.itemprop || '').toLowerCase();
    if (!name) continue;
    const content = CLEAN(m.attrs.content);
    if (!content) continue;
    if (!(name in out)) out[name] = content;
  }
  return out;
}

function canonicalUrl(root, meta) {
  for (const link of elementsOf(root, ['link'])) {
    const rel = String(link.attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!rel.includes('canonical')) continue;
    const href = CLEAN(link.attrs.href || '');
    if (href) return href;
  }
  return CLEAN(meta.canonical || '');
}

export function extractModel(html, finalUrl) {
  const root = parseHtml(html);
  const meta = metaMap(root);
  const titleEl = findFirst(root, (n) => n.tag === 'title');
  const title = CLEAN(titleEl ? textOf(titleEl) : '');
  const htmlEl = findFirst(root, (n) => n.tag === 'html');

  const jsonld = [];
  for (const s of elementsOf(root, ['script'])) {
    const type = (s.attrs.type || '').toLowerCase();
    if (!type.includes('ld+json')) continue;
    const raw = rawTextOf(s);
    if (!raw.trim()) continue;
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : parsed['@graph'] && Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
      for (const item of list) {
        if (item && typeof item === 'object' && (item['@type'] || item['@context'])) {
          jsonld.push({ types: [].concat(item['@type'] || []).map(String), context: String(item['@context'] || '') });
        }
      }
    } catch {}
  }

  const headings = elementsOf(root, ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
    .map((h) => ({ level: Number(h.tag[1]), text: CLEAN(textOf(h)).slice(0, 160) }))
    .filter((h) => h.text);

  const base = new URL(finalUrl);
  const links = elementsOf(root, ['a'])
    .map((a) => {
      const href = (a.attrs.href || '').trim();
      const text = CLEAN(textOf(a)).slice(0, 90);
      const aria = CLEAN(a.attrs['aria-label'] || '');
      const imgAlt = CLEAN((findFirst(a, (n) => n.tag === 'img') || { attrs: {} }).attrs?.alt || '');
      let abs = '';
      try {
        if (href && !/^(#|javascript:|mailto:|tel:)/i.test(href)) abs = new URL(href, base).toString();
      } catch {}
      const external = abs ? new URL(abs).host !== base.host : false;
      return { href, abs, text, label: aria || text || imgAlt, external, rel: (a.attrs.rel || '').toLowerCase() };
    })
    .filter((l) => l.href && !l.href.startsWith('#'));

  const buttons = elementsOf(root, ['button'])
    .map((b) => ({ text: CLEAN(textOf(b)) || CLEAN(b.attrs['aria-label'] || ''), disabled: 'disabled' in b.attrs }))
    .filter((b) => b.text);

  const inputs = elementsOf(root, ['input', 'textarea', 'select']);
  const labelsFor = new Map();
  for (const l of elementsOf(root, ['label'])) {
    const forId = l.attrs.for;
    const text = CLEAN(textOf(l));
    if (forId && text) labelsFor.set(forId, text);
  }
  const fields = inputs
    .map((el) => {
      const type = (el.attrs.type || (el.tag === 'textarea' ? 'textarea' : el.tag === 'select' ? 'select' : 'text')).toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return null;
      const id = el.attrs.id;
      const wrapped = (() => {
        let p = el.parent;
        while (p) {
          if (p.tag === 'label') return CLEAN(textOf(p));
          p = p.parent;
        }
        return '';
      })();
      const label = CLEAN(labelsFor.get(id) || wrapped || el.attrs['aria-label'] || '');
      return {
        type,
        name: el.attrs.name || '',
        label,
        placeholder: CLEAN(el.attrs.placeholder || ''),
        required: 'required' in el.attrs || el.attrs['aria-required'] === 'true',
      };
    })
    .filter(Boolean);

  const forms = elementsOf(root, ['form']).map((f) => ({
    action: f.attrs.action || '',
    method: (f.attrs.method || 'get').toUpperCase(),
    fields: elementsOf(f, ['input', 'textarea', 'select']).length,
  }));

  const images = elementsOf(root, ['img']).map((im) => ({
    src: im.attrs.src || '',
    alt: CLEAN(im.attrs.alt || ''),
    hasAltAttr: 'alt' in im.attrs,
    decorative: im.attrs.alt === '' || im.attrs.role === 'presentation',
  }));

  const landmarks = {
    header: elementsOf(root, ['header']).length,
    nav: elementsOf(root, ['nav']).length,
    main: elementsOf(root, ['main']).length,
    footer: elementsOf(root, ['footer']).length,
    article: elementsOf(root, ['article']).length,
    section: elementsOf(root, ['section']).length,
    roleMain: elementsOf(root, ['div']).filter((d) => d.attrs.role === 'main').length,
  };

  const scripts = elementsOf(root, ['script']);
  const inlineScriptBytes = scripts.reduce((n, s) => n + rawTextOf(s).length, 0);
  const externalScripts = scripts.filter((s) => s.attrs.src).length;
  const noscript = elementsOf(root, ['noscript']).map((n) => textOf(n)).join(' ').trim();

  // main-content text is a better signal than whole-document text
  const mainEl = findFirst(root, (n) => n.tag === 'main') || findFirst(root, (n) => n.attrs.role === 'main');
  const bodyEl = findFirst(root, (n) => n.tag === 'body') || root;
  const docText = textOf(bodyEl);
  const mainText = mainEl ? textOf(mainEl) : '';
  const words = (t) => (t ? t.split(/\s+/).filter(Boolean).length : 0);

  const appRoots = elementsOf(root, ['div']).filter((d) => d.attrs.id === 'root' || d.attrs.id === '__next' || d.attrs.id === '__nuxt' || d.attrs['data-reactroot'] !== undefined);

  const headingOrder = headings.map((h) => h.level);
  let headingJumps = 0;
  for (let i = 1; i < headingOrder.length; i++) if (headingOrder[i] - headingOrder[i - 1] > 1) headingJumps++;

  return {
    url: finalUrl,
    host: base.host.replace(/^www\./, ''),
    displayHost: base.host.replace(/^www\./, ''),
    origin: base.origin,
    lang: CLEAN(htmlEl?.attrs.lang || ''),
    title,
    titleLength: title.length,
    description: CLEAN(meta.description || ''),
    canonical: canonicalUrl(root, meta),
    viewport: CLEAN(meta.viewport || ''),
    robotsMeta: CLEAN(meta.robots || ''),
    og: {
      title: CLEAN(meta['og:title'] || ''),
      description: CLEAN(meta['og:description'] || ''),
      image: CLEAN(meta['og:image'] || ''),
      type: CLEAN(meta['og:type'] || ''),
    },
    twitterCard: CLEAN(meta['twitter:card'] || ''),
    jsonld,
    headings,
    headingJumps,
    links,
    buttons,
    fields,
    forms,
    images,
    landmarks,
    inlineScriptBytes,
    externalScripts,
    scriptTags: scripts.length,
    noscript,
    docWords: words(docText),
    mainWords: words(mainText),
    mainText,
    docText,
    hasAppRoot: appRoots.length > 0,
    bytes: html.length,
    html,
  };
}
