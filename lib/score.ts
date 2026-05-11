import { NUTRIENTS, getRdaFor, DayMode } from '../constants/nutrients';

// Pomocnik: zwraca cel dla danego klucza w danym trybie, lub fallback gdy brak.
function target(key: string, mode: DayMode, fallback: number): number {
  const meta = NUTRIENTS[key];
  if (!meta) return fallback;
  return getRdaFor(meta, mode) ?? fallback;
}

// Szczegół składowej wyniku — używane do podpowiedzi "co podnieść"
export type ScoreItem = {
  key: string;          // np. 'vitamin_d_ug' lub 'protein'
  label: string;        // czytelna nazwa
  earned: number;       // ile pkt zdobyto
  max: number;          // ile można maksymalnie
  pct: number;          // % spełnienia celu (0-100+)
  kind: 'fundament' | 'mikro' | 'bonus' | 'kara';
  hint?: string;        // krótka rada
};

export type ScoreBreakdown = {
  total: number;
  items: ScoreItem[];
};

export function getScoreBreakdown(totals: any, mode: DayMode = 'maintain'): ScoreBreakdown {
  const items: ScoreItem[] = [];

  // ── Fundament ───────────────────────────────────────────────────────────
  const calT = target('calories', mode, 1800);
  const calPct = totals.calories / calT;
  let calPts = 0;
  if (calPct >= 0.85 && calPct <= 1.05) calPts = 15;
  else if (calPct >= 0.70 && calPct < 0.85) calPts = 10;
  else if (calPct > 1.05 && calPct <= 1.20) calPts = 8;
  else if (calPct >= 0.50) calPts = 4;
  items.push({
    key: 'calories', label: 'Kalorie', earned: calPts, max: 15, pct: calPct * 100, kind: 'fundament',
    hint: calPct < 0.85 ? 'Zjedz więcej' : calPct > 1.05 ? 'Mniej kalorii' : undefined,
  });

  const protT = target('protein', mode, 110);
  const protRatio = Math.min(totals.protein / protT, 1);
  const protPts = Math.round(protRatio * 20);
  items.push({
    key: 'protein', label: 'Białko', earned: protPts, max: 20, pct: (totals.protein / protT) * 100, kind: 'fundament',
    hint: protPts < 20 ? 'Dodaj białko' : undefined,
  });

  const carbT = target('carbs', mode, 115);
  const carbPct = totals.carbs / carbT;
  let carbPts = 0;
  if (carbPct <= 0.80) carbPts = 8;
  else if (carbPct <= 1.00) carbPts = 10;
  else if (carbPct <= 1.20) carbPts = 5;
  else if (carbPct <= 1.50) carbPts = 2;
  items.push({
    key: 'carbs', label: 'Węglowodany', earned: carbPts, max: 10, pct: carbPct * 100, kind: 'fundament',
    hint: carbPct > 1.20 ? 'Mniej węgli' : undefined,
  });

  const fatT = target('fat', mode, 100);
  const fatPct = totals.fat / fatT;
  let fatPts = 0;
  if (fatPct >= 0.70 && fatPct <= 1.30) fatPts = 5;
  else if (fatPct >= 0.50) fatPts = 2;
  items.push({
    key: 'fat', label: 'Tłuszcze', earned: fatPts, max: 5, pct: fatPct * 100, kind: 'fundament',
    hint: fatPct < 0.70 ? 'Dodaj zdrowych tłuszczów' : fatPct > 1.30 ? 'Mniej tłuszczu' : undefined,
  });

  // ── Kary ────────────────────────────────────────────────────────────────
  const effSugar = Math.max(0, (totals.sugar_g ?? 0) - (totals.fiber ?? 0) / 2);
  const sugarTarget = target('effective_sugar', mode, 25);
  const sugarPct = effSugar / sugarTarget;
  let sugarPenalty = 0;
  if (sugarPct > 1) sugarPenalty = Math.min(Math.round((sugarPct - 1) * 10), 8);
  if (sugarPenalty > 0) {
    items.push({
      key: 'effective_sugar', label: 'Cukry efektywne', earned: -sugarPenalty, max: 0, pct: sugarPct * 100, kind: 'kara',
      hint: 'Ogranicz słodycze i napoje',
    });
  }

  const sodium = totals.sodium_mg ?? 0;
  const sodiumMeta = NUTRIENTS.sodium_mg;
  const sodMin = sodiumMeta?.rda_min ?? 2300;
  const sodMax = sodiumMeta?.rda_max ?? 4000;
  let sodPenalty = 0;
  let sodHint: string | undefined;
  if (sodium < sodMin) {
    sodPenalty = Math.min(Math.round(((sodMin - sodium) / sodMin) * 3), 2);
    sodHint = 'Dodaj sodu (sól, elektrolity)';
  } else if (sodium > sodMax) {
    sodPenalty = Math.min(Math.round(((sodium - sodMax) / sodMax) * 3), 2);
    sodHint = 'Ogranicz sód';
  }
  if (sodPenalty > 0) {
    items.push({
      key: 'sodium_mg', label: 'Sód', earned: -sodPenalty, max: 0, pct: (sodium / sodMin) * 100, kind: 'kara', hint: sodHint,
    });
  }

  const satFatPct = (totals.saturated_fat_g ?? 0) / target('saturated_fat_g', mode, 20);
  let satPenalty = 0;
  if (satFatPct > 1) satPenalty = Math.min(Math.round((satFatPct - 1) * 6), 4);
  if (satPenalty > 0) {
    items.push({
      key: 'saturated_fat_g', label: 'Tłuszcze nasycone', earned: -satPenalty, max: 0, pct: satFatPct * 100, kind: 'kara',
      hint: 'Mniej masła, smalcu, tłustego mięsa',
    });
  }

  // Kofeina — bez kary (świadoma decyzja użytkowniczki)

  // ── Mikroskładniki ──────────────────────────────────────────────────────
  const micro: { key: string; pts: number; hint: string }[] = [
    { key: 'iron_mg',        pts: 4, hint: 'Podnieś żelazo' },
    { key: 'magnesium_mg',   pts: 4, hint: 'Podnieś magnez' },
    { key: 'vitamin_d_ug',   pts: 4, hint: 'Podnieś witaminę D' },
    { key: 'vitamin_c_mg',   pts: 3, hint: 'Podnieś witaminę C' },
    { key: 'calcium_mg',     pts: 3, hint: 'Podnieś wapń' },
    { key: 'zinc_mg',        pts: 3, hint: 'Podnieś cynk' },
    { key: 'omega3_g',       pts: 4, hint: 'Podnieś omega-3' },
    { key: 'fiber',          pts: 6, hint: 'Podnieś błonnik' },
    { key: 'vitamin_b12_ug', pts: 2, hint: 'Podnieś witaminę B12' },
    { key: 'vitamin_b9_ug',  pts: 2, hint: 'Podnieś foliany' },
    { key: 'vitamin_b6_mg',  pts: 1, hint: 'Podnieś witaminę B6' },
    { key: 'vitamin_k2_ug',  pts: 1, hint: 'Podnieś witaminę K2' },
    { key: 'potassium_mg',   pts: 4, hint: 'Podnieś potas' },
    { key: 'choline_mg',     pts: 4, hint: 'Podnieś cholinę' },
  ];
  for (const { key, pts, hint } of micro) {
    const rda = target(key, mode, 0);
    if (rda <= 0) continue;
    const ratio = (totals[key] ?? 0) / rda;
    const earned = Math.round(Math.min(ratio, 1) * pts);
    items.push({
      key, label: NUTRIENTS[key]?.label ?? key, earned, max: pts, pct: ratio * 100, kind: 'mikro',
      hint: earned < pts ? hint : undefined,
    });
  }

  // ── Bonus ───────────────────────────────────────────────────────────────
  const bonusItems: { key: string; pts: number; hint: string }[] = [
    { key: 'polyphenols_mg',       pts: 3, hint: 'Podnieś polifenole (kakao, owoce jagodowe, herbata)' },
    { key: 'lutein_zeaxanthin_ug', pts: 3, hint: 'Podnieś luteinę (zielone liście, żółtko)' },
    { key: 'beta_carotene_ug',     pts: 3, hint: 'Podnieś beta-karoten (marchew, dynia)' },
    { key: 'lycopene_ug',          pts: 3, hint: 'Podnieś likopen (pomidory, arbuz)' },
    { key: 'quercetin_mg',         pts: 2, hint: 'Podnieś kwercetynę (cebula, jabłko, kapary)' },
    { key: 'anthocyanins_mg',      pts: 2, hint: 'Podnieś antocyjany (jagody, czarna porzeczka)' },
  ];
  for (const { key, pts, hint } of bonusItems) {
    const rda = target(key, mode, 0);
    if (rda <= 0) continue;
    const ratio = (totals[key] ?? 0) / rda;
    const earned = Math.round(Math.min(ratio, 1) * pts);
    items.push({
      key, label: NUTRIENTS[key]?.label ?? key, earned, max: pts, pct: ratio * 100, kind: 'bonus',
      hint: earned < pts ? hint : undefined,
    });
  }

  const positive = items.filter(i => i.kind !== 'kara').reduce((s, i) => s + i.earned, 0);
  const penalties = items.filter(i => i.kind === 'kara').reduce((s, i) => s + i.earned, 0);
  const bonusTotal = items.filter(i => i.kind === 'bonus').reduce((s, i) => s + i.earned, 0);
  const positiveNoBonus = positive - bonusTotal;
  const total = Math.max(0, Math.min(positiveNoBonus + Math.min(bonusTotal, 14) + penalties, 110));

  return { total, items };
}

export function calculateDayScore(totals: any, mode: DayMode = 'maintain'): number {
  return getScoreBreakdown(totals, mode).total;
}
