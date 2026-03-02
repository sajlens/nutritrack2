import { NutrientValues } from '../types';
import { searchFood, calculateNutrients, getFoodByKey } from './nutrients';
import { getNutrientsFromClaude, ParsedFood } from './claude';
import { MealItem } from '../types';

export async function resolveMealItems(parsedFoods: ParsedFood[]): Promise<MealItem[]> {
  const items: MealItem[] = [];

  for (const food of parsedFoods) {
    const id = Math.random().toString(36).slice(2);
    
    // Szukaj w lokalnej bazie
    const results = searchFood(food.name);
    
    if (results.length > 0 && results[0].score >= 50) {
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
      // Fallback do Claude API
      const nutrients = await getNutrientsFromClaude(food.name, food.weight_grams);
      items.push({
        id,
        name: food.name,
        weight_grams: food.weight_grams,
        nutrients: nutrients as NutrientValues,
        confirmed: true,
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
