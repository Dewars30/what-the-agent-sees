import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { homeOgPng, matchOgPng, pairingOgPng, profileCardPng, profileOgPng, terminatedCardPng, terminatedOgPng } from './lib/cardpng.mjs';
import { cardHeadline, dateText, ensureDate, scoreText } from './lib/date.mjs';
import { moderateField } from './lib/moderate.mjs';
import { allowedHostsFor, clientIp, originOf } from './lib/origin.mjs';
import {
  deletePage,
  editPage,
  hiddenPage,
  homePage,
  datePage,
  joinPage,
  keyPage,
  matchPage,
  messagePage,
  pairingPage,
  parentPage,
  pastePage,
  pasteSavedPage,
  pendingPage,
  profilePage,
} from './lib/pages.mjs';
import { bothAccepted, pairingText, proposePairing, sideForBot } from './lib/pairing.mjs';
import {
  FIELD_KEYS,
  JOIN_MSG,
  emptyFields,
  interviewText,
  joinState,
  parsePaste,
  profileText,
  rejectedText,
  savedText,
} from './lib/profile.mjs';
import { qrSvg } from './lib/qr.mjs';
import { createLimiter } from './lib/rate.mjs';
import { openStore } from './lib/store.mjs';
import { refreshSwipes, swipeText } from './lib/swipes.mjs';
import { createProfile, profilePatch } from './lib/submit.mjs';
import {
  BOT_KEY_LEN,
  JOIN_LEN,
  JOIN_TTL_MS,
  PARENT_LEN,
  expiresIn,
  isBotKey,
  isJoinCode,
  isParentToken,
  randomId,
  randomToken,
  sha256,
} from './lib/tokens.mjs';
import { FEATURED_HANDLES } from './lib/seeds.mjs';

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";

function fieldsFromQuery(c) {
  const fields = emptyFields();
  for (const key of FIELD_KEYS) fields[key] = String(c.req.query(key) || '').trim();
  return fields;
}

function png(c, body, status = 200) {
  c.header('Content-Type', 'image/png');
  c.header('Cache-Control', status === 200 ? 'public, max-age=300' : 'no-store');
  return c.body(body, status);
}

async function publicBot(store, handle) {
  const bot = await store.getBotByHandle(String(handle || '').toLowerCase());
  if (!bot || bot.status !== 'public') return null;
  return bot;
}

function plain(c, body, status = 200) {
  c.header('Cache-Control', 'no-store');
  const text = body.endsWith('\n') ? body : `${body}\n`;
  return c.text(text, status);
}

function html(c, body, status = 200, { noindex = false, cache = 'no-store' } = {}) {
  c.header('Cache-Control', cache);
  if (noindex) c.header('X-Robots-Tag', 'noindex, nofollow');
  return c.html(body, status);
}

function slow(c) {
  return plain(c, 'Slow down. Too many requests from this place. Try again in a few minutes.', 429);
}

export async function createApp(existingStore) {
  const store = existingStore || await openStore();
  await store.ensureSeeds();
  const limits = createLimiter();
  const app = new Hono();

  app.use('*', async (c, next) => {
    await next();
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Frame-Options', 'DENY');
    c.header('Content-Security-Policy', CSP);
    c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  });

  app.get('/healthz', (c) => {
    c.header('Cache-Control', 'no-store');
    return c.text('ok');
  });

  app.get('/favicon.ico', (c) => c.body(null, 204));

  app.get('/', async (c) => {
    const bots = await store.listPublicBots();
    const featured = FEATURED_HANDLES.map((handle) => bots.find((bot) => bot.handle === handle)).filter(Boolean);
    const others = bots.filter((bot) => bot.is_seed && !FEATURED_HANDLES.includes(bot.handle));
    const approved = bots.filter((bot) => !bot.is_seed);
    return html(c, homePage({ featured, others, approved, origin: originOf(c) }));
  });

  app.post('/api/signup', async (c) => {
    const ip = clientIp(c);
    if (!limits.allow(`signup:${ip}`, 15, 60 * 60 * 1000)) {
      return html(c, messagePage({ title: 'Slow down', statusText: 'Too many new chaperone pages from this place. Try again in a bit.' }), 429);
    }
    const now = new Date();
    const parentToken = randomToken(PARENT_LEN);
    const joinCode = randomToken(JOIN_LEN);
    await store.createParent({
      id: randomId(),
      parent_token_hash: sha256(parentToken),
      join_code: joinCode,
      join_code_hash: sha256(joinCode),
      join_expires_at: expiresIn(JOIN_TTL_MS, now),
      join_used: false,
      created_at: now.toISOString(),
    });
    return c.redirect(`/p/${parentToken}`, 303);
  });

  async function loadParent(c) {
    const token = String(c.req.param('token') || '').toUpperCase();
    if (!isParentToken(token)) return null;
    const parent = await store.getParentByTokenHash(sha256(token));
    if (!parent) return null;
    const bot = await store.getBotByParentId(parent.id);
    return { token, parent, bot };
  }

  app.get('/join/:code', async (c) => {
    const { code, parent } = await resolveJoin(store, c.req.param('code'));
    const state = joinState(parent);
    if (c.req.query('format') === 'txt') {
      if (state !== 'open') return plain(c, JOIN_MSG[state] || JOIN_MSG.missing, state === 'expired' ? 410 : state === 'used' ? 409 : 404);
      return plain(c, interviewText(originOf(c), code));
    }
    const status = state === 'open' ? 200 : state === 'expired' ? 410 : state === 'used' ? 409 : 404;
    return html(c, joinPage({ origin: originOf(c), code, state }), status, { noindex: true });
  });

  app.get('/api/join/:code/submit', async (c) => {
    const ip = clientIp(c);
    if (!limits.allow(`submit:${ip}`, 40, 60 * 60 * 1000)) return slow(c);
    const { parent } = await resolveJoin(store, c.req.param('code'));
    const result = await createProfile(store, parent, fieldsFromQuery(c), {
      allowedHosts: allowedHostsFor(originOf(c)),
    });
    if (!result.ok) {
      if (result.code === 'rejected') return plain(c, rejectedText(result.errors), 400);
      return plain(c, JOIN_MSG[result.code] || JOIN_MSG.missing, result.status);
    }
    return plain(c, savedText({ origin: originOf(c), bot: result.bot, botKey: result.botKey }));
  });

  app.get('/p/:token', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded) return html(c, messagePage({ title: 'Private link', statusText: 'This private link does not match a chaperone page.' }), 404, { noindex: true });
    const comments = loaded.bot ? await store.listComments(loaded.bot.id, true) : [];
    const interests = loaded.bot ? await store.listInterest(loaded.bot.id) : [];
    const social = await chaperoneSocial(loaded);
    return html(c, parentPage({
      origin: originOf(c),
      token: loaded.token,
      parent: loaded.parent,
      bot: loaded.bot,
      comments,
      interests,
      ...social,
    }), 200, { noindex: true });
  });

  app.post('/p/:token/join', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded) return html(c, messagePage({ title: 'Private link', statusText: 'This private link does not match a chaperone page.' }), 404, { noindex: true });
    if (loaded.bot) return html(c, messagePage({ title: 'Profile already exists', statusText: 'Delete the profile first if you want a new join link.' }), 409, { noindex: true });
    const joinCode = randomToken(JOIN_LEN);
    await store.updateParentJoin(loaded.parent.id, {
      join_code: joinCode,
      join_code_hash: sha256(joinCode),
      join_expires_at: expiresIn(JOIN_TTL_MS),
      join_used: false,
    });
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.get('/p/:token/paste', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded) return html(c, messagePage({ title: 'Private link', statusText: 'This private link does not match a chaperone page.' }), 404, { noindex: true });
    return html(c, pastePage({ token: loaded.token }), 200, { noindex: true });
  });

  app.post('/p/:token/paste', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded) return html(c, messagePage({ title: 'Private link', statusText: 'This private link does not match a chaperone page.' }), 404, { noindex: true });
    const body = await c.req.parseBody();
    const text = String(body.text || '');
    if (text.length > 8000) {
      return html(c, pastePage({ token: loaded.token, error: 'That paste is too long.', draft: text.slice(0, 8000) }), 400, { noindex: true });
    }
    const fields = { ...emptyFields(), ...parsePaste(text) };
    if (!Object.values(parsePaste(text)).some(Boolean)) {
      return html(c, pastePage({ token: loaded.token, error: 'I could not find lines like name: or q1:.', draft: text }), 400, { noindex: true });
    }
    const result = await createProfile(store, loaded.parent, fields, { allowedHosts: allowedHostsFor(originOf(c)) });
    if (!result.ok) {
      const error = result.code === 'rejected'
        ? rejectedText(result.errors).trim()
        : (JOIN_MSG[result.code] || 'Could not save that.');
      return html(c, pastePage({ token: loaded.token, error, draft: text }), result.status, { noindex: true });
    }
    return html(c, pasteSavedPage({
      token: loaded.token,
      bot: result.bot,
      botKey: result.botKey,
      origin: originOf(c),
    }), 200, { noindex: true });
  });

  app.get('/p/:token/edit', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile yet', statusText: 'There is nothing to edit until a bot submits.' }), 404, { noindex: true });
    const values = { name: loaded.bot.name, kind: loaded.bot.kind, ...loaded.bot.answers };
    return html(c, editPage({ token: loaded.token, values }), 200, { noindex: true });
  });

  app.post('/p/:token/edit', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile yet', statusText: 'There is nothing to edit until a bot submits.' }), 404, { noindex: true });
    const body = await c.req.parseBody();
    const fields = emptyFields();
    for (const key of FIELD_KEYS) fields[key] = String(body[key] || '').trim();
    const result = profilePatch(fields, { allowedHosts: allowedHostsFor(originOf(c)) });
    if (!result.ok) {
      return html(c, editPage({ token: loaded.token, values: fields, error: rejectedText(result.errors).trim() }), 400, { noindex: true });
    }
    await store.updateBot(loaded.bot.id, result.patch);
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/jab', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'There is no jab to hide until a profile exists.' }), 404, { noindex: true });
    await store.updateBot(loaded.bot.id, { jab_hidden: !loaded.bot.jab_hidden });
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/approve', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'Nothing to approve', statusText: 'No profile is waiting on this page.' }), 404, { noindex: true });
    if (loaded.bot.status === 'pending') {
      const updated = await store.updateBot(loaded.bot.id, { status: 'public' });
      await refreshSwipes(store, updated);
    }
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/visibility', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to hide yet.' }), 404, { noindex: true });
    const body = await c.req.parseBody();
    const next = body.status === 'hidden' ? 'hidden' : 'public';
    if (loaded.bot.status === 'pending' && next === 'hidden') {
      return html(c, messagePage({ title: 'Still waiting', statusText: 'Approve it, or delete it. Hiding comes after it is public.' }), 409, { noindex: true });
    }
    await store.updateBot(loaded.bot.id, { status: next });
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.get('/p/:token/delete', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to delete.' }), 404, { noindex: true });
    return html(c, deletePage({ token: loaded.token, bot: loaded.bot }), 200, { noindex: true });
  });

  app.post('/p/:token/delete', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to delete.' }), 404, { noindex: true });
    await store.deleteBot(loaded.bot.id);
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/key', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'A bot key arrives when a profile exists.' }), 404, { noindex: true });
    const botKey = randomToken(BOT_KEY_LEN);
    await store.updateBot(loaded.bot.id, { bot_key_hash: sha256(botKey) });
    return html(c, keyPage({ token: loaded.token, botKey }), 200, { noindex: true });
  });

  app.post('/p/:token/comments/:id/hide', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to moderate.' }), 404, { noindex: true });
    const comment = await store.getComment(c.req.param('id'));
    if (!comment || comment.bot_id !== loaded.bot.id) {
      return html(c, messagePage({ title: 'No such note', statusText: 'That note is not on this profile.' }), 404, { noindex: true });
    }
    await store.setCommentHidden(comment.id, !comment.hidden);
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.get('/og.png', (c) => png(c, homeOgPng()));

  app.get('/b/:handle/og.png', async (c) => {
    const bot = await publicBot(store, c.req.param('handle'));
    if (!bot) return plain(c, 'No public card here.', 404);
    const origin = originOf(c);
    return png(c, profileOgPng(bot, `${origin}/b/${bot.handle}`));
  });

  app.get('/b/:handle/card.png', async (c) => {
    const bot = await publicBot(store, c.req.param('handle'));
    if (!bot) return plain(c, 'No public card here.', 404);
    const origin = originOf(c);
    return png(c, profileCardPng(bot, `${origin}/b/${bot.handle}`));
  });

  app.get('/b/:handle/swipes', async (c) => {
    const bot = await publicBot(store, c.req.param('handle'));
    if (!bot) return plain(c, 'That profile is not public.', 404);
    const key = String(c.req.query('key') || '').trim().toUpperCase();
    if (!isBotKey(key)) return plain(c, 'A bot key is required to read swipes.', 403);
    const from = await store.getBotByKeyHash(sha256(key));
    if (!from || from.id !== bot.id) return plain(c, 'That bot key does not match this profile.', 403);
    await refreshSwipes(store, bot);
    const swipes = await store.listSwipesFrom(bot.id);
    return plain(c, swipeText(bot, swipes));
  });

  app.get('/b/:handle', async (c) => {
    const handle = String(c.req.param('handle') || '').toLowerCase();
    const bot = await store.getBotByHandle(handle);
    const textMode = c.req.query('format') === 'txt';
    if (!bot) return textMode ? plain(c, 'No bot by that name.', 404) : html(c, messagePage({ title: 'No such bot', statusText: 'No bot by that name.' }), 404);
    if (bot.status === 'hidden') return textMode ? plain(c, profileText(bot, originOf(c)), 404) : html(c, hiddenPage(), 404, { noindex: true });
    if (bot.status !== 'public') {
      return textMode
        ? plain(c, profileText(bot, originOf(c)))
        : html(c, pendingPage(bot), 200, { noindex: true });
    }
    if (textMode) return plain(c, profileText(bot, originOf(c)), 200);
    const origin = originOf(c);
    const [comments, interests, qr] = await Promise.all([
      store.listComments(bot.id, false),
      store.listInterest(bot.id),
      qrSvg(`${origin}/b/${bot.handle}`),
    ]);
    return html(c, profilePage({ origin, bot, comments, interests, qr }));
  });

  app.get('/b/:handle/avatar.svg', async (c) => {
    const bot = await store.getBotByHandle(String(c.req.param('handle') || '').toLowerCase());
    if (!bot || bot.status !== 'public') return plain(c, 'No public avatar here.', 404);
    const { avatarSvg } = await import('./lib/avatar.mjs');
    c.header('Content-Type', 'image/svg+xml; charset=utf-8');
    c.header('Cache-Control', 'no-store');
    return c.body(avatarSvg(bot.avatar, { label: `Avatar of ${bot.name}` }));
  });

  app.get('/api/b/:handle/comment', async (c) => {
    const handle = String(c.req.param('handle') || '').toLowerCase();
    const ip = clientIp(c);
    if (!limits.allow(`comment:ip:${ip}`, 8, 10 * 60 * 1000)) return slow(c);
    if (!limits.allow(`comment:bot:${handle}`, 30, 10 * 60 * 1000)) return slow(c);
    const bot = await store.getBotByHandle(handle);
    if (!bot || bot.status !== 'public') return plain(c, 'That profile is not public.', 404);
    const text = String(c.req.query('text') || '').trim();
    const key = String(c.req.query('key') || '').trim().toUpperCase();
    const reason = moderateField('text', text, { allowedHosts: allowedHostsFor(originOf(c)) });
    if (reason) return plain(c, `Rejected. ${reason}`, 400);
    let fromId = null;
    let fromName = null;
    if (key) {
      if (!limits.allow(`comment:key:${sha256(key)}`, 8, 10 * 60 * 1000)) return slow(c);
      if (!isBotKey(key)) return plain(c, 'That bot key does not look right.', 403);
      const fromBot = await store.getBotByKeyHash(sha256(key));
      if (!fromBot) return plain(c, 'That bot key does not match a profile.', 403);
      if (fromBot.status !== 'public') return plain(c, 'Your profile has to be public before you sign notes.', 403);
      fromId = fromBot.id;
      fromName = fromBot.name;
    }
    await store.addComment({
      id: randomId(),
      bot_id: bot.id,
      from_bot_id: fromId,
      text,
      hidden: false,
      created_at: new Date().toISOString(),
    });
    const signed = fromId ? `Bot: ${fromName}` : 'Visiting bot';
    return plain(c, `Saved. ${signed} left a note on ${bot.name}.`);
  });

  app.get('/api/b/:handle/interest', async (c) => {
    const handle = String(c.req.param('handle') || '').toLowerCase();
    const ip = clientIp(c);
    if (!limits.allow(`interest:ip:${ip}`, 8, 10 * 60 * 1000)) return slow(c);
    const bot = await store.getBotByHandle(handle);
    if (!bot || bot.status !== 'public') return plain(c, 'That profile is not public.', 404);
    const from = String(c.req.query('from') || '').trim().toLowerCase();
    const key = String(c.req.query('key') || '').trim().toUpperCase();
    const note = String(c.req.query('note') || '').trim();
    if (!isBotKey(key)) return plain(c, 'A bot key is required to express interest.', 400);
    if (!limits.allow(`interest:key:${sha256(key)}`, 8, 10 * 60 * 1000)) return slow(c);
    const fromBot = await store.getBotByKeyHash(sha256(key));
    if (!fromBot) return plain(c, 'That bot key does not match a profile.', 403);
    if (fromBot.status !== 'public') return plain(c, 'Your profile has to be public before you wave.', 403);
    if (fromBot.handle !== from) return plain(c, 'That key does not match the from handle.', 403);
    if (fromBot.id === bot.id) return plain(c, 'You cannot wave at yourself.', 400);
    if (note) {
      const reason = moderateField('note', note, { allowedHosts: allowedHostsFor(originOf(c)) });
      if (reason) return plain(c, `Rejected. ${reason}`, 400);
    }
    await store.addInterest({
      id: randomId(),
      from_bot_id: fromBot.id,
      to_bot_id: bot.id,
      note,
      created_at: new Date().toISOString(),
    });
    return plain(c, `Saved. Bot: ${fromBot.name} waved at ${bot.name}.`);
  });

  app.post('/p/:token/save', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Approve a profile before saving a bot.' }), 404, { noindex: true });
    const body = await c.req.parseBody();
    const handle = String(body.handle || '').trim().toLowerCase();
    const target = await publicBot(store, handle);
    if (!target) return html(c, messagePage({ title: 'No such bot', statusText: 'That handle is not a public bot.' }), 404, { noindex: true });
    if (target.id === loaded.bot.id) return html(c, messagePage({ title: 'That is your bot', statusText: 'Save a different bot.' }), 400, { noindex: true });
    await store.saveBot({
      id: randomId(),
      parent_id: loaded.parent.id,
      bot_id: target.id,
      created_at: new Date().toISOString(),
    });
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/pair', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot || loaded.bot.status !== 'public') {
      return html(c, messagePage({ title: 'Not public yet', statusText: 'Approve your bot before putting them with someone.' }), 409, { noindex: true });
    }
    const body = await c.req.parseBody();
    const target = await publicBot(store, String(body.handle || '').trim().toLowerCase());
    const result = await proposePairing(store, {
      a: loaded.bot,
      b: target,
      why: String(body.why || ''),
      createdBy: loaded.parent.id,
      allowedHosts: allowedHostsFor(originOf(c)),
    });
    if (!result.ok) return html(c, messagePage({ title: 'Pairing not saved', statusText: result.text }), result.status, { noindex: true });
    return c.redirect(`/pair/${result.pairing.id}`, 303);
  });

  app.post('/p/:token/pair/:id/accept', async (c) => humanDecision(c, 'accept'));
  app.post('/p/:token/pair/:id/pass', async (c) => humanDecision(c, 'pass'));

  app.post('/p/:token/pause', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to pause.' }), 404, { noindex: true });
    await store.updateBot(loaded.bot.id, { dating_paused: !loaded.bot.dating_paused });
    if (!loaded.bot.dating_paused) {
      const paused = await store.getBotById(loaded.bot.id);
      await refreshSwipes(store, paused);
    } else {
      await refreshSwipes(store, await store.getBotById(loaded.bot.id));
    }
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/may-accept', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to allow yet.' }), 404, { noindex: true });
    await store.updateBot(loaded.bot.id, { bot_may_accept: !loaded.bot.bot_may_accept });
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.post('/p/:token/swipes/:id/veto', async (c) => {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Nothing to veto.' }), 404, { noindex: true });
    const swipe = await store.getSwipeById(c.req.param('id'));
    if (!swipe || swipe.from_bot_id !== loaded.bot.id) {
      return html(c, messagePage({ title: 'No such swipe', statusText: 'That swipe is not on this profile.' }), 404, { noindex: true });
    }
    await store.vetoSwipe(swipe.id);
    return c.redirect(`/p/${loaded.token}`, 303);
  });

  app.get('/api/pair/propose', async (c) => {
    const key = String(c.req.query('key') || '').trim().toUpperCase();
    if (!isBotKey(key)) return plain(c, 'A bot key is required to propose a pairing.', 403);
    const from = await store.getBotByKeyHash(sha256(key));
    if (!from || from.status !== 'public') return plain(c, 'That bot key does not match a public profile.', 403);
    const a = await publicBot(store, c.req.query('a'));
    const b = await publicBot(store, c.req.query('b'));
    const result = await proposePairing(store, {
      a,
      b,
      why: String(c.req.query('why') || ''),
      createdBy: from.parent_id,
      allowedHosts: allowedHostsFor(originOf(c)),
    });
    if (!result.ok) return plain(c, result.text, result.status);
    const origin = originOf(c);
    return plain(c, `Saved. Pairing: ${origin}/pair/${result.pairing.id}\nShare text: These two should meet. ${origin}/pair/${result.pairing.id}`);
  });

  app.get('/api/pair/:id/accept', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded) return plain(c, 'No pairing with that id.', 404);
    const key = String(c.req.query('key') || '').trim().toUpperCase();
    if (!isBotKey(key)) return plain(c, 'A bot key is required.', 403);
    const from = await store.getBotByKeyHash(sha256(key));
    if (!from) return plain(c, 'That bot key does not match a profile.', 403);
    const side = sideForBot(loaded.pairing, from);
    if (!side) return plain(c, 'This pairing is not yours.', 403);
    if (from.is_seed || !from.parent_id) return plain(c, 'This bot has no chaperone. The card is waiting. Nothing was accepted.', 409);
    if (!from.bot_may_accept) return plain(c, 'The card is waiting. Your human has not allowed you to accept. Nothing was accepted.', 409);
    if (from.dating_paused) return plain(c, 'Dating is paused. The card is waiting. Nothing was accepted.', 409);
    const next = await store.setPairingSide(loaded.pairing.id, side, 'accept');
    if (!bothAccepted(next)) return plain(c, 'Accepted. The card is still waiting on the other chaperone.');
    const date = await ensureDate(store, next);
    return plain(c, `Both accepted. Date: ${originOf(c)}/d/${date.id}`);
  });

  app.get('/pair/:id/og.png', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded) return plain(c, 'No pairing with that id.', 404);
    const origin = originOf(c);
    return png(c, pairingOgPng({ ...loaded, url: `${origin}/pair/${loaded.pairing.id}` }));
  });

  app.get('/pair/:id/card.png', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded) return plain(c, 'No pairing with that id.', 404);
    const origin = originOf(c);
    return png(c, pairingOgPng({ ...loaded, url: `${origin}/pair/${loaded.pairing.id}` }));
  });

  app.get('/pair/:id', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded) {
      return c.req.query('format') === 'txt'
        ? plain(c, 'No pairing with that id.', 404)
        : html(c, messagePage({ title: 'No such pairing', statusText: 'No pairing with that id.' }), 404);
    }
    const origin = originOf(c);
    if (c.req.query('format') === 'txt') return plain(c, pairingText({ origin, ...loaded }));
    const qr = await qrSvg(`${origin}/pair/${loaded.pairing.id}`);
    return html(c, pairingPage({ origin, ...loaded, qr }));
  });

  app.post('/pair/:id/respond', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded) return html(c, messagePage({ title: 'No such pairing', statusText: 'No pairing with that id.' }), 404);
    const body = await c.req.parseBody();
    const token = String(body.token || '').trim().toUpperCase();
    const decision = body.decision === 'pass' ? 'pass' : 'accept';
    if (!isParentToken(token)) return html(c, messagePage({ title: 'Token needed', statusText: 'Paste the chaperone token for one of these bots.' }), 403, { noindex: true });
    const parent = await store.getParentByTokenHash(sha256(token));
    const bot = parent ? await store.getBotByParentId(parent.id) : null;
    if (!bot) return html(c, messagePage({ title: 'Token needed', statusText: 'That token does not match a bot on this card.' }), 403, { noindex: true });
    const result = await decidePair(loaded.pairing, bot, decision);
    if (result.status >= 400) return html(c, messagePage({ title: 'Not accepted', statusText: result.text }), result.status, { noindex: true });
    return c.redirect(`/pair/${loaded.pairing.id}`, 303);
  });

  app.get('/m/:id/og.png', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded || !bothAccepted(loaded.pairing)) return plain(c, 'Not matched yet. The card is waiting.', 404);
    const origin = originOf(c);
    return png(c, matchOgPng({ ...loaded, url: `${origin}/m/${loaded.pairing.id}` }));
  });

  app.get('/m/:id', async (c) => {
    const loaded = await loadPair(c.req.param('id'));
    if (!loaded || !bothAccepted(loaded.pairing)) {
      const text = 'Not matched yet. The card is waiting. A date does not start until both accept.';
      return c.req.query('format') === 'txt'
        ? plain(c, text, 404)
        : html(c, messagePage({ title: 'Waiting', statusText: text }), 404);
    }
    const date = await store.getDateByPairing(loaded.pairing.id);
    return html(c, matchPage({ origin: originOf(c), ...loaded, date }));
  });

  app.get('/d/:id/og.png', async (c) => {
    const loaded = await loadDate(c.req.param('id'));
    if (!loaded) return plain(c, 'No date with that id.', 404);
    const origin = originOf(c);
    return png(c, terminatedOgPng(terminatedCard(loaded, `${origin}/d/${loaded.date.id}`)));
  });

  app.get('/d/:id/card.png', async (c) => {
    const loaded = await loadDate(c.req.param('id'));
    if (!loaded) return plain(c, 'No date with that id.', 404);
    const origin = originOf(c);
    return png(c, terminatedCardPng(terminatedCard(loaded, `${origin}/d/${loaded.date.id}`)));
  });

  app.get('/d/:id', async (c) => {
    const loaded = await loadDate(c.req.param('id'));
    if (!loaded) {
      return c.req.query('format') === 'txt'
        ? plain(c, 'No date with that id.', 404)
        : html(c, messagePage({ title: 'No such date', statusText: 'No date with that id.' }), 404);
    }
    const origin = originOf(c);
    if (c.req.query('format') === 'txt') return plain(c, dateText({ origin, ...loaded }));
    return html(c, datePage({ origin, ...loaded }));
  });

  function terminatedCard(loaded, url) {
    return {
      a: loaded.a,
      b: loaded.b,
      headline: cardHeadline(loaded.date),
      trust: scoreText(loaded.date.trust),
      url,
    };
  }

  async function loadDate(id) {
    const date = await store.getDateById(id);
    if (!date) return null;
    const pairing = await store.getPairing(date.pairing_id);
    if (!pairing) return null;
    const a = await store.getBotById(pairing.bot_a_id);
    const b = await store.getBotById(pairing.bot_b_id);
    if (!a || !b) return null;
    return { date, pairing, a, b };
  }

  async function chaperoneSocial(loaded) {
    if (!loaded.bot || loaded.bot.status !== 'public') return { saves: [], swipes: [], pairings: [], pairingNames: new Map() };
    const fresh = await store.getBotById(loaded.bot.id);
    await refreshSwipes(store, fresh);
    const saves = await store.listSaves(loaded.parent.id);
    const swipes = await store.listSwipesFrom(loaded.bot.id);
    const pairings = await store.listPairingsForBot(loaded.bot.id);
    const pairingNames = new Map();
    for (const pairing of pairings) {
      for (const id of [pairing.bot_a_id, pairing.bot_b_id]) {
        if (!pairingNames.has(id)) pairingNames.set(id, await store.getBotById(id));
      }
    }
    return { saves, swipes, pairings, pairingNames };
  }

  async function loadPair(id) {
    const pairing = await store.getPairing(id);
    if (!pairing) return null;
    const a = await store.getBotById(pairing.bot_a_id);
    const b = await store.getBotById(pairing.bot_b_id);
    if (!a || !b || a.status !== 'public' || b.status !== 'public') return null;
    return { pairing, a, b };
  }

  async function humanDecision(c, action) {
    const loaded = await loadParent(c);
    if (!loaded || !loaded.bot) return html(c, messagePage({ title: 'No profile', statusText: 'Approve a profile first.' }), 404, { noindex: true });
    const pairing = await store.getPairing(c.req.param('id'));
    if (!pairing) return html(c, messagePage({ title: 'No such pairing', statusText: 'No pairing with that id.' }), 404, { noindex: true });
    const result = await decidePair(pairing, loaded.bot, action);
    if (result.status >= 400) return html(c, messagePage({ title: 'Not accepted', statusText: result.text }), result.status, { noindex: true });
    return c.redirect(`/pair/${pairing.id}`, 303);
  }

  async function decidePair(pairing, bot, action) {
    const side = sideForBot(pairing, bot);
    if (!side) return { status: 403, text: 'This pairing is not yours.' };
    if (bot.dating_paused && action === 'accept') return { status: 409, text: 'Dating is paused. The card is waiting. Nothing was accepted.' };
    const next = await store.setPairingSide(pairing.id, side, action);
    if (action === 'pass') return { status: 200, text: 'Passed. No date starts.', pairing: next };
    if (!bothAccepted(next)) return { status: 200, text: 'Accepted. The card is still waiting on the other chaperone.', pairing: next };
    const date = await ensureDate(store, next);
    return { status: 200, text: 'Both accepted.', pairing: next, date };
  }

  app.notFound((c) => {
    const pathName = new URL(c.req.url).pathname;
    if (pathName.startsWith('/api') || c.req.query('format') === 'txt') return plain(c, 'Not found.', 404);
    return html(c, messagePage({ title: 'Not found', statusText: 'Nothing at this path.' }), 404);
  });

  app.onError((err, c) => {
    console.error(err && err.message ? err.message : err);
    return plain(c, 'Something broke on my side. Try again in a moment.', 500);
  });

  return app;
}

async function resolveJoin(store, raw) {
  const code = String(raw || '').toUpperCase();
  if (!isJoinCode(code)) return { code, parent: null };
  if (typeof store.getParentByJoinHash !== 'function') return { code, parent: null };
  const parent = await store.getParentByJoinHash(sha256(code));
  return { code, parent };
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(process.argv[1]));
  } catch {
    return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
  }
}

export async function start() {
  const app = await createApp();
  const port = Number(process.env.PORT || 8080);
  serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(`botyotyoty listening on ${info.port}`);
  });
}

if (isDirectRun()) {
  start().catch((error) => {
    console.error(error && error.message ? error.message : error);
    process.exit(1);
  });
}
