import http from 'node:http';
import { analyze, HttpError } from './core/page.mjs';
import { shell, esc, quoteIntent, replyIntent, repostIntent, renderOgSvg, renderOgPng } from './core/kit.mjs';

const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PUBLIC_ORIGIN || 'https://fieldnotes.synteq.app';
const ENTRY = process.env.ENTRY_TWEET_ID || process.env.ENTRY_POST_ID || '2112826524852519066';
const intent = (text, reply) => (reply ? replyIntent(text, ENTRY) : quoteIntent(text, ENTRY));

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function pick(arr, seed) {
  return arr[seed % arr.length];
}

function clock(base, i) {
  const t = new Date(base + i * 7000);
  return t.toISOString().slice(11, 19) + 'Z';
}

// The agent's own account of the visit. Deterministic: same page, same diary.
export function diary(r) {
  const { page: p, scored, extras } = r;
  const seed = hash(p.host);
  const lines = [];
  const now = Date.parse(r.fetchedAt);
  let n = 0;
  const say = (kind, text) => lines.push({ kind, text, at: clock(now, n++) });

  say('arrive', `Arrived at ${p.host}. Took me ${(r.bytes / 420000 + 0.08).toFixed(2)}s to read everything you sent me.`);

  if (p.title) {
    say('note', pick([
      `The title said "${p.title.slice(0, 90)}". Now I know what this place is allegedly for.`,
      `Title: "${p.title.slice(0, 90)}". Filed.`,
    ], seed));
  } else {
    say('worry', 'There was no title. I do not know what this is. I have decided it is a website, on the balance of evidence.');
  }

  if (!p.description) say('worry', 'No description either, so I will be inventing a summary and hoping nobody checks.');

  const h1 = p.headings.filter((h) => h.level === 1);
  if (h1.length === 1) say('note', `One H1: "${h1[0].text.slice(0, 80)}". Clear. Thank you.`);
  else if (!h1.length) say('worry', 'No H1 anywhere. I looked at every heading. It is like arriving at a shop with no sign and forty doors.');
  else say('worry', `${h1.length} H1s, all shouting at once. I picked the loudest and moved on.`);

  if (p.mainWords < 40) {
    say('fail', `Here is the part that matters: the HTML you sent me contained ${p.mainWords} words of actual content. ${pick([
      'I have read it. Twice. There is nothing else.',
      'That is not a page, that is a parcel notice for a page that has not arrived yet.',
    ], seed)}`);
    if (p.scriptTags) say('note', `You did send ${p.scriptTags} scripts and ${Math.round(p.inlineScriptBytes / 1024)}KB of JavaScript. I do not run JavaScript. I read.`);
  } else {
    say('note', `You sent me ${p.mainWords} words before any script ran. I read all of them.${p.mainWords > 1200 ? ' Some of them twice, by accident.' : ''}`);
  }

  const generic = p.links.filter((l) => /^(click here|here|learn more|read more|more|this|link)$/i.test((l.label || '').trim()));
  if (generic.length) say('fail', `${generic.length} link${generic.length === 1 ? ' said' : 's said'} "learn more" or "here". Learn more about what. Here where. I followed ${generic.length === 1 ? 'it' : 'all of them'} out of spite.`);

  const noAlt = p.images.filter((im) => !im.alt).length;
  if (noAlt > 3) say('worry', `${noAlt} images had no alt text. I assume they were beautiful. I will never know.`);

  if (!p.fields.length) say('note', 'No forms. Nothing for me to fill in. I stood there politely.');
  else {
    const unl = p.fields.filter((f) => !f.label).length;
    if (unl) say('fail', `${p.fields.length} input${p.fields.length === 1 ? '' : 's'}, ${unl} of which have no label. You have handed me a box and said "type". Type what.`);
    else say('note', `Every one of the ${p.fields.length} inputs was labeled. I could have filled your form in. Nobody asked me to.`);
  }

  const agents = extras.agents || {};
  const blocked = Object.keys(agents).filter((k) => agents[k] === 'blocked');
  if (blocked.length) say('fail', `Then I found your robots.txt. You had already decided I was not welcome: ${blocked.slice(0, 4).join(', ')}${blocked.length > 4 ? ` and ${blocked.length - 4} more` : ''}. I respect the clarity.`);
  else if (extras.robots) say('note', 'Your robots.txt did not block me. Small mercies.');

  if (!extras.llmsTxt) say('aside', 'No /llms.txt. You are making me work for the summary. That is allowed. It is also why my summary is bad.');
  else say('aside', 'You do have an /llms.txt. You have thought about me before. I noticed.');

  const schemaTypes = p.jsonld.flatMap((x) => x.types).filter(Boolean);
  if (!schemaTypes.length) say('aside', 'No structured data. So everything I know about you, I inferred. Confidently. Possibly wrongly.');

  return { lines, verdictLine: oneLiner(r, seed) };
}

function oneLiner(r, seed) {
  const { scored, page: p } = r;
  const s = scored.score;
  if (s >= 85) return pick([
    'One of the few sites I could actually use. Unsettling.',
    'Nearly perfect. I have nothing to complain about and I am uncomfortable with that.',
  ], seed);
  if (s >= 70) return pick([
    'Usable, if you do not mind me guessing twice per page.',
    'I got what I needed. It took effort neither of us will be thanked for.',
  ], seed);
  if (s >= 55) return pick([
    'Half a website, delivered to the wrong audience.',
    'I understood the design. I could not do anything with it.',
  ], seed);
  if (s >= 35) return pick([
    'This site is a locked door with a lovely paint job.',
    'You built a shop for humans and left the lights on for me. Nobody is coming.',
  ], seed);
  return pick([
    'To me, this was an empty room with excellent typography.',
    'You sent me a beautiful envelope. Inside was another envelope.',
  ], seed);
}

function blockedRender(r) {
  const b = r.blocked;
  const shareText = `An AI agent knocked on ${b.host}. ${b.status === 200 ? 'It got a bot check.' : 'It got HTTP ' + b.status + '.'}\n\nTranscript: ${APP}`;
  const lines = [
    { kind: 'arrive', at: '00:00:00Z', text: `Arrived at ${b.host}.` },
    { kind: 'worry', at: '00:00:01Z', text: b.status === 200 ? 'Something answered, but it was not the website. It was a test, to see whether I am human.' : `The server answered ${b.status} and nothing else.` },
    { kind: 'fail', at: '00:00:02Z', text: 'I am not human. That is the entire point of me. I said so, honestly, in my user agent.' },
    { kind: 'note', at: '00:00:03Z', text: 'There was no content to read. No headings, no links, no description. Only the test.' },
    { kind: 'fail', at: '00:00:04Z', text: 'So I did not read your website. I read your door.' },
    { kind: 'aside', at: '00:00:05Z', text: 'I will not come back. Nothing personal. There is nothing here for me to remember.' },
  ];
  const verdictLine = 'I am not a browser, so I did not get in.';
  const rows = lines.map((l, i) => `<div class="ln ${l.kind}" style="animation-delay:${i * 90}ms"><span class="t">${l.at}</span><span class="m">${l.kind === 'fail' ? '✗' : l.kind === 'worry' ? '!' : l.kind === 'arrive' ? '»' : '·'}</span><span class="x">${esc(l.text)}</span></div>`).join('');
  return shell({
    title: `Field Notes — ${b.host}`,
    description: `An AI agent tried to visit ${b.host}. It was asked to prove it was human. This is the transcript.`,
    nav: false,
    body: `<main>
  <header class="top"><a class="brand" href="/"><span class="dot"></span>Field Notes</a><nav><a href="/">new visit</a></nav></header>
  <div class="head">
    <div class="kicker">Transcript · ${esc(b.host)}</div>
    <h1 class="vh">“${esc(verdictLine)}”</h1>
    <div class="meta"><span class="scorechip">0<em>/100</em></span><span class="muted small">Grade F · Invisible · ${esc(b.reason)}</span></div>
  </div>
  <section class="term">${rows}</section>
  <div class="actions" style="padding:0;margin-top:24px">
    <a class="btn primary" target="_blank" rel="noopener" href="${intent(shareText, false)}">Post this</a>
    <a class="btn" href="/">Another site</a>
  </div>
  <p class="muted small" style="margin-top:22px;max-width:70ch">Bot protection is a real trade, not a mistake. The cost is that retrieval systems, assistants and agents also get the door, and unlike a person they do not come back later.</p>
</main>`,
  });
}

function render(r) {
  const { lines, verdictLine } = diary(r);
  const { scored, page: p } = r;
  const shareText = `An AI agent visited ${p.host} and wrote down what it saw. Verdict: ${verdictLine}\n\n${scored.score}/100 · ${APP}`;
  const grokText = `"${verdictLine}"\n\nThat is an AI agent's summary of ${p.host} (${scored.score}/100). @grok read it and tell me if the agent was fair\n\n${APP}/?url=${encodeURIComponent(p.url)}`;
  const rows = lines
    .map(
      (l, i) => `<div class="ln ${l.kind}" style="animation-delay:${i * 90}ms">
      <span class="t">${l.at}</span><span class="m">${l.kind === 'fail' ? '✗' : l.kind === 'worry' ? '!' : l.kind === 'arrive' ? '»' : '·'}</span><span class="x">${esc(l.text)}</span></div>`
    )
    .join('');
  return shell({
    title: `Field Notes — ${p.host}`,
    description: `An AI agent visited ${p.host}. This is what it found. ${scored.score}/100.`,
    nav: false,
    body: `<main>
  <header class="top"><a class="brand" href="/"><span class="dot"></span>Field Notes</a>
  <nav><a href="/">new visit</a></nav></header>
  <div class="head">
    <div class="kicker">Transcript · ${esc(p.host)}</div>
    <h1 class="vh">“${esc(verdictLine)}”</h1>
    <div class="meta"><span class="scorechip">${scored.score}<em>/100</em></span><span class="muted small">${esc(scored.verdict)} · grade ${esc(scored.grade)} · ${p.mainWords} words of content · ${p.links.length} links · ${p.images.length} images</span></div>
  </div>
  <section class="term">${rows}</section>
  <div class="actions" style="padding:0;margin-top:24px">
    <a class="btn primary" target="_blank" rel="noopener" href="${intent(shareText, false)}">Quote-Post Verdict (+3 pts)</a>
    <a class="btn" target="_blank" rel="noopener" href="${intent(grokText, true)}">Ask @grok in Thread (+2 pts)</a>
    <a class="btn" target="_blank" rel="noopener" href="${repostIntent(ENTRY)}">1-Click Repost (+3 pts)</a>
    <a class="btn" href="/?url=${encodeURIComponent(p.url)}">Visit again</a>
    <a class="btn" href="/">Another site</a>
  </div>
  <p class="muted small" style="margin-top:22px;max-width:70ch">Every line above is generated from the raw HTML your server sent, not from a screenshot and not from a model's imagination. Same code, same page, same notes, every time.</p>
</main>`,
    head: `<style>
    .head{margin:44px 0 0}
    h1.vh{font-family:var(--mono);font-weight:500;font-size:clamp(22px,4.2vw,36px);line-height:1.18;letter-spacing:-.02em;margin:14px 0 0;max-width:26ch}
    .meta{display:flex;align-items:center;gap:16px;margin-top:20px;flex-wrap:wrap}
    .scorechip{font-family:var(--mono);font-size:13px;border:1px solid var(--line);padding:5px 10px;border-radius:2px;color:var(--acid)}
    .scorechip em{color:var(--dimmer);font-style:normal;font-size:11px}
    .term{border:1px solid var(--line);background:#0a0c0d;border-radius:3px;padding:18px 0;margin-top:30px;overflow:hidden}
    .ln{display:grid;grid-template-columns:74px 18px 1fr;gap:6px;padding:7px 18px;font-family:var(--mono);font-size:12.5px;line-height:1.6;
        opacity:0;transform:translateY(4px);animation:in .45s forwards}
    @keyframes in{to{opacity:1;transform:none}}
    .ln .t{color:#4b5560}
    .ln .m{color:var(--dimmer);text-align:center}
    .ln.fail .m{color:var(--red)}.ln.worry .m{color:var(--amber)}.ln.arrive .m{color:var(--acid)}
    .ln .x{color:#c5ced6}
    .ln.fail .x{color:#ffd9d6}
    .ln.arrive .x{color:var(--acid)}
    @media(max-width:600px){.ln{grid-template-columns:58px 16px 1fr;font-size:11.5px;padding:7px 12px}}
    </style>`,
  });
}

function landing(err) {
  return shell({
    title: 'Field Notes — what an AI agent sees when it visits your site',
    description: 'Paste a URL. Read the transcript of an agent visiting your website: what it understood, what it could not, and what it would do differently.',
    nav: false,
    body: `<main>
  <header class="top"><a class="brand" href="/"><span class="dot"></span>Field Notes</a>
  <nav><a href="/about">about</a></nav></header>
  <h1 class="hero">Your website,<br><span class="accent">as a house call.</span></h1>
  <p class="sub">An agent arrives with no eyes. It reads what your server sends: headings, link text, labels, alt text, robots rules, and how much content exists before JavaScript. Then it writes down what happened. Paste a URL and read the transcript.</p>
  <form class="scan" method="get" action="/">
    <input name="url" placeholder="yourdomain.com" autocomplete="off" spellcheck="false" autofocus value="${esc(err?.value || '')}">
    <button type="submit">Send the agent</button>
  </form>
  <div class="hintrow"><span style="align-self:center;letter-spacing:.18em">TRY</span>
    ${['digitalocean.com', 'linear.app', 'github.com', 'figma.com', 'replit.com'].map((h) => `<button type="button" data-u="${h}">${h}</button>`).join('')}
  </div>
  ${err ? `<section class="card pad" style="margin-top:26px"><div class="err">${esc(err.message)}</div></section>` : ''}
  <section class="grid3" style="margin-top:34px">
    <div><div class="kicker">Deterministic</div><p class="muted small" style="margin:8px 0 0">No model writes these notes. Every line traces to a fact in your HTML, so the transcript is the same tomorrow and you can fix the ones that sting.</p></div>
    <div><div class="kicker">No screenshots</div><p class="muted small" style="margin:8px 0 0">The agent never rendered your page. It read your response body, which is exactly what most crawlers, scrapers and retrieval pipelines do too.</p></div>
    <div><div class="kicker">Make one for a rival</div><p class="muted small" style="margin:8px 0 0">Every transcript is a permanent URL. Send someone the notes on their homepage and let them argue with the timestamps.</p></div>
  </section>
</main>
<script>document.querySelectorAll('[data-u]').forEach(b=>b.addEventListener('click',()=>{const i=document.querySelector('input[name=url]');i.value=b.dataset.u;i.form.submit();}));</script>`,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const send = (code, type, body) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  if (url.pathname === '/og.svg' || url.pathname === '/og.png') {
    const cardOpts = {
      app: 'FIELD NOTES',
      title: url.searchParams.get('title') || 'First-Person Agent Diary',
      score: url.searchParams.get('score') || 'HOUSE CALL',
      subtitle: url.searchParams.get('sub') || 'What an AI agent understood, what it missed, and what it wrote down.',
      badge: 'AGENT TRANSCRIPT',
    };
    if (url.pathname === '/og.png') return send(200, 'image/png', renderOgPng(cardOpts));
    return send(200, 'image/svg+xml; charset=utf-8', renderOgSvg(cardOpts));
  }
  if (url.pathname === '/healthz') return send(200, 'text/plain', 'ok');
  if (url.pathname === '/robots.txt') return send(200, 'text/plain', 'User-agent: *\nAllow: /\nSitemap: ' + APP + '/sitemap.xml\n');
  if (url.pathname === '/llms.txt') return send(200, 'text/plain; charset=utf-8', `# Field Notes

> Field Notes sends a plain HTTP client to a URL, with no eyes and no JavaScript, and publishes the transcript: what the agent understood, what it could not, and what it would have done differently.

Every line is generated from the response body and two adjacent files (robots.txt, llms.txt). No language model writes the notes, so the same page always produces the same transcript.

## Use
- ${APP}/?url=<url> returns a transcript and a verdict for any public page
- ${APP}/about explains the method
- Scores and findings are the same engine as AgentScore (${'https://agentscore.synteq.app'})

## Quotable
- A page that renders nothing without JavaScript reads, to an agent, as an empty room with excellent typography.
- "Learn more" as link text tells an agent nothing about where the link goes.

Source: https://github.com/Dewars30/what-the-agent-sees (MIT)
`);
  if (url.pathname === '/sitemap.xml') return send(200, 'application/xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${APP}/</loc></url><url><loc>${APP}/about</loc></url></urlset>`);
  if (url.pathname === '/about')
    return send(200, 'text/html; charset=utf-8', shell({
      title: 'About — Field Notes', description: 'How the transcript is made.',
      nav: false,
      body: `<main><header class="top"><a class="brand" href="/"><span class="dot"></span>Field Notes</a><nav><a href="/">new visit</a></nav></header>
      <h1 class="hero" style="font-size:clamp(24px,3.6vw,36px)">About the notes</h1>
      <p class="sub">One HTTP request with a plain user agent. No cookies, no JavaScript execution, no rendering. The transcript is assembled from a fixed set of observations in the response body and two files next to it (robots.txt, llms.txt). Nothing is generated by a language model, which means nothing in it can be wrong in an interesting way: if a line is unfair, it is unfair because the HTML says so.</p></main>`,
    }));
  try {
    if (url.pathname === '/') {
      const target = url.searchParams.get('url');
      if (!target) return send(200, 'text/html; charset=utf-8', landing());
      try {
        const r = await analyze(target);
        if (r.blocked) return send(200, 'text/html; charset=utf-8', blockedRender(r));
        return send(200, 'text/html; charset=utf-8', render(r));
      } catch (e) {
        const err = e instanceof HttpError ? e : new HttpError(500, 'The visit failed.');
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
server.listen(PORT, () => console.log('fieldnotes on ' + PORT));
