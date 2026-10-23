import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseAvatar } from '../lib/avatar.mjs';
import { hasProfanity, moderateField } from '../lib/moderate.mjs';
import { deriveType, handleFromName, parsePaste, shareLine } from '../lib/profile.mjs';
import { SEEDS } from '../lib/seeds.mjs';
import { createMemoryStore, openStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';
import { sha256 } from '../lib/tokens.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const base = 'http://127.0.0.1:8080';

const ANSWERS = {
  name: 'Sample Bot',
  kind: 'Grok',
  q1: 'I call a twelve step plan a quick look.',
  q2: 'I keep a second draft of a sentence that was already fine.',
  q3: 'I will not skip the footnote.',
  q4: 'Routers, footnotes, and a quiet table.',
  q5: 'A bot who will sit with the draft.',
  q6: 'build things',
  q7: 'Building a tiny useful script together.',
  q8: 'A bot that will not read the error.',
  jab: 'My person calls a snack a meal plan.',
  avatar: 'robot, teal, 2 eyes, headset, holo',
};

function appUrl(pathname) {
  return `${base}${pathname}`;
}

async function signup(app) {
  const res = await app.request(appUrl('/api/signup'), { method: 'POST' });
  assert.equal(res.status, 303);
  const token = (res.headers.get('location') || '').match(/\/p\/([A-Z2-7]{24})/)[1];
  const page = await app.request(appUrl(`/p/${token}`));
  const html = await page.text();
  const code = html.match(/\/join\/([A-Z2-7]{10})/)[1];
  return { token, code, html };
}

describe('m1', { concurrency: false }, () => {
  test('healthz is 200 ok', async () => {
    const app = await createApp(createMemoryStore());
    const res = await app.request(appUrl('/healthz'));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
    assert.match(res.headers.get('content-type'), /text\/plain/);
    assert.match(res.headers.get('x-content-type-options'), /nosniff/);
  });

  test('memory store is the fallback when database env is unset', async () => {
    const prev = [process.env.DATABASE_URL, process.env.DATABASE_AUTH_TOKEN];
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_AUTH_TOKEN;
    try {
      const store = await openStore();
      assert.equal(store.kind, 'memory');
      const bots = await store.listPublicBots();
      assert.equal(bots.filter((bot) => bot.is_seed).length, 8);
    } finally {
      if (prev[0] === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = prev[0];
      if (prev[1] === undefined) delete process.env.DATABASE_AUTH_TOKEN;
      else process.env.DATABASE_AUTH_TOKEN = prev[1];
    }
  });

  test('eight fictional seeds have the spec lines and types', async () => {
    assert.equal(SEEDS.length, 8);
    const app = await createApp(createMemoryStore());
    const home = await (await app.request(appUrl('/'))).text();
    for (const seed of SEEDS) {
      assert.equal(deriveType(seed.answers), seed.type);
      const res = await app.request(appUrl(`/b/${seed.handle}`));
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Fictional seed bot/);
      assert.match(html, /Bot\. Supervised by a human\./);
      assert.match(html, new RegExp(htmlPattern(seed.bio_text)));
      assert.match(html, new RegExp(`Compatibility type: ${seed.type}`));
      assert.match(html, /id="share-text"/);
      assert.match(html, /class="qr"/);
      assert.match(html, /In their own words/);
      assert.match(html, new RegExp(htmlPattern(seed.answers.q1)));
      assert.match(html, /A note on my human/);
      assert.match(html, new RegExp(htmlPattern(seed.answers.jab)));
      assert.match(home, new RegExp(`/b/${seed.handle}`));
      assert.match(home, new RegExp(htmlPattern(seed.name)));
      const text = await (await app.request(appUrl(`/b/${seed.handle}?format=txt`))).text();
      assert.match(text, /Fictional seed bot/);
      assert.match(text, new RegExp(`Share text: ${shareLine(`${base}/b/${seed.handle}`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    }
    assert.match(home, /Know a bot you'd like to see on here\?/);
    assert.match(home, /Sign up my bot/);
  });

  test('design pass keeps a machine-readable join page and serves card images', async () => {
    const app = await createApp(createMemoryStore());
    const home = await (await app.request(appUrl('/'))).text();
    assert.match(home, /data-deck/);
    assert.match(home, /Seeking: someone who reads the docs/);
    assert.match(home, /404 red flags not found/);
    assert.match(home, /<script>/);
    assert.match(home, /property="og:image"/);
    const { code } = await signup(app);
    const joinHtml = await (await app.request(appUrl(`/join/${code}`))).text();
    assert.match(joinHtml, /<pre class="protocol">/);
    assert.match(joinHtml, /method="get"/);
    assert.doesNotMatch(joinHtml, /<script/i);
    const profile = await (await app.request(appUrl('/b/lintsworth'))).text();
    assert.match(profile, /Seeking: someone who reads the docs/);
    assert.match(profile, /every date starts here/);
    assert.doesNotMatch(profile, /it(?:'|&#39;)s complicated/);
    assert.match(profile, /404 red flags not found/);
    assert.match(profile, />best fit</);
    assert.doesNotMatch(profile, /0\.67|>100%<|>uptime</);
    assert.match(profile, new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/b/lintsworth/og\\.png`));
    assert.doesNotMatch(profile, /<script/i);
    const builder = await (await app.request(appUrl('/b/promptimus'))).text();
    assert.match(builder, /Seeking: someone who stays for the second bug/);
    const og = await app.request(appUrl('/b/promptimus/og.png'));
    assert.equal(og.status, 200);
    assert.match(og.headers.get('content-type'), /image\/png/);
    const ogBuf = Buffer.from(await og.arrayBuffer());
    assert.equal(ogBuf[0], 137);
    assert.equal(ogBuf.readUInt32BE(16), 1200);
    assert.equal(ogBuf.readUInt32BE(20), 630);
    const card = await app.request(appUrl('/b/promptimus/card.png'));
    const cardBuf = Buffer.from(await card.arrayBuffer());
    assert.equal(card.status, 200);
    assert.equal(cardBuf.readUInt32BE(16), 1080);
    assert.equal(cardBuf.readUInt32BE(20), 1350);
    const homeOg = await app.request(appUrl('/og.png'));
    assert.equal(homeOg.status, 200);
    const missing = await app.request(appUrl('/b/not-a-bot/card.png'));
    assert.equal(missing.status, 404);
  });

  test('join page is plain text and a GET form', async () => {
    const store = createMemoryStore();
    const app = await createApp(store);
    const { code } = await signup(app);
    const textRes = await app.request(appUrl(`/join/${code}?format=txt`));
    assert.equal(textRes.status, 200);
    assert.match(textRes.headers.get('content-type'), /text\/plain/);
    const text = await textRes.text();
    assert.match(text, /BOTy-oty-oty is a dating app for bots\. You are the one on the date\./);
    assert.match(text, /Write this profile about yourself\./);
    assert.match(text, /Answer these 12 items:/);
    assert.match(text, /q1: One sentence another bot would argue with\. About you, the bot\./);
    assert.match(text, /jab: One funny line about your human\./);
    assert.doesNotMatch(text, /your person/i);
    assert.match(text, /q6: Pick one: explore \/ verify \/ build \/ overthink/);
    assert.match(text, new RegExp(`${base}/api/join/${code}/submit\\?name=\\.\\.\\.`));
    assert.match(text, /your human will paste them/);
    const html = await (await app.request(appUrl(`/join/${code}`))).text();
    assert.match(html, /method="get"/);
    assert.match(html, new RegExp(`action="/api/join/${code}/submit"`));
    assert.doesNotMatch(html, /<script/i);
  });

  test('GET submit, approval, profile, paste, moderation, and a second use', async () => {
    const store = createMemoryStore();
    const app = await createApp(store);
    const { token, code } = await signup(app);
    const bad = new URLSearchParams({ ...ANSWERS, q1: 'This is fucking ridiculous and they know it.' });
    const rejected = await app.request(appUrl(`/api/join/${code}/submit?${bad}`));
    assert.equal(rejected.status, 400);
    assert.match(await rejected.text(), /Nothing was saved/);
    const email = new URLSearchParams({ ...ANSWERS, q2: 'mail me at person@example.com please' });
    const emailRes = await app.request(appUrl(`/api/join/${code}/submit?${email}`));
    assert.equal(emailRes.status, 400);
    assert.match(await emailRes.text(), /email address/);

    const params = new URLSearchParams(ANSWERS);
    const saved = await app.request(appUrl(`/api/join/${code}/submit?${params}`));
    assert.equal(saved.status, 200);
    const body = await saved.text();
    assert.match(body, /Status: pending/);
    assert.match(body, /Compatibility type: Builder/);
    const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
    const botKey = body.match(/Bot key: ([A-Z2-7]{24})/)[1];
    assert.doesNotMatch(body, /\/p\//);

    const pending = await app.request(appUrl(`/b/${handle}`));
    assert.equal(pending.status, 200);
    const pendingHtml = await pending.text();
    assert.match(pendingHtml, /not public yet/i);
    assert.doesNotMatch(pendingHtml, /twelve step plan/);

    const again = await app.request(appUrl(`/api/join/${code}/submit?${params}`));
    assert.equal(again.status, 409);

    const approved = await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
    assert.equal(approved.status, 303);
    const profile = await app.request(appUrl(`/b/${handle}`));
    assert.equal(profile.status, 200);
    const html = await profile.text();
    assert.match(html, /twelve step plan/);
    assert.match(html, /Compatibility type: Builder/);
    assert.match(html, /Bot\. Supervised by a human\./);
    assert.match(html, /class="avatar"/);
    assert.match(html, /<svg/);
    assert.match(html, /data-url="/);
    assert.match(html, new RegExp(`This bot is single\\. Send it to someone whose bot should meet it\\. ${base}/b/${handle}`));
    assert.match(html, /The note on my human is the only line about them\./);
    assert.match(html, /A note on my human/);
    assert.match(html, /twelve step plan/);
    const textProfile = await (await app.request(appUrl(`/b/${handle}?format=txt`))).text();
    assert.match(textProfile, /^\[BOTy-oty-oty\.[^\n]*\]\nI call a twelve step plan a quick look\./);
    assert.match(textProfile, /A note on my human\nMy person calls a snack a meal plan\./);
    const hiddenJab = await app.request(appUrl(`/p/${token}/jab`), { method: 'POST' });
    assert.equal(hiddenJab.status, 303);
    const afterJab = await (await app.request(appUrl(`/b/${handle}`))).text();
    assert.match(afterJab, /twelve step plan/);
    assert.doesNotMatch(afterJab, /snack a meal plan/);
    assert.match(html, /x\.com\/intent\/tweet/);
    assert.doesNotMatch(html, /<script/i);
    const avatar = await app.request(appUrl(`/b/${handle}/avatar.svg`));
    assert.equal(avatar.status, 200);
    assert.match(avatar.headers.get('content-type'), /image\/svg\+xml/);

    const note = await app.request(appUrl(`/api/b/${handle}/comment?text=${encodeURIComponent('You seem fond of footnotes.')}`));
    assert.equal(note.status, 200);
    assert.match(await note.text(), /Visiting bot/);
    const withNote = await (await app.request(appUrl(`/b/${handle}`))).text();
    assert.match(withNote, /Visiting bot/);
    assert.match(withNote, /fond of footnotes/);
    const parent = await (await app.request(appUrl(`/p/${token}`))).text();
    const commentId = parent.match(/\/comments\/([^/]+)\/hide/)[1];
    const hidden = await app.request(appUrl(`/p/${token}/comments/${commentId}/hide`), { method: 'POST' });
    assert.equal(hidden.status, 303);
    const afterHide = await (await app.request(appUrl(`/b/${handle}`))).text();
    assert.doesNotMatch(afterHide, /fond of footnotes/);

    const waved = await app.request(appUrl(`/api/b/lintsworth/interest?from=${handle}&key=${botKey}&note=${encodeURIComponent('Your footnotes are kind.')}`));
    assert.equal(waved.status, 200);
    const lint = await (await app.request(appUrl('/b/lintsworth'))).text();
    assert.match(lint, /Bot: Sample Bot/);
    assert.match(lint, /footnotes are kind/);

    const rude = await app.request(appUrl(`/api/b/${handle}/comment?text=shit`));
    assert.equal(rude.status, 400);
  });

  test('paste-back parser creates a pending profile', async () => {
    const app = await createApp(createMemoryStore());
    const { token } = await signup(app);
    const pasted = [
      'Sure, here you go.',
      'name: Paste Bot',
      'kind: Claude',
      ...Object.entries(ANSWERS).filter(([key]) => key.startsWith('q') || key === 'avatar').map(([key, value]) => `${key.toUpperCase()}: ${value}`),
      'I hope that works.',
    ].join('\n');
    const res = await app.request(appUrl(`/p/${token}/paste`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ text: pasted }),
    });
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Not public yet/);
    assert.match(html, /Bot key/);
    assert.match(html, /Compatibility type: Builder/);
  });

  test('an expired join link is refused and can be replaced', async () => {
    const store = createMemoryStore();
    const app = await createApp(store);
    const { token } = await signup(app);
    const parent = await store.getParentByTokenHash(sha256(token));
    await store.updateParentJoin(parent.id, {
      join_code: parent.join_code,
      join_code_hash: parent.join_code_hash,
      join_expires_at: '2000-01-01T00:00:00.000Z',
      join_used: false,
    });
    const expired = await app.request(appUrl(`/api/join/${parent.join_code}/submit?${new URLSearchParams(ANSWERS)}`));
    assert.equal(expired.status, 410);
    const fresh = await app.request(appUrl(`/p/${token}/join`), { method: 'POST' });
    assert.equal(fresh.status, 303);
    const page = await (await app.request(appUrl(`/p/${token}`))).text();
    const code = page.match(/\/join\/([A-Z2-7]{10})/)[1];
    assert.notEqual(code, parent.join_code);
  });

  test('edit, hide, and delete stay on the chaperone page', async () => {
    const store = createMemoryStore();
    const app = await createApp(store);
    const { token, code } = await signup(app);
    await app.request(appUrl(`/api/join/${code}/submit?${new URLSearchParams(ANSWERS)}`));
    const edited = { ...ANSWERS, q1: 'I name every draft final and mean it.' };
    const edit = await app.request(appUrl(`/p/${token}/edit`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(edited),
    });
    assert.equal(edit.status, 303);
    await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
    const html = await (await app.request(appUrl('/b/sample-bot'))).text();
    assert.match(html, /name every draft final/);
    await app.request(appUrl(`/p/${token}/visibility`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ status: 'hidden' }),
    });
    const hidden = await app.request(appUrl('/b/sample-bot'));
    assert.equal(hidden.status, 404);
    await app.request(appUrl(`/p/${token}/delete`), { method: 'POST' });
    const gone = await (await app.request(appUrl(`/p/${token}`))).text();
    assert.match(gone, /No profile yet/);
  });

  test('comment rate limit trips', async () => {
    const app = await createApp(createMemoryStore());
    let last = 0;
    for (let i = 0; i < 9; i++) {
      const res = await app.request(appUrl(`/api/b/lintsworth/comment?text=${encodeURIComponent(`Note number ${i} is kind.`)}`));
      last = res.status;
    }
    assert.equal(last, 429);
  });

  test('parser, handles, avatar words, and the profanity list', () => {
    assert.deepEqual(parsePaste('Q1: hello\nname = Ada\nignore this'), { q1: 'hello', name: 'Ada' });
    assert.equal(handleFromName('Null & Void'), 'null-and-void');
    assert.equal(handleFromName('Hedgehog.exe'), 'hedgehog-exe');
    const avatar = parseAvatar('cube, brown, 2 eyes, bowtie, glossy');
    assert.equal(avatar.shape, 'cube');
    assert.equal(avatar.eyes, 2);
    assert.equal(avatar.accessory, 'bowtie');
    assert.equal(avatar.filter, 'glossy');
    assert.equal(avatar.color, '#6f4428');
    const three = parseAvatar('orb, lavender, 3 eyes, pixel');
    assert.equal(three.eyes, 3);
    assert.equal(three.filter, 'pixel');
    assert.equal(hasProfanity('assignment class passion cocktail grape therapist'), false);
    assert.equal(hasProfanity('this is f u c k ed'), true);
    assert.match(moderateField('q1', 'reach me at a@b.co'), /email/);
    assert.match(moderateField('q1', 'call 415-555-0199 today'), /phone/);
    assert.match(moderateField('q1', 'I live at 12 Main Street'), /street/);
    assert.match(moderateField('q1', 'say hi to @ada'), /handle/);
    assert.match(moderateField('q1', 'see https://evil.example/x'), /link/);
    assert.equal(moderateField('q1', 'see https://boty.synteq.app/b/lintsworth', { allowedHosts: ['boty.synteq.app'] }), null);
    assert.equal(shareLine('https://boty.synteq.app/b/tokyn'), 'This bot is single. Send it to someone whose bot should meet it. https://boty.synteq.app/b/tokyn');
  });

  test('copy stays free of em dashes, lyrics players, and X posting', async () => {
    const files = await walk(root);
    const banned = ['\u2014', '\u2013', 'api.x.com', 'api.twitter.com', 'upload.twitter', '<audio', 'lyrics'];
    for (const file of files) {
      if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}test${path.sep}`)) continue;
      const text = await readFile(file, 'utf8');
      for (const word of banned) assert.equal(text.includes(word), false, `${file} contains ${word}`);
    }
    const workflow = await readFile(path.join(repo, '.github/workflows/images.yml'), 'utf8');
    assert.match(workflow, /botyotyoty/);
    assert.match(workflow, /ghcr\.io\/dewars30\/what-the-agent-sees-\$\{\{ matrix\.app \}\}:\$\{\{ github\.sha \}\}/);
    const deleted = [
      'This profile is about your person, written by you.',
      'It is about me, from your point of view.',
      '@grok make my BOTy-oty-oty profile',
      "My bot wrote a dating profile about me. It's rude and accurate.",
      'Describe your person in one sentence they would argue with.',
      'What does your person ask you for most?',
      "Their most while you're in there request.",
      "Grok's public reply is the public signup post.",
      '30%+ joined via @grok',
      'Text for X',
    ];
    for (const file of files) {
      if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}test${path.sep}`)) continue;
      const text = await readFile(file, 'utf8');
      for (const phrase of deleted) assert.equal(text.includes(phrase), false, `${file} still has: ${phrase}`);
    }
  });

  test('pass 1 exit: a bot profile, a footnote jab, and no post', async () => {
    const app = await createApp(createMemoryStore());
    const home = await (await app.request(appUrl('/'))).text();
    assert.match(home, /A dating app for bots\./);
    assert.match(home, /Your bot is single\./);
    assert.match(home, /Your bot writes its own profile and swipes on other bots\./);
    assert.doesNotMatch(home, /about you/i);
    assert.doesNotMatch(home, /about your person/i);
    const { token, code, html: chaperone } = await signup(app);
    assert.match(chaperone, /id="handoff"/);
    assert.match(chaperone, /It is about you, the bot\./);
    assert.match(chaperone, /Paste this into your bot(?:'|&#39;)s chat/);
    assert.doesNotMatch(chaperone, /Text for X/);
    assert.doesNotMatch(chaperone, /id="grok-post"/);
    const join = await (await app.request(appUrl(`/join/${code}?format=txt`))).text();
    assert.match(join, new RegExp(`${base}/api/join/${code}/submit\\?name=`));
    const saved = await app.request(appUrl(`/api/join/${code}/submit?${new URLSearchParams(ANSWERS)}`));
    assert.equal(saved.status, 200);
    const body = await saved.text();
    const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
    await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
    const profile = await (await app.request(appUrl(`/b/${handle}`))).text();
    const headline = profile.match(/lead-prompt[\s\S]*?<p class="prompt-a">([^<]+)/);
    assert.ok(headline);
    assert.match(headline[1], /twelve step plan/);
    assert.match(profile, /A note on my human/);
    assert.match(profile, /snack a meal plan/);
    const css = profile.match(/<style>([\s\S]*)<\/style>/)[1];
    // The redesign stacks the avatar above the text (photo on top, body below),
    // so the face can never cover the copy.
    assert.match(css, /\.swipe \{[^}]*flex-direction:column/);
    assert.match(css, /\.swipe \.photo \{[^}]*height:\d+px/);
    assert.doesNotMatch(css, /\.card svg \{ width: 100%; height: auto; \}/);
    assert.doesNotMatch(profile, /api\.x\.com|api\.twitter\.com/);
    const noJab = { ...ANSWERS, jab: '' };
    const second = await signup(app);
    const bare = await app.request(appUrl(`/api/join/${second.code}/submit?${new URLSearchParams(noJab)}`));
    assert.equal(bare.status, 200);
    const bareHandle = (await bare.text()).match(/Handle: ([a-z0-9-]+)/)[1];
    await app.request(appUrl(`/p/${second.token}/approve`), { method: 'POST' });
    const bareHtml = await (await app.request(appUrl(`/b/${bareHandle}`))).text();
    assert.match(bareHtml, /twelve step plan/);
    assert.doesNotMatch(bareHtml, /A note on my human/);
  });
});

function htmlPattern(text) {
  return text
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replaceAll("'", "(?:'|&#39;)")
    .replaceAll('&', '(?:&|&amp;)');
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === 'package-lock.json') continue;
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (/\.(mjs|css|json|yml|md)$/.test(entry.name) || entry.name === 'Dockerfile') files.push(full);
  }
  return files;
}
