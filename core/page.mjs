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
  if (res.status >= 400) {
    throw new HttpError(502, `${target.hostname} answered ${res.status}. Nothing to read.`);
  }
  const page = extractModel(res.body, res.url);
  if (!page.docWords && !page.headings.length && !page.links.length) {
    throw new HttpError(422, 'That page returned no readable content.');
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
