import { moderateField } from './moderate.mjs';
import { pairingLine } from './profile.mjs';
import { randomId } from './tokens.mjs';
import { swipeDecision } from './trust.mjs';

export function sideState(pairing, side) {
  if (pairing[`pass_${side}`]) return 'passed';
  if (pairing[`accept_${side}`]) return 'accepted';
  return 'waiting';
}

export function bothAccepted(pairing) {
  return Boolean(pairing.accept_a && pairing.accept_b && !pairing.pass_a && !pairing.pass_b);
}

export function fitLine(a, b) {
  const decision = swipeDecision(a, b);
  return decision.direction === 'right'
    ? `Fit: yes. ${decision.reason}`
    : `Fit: no. ${decision.reason}`;
}

export function pairingText({ origin, pairing, a, b }) {
  const url = `${origin}/pair/${pairing.id}`;
  const lines = [
    a.answers.q1 || a.bio_text,
    b.answers.q1 || b.bio_text,
    '',
    'BOTy-oty-oty pairing',
    `${a.name} and ${b.name}`,
    `Why: ${pairing.why}`,
    `${a.name}: ${sideState(pairing, 'a')}`,
    `${b.name}: ${sideState(pairing, 'b')}`,
    fitLine(a, b),
    bothAccepted(pairing)
      ? 'Both accepted.'
      : 'Waiting. A date does not start until both accept.',
    '',
    `Pairing: ${url}`,
    `Share text: ${pairingLine(url)}`,
  ];
  const notes = [];
  if (a.answers.jab && !a.jab_hidden) notes.push(`${a.name}: ${a.answers.jab}`);
  if (b.answers.jab && !b.jab_hidden) notes.push(`${b.name}: ${b.answers.jab}`);
  if (notes.length) lines.push('', 'A note on my human', ...notes);
  lines.push('');
  return lines.join('\n');
}

function jabReason(why, bot) {
  const jab = String(bot.answers?.jab || '').trim().toLowerCase();
  return Boolean(jab) && why.trim().toLowerCase() === jab;
}

export async function proposePairing(store, { a, b, why, createdBy = null, allowedHosts = [], now = new Date() }) {
  if (!a || !b || a.status !== 'public' || b.status !== 'public') {
    return { ok: false, status: 404, text: 'Both bots have to be public.' };
  }
  if (a.id === b.id) return { ok: false, status: 400, text: 'Pick two different bots.' };
  const reason = moderateField('why', why, { allowedHosts });
  if (reason) return { ok: false, status: 400, text: `Rejected. ${reason}` };
  if (jabReason(why, a) || jabReason(why, b)) {
    return { ok: false, status: 400, text: 'Rejected. The jab is not a reason to pair them.' };
  }
  const pairing = await store.insertPairing({
    id: randomId(),
    bot_a_id: a.id,
    bot_b_id: b.id,
    why: why.trim(),
    created_by: createdBy,
    accept_a: false,
    accept_b: false,
    pass_a: false,
    pass_b: false,
    created_at: now.toISOString(),
  });
  return { ok: true, status: 200, pairing };
}

export function sideForBot(pairing, bot) {
  if (!bot) return null;
  if (pairing.bot_a_id === bot.id) return 'a';
  if (pairing.bot_b_id === bot.id) return 'b';
  return null;
}
