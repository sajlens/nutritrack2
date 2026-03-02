// Składniki odżywcze per 100g
export interface NutrientValues {
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  // Witaminy
  vitamin_a_ug?: number;
  vitamin_b1_mg?: number;
  vitamin_b2_mg?: number;
  vitamin_b3_mg?: number;
  vitamin_b5_mg?: number;
  vitamin_b6_mg?: number;
  vitamin_b7_ug?: number;
  vitamin_b9_ug?: number;
  vitamin_b12_ug?: number;
  vitamin_c_mg?: number;
  vitamin_d_ug?: number;
  vitamin_e_mg?: number;
  vitamin_k1_ug?: number;
  vitamin_k2_ug?: number;
  // Minerały
  calcium_mg?: number;
  iron_mg?: number;
  magnesium_mg?: number;
  phosphorus_mg?: number;
  potassium_mg?: number;
  sodium_mg?: number;
  zinc_mg?: number;
  copper_mg?: number;
  manganese_mg?: number;
  selenium_ug?: number;
  iodine_ug?: number;
  choline_mg?: number;
}

// Produkt w bazie danych
export interface FoodItem {
  name_pl: string;
  name_en: string;
  category: string;
  per_100g: NutrientValues;
  aliases?: string[];
}

// Baza produktów
export interface NutrientsDB {
  version: string;
  source: string;
  items: Record<string, FoodItem>;
}

// Pozycja w posiłku (po parsowaniu przez Claude)
export interface MealItem {
  id: string;
  name: string;
  weight_grams: number;
  nutrients: NutrientValues; // już przeliczone na daną wagę
  confirmed: boolean;
  nutrient_key?: string; // klucz w bazie lokalnej
}

// Posiłek
export interface Meal {
  id: string;
  eaten_at: string;
  raw_input: string;
  items: MealItem[];
  total_nutrients: NutrientValues;
}

// Dzienny summary
export interface DailySummary {
  date: string;
  meals: Meal[];
  total_nutrients: NutrientValues;
}