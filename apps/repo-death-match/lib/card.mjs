// SVG deathmatch card. GPK/WWF aesthetic.
import { Resvg } from '@resvg/resvg-js';

const W = 600;
const H = 900;

const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', Ruby: '#701516',
  'C++': '#f34b7d', C: '#555', 'C#': '#178600', Swift: '#F05138',
  Kotlin: '#A97BFF', Dart: '#00B4AB', HTML: '#e34c26', CSS: '#563d7c',
  Shell: '#89e051', Lua: '#000080', Unknown: '#6e6256',
};

function langColor(lang) {
  return LANG_COLORS[lang] || '#6e6256';
}

function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrapText(text, maxChars) {
  const words = String(text).split(' ');
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

function formatNum(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '') + 'k';
  return String(n);
}

export function deathmatchCardSvg(match, origin) {
  const { fighterA, fighterB, statPairs, winner, verdict } = match;
  const colorA = langColor(fighterA.primaryLanguage);
  const colorB = langColor(fighterB.primaryLanguage);
  const trustPctA = Math.round(fighterA.trust.score * 100);
  const trustPctB = Math.round(fighterB.trust.score * 100);
  const aWins = winner === 'a';
  const bWins = winner === 'b';
  const draw = winner === 'draw';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Georgia, serif">`;
  svg += `<rect width="${W}" height="${H}" fill="#161210"/>`;
  svg += `<rect width="${W}" height="8" fill="#c24d2c"/>`;
  svg += `<rect y="8" width="${W}" height="3" fill="#8e3218"/>`;
  svg += `<text x="${W/2}" y="56" text-anchor="middle" fill="#f4efe6" font-size="26" font-weight="bold" letter-spacing="3">REPO DEATH MATCH</text>`;
  svg += `<text x="${W/2}" y="78" text-anchor="middle" fill="#6e6256" font-size="12" font-style="italic">Two repos enter. One leaves.</text>`;
  svg += `<line x1="60" y1="92" x2="${W-60}" y2="92" stroke="#c24d2c" stroke-width="1" opacity="0.5"/>`;
  svg += fighterPanel(fighterA, colorA, trustPctA, 20, 110, aWins);
  svg += fighterPanel(fighterB, colorB, trustPctB, 310, 110, bWins);
  const vsY = 280;
  svg += `<circle cx="${W/2}" cy="${vsY}" r="34" fill="#c24d2c"/>`;
  svg += `<circle cx="${W/2}" cy="${vsY}" r="30" fill="none" stroke="#f4efe6" stroke-width="2"/>`;
  svg += `<text x="${W/2}" y="${vsY+10}" text-anchor="middle" fill="#f4efe6" font-size="22" font-weight="bold" font-style="italic">VS</text>`;
  let statY = 460;
  svg += `<text x="${W/2}" y="${statY-10}" text-anchor="middle" fill="#6e6256" font-size="10" letter-spacing="2" font-family="ui-monospace,monospace">TALE OF THE TAPE</text>`;
  for (const stat of statPairs) {
    svg += statRow(stat, 50, statY, W - 100);
    statY += 26;
  }
  const vy = statY + 16;
  const verdictColor = draw ? '#c24d2c' : (aWins ? colorA : colorB);
  svg += `<rect x="30" y="${vy}" width="${W-60}" height="80" fill="${verdictColor}" rx="10" opacity="0.12"/>`;
  svg += `<rect x="30" y="${vy}" width="${W-60}" height="80" fill="none" stroke="${verdictColor}" stroke-width="2" rx="10"/>`;
  const lines = wrapText(verdict, 50);
  let tyy = vy + 28;
  for (const line of lines) {
    svg += `<text x="${W/2}" y="${tyy}" text-anchor="middle" fill="#f4efe6" font-size="15" font-weight="bold">${escXml(line)}</text>`;
    tyy += 22;
  }
  svg += `<line x1="60" y1="${H-48}" x2="${W-60}" y2="${H-48}" stroke="#2a221e" stroke-width="1"/>`;
  svg += `<text x="${W/2}" y="${H-26}" text-anchor="middle" fill="#6e6256" font-size="12" font-style="italic">rdm.synteq.app</text>`;
  svg += `</svg>`;
  return svg;
}

function fighterPanel(fighter, color, trustPct, x, y, wins) {
  const w = 270;
  const h = 320;
  let s = '';
  s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1e1814" rx="14"/>`;
  if (wins) {
    s += `<rect x="${x-3}" y="${y-3}" width="${w+6}" height="${h+6}" fill="none" stroke="${color}" stroke-width="3" rx="16"/>`;
    s += `<text x="${x + w/2}" y="${y - 10}" text-anchor="middle" fill="${color}" font-size="28">★</text>`;
  }
  s += `<rect x="${x}" y="${y}" width="${w}" height="6" fill="${color}" rx="14"/>`;
  const cx = x + w/2;
  const cy = y + 80;
  s += `<circle cx="${cx}" cy="${cy}" r="50" fill="${color}" opacity="0.15"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="42" fill="${color}"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="42" fill="none" stroke="#f4efe6" stroke-width="2" opacity="0.3"/>`;
  s += `<text x="${cx}" y="${cy+14}" text-anchor="middle" fill="#161210" font-size="36" font-weight="bold">${escXml(fighter.repo[0].toUpperCase())}</text>`;
  const nameLines = wrapText(fighter.handle, 24);
  let ny = y + 148;
  for (const line of nameLines) {
    s += `<text x="${cx}" y="${ny}" text-anchor="middle" fill="#f4efe6" font-size="14" font-weight="bold">${escXml(line)}</text>`;
    ny += 18;
  }
  const badgeY = ny + 2;
  const langText = fighter.primaryLanguage;
  const badgeW = Math.max(60, langText.length * 8 + 20);
  s += `<rect x="${cx - badgeW/2}" y="${badgeY}" width="${badgeW}" height="22" fill="${color}" rx="11" opacity="0.25"/>`;
  s += `<text x="${cx}" y="${badgeY+15}" text-anchor="middle" fill="#f4efe6" font-size="11" font-family="ui-monospace,monospace">${escXml(langText)}</text>`;
  const meterY = badgeY + 38;
  const meterW = 200;
  const meterX = cx - meterW/2;
  s += `<text x="${cx}" y="${meterY - 6}" text-anchor="middle" fill="#6e6256" font-size="9" letter-spacing="2" font-family="ui-monospace,monospace">TRUST SCORE</text>`;
  s += `<rect x="${meterX}" y="${meterY}" width="${meterW}" height="16" fill="#0a0806" rx="8"/>`;
  const fillW = Math.round(meterW * (trustPct / 100));
  const fillColor = trustPct >= 70 ? '#4a9968' : trustPct >= 40 ? '#c9a22c' : '#c24d2c';
  s += `<rect x="${meterX}" y="${meterY}" width="${fillW}" height="16" fill="${fillColor}" rx="8"/>`;
  s += `<text x="${cx}" y="${meterY + 32}" text-anchor="middle" fill="#f4efe6" font-size="22" font-weight="bold">${trustPct}<tspan font-size="12" fill="#6e6256">/100</tspan></text>`;
  let sy = meterY + 52;
  const colW = w / 2 - 10;
  const stats = [
    { label: 'STARS', value: formatNum(fighter.stars) },
    { label: 'FORKS', value: formatNum(fighter.forks) },
    { label: 'CONTRIB', value: formatNum(fighter.contributorCount) },
    { label: 'LICENSE', value: fighter.hasLicense ? fighter.license : 'NONE' },
    { label: 'TESTS', value: fighter.hasTests ? 'YES' : 'NO' },
    { label: 'ACTIVE', value: fighter.monthsSinceActivity <= 1 ? 'NOW' : fighter.monthsSinceActivity + 'mo' },
  ];
  for (let i = 0; i < stats.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const sx = x + 12 + col * colW;
    const syy = sy + row * 28;
    s += `<text x="${sx}" y="${syy}" fill="#6e6256" font-size="8" letter-spacing="1" font-family="ui-monospace,monospace">${escXml(stats[i].label)}</text>`;
    s += `<text x="${sx}" y="${syy+12}" fill="#f4efe6" font-size="13" font-weight="bold" font-family="ui-monospace,monospace">${escXml(stats[i].value)}</text>`;
  }
  return s;
}

function statRow(stat, x, y, w) {
  const aWin = winsStat(stat, 'a');
  const bWin = winsStat(stat, 'b');
  const aColor = aWin ? '#4a9968' : '#8a7e72';
  const bColor = bWin ? '#4a9968' : '#8a7e72';
  let s = `<line x1="${x}" y1="${y-4}" x2="${x+w}" y2="${y-4}" stroke="#221c18" stroke-width="1"/>`;
  s += `<text x="${x+4}" y="${y+6}" fill="${aColor}" font-size="13" font-family="ui-monospace,monospace" font-weight="${aWin?'bold':'normal'}">${escXml(String(stat.a))}</text>`;
  s += `<text x="${x+w/2}" y="${y+6}" text-anchor="middle" fill="#6e6256" font-size="10" letter-spacing="1" font-family="ui-monospace,monospace">${escXml(stat.label.toUpperCase())}</text>`;
  s += `<text x="${x+w-4}" y="${y+6}" text-anchor="end" fill="${bColor}" font-size="13" font-family="ui-monospace,monospace" font-weight="${bWin?'bold':'normal'}">${escXml(String(stat.b))}</text>`;
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

export function cardToPng(svg) {
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: W } });
  return resvg.render().asPng();
}

export function shareText(match, origin) {
  const { fighterA, fighterB, winner } = match;
  const url = `${origin}/m/${match.id || 'preview'}`;
  const aName = fighterA.handle;
  const bName = fighterB.handle;
  if (winner === 'draw') {
    return `${aName} vs ${bName}. Draw. It depends. Put two in the ring: ${url}`;
  }
  const winnerName = winner === 'a' ? aName : bName;
  const wTrust = winner === 'a' ? fighterA.trust.score : fighterB.trust.score;
  return `${aName} vs ${bName}. ${winnerName} won. Trust ${wTrust}. Put two in the ring: ${url}`;
}

// Sample match for the landing page
export function sampleCardSvg() {
  const sampleMatch = {
    fighterA: {
      owner: 'huggingface', repo: 'transformers', handle: 'huggingface/transformers',
      stars: 136000, forks: 27000, contributorCount: 2000,
      primaryLanguage: 'Python', hasLicense: true, license: 'MIT',
      installScripts: false, deps: 15, hasTests: true, hasCI: true,
      monthsSinceActivity: 0, archived: false, openIssues: 800,
      trust: { score: 0.89, label: 'trustworthy' },
    },
    fighterB: {
      owner: 'ollama', repo: 'ollama', handle: 'ollama/ollama',
      stars: 95000, forks: 7500, contributorCount: 350,
      primaryLanguage: 'Go', hasLicense: true, license: 'MIT',
      installScripts: false, deps: 8, hasTests: true, hasCI: true,
      monthsSinceActivity: 0, archived: false, openIssues: 400,
      trust: { score: 0.83, label: 'trustworthy' },
    },
    statPairs: [
      { label: 'Stars', a: 136000, b: 95000, higher: 'more' },
      { label: 'Forks', a: 27000, b: 7500, higher: 'more' },
      { label: 'Contributors', a: 2000, b: 350, higher: 'more' },
      { label: 'Trust', a: 0.89, b: 0.83, higher: 'more' },
      { label: 'License', a: 'Yes', b: 'Yes', higher: 'yes' },
      { label: 'Tests', a: 'Yes', b: 'Yes', higher: 'yes' },
      { label: 'CI', a: 'Yes', b: 'Yes', higher: 'yes' },
      { label: 'Deps', a: 15, b: 8, higher: 'fewer' },
      { label: 'Last active', a: '0mo', b: '0mo', higher: 'fewer' },
      { label: 'Install script', a: 'No', b: 'No', higher: 'no' },
    ],
    winner: 'a',
    verdict: 'transformers wins. Trust 89 vs 83. Both trustworthy. transformers wins on adoption.',
  };
  return deathmatchCardSvg(sampleMatch);
}
