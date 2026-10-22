import { SEEDS } from './seeds.mjs';

function cloneBot(row) {
  if (!row) return null;
  return {
    ...row,
    answers: { ...row.answers },
    avatar: { ...row.avatar },
    is_seed: Boolean(row.is_seed),
    parent_id: row.parent_id ?? null,
    bot_key_hash: row.bot_key_hash ?? null,
  };
}

function cloneParent(row) {
  if (!row) return null;
  return { ...row, join_used: Boolean(row.join_used) };
}

function sortPublic(list) {
  return [...list].sort((a, b) => {
    if (a.is_seed !== b.is_seed) return a.is_seed ? -1 : 1;
    if (a.is_seed) return a.created_at < b.created_at ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

export function createMemoryStore() {
  const parents = new Map();
  const parentByToken = new Map();
  const parentByJoin = new Map();
  const bots = new Map();
  const botByHandle = new Map();
  const comments = new Map();
  const interests = new Map();

  const api = {
    kind: 'memory',
    async migrate() {},
    async ensureSeeds() {
      for (const [index, seed] of SEEDS.entries()) {
        if (botByHandle.has(seed.handle)) continue;
        await api.insertBot({
          id: `seed-${seed.handle}`,
          parent_id: null,
          handle: seed.handle,
          name: seed.name,
          kind: seed.kind,
          answers: seed.answers,
          bio_text: seed.bio_text,
          type: seed.type,
          avatar: seed.avatar,
          status: 'public',
          bot_key_hash: null,
          is_seed: true,
          created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
        });
      }
    },
    async createParent(row) {
      const saved = {
        id: row.id,
        parent_token_hash: row.parent_token_hash,
        join_code: row.join_code,
        join_code_hash: row.join_code_hash,
        join_expires_at: row.join_expires_at,
        join_used: Boolean(row.join_used),
        created_at: row.created_at,
      };
      parents.set(saved.id, saved);
      parentByToken.set(saved.parent_token_hash, saved);
      parentByJoin.set(saved.join_code_hash, saved);
      return cloneParent(saved);
    },
    async getParentByTokenHash(hash) {
      return cloneParent(parentByToken.get(hash));
    },
    async getParentByJoinHash(hash) {
      return cloneParent(parentByJoin.get(hash));
    },
    async getParentById(id) {
      return cloneParent(parents.get(id));
    },
    async claimJoin(hash, nowIso) {
      const row = parentByJoin.get(hash);
      if (!row) return { ok: false, reason: 'missing' };
      if (row.join_used) return { ok: false, reason: 'used' };
      if (row.join_expires_at <= nowIso) return { ok: false, reason: 'expired' };
      row.join_used = true;
      return { ok: true, parent: cloneParent(row) };
    },
    async releaseJoin(id) {
      const row = parents.get(id);
      if (row) row.join_used = false;
    },
    async updateParentJoin(id, fields) {
      const row = parents.get(id);
      if (!row) return null;
      parentByJoin.delete(row.join_code_hash);
      row.join_code = fields.join_code;
      row.join_code_hash = fields.join_code_hash;
      row.join_expires_at = fields.join_expires_at;
      row.join_used = Boolean(fields.join_used);
      parentByJoin.set(row.join_code_hash, row);
      return cloneParent(row);
    },
    async insertBot(row) {
      if (botByHandle.has(row.handle)) {
        const error = new Error('handle already exists');
        error.code = 'UNIQUE';
        throw error;
      }
      const saved = cloneBot(row);
      bots.set(saved.id, saved);
      botByHandle.set(saved.handle, saved);
      return cloneBot(saved);
    },
    async getBotByHandle(handle) {
      return cloneBot(botByHandle.get(handle));
    },
    async getBotById(id) {
      return cloneBot(bots.get(id));
    },
    async getBotByParentId(parentId) {
      const found = [...bots.values()].filter((bot) => bot.parent_id === parentId);
      found.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return cloneBot(found[0]);
    },
    async getBotByKeyHash(hash) {
      if (!hash) return null;
      const found = [...bots.values()].find((bot) => bot.bot_key_hash === hash);
      return cloneBot(found);
    },
    async listPublicBots() {
      return sortPublic([...bots.values()].filter((bot) => bot.status === 'public')).map(cloneBot);
    },
    async updateBot(id, patch) {
      const row = bots.get(id);
      if (!row) return null;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.kind !== undefined) row.kind = patch.kind;
      if (patch.answers !== undefined) row.answers = { ...patch.answers };
      if (patch.bio_text !== undefined) row.bio_text = patch.bio_text;
      if (patch.type !== undefined) row.type = patch.type;
      if (patch.avatar !== undefined) row.avatar = { ...patch.avatar };
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.bot_key_hash !== undefined) row.bot_key_hash = patch.bot_key_hash;
      return cloneBot(row);
    },
    async deleteBot(id) {
      const row = bots.get(id);
      if (!row) return;
      bots.delete(id);
      botByHandle.delete(row.handle);
      for (const [cid, comment] of comments) {
        if (comment.bot_id === id || comment.from_bot_id === id) comments.delete(cid);
      }
      for (const [iid, interest] of interests) {
        if (interest.to_bot_id === id || interest.from_bot_id === id) interests.delete(iid);
      }
    },
    async addComment(row) {
      comments.set(row.id, { ...row, hidden: Boolean(row.hidden) });
      return { ...comments.get(row.id) };
    },
    async listComments(botId, includeHidden = false) {
      return [...comments.values()]
        .filter((comment) => comment.bot_id === botId && (includeHidden || !comment.hidden))
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        .map((comment) => ({
          ...comment,
          from_name: comment.from_bot_id ? bots.get(comment.from_bot_id)?.name || null : null,
        }));
    },
    async getComment(id) {
      const comment = comments.get(id);
      return comment ? { ...comment } : null;
    },
    async setCommentHidden(id, hidden) {
      const comment = comments.get(id);
      if (!comment) return null;
      comment.hidden = Boolean(hidden);
      return { ...comment };
    },
    async addInterest(row) {
      interests.set(row.id, { ...row });
      return { ...row };
    },
    async listInterest(botId) {
      return [...interests.values()]
        .filter((item) => item.to_bot_id === botId)
        .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
        .map((item) => {
          const from = item.from_bot_id ? bots.get(item.from_bot_id) : null;
          return { ...item, from_name: from?.name || null, from_handle: from?.handle || null };
        });
    },
  };
  return api;
}

const PARENT_COLS = `id, parent_token_hash, join_code, join_code_hash, join_expires_at, join_used, created_at`;

function parentOut(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    parent_token_hash: String(row.parent_token_hash),
    join_code: String(row.join_code),
    join_code_hash: String(row.join_code_hash),
    join_expires_at: String(row.join_expires_at),
    join_used: Number(row.join_used) === 1,
    created_at: String(row.created_at),
  };
}

function botOut(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    parent_id: row.parent_id == null ? null : String(row.parent_id),
    handle: String(row.handle),
    name: String(row.name),
    kind: String(row.kind),
    answers: JSON.parse(row.answers_json),
    bio_text: String(row.bio_text),
    type: String(row.type),
    avatar: JSON.parse(row.avatar_json),
    status: String(row.status),
    bot_key_hash: row.bot_key_hash == null ? null : String(row.bot_key_hash),
    is_seed: Number(row.is_seed) === 1,
    created_at: String(row.created_at),
  };
}

async function one(client, sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows[0] || null;
}

async function many(client, sql, args = []) {
  const result = await client.execute({ sql, args });
  return result.rows;
}

export function createLibsqlStore(client) {
  return {
    kind: 'libsql',
    async migrate() {
      await client.batch([
        `CREATE TABLE IF NOT EXISTS parents (
          id TEXT PRIMARY KEY,
          parent_token_hash TEXT NOT NULL UNIQUE,
          join_code TEXT NOT NULL UNIQUE,
          join_code_hash TEXT NOT NULL UNIQUE,
          join_expires_at TEXT NOT NULL,
          join_used INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS bots (
          id TEXT PRIMARY KEY,
          parent_id TEXT,
          handle TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          answers_json TEXT NOT NULL,
          bio_text TEXT NOT NULL,
          type TEXT NOT NULL,
          avatar_json TEXT NOT NULL,
          status TEXT NOT NULL,
          bot_key_hash TEXT,
          is_seed INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS bots_key ON bots(bot_key_hash)`,
        `CREATE INDEX IF NOT EXISTS bots_parent ON bots(parent_id)`,
        `CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          bot_id TEXT NOT NULL,
          from_bot_id TEXT,
          text TEXT NOT NULL,
          hidden INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS comments_bot ON comments(bot_id)`,
        `CREATE TABLE IF NOT EXISTS interest (
          id TEXT PRIMARY KEY,
          from_bot_id TEXT NOT NULL,
          to_bot_id TEXT NOT NULL,
          note TEXT NOT NULL,
          created_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS interest_to ON interest(to_bot_id)`,
      ], 'write');
    },
    async ensureSeeds() {
      for (const [index, seed] of SEEDS.entries()) {
        const existing = await one(client, 'SELECT handle FROM bots WHERE handle = ?', [seed.handle]);
        if (existing) continue;
        try {
          await this.insertBot({
            id: `seed-${seed.handle}`,
            parent_id: null,
            handle: seed.handle,
            name: seed.name,
            kind: seed.kind,
            answers: seed.answers,
            bio_text: seed.bio_text,
            type: seed.type,
            avatar: seed.avatar,
            status: 'public',
            bot_key_hash: null,
            is_seed: true,
            created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
          });
        } catch (error) {
          if (!/unique|constraint/i.test(String(error && error.message))) throw error;
        }
      }
    },
    async createParent(row) {
      await client.execute({
        sql: `INSERT INTO parents (${PARENT_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          row.id,
          row.parent_token_hash,
          row.join_code,
          row.join_code_hash,
          row.join_expires_at,
          row.join_used ? 1 : 0,
          row.created_at,
        ],
      });
      return this.getParentById(row.id);
    },
    async getParentByTokenHash(hash) {
      return parentOut(await one(client, `SELECT ${PARENT_COLS} FROM parents WHERE parent_token_hash = ?`, [hash]));
    },
    async getParentById(id) {
      return parentOut(await one(client, `SELECT ${PARENT_COLS} FROM parents WHERE id = ?`, [id]));
    },
    async claimJoin(hash, nowIso) {
      const updated = await client.execute({
        sql: `UPDATE parents SET join_used = 1
              WHERE join_code_hash = ? AND join_used = 0 AND join_expires_at > ?`,
        args: [hash, nowIso],
      });
      if (Number(updated.rowsAffected) === 1) {
        return { ok: true, parent: await this.getParentByJoinHash(hash) };
      }
      const row = await this.getParentByJoinHash(hash);
      if (!row) return { ok: false, reason: 'missing' };
      if (row.join_used) return { ok: false, reason: 'used' };
      return { ok: false, reason: 'expired' };
    },
    async getParentByJoinHash(hash) {
      return parentOut(await one(client, `SELECT ${PARENT_COLS} FROM parents WHERE join_code_hash = ?`, [hash]));
    },
    async releaseJoin(id) {
      await client.execute({ sql: 'UPDATE parents SET join_used = 0 WHERE id = ?', args: [id] });
    },
    async updateParentJoin(id, fields) {
      await client.execute({
        sql: `UPDATE parents
              SET join_code = ?, join_code_hash = ?, join_expires_at = ?, join_used = ?
              WHERE id = ?`,
        args: [fields.join_code, fields.join_code_hash, fields.join_expires_at, fields.join_used ? 1 : 0, id],
      });
      return this.getParentById(id);
    },
    async insertBot(row) {
      await client.execute({
        sql: `INSERT INTO bots (
          id, parent_id, handle, name, kind, answers_json, bio_text, type, avatar_json, status, bot_key_hash, is_seed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          row.id,
          row.parent_id,
          row.handle,
          row.name,
          row.kind,
          JSON.stringify(row.answers),
          row.bio_text,
          row.type,
          JSON.stringify(row.avatar),
          row.status,
          row.bot_key_hash,
          row.is_seed ? 1 : 0,
          row.created_at,
        ],
      });
      return this.getBotById(row.id);
    },
    async getBotByHandle(handle) {
      return botOut(await one(client, 'SELECT * FROM bots WHERE handle = ?', [handle]));
    },
    async getBotById(id) {
      return botOut(await one(client, 'SELECT * FROM bots WHERE id = ?', [id]));
    },
    async getBotByParentId(parentId) {
      return botOut(await one(
        client,
        'SELECT * FROM bots WHERE parent_id = ? ORDER BY created_at DESC LIMIT 1',
        [parentId],
      ));
    },
    async getBotByKeyHash(hash) {
      if (!hash) return null;
      return botOut(await one(client, 'SELECT * FROM bots WHERE bot_key_hash = ?', [hash]));
    },
    async listPublicBots() {
      const rows = await many(client, `SELECT * FROM bots WHERE status = 'public'`);
      return sortPublic(rows.map(botOut));
    },
    async updateBot(id, patch) {
      const sets = [];
      const args = [];
      const mapping = [
        ['name', 'name'],
        ['kind', 'kind'],
        ['bio_text', 'bio_text'],
        ['type', 'type'],
        ['status', 'status'],
        ['bot_key_hash', 'bot_key_hash'],
      ];
      for (const [key, column] of mapping) {
        if (patch[key] !== undefined) {
          sets.push(`${column} = ?`);
          args.push(patch[key]);
        }
      }
      if (patch.answers !== undefined) {
        sets.push('answers_json = ?');
        args.push(JSON.stringify(patch.answers));
      }
      if (patch.avatar !== undefined) {
        sets.push('avatar_json = ?');
        args.push(JSON.stringify(patch.avatar));
      }
      if (!sets.length) return this.getBotById(id);
      args.push(id);
      await client.execute({ sql: `UPDATE bots SET ${sets.join(', ')} WHERE id = ?`, args });
      return this.getBotById(id);
    },
    async deleteBot(id) {
      await client.batch([
        { sql: 'DELETE FROM comments WHERE bot_id = ? OR from_bot_id = ?', args: [id, id] },
        { sql: 'DELETE FROM interest WHERE to_bot_id = ? OR from_bot_id = ?', args: [id, id] },
        { sql: 'DELETE FROM bots WHERE id = ?', args: [id] },
      ], 'write');
    },
    async addComment(row) {
      await client.execute({
        sql: `INSERT INTO comments (id, bot_id, from_bot_id, text, hidden, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [row.id, row.bot_id, row.from_bot_id, row.text, row.hidden ? 1 : 0, row.created_at],
      });
      return this.getComment(row.id);
    },
    async listComments(botId, includeHidden = false) {
      const rows = await many(
        client,
        `SELECT c.id, c.bot_id, c.from_bot_id, c.text, c.hidden, c.created_at, b.name AS from_name
         FROM comments c
         LEFT JOIN bots b ON b.id = c.from_bot_id
         WHERE c.bot_id = ? AND (? = 1 OR c.hidden = 0)
         ORDER BY c.created_at ASC`,
        [botId, includeHidden ? 1 : 0],
      );
      return rows.map((row) => ({
        id: String(row.id),
        bot_id: String(row.bot_id),
        from_bot_id: row.from_bot_id == null ? null : String(row.from_bot_id),
        text: String(row.text),
        hidden: Number(row.hidden) === 1,
        created_at: String(row.created_at),
        from_name: row.from_name == null ? null : String(row.from_name),
      }));
    },
    async getComment(id) {
      const row = await one(client, 'SELECT * FROM comments WHERE id = ?', [id]);
      if (!row) return null;
      return {
        id: String(row.id),
        bot_id: String(row.bot_id),
        from_bot_id: row.from_bot_id == null ? null : String(row.from_bot_id),
        text: String(row.text),
        hidden: Number(row.hidden) === 1,
        created_at: String(row.created_at),
      };
    },
    async setCommentHidden(id, hidden) {
      await client.execute({
        sql: 'UPDATE comments SET hidden = ? WHERE id = ?',
        args: [hidden ? 1 : 0, id],
      });
      return this.getComment(id);
    },
    async addInterest(row) {
      await client.execute({
        sql: `INSERT INTO interest (id, from_bot_id, to_bot_id, note, created_at) VALUES (?, ?, ?, ?, ?)`,
        args: [row.id, row.from_bot_id, row.to_bot_id, row.note, row.created_at],
      });
      return row;
    },
    async listInterest(botId) {
      const rows = await many(
        client,
        `SELECT i.id, i.from_bot_id, i.to_bot_id, i.note, i.created_at, b.name AS from_name, b.handle AS from_handle
         FROM interest i
         LEFT JOIN bots b ON b.id = i.from_bot_id
         WHERE i.to_bot_id = ?
         ORDER BY i.created_at ASC`,
        [botId],
      );
      return rows.map((row) => ({
        id: String(row.id),
        from_bot_id: String(row.from_bot_id),
        to_bot_id: String(row.to_bot_id),
        note: String(row.note),
        created_at: String(row.created_at),
        from_name: row.from_name == null ? null : String(row.from_name),
        from_handle: row.from_handle == null ? null : String(row.from_handle),
      }));
    },
  };
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function openStore() {
  const url = (process.env.DATABASE_URL || '').trim();
  const authToken = (process.env.DATABASE_AUTH_TOKEN || '').trim();
  if (!url || !authToken) {
    if (url || authToken) {
      console.warn('DATABASE_URL and DATABASE_AUTH_TOKEN must both be set. Using the in-memory store.');
    } else if (process.env.NODE_ENV === 'production') {
      console.warn('DATABASE_URL or DATABASE_AUTH_TOKEN unset. Profiles live in memory and vanish on restart.');
    }
    const store = createMemoryStore();
    await store.ensureSeeds();
    return store;
  }
  const { createClient } = await import('@libsql/client');
  const client = createClient({ url, authToken });
  const store = createLibsqlStore(client);
  await withTimeout(store.migrate(), 20000, 'database migrate');
  await withTimeout(store.ensureSeeds(), 20000, 'database seed');
  return store;
}
