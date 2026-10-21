import { analyze } from '../core/page.mjs';

const SITES = [
  'amazon.com','tesla.com','ebay.com','spotify.com','walmart.com','target.com','airbnb.com',
  'booking.com','glassdoor.com','indeed.com','zillow.com','redfin.com','linkedin.com',
  'instagram.com','facebook.com','tiktok.com','x.com','nytimes.com','wsj.com','bloomberg.com',
  'reddit.com','tripadvisor.com','yelp.com','doordash.com','uber.com','shopify.com',
  'salesforce.com','oracle.com','ibm.com','dell.com','hp.com','bestbuy.com','costco.com',
  'expedia.com','pinterest.com','twitch.tv','quora.com','medium.com','substack.com','forbes.com',
];

const out = { blocked: [], scored: [], failed: [] };
const q = [...SITES];
async function worker() {
  while (q.length) {
    const host = q.shift();
    try {
      const r = await analyze('https://' + host, { timeout: 13000, skipExtras: true });
      if (r.blocked) out.blocked.push({ host: r.page.host, status: r.blocked.status, reason: r.blocked.reason });
      else out.scored.push({ host: r.page.host, score: r.scored.score, words: r.page.mainWords });
    } catch (e) {
      out.failed.push({ host, error: e.message });
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
console.log(JSON.stringify(out, null, 2));
