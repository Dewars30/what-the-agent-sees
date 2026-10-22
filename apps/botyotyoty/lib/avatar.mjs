const SHAPES = new Set(['orb', 'cube', 'blob', 'robot', 'cat']);
const ACCESSORIES = new Set(['glasses', 'antenna', 'bowtie', 'halo', 'headset', 'none']);
const FILTERS = new Set(['glossy', 'holo', 'vaporwave', 'pixel']);

const COLOR_NAMES = {
  red: '#d64545',
  blue: '#3a6ea5',
  green: '#2f8f6b',
  yellow: '#e6b325',
  orange: '#e07a3d',
  purple: '#7a5ea7',
  pink: '#e56ba8',
  black: '#2a2a2a',
  white: '#f4f1ea',
  gold: '#e0a122',
  teal: '#1f8a8a',
  cyan: '#3ec6d4',
  gray: '#8d8d96',
  grey: '#8d8d96',
  brown: '#6f4428',
  coffee: '#6f4428',
  silver: '#c5ccd6',
  navy: '#243456',
  lavender: '#b7a0d4',
  lilac: '#b7a0d4',
  mint: '#8fd0b5',
  amber: '#e6a23c',
  magenta: '#e23e8c',
};

let avatarSeq = 0;

function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${clamp(r)}${clamp(g)}${clamp(b)}`;
}

function mix(hex, target, amount) {
  const a = hexToRgb(hex);
  const b = hexToRgb(target);
  return rgbToHex({
    r: a.r + (b.r - a.r) * amount,
    g: a.g + (b.g - a.g) * amount,
    b: a.b + (b.b - a.b) * amount,
  });
}

function xmlEsc(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

export function parseAvatar(text) {
  const raw = String(text || '').toLowerCase();
  const shape = [...SHAPES].find((item) => item !== 'none' && raw.includes(item)) || 'orb';
  const accessory = ['glasses', 'antenna', 'bowtie', 'halo', 'headset'].find((item) => raw.includes(item)) || 'none';
  const filter = ['vaporwave', 'glossy', 'holo', 'pixel'].find((item) => raw.includes(item)) || 'glossy';
  let eyes = 2;
  const numbered = raw.match(/(\d)\s*eyes?/) || raw.match(/eyes?\s*[:=]?\s*(\d)/);
  if (numbered) eyes = Math.min(3, Math.max(1, Number(numbered[1])));
  else if (/\b(three|3)\b/.test(raw) && /eye/.test(raw)) eyes = 3;
  else if (/\b(one|1)\b/.test(raw) && /eye/.test(raw)) eyes = 1;
  const named = Object.keys(COLOR_NAMES).find((name) => new RegExp(`\\b${name}\\b`).test(raw));
  const hex = raw.match(/#([0-9a-f]{6})\b/);
  const color = hex ? `#${hex[1]}` : named ? COLOR_NAMES[named] : '#e07a3d';
  return {
    shape: SHAPES.has(shape) ? shape : 'orb',
    color,
    eyes,
    accessory: ACCESSORIES.has(accessory) ? accessory : 'none',
    filter: FILTERS.has(filter) ? filter : 'glossy',
  };
}

function eyesMarkup(count, cx, cy, pixel) {
  const spots = count === 1
    ? [[cx, cy, 22]]
    : count === 3
      ? [[cx - 34, cy + 8, 13], [cx + 34, cy + 8, 13], [cx, cy - 28, 13]]
      : [[cx - 26, cy, 14], [cx + 26, cy, 14]];
  return spots.map(([x, y, r]) => {
    if (pixel) {
      return `<rect x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" fill="#fffaf3"/><rect x="${x - r * 0.35}" y="${y - r * 0.15}" width="${r * 0.9}" height="${r * 0.9}" fill="#221c16"/>`;
    }
    return `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${(r * 1.08).toFixed(1)}" fill="#fffaf3"/><circle cx="${x + 1}" cy="${y + 1}" r="${(r * 0.42).toFixed(1)}" fill="#221c16"/><circle cx="${(x - r * 0.28).toFixed(1)}" cy="${(y - r * 0.32).toFixed(1)}" r="${(r * 0.16).toFixed(1)}" fill="#ffffff"/>`;
  }).join('');
}

function smileMarkup(count, cx, cy, pixel) {
  const y = cy + (count === 3 ? 40 : 30);
  if (pixel) return `<rect x="${cx - 12}" y="${y}" width="24" height="4" fill="#221c16"/>`;
  return `<path d="M${cx - 14} ${y} Q ${cx} ${y + 12} ${cx + 14} ${y}" fill="none" stroke="#221c16" stroke-width="3" stroke-linecap="round"/>`;
}

function accessoryMarkup(kind, face, color) {
  const { cx, cy, top, bow } = face;
  if (kind === 'glasses') {
    return `<g fill="none" stroke="#221c16" stroke-width="4"><circle cx="${cx - 26}" cy="${cy}" r="20"/><circle cx="${cx + 26}" cy="${cy}" r="20"/><path d="M${cx - 6} ${cy} H${cx + 6}"/><path d="M${cx - 46} ${cy} h-12"/><path d="M${cx + 46} ${cy} h12"/></g>`;
  }
  if (kind === 'antenna') {
    return `<line x1="${cx}" y1="${top}" x2="${cx}" y2="${top - 28}" stroke="#221c16" stroke-width="4" stroke-linecap="round"/><circle cx="${cx}" cy="${top - 36}" r="8" fill="${color}" stroke="#221c16" stroke-width="3"/>`;
  }
  if (kind === 'bowtie') {
    return `<polygon points="${cx},${bow} ${cx - 28},${bow - 14} ${cx - 28},${bow + 14}" fill="#c24d2c"/><polygon points="${cx},${bow} ${cx + 28},${bow - 14} ${cx + 28},${bow + 14}" fill="#c24d2c"/><circle cx="${cx}" cy="${bow}" r="5" fill="#6f4428"/>`;
  }
  if (kind === 'halo') {
    return `<ellipse cx="${cx}" cy="${top - 10}" rx="36" ry="12" fill="none" stroke="#f2d48a" stroke-width="6"/>`;
  }
  if (kind === 'headset') {
    return `<path d="M${cx - 54} ${cy + 6} v-12 a54 46 0 0 1 108 0 v12" fill="none" stroke="#221c16" stroke-width="6" stroke-linecap="round"/><rect x="${cx - 64}" y="${cy - 8}" width="16" height="28" rx="4" fill="#221c16"/><rect x="${cx + 48}" y="${cy - 8}" width="16" height="28" rx="4" fill="#221c16"/>`;
  }
  return '';
}

function shapeMarkup(shape, fill, stroke, glossy) {
  if (shape === 'cube') {
    return `<polygon points="78,118 206,118 244,146 116,146" fill="${mix(fill, '#ffffff', 0.28)}" stroke="${stroke}" stroke-width="3"/>
      <polygon points="206,118 244,146 244,274 206,246" fill="${mix(fill, '#000000', 0.18)}" stroke="${stroke}" stroke-width="3"/>
      <rect x="78" y="118" width="128" height="128" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      ${glossy ? '<ellipse cx="118" cy="150" rx="28" ry="12" fill="#ffffff" opacity="0.35" transform="rotate(-24 118 150)"/>' : ''}`;
  }
  if (shape === 'blob') {
    return `<path d="M160 78c48-8 92 24 96 74 4 58-28 112-84 118-62 8-112-30-118-84-6-50 42-100 106-108z" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      ${glossy ? '<ellipse cx="132" cy="132" rx="34" ry="14" fill="#ffffff" opacity="0.4" transform="rotate(-30 132 132)"/>' : ''}`;
  }
  if (shape === 'robot') {
    return `<rect x="86" y="178" width="148" height="92" rx="22" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      <rect x="148" y="164" width="24" height="20" fill="${mix(fill, '#000000', 0.15)}"/>
      <rect x="106" y="74" width="108" height="92" rx="22" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      ${glossy ? '<rect x="122" y="86" width="36" height="10" rx="5" fill="#ffffff" opacity="0.45"/>' : ''}`;
  }
  if (shape === 'cat') {
    return `<polygon points="112,128 96,70 150,112" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="208,128 224,70 170,112" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
      <ellipse cx="160" cy="228" rx="78" ry="46" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      <circle cx="160" cy="156" r="68" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      ${glossy ? '<ellipse cx="136" cy="132" rx="24" ry="10" fill="#ffffff" opacity="0.4" transform="rotate(-28 136 132)"/>' : ''}`;
  }
  return `<circle cx="160" cy="168" r="90" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
    ${glossy ? '<ellipse cx="130" cy="136" rx="36" ry="16" fill="#ffffff" opacity="0.45" transform="rotate(-28 130 136)"/>' : ''}`;
}

const FACE = {
  orb: { cx: 160, cy: 164, top: 78, bow: 246 },
  blob: { cx: 160, cy: 168, top: 90, bow: 248 },
  cube: { cx: 142, cy: 176, top: 112, bow: 232 },
  robot: { cx: 160, cy: 118, top: 74, bow: 172 },
  cat: { cx: 160, cy: 156, top: 78, bow: 214 },
};

export function avatarSvg(input, { size = 320, label = 'Bot avatar' } = {}) {
  const parsed = input && input.shape ? input : parseAvatar(input);
  const shape = SHAPES.has(parsed.shape) ? parsed.shape : 'orb';
  const filter = FILTERS.has(parsed.filter) ? parsed.filter : 'glossy';
  const accessory = ACCESSORIES.has(parsed.accessory) ? parsed.accessory : 'none';
  const eyes = [1, 2, 3].includes(Number(parsed.eyes)) ? Number(parsed.eyes) : 2;
  const color = /^#[0-9a-f]{6}$/i.test(parsed.color || '') ? parsed.color.toLowerCase() : '#e07a3d';
  const uid = `av${++avatarSeq}`;
  const face = FACE[shape];
  const stroke = '#221c16';
  const glossy = filter === 'glossy';
  let bg = mix(color, '#1c1915', 0.55);
  let fill = `url(#${uid}-fill)`;
  const defs = [];
  if (filter === 'glossy') {
    bg = mix(color, '#1c1915', 0.72);
    defs.push(`<linearGradient id="${uid}-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(color, '#ffffff', 0.35)}"/><stop offset="1" stop-color="${mix(color, '#000000', 0.2)}"/></linearGradient>`);
    defs.push(`<radialGradient id="${uid}-bg" cx="30%" cy="20%" r="80%"><stop offset="0" stop-color="${mix(color, '#ffffff', 0.15)}"/><stop offset="1" stop-color="${bg}"/></radialGradient>`);
    bg = `url(#${uid}-bg)`;
  } else if (filter === 'holo') {
    defs.push(`<linearGradient id="${uid}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ef0ff"/><stop offset="0.45" stop-color="#c9b6ff"/><stop offset="0.72" stop-color="#ff8ec8"/><stop offset="1" stop-color="#ffe27a"/></linearGradient>`);
    defs.push(`<linearGradient id="${uid}-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mix(color, '#ffffff', 0.55)}"/><stop offset="0.5" stop-color="${color}"/><stop offset="1" stop-color="${mix(color, '#7ef0ff', 0.35)}"/></linearGradient>`);
    bg = `url(#${uid}-bg)`;
  } else if (filter === 'vaporwave') {
    bg = '#241433';
    defs.push(`<linearGradient id="${uid}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mix(color, '#ffd1ef', 0.35)}"/><stop offset="1" stop-color="${mix(color, '#241433', 0.25)}"/></linearGradient>`);
  } else {
    bg = '#1b1a22';
    fill = color;
    defs.push(`<pattern id="${uid}-px" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#000000" opacity="0.18"/></pattern>`);
  }
  const backdrop = filter === 'vaporwave'
    ? `<circle cx="236" cy="74" r="26" fill="#ffd7a8"/><g stroke="#ff77c8" stroke-width="1" opacity="0.55">${[210, 230, 250, 270, 292].map((y) => `<line x1="24" y1="${y}" x2="296" y2="${y}"/>`).join('')}</g>`
    : '';
  const pixelWash = filter === 'pixel' ? `<rect width="320" height="320" fill="url(#${uid}-px)"/>` : '';
  const title = xmlEsc(label);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" width="${Number(size) || 320}" height="${Number(size) || 320}" role="img" aria-label="${title}" shape-rendering="${filter === 'pixel' ? 'crispEdges' : 'auto'}">
    <title>${title}</title>
    <defs>${defs.join('')}</defs>
    <rect width="320" height="320" rx="${filter === 'pixel' ? 12 : 44}" fill="${bg}"/>
    ${backdrop}
    <ellipse cx="160" cy="292" rx="74" ry="10" fill="#221c16" opacity="0.14"/>
    ${shapeMarkup(shape, fill, stroke, glossy)}
    ${eyesMarkup(eyes, face.cx, face.cy, filter === 'pixel')}
    ${smileMarkup(eyes, face.cx, face.cy, filter === 'pixel')}
    ${accessoryMarkup(accessory, face, color)}
    ${pixelWash}
  </svg>`;
}
