import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jsQR = require('jsqr');

function modulesFromSvg(svg) {
  const view = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!view) throw new Error('qr svg has no viewBox');
  const size = Number(view[1]);
  const dark = svg.match(/<path\b[^>]*\bstroke="[^"]*"[^>]*\bd="([^"]*)"/);
  if (!dark) throw new Error('qr svg has no dark path');
  const grid = new Uint8Array(size * size);
  let x = 0;
  let y = 0;
  const re = /([Mmh])(-?\d+(?:\.\d+)?)(?: (-?\d+(?:\.\d+)?))?/g;
  let match;
  while ((match = re.exec(dark[1]))) {
    const cmd = match[1];
    const a = Number(match[2]);
    const b = match[3] === undefined ? 0 : Number(match[3]);
    if (cmd === 'M') {
      x = a;
      y = b;
    } else if (cmd === 'm') {
      x += a;
      y += b;
    } else if (cmd === 'h') {
      const row = Math.floor(y);
      const col = Math.floor(x);
      for (let i = 0; i < a; i++) {
        const xx = col + i;
        if (row >= 0 && row < size && xx >= 0 && xx < size) grid[row * size + xx] = 1;
      }
      x += a;
    }
  }
  return { size, grid };
}

export function decodeQrSvg(svg) {
  const { size, grid } = modulesFromSvg(svg);
  const scale = 8;
  const quiet = 4;
  const dim = (size + quiet * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4);
  data.fill(255);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!grid[row * size + col]) continue;
      const ox = (col + quiet) * scale;
      const oy = (row + quiet) * scale;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const i = ((oy + dy) * dim + (ox + dx)) * 4;
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 255;
        }
      }
    }
  }
  const found = jsQR(data, dim, dim);
  if (!found) throw new Error('qr did not decode');
  return found.data;
}
