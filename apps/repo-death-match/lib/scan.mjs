// GitHub repo scanner. All static reads, no code execution.
// Unauthenticated: 60 req/hr per IP. Each repo needs ~5 calls.

const GITHUB_API = 'https://api.github.com';
const UA = 'repo-death-match/1.0 (+https://rdm.synteq.app)';

async function gh(url, { token } = {}) {
  const headers = { 'User-Agent': UA, Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (res.status === 403) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining === '0') throw new RateLimitError('GitHub rate limit hit. Try again in an hour, or paste a read-only token for deeper scans.');
  }
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${url}`);
  return res;
}

class RateLimitError extends Error {}

async function getJson(url, opts) {
  const res = await gh(url, opts);
  return res ? res.json() : null;
}

async function getRemaining(res) {
  if (!res) return null;
  return res.headers.get('x-ratelimit-remaining');
}

// Parse owner/repo from a URL or slug
export function parseRepo(input) {
  const trimmed = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\/$/, '');
  const parts = trimmed.split('/');
  if (parts.length < 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

// Scan a single repo. Returns a fighter object with stats.
export async function scanRepo(owner, repo, { token } = {}) {
  const base = `${GITHUB_API}/repos/${owner}/${repo}`;
  
  // 1. Repo metadata
  const meta = await getJson(base, { token });
  if (!meta) return { error: 'not_found', owner, repo };

  // 2. Contributors (count from Link header on per_page=1)
  const contribRes = await gh(`${base}/contributors?per_page=1&anon=true`, { token });
  let contributorCount = 0;
  if (contribRes) {
    const link = contribRes.headers.get('link') || '';
    const match = link.match(/page=(\d+)>; rel="last"/);
    contributorCount = match ? parseInt(match[1], 10) : 1;
    const data = await contribRes.json();
    if (!match && Array.isArray(data)) contributorCount = data.length;
  }

  // 3. Last commit
  const commits = await getJson(`${base}/commits?per_page=1`, { token });
  const lastCommitDate = commits && commits[0] ? commits[0].commit?.committer?.date : null;

  // 4. Languages
  const languages = await getJson(`${base}/languages`, { token });

  // 5. License file (try contents endpoint)
  let licenseName = meta.license?.spdx_id || 'NONE';
  if (licenseName === 'NOASSERTION') {
    const licFile = await getJson(`${base}/contents/LICENSE`, { token });
    if (licFile && licFile.content) {
      licenseName = 'CUSTOM';
    }
  }

  // 6. Check for package.json / requirements.txt / Cargo.toml
  let deps = null;
  let installScripts = false;
  let manifestType = null;

  const pkgRes = await getJson(`${base}/contents/package.json`, { token });
  if (pkgRes && pkgRes.content) {
    manifestType = 'npm';
    try {
      const pkg = JSON.parse(Buffer.from(pkgRes.content, 'base64').toString('utf8'));
      deps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
      if (pkg.scripts && (pkg.scripts.postinstall || pkg.scripts.preinstall)) {
        installScripts = true;
      }
    } catch {}
  }

  if (!deps) {
    const reqRes = await getJson(`${base}/contents/requirements.txt`, { token });
    if (reqRes && reqRes.content) {
      manifestType = 'pip';
      const text = Buffer.from(reqRes.content, 'base64').toString('utf8');
      deps = text.split('\n').filter(l => l.trim() && !l.startsWith('#')).length;
    }
  }

  if (!deps) {
    const pyprojRes = await getJson(`${base}/contents/pyproject.toml`, { token });
    if (pyprojRes && pyprojRes.content) {
      manifestType = 'pyproject';
      const text = Buffer.from(pyprojRes.content, 'base64').toString('utf8');
      const depMatch = text.match(/\[project\.dependencies\][^\[]*/i);
      if (depMatch) {
        deps = depMatch[0].split('\n').filter(l => l.trim() && !l.startsWith('[')).length;
      }
    }
  }

  if (!deps) {
    const cargoRes = await getJson(`${base}/contents/Cargo.toml`, { token });
    if (cargoRes && cargoRes.content) {
      manifestType = 'cargo';
      const text = Buffer.from(cargoRes.content, 'base64').toString('utf8');
      deps = (text.match(/^[a-z_-]+\s*=/gmi) || []).length;
    }
  }

  // 7. Check for tests / CI
  const hasTests = await checkPathExists(base, 'test', { token }) || await checkPathExists(base, 'tests', { token }) || await checkPathExists(base, 'spec', { token });
  const hasCI = await checkPathExists(base, '.github/workflows', { token }) || await checkPathExists(base, '.circleci', { token });

  // 8. README
  const readme = await getJson(`${base}/readme`, { token });
  let readmeClaims = 0;
  let readmeText = '';
  if (readme && readme.content) {
    readmeText = Buffer.from(readme.content, 'base64').toString('utf8');
    // Count bullet points or feature lists
    readmeClaims = (readmeText.match(/^[-*]\s/gm) || []).length;
  }

  // 9. Compute staleness
  const lastActivity = lastCommitDate || meta.pushed_at;
  const monthsSinceActivity = lastActivity ? monthsSince(lastActivity) : 99;

  // 10. Stars vs forks ratio
  const stars = meta.stargazers_count || 0;
  const forks = meta.forks_count || 0;
  const adoptionRatio = stars > 0 ? forks / stars : 0;

  // 11. Open issues
  const openIssues = meta.open_issues_count || 0;

  return {
    owner,
    repo,
    handle: `${owner}/${repo}`,
    name: meta.name,
    description: meta.description || '',
    stars,
    forks,
    contributorCount,
    lastCommitDate,
    lastActivity,
    monthsSinceActivity,
    primaryLanguage: meta.language || (languages ? Object.keys(languages).sort((a, b) => languages[b] - languages[a])[0] : 'Unknown'),
    languages: languages ? Object.keys(languages) : [],
    license: licenseName,
    hasLicense: licenseName !== 'NONE' && licenseName !== 'NOASSERTION',
    installScripts,
    manifestType,
    deps,
    hasTests,
    hasCI,
    readmeClaims,
    adoptionRatio,
    openIssues,
    topics: meta.topics || [],
    homepage: meta.homepage || '',
    archived: meta.archived || false,
    createdAt: meta.created_at,
  };
}

async function checkPathExists(base, path, { token }) {
  const res = await gh(`${base}/contents/${path}`, { token });
  if (!res) return false;
  const data = await res.json();
  return Array.isArray(data) || (data && data.type);
}

function monthsSince(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
}

export { RateLimitError };
