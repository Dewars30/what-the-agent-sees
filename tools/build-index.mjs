import fs from 'node:fs';
import path from 'node:path';
import { analyze } from '../core/page.mjs';

const HOSTS = [
  'synteq.com', 'digitalocean.com', 'railway.com', 'render.com', 'heroku.com', 'hetzner.com',
  'fly.io', 'vercel.com', 'netlify.com', 'cloudflare.com', 'aws.amazon.com',
  'linear.app', 'stripe.com', 'notion.so', 'github.com', 'figma.com',
  'supabase.com', 'neon.com', 'replit.com', 'cursor.com', 'postman.com', 'twilio.com',
];

const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'apps', 'agentscore', 'index.json');
const rows = [];
const queue = [...HOSTS];

async function worker() {
  while (queue.length) {
    const host = queue.shift();
    try {
      const r = await analyze('https://' + host, { timeout: 14000 });
      rows.push({
        host: r.page.host,
        score: r.scored.score,
        grade: r.scored.grade,
        verdict: r.scored.verdict,
        fails: r.scored.fails.length,
        words: r.page.mainWords,
        llms: Boolean(r.extras.llmsTxt),
        blockedAi: Object.values(r.extras.agents || {}).filter((v) => v === 'blocked').length,
      });
      console.log('ok', host, r.scored.score);
    } catch (e) {
      console.log('skip', host, e.message);
    }
  }
}

await Promise.all([worker(), worker(), worker(), worker()]);
rows.sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString().slice(0, 10), rows }, null, 2));
console.log('wrote', out, rows.length, 'rows');
