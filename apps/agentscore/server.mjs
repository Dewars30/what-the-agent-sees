import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, HttpError } from '../../core/page.mjs';
import { shell, esc } from '../../core/kit.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const APP = process.env.PUBLIC_ORIGIN || 'https://agentscore.synteq.app';

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
  </div>`;
}

function resultView(r, rawInput) {
  const { scored, page } = r;
  const share = encodeURIComponent(
    `${page.host} scores ${scored.score}/100 for AI agents: ${scored.verdict}.\n\nScore yours: ${APP}`
  );
  const dims = scored.dims
    .map(
      (d) => `<div class="dim"><span class="lbl">${esc(d.label)}</span>
      <span class="bar"><i style="width:${d.score}%"></i></span><span class="val">${d.score}</span></div>`
    )
    .join('');
  const order = { fail: 0, warn: 1, ok: 2 };
  const findings = [...scored.findings].sort((a, b) => order[a.level] - order[b.level]).slice(0, 16);
  const fails = scored.fails.length;

  return shell({
    title: `${page.host} — ${scored.score}/100 · AgentScore`,
    description: `${page.host} scores ${scored.score}/100 for how well an AI agent can read and act on it. ${scored.verdict}.`,
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
        <div style="margin-top:14px">${findings.map(findingRow).join('')}</div>
      </div>
    </div>
    <div class="actions">
      <a class="btn primary" target="_blank" rel="noopener" href="https://x.com/intent/tweet?text=${share}">Post my score</a>
      <a class="btn" href="/?url=${encodeURIComponent(page.url)}">Rescan</a>
      <a class="btn" href="/">Check another site</a>
      <a class="btn" href="/method">How this is scored</a>
    </div>
  </section>
  <section class="card pad">
    <div class="kicker">Summary</div>
    <p class="muted small" style="margin:10px 0 0;max-width:76ch">${esc(r.tlDr)} The page answered ${esc(page.lang ? 'lang=' + page.lang : 'no lang')}, ${page.headings.length} headings, ${page.links.length} links, ${page.forms.length} form${page.forms.length === 1 ? '' : 's'}, ${page.images.length} images, and ${page.mainWords} words of text before any script executed.</p>
  </section>
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

function landing(err) {
  const idx = loadIndex();
  const top = idx.rows.slice(0, 5);
  const rows = top
    .map((r) => `<tr><td><a href="/?url=${encodeURIComponent('https://' + r.host)}">${esc(r.host)}</a></td><td class="s">${r.score}</td></tr>`)
    .join('');
  return shell({
    title: 'AgentScore — how your site looks to an AI agent',
    description: 'Paste a URL. Get a 0-100 score on whether an AI agent can actually read and act on your site, plus the exact fixes.',
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
  ${top.length ? `<section class="card pad" style="margin-top:4px"><div style="display:flex;justify-content:space-between;align-items:baseline"><div class="kicker">Lowest scores on the index</div><a class="kicker" href="/index" style="text-decoration:none;color:var(--acid)">All ${idx.rows.length} →</a></div>
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
  return shell({
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

function methodView() {
  return shell({
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
  const send = (code, type, body) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
  };
  try {
    if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
    if (url.pathname === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nAllow: /\n');
    if (url.pathname === '/method') return send(200, 'text/html; charset=utf-8', methodView());
    if (url.pathname === '/index') return send(200, 'text/html; charset=utf-8', indexView());
    if (url.pathname === '/api/scan') {
      const target = url.searchParams.get('url');
      const r = await analyze(target);
      return send(200, 'application/json', JSON.stringify({ score: r.scored.score, grade: r.scored.grade, verdict: r.scored.verdict, dims: r.scored.dims, tlDr: r.tlDr }));
    }
    if (url.pathname === '/') {
      const target = url.searchParams.get('url');
      if (!target) return send(200, 'text/html; charset=utf-8', landing());
      try {
        const r = await analyze(target);
        return send(200, 'text/html; charset=utf-8', resultView(r, target));
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
