// Precompute AgentOrNot puzzles: agent-view excerpts of famous sites, brand-redacted.
// Usage: node tools/seed-agentornot.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../core/page.mjs';
import { scorePage } from '../core/score.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'apps', 'agentornot', 'data');
const out = path.join(dataDir, 'seed.json');

const SITES = [
  { name: 'GitHub', url: 'https://github.com/', cat: 'dev' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com/', cat: 'dev' },
  { name: 'Hacker News', url: 'https://news.ycombinator.com/', cat: 'dev', aliases: ['ycombinator', 'yc', 'news.ycombinator.com'] },
  { name: 'GitLab', url: 'https://gitlab.com/', cat: 'dev' },
  { name: 'npm', url: 'https://www.npmjs.com/', cat: 'dev', aliases: ['npmjs'] },
  { name: 'DEV Community', url: 'https://dev.to/', cat: 'dev', aliases: ['dev.to'] },
  { name: 'Wikipedia', url: 'https://en.wikipedia.org/', cat: 'info' },
  { name: 'IMDb', url: 'https://www.imdb.com/', cat: 'info' },
  { name: 'arXiv', url: 'https://arxiv.org/', cat: 'info' },
  { name: 'Rotten Tomatoes', url: 'https://www.rottentomatoes.com/', cat: 'info' },
  { name: 'Genius', url: 'https://genius.com/', cat: 'info' },
  { name: 'NOAA Weather', url: 'https://www.weather.gov/', cat: 'info', aliases: ['national weather service', 'weather.gov', 'noaa'] },
  { name: 'The New York Times', url: 'https://www.nytimes.com/', cat: 'news', aliases: ['nytimes', 'new york times'] },
  { name: 'BBC', url: 'https://www.bbc.com/', cat: 'news', aliases: ['bbc.com', 'bbc news'] },
  { name: 'CNN', url: 'https://www.cnn.com/', cat: 'news' },
  { name: 'The Guardian', url: 'https://www.theguardian.com/', cat: 'news', aliases: ['guardian'] },
  { name: 'Reuters', url: 'https://www.reuters.com/', cat: 'news' },
  { name: 'Reddit', url: 'https://www.reddit.com/', cat: 'social' },
  { name: 'X (Twitter)', url: 'https://x.com/', cat: 'social', aliases: ['twitter', 'x.com'] },
  { name: 'Instagram', url: 'https://www.instagram.com/', cat: 'social' },
  { name: 'Pinterest', url: 'https://www.pinterest.com/', cat: 'social' },
  { name: 'Tumblr', url: 'https://www.tumblr.com/', cat: 'social' },
  { name: 'Amazon', url: 'https://www.amazon.com/', cat: 'shop' },
  { name: 'eBay', url: 'https://www.ebay.com/', cat: 'shop', aliases: ['ebay.com'] },
  { name: 'Etsy', url: 'https://www.etsy.com/', cat: 'shop' },
  { name: 'Walmart', url: 'https://www.walmart.com/', cat: 'shop' },
  { name: 'Craigslist', url: 'https://craigslist.org/', cat: 'shop' },
  { name: 'Best Buy', url: 'https://www.bestbuy.com/', cat: 'shop', aliases: ['bestbuy'] },
  { name: 'Apple', url: 'https://www.apple.com/', cat: 'product' },
  { name: 'Tesla', url: 'https://www.tesla.com/', cat: 'product' },
  { name: 'Netflix', url: 'https://www.netflix.com/', cat: 'product' },
  { name: 'Spotify', url: 'https://www.spotify.com/', cat: 'product' },
  { name: 'Airbnb', url: 'https://www.airbnb.com/', cat: 'product' },
  { name: 'Uber', url: 'https://www.uber.com/', cat: 'product' },
  { name: 'Notion', url: 'https://www.notion.so/', cat: 'tools', aliases: ['notion.so'] },
  { name: 'Figma', url: 'https://www.figma.com/', cat: 'tools' },
  { name: 'Canva', url: 'https://www.canva.com/', cat: 'tools' },
  { name: 'Slack', url: 'https://slack.com/', cat: 'tools' },
  { name: 'Discord', url: 'https://discord.com/', cat: 'tools' },
  { name: 'Trello', url: 'https://trello.com/', cat: 'tools' },
];

function redact(text, site) {
  let t = text;
  const tokens = new Set([site.name, ...(site.aliases || [])]);
  const host = new URL(site.url).hostname.replace(/^www\./, '');
  tokens.add(host);
  tokens.add(host.split('.')[0]);
  for (const part of site.name.split(/[\s()]+/)) if (part.length > 2) tokens.add(part);
  for (const tok of tokens) {
    const re = new RegExp(tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    t = t.replace(re, '█'.repeat(Math.min(tok.length, 12)));
  }
  return t;
}

function puzzleView(p, site) {
  const lines = [];
  lines.push(`── what the agent received ──`);
  lines.push(`lang: ${p.lang || '(unset)'}   headings: ${p.headings.length}   links: ${p.links.length}   forms: ${p.forms.length}   images: ${p.images.length}`);
  lines.push('');
  const h = p.headings.slice(0, 8);
  if (h.length) {
    lines.push('[headings]');
    for (const x of h) lines.push(`${'#'.repeat(Math.min(6, x.level))} ${x.text.slice(0, 70)}`);
    lines.push('');
  }
  const navLinks = p.links.slice(0, 10).map((l) => (l.label || '').trim()).filter((s) => s && s.length < 40);
  if (navLinks.length) {
    lines.push('[links] ' + navLinks.join(' · '));
    lines.push('');
  }
  if (p.mainText) {
    lines.push('[main text]');
    lines.push(p.mainText.slice(0, 700));
  }
  return redact(lines.join('\n'), site).slice(0, 1400);
}

const CONC = 5;
const results = [];
for (let i = 0; i < SITES.length; i += CONC) {
  const batch = await Promise.all(SITES.slice(i, i + CONC).map(async (s) => {
    try {
      const r = await analyze(s.url, { timeout: 12000, skipExtras: true });
      return {
        name: s.name, url: s.url, cat: s.cat,
        score: r.scored.score,
        puzzle: puzzleView(r.page, s),
        ok: true,
      };
    } catch (e) {
      console.log(`${s.name}: FAILED ${e.message}`);
      return null;
    }
  }));
  results.push(...batch.filter(Boolean));
  console.log(`batch ${i / CONC + 1} done (${results.length})`);
}
fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), sites: results }, null, 2));
console.log('wrote', out, results.length, 'sites');
