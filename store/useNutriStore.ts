import { create } from 'zustand';
import { Meal, MealItem, NutrientValues, DailySummary } from '../types';
import { supabase } from '../lib/supabase';
import { sumNutrientValues } from '../lib/calculations';
import { localDateString, localDayRangeUtc } from '../lib/dates';

const EXCLUDED_KEYS = new Set([
  'id', 'meal_id', 'name', 'weight_grams', 'confirmed', 'nutrient_key', 'created_at'
]);

const VALID_NUTRIENT_COLS = new Set([
  'calories','protein','fat','carbs','fiber',
  'vitamin_a_ug','vitamin_b1_mg','vitamin_b2_mg','vitamin_b3_mg','vitamin_b5_mg',
  'vitamin_b6_mg','vitamin_b7_ug','vitamin_b9_ug','vitamin_b12_ug',
  'vitamin_c_mg','vitamin_d_ug','vitamin_e_mg','vitamin_k1_ug','vitamin_k2_ug',
  'calcium_mg','iron_mg','magnesium_mg','phosphorus_mg','potassium_mg',
  'sodium_mg','zinc_mg','copper_mg','manganese_mg','selenium_ug','iodine_ug','choline_mg',
  'sugar_g','water_g','saturated_fat_g','monounsaturated_fat_g','polyunsaturated_fat_g',
  'omega3_g','omega6_g','beta_carotene_ug','lutein_zeaxanthin_ug','lycopene_ug',
  'polyphenols_mg','quercetin_mg','anthocyanins_mg','chlorogenic_acid_mg',
  'betaine_mg','caffeine_mg','coenzyme_q10_mg','carnitine_mg','collagen_g','creatine_g',
]);

const filterNutrients = (nutrients: any) =>
  Object.fromEntries(Object.entries(nutrients).filter(([k]) => VALID_NUTRIENT_COLS.has(k)));

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
  updateMeal: (mealId: string, rawInput: string, items: MealItem[], newEatenAtIso?: string) => Promise<void>;
  deleteMeal: (mealId: string) => Promise<void>;
  getTodayTotals: () => NutrientValues;
}

export const useNutriStore = create<NutriState>((set, get) => ({
  todayMeals: [],
  isLoading: false,
  selectedDate: localDateString(),

  setSelectedDate: (date: string) => {
    set({ selectedDate: date });
    get().loadMealsForDate(date);
  },

  loadMealsForDate: async (date: string) => {
    set({ isLoading: true });

    const { startIso, endIso } = localDayRangeUtc(date);

    const { data: meals } = await supabase
      .from('meals')
      .select('*, meal_items(*)')
      .gte('eaten_at', startIso)
      .lte('eaten_at', endIso)
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
    const today = localDateString();
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
      ...filterNutrients(item.nutrients),
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

  updateMeal: async (mealId: string, rawInput: string, items: MealItem[], newEatenAtIso?: string) => {
    // Backup istniejących itemów na wypadek błędu w trakcie zapisu nowych.
    const { data: backup } = await supabase
      .from('meal_items')
      .select('*')
      .eq('meal_id', mealId);

    const updateData: any = { raw_input: rawInput };
    if (newEatenAtIso) updateData.eaten_at = newEatenAtIso;
    await supabase
      .from('meals')
      .update(updateData)
      .eq('id', mealId);

    const { error: deleteError } = await supabase
      .from('meal_items')
      .delete()
      .eq('meal_id', mealId);
    if (deleteError) throw deleteError;

    const mealItemsToInsert = items.map(item => ({
      meal_id: mealId,
      name: item.name,
      nutrient_key: item.nutrient_key,
      weight_grams: item.weight_grams,
      confirmed: item.confirmed,
      ...filterNutrients(item.nutrients),
    }));

    const { error: insertError } = await supabase
      .from('meal_items')
      .insert(mealItemsToInsert);

    if (insertError) {
      // Rollback — wstawiamy backup z powrotem żeby nie zostawić pustego posiłku.
      if (backup && backup.length > 0) {
        const restored = backup.map((row: any) => {
          const { id: _id, created_at: _ca, ...rest } = row;
          return rest;
        });
        await supabase.from('meal_items').insert(restored);
      }
      throw insertError;
    }

    // Jeśli zmieniono datę — posiłek może wypaść z aktualnego widoku, reload.
    if (newEatenAtIso) {
      await get().loadMealsForDate(get().selectedDate);
      return;
    }

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
