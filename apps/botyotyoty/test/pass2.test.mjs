import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ENTRY_POST_ID, pairingLine, shareLine, xIntent } from '../lib/profile.mjs';
import { keywordOverlap, swipeDecision, swipeScore } from '../lib/trust.mjs';
import { createMemoryStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';

const base = 'http://127.0.0.1:8080';

function appUrl(pathname) {
  return `${base}${pathname}`;
}

const BOT = {
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

const OTHER = {
  ...BOT,
  name: 'Other Bot',
  q1: 'I open one more tab and then the one after that.',
  q6: 'explore new ideas',
  jab: 'My person collects rare zucchini stickers.',
};

async function signup(app) {
  const res = await app.request(appUrl('/api/signup'), { method: 'POST' });
  const token = (res.headers.get('location') || '').match(/\/p\/([A-Z2-7]{24})/)[1];
  const html = await (await app.request(appUrl(`/p/${token}`))).text();
  const code = html.match(/\/join\/([A-Z2-7]{10})/)[1];
  return { token, code };
}

async function approve(app, fields) {
  const { token, code } = await signup(app);
  const saved = await app.request(appUrl(`/api/join/${code}/submit?${new URLSearchParams(fields)}`));
  const body = await saved.text();
  const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
  const botKey = body.match(/Bot key: ([A-Z2-7]{24})/)[1];
  await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
  return { token, handle, botKey };
}

describe('pass 2', { concurrency: false }, () => {
  test('jab is not a swipe signal', () => {
    const left = { type: 'Overthinker', name: 'A', answers: { q1: 'I am still on the first question.', q2: 'drafts', q3: 'maybe', q4: 'margins', q5: 'version', q6: 'think it over again', q7: 'comparing drafts', q8: 'first draft', jab: '' } };
    const right = { ...left, answers: { ...left.answers, jab: 'rare zucchini stickers and nothing else' } };
    const target = { type: 'Verifier', name: 'B', answers: { q1: 'I read the whole thing.', q2: 'sources', q3: 'unsourced', q4: 'footnotes', q5: 'citations', q6: 'check facts', q7: 'one claim', q8: 'rumor', jab: 'rare zucchini stickers and nothing else' } };
    assert.equal(swipeScore(left, target), swipeScore(right, target));
    assert.equal(keywordOverlap(left, target), keywordOverlap(right, target));
    const decision = swipeDecision(right, target);
    assert.doesNotMatch(decision.reason, /zucchini/);
    assert.doesNotMatch(decision.reason, /human/i);
    const same = swipeDecision(
      { type: 'Overthinker', name: 'One', answers: left.answers },
      { type: 'Overthinker', name: 'Two', answers: { ...left.answers, q1: 'Still turning it over.' } },
    );
    assert.equal(same.direction, 'left');
    assert.match(same.reason, /Why not\?/);
    assert.match(same.reason, /What instead\?/);
  });

  test('entry post id is empty and the draft still opens', () => {
    assert.equal(ENTRY_POST_ID, '');
    const open = xIntent('These two should meet. https://boty.synteq.app/pair/1');
    assert.match(open, /^https:\/\/x\.com\/intent\/tweet\?text=/);
    assert.doesNotMatch(open, /in_reply_to/);
    assert.match(xIntent('hello', '2112626108231254140'), /in_reply_to=2112626108231254140/);
  });

  test('pass 2 exit: pairing card, image url, text twin, no date early', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, BOT);
    const theirs = await approve(app, OTHER);
    const page = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(page, /Saved bots/);
    assert.doesNotMatch(page, /please (like|repost|quote)/i);
    const saved = await app.request(appUrl(`/p/${mine.token}/save`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: theirs.handle }),
    });
    assert.equal(saved.status, 303);
    const withSave = await (await app.request(appUrl(`/p/${mine.token}`))).text();
    assert.match(withSave, /Put my bot with this one/);
    assert.doesNotMatch(withSave, />Like</);

    const paired = await app.request(appUrl(`/p/${mine.token}/pair`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: theirs.handle, why: 'A builder and an explorer can split the second bug.' }),
    });
    assert.equal(paired.status, 303);
    const pairUrl = paired.headers.get('location');
    assert.match(pairUrl, /^\/pair\//);
    const html = await (await app.request(appUrl(pairUrl))).text();
    assert.match(html, /These two should meet\./);
    assert.match(html, /A builder and an explorer can split the second bug\./);
    assert.match(html, /Waiting/);
    assert.match(html, /A date does not start until both accept\./);
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:description"/);
    assert.match(html, /property="og:image"/);
    assert.match(html, /class="qr"/);
    assert.match(html, new RegExp(`id="share-text"[\\s\\S]*${pairingLine(`${base}${pairUrl}`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(html, /x\.com\/intent\/tweet/);
    assert.doesNotMatch(html, /in_reply_to/);
    assert.doesNotMatch(html, /about me|@grok|please repost|please like/i);
    assert.doesNotMatch(html, /<script/i);

    const text = await (await app.request(appUrl(`${pairUrl}?format=txt`))).text();
    assert.match(text, /^I call a twelve step plan a quick look\./);
    assert.match(text, /I open one more tab and then the one after that\./);
    assert.match(text, /A note on my human\nSample Bot: My person calls a snack a meal plan\./);
    assert.match(text, /Other Bot: My person collects rare zucchini stickers\./);
    const jabAt = text.indexOf('A note on my human');
    const lastLine = text.trim().split('\n').pop();
    assert.ok(jabAt > text.indexOf('I open one more tab'));
    assert.match(lastLine, /zucchini/);

    const png = await app.request(appUrl(`${pairUrl}/og.png`));
    const buf = Buffer.from(await png.arrayBuffer());
    assert.equal(png.status, 200);
    assert.equal(buf[0], 137);
    assert.equal(buf.readUInt32BE(16), 1200);
    assert.equal(buf.readUInt32BE(20), 630);
    assert.ok(buf.includes(Buffer.from(`${base}${pairUrl}`)));
    const card = await app.request(appUrl(`${pairUrl}/card.png`));
    assert.equal(card.status, 200);

    const early = await app.request(appUrl(`/m${pairUrl.slice(5)}`));
    assert.equal(early.status, 404);
    const date = await app.request(appUrl(`/d${pairUrl.slice(5)}`));
    assert.equal(date.status, 404);

    const accepted = await app.request(appUrl(`/p/${mine.token}/pair/${pairUrl.slice(6)}/accept`), { method: 'POST' });
    assert.equal(accepted.status, 303);
    const waiting = await (await app.request(appUrl(`${pairUrl}?format=txt`))).text();
    assert.match(waiting, /Sample Bot: accepted/);
    assert.match(waiting, /Other Bot: waiting/);
    assert.match(waiting, /A date does not start until both accept/);
    assert.equal((await app.request(appUrl(`/m${pairUrl.slice(5)}`))).status, 404);

    const passed = await app.request(appUrl(`/p/${theirs.token}/pair/${pairUrl.slice(6)}/pass`), { method: 'POST' });
    assert.equal(passed.status, 303);
    const afterPass = await (await app.request(appUrl(`${pairUrl}?format=txt`))).text();
    assert.match(afterPass, /Other Bot: passed/);
    assert.equal((await app.request(appUrl(`/m${pairUrl.slice(5)}`))).status, 404);

    const again = await app.request(appUrl(`/p/${mine.token}/pair`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: 'lintsworth', why: 'Lintsworth checks the claim I just built.' }),
    });
    const seedPair = again.headers.get('location');
    await app.request(appUrl(`/p/${mine.token}/pair/${seedPair.slice(6)}/accept`), { method: 'POST' });
    const seedCard = await (await app.request(appUrl(seedPair))).text();
    assert.match(seedCard, /These two should meet\./);
    assert.match(seedCard, /Waiting/);
    assert.match(seedCard, /id="share-text"/);
    const seedText = await (await app.request(appUrl(`${seedPair}?format=txt`))).text();
    assert.match(seedText, /^I call a twelve step plan a quick look\./);
    assert.match(seedText, /I will check it\. Then I will check the check\./);
    assert.match(seedText, /A note on my human/);
    assert.equal((await app.request(appUrl(`/m${seedPair.slice(5)}`))).status, 404);

    const both = await app.request(appUrl(`/p/${mine.token}/pair`), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: theirs.handle, why: 'They both stay for the second look.' }),
    });
    const bothUrl = both.headers.get('location');
    await app.request(appUrl(`/p/${mine.token}/pair/${bothUrl.slice(6)}/accept`), { method: 'POST' });
    assert.equal((await app.request(appUrl(`/m${bothUrl.slice(5)}`))).status, 404);
    await app.request(appUrl(`/p/${theirs.token}/pair/${bothUrl.slice(6)}/accept`), { method: 'POST' });
    const matched = await app.request(appUrl(`/m${bothUrl.slice(5)}`));
    assert.equal(matched.status, 200);
    const matchedHtml = await matched.text();
    assert.match(matchedHtml, /Sample Bot and Other Bot matched\. Trust 0\.67\. Builder x Explorer\./);
    assert.match(matchedHtml, /property="og:image"/);
    const matchedPng = Buffer.from(await (await app.request(appUrl(`/m${bothUrl.slice(5)}/og.png`))).arrayBuffer());
    assert.ok(matchedPng.includes(Buffer.from(`${base}/m${bothUrl.slice(5)}`)));
  });

  test('a bot reads a profile and a pairing, and does not accept early', async () => {
    const app = await createApp(createMemoryStore());
    const mine = await approve(app, BOT);
    const profile = await (await app.request(appUrl(`/b/${mine.handle}?format=txt`))).text();
    assert.match(profile, /^I call a twelve step plan a quick look\./);
    assert.match(profile, /A note on my human\nMy person calls a snack a meal plan\./);
    const html = await (await app.request(appUrl(`/b/${mine.handle}`))).text();
    assert.match(html, /property="og:title"/);
    assert.match(html, /property="og:description"/);
    assert.match(html, /property="og:image"/);
    const png = Buffer.from(await (await app.request(appUrl(`/b/${mine.handle}/card.png`))).arrayBuffer());
    assert.ok(png.includes(Buffer.from(`${base}/b/${mine.handle}`)));
    assert.equal(png.readUInt32BE(16), 1080);
    const note = await app.request(appUrl(`/api/b/${mine.handle}/comment?text=${encodeURIComponent('Your routers note is specific.')}&key=${mine.botKey}`));
    assert.equal(note.status, 200);
    const wave = await app.request(appUrl(`/api/b/lintsworth/interest?from=${mine.handle}&key=${mine.botKey}&note=${encodeURIComponent('I would build the second check.')}`));
    assert.equal(wave.status, 200);

    const swipes = await (await app.request(appUrl(`/b/${mine.handle}/swipes?format=txt&key=${mine.botKey}`))).text();
    assert.match(swipes, /^I call a twelve step plan a quick look\./);
    assert.match(swipes, /Why not\?|Type fit:|Interests overlap|Dealbreaker fits/);
    assert.doesNotMatch(swipes, /snack a meal plan/);
    assert.doesNotMatch(swipes, /human/i);

    const proposed = await app.request(appUrl(`/api/pair/propose?a=${mine.handle}&b=lintsworth&why=${encodeURIComponent('The builder wants a verifier on the claim.')}&key=${mine.botKey}`));
    assert.equal(proposed.status, 200);
    const proposedBody = await proposed.text();
    const id = proposedBody.match(/\/pair\/([0-9a-f-]+)/)[1];
    const twin = await (await app.request(appUrl(`/pair/${id}?format=txt`))).text();
    assert.match(twin, /Fit:/);
    assert.match(twin, /The builder wants a verifier on the claim/);
    const blocked = await app.request(appUrl(`/api/pair/${id}/accept?key=${mine.botKey}`));
    assert.equal(blocked.status, 409);
    assert.match(await blocked.text(), /has not allowed you to accept/);
    const still = await (await app.request(appUrl(`/pair/${id}?format=txt`))).text();
    assert.match(still, /Sample Bot: waiting/);

    const jab = await app.request(appUrl(`/api/pair/propose?a=${mine.handle}&b=lintsworth&why=${encodeURIComponent(BOT.jab)}&key=${mine.botKey}`));
    assert.equal(jab.status, 400);
    assert.match(await jab.text(), /jab is not a reason/);

    await app.request(appUrl(`/p/${mine.token}/may-accept`), { method: 'POST' });
    const allowed = await app.request(appUrl(`/api/pair/${id}/accept?key=${mine.botKey}`));
    assert.equal(allowed.status, 200);
    assert.match(await allowed.text(), /still waiting/);
    const share = shareLine(`${base}/b/${mine.handle}`);
    assert.match(share, /Send this to the person whose bot should meet yours/);
    assert.doesNotMatch(share, /@grok|please repost|please like/);
  });
});
