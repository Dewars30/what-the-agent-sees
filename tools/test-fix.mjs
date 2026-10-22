import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFix, countTags } from '../apps/agentscore/fix.mjs';
import { extractModel } from '../apps/agentscore/core/extract.mjs';
import { scorePage } from '../apps/agentscore/core/score.mjs';
import { packReport, unpackReport, standaloneReport, fixesDiff, kitSection } from '../apps/agentscore/report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = 'https://example.com/pricing-plans';
const DASH = /[—–]/;

function page(body, head = '') {
  return `<!doctype html><html lang="en"><head><title>Example product homepage</title>${head}</head><body>${body}</body></html>`;
}

function words(n) {
  return `<main><p>${'word '.repeat(n)}</p></main>`;
}

console.log('1. alt comes from figcaption, link text, or the previous heading');
{
  const html = page(`<main>
    <h1>Queue diagram</h1>
    <img src="hero-product.png">
    <figure><img src="/cap.png"><figcaption>Caption of the chart</figcaption></figure>
    <a href="/docs">Read the docs<img src="/doc.png"></a>
    <img src="/logo.svg" alt="Already named">
  </main>`);
  const kit = buildFix(html, pageUrl, {});
  const patched = kit.patchedHtml;
  assert.match(patched, /<img src="hero-product\.png" alt="Queue diagram">/);
  assert.match(patched, /alt="Caption of the chart"/);
  assert.match(patched, /alt="Read the docs"/);
  assert.match(patched, /alt="Already named"/);
  assert.doesNotMatch(patched, /alt="hero-product/);
  assert.doesNotMatch(patched, /alt="[^"]*image[^"]*"/i);
  assert.equal(DASH.test(JSON.stringify(kit.fixes.concat(kit.notes))), false);
  const hero = kit.fixes.find((f) => f.kind === 'alt' && f.alt === 'Queue diagram');
  assert.ok(hero);
  assert.match(hero.openUrl, /#:~:text=/);
  assert.match(hero.selector, /img\[src="hero-product\.png"\]/);
  assert.ok(hero.points >= 0);
}

console.log('2. decorative images are flagged, not given a fake alt');
{
  const html = page(`<main>
    <img src="orphan.png">
    <h1>Home</h1>
    <img src="spacer.gif" role="presentation">
    <img src="icon.svg" aria-hidden="true">
    <img src="after.png">
  </main>`);
  const kit = buildFix(html, pageUrl, {});
  assert.match(kit.patchedHtml, /src="orphan\.png"[^>]*alt=""/);
  assert.match(kit.patchedHtml, /src="orphan\.png"[^>]*role="presentation"/);
  assert.match(kit.patchedHtml, /src="after\.png"[^>]*alt="Home"/);
  assert.doesNotMatch(kit.patchedHtml, /alt="spacer/);
  assert.doesNotMatch(kit.patchedHtml, /alt="icon/);
  assert.doesNotMatch(kit.patchedHtml, /alt="orphan/);
  const flagged = kit.notes.filter((n) => /Decorative image left unchanged/.test(n.title));
  assert.equal(flagged.length, 2);
  const marked = kit.fixes.find((f) => f.kind === 'decorative');
  assert.ok(marked);
  assert.match(marked.explanation, /No description was invented/);
}

console.log('3. nav wraps the first header with links, and skips headers that contain main or an existing nav');
{
  const html = page(`<header><main><a href="/inside">Inside</a></main></header><header class="top"><a href="/pricing">Pricing</a></header><main><h1>Plans</h1></main>`);
  const kit = buildFix(html, pageUrl, {});
  assert.match(kit.patchedHtml, /<header class="top"><nav><a href="\/pricing">Pricing<\/a><\/nav><\/header>/);
  assert.doesNotMatch(kit.patchedHtml, /<header><nav><main>/);
  const already = buildFix(page('<header><nav><a href="/a">A</a></nav></header><main><h1>Plans</h1></main>'), pageUrl, {});
  assert.equal(already.fixes.some((f) => f.kind === 'nav'), false);
  const accessBefore = kit.before.dims.find((d) => d.key === 'access').score;
  const accessAfter = kit.after.dims.find((d) => d.key === 'access').score;
  assert.equal(accessBefore, accessAfter);
  assert.ok(kit.after.score >= kit.before.score);
  assert.ok(kit.deltas.find((d) => d.key === 'structure').delta >= 0);
}

console.log('4. JSON-LD uses page facts only');
{
  const html = page('<main><h1>Plans</h1><p>Body copy for the page.</p></main>', '<meta name="description" content="A queue you can hand to an agent."><meta property="og:site_name" content="Example Queue">');
  const kit = buildFix(html, pageUrl, {});
  const block = kit.patchedHtml.slice(kit.patchedHtml.indexOf('application/ld+json'));
  assert.match(block, /Organization/);
  assert.match(block, /BreadcrumbList/);
  assert.match(block, /Example Queue/);
  assert.match(block, /A queue you can hand to an agent\./);
  assert.match(block, /"name":"Plans"/);
  assert.equal((block.match(/ListItem/g) || []).length, 1);
  assert.doesNotMatch(block, /Pricing plans/);
  assert.doesNotMatch(block, /pricing-plans","name"/);

  const described = page('<main><h1>Plans</h1></main>', '<meta name="description" content="A < b & c">');
  const escaped = buildFix(described, pageUrl, {});
  assert.match(escaped.patchedHtml, /\\u003c/);
  assert.doesNotMatch(escaped.patchedHtml, /<script type="application\/ld\+json">[^<]*< b/);

  const hasOrg = page('<main><h1>Plans</h1></main>', '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Example Queue"}</script>');
  const skipped = buildFix(hasOrg, pageUrl, {});
  const added = skipped.fixes.find((f) => f.kind === 'jsonld');
  assert.ok(added);
  assert.match(added.explanation, /BreadcrumbList/);
  assert.doesNotMatch(added.explanation, /Organization and/);
  const orgCount = (skipped.patchedHtml.match(/"@type":"Organization"/g) || []).length;
  assert.equal(orgCount, 1);

  const bare = buildFix('<html><head><title>Hi</title></head><body><p>No name source long enough is not the case.</p></body></html>'.replace('Hi', ''), pageUrl, {});
  assert.equal(bare.fixes.some((f) => f.kind === 'jsonld'), false);

  const trap = page('<main><h1>Visible</h1></main>', '<script>var x = "</head>";</script>');
  const trapped = buildFix(trap, pageUrl, {});
  const jsonAt = trapped.patchedHtml.indexOf('application/ld+json');
  const trickAt = trapped.patchedHtml.indexOf('var x');
  assert.ok(jsonAt > trickAt);
  assert.equal(extractModel(trapped.patchedHtml, pageUrl).jsonld.some((j) => j.types.includes('Organization') || j.types.includes('BreadcrumbList')), true);
}

console.log('5. labels use placeholder or name exactly');
{
  const html = page(`<main><h1>Contact</h1><form>
    <input name="firstName" placeholder="Work email">
    <input name="firstName" id="n2">
    <input name="secret" aria-label="Secret code">
    <input type="hidden" name="csrf" value="t">
    <input type="submit" value="Send">
  </form></main>`);
  const kit = buildFix(html, pageUrl, {});
  assert.match(kit.patchedHtml, /<label for="[^"]+">Work email<\/label>/);
  assert.match(kit.patchedHtml, /<label for="n2">firstName<\/label>/);
  assert.doesNotMatch(kit.patchedHtml, />First name</);
  assert.doesNotMatch(kit.patchedHtml, /<label[^>]*>Secret code<\/label>/);
  assert.doesNotMatch(kit.patchedHtml, /<label[^>]*>csrf<\/label>/);
  assert.equal(extractModel(kit.patchedHtml, pageUrl).fields.filter((f) => !f.label).length, 0);
}

console.log('6. noscript fallback uses page copy and is skipped when text already exists');
{
  const bare = page(`${words(400)}<noscript><iframe src="https://example.com/ns.html"></iframe></noscript><p><a href="/pricing">Pricing page</a></p>`, '<meta name="description" content="Example product homepage for agents that do not run JavaScript at all.">');
  const kit = buildFix(bare, 'https://example.com/', {});
  assert.match(kit.patchedHtml, /<body><noscript>/);
  assert.match(kit.patchedHtml, /Example product homepage for agents/);
  assert.match(kit.patchedHtml, /href="\/pricing"/);
  assert.match(kit.patchedHtml, />Pricing page</);
  const before = scorePage(extractModel(bare, 'https://example.com/')).dims.find((d) => d.key === 'render').score;
  const after = scorePage(extractModel(kit.patchedHtml, 'https://example.com/')).dims.find((d) => d.key === 'render').score;
  assert.equal(after - before, 15);
  const existing = page(`${words(40)}<noscript><p>Fallback copy already here for agents.</p></noscript>`);
  const skip = buildFix(existing, 'https://example.com/', {});
  assert.equal(skip.fixes.some((f) => f.kind === 'noscript'), false);
}

console.log('7. robots and llms suggestions, rescored with the real scorer');
{
  const html = page(`<main><h1>Plans</h1><p>${'word '.repeat(40)}</p><a href="/docs">Docs</a></main>`);
  const kit = buildFix(html, pageUrl, { robots: null, sitemap: false, llmsTxt: false, agents: {} });
  assert.equal(kit.suggestions.robots, 'User-agent: *\nAllow: /\n');
  assert.doesNotMatch(kit.suggestions.robots, /Sitemap/i);
  assert.match(kit.suggestions.llms, /# Plans/);
  assert.match(kit.suggestions.llms, /Docs/);
  assert.doesNotMatch(kit.suggestions.llms, /pricing-plans/);
  assert.ok(kit.withFiles);
  assert.ok(kit.withFiles.score >= kit.after.score);
  const again = scorePage(extractModel(kit.patchedHtml, pageUrl), { robots: null, sitemap: false, llmsTxt: false, agents: {} });
  assert.equal(again.score, kit.after.score);
  const present = buildFix(html, pageUrl, { robots: { groups: 1, agents: { gptbot: 'allowed' } }, sitemap: true, llmsTxt: true, agents: { gptbot: 'allowed' } });
  assert.equal(present.suggestions.robots, null);
  assert.equal(present.suggestions.llms, null);
  assert.equal(present.withFiles, null);
}

console.log('8. combined rescore does not drop, and alone points do not have to sum');
{
  const html = page(`<header><a href="/a">Alpha</a><a href="/b">Beta</a><a href="/c">Gamma</a><a href="/d">Delta</a><a href="/e">Epsilon</a></header>
    <main><h1>Plans</h1><img src="/shot.png"><form><input name="email" placeholder="Email address"></form><p>${'word '.repeat(80)}</p></main>`,
  '<meta name="description" content="A queue you can hand to an agent without writing a new sentence here today.">');
  const kit = buildFix(html, pageUrl, { robots: null, sitemap: false, llmsTxt: false, agents: {} });
  assert.ok(kit.after.score >= kit.before.score);
  assert.ok(kit.fixes.length >= 3);
  for (const f of kit.fixes) assert.ok(f.points >= 0);
  for (const f of kit.fixes) assert.equal(DASH.test(f.title + f.explanation), false);
  const ordered = kit.fixes.map((f) => f.points);
  const sorted = [...ordered].sort((a, b) => b - a);
  assert.deepEqual(ordered, sorted);
}

console.log('9. synteq snapshot: locator sees the same images the scorer sees');
{
  const html = fs.readFileSync(path.join(root, 'apps/agentscore/synteq/index.original.html'), 'utf8');
  const imgs = extractModel(html, 'https://synteq.com/').images.length;
  assert.equal(imgs, 100);
  assert.equal(countTags(html, 'img'), imgs);
  const started = Date.now();
  const kit = buildFix(html, 'https://synteq.com/', { robots: { groups: 1 }, sitemap: true, llmsTxt: true, agents: { gptbot: 'partial' } });
  assert.ok(Date.now() - started < 20000, 'fix kit too slow on the snapshot');
  assert.equal(countTags(kit.patchedHtml, 'img'), 100);
  assert.ok(kit.after.score >= kit.before.score);
  assert.equal(DASH.test(JSON.stringify({ fixes: kit.fixes, notes: kit.notes, suggestions: kit.suggestions })), false);
  const packed = packReport({ url: 'https://synteq.com/', host: 'synteq.com', createdAt: '2026-10-22T00:00:00.000Z', extras: { robots: { groups: 1 }, sitemap: true, llmsTxt: true, agents: { gptbot: 'partial' } }, kit });
  assert.equal(packed.htmlIncluded, true);
  assert.ok(packed.token.length < 400_000);
  const round = unpackReport(packed.token);
  assert.equal(round.after.score, kit.after.score);
  assert.equal(round.patchedHtml, kit.patchedHtml);
  assert.equal(round.patchedHtml.includes('originalHtml'), false);
}

console.log('10. report round trip lives in the link, not on disk');
{
  const kit = buildFix(page('<main><h1>Plans</h1><img src="/a.png"></main>'), pageUrl, { robots: null, sitemap: false, llmsTxt: false, agents: {} });
  const packed = packReport({
    url: pageUrl,
    host: 'example.com',
    createdAt: '2026-10-22T00:00:00.000Z',
    extras: { robots: null, sitemap: false, llmsTxt: false, agents: {} },
    kit,
  });
  assert.equal(packed.htmlIncluded, true);
  const loaded = unpackReport(packed.token);
  assert.equal(loaded.after.score, kit.after.score);
  assert.match(loaded.patchedHtml, /alt="Plans"/);
  assert.equal(unpackReport('../etc/passwd'), null);
  assert.equal(unpackReport('short'), null);
  assert.equal(JSON.stringify(loaded).includes('gho_'), false);
  const slim = packReport({
    url: pageUrl,
    host: 'example.com',
    createdAt: '2026-10-22T00:00:00.000Z',
    extras: {},
    kit: { ...kit, patchedHtml: '' },
  });
  assert.equal(slim.htmlIncluded, false);
  assert.ok(packed.token.length > slim.token.length);
  const dropped = packReport({
    url: pageUrl,
    host: 'example.com',
    createdAt: '2026-10-22T00:00:00.000Z',
    extras: {},
    kit,
  }, { maxToken: slim.token.length });
  assert.equal(dropped.htmlIncluded, false);
  assert.equal(unpackReport(dropped.token).patchedHtml, undefined);
  assert.throws(() => packReport({
    url: pageUrl,
    host: 'example.com',
    createdAt: '2026-10-22T00:00:00.000Z',
    extras: {},
    kit: { ...kit, patchedHtml: '' },
  }, { maxToken: slim.token.length - 1 }), /report link is too large/);
  const file = standaloneReport(loaded);
  assert.match(file, /Before /);
  assert.match(file, /After /);
  assert.match(file, /Open the element/);
  assert.match(file, /Nothing is stored on the server/);
  assert.doesNotMatch(file, /<link rel="stylesheet"/);
  assert.equal(DASH.test(file), false);
  const section = kitSection(packed, 'https://agentscore.synteq.app');
  assert.match(section, /href="https:\/\/agentscore\.synteq\.app\/report#/);
  assert.match(section, /deflate-raw/);
  assert.doesNotMatch(section, /data\/reports/);
  const diff = fixesDiff({ ...kit, url: pageUrl });
  assert.match(diff, /--- before/);
  assert.match(diff, /\+\+\+ after/);
  assert.equal(DASH.test(diff + section), false);
}

console.log('11. report routes');

function withServer(port, fn) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: path.join(root, 'apps/agentscore'),
    env: { ...process.env, PORT: String(port), GITHUB_FIX_ENABLED: '' },
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
      assert.equal(up, true);
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      proc.kill('SIGTERM');
    }
  })();
}

await withServer(18921, async (base) => {
  const pageRes = await fetch(`${base}/report`);
  assert.equal(pageRes.status, 200);
  const html = await pageRes.text();
  assert.match(html, /deflate-raw/);
  assert.match(html, /Nothing is stored on the server/);
  assert.match(html, /Reports stay in the link, not on the server/);
  assert.doesNotMatch(html, /stored so the link keeps working/);
  assert.equal(html.includes('AGENTSCORE_GITHUB=1'), false);
  assert.doesNotMatch(html, /id="fix-github"/);
  const missing = await fetch(`${base}/report/does-not-exist-1`);
  assert.equal(missing.status, 404);
  const llms = await fetch(`${base}/llms.txt`);
  const llmsText = await llms.text();
  assert.match(llmsText, /encoded in the link/);
  assert.match(llmsText, /Nothing is stored on the server/);
  assert.doesNotMatch(llmsText, /stored so the link keeps working/);
});

console.log('ALL FIX TESTS PASSED');
