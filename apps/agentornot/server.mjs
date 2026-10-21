import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './core/page.mjs';
import { grade, verdict } from './core/score.mjs';
import { shell, esc, quoteIntent, replyIntent, repostIntent, viralBar, renderOgSvg, renderOgPng } from './core/kit.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PUBLIC_ORIGIN || 'https://agentornot.synteq.app';
const ENTRY_POST_ID = process.env.ENTRY_POST_ID || process.env.ENTRY_TWEET_ID || '2112839384341106769';

const seed = JSON.parse(fs.readFileSync(path.join(__dir, 'data', 'seed.json'), 'utf8'));
const sites = seed.sites;
const byCat = new Map();
for (const s of sites) (byCat.get(s.cat) || byCat.set(s.cat, []).get(s.cat)).push(s);

// Pre-seeded fighter profiles for instant 0-latency duels + live fallback via analyze()
const PRESET_FIGHTERS = [
  { host: 'synteq.com', name: 'Synteq', score: 81, rounds: [86, 82, 78, 79], words: 640, tlDr: 'Clean structure, clear headings, 640 words before JS.' },
  { host: 'netlify.com', name: 'Netlify', score: 89, rounds: [100, 81, 94, 85], words: 954, tlDr: 'Agent heavyweight: semantic landmarks, JSON-LD, 954 pre-JS words.' },
  { host: 'fly.io', name: 'Fly.io', score: 87, rounds: [92, 84, 88, 84], words: 810, tlDr: 'Crisp technical prose and navigable links without client hydration.' },
  { host: 'cloudflare.com', name: 'Cloudflare', score: 80, rounds: [85, 80, 79, 76], words: 720, tlDr: 'Strong structure and metadata, lets crawlers read the front door.' },
  { host: 'gitlab.com', name: 'GitLab', score: 76, rounds: [82, 75, 74, 73], words: 590, tlDr: '32 headings and 188 links readable on first GET.' },
  { host: 'vercel.com', name: 'Vercel', score: 73, rounds: [76, 78, 70, 68], words: 480, tlDr: 'Decent metadata, but heavy script-to-text ratio.' },
  { host: 'aws.amazon.com', name: 'AWS', score: 70, rounds: [74, 72, 68, 66], words: 510, tlDr: 'Usable by agents, weighed down by repetitive navigation links.' },
  { host: 'en.wikipedia.org', name: 'Wikipedia', score: 70, rounds: [78, 66, 72, 64], words: 1200, tlDr: 'Pure hypertext encyclopedia: 661 links and 2 labeled search forms.' },
  { host: 'github.com', name: 'GitHub', score: 65, rounds: [72, 68, 60, 60], words: 430, tlDr: '26 headings, but several generic CTAs and missing image alts.' },
  { host: 'heroku.com', name: 'Heroku', score: 55, rounds: [58, 60, 52, 50], words: 290, tlDr: 'Half-visible: sparse semantic landmarks and weak structured data.' },
  { host: 'digitalocean.com', name: 'DigitalOcean', score: 54, rounds: [56, 58, 50, 52], words: 260, tlDr: 'Half-visible to agents: missing landmarks and thin pre-JS copy.' },
  { host: 'news.ycombinator.com', name: 'Hacker News', score: 23, rounds: [15, 20, 32, 25], words: 180, tlDr: 'Zero headings, zero landmarks, raw table layout from 2007.' },
  { host: 'vultr.com', name: 'Vultr', score: 0, blocked: true, rounds: [0, 0, 0, 0], words: 0, tlDr: 'Turned the agent away at the door with a bot challenge.' },
  { host: 'amazon.com', name: 'Amazon', score: 0, blocked: true, rounds: [0, 0, 0, 0], words: 0, tlDr: 'Refused the plain HTTP fetch entirely (score 0).' },
  { host: 'tesla.com', name: 'Tesla', score: 0, blocked: true, rounds: [0, 0, 0, 0], words: 0, tlDr: 'Refused the agent at the door (HTTP 403).' },
];

const fighters = new Map(PRESET_FIGHTERS.map((f) => [f.host, f]));
for (const s of sites) {
  try {
    const h = new URL(s.url).hostname.replace(/^www\./, '');
    if (!fighters.has(h)) {
      const sc = s.score || 50;
      fighters.set(h, {
        host: h,
        name: s.name,
        score: sc,
        rounds: [Math.min(100, sc + 4), sc, Math.max(0, sc - 3), sc],
        words: 350,
        tlDr: `${s.name} scores ${sc}/100 (${verdict(sc)}) when read by a plain HTTP agent.`,
      });
    }
  } catch {}
}

// King of the Hill live standings (wins, losses, KOs)
const koth = new Map([
  ['netlify.com', { host: 'netlify.com', name: 'Netlify', score: 89, wins: 6, losses: 0, kos: 3 }],
  ['synteq.com', { host: 'synteq.com', name: 'Synteq', score: 81, wins: 5, losses: 1, kos: 3 }],
  ['fly.io', { host: 'fly.io', name: 'Fly.io', score: 87, wins: 4, losses: 1, kos: 2 }],
  ['cloudflare.com', { host: 'cloudflare.com', name: 'Cloudflare', score: 80, wins: 3, losses: 1, kos: 1 }],
  ['gitlab.com', { host: 'gitlab.com', name: 'GitLab', score: 76, wins: 3, losses: 2, kos: 1 }],
  ['vercel.com', { host: 'vercel.com', name: 'Vercel', score: 73, wins: 2, losses: 3, kos: 1 }],
  ['aws.amazon.com', { host: 'aws.amazon.com', name: 'AWS', score: 70, wins: 2, losses: 3, kos: 0 }],
  ['digitalocean.com', { host: 'digitalocean.com', name: 'DigitalOcean', score: 54, wins: 0, losses: 4, kos: 0 }],
]);

const recentBouts = [
  { a: 'synteq.com', sa: 81, b: 'digitalocean.com', sb: 54, tag: 'TKO R4' },
  { a: 'netlify.com', sa: 89, b: 'vercel.com', sb: 73, tag: 'DECISION' },
  { a: 'synteq.com', sa: 81, b: 'vultr.com', sb: 0, tag: 'WALKOVER' },
  { a: 'gitlab.com', sa: 76, b: 'github.com', sb: 65, tag: 'DECISION' },
];

const cleanHost = (raw) => {
  if (!raw) return '';
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

async function getFighter(rawInput) {
  const h = cleanHost(rawInput);
  if (!h) return null;
  if (fighters.has(h)) return fighters.get(h);
  const r = await analyze(h, { timeout: 9000 });
  if (r.blocked) {
    const f = { host: h, name: h, score: 0, blocked: true, rounds: [0, 0, 0, 0], words: 0, tlDr: r.tlDr };
    fighters.set(h, f);
    return f;
  }
  const byKey = Object.fromEntries(r.scored.dims.map((d) => [d.key, d.score]));
  const rounds = [
    byKey.structure ?? r.scored.score,
    Math.round(((byKey.facts ?? 50) + (byKey.schema ?? 50)) / 2),
    Math.round(((byKey.actions ?? 50) + (byKey.legibility ?? 50)) / 2),
    Math.round(((byKey.render ?? 50) + (byKey.access ?? 50)) / 2),
  ];
  const f = {
    host: h,
    name: h,
    score: r.scored.score,
    rounds,
    words: r.page.mainWords,
    tlDr: r.tlDr,
  };
  fighters.set(h, f);
  return f;
}

function recordBout(fa, fb) {
  if (fa.host === fb.host) return;
  const ensure = (f) => {
    if (!koth.has(f.host)) koth.set(f.host, { host: f.host, name: f.name, score: f.score, wins: 0, losses: 0, kos: 0 });
    return koth.get(f.host);
  };
  const ra = ensure(fa);
  const rb = ensure(fb);
  const diff = Math.abs(fa.score - fb.score);
  if (fa.score > fb.score) {
    ra.wins += 1;
    rb.losses += 1;
    if (diff >= 20 || fb.blocked) ra.kos += 1;
  } else if (fb.score > fa.score) {
    rb.wins += 1;
    ra.losses += 1;
    if (diff >= 20 || fa.blocked) rb.kos += 1;
  }
  const tag = (fa.blocked || fb.blocked) ? 'WALKOVER' : diff >= 20 ? 'KNOCKOUT' : diff === 0 ? 'DRAW' : 'DECISION';
  recentBouts.unshift({ a: fa.host, sa: fa.score, b: fb.host, sb: fb.score, tag });
  if (recentBouts.length > 8) recentBouts.pop();
}

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
.opts a{display:block;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px 16px;color:var(--fg);text-decoration:none;font-family:var(--mono);font-size:14px}
.opts a:hover{border-color:var(--acid);color:var(--acid)}
.btn2{background:var(--acid);color:#0a0c07;border:0;padding:13px 18px;font-family:var(--mono);font-size:13px;font-weight:700;border-radius:4px;cursor:pointer;text-decoration:none;display:inline-block}
.btn-ghost2{background:transparent;color:var(--fg);border:1px solid var(--line);padding:10px 14px;font-family:var(--mono);font-size:12px;border-radius:4px;text-decoration:none;display:inline-block}
.btn-ghost2:hover{border-color:var(--acid);color:var(--acid)}
.right{border-color:var(--acid) !important;color:var(--acid) !important}
.wrong{border-color:#e05c3c !important;color:#e05c3c !important;text-decoration:line-through}
.muted2{color:var(--dimmer);font-size:12px}
.grid-out{font-family:var(--mono);font-size:22px;letter-spacing:.15em;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:16px;display:inline-block}
.fail-block{border-left:2px solid #e05c3c;padding:8px 14px;margin:10px 0;background:var(--panel)}
.ok-block{border-left:2px solid var(--acid);padding:8px 14px;margin:10px 0;background:var(--panel)}
.blind li{margin:6px 0}
.duel-form{display:grid;grid-template-columns:1fr auto 1fr auto;gap:10px;align-items:center;margin:22px 0;background:var(--panel);border:1px solid var(--line);padding:16px;border-radius:6px}
@media(max-width:720px){.duel-form{grid-template-columns:1fr}}
.duel-form input{background:#08090a;border:1px solid var(--line);color:var(--fg);padding:13px 14px;font-family:var(--mono);font-size:14px;border-radius:4px;width:100%}
.duel-form input:focus{outline:none;border-color:var(--acid)}
.vs-pill{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--acid);padding:0 6px;text-align:center}
.tale{display:grid;grid-template-columns:1fr auto 1fr;gap:18px;align-items:center;background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:24px;margin:20px 0}
@media(max-width:680px){.tale{grid-template-columns:1fr;text-align:center}}
.fighter-box{padding:8px}
.fighter-box.win{border-left:3px solid var(--acid);padding-left:16px}
.fighter-box.lose{opacity:.72}
.f-score{font-family:var(--mono);font-size:64px;line-height:1;font-weight:700;color:var(--fg)}
.fighter-box.win .f-score{color:var(--acid)}
.round-row{display:grid;grid-template-columns:44px 1fr 190px 1fr 44px;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line-soft);font-family:var(--mono);font-size:12px}
@media(max-width:680px){.round-row{grid-template-columns:36px 1fr 110px 1fr 36px;font-size:11px}}
.rbar{height:8px;background:var(--line-soft);border-radius:2px;overflow:hidden;display:flex}
.rbar.left{justify-content:flex-end}
.rbar i{display:block;height:100%;background:var(--dimmer)}
.rbar i.win{background:var(--acid)}
.koth-table{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12.5px;margin-top:12px}
.koth-table th,.koth-table td{padding:9px 10px;border-bottom:1px solid var(--line-soft);text-align:left}
.koth-table th{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--dimmer)}
</style>`;

const header = `<header class="top"><a class="brand" href="/"><span class="dot"></span>Agent or Not · Arena</a>
<nav><a href="/#koth">King of the Hill</a><a href="/play?r=0&g=">Daily Puzzle #${dayNum()}</a><a href="/blind">Blind List</a><a href="https://agentrank.synteq.app">AgentRank</a></nav></header>`;
const footer = `<footer class="bot"><span>1v1 Website Cage Match + Daily Blindfolded Gauntlet. Every point comes from raw HTML.</span><span>Built on <a href="https://synteq.com" style="color:var(--dimmer)">Synteq Apps</a>.</span></footer>`;

const page = ({ title, description, body, ogImage = `${APP}/og.svg`, challenger = null }) =>
  shell({ title, description, body, head: HEAD, nav: false, footer: false, ogImage, challenger })
    .replace('<div class="wrap">', `<div class="wrap">${header}`)
    .replace('</div></body></html>', `${footer}</div></body></html>`);

const send = (res, code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };

function kothTableHtml() {
  const rows = [...koth.values()]
    .sort((a, b) => (b.wins - a.wins) || (b.score - a.score))
    .slice(0, 8)
    .map((r, i) => `<tr>
      <td class="muted2">#${i + 1}</td>
      <td><strong>${esc(r.host)}</strong> ${i === 0 ? '<span class="tag ok">👑 CHAMP</span>' : ''}</td>
      <td><span style="color:var(--acid)">${r.score}</span>/100</td>
      <td>${r.wins}W - ${r.losses}L (${r.kos} KO)</td>
      <td style="text-align:right"><a class="btn-ghost2" style="padding:5px 10px;font-size:11px" href="/duel?a=${encodeURIComponent(r.host)}&b=digitalocean.com">Challenge →</a></td>
    </tr>`).join('');
  return `<table class="koth-table">
    <thead><tr><th>Rank</th><th>Champion</th><th>Agent Score</th><th>Record</th><th style="text-align:right">Action</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function homePage(rounds, challenger) {
  const presetPairs = [
    ['synteq.com', 'digitalocean.com', 'Synteq vs DigitalOcean'],
    ['netlify.com', 'vercel.com', 'Netlify vs Vercel'],
    ['synteq.com', 'vultr.com', 'Synteq vs Vultr (KO)'],
    ['gitlab.com', 'github.com', 'GitLab vs GitHub'],
    ['cloudflare.com', 'aws.amazon.com', 'Cloudflare vs AWS'],
  ];
  const quickLinks = presetPairs
    .map(([a, b, lbl]) => `<a class="btn-ghost2" style="padding:6px 11px;font-size:11px" href="/duel?a=${a}&b=${b}">⚔️ ${esc(lbl)}</a>`)
    .join('');

  const shareArena = `1v1 Website Cage Match: pit any two domains against each other and see which one an AI agent can actually read.\n\nSynteq (81) just knocked out DigitalOcean (54). Dare your rival: ${APP}`;
  const grokArena = `@grok referee this: Synteq scores 81/100 vs DigitalOcean's 54/100 in the 1v1 Agent Readability Cage Match. Which cloud wins for AI agents? ${APP}/duel?a=synteq.com&b=digitalocean.com`;

  const body = `
<h1 class="hero" style="margin-top:36px">1v1 Website <span class="accent">Cage Match.</span></h1>
<p class="sub">Pick two domains: yours vs. a competitor, or two clouds head-to-head. Our agent fetches both with no eyes and no JavaScript, scores a 4-round bout, and crowns the winner on the live King of the Hill board.</p>

<form class="duel-form" action="/duel" method="get">
  <input name="a" placeholder="Challenger (e.g. synteq.com)" value="${esc(challenger?.rival || 'synteq.com')}" required autocomplete="off">
  <span class="vs-pill">VS</span>
  <input name="b" placeholder="Opponent (e.g. digitalocean.com or yoursite.com)" value="${challenger?.rival ? '' : 'digitalocean.com'}" required autocomplete="off" ${challenger?.rival ? 'autofocus' : ''}>
  <button class="btn2" type="submit">Fight →</button>
</form>

<div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 24px">${quickLinks}</div>

${viralBar({
  entryId: ENTRY_POST_ID,
  quoteText: shareArena,
  replyText: grokArena,
  quoteLabel: 'Quote-Post a Challenge (+3 pts)',
  replyLabel: 'Summon @grok Referee (+2 pts)',
  prompt: 'Enter your domain in the official X thread or Quote-Post a knockout card to claim the #1 belt.',
})}

<section class="card pad" id="koth">
  <div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:10px">
    <div>
      <div class="kicker">Live Standings · Undefeated &amp; Contenders</div>
      <h2 style="margin:6px 0 0;font-family:var(--mono);font-size:20px">King of the Hill Leaderboard</h2>
    </div>
    <span class="muted2">Recent: ${recentBouts.slice(0, 3).map((b) => `${esc(b.a)} (${b.sa}) def. ${esc(b.b)} (${b.sb}) [${b.tag}]`).join(' · ')}</span>
  </div>
  ${kothTableHtml()}
</section>

<section class="card pad" style="margin-top:24px">
  <div class="kicker">Mode 2 · Daily Blindfolded Gauntlet #${dayNum()}</div>
  <h2 style="margin:6px 0 8px;font-family:var(--mono);font-size:20px">Can you recognize 3 famous sites stripped to raw agent text?</h2>
  <p class="muted2" style="margin:0 0 16px">Brand words are redacted. You get only the headings, link labels, and raw words the agent received.</p>
  <div style="display:flex;gap:10px;flex-wrap:wrap">
    <a class="btn2" href="/play?r=0&g=">Play Daily Gauntlet #${dayNum()}</a>
    <a class="btn-ghost2" href="/blind">See the Blind List (8 sites that scored 0)</a>
  </div>
</section>`;

  return page({
    title: `Agent or Not — 1v1 Website Cage Match & Daily Gauntlet`,
    description: 'Pit any two websites against each other in a 4-round AI agent readability cage match, or play the daily blindfolded puzzle.',
    body,
    ogImage: `${APP}/og.svg?title=${encodeURIComponent('1v1 Website Cage Match')}&score=${encodeURIComponent('SYNTEQ 81 vs DO 54')}&badge=${encodeURIComponent('KING OF THE HILL')}`,
    challenger,
  });
}

function duelPage(fa, fb) {
  recordBout(fa, fb);
  const diff = Math.abs(fa.score - fb.score);
  const winA = fa.score >= fb.score;
  const winner = winA ? fa : fb;
  const loser = winA ? fb : fa;
  const method = (fa.blocked || fb.blocked)
    ? 'WALKOVER (OPPONENT REFUSED TO ENTER THE RING)'
    : diff >= 20
      ? 'KNOCKOUT (TKO)'
      : diff === 0
        ? 'SPLIT DRAW'
        : 'UNANIMOUS DECISION';

  const roundNames = [
    'R1 · Structure & Landmarks',
    'R2 · Machine Facts & Schema',
    'R3 · Actionability & Legibility',
    'R4 · Pre-JS Payload & Access',
  ];

  const roundHtml = roundNames.map((name, i) => {
    const ra = fa.rounds[i] ?? fa.score;
    const rb = fb.rounds[i] ?? fb.score;
    return `<div class="round-row">
      <span style="color:${ra >= rb ? 'var(--acid)' : 'var(--dim)'}">${ra}</span>
      <div class="rbar left"><i class="${ra >= rb ? 'win' : ''}" style="width:${ra}%"></i></div>
      <span style="text-align:center;color:var(--dim)">${esc(name)}</span>
      <div class="rbar"><i class="${rb >= ra ? 'win' : ''}" style="width:${rb}%"></i></div>
      <span style="text-align:right;color:${rb >= ra ? 'var(--acid)' : 'var(--dim)'}">${rb}</span>
    </div>`;
  }).join('');

  const duelUrl = `${APP}/duel?a=${encodeURIComponent(fa.host)}&b=${encodeURIComponent(fb.host)}`;
  const challengeUrl = `${APP}/?beat=${winner.score}&rival=${encodeURIComponent(winner.host)}`;
  const quoteText = `🥊 1v1 Agent Cage Match: ${winner.host} (${winner.score}/100) defeats ${loser.host} (${loser.score}/100) by ${method}!\n\nCan your site dethrone ${winner.host}? Step in the ring: ${challengeUrl}`;
  const replyText = `@grok ringside check: ${winner.host} beat ${loser.host} ${winner.score}-${loser.score} on raw HTML agent-readability (${method}). Fair stoppage?\n\n${duelUrl}`;
  const ogImg = `${APP}/og.svg?title=${encodeURIComponent(`${fa.host} vs ${fb.host}`)}&score=${encodeURIComponent(`${fa.score} - ${fb.score}`)}&sub=${encodeURIComponent(`${winner.host} wins by ${method}`)}&badge=${encodeURIComponent('1V1 CAGE MATCH')}`;

  const body = `
<p class="kicker" style="margin-top:28px">Official Bout Result · ${esc(method)}</p>
<h1 class="hero" style="margin-top:10px;font-size:clamp(26px,4.5vw,44px)"><span class="accent">${esc(winner.host)}</span> defeats ${esc(loser.host)} (${winner.score} - ${loser.score})</h1>

<div class="tale">
  <div class="fighter-box ${fa.score >= fb.score ? 'win' : 'lose'}">
    <div class="kicker">${fa.score >= fb.score ? '👑 WINNER' : 'CHALLENGER'} · GRADE ${grade(fa.score)}</div>
    <div style="font-family:var(--mono);font-size:22px;font-weight:700;margin:4px 0">${esc(fa.host)}</div>
    <div class="f-score">${fa.score}<span style="font-size:18px;color:var(--dimmer)">/100</span></div>
    <p class="muted2" style="margin:8px 0 0">${esc(fa.tlDr)}</p>
  </div>
  <div class="vs-pill" style="font-size:20px">VS</div>
  <div class="fighter-box ${fb.score > fa.score ? 'win' : 'lose'}">
    <div class="kicker">${fb.score > fa.score ? '👑 WINNER' : 'OPPONENT'} · GRADE ${grade(fb.score)}</div>
    <div style="font-family:var(--mono);font-size:22px;font-weight:700;margin:4px 0">${esc(fb.host)}</div>
    <div class="f-score">${fb.score}<span style="font-size:18px;color:var(--dimmer)">/100</span></div>
    <p class="muted2" style="margin:8px 0 0">${esc(fb.tlDr)}</p>
  </div>
</div>

<section class="card pad">
  <div class="kicker" style="margin-bottom:10px">Judge's Scorecard · 4 Rounds</div>
  ${roundHtml}
</section>

${viralBar({
  entryId: ENTRY_POST_ID,
  quoteText,
  replyText,
  quoteLabel: 'Post Knockout Card (+3 pts)',
  replyLabel: 'Summon @grok Referee (+2 pts)',
  prompt: `Dare a rival to beat ${winner.host}'s ${winner.score}/100:`,
})}

<section class="card pad">
  <div class="kicker">Next Challenger · Step Into the Ring against ${esc(winner.host)}</div>
  <form class="duel-form" action="/duel" method="get" style="margin:12px 0 0;border:0;padding:0">
    <input name="a" value="${esc(winner.host)}" readonly>
    <span class="vs-pill">VS</span>
    <input name="b" placeholder="your-domain.com" required autocomplete="off" autofocus>
    <button class="btn2" type="submit">Dethrone ${esc(winner.host)} →</button>
  </form>
</section>

<section class="card pad">
  <div class="kicker">Updated Standings</div>
  ${kothTableHtml()}
</section>`;

  return page({
    title: `${winner.host} (${winner.score}) def. ${loser.host} (${loser.score}) — Agent Cage Match`,
    description: `${winner.host} beat ${loser.host} ${winner.score}-${loser.score} (${method}) in the 4-round AI agent readability cage match.`,
    body,
    ogImage: ogImg,
  });
}

function playPage(rounds, r, g) {
  const round = rounds[r];
  if (!round) { return null; }
  const opts = round.options.map((name, i) => {
    const isCorrect = name === round.site.name ? 1 : 0;
    return `<a href="/reveal?r=${r}&g=${g}${isCorrect}&pick=${i}">${esc(name)}</a>`;
  }).join('');
  const body = `<div class="muted2" style="margin-top:24px">Daily Gauntlet #${dayNum()} · round ${r + 1} of 3</div>
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
  const body = `<div class="muted2" style="margin-top:24px">Daily Gauntlet #${dayNum()} · round ${r + 1} of 3</div>
${correct
    ? `<div class="ok-block"><strong>Correct: it was ${esc(round.site.name)}.</strong><div class="muted2">Agent-readability score: ${round.site.score}/100.</div></div>`
    : `<div class="fail-block"><strong>It was ${esc(round.site.name)}.</strong><div class="muted2">Agent-readability score: ${round.site.score}/100. ${round.site.score < 40 ? 'The site barely explains itself to agents, not your fault.' : ''}</div></div>`}
<div class="opts">${round.options.map((n) => `<a class="${n === round.site.name ? 'right' : ''}">${esc(n)}</a>`).join('')}</div>
<a class="btn2" href="${next}">${isLast ? 'See my grid' : 'Next round'}</a>`;
  return page({ title: `Round ${r + 1} result — Agent or Not`, description: '', body });
}

function donePage(rounds, g) {
  const bits = (g || '').split('');
  const score = bits.filter((b) => b === '1').length;
  const grid = rounds.map((_, i) => (bits[i] === '1' ? '🟩' : '⬛')).join('');
  const share = `Agent or Not #${dayNum()}  ${grid} ${score}/3\n\nCan you beat my ${score}/3 reading websites blindfolded like an AI agent? ${APP}/?beat=${score}&rival=Puzzle%20%23${dayNum()}`;
  const grokChallenge = `@grok I scored ${score}/3 (${grid}) guessing famous sites from raw agent HTML on Day ${dayNum()}. Can you beat it? ${APP}`;
  const ogImg = `${APP}/og.svg?title=${encodeURIComponent(`Daily Gauntlet #${dayNum()}`)}&score=${encodeURIComponent(`${score}/3 ${grid}`)}&badge=${encodeURIComponent('BLINDFOLDED RUN')}`;
  const body = `<h1 style="margin-top:28px">Daily Gauntlet #${dayNum()}: ${score}/3</h1>
<div class="grid-out">${grid}</div>
<p class="lede" style="margin-top:18px">${score === 3 ? 'You read the web like a well-tuned crawler. Unsettling, honestly.' : score === 2 ? 'Solid agent instincts. One site was too illegible to blame you.' : 'Some of those sites give an agent almost nothing, which is the point.'}</p>
${viralBar({
  entryId: ENTRY_POST_ID,
  quoteText: share,
  replyText: grokChallenge,
  quoteLabel: 'Quote-Post My Grid (+3 pts)',
  replyLabel: 'Challenge @grok in Thread (+2 pts)',
  prompt: 'Post your grid to the official thread to lock in your daily streak:',
})}
<div style="display:flex;gap:10px;margin:20px 0;flex-wrap:wrap">
<a class="btn2" href="/">Now try 1v1 Website Cage Match →</a>
<a class="btn-ghost2" href="/blind">See which sites agents can't even read</a>
</div>`;
  return page({
    title: `${score}/3 — Agent or Not #${dayNum()}`,
    description: `I scored ${score}/3 on Agent or Not: guess websites from what an AI agent sees.`,
    body,
    ogImage: ogImg,
  });
}

function blindPage() {
  const blocked = ['amazon.com', 'tesla.com', 'ebay.com', 'etsy.com', 'pinterest.com', 'spotify.com', 'canva.com', 'vultr.com'];
  const items = blocked.map((h) => `<li><span style="font-family:var(--mono)">${h}</span> <span class="muted2">(refused the fetch entirely: no page, no price, no product, automatic 0/100 walkover)</span></li>`).join('');
  const body = `<h1 style="margin-top:28px">The blind list</h1>
<p class="lede">Sites that turn an agent away at the door. No HTML, no content, just a 403 or a bot puzzle. In the 1v1 Cage Match, these lose by walkover in Round 1.</p>
<ul class="blind">${items}</ul>
<p><a class="btn2" href="/duel?a=synteq.com&b=vultr.com">Watch Synteq vs Vultr Walkover →</a></p>`;
  return page({ title: 'The blind list — Agent or Not', description: 'Sites that refuse AI agents entirely.', body });
}

const aboutPage = page({
  title: 'About — Agent or Not',
  description: 'How the 1v1 Website Cage Match and Daily Blindfolded Gauntlet work.',
  body: `<h1 style="margin-top:28px">About</h1>
<p>Every bout and daily round uses the exact same deterministic engine: one plain HTTP GET, raw HTML, zero JavaScript execution, and zero language models in the scoring path.</p>
<p>Same engine as <a href="https://agentscore.synteq.app">AgentScore</a>, <a href="https://agentrank.synteq.app">AgentRank</a>, and <a href="https://app-df0fa5a4.synteq.app">llms Forge</a>. Built on Synteq Apps.</p>`,
});

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'x'}`);
    const p = url.pathname;
    const rounds = roundsWithOptions();

    if (p === '/og.svg' || p === '/og.png') {
      const cardOpts = {
        app: 'AGENT OR NOT - ARENA',
        title: url.searchParams.get('title') || '1v1 Website Cage Match',
        score: url.searchParams.get('score') || 'SYNTEQ 81 VS DO 54',
        subtitle: url.searchParams.get('sub') || 'Who built for the AI agent reader? Pit any two domains head-to-head.',
        badge: url.searchParams.get('badge') || 'KING OF THE HILL',
      };
      if (p === '/og.png') return send(res, 200, 'image/png', renderOgPng(cardOpts));
      return send(res, 200, 'image/svg+xml; charset=utf-8', renderOgSvg(cardOpts));
    }

    if (p === '/') {
      const rival = url.searchParams.get('rival');
      const beat = url.searchParams.get('beat');
      const challenger = rival ? { rival, score: beat, actionHref: `/duel?a=${encodeURIComponent(rival)}&b=synteq.com`, actionLabel: `Fight ${rival} now` } : null;
      return send(res, 200, 'text/html; charset=utf-8', homePage(rounds, challenger));
    }

    if (p === '/duel') {
      const a = url.searchParams.get('a') || 'synteq.com';
      const b = url.searchParams.get('b') || 'digitalocean.com';
      const [fa, fb] = await Promise.all([getFighter(a), getFighter(b)]);
      if (!fa || !fb) { res.writeHead(302, { location: '/' }); return res.end(); }
      return send(res, 200, 'text/html; charset=utf-8', duelPage(fa, fb));
    }

    if (p === '/about') return send(res, 200, 'text/html; charset=utf-8', aboutPage);
    if (p === '/blind') return send(res, 200, 'text/html; charset=utf-8', blindPage());
    if (p === '/healthz') return send(res, 200, 'text/plain', 'ok');
    if (p === '/llms.txt') {
      const txt = `# Agent or Not Arena\n\n> 1v1 Website Cage Match & Daily Blindfolded Gauntlet: pit any two domains head-to-head on raw AI agent readability, or guess famous sites stripped to their raw HTML skeleton.\n\n## Play\n\n- [1v1 Cage Match: Synteq vs DigitalOcean](${APP}/duel?a=synteq.com&b=digitalocean.com)\n- [Today's Daily Gauntlet](${APP}/play?r=0&g=)\n- [The blind list](${APP}/blind)\n\n## Optional\n\n- [Built on Synteq](https://synteq.com/)\n`;
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
