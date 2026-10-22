// Shareable fix reports. Disk only so a link keeps working. No tokens.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc } from './core/kit.mjs';

const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

export function reportIdOk(id) {
  return ID_RE.test(String(id || ''));
}

export function newReportId() {
  return crypto.randomBytes(9).toString('base64url');
}

export function reportsDir() {
  if (process.env.AGENTSCORE_DATA_DIR) return process.env.AGENTSCORE_DATA_DIR;
  return path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'reports');
}

export function saveReport(report, dir = reportsDir()) {
  const id = report.id && reportIdOk(report.id) ? report.id : newReportId();
  if (!reportIdOk(id)) throw new Error('bad report id');
  fs.mkdirSync(dir, { recursive: true });
  const data = { ...report, id };
  fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(data));
  return data;
}

export function loadReport(id, dir = reportsDir()) {
  if (!reportIdOk(id)) return null;
  const file = path.join(dir, `${id}.json`);
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || data.id !== id) return null;
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

function fixBlocks(kit) {
  const fixes = kit.fixes || [];
  const notes = kit.notes || [];
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

function deltaTable(kit) {
  const rows = (kit.deltas || []).map((d) => `<tr><td>${esc(d.label)}</td><td class="s">${d.before}</td><td class="s">${d.after}</td><td class="s">${esc(sign(d.delta))}</td></tr>`).join('');
  return `<table class="idx"><thead><tr><th>Category</th><th style="text-align:right">Before</th><th style="text-align:right">After</th><th style="text-align:right">Delta</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function downloadLinks(reportId, kit) {
  const links = [
    [`/report/${reportId}/patched.html`, 'Patched HTML'],
    [`/report/${reportId}/fixes.diff`, 'Diff'],
    [`/report/${reportId}/report.html`, 'Report file'],
  ];
  if (kit.suggestions?.robots) links.push([`/report/${reportId}/robots.txt`, 'robots.txt']);
  if (kit.suggestions?.llms) links.push([`/report/${reportId}/llms.txt`, 'llms.txt']);
  return links.map(([href, label]) => `<a class="btn" href="${esc(href)}">${esc(label)}</a>`).join('');
}

export function kitSection(kit, reportId, origin, opts = {}) {
  const href = `${origin}/report/${reportId}`;
  const files = kit.withFiles
    ? `<p class="muted small" style="margin:8px 0 0">With the suggested files: ${kit.withFiles.score}/100.</p>`
    : '';
  const github = opts.github
    ? `<a class="btn" href="/github/fix/start?report=${encodeURIComponent(reportId)}">Fix it for me</a>`
    : '';
  return `<section class="card pad" id="fixkit">
    <div class="kicker">Fix kit</div>
    <p style="margin:10px 0 0">Before ${kit.before.score}/100. After ${kit.after.score}/100.</p>
    ${files}
    <p class="muted small" style="margin:8px 0 0">The patched page was rescored with the same scorer. Alone is the score change from that one edit on the original page. Those numbers do not sum to the combined total. Only text already on the page was used.</p>
    <div style="margin-top:14px">${deltaTable(kit)}</div>
    <div style="margin-top:14px">${fixBlocks(kit)}</div>
    <div class="actions">${downloadLinks(reportId, kit)}${github}</div>
    <p class="muted small" style="margin:12px 0 0">Report: <a href="${esc(href)}">${esc(href)}</a>. Anyone with this link can open the report. It is stored so the link keeps working.</p>
  </section>`;
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

export function standaloneReport(report, origin) {
  const kit = report.kit;
  const href = `${origin}/report/${report.id}`;
  const files = kit.withFiles ? `<p>With the suggested files: ${kit.withFiles.score}/100.</p>` : '';
  const rows = (kit.deltas || []).map((d) => `<tr><td>${esc(d.label)}</td><td class="s">${d.before}</td><td class="s">${d.after}</td><td class="s">${esc(sign(d.delta))}</td></tr>`).join('');
  const fixes = (kit.fixes || []).map((f) => `<details open>
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
  const notes = (kit.notes || []).map((n) => `<details>
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
<p>Before ${kit.before.score}/100. After ${kit.after.score}/100.</p>
${files}
<p class="muted">Alone is the score change from that one edit on the original page. Those numbers do not sum to the combined total. Only text already on the page was used.</p>
<table><thead><tr><th>Category</th><th class="s">Before</th><th class="s">After</th><th class="s">Delta</th></tr></thead><tbody>${rows}</tbody></table>
${fixes || '<p>No markup changes. The page already has the facts this kit can copy.</p>'}
${notes ? `<h2>Flagged</h2>${notes}` : ''}
<p class="muted">Share: ${esc(href)}. Anyone with this link can open the report. It is stored so the link keeps working.</p>
</main></body></html>`;
}

export function reportBody(report, origin, opts = {}) {
  return `<main>
  <p class="kicker" style="margin:34px 0 0">Fix report</p>
  <h1 class="hero" style="font-size:clamp(26px,4vw,40px)">${esc(report.host || 'Page')}</h1>
  <p class="sub">${esc(report.url || '')}</p>
  ${kitSection(report.kit, report.id, origin, opts)}
</main>`;
}
