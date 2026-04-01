import { NutrientValues } from '../types';


export function calculateDayScore(totals: any): number {
  let score = 0;

  // ── Grupa 1: Fundament (50 pkt) ─────────────────────────────────────────

  // Kalorie (15 pkt) — optimum 85-105% celu, kara za dużo i mało
  const calPct = totals.calories / 1800;
  if (calPct >= 0.85 && calPct <= 1.05) score += 15;
  else if (calPct >= 0.70 && calPct < 0.85) score += 10;
  else if (calPct > 1.05 && calPct <= 1.20) score += 8;
  else if (calPct >= 0.50) score += 4;

  // Białko (20 pkt) — im więcej tym lepiej, do 100% celu
  const protPct = Math.min(totals.protein / 110, 1);
  score += Math.round(protPct * 20);

  // Węgle (10 pkt) — kara za przekroczenie 90g
  const carbPct = totals.carbs / 90;
  if (carbPct <= 0.80) score += 8;
  else if (carbPct <= 1.00) score += 10;
  else if (carbPct <= 1.20) score += 5;
  else if (carbPct <= 1.50) score += 2;
  else score += 0;

  // Tłuszcze (5 pkt) — elastycznie, 70-130% celu
  const fatPct = totals.fat / 111;
  if (fatPct >= 0.70 && fatPct <= 1.30) score += 5;
  else if (fatPct >= 0.50) score += 2;

  // ── Grupa 2: Limity (kary do -20 pkt) ───────────────────────────────────

  // Cukier (max -8)
  const sugarPct = (totals.sugar_g ?? 0) / 25;
  if (sugarPct > 1) score -= Math.min(Math.round((sugarPct - 1) * 10), 8);

  // Sód (max -4)
  const sodiumPct = (totals.sodium_mg ?? 0) / 2000;
  if (sodiumPct > 1) score -= Math.min(Math.round((sodiumPct - 1) * 6), 4);

  // Tłuszcze nasycone (max -4)
  const satFatPct = (totals.saturated_fat_g ?? 0) / 20;
  if (satFatPct > 1) score -= Math.min(Math.round((satFatPct - 1) * 6), 4);

  // Kofeina (max -4)
  const caffPct = (totals.caffeine_mg ?? 0) / 200;
  if (caffPct > 1) score -= Math.min(Math.round((caffPct - 1) * 6), 4);

  // ── Grupa 3: Witaminy i minerały (35 pkt) ────────────────────────────────

  const micro = [
    { key: 'iron_mg',        rda: 18,   pts: 4 },
    { key: 'magnesium_mg',   rda: 350,  pts: 4 },
    { key: 'vitamin_d_ug',   rda: 25,   pts: 4 },
    { key: 'vitamin_c_mg',   rda: 100,  pts: 3 },
    { key: 'calcium_mg',     rda: 1000, pts: 3 },
    { key: 'zinc_mg',        rda: 10,   pts: 3 },
    { key: 'omega3_g',       rda: 2,    pts: 4 },
    { key: 'fiber',          rda: 28,   pts: 4 },
    { key: 'vitamin_b12_ug', rda: 2.4,  pts: 2 },
    { key: 'vitamin_b9_ug',  rda: 400,  pts: 2 },
    { key: 'vitamin_b6_mg',  rda: 1.5,  pts: 1 },
    { key: 'vitamin_k2_ug',  rda: 90,   pts: 1 },
    { key: 'potassium_mg',   rda: 3000, pts: 2 },
    { key: 'choline_mg',     rda: 450,  pts: 2 },
  ];

  for (const { key, rda, pts } of micro) {
    const pct = Math.min((totals[key] ?? 0) / rda, 1);
    score += Math.round(pct * pts);
  }

  // ── Grupa 4: Bonus fitoskładniki (max +10 pkt) ───────────────────────────

  let bonus = 0;
  const bonusItems = [
    { key: 'polyphenols_mg',       rda: 1000, pts: 2 },
    { key: 'lutein_zeaxanthin_ug', rda: 6000, pts: 2 },
    { key: 'beta_carotene_ug',     rda: 4000, pts: 2 },
    { key: 'lycopene_ug',          rda: 10000, pts: 2 },
    { key: 'quercetin_mg',         rda: 50,   pts: 1 },
    { key: 'anthocyanins_mg',      rda: 100,  pts: 1 },
  ];
  for (const { key, rda, pts } of bonusItems) {
    const pct = Math.min((totals[key] ?? 0) / rda, 1);
    bonus += Math.round(pct * pts);
  }
  score += Math.min(bonus, 10);

  return Math.max(0, Math.min(score, 110));
}
