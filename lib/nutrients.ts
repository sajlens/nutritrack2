import { NutrientValues, FoodItem } from '../types';
import nutrientsDB from '../data/nutrients_db.json';
import { supabase } from './supabase';

const DB = nutrientsDB as any;

// Mapuje polskie znaki które NFD nie rozkłada poprawnie.
// NFD radzi sobie z: ą,ć,ę,ń,ó,ś,ź (znaki z diakrytykami nakładanymi).
// NIE radzi sobie z: ł, ż (to są osobne znaki Unicode, nie kompozycje).
const POLISH_CHARS: Record<string, string> = {
  'ł': 'l', 'Ł': 'l',
  'ż': 'z', 'Ż': 'z',
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[łżŁŻ]/g, (c) => POLISH_CHARS[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function scoreItem(namePl: string, aliases: string[] | undefined, q: string, qWords: string[]): number {
  const n = normalize(namePl);
  let score = 0;
  if (n === q) score = 100;
  else if (n.startsWith(q)) score = 85;
  else if (n.includes(q)) score = 70;
  else if (qWords.length > 0) {
    const matched = qWords.filter(w => n.includes(w));
    if (matched.length > 0) score = Math.round((matched.length / qWords.length) * 60);
  }
  if (score < 50 && aliases) {
    for (const alias of aliases) {
      const a = normalize(alias);
      if (a === q) { score = 90; break; }
      if (a.includes(q) || q.includes(a)) { score = Math.max(score, 55); break; }
      const matched = qWords.filter(w => a.includes(w));
      if (matched.length > 0) score = Math.max(score, Math.round((matched.length / qWords.length) * 50));
    }
  }
  return score;
}

export function searchFood(query: string): Array<{ key: string; item: FoodItem; score: number }> {
  const q = normalize(query);
  const qWords = q.split(/\s+/).filter(w => w.length > 2);
  const results: Array<{ key: string; item: FoodItem; score: number }> = [];

  for (const [key, item] of Object.entries(DB.items) as [string, FoodItem][]) {
    const score = scoreItem(item.name_pl, item.aliases, q, qWords);
    if (score > 0) results.push({ key, item, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

// Wyszukiwanie uwzględniające custom_products z Supabase
export async function searchFoodAll(query: string): Promise<Array<{ key: string; item: FoodItem; score: number; custom?: boolean }>> {
  const q = normalize(query);
  const qWords = q.split(/\s+/).filter(w => w.length > 2);
  const results: Array<{ key: string; item: FoodItem; score: number; custom?: boolean }> = [];
  const seenKeys = new Set<string>();

  // Załaduj override'y porcji raz
  await loadOverrides();

  // 1. Lokalna baza — ma pierwszeństwo, jej klucze rezerwują pozycję
  for (const [key, item] of Object.entries(DB.items) as [string, FoodItem][]) {
    const score = scoreItem(item.name_pl, item.aliases, q, qWords);
    if (score > 0) {
      results.push({ key, item: applyOverrideSync(key, item), score });
      seenKeys.add(key);
    }
  }

  // 2. Custom products z Supabase — pomijamy klucze już istniejące lokalnie
  try {
    const { data } = await supabase.from('custom_products').select('*');
    if (data) {
      for (const row of data) {
        if (seenKeys.has(row.key)) continue;
        const score = scoreItem(row.name_pl, row.aliases ?? [], q, qWords);
        if (score === 0) continue;
        const item: FoodItem = {
          name_pl: row.name_pl,
          name_en: row.name_en ?? '',
          category: row.category ?? 'inne',
          per_100g: row.per_100g,
          serving_g: row.serving_g,
          aliases: row.aliases ?? [],
        };
        results.push({ key: row.key, item: applyOverrideSync(row.key, item), score: Math.max(score, 25), custom: true });
        seenKeys.add(row.key);
      }
    }
  } catch {
    // Brak internetu lub błąd — kontynuuj z lokalną bazą
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 15);
}

export function getFoodByKey(key: string): FoodItem | null {
  const item = DB.items[key] as FoodItem;
  if (!item) return null;
  // Synchroniczny variant nie ma dostępu do override'ów (Supabase = async)
  // — używaj getFoodByKeyAll gdzie się da.
  return applyOverrideSync(key, item);
}

// ============================================================
// Cache override'ów porcji (product_overrides w Supabase)
// ============================================================
type ServingOverride = { serving_g?: number | null; serving_note?: string | null };
let overridesCache: Record<string, ServingOverride> | null = null;
let overridesLoading: Promise<void> | null = null;

async function loadOverrides(): Promise<void> {
  if (overridesCache !== null) return;
  if (overridesLoading) return overridesLoading;
  overridesLoading = (async () => {
    try {
      const { data } = await supabase.from('product_overrides').select('*');
      const map: Record<string, ServingOverride> = {};
      if (data) {
        for (const row of data) {
          map[row.key] = { serving_g: row.serving_g, serving_note: row.serving_note };
        }
      }
      overridesCache = map;
    } catch {
      overridesCache = {};
    } finally {
      overridesLoading = null;
    }
  })();
  return overridesLoading;
}

function applyOverrideSync(key: string, item: FoodItem): FoodItem {
  if (!overridesCache) return item;
  const ov = overridesCache[key];
  if (!ov) return item;
  return {
    ...item,
    serving_g: ov.serving_g ?? item.serving_g,
    serving_note: ov.serving_note ?? item.serving_note,
  };
}

export async function getProductOverride(key: string): Promise<ServingOverride | null> {
  await loadOverrides();
  return overridesCache?.[key] ?? null;
}

export async function setProductOverride(
  key: string,
  serving_g: number | null,
  serving_note: string | null,
): Promise<void> {
  await loadOverrides();
  // Upsert do Supabase
  await supabase.from('product_overrides').upsert(
    { key, serving_g, serving_note },
    { onConflict: 'key' }
  );
  // Aktualizuj cache lokalnie
  if (overridesCache) {
    if (serving_g === null && serving_note === null) {
      delete overridesCache[key];
    } else {
      overridesCache[key] = { serving_g, serving_note };
    }
  }
}

export async function deleteProductOverride(key: string): Promise<void> {
  await loadOverrides();
  await supabase.from('product_overrides').delete().eq('key', key);
  if (overridesCache) delete overridesCache[key];
}

export async function getFoodByKeyAll(key: string): Promise<FoodItem | null> {
  await loadOverrides();
  const local = DB.items[key] as FoodItem;
  if (local) return applyOverrideSync(key, local);
  try {
    const { data } = await supabase.from('custom_products').select('*').eq('key', key).single();
    if (data) {
      const item: FoodItem = {
        name_pl: data.name_pl,
        name_en: data.name_en ?? '',
        category: data.category ?? 'inne',
        per_100g: data.per_100g,
        serving_g: data.serving_g,
        aliases: data.aliases,
      };
      return applyOverrideSync(key, item);
    }
  } catch {}
  return null;
}

export function isSupplementKey(key: string): boolean {
  return key.startsWith('suplement_');
}

export function calculateNutrients(per100g: NutrientValues, weightGrams: number, perPortion = false): NutrientValues {
  const factor = perPortion ? 1 : weightGrams / 100;
  const result: NutrientValues = {};
  for (const [key, value] of Object.entries(per100g)) {
    if (typeof value === 'number') {
      (result as any)[key] = Math.round(value * factor * 1000) / 1000;
    }
  }
  return result;
}

export function sumNutrients(items: NutrientValues[]): NutrientValues {
  const total: NutrientValues = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item)) {
      if (typeof value === 'number') {
        (total as any)[key] = ((total as any)[key] ?? 0) + value;
      }
    }
  }
  for (const key of Object.keys(total)) {
    (total as any)[key] = Math.round((total as any)[key] * 1000) / 1000;
  }
  return total;
}
