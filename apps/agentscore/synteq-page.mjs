// Before/after for the saved synteq.com homepage. Scores come from the shared scorer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractModel } from './core/extract.mjs';
import { scorePage } from './core/score.mjs';
import { fetchExtras } from './core/aux.mjs';
import { analyze } from './core/page.mjs';
import { shell, esc } from './core/kit.mjs';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'synteq');
const PAGE_URL = 'https://synteq.com/';
const TTL_MS = 5 * 60 * 1000;

const VARIANTS = [
  { key: 'original', file: 'index.original.html', short: 'Snapshot', label: 'synteq.com snapshot' },
  { key: 'patched', file: 'index.patched.html', short: 'Patched', label: 'synteq.com patched' },
  { key: 'static', file: 'index.static.html', short: 'Static', label: 'synteq.com static' },
];

const BOARD = ['netlify.com', 'fly.io', 'heroku.com', 'railway.com'];

export const DEMO_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "style-src 'unsafe-inline'",
].join('; ');

const CHANGES = [
  'Header links are wrapped in a nav element.',
    'Images that had empty alt text now have alt text, or were moved to CSS backgrounds.',
  'A form titled "Talk to Synteq sales" labels first name, last name, work email, company name, and a message. The button says Contact sales.',
  'A BreadcrumbList JSON-LD block was added. Organization, WebSite, and FAQPage were already in the file.',
  'A noscript element holds a short description and links to the product pages, contact, and /llms.txt.',
  'The static file is the patched file with script elements removed, except JSON-LD.',
];

const BANNER = `<div id="agentscore-demo" style="position:sticky;top:0;z-index:2147483647;background:#111;color:#f2f2f2;font:14px/1.45 ui-sans-serif,system-ui,sans-serif;padding:12px 16px;border-bottom:4px solid #c6f24e">
<strong>AgentScore demo.</strong> This page is not synteq.com and is not affiliated with Synteq. It is a saved copy of the synteq.com homepage with markup edits, hosted here so the markup can be inspected. Forms on this page do not submit.
<a href="/synteq" style="color:#c6f24e;margin-left:8px">Back to the score comparison</a>
</div>`;

let cache = null;

function readVariant(file) {
  return fs.readFileSync(path.join(dir, file), 'utf8');
}

export function demoHtml(html) {
  const meta = `<meta name="robots" content="noindex"><meta http-equiv="Content-Security-Policy" content="${DEMO_CSP}">`;
  let out = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}${meta}`);
  out = out.replace(/<body(\s[^>]*)?>/i, (m) => `${m}${BANNER}`);
  out = out.replace(/<title(\s[^>]*)?>/i, (m) => `${m}AgentScore demo: `);
  out = out.replace(/\sformaction\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/<form\b([^>]*)>/gi, (_, attrs) => {
    const cleaned = String(attrs).replace(/\s(action|method|onsubmit)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    return `<form${cleaned} method="get" action="#agentscore-demo" data-agentscore-demo="inert">`;
  });
  return out;
}

export function demoDocument(which) {
  const file = which === 'static' ? 'index.static.html' : 'index.patched.html';
  return demoHtml(readVariant(file));
}

async function scoreHost(host) {
  try {
    const r = await analyze(`https://${host}/`);
    if (r.blocked) {
      return {
        key: 'host',
        label: host,
        score: r.scored.score,
        grade: r.scored.grade,
        verdict: r.scored.verdict,
        note: r.blocked.reason,
      };
    }
    return {
      key: 'host',
      label: host,
      score: r.scored.score,
      grade: r.scored.grade,
      verdict: r.scored.verdict,
      note: '',
    };
  } catch (err) {
    return { key: 'host', label: host, score: null, error: err && err.message ? err.message : 'Fetch failed.' };
  }
}

function scoreFile(variant, extras) {
  const html = readVariant(variant.file);
  const page = extractModel(html, PAGE_URL);
  const scored = scorePage(page, extras);
  return { ...variant, page, scored };
}

export async function loadSynteqReport() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.report;
  const [extras, hosts] = await Promise.all([
    fetchExtras(PAGE_URL),
    Promise.all(BOARD.map(scoreHost)),
  ]);
  const variants = VARIANTS.map((v) => scoreFile(v, extras));
  const report = {
    extras,
    variants,
    hosts,
    scoredAt: new Date().toISOString(),
  };
  cache = { at: Date.now(), report };
  return report;
}

function factLine(page) {
  const alt = page.images.filter((img) => img.alt).length;
  const labeled = page.fields.filter((f) => f.label).length;
  const bits = [
    `${page.mainWords} words in main`,
    `${alt}/${page.images.length} images with alt`,
    page.landmarks.nav ? 'nav present' : 'no nav',
    page.noscript ? 'noscript text present' : 'no noscript text',
    page.canonical ? 'canonical set' : 'no canonical',
    page.fields.length ? `${labeled}/${page.fields.length} fields labeled` : 'no fields',
  ];
  return bits.join('. ') + '.';
}

function extrasLine(extras) {
  const bits = [
    extras.robots ? 'robots.txt found' : 'robots.txt not found',
    extras.sitemap ? 'sitemap found' : 'sitemap not found',
    extras.llmsTxt ? 'llms.txt found' : 'llms.txt not found',
  ];
  return bits.join('. ') + '.';
}

function scoredHosts(hosts) {
  return hosts.filter((h) => h.score != null);
}

function compareLine(name, score, hosts) {
  const above = hosts.filter((h) => score > h.score).sort((a, b) => b.score - a.score);
  const below = hosts.filter((h) => score < h.score).sort((a, b) => b.score - a.score);
  const tied = hosts.filter((h) => score === h.score).sort((a, b) => a.label.localeCompare(b.label));
  const fmt = (list) => list.map((h) => `${h.label} ${h.score}`).join(', ');
  const bits = [`${name}: ${score}.`];
  if (above.length) bits.push(`Above ${fmt(above)}.`);
  if (tied.length) bits.push(`Tied with ${fmt(tied)}.`);
  if (below.length) bits.push(`Below ${fmt(below)}.`);
  return bits.join(' ');
}

function rankRows(variants, hosts) {
  const items = [
    ...variants.map((v) => ({
      label: v.label,
      score: v.scored.score,
      grade: v.scored.grade,
      verdict: v.scored.verdict,
      note: 'saved file',
    })),
    ...hosts.map((h) => ({
      label: h.label,
      score: h.score,
      grade: h.grade || '',
      verdict: h.verdict || '',
      note: h.note || h.error || 'fetched',
    })),
  ];
  const ok = items.filter((item) => item.score != null).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  let prev = null;
  ok.forEach((item, i) => {
    item.rank = prev != null && item.score === prev ? ok[i - 1].rank : i + 1;
    prev = item.score;
  });
  const bad = items.filter((item) => item.score == null);
  return { ok, bad };
}

function catTable(variants) {
  const head = `<tr><th>Category</th><th class="s">Wt</th>${variants.map((v) => `<th class="s">${esc(v.short)}</th>`).join('')}</tr>`;
  const body = variants[0].scored.dims
    .map((dim, i) => `<tr><td>${esc(dim.label)}</td><td class="s">${dim.weight}</td>${variants.map((v) => `<td class="s">${v.scored.dims[i].score}</td>`).join('')}</tr>`)
    .join('');
  const total = `<tr><td>Total</td><td class="s">100</td>${variants.map((v) => `<td class="s">${v.scored.score}</td>`).join('')}</tr>`;
  return `<table class="idx"><thead>${head}</thead><tbody>${body}${total}</tbody></table>`;
}

const HEAD = `<style>
.trio{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
@media(max-width:700px){.trio{grid-template-columns:1fr}}
.trio .card{margin:0}
.trio .num{font-family:var(--mono);font-size:48px;letter-spacing:-.04em;line-height:1;margin-top:8px}
.trio .num .of{font-size:16px;color:var(--dimmer);letter-spacing:0}
ol.changes{margin:12px 0 0;padding-left:18px;max-width:74ch}
ol.changes li{margin:0 0 8px;font-size:14px}
</style>`;

export async function synteqPage(navLinks) {
  const report = await loadSynteqReport();
  const { variants, hosts, extras, scoredAt } = report;
  const live = scoredHosts(hosts);
  const when = new Date(scoredAt).toUTCString().replace('GMT', 'UTC');
  const cards = variants
    .map((v) => `<div class="card pad">
      <div class="kicker">${esc(v.short)}</div>
      <div class="num">${v.scored.score}<span class="of">/100</span></div>
      <div class="grade">Grade ${esc(v.scored.grade)}</div>
      <p class="muted small" style="margin:8px 0 0">${esc(v.scored.verdict)}</p>
      <p class="muted small" style="margin:8px 0 0">${esc(factLine(v.page))}</p>
    </div>`)
    .join('');
  const compares = live.length
    ? variants.map((v) => `<p class="muted small" style="margin:8px 0 0">${esc(compareLine(v.short, v.scored.score, live))}</p>`).join('')
    : '<p class="muted small" style="margin:8px 0 0">The four homepages were not scored, so there is no rank against them.</p>';
  const ranked = rankRows(variants, hosts);
  const rankBody = ranked.ok
    .map((row) => `<tr><td class="s">${row.rank}</td><td>${esc(row.label)}</td><td class="s">${row.score}</td><td class="s">${esc(row.grade)}</td><td class="s">${esc(row.verdict)}</td><td class="muted">${esc(row.note)}</td></tr>`)
    .join('');
  const failBody = ranked.bad
    .map((row) => `<tr><td class="s"></td><td>${esc(row.label)}</td><td class="s"></td><td class="s"></td><td class="s"></td><td class="muted">${esc(row.note)}</td></tr>`)
    .join('');

  const body = `<main>
  <p class="kicker" style="margin:34px 0 0">synteq.com · ${esc(when)}</p>
  <h1 class="hero" style="font-size:clamp(26px,4vw,40px)">Before and after</h1>
  <p class="sub">Three files. The snapshot is the synteq.com homepage saved 2026-10-22 at 00:55 PDT. Patched is that file with markup edits. Static is the patched file with script elements removed, except JSON-LD. Each file is scored with final URL https://synteq.com/. ${esc(extrasLine(extras))} All three files share that fetch.</p>
  <div class="trio">${cards}</div>
  <section class="card pad">
    <div class="kicker">Category breakdown</div>
    <p class="muted small" style="margin:8px 0 14px">Category numbers are 0 to 100. The total is the weighted sum, 0 to 100.</p>
    ${catTable(variants)}
  </section>
  <section class="card pad">
    <div class="kicker">What changed in the file</div>
    <ol class="changes">${CHANGES.map((line) => `<li>${esc(line)}</li>`).join('')}</ol>
  </section>
  <section class="card pad">
    <div class="kicker">Four homepages, scored with this code</div>
    <p class="muted small" style="margin:8px 0 0">netlify.com, fly.io, heroku.com, and railway.com were fetched and scored at ${esc(when)}. The synteq.com rows are the saved files. The index is an earlier measurement.</p>
    ${compares}
    <table class="idx" style="margin-top:14px"><thead><tr><th class="s">#</th><th>Page</th><th class="s">Score</th><th class="s">Grade</th><th class="s">Verdict</th><th>Source</th></tr></thead><tbody>${rankBody}${failBody}</tbody></table>
  </section>
  <section class="card pad">
    <div class="kicker">Inspect the markup</div>
    <p class="muted small" style="margin:8px 0 0">The pages linked below are the patched and static files plus a banner. Forms on them do not submit. They are an AgentScore demo, not affiliated with Synteq. A scan of those URLs includes the banner and runs on this host, so it will differ from the rows above.</p>
    <div class="actions" style="padding:14px 0 0">
      <a class="btn" href="/synteq/patched">Patched HTML</a>
      <a class="btn" href="/synteq/static">Static HTML</a>
    </div>
  </section>
</main>`;

  const patched = variants.find((v) => v.key === 'patched');
  const snapshot = variants.find((v) => v.key === 'original');
  const stat = variants.find((v) => v.key === 'static');
  return shell({
    title: `synteq.com ${snapshot.scored.score}, ${patched.scored.score}, ${stat.scored.score} · AgentScore`,
    description: `Saved synteq.com homepage ${snapshot.scored.score}/100. Markup edits ${patched.scored.score}/100. Scripts removed ${stat.scored.score}/100. Scored with the AgentScore rubric.`,
    head: HEAD,
    navLinks,
    body,
  });
}
