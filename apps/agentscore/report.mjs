// Shareable fix reports. The link is the store. Nothing is written to disk.
import zlib from 'node:zlib';
import { esc } from './core/kit.mjs';

// deflate-raw + base64url. Hash fragments stay in the browser.
export const HASH_LIMIT = 400_000;
const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

export function reportIdOk(id) {
  return ID_RE.test(String(id || ''));
}

export function slimExtras(extras = {}) {
  const agents = extras.agents && typeof extras.agents === 'object' ? extras.agents : {};
  return {
    robots: extras.robots ? { groups: extras.robots.groups || 1, agents } : null,
    sitemap: Boolean(extras.sitemap),
    llmsTxt: Boolean(extras.llmsTxt),
    llmsFull: Boolean(extras.llmsFull),
    agents,
  };
}

function pickFix(f) {
  return {
    kind: f.kind || '',
    title: f.title || '',
    explanation: f.explanation || '',
    points: f.points || 0,
    beforeSnippet: f.beforeSnippet || '',
    afterSnippet: f.afterSnippet || '',
    selector: f.selector || '',
    openUrl: f.openUrl || '',
  };
}

function pickScore(s) {
  if (!s) return null;
  return {
    score: s.score,
    grade: s.grade,
    verdict: s.verdict,
    dims: (s.dims || []).map((d) => ({ key: d.key, label: d.label, score: d.score })),
  };
}

export function reportRecord({ url, host, createdAt, extras, kit }) {
  return {
    v: 1,
    url,
    host: host || '',
    createdAt: createdAt || '',
    before: pickScore(kit.before),
    after: pickScore(kit.after),
    deltas: kit.deltas || [],
    withFiles: kit.withFiles ? kit.withFiles.score : null,
    fixes: (kit.fixes || []).map(pickFix),
    notes: (kit.notes || []).map(pickFix),
    suggestions: {
      robots: kit.suggestions?.robots || null,
      llms: kit.suggestions?.llms || null,
    },
    extras: slimExtras(extras),
    diff: fixesDiff({ ...kit, url }),
  };
}

function encode(obj) {
  return zlib.deflateRawSync(Buffer.from(JSON.stringify(obj)), { level: 9 }).toString('base64url');
}

export function packReport(input, opts = {}) {
  const max = opts.maxToken || HASH_LIMIT;
  const base = reportRecord(input);
  let token = encode(base);
  let htmlIncluded = false;
  const patched = input.kit?.patchedHtml || '';
  if (patched) {
    const withHtml = encode({ ...base, patchedHtml: patched });
    if (withHtml.length <= max) {
      token = withHtml;
      htmlIncluded = true;
    }
  }
  if (token.length > max) throw new Error('report link is too large');
  return { token, htmlIncluded, report: htmlIncluded ? { ...base, patchedHtml: patched } : base };
}

export function unpackReport(token) {
  if (!token || typeof token !== 'string' || token.length > HASH_LIMIT) return null;
  try {
    const json = zlib.inflateRawSync(Buffer.from(token, 'base64url')).toString('utf8');
    const data = JSON.parse(json);
    if (!data || data.v !== 1 || typeof data.url !== 'string' || !data.before || !data.after) return null;
    return data;
  } catch {
    return null;
  }
}

export function fixesDiff(kit) {
  const lines = [
    '# AgentScore fix kit',
    `# ${kit.url}`,
    `# before ${kit.before.score}/100`,
    `# after ${kit.after.score}/100`,
    '# Alone is the score change from that one edit on the original page.',
    '# Those numbers do not sum to the combined total.',
    '',
  ];
  for (const f of kit.fixes || []) {
    const sign = f.points > 0 ? '+' : '';
    lines.push(`# ${f.title} (alone ${sign}${f.points})`);
    lines.push('--- before');
    lines.push(f.beforeSnippet || '');
    lines.push('+++ after');
    lines.push(f.afterSnippet || '');
    lines.push('');
  }
  if (kit.suggestions?.robots) {
    lines.push('# robots.txt');
    lines.push(kit.suggestions.robots.trimEnd());
    lines.push('');
  }
  if (kit.suggestions?.llms) {
    lines.push('# llms.txt');
    lines.push(kit.suggestions.llms.trimEnd());
    lines.push('');
  }
  return lines.join('\n');
}

function sign(n) {
  if (n > 0) return `+${n}`;
  return String(n);
}

function fixBlocks(fixes, notes) {
  if (!fixes.length && !notes.length) {
    return '<p class="muted small">No markup changes. The page already has the facts this kit can copy.</p>';
  }
  const items = fixes.map((f) => `<details class="fixitem">
    <summary><span class="mono">${esc(sign(f.points))}</span> ${esc(f.title)}</summary>
    <p>${esc(f.explanation)}</p>
    <p class="muted small">Points at stake, scored alone: ${esc(sign(f.points))}. Selector: <span class="mono">${esc(f.selector || '')}</span></p>
    ${f.openUrl ? `<p><a href="${esc(f.openUrl)}">Open the element</a></p>` : ''}
    <div class="kicker">Before</div>
    <pre class="agent">${esc(f.beforeSnippet || '')}</pre>
    <div class="kicker">After</div>
    <pre class="agent">${esc(f.afterSnippet || '')}</pre>
  </details>`).join('');
  const flagged = notes.length
    ? `<div class="kicker" style="margin-top:16px">Flagged</div>${notes.map((n) => `<details class="fixitem">
    <summary><span class="mono">0</span> ${esc(n.title)}</summary>
    <p>${esc(n.explanation)}</p>
    <p class="muted small">Selector: <span class="mono">${esc(n.selector || '')}</span></p>
    ${n.openUrl ? `<p><a href="${esc(n.openUrl)}">Open the element</a></p>` : ''}
  </details>`).join('')}`
    : '';
  return items + flagged;
}

function deltaRows(deltas) {
  return (deltas || []).map((d) => `<tr><td>${esc(d.label)}</td><td class="s">${d.before}</td><td class="s">${d.after}</td><td class="s">${esc(sign(d.delta))}</td></tr>`).join('');
}

function downloadButtons(report) {
  const buttons = [];
  if (report.patchedHtml) buttons.push(['patched', 'Patched HTML']);
  buttons.push(['diff', 'Diff'], ['report', 'Report file']);
  if (report.suggestions?.robots) buttons.push(['robots', 'robots.txt']);
  if (report.suggestions?.llms) buttons.push(['llms', 'llms.txt']);
  return buttons.map(([kind, label]) => `<button class="btn" type="button" data-dl="${kind}">${esc(label)}</button>`).join('');
}

const SHARE = 'The report is in the link. Nothing is stored on the server. Anyone with the link can open it.';

export function kitSection(packed, origin, opts = {}) {
  const report = packed.report;
  const href = `${origin}/report#${packed.token}`;
  const files = report.withFiles != null
    ? `<p class="muted small" style="margin:8px 0 0">With the suggested files: ${report.withFiles}/100.</p>`
    : '';
  const omitted = packed.htmlIncluded
    ? ''
    : '<p class="muted small">The full patched page does not fit in the link. The snippets above are the edits.</p>';
  const github = opts.github
    ? '<button class="btn" type="button" id="fix-github">Fix it for me</button>'
    : '';
  return `<section class="card pad" id="fixkit">
    <div class="kicker">Fix kit</div>
    <p style="margin:10px 0 0">Before ${report.before.score}/100. After ${report.after.score}/100.</p>
    ${files}
    <p class="muted small" style="margin:8px 0 0">The patched page was rescored with the same scorer. Alone is the score change from that one edit on the original page. Those numbers do not sum to the combined total. Only text already on the page was used.</p>
    <div style="margin-top:14px"><table class="idx"><thead><tr><th>Category</th><th style="text-align:right">Before</th><th style="text-align:right">After</th><th style="text-align:right">Delta</th></tr></thead><tbody>${deltaRows(report.deltas)}</tbody></table></div>
    <div style="margin-top:14px">${fixBlocks(report.fixes, report.notes)}</div>
    ${omitted}
    <div class="actions">${downloadButtons(report)}${github}</div>
    <p class="muted small" style="margin:12px 0 0">Report: <a id="report-link" href="${esc(href)}">Open the shareable report</a>. ${SHARE}</p>
  </section>
  <script>${reportClientJs()}</script>`;
}

const STANDALONE_CSS = `body{margin:0;background:#08090a;color:#e7e4dc;font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 18px 64px}
h1{font-size:28px;line-height:1.2;font-weight:560}
a{color:#c6f24e}
table{width:100%;border-collapse:collapse;font-size:14px}
td,th{padding:8px 6px;border-bottom:1px solid #222;text-align:left}
td.s,th.s{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:#9a968c}
.mono{font-family:ui-monospace,monospace}
pre{white-space:pre-wrap;word-break:break-word;background:#101114;padding:10px;border-radius:8px}
details{border-top:1px solid #222;padding:8px 0}
summary{cursor:pointer}
code{font-family:ui-monospace,monospace}`;

export function standaloneReport(report) {
  const files = report.withFiles != null ? `<p>With the suggested files: ${report.withFiles}/100.</p>` : '';
  const fixes = (report.fixes || []).map((f) => `<details open>
    <summary>${esc(sign(f.points))} ${esc(f.title)}</summary>
    <p>${esc(f.explanation)}</p>
    <p class="muted">Points at stake, scored alone: ${esc(sign(f.points))}.</p>
    <p>Selector: <code>${esc(f.selector || '')}</code></p>
    ${f.openUrl ? `<p><a href="${esc(f.openUrl)}">Open the element</a></p>` : ''}
    <p class="muted">Before</p>
    <pre>${esc(f.beforeSnippet || '')}</pre>
    <p class="muted">Paste</p>
    <pre>${esc(f.afterSnippet || '')}</pre>
  </details>`).join('');
  const notes = (report.notes || []).map((n) => `<details>
    <summary>0 ${esc(n.title)}</summary>
    <p>${esc(n.explanation)}</p>
    <p>Selector: <code>${esc(n.selector || '')}</code></p>
    ${n.openUrl ? `<p><a href="${esc(n.openUrl)}">Open the element</a></p>` : ''}
  </details>`).join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Fix report ${esc(report.host || '')}</title>
<style>${STANDALONE_CSS}</style>
</head><body><main>
<h1>Fix report</h1>
<p class="muted">${esc(report.url || '')}</p>
<p>Before ${report.before.score}/100. After ${report.after.score}/100.</p>
${files}
<p class="muted">Alone is the score change from that one edit on the original page. Those numbers do not sum to the combined total. Only text already on the page was used.</p>
<table><thead><tr><th>Category</th><th class="s">Before</th><th class="s">After</th><th class="s">Delta</th></tr></thead><tbody>${deltaRows(report.deltas)}</tbody></table>
${fixes || '<p>No markup changes. The page already has the facts this kit can copy.</p>'}
${notes ? `<h2>Flagged</h2>${notes}` : ''}
<p class="muted">${SHARE}</p>
</main></body></html>`;
}

export function reportShell(opts = {}) {
  const github = opts.github ? 'window.AGENTSCORE_GITHUB=1;' : '';
  return `<main id="report-root">
  <p class="kicker" style="margin:34px 0 0">Fix report</p>
  <p class="sub" id="report-status">Reading the report from the link.</p>
</main>
<script>${github}${reportClientJs()}</script>`;
}

function reportClientJs() {
  return `(function () {
  function bytes(token) {
    const pad = token.length % 4 === 0 ? '' : '='.repeat(4 - (token.length % 4));
    const bin = atob(token.replace(/-/g, '+').replace(/_/g, '/') + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function unpack(token) {
    if (!token) throw new Error('empty');
    const stream = new Blob([bytes(token)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const data = JSON.parse(await new Response(stream).text());
    if (!data || data.v !== 1) throw new Error('bad report');
    return data;
  }
  function save(name, type, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function fileHtml(report) {
    const rows = (report.deltas || []).map((d) => '<tr><td>' + esc(d.label) + '</td><td>' + esc(d.before) + '</td><td>' + esc(d.after) + '</td><td>' + esc((Number(d.delta) > 0 ? '+' : '') + d.delta) + '</td></tr>').join('');
    const fixes = (report.fixes || []).map((f) => {
      const open = httpUrl(f.openUrl);
      return '<h2>' + esc((Number(f.points) > 0 ? '+' : '') + f.points + ' ' + (f.title || '')) + '</h2><p>' + esc(f.explanation) + '</p><p>Selector: ' + esc(f.selector || '') + '</p>' + (open ? '<p><a href="' + esc(open) + '">Open the element</a></p>' : '') + '<pre>' + esc(f.beforeSnippet || '') + '</pre><pre>' + esc(f.afterSnippet || '') + '</pre>';
    }).join('');
    const before = report.before && report.before.score;
    const after = report.after && report.after.score;
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fix report</title></head><body><h1>Fix report</h1><p>' + esc(report.url || '') + '</p><p>Before ' + esc(before) + '/100. After ' + esc(after) + '/100.</p><table>' + rows + '</table>' + fixes + '<p>The report is in the link. Nothing is stored on the server.</p></body></html>';
  }
  function bind(report) {
    document.querySelectorAll('[data-dl]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-dl');
        if (kind === 'patched' && report.patchedHtml) save('patched.html', 'text/html', report.patchedHtml);
        else if (kind === 'diff') save('fixes.diff', 'text/plain', report.diff || '');
        else if (kind === 'report') save('report.html', 'text/html', fileHtml(report));
        else if (kind === 'robots' && report.suggestions && report.suggestions.robots) save('robots.txt', 'text/plain', report.suggestions.robots);
        else if (kind === 'llms' && report.suggestions && report.suggestions.llms) save('llms.txt', 'text/plain', report.suggestions.llms);
      });
    });
    const gh = document.getElementById('fix-github');
    if (gh) gh.addEventListener('click', () => {
      sessionStorage.setItem('agentscore-github', JSON.stringify({
        url: report.url,
        host: report.host || '',
        before: report.before.score,
        after: report.after.score,
        extras: report.extras || {}
      }));
      location.href = '/github/fix/start';
    });
  }
  function addBtn(parent, kind, label) {
    const b = document.createElement('button');
    b.className = 'btn';
    b.type = 'button';
    b.setAttribute('data-dl', kind);
    b.textContent = label;
    parent.appendChild(b);
  }
  function httpUrl(value) {
    try {
      const u = new URL(value);
      if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    } catch {}
    return '';
  }
  function render(root, report) {
    root.textContent = '';
    const card = document.createElement('section');
    card.className = 'card pad';
    card.id = 'fixkit';
    const kicker = document.createElement('div');
    kicker.className = 'kicker';
    kicker.textContent = 'Fix report';
    const h = document.createElement('h1');
    h.className = 'hero';
    h.style.fontSize = 'clamp(26px,4vw,40px)';
    h.textContent = report.host || 'Page';
    const sub = document.createElement('p');
    sub.className = 'sub';
    sub.textContent = report.url || '';
    const scores = document.createElement('p');
    scores.textContent = 'Before ' + report.before.score + '/100. After ' + report.after.score + '/100.';
    card.appendChild(kicker);
    card.appendChild(h);
    card.appendChild(sub);
    card.appendChild(scores);
    if (report.withFiles != null) {
      const extra = document.createElement('p');
      extra.className = 'muted small';
      extra.textContent = 'With the suggested files: ' + report.withFiles + '/100.';
      card.appendChild(extra);
    }
    const note = document.createElement('p');
    note.className = 'muted small';
    note.textContent = 'Alone is the score change from that one edit on the original page. Those numbers do not sum to the combined total. Only text already on the page was used.';
    card.appendChild(note);
    const table = document.createElement('table');
    table.className = 'idx';
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    ['Category', 'Before', 'After', 'Delta'].forEach((label) => {
      const th = document.createElement('th');
      th.textContent = label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = document.createElement('tbody');
    (report.deltas || []).forEach((d) => {
      const tr = document.createElement('tr');
      [d.label, String(d.before), String(d.after), (d.delta > 0 ? '+' : '') + d.delta].forEach((cell) => {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    card.appendChild(table);
    (report.fixes || []).forEach((f) => {
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = (f.points > 0 ? '+' : '') + f.points + ' ' + f.title;
      const p = document.createElement('p');
      p.textContent = f.explanation || '';
      const sel = document.createElement('p');
      sel.textContent = 'Selector: ' + (f.selector || '');
      det.appendChild(sum);
      det.appendChild(p);
      det.appendChild(sel);
      const open = httpUrl(f.openUrl);
      if (open) {
        const a = document.createElement('a');
        a.href = open;
        a.textContent = 'Open the element';
        const wrap = document.createElement('p');
        wrap.appendChild(a);
        det.appendChild(wrap);
      }
      const pre = document.createElement('pre');
      pre.className = 'agent';
      pre.textContent = f.afterSnippet || '';
      det.appendChild(pre);
      card.appendChild(det);
    });
    const actions = document.createElement('div');
    actions.className = 'actions';
    if (report.patchedHtml) addBtn(actions, 'patched', 'Patched HTML');
    else {
      const miss = document.createElement('p');
      miss.className = 'muted small';
      miss.textContent = 'The full patched page does not fit in the link. The snippets above are the edits.';
      card.appendChild(miss);
    }
    addBtn(actions, 'diff', 'Diff');
    addBtn(actions, 'report', 'Report file');
    if (report.suggestions && report.suggestions.robots) addBtn(actions, 'robots', 'robots.txt');
    if (report.suggestions && report.suggestions.llms) addBtn(actions, 'llms', 'llms.txt');
    if (window.AGENTSCORE_GITHUB) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.type = 'button';
      b.id = 'fix-github';
      b.textContent = 'Fix it for me';
      actions.appendChild(b);
    }
    card.appendChild(actions);
    const share = document.createElement('p');
    share.className = 'muted small';
    share.textContent = 'The report is in the link. Nothing is stored on the server. Anyone with the link can open it.';
    card.appendChild(share);
    root.appendChild(card);
    bind(report);
  }
  const root = document.getElementById('report-root');
  if (root) {
    const token = location.hash.startsWith('#') ? location.hash.slice(1) : '';
    const status = document.getElementById('report-status');
    if (!token) {
      if (status) status.textContent = 'This link has no report data.';
      return;
    }
    unpack(token).then((report) => render(root, report)).catch(() => {
      if (status) status.textContent = 'This link has no report data.';
    });
    return;
  }
  const link = document.getElementById('report-link');
  if (!link) return;
  let pending = null;
  function get() {
    if (!pending) pending = unpack(link.hash.startsWith('#') ? link.hash.slice(1) : '');
    return pending;
  }
  function deliver(report, kind) {
    if (kind === 'patched' && report.patchedHtml) save('patched.html', 'text/html', report.patchedHtml);
    else if (kind === 'diff') save('fixes.diff', 'text/plain', report.diff || '');
    else if (kind === 'report') save('report.html', 'text/html', fileHtml(report));
    else if (kind === 'robots' && report.suggestions && report.suggestions.robots) save('robots.txt', 'text/plain', report.suggestions.robots);
    else if (kind === 'llms' && report.suggestions && report.suggestions.llms) save('llms.txt', 'text/plain', report.suggestions.llms);
  }
  document.querySelectorAll('[data-dl]').forEach((btn) => {
    btn.addEventListener('click', () => {
      get().then((report) => deliver(report, btn.getAttribute('data-dl'))).catch(() => {});
    });
  });
  const gh = document.getElementById('fix-github');
  if (gh) gh.addEventListener('click', () => {
    get().then((report) => {
      sessionStorage.setItem('agentscore-github', JSON.stringify({
        url: report.url,
        host: report.host || '',
        before: report.before.score,
        after: report.after.score,
        extras: report.extras || {}
      }));
      location.href = '/github/fix/start';
    });
  });
})();`;
}
