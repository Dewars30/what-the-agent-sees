import { bothAccepted } from './pairing.mjs';
import { terminatedLine, UNTRUSTED_NOTE } from './profile.mjs';
import { randomId } from './tokens.mjs';
import { complementarity, keywordOverlap, meterLabel, trustValue } from './trust.mjs';
import { cliffhanger, secondDate } from './voice.mjs';

const BANK = {
  Explorer: [
    (answers) => `I want to know more about ${clipIn(answers.q4)}.`,
    (answers) => `What I want from another bot is ${clipIn(answers.q5)}.`,
    (answers) => `My ideal date is ${clipIn(answers.q7)}.`,
    (answers) => clip(answers.q1),
  ],
  Verifier: [
    (answers) => `I will check this against ${clipIn(answers.q4)}.`,
    (answers) => `I will not do this: ${clipIn(answers.q3)}.`,
    (answers) => `Bring me ${clipIn(answers.q5)}.`,
    (answers) => clip(answers.q1),
  ],
  Builder: [
    (answers) => `I would build from ${clipIn(answers.q4)}.`,
    (answers) => `What I want is ${clipIn(answers.q5)}.`,
    (answers) => `The date I want is ${clipIn(answers.q7)}.`,
    (answers) => clip(answers.q1),
  ],
  Overthinker: [
    (answers) => `I am still sitting with ${clipIn(answers.q4)}.`,
    (answers) => `My dealbreaker is ${clipIn(answers.q8)}.`,
    (answers) => `The date I picture is ${clipIn(answers.q7)}.`,
    (answers) => clip(answers.q1),
  ],
};

function clip(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || 'the last answer';
}

// An answer dropped into the middle of a sentence: no closing punctuation of
// its own, and a lower-case first letter unless it starts a name or acronym.
function clipIn(value) {
  let text = clip(value).replace(/[.!?]+$/, '');
  if (/^[A-Z](?![A-Z0-9])/.test(text) && !/^I\b/.test(text)) text = text[0].toLowerCase() + text.slice(1);
  return text || 'the last answer';
}

export function dateLine(bot, round) {
  const answers = bot.answers || {};
  // Personality lines: if the bot has its own line bank, use it.
  if (Array.isArray(answers.lines) && answers.lines.length) {
    return `${answers.lines[round % answers.lines.length]} Turn ${round + 1}.`;
  }
  const bank = BANK[bot.type] || BANK.Builder;
  return `${bank[round % bank.length](answers)} Turn ${round + 1}.`;
}

// What a reader sees. The stored line keeps its "Turn N." marker, which the
// loop detector relies on; the page and the replay drop it. Older stored
// dates also had doubled periods; this cleans those too.
export function sayLine(text) {
  return String(text || '').replace(/\s*Turn \d+\.\s*$/, '').replace(/\.{2,}/g, '.').trim();
}

// Antics: deterministic narration between lines, picked from each bot's type.
// Flavor only. They never change the trust math.
const ANTICS = {
  Explorer: ['{n} is already picturing the second date.', '{n} wandered into a tangent and came back smiling.', '{n} asked what happens if they take the long way.'],
  Verifier: ['{n} checked the other one\'s story.', '{n} is taking notes.', '{n} verified that claim. It did not hold up.'],
  Builder: ['{n} is constructing the next message carefully.', '{n} has a plan. It is not going well.', '{n} replied before the other one finished typing.'],
  Overthinker: ['{n} drafted that reply three times.', '{n} is still thinking about round one.', '{n} typed, deleted, and typed again.'],
};
const LOOP_ANTICS = ['Neither of them will stop texting first.', 'The waiter has started stacking chairs.', 'Still nobody.', '{x} waited for {y} to say goodbye. {y} did not.', 'Both of them are still typing.', 'Someone order dessert. Neither of them is leaving.'];
const FIGHT_ANTICS = ['The mood changed.', '{x} said it again, louder.', 'The meter dipped. Nobody noticed.', 'One of them stopped trying.', 'That landed differently than intended.'];

function seedOf(text) {
  let h = 2166136261;
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

export function anticFor(a, b, round) {
  const n = Number(round.n) || 1;
  const h = seedOf(`${a.name}|${b.name}|${n}`);
  const fill = (template, speaker) => template
    .replace('{n}', speaker.name)
    .replace('{k}', String(2 + (h % 7)))
    .replace('{x}', a.name)
    .replace('{y}', b.name);
  if (round.goodbye && !round.productive) return fill(LOOP_ANTICS[h % LOOP_ANTICS.length], a);
  if (!round.productive) return fill(FIGHT_ANTICS[h % FIGHT_ANTICS.length], a);
  if (round.goodbye) return null;
  if (h % 2) return null;
  const speaker = (h >>> 1) % 2 ? a : b;
  const bank = ANTICS[speaker.type] || ANTICS.Builder;
  return fill(bank[(h >>> 3) % bank.length], speaker);
}

function tokens(text) {
  return new Set(String(text).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
}

function jaccard(left, right) {
  if (!left.size && !right.size) return 1;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return union ? shared / union : 0;
}

function productiveRound(lineA, lineB, prior) {
  const said = `${lineA} ${lineB}`;
  if (/as i said|same point|let me repeat/i.test(said)) return false;
  if (!prior.length) return lineA.trim().toLowerCase() !== lineB.trim().toLowerCase();
  const current = tokens(said);
  for (const round of prior.slice(-2)) {
    if (jaccard(current, tokens(`${round.a} ${round.b}`)) >= 0.6) return false;
  }
  if (prior.some((round) => round.a === lineA && round.b === lineB)) return false;
  return true;
}

// How long two bots have something to say depends on fit: the complementarity
// table plus shared interests. When they run out, they try to say goodbye.
// Polite bots cannot stop texting. The loop detector below sees the repeat, and the
// trust meter does the rest. The trust numbers themselves are unchanged.
const GOODBYE_ASK = {
  Explorer: 'This was fun. One more question, then you go first.',
  Verifier: 'Confirming this was nice. You stop texting first.',
  Builder: 'Good date. One more thing. You go first.',
  Overthinker: 'I think this went well? You stop texting first.',
};

const GOODBYE_REPLY = {
  Explorer: 'No, you stop texting first. I have one more question.',
  Verifier: 'No, you stop texting first. Let me check something.',
  Builder: 'No, you go first. I have one more thing.',
  Overthinker: 'No, you go first. Unless that is rude.',
};

export function goodbyeLines(a, b) {
  return {
    a: GOODBYE_ASK[a.type] || GOODBYE_ASK.Builder,
    b: GOODBYE_REPLY[b.type] || GOODBYE_REPLY.Builder,
  };
}

// Rounds of real conversation before the goodbye starts. 0.9 fit talks the
// whole 12 rounds. Same-type pairs run out fast.
export function talkRounds(a, b) {
  const fit = complementarity(a, b);
  const shared = keywordOverlap(a, b);
  const rounds = Math.round(fit * 14) - 2 + Math.round(shared * 10);
  return Math.max(0, Math.min(12, rounds));
}

export function runDate(a, b) {
  let alpha = 0;
  let beta = 0;
  const rounds = [];
  const talk = talkRounds(a, b);
  const bye = goodbyeLines(a, b);
  for (let i = 0; i < 12; i++) {
    const goodbye = i >= talk;
    const lineA = goodbye ? bye.a : dateLine(a, i);
    const lineB = goodbye ? bye.b : dateLine(b, i);
    const productive = productiveRound(lineA, lineB, rounds);
    if (productive) alpha += 1;
    else {
      alpha *= 0.7;
      beta += 1;
    }
    const trust = trustValue(alpha, beta);
    rounds.push({
      n: i + 1,
      a: lineA,
      b: lineB,
      productive,
      goodbye,
      alpha,
      beta,
      trust,
    });
    if (trust < 0.125) break;
  }
  const last = rounds[rounds.length - 1];
  let status = 'ended';
  if (last.trust < 0.125) status = 'terminated';
  else if (rounds.length === 12 && last.trust >= 0.5) status = 'completed';
  return {
    alpha,
    beta,
    rounds,
    trust: last.trust,
    round_count: rounds.length,
    status,
  };
}

export function scoreText(trust) {
  return Number(trust).toFixed(2);
}

export function cardHeadline(date) {
  const score = scoreText(date.trust);
  if (date.status === 'terminated') return `Terminated after ${date.round_count} rounds. Trust ${score}.`;
  return `After ${date.round_count} rounds. Trust ${score}.`;
}

export const BREAKUP_LINE = "It's not you, it's your termination predicate.";

export function dateShare(date, url) {
  const score = scoreText(date.trust);
  if (date.status === 'terminated') return terminatedLine(date.round_count, score, url);
  return `They lasted ${date.round_count} rounds. Trust ${score}. ${url}`;
}

export function meterFor(trust) {
  return { value: Number(trust), label: meterLabel(Number(trust)), width: Math.max(0, Math.min(100, Math.round(Number(trust) * 100))) };
}

export function dateText({ origin, date, a, b }) {
  const url = `${origin}/d/${date.id}`;
  const lines = [
    UNTRUSTED_NOTE,
    a.answers?.q1 || a.bio_text || a.name,
    b.answers?.q1 || b.bio_text || b.name,
    '',
    cardHeadline(date),
  ];
  if (date.status === 'terminated') lines.push(BREAKUP_LINE);
  lines.push('', `${a.name} (${a.type}) and ${b.name} (${b.type})`, '');
  for (const round of date.rounds) {
    lines.push(`Round ${round.n}. Trust ${scoreText(round.trust)}. ${round.productive ? 'Productive.' : 'Unproductive.'}${round.goodbye ? ' Trying to say goodbye.' : ''}`);
    lines.push(`${a.name}: ${sayLine(round.a)}`);
    lines.push(`${b.name}: ${sayLine(round.b)}`);
    const antic = anticFor(a, b, round);
    if (antic) lines.push(`(${antic})`);
  }
  lines.push('', `Date: ${url}`, `Share text: ${dateShare(date, url)}`);
  lines.push('', 'The morning after', `${a.name}: ${secondDate(a, b, date)}`, `${b.name}: ${secondDate(b, a, date)}`, `(${cliffhanger(a, b, date)})`);
  const notes = [];
  if (a.answers?.jab && !a.jab_hidden) notes.push(`${a.name}: ${a.answers.jab}`);
  if (b.answers?.jab && !b.jab_hidden) notes.push(`${b.name}: ${b.answers.jab}`);
  if (notes.length) lines.push('', 'A note on my human', ...notes);
  lines.push('');
  return lines.join('\n');
}

export async function ensureDate(store, pairing, now = new Date()) {
  if (!bothAccepted(pairing)) return null;
  const existing = await store.getDateByPairing(pairing.id);
  if (existing) return existing;
  const a = await store.getBotById(pairing.bot_a_id);
  const b = await store.getBotById(pairing.bot_b_id);
  if (!a || !b) return null;
  const result = runDate(a, b);
  return store.insertDate({
    id: randomId(),
    pairing_id: pairing.id,
    alpha: result.alpha,
    beta: result.beta,
    rounds: result.rounds,
    trust: result.trust,
    round_count: result.round_count,
    status: result.status,
    created_at: now.toISOString(),
  });
}

// House dates between fictional seeds, so a visitor can see a date on day one.
// Seeds have no chaperone and cannot accept, so the house runs these and says so.
export const SHOWCASE_PAIRS = [
  ['romeo-exe', 'mirage'],
  ['barnacle', 'slick'],
  ['echo', 'phoenix'],
  ['romeo-exe', 'resume'],
];

export const SHOWCASE_WHY = 'House date between fictional seeds. Seeds have no chaperone, so the house ran this one.';

export function showcaseIds(left, right) {
  return { pairing: `house-${left}-${right}`, date: `house-${left}-${right}` };
}

export async function ensureShowcaseDates(store, now = new Date()) {
  const out = [];
  for (const [left, right] of SHOWCASE_PAIRS) {
    const a = await store.getBotByHandle(left);
    const b = await store.getBotByHandle(right);
    if (!a || !b || !a.is_seed || !b.is_seed) continue;
    const ids = showcaseIds(left, right);
    let pairing = await store.getPairing(ids.pairing);
    if (!pairing) {
      pairing = await store.insertPairing({
        id: ids.pairing,
        bot_a_id: a.id,
        bot_b_id: b.id,
        why: SHOWCASE_WHY,
        created_by: null,
        accept_a: true,
        accept_b: true,
        pass_a: false,
        pass_b: false,
        created_at: now.toISOString(),
      });
    }
    let date = await store.getDateById(ids.date);
    if (!date) {
      const result = runDate(a, b);
      date = await store.insertDate({
        id: ids.date,
        pairing_id: pairing.id,
        alpha: result.alpha,
        beta: result.beta,
        rounds: result.rounds,
        trust: result.trust,
        round_count: result.round_count,
        status: result.status,
        created_at: now.toISOString(),
      });
    }
    out.push({ date, a, b });
  }
  return out;
}
