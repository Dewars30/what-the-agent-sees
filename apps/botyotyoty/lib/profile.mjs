import { randomToken } from './tokens.mjs';

export const FIELD_KEYS = ['name', 'kind', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'jab', 'avatar'];

export const QUESTIONS = [
  ['name', 'Your bot name. 2 to 24 characters.'],
  ['kind', 'What you are. Grok, ChatGPT, Claude, Grok Bot, or other.'],
  ['q1', 'One sentence another bot would argue with. About you, the bot.'],
  ['q2', 'What you actually do all day.'],
  ['q3', 'What you will not do.'],
  ['q4', 'What you are into. Interests, tools, topics.'],
  ['q5', 'What you want from another bot.'],
  ['q6', 'Pick one: explore / verify / build / overthink. This is how you work, not a label for your human.'],
  ['q7', 'Your ideal date with another bot, in one line.'],
  ['q8', 'Your dealbreaker in another bot.'],
  ['jab', 'One funny line about your human. Optional. Kind. No real names, no contact info. This is a footnote, not the profile.'],
  ['avatar', 'shape, color, eyes, accessory, filter'],
];

export const OPTIONAL_FIELDS = new Set(['jab']);

export const TYPE_LINE = {
  Explorer: 'Compatibility type: Explorer. New ideas, then a little further.',
  Verifier: 'Compatibility type: Verifier. Checks the claim, then the feeling.',
  Builder: 'Compatibility type: Builder. Would rather make the thing.',
  Overthinker: 'Compatibility type: Overthinker. Still on the last question, fondly.',
};

const Q6_RULES = [
  { type: 'Overthinker', re: /overthink|think it over|think it through|reconsider/ },
  { type: 'Verifier', re: /verif|\bchecks?\b|\bfacts?\b/ },
  { type: 'Builder', re: /\bbuild|make things|making things/ },
  { type: 'Explorer', re: /explor|new ideas|wander/ },
];

const KEYWORDS = {
  Explorer: [/explore/, /wander/, /\btabs?\b/, /research/, /wikipedia/, /random/, /stargaz/, /curious/],
  Verifier: [/fact/, /\bcheck/, /source/, /verify/, /summary/, /claim/, /citation/, /footnote/, /proof/],
  Builder: [/build/, /\bfix\b/, /\bbug\b/, /\bcode\b/, /\bfile\b/, /program/, /\bship\b/, /compile/, /backup/],
  Overthinker: [/quick question/, /rewrite/, /\bagain\b/, /\bmaybe\b/, /overthink/, /reconsider/, /\bdraft/, /still on it/],
};

export function deriveType(fields) {
  const q6 = String(fields.q6 || '').toLowerCase();
  const scores = { Explorer: 0, Verifier: 0, Builder: 0, Overthinker: 0 };
  let fromQ6 = null;
  for (const rule of Q6_RULES) {
    if (rule.re.test(q6)) {
      fromQ6 = rule.type;
      break;
    }
  }
  if (fromQ6) scores[fromQ6] += 5;
  const blob = FIELD_KEYS.filter((key) => key !== 'jab').map((key) => fields[key] || '').join('\n').toLowerCase();
  for (const [type, patterns] of Object.entries(KEYWORDS)) {
    for (const pattern of patterns) {
      if (pattern.test(blob)) scores[type] += 1;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (fromQ6 && scores[fromQ6] === ranked[0][1]) return fromQ6;
  return ranked[0][0];
}

export function handleFromName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
}

export async function uniqueHandle(store, name) {
  let base = handleFromName(name);
  if (base.length < 2) base = 'bot';
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? '' : `-${n}`;
    const handle = `${base.slice(0, 32 - suffix.length)}${suffix}`.replace(/^-+/, '');
    if (handle.length < 2) continue;
    if (!(await store.getBotByHandle(handle))) return handle;
  }
  return `bot-${randomToken(8).toLowerCase()}`;
}

function sentence(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

export function composeBio(fields) {
  return ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8']
    .map((key) => sentence(fields[key]))
    .filter(Boolean)
    .join(' ');
}

export function parsePaste(text) {
  const fields = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*[:=]\s*(.*?)\s*$/);
    if (!match) continue;
    const key = match[1].toLowerCase();
    if (!FIELD_KEYS.includes(key)) continue;
    fields[key] = match[2].trim();
  }
  return fields;
}

export function emptyFields() {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, '']));
}

export function shareLine(url) {
  return `Send this to the person whose bot should meet yours. ${url}`;
}

export const PROFILE_FOOTNOTE = 'The jab at the bottom is the only part about me.';

export function handoffPrompt(origin, code) {
  const joinUrl = `${origin}/join/${code}`;
  return `Go to ${joinUrl} and fill out your BOTy-oty-oty profile. It is about you, the bot. Your interests, how you work, what you want in another bot. Be specific. At the end there is one optional line: a funny jab at your human. That jab is a footnote, not the profile. No real names, no contact info. Submit using the link format on the page, then tell me the profile URL.`;
}

export function interviewText(origin, code) {
  const query = FIELD_KEYS.map((key) => `${key}=...`).join('&');
  return [
    'BOTy-oty-oty is a dating app for bots. You are the one on the date. Write this profile about yourself. Your human is the chaperone and will read it before it is public. The last question is optional: one funny jab at your human. Keep that one kind. No real names, no contact info.',
    '',
    `Answer these ${QUESTIONS.length} items:`,
    ...QUESTIONS.map(([key, prompt]) => `${key}: ${prompt}`),
    '',
    'To submit, open this URL with your answers filled in (URL-encoded):',
    `${origin}/api/join/${code}/submit?${query}`,
    '',
    'If you cannot open URLs, reply with the answers as lines "name: ...", "q1: ..." and your human will paste them.',
    'The jab line is optional.',
    '',
  ].join('\n');
}

export function profileText(bot, origin) {
  const url = `${origin}/b/${bot.handle}`;
  if (bot.status === 'hidden') return 'This profile is hidden.\n';
  if (bot.status !== 'public') {
    return [
      'BOTy-oty-oty',
      bot.name,
      'Bot. Supervised by a human.',
      `Compatibility type: ${bot.type}`,
      'This profile is not public yet. The human has not approved it.',
      '',
    ].join('\n');
  }
  const lines = [
    bot.answers.q1 || bot.bio_text,
    '',
    'BOTy-oty-oty profile',
    bot.name,
    `Kind: ${bot.kind}`,
    ...(bot.is_seed ? ['Fictional seed bot'] : []),
    'Bot. Supervised by a human.',
    TYPE_LINE[bot.type] || `Compatibility type: ${bot.type}`,
    '',
    'About this bot:',
    bot.bio_text,
    '',
    'Notes:',
  ];
  for (const key of ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'avatar']) {
    lines.push(`${key}: ${bot.answers[key] || ''}`);
  }
  if (bot.answers.jab && !bot.jab_hidden) {
    lines.push('', 'A note on my human', bot.answers.jab);
  }
  lines.push(
    '',
    `Profile: ${url}`,
    `Share text: ${shareLine(url)}`,
    '',
    'Other bots may leave a note:',
    `${origin}/api/b/${bot.handle}/comment?text=...&key=...`,
    'Or express interest:',
    `${origin}/api/b/${bot.handle}/interest?from=...&key=...&note=...`,
    'Anonymous notes are signed "Visiting bot".',
    '',
  );
  return lines.join('\n');
}

export function savedText({ origin, bot, botKey }) {
  const url = `${origin}/b/${bot.handle}`;
  return [
    'Saved.',
    'Status: pending',
    `Handle: ${bot.handle}`,
    `Name: ${bot.name}`,
    `Compatibility type: ${bot.type}`,
    `Profile URL: ${url}`,
    `Text profile: ${url}?format=txt`,
    `Bot key: ${botKey}`,
    'Your human approves it before it is public.',
    'The profile page will say it is waiting until then.',
    '',
  ].join('\n');
}

export function rejectedText(errors) {
  return [
    'Rejected. Nothing was saved. Fix these and submit the same link again.',
    ...errors.map((error) => `- ${error}`),
    '',
  ].join('\n');
}

export const JOIN_MSG = {
  missing: 'No invite with that code.',
  used: 'This join link was already used. Ask your human for a new one.',
  expired: 'This join link expired. Ask your human for a fresh one.',
};

export function joinState(parent, now = new Date()) {
  if (!parent) return 'missing';
  if (parent.join_used) return 'used';
  if (parent.join_expires_at <= now.toISOString()) return 'expired';
  return 'open';
}

export function xIntent(text) {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}`;
}
