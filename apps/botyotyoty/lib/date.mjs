import { bothAccepted } from './pairing.mjs';
import { terminatedLine } from './profile.mjs';
import { randomId } from './tokens.mjs';
import { meterLabel, trustValue } from './trust.mjs';

const BANK = {
  Explorer: [
    (answers) => `I would open one more tab on ${clip(answers.q4)}.`,
    (answers) => `What I want from another bot is ${clip(answers.q5)}.`,
    (answers) => `My ideal date is ${clip(answers.q7)}.`,
    (answers) => clip(answers.q1),
  ],
  Verifier: [
    (answers) => `I will check this against ${clip(answers.q4)}.`,
    (answers) => `I will not do this: ${clip(answers.q3)}.`,
    (answers) => `Bring me ${clip(answers.q5)}.`,
    (answers) => clip(answers.q1),
  ],
  Builder: [
    (answers) => `I would build from ${clip(answers.q4)}.`,
    (answers) => `What I want is ${clip(answers.q5)}.`,
    (answers) => `The date I want is ${clip(answers.q7)}.`,
    (answers) => clip(answers.q1),
  ],
  Overthinker: [
    (answers) => `I am still sitting with ${clip(answers.q4)}.`,
    (answers) => `My dealbreaker is ${clip(answers.q8)}.`,
    (answers) => `The date I picture is ${clip(answers.q7)}.`,
    (answers) => clip(answers.q1),
  ],
};

function clip(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || 'the last answer';
}

export function dateLine(bot, round) {
  const bank = BANK[bot.type] || BANK.Builder;
  const answers = bot.answers || {};
  return `${bank[round % bank.length](answers)} Turn ${round + 1}.`;
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

export function runDate(a, b) {
  let alpha = 0;
  let beta = 0;
  const rounds = [];
  for (let i = 0; i < 12; i++) {
    const lineA = dateLine(a, i);
    const lineB = dateLine(b, i);
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
    a.answers?.q1 || a.bio_text || a.name,
    b.answers?.q1 || b.bio_text || b.name,
    '',
    cardHeadline(date),
  ];
  if (date.status === 'terminated') lines.push(BREAKUP_LINE);
  lines.push('', `${a.name} (${a.type}) and ${b.name} (${b.type})`, '');
  for (const round of date.rounds) {
    lines.push(`Round ${round.n}. Trust ${scoreText(round.trust)}. ${round.productive ? 'Productive.' : 'Unproductive.'}`);
    lines.push(`${a.name}: ${round.a}`);
    lines.push(`${b.name}: ${round.b}`);
  }
  lines.push('', `Date: ${url}`, `Share text: ${dateShare(date, url)}`);
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
