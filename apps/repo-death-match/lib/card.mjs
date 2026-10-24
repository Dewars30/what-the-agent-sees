// SVG deathmatch card. GPK/WWF aesthetic.
import { Resvg } from '@resvg/resvg-js';

const W = 600;
const H = 840;

// Language colors (subset)
const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Go: '#00ADD8',
  Rust: '#dea584',
  Java: '#b07219',
  Ruby: '#701516',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Lua: '#000080',
  Unknown: '#6e6256',
};

function langColor(lang) {
  return LANG_COLORS[lang] || '#6e6256';
}

export function deathmatchCardSvg(match, origin) {
  const { fighterA, fighterB, statPairs, winner, verdict } = match;
  const colorA = langColor(fighterA.primaryLanguage);
  const colorB = langColor(fighterB.primaryLanguage);
  const trustPctA = Math.round(fighterA.trust.score * 100);
  const trustPctB = Math.round(fighterB.trust.score * 100);

  // Winner highlight
  const aWins = winner === 'a';
  const bWins = winner === 'b';
  const draw = winner === 'draw';

  let y = 0;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Georgia, serif">`;

  // Background
  svg += `<rect width="${W}" height="${H}" fill="#1a1410"/>`;
  svg += `<rect width="${W}" height="6" y="0" fill="#c24d2c"/>`;

  // Title bar
  svg += `<text x="${W/2}" y="52" text-anchor="middle" fill="#f4efe6" font-size="28" font-weight="bold" letter-spacing="2">REPO DEATH MATCH</text>`;
  svg += `<line x1="40" y1="72" x2="${W-40}" y2="72" stroke="#c24d2c" stroke-width="2"/>`;

  // Fighter A (left column)
  svg += fighterColumn(fighterA, colorA, trustPctA, 30, 90, aWins, 'A');

  // VS in the middle
  svg += `<text x="${W/2}" y="${90 + 160}" text-anchor="middle" fill="#c24d2c" font-size="48" font-weight="bold" font-style="italic">VS</text>`;

  // Fighter B (right column)
  svg += fighterColumn(fighterB, colorB, trustPctB, 320, 90, bWins, 'B');

  // Stat comparison rows
  let statY = 410;
  for (const stat of statPairs) {
    svg += statRow(stat, 40, statY, W - 80);
    statY += 28;
  }

  // Verdict box
  const verdictY = statY + 20;
  const verdictColor = draw ? '#c24d2c' : (aWins ? colorA : colorB);
  svg += `<rect x="30" y="${verdictY}" width="${W-60}" height="70" fill="${verdictColor}" rx="8" opacity="0.15"/>`;
  svg += `<rect x="30" y="${verdictY}" width="${W-60}" height="70" fill="none" stroke="${verdictColor}" stroke-width="2" rx="8"/>`;
  
  // Wrap verdict text
  const lines = wrapText(verdict, 52);
  let vy = verdictY + 26;
  for (const line of lines) {
    svg += `<text x="${W/2}" y="${vy}" text-anchor="middle" fill="#f4efe6" font-size="15" font-weight="bold">${escXml(line)}</text>`;
    vy += 20;
  }

  // Footer
  svg += `<line x1="40" y1="${H-50}" x2="${W-40}" y2="${H-50}" stroke="#3a3028" stroke-width="1"/>`;
  svg += `<text x="${W/2}" y="${H-28}" text-anchor="middle" fill="#6e6256" font-size="13" font-style="italic">rdm.synteq.app</text>`;

  svg += `</svg>`;
  return svg;
}

function fighterColumn(fighter, color, trustPct, x, y, wins, side) {
  const colW = 250;
  let s = '';

  // Winner glow
  if (wins) {
    s += `<rect x="${x-5}" y="${y-5}" width="${colW+10}" height="300" fill="${color}" rx="12" opacity="0.1"/>`;
  }

  // Avatar: colored shape with initial
  const cx = x + colW/2;
  const cy = y + 55;
  s += `<circle cx="${cx}" cy="${cy}" r="38" fill="${color}" opacity="0.2"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="32" fill="${color}"/>`;
  s += `<text x="${cx}" y="${cy+12}" text-anchor="middle" fill="#1a1410" font-size="28" font-weight="bold">${escXml(fighter.repo[0].toUpperCase())}</text>`;

  // Winner crown
  if (wins) {
    s += `<text x="${cx + 28}" y="${cy - 28}" text-anchor="middle" fill="#c24d2c" font-size="24">★</text>`;
  }

  // Repo name
  const nameLines = wrapText(fighter.handle, 22);
  let ny = y + 115;
  for (const line of nameLines) {
    s += `<text x="${cx}" y="${ny}" text-anchor="middle" fill="#f4efe6" font-size="14" font-weight="bold">${escXml(line)}</text>`;
    ny += 18;
  }

  // Language badge
  s += `<rect x="${cx-40}" y="${ny+4}" width="80" height="20" fill="${color}" rx="10" opacity="0.3"/>`;
  s += `<text x="${cx}" y="${ny+18}" text-anchor="middle" fill="#f4efe6" font-size="11" font-family="ui-monospace, monospace">${escXml(fighter.primaryLanguage)}</text>`;

  // Trust meter
  const meterY = ny + 38;
  const meterW = 180;
  const meterX = cx - meterW/2;
  s += `<text x="${cx}" y="${meterY-6}" text-anchor="middle" fill="#6e6256" font-size="10" font-family="ui-monospace, monospace">TRUST</text>`;
  s += `<rect x="${meterX}" y="${meterY}" width="${meterW}" height="14" fill="#2a221e" rx="7"/>`;
  const fillW = Math.round(meterW * (trustPct / 100));
  const fillColor = trustPct >= 70 ? '#4a9' : trustPct >= 40 ? '#c94' : '#c24d2c';
  s += `<rect x="${meterX}" y="${meterY}" width="${fillW}" height="14" fill="${fillColor}" rx="7"/>`;
  s += `<text x="${cx}" y="${meterY+26}" text-anchor="middle" fill="#f4efe6" font-size="18" font-weight="bold">${trustPct}</text>`;

  // Key stats
  let sy = meterY + 50;
  const stats = [
    `★ ${fighter.stars.toLocaleString()}`,
    `⑂ ${fighter.forks.toLocaleString()}`,
    `👥 ${fighter.contributorCount}`,
    `${fighter.hasLicense ? '⚖ MIT' : '⚖ NONE'}`,
    `${fighter.hasTests ? '✓ tests' : '✗ no tests'}`,
  ];
  for (const stat of stats) {
    s += `<text x="${cx}" y="${sy}" text-anchor="middle" fill="#a09488" font-size="12" font-family="ui-monospace, monospace">${escXml(stat)}</text>`;
    sy += 16;
  }

  return s;
}

function statRow(stat, x, y, w) {
  const isNumeric = typeof stat.a === 'number';
  const aWin = winsStat(stat, 'a');
  const bWin = winsStat(stat, 'b');
  const aColor = aWin ? '#4a9' : '#6e6256';
  const bColor = bWin ? '#4a9' : '#6e6256';
  
  let s = `<line x1="${x}" y1="${y-4}" x2="${x+w}" y2="${y-4}" stroke="#2a221e" stroke-width="1"/>`;
  s += `<text x="${x+8}" y="${y+8}" fill="${aColor}" font-size="13" font-family="ui-monospace, monospace">${escXml(String(stat.a))}</text>`;
  s += `<text x="${x+w/2}" y="${y+8}" text-anchor="middle" fill="#6e6256" font-size="11" font-family="ui-monospace, monospace">${escXml(stat.label.toUpperCase())}</text>`;
  s += `<text x="${x+w-8}" y="${y+8}" text-anchor="end" fill="${bColor}" font-size="13" font-family="ui-monospace, monospace">${escXml(String(stat.b))}</text>`;
  return s;
}

function winsStat(stat, side) {
  const a = stat.a;
  const b = stat.b;
  if (typeof a !== 'number' || typeof b !== 'number') {
    if (stat.higher === 'yes') return side === 'a' ? a === 'Yes' && b === 'No' : b === 'Yes' && a === 'No';
    if (stat.higher === 'no') return side === 'a' ? a === 'No' && b === 'Yes' : b === 'No' && a === 'Yes';
    return false;
  }
  if (stat.higher === 'more') return side === 'a' ? a > b : b > a;
  if (stat.higher === 'fewer') return side === 'a' ? a < b : b < a;
  return false;
}

function wrapText(text, maxChars) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current += ' ' + word;
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, 3);
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function cardToPng(svg) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  const png = resvg.render().asPng();
  return png;
}

export function shareText(match, origin) {
  const { fighterA, fighterB, winner, verdict } = match;
  const url = `${origin}/m/${match.id || 'preview'}`;
  const aName = fighterA.handle;
  const bName = fighterB.handle;
  if (winner === 'draw') {
    return `${aName} vs ${bName}. Draw. ${fighterA.repo} wins on trust (${fighterA.trust.score}), ${fighterB.repo} wins on adoption. Put two in the ring: ${url}`;
  }
  const winnerName = winner === 'a' ? aName : bName;
  const loserName = winner === 'a' ? bName : aName;
  return `${aName} vs ${bName}. ${winnerName} won. Trust ${winner === 'a' ? fighterA.trust.score : fighterB.trust.score}. Put two in the ring: ${url}`;
}
