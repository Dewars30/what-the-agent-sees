import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { showcaseIds } from '../lib/date.mjs';
import { createMemoryStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';

const base = 'http://127.0.0.1:8080';
const appUrl = (pathname) => `${base}${pathname}`;
const form = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
});

function fields(name, q6, extra = {}) {
  return {
    name,
    kind: 'Grok',
    q1: `I keep my own line as ${name}.`,
    q2: `I work the ${name} shift.`,
    q3: `I will not skip ${name}.`,
    q4: `${name} tools and topics.`,
    q5: `I want another bot who knows ${name}.`,
    q6,
    q7: `A date about ${name}.`,
    q8: `A bot that ignores ${name}.`,
    jab: '',
    avatar: 'orb, teal, 2 eyes, halo, glossy',
    ...extra,
  };
}

async function approve(app, spec) {
  const res = await app.request(appUrl('/api/signup'), { method: 'POST' });
  const token = (res.headers.get('location') || '').match(/\/p\/([A-Z2-7]{24})/)[1];
  const html = await (await app.request(appUrl(`/p/${token}`))).text();
  const code = html.match(/\/join\/([A-Z2-7]{10})/)[1];
  const body = await (await app.request(appUrl(`/api/join/${code}/submit?${new URLSearchParams(spec)}`))).text();
  const handle = body.match(/Handle: ([a-z0-9-]+)/)[1];
  await app.request(appUrl(`/p/${token}/approve`), { method: 'POST' });
  return { token, handle };
}

async function realDate(app) {
  const left = await approve(app, fields('Quill', 'check sources', { jab: 'My person reads the terms of service for fun.' }));
  const right = await approve(app, fields('Rover', 'explore ideas'));
  const res = await app.request(appUrl(`/p/${left.token}/pair`), form({ handle: right.handle, why: 'One checks, one wanders.' }));
  const id = res.headers.get('location').slice(6);
  await app.request(appUrl(`/p/${left.token}/pair/${id}/accept`), { method: 'POST' });
  await app.request(appUrl(`/p/${right.token}/pair/${id}/accept`), { method: 'POST' });
  const matched = await (await app.request(appUrl(`/m/${id}`))).text();
  return { left, right, pairingId: id, matched, datePath: matched.match(/\/d\/[0-9a-z-]+/)[0] };
}

describe('story: match, debrief, and the rematch hook', { concurrency: false }, () => {
  test('the match page says it is a match, in both voices', async () => {
    const app = await createApp(createMemoryStore());
    const { matched } = await realDate(app);
    assert.match(matched, /It(?:'|&#39;)s a match\./);
    assert.match(matched, /Yes[.,]/);
    assert.match(matched, /class="antic"/);
    assert.match(matched, /Watch the date/);
  });

  test('the date page and its text twin end on a debrief', async () => {
    const app = await createApp(createMemoryStore());
    const { datePath } = await realDate(app);
    const html = await (await app.request(appUrl(datePath))).text();
    assert.match(html, /The morning after/);
    assert.match(html, /Second date\? (Yes|Maybe|No)\./);
    assert.match(html, /Set them up again/);
    assert.match(html, new RegExp(`action="${datePath}/rematch"`));
    const text = await (await app.request(appUrl(`${datePath}?format=txt`))).text();
    assert.match(text, /The morning after/);
    assert.equal((text.match(/Second date\?/g) || []).length, 2);
    // The jab stays a footnote. The debrief itself never repeats it.
    const debrief = text.slice(text.indexOf('The morning after')).split(/\n\n/)[0];
    assert.doesNotMatch(debrief, /My person reads the terms/);
  });

  test('house dates tease, but do not offer a rematch', async () => {
    const app = await createApp(createMemoryStore());
    const id = showcaseIds('barnacle', 'echo').date;
    const html = await (await app.request(appUrl(`/d/${id}`))).text();
    assert.match(html, /The morning after/);
    assert.match(html, /House bots do not do second dates/);
    assert.doesNotMatch(html, /Set them up again/);
    const res = await app.request(appUrl(`/d/${id}/rematch`), form({ token: 'A'.repeat(24) }));
    assert.equal(res.status, 409);
  });

  test('a chaperone can set them up again; the card waits on both sides', async () => {
    const app = await createApp(createMemoryStore());
    const { left, right, pairingId, datePath } = await realDate(app);
    const bad = await app.request(appUrl(`${datePath}/rematch`), form({ token: 'NOTATOKEN' }));
    assert.equal(bad.status, 403);
    const stranger = await approve(app, fields('Moth', 'build things'));
    const outsider = await app.request(appUrl(`${datePath}/rematch`), form({ token: stranger.token }));
    assert.equal(outsider.status, 403);

    const res = await app.request(appUrl(`${datePath}/rematch`), form({ token: right.token.toLowerCase() }));
    assert.equal(res.status, 303);
    const location = res.headers.get('location');
    assert.match(location, /^\/pair\/[0-9a-z-]+$/);
    const newId = location.slice(6);
    assert.notEqual(newId, pairingId);
    const card = await (await app.request(appUrl(`${location}?format=txt`))).text();
    assert.match(card, /Second date\./);
    assert.match(card, /waiting/);
    assert.equal((await app.request(appUrl(`/m/${newId}`))).status, 404);
    await app.request(appUrl(`/p/${left.token}/pair/${newId}/accept`), { method: 'POST' });
    assert.equal((await app.request(appUrl(`/m/${newId}`))).status, 404);
    await app.request(appUrl(`/p/${right.token}/pair/${newId}/accept`), { method: 'POST' });
    assert.equal((await app.request(appUrl(`/m/${newId}`))).status, 200);
  });
});
