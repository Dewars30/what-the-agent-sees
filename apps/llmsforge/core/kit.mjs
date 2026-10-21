// Shared shell + CSS. One file, no build step, no network fonts.
export const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const CSS = `
:root{
  --bg:#08090a; --panel:#0c0e10; --panel2:#101316; --line:rgba(255,255,255,.09);
  --line-soft:rgba(255,255,255,.055); --fg:#eceff1; --dim:#8b949e; --dimmer:#5d666f;
  --acid:#c6f24e; --acid-dim:#7b9a26; --red:#ff5a52; --amber:#ffb02e; --green:#4ade80;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg)}
body{font-family:var(--sans);-webkit-font-smoothing:antialiased;line-height:1.5;min-height:100vh}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background-image:linear-gradient(to right,rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.028) 1px,transparent 1px);
  background-size:64px 64px;mask-image:radial-gradient(circle at 50% 0%,#000 0%,transparent 78%)}
.wrap{position:relative;z-index:1;max-width:1040px;margin:0 auto;padding:0 20px}
a{color:inherit}
mono,.mono{font-family:var(--mono)}
header.top{display:flex;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid var(--line-soft)}
.brand{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--fg);text-decoration:none}
.dot{width:7px;height:7px;border-radius:50%;background:var(--acid);box-shadow:0 0 12px var(--acid)}
.top nav{display:flex;gap:18px;font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
.top nav a{text-decoration:none}
.top nav a:hover{color:var(--acid)}
h1.hero{font-family:var(--mono);font-weight:500;letter-spacing:-.02em;font-size:clamp(30px,5.2vw,52px);line-height:1.04;margin:56px 0 0}
h1.hero .accent{color:var(--acid)}
p.sub{color:var(--dim);font-size:clamp(14px,1.7vw,17px);max-width:62ch;margin:18px 0 0}
form.scan{display:flex;gap:10px;margin:34px 0 0;flex-wrap:wrap}
form.scan input{flex:1 1 320px;min-width:0;background:var(--panel);border:1px solid var(--line);color:var(--fg);
  font-family:var(--mono);font-size:15px;padding:15px 16px;border-radius:2px;outline:none;transition:border-color .15s}
form.scan input:focus{border-color:var(--acid-dim)}
form.scan button{background:var(--acid);color:#08110a;border:0;font-family:var(--mono);font-size:12px;letter-spacing:.16em;
  text-transform:uppercase;padding:0 22px;height:52px;border-radius:2px;cursor:pointer;font-weight:600}
form.scan button:hover{filter:brightness(1.08)}
.hintrow{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0;font-family:var(--mono);font-size:11px;color:var(--dimmer)}
.hintrow button{background:transparent;border:1px solid var(--line-soft);color:var(--dim);font-family:var(--mono);
  font-size:11px;padding:5px 9px;border-radius:2px;cursor:pointer}
.hintrow button:hover{color:var(--acid);border-color:var(--acid-dim)}
section.card{border:1px solid var(--line);background:linear-gradient(180deg,var(--panel),#0a0c0d);border-radius:3px;margin:28px 0}
.pad{padding:22px}
.kicker{font-family:var(--mono);font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--dimmer)}
.scorewrap{display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center;padding:26px 24px}
.scorenum{font-family:var(--mono);font-size:clamp(64px,13vw,104px);line-height:.9;letter-spacing:-.05em;font-weight:500}
.scorenum .of{font-size:.26em;color:var(--dimmer);letter-spacing:0}
.grade{font-family:var(--mono);font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--dimmer);margin-top:8px}
.verdict{font-family:var(--mono);font-size:clamp(15px,2.4vw,21px);letter-spacing:.02em;margin-top:2px}
.ticks{display:flex;gap:2px;margin-top:16px;height:34px;align-items:flex-end}
.ticks i{flex:1;background:var(--line);height:100%;transform-origin:bottom;border-radius:1px;transition:background .3s,transform .5s}
.ticks i.on{background:var(--acid)}
.ticks i.on.low{background:var(--red)}.ticks i.on.mid{background:var(--amber)}
.hostline{font-family:var(--mono);font-size:12px;color:var(--dim);margin-top:12px;word-break:break-all}
.dims{padding:0 24px 22px;display:grid;gap:11px}
.dim{display:grid;grid-template-columns:150px 1fr 44px;gap:12px;align-items:center;font-family:var(--mono);font-size:11.5px}
.dim .bar{height:6px;background:var(--line-soft);border-radius:1px;overflow:hidden}
.dim .bar i{display:block;height:100%;background:var(--acid);width:0;transition:width .7s cubic-bezier(.2,.8,.2,1)}
.dim .lbl{color:var(--dim);letter-spacing:.06em;text-transform:uppercase;font-size:10px}
.dim .val{text-align:right;color:var(--fg)}
@media(max-width:640px){.dim{grid-template-columns:110px 1fr 38px}}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:0;border-top:1px solid var(--line)}
@media(max-width:860px){.cols{grid-template-columns:1fr}.col+.col{border-left:0;border-top:1px solid var(--line)}}
.col{padding:22px 24px;min-width:0}
.col+.col{border-left:1px solid var(--line)}
pre.agent{font-family:var(--mono);font-size:11.5px;line-height:1.62;color:#b9c3cb;white-space:pre;overflow-x:auto;
  max-height:520px;overflow-y:auto;margin:12px 0 0;padding:0}
pre.agent .k{color:var(--acid)}
pre.agent .m{color:#6f7d88}
.finding{border-left:2px solid var(--line);padding:9px 0 9px 12px;margin:0 0 12px}
.finding.fail{border-color:var(--red)}
.finding.warn{border-color:var(--amber)}
.finding.ok{border-color:var(--green)}
.finding h4{margin:0;font-size:13.5px;font-weight:600;letter-spacing:-.01em}
.finding p{margin:4px 0 0;font-size:12.5px;color:var(--dim);line-height:1.55}
.finding .fix{margin-top:6px;font-family:var(--mono);font-size:11px;color:var(--acid);opacity:.85}
.finding .worth{margin-top:6px;font-family:var(--mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--dimmer)}
.tag{font-family:var(--mono);font-size:9px;letter-spacing:.16em;text-transform:uppercase;padding:2px 5px;border-radius:2px;margin-right:7px;vertical-align:1px}
.tag.fail{background:rgba(255,90,82,.14);color:var(--red)}
.tag.warn{background:rgba(255,176,46,.14);color:var(--amber)}
.tag.ok{background:rgba(74,222,128,.12);color:var(--green)}
.actions{display:flex;gap:10px;flex-wrap:wrap;padding:0 24px 24px}
.btn{font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;
  border:1px solid var(--line);padding:11px 15px;border-radius:2px;color:var(--fg);cursor:pointer;background:transparent}
.btn:hover{border-color:var(--acid-dim);color:var(--acid)}
.btn.primary{background:var(--acid);color:#08110a;border-color:var(--acid);font-weight:600}
.btn.primary:hover{color:#08110a;filter:brightness(1.08)}
table.idx{width:100%;border-collapse:collapse;font-family:var(--mono);font-size:12.5px}
table.idx th{text-align:left;font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--dimmer);font-weight:500;padding:0 0 10px}
table.idx td{padding:9px 0;border-top:1px solid var(--line-soft)}
table.idx td.s{text-align:right;font-variant-numeric:tabular-nums}
table.idx tr:hover td{background:rgba(255,255,255,.02)}
table.idx a{text-decoration:none}
table.idx a:hover{color:var(--acid)}
.pill{display:inline-block;font-family:var(--mono);font-size:10px;letter-spacing:.1em;padding:2px 7px;border-radius:2px;border:1px solid var(--line)}
footer.bot{border-top:1px solid var(--line-soft);margin-top:44px;padding:22px 0 40px;font-family:var(--mono);font-size:11px;color:var(--dimmer);display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
footer.bot a{text-decoration:none}footer.bot a:hover{color:var(--acid)}
.err{border-left:2px solid var(--red);padding:12px 0 12px 14px;color:var(--fg);font-family:var(--mono);font-size:13px}
.muted{color:var(--dim)}
.small{font-size:12px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line-soft);border:1px solid var(--line-soft)}
.grid3>div{background:var(--panel);padding:16px}
@media(max-width:700px){.grid3{grid-template-columns:1fr}}
.stat{font-family:var(--mono);font-size:26px;letter-spacing:-.02em}
.stat .u{font-size:12px;color:var(--dimmer);margin-left:3px}
.challenger-banner{border:1px solid var(--acid);background:rgba(198,242,78,.07);border-radius:4px;padding:12px 16px;margin:16px 0 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-family:var(--mono);font-size:12.5px}
.challenger-banner strong{color:var(--acid)}
.viral-strip{border:1px solid var(--line);background:var(--panel2);border-radius:4px;padding:14px 18px;margin:20px 0;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.viral-strip .v-copy{font-family:var(--mono);font-size:11.5px;color:var(--dim)}
.viral-strip .v-copy strong{color:var(--acid)}
.viral-strip .v-btns{display:flex;gap:8px;flex-wrap:wrap}
`;

export function quoteIntent(text, entryId, handle = 'TonyDiefenbach') {
  const base = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  return entryId ? `${base}&url=${encodeURIComponent(`https://x.com/${handle}/status/${entryId}`)}` : base;
}

export function replyIntent(text, entryId) {
  const base = `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
  return entryId ? `${base}&in_reply_to=${encodeURIComponent(entryId)}` : base;
}

export function repostIntent(entryId) {
  return `https://x.com/intent/retweet?tweet_id=${encodeURIComponent(entryId)}`;
}

export function likeIntent(entryId) {
  return `https://x.com/intent/like?tweet_id=${encodeURIComponent(entryId)}`;
}

export function viralBar({
  entryId,
  quoteText,
  replyText,
  quoteLabel = 'Quote-Post Result (+3 pts)',
  replyLabel = 'Post to Official Thread (+2 pts)',
  repostLabel = '1-Click Repost (+3 pts)',
  prompt = 'Official Hackathon Arena: Quote-post or drop your score in the thread to lock it on the live board.',
}) {
  if (!entryId) return '';
  return `<div class="viral-strip">
    <div class="v-copy"><strong>⚡ LIVE ARENA</strong> · ${esc(prompt)}</div>
    <div class="v-btns">
      ${quoteText ? `<a class="btn primary" target="_blank" rel="noopener" href="${quoteIntent(quoteText, entryId)}">${esc(quoteLabel)}</a>` : ''}
      ${replyText ? `<a class="btn" target="_blank" rel="noopener" href="${replyIntent(replyText, entryId)}">${esc(replyLabel)}</a>` : ''}
      <a class="btn" target="_blank" rel="noopener" href="${repostIntent(entryId)}">${esc(repostLabel)}</a>
    </div>
  </div>`;
}

export function renderOgSvg({
  app = 'WHAT THE AGENT SEES',
  title = 'Can an AI agent read your site?',
  score = '0-100',
  subtitle = 'One HTTP GET · Raw HTML · Zero JS · Deterministic Rubric',
  badge = 'LIVE ON SYNTEQ',
} = {}) {
  const safeApp = esc(String(app).slice(0, 36));
  const safeTitle = esc(String(title).slice(0, 48));
  const safeScore = esc(String(score).slice(0, 22));
  const safeSub = esc(String(subtitle).slice(0, 82));
  const safeBadge = esc(String(badge).slice(0, 28));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#181c20" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" fill="#08090a"/>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect x="44" y="44" width="1112" height="542" rx="8" fill="#0c0e10" stroke="#262c32" stroke-width="2"/>
  <circle cx="88" cy="96" r="8" fill="#c6f24e"/>
  <text x="110" y="103" fill="#eceff1" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="20" letter-spacing="4">${safeApp}</text>
  <rect x="910" y="74" width="210" height="38" rx="4" fill="#141a0d" stroke="#c6f24e" stroke-width="1.5"/>
  <text x="1015" y="99" text-anchor="middle" fill="#c6f24e" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="15" font-weight="700" letter-spacing="2">${safeBadge}</text>
  <text x="80" y="220" fill="#eceff1" font-family="-apple-system,BlinkMacSystemFont,Inter,sans-serif" font-size="54" font-weight="700">${safeTitle}</text>
  <text x="80" y="385" fill="#c6f24e" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="124" font-weight="700" letter-spacing="-3">${safeScore}</text>
  <text x="80" y="468" fill="#8b949e" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="24">${safeSub}</text>
  <line x1="80" y1="505" x2="1120" y2="505" stroke="#1f2429" stroke-width="1.5"/>
  <text x="80" y="545" fill="#5d666f" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="18">SYNTEQ HACKATHON · BUILT FOR THE MACHINE READER</text>
</svg>`;
}

export function shell({ title, description, body, head = '', nav = true, footer = true, ogImage = '/og.svg', challenger = null }) {
  const banner = challenger && challenger.rival
    ? `<div class="challenger-banner">
        <span>⚔️ <strong>PVP CHALLENGE:</strong> Can your site beat <strong>${esc(challenger.rival)}</strong>${challenger.score != null ? ` (${esc(challenger.score)}/100)` : ''}?</span>
        ${challenger.actionHref ? `<a class="btn primary" href="${esc(challenger.actionHref)}">${esc(challenger.actionLabel || 'Accept Challenge')}</a>` : ''}
      </div>`
    : '';
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image">
<meta property="og:image" content="${esc(ogImage)}"><meta name="twitter:image" content="${esc(ogImage)}">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="%2308090a"/><circle cx="16" cy="16" r="6" fill="%23c6f24e"/></svg>')}">
<style>${CSS}</style>${head}
</head><body>
<div class="wrap">
${nav ? `<header class="top"><a class="brand" href="/"><span class="dot"></span>AgentScore</a>
<nav><a href="/index">The index</a><a href="/method">Method</a></nav></header>` : ''}
${banner}${body}
${footer ? `<footer class="bot"><span>AgentScore measures how usable a page is to a software agent, not to a person.</span><span>No tracking. Scanned pages are not stored.</span></footer>` : ''}
</div></body></html>`;
}
