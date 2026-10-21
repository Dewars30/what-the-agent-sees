import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, HttpError } from '../../core/page.mjs';
import { shell, esc } from '../../core/kit.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const APP = process.env.PUBLIC_ORIGIN || 'https://sitefm.synteq.app';

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

// Compose a score from page structure. Pure function of the document.
function compose(r) {
  const p = r.page;
  const seed = hash(p.host);
  const keys = [
    { name: 'A minor pentatonic', root: 55.0, scale: [0, 3, 5, 7, 10] },
    { name: 'D minor pentatonic', root: 73.42, scale: [0, 3, 5, 7, 10] },
    { name: 'E minor pentatonic', root: 82.41, scale: [0, 3, 5, 7, 10] },
    { name: 'C major pentatonic', root: 65.41, scale: [0, 2, 4, 7, 9] },
  ];
  const key = keys[seed % keys.length];
  const bpm = 68 + (Math.min(48, p.links.length) % 32);

  // group content into sections by headings in document order
  const sections = [];
  const bodyWords = p.mainWords;
  const h2s = p.headings.filter((h) => h.level <= 3).slice(0, 8);
  if (h2s.length) {
    for (const h of h2s) sections[('x')] = null;
  }
  const list = p.headings.filter((h) => h.level <= 3).slice(0, 6);
  const per = list.length ? Math.max(1, Math.round(bodyWords / list.length)) : bodyWords;
  const totalLinks = p.links.length;
  const perLinks = list.length ? Math.max(0, Math.round(totalLinks / list.length)) : totalLinks;

  const notes = [];
  const bars = Math.max(2, Math.min(8, list.length || 4));
  for (let b = 0; b < bars; b++) {
    const h = list[b];
    const level = h ? h.level : 2;
    const density = Math.max(2, Math.min(8, Math.round((per || 40) / 18)));
    const baseDeg = (level - 1) % 5;
    for (let step = 0; step < 8; step++) {
      if (step % 2 === 1 && density < 6) continue;
      if (step > density) continue;
      const deg = (baseDeg + ((seed >> (b * 2 + step)) % 5)) % 5;
      const oct = level <= 1 ? 1 : level === 2 ? 2 : 3;
      const midi = 12 * Math.log2(key.root / 55) + 21 + key.scale[deg] + oct * 12;
      const vel = 0.35 + Math.min(0.5, density / 16);
      notes.push({
        bar: b, step,
        freq: Number((440 * Math.pow(2, (midi - 69) / 12)).toFixed(2)),
        vel: Number(vel.toFixed(2)),
        kind: step % 4 === 0 ? 'lead' : 'pluck',
      });
    }
    // links become off-beat clicks
    const clicks = Math.min(4, Math.round(perLinks / 8));
    for (let i = 0; i < clicks; i++) {
      notes.push({ bar: b, step: 3 + i * 2, freq: 0, vel: 0.18, kind: 'click' });
    }
  }
  // images without alt become long pads (or conspicuous silence)
  const noAlt = p.images.filter((im) => !im.alt).length;
  const pads = Math.min(3, Math.ceil(noAlt / 6));
  for (let i = 0; i < pads; i++) {
    const deg = (seed >> i) % 3;
    notes.push({ bar: i * 2, step: 0, freq: Number((key.root * Math.pow(2, key.scale[deg] / 12)).toFixed(2)), vel: 0.5, kind: 'pad', dur: 2 });
  }
  // forms are chord stabs
  for (let i = 0; i < Math.min(2, p.forms.length); i++) {
    notes.push({ bar: (i * 3) % bars, step: 4, freq: Number((key.root * 2).toFixed(2)), vel: 0.4, kind: 'stab' });
  }
  // bassline: root each bar
  for (let b = 0; b < bars; b++) {
    notes.push({ bar: b, step: 0, freq: Number((key.root * 0.5 * (1 + ((seed >> b) % 2) * 0.5)).toFixed(2)), vel: 0.5, kind: 'bass' });
  }

  return {
    host: p.host,
    url: p.url,
    title: p.title,
    key: key.name,
    bpm,
    bars,
    words: p.mainWords,
    links: p.links.length,
    images: p.images.length,
    noAlt,
    sections: list.map((h, i) => ({ text: h.text.slice(0, 64), level: h.level, bar: i })),
    notes: notes.sort((a, b) => a.bar - b.bar || a.step - b.step),
    score: r.scored.score,
  };
}

function player(r) {
  const piece = compose(r);
  const share = encodeURIComponent(`Here is what ${piece.host} sounds like.\n\nEvery heading is a melody, every link a beat, every missing alt text a silence.\n\n${APP}/?url=${encodeURIComponent(piece.url)}`);
  return shell({
    title: `${piece.host} — Site FM`,
    description: `${piece.host}, composed from its own HTML: ${piece.bars} bars, ${piece.key}, ${piece.bpm} BPM.`,
    nav: false,
    body: `<main>
  <header class="top"><a class="brand" href="/"><span class="dot"></span>Site FM</a><nav><a href="/">another site</a></nav></header>
  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:20px;flex-wrap:wrap;margin:40px 0 0">
    <h1 class="fh">${esc(piece.host)}</h1>
    <div class="kicker">${esc(piece.key)} · ${piece.bpm} BPM · ${piece.bars} bars · ${piece.notes.length} events</div>
  </div>
  <p class="sub" style="margin-top:10px">${esc((piece.title || 'Untitled').slice(0, 120))}</p>
  <section class="deck">
    <canvas id="canvas" width="1200" height="320"></canvas>
    <div class="controls">
      <button id="play" class="play">▶ Play</button>
      <button id="stop" class="btn">Stop</button>
      <span class="legend"><i class="lk"></i>headings <i class="lk l2"></i>links <i class="lk l3"></i>images <i class="lk l4"></i>forms</span>
      <a class="btn" target="_blank" rel="noopener" href="https://x.com/intent/tweet?text=${share}">Share this track</a>
    </div>
  </section>
  <section class="grid3" style="margin-top:26px">
    <div><div class="kicker">Composition</div><p class="muted small" style="margin:8px 0 0">${piece.words} words of content became ${piece.notes.filter((n) => n.kind !== 'click').length} notes across ${piece.bars} bars. Each section heading sets the register; punctuation in the structure sets the rhythm.</p></div>
    <div><div class="kicker">Silence</div><p class="muted small" style="margin:8px 0 0">${piece.images === 0 ? 'No inline images at all. The whole page is text, which the agents will be grateful for and your designer will not.' : `${piece.noAlt} of ${piece.images} images had no alt text. Those are rendered as sustained pads and gaps, because to an agent that is exactly what they are.`}</p></div>
    <div><div class="kicker">Everything is data</div><p class="muted small" style="margin:8px 0 0">No samples, no model. The score is generated in your browser from the page's own structure. Open the same URL tomorrow and you will hear the same track.</p></div>
  </section>
  <footer class="bot"><span>Site FM turns documents into sound. It is a toy and it is completely honest.</span><span>${esc(piece.host)} · agent score ${piece.score}/100</span></footer>
</main>
<script id="piece" type="application/json">${JSON.stringify(piece).replace(/</g, '\\u003c')}</script>
<script src="/app.js"></script>
<style>
.fh{font-family:var(--mono);font-weight:500;font-size:clamp(28px,5vw,46px);letter-spacing:-.03em;margin:0;word-break:break-word}
.deck{border:1px solid var(--line);background:linear-gradient(180deg,#0b0d0f,#08090a);border-radius:3px;margin-top:24px;overflow:hidden}
#canvas{display:block;width:100%;height:auto;background:transparent}
.controls{display:flex;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid var(--line);flex-wrap:wrap}
.play{background:var(--acid);color:#08110a;border:0;font-family:var(--mono);font-size:12px;letter-spacing:.16em;text-transform:uppercase;padding:12px 20px;border-radius:2px;cursor:pointer;font-weight:600}
.legend{font-family:var(--mono);font-size:10.5px;color:var(--dimmer);display:flex;align-items:center;gap:6px;letter-spacing:.06em}
.lk{width:8px;height:8px;background:var(--acid);display:inline-block;border-radius:1px}
.lk.l2{background:#5ad2ff}.lk.l3{background:#ffb02e}.lk.l4{background:#ff7ad9}
</style>`,
  });
}

function landing(err) {
  return shell({
    title: 'Site FM — every website has a sound',
    description: 'Paste a URL and hear your website. Headings become melody, links become rhythm, missing alt text becomes silence.',
    nav: false,
    body: `<main>
  <header class="top"><a class="brand" href="/"><span class="dot"></span>Site FM</a><nav><a href="/about">about</a></nav></header>
  <h1 class="hero">Every website<br><span class="accent">has a sound.</span></h1>
  <p class="sub">Site FM reads a page's HTML and composes it. Headings pick the melody, link density sets the tempo, forms drop a chord, and every image with no alt text becomes silence. No samples, no model, no two sites alike.</p>
  <form class="scan" method="get" action="/">
    <input name="url" placeholder="yourdomain.com" autocomplete="off" spellcheck="false" autofocus value="${esc(err?.value || '')}">
    <button type="submit">Compose</button>
  </form>
  <div class="hintrow"><span style="align-self:center;letter-spacing:.18em">TRY</span>
    ${['stripe.com', 'linear.app', 'notion.so', 'github.com', 'supabase.com'].map((h) => `<button type="button" data-u="${h}">${h}</button>`).join('')}
  </div>
  ${err ? `<section class="card pad" style="margin-top:26px"><div class="err">${esc(err.message)}</div></section>` : ''}
  <section class="grid3" style="margin-top:34px">
    <div><div class="kicker">You have heard a website. Now hear one.</div><p class="muted small" style="margin:8px 0 0">Most sites sound like a nice pentatonic loop, which tells you something depressing about modern web structure.</p></div>
    <div><div class="kicker">Sound on</div><p class="muted small" style="margin:8px 0 0">Headphones recommended. This is not background music, it is a diagnostic you can hum.</p></div>
    <div><div class="kicker">Deterministic</div><p class="muted small" style="margin:8px 0 0">Same page, same track, forever. The composition is a function of the document, not of a random seed or a mood.</p></div>
  </section>
</main>
<script>document.querySelectorAll('[data-u]').forEach(b=>b.addEventListener('click',()=>{const i=document.querySelector('input[name=url]');i.value=b.dataset.u;i.form.submit();}));</script>`,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
  if (url.pathname === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nAllow: /\n');
  if (url.pathname === '/app.js') return send(200, 'text/javascript; charset=utf-8', fs.readFileSync(path.join(__dir, 'public', 'app.js')));
  if (url.pathname === '/about') return send(200, 'text/html; charset=utf-8', shell({
    title: 'About — Site FM', description: 'How a page becomes a track.', nav: false,
    body: `<main><header class="top"><a class="brand" href="/"><span class="dot"></span>Site FM</a><nav><a href="/">compose</a></nav></header>
    <h1 class="hero" style="font-size:clamp(24px,3.6vw,36px)">How a page becomes a track</h1>
    <p class="sub">One request, no rendering. Headings up to H3 become bars. Heading level sets the register. Word count sets note density. Links become off-beat clicks. Images without alt text become sustained pads; images without alt text are, to an agent, literally invisible, so they are rendered as the parts you feel but cannot read. Forms drop a chord. The key and tempo come from a hash of the hostname, so a site has one voice and keeps it.</p></main>`,
  }));
  try {
    if (url.pathname === '/') {
      const target = url.searchParams.get('url');
      if (!target) return send(200, 'text/html; charset=utf-8', landing());
      try {
        const r = await analyze(target);
        return send(200, 'text/html; charset=utf-8', player(r));
      } catch (e) {
        const err = e instanceof HttpError ? e : new HttpError(500, 'That page could not be composed.');
        if (err.status >= 500) console.error(e);
        return send(err.status === 500 ? 500 : 200, 'text/html; charset=utf-8', landing({ message: err.message, value: target }));
      }
    }
    send(404, 'text/plain', 'not found');
  } catch (e) { console.error(e); send(500, 'text/plain', 'error'); }
});
server.listen(PORT, () => console.log('sitefm on ' + PORT));
