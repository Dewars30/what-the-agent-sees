// HTML pages for RDM

const CSS = `
:root { --bg:#1a1410; --ink:#f4efe6; --muted:#6e6256; --line:#2a221e; --card:#211a14; --clay:#c24d2c; --clay-dark:#8e3218; --good:#4a9968; --bad:#c24d2c; }
* { box-sizing: border-box; }
body { margin:0; color:var(--ink); background-color:var(--bg);
  background-image: radial-gradient(ellipse at top, rgba(194,77,44,.06), transparent 52%), radial-gradient(#2a221e .7px, transparent .8px);
  font-family: Georgia, "Times New Roman", serif; line-height:1.5; }
a { color:var(--clay); text-decoration:none; }
a:hover { text-decoration: underline; }
header { border-bottom:1px solid var(--line); padding:14px 20px; display:flex; align-items:center; gap:14px; justify-content:space-between; }
.brand { font-size:1.4rem; font-weight:bold; letter-spacing:.03em; color:var(--ink); }
.brand span { color:var(--clay); }
.tagline { color:var(--muted); font-size:.85rem; font-style:italic; }
main { max-width:680px; margin:0 auto; padding:28px 20px 60px; }
footer { text-align:center; padding:20px; color:var(--muted); font-size:.8rem; border-top:1px solid var(--line); }

/* Landing */
.hero { text-align:center; padding:20px 0 40px; }
.hero h1 { font-size:2rem; margin:0 0 8px; }
.hero .eyebrow { color:var(--clay); font-size:.8rem; text-transform:uppercase; letter-spacing:.1em; font-family:ui-monospace,monospace; margin-bottom:12px; }
.hero p { color:var(--muted); font-size:1.05rem; max-width:420px; margin:8px auto; }
.hero .tease { margin:24px auto; max-width:500px; }
.hero .tease img { width:100%; border-radius:12px; border:1px solid var(--line); }
.sample-card { text-align:center; margin:30px auto; max-width:420px; }
.sample-card img { width:100%; border-radius:14px; border:1px solid var(--line); box-shadow:0 4px 24px rgba(0,0,0,0.4); }
.sample-caption { color:var(--muted); font-size:.75rem; margin-top:8px; font-style:italic; }

.form-box { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:24px; margin:20px auto; max-width:500px; }
.form-box label { display:block; margin-bottom:14px; }
.form-box label span { display:block; color:var(--muted); font-size:.8rem; margin-bottom:4px; font-family:ui-monospace,monospace; text-transform:uppercase; letter-spacing:.05em; }
.form-box input { width:100%; padding:12px 14px; background:var(--bg); border:1px solid var(--line); border-radius:8px; color:var(--ink); font-size:1rem; font-family:inherit; }
.form-box input:focus { outline:none; border-color:var(--clay); }
button { display:block; width:100%; padding:14px; background:var(--clay); color:var(--ink); border:none; border-radius:8px; font-size:1.1rem; font-weight:bold; cursor:pointer; font-family:inherit; }
button:hover { background:var(--clay-dark); }
button:disabled { opacity:.5; cursor:wait; }
.token-offer { text-align:center; padding:16px; margin-top:20px; color:var(--muted); font-size:.9rem; }
.token-offer a { color:var(--clay); }

/* Progress */
.progress { text-align:center; padding:30px; }
.progress .step { color:var(--muted); font-family:ui-monospace,monospace; font-size:.9rem; margin:6px 0; }
.progress .step.active { color:var(--clay); }
.progress .step.done { color:var(--good); }
.progress .step.done:before { content:"✓ "; }
.progress .bar { height:4px; background:var(--line); border-radius:2px; margin:16px auto; max-width:300px; overflow:hidden; }
.progress .bar-fill { height:100%; background:var(--clay); transition:width .5s; }

/* Match card */
.match { text-align:center; }
.match h1 { font-size:1.6rem; margin:20px 0; }
.match img.card { width:100%; max-width:500px; border-radius:12px; border:1px solid var(--line); margin:12px 0; }
.match .actions { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin:20px 0; }
.match .actions a, .match .actions button { width:auto; padding:10px 20px; font-size:.9rem; border:1px solid var(--line); background:var(--card); color:var(--ink); border-radius:8px; text-decoration:none; }
.match .actions a:hover { border-color:var(--clay); }
.match .actions .primary { background:var(--clay); border-color:var(--clay); }
.match .share-text { background:var(--card); border:1px dashed var(--line); border-radius:10px; padding:14px; margin:16px 0; font-size:.9rem; color:var(--muted); }
.match .stats-table { width:100%; border-collapse:collapse; margin:20px 0; font-family:ui-monospace,monospace; font-size:.85rem; }
.match .stats-table th, .match .stats-table td { padding:8px 12px; text-align:center; border-bottom:1px solid var(--line); }
.match .stats-table th { color:var(--muted); font-size:.75rem; text-transform:uppercase; }
.match .stats-table .win { color:var(--good); }
.match .signals { text-align:left; margin:20px 0; }
.match .signals h3 { font-size:.9rem; color:var(--muted); text-transform:uppercase; margin:16px 0 8px; }
.match .signals div { padding:4px 0; border-bottom:1px solid var(--line); font-size:.85rem; }
.match .signals .good { color:var(--good); }
.match .signals .bad { color:var(--bad); }
.match .again { margin-top:30px; }
`;

const TAGLINE = "Two repos enter. One leaves.";

import { shareText } from './card.mjs';

export function layout(body, { title, origin } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || 'Repo Death Match')}</title>
<meta property="og:title" content="${esc(title || 'Repo Death Match')}">
<meta property="og:image" content="${origin || ''}/sample.png">
<meta property="og:description" content="${esc(TAGLINE)}">
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body>
<header>
  <a href="/" class="brand">REPO <span>DEATH MATCH</span></a>
  <span class="tagline">${esc(TAGLINE)}</span>
</header>
<main>
${body}
</main>
<footer>Static scan. No code execution. Facts, not advice. rdm.synteq.app</footer>
</body>
</html>`;
}

export function landingPage({ origin } = {}) {
  const body = `
<div class="hero">
  <div class="eyebrow">Two repos enter. One leaves.</div>
  <h1>You saved five agent frameworks.<br>They do the same thing.<br>One of them is lying about it.</h1>
  <p>Paste two repos. We scan both and tell you who wins. No running code. Just facts.</p>
</div>

<div class="sample-card">
  <img src="/sample.png" alt="Sample deathmatch card: HuggingFace transformers vs Ollama" loading="lazy">
  <p class="sample-caption">Above: a real scan. HuggingFace transformers vs Ollama. Trust 89 vs 83. transformers wins on adoption.</p>
</div>

<div class="form-box">
  <form action="/api/scan" method="get">
    <label>
      <span>Repo A</span>
      <input name="a" placeholder="owner/repo or github.com/owner/repo" autocomplete="off" required>
    </label>
    <label>
      <span>Repo B</span>
      <input name="b" placeholder="owner/repo or github.com/owner/repo" autocomplete="off" required>
    </label>
    <button type="submit">Ring the bell</button>
  </form>
</div>

<div class="hero">
  <p style="margin-top:30px; font-size:.9rem; color:var(--muted);">Your stars are aspiration, not reality.<br>The save is dopamine. The processing is debt.<br>People are saving, not building. Find out who wins.</p>
</div>

<div class="token-offer">
  <p>Works free with public GitHub data. Want deeper scans (secrets, install scripts, dependency advisories)? <a href="#token">Paste a read-only token</a>.</p>
</div>
`;
  return layout(body, { title: 'Repo Death Match — two repos enter, one leaves', origin });
}

export function scanningPage(repoA, repoB) {
  const body = `
<div class="progress">
  <h1>Scanning...</h1>
  <p style="color:var(--muted)">${esc(repoA)} vs ${esc(repoB)}</p>
  <div class="bar"><div class="bar-fill" style="width:0%"></div></div>
  <div class="step active" id="s1">Reading ${esc(repoA)}...</div>
  <div class="step" id="s2">Reading ${esc(repoB)}...</div>
  <div class="step" id="s3">Comparing stats...</div>
  <div class="step" id="s4">Writing the verdict...</div>
</div>
<script>
const steps = [
  { el: 's1', pct: 15 },
  { el: 's2', pct: 40 },
  { el: 's3', pct: 70 },
  { el: 's4', pct: 90 },
];
let i = 0;
function tick() {
  if (i >= steps.length) return;
  const s = steps[i];
  const el = document.getElementById(s.el);
  if (el) {
    el.classList.remove('active');
    el.classList.add('done');
  }
  const bar = document.querySelector('.bar-fill');
  if (bar) bar.style.width = s.pct + '%';
  i++;
  if (i < steps.length) {
    const next = document.getElementById(steps[i].el);
    if (next) next.classList.add('active');
    setTimeout(tick, 600);
  } else {
    setTimeout(() => { bar.style.width = '100%'; }, 300);
  }
}
tick();
</script>
`;
  return layout(body, { title: 'Scanning...' });
}

export function matchPage(match, { origin, matchId }) {
  const { fighterA, fighterB, statPairs, winner, verdict } = match;
  const pngUrl = `${origin}/m/${matchId}.png`;
  const shareUrl = `${origin}/m/${matchId}`;
  const draftText = shareText(match, origin);

  const body = `
<div class="match">
  <div class="eyebrow" style="color:var(--clay); font-size:.8rem; text-transform:uppercase; letter-spacing:.1em; font-family:ui-monospace,monospace;">Death Match</div>
  <h1>${esc(fighterA.handle)} vs ${esc(fighterB.handle)}</h1>
  <p style="color:var(--muted); font-size:1rem;">${esc(verdict)}</p>

  <img class="card" src="/m/${matchId}.png" alt="Death match card">

  <div class="actions">
    <a href="/m/${matchId}.png" download class="primary">Download card</a>
    <a href="https://x.com/intent/post?text=${encodeURIComponent(draftText)}" target="_blank">Post on X</a>
    <a href="/m/${matchId}?format=txt">Plain text</a>
    <a href="/">Put two more in the ring</a>
  </div>

  <div class="share-text">
    ${esc(draftText)}
  </div>

  <table class="stats-table">
    <tr><th>${esc(fighterA.repo)}</th><th></th><th>${esc(fighterB.repo)}</th></tr>
    ${statPairs.map(s => `<tr><td class="${winsStat(s,'a')?'win':''}">${esc(String(s.a))}</td><td style="color:var(--muted)">${esc(s.label)}</td><td class="${winsStat(s,'b')?'win':''}">${esc(String(s.b))}</td></tr>`).join('')}
  </table>

  <div class="signals">
    <h3>${esc(fighterA.repo)} signals</h3>
    ${fighterA.trust.signals.map(s => `<div class="${s.good?'good':'bad'}">${s.good?'✓':'✗'} ${esc(s.label)}${s.value ? ': ' + esc(s.value) : ''}</div>`).join('')}
    <h3>${esc(fighterB.repo)} signals</h3>
    ${fighterB.trust.signals.map(s => `<div class="${s.good?'good':'bad'}">${s.good?'✓':'✗'} ${esc(s.label)}${s.value ? ': ' + esc(s.value) : ''}</div>`).join('')}
  </div>

  <div class="again">
    <a href="/" style="display:inline-block; padding:10px 20px; border:1px solid var(--line); border-radius:8px; color:var(--ink); text-decoration:none;">Put two more in the ring</a>
  </div>
</div>
`;
  return layout(body, { title: `${fighterA.repo} vs ${fighterB.repo} — Repo Death Match` });
}

export function matchPlainText(match, { origin, matchId }) {
  const { fighterA, fighterB, statPairs, winner, verdict } = match;
  const url = `${origin}/m/${matchId}`;
  let text = `REPO DEATH MATCH\n${fighterA.handle} vs ${fighterB.handle}\n\n`;
  text += `${verdict}\n\n`;
  text += `${fighterA.repo} (${fighterA.primaryLanguage}):\n`;
  text += `  Stars: ${fighterA.stars}\n  Forks: ${fighterA.forks}\n  Contributors: ${fighterA.contributorCount}\n`;
  text += `  Trust: ${fighterA.trust.score} (${fighterA.trust.label})\n`;
  text += `  License: ${fighterA.license}\n  Tests: ${fighterA.hasTests}\n  CI: ${fighterA.hasCI}\n`;
  text += `  Install scripts: ${fighterA.installScripts}\n  Deps: ${fighterA.deps ?? 'unknown'}\n`;
  text += `  Last commit: ${fighterA.monthsSinceActivity} months ago\n\n`;
  text += `${fighterB.repo} (${fighterB.primaryLanguage}):\n`;
  text += `  Stars: ${fighterB.stars}\n  Forks: ${fighterB.forks}\n  Contributors: ${fighterB.contributorCount}\n`;
  text += `  Trust: ${fighterB.trust.score} (${fighterB.trust.label})\n`;
  text += `  License: ${fighterB.license}\n  Tests: ${fighterB.hasTests}\n  CI: ${fighterB.hasCI}\n`;
  text += `  Install scripts: ${fighterB.installScripts}\n  Deps: ${fighterB.deps ?? 'unknown'}\n`;
  text += `  Last commit: ${fighterB.monthsSinceActivity} months ago\n\n`;
  text += `Put two in the ring: ${url}\n`;
  return text;
}

export function notFoundPage() {
  return layout(`<div class="hero"><h1>404</h1><p>That repo or match doesn't exist.</p><a href="/">Back to the ring</a></div>`, { title: '404 — Repo Death Match' });
}

export function errorPage(message) {
  return layout(`<div class="hero"><h1>Something broke</h1><p style="color:var(--muted)">${esc(message)}</p><a href="/">Back to the ring</a></div>`, { title: 'Error — Repo Death Match' });
}

function winsStat(stat, side) {
  const a = stat.a;
  const b = stat.b;
  if (typeof a !== 'number' || typeof b !== 'number') {
    if (stat.higher === 'yes') return side === 'a' ? a === 'Yes' && b === 'No' : b === 'Yes' && a === 'No';
    if (stat.higher === 'no') return side === 'a' ? a === 'No' && b === 'Yes' : b === 'No' && a === 'Yes';
    return false;
  }
  if (stat.higher === 'more') return side === 'a' ? a > b : b > a;
  if (stat.higher === 'fewer') return side === 'a' ? a < b : b < a;
  return false;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
