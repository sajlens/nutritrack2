import { NutrientValues, FoodItem } from '../types';
import nutrientsDB from '../data/nutrients_db.json';

const DB = nutrientsDB as any;

export function searchFood(query: string): Array<{ key: string; item: FoodItem; score: number }> {
  const q = query.toLowerCase().trim();
  const results: Array<{ key: string; item: FoodItem; score: number }> = [];

  for (const [key, item] of Object.entries(DB.items) as [string, FoodItem][]) {
    let score = 0;
    if (item.name_pl.toLowerCase() === q) score = 100;
    else if (item.name_pl.toLowerCase().startsWith(q)) score = 80;
    else if (item.name_pl.toLowerCase().includes(q)) score = 60;
    else if (item.aliases) {
      for (const alias of item.aliases) {
        if (alias.toLowerCase() === q) { score = 90; break; }
        else if (alias.toLowerCase().includes(q)) { score = 50; break; }
      }
    }
    if (score > 0) results.push({ key, item, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 10);
}

export function getFoodByKey(key: string): FoodItem | null {
  return (DB.items[key] as FoodItem) ?? null;
}

export function calculateNutrients(per100g: NutrientValues, weightGrams: number): NutrientValues {
  const factor = weightGrams / 100;
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
