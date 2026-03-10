import { create } from 'zustand';
import { Meal, MealItem, NutrientValues, DailySummary } from '../types';
import { supabase } from '../lib/supabase';
import { sumNutrientValues } from '../lib/calculations';

const EXCLUDED_KEYS = new Set([
  'id', 'meal_id', 'name', 'weight_grams', 'confirmed', 'nutrient_key', 'created_at'
]);

function extractNutrients(row: any): NutrientValues {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([k, v]) => !EXCLUDED_KEYS.has(k) && typeof v === 'number')
  );
}

interface NutriState {
  todayMeals: Meal[];
  isLoading: boolean;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  loadTodayMeals: () => Promise<void>;
  loadMealsForDate: (date: string) => Promise<void>;
  addMeal: (rawInput: string, items: MealItem[]) => Promise<void>;
  updateMeal: (mealId: string, rawInput: string, items: MealItem[]) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;
  getTodayTotals: () => NutrientValues;
}

export const useNutriStore = create<NutriState>((set, get) => ({
  todayMeals: [],
  isLoading: false,
  selectedDate: new Date().toISOString().split('T')[0],

  setSelectedDate: (date: string) => {
    set({ selectedDate: date });
    get().loadMealsForDate(date);
  },

  loadMealsForDate: async (date: string) => {
    set({ isLoading: true });

    const { data: meals } = await supabase
      .from('meals')
      .select('*, meal_items(*)')
      .gte('eaten_at', `${date}T00:00:00`)
      .lte('eaten_at', `${date}T23:59:59`)
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
          nutrients: extractNutrients(i),
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

  loadTodayMeals: async () => {
    const today = new Date().toISOString().split('T')[0];
    set({ selectedDate: today });
    return get().loadMealsForDate(today);
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

  updateMeal: async (mealId: string, rawInput: string, items: MealItem[]) => {
    await supabase
      .from('meals')
      .update({ raw_input: rawInput })
      .eq('id', mealId);

    await supabase.from('meal_items').delete().eq('meal_id', mealId);

    const mealItemsToInsert = items.map(item => ({
      meal_id: mealId,
      name: item.name,
      nutrient_key: item.nutrient_key,
      weight_grams: item.weight_grams,
      confirmed: item.confirmed,
      ...item.nutrients,
    }));

    await supabase.from('meal_items').insert(mealItemsToInsert);

    const total = sumNutrientValues(items);
    set(state => ({
      todayMeals: state.todayMeals.map(m =>
        m.id === mealId
          ? { ...m, raw_input: rawInput, items, total_nutrients: total }
          : m
      ),
    }));
  },

  deleteMeal: async (mealId: string) => {
    await supabase.from('meal_items').delete().eq('meal_id', mealId);
    await supabase.from('meals').delete().eq('id', mealId);
    set(state => ({
      todayMeals: state.todayMeals.filter(m => m.id !== mealId),
    }));
  },

  getTodayTotals: () => {
    const { todayMeals } = get();
    return sumNutrientValues(todayMeals.flatMap(m => m.items));
  },
}));
