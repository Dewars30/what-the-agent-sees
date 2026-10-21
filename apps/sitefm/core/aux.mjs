// Side-channel facts: robots.txt (AI crawler policy), sitemap, llms.txt.
import { safeFetch } from './fetch.mjs';

const AI_AGENTS = [
  'gptbot', 'oai-searchbot', 'chatgpt-user', 'claudebot', 'claude-web', 'anthropic-ai',
  'perplexitybot', 'google-extended', 'ccbot', 'bytespider', 'applebot-extended',
  'meta-externalagent', 'amazonbot', 'cohere-ai', 'youbot', 'timpibot',
];

function parseRobots(text) {
  const groups = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || current.closed) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') current.rules.push({ type: key, path: value });
    else current.closed = true;
  }
  return groups;
}

function blockStatusFor(groups, agent) {
  const relevant = groups.filter((g) => g.agents.some((a) => a === '*' || agent.includes(a) || a.includes(agent)));
  if (!relevant.length) return 'unmentioned';
  const exact = relevant.filter((g) => g.agents.some((a) => a !== '*' && (agent.includes(a) || a.includes(agent))));
  const use = exact.length ? exact : relevant;
  const rules = use.flatMap((g) => g.rules);
  const blocking = rules.filter((r) => r.type === 'disallow');
  if (!blocking.length) return 'allowed';
  const blocksRoot = blocking.some((r) => r.path === '/' || r.path === '/*');
  const allowsRoot = rules.some((r) => r.type === 'allow' && (r.path === '/' || r.path === '/*'));
  if (blocksRoot && !allowsRoot) return 'blocked';
  if (blocking.length) return 'partial';
  return 'allowed';
}

async function tryFetch(url, opts) {
  try {
    const res = await safeFetch(url, { timeout: 5000, maxBytes: 200_000, ...opts });
    if (res.status >= 400) return null;
    return res;
  } catch {
    return null;
  }
}

export async function fetchExtras(pageUrl) {
  const origin = new URL(pageUrl).origin;
  const [robots, sitemap, llms, llmsFull] = await Promise.all([
    tryFetch(origin + '/robots.txt', { accept: 'text/plain,*/*' }),
    tryFetch(origin + '/sitemap.xml', { accept: 'application/xml,text/xml,*/*' }),
    tryFetch(origin + '/llms.txt', { accept: 'text/plain,*/*' }),
    tryFetch(origin + '/llms-full.txt', { accept: 'text/plain,*/*' }),
  ]);

  const out = {
    robots: null,
    sitemap: false,
    llmsTxt: false,
    llmsFull: false,
    agents: {},
  };
  if (robots && /user-agent\s*:/i.test(robots.body)) {
    const groups = parseRobots(robots.body);
    const agents = {};
    for (const a of AI_AGENTS) agents[a] = blockStatusFor(groups, a);
    out.robots = { groups: groups.length, agents };
    out.sitemapReferenced = /sitemap:/i.test(robots.body);
  }
  out.agents = out.robots?.agents || {};
  out.sitemap = Boolean(sitemap && /<(urlset|sitemapindex)/i.test(sitemap.body)) || Boolean(out.sitemapReferenced);
  out.llmsTxt = Boolean(llms && llms.body.trim().length > 20);
  out.llmsFull = Boolean(llmsFull && llmsFull.body.trim().length > 20);
  out.llmsBytes = llms ? llms.body.length : 0;
  return out;
}
