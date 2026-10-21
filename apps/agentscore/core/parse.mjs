// A small, forgiving HTML parser: enough tree to reason about what an agent sees.
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
const RAWTEXT = new Set('script style noscript template svg canvas iframe video audio picture object map'.split(' '));
const BLOCK = new Set((
  'address article aside blockquote details dialog dd div dl dt fieldset figcaption figure footer form ' +
  'h1 h2 h3 h4 h5 h6 header hgroup hr li main nav ol p pre section table ul tr td th thead tbody tfoot ' +
  'caption summary button select option textarea label legend'
).split(' '));

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•',
  copy: '©', reg: '®', trade: '™', euro: '€', pound: '£', times: '×', laquo: '«', raquo: '»',
  rarr: '→', larr: '←', uarr: '↑', darr: '↓', check: '✓', hearts: '♥', deg: '°',
};

export function decodeEntities(s) {
  if (!s || s.indexOf('&') === -1) return s || '';
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (m, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    const v = ENTITIES[body];
    return v === undefined ? m : v;
  });
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

export function parseHtml(html) {
  const root = { tag: '#document', attrs: Object.create(null), children: [], parent: null };
  let node = root;
  const len = html.length;
  let i = 0;
  const stack = [root];

  const pushText = (text) => {
    if (!text) return;
    const cleaned = decodeEntities(text);
    if (!cleaned.trim()) {
      if (cleaned.length && node.children.length) {
        const last = node.children[node.children.length - 1];
        if (last.tag === '#text') last.text += ' ';
      }
      return;
    }
    const last = node.children[node.children.length - 1];
    if (last && last.tag === '#text') last.text += cleaned;
    else node.children.push({ tag: '#text', text: cleaned, parent: node, children: [] });
  };

  while (i < len) {
    const lt = html.indexOf('<', i);
    if (lt === -1) {
      pushText(html.slice(i));
      break;
    }
    if (lt > i) pushText(html.slice(i, lt));
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
      i = end === -1 ? len : end + 1;
      // unwind to matching open tag
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === tag) {
          stack.length = s;
          node = stack[stack.length - 1];
          break;
        }
      }
      continue;
    }
    // opening tag, tolerant of > inside quoted attributes
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
    i = j + 1;
    const m = /^([a-zA-Z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)$/.exec(inner);
    if (!m) continue;
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);
    const el = { tag, attrs, children: [], parent: node };
    node.children.push(el);
    if (RAWTEXT.has(tag)) {
      const close = new RegExp(`</${tag}\\s*>`, 'i');
      const rest = html.slice(i);
      const found = close.exec(rest);
      const raw = found ? rest.slice(0, found.index) : rest;
      el.raw = raw;
      el.children.push({ tag: '#text', text: raw, parent: el, children: [] });
      i = found ? i + found.index + found[0].length : len;
      continue;
    }
    if (VOID.has(tag) || inner.trim().endsWith('/')) continue;
    stack.push(el);
    node = el;
  }
  return root;
}

export function textOf(node, opts = {}) {
  const skip = opts.skip || new Set(['script', 'style', 'noscript', 'template', 'svg']);
  const out = [];
  const walk = (n) => {
    if (n.tag === '#text') {
      out.push(n.text);
      return;
    }
    if (skip.has(n.tag)) return;
    if (n.tag && BLOCK.has(n.tag)) out.push(' ');
    for (const c of n.children) walk(c);
    if (n.tag && BLOCK.has(n.tag)) out.push(' ');
  };
  walk(node);
  return out.join('').replace(/\s+/g, ' ').trim();
}

export function find(root, pred, out = []) {
  for (const c of root.children) {
    if (c.tag === '#text') continue;
    if (pred(c)) out.push(c);
    find(c, pred, out);
  }
  return out;
}

export function findFirst(root, pred) {
  for (const c of root.children) {
    if (c.tag === '#text') continue;
    if (pred(c)) return c;
    const found = findFirst(c, pred);
    if (found) return found;
  }
  return null;
}

export function rawTextOf(node) {
  const out = [];
  const walk = (n) => {
    if (n.tag === '#text') out.push(n.text);
    else for (const c of n.children) walk(c);
  };
  walk(node);
  return out.join('');
}

export function elementsOf(root, tags) {
  const set = tags instanceof Set ? tags : new Set(tags);
  return find(root, (n) => set.has(n.tag));
}

export { BLOCK };
