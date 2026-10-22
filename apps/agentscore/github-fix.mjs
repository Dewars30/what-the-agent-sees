// Opt-in GitHub pull requests. Off unless GITHUB_FIX_ENABLED=1 and both OAuth credentials are set.
// Tokens stay in memory for the session. Nothing here writes a token to disk.
import crypto from 'node:crypto';
import { esc } from './core/kit.mjs';
import { buildFix } from './fix.mjs';
import { reportIdOk, slimExtras } from './report.mjs';

const STATE_TTL = 10 * 60 * 1000;
const SESSION_TTL = 60 * 60 * 1000;
const states = new Map();
const sessions = new Map();

export function githubFixEnabled(env = process.env) {
  return env.GITHUB_FIX_ENABLED === '1' && Boolean(env.GITHUB_CLIENT_ID) && Boolean(env.GITHUB_CLIENT_SECRET);
}

export function authorizeUrl({ clientId, redirectUri, state }) {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('scope', 'public_repo');
  u.searchParams.set('state', state);
  return u.toString();
}

function sweep(map, now) {
  for (const [k, v] of map) if (v.exp <= now) map.delete(k);
}

export function issueState() {
  const now = Date.now();
  sweep(states, now);
  const state = crypto.randomBytes(16).toString('base64url');
  states.set(state, { exp: now + STATE_TTL });
  return state;
}

export function takeState(state) {
  const now = Date.now();
  sweep(states, now);
  const row = states.get(state);
  states.delete(state);
  if (!row || row.exp <= now) return false;
  return true;
}

export function reportFromGithubPayload(raw) {
  if (!raw || String(raw).length > 32000) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url)) return null;
  if (!Number.isFinite(data.before) || !Number.isFinite(data.after)) return null;
  return {
    id: crypto.randomBytes(9).toString('base64url'),
    url: data.url.slice(0, 2000),
    host: String(data.host || '').slice(0, 200),
    extras: slimExtras(data.extras || {}),
    kit: { before: { score: data.before }, after: { score: data.after } },
  };
}

export function createSession(token) {
  const now = Date.now();
  sweep(sessions, now);
  const sid = crypto.randomBytes(18).toString('base64url');
  sessions.set(sid, { token, exp: now + SESSION_TTL });
  return sid;
}

export function sessionToken(sid) {
  const now = Date.now();
  sweep(sessions, now);
  const row = sessions.get(sid);
  if (!row || row.exp <= now) return null;
  return row.token;
}

export function readCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

export function sessionCookie(sid, secure) {
  const bits = [`ag_gh=${encodeURIComponent(sid)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/', 'Max-Age=3600'];
  if (secure) bits.push('Secure');
  return bits.join('; ');
}

export async function exchangeCode({ code, redirectUri, env = process.env, fetchImpl = globalThis.fetch }) {
  const res = await fetchImpl('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data || !data.access_token) throw new Error('GitHub did not return a token');
  return data.access_token;
}

function safeError(e) {
  return String((e && e.message) || 'GitHub request failed')
    .replace(/gho_[A-Za-z0-9_]+/g, '[token]')
    .replace(/github_pat_[A-Za-z0-9_]+/g, '[token]')
    .slice(0, 200);
}

async function readJson(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 180) };
  }
}

export function createGithubClient(token, fetchImpl = globalThis.fetch) {
  async function api(url, opts = {}, allowMissing = false) {
    const res = await fetchImpl(url, {
      ...opts,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'user-agent': 'AgentScore',
        'x-github-api-version': '2022-11-28',
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
    });
    if (res.status === 404 && allowMissing) return null;
    const body = await readJson(res);
    if (!res.ok) {
      const msg = body && body.message ? String(body.message).slice(0, 180) : String(res.status);
      throw new Error(`GitHub ${res.status}: ${msg}`);
    }
    return body;
  }

  function encodedPath(filePath) {
    return String(filePath).split('/').map(encodeURIComponent).join('/');
  }

  return {
    async getRepo(owner, repo) {
      return api(`https://api.github.com/repos/${owner}/${repo}`);
    },
    async getCommitSha(owner, repo, branch) {
      const ref = String(branch).split('/').map(encodeURIComponent).join('/');
      const data = await api(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${ref}`);
      if (!data?.object?.sha) throw new Error('missing branch tip');
      return data.object.sha;
    },
    async getFile(owner, repo, filePath, ref) {
      const data = await api(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath(filePath)}?ref=${encodeURIComponent(ref)}`,
        {},
        true,
      );
      if (!data || data.type !== 'file') return null;
      if ((data.encoding && data.encoding !== 'base64') || (!data.content && data.size > 0)) {
        throw new Error('file too large to edit');
      }
      const text = Buffer.from(String(data.content || '').replace(/\n/g, ''), 'base64').toString('utf8');
      return { text, sha: data.sha };
    },
    async createBranch(owner, repo, head, sha) {
      return api(`https://api.github.com/repos/${owner}/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${head}`, sha }),
      });
    },
    async putFile(owner, repo, { path: filePath, branch, message, content }) {
      if (Buffer.byteLength(content) > 900_000) throw new Error('file too large for the GitHub contents API. Use the report.');
      const existing = await this.getFile(owner, repo, filePath, branch);
      const payload = {
        message,
        content: Buffer.from(content, 'utf8').toString('base64'),
        branch,
      };
      if (existing?.sha) payload.sha = existing.sha;
      return api(`https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath(filePath)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    },
    async openPull({ owner, repo, head, base, title, body }) {
      return api(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title, head, base, body }),
      });
    },
    async listRepos() {
      const data = await api('https://api.github.com/user/repos?per_page=100&visibility=public&sort=updated');
      if (!Array.isArray(data)) return [];
      return data
        .map((r) => ({ fullName: r.full_name, private: Boolean(r.private), defaultBranch: r.default_branch }))
        .filter((r) => r.fullName && !r.private);
    },
  };
}

export function detectFramework(files) {
  const pkgRaw = files && files['package.json'];
  if (typeof pkgRaw === 'string' && pkgRaw.trim()) {
    try {
      const pkg = JSON.parse(pkgRaw);
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.next) return 'next';
      if (deps.astro) return 'astro';
    } catch {
      /* package.json was not JSON. Fall through. */
    }
  }
  if (files && (typeof files['index.html'] === 'string' || files['index.html'] === true)) return 'html';
  return 'unknown';
}

export function candidatePaths(pageUrl, framework) {
  let pathname = '/';
  try {
    pathname = new URL(pageUrl).pathname || '/';
  } catch {
    return [];
  }
  let parts;
  try {
    parts = pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  } catch {
    return [];
  }
  if (parts.some((p) => p === '..' || p === '.' || p.includes('\\') || p.includes('\0'))) return [];
  const last = parts[parts.length - 1] || '';
  const isFile = /\.[a-z0-9]+$/i.test(last);
  const dir = (!parts.length ? [] : isFile ? parts.slice(0, -1) : parts).join('/');
  if (framework === 'html') {
    if (!parts.length) return ['index.html'];
    if (isFile) return [parts.join('/')];
    return [`${dir}/index.html`, `${dir}.html`];
  }
  if (framework === 'next') {
    const exts = ['tsx', 'jsx', 'js'];
    const out = [];
    const push = (base) => { for (const ext of exts) out.push(`${base}.${ext}`); };
    if (!dir) {
      push('app/page');
      push('src/app/page');
      push('pages/index');
      push('src/pages/index');
    } else {
      push(`app/${dir}/page`);
      push(`src/app/${dir}/page`);
      push(`pages/${dir}`);
      push(`pages/${dir}/index`);
      push(`src/pages/${dir}`);
      push(`src/pages/${dir}/index`);
    }
    return out;
  }
  if (framework === 'astro') {
    if (!dir) return ['src/pages/index.astro', 'src/pages/index.html'];
    return [`src/pages/${dir}.astro`, `src/pages/${dir}/index.astro`, `src/pages/${dir}.html`];
  }
  return [];
}

export function planRepoEdits({ framework, pageUrl, files, extras = {} }) {
  if (!framework || framework === 'unknown') {
    return { mode: 'report-only', reason: 'Framework not recognized. Use the report.', edits: [] };
  }
  const match = candidatePaths(pageUrl, framework).find((p) => typeof files[p] === 'string');
  if (!match) return { mode: 'report-only', reason: 'No source file matched this URL. Use the report.', edits: [] };
  let kit;
  try {
    kit = buildFix(files[match], pageUrl, extras);
  } catch {
    return { mode: 'report-only', reason: 'Fix kit could not read that source file. Use the report.', edits: [] };
  }
  const edits = [];
  if (kit.patchedHtml !== files[match]) edits.push({ path: match, content: kit.patchedHtml });
  const robotsPath = framework === 'html' ? 'robots.txt' : 'public/robots.txt';
  const llmsPath = framework === 'html' ? 'llms.txt' : 'public/llms.txt';
  const hasRobots = Object.prototype.hasOwnProperty.call(files, 'robots.txt') || Object.prototype.hasOwnProperty.call(files, 'public/robots.txt');
  const hasLlms = Object.prototype.hasOwnProperty.call(files, 'llms.txt') || Object.prototype.hasOwnProperty.call(files, 'public/llms.txt');
  if (kit.suggestions.robots && !hasRobots) edits.push({ path: robotsPath, content: kit.suggestions.robots });
  if (kit.suggestions.llms && !hasLlms) edits.push({ path: llmsPath, content: kit.suggestions.llms });
  if (!edits.length) {
    return { mode: 'report-only', reason: 'Nothing to change in the matched file. Use the report.', edits: [], framework, matched: match };
  }
  return {
    mode: 'pr',
    reason: '',
    edits,
    framework,
    matched: match,
    before: kit.before.score,
    after: kit.after.score,
    withFiles: kit.withFiles ? kit.withFiles.score : null,
  };
}

export async function prepareRepoFix(client, { owner, repo, report }) {
  const info = await client.getRepo(owner, repo);
  if (!info?.default_branch) throw new Error('repository not found');
  const ref = info.default_branch;
  const files = {};
  const pkg = await client.getFile(owner, repo, 'package.json', ref);
  const indexHtml = await client.getFile(owner, repo, 'index.html', ref);
  if (pkg) files['package.json'] = pkg.text;
  if (indexHtml) files['index.html'] = indexHtml.text;
  const framework = detectFramework(files);
  let matched = false;
  for (const p of candidatePaths(report.url, framework)) {
    if (typeof files[p] === 'string') { matched = true; break; }
    const hit = await client.getFile(owner, repo, p, ref);
    if (hit) { files[p] = hit.text; matched = true; break; }
  }
  if (matched && framework !== 'unknown') {
    const aux = framework === 'html'
      ? ['robots.txt', 'llms.txt']
      : ['robots.txt', 'llms.txt', 'public/robots.txt', 'public/llms.txt'];
    for (const p of aux) {
      if (files[p] != null) continue;
      const hit = await client.getFile(owner, repo, p, ref);
      if (hit) files[p] = hit.text;
    }
  }
  return planRepoEdits({ framework, pageUrl: report.url, files, extras: report.extras || {} });
}

const REPO_NAME = /^[\w.-]+$/;

export function splitRepo(full) {
  const parts = String(full || '').split('/');
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!REPO_NAME.test(owner) || !REPO_NAME.test(repo)) return null;
  return { owner, repo };
}

function prBody({ head, base, scanned, plan }) {
  const lines = [
    'AgentScore fix kit.',
    '',
    `Branch: ${head}`,
    `Base: ${base}`,
    '',
    `Scanned page: ${scanned.url}`,
    `Scanned before: ${scanned.before}/100`,
    `Scanned after: ${scanned.after}/100`,
    '',
    `Source file: ${plan.matched}`,
    `Source before: ${plan.before}/100`,
    `Source after: ${plan.after}/100`,
  ];
  if (plan.withFiles != null) lines.push(`Source with suggested files: ${plan.withFiles}/100`);
  lines.push('', 'Edits:');
  for (const edit of plan.edits) lines.push(`- ${edit.path}`);
  lines.push('', 'Review and merge. This branch is not the default branch.');
  return lines.join('\n');
}

export async function openFixPullRequest(client, { owner, repo, reportId, scanned, plan }) {
  if (!REPO_NAME.test(owner) || !REPO_NAME.test(repo)) throw new Error('bad repo');
  if (!reportIdOk(reportId)) throw new Error('bad report');
  if (!plan || plan.mode !== 'pr' || !plan.edits?.length) throw new Error('no edits');
  const info = await client.getRepo(owner, repo);
  const base = info && info.default_branch;
  const head = `agentscore/fix-${reportId}`;
  if (!base || head === base) throw new Error('refusing to push the default branch');
  const sha = await client.getCommitSha(owner, repo, base);
  await client.createBranch(owner, repo, head, sha);
  for (const edit of plan.edits) {
    if (!edit.path || edit.path.includes('..') || edit.path.startsWith('/')) throw new Error('bad path');
    await client.putFile(owner, repo, {
      path: edit.path,
      branch: head,
      message: `agentscore: ${edit.path}`,
      content: edit.content,
    });
  }
  const body = prBody({ head, base, scanned, plan });
  const pr = await client.openPull({
    owner,
    repo,
    head,
    base,
    title: `AgentScore fixes (${plan.before}/100 to ${plan.after}/100)`,
    body,
  });
  if (pr?.head?.ref && pr?.base?.ref && pr.head.ref === pr.base.ref) {
    throw new Error('refusing to push the default branch');
  }
  return pr;
}

function text(status, body, headers) {
  return { status, type: 'text/plain; charset=utf-8', body, headers };
}

function html(status, body, headers) {
  return { status, type: 'text/html; charset=utf-8', body, headers };
}

export function reposBody(repos) {
  const buttons = (repos || []).map((r) => `<form method="post" action="/github/fix/open" style="margin:8px 0">
    <input type="hidden" name="repo" value="${esc(r.fullName)}">
    <input type="hidden" name="payload" value="">
    <button class="btn" type="submit">${esc(r.fullName)}</button>
  </form>`).join('');
  return `<main>
    <h1 class="hero" style="font-size:clamp(26px,4vw,40px)">Pick a repository</h1>
    <p class="sub">Public repositories only. A pull request is opened on a new branch. The default branch is not updated.</p>
    <p class="muted small" id="gh-missing" hidden>Scan a page in this tab first. The report is in the link, not on the server.</p>
    ${buttons || '<p>No public repository was returned for this login.</p>'}
  </main>
  <script>
  if (!sessionStorage.getItem('agentscore-github')) {
    const note = document.getElementById('gh-missing');
    if (note) note.hidden = false;
  }
  document.querySelectorAll('form[action="/github/fix/open"]').forEach((form) => {
    form.addEventListener('submit', () => {
      const field = form.querySelector('[name=payload]');
      if (field) field.value = sessionStorage.getItem('agentscore-github') || '';
    });
  });
  </script>`;
}

export async function handleGithub(req, url, ctx) {
  if (!url.pathname.startsWith('/github/fix')) return null;
  if (!githubFixEnabled()) return text(404, 'not enabled');
  const redirectUri = `${ctx.appOrigin}/github/fix/callback`;
  try {
    if (url.pathname === '/github/fix/start') {
      const state = issueState();
      const location = authorizeUrl({
        clientId: process.env.GITHUB_CLIENT_ID,
        redirectUri,
        state,
      });
      return text(302, 'redirect', { location });
    }
    if (url.pathname === '/github/fix/callback') {
      if (url.searchParams.get('error')) {
        return html(200, ctx.view({
          title: 'GitHub',
          description: 'GitHub did not authorize.',
          body: '<main><p>GitHub did not authorize this app.</p></main>',
        }));
      }
      const code = url.searchParams.get('code') || '';
      if (!code || !takeState(url.searchParams.get('state') || '')) return text(400, 'bad state');
      const token = await exchangeCode({ code, redirectUri });
      const sid = createSession(token);
      return text(302, 'redirect', {
        location: '/github/fix/repos',
        'set-cookie': sessionCookie(sid, ctx.secure),
      });
    }
    if (url.pathname === '/github/fix/repos' && req.method === 'GET') {
      const token = sessionToken(readCookie(req.headers.cookie, 'ag_gh'));
      if (!token) return text(302, 'redirect', { location: '/github/fix/start' });
      const repos = await createGithubClient(token).listRepos();
      return html(200, ctx.view({
        title: 'Pick a repository',
        description: 'Public repositories only.',
        body: reposBody(repos),
      }));
    }
    if (url.pathname === '/github/fix/open' && req.method === 'POST') {
      const raw = await ctx.readBody(req);
      const form = new URLSearchParams(raw);
      const repo = splitRepo(form.get('repo') || '');
      const report = reportFromGithubPayload(form.get('payload') || '');
      if (!repo || !report) return text(400, 'missing report');
      const token = sessionToken(readCookie(req.headers.cookie, 'ag_gh'));
      if (!token) return text(401, 'sign in required');
      const client = createGithubClient(token);
      const plan = await prepareRepoFix(client, { owner: repo.owner, repo: repo.repo, report });
      if (plan.mode !== 'pr') {
        return html(200, ctx.view({
          title: 'Report only',
          description: plan.reason,
          body: `<main><h1 class="hero" style="font-size:clamp(26px,4vw,40px)">Report only</h1><p class="sub">${esc(plan.reason)}</p><p><a href="/">Back to the scan</a></p></main>`,
        }));
      }
      const pr = await openFixPullRequest(client, {
        owner: repo.owner,
        repo: repo.repo,
        reportId: report.id,
        scanned: { url: report.url, before: report.kit.before.score, after: report.kit.after.score },
        plan,
      });
      const prUrl = pr && pr.html_url ? pr.html_url : '';
      return html(200, ctx.view({
        title: 'Pull request opened',
        description: 'Review and merge the pull request.',
        body: `<main><h1 class="hero" style="font-size:clamp(26px,4vw,40px)">Pull request opened</h1><p class="sub">Review and merge. The default branch was not updated.</p><p><a href="${esc(prUrl)}">${esc(prUrl)}</a></p></main>`,
      }));
    }
    return text(404, 'not found');
  } catch (e) {
    const msg = safeError(e);
    return html(200, ctx.view({
      title: 'GitHub fix failed',
      description: 'The pull request was not opened.',
      body: `<main><h1 class="hero" style="font-size:clamp(26px,4vw,40px)">Pull request not opened</h1><p class="sub">${esc(msg)}</p></main>`,
    }));
  }
}
