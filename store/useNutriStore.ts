import { create } from 'zustand';
import { Meal, MealItem, NutrientValues, DailySummary } from '../types';
import { supabase } from '../lib/supabase';
import { sumNutrientValues } from '../lib/calculations';

interface NutriState {
  todayMeals: Meal[];
  isLoading: boolean;
  loadTodayMeals: () => Promise<void>;
  addMeal: (rawInput: string, items: MealItem[]) => Promise<void>;
  getTodayTotals: () => NutrientValues;
}

export const useNutriStore = create<NutriState>((set, get) => ({
  todayMeals: [],
  isLoading: false,

  loadTodayMeals: async () => {
    set({ isLoading: true });
    const today = new Date().toISOString().split('T')[0];
    
    const { data: meals } = await supabase
      .from('meals')
      .select('*, meal_items(*)')
      .gte('eaten_at', `${today}T00:00:00`)
      .lte('eaten_at', `${today}T23:59:59`)
      .order('eaten_at', { ascending: false });

    if (meals) {
      const parsed: Meal[] = meals.map((m: any) => ({
        id: m.id,
        eaten_at: m.eaten_at,
        raw_input: m.raw_input,
        items: (m.meal_items || []).map((i: any) => ({
          id: i.id,
          name: i.name,
          weight_grams: i.weight_grams,
          confirmed: i.confirmed,
          nutrient_key: i.nutrient_key,
          nutrients: {
            calories: i.calories,
            protein: i.protein,
            fat: i.fat,
            carbs: i.carbs,
            fiber: i.fiber,
            vitamin_a_ug: i.vitamin_a_ug,
            vitamin_b12_ug: i.vitamin_b12_ug,
            vitamin_c_mg: i.vitamin_c_mg,
            vitamin_d_ug: i.vitamin_d_ug,
            vitamin_k1_ug: i.vitamin_k1_ug,
            calcium_mg: i.calcium_mg,
            iron_mg: i.iron_mg,
            magnesium_mg: i.magnesium_mg,
            zinc_mg: i.zinc_mg,
            selenium_ug: i.selenium_ug,
            iodine_ug: i.iodine_ug,
          },
        })),
        total_nutrients: {},
      }));

      parsed.forEach(m => {
        m.total_nutrients = sumNutrientValues(m.items);
      });

      set({ todayMeals: parsed, isLoading: false });
    } else {
      set({ isLoading: false });
    }
  },

  addMeal: async (rawInput: string, items: MealItem[]) => {
    const total = sumNutrientValues(items);

    const { data: meal, error } = await supabase
      .from('meals')
      .insert({ raw_input: rawInput })
      .select()
      .single();

    if (error || !meal) return;

    const mealItemsToInsert = items.map(item => ({
      meal_id: meal.id,
      name: item.name,
      nutrient_key: item.nutrient_key,
      weight_grams: item.weight_grams,
      confirmed: item.confirmed,
      ...item.nutrients,
    }));

    await supabase.from('meal_items').insert(mealItemsToInsert);

    const newMeal: Meal = {
      id: meal.id,
      eaten_at: meal.eaten_at,
      raw_input: rawInput,
      items,
      total_nutrients: total,
    };

    set(state => ({ todayMeals: [newMeal, ...state.todayMeals] }));
  },

  getTodayTotals: () => {
    const { todayMeals } = get();
    return sumNutrientValues(todayMeals.flatMap(m => m.items));
  },
}));
