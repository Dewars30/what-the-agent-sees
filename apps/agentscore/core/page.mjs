import { normalizeTarget, safeFetch, HttpError } from './fetch.mjs';
import { extractModel } from './extract.mjs';
import { scorePage } from './score.mjs';
import { renderAgentView, tlDr } from './agentview.mjs';
import { fetchExtras } from './aux.mjs';

export async function analyze(input, opts = {}) {
  const target = normalizeTarget(input);
  const res = await safeFetch(target, { timeout: opts.timeout ?? 9000 });
  const type = res.contentType || '';
  if (!/html|xml/i.test(type) && res.body.trim().startsWith('{')) {
    throw new HttpError(415, 'That URL returns JSON, not a page.');
  }
  const page = extractModel(res.body, res.url);
  const emptyish = !page.docWords && !page.headings.length && !page.links.length;
  const gateStatus = [401, 403, 429, 503].includes(res.status);
  if (gateStatus || emptyish) {
    // A refusal is a result. To an agent, a page behind a gate reads as a 0.
    return {
      blocked: {
        status: res.status,
        host: page.host,
        reason: gateStatus
          ? `${page.host} answered ${res.status} instead of serving the page.`
          : `${page.host} served a bot check instead of the page.`,
      },
      page,
      extras: {},
      scored: { score: 0, grade: 'F', verdict: 'Invisible', dims: [], findings: [], fails: [], warns: [], oks: [], openPoints: 0 },
      agentView: `url: ${res.url}\ntitle: (none)\ndescription: (none)\nlang: (unset)  headings: 0  links: 0  forms: 0  images: 0\n\n[main]\n  (nothing. the server declined.)`,
      tlDr: `${page.host} does not serve a readable page to a non-browser client. Score: 0.`,
      fetchedAt: new Date().toISOString(),
      bytes: res.bytes,
    };
  }
  const extras = opts.skipExtras ? {} : await fetchExtras(res.url);
  const scored = scorePage(page, extras);
  const agentView = renderAgentView(page);
  return {
    page,
    extras,
    scored,
    agentView,
    tlDr: tlDr(page, scored),
    fetchedAt: new Date().toISOString(),
    bytes: res.bytes,
  };
}

export { HttpError };
