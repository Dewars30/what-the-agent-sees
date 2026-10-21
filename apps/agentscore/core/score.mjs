// Deterministic rubric. No model, no opinions: every point maps to a check.
const GENERIC_LINK = /^(click here|here|read more|learn more|more|this|link|see more|details|view|go|this page|this link|continue|next|previous|button|submit|→|>|\+)$/i;

const D = (key, label, weight) => ({ key, label, weight, score: 0, findings: [] });
const fail = (title, detail, fix) => ({ level: 'fail', title, detail, fix });
const warn = (title, detail, fix) => ({ level: 'warn', title, detail, fix });
const ok = (title, detail) => ({ level: 'ok', title, detail });

export function scorePage(p, extras = {}) {
  const dims = [];
  const clamp = (n) => Math.max(0, Math.min(1, n));

  /* ---------- 1. Structure ---------- */
  {
    const d = D('structure', 'Structure', 16);
    let pts = 0;
    const h1s = p.headings.filter((h) => h.level === 1);
    if (h1s.length === 1) { pts += 0.3; d.findings.push(ok('One clear H1', `"${h1s[0].text.slice(0, 70)}"`)); }
    else if (h1s.length === 0) d.findings.push(fail('No H1 on the page', 'Agents use the first heading to decide what the page is about. There is nothing to anchor on.', 'Add a single <h1> that names the page.'));
    else { pts += 0.12; d.findings.push(warn(`${h1s.length} H1s competing`, 'When everything is the most important thing, nothing is.', 'Keep one <h1>; demote the rest to <h2>.')); }

    if (p.headings.length >= 4) pts += 0.2;
    else if (p.headings.length > 0) { pts += 0.08; d.findings.push(warn('Almost no heading structure', `Only ${p.headings.length} heading${p.headings.length === 1 ? '' : 's'} on the page.`, 'Break the page into named sections with H2/H3s.')); }
    else d.findings.push(fail('No headings at all', 'The document is one undifferentiated block of text.', 'Add an H1 and section headings.'));

    if (p.headingJumps === 0 && p.headings.length > 1) pts += 0.15;
    else if (p.headingJumps > 0) d.findings.push(warn(`${p.headingJumps} heading level jump${p.headingJumps === 1 ? '' : 's'}`, 'Skipping from H2 straight to H4 breaks the outline an agent reconstructs.', 'Do not skip levels.'));

    const lm = p.landmarks;
    const hasMain = lm.main > 0 || lm.roleMain > 0;
    if (hasMain) { pts += 0.2; d.findings.push(ok('Main landmark present', 'An agent can find where the actual content starts.')); }
    else d.findings.push(fail('No <main> landmark', 'Without it, an agent has to guess which of the 40 divs is the content and which is the cookie banner.', 'Wrap primary content in <main>.'));

    const navCount = lm.nav;
    if (navCount > 0) pts += 0.15; else d.findings.push(warn('No <nav> element', 'Navigation is likely a pile of divs.', 'Wrap link groups in <nav>.'));
    if (lm.header > 0 || lm.footer > 0) pts += 0.1;
    d.score = clamp(pts);
    dims.push(d);
  }

  /* ---------- 2. Machine facts ---------- */
  {
    const d = D('facts', 'Machine-readable facts', 14);
    let pts = 0;
    if (p.title) {
      if (p.titleLength >= 15 && p.titleLength <= 65) { pts += 0.28; d.findings.push(ok('Title is the right size', `${p.titleLength} characters.`)); }
      else { pts += 0.14; d.findings.push(warn('Title length is off', `${p.titleLength} characters. Agents truncate around 65 and skip short titles.`, 'Aim for 15-65 characters that name the product and the page.')); }
    } else d.findings.push(fail('No <title>', 'The tab title is the single most-read string on the page.', 'Add a descriptive <title>.'));

    if (p.description) {
      const dl = p.description.length;
      if (dl >= 110 && dl <= 170) { pts += 0.22; d.findings.push(ok('Meta description is well-formed', `${dl} characters.`)); }
      else {
        pts += 0.12;
        d.findings.push(warn('Meta description is mis-sized', `${dl} characters. Agents truncate long ones and skim short ones.`, 'Aim for 120-160 characters: what this is, who it is for, what to do next.'));
      }
    } else d.findings.push(fail('No meta description', 'An agent summarizing your page has to invent one.', 'Add <meta name="description">.'));

    if (p.canonical) pts += 0.12; else d.findings.push(warn('No canonical URL', 'Duplicate paths make agents cite the wrong page.', 'Add <link rel="canonical">.'));

    const ogScore = [p.og.title, p.og.description, p.og.image].filter(Boolean).length;
    pts += (ogScore / 3) * 0.18;
    if (p.twitterCard) pts += 0.06; else d.findings.push(warn('No twitter:card tag', 'Unfurls in X fall back to a bare link.', 'Add twitter:card = summary_large_image.'));
    if (ogScore === 0) d.findings.push(warn('No Open Graph tags', 'Every unfurl of this page is blank.', 'Add og:title, og:description, og:image.'));
    else if (ogScore < 3) d.findings.push(warn('Open Graph tags are incomplete', `${ogScore} of 3 present.`, 'Add the missing og: tags.'));

    if (p.lang) pts += 0.08; else d.findings.push(warn('No lang attribute', 'Agents cannot tell what language the page is in.', 'Set <html lang="en">.'));
    if (p.viewport) pts += 0.06;
    d.score = clamp(pts);
    dims.push(d);
  }

  /* ---------- 3. Structured data ---------- */
  {
    const d = D('schema', 'Structured data', 12);
    const types = new Set(p.jsonld.flatMap((x) => x.types).map((t) => t.toLowerCase()));
    const meaningful = ['organization', 'website', 'webpage', 'product', 'softwareapplication', 'article', 'faqpage', 'breadcrumblist', 'offer', 'localbusiness', 'service', 'howto', 'event', 'person'];
    const hits = meaningful.filter((t) => types.has(t));
    let pts = 0;
    if (hits.length) {
      pts += Math.min(0.75, 0.28 + hits.length * 0.16);
      d.findings.push(ok('JSON-LD present', `Types found: ${hits.join(', ')}.`));
    } else if (p.jsonld.length) {
      pts += 0.2;
      d.findings.push(warn('JSON-LD is present but not useful', 'Blocks exist, none of them say what the entity is.', 'Use schema.org Organization, WebSite, Product or FAQPage.'));
    } else {
      d.findings.push(fail('No schema.org data at all', 'Everything an agent learns about your business, it has to infer from prose.', 'Add a JSON-LD block with Organization and the page\'s primary type.'));
    }
    if (types.has('faqpage') || types.has('howto')) pts += 0.15;
    if (types.has('breadcrumblist')) pts += 0.1;
    d.score = clamp(pts);
    dims.push(d);
  }

  /* ---------- 4. Actionability ---------- */
  {
    const d = D('actions', 'Actionability', 14);
    let pts = 0;
    const labeled = p.fields.filter((f) => f.label);
    if (p.fields.length) {
      const ratio = labeled.length / p.fields.length;
      pts += ratio >= 1 ? 0.4 : ratio * 0.28;
      if (ratio < 1) d.findings.push(warn(`${p.fields.length - labeled.length} input${p.fields.length - labeled.length === 1 ? '' : 's'} with no label`, 'An agent filling your form sees a box with no name. It will guess, or refuse.', 'Give every input a <label for>.'));
      else d.findings.push(ok('Every input is labeled', `${labeled.length} of ${labeled.length} fields named.`));
    } else {
      pts += 0.15;
      d.findings.push(warn('No forms on the page', 'There is nothing here an agent can fill in on your behalf.', 'If there is a next step, expose it as a real form.'));
    }

    if (p.buttons.length >= 1) {
      pts += Math.min(0.28, 0.14 + p.buttons.length * 0.03);
      const nameless = p.buttons.filter((b) => !b.text).length;
      if (nameless) d.findings.push(warn(`${nameless} unnamed button${nameless === 1 ? '' : 's'}`, 'Icon-only buttons are invisible to a text-based agent.', 'Add aria-label to icon buttons.'));
    } else d.findings.push(warn('No buttons found', 'Nothing on this page is clickable in a way an agent can name.', 'Render real <button> elements.'));

    const navLinks = p.links.filter((l) => !l.external);
    if (navLinks.length >= 5) pts += 0.2;
    else if (navLinks.length > 0) { pts += 0.1; d.findings.push(warn('Very few internal links', `Only ${navLinks.length}.`, 'An agent maps your site by following links, not your sitemap.')); }
    else d.findings.push(fail('No internal links', 'This page is a cul-de-sac.', 'Link to the pages that matter.'));

    const ctas = p.links.concat(p.buttons).filter((x) => /sign ?up|get started|start|book|buy|demo|contact|try|subscribe|download|pricing/i.test(x.text || ''));
    if (ctas.length) pts += 0.12;
    d.score = clamp(pts);
    dims.push(d);
  }

  /* ---------- 5. Legibility ---------- */
  {
    const d = D('legibility', 'Legibility to agents', 16);
    let pts = 0;
    const imgs = p.images;
    if (imgs.length) {
      const withAlt = imgs.filter((i) => i.alt).length;
      const ratio = withAlt / imgs.length;
      pts += ratio >= 1 ? 0.34 : ratio * 0.24;
      if (ratio < 1) d.findings.push(fail(`${imgs.length - withAlt} of ${imgs.length} images have no alt text`, 'To an agent, those are holes in the page. Diagrams, screenshots and charts are just voids.', 'Describe every meaningful image in alt.'));
      else d.findings.push(ok('Images are described', `${withAlt}/${imgs.length} have alt text.`));
    } else { pts += 0.2; }

    const named = p.links.filter((l) => l.label && l.label.length > 2);
    const generic = named.filter((l) => GENERIC_LINK.test(l.label));
    const uniqueLabels = new Set(named.map((l) => l.label.toLowerCase()));
    const dupRatio = named.length ? uniqueLabels.size / named.length : 1;
    if (named.length) {
      pts += clamp(dupRatio) * 0.3;
      if (generic.length) d.findings.push(fail(`${generic.length} link${generic.length === 1 ? '' : 's'} say "here" or "learn more"`, 'Out of context, that text means nothing. An agent reading the link list cannot tell where any of them go.', 'Name the destination: "Read the pricing docs", not "learn more".'));
      if (dupRatio < 0.7) d.findings.push(warn('Many links share the same text', `${named.length - uniqueLabels.size} duplicates.`, 'Distinguish repeated links with aria-label.'));
      if (named.length < 5) d.findings.push(warn('Sparse link text', `Only ${named.length} readable links.`, 'Give agents more surface to traverse.'));
    }

    if (p.headings.length) {
      const avg = p.headings.reduce((n, h) => n + h.text.length, 0) / p.headings.length;
      pts += avg > 12 ? 0.2 : 0.08;
    }
    if (p.mainWords > 150) pts += 0.16;
    else if (p.mainWords > 40) { pts += 0.08; d.findings.push(warn('Thin content', `About ${p.mainWords} words in the main region.`, 'Agents summarize what is there. There is not much.')); }
    else d.findings.push(fail('Almost no text content', `About ${p.mainWords} words.`, 'If the copy is inside an image or a canvas, agents never see it.'));
    d.score = clamp(pts);
    dims.push(d);
  }

  /* ---------- 6. Entry & permission ---------- */
  {
    const d = D('access', 'Entry & permission', 12);
    let pts = 0;
    const agents = extras.agents || {};
    const names = Object.keys(agents);
    const blocked = names.filter((n) => agents[n] === 'blocked');
    const partial = names.filter((n) => agents[n] === 'partial');
    if (!extras.robots) {
      pts += 0.55;
      d.findings.push(warn('No robots.txt', 'Nothing tells a crawler what it may read, so most assume everything.', 'Publish a robots.txt, even a permissive one.'));
    } else if (blocked.length) {
      pts += 0.1;
      d.findings.push(fail(`${blocked.length} AI crawler${blocked.length === 1 ? ' is' : 's are'} disallowed`, `Blocked: ${blocked.slice(0, 5).join(', ')}${blocked.length > 5 ? '…' : ''}. Your site is invisible to those agents by choice.`, 'If you want agent traffic, allow the ones you care about explicitly.'));
      if (partial.length) d.findings.push(warn(`${partial.length} more are partially blocked`, partial.slice(0, 5).join(', '), 'Review the Disallow paths.'));
    } else if (names.length) {
      pts += 0.55;
      d.findings.push(ok('AI crawlers are allowed', 'Nothing in robots.txt blocks the major agent user-agents.'));
    } else pts += 0.35;

    if (extras.sitemap) pts += 0.22; else d.findings.push(warn('No sitemap found', 'Agents discover by crawling. Give them the map.', 'Publish /sitemap.xml and reference it in robots.txt.'));

    if (extras.llmsTxt) {
      pts += 0.23;
      d.findings.push(ok('/llms.txt exists', 'You are publishing a machine-facing summary. Very few sites do this yet.'));
    } else d.findings.push(warn('No /llms.txt', 'The emerging convention for telling an LLM what your site is and where the important pages are.', 'Add a short /llms.txt with title, summary and key links.'));
    d.score = clamp(pts);
    dims.push(d);
  }

  /* ---------- 7. Rendered-by-default ---------- */
  {
    const d = D('render', 'Content without JavaScript', 16);
    const scriptRatio = p.docWords ? p.inlineScriptBytes / Math.max(1, p.docWords) : p.inlineScriptBytes;
    let pts = 0;
    if (p.mainWords >= 320) { pts += 0.5; d.findings.push(ok('Content is in the HTML', `${p.mainWords} words before any script runs.`)); }
    else if (p.mainWords >= 60) { pts += 0.22; d.findings.push(warn('Content is thin before JS', `${p.mainWords} words in the raw HTML.`, 'Server-render the parts that matter.')); }
    else { pts += 0.05; d.findings.push(fail('Page is empty until JavaScript runs', `${p.mainWords} words of real content in the response. Most agents read the response, not the render.`, 'Server-render, or ship a static fallback and an /llms.txt.')); }
    if (p.hasAppRoot && p.mainWords < 100) d.findings.push(fail('Framework shell detected', 'The HTML is a mount point, the meaning arrives later.', 'Prerender or hydrate from the server.'));
    if (p.noscript) pts += 0.15;
    if (scriptRatio < 40) pts += 0.2; else if (scriptRatio > 150) d.findings.push(warn('Script weight dwarfs the copy', `${Math.round(scriptRatio)} bytes of inline script per word of content.`, 'Move logic out of the document.'));
    if (p.externalScripts > 40) { pts -= 0.1; d.findings.push(warn(`${p.externalScripts} external scripts`, 'Each one is a chance for the page to arrive broken.', 'Audit third-party tags.')); }
    d.score = clamp(pts);
    dims.push(d);
  }

  const total = Math.round(dims.reduce((n, d) => n + d.score * d.weight, 0));
  const findings = dims.flatMap((d) => d.findings.map((f) => ({ ...f, dimension: d.label })));
  const fails = findings.filter((f) => f.level === 'fail');
  const warns = findings.filter((f) => f.level === 'warn');
  const oks = findings.filter((f) => f.level === 'ok');

  return {
    score: Math.max(0, Math.min(100, total)),
    grade: grade(total),
    verdict: verdict(total),
    dims: dims.map((d) => ({ key: d.key, label: d.label, weight: d.weight, score: Math.round(d.score * 100), points: Math.round(d.score * d.weight) })),
    findings,
    fails,
    warns,
    oks,
  };
}

export function grade(n) {
  if (n >= 90) return 'A';
  if (n >= 80) return 'B';
  if (n >= 70) return 'C';
  if (n >= 55) return 'D';
  if (n >= 35) return 'E';
  return 'F';
}

export function verdict(n) {
  if (n >= 90) return 'Agent-native';
  if (n >= 80) return 'Agent-friendly';
  if (n >= 70) return 'Usable by agents';
  if (n >= 55) return 'Half-visible';
  if (n >= 35) return 'Hostile to agents';
  return 'Invisible';
}
