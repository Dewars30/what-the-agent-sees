import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, HttpError } from './core/page.mjs';
import { shell, esc, quoteIntent, replyIntent, repostIntent, viralBar, renderOgSvg, renderOgPng } from './core/kit.mjs';
import { synteqPage, demoDocument, DEMO_CSP } from './synteq-page.mjs';
import { buildFix } from './fix.mjs';
import { packReport, kitSection, reportShell } from './report.mjs';
import { handleGithub, githubFixEnabled } from './github-fix.mjs';

const NAV = [
  ['/index', 'The index'],
  ['/method', 'Method'],
  ['/synteq', 'Synteq'],
];
function view(opts) {
  return shell({
    ...opts,
    navLinks: NAV,
    footerNote: 'No tracking. Reports stay in the link, not on the server.',
  });
}

function readBody(req, limit = 32768) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    let failed = false;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit) {
        failed = true;
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', (e) => { if (!failed) reject(e); });
  });
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PUBLIC_ORIGIN || 'https://agentscore.synteq.app';
const ENTRY = process.env.ENTRY_TWEET_ID || process.env.ENTRY_POST_ID || '2112816202309374003';
const intent = (text, reply) => (reply ? replyIntent(text, ENTRY) : quoteIntent(text, ENTRY));

function loadRefused() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dir, 'refused.json'), 'utf8'));
  } catch {
    return { blocked: [], scored: [] };
  }
}

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dir, 'index.json'), 'utf8'));
  } catch {
    return { generated: null, rows: [] };
  }
}

function ticks(score) {
  const on = Math.round((score / 100) * 40);
  const cls = score >= 70 ? 'on' : score >= 45 ? 'on mid' : 'on low';
  let out = '';
  for (let i = 0; i < 40; i++) out += `<i class="${i < on ? cls : ''}"></i>`;
  return out;
}

function highlightAgentView(text) {
  return esc(text)
    .replace(/^(url|title|description|lang|\[main\]|\[nav\]|\[header\]|\[footer\]|\[buttons\]|\[images\]|\[json-ld\]|\[form\])/gm, '<span class="k">$1</span>')
    .replace(/\((none|unset|empty)\)/g, '<span class="m">($1)</span>')
    .replace(/→|…/g, '<span class="m">$&</span>');
}

function findingRow(f) {
  const label = f.level === 'fail' ? 'Blocker' : f.level === 'warn' ? 'Weak' : 'Fine';
  return `<div class="finding ${f.level}">
    <h4><span class="tag ${f.level}">${label}</span>${esc(f.title)}</h4>
    <p>${esc(f.detail)}</p>
    ${f.fix ? `<p class="fix">→ ${esc(f.fix)}</p>` : ''}
    ${f.worth ? `<p class="worth">worth up to +${f.worth} pts</p>` : ''}
  </div>`;
}

function resultView(r, rawInput, kitInfo = null) {
  const { scored, page } = r;
  const shareText = `${page.host} scores ${scored.score}/100 for AI agents (${scored.verdict}).\n\nCan your site beat ${page.host}'s ${scored.score}/100? ${APP}/?beat=${scored.score}&rival=${encodeURIComponent(page.host)}`;
  const grokText = `${page.host} scores ${scored.score}/100 on how usable it is to an AI agent, with ${scored.fails.length} blockers. @grok verify this\n\nscored by ${APP}/?url=${encodeURIComponent(page.url)}`;
  const dims = scored.dims
    .map((d) => {
      const tone = d.score >= 70 ? 'var(--acid)' : d.score >= 45 ? 'var(--amber)' : 'var(--red)';
      return `<div class="dim"><span class="lbl">${esc(d.label)}</span>
      <span class="bar"><i style="width:${d.score}%;background:${tone}"></i></span><span class="val">${d.score}</span></div>`;
    })
    .join('');
  const order = { fail: 0, warn: 1, ok: 2 };
  const findings = [...scored.findings]
    .sort((a, b) => order[a.level] - order[b.level] || (b.worth || 0) - (a.worth || 0))
    .slice(0, 16);
  const fails = scored.fails.length;
  const topThree = [...scored.findings].filter((f) => f.level !== 'ok').sort((a, b) => (b.worth || 0) - (a.worth || 0)).slice(0, 3);
  const recoverable = topThree.reduce((n, f) => n + (f.worth || 0), 0);

  return view({
    title: `${page.host} — ${scored.score}/100 · AgentScore`,
    description: `${page.host} scores ${scored.score}/100 for how well an AI agent can read and act on it. ${scored.verdict}.`,
    ogImage: `${APP}/og.svg?title=${encodeURIComponent(page.host)}&score=${encodeURIComponent(`${scored.score}/100`)}&sub=${encodeURIComponent(`Grade ${scored.grade} · ${scored.verdict}`)}`,
    body: `
<main>
  <p class="kicker" style="margin:34px 0 0">Report · ${esc(new Date(r.fetchedAt).toUTCString().replace('GMT', 'UTC'))}</p>
  <section class="card" style="margin-top:12px">
    <div class="scorewrap">
      <div>
        <div class="scorenum" data-target="${scored.score}">0<span class="of">/100</span></div>
        <div class="grade">Grade ${esc(scored.grade)}</div>
      </div>
      <div>
        <div class="kicker">Verdict</div>
        <div class="verdict">${esc(scored.verdict)}</div>
        <div class="ticks">${ticks(scored.score)}</div>
        <div class="hostline">${esc(page.host)}${page.title ? ' · ' + esc(page.title.slice(0, 80)) : ''}</div>
      </div>
    </div>
    <div class="dims">${dims}</div>
    <div class="cols">
      <div class="col">
        <div class="kicker">What the agent receives</div>
        <pre class="agent" id="agentview">${highlightAgentView(r.agentView)}</pre>
      </div>
      <div class="col">
        <div class="kicker">${fails} blocker${fails === 1 ? '' : 's'} · ${scored.warns.length} weak spot${scored.warns.length === 1 ? '' : 's'}</div>
        <p class="muted small" style="margin:8px 0 0">Fix the top three and the score moves about <span class="mono" style="color:var(--acid)">+${recoverable}</span>.</p>
        <div style="margin-top:14px">${findings.map(findingRow).join('')}</div>
      </div>
    </div>
    <div class="actions">
      <a class="btn primary" target="_blank" rel="noopener" href="${intent(shareText, false)}">Quote-Post Score (+3 pts)</a>
      <a class="btn" target="_blank" rel="noopener" href="${intent(grokText, true)}">Ask @grok in Thread (+2 pts)</a>
      <a class="btn" target="_blank" rel="noopener" href="${repostIntent(ENTRY)}">1-Click Repost (+3 pts)</a>
      <a class="btn" href="https://agentornot.synteq.app/duel?a=${encodeURIComponent(page.host)}&b=synteq.com">1v1 Cage Match →</a>
      <a class="btn" href="/?url=${encodeURIComponent(page.url)}">Rescan</a>
      <a class="btn" href="/">Check another site</a>
    </div>
  </section>
  <section class="card pad">
    <div class="kicker">Summary</div>
    <p class="muted small" style="margin:10px 0 0;max-width:76ch">${esc(r.tlDr)} The page answered ${esc(page.lang ? 'lang=' + page.lang : 'no lang')}, ${page.headings.length} headings, ${page.links.length} links, ${page.forms.length} form${page.forms.length === 1 ? '' : 's'}, ${page.images.length} images, and ${page.mainWords} words of text before any script executed.</p>
  </section>
  ${kitInfo?.packed ? kitSection(kitInfo.packed, APP, { github: githubFixEnabled() }) : ''}
  ${kitInfo?.error ? '<section class="card pad"><div class="kicker">Fix kit</div><p class="muted small">Fix kit did not run on this page.</p></section>' : ''}
</main>
<script>
(() => {
  const el = document.querySelector('.scorenum[data-target]');
  if (el) {
    const target = Number(el.dataset.target); let n = 0;
    const step = Math.max(1, Math.round(target / 28));
    const t = setInterval(() => { n = Math.min(target, n + step); el.firstChild.textContent = String(n); if (n >= target) clearInterval(t); }, 22);
  }
  document.querySelectorAll('.dim .bar i').forEach((bar, i) => {
    const w = bar.style.width; bar.style.width = '0%';
    setTimeout(() => { bar.style.width = w; }, 120 + i * 70);
  });
  const av = document.getElementById('agentview');
  if (av) av.scrollTop = 0;
})();
</script>`,
  });
}

function blockedView(r, rawInput) {
  const { blocked, page } = r;
  const shareText = `${blocked.host} answered a machine with ${blocked.status === 200 ? 'a bot check' : 'HTTP ' + blocked.status}. To an AI agent that is a 0/100.\n\n${APP}`;
  const grokText = `${blocked.host} refuses to serve a non-browser client, so it scores 0/100 for AI agents. @grok is blocking agents now a strategy or an accident\n\n${APP}/?url=${encodeURIComponent('https://' + blocked.host)}`;
  return view({
    title: `${blocked.host} — 0/100 · AgentScore`,
    description: `${blocked.host} does not serve a readable page to a client that is not a browser. To an agent, that is a zero.`,
    body: `<main>
  <p class="kicker" style="margin:34px 0 0">Report · the site declined to be read</p>
  <section class="card" style="margin-top:12px">
    <div class="scorewrap">
      <div><div class="scorenum" data-target="0">0<span class="of">/100</span></div><div class="grade">Grade F</div></div>
      <div>
        <div class="kicker">Verdict</div>
        <div class="verdict">Invisible</div>
        <div class="ticks">${ticks(0)}</div>
        <div class="hostline">${esc(blocked.host)} · ${esc(blocked.reason)}</div>
      </div>
    </div>
    <div class="cols">
      <div class="col">
        <div class="kicker">What the agent receives</div>
        <pre class="agent">url: https://${esc(blocked.host)}/
title: (none)
description: (none)
lang: (unset)  headings: 0  links: 0  forms: 0  images: 0

[main]
  (nothing. the server declined.)</pre>
      </div>
      <div class="col">
        <div class="kicker">Why this is a zero, not an error</div>
        <div style="margin-top:14px">
          <div class="finding fail"><h4><span class="tag fail">Blocker</span>The page never arrived</h4>
          <p>We sent one plain HTTP request with an honest user agent. ${esc(blocked.reason)} Whatever is behind that gate may be excellent, and no agent will ever cite it.</p>
          <p class="fix">→ If you want agent traffic, serve a readable fallback and put the important facts in it.</p></div>
          <div class="finding warn"><h4><span class="tag warn">Context</span>This is often deliberate</h4>
          <p>Bot protection exists for real reasons: scraping, cost, abuse. The trade is that retrieval systems, assistants and agents also get the door, and they do not come back later.</p>
          <p class="fix">→ /llms.txt and structured data cost nothing even when the HTML stays behind a gate.</p></div>
        </div>
      </div>
    </div>
    <div class="actions">
      <a class="btn primary" target="_blank" rel="noopener" href="${intent(shareText, false)}">Post this</a>
      <a class="btn" target="_blank" rel="noopener" href="${intent(grokText, true)}">Ask @grok about it</a>
      <a class="btn" href="/">Check another site</a>
    </div>
  </section>
</main>`,
  });
}

function landing(err, challenger = null) {
  const idx = loadIndex();
  const top = idx.rows.slice(0, 5);
  const rows = top
    .map((r) => `<tr><td><a href="/?url=${encodeURIComponent('https://' + r.host)}">${esc(r.host)}</a></td><td class="s">${r.score}</td></tr>`)
    .join('');
  return view({
    title: 'AgentScore — how your site looks to an AI agent',
    description: 'Paste a URL. Get a 0-100 score on whether an AI agent can actually read and act on your site, plus the exact fixes.',
    ogImage: `${APP}/og.svg`,
    challenger,
    body: `<main>
  <h1 class="hero">Your site, as an<br><span class="accent">AI agent</span> sees it.</h1>
  <p class="sub">Agents do not see your design. They see headings, link text, form labels, alt text, robots rules and a document that may be empty until JavaScript runs. Paste a URL and get a 0-100 score, the raw view the agent gets, and the fixes that move the number.</p>
  <form class="scan" method="get" action="/">
    <input name="url" placeholder="yourdomain.com" autocomplete="off" spellcheck="false" autofocus value="${esc(err?.value || '')}">
    <button type="submit">Scan</button>
  </form>
  <div class="hintrow"><span style="align-self:center;letter-spacing:.18em">TRY</span>
    ${['stripe.com', 'digitalocean.com', 'linear.app', 'heroku.com', 'github.com'].map((h) => `<button type="button" data-u="${h}">${h}</button>`).join('')}
  </div>
  ${err ? `<section class="card pad" style="margin-top:26px"><div class="err">${esc(err.message)}</div></section>` : ''}
  <section class="grid3" style="margin-top:34px">
    <div><div class="kicker">Not a Lighthouse score</div><p class="muted small" style="margin:8px 0 0">Accessibility audits answer "can a person with a screen reader use this". This answers "can a machine decide what this page is and what to do next".</p></div>
    <div><div class="kicker">Deterministic</div><p class="muted small" style="margin:8px 0 0">No model in the scoring path. Seven weighted dimensions, every point traced to a check you can fix today.</p></div>
    <div><div class="kicker">Seven dimensions</div><p class="muted small" style="margin:8px 0 0">Structure, machine facts, structured data, actionability, legibility, entry &amp; permission, and how much content exists without JavaScript.</p></div>
  </section>
  ${top.length ? `<section class="card pad" style="margin-top:4px"><div style="display:flex;justify-content:space-between;align-items:baseline"><div class="kicker">Top of the index</div><a class="kicker" href="/index" style="text-decoration:none;color:var(--acid)">All ${idx.rows.length} →</a></div>
  <table class="idx" style="margin-top:14px">${rows}</table></section>` : ''}
</main>
<script>document.querySelectorAll('[data-u]').forEach(b=>b.addEventListener('click',()=>{const i=document.querySelector('input[name=url]');i.value=b.dataset.u;i.form.submit();}));</script>`,
  });
}

function indexView() {
  const idx = loadIndex();
  const rows = idx.rows
    .map(
      (r, i) => `<tr><td class="muted">${String(i + 1).padStart(2, '0')}</td>
      <td><a href="/?url=${encodeURIComponent('https://' + r.host)}">${esc(r.host)}</a></td>
      <td class="s">${r.score}</td><td class="s muted">${esc(r.grade)}</td>
      <td class="s muted">${esc(r.verdict)}</td></tr>`
    )
    .join('');
  return view({
    title: 'The index — AgentScore',
    description: 'Agent-readiness scores for well-known developer-facing homepages, measured the same way for everyone.',
    body: `<main>
  <h1 class="hero" style="font-size:clamp(26px,4vw,40px)">The agent-readability index</h1>
  <p class="sub">Every site below was fetched and scored by the same code, from a plain HTTP client, no cookies, no render step.${idx.generated ? ` Measured ${esc(idx.generated)}.` : ''}</p>
  <section class="card" style="margin-top:26px;padding:22px">
    <table class="idx"><thead><tr><th>#</th><th>Host</th><th style="text-align:right">Score</th><th style="text-align:right">Grade</th><th style="text-align:right">Verdict</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </section>
  <p class="muted small">Scores move when sites change. Rescan any row to get the current number.</p>
</main>`,
  });
}

function refusedView() {
  const d = loadRefused();
  const blocked = [...d.blocked].sort((a, b) => a.host.localeCompare(b.host));
  const shells = [...d.scored].filter((x) => x.words < 20).sort((a, b) => a.words - b.words);
  const total = blocked.length + d.scored.length;
  const rows = [
    ...blocked.map((b) => `<tr><td><a href="/?url=${encodeURIComponent('https://' + b.host)}">${esc(b.host)}</a></td><td class="s" style="color:var(--red)">${b.status}</td><td class="s muted">refused</td></tr>`),
    ...shells.map((x) => `<tr><td><a href="/?url=${encodeURIComponent('https://' + x.host)}">${esc(x.host)}</a></td><td class="s" style="color:var(--amber)">${x.words}</td><td class="s muted">words sent</td></tr>`),
  ].join('');
  return view({
    title: `The sites that refuse to be read · AgentScore`,
    description: `Of ${total} well-known websites fetched by a plain HTTP client, ${blocked.length} refused to answer and ${shells.length} sent a page with no content.`,
    body: `<main>
  <h1 class="hero" style="font-size:clamp(26px,4vw,40px)">The sites that refuse to be read</h1>
  <p class="sub">${total} household names, one plain HTTP request each, honest user agent, no cookies, no JavaScript. ${blocked.length} answered with a bot check or an error instead of the page. ${shells.length} more sent HTML with effectively no words in it. To an agent, all ${blocked.length + shells.length} are the same thing: nothing.</p>
  <section class="card" style="margin-top:26px;padding:22px">
    <table class="idx"><thead><tr><th>Host</th><th style="text-align:right">Status</th><th style="text-align:right">What we got</th></tr></thead><tbody>${rows}</tbody></table>
  </section>
  <p class="muted small" style="max-width:70ch">Measured ${esc(new Date().toISOString().slice(0, 10))}. Status 200 with a challenge page counts as a refusal: the body is a JavaScript puzzle, not the site. Rescan any row to see the current answer.</p>
</main>`,
  });
}

function methodView() {
  return view({
    title: 'Method — AgentScore',
    description: 'The seven weighted dimensions behind the AgentScore number, and what each one costs you.',
    body: `<main>
  <h1 class="hero" style="font-size:clamp(26px,4vw,40px)">How the number is made</h1>
  <p class="sub">One HTTP request, one robots.txt, one llms.txt. Seven dimensions, weighted to 100. No model, no lighthouse, no opinion.</p>
  <section class="card pad" style="margin-top:26px">
    ${[
      ['Structure', '16', 'One H1, a real heading outline with no skipped levels, and <main>/<nav> landmarks. Without these an agent guesses where content starts.'],
      ['Machine-readable facts', '14', 'Title and description at usable lengths, canonical, Open Graph, twitter:card, lang, viewport.'],
      ['Structured data', '12', 'schema.org JSON-LD that names the entity: Organization, WebSite, Product, FAQPage, BreadcrumbList.'],
      ['Actionability', '14', 'Labeled inputs, named buttons, internal links, an obvious next step an agent can take on your behalf.'],
      ['Legibility', '16', 'Alt text coverage, link text that names its destination instead of "learn more", enough real prose to summarize.'],
      ['Entry & permission', '12', 'Whether robots.txt lets AI crawlers in, whether a sitemap exists, whether /llms.txt exists.'],
      ['Content without JavaScript', '16', 'How many words are in the response before hydration. If your HTML is a mount point, the agent sees a mount point.'],
    ].map(([k, w, d]) => `<div style="display:grid;grid-template-columns:26px 1fr;gap:14px;padding:16px 0;border-top:1px solid var(--line-soft)">
      <div class="mono" style="color:var(--acid);font-size:11px">${w}</div>
      <div><div style="font-weight:600;font-size:14px">${k}</div><p class="muted small" style="margin:5px 0 0">${d}</p></div></div>`).join('')}
  </section>
  <section class="card pad">
    <div class="kicker">What this is not</div>
    <p class="muted small" style="margin:10px 0 0">It is not a ranking factor, not a search console, and not a guarantee. It is one honest measurement of a question most sites have never been asked: if an agent lands here with no eyes, what can it actually do?</p>
  </section>
</main>`,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (code, type, body, extra) => {
    res.writeHead(code, {
      'content-type': type,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...(extra || {}),
    });
    res.end(body);
  };
  try {
    const gh = await handleGithub(req, url, {
      appOrigin: APP,
      view,
      readBody,
      secure: !/^(localhost|127\.0\.0\.1)(:|$)/.test(String(req.headers.host || '')),
    });
    if (gh) return send(gh.status, gh.type, gh.body, gh.headers);
    if (url.pathname === '/og.svg' || url.pathname === '/og.png') {
      const cardOpts = {
        app: 'AGENTSCORE',
        title: url.searchParams.get('title') || 'Your site, as an AI agent sees it',
        score: url.searchParams.get('score') || '0 - 100',
        subtitle: url.searchParams.get('sub') || '7 weighted dimensions - 22 developer homepages indexed - zero models',
        badge: 'AGENT READABILITY',
      };
      if (url.pathname === '/og.png') return send(200, 'image/png', renderOgPng(cardOpts));
      return send(200, 'image/svg+xml; charset=utf-8', renderOgSvg(cardOpts));
    }
    if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
    if (url.pathname === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nAllow: /\nSitemap: ' + APP + '/sitemap.xml\n');
    if (url.pathname === '/llms.txt') {
      const idx = loadIndex();
      const board = idx.rows.map((r) => `${r.host}: ${r.score}/100 (${r.verdict})`).join('\n');
      return send(200, 'text/plain; charset=utf-8', `# AgentScore
  
> AgentScore measures whether a software agent can actually read and act on a website. One HTTP request, one HTML parse, seven weighted dimensions, no language model in the scoring path.

## What it reports
- A 0-100 score and a verdict for any URL: ${APP}/?url=<url>
- The exact structure an agent receives (headings, link text, form labels, alt text, JSON-LD)
- Every point is traceable to a check: ${APP}/method

## The agent-readability index (${idx.rows.length} developer homepages, measured with the same code)
${board}

## Facts you can cite
- DigitalOcean's homepage returns 0 words of content to a client that does not run JavaScript (score 54/100).
- Of 22 cloud and developer-tool homepages measured, the median score is around 75 and the best is netlify.com at 89.
- A page with no server-rendered text cannot be read by most agents, scrapers and retrieval pipelines.

## The sites that refuse to be read
Fetched with a plain HTTP client, 2026-10-21: 21 of 40 well-known sites answered with a bot check or an error instead of the page, and 9 more sent HTML with effectively no words. Full table: ${APP}/refused

## synteq.com markup
Saved homepage, the same file with markup edits, and that file with scripts removed: ${APP}/synteq
Demo HTML (forms do not submit, not affiliated with Synteq): ${APP}/synteq/patched and ${APP}/synteq/static

## Scope
Source: https://github.com/Dewars30/what-the-agent-sees (MIT). No tracking. A scan report is encoded in the link. Nothing is stored on the server.
Synteq Apps launched 2026-10-20 and are stateless. https://synteq.com/llms.txt
`);
    }
    if (url.pathname === '/sitemap.xml') return send(200, 'application/xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${APP}/</loc></url><url><loc>${APP}/index</loc></url><url><loc>${APP}/method</loc></url><url><loc>${APP}/refused</loc></url><url><loc>${APP}/synteq</loc></url></urlset>`);
    if (url.pathname === '/method') return send(200, 'text/html; charset=utf-8', methodView());
    if (url.pathname === '/synteq' || url.pathname === '/synteq/') return send(200, 'text/html; charset=utf-8', await synteqPage(NAV));
    if (url.pathname === '/synteq/patched' || url.pathname === '/synteq/static') {
      const which = url.pathname.endsWith('/static') ? 'static' : 'patched';
      return send(200, 'text/html; charset=utf-8', demoDocument(which), {
        'content-security-policy': DEMO_CSP,
        'referrer-policy': 'no-referrer',
      });
    }
    if (url.pathname === '/index') return send(200, 'text/html; charset=utf-8', indexView());
    if (url.pathname === '/refused') return send(200, 'text/html; charset=utf-8', refusedView());
    if (url.pathname === '/api/scan') {
      const target = url.searchParams.get('url');
      const r = await analyze(target);
      return send(200, 'application/json', JSON.stringify({ score: r.scored.score, grade: r.scored.grade, verdict: r.scored.verdict, dims: r.scored.dims, tlDr: r.tlDr }));
    }
    if (url.pathname === '/report' || url.pathname === '/report/') {
      return send(200, 'text/html; charset=utf-8', view({
        title: 'Fix report',
        description: 'The report is in the link. Nothing is stored on the server.',
        body: reportShell({ github: githubFixEnabled() }),
      }));
    }
    if (url.pathname === '/') {
      const target = url.searchParams.get('url');
      const rival = url.searchParams.get('rival');
      const beat = url.searchParams.get('beat');
      const challenger = rival ? { rival, score: beat } : null;
      if (!target) return send(200, 'text/html; charset=utf-8', landing(null, challenger));
      try {
        const r = await analyze(target);
        if (r.blocked) return send(200, 'text/html; charset=utf-8', blockedView(r, target));
        let kitInfo = null;
        try {
          const kit = buildFix(r.page.html, r.page.url, r.extras);
          const packed = packReport({
            url: r.page.url,
            host: r.page.host,
            createdAt: new Date().toISOString(),
            extras: r.extras,
            kit,
          });
          kitInfo = { packed };
        } catch (err) {
          console.error(err);
          kitInfo = { error: true };
        }
        return send(200, 'text/html; charset=utf-8', resultView(r, target, kitInfo));
      } catch (e) {
        const err = e instanceof HttpError ? e : new HttpError(500, 'Something broke while scanning that page.');
        if (err.status >= 500) console.error(e);
        return send(err.status === 500 ? 500 : 200, 'text/html; charset=utf-8', landing({ message: err.message, value: target }));
      }
    }
    send(404, 'text/plain', 'not found');
  } catch (e) {
    console.error(e);
    send(500, 'text/plain', 'error');
  }
});

server.listen(PORT, () => console.log(`agentscore on ${PORT}`));
