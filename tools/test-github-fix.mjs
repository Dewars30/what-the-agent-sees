import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildFix } from '../apps/agentscore/fix.mjs';
import { packReport, kitSection } from '../apps/agentscore/report.mjs';
import {
  githubFixEnabled,
  detectFramework,
  candidatePaths,
  planRepoEdits,
  openFixPullRequest,
  createGithubClient,
  exchangeCode,
  issueState,
  takeState,
  reportFromGithubPayload,
} from '../apps/agentscore/github-fix.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASH = /[—–]/;
const pageUrl = 'https://example.com/';

function doc(body, head = '') {
  return `<!doctype html><html lang="en"><head><title>Example product homepage</title>${head}</head><body>${body}</body></html>`;
}

console.log('1. flag stays off without credentials');
{
  assert.equal(githubFixEnabled({}), false);
  assert.equal(githubFixEnabled({ GITHUB_FIX_ENABLED: '1' }), false);
  assert.equal(githubFixEnabled({ GITHUB_FIX_ENABLED: '1', GITHUB_CLIENT_ID: 'id' }), false);
  assert.equal(githubFixEnabled({ GITHUB_FIX_ENABLED: '1', GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' }), true);
  assert.equal(githubFixEnabled({ GITHUB_FIX_ENABLED: '0', GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' }), false);
}

console.log('2. framework detection');
{
  assert.equal(detectFramework({ 'package.json': '{"dependencies":{"next":"14.2.5"}}' }), 'next');
  assert.equal(detectFramework({ 'package.json': '{"devDependencies":{"astro":"4.0.0"}}' }), 'astro');
  assert.equal(detectFramework({ 'package.json': '{"dependencies":{"next":"1","astro":"1"}}' }), 'next');
  assert.equal(detectFramework({ 'index.html': '<html></html>' }), 'html');
  assert.equal(detectFramework({ 'package.json': '{"dependencies":{"react":"18.0.0"}}' }), 'unknown');
  assert.equal(detectFramework({ 'package.json': '{"dependencies":{"react":"18.0.0"}}', 'index.html': 'x' }), 'html');
  assert.equal(detectFramework({}), 'unknown');
  assert.equal(detectFramework({ 'package.json': 'not json', 'index.html': 'x' }), 'html');
}

console.log('3. candidate paths');
{
  assert.deepEqual(candidatePaths('https://example.com/', 'html'), ['index.html']);
  assert.deepEqual(candidatePaths('https://example.com/pricing', 'html'), ['pricing/index.html', 'pricing.html']);
  assert.deepEqual(candidatePaths('https://example.com/docs/guide.html', 'html'), ['docs/guide.html']);
  const nextHome = candidatePaths('https://example.com/', 'next');
  assert.ok(nextHome.includes('app/page.tsx'));
  assert.ok(nextHome.includes('src/app/page.tsx'));
  assert.ok(nextHome.includes('pages/index.tsx'));
  const nextPricing = candidatePaths('https://example.com/pricing', 'next');
  assert.ok(nextPricing.includes('app/pricing/page.tsx'));
  assert.ok(nextPricing.includes('pages/pricing.tsx'));
  assert.ok(nextPricing.includes('src/pages/pricing/index.astro') === false);
  const astro = candidatePaths('https://example.com/pricing', 'astro');
  assert.deepEqual(astro, ['src/pages/pricing.astro', 'src/pages/pricing/index.astro', 'src/pages/pricing.html']);
  assert.deepEqual(candidatePaths('https://example.com/', 'unknown'), []);
  assert.deepEqual(candidatePaths('not a url', 'html'), []);
  assert.deepEqual(candidatePaths('https://example.com/%2e%2e/secret', 'html'), ['secret/index.html', 'secret.html']);
}

console.log('4. plan falls back to the report, or patches index.html');
{
  const html = doc('<main><h1>Plans</h1><img src="/a.png"></main>');
  const unknown = planRepoEdits({ framework: 'unknown', pageUrl, files: { 'index.html': html }, extras: {} });
  assert.equal(unknown.mode, 'report-only');
  assert.equal(unknown.edits.length, 0);

  const missing = planRepoEdits({
    framework: 'next',
    pageUrl: 'https://example.com/pricing',
    files: { 'package.json': '{"dependencies":{"next":"14.0.0"}}' },
    extras: {},
  });
  assert.equal(missing.mode, 'report-only');

  const htmlPlan = planRepoEdits({ framework: 'html', pageUrl, files: { 'index.html': html }, extras: {} });
  assert.equal(htmlPlan.mode, 'pr');
  assert.equal(htmlPlan.matched, 'index.html');
  assert.match(htmlPlan.edits[0].content, /alt="Plans"/);
  assert.ok(htmlPlan.edits.some((e) => e.path === 'robots.txt'));
  assert.ok(htmlPlan.edits.some((e) => e.path === 'llms.txt'));
  assert.equal(DASH.test(JSON.stringify(htmlPlan.reason)), false);

  const jsx = 'export default function Page(){return <main><h1>Pricing</h1><img src="/a.png" /></main>}';
  const nextPlan = planRepoEdits({
    framework: 'next',
    pageUrl,
    files: {
      'package.json': '{"dependencies":{"next":"1"}}',
      'app/page.tsx': jsx,
    },
    extras: { robots: { groups: 1 }, llmsTxt: true, sitemap: false, agents: { gptbot: 'allowed' } },
  });
  assert.equal(nextPlan.mode, 'pr');
  assert.equal(nextPlan.edits.length, 1);
  assert.match(nextPlan.edits[0].content, /alt="Pricing"/);
  assert.equal(nextPlan.edits[0].content.includes('<nav>'), false);
  assert.equal(nextPlan.edits[0].content.includes('ld+json'), false);
  assert.equal(nextPlan.edits[0].content.includes('<noscript>'), false);
}

console.log('5. pull request branch is never the default branch');
{
  const calls = [];
  const client = {
    async getRepo() { return { default_branch: 'main' }; },
    async getCommitSha(_o, _r, branch) { calls.push(['sha', branch]); return 'abc123'; },
    async createBranch(_o, _r, head, sha) { calls.push(['branch', head, sha]); return {}; },
    async putFile(_o, _r, opts) { calls.push(['file', opts.branch, opts.path]); return {}; },
    async openPull(opts) {
      calls.push(['pr', opts.head, opts.base, opts.body, opts.title]);
      return { html_url: 'https://github.com/o/r/pull/4', number: 4, head: { ref: opts.head }, base: { ref: opts.base } };
    },
  };
  const plan = {
    mode: 'pr',
    matched: 'index.html',
    before: 70,
    after: 82,
    withFiles: 88,
    edits: [{ path: 'index.html', content: '<p>ok</p>' }],
  };
  const pr = await openFixPullRequest(client, {
    owner: 'octo',
    repo: 'site',
    reportId: 'abcdefghij12',
    scanned: { url: pageUrl, before: 61, after: 74 },
    plan,
  });
  assert.equal(pr.html_url, 'https://github.com/o/r/pull/4');
  const branch = calls.find((c) => c[0] === 'branch');
  assert.equal(branch[1], 'agentscore/fix-abcdefghij12');
  assert.notEqual(branch[1], 'main');
  assert.equal(calls.some((c) => c[0] === 'file' && c[1] === 'main'), false);
  assert.equal(calls.some((c) => c[0] === 'branch' && c[1] === 'main'), false);
  const opened = calls.find((c) => c[0] === 'pr');
  assert.equal(opened[1], 'agentscore/fix-abcdefghij12');
  assert.equal(opened[2], 'main');
  assert.match(opened[3], /Scanned before: 61\/100/);
  assert.match(opened[3], /Scanned after: 74\/100/);
  assert.match(opened[3], /Source before: 70\/100/);
  assert.match(opened[3], /Source after: 82\/100/);
  assert.match(opened[3], /Source with suggested files: 88\/100/);
  assert.match(opened[3], /This branch is not the default branch/);
  assert.equal(DASH.test(opened[3] + opened[4]), false);

  const blocked = {
    async getRepo() { return { default_branch: 'agentscore/fix-abcdefghij12' }; },
    async getCommitSha() { throw new Error('should not read the tip'); },
    async createBranch() { throw new Error('should not create a branch'); },
    async putFile() { throw new Error('should not write a file'); },
    async openPull() { throw new Error('should not open a pull request'); },
  };
  await assert.rejects(
    () => openFixPullRequest(blocked, {
      owner: 'octo',
      repo: 'site',
      reportId: 'abcdefghij12',
      scanned: { url: pageUrl, before: 1, after: 2 },
      plan,
    }),
    /default branch/,
  );
}

console.log('6. contents writes name the new branch, and token exchange hides the token');
{
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body || '', authorization: opts.headers && opts.headers.authorization });
    if (String(url).includes('/contents/') && opts.method === 'PUT') {
      return { ok: true, status: 201, text: async () => '{"content":{"path":"index.html"}}' };
    }
    return { ok: false, status: 404, text: async () => '{"message":"Not Found"}' };
  };
  const client = createGithubClient('gho_testtoken', fetchImpl);
  await client.putFile('octo', 'site', {
    path: 'index.html',
    branch: 'agentscore/fix-abcdefghij12',
    message: 'agentscore: index.html',
    content: '<p>ok</p>',
  });
  const put = calls.find((c) => c.method === 'PUT');
  const body = JSON.parse(put.body);
  assert.equal(body.branch, 'agentscore/fix-abcdefghij12');
  assert.notEqual(body.branch, 'main');
  assert.equal(calls.some((c) => c.url.includes('gho_testtoken')), false);
  const missing = await client.getFile('octo', 'site', 'nope.txt', 'main');
  assert.equal(missing, null);

  await assert.rejects(
    () => exchangeCode({
      code: 'abc',
      redirectUri: 'https://agentscore.synteq.app/github/fix/callback',
      env: { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'sec' },
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: 'bad_verification_code', access_token: 'gho_secretvalue' }) }),
    }),
    (err) => {
      assert.equal(String(err.message).includes('gho_secretvalue'), false);
      assert.equal(String(err.message).includes('sec'), false);
      return true;
    },
  );
}

console.log('7. state is single use and carries no report');
{
  const state = issueState();
  assert.equal(typeof state, 'string');
  assert.ok(state.length >= 16);
  assert.equal(takeState(state), true);
  assert.equal(takeState(state), false);
  assert.equal(takeState('missing'), false);
}

console.log('7b. GitHub payload is scores and a URL, not a stored report');
{
  assert.equal(reportFromGithubPayload(''), null);
  assert.equal(reportFromGithubPayload('{'), null);
  assert.equal(reportFromGithubPayload(JSON.stringify({ url: 'javascript:alert(1)', before: 1, after: 2 })), null);
  assert.equal(reportFromGithubPayload(JSON.stringify({ url: pageUrl, before: '20', after: 31 })), null);
  assert.equal(reportFromGithubPayload('x'.repeat(32001)), null);
  const row = reportFromGithubPayload(JSON.stringify({
    url: pageUrl,
    host: 'example.com',
    before: 20,
    after: 31,
    extras: { robots: null, sitemap: false, llmsTxt: false, agents: {} },
    patchedHtml: '<script>alert(1)</script>',
    originalHtml: 'secret',
  }));
  assert.ok(row);
  assert.match(row.id, /^[A-Za-z0-9_-]{8,32}$/);
  assert.equal(row.url, pageUrl);
  assert.equal(row.kit.before.score, 20);
  assert.equal(row.kit.after.score, 31);
  assert.equal(row.patchedHtml, undefined);
  assert.equal(row.originalHtml, undefined);
  assert.equal(JSON.stringify(row).includes('gho_'), false);
  assert.equal(JSON.stringify(row).includes('<script>'), false);
}

console.log('8. routes: hidden until the flag is on, then the authorize redirect');

function withServer(port, env, fn) {
  const proc = spawn(process.execPath, ['server.mjs'], {
    cwd: path.join(root, 'apps/agentscore'),
    env: { ...process.env, PORT: String(port), AGENTSCORE_DATA_DIR: '', ...env },
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
      assert.equal(up, true, 'server did not start');
      await fn(`http://127.0.0.1:${port}`);
    } finally {
      proc.kill('SIGTERM');
    }
  })();
}

await withServer(18931, { GITHUB_FIX_ENABLED: '', GITHUB_CLIENT_ID: '', GITHUB_CLIENT_SECRET: '' }, async (base) => {
  const off = await fetch(`${base}/github/fix/start`);
  assert.equal(off.status, 404);
  assert.equal(await off.text(), 'not enabled');
  const report = await fetch(`${base}/report`);
  const html = await report.text();
  assert.equal(html.includes('AGENTSCORE_GITHUB=1'), false);
  assert.doesNotMatch(html, /id="fix-github"/);
  const kit = buildFix(doc('<main><h1>Plans</h1><img src="/a.png"></main>'), pageUrl, {});
  const packed = packReport({ url: pageUrl, host: 'example.com', createdAt: '2026-10-22T00:00:00.000Z', extras: {}, kit });
  const section = kitSection(packed, 'https://agentscore.synteq.app');
  assert.equal(section.includes('id="fix-github"'), false);
  assert.equal(JSON.stringify(packed.report).includes('gho_'), false);
});

await withServer(18932, {
  GITHUB_FIX_ENABLED: '1',
  GITHUB_CLIENT_ID: 'Iv1.test',
  GITHUB_CLIENT_SECRET: 'sec',
  PUBLIC_ORIGIN: 'https://agentscore.synteq.app',
}, async (base) => {
  const start = await fetch(`${base}/github/fix/start`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const loc = start.headers.get('location') || '';
  const u = new URL(loc);
  assert.equal(u.origin + u.pathname, 'https://github.com/login/oauth/authorize');
  assert.equal(u.searchParams.get('scope'), 'public_repo');
  assert.equal(u.searchParams.get('client_id'), 'Iv1.test');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://agentscore.synteq.app/github/fix/callback');
  assert.ok(u.searchParams.get('state'));
  const page = await fetch(`${base}/report`);
  assert.match(await page.text(), /AGENTSCORE_GITHUB=1/);
  const callback = await fetch(`${base}/github/fix/callback`, { redirect: 'manual' });
  assert.equal(callback.status, 400);
  const repos = await fetch(`${base}/github/fix/repos`, { redirect: 'manual' });
  assert.equal(repos.status, 302);
  assert.equal(repos.headers.get('location'), '/github/fix/start');
  const payload = JSON.stringify({ url: pageUrl, host: 'example.com', before: 20, after: 31, extras: {} });
  const open = await fetch(`${base}/github/fix/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ repo: 'octo/site', payload }).toString(),
    redirect: 'manual',
  });
  assert.equal(open.status, 401);
  assert.equal(await open.text(), 'sign in required');
  const kit = buildFix(doc('<main><h1>Plans</h1><img src="/a.png"></main>'), pageUrl, {});
  const packed = packReport({ url: pageUrl, host: 'example.com', createdAt: '2026-10-22T00:00:00.000Z', extras: {}, kit });
  assert.match(kitSection(packed, 'https://agentscore.synteq.app', { github: true }), /id="fix-github"/);
});

console.log('ALL GITHUB FIX TESTS PASSED');
