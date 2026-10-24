import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { parseRepo, scanRepo, RateLimitError } from './lib/scan.mjs';
import { deathmatch } from './lib/trust.mjs';
import { deathmatchCardSvg, cardToPng, shareText } from './lib/card.mjs';
import { landingPage, matchPage, matchPlainText, notFoundPage, errorPage } from './lib/pages.mjs';
import { fightScanPage } from './lib/fight.mjs';

const PORT = process.env.PORT || 8080;
const ORIGIN = process.env.ORIGIN || `http://localhost:${PORT}`;
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https:; connect-src 'self' https://api.github.com; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

// In-memory match store (resets on restart, fine for MVP)
const matches = new Map();
let matchCounter = 0;

const app = new Hono();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Content-Security-Policy', CSP);
});

app.get('/healthz', (c) => c.text('ok'));
app.get('/debug', (c) => c.json({ matches: matches.size, counter: matchCounter, keys: [...matches.keys()] }));
app.get('/favicon.ico', (c) => c.body(null, 204));

// Landing page
app.get('/', (c) => {
  const html = landingPage({ origin: ORIGIN });
  return c.html(html);
});

// Scan endpoint - redirects to match page
app.get('/api/scan', async (c) => {
  const a = c.req.query('a');
  const b = c.req.query('b');
  if (!a || !b) return c.redirect('/');

  const repoA = parseRepo(a);
  const repoB = parseRepo(b);
  if (!repoA || !repoB) return c.html(errorPage('Could not parse those repo URLs. Use owner/repo or a GitHub URL.'), 400);

  return c.redirect(`/m/scan?a=${encodeURIComponent(repoA.owner + '/' + repoA.repo)}&b=${encodeURIComponent(repoB.owner + '/' + repoB.repo)}`);
});

// Scanning page (shows progress, then JS fetches the actual scan)
app.get('/m/scan', async (c) => {
  const a = c.req.query('a');
  const b = c.req.query('b');
  if (!a || !b) return c.redirect('/');
  
  return c.html(fightScanPage(a, b, { origin: ORIGIN }));
});

// API: run the deathmatch scan
app.get('/api/deathmatch', async (c) => {
  const a = c.req.query('a');
  const b = c.req.query('b');
  const token = c.req.query('token') || undefined;

  if (!a || !b) return c.json({ error: 'Need two repos' }, 400);

  const repoA = parseRepo(a);
  const repoB = parseRepo(b);
  if (!repoA || !repoB) return c.json({ error: 'Could not parse repo URLs' }, 400);

  try {
    const [fighterA, fighterB] = await Promise.all([
      scanRepo(repoA.owner, repoA.repo, { token }),
      scanRepo(repoB.owner, repoB.repo, { token }),
    ]);

    if (fighterA.error) return c.json({ error: `Repo not found: ${repoA.owner}/${repoA.repo}` }, 404);
    if (fighterB.error) return c.json({ error: `Repo not found: ${repoB.owner}/${repoB.repo}` }, 404);

    const match = deathmatch(fighterA, fighterB);
    
    // Store the match
    const id = `m${(++matchCounter).toString(36)}`;
    match.id = id;
    matches.set(id, match);

    return c.json({ id, ...match });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return c.json({ error: err.message }, 429);
    }
    return c.json({ error: err.message }, 500);
  }
});

// API: store a match from client-side scan (POST)
app.post('/api/store', async (c) => {
  try {
    const body = await c.req.json();
    const { fighterA, fighterB } = body;
    if (!fighterA || !fighterB) return c.json({ error: 'Need fighterA and fighterB' }, 400);
    
    const match = deathmatch(fighterA, fighterB);
    const id = `m${(++matchCounter).toString(36)}`;
    match.id = id;
    matches.set(id, match);
    
    return c.json({ id });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

// Match page, PNG, SVG (handle extensions in one route)
app.get('/m/:id', async (c) => {
  const rawId = c.req.param('id');
  let id = rawId;
  let format = 'html';
  if (rawId.endsWith('.png')) { id = rawId.replace(/\.png$/, ''); format = 'png'; }
  if (rawId.endsWith('.svg')) { id = rawId.replace(/\.svg$/, ''); format = 'svg'; }
  console.log('GET /m/' + rawId + ' | id=' + id + ' format=' + format + ' | matches has: ' + matches.has(id));
  const match = matches.get(id);
  if (!match) return c.html(notFoundPage(), 404);

  if (format === 'png') {
    const svg = deathmatchCardSvg(match, ORIGIN);
    const png = cardToPng(svg);
    c.header('Content-Type', 'image/png');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(png);
  }
  if (format === 'svg') {
    const svg = deathmatchCardSvg(match, ORIGIN);
    c.header('Content-Type', 'image/svg+xml');
    c.header('Cache-Control', 'public, max-age=86400');
    return c.body(svg);
  }
  if (c.req.query('format') === 'txt') {
    return c.text(matchPlainText(match, { origin: ORIGIN, matchId: id }));
  }

  return c.html(matchPage(match, { origin: ORIGIN, matchId: id }));
});


console.log(`Repo Death Match running on :${PORT}`);
serve({ fetch: app.fetch, port: PORT });
