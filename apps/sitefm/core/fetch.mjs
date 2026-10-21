// Safe outbound fetch: SSRF guard, size + time caps, manual redirects.
import dns from 'node:dns/promises';
import net from 'node:net';

function ipToBigInt(ip) {
  if (net.isIPv6(ip)) {
    const norm = ip.split('%')[0];
    const parts = expandV6(norm);
    if (!parts) return null;
    let v = 0n;
    for (const p of parts) v = (v << 16n) + BigInt(parseInt(p, 16));
    return v;
  }
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (BigInt(parts[0]) << 24n) + (BigInt(parts[1]) << 16n) + (BigInt(parts[2]) << 8n) + BigInt(parts[3]);
}

function expandV6(ip) {
  let head = ip;
  let tail = [];
  if (ip.includes('.')) {
    const idx = ip.lastIndexOf(':');
    head = ip.slice(0, idx);
    const v4 = ip.slice(idx + 1).split('.').map(Number);
    tail = [((v4[0] << 8) | v4[1]).toString(16), ((v4[2] << 8) | v4[3]).toString(16)];
    head = head.replace(/:$/, '');
  }
  const [a, b] = head.split('::');
  const left = a ? a.split(':').filter(Boolean) : [];
  const right = b ? b.split(':').filter(Boolean) : [];
  const missing = 8 - left.length - right.length - tail.length;
  if (missing < 0) return null;
  const all = [...left, ...Array(missing).fill('0'), ...right, ...tail];
  return all.length === 8 ? all : null;
}

const V4_BLOCKS = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function v4ToInt(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (BigInt(p[0]) << 24n) | (BigInt(p[1]) << 16n) | (BigInt(p[2]) << 8n) | BigInt(p[3]);
}

function maskFor(bits, width) {
  if (bits <= 0) return 0n;
  const all = (1n << BigInt(width)) - 1n;
  const host = (1n << BigInt(width - bits)) - 1n;
  return all ^ host;
}

const V4_RANGES = V4_BLOCKS.map(([base, bits]) => [v4ToInt(base), maskFor(bits, 32)]);

function v6ToBigInt(ip) {
  const parts = expandV6(ip);
  if (!parts) return null;
  let v = 0n;
  for (const p of parts) v = (v << 16n) | BigInt(parseInt(p, 16));
  return v;
}

const V6_BLOCKS = [
  ['::1', 128], ['::', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96],
];
const V6_RANGES = V6_BLOCKS.map(([base, bits]) => [v6ToBigInt(base), maskFor(bits, 128)]);

export function isBlockedAddress(ip) {
  if (net.isIPv6(ip)) {
    const v = v6ToBigInt(ip);
    if (v === null) return true;
    // IPv4-mapped ::ffff:a.b.c.d
    if (v >> 32n === 0xffffn) {
      const v4 = Number(v & 0xffffffffn);
      return isBlockedAddress([24n, 16n, 8n, 0n].map((s) => Number((BigInt(v4) >> s) & 255n)).join('.'));
    }
    for (const [base, mask] of V6_RANGES) {
      if (base === null) continue;
      if ((v & mask) === (base & mask)) return true;
    }
    return false;
  }
  const v4 = v4ToInt(ip);
  if (v4 === null) return true;
  for (const [base, mask] of V4_RANGES) {
    if (base === null) continue;
    if ((v4 & mask) === (base & mask)) return true;
  }
  return false;
}

export async function assertPublicHost(hostname) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local')) {
    throw new HttpError(400, 'That host is not reachable from here.');
  }
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new HttpError(400, 'That host is not reachable from here.');
    return;
  }
  let records;
  try {
    records = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpError(404, `We could not resolve ${host}. Is the domain right?`);
  }
  if (!records.length) throw new HttpError(404, `We could not resolve ${host}.`);
  for (const r of records) if (isBlockedAddress(r.address)) throw new HttpError(400, 'That host is not reachable from here.');
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function normalizeTarget(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new HttpError(400, 'Paste a URL first.');
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) raw = 'https://' + raw;
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, "That doesn't look like a URL.");
  }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, 'Only http and https URLs work here.');
  if (!u.hostname.includes('.') || /\s/.test(u.hostname)) throw new HttpError(400, 'That host looks incomplete.');
  u.hash = '';
  return u;
}

const UA = 'Mozilla/5.0 (compatible; AgentScoreBot/1.0; +https://agentscore.synteq.app)';

export async function safeFetch(url, opts = {}) {
  const {
    timeout = 9000,
    maxBytes = 2_500_000,
    maxRedirects = 4,
    headers = {},
    accept = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  } = opts;
  let current = typeof url === 'string' ? new URL(url) : url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertPublicHost(current.hostname);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    let res;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: ac.signal,
        headers: { 'user-agent': UA, accept, 'accept-language': 'en-US,en;q=0.9', ...headers },
      });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') throw new HttpError(504, `${current.hostname} took too long to answer.`);
      throw new HttpError(502, `We could not reach ${current.hostname}.`);
    }
    clearTimeout(timer);
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new HttpError(502, 'The site redirected us somewhere we could not follow.');
      current = new URL(loc, current);
      if (!/^https?:$/.test(current.protocol)) throw new HttpError(400, 'That redirect left the web.');
      continue;
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (len && len > maxBytes) throw new HttpError(413, 'That page is too large to analyze.');
    const reader = res.body?.getReader();
    let received = 0;
    const chunks = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > maxBytes) {
          try { await reader.cancel(); } catch {}
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return {
      status: res.status,
      headers: res.headers,
      url: current.toString(),
      body: buf.toString('utf8'),
      bytes: buf.length,
      contentType: res.headers.get('content-type') || '',
    };
  }
  throw new HttpError(502, 'Too many redirects.');
}
