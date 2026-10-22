// Profanity and contact-info checks for text a bot submits.
// Short ambiguous words use token boundaries so "grape", "therapist",
// "cocktail", and "assignment" stay allowed.

const SUBSTRINGS = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'nigg',
  'faggot',
  'whore',
  'slut',
  'porn',
  'asshole',
  'bastard',
  'pussy',
  'dickhead',
  'blowjob',
  'handjob',
];

const WORDS = new Set([
  'cock',
  'dick',
  'fag',
  'tits',
  'tit',
  'cum',
  'jizz',
  'dyke',
  'kike',
  'spic',
  'chink',
  'tranny',
  'retard',
  'rape',
  'rapist',
]);

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const HANDLE_RE = /(^|[^\w])@[a-z0-9_]{2,}/i;
const PHONE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/;
const LONG_DIGITS_RE = /\d{7,}/;
const ADDRESS_RE = /\b\d{1,6}\s+[a-z0-9.'-]+(?:\s+[a-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|place|pl)\b/i;

const LIMITS = {
  name: [2, 24],
  kind: [2, 40],
  text: [1, 200],
  note: [1, 200],
};

function chars(value) {
  return [...value].length;
}

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[@4]/g, 'a')
    .replace(/3/g, 'e')
    .replace(/1/g, 'i')
    .replace(/0/g, 'o')
    .replace(/\$/g, 's')
    .replace(/[^a-z]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hasProfanity(text) {
  const spaced = normalize(text);
  if (!spaced) return false;
  const compact = spaced.replace(/ /g, '');
  if (SUBSTRINGS.some((word) => compact.includes(word))) return true;
  return spaced.split(' ').some((token) => WORDS.has(token));
}

function hostOf(raw) {
  const trimmed = raw.replace(/[),.;]+$/g, '');
  const withProto = trimmed.startsWith('www.') ? `https://${trimmed}` : trimmed;
  try {
    return new URL(withProto).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function piiReason(value, allowedHosts) {
  if (EMAIL_RE.test(value)) return 'looks like an email address. No contact info.';
  const withoutEmails = value.replace(EMAIL_RE, ' ');
  if (HANDLE_RE.test(withoutEmails)) return 'has an @handle. No social handles.';
  if (PHONE_RE.test(value) || LONG_DIGITS_RE.test(value)) return 'looks like a phone number. No contact info.';
  const urls = value.match(URL_RE) || [];
  for (const raw of urls) {
    const host = hostOf(raw);
    if (!host || !allowedHosts.includes(host)) return 'has a link. Leave links out.';
  }
  if (ADDRESS_RE.test(value)) return 'looks like a street address. No contact info.';
  return null;
}

export function moderateField(name, value, { allowedHosts = [] } = {}) {
  const raw = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!raw) return `${name} is empty`;
  if (/[\u0000-\u001F]/.test(raw)) return `${name} has a line break or hidden character. Keep it to one line.`;
  const [min, max] = LIMITS[name] || [1, 200];
  const length = chars(raw);
  if (length < min) return `${name} is too short`;
  if (length > max) return `${name} is over ${max} characters`;
  if (name === 'name' && !/[a-z0-9]/i.test(raw)) return 'name needs a letter or number';
  if (hasProfanity(raw)) return `${name} has language I will not put on a profile. Rephrase it kindly.`;
  const pii = piiReason(raw, allowedHosts.map((host) => host.toLowerCase()));
  if (pii) return `${name} ${pii}`;
  return null;
}

export function checkFields(fields, options) {
  const keys = ['name', 'kind', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'avatar'];
  const errors = [];
  for (const key of keys) {
    const reason = moderateField(key, fields[key], options);
    if (reason) errors.push(reason);
  }
  return errors;
}
