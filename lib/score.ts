import { NUTRIENTS } from '../constants/nutrients';

// Pomocnik: zwraca cel (rda_personal) dla danego klucza, lub fallback gdy brak.
function target(key: string, fallback: number): number {
  return NUTRIENTS[key]?.rda_personal ?? fallback;
}

export function calculateDayScore(totals: any): number {
  let score = 0;

  // ── Grupa 1: Fundament (50 pkt) ─────────────────────────────────────────

  // Kalorie (15 pkt) — optimum 85-105% celu, kara za dużo i mało
  const calPct = totals.calories / target('calories', 1800);
  if (calPct >= 0.85 && calPct <= 1.05) score += 15;
  else if (calPct >= 0.70 && calPct < 0.85) score += 10;
  else if (calPct > 1.05 && calPct <= 1.20) score += 8;
  else if (calPct >= 0.50) score += 4;

  // Białko (20 pkt) — im więcej tym lepiej, do 100% celu
  const protPct = Math.min(totals.protein / target('protein', 110), 1);
  score += Math.round(protPct * 20);

  // Węgle (10 pkt) — kara za przekroczenie
  const carbPct = totals.carbs / target('carbs', 90);
  if (carbPct <= 0.80) score += 8;
  else if (carbPct <= 1.00) score += 10;
  else if (carbPct <= 1.20) score += 5;
  else if (carbPct <= 1.50) score += 2;
  else score += 0;

  // Tłuszcze (5 pkt) — elastycznie, 70-130% celu
  const fatPct = totals.fat / target('fat', 111);
  if (fatPct >= 0.70 && fatPct <= 1.30) score += 5;
  else if (fatPct >= 0.50) score += 2;

  // ── Grupa 2: Limity (kary do -20 pkt) ───────────────────────────────────

  // Cukier (max -8)
  const sugarPct = (totals.sugar_g ?? 0) / target('sugar_g', 25);
  if (sugarPct > 1) score -= Math.min(Math.round((sugarPct - 1) * 10), 8);

  // Sód (max -4)
  const sodiumPct = (totals.sodium_mg ?? 0) / target('sodium_mg', 2000);
  if (sodiumPct > 1) score -= Math.min(Math.round((sodiumPct - 1) * 6), 4);

  // Tłuszcze nasycone (max -4)
  const satFatPct = (totals.saturated_fat_g ?? 0) / target('saturated_fat_g', 20);
  if (satFatPct > 1) score -= Math.min(Math.round((satFatPct - 1) * 6), 4);

  // Kofeina (max -4)
  const caffPct = (totals.caffeine_mg ?? 0) / target('caffeine_mg', 200);
  if (caffPct > 1) score -= Math.min(Math.round((caffPct - 1) * 6), 4);

  // ── Grupa 3: Witaminy i minerały (35 pkt) ────────────────────────────────

  // Lista mikroskładników: punkty są wagą znaczenia, RDA bierzemy z NUTRIENTS.
  const micro: { key: string; pts: number }[] = [
    { key: 'iron_mg',        pts: 4 },
    { key: 'magnesium_mg',   pts: 4 },
    { key: 'vitamin_d_ug',   pts: 4 },
    { key: 'vitamin_c_mg',   pts: 3 },
    { key: 'calcium_mg',     pts: 3 },
    { key: 'zinc_mg',        pts: 3 },
    { key: 'omega3_g',       pts: 4 },
    { key: 'fiber',          pts: 4 },
    { key: 'vitamin_b12_ug', pts: 2 },
    { key: 'vitamin_b9_ug',  pts: 2 },
    { key: 'vitamin_b6_mg',  pts: 1 },
    { key: 'vitamin_k2_ug',  pts: 1 },
    { key: 'potassium_mg',   pts: 2 },
    { key: 'choline_mg',     pts: 2 },
  ];

  for (const { key, pts } of micro) {
    const rda = NUTRIENTS[key]?.rda_personal ?? 0;
    if (rda <= 0) continue;
    const pct = Math.min((totals[key] ?? 0) / rda, 1);
    score += Math.round(pct * pts);
  }

  // ── Grupa 4: Bonus fitoskładniki (max +10 pkt) ───────────────────────────

  let bonus = 0;
  const bonusItems: { key: string; pts: number }[] = [
    { key: 'polyphenols_mg',       pts: 2 },
    { key: 'lutein_zeaxanthin_ug', pts: 2 },
    { key: 'beta_carotene_ug',     pts: 2 },
    { key: 'lycopene_ug',          pts: 2 },
    { key: 'quercetin_mg',         pts: 1 },
    { key: 'anthocyanins_mg',      pts: 1 },
  ];
  for (const { key, pts } of bonusItems) {
    const rda = NUTRIENTS[key]?.rda_personal ?? 0;
    if (rda <= 0) continue;
    const pct = Math.min((totals[key] ?? 0) / rda, 1);
    bonus += Math.round(pct * pts);
  }
  score += Math.min(bonus, 10);

  return Math.max(0, Math.min(score, 110));
}
