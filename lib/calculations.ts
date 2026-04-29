import { NutrientValues } from '../types';
import { searchFoodAll, getFoodByKeyAll, calculateNutrients } from './nutrients';
import { ParsedFood } from './claude';
import { MealItem } from '../types';

// `custom_nutrients` to wartości odżywcze zapisane wprost (np. ręcznie wpisane
// danie restauracyjne, dla którego nie istnieje rekord w bazie produktów).
// W szablonach pole jest opcjonalne — występuje tylko dla itemów bez nutrient_key.
type ResolvableFood = ParsedFood & { custom_nutrients?: NutrientValues };

export async function resolveMealItems(parsedFoods: ResolvableFood[]): Promise<MealItem[]> {
  const items: MealItem[] = [];

  for (const food of parsedFoods) {
    const id = Math.random().toString(36).slice(2);

    // Custom nutrients — bierzemy wartości wprost, nie szukamy w bazie.
    // Tym sposobem szablony dań restauracyjnych zachowują swoje kalorie/białko/itd.
    if (food.custom_nutrients) {
      items.push({
        id,
        name: food.name,
        weight_grams: food.weight_grams,
        nutrients: food.custom_nutrients,
        confirmed: true,
      });
      continue;
    }

    // Najpierw spróbuj bezpośredniego lookup po kluczu (szablony używają kluczy)
    const directItem = await getFoodByKeyAll(food.name);
    if (directItem) {
      const nutrients = calculateNutrients(directItem.per_100g, food.weight_grams);
      items.push({
        id,
        name: directItem.name_pl,
        weight_grams: food.weight_grams,
        nutrients,
        confirmed: true,
        nutrient_key: food.name,
      });
      continue;
    }

    const results = await searchFoodAll(food.name);

    if (results.length > 0) {
      const { key, item } = results[0];
      const nutrients = calculateNutrients(item.per_100g, food.weight_grams);
      items.push({
        id,
        name: item.name_pl,
        weight_grams: food.weight_grams,
        nutrients,
        confirmed: true,
        nutrient_key: key,
      });
    } else {
      items.push({
        id,
        name: food.name,
        weight_grams: food.weight_grams,
        nutrients: {} as NutrientValues,
        confirmed: false,
      });
    }
  }

  return items;
}

export function sumNutrientValues(items: MealItem[]): NutrientValues {
  const total: NutrientValues = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(item.nutrients)) {
      if (typeof value === 'number') {
        (total as any)[key] = ((total as any)[key] ?? 0) + value;
      }
    }
  }
  return total;
}
