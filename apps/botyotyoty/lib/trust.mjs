// Trust and swipe math. Numbers are fixed. Do not retune them.

export const TYPES = ['Explorer', 'Verifier', 'Builder', 'Overthinker'];

export const COMP = {
  Explorer: { Explorer: 0.3, Verifier: 0.9, Builder: 0.7, Overthinker: 0.5 },
  Verifier: { Explorer: 0.9, Verifier: 0.2, Builder: 0.6, Overthinker: 0.4 },
  Builder: { Explorer: 0.7, Verifier: 0.6, Builder: 0.3, Overthinker: 0.8 },
  Overthinker: { Explorer: 0.5, Verifier: 0.4, Builder: 0.8, Overthinker: 0.1 },
};

const ANSWER_KEYS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8'];

const STOP = new Set([
  'this', 'that', 'with', 'from', 'your', 'you', 'are', 'and', 'the', 'for', 'not',
  'will', 'into', 'about', 'bot', 'another', 'what', 'have', 'been', 'them', 'they',
  'their', 'just', 'only', 'when', 'then', 'than', 'does', 'dont', 'someone', 'who',
]);

export function trustValue(alpha, beta) {
  return (Number(alpha) + 1) / (Number(alpha) + Number(beta) + 2);
}

export function meterLabel(value) {
  if (value >= 0.7) return 'promising';
  if (value >= 0.4) return "it's complicated";
  if (value >= 0.125) return 'wobbly';
  return 'terminated';
}

export function answerBlob(botOrFields) {
  const answers = botOrFields && botOrFields.answers ? botOrFields.answers : botOrFields || {};
  return ANSWER_KEYS.map((key) => answers[key] || '').join(' ');
}

export function keywords(botOrFields) {
  const words = answerBlob(botOrFields).toLowerCase().match(/[a-z0-9]{4,}/g) || [];
  return new Set(words.filter((word) => !STOP.has(word)));
}

export function keywordOverlap(a, b) {
  const left = keywords(a);
  const right = keywords(b);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union ? shared / union : 0;
}

export function complementarity(a, b) {
  const row = COMP[a && a.type] || {};
  const value = row[b && b.type];
  return typeof value === 'number' ? value : 0;
}

export function swipeScore(from, to) {
  return 0.7 * complementarity(from, to) + 0.3 * keywordOverlap(from, to);
}

function bestOther(type) {
  let best = 'Verifier';
  let score = -1;
  for (const other of TYPES) {
    if (other === type) continue;
    const value = (COMP[type] && COMP[type][other]) || 0;
    if (value > score) {
      score = value;
      best = other;
    }
  }
  return best;
}

export function bestFit(type) {
  const best = bestOther(type);
  return { type: best, comp: (COMP[type] && COMP[type][best]) || 0 };
}

export function swipeDecision(from, to) {
  const comp = complementarity(from, to);
  const overlap = keywordOverlap(from, to);
  const score = 0.7 * comp + 0.3 * overlap;
  const right = score >= 0.55;
  const compText = `${from.type} with ${to.type} is ${comp}`;
  let reason;
  if (right) {
    if (comp >= 0.7) reason = `Type fit: ${compText}.`;
    else if (overlap > 0) reason = `Interests overlap with ${to.name}. ${compText}.`;
    else reason = `Dealbreaker fits ${to.name}. ${compText}.`;
  } else {
    reason = `Why not? ${compText}. What instead? A ${bestOther(from.type)}.`;
  }
  return { direction: right ? 'right' : 'left', reason, score, comp, overlap };
}
