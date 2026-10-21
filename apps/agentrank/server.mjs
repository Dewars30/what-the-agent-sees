import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, HttpError } from './core/page.mjs';
import { shell, esc, quoteIntent, replyIntent, repostIntent, viralBar, renderOgSvg, renderOgPng } from './core/kit.mjs';
import { grade, verdict } from './core/score.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PUBLIC_ORIGIN || 'https://agentrank.synteq.app';
const ENTRY_POST_ID = process.env.ENTRY_POST_ID || process.env.ENTRY_TWEET_ID || '2112839742496846116';

const grokReplyUrl = (text) => replyIntent(text, ENTRY_POST_ID);

const seed = JSON.parse(fs.readFileSync(path.join(__dir, 'data', 'seed.json'), 'utf8'));
const board = new Map(seed.rows.map((r) => [r.slug, { ...r, live: false }]));
const rescanAt = new Map();

const slugOf = (u) => {
  try { return new URL(u.startsWith('http') ? u : `https://${u}`).hostname.replace(/^www\./, ''); }
  catch { return null; }
};

function shareUrl(text) {
  return quoteIntent(text, ENTRY_POST_ID);
}

function boardShareText() {
  const rows = [...board.values()].filter((r) => r.ok).sort((a, b) => b.score - a.score);
  const top = rows[0];
  const aws = rows.find((r) => r.name === 'AWS');
  return `Every cloud provider's homepage, scored by what an AI agent can actually use.\n\n${top.name} leads at ${top.score}/100.${aws ? ` AWS: ${aws.score}.` : ''}\n\n${APP}`;
}

function bar(score, w = 30) {
  const on = Math.round((score / 100) * w);
  const cls = score >= 70 ? 'on' : score >= 45 ? 'on mid' : 'on low';
  let out = '';
  for (let i = 0; i < w; i++) out += `<i class="${i < on ? cls : ''}"></i>`;
  return out;
}

const HEAD = `<style>
.rank-table{width:100%;border-collapse:collapse}
.rank-table td,.rank-table th{padding:9px 10px;border-bottom:1px solid var(--line-soft);text-align:left;vertical-align:middle}
.rank-table th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--dimmer)}
.rank-table tr:hover td{background:var(--panel2)}
.rnum{font-family:var(--mono);color:var(--dimmer);width:2.2em}
.pname{font-weight:600}
.pname a{color:var(--ink);text-decoration:none}
.pname a:hover{color:var(--acid)}
.scorebar{display:flex;gap:1px;align-items:center}
.scorebar i{width:5px;height:14px;background:var(--line);display:inline-block}
.scorebar i.on{background:var(--acid)}
.scorebar i.on.mid{background:#e0c23c}
.scorebar i.on.low{background:#e05c3c}
.scorenum{font-family:var(--mono);font-size:20px;min-width:2.4em;display:inline-block}
.gr-badge{font-family:var(--mono);font-size:12px;border:1px solid var(--line);padding:2px 7px;border-radius:3px}
.gr-A{border-color:var(--acid);color:var(--acid)}
.gr-B{color:#9bd}
.gr-C{color:#dc4}
.gr-D,.gr-E,.gr-F{color:#e05c3c}
.muted2{color:var(--dimmer);font-size:12px}
.tag-dead{color:#e05c3c;font-size:11px;font-family:var(--mono)}
.scanbox{display:flex;gap:8px;margin:22px 0}
.scanbox input{flex:1;background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:12px 14px;font-family:var(--mono);font-size:14px;border-radius:4px}
.scanbox input:focus{outline:none;border-color:var(--acid)}
.btn2{background:var(--acid);color:#0a0c07;border:0;padding:12px 18px;font-family:var(--mono);font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.btn-ghost2{background:transparent;color:var(--ink);border:1px solid var(--line);padding:10px 14px;font-family:var(--mono);font-size:12px;border-radius:4px;text-decoration:none;display:inline-block}
.btn-ghost2:hover{border-color:var(--acid);color:var(--acid)}
.dimrow{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line-soft);font-size:13px}
.dimrow .lbl{width:190px;color:var(--dim)}
.dimrow .pct{font-family:var(--mono);width:3.4em;text-align:right}
.fixline{color:var(--dimmer);font-size:12px;margin-top:3px}
.fail-block{border-left:2px solid #e05c3c;padding:8px 14px;margin:10px 0;background:var(--panel)}
.warn-block{border-left:2px solid #e0c23c;padding:8px 14px;margin:10px 0;background:var(--panel)}
.big-score{font-family:var(--mono);font-size:72px;line-height:1;letter-spacing:-.04em}
.live-note{font-size:11px;color:var(--dimmer);font-family:var(--mono)}
@media(max-width:720px){.dimrow .lbl{width:110px}.big-score{font-size:52px}}
</style>`;

const header = (active) => `<header class="top"><a class="brand" href="/"><span class="dot"></span>AgentRank</a>
<nav><a href="/#board">Board</a><a href="/method">Method</a><a href="https://agentscore.synteq.app">Full scanner</a></nav></header>`;

const footer = `<footer class="bot"><span>Every score is computed from the HTML the provider actually ships — no models, no opinions, every point traceable to a check.</span><span>Built on <a href="https://synteq.com" style="color:var(--dimmer)">Synteq Apps</a>. Scanned pages are not stored.</span></footer>`;

function page({ title, description, body, ogImage = `${APP}/og.svg`, challenger = null }) {
  return shell({ title, description, body, head: HEAD, nav: false, footer: false, ogImage, challenger })
    .replace('<div class="wrap">', `<div class="wrap">${header()}`)
    .replace('</div></body></html>', `${footer}</div></body></html>`);
}

function boardPage() {
  const rows = [...board.values()].sort((a, b) => (b.score - a.score) || String(a.name).localeCompare(b.name));
  const okRows = rows.filter((r) => r.ok);
  const mean = Math.round(okRows.reduce((n, r) => n + r.score, 0) / okRows.length);
  const sub70 = okRows.filter((r) => r.score < 70).length;
  const dead = rows.filter((r) => !r.ok);
  const gen = new Date(seed.generated).toISOString().slice(0, 10);

  const trs = rows.map((r) => {
    if (!r.ok) {
      return `<tr><td class="rnum">—</td><td class="pname"><a href="/s/${esc(r.slug)}">${esc(r.name)}</a></td>
<td colspan="3"><span class="tag-dead">✕ agent turned away at the door (${esc((r.error || '').slice(0, 40))})</span></td>
<td class="muted2">score 0</td></tr>`;
    }
    return `<tr><td class="rnum">${r.rank}</td><td class="pname"><a href="/s/${esc(r.slug)}">${esc(r.name)}</a></td>
<td><span class="scorenum">${r.score}</span></td>
<td><span class="scorebar">${bar(r.score)}</span></td>
<td><span class="gr-badge gr-${r.grade}">${r.grade}</span></td>
<td class="muted2">${r.live ? '● live rescan' : 'board ' + gen}</td></tr>`;
  }).join('');

  const body = `
<h1>Who can agents actually <em>use</em>?</h1>
<p class="lede">We sent a software agent to read the homepage of every major cloud provider — no eyes, no JavaScript, just the HTML they ship. This is the scoreboard of who built for the next reader and who is still writing for humans only.</p>

<div class="grid3">
<div><div class="stat">${mean}<span class="u">/100 mean</span></div><div class="muted2">across ${okRows.length} providers scanned</div></div>
<div><div class="stat">${sub70}<span class="u">of ${okRows.length}</span></div><div class="muted2">score below 70 — half-legible or worse</div></div>
<div><div class="stat">${dead.length}<span class="u">blocked</span></div><div class="muted2">refused the agent at the door entirely</div></div>
</div>

<form class="scanbox" action="/scan" method="get">
<input name="url" placeholder="your-domain.com — score yours against the board" autocomplete="off">
<button class="btn2" type="submit">Score it</button>
</form>

<div style="display:flex;gap:10px;margin:4px 0 26px;flex-wrap:wrap">
<a class="btn2" href="${shareUrl(boardShareText())}" target="_blank" rel="noopener">Quote-Post the Board (+3 pts)</a>
<a class="btn-ghost2" href="${grokReplyUrl(`@grok fact-check this: every cloud provider's homepage scored by what an AI agent can actually use. The board: ${APP}`)}" target="_blank" rel="noopener">Ask Grok in Thread (+2 pts)</a>
<a class="btn-ghost2" href="${repostIntent(ENTRY_POST_ID)}" target="_blank" rel="noopener">1-Click Repost (+3 pts)</a>
<a class="btn-ghost2" href="/api/board" target="_blank" rel="noopener">JSON</a>
</div>

<h2 id="board">The board</h2>
<table class="rank-table">
<thead><tr><th></th><th>Provider</th><th>Score</th><th></th><th>Grade</th><th>Data</th></tr></thead>
<tbody>${trs}</tbody>
</table>
<p class="muted2" style="margin-top:14px">Click a provider for the evidence: what the agent saw, what it missed, and exactly what each fix is worth. Rescan any provider live from their detail page.</p>`;

  return page({
    title: 'AgentRank — every cloud provider scored by agent-readability',
    description: 'We asked an AI agent to read the homepage of every major cloud provider. Half of them are illegible to the machines they sell to.',
    body,
  });
}

function detailPage(slug) {
  const r = board.get(slug);
  if (!r) return null;
  const rows = [...board.values()].filter((x) => x.ok).sort((a, b) => b.score - a.score);
  const rank = r.ok ? rows.findIndex((x) => x.slug === slug) + 1 : null;

  let body;
  if (!r.ok) {
    body = `<a href="/" style="color:var(--dimmer);font-size:12px">← board</a>
<h1>${esc(r.name)}</h1>
<div class="fail-block"><strong>Score 0 — agent turned away.</strong>
<div class="fixline">${esc(r.error || 'fetch failed')}. The agent never even saw the page. For a company that sells compute to machines, this is the worst possible first impression.</div></div>
<p><a class="btn-ghost2" href="${shareUrl(`${r.name}'s homepage refuses AI agents entirely — score 0/100. See how every cloud ranks: ${APP}`)}" target="_blank" rel="noopener">Post this on X</a>
<a class="btn-ghost2" href="/s/${esc(slug)}?rescan=1">Rescan now</a></p>`;
  } else {
    const dimRows = r.dims.map((d) => `<div class="dimrow"><span class="lbl">${esc(d.label)}</span>
<span class="scorebar">${bar(d.score, 20)}</span><span class="pct">${d.score}%</span></div>`).join('');
    const fails = (r.fails || []).map((f) => `<div class="fail-block"><strong>${esc(f.title)}</strong>
<div class="fixline">${esc(f.detail)}${f.fix ? ` Fix: ${esc(f.fix)}` : ''}</div></div>`).join('');
    const warns = (r.warns || []).slice(0, 3).map((f) => `<div class="warn-block"><strong>${esc(f.title)}</strong>
<div class="fixline">${esc(f.detail)}${f.fix ? ` Fix: ${esc(f.fix)}` : ''}</div></div>`).join('');
    body = `<a href="/" style="color:var(--dimmer);font-size:12px">← board</a>
<h1>${esc(r.name)}</h1>
<p class="lede">${esc(r.tlDr || '')}</p>
<div style="display:flex;align-items:end;gap:24px;margin:18px 0">
<div class="big-score">${r.score}</div>
<div><span class="gr-badge gr-${r.grade}" style="font-size:18px">${r.grade}</span>
<div class="muted2" style="margin-top:6px">#${rank} of ${rows.length} · ${verdict(r.score)}<br>${r.live ? 'live rescan' : 'board data'} · ${esc((r.fetchedAt || '').slice(0, 10))}</div></div>
</div>
<h2>Seven dimensions</h2>${dimRows}
<h2>What the agent couldn't do</h2>${fails || '<p class="muted2">No hard failures — rare.</p>'}${warns}
<div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
<a class="btn2" href="${shareUrl(`${r.name} scores ${r.score}/100 for AI agents — ranked #${rank} of ${rows.length} clouds. The whole board: ${APP}`)}" target="_blank" rel="noopener">Post this score on X</a>
<a class="btn-ghost2" href="/s/${esc(slug)}?rescan=1">Rescan live</a>
<a class="btn-ghost2" href="https://agentscore.synteq.app/?url=${encodeURIComponent(r.url)}" target="_blank" rel="noopener">Full AgentScore report</a>
</div>`;
  }
  return page({ title: `${r.name} on AgentRank`, description: `${r.name} agent-readability score on AgentRank`, body });
}

function scanPage(input, r) {
  const score = r.scored.score;
  const g = grade(score);
  const dimRows = r.scored.dims.map((d) => `<div class="dimrow"><span class="lbl">${esc(d.label)}</span>
<span class="scorebar">${bar(d.score, 20)}</span><span class="pct">${d.score}%</span></div>`).join('');
  const fails = r.scored.fails.slice(0, 3).map((f) => `<div class="fail-block"><strong>${esc(f.title)}</strong>
<div class="fixline">${esc(f.detail)}${f.fix ? ` Fix: ${esc(f.fix)}` : ''}</div></div>`).join('');
  const rows = [...board.values()].filter((x) => x.ok).sort((a, b) => b.score - a.score);
  const betterThan = rows.filter((x) => x.score < score).length;
  const body = `<a href="/" style="color:var(--dimmer);font-size:12px">← board</a>
<h1>${esc(r.page.host)}</h1>
<p class="lede">${esc(r.tlDr)}</p>
<div style="display:flex;align-items:end;gap:24px;margin:18px 0">
<div class="big-score">${score}</div>
<div><span class="gr-badge gr-${g}" style="font-size:18px">${g}</span>
<div class="muted2" style="margin-top:6px">${verdict(score)} · outscores ${betterThan} of ${rows.length} clouds on the board</div></div>
</div>
<h2>Seven dimensions</h2>${dimRows}
<h2>Top blockers</h2>${fails || '<p class="muted2">No hard failures.</p>'}
<div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap">
<a class="btn2" href="${shareUrl(`${r.page.host} scores ${score}/100 for AI agents — that outranks ${betterThan} of ${rows.length} cloud providers. Score yours: ${APP}`)}" target="_blank" rel="noopener">Post my score on X</a>
<a class="btn-ghost2" href="https://agentscore.synteq.app/?url=${encodeURIComponent(r.page.url)}" target="_blank" rel="noopener">Full AgentScore report</a>
<a class="btn-ghost2" href="/">Back to the board</a>
</div>`;
  return page({ title: `${r.page.host} scored ${score}/100 — AgentRank`, description: r.tlDr, body });
}

const methodPage = page({
  title: 'Method — AgentRank',
  description: 'How AgentRank scores cloud provider homepages for agent-readability.',
  body: `<a href="/" style="color:var(--dimmer);font-size:12px">← board</a>
<h1>Method</h1>
<p class="lede">One HTTP GET per homepage, the same way an agent fetches a page. No browser, no JavaScript execution, no model in the scoring path. Every point maps to a specific check you can verify by hand.</p>
<h2>Seven dimensions, 100 points</h2>
<p><strong>Structure (16)</strong> — one H1, nested headings, <code>&lt;main&gt;</code>/<code>&lt;nav&gt;</code> landmarks.<br>
<strong>Machine facts (14)</strong> — title, meta description, canonical, Open Graph, lang, viewport.<br>
<strong>Structured data (12)</strong> — JSON-LD types an agent can cite.<br>
<strong>Textual content (18)</strong> — real words before any script runs; an agent that can't run JS still gets the product.<br>
<strong>Navigation &amp; links (14)</strong> — descriptive link text, working internal routes, docs reachable.<br>
<strong>Interactive affordances (12)</strong> — labeled form fields, named buttons.<br>
<strong>Agent policy (14)</strong> — robots.txt stance on AI crawlers, sitemap, llms.txt presence.</p>
<h2>Why the homepage</h2>
<p>It's the page every agent hits first when a user says "check their pricing" or "compare these providers." If an agent can't parse the front door, it can't do the job — and the user never learns why the comparison came back wrong.</p>
<h2>Fairness notes</h2>
<p>Scores reflect each homepage's static HTML on the scan date shown. "Agent turned away" means the site refused our fetch (403/bot-wall) — the worst possible outcome, scored 0. Rescan any provider from its detail page; live rescans are marked.</p>`,
});

function json(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' });
  res.end(b);
}

function send(res, code, type, body) {
  res.writeHead(code, { 'content-type': type });
  res.end(body);
}

async function rescan(r) {
  const now = Date.now();
  if (now - (rescanAt.get(r.slug) || 0) < 60000) return { wait: true };
  rescanAt.set(r.slug, now);
  try {
    const fresh = await analyze(r.url, { timeout: 15000 });
    const upd = {
      ...r, ok: true, live: true,
      score: fresh.scored.score, grade: grade(fresh.scored.score),
      dims: fresh.scored.dims.map((d) => ({ key: d.key, label: d.label, weight: d.weight, score: d.score })),
      fails: fresh.scored.fails.slice(0, 4).map((f) => ({ title: f.title, detail: f.detail, fix: f.fix })),
      warns: fresh.scored.warns.slice(0, 4).map((f) => ({ title: f.title, detail: f.detail, fix: f.fix })),
      tlDr: fresh.tlDr, fetchedAt: fresh.fetchedAt,
    };
    board.set(r.slug, upd);
    const rows = [...board.values()].filter((x) => x.ok).sort((a, b) => b.score - a.score);
    rows.forEach((x, i) => (x.rank = i + 1));
    return { row: upd };
  } catch (e) {
    return { error: e.message };
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
    const p = url.pathname;

    if (p === '/og.svg' || p === '/og.png') {
      const cardOpts = {
        app: 'AGENTRANK - CLOUD INDEX',
        title: url.searchParams.get('title') || '30 Cloud Providers, Scored by an Agent',
        score: url.searchParams.get('score') || 'NETLIFY 89 - SYNTEQ 81',
        subtitle: url.searchParams.get('sub') || 'DO 54 - Vultr 0 (refused) - Deterministic raw HTML rubric',
        badge: 'CLOUD LEADERBOARD',
      };
      if (p === '/og.png') return send(res, 200, 'image/png', renderOgPng(cardOpts));
      return send(res, 200, 'image/svg+xml; charset=utf-8', renderOgSvg(cardOpts));
    }
    if (p === '/') return send(res, 200, 'text/html; charset=utf-8', boardPage());
    if (p === '/method') return send(res, 200, 'text/html; charset=utf-8', methodPage);
    if (p === '/healthz') return send(res, 200, 'text/plain', 'ok');
    if (p === '/llms.txt') {
      const rows = [...board.values()].filter((r) => r.ok).sort((a, b) => b.score - a.score);
      const txt = `# AgentRank\n\n> Every major cloud provider's homepage scored 0-100 by what an AI agent can actually use — one GET, raw HTML, no JavaScript, no models in the scoring path.\n\n## The board\n\n${rows.map((r) => `- [${r.name} — ${r.score}/100 (${r.grade})](${APP}/s/${r.slug})`).join('\n')}\n\n## Data\n\n- [Full board as JSON](${APP}/api/board)\n- [Method](${APP}/method)\n- [Score any URL live](${APP}/scan?url=)\n\n## Optional\n\n- [Built on Synteq](https://synteq.com/)\n`;
      return send(res, 200, 'text/plain; charset=utf-8', txt);
    }

    if (p === '/api/board') {
      return json(res, 200, {
        generated: seed.generated,
        count: board.size,
        rows: [...board.values()].sort((a, b) => b.score - a.score).map((r) => ({
          rank: r.rank, name: r.name, host: r.slug, score: r.score, grade: r.grade,
          ok: r.ok, error: r.ok ? undefined : r.error, live: r.live, scannedAt: r.fetchedAt,
        })),
      });
    }

    if (p === '/scan') {
      const input = url.searchParams.get('url');
      if (!input) { res.writeHead(302, { location: '/' }); return res.end(); }
      try {
        const r = await analyze(input);
        return send(res, 200, 'text/html; charset=utf-8', scanPage(input, r));
      } catch (e) {
        const code = e instanceof HttpError ? e.status || 400 : 500;
        const body = `<a href="/" style="color:var(--dimmer);font-size:12px">← board</a>
<h1>Couldn't scan that.</h1><div class="fail-block">${esc(e.message)}</div>
<p><a class="btn-ghost2" href="/">Back to the board</a></p>`;
        return send(res, code, 'text/html; charset=utf-8', page({ title: 'Scan failed — AgentRank', description: 'scan failed', body }));
      }
    }

    const m = p.match(/^\/s\/([a-z0-9.-]+)$/i);
    if (m) {
      const r = board.get(m[1]);
      if (!r) return send(res, 404, 'text/html; charset=utf-8', page({ title: 'Not found — AgentRank', description: '', body: '<h1>Not on the board.</h1><p><a class="btn-ghost2" href="/">Back</a></p>' }));
      if (url.searchParams.get('rescan')) {
        const out = await rescan(r);
        if (out.wait) return send(res, 200, 'text/html; charset=utf-8', detailPage(m[1]));
      }
      return send(res, 200, 'text/html; charset=utf-8', detailPage(m[1]));
    }

    send(res, 404, 'text/plain', 'not found');
  } catch (e) {
    send(res, 500, 'text/plain', 'server error');
  }
});

server.listen(PORT, () => console.log(`agentrank on :${PORT}`));
