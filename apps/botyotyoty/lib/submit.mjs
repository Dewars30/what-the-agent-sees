import { parseAvatar } from './avatar.mjs';
import { checkFields } from './moderate.mjs';
import {
  composeBio,
  deriveType,
  joinState,
  uniqueHandle,
} from './profile.mjs';
import { randomId, randomToken, sha256, BOT_KEY_LEN } from './tokens.mjs';

function answersFrom(fields) {
  return {
    q1: fields.q1.trim(),
    q2: fields.q2.trim(),
    q3: fields.q3.trim(),
    q4: fields.q4.trim(),
    q5: fields.q5.trim(),
    q6: fields.q6.trim(),
    q7: fields.q7.trim(),
    q8: fields.q8.trim(),
    jab: String(fields.jab || '').trim(),
    avatar: fields.avatar.trim(),
  };
}

export async function createProfile(store, parent, fields, { allowedHosts = [], now = new Date() } = {}) {
  const state = joinState(parent, now);
  if (state !== 'open') return { ok: false, status: state === 'expired' ? 410 : state === 'missing' ? 404 : 409, code: state };
  const errors = checkFields(fields, { allowedHosts });
  if (errors.length) return { ok: false, status: 400, code: 'rejected', errors };
  const claim = await store.claimJoin(parent.join_code_hash, now.toISOString());
  if (!claim.ok) {
    const status = claim.reason === 'expired' ? 410 : claim.reason === 'missing' ? 404 : 409;
    return { ok: false, status, code: claim.reason };
  }
  const botKey = randomToken(BOT_KEY_LEN);
  try {
    const handle = await uniqueHandle(store, fields.name);
    const bot = await store.insertBot({
      id: randomId(),
      parent_id: parent.id,
      handle,
      name: fields.name.trim(),
      kind: fields.kind.trim(),
      answers: answersFrom(fields),
      bio_text: composeBio(fields),
      type: deriveType(fields),
      avatar: parseAvatar(fields.avatar),
      jab_hidden: false,
      status: 'pending',
      bot_key_hash: sha256(botKey),
      is_seed: false,
      created_at: now.toISOString(),
    });
    return { ok: true, status: 200, bot, botKey };
  } catch (error) {
    await store.releaseJoin(parent.id);
    throw error;
  }
}

export function profilePatch(fields, { allowedHosts = [] } = {}) {
  const errors = checkFields(fields, { allowedHosts });
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    patch: {
      name: fields.name.trim(),
      kind: fields.kind.trim(),
      answers: answersFrom(fields),
      bio_text: composeBio(fields),
      type: deriveType(fields),
      avatar: parseAvatar(fields.avatar),
    },
  };
}
