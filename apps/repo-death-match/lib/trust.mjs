// Trust score computation. Same Beta reputation model as BOTy.
// Trust = (alpha + 1) / (alpha + beta + 2)
// alpha = productive signals, beta = red flags, staleness = decay

export function computeTrust(fighter) {
  let alpha = 1; // neutral start
  let beta = 0;
  const signals = [];

  // License
  if (fighter.hasLicense) {
    alpha += 1;
    signals.push({ label: 'Has license', good: true, value: fighter.license });
  } else {
    beta += 1;
    signals.push({ label: 'No license', good: false, value: 'No permission to use this code.' });
  }

  // Tests
  if (fighter.hasTests) {
    alpha += 1;
    signals.push({ label: 'Has tests', good: true });
  } else {
    beta += 0.5;
    signals.push({ label: 'No tests', good: false });
  }

  // CI
  if (fighter.hasCI) {
    alpha += 1;
    signals.push({ label: 'CI configured', good: true });
  } else {
    beta += 0.5;
    signals.push({ label: 'No CI', good: false });
  }

  // Install scripts
  if (fighter.installScripts) {
    beta += 2;
    signals.push({ label: 'Runs code on install', good: false });
  } else {
    alpha += 0.5;
    signals.push({ label: 'Clean install', good: true });
  }

  // Dependencies
  if (fighter.deps !== null) {
    if (fighter.deps <= 10) {
      alpha += 1;
      signals.push({ label: 'Few dependencies', good: true, value: `${fighter.deps}` });
    } else if (fighter.deps <= 50) {
      alpha += 0.5;
      signals.push({ label: 'Moderate dependencies', good: true, value: `${fighter.deps}` });
    } else {
      beta += 1;
      signals.push({ label: 'Heavy dependencies', good: false, value: `${fighter.deps}` });
    }
  }

  // Contributors
  if (fighter.contributorCount >= 10) {
    alpha += 1;
    signals.push({ label: 'Many contributors', good: true, value: `${fighter.contributorCount}` });
  } else if (fighter.contributorCount >= 3) {
    alpha += 0.5;
    signals.push({ label: 'A few contributors', good: true, value: `${fighter.contributorCount}` });
  } else {
    beta += 0.5;
    signals.push({ label: 'Single contributor', good: false, value: `${fighter.contributorCount}` });
  }

  // Stars vs forks (adoption signal)
  if (fighter.stars > 0) {
    if (fighter.adoptionRatio > 0.05) {
      alpha += 1;
      signals.push({ label: 'People are building', good: true, value: `${fighter.forks} forks / ${fighter.stars} stars` });
    } else {
      beta += 0.5;
      signals.push({ label: 'People are saving, not building', good: false, value: `${fighter.stars} stars / ${fighter.forks} forks` });
    }
  }

  // Archived
  if (fighter.archived) {
    beta += 3;
    signals.push({ label: 'Archived', good: false, value: 'This repo is read-only.' });
  }

  // Staleness decay
  const months = fighter.monthsSinceActivity;
  if (months <= 1) {
    alpha += 1;
    signals.push({ label: 'Active', good: true, value: `Last commit ${months === 0 ? 'this month' : 'last month'}` });
  } else if (months <= 6) {
    alpha += 0.5;
    signals.push({ label: 'Maintained', good: true, value: `Last commit ${months} months ago` });
  } else if (months <= 12) {
    signals.push({ label: 'Stale', good: false, value: `Last commit ${months} months ago` });
    alpha *= 0.8;
  } else {
    beta += 1;
    alpha *= Math.max(0.3, 1 - (months - 12) * 0.05);
    signals.push({ label: 'Abandoned', good: false, value: `Last commit ${months} months ago` });
  }

  const trust = (alpha + 1) / (alpha + beta + 2);

  return {
    score: Math.round(trust * 100) / 100,
    alpha: Math.round(alpha * 100) / 100,
    beta: Math.round(beta * 100) / 100,
    signals,
    label: trustLabel(trust),
  };
}

function trustLabel(t) {
  if (t >= 0.7) return 'trustworthy';
  if (t >= 0.4) return "it's complicated";
  if (t >= 0.125) return 'wobbly';
  return 'terminated';
}

export function trustMeter(score) {
  // Returns SVG path data for a meter bar
  const pct = Math.max(0, Math.min(1, score));
  return pct;
}

// Compare two fighters and produce a verdict
export function deathmatch(fighterA, fighterB) {
  const trustA = computeTrust(fighterA);
  const trustB = computeTrust(fighterB);

  // Compare key stats head-to-head
  const statPairs = [
    { label: 'Stars', a: fighterA.stars, b: fighterB.stars, higher: 'more' },
    { label: 'Forks', a: fighterA.forks, b: fighterB.forks, higher: 'more' },
    { label: 'Contributors', a: fighterA.contributorCount, b: fighterB.contributorCount, higher: 'more' },
    { label: 'Trust', a: trustA.score, b: trustB.score, higher: 'more' },
    { label: 'License', a: fighterA.hasLicense ? 'Yes' : 'No', b: fighterB.hasLicense ? 'Yes' : 'No', higher: 'yes' },
    { label: 'Tests', a: fighterA.hasTests ? 'Yes' : 'No', b: fighterB.hasTests ? 'Yes' : 'No', higher: 'yes' },
    { label: 'CI', a: fighterA.hasCI ? 'Yes' : 'No', b: fighterB.hasCI ? 'Yes' : 'No', higher: 'yes' },
    { label: 'Deps', a: fighterA.deps ?? '?', b: fighterB.deps ?? '?', higher: 'fewer' },
    { label: 'Last active', a: `${fighterA.monthsSinceActivity}mo`, b: `${fighterB.monthsSinceActivity}mo`, higher: 'fewer' },
    { label: 'Install script', a: fighterA.installScripts ? 'Yes (risk)' : 'No', b: fighterB.installScripts ? 'Yes (risk)' : 'No', higher: 'no' },
  ];

  // Determine winner
  const diff = trustA.score - trustB.score;
  let winner = null;
  let verdict = '';
  let aWins = statPairs.filter(s => winsStat(s, 'a')).length;
  let bWins = statPairs.filter(s => winsStat(s, 'b')).length;

  if (Math.abs(diff) < 0.08) {
    winner = 'draw';
    const aStrengths = statPairs.filter(s => winsStat(s, 'a')).map(s => s.label);
    const bStrengths = statPairs.filter(s => winsStat(s, 'b')).map(s => s.label);
    let aPart = aStrengths.length ? `${fighterA.repo} wins on ${aStrengths.slice(0, 3).join(', ')}` : `${fighterA.repo} ties on most stats`;
    let bPart = bStrengths.length ? `${fighterB.repo} wins on ${bStrengths.slice(0, 3).join(', ')}` : `${fighterB.repo} ties on most stats`;
    verdict = `DRAW. ${aPart}. ${bPart}. It depends.`;
    winner = 'a';
    verdict = `${fighterA.repo} wins. Trust ${trustA.score} vs ${trustB.score}.`;
  } else {
    winner = 'b';
    verdict = `${fighterB.repo} wins. Trust ${trustB.score} vs ${trustA.score}.`;
  }

  return {
    fighterA: { ...fighterA, trust: trustA },
    fighterB: { ...fighterB, trust: trustB },
    statPairs,
    winner,
    verdict,
    aWins,
    bWins,
  };
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
