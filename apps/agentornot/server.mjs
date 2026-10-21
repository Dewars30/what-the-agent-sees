import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shell, esc } from './core/kit.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PUBLIC_ORIGIN || 'https://agentornot.synteq.app';
const ENTRY_POST_ID = process.env.ENTRY_POST_ID || '';

const seed = JSON.parse(fs.readFileSync(path.join(__dir, 'data', 'seed.json'), 'utf8'));
const sites = seed.sites;
const byCat = new Map();
for (const s of sites) (byCat.get(s.cat) || byCat.set(s.cat, []).get(s.cat)).push(s);

// Deterministic shuffle so every visitor sees the same daily puzzles/order.
function seededRandom(seedStr) {
  let h = 2166136261;
  for (const c of seedStr) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) / 4294967296);
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dayNum() {
  const launch = new Date('2026-10-21');
  return Math.max(1, Math.floor((Date.now() - launch.getTime()) / 86400000) + 1);
}

function dailyRounds() {
  const rnd = seededRandom('agentornot:' + today());
  const pool = [...sites];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function optionsFor(round, rnd) {
  const sameCat = (byCat.get(round.cat) || []).filter((s) => s.name !== round.name);
  const others = sites.filter((s) => s.cat !== round.cat && s.name !== round.name);
  const picks = [...sameCat];
  while (picks.length < 3) {
    const o = others.splice(Math.floor(rnd() * others.length), 1)[0];
    if (!o) break;
    picks.push(o);
  }
  const opts = picks.slice(0, 3).map((s) => s.name);
  opts.push(round.name);
  // shuffle options
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

function roundsWithOptions() {
  const rnd = seededRandom('opts:' + today());
  return dailyRounds().map((r) => ({ site: r, options: optionsFor(r, rnd) }));
}

const HEAD = `<style>
.puzzle{background:#0b0d08;border:1px solid var(--line);border-radius:6px;padding:18px 20px;font-family:var(--mono);font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;max-height:480px;overflow:auto}
.opts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}
@media(max-width:640px){.opts{grid-template-columns:1fr}}
.opts a{display:block;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px 16px;color:var(--ink);text-decoration:none;font-family:var(--mono);font-size:14px}
.opts a:hover{border-color:var(--acid);color:var(--acid)}
.btn2{background:var(--acid);color:#0a0c07;border:0;padding:13px 18px;font-family:var(--mono);font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.btn-ghost2{background:transparent;color:var(--ink);border:1px solid var(--line);padding:10px 14px;font-family:var(--mono);font-size:12px;border-radius:4px;text-decoration:none;display:inline-block}
.btn-ghost2:hover{border-color:var(--acid);color:var(--acid)}
.right{border-color:var(--acid) !important;color:var(--acid) !important}
.wrong{border-color:#e05c3c !important;color:#e05c3c !important;text-decoration:line-through}
.muted2{color:var(--dimmer);font-size:12px}
.grid-out{font-family:var(--mono);font-size:22px;letter-spacing:.15em;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px;display:inline-block}
.fail-block{border-left:2px solid #e05c3c;padding:8px 14px;margin:10px 0;background:var(--panel)}
.ok-block{border-left:2px solid var(--acid);padding:8px 14px;margin:10px 0;background:var(--panel)}
.blind li{margin:6px 0}
</style>`;

const header = `<header class="top"><a class="brand" href="/"><span class="dot"></span>Agent or Not</a>
<nav><a href="/blind">The blind list</a><a href="/about">About</a><a href="https://agentrank.synteq.app">AgentRank</a></nav></header>`;
const footer = `<footer class="bot"><span>A daily game about what AI agents actually see when they read the web.</span><span>Built on <a href="https://synteq.com" style="color:var(--dimmer)">Synteq Apps</a>.</span></footer>`;

const page = ({ title, description, body }) =>
  shell({ title, description, body, head: HEAD, nav: false, footer: false })
    .replace('<div class="wrap">', `<div class="wrap">${header}`)
    .replace('</div></body></html>', `${footer}</div></body></html>`);

const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type }); res.end(body); };

function grokReplyUrl(text) {
  const base = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  return ENTRY_POST_ID ? `${base}&in_reply_to=${ENTRY_POST_ID}` : base;
}
const postUrl = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;

function homePage(rounds) {
  const body = `
<h1>Can you read the web like an agent?</h1>
<p class="lede">Every day we show an AI agent a famous website and give you exactly what it received — the headings, the link text, the raw words. No screenshots, no styling, no JavaScript. Three rounds. Guess the site from its skeleton.</p>
<div style="display:flex;gap:10px;margin:24px 0;flex-wrap:wrap">
<a class="btn2" href="/play?r=0&g=">Play today's puzzle</a>
<a class="btn-ghost2" href="${postUrl(`Daily game: guess famous websites from only what an AI agent can see. Day ${dayNum()} is live: ${APP}`)}" target="_blank" rel="noopener">Post about it</a>
<a class="btn-ghost2" href="${grokReplyUrl(`@grok this game shows famous sites stripped to what an AI agent actually receives — try day ${dayNum()}: ${APP}`)}" target="_blank" rel="noopener">Ask Grok</a>
</div>
<p class="muted2">Puzzle #${dayNum()} · 3 rounds · same for everyone today · no JavaScript required (obviously)</p>
<h2>Today's sites are drawn from 27 that let an agent in</h2>
<p class="muted2">Amazon, Tesla, eBay, Etsy, Spotify and Canva refused to be read at all — they're on <a href="/blind" style="color:var(--dimmer)">the blind list</a>. The agent can't guess what it can't see.</p>`;
  return page({ title: `Agent or Not #${dayNum()} — guess the site from what an agent sees`, description: 'A daily game: famous websites stripped to the raw text an AI agent receives. Guess the site.', body });
}

function playPage(rounds, r, g) {
  const round = rounds[r];
  if (!round) { return null; }
  const opts = round.options.map((name, i) => {
    const isCorrect = name === round.site.name ? 1 : 0;
    return `<a href="/reveal?r=${r}&g=${g}${isCorrect}&pick=${i}">${esc(name)}</a>`;
  }).join('');
  const body = `<div class="muted2">Puzzle #${dayNum()} · round ${r + 1} of 3</div>
<h2>What site did the agent read?</h2>
<div class="puzzle">${esc(round.site.puzzle)}</div>
<div class="opts">${opts}</div>
<p class="muted2">Brand words are redacted. Everything else is the site exactly as the agent received it.</p>`;
  return page({ title: `Round ${r + 1} — Agent or Not`, description: 'Guess the site from its agent view.', body });
}

function revealPage(rounds, r, g, pick) {
  const round = rounds[r];
  const correct = round.options[Number(pick)] === round.site.name;
  const bits = g || '';
  const isLast = r >= 2;
  const next = isLast ? `/done?g=${bits}` : `/play?r=${r + 1}&g=${bits}`;
  const body = `<div class="muted2">Puzzle #${dayNum()} · round ${r + 1} of 3</div>
${correct
    ? `<div class="ok-block"><strong>Correct — it was ${esc(round.site.name)}.</strong><div class="muted2">Agent-readability score: ${round.site.score}/100.</div></div>`
    : `<div class="fail-block"><strong>It was ${esc(round.site.name)}.</strong><div class="muted2">Agent-readability score: ${round.site.score}/100. ${round.site.score < 40 ? 'The site barely explains itself to agents — not your fault.' : ''}</div></div>`}
<div class="opts">${round.options.map((n) => `<a class="${n === round.site.name ? 'right' : ''}">${esc(n)}</a>`).join('')}</div>
<a class="btn2" href="${next}">${isLast ? 'See my grid' : 'Next round'}</a>`;
  return page({ title: `Round ${r + 1} result — Agent or Not`, description: '', body });
}

function donePage(rounds, g) {
  const bits = (g || '').split('');
  const score = bits.filter((b) => b === '1').length;
  const grid = rounds.map((_, i) => (bits[i] === '1' ? '🟩' : '⬛')).join('');
  const share = `Agent or Not #${dayNum()}  ${grid} ${score}/3\n\nGuess famous sites from only what an AI agent can see: ${APP}`;
  const body = `<h1>Puzzle #${dayNum()}: ${score}/3</h1>
<div class="grid-out">${grid}</div>
<p class="lede" style="margin-top:18px">${score === 3 ? 'You read the web like a well-tuned crawler. Unsettling, honestly.' : score === 2 ? 'Solid agent instincts. One site was too illegible to blame you.' : 'Some of those sites give an agent almost nothing — which is exactly the point.'}</p>
<div style="display:flex;gap:10px;margin:20px 0;flex-wrap:wrap">
<a class="btn2" href="${postUrl(share)}" target="_blank" rel="noopener">Post my grid</a>
<a class="btn-ghost2" href="${grokReplyUrl(`@grok I scored ${score}/3 guessing sites from what an AI agent receives. Can you beat it? ${APP}`)}" target="_blank" rel="noopener">Challenge Grok</a>
<a class="btn-ghost2" href="/blind">See which sites agents can't even read</a>
</div>
<p class="muted2">New puzzle tomorrow. Three more sites get stripped to their skeletons.</p>`;
  return page({ title: `${score}/3 — Agent or Not #${dayNum()}`, description: `I scored ${score}/3 on Agent or Not — the game where you guess websites from what an AI agent sees.`, body });
}

function blindPage() {
  const blocked = ['amazon.com', 'tesla.com', 'ebay.com', 'etsy.com', 'pinterest.com', 'spotify.com', 'canva.com', 'vultr.com'];
  const items = blocked.map((h) => `<li><span style="font-family:var(--mono)">${h}</span> <span class="muted2">— refused the fetch entirely. An agent gets nothing: no page, no price, no product.</span></li>`).join('');
  const body = `<h1>The blind list</h1>
<p class="lede">Sites that turn an agent away at the door. No HTML, no content — a 403 or a blank body. Whatever the business reason, to the machine they are silent.</p>
<ul class="blind">${items}</ul>
<p class="muted2">Curious where the readable ones land? <a href="https://agentrank.synteq.app" style="color:var(--dimmer)">AgentRank scores the cloud providers</a>; <a href="https://agentscore.synteq.app" style="color:var(--dimmer)">AgentScore explains any URL</a>.</p>`;
  return page({ title: 'The blind list — Agent or Not', description: 'Sites that refuse AI agents entirely.', body });
}

const aboutPage = page({
  title: 'About — Agent or Not',
  description: 'What Agent or Not is testing.',
  body: `<h1>About</h1>
<p>Every round shows a famous site's homepage exactly as a software agent receives it: one GET, raw HTML, no rendering, no JavaScript. We redact the brand words; everything else — headings, link labels, body text — is untouched.</p>
<p>The uncomfortable part: you often can't tell which site it is. If you can't tell, neither can the agent — and the agent is the reader your site increasingly serves. That's the whole game.</p>
<p>Same engine as <a href="https://agentscore.synteq.app">AgentScore</a>, <a href="https://agentrank.synteq.app">AgentRank</a> and <a href="https://llmsforge.synteq.app">llms Forge</a>. Built on Synteq Apps.</p>`,
});

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
    const p = url.pathname;
    const rounds = roundsWithOptions();

    if (p === '/') return send(res, 200, 'text/html; charset=utf-8', homePage(rounds));
    if (p === '/about') return send(res, 200, 'text/html; charset=utf-8', aboutPage);
    if (p === '/blind') return send(res, 200, 'text/html; charset=utf-8', blindPage());
    if (p === '/healthz') return send(res, 200, 'text/plain', 'ok');
    if (p === '/llms.txt') {
      const txt = `# Agent or Not\n\n> A daily game: guess famous websites from only the raw text an AI agent receives — no rendering, no JavaScript, brand words redacted.\n\n## Play\n\n- [Today's puzzle](${APP}/play?r=0&g=)\n- [The blind list — sites agents can't read at all](${APP}/blind)\n- [About](${APP}/about)\n\n## Optional\n\n- [Built on Synteq](https://synteq.com/)\n`;
      return send(res, 200, 'text/plain; charset=utf-8', txt);
    }

    if (p === '/play') {
      const r = Math.max(0, Math.min(2, Number(url.searchParams.get('r') || 0)));
      const g = (url.searchParams.get('g') || '').replace(/[^01]/g, '').slice(0, 3);
      const out = playPage(rounds, r, g);
      if (!out) { res.writeHead(302, { location: '/' }); return res.end(); }
      return send(res, 200, 'text/html; charset=utf-8', out);
    }
    if (p === '/reveal') {
      const r = Math.max(0, Math.min(2, Number(url.searchParams.get('r') || 0)));
      const g = (url.searchParams.get('g') || '').replace(/[^01]/g, '').slice(0, 3);
      const pick = url.searchParams.get('pick');
      return send(res, 200, 'text/html; charset=utf-8', revealPage(rounds, r, g, pick));
    }
    if (p === '/done') {
      const g = (url.searchParams.get('g') || '').replace(/[^01]/g, '').slice(0, 3);
      return send(res, 200, 'text/html; charset=utf-8', donePage(rounds, g));
    }

    send(res, 404, 'text/plain', 'not found');
  } catch {
    send(res, 500, 'text/plain', 'server error');
  }
});

server.listen(PORT, () => console.log(`agentornot on :${PORT}`));
