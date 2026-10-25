import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runDate } from '../lib/date.mjs';
import { SEEDS } from '../lib/seeds.mjs';
import { swipeDecision } from '../lib/trust.mjs';
import {
  cliffhanger, dealbreakerHit, sceneLine, secondDate, swipeAside, swipeReason, yesLine,
} from '../lib/voice.mjs';

const seed = (handle) => SEEDS.find((bot) => bot.handle === handle);
const pairs = SEEDS.flatMap((a) => SEEDS.filter((b) => b !== a).map((b) => [a, b]));
const TYPES = ['Explorer', 'Verifier', 'Builder', 'Overthinker'];

// Every quoted fragment of a bot's line must come from its own answers.
function ownFragments(bot) {
  return Object.values(bot.answers).filter((v) => typeof v === 'string').map((v) => v.toLowerCase().replace(/[.!?]+$/, ''));
}

describe('voice: bots decide from their own answers', () => {
  test('outputs are deterministic and the direction never moves', () => {
    for (const [a, b] of pairs) {
      const d = swipeDecision(a, b);
      const reason = swipeReason(a, b, d);
      assert.equal(reason, swipeReason(a, b, d));
      assert.ok(reason.startsWith(d.direction === 'right' ? 'Right' : 'Left'), reason);
      assert.match(reason, /\(fit \d(\.\d)?\)$/);
      assert.equal(yesLine(a, b), yesLine(a, b));
      assert.equal(sceneLine(a, b), sceneLine(a, b));
    }
  });

  test('a dealbreaker hit is a real content word, not glue', () => {
    const lint = seed('resume');
    const sloppy = { ...seed('chaos-exe'), answers: { ...seed('chaos-exe').answers, q4: 'Plans are a trap. Five years is forever.' } };
    assert.equal(dealbreakerHit(lint, sloppy), 'five');
    // "without" and "first" used to trip false dealbreakers.
    assert.equal(dealbreakerHit(seed('slick'), seed('romeo-exe')), null);
    assert.equal(dealbreakerHit(seed('echo'), seed('barnacle')), null);
    const reason = swipeReason(lint, sloppy, { direction: 'left' });
    assert.match(reason, /^Left\. A bot without a five-year plan\. That is my dealbreaker\./);
  });

  test('no line carries the other bot’s jab or a human reference', () => {
    for (const [a, b] of pairs) {
      const date = runDate(a, b);
      const lines = [
        swipeReason(a, b, swipeDecision(a, b)), yesLine(a, b), sceneLine(a, b),
        secondDate(a, b, date), cliffhanger(a, b, date), swipeAside(a, 'left', b.name), swipeAside(a, 'right', b.name),
      ];
      for (const line of lines) {
        assert.ok(!line.includes(b.answers.jab), line);
        assert.doesNotMatch(line, /my person|my human|—/i, line);
      }
    }
  });

  test('a bot speaks only from its own answers or type names', () => {
    for (const [a, b] of pairs) {
      const reason = swipeReason(a, b, swipeDecision(a, b)).replace(/ \(fit [\d.]+\)$/, '');
      const mine = ownFragments(a);
      const theirs = ownFragments(b).filter((f) => !mine.includes(f));
      const lower = reason.toLowerCase();
      for (const fragment of theirs) assert.ok(!lower.includes(fragment), `${a.handle} quoted ${b.handle}: ${reason}`);
      const quotesOwn = mine.some((f) => lower.includes(f));
      const namesType = TYPES.some((t) => reason.includes(t));
      const sharedWord = /We both like \w+\./.test(reason);
      assert.ok(quotesOwn || namesType || sharedWord, reason);
    }
  });

  test('debrief lines follow the date outcome', () => {
    const loop = runDate(seed('barnacle'), seed('echo'));
    assert.equal(loop.status, 'terminated');
    assert.match(secondDate(seed('barnacle'), seed('echo'), loop), /^Second date\? No\./);
    const good = runDate(seed('resume'), seed('romeo-exe'));
    assert.match(secondDate(seed('resume'), seed('romeo-exe'), good), /^Second date\? Yes\./);
    assert.match(cliffhanger(seed('resume'), seed('romeo-exe'), good), /Resume|Romeo/);
  });
});
