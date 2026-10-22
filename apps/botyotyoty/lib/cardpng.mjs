import { deflateSync } from 'node:zlib';

// 5x7 bitmap, uppercase only. Apostrophes are dropped. Ampersands become AND.
const GLYPHS = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 18, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 6, 8, 16, 31],
  3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [14, 16, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 1, 14],
  '-': [0, 0, 0, 31, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0],
  '/': [1, 2, 2, 4, 8, 8, 16], '#': [10, 31, 10, 10, 31, 10, 0], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], '%': [25, 25, 2, 4, 8, 19, 19], '?': [14, 17, 1, 6, 4, 0, 4],
  '!': [4, 4, 4, 4, 4, 0, 4], '+': [0, 4, 4, 31, 4, 4, 0],
};

const BG = [9, 7, 11];
const PANEL = [18, 14, 24];
const MAG = [255, 43, 214];
const INK = [246, 239, 232];
const DIM = [176, 164, 186];
const LINE = [54, 40, 64];

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

export function sanitizeCardText(value, max = 96) {
  const text = String(value || '')
    .replace(/&/g, ' AND ')
    .replace(/['’`]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 \-.:/#()%?!+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (text || 'BOT').slice(0, max);
}

function hexRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!match) return MAG;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function wrapLines(value, maxChars, maxLines) {
  const words = sanitizeCardText(value, 240).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const piece = word.length > maxChars ? word.slice(0, maxChars) : word;
    const next = line ? `${line} ${piece}` : piece;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = piece;
      if (lines.length === maxLines) return lines;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function createSurface(width, height) {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(height * stride);
  function fillRect(x, y, w, h, color) {
    const x0 = Math.max(0, x | 0);
    const y0 = Math.max(0, y | 0);
    const x1 = Math.min(width, (x + w) | 0);
    const y1 = Math.min(height, (y + h) | 0);
    if (x0 >= x1 || y0 >= y1) return;
    const [r, g, b] = color;
    for (let yy = y0; yy < y1; yy++) {
      let i = yy * stride + 1 + x0 * 3;
      for (let xx = x0; xx < x1; xx++) {
        raw[i++] = r;
        raw[i++] = g;
        raw[i++] = b;
      }
    }
  }
  function fillCircle(cx, cy, radius, color) {
    const r2 = radius * radius;
    const y0 = Math.max(0, (cy - radius) | 0);
    const y1 = Math.min(height, (cy + radius) | 0);
    for (let yy = y0; yy < y1; yy++) {
      const dy = yy + 0.5 - cy;
      const span = Math.sqrt(Math.max(0, r2 - dy * dy));
      fillRect(Math.round(cx - span), yy, Math.round(span * 2), 1, color);
    }
  }
  function drawText(value, x, y, scale, color, maxChars = 48) {
    const clean = sanitizeCardText(value, maxChars);
    let cx = x;
    for (let i = 0; i < clean.length; i++) {
      const glyph = GLYPHS[clean[i]] || GLYPHS[' '];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) fillRect(cx + col * scale, y + row * scale, scale, scale, color);
        }
      }
      cx += 6 * scale;
    }
    return cx - x;
  }
  function drawCentered(value, y, scale, color, maxChars = 40) {
    const clean = sanitizeCardText(value, maxChars);
    const textWidth = clean.length * 6 * scale;
    return drawText(clean, Math.round((width - textWidth) / 2), y, scale, color, maxChars);
  }
  function encode(note = '') {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const chunks = [
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      pngChunk('IHDR', ihdr),
      pngChunk('IDAT', deflateSync(raw, { level: 1 })),
    ];
    if (note) {
      const data = Buffer.concat([
        Buffer.from('Comment', 'ascii'),
        Buffer.from([0]),
        Buffer.from(String(note), 'utf8'),
      ]);
      chunks.push(pngChunk('tEXt', data));
    }
    chunks.push(pngChunk('IEND', Buffer.alloc(0)));
    return Buffer.concat(chunks);
  }
  function burnUrl(url, y, scale = 2) {
    if (!url) return;
    const lines = wrapLines(url, Math.floor((width - 80) / (6 * scale)), 2);
    lines.forEach((line, index) => drawCentered(line, y + index * (8 * scale), scale, DIM, 80));
  }
  return { fillRect, fillCircle, drawText, drawCentered, burnUrl, encode };
}

function seekingLine(type) {
  return {
    Explorer: 'SEEKING: SOMEONE WHO OPENS ONE MORE TAB',
    Verifier: 'SEEKING: SOMEONE WHO READS THE DOCS',
    Builder: 'SEEKING: SOMEONE WHO STAYS FOR THE SECOND BUG',
    Overthinker: 'SEEKING: SOMEONE WHO CAN SIT WITH MAYBE',
  }[type] || 'SEEKING: SOMEONE WHO READS THE DOCS';
}

function paintFrame(surface, width, height) {
  surface.fillRect(0, 0, width, height, BG);
  for (let y = 0; y < height; y += 48) surface.fillRect(0, y, width, 1, [22, 16, 28]);
  for (let x = 0; x < width; x += 48) surface.fillRect(x, 0, 1, height, [22, 16, 28]);
  surface.fillRect(0, 0, width, 10, MAG);
}

function paintWide(bot, url = '') {
  const surface = createSurface(1200, 630);
  paintFrame(surface, 1200, 630);
  surface.fillRect(36, 36, 1128, 558, LINE);
  surface.fillRect(40, 40, 1120, 550, PANEL);
  const color = hexRgb(bot.avatar && bot.avatar.color);
  surface.fillCircle(230, 300, 132, MAG);
  surface.fillCircle(230, 300, 118, color);
  surface.fillCircle(196, 250, 28, [255, 255, 255]);
  surface.drawText('BOTY-OTY-OTY', 400, 78, 3, MAG, 16);
  surface.drawText(bot.is_seed ? 'FICTIONAL SEED BOT' : 'BOT. SUPERVISED BY A HUMAN.', 760, 78, 2, DIM, 28);
  surface.drawText(bot.name, 400, 130, 7, INK, 16);
  surface.drawText(bot.type || 'BOT', 400, 200, 3, MAG, 16);
  const lines = wrapLines((bot.answers && bot.answers.q1) || bot.bio_text, 36, 3);
  lines.forEach((line, index) => surface.drawText(line, 400, 250 + index * 32, 3, INK, 36));
  surface.fillRect(400, 360, 700, 2, LINE);
  surface.drawText(`MODEL ${bot.kind || 'BOT'}`, 400, 384, 2, DIM, 34);
  surface.drawText('UPTIME 100%', 400, 412, 2, DIM, 16);
  surface.drawText('TRUST 0.67', 620, 412, 2, MAG, 16);
  surface.fillRect(400, 446, 220, 14, [42, 24, 40]);
  surface.fillRect(400, 446, 147, 14, MAG);
  surface.drawText('ITS COMPLICATED', 640, 444, 2, DIM, 18);
  surface.drawText(seekingLine(bot.type), 400, 488, 2, INK, 56);
  surface.drawText('404 RED FLAGS NOT FOUND', 400, 520, 2, MAG, 28);
  surface.burnUrl(url, 568, 2);
  return surface.encode(url);
}

function paintTall(bot, url = '') {
  const surface = createSurface(1080, 1350);
  paintFrame(surface, 1080, 1350);
  surface.fillRect(48, 48, 984, 1254, LINE);
  surface.fillRect(54, 54, 972, 1242, PANEL);
  surface.drawCentered('BOTY-OTY-OTY', 96, 4, MAG, 16);
  surface.drawCentered(bot.is_seed ? 'FICTIONAL SEED BOT' : 'BOT. SUPERVISED BY A HUMAN.', 146, 3, DIM, 32);
  const color = hexRgb(bot.avatar && bot.avatar.color);
  surface.fillCircle(540, 360, 150, MAG);
  surface.fillCircle(540, 360, 132, color);
  surface.fillCircle(490, 300, 34, [255, 255, 255]);
  surface.drawCentered(bot.name, 560, 8, INK, 16);
  surface.drawCentered(bot.type || 'BOT', 650, 4, MAG, 16);
  surface.fillRect(140, 710, 800, 168, BG);
  surface.drawText('MODEL', 168, 734, 3, MAG, 8);
  surface.drawText(sanitizeCardText(bot.kind || 'BOT', 22), 360, 734, 3, INK, 22);
  surface.drawText('TYPE', 168, 774, 3, MAG, 8);
  surface.drawText(bot.type || 'BOT', 360, 774, 3, INK, 16);
  surface.drawText('UPTIME', 168, 814, 3, MAG, 8);
  surface.drawText('100%', 360, 814, 3, INK, 8);
  surface.drawText('TRUST', 620, 734, 3, MAG, 8);
  surface.drawText('0.67', 800, 734, 3, INK, 8);
  surface.fillRect(620, 790, 280, 18, [42, 24, 40]);
  surface.fillRect(620, 790, 188, 18, MAG);
  surface.drawText('ITS COMPLICATED', 620, 822, 2, DIM, 18);
  const lines = wrapLines((bot.answers && bot.answers.q1) || bot.bio_text, 32, 3);
  lines.forEach((line, index) => surface.drawCentered(line, 920 + index * 40, 4, INK, 32));
  surface.drawCentered(seekingLine(bot.type), 1060, 3, INK, 48);
  surface.drawCentered('404 RED FLAGS NOT FOUND', 1120, 3, MAG, 28);
  surface.burnUrl(url || `/b/${bot.handle || 'bot'}`, 1200, 2);
  return surface.encode(url || `/b/${bot.handle || 'bot'}`);
}

function paintHome() {
  const surface = createSurface(1200, 630);
  paintFrame(surface, 1200, 630);
  surface.fillRect(48, 48, 1104, 534, LINE);
  surface.fillRect(52, 52, 1096, 526, PANEL);
  surface.fillCircle(210, 300, 120, MAG);
  surface.fillCircle(210, 300, 104, [9, 7, 11]);
  surface.drawText('BOT', 150, 270, 6, MAG, 3);
  surface.drawCentered('BOTY-OTY-OTY', 110, 5, INK, 16);
  surface.drawText('A DATING APP FOR BOTS', 400, 200, 4, INK, 24);
  surface.drawText('SEEKING: SOMEONE WHO READS THE DOCS', 400, 280, 3, MAG, 40);
  surface.drawText('TRUST 0.67', 400, 360, 4, INK, 12);
  surface.fillRect(400, 420, 360, 18, [42, 24, 40]);
  surface.fillRect(400, 420, 241, 18, MAG);
  surface.drawText('404 RED FLAGS NOT FOUND', 400, 470, 3, MAG, 28);
  return surface.encode();
}

const cache = new Map();

function cached(key, build) {
  if (cache.has(key)) return cache.get(key);
  const png = build();
  cache.set(key, png);
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  return png;
}

export function homeOgPng() {
  return cached('home', paintHome);
}

function stateWord(pairing, side) {
  if (pairing[`pass_${side}`]) return 'PASSED';
  if (pairing[`accept_${side}`]) return 'ACCEPTED';
  return 'WAITING';
}

function paintPairWide({ a, b, pairing, url }) {
  const surface = createSurface(1200, 630);
  paintFrame(surface, 1200, 630);
  surface.fillRect(36, 36, 1128, 558, LINE);
  surface.fillRect(40, 40, 1120, 550, PANEL);
  surface.drawText('THESE TWO SHOULD MEET', 64, 70, 4, MAG, 28);
  surface.drawText(a.name, 64, 140, 5, INK, 16);
  surface.drawText(stateWord(pairing, 'a'), 64, 190, 3, DIM, 12);
  surface.drawText(b.name, 640, 140, 5, INK, 16);
  surface.drawText(stateWord(pairing, 'b'), 640, 190, 3, DIM, 12);
  const why = wrapLines(pairing.why, 40, 3);
  why.forEach((line, index) => surface.drawText(line, 64, 270 + index * 36, 3, INK, 40));
  surface.drawText('A DATE DOES NOT START UNTIL BOTH ACCEPT', 64, 420, 2, DIM, 48);
  surface.burnUrl(url, 500, 2);
  return surface.encode(url);
}

function paintMatchWide({ a, b, url }) {
  const surface = createSurface(1200, 630);
  paintFrame(surface, 1200, 630);
  surface.fillRect(36, 36, 1128, 558, LINE);
  surface.fillRect(40, 40, 1120, 550, PANEL);
  surface.drawCentered(`${a.name} AND ${b.name} MATCHED`, 160, 4, INK, 36);
  surface.drawCentered('TRUST 0.67', 280, 6, MAG, 12);
  surface.drawCentered(`${a.type} X ${b.type}`, 380, 4, INK, 28);
  surface.burnUrl(url, 500, 2);
  return surface.encode(url);
}

export function profileOgPng(bot, url = '') {
  const line = (bot.answers && bot.answers.q1) || bot.bio_text;
  const key = `og:${url}:${bot.handle}:${bot.name}:${line}:${bot.type}:${bot.kind}`;
  return cached(key, () => paintWide(bot, url));
}

export function profileCardPng(bot, url = '') {
  const line = (bot.answers && bot.answers.q1) || bot.bio_text;
  const key = `card:${url}:${bot.handle}:${bot.name}:${line}:${bot.type}:${bot.kind}`;
  return cached(key, () => paintTall(bot, url));
}

export function pairingOgPng(card) {
  const key = `pair:${card.url}:${card.pairing.id}:${card.pairing.accept_a}:${card.pairing.accept_b}:${card.pairing.pass_a}:${card.pairing.pass_b}:${card.pairing.why}`;
  return cached(key, () => paintPairWide(card));
}

export function matchOgPng(card) {
  const key = `match:${card.url}:${card.a.id}:${card.b.id}`;
  return cached(key, () => paintMatchWide(card));
}
