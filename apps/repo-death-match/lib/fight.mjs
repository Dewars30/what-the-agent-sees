// Scan page with 8-bit boxer fight animation.
// GitHub API calls happen client-side (CORS). Each stat is a round.

import { layout } from './pages.mjs';

export function fightScanPage(repoA, repoB, { origin }) {
  const body = `
<div class="arena">
  <div class="arena-header">
    <span class="round-label" id="round-label">GET READY</span>
  </div>

  <div class="ring">
    <div class="fighter left" id="fighter-a">
      <div class="health-bar"><div class="health-fill" id="health-a" style="width:50%"></div></div>
      <div class="health-text" id="trust-a">0.50</div>
      <div class="boxer" id="boxer-a">
        <svg viewBox="0 0 120 140" width="120" height="140">
          <rect x="30" y="50" width="60" height="60" rx="8" fill="var(--color-a)" class="body"/>
          <rect x="20" y="65" width="20" height="14" rx="4" fill="#c24d2c" class="glove-left"/>
          <rect x="80" y="65" width="20" height="14" rx="4" fill="#c24d2c" class="glove-right"/>
          <circle cx="48" cy="70" r="5" fill="#1a1410"/>
          <circle cx="72" cy="70" r="5" fill="#1a1410"/>
          <rect x="45" y="90" width="30" height="4" rx="2" fill="#1a1410" class="mouth"/>
        </svg>
      </div>
      <div class="fighter-name" id="name-a">${esc(repoA)}</div>
      <div class="fighter-lang" id="lang-a">???</div>
    </div>

    <div class="vs" id="vs">
      <span>VS</span>
    </div>

    <div class="fighter right" id="fighter-b">
      <div class="health-bar"><div class="health-fill" id="health-b" style="width:50%"></div></div>
      <div class="health-text" id="trust-b">0.50</div>
      <div class="boxer" id="boxer-b">
        <svg viewBox="0 0 120 140" width="120" height="140">
          <rect x="30" y="50" width="60" height="60" rx="8" fill="var(--color-b)" class="body"/>
          <rect x="20" y="65" width="20" height="14" rx="4" fill="#3178c6" class="glove-left"/>
          <rect x="80" y="65" width="20" height="14" rx="4" fill="#3178c6" class="glove-right"/>
          <circle cx="48" cy="70" r="5" fill="#1a1410"/>
          <circle cx="72" cy="70" r="5" fill="#1a1410"/>
          <rect x="45" y="90" width="30" height="4" rx="2" fill="#1a1410" class="mouth"/>
        </svg>
      </div>
      <div class="fighter-name" id="name-b">${esc(repoB)}</div>
      <div class="fighter-lang" id="lang-b">???</div>
    </div>
  </div>

  <div class="announcer" id="announcer">Scanning...</div>
  <div class="rounds-log" id="rounds-log"></div>
</div>

<style>
:root { --color-a: #c24d2c; --color-b: #3178c6; }
.arena { text-align:center; padding:10px 0; }
.arena-header { margin-bottom:10px; }
.round-label {
  font-family: ui-monospace, monospace;
  font-size: 1.2rem; font-weight: bold;
  color: var(--clay); letter-spacing: 0.1em;
  text-transform: uppercase;
}
.round-label.flash { animation: flashLabel 0.5s; }
@keyframes flashLabel { 0%{transform:scale(1)} 50%{transform:scale(1.3);color:#f4efe6} 100%{transform:scale(1)} }

.ring {
  display: flex; justify-content: center; align-items: flex-end;
  gap: 0; min-height: 280px; position: relative;
  background: linear-gradient(180deg, transparent 60%, rgba(194,77,44,0.05) 100%);
  border-radius: 12px; padding: 16px 0;
}
.fighter { text-align:center; width: 45%; position:relative; }
.fighter.right { transform: scaleX(-1); }
.fighter.right .fighter-name, .fighter.right .fighter-lang,
.fighter.right .health-text, .fighter.right .health-bar { transform: scaleX(-1); }

.health-bar {
  width: 120px; height: 12px; background: #2a221e;
  border-radius: 6px; overflow: hidden; margin: 0 auto 4px;
  border: 1px solid #3a3028;
}
.health-fill {
  height: 100%; transition: width 0.6s ease-out, background 0.3s;
  background: #4a9968;
}
.health-fill.low { background: #c24d2c; }
.health-fill.mid { background: #c9a22c; }
.health-text {
  font-family: ui-monospace, monospace; font-size: 0.85rem;
  color: var(--muted); margin-bottom: 8px;
}
.boxer {
  display: inline-block; animation: bob 0.8s ease-in-out infinite alternate;
  transition: transform 0.2s, filter 0.2s;
}
@keyframes bob { from{transform:translateY(0)} to{transform:translateY(-6px)} }
.boxer.hit-taken { animation: stagger 0.4s; filter: brightness(2) sepia(1) hue-rotate(-50deg); }
.boxer.landed { animation: lunge 0.3s; }
@keyframes stagger { 0%{transform:translateX(0)} 30%{transform:translateX(-20px) rotate(-5deg)} 60%{transform:translateX(10px) rotate(3deg)} 100%{transform:translateX(0)} }
@keyframes lunge { 0%{transform:translateX(0)} 50%{transform:translateX(15px)} 100%{transform:translateX(0)} }
.fighter.right .boxer.hit-taken { animation-name: staggerR; }
.fighter.right .boxer.landed { animation-name: lungeR; }
@keyframes staggerR { 0%{transform:scaleX(-1) translateX(0)} 30%{transform:scaleX(-1) translateX(-20px) rotate(5deg)} 60%{transform:scaleX(-1) translateX(10px) rotate(-3deg)} 100%{transform:scaleX(-1) translateX(0)} }
@keyframes lungeR { 0%{transform:scaleX(-1) translateX(0)} 50%{transform:scaleX(-1) translateX(15px)} 100%{transform:scaleX(-1) translateX(0)} }

.fighter-name {
  font-family: ui-monospace, monospace; font-size: 0.8rem;
  color: var(--ink); margin-top: 8px; word-break: break-all;
}
.fighter-lang { font-size: 0.75rem; color: var(--muted); }

.vs {
  display: flex; align-items: center; justify-content: center;
  width: 10%; padding-bottom: 60px;
}
.vs span {
  font-family: Georgia, serif; font-size: 2.5rem; font-weight: bold;
  font-style: italic; color: var(--clay);
  animation: pulse 1s ease-in-out infinite alternate;
}
@keyframes pulse { from{opacity:0.5;transform:scale(1)} to{opacity:1;transform:scale(1.1)} }

.announcer {
  font-family: ui-monospace, monospace; font-size: 0.9rem;
  color: var(--muted); margin: 16px auto; min-height: 24px;
  max-width: 400px;
}
.rounds-log {
  font-family: ui-monospace, monospace; font-size: 0.75rem;
  color: var(--muted); text-align: left; max-width: 400px;
  margin: 0 auto; max-height: 120px; overflow-y: auto;
  border-top: 1px solid var(--line); padding-top: 8px;
}
.rounds-log .entry { padding: 2px 0; }
.rounds-log .good { color: var(--good); }
.rounds-log .bad { color: var(--bad); }
</style>

<script>
const REPO_A = ${JSON.stringify(repoA)};
const REPO_B = ${JSON.stringify(repoB)};
const ORIGIN = ${JSON.stringify(origin)};

// Trust computation (client-side, same as server)
function computeTrust(f) {
  let alpha = 1, beta = 0;
  const signals = [];
  if (f.hasLicense) { alpha += 1; signals.push(['license','good']); } else { beta += 1; signals.push(['license','bad']); }
  if (f.hasTests) { alpha += 1; } else { beta += 0.5; signals.push(['tests','bad']); }
  if (f.hasCI) { alpha += 1; } else { beta += 0.5; signals.push(['ci','bad']); }
  if (f.installScripts) { beta += 2; signals.push(['install','bad']); } else { alpha += 0.5; }
  if (f.deps !== null) {
    if (f.deps <= 10) { alpha += 1; } else if (f.deps <= 50) { alpha += 0.5; } else { beta += 1; signals.push(['deps','bad']); }
  }
  if (f.contributorCount >= 10) { alpha += 1; } else if (f.contributorCount < 3) { beta += 0.5; signals.push(['contrib','bad']); }
  if (f.stars > 0) {
    if (f.forks / f.stars > 0.05) { alpha += 1; } else { beta += 0.5; signals.push(['adoption','bad']); }
  }
  if (f.archived) { beta += 3; signals.push(['archived','bad']); }
  const months = f.monthsSinceActivity;
  if (months <= 1) { alpha += 1; } else if (months <= 6) { alpha += 0.5; } else if (months <= 12) { alpha *= 0.8; signals.push(['stale','bad']); }
  else { beta += 1; alpha *= Math.max(0.3, 1 - (months - 12) * 0.05); signals.push(['abandoned','bad']); }
  return (alpha + 1) / (alpha + beta + 2);
}

function langColor(lang) {
  const colors = { JavaScript:'#f1e05a', TypeScript:'#3178c6', Python:'#3572A5', Go:'#00ADD8', Rust:'#dea584', Java:'#b07219', Ruby:'#701516', 'C++':'#f34b7d', C:'#555', 'C#':'#178600', Swift:'#F05138', Kotlin:'#A97BFF', Dart:'#00B4AB', HTML:'#e34c26', CSS:'#563d7c', Shell:'#89e051', Lua:'#000080' };
  return colors[lang] || '#6e6256';
}

const GH = 'https://api.github.com';
const UA = { 'User-Agent': 'repo-death-match/1.0', 'Accept': 'application/vnd.github+json' };

async function ghFetch(path, token) {
  const h = { ...UA };
  if (token) h.Authorization = 'Bearer ' + token;
  const res = await fetch(GH + path, { headers: h });
  if (res.status === 403) throw new Error('GitHub rate limit hit. Try again later or use a token.');
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('GitHub API error: ' + res.status);
  return res;
}

async function ghJson(path, token) {
  const res = await ghFetch(path, token);
  return res ? res.json() : null;
}

function monthsSince(dateStr) {
  if (!dateStr) return 99;
  const d = new Date(dateStr); const now = new Date();
  return Math.max(0, (now.getFullYear()-d.getFullYear())*12 + (now.getMonth()-d.getMonth()));
}

// Scan a repo, returning stats incrementally via callback
async function scanRepoRound(owner, repo, round, token, onStat) {
  const base = '/repos/' + owner + '/' + repo;
  const f = { owner, repo, handle: owner+'/'+repo, stars:0, forks:0, contributorCount:0, primaryLanguage:'Unknown', hasLicense:false, license:'NONE', installScripts:false, deps:null, hasTests:false, hasCI:false, monthsSinceActivity:99, archived:false, openIssues:0 };

  if (round === 1) {
    // Metadata round
    const meta = await ghJson(base, token);
    if (!meta) return { ...f, error: 'not_found' };
    f.stars = meta.stargazers_count || 0;
    f.forks = meta.forks_count || 0;
    f.primaryLanguage = meta.language || 'Unknown';
    f.hasLicense = !!(meta.license && meta.license.spdx_id && meta.license.spdx_id !== 'NOASSERTION' && meta.license.spdx_id !== 'NONE');
    f.license = meta.license ? meta.license.spdx_id : 'NONE';
    f.archived = meta.archived || false;
    f.openIssues = meta.open_issues_count || 0;
    f.lastActivity = meta.pushed_at;
    f.monthsSinceActivity = monthsSince(meta.pushed_at);
    f.description = meta.description || '';
    onStat({ stars: f.stars, forks: f.forks, language: f.primaryLanguage, hasLicense: f.hasLicense, license: f.license, archived: f.archived, monthsSinceActivity: f.monthsSinceActivity, primaryLanguage: f.primaryLanguage });
  }
  if (round === 2) {
    // Contributors
    const res = await ghFetch(base + '/contributors?per_page=1&anon=true', token);
    if (res) {
      const link = res.headers.get('link') || '';
      const m = link.match(/page=(\\d+)>; rel="last"/);
      f.contributorCount = m ? parseInt(m[1]) : (await res.json()).length;
    }
    onStat({ contributors: f.contributorCount });
  }
  if (round === 3) {
    // Activity
    const commits = await ghJson(base + '/commits?per_page=1', token);
    if (commits && commits[0]) {
      f.lastCommitDate = commits[0].commit.committer.date;
      f.monthsSinceActivity = monthsSince(f.lastCommitDate);
    }
    onStat({ monthsSinceActivity: f.monthsSinceActivity });
  }
  if (round === 4) {
    // Tests
    try {
      const testsRes = await ghFetch(base + '/contents/tests', token);
      if (testsRes) { const d = await testsRes.json(); f.hasTests = Array.isArray(d) || (d && d.type); }
      if (!f.hasTests) {
        const testRes = await ghFetch(base + '/contents/test', token);
        if (testRes) { const d = await testRes.json(); f.hasTests = Array.isArray(d) || (d && d.type); }
      }
    } catch {}
    onStat({ hasTests: f.hasTests });
  }
  if (round === 5) {
    // CI
    try {
      const ciRes = await ghFetch(base + '/contents/.github/workflows', token);
      if (ciRes) { const d = await ciRes.json(); f.hasCI = Array.isArray(d) || (d && d.type); }
    } catch {}
    onStat({ hasCI: f.hasCI });
  }
  if (round === 6) {
    // Dependencies / install scripts
    try {
      const pkg = await ghJson(base + '/contents/package.json', token);
      if (pkg && pkg.content) {
        const p = JSON.parse(atob(pkg.content));
        f.deps = Object.keys(p.dependencies||{}).length + Object.keys(p.devDependencies||{}).length;
        f.installScripts = !!(p.scripts && (p.scripts.postinstall || p.scripts.preinstall));
      }
    } catch {}
    if (f.deps === null) {
      try {
        const req = await ghJson(base + '/contents/requirements.txt', token);
        if (req && req.content) {
          f.deps = atob(req.content).split('\\n').filter(l=>l.trim()&&!l.startsWith('#')).length;
        }
      } catch {}
    }
    if (f.deps === null) {
      try {
        const py = await ghJson(base + '/contents/pyproject.toml', token);
        if (py && py.content) {
          const t = atob(py.content);
          const m = t.match(/\\[project\\.dependencies\\][^\\[]*/i);
          if (m) f.deps = m[0].split('\\n').filter(l=>l.trim()&&!l.startsWith('[')).length;
        }
      } catch {}
    }
    onStat({ deps: f.deps, installScripts: f.installScripts });
  }
  return f;
}

// Parse owner/repo
function parseRepo(input) {
  const t = input.trim().replace(/^https?:\\/\\/(www\\.)?github\\.com\\//, '').replace(/\\/$/, '');
  const parts = t.split('/');
  return parts.length >= 2 ? { owner: parts[0], repo: parts[1] } : null;
}

const ROUNDS = [
  { name: 'METADATA', label: 'Reading the basics...' },
  { name: 'CONTRIBUTORS', label: 'Counting contributors...' },
  { name: 'ACTIVITY', label: 'Checking last commit...' },
  { name: 'TESTS', label: 'Looking for tests...' },
  { name: 'CI', label: 'Checking CI...' },
  { name: 'DEPENDENCIES', label: 'Scanning dependencies...' },
];

const repoA = parseRepo(REPO_A);
const repoB = parseRepo(REPO_B);
if (!repoA || !repoB) { window.location.href = '/'; }

let fighterA = { owner: repoA.owner, repo: repoA.repo, handle: REPO_A, stars:0, forks:0, contributorCount:0, primaryLanguage:'Unknown', hasLicense:false, license:'NONE', installScripts:false, deps:null, hasTests:false, hasCI:false, monthsSinceActivity:99, archived:false, openIssues:0 };
let fighterB = { owner: repoB.owner, repo: repoB.repo, handle: REPO_B, stars:0, forks:0, contributorCount:0, primaryLanguage:'Unknown', hasLicense:false, license:'NONE', installScripts:false, deps:null, hasTests:false, hasCI:false, monthsSinceActivity:99, archived:false, openIssues:0 };

function updateHealth(side, trust) {
  const pct = Math.round(trust * 100);
  const bar = document.getElementById('health-' + side);
  const txt = document.getElementById('trust-' + side);
  bar.style.width = pct + '%';
  bar.className = 'health-fill' + (pct < 40 ? ' low' : pct < 70 ? ' mid' : '');
  txt.textContent = trust.toFixed(2);
}

function react(side, good) {
  const boxer = document.getElementById('boxer-' + side);
  const other = side === 'a' ? 'b' : 'a';
  const otherBoxer = document.getElementById('boxer-' + other);
  boxer.classList.remove('hit-taken', 'landed');
  otherBoxer.classList.remove('hit-taken', 'landed');
  void boxer.offsetWidth; // reflow
  if (good) {
    boxer.classList.add('landed');
    otherBoxer.classList.add('hit-taken');
  } else {
    boxer.classList.add('hit-taken');
    otherBoxer.classList.add('landed');
  }
  setTimeout(() => {
    boxer.classList.remove('hit-taken', 'landed');
    otherBoxer.classList.remove('hit-taken', 'landed');
  }, 500);
}

function logRound(text, good) {
  const log = document.getElementById('rounds-log');
  const entry = document.createElement('div');
  entry.className = 'entry ' + (good === true ? 'good' : good === false ? 'bad' : '');
  entry.textContent = text;
  log.prepend(entry);
}

function setRound(label) {
  const el = document.getElementById('round-label');
  el.textContent = label;
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

function setLang(side, lang) {
  const el = document.getElementById('lang-' + side);
  el.textContent = lang;
  const root = document.documentElement;
  root.style.setProperty('--color-' + side, langColor(lang));
  const body = document.querySelector('#boxer-' + side + ' .body');
  if (body) body.setAttribute('fill', langColor(lang));
}

async function runFight() {
  const announcer = document.getElementById('announcer');
  let fullA = { ...fighterA };
  let fullB = { ...fighterB };

  for (let r = 0; r < ROUNDS.length; r++) {
    const round = r + 1;
    setRound('ROUND ' + round + ': ' + ROUNDS[r].name);
    announcer.textContent = ROUNDS[r].label;

    try {
      await Promise.all([
        scanRepoRound(repoA.owner, repoA.repo, round, null, (s) => Object.assign(fullA, s)),
        scanRepoRound(repoB.owner, repoB.repo, round, null, (s) => Object.assign(fullB, s)),
      ]);
    } catch (err) {
      announcer.textContent = 'Error: ' + err.message;
      logRound('Round ' + round + ' failed: ' + err.message, false);
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }

    // Update language colors
    if (fullA.primaryLanguage) setLang('a', fullA.primaryLanguage);
    if (fullB.primaryLanguage) setLang('b', fullB.primaryLanguage);

    // Recompute trust
    const trustA = computeTrust(fullA);
    const trustB = computeTrust(fullB);
    updateHealth('a', trustA);
    updateHealth('b', trustB);

    // React based on round results
    let aGood = true, bGood = true;
    if (round === 1) {
      aGood = fullA.hasLicense; bGood = fullB.hasLicense;
      logRound(fullA.repo + ': ' + fullA.stars + ' stars, ' + (fullA.hasLicense ? 'MIT' : 'NO LICENSE'), aGood);
      logRound(fullB.repo + ': ' + fullB.stars + ' stars, ' + (fullB.hasLicense ? 'MIT' : 'NO LICENSE'), bGood);
    } else if (round === 2) {
      aGood = fullA.contributorCount >= 3; bGood = fullB.contributorCount >= 3;
      logRound(fullA.repo + ': ' + fullA.contributorCount + ' contributors', aGood);
      logRound(fullB.repo + ': ' + fullB.contributorCount + ' contributors', bGood);
    } else if (round === 3) {
      aGood = fullA.monthsSinceActivity <= 6; bGood = fullB.monthsSinceActivity <= 6;
      logRound(fullA.repo + ': last commit ' + fullA.monthsSinceActivity + 'mo ago', aGood);
      logRound(fullB.repo + ': last commit ' + fullB.monthsSinceActivity + 'mo ago', bGood);
    } else if (round === 4) {
      aGood = fullA.hasTests; bGood = fullB.hasTests;
      logRound(fullA.repo + ': ' + (fullA.hasTests ? 'has tests' : 'NO TESTS'), aGood);
      logRound(fullB.repo + ': ' + (fullB.hasTests ? 'has tests' : 'NO TESTS'), bGood);
    } else if (round === 5) {
      aGood = fullA.hasCI; bGood = fullB.hasCI;
      logRound(fullA.repo + ': ' + (fullA.hasCI ? 'CI passes' : 'NO CI'), aGood);
      logRound(fullB.repo + ': ' + (fullB.hasCI ? 'CI passes' : 'NO CI'), bGood);
    } else if (round === 6) {
      aGood = !fullA.installScripts; bGood = !fullB.installScripts;
      logRound(fullA.repo + ': ' + (fullA.deps ?? '?') + ' deps, ' + (fullA.installScripts ? 'INSTALL SCRIPT' : 'clean install'), aGood);
      logRound(fullB.repo + ': ' + (fullB.deps ?? '?') + ' deps, ' + (fullB.installScripts ? 'INSTALL SCRIPT' : 'clean install'), bGood);
    }

    react('a', aGood);
    react('b', bGood);

    await new Promise(r => setTimeout(r, 1000));
  }

  // Final round
  setRound('FINAL');
  const finalTrustA = computeTrust(fullA);
  const finalTrustB = computeTrust(fullB);
  updateHealth('a', finalTrustA);
  updateHealth('b', finalTrustB);

  const winner = Math.abs(finalTrustA - finalTrustB) < 0.08 ? 'draw' : (finalTrustA > finalTrustB ? 'a' : 'b');
  if (winner === 'draw') {
    announcer.textContent = 'DRAW! It depends.';
    logRound('DRAW. Both fighters still standing.', null);
  } else {
    const loser = winner === 'a' ? 'b' : 'a';
    announcer.textContent = (winner === 'a' ? fullA.repo : fullB.repo) + ' WINS!';
    logRound((winner === 'a' ? fullA.repo : fullB.repo) + ' wins by KO. Trust ' + (winner === 'a' ? finalTrustA : finalTrustB).toFixed(2), true);
    const loserBoxer = document.getElementById('boxer-' + loser);
    loserBoxer.style.animation = 'stagger 0.8s';
    loserBoxer.style.opacity = '0.5';
    const winnerBoxer = document.getElementById('boxer-' + winner);
    winnerBoxer.style.transform = 'translateY(-20px) scale(1.1)';
  }

  await new Promise(r => setTimeout(r, 2000));

  // Send to server for card storage
  try {
    const res = await fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fighterA: fullA, fighterB: fullB }),
    });
    const data = await res.json();
    if (data.id) window.location.href = '/m/' + data.id;
  } catch (e) {
    announcer.textContent = 'Failed to save match. ' + e.message;
  }
}

// Start the fight
runFight();
</script>
`;

  return layout(body, { title: repoA + ' vs ' + repoB + ' — Repo Death Match' });
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
