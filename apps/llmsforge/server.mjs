import http from 'node:http';
import { analyze, HttpError } from './core/page.mjs';
import { shell, esc, quoteIntent, replyIntent, repostIntent, renderOgSvg, renderOgPng } from './core/kit.mjs';
import { grade, verdict } from './core/score.mjs';

const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PUBLIC_ORIGIN || 'https://app-df0fa5a4.synteq.app';
const ENTRY_POST_ID = process.env.ENTRY_POST_ID || process.env.ENTRY_TWEET_ID || '2112840019790672070';

const shareUrl = (text) => quoteIntent(text, ENTRY_POST_ID);
const grokReplyUrl = (text) => replyIntent(text, ENTRY_POST_ID);

const SECTION_RULES = [
  { name: 'Docs', re: /docs?|documentation|reference|api|guide|learn|developers?|help|support|knowledge|manual/i },
  { name: 'Pricing', re: /pricing|plans?|billing|cost|buy/i },
  { name: 'Product', re: /product|features?|platform|solutions?|how-it-works|overview/i },
  { name: 'Blog', re: /blog|news|press|journal|articles?|stories|changelog|release-notes?|updates?/i },
  { name: 'Company', re: /about|company|team|careers?|jobs?|contact|press|legal|security|trust/i },
  { name: 'Community', re: /community|forum|discord|slack|github|events?/i },
];

const SKIP_PATH = /^\/($|#)|^javascript:|^mailto:|^tel:|login|signin|sign-in|signup|sign-up|auth|account|cart|checkout|search\?|privacy|terms|cookie/i;
const SKIP_LABEL = /^(log ?in|sign ?in|sign ?up|get started|try (it|now|free)|subscribe|en|fr|de|es|ja|zh|pt)$/i;

function siteName(p) {
  const t = (p.og?.title || p.title || '').trim();
  if (t) {
    const parts = t.split(/\s+(?:[|–—-]|::|·)\s+|:\s+/).map((s) => s.trim()).filter(Boolean);
    const brandish = parts.filter((s) => s.length <= 30);
    if (brandish.length) {
      const h1 = p.headings.find((h) => h.level === 1)?.text?.trim();
      const match = brandish.find((b) => h1 && h1.toLowerCase().includes(b.toLowerCase()));
      const pick = match || brandish.reduce((a, b) => (a.length <= b.length ? a : b));
      if (pick) return pick.replace(/\s+(home|homepage|official site.*)$/i, '');
    }
  }
  return p.displayHost.replace(/\.(com|io|dev|app|ai|net|org|co|cloud)$/, '');
}

function summarize(p) {
  const d = (p.description || p.og?.description || '').trim();
  if (d) return d.replace(/\s+/g, ' ').slice(0, 240);
  const words = (p.mainText || '').trim().split(/\s+/).slice(0, 40).join(' ');
  return words || `The ${p.displayHost} website.`;
}

function forgeLlmsTxt(p, extras) {
  const lines = [];
  lines.push(`# ${siteName(p)}`, '');
  lines.push(`> ${summarize(p)}`, '');

  const seen = new Set();
  const buckets = new Map(SECTION_RULES.map((r) => [r.name, []]));
  const rest = [];

  for (const l of p.links) {
    const href = (l.href || '').trim();
    const label = (l.label || '').trim().replace(/\s+/g, ' ');
    if (!href || !label || label.length < 3 || label.length > 90) continue;
    if (SKIP_PATH.test(href) || SKIP_LABEL.test(label)) continue;
    let abs;
    try { abs = new URL(href, p.url); } catch { continue; }
    if (abs.hostname !== new URL(p.url).hostname && !abs.hostname.endsWith('.' + new URL(p.url).hostname)) continue;
    const clean = abs.origin + abs.pathname.replace(/\/$/, '');
    if (seen.has(clean)) continue;
    seen.add(clean);
    const item = `- [${label}](${clean}/)`;
    const rule = SECTION_RULES.find((r) => r.re.test(abs.pathname) || r.re.test(label));
    (rule ? buckets.get(rule.name) : rest).push(item);
  }

  let used = 0;
  for (const [name, items] of buckets) {
    if (!items.length) continue;
    lines.push(`## ${name}`, '', ...items.slice(0, 8).map((i) => i), '');
    used += items.length;
  }
  if (rest.length && used < 14) {
    lines.push('## Pages', '', ...rest.slice(0, Math.min(10, 16 - used)), '');
  }
  const opt = [];
  if (extras?.sitemap) opt.push('- [Sitemap](/sitemap.xml)');
  const status = p.links.find((l) => /status|uptime/i.test(l.href + ' ' + l.label));
  if (status) opt.push(`- [Status](${new URL(status.href, p.url).href})`);
  if (opt.length) lines.push('## Optional', '', ...opt, '');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function bar(score, w = 24) {
  const on = Math.round((score / 100) * w);
  const cls = score >= 70 ? 'on' : score >= 45 ? 'on mid' : 'on low';
  let out = '';
  for (let i = 0; i < w; i++) out += `<i class="${i < on ? cls : ''}"></i>`;
  return out;
}

const HEAD = `<style>
.forge-out{background:#0b0d08;border:1px solid var(--line);border-radius:6px;padding:18px 20px;font-family:var(--mono);font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:520px;overflow:auto}
.scanbox{display:flex;gap:8px;margin:22px 0}
.scanbox input{flex:1;background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:13px 15px;font-family:var(--mono);font-size:14px;border-radius:4px}
.scanbox input:focus{outline:none;border-color:var(--acid)}
.btn2{background:var(--acid);color:#0a0c07;border:0;padding:13px 18px;font-family:var(--mono);font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.btn-ghost2{background:transparent;color:var(--ink);border:1px solid var(--line);padding:10px 14px;font-family:var(--mono);font-size:12px;border-radius:4px;text-decoration:none;display:inline-block;cursor:pointer}
.btn-ghost2:hover{border-color:var(--acid);color:var(--acid)}
.fail-block{border-left:2px solid #e05c3c;padding:8px 14px;margin:10px 0;background:var(--panel)}
.ok-block{border-left:2px solid var(--acid);padding:8px 14px;margin:10px 0;background:var(--panel)}
.warn-block{border-left:2px solid #e0c23c;padding:8px 14px;margin:10px 0;background:var(--panel)}
.muted2{color:var(--dimmer);font-size:12px}
.scorebar{display:inline-flex;gap:1px;align-items:center;vertical-align:middle}
.scorebar i{width:5px;height:13px;background:var(--line);display:inline-block}
.scorebar i.on{background:var(--acid)}
.scorebar i.on.mid{background:#e0c23c}
.scorebar i.on.low{background:#e05c3c}
.gr-badge{font-family:var(--mono);font-size:13px;border:1px solid var(--line);padding:2px 8px;border-radius:3px}
.gr-A{border-color:var(--acid);color:var(--acid)}
.gr-B{color:#9bd}
.gr-C{color:#dc4}
.gr-D,.gr-E,.gr-F{color:#e05c3c}
.kv{display:flex;gap:10px;flex-wrap:wrap;margin:14px 0}
.kv .chip{border:1px solid var(--line);border-radius:4px;padding:8px 12px;font-family:var(--mono);font-size:12px}
</style>`;

const header = `<header class="top"><a class="brand" href="/"><span class="dot"></span>llms Forge</a>
<nav><a href="/#why">Why llms.txt</a><a href="https://agentrank.synteq.app">AgentRank</a><a href="https://agentscore.synteq.app">AgentScore</a></nav></header>`;
const footer = `<footer class="bot"><span>llms.txt is a proposed standard (llmstxt.org): a markdown file that tells agents what your site is and where the good stuff lives.</span><span>Built on <a href="https://synteq.com" style="color:var(--dimmer)">Synteq Apps</a>. Pages are analyzed on the fly and not stored.</span></footer>`;

const page = ({ title, description, body }) =>
  shell({ title, description, body, head: HEAD, nav: false, footer: false })
    .replace('<div class="wrap">', `<div class="wrap">${header}`)
    .replace('</div></body></html>', `${footer}</div></body></html>`);

const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };
const json = (res, code, obj) => send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));

function homePage() {
  const body = `
<h1>Your site, in the file every agent reads first.</h1>
<p class="lede">llms.txt is the emerging standard for telling AI agents what your site is and what matters on it. Most sites don't ship one. Paste a URL — we'll read the page like an agent does and forge the file for you, with a report on what still blocks machines after you deploy it.</p>
<form class="scanbox" action="/forge" method="get">
<input name="url" placeholder="your-domain.com" autocomplete="off" autofocus>
<button class="btn2" type="submit">Forge my llms.txt</button>
</form>
<div style="display:flex;gap:10px;margin:6px 0 30px;flex-wrap:wrap">
<a class="btn-ghost2" href="${shareUrl(`Every site needs an llms.txt — the file that tells AI agents what you are and where the good stuff is. Forge yours in seconds: ${APP}`)}" target="_blank" rel="noopener">Quote-Post on X (+3 pts)</a>
<a class="btn-ghost2" href="${grokReplyUrl(`@grok does every site need an llms.txt? This tool forges one for any domain in seconds: ${APP}`)}" target="_blank" rel="noopener">Ask Grok in Thread (+2 pts)</a>
<a class="btn-ghost2" href="${repostIntent(ENTRY_POST_ID)}" target="_blank" rel="noopener">1-Click Repost (+3 pts)</a>
<a class="btn-ghost2" href="/forge?url=synteq.com">See it forge synteq.com</a>
</div>
<h2 id="why">Why it matters</h2>
<p>Agents are the new front door. When someone asks a model to "compare pricing" or "set this up," the agent fetches your site with no eyes and no JavaScript. An llms.txt is the map you hand it: what you do, where the docs live, what to cite. Sites that ship one get quoted correctly; sites that don't get guessed at.</p>
<h2>What you get</h2>
<p>1. A ready-to-ship <code>llms.txt</code> — name, summary, and your real docs/pricing/blog sections, generated from the HTML you actually serve.<br>
2. A gap report — the things llms.txt can't fix (JS-only content, missing landmarks, agent-blocking robots.txt) ranked by what they're worth.<br>
3. Your agent-readability score, so you can re-check after shipping the file.</p>`;
  return page({ title: 'llms Forge — generate a working llms.txt for any site', description: 'Paste a URL, get a ready-to-ship llms.txt plus the gap report on what still blocks AI agents.', body });
}

function forgePage(input, r, llmsTxt) {
  const p = r.page;
  const score = r.scored.score;
  const g = grade(score);
  const existing = r.extras.llmsTxt || r.extras.llmsFull;
  const blocked = Object.entries(r.extras.agents || {}).filter(([, v]) => v === 'blocked').map(([k]) => k);
  const fails = r.scored.fails.slice(0, 4);
  const name = siteName(p);
  const sectionCount = (llmsTxt.match(/^## /gm) || []).length;
  const linkCount = (llmsTxt.match(/^- \[/gm) || []).length;

  const body = `<a href="/" style="color:var(--dimmer);font-size:12px">← forge another</a>
<h1>${esc(p.displayHost)}</h1>
<p class="lede">Here's the llms.txt an agent would want at <code>https://${esc(p.displayHost)}/llms.txt</code> — generated from the HTML ${esc(p.displayHost)} actually ships.</p>

<div class="kv">
<span class="chip">agent-readability ${score}/100 <span class="gr-badge gr-${g}">${g}</span></span>
<span class="chip">${verdict(score)}</span>
<span class="chip">${linkCount} links in ${sectionCount} sections</span>
${existing ? '<span class="chip" style="border-color:var(--acid);color:var(--acid)">already ships llms.txt — compare below</span>' : '<span class="chip">no llms.txt today</span>'}
${blocked.length ? `<span class="chip" style="border-color:#e05c3c;color:#e05c3c">${blocked.length} AI crawlers blocked in robots.txt</span>` : ''}
</div>

<h2>Your llms.txt</h2>
<div class="forge-out" id="llms">${esc(llmsTxt)}</div>
<div style="display:flex;gap:10px;margin:14px 0 28px;flex-wrap:wrap">
<button class="btn2" onclick="navigator.clipboard.writeText(document.getElementById('llms').innerText).then(()=>{this.textContent='Copied'}).catch(()=>{})">Copy file</button>
<a class="btn-ghost2" href="data:text/plain;charset=utf-8,${encodeURIComponent(llmsTxt)}" download="llms.txt">Download</a>
<a class="btn-ghost2" href="${shareUrl(`Forged an llms.txt for ${p.displayHost} — it scored ${score}/100 for agent-readability. Make yours: ${APP}`)}" target="_blank" rel="noopener">Post this on X</a>
</div>

<h2>What this file can't fix</h2>
<p class="muted2">llms.txt is a map, not a cure. These still block agents on ${esc(p.displayHost)} — fix them to move the score.</p>
${fails.length ? fails.map((f) => `<div class="fail-block"><strong>${esc(f.title)}</strong><div class="muted2" style="margin-top:4px">${esc(f.detail)}${f.fix ? ` <em>Fix: ${esc(f.fix)}</em>` : ''}</div></div>`).join('') : '<div class="ok-block"><strong>No hard failures.</strong><div class="muted2">The agent could already work with this page.</div></div>'}
${blocked.length ? `<div class="warn-block"><strong>Your robots.txt blocks: ${esc(blocked.slice(0, 5).join(', '))}${blocked.length > 5 ? '…' : ''}</strong><div class="muted2">An llms.txt no agent is allowed to read is a sign on a locked door.</div></div>` : ''}

<div style="margin-top:26px;display:flex;gap:10px;flex-wrap:wrap">
<a class="btn-ghost2" href="https://agentscore.synteq.app/?url=${encodeURIComponent(p.url)}" target="_blank" rel="noopener">Full AgentScore report</a>
<a class="btn-ghost2" href="https://agentrank.synteq.app/scan?url=${encodeURIComponent(p.url)}" target="_blank" rel="noopener">Rank it against the clouds</a>
</div>`;
  return page({ title: `llms.txt for ${p.displayHost} — llms Forge`, description: `A generated llms.txt for ${p.displayHost}, plus the gap report on what still blocks agents.`, body });
}

function errorPage(msg) {
  return page({
    title: 'Couldn\'t forge that — llms Forge',
    description: '',
    body: `<a href="/" style="color:var(--dimmer);font-size:12px">← back</a>
<h1>Couldn't forge that.</h1><div class="fail-block">${esc(msg)}</div>
<p><a class="btn-ghost2" href="/">Try another URL</a></p>`,
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
    const p = url.pathname;

    if (p === '/og.svg' || p === '/og.png') {
      const cardOpts = {
        app: 'LLMS FORGE',
        title: url.searchParams.get('title') || 'Forge /llms.txt for Any Website',
        score: url.searchParams.get('score') || '/LLMS.TXT',
        subtitle: url.searchParams.get('sub') || 'Machine-readable summary + agent blocker report in one GET',
        badge: 'LLMSTXT GENERATOR',
      };
      if (p === '/og.png') return send(res, 200, 'image/png', renderOgPng(cardOpts));
      return send(res, 200, 'image/svg+xml; charset=utf-8', renderOgSvg(cardOpts));
    }
    if (p === '/') return send(res, 200, 'text/html; charset=utf-8', homePage());
    if (p === '/healthz') return send(res, 200, 'text/plain', 'ok');
    if (p === '/llms.txt') {
      const txt = `# llms Forge\n\n> Generate a working llms.txt for any website, plus the gap report on what still blocks AI agents.\n\n## Use it\n\n- [Forge a file](${APP}/forge?url=)\n- [API — returns JSON](${APP}/api/forge?url=)\n\n## Optional\n\n- [Built on Synteq](https://synteq.com/)\n`;
      return send(res, 200, 'text/plain; charset=utf-8', txt);
    }

    if (p === '/forge' || p === '/api/forge') {
      const input = url.searchParams.get('url');
      if (!input) { res.writeHead(302, { location: '/' }); return res.end(); }
      try {
        const r = await analyze(input);
        const txt = forgeLlmsTxt(r.page, r.extras);
        if (p === '/api/forge') {
          return json(res, 200, { host: r.page.displayHost, score: r.scored.score, grade: grade(r.scored.score), llmsTxt: txt, existingLlmsTxt: Boolean(r.extras.llmsTxt || r.extras.llmsFull), blockedAgents: Object.entries(r.extras.agents || {}).filter(([, v]) => v === 'blocked').map(([k]) => k) });
        }
        return send(res, 200, 'text/html; charset=utf-8', forgePage(input, r, txt));
      } catch (e) {
        const code = e instanceof HttpError ? 400 : 500;
        if (p === '/api/forge') return json(res, code, { error: e.message });
        return send(res, code, 'text/html; charset=utf-8', errorPage(e.message));
      }
    }

    send(res, 404, 'text/plain', 'not found');
  } catch {
    send(res, 500, 'text/plain', 'server error');
  }
});

server.listen(PORT, () => console.log(`llmsforge on :${PORT}`));
