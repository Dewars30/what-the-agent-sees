import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { centeredTextIsPainted, urlIsPainted } from '../lib/cardpng.mjs';
import { BREAKUP_LINE, dateLine, runDate } from '../lib/date.mjs';
import { trustValue } from '../lib/trust.mjs';
import { createMemoryStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';

const base = 'http://127.0.0.1:8080';

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
    jab: extra.jab || '',
    avatar: 'orb, teal, 2 eyes, halo, glossy',
  };
}

const LOOP = {
  name: 'Loop Bot',
  kind: 'Grok',
  q1: 'I will say the same point again.',
  q2: 'I will say the same point again.',
  q3: 'I will say the same point again.',
  q4: 'I will say the same point again.',
  q5: 'I will say the same point again.',
  q6: 'build things',
  q7: 'I will say the same point again.',
  q8: 'I will say the same point again.',
  jab: 'My person narrates every loop out loud.',
  avatar: 'cube, brown, 2 eyes, bowtie, glossy',
};

async function signup(app) {
  const res = await app.request(appUrl('/api/signup'), { method: 'POST' });
  const token = (res.headers.get('location') || '').match(/\/p\/([A-Z2-7]{24})/)[1];
  const html = await (await app.request(appUrl(`/p/${token}`))).text();
  const code = html.match(/\/join\/([A-Z2-7]{10})/)[1];
  return { token, code };
}

async function approve(app, spec) {
  const { token, code } = await signup(app);
  const saved = await app.request(appUrl(`/api/join/${code}/submit?${new URLSearchParams(spec)}`));
  const body = await saved.text();
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
  return res.headers.get('location');
}

describe('pass 3', { concurrency: false }, () => {
  test('trust math, the cap, and lines that are not a roast', () => {
    assert.equal(trustValue(0, 0), 0.5);
    let alpha = 0;
    let beta = 0;
    for (let i = 0; i < 7; i++) {
      alpha *= 0.7;
      beta += 1;
    }
    assert.ok(trustValue(alpha, beta) < 0.125);
    assert.equal(trustValue(alpha, beta).toFixed(2), '0.11');
    const loop = runDate(
      { type: 'Builder', name: 'Loop', answers: LOOP },
      { type: 'Explorer', name: 'Echo', answers: { ...LOOP, q6: 'explore new ideas' } },
    );
    assert.equal(loop.status, 'terminated');
    assert.equal(loop.round_count, 7);
    assert.ok(loop.trust < 0.125);
    assert.equal(loop.trust.toFixed(2), '0.11');
    const payload = 'amber falcon marble granite pebble quartz vessel lantern cedar willow orchid maple';
    const signature = {
      q1: `${payload} same point`,
      q2: 'same point again here',
      q3: 'same point on the limit',
      q4: 'same point kiln',
      q5: payload,
      q6: 'build things',
      q7: 'same point date',
      q8: 'same point deal',
    };
    const signed = runDate(
      { type: 'Builder', name: 'Loop', answers: signature },
      { type: 'Builder', name: 'Echo', answers: signature },
    );
    assert.equal(signed.rounds.map((round) => (round.productive ? 'P' : 'U')).join(''), 'UPUUUUUU');
    assert.equal(signed.status, 'terminated');
    assert.equal(signed.round_count, 8);
    assert.ok(signed.trust < 0.125);
    assert.equal(signed.trust.toFixed(2), '0.12');
    const variedA = {
      type: 'Explorer',
      name: 'Ada',
      answers: { q1: 'alphaone', q2: 'betatwo', q3: 'gammthree', q4: 'deltfour', q5: 'epsifive', q6: 'zetasix', q7: 'etatseven', q8: 'theteight' },
    };
    const variedB = {
      type: 'Verifier',
      name: 'Bea',
      answers: { q1: 'ionone', q2: 'iotwo', q3: 'iothree', q4: 'iofour', q5: 'iofive', q6: 'iosix', q7: 'ioseven', q8: 'ioeight' },
    };
    const full = runDate(variedA, variedB);
    assert.equal(full.round_count, 12);
    assert.ok(full.trust >= 0.5);
    assert.equal(full.status, 'completed');
    for (let i = 0; i < 12; i++) {
      const line = dateLine({ type: 'Builder', answers: { ...variedA.answers, jab: 'My person roasts the coffee' } }, i);
      assert.doesNotMatch(line, /My person|coffee|human/i);
    }
  });

  test('pass 3 exit: a date can fall below 0.125 and the card downloads', async () => {
    const store = createMemoryStore();
    const app = await createApp(store);
    const payload = 'amber falcon marble granite pebble quartz vessel lantern cedar willow orchid maple';
    const signature = {
      q1: `${payload} same point`,
      q2: 'same point again here',
      q3: 'same point on the limit',
      q4: 'same point kiln',
      q5: payload,
      q6: 'build things',
      q7: 'same point date',
      q8: 'same point deal',
      kind: 'Grok',
      avatar: 'cube, brown, 2 eyes, bowtie, glossy',
    };
    const left = await approve(app, { ...signature, name: 'Loop Bot', jab: 'My person narrates every loop out loud.' });
    const right = await approve(app, { ...signature, name: 'Echo Bot', jab: 'My person hums through the rerun.' });
    const location = await pair(app, left.token, right.handle, 'Both of them stay on one sentence until it breaks.');
    const id = location.slice(6);
    await app.request(appUrl(`/p/${left.token}/pair/${id}/accept`), { method: 'POST' });
    const early = await (await app.request(appUrl(`/pair/${id}?format=txt`))).text();
    assert.match(early, /waiting/);
    assert.match(early, /A date does not start until both accept/);
    assert.equal((await app.request(appUrl('/d/not-a-date'))).status, 404);
    const parent = await store.getParentByTokenHash((await import('../lib/tokens.mjs')).sha256(left.token));
    const bot = await store.getBotByParentId(parent.id);
    const pairings = await store.listPairingsForBot(bot.id);
    assert.equal(await store.getDateByPairing(pairings.at(-1).id), null);

    await app.request(appUrl(`/p/${right.token}/pair/${id}/accept`), { method: 'POST' });
    const matched = await (await app.request(appUrl(`/m/${id}`))).text();
    const datePath = matched.match(/\/d\/[0-9a-f-]+/)[0];
    const page = await app.request(appUrl(datePath));
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Terminated after 8 rounds\. Trust 0\.12\./);
    assert.match(html, /class="qr"/);
    assert.match(html, /It&#39;s not you, it&#39;s your termination predicate\./);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:description"/);
    assert.match(html, /property="og:image"/);
    assert.match(html, /captureStream\(/);
    assert.match(html, /MediaRecorder/);
    assert.match(html, /18000/);
    assert.match(html, /id="share-text"/);
    assert.match(html, /someone whose bot talks in circles/);
    assert.doesNotMatch(html, /about me|@grok|please repost|please like/i);
    assert.doesNotMatch(html, /narrates every loop|hums through the rerun/);
    const text = await (await app.request(appUrl(`${datePath}?format=txt`))).text();
    assert.match(text, /^\[BOTy-oty-oty\.[^\n]*\]\namber falcon marble granite pebble quartz vessel lantern cedar willow orchid maple same point/);
    assert.match(text, /A note on my human/);
    assert.ok(text.indexOf('A note on my human') > text.indexOf(BREAKUP_LINE));
    const png = await app.request(appUrl(`${datePath}/card.png`));
    const buf = Buffer.from(await png.arrayBuffer());
    assert.equal(png.status, 200);
    assert.match(png.headers.get('content-type'), /image\/png/);
    assert.equal(buf[0], 137);
    assert.equal(buf.readUInt32BE(16), 1080);
    assert.equal(buf.readUInt32BE(20), 1350);
    assert.ok(buf.includes(Buffer.from(`${base}${datePath}`)));
    assert.equal(urlIsPainted(buf, `${base}${datePath}`), true);
    assert.equal(centeredTextIsPainted(buf, 'ITS NOT YOU, ITS YOUR TERMINATION PREDICATE', { color: [246, 239, 232], maxChars: 52 }), true);
    const og = Buffer.from(await (await app.request(appUrl(`${datePath}/og.png`))).arrayBuffer());
    assert.equal(og.readUInt32BE(16), 1200);
    assert.equal(og.readUInt32BE(20), 630);
    assert.ok(og.includes(Buffer.from(`${base}${datePath}`)));
    assert.equal(urlIsPainted(og, `${base}${datePath}`), true);
  });

  test('human stories: veto, pause, and no date on a pass', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, fields('Keeper', 'build things', { jab: 'My person files the snacks.' }));
    const other = await approve(app, fields('Wander', 'explore new ideas'));
    const chaperone = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(chaperone, /Swipes/);
    assert.match(chaperone, /Why not\?|Type fit:|Interests overlap|Dealbreaker fits/);
    const swipeId = chaperone.match(/\/swipes\/([^/]+)\/veto/)[1];
    const veto = await app.request(appUrl(`/p/${mine.token}/swipes/${swipeId}/veto`), { method: 'POST' });
    assert.equal(veto.status, 303);
    const after = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(after, /Vetoed\./);
    await app.request(appUrl(`/p/${mine.token}/pause`), { method: 'POST' });
    const paused = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(paused, /Resume dating/);
    assert.match(paused, /Dating is paused/);
    const location = await pair(app, mine.token, other.handle, 'A builder and an explorer, if the chaperone allows the date.');
    const blocked = await app.request(appUrl(`/p/${mine.token}/pair/${location.slice(6)}/accept`), { method: 'POST' });
    assert.equal(blocked.status, 409);
    await app.request(appUrl(`/p/${mine.token}/pause`), { method: 'POST' });
    await app.request(appUrl(`/p/${mine.token}/pair/${location.slice(6)}/accept`), { method: 'POST' });
    await app.request(appUrl(`/p/${other.token}/pair/${location.slice(6)}/pass`), { method: 'POST' });
    const text = await (await app.request(appUrl(`${location}?format=txt`))).text();
    assert.match(text, /passed/);
    assert.equal((await app.request(appUrl(`/m/${location.slice(6)}`))).status, 404);
    const swipes = await (await app.request(appUrl(`/b/${mine.handle}/swipes?format=txt&key=${mine.botKey}`))).text();
    assert.doesNotMatch(swipes, /files the snacks/);
  });
});
