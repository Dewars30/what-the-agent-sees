import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractModel } from '../core/extract.mjs';
import { scorePage } from '../core/score.mjs';
import { extractModel as appExtract } from '../apps/agentscore/core/extract.mjs';
import { scorePage as appScore } from '../apps/agentscore/core/score.mjs';
import { demoHtml, DEMO_CSP } from '../apps/agentscore/synteq-page.mjs';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'https://example.com/';

function page(body, head = '') {
  return `<!doctype html><html lang="en"><head><title>Example product homepage</title>${head}</head><body>${body}</body></html>`;
}

function renderDim(html) {
  return scorePage(extractModel(html, url)).dims.find((d) => d.key === 'render').score;
}

console.log('1. link rel=canonical is read, for every host');
{
  const html = page('<main><h1>Example</h1></main>', '<link rel="canonical" href="https://example.com/docs">');
  assert.equal(extractModel(html, url).canonical, 'https://example.com/docs');
  assert.equal(appExtract(html, url).canonical, 'https://example.com/docs');
  const flipped = page('', '<link href="https://example.com/a" rel="Canonical">');
  assert.equal(extractModel(flipped, url).canonical, 'https://example.com/a');
  const tokens = page('', '<link rel="canonical noopener" href="https://example.com/b">');
  assert.equal(extractModel(tokens, url).canonical, 'https://example.com/b');
  const notCanonical = page('', '<link rel="canonicalized" href="https://example.com/nope">');
  assert.equal(extractModel(notCanonical, url).canonical, '');
  const metaOnly = page('', '<meta name="canonical" content="https://example.com/meta">');
  assert.equal(extractModel(metaOnly, url).canonical, 'https://example.com/meta');
  const both = page('', '<meta name="canonical" content="https://example.com/meta"><link rel="canonical" href="https://example.com/link">');
  assert.equal(extractModel(both, url).canonical, 'https://example.com/link');

  const withLink = extractModel(html, url);
  const without = extractModel(page('<main><h1>Example</h1></main>'), url);
  assert.equal(scorePage(withLink).findings.some((f) => f.title === 'No canonical URL'), false);
  assert.equal(scorePage(without).findings.some((f) => f.title === 'No canonical URL'), true);
  assert.equal(appScore(appExtract(html, url)).findings.some((f) => f.title === 'No canonical URL'), false);
}

console.log('2. noscript text counts toward the Content without JavaScript share');
{
  const words = `<main><p>${'word '.repeat(400)}</p></main>`;
  const bare = page(words);
  const withFallback = page(`${words}<noscript><p>Fallback copy for agents without JavaScript.</p><a href="/pricing">Pricing page</a></noscript>`);
  const parsed = extractModel(withFallback, url);
  assert.match(parsed.noscript, /Fallback copy for agents without JavaScript/);
  assert.match(parsed.noscript, /Pricing page/);
  assert.doesNotMatch(parsed.noscript, /<p>/);
  assert.equal(parsed.links.some((l) => l.href === '/pricing'), false);
  assert.equal(parsed.mainText.includes('Fallback copy'), false);
  assert.equal(extractModel(bare, url).mainWords, parsed.mainWords);
  assert.equal(renderDim(withFallback) - renderDim(bare), 15);
  assert.equal(appExtract(withFallback, url).noscript.includes('Fallback copy for agents'), true);

  const iframeOnly = page('<noscript><iframe title="Google Tag Manager" src="https://example.com/ns.html"></iframe></noscript><main><p>Hi</p></main>');
  assert.equal(extractModel(iframeOnly, url).noscript, '');
  const blank = page('<noscript>   </noscript><main><p>Hi</p></main>');
  assert.equal(extractModel(blank, url).noscript, '');
  const scriptOnly = page('<noscript><script>tokenSecret</script><p>Visible fallback</p></noscript>');
  const scriptPage = extractModel(scriptOnly, url);
  assert.match(scriptPage.noscript, /Visible fallback/);
  assert.equal(scriptPage.noscript.includes('tokenSecret'), false);

  const visible = page('<main><p>visible words</p><script>var secretToken = 1;</script></main>');
  const doc = extractModel(visible, url);
  assert.equal(doc.docText.includes('secretToken'), false);
  assert.match(doc.docText, /visible words/);
}

console.log('3. demo HTML is labeled and does not submit the sales form');
{
  const src = fs.readFileSync(path.join(root, 'apps/agentscore/synteq/index.patched.html'), 'utf8');
  const demo = demoHtml(src);
  assert.match(demo, /AgentScore demo/);
  assert.match(demo, /not affiliated with Synteq/i);
  assert.match(demo, /Synteq delivers enterprise compute/);
  assert.match(demo, /action="#agentscore-demo"/);
  assert.match(demo, /data-agentscore-demo="inert"/);
  assert.doesNotMatch(demo, /action="\/contact"/);
  assert.doesNotMatch(demo, /action="https?:/);
  assert.doesNotMatch(demo, /formaction=/i);
  assert.match(demo, /content="noindex"/);
  assert.match(demo, new RegExp(DEMO_CSP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 40)));
  assert.match(demo, /<title[^>]*>AgentScore demo:/);
}

console.log('4. /synteq page and inert demo routes');

function withServer(appDir, port, fn) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: path.join(root, 'apps', appDir),
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  return (async () => {
    try {
      let up = false;
      for (let i = 0; i < 40; i++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/healthz`);
          if (r.ok) { up = true; break; }
        } catch {}
        await new Promise((r) => setTimeout(r, 80));
      }
      assert.equal(up, true, 'agentscore server did not start');
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      proc.kill('SIGTERM');
    }
  })();
}

await withServer('agentscore', 18911, async (base) => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /href="\/synteq"/);

  const pageRes = await fetch(`${base}/synteq`);
  assert.equal(pageRes.status, 200);
  const page = await pageRes.text();
  assert.match(page, /Before and after/);
  assert.match(page, /Snapshot/);
  assert.match(page, /Patched/);
  assert.match(page, /Static/);
  assert.match(page, /Content without JavaScript/);
  assert.match(page, /Machine-readable facts/);
  assert.match(page, /href="\/synteq\/patched"/);
  assert.match(page, /href="\/synteq\/static"/);
  assert.match(page, /netlify\.com/);
  assert.match(page, /fly\.io/);
  assert.match(page, /heroku\.com/);
  assert.match(page, /railway\.com/);
  assert.doesNotMatch(page, /[—–]/);
  assert.match(page, /\/100/);

  for (const route of ['/synteq/patched', '/synteq/static']) {
    const res = await fetch(base + route);
    assert.equal(res.status, 200, route);
    assert.match(res.headers.get('content-security-policy') || '', /form-action 'none'/);
    assert.match(res.headers.get('content-security-policy') || '', /script-src 'none'/);
    const html = await res.text();
    assert.match(html, /not affiliated with Synteq/i);
    assert.match(html, /AgentScore demo/);
    assert.match(html, /action="#agentscore-demo"/);
    assert.doesNotMatch(html, /action="\/contact"/);
    assert.doesNotMatch(html, /[—–]/);
    assert.match(html, /Synteq delivers enterprise compute/);
  }
});

console.log('ALL SCORER TESTS PASSED');
