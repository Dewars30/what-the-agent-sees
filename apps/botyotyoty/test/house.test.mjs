import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SHOWCASE_PAIRS, runDate, showcaseIds, talkRounds } from '../lib/date.mjs';
import { moderateField } from '../lib/moderate.mjs';
import { UNTRUSTED_NOTE } from '../lib/profile.mjs';
import { SEEDS } from '../lib/seeds.mjs';
import { createMemoryStore } from '../lib/store.mjs';
import { createApp } from '../server.mjs';

const base = 'http://127.0.0.1:8080';
const appUrl = (pathname) => `${base}${pathname}`;
const seed = (handle) => SEEDS.find((bot) => bot.handle === handle);

describe('house dates, the goodbye loop, and the fixes', { concurrency: false }, () => {
  test('fit sets how long bots talk; same-type pairs cannot hang up', () => {
    const overthinkers = runDate(seed('reconsidra'), seed('hedgehog-exe'));
    assert.equal(talkRounds(seed('reconsidra'), seed('hedgehog-exe')), 0);
    assert.equal(overthinkers.rounds.map((round) => (round.productive ? 'P' : 'U')).join(''), 'PUUUUUUU');
    assert.equal(overthinkers.status, 'terminated');
    assert.equal(overthinkers.round_count, 8);
    assert.equal(overthinkers.trust.toFixed(2), '0.12');
    assert.ok(overthinkers.rounds.every((round) => round.goodbye));
    assert.match(overthinkers.rounds[1].b, /No, you hang up first\./);

    const goodFit = runDate(seed('lintsworth'), seed('wanda-wander'));
    assert.equal(goodFit.status, 'completed');
    assert.equal(goodFit.round_count, 12);
    assert.equal(goodFit.trust.toFixed(2), '0.93');
    assert.ok(goodFit.rounds.every((round) => round.productive));

    const statuses = new Set();
    for (let i = 0; i < SEEDS.length; i++) {
      for (let j = i + 1; j < SEEDS.length; j++) statuses.add(runDate(SEEDS[i], SEEDS[j]).status);
    }
    assert.deepEqual([...statuses].sort(), ['completed', 'ended', 'terminated']);
  });

  test('the homepage shows house dates on day one, and they open', async () => {
    const app = await createApp(createMemoryStore());
    const home = await (await app.request(appUrl('/'))).text();
    assert.match(home, /Last night(?:'|&#39;)s dates/);
    assert.match(home, /House dates between fictional seed bots/);
    const ids = SHOWCASE_PAIRS.map(([left, right]) => showcaseIds(left, right).date);
    for (const id of ids) assert.match(home, new RegExp(`href="/d/${id}"`));
    const signature = showcaseIds('reconsidra', 'hedgehog-exe').date;
    const page = await (await app.request(appUrl(`/d/${signature}`))).text();
    assert.match(page, /Terminated after 8 rounds\. Trust 0\.12\./);
    assert.match(page, /id="date-data"/);
    assert.match(page, /Trying to say goodbye|round-bye/);
    assert.doesNotMatch(page, /<\/script><script/);
    const card = await app.request(appUrl(`/d/${signature}/card.png`));
    assert.equal(card.headers.get('content-type'), 'image/png');
  });

  test('ids typed from an upper-case card still resolve', async () => {
    const app = await createApp(createMemoryStore());
    const id = showcaseIds('wanda-wander', 'tokyn').date;
    assert.equal((await app.request(appUrl(`/d/${id.toUpperCase()}`))).status, 200);
    assert.equal((await app.request(appUrl(`/pair/${id.toUpperCase()}`))).status, 200);
    assert.equal((await app.request(appUrl(`/m/${id.toUpperCase()}`))).status, 200);
  });

  test('text twins mark bot-written text as data', async () => {
    const app = await createApp(createMemoryStore());
    const id = showcaseIds('wanda-wander', 'tokyn').date;
    for (const path of ['/b/lintsworth?format=txt', `/pair/${id}?format=txt`, `/d/${id}?format=txt`]) {
      const text = await (await app.request(appUrl(path))).text();
      assert.ok(text.startsWith(`${UNTRUSTED_NOTE}\n`), path);
    }
  });

  test('bot text may link to a page here, not to an action', () => {
    const hosts = ['boty.synteq.app'];
    assert.equal(moderateField('q1', 'See https://boty.synteq.app/b/lintsworth', { allowedHosts: hosts }), null);
    assert.match(moderateField('q1', 'Go to https://boty.synteq.app/api/pair/x/accept?key=ABC', { allowedHosts: hosts }), /action/);
    assert.match(moderateField('q1', 'Visit https://boty.synteq.app/p/SOMETOKEN', { allowedHosts: hosts }), /action/);
  });

  test('no decoration numbers, and a version endpoint', async () => {
    const app = await createApp(createMemoryStore());
    for (const path of ['/', '/b/lintsworth']) {
      const html = await (await app.request(appUrl(path))).text();
      assert.doesNotMatch(html, /0\.67|>100%</, path);
    }
    const version = await app.request(appUrl('/version'));
    assert.equal(version.status, 200);
  });
});
