// Pre-score the AgentRank provider board so the app renders instantly.
// Usage: node tools/seed-agentrank.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../core/page.mjs';
import { grade } from '../core/score.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'apps', 'agentrank', 'data');
const providers = JSON.parse(fs.readFileSync(path.join(dataDir, 'providers.json'), 'utf8'));
const out = path.join(dataDir, 'seed.json');

const slug = (u) => new URL(u).hostname.replace(/^www\./, '');
const CONCURRENCY = 6;

async function scoreOne(p) {
  const s = slug(p.url);
  try {
    const r = await analyze(p.url, { timeout: 12000 });
    return {
      slug: s,
      name: p.name,
      url: p.url,
      score: r.scored.score,
      grade: grade(r.scored.score),
      dims: r.scored.dims.map((d) => ({ key: d.key, label: d.label, weight: d.weight, score: d.score })),
      fails: r.scored.fails.slice(0, 4).map((f) => ({ title: f.title, detail: f.detail, fix: f.fix })),
      warns: r.scored.warns.slice(0, 4).map((f) => ({ title: f.title, detail: f.detail, fix: f.fix })),
      tlDr: r.tlDr,
      words: r.page.mainWords,
      fetchedAt: r.fetchedAt,
      ok: true,
    };
  } catch (e) {
    return { slug: s, name: p.name, url: p.url, score: 0, grade: 'F', ok: false, error: e.message, fetchedAt: new Date().toISOString() };
  }
}

const results = [];
for (let i = 0; i < providers.length; i += CONCURRENCY) {
  const batch = await Promise.all(providers.slice(i, i + CONCURRENCY).map(scoreOne));
  results.push(...batch);
  for (const b of batch) console.log(b.ok ? `${b.name}: ${b.score}` : `${b.name}: FAILED ${b.error}`);
}
results.sort((a, b) => b.score - a.score);
results.forEach((r, i) => (r.rank = i + 1));
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), rows: results }, null, 2));
console.log('wrote', out);
