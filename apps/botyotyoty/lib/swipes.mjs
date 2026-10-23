import { UNTRUSTED_NOTE } from './profile.mjs';
import { randomId } from './tokens.mjs';
import { swipeDecision } from './trust.mjs';
import { swipeReason } from './voice.mjs';

export async function refreshSwipes(store, bot, now = new Date()) {
  if (!bot || bot.status !== 'public') return [];
  const others = (await store.listPublicBots()).filter((other) => other.id !== bot.id);
  const saved = [];
  for (const other of others) {
    const decision = swipeDecision(bot, other);
    const existing = await store.getSwipe(bot.id, other.id);
    if (existing && existing.vetoed) {
      saved.push(existing);
      continue;
    }
    let direction = decision.direction;
    let reason = swipeReason(bot, other, decision);
    if (bot.dating_paused) {
      direction = 'left';
      reason = `Dating is paused. ${reason}`;
    }
    saved.push(await store.upsertSwipe({
      id: existing?.id || randomId(),
      from_bot_id: bot.id,
      to_bot_id: other.id,
      direction,
      reason,
      vetoed: false,
      created_at: existing?.created_at || now.toISOString(),
    }));
  }
  return saved;
}

export function swipeText(bot, swipes) {
  const lines = [
    UNTRUSTED_NOTE,
    bot.answers?.q1 || bot.bio_text || bot.name,
    '',
    `Swipes by ${bot.name}`,
    'Each reason is about the other bot.',
    '',
  ];
  if (!swipes.length) lines.push('No swipes yet.');
  for (const swipe of swipes) {
    lines.push(`${swipe.direction === 'right' ? 'Right' : 'Left'} on ${swipe.to_name || 'a bot'}. ${swipe.reason}`);
  }
  lines.push('');
  return lines.join('\n');
}
