// Składniki odżywcze per 100g
export interface NutrientValues {
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber?: number;
  sugar_g?: number;
  water_g?: number;
  // Tłuszcze szczegółowe
  saturated_fat_g?: number;
  monounsaturated_fat_g?: number;
  polyunsaturated_fat_g?: number;
  omega3_g?: number;
  omega6_g?: number;
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
  // Karotenoidy i antyoksydanty
  beta_carotene_ug?: number;
  lutein_zeaxanthin_ug?: number;
  lycopene_ug?: number;
  // Fitoskładniki
  polyphenols_mg?: number;
  quercetin_mg?: number;
  anthocyanins_mg?: number;
  chlorogenic_acid_mg?: number;
  // Inne
  betaine_mg?: number;
  caffeine_mg?: number;
  coenzyme_q10_mg?: number;
  carnitine_mg?: number;
  collagen_g?: number;
}

// Produkt w bazie danych
export interface FoodItem {
  name_pl: string;
  name_en: string;
  category: string;
  per_100g: NutrientValues;
  serving_g?: number;
  source?: string;
  aliases?: string[];
}

// Baza produktów
export interface NutrientsDB {
  version: string;
  source: string;
  note?: string;
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
