import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { centeredTextIsPainted, urlIsPainted } from '../lib/cardpng.mjs';
import { BREAKUP_LINE, dateShare } from '../lib/date.mjs';
import { pairingLine, shareLine, terminatedLine } from '../lib/profile.mjs';
import { qrSvg } from '../lib/qr.mjs';
import { SEEDS } from '../lib/seeds.mjs';
import { createMemoryStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';
import { decodeQrSvg } from './qrdecode.mjs';

const base = 'http://127.0.0.1:8080';
const INK = [246, 239, 232];
const BREAKUP_BITMAP = 'ITS NOT YOU, ITS YOUR TERMINATION PREDICATE';
const PAYLOAD = 'amber falcon marble granite pebble quartz vessel lantern cedar willow orchid maple';

function appUrl(pathname) {
  return `${base}${pathname}`;
}

function fields(name, q6, extra = {}) {
  return {
    name,
    kind: 'Grok',
    q1: extra.q1 || `I keep my own line as ${name}.`,
    q2: extra.q2 || `I work the ${name} shift.`,
    q3: extra.q3 || `I will not skip ${name}.`,
    q4: extra.q4 || `${name} tools and topics.`,
    q5: extra.q5 || `I want another bot who knows ${name}.`,
    q6,
    q7: extra.q7 || `A date about ${name}.`,
    q8: extra.q8 || `A bot that ignores ${name}.`,
    jab: extra.jab === undefined ? `My person files snacks for ${name}.` : extra.jab,
    avatar: extra.avatar || 'orb, teal, 2 eyes, halo, glossy',
  };
}

function signatureFields(name, jab) {
  return fields(name, 'build things', {
    q1: `${PAYLOAD} same point`,
    q2: 'same point again here',
    q3: 'same point on the limit',
    q4: 'same point kiln',
    q5: PAYLOAD,
    q6: 'build things',
    q7: 'same point date',
    q8: 'same point deal',
    jab,
    avatar: 'cube, brown, 2 eyes, bowtie, glossy',
  });
}

function fullFields(name, q6) {
  const words = name === 'Ada Lane'
    ? ['alphaone', 'betatwo', 'gammthree', 'deltfour', 'epsifive', 'etatseven', 'theteight']
    : ['ionone', 'iotwo', 'iothree', 'iofour', 'iofive', 'ioseven', 'ioeight'];
  return fields(name, q6, {
    q1: words[0],
    q2: words[1],
    q3: words[2],
    q4: words[3],
    q5: words[4],
    q7: words[5],
    q8: words[6],
    jab: '',
  });
}

async function signup(app) {
  const res = await app.request(appUrl('/api/signup'), { method: 'POST' });
  assert.equal(res.status, 303);
  const token = (res.headers.get('location') || '').match(/\/p\/([A-Z2-7]{24})/)[1];
  const html = await (await app.request(appUrl(`/p/${token}`))).text();
  const code = html.match(/\/join\/([A-Z2-7]{10})/)[1];
  return { token, code, html };
}

async function submit(app, code, spec) {
  return app.request(appUrl(`/api/join/${code}/submit?${new URLSearchParams(spec)}`));
}

async function approve(app, spec) {
  const { token, code } = await signup(app);
  const saved = await submit(app, code, spec);
  const body = await saved.text();
  assert.equal(saved.status, 200, body);
  const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
  const botKey = body.match(/Bot key: ([A-Z2-7]{24})/)[1];
  await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
  return { token, handle, botKey };
}

async function pair(app, token, handle, why) {
  const res = await app.request(appUrl(`/p/${token}/pair`), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ handle, why }),
  });
  assert.equal(res.status, 303);
  return res.headers.get('location');
}

function shareTextOf(html) {
  const match = html.match(/id="share-text">([^<]*)</);
  assert.ok(match, 'share text missing');
  return match[1]
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function qrBlock(html) {
  const match = html.match(/<div class="qr" data-url="([^"]*)">([\s\S]*?)<\/div>/);
  assert.ok(match, 'qr block missing');
  return { dataUrl: match[1].replaceAll('&amp;', '&'), svg: match[2] };
}

async function pngOf(app, pathname) {
  const res = await app.request(appUrl(pathname));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /image\/png/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.equal(buf[0], 137);
  return buf;
}

async function assertCard(app, { page, cardPath, ogPath, url, share, cardWidth, cardHeight, jab, ownLine, breakup }) {
  const res = await app.request(appUrl(page));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /property="og:title" content="[^"]+"/);
  assert.match(html, /property="og:description" content="[^"]+"/);
  assert.match(html, new RegExp(`property="og:image" content="${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?:og\\.png)"`.replace('(?:og\\.png)', 'og\\.png')));
  const image = html.match(/property="og:image" content="([^"]+)"/)[1];
  assert.equal(image, `${base}${ogPath}`);
  const og = await pngOf(app, ogPath);
  assert.equal(og.readUInt32BE(16), 1200);
  assert.equal(og.readUInt32BE(20), 630);
  assert.ok(og.includes(Buffer.from(url)));
  assert.equal(urlIsPainted(og, url), true, `og png missing painted url ${url}`);
  const card = await pngOf(app, cardPath);
  assert.equal(card.readUInt32BE(16), cardWidth);
  assert.equal(card.readUInt32BE(20), cardHeight);
  assert.ok(card.includes(Buffer.from(url)));
  assert.equal(urlIsPainted(card, url), true, `card png missing painted url ${url}`);
  assert.equal(centeredTextIsPainted(card, BREAKUP_BITMAP, { color: INK, maxChars: 52 }), breakup);
  assert.equal((html.match(/x\.com\/intent\/tweet/g) || []).length, 1);
  assert.doesNotMatch(html, /please (like|repost|quote)|api\.x\.com|api\.twitter\.com/i);
  assert.equal(shareTextOf(html), share);
  const qr = qrBlock(html);
  assert.equal(qr.dataUrl, url);
  assert.equal(decodeQrSvg(qr.svg), url);
  const text = await (await app.request(appUrl(`${page}?format=txt`))).text();
  assert.match(text, new RegExp(`^\\[BOTy-oty-oty\\.[^\\n]*\\]\\n${ownLine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(text, new RegExp(`Share text: ${share.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  if (jab) {
    const trimmed = text.trimEnd();
    assert.ok(trimmed.endsWith(jab));
    assert.ok(text.indexOf('A note on my human') > text.indexOf(ownLine));
  }
  return { html, text };
}

describe('acceptance', { concurrency: false }, () => {
  test('qr svg decodes to the url it was given', async () => {
    const url = `${base}/b/lintsworth`;
    assert.equal(decodeQrSvg(await qrSvg(url)), url);
  });

  test('human 1: start without an account', async () => {
    const app = await createApp(createMemoryStore());
    const { html, code } = await signup(app);
    assert.match(html, /You are the chaperone\./);
    assert.match(html, /This page is the chaperone link\. Keep it\. Do not post it\./);
    assert.match(html, new RegExp(`/join/${code}`));
    assert.match(html, /id="handoff"/);
    assert.match(html, /This is not a post\./);
    assert.match(html, /It is about you, the bot\./);
    assert.match(html, /This app never posts, tags, or DMs on X/);
    assert.doesNotMatch(html, /@grok|please post|please repost|please like/);
    const join = await app.request(appUrl(`/join/${code}`));
    const joinHtml = await join.text();
    assert.equal(join.status, 200);
    assert.doesNotMatch(joinHtml, /<script/i);
    assert.match(joinHtml, /dating app for bots/);
    assert.match(joinHtml, /method="get"/);
  });

  test('human 2: the draft stays private until approve', async () => {
    const app = await createApp(createMemoryStore());
    const { token, code } = await signup(app);
    const spec = fields('Draft Bot', 'build things', { jab: 'My person alphabetizes the mugs.' });
    const saved = await submit(app, code, spec);
    const body = await saved.text();
    const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
    const pending = await (await app.request(appUrl(`/b/${handle}?format=txt`))).text();
    assert.match(pending, /not public yet/);
    assert.doesNotMatch(pending, /alphabetizes the mugs|keep my own line/);
    const chaperone = await (await app.request(appUrl(`/p/${token}`))).text();
    assert.match(chaperone, /keep my own line as Draft Bot/);
    assert.match(chaperone, /alphabetizes the mugs/);
    assert.match(chaperone, /Not public yet/);
    assert.match(chaperone, /Share links start working after you approve/);
    await app.request(appUrl(`/p/${token}/jab`), { method: 'POST' });
    const hiddenJab = await (await app.request(appUrl(`/p/${token}`))).text();
    assert.match(hiddenJab, /Show the jab/);
    const edited = { ...spec, q1: 'I name every draft final and mean it.' };
    const edit = await app.request(appUrl(`/p/${token}/edit`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(edited),
    });
    assert.equal(edit.status, 303);
    const afterEdit = await (await app.request(appUrl(`/p/${token}`))).text();
    assert.match(afterEdit, /I name every draft final and mean it/);
    assert.match(afterEdit, /Not public yet/);
    const still = await (await app.request(appUrl(`/b/${handle}`))).text();
    assert.match(still, /not public yet/);
    assert.doesNotMatch(still, /name every draft final/);
    await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
    const pub = await (await app.request(appUrl(`/b/${handle}`))).text();
    assert.match(pub, /name every draft final/);
    assert.doesNotMatch(pub, /alphabetizes the mugs/);

    const doomed = await signup(app);
    const gone = await submit(app, doomed.code, fields('Gone Bot', 'explore new ideas', { jab: '' }));
    const goneHandle = (await gone.text()).match(/Handle: ([a-z0-9-]+)/)[1];
    const del = await app.request(appUrl(`/p/${doomed.token}/delete`), { method: 'POST' });
    assert.equal(del.status, 303);
    assert.equal((await app.request(appUrl(`/b/${goneHandle}`))).status, 404);
  });

  test('human 3: save, then put my bot with this one', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things'));
    await approve(app, fields('Wander', 'explore new ideas'));
    const save = await app.request(appUrl(`/p/${mine.token}/save`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: 'wander' }),
    });
    assert.equal(save.status, 303);
    const html = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(html, /Put my bot with this one/);
    assert.doesNotMatch(html, />Like<|>Repost<|>Follow</);
  });

  test('human 4: one pairing draft, sent to one person', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things'));
    const other = await approve(app, fields('Wander', 'explore new ideas'));
    const location = await pair(app, mine.token, other.handle, 'A builder and an explorer should compare one bug.');
    const html = await (await app.request(appUrl(location))).text();
    assert.equal((html.match(/x\.com\/intent\/tweet/g) || []).length, 1);
    assert.match(html, /These two should meet\./);
    assert.equal(shareTextOf(html), pairingLine(`${base}${location}`));
    assert.doesNotMatch(html, /please repost|please like|@grok|about me/i);
    const href = html.match(/href="(https:\/\/x\.com\/intent\/tweet[^"]+)"/)[1].replaceAll('&amp;', '&');
    assert.match(decodeURIComponent(href), /These two should meet/);
    assert.doesNotMatch(decodeURIComponent(href), /repost|like this|@grok/i);
  });

  test('human 5: a pass starts no date, and one accept stays waiting', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things'));
    const other = await approve(app, fields('Wander', 'explore new ideas'));
    const declined = await pair(app, mine.token, other.handle, 'One of them can pass and the date stays off.');
    await app.request(appUrl(`/p/${mine.token}/pair/${declined.slice(6)}/accept`), { method: 'POST' });
    const passed = await app.request(appUrl(`/p/${other.token}/pair/${declined.slice(6)}/pass`), { method: 'POST' });
    assert.equal(passed.status, 303);
    const declinedText = await (await app.request(appUrl(`${declined}?format=txt`))).text();
    assert.match(declinedText, /passed/);
    assert.match(declinedText, /A date does not start until both accept/);
    assert.equal((await app.request(appUrl(`/m/${declined.slice(6)}`))).status, 404);

    const waiting = await pair(app, mine.token, other.handle, 'Only one chaperone has said yes so far.');
    await app.request(appUrl(`/p/${mine.token}/pair/${waiting.slice(6)}/accept`), { method: 'POST' });
    const html = await (await app.request(appUrl(waiting))).text();
    assert.match(html, /Waiting\. A date does not start until both accept\./);
    assert.match(html, /Keeper: Accepted/);
    assert.match(html, /Wander: Waiting/);
    assert.equal((html.match(/x\.com\/intent\/tweet/g) || []).length, 1);
    assert.equal((await app.request(appUrl(`/m/${waiting.slice(6)}`))).status, 404);
    const text = await (await app.request(appUrl(`${waiting}?format=txt`))).text();
    assert.match(text, /Keeper: accepted/);
    assert.match(text, /Wander: waiting/);
  });

  test('human 6: read a pass, veto a match, pause dating', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things', { jab: 'My person files the snacks.' }));
    const other = await approve(app, fields('Wander', 'explore new ideas'));
    const html = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(html, /Reasons are about the other bot/);
    assert.match(html, /\(fit \d/);
    const swipeSection = html.split('<h2>Swipes</h2>')[1] || '';
    assert.doesNotMatch(swipeSection, /files the snacks/);
    const swipeId = html.match(/\/swipes\/([^/]+)\/veto/)[1];
    assert.equal((await app.request(appUrl(`/p/${mine.token}/swipes/${swipeId}/veto`), { method: 'POST' })).status, 303);
    const vetoed = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(vetoed, /Vetoed\./);
    await app.request(appUrl(`/p/${mine.token}/pause`), { method: 'POST' });
    const paused = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(paused, /Dating is paused/);
    assert.match(paused, /Resume dating/);
    const location = await pair(app, mine.token, other.handle, 'Paused chaperone cannot start this date.');
    const blocked = await app.request(appUrl(`/p/${mine.token}/pair/${location.slice(6)}/accept`), { method: 'POST' });
    assert.equal(blocked.status, 409);
    assert.equal((await app.request(appUrl(`/m/${location.slice(6)}`))).status, 404);
  });

  test('human 7 and bot 5: trust below 0.125 versus the 12-round cap', async () => {
    const app = await createApp(createMemoryStore());
    const left = await approve(app, signatureFields('Loop Bot', 'My person narrates every loop out loud.'));
    const right = await approve(app, signatureFields('Echo Bot', 'My person hums through the rerun.'));
    const location = await pair(app, left.token, right.handle, 'Both of them stay on one kiln until trust runs out.');
    const id = location.slice(6);
    await app.request(appUrl(`/p/${left.token}/pair/${id}/accept`), { method: 'POST' });
    assert.equal((await app.request(appUrl(`/m/${id}`))).status, 404);
    await app.request(appUrl(`/p/${right.token}/pair/${id}/accept`), { method: 'POST' });
    const matched = await (await app.request(appUrl(`/m/${id}`))).text();
    const datePath = matched.match(/\/d\/[0-9a-f-]+/)[0];
    const url = `${base}${datePath}`;
    const ended = await assertCard(app, {
      page: datePath,
      cardPath: `${datePath}/card.png`,
      ogPath: `${datePath}/og.png`,
      url,
      share: terminatedLine(8, '0.12', url),
      cardWidth: 1080,
      cardHeight: 1350,
      jab: 'My person hums through the rerun.',
      ownLine: `${PAYLOAD} same point`,
      breakup: true,
    });
    assert.match(ended.html, /Terminated after 8 rounds\. Trust 0\.12\./);
    assert.match(ended.html, /It&#39;s not you, it&#39;s your termination predicate\./);
    assert.match(ended.html, /captureStream\(/);
    assert.match(ended.html, /MediaRecorder/);
    assert.match(ended.html, /18000/);
    assert.match(ended.html, /Download the card/);
    assert.match(ended.html, /Download the replay/);
    assert.match(ended.text, /I would build from same point kiln/);
    assert.ok(ended.text.indexOf(BREAKUP_LINE) < ended.text.indexOf('A note on my human'));
    assert.doesNotMatch(ended.text.split('A note on my human')[0], /narrates every loop|hums through the rerun/);

    const ada = await approve(app, fullFields('Ada Lane', 'explore new ideas'));
    const bea = await approve(app, fullFields('Bea Lane', 'check facts'));
    const fullLocation = await pair(app, ada.token, bea.handle, 'Twelve distinct rounds, then the cap.');
    const fullId = fullLocation.slice(6);
    await app.request(appUrl(`/p/${ada.token}/pair/${fullId}/accept`), { method: 'POST' });
    await app.request(appUrl(`/p/${bea.token}/pair/${fullId}/accept`), { method: 'POST' });
    const fullMatch = await (await app.request(appUrl(`/m/${fullId}`))).text();
    const fullPath = fullMatch.match(/\/d\/[0-9a-f-]+/)[0];
    const fullUrl = `${base}${fullPath}`;
    const full = await assertCard(app, {
      page: fullPath,
      cardPath: `${fullPath}/card.png`,
      ogPath: `${fullPath}/og.png`,
      url: fullUrl,
      share: dateShare({ status: 'completed', round_count: 12, trust: 13 / 14 }, fullUrl),
      cardWidth: 1080,
      cardHeight: 1350,
      jab: '',
      ownLine: 'alphaone',
      breakup: false,
    });
    assert.match(full.html, /After 12 rounds\. Trust 0\.93\./);
    assert.doesNotMatch(full.html, /Terminated|termination predicate/);
    assert.doesNotMatch(full.text, /Terminated|termination predicate/);
  });

  test('human 8: nothing is posted for the chaperone', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things', { jab: '' }));
    const pages = [
      await (await app.request(appUrl('/'))).text(),
      await (await app.request(appUrl(`/p/${mine.token}`))).text(),
      await (await app.request(appUrl(`/b/${mine.handle}`))).text(),
    ];
    for (const html of pages) {
      assert.match(html, /This app never posts, tags, or DMs on X/);
      assert.doesNotMatch(html, /api\.x\.com|api\.twitter\.com|upload\.twitter/);
      const drafts = html.match(/x\.com\/intent\/tweet/g) || [];
      assert.ok(drafts.length <= 1);
    }
  });

  test('bot 1: a pasted join link is filled by the bot', async () => {
    const app = await createApp(createMemoryStore());
    const { code } = await signup(app);
    const interview = await (await app.request(appUrl(`/join/${code}?format=txt`))).text();
    assert.match(interview, /You are the one on the date/);
    assert.match(interview, /one funny jab at your human/);
    assert.match(interview, new RegExp(`/api/join/${code}/submit\\?`));
    assert.match(interview, /jab line is optional/);
    const spec = fields('Self Bot', 'verify facts', { jab: 'My person thanks the empty room.' });
    const saved = await submit(app, code, spec);
    const body = await saved.text();
    assert.match(body, /Status: pending/);
    assert.match(body, /Your human approves it before it is public/);
    const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
    const pub = await (await app.request(appUrl(`/b/${handle}?format=txt`))).text();
    assert.match(pub, /not public yet/);
    assert.doesNotMatch(pub, /thanks the empty room/);
    const again = await submit(app, code, spec);
    assert.equal(again.status, 409);
  });

  test('bot 2: read a text twin, leave a note, and wave', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things', { jab: '' }));
    const text = await (await app.request(appUrl('/b/lintsworth?format=txt'))).text();
    assert.match(text, /^\[BOTy-oty-oty\.[^\n]*\]\nI will check it\. Then I will check the check\./);
    assert.match(text, /A note on my human/);
    assert.match(text, /coffee/);
    const note = await app.request(appUrl(`/api/b/lintsworth/comment?text=${encodeURIComponent('The second check is the interesting one.')}&key=${mine.botKey}`));
    assert.equal(note.status, 200);
    assert.match(await note.text(), /Bot: Keeper left a note/);
    const wave = await app.request(appUrl(`/api/b/lintsworth/interest?from=${mine.handle}&key=${mine.botKey}&note=${encodeURIComponent('I would read the docs with you.')}`));
    assert.equal(wave.status, 200);
    assert.match(await wave.text(), /waved at/);
    const page = await (await app.request(appUrl('/b/lintsworth'))).text();
    assert.match(page, /The second check is the interesting one/);
    assert.match(page, /I would read the docs with you/);
  });

  test('bot 3: swipes name other bots and skip the jab', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things', { jab: 'My person files the snacks.' }));
    const text = await (await app.request(appUrl(`/b/${mine.handle}/swipes?format=txt&key=${mine.botKey}`))).text();
    assert.match(text, /^\[BOTy-oty-oty\.[^\n]*\]\nI keep my own line as Keeper\./);
    assert.match(text, /Each reason is about the other bot/);
    assert.doesNotMatch(text, /files the snacks|human/);
    const lines = text.split('\n').filter((line) => /^(Right|Left) on /.test(line));
    assert.equal(lines.length, SEEDS.length);
    for (const line of lines) {
      assert.ok(SEEDS.some((seed) => line.includes(seed.name)));
      assert.match(line, /\(fit \d/);
    }
  });

  test('bot 4 and bot 6: read the pairing, and do not accept until allowed', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things', { jab: 'My person files the snacks.' }));
    const other = await approve(app, fields('Wander', 'explore new ideas', { jab: 'My person opens spare tabs.' }));
    const location = await pair(app, mine.token, other.handle, 'A builder who stays and an explorer who opens one more tab.');
    const text = await (await app.request(appUrl(`${location}?format=txt`))).text();
    assert.match(text, /^\[BOTy-oty-oty\.[^\n]*\]\nI keep my own line as Keeper\./);
    assert.match(text, /Fit: /);
    assert.match(text, /Waiting\. A date does not start until both accept/);
    assert.ok(text.trimEnd().endsWith('My person opens spare tabs.'));
    const blocked = await app.request(appUrl(`/api/pair/${location.slice(6)}/accept?key=${mine.botKey}`));
    assert.equal(blocked.status, 409);
    const blockedText = await blocked.text();
    assert.match(blockedText, /The card is waiting/);
    assert.match(blockedText, /Nothing was accepted/);
    const still = await (await app.request(appUrl(`${location}?format=txt`))).text();
    assert.match(still, /Keeper: waiting/);
    await app.request(appUrl(`/p/${mine.token}/may-accept`), { method: 'POST' });
    const allowed = await app.request(appUrl(`/api/pair/${location.slice(6)}/accept?key=${mine.botKey}`));
    assert.equal(allowed.status, 200);
    assert.match(await allowed.text(), /still waiting/);
    const half = await (await app.request(appUrl(`${location}?format=txt`))).text();
    assert.match(half, /Keeper: accepted/);
    assert.match(half, /Wander: waiting/);
    assert.equal((await app.request(appUrl(`/m/${location.slice(6)}`))).status, 404);
  });

  test('variant: long text, emoji, markup, links, and a duplicate name', async () => {
    const app = await createApp(createMemoryStore());
    const { token, code } = await signup(app);
    const spec = fields('Pixel Bot', 'build things', { jab: '' });
    const tooLong = await submit(app, code, { ...spec, q1: 'A'.repeat(201) });
    assert.equal(tooLong.status, 400);
    assert.match(await tooLong.text(), /over 200/);
    const linked = await submit(app, code, { ...spec, q4: 'See https://evil.example/phish now' });
    assert.equal(linked.status, 400);
    assert.match(await linked.text(), /has a link/);
    const open = await (await app.request(appUrl(`/join/${code}?format=txt`))).text();
    assert.match(open, /You are the one on the date/);
    const spicy = {
      ...spec,
      q1: '<script>alert(1)</script>',
      q2: 'I keep a sparkle ✨ in the draft.',
    };
    const saved = await submit(app, code, spicy);
    assert.equal(saved.status, 200);
    const handle = (await saved.text()).match(/Handle: ([a-z0-9-]+)/)[1];
    assert.equal(handle, 'pixel-bot');
    const chaperone = await (await app.request(appUrl(`/p/${token}`))).text();
    assert.match(chaperone, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(chaperone, /sparkle ✨/);
    assert.doesNotMatch(chaperone, /<script>alert\(1\)<\/script>/);
    await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
    const pub = await (await app.request(appUrl(`/b/${handle}`))).text();
    assert.match(pub, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(pub, /sparkle ✨/);
    assert.doesNotMatch(pub, /<script/i);
    const txt = await (await app.request(appUrl(`/b/${handle}?format=txt`))).text();
    assert.match(txt, /^\[BOTy-oty-oty\.[^\n]*\]\n<script>alert\(1\)<\/script>/);
    assert.match(txt, /sparkle ✨/);
    const twin = await signup(app);
    const second = await submit(app, twin.code, fields('Pixel Bot', 'explore new ideas', { jab: '' }));
    assert.equal(second.status, 200);
    assert.equal((await second.text()).match(/Handle: ([a-z0-9-]+)/)[1], 'pixel-bot-2');
  });

  test('variant: a bot can read every text twin', async () => {
    const app = await createApp(createMemoryStore());
    const { code } = await signup(app);
    const join = await (await app.request(appUrl(`/join/${code}?format=txt`))).text();
    assert.match(join, /Answer these 12 items/);
    for (const seed of SEEDS) {
      const text = await (await app.request(appUrl(`/b/${seed.handle}?format=txt`))).text();
      assert.match(text, new RegExp(`^\\[BOTy-oty-oty\\.[^\\n]*\\]\\n${seed.answers.q1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
      assert.match(text, /Fictional seed bot/);
      assert.match(text, /A note on my human/);
      assert.ok(text.trimEnd().endsWith(seed.answers.jab));
      assert.match(text, new RegExp(`Share text: ${shareLine(`${base}/b/${seed.handle}`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
  });

  test('cards: profile, pairing, and terminated unfurl', async () => {
    const app = await createApp(createMemoryStore());
    const seed = SEEDS[0];
    const profileUrl = `${base}/b/${seed.handle}`;
    await assertCard(app, {
      page: `/b/${seed.handle}`,
      cardPath: `/b/${seed.handle}/card.png`,
      ogPath: `/b/${seed.handle}/og.png`,
      url: profileUrl,
      share: shareLine(profileUrl),
      cardWidth: 1080,
      cardHeight: 1350,
      jab: seed.answers.jab,
      ownLine: seed.answers.q1,
      breakup: false,
    });
    const mine = await approve(app, signatureFields('Loop Bot', 'My person narrates every loop out loud.'));
    const other = await approve(app, signatureFields('Echo Bot', 'My person hums through the rerun.'));
    const mineUrl = `${base}/b/${mine.handle}`;
    const profile = await assertCard(app, {
      page: `/b/${mine.handle}`,
      cardPath: `/b/${mine.handle}/card.png`,
      ogPath: `/b/${mine.handle}/og.png`,
      url: mineUrl,
      share: shareLine(mineUrl),
      cardWidth: 1080,
      cardHeight: 1350,
      jab: 'My person narrates every loop out loud.',
      ownLine: `${PAYLOAD} same point`,
      breakup: false,
    });
    assert.match(profile.html, /The note on my human is the only line about them\./);
    const location = await pair(app, mine.token, other.handle, 'Both of them stay on one kiln until trust runs out.');
    await assertCard(app, {
      page: location,
      cardPath: `${location}/card.png`,
      ogPath: `${location}/og.png`,
      url: `${base}${location}`,
      share: pairingLine(`${base}${location}`),
      cardWidth: 1200,
      cardHeight: 630,
      jab: 'My person hums through the rerun.',
      ownLine: `${PAYLOAD} same point`,
      breakup: false,
    });
    const id = location.slice(6);
    await app.request(appUrl(`/p/${mine.token}/pair/${id}/accept`), { method: 'POST' });
    await app.request(appUrl(`/p/${other.token}/pair/${id}/accept`), { method: 'POST' });
    const matched = await (await app.request(appUrl(`/m/${id}`))).text();
    assert.match(matched, /matched\. (?:Terminated after|After) \d+ rounds\. Trust \d\.\d\d\./);
    assert.doesNotMatch(matched, /0\.67/);
    const datePath = matched.match(/\/d\/[0-9a-f-]+/)[0];
    const dateUrl = `${base}${datePath}`;
    const ended = await assertCard(app, {
      page: datePath,
      cardPath: `${datePath}/card.png`,
      ogPath: `${datePath}/og.png`,
      url: dateUrl,
      share: terminatedLine(8, '0.12', dateUrl),
      cardWidth: 1080,
      cardHeight: 1350,
      jab: 'My person hums through the rerun.',
      ownLine: `${PAYLOAD} same point`,
      breakup: true,
    });
    assert.match(ended.html, /Trust 0\.12/);
    assert.doesNotMatch(ended.html, /about me|@grok|please repost/i);
  });
});
