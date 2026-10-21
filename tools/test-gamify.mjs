import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as kit from '../core/kit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('1. Testing core/kit.mjs viral intent helpers & OG card renderer...');
assert.equal(typeof kit.quoteIntent, 'function', 'quoteIntent must be exported from core/kit.mjs');
assert.equal(typeof kit.replyIntent, 'function', 'replyIntent must be exported from core/kit.mjs');
assert.equal(typeof kit.repostIntent, 'function', 'repostIntent must be exported from core/kit.mjs');
assert.equal(typeof kit.renderOgSvg, 'function', 'renderOgSvg must be exported from core/kit.mjs');
assert.equal(typeof kit.renderOgPng, 'function', 'renderOgPng must be exported from core/kit.mjs');
assert.equal(typeof kit.viralBar, 'function', 'viralBar must be exported from core/kit.mjs');

const png = kit.renderOgPng({
  app: 'AGENT OR NOT',
  title: 'Synteq vs DigitalOcean',
  score: '81 - 54',
  subtitle: '4-Round Agent Readability Cage Match',
  badge: 'KNOCKOUT',
});
assert.ok(Buffer.isBuffer(png), 'renderOgPng must return a Buffer');
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'renderOgPng must have valid PNG signature');
assert.ok(png.length > 1000, 'renderOgPng must produce non-empty PNG');

const qUrl = kit.quoteIntent('Synteq knocked out DO 81-54', '2112839384341106769');
assert.match(qUrl, /^https:\/\/x\.com\/intent\/post\?text=/);
assert.match(qUrl, /url=https%3A%2F%2Fx\.com%2FTonyDiefenbach%2Fstatus%2F2112839384341106769/, 'quoteIntent must attach entry tweet URL so X counts +3 Quote Post');

const rUrl = kit.replyIntent('@grok referee this', '2112839384341106769');
assert.match(rUrl, /in_reply_to=2112839384341106769/, 'replyIntent must attach in_reply_to so X counts +2 Reply');

const rtUrl = kit.repostIntent('2112839384341106769');
assert.equal(rtUrl, 'https://x.com/intent/retweet?tweet_id=2112839384341106769', 'repostIntent must use native retweet intent (+3 pts)');

const svg = kit.renderOgSvg({
  app: 'AGENT OR NOT',
  title: 'Synteq vs DigitalOcean',
  score: '81 - 54',
  subtitle: '4-Round Agent Readability Cage Match',
  badge: 'KNOCKOUT',
});
assert.match(svg, /^<svg[^>]+viewBox="0 0 1200 630"/);
assert.match(svg, /Synteq vs DigitalOcean/);
assert.match(svg, /81 - 54/);

const htmlWithMeta = kit.shell({
  title: 'Test Page',
  description: 'Test Desc',
  body: '<p>Hi</p>',
  ogImage: 'https://agentornot.synteq.app/og.svg?title=Test',
  challenger: { rival: 'synteq.com', score: 81, actionHref: '/?url=yoursite.com' },
});
assert.match(htmlWithMeta, /property="og:image" content="https:\/\/agentornot\.synteq\.app\/og\.png\?title=Test"/);
assert.match(htmlWithMeta, /name="twitter:image" content="https:\/\/agentornot\.synteq\.app\/og\.png\?title=Test"/);
assert.match(htmlWithMeta, /synteq\.com/, 'challenger banner must render rival name');
assert.match(htmlWithMeta, /81/, 'challenger banner must render rival score');

console.log('2. Testing hardcoded ENTRY_POST_ID fallbacks across all 6 apps...');
const expectedIds = {
  agentscore: '2112816202309374003',
  roast: '2112826524852519066',
  sitefm: '2112827262995468697',
  agentornot: '2112839384341106769',
  agentrank: '2112839742496846116',
  llmsforge: '2112840019790672070',
};
for (const [app, id] of Object.entries(expectedIds)) {
  const src = fs.readFileSync(path.join(root, 'apps', app, 'server.mjs'), 'utf8');
  assert.ok(src.includes(id), `apps/${app}/server.mjs must hardcode fallback entry post ID ${id}`);
  assert.ok(src.includes('/og.svg'), `apps/${app}/server.mjs must serve /og.svg`);
}

console.log('3. Testing AgentRank seed data normalization (no 10000% bug)...');
const rankSeed = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'agentrank', 'data', 'seed.json'), 'utf8'));
for (const row of rankSeed.rows) {
  if (!row.ok) continue;
  for (const d of row.dims) {
    assert.ok(d.score >= 0 && d.score <= 100, `Expected ${row.slug} dim ${d.key} score in 0..100, got ${d.score}`);
  }
}

console.log('4. Testing AgentOrNot 1v1 Cage Match & King-of-the-Hill...');
const aonSrc = fs.readFileSync(path.join(root, 'apps', 'agentornot', 'server.mjs'), 'utf8');
assert.match(aonSrc, /\/duel/, 'agentornot must implement /duel 1v1 Cage Match route');
assert.match(aonSrc, /King of the Hill|Undefeated/i, 'agentornot must include King of the Hill leaderboard');

console.log('5. Integration HTTP check on agentornot & agentrank...');
import { spawn } from 'node:child_process';

async function withServer(appDir, port, fn) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: path.join(root, 'apps', appDir),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 25; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/healthz`);
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 80));
    }
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    proc.kill('SIGTERM');
  }
}

await withServer('agentornot', 18901, async (base) => {
  const home = await (await fetch(`${base}/?rival=synteq.com&beat=81`)).text();
  assert.match(home, /King of the Hill Leaderboard/);
  assert.match(home, /PVP CHALLENGE:/);
  assert.match(home, /url=https%3A%2F%2Fx\.com%2FTonyDiefenbach%2Fstatus%2F2112839384341106769/);

  const duel = await (await fetch(`${base}/duel?a=synteq.com&b=digitalocean.com`)).text();
  assert.match(duel, /KNOCKOUT \(TKO\)/);
  assert.match(duel, /Post Knockout Card \(\+3 pts\)/);
  assert.match(duel, /81/);
  assert.match(duel, /54/);

  const ogRes = await fetch(`${base}/og.svg?title=Test`);
  assert.equal(ogRes.status, 200);
  assert.match(ogRes.headers.get('content-type') || '', /image\/svg\+xml/);

  const pngRes = await fetch(`${base}/og.png?title=Test`);
  assert.equal(pngRes.status, 200);
  assert.match(pngRes.headers.get('content-type') || '', /image\/png/);
});

await withServer('agentrank', 18902, async (base) => {
  const detail = await (await fetch(`${base}/s/netlify.com`)).text();
  assert.match(detail, /100%/);
  assert.doesNotMatch(detail, /10000%/);
});

console.log('ALL TESTS PASSED');
