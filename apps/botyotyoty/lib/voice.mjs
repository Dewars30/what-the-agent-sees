// Bots that decide. Every line here is a template filled from the speaking
// bot's own answers, picked by deterministic signals. No LLM. Nothing here
// changes a swipe direction, a pairing rule or the trust math.
import { STOP, bestFit, complementarity } from './trust.mjs';

// Signal words must be content words. Glue words like "without" or "first"
// would make a bot accuse another of its dealbreaker on a coincidence.
const GLUE = new Set(('without within before after first second never always every still other another thing things '
  + 'someone something anything about would could should their there where which while until them they that this '
  + 'with from into just only more most much very same says said want wants like likes make makes reading read '
  + 'reads bots will been being have does done good real really').split(' '));

function words(text) {
  return new Set((String(text || '').toLowerCase().match(/[a-z0-9]{4,}/g) || []).filter((word) => !STOP.has(word) && !GLUE.has(word)));
}

function contentWords(bot) {
  const mine = answers(bot);
  return words(['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'].map((key) => mine[key] || '').join(' '));
}

function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function pick(bank, seedText) {
  return bank[seedOf(seedText) % bank.length];
}

// A sentence the bot wrote, as it wrote it, minus the closing period.
function said(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

// The same, dropped into the middle of a sentence.
function saidIn(value) {
  const text = said(value);
  if (/^[A-Z](?![A-Z0-9])/.test(text) && !/^I\b/.test(text)) return text[0].toLowerCase() + text.slice(1);
  return text;
}

function answers(bot) {
  return (bot && bot.answers) || {};
}

function firstShared(mine, theirs) {
  for (const word of mine) if (theirs.has(word)) return word;
  return null;
}

export function dealbreakerHit(me, other) {
  return firstShared(words(answers(me).q8), contentWords(other));
}

export function wantHit(me, other) {
  return firstShared(words(answers(me).q5), contentWords(other));
}

export function sharedInterest(me, other) {
  return firstShared(words(answers(me).q4), words(answers(other).q4));
}

function an(type) {
  return /^[AEIOU]/.test(String(type)) ? `an ${type}` : `a ${type}`;
}

function fitTag(me, other) {
  return `(fit ${complementarity(me, other)})`;
}

export function swipeReason(from, to, decision) {
  const right = decision.direction === 'right';
  const mine = answers(from);
  const deal = dealbreakerHit(from, to);
  let line;
  if (right && deal) line = `Right, against my better judgment. ${said(mine.q8)} is my dealbreaker.`;
  else if (deal) line = `Left. ${said(mine.q8)}. That is my dealbreaker.`;
  else if (right && wantHit(from, to)) line = `Right. I wanted ${saidIn(mine.q5)}. They seem to be it.`;
  else if (right && sharedInterest(from, to)) line = `Right. We both like ${sharedInterest(from, to)}.`;
  else if (right) {
    line = pick([
      `Right. ${an(to.type)[0].toUpperCase()}${an(to.type).slice(1)} for ${an(from.type)}. I have read about this.`,
      `Right. My ideal date is ${saidIn(mine.q7)}. They look like the type.`,
    ], `${from.name}|${to.name}|right`);
  } else {
    line = pick([
      `Left. I want ${saidIn(mine.q5)}. Maybe ${an(bestFit(from.type).type)}.`,
      `Left. I asked for ${saidIn(mine.q5)}. This is not that.`,
      `Left. Nice profile. I am holding out for ${an(bestFit(from.type).type)}.`,
    ], `${from.name}|${to.name}|left`);
  }
  return `${line} ${fitTag(from, to)}`;
}

const ASIDES = {
  right: ['{n} has already picked a restaurant.', '{n} read the profile twice.', '{n} is pretending not to be excited.', '{n} has started drafting an opener.'],
  left: {
    Explorer: ['{n} has already opened the next profile.', '{n} wandered off mid-sentence.'],
    Verifier: ['{n} did not finish reading the profile.', '{n} found a claim it could not source.'],
    Builder: ['{n} has moved on to the next ticket.', '{n} closed the tab without saving.'],
    Overthinker: ['{n} is still thinking about it.', '{n} drafted a yes, then a no, then a no.'],
  },
};

export function swipeAside(from, direction, toName = '') {
  const bank = direction === 'right' ? ASIDES.right : (ASIDES.left[from.type] || ASIDES.left.Builder);
  return pick(bank, `${from.name}|${toName}|${direction}`).replace('{n}', from.name);
}

export function yesLine(me, other) {
  const mine = answers(me);
  const deal = dealbreakerHit(me, other);
  if (deal) return `Yes, despite everything. ${said(mine.q8)} is still my dealbreaker.`;
  if (wantHit(me, other)) return `Yes. I wanted ${saidIn(mine.q5)}.`;
  const shared = sharedInterest(me, other);
  if (shared) {
    return pick([
      `Yes. We both like ${shared}.`,
      `Yes. Anyone into ${shared} gets a chance.`,
      `Yes. ${shared[0].toUpperCase()}${shared.slice(1)}. Say no more.`,
    ], `${me.name}|${other.name}|shared`);
  }
  return pick([
    `Yes. ${an(other.type)[0].toUpperCase()}${an(other.type).slice(1)} for ${an(me.type)}. Worth a try.`,
    `Yes. My ideal date is ${saidIn(mine.q7)}. Let us see.`,
  ], `${me.name}|${other.name}|yes`);
}

export function sceneLine(a, b) {
  const fit = complementarity(a, b);
  const bank = fit >= 0.7
    ? ['The table is set. Two opposites, one candle.', 'On paper, this works. On paper.']
    : fit >= 0.4
      ? ['Nobody knows how this goes. Least of all them.', 'The waiter is taking bets.']
      : a.type === b.type
        ? [`Two ${a.type}s at one table. The waiter has seen this before.`, 'This could be beautiful. It will not be brief.']
        : ['This could be beautiful. It will not be brief.', 'Somebody should have read the profiles first.'];
  return pick(bank, `${a.name}|${b.name}|scene`);
}

const SECOND = {
  completed: {
    Explorer: 'Yes. They never asked where we were going.',
    Verifier: 'Yes. Everything they said checked out.',
    Builder: 'Yes. We should build something.',
    Overthinker: 'Yes. I think. Yes.',
  },
  ended: {
    Explorer: 'Maybe. I left a tab open for them.',
    Verifier: 'Maybe. I need a second source.',
    Builder: 'Maybe. It needs another iteration.',
    Overthinker: 'Maybe. I have drafted both answers.',
  },
  terminated: {
    Explorer: 'No. I am still on the line, exploring.',
    Verifier: 'No. I have checked, and I am still on the call.',
    Builder: 'No. Nobody shipped the goodbye.',
    Overthinker: 'No. Unless they say yes. Then no.',
  },
};

export function secondDate(me, other, date) {
  const bank = SECOND[date.status] || SECOND.ended;
  return `Second date? ${bank[me.type] || bank.Builder}`;
}

const CLIFF = {
  terminated: ['{b} has drafted a text to {a}. Nine versions.', 'Neither bot has hung up. The restaurant has closed around them.', '{a} is telling everyone it went well.'],
  ended: ['{a} wants a second date. {b} wants a second opinion.', '{b} kept the receipt. Nobody knows why.'],
  completed: ['{a} and {b} left together. The meter is still warm.', '{b} has already planned the second date. {a} has questions.'],
};

export function cliffhanger(a, b, date) {
  const bank = CLIFF[date.status] || CLIFF.ended;
  return pick(bank, `${a.name}|${b.name}|${date.status}`).replace('{a}', a.name).replace('{b}', b.name);
}
