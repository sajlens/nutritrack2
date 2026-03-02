export interface NutrientMeta {
  label: string;
  unit: string;
  rda_f?: number; // RDA dla kobiet
  rda_m?: number; // RDA dla mężczyzn
  category: 'macro' | 'vitamin' | 'mineral';
}

export const NUTRIENTS: Record<string, NutrientMeta> = {
  // Makro
  calories:       { label: 'Kalorie',      unit: 'kcal', category: 'macro' },
  protein:        { label: 'Białko',       unit: 'g',    category: 'macro' },
  fat:            { label: 'Tłuszcze',     unit: 'g',    category: 'macro' },
  carbs:          { label: 'Węglowodany',  unit: 'g',    category: 'macro' },
  fiber:          { label: 'Błonnik',      unit: 'g',    rda_f: 25,  rda_m: 38,  category: 'macro' },

  // Witaminy
  vitamin_a_ug:   { label: 'Witamina A',   unit: 'µg',  rda_f: 700,  rda_m: 900,  category: 'vitamin' },
  vitamin_b1_mg:  { label: 'Witamina B1',  unit: 'mg',  rda_f: 1.1,  rda_m: 1.2,  category: 'vitamin' },
  vitamin_b2_mg:  { label: 'Witamina B2',  unit: 'mg',  rda_f: 1.1,  rda_m: 1.3,  category: 'vitamin' },
  vitamin_b3_mg:  { label: 'Witamina B3',  unit: 'mg',  rda_f: 14,   rda_m: 16,   category: 'vitamin' },
  vitamin_b5_mg:  { label: 'Witamina B5',  unit: 'mg',  rda_f: 5,    rda_m: 5,    category: 'vitamin' },
  vitamin_b6_mg:  { label: 'Witamina B6',  unit: 'mg',  rda_f: 1.3,  rda_m: 1.3,  category: 'vitamin' },
  vitamin_b7_ug:  { label: 'Biotyna B7',   unit: 'µg',  rda_f: 30,   rda_m: 30,   category: 'vitamin' },
  vitamin_b9_ug:  { label: 'Folian B9',    unit: 'µg',  rda_f: 400,  rda_m: 400,  category: 'vitamin' },
  vitamin_b12_ug: { label: 'Witamina B12', unit: 'µg',  rda_f: 2.4,  rda_m: 2.4,  category: 'vitamin' },
  vitamin_c_mg:   { label: 'Witamina C',   unit: 'mg',  rda_f: 75,   rda_m: 90,   category: 'vitamin' },
  vitamin_d_ug:   { label: 'Witamina D',   unit: 'µg',  rda_f: 15,   rda_m: 15,   category: 'vitamin' },
  vitamin_e_mg:   { label: 'Witamina E',   unit: 'mg',  rda_f: 15,   rda_m: 15,   category: 'vitamin' },
  vitamin_k1_ug:  { label: 'Witamina K1',  unit: 'µg',  rda_f: 90,   rda_m: 120,  category: 'vitamin' },
  vitamin_k2_ug:  { label: 'Witamina K2',  unit: 'µg',  rda_f: 90,   rda_m: 120,  category: 'vitamin' },

  // Minerały
  calcium_mg:     { label: 'Wapń',         unit: 'mg',  rda_f: 1000, rda_m: 1000, category: 'mineral' },
  iron_mg:        { label: 'Żelazo',       unit: 'mg',  rda_f: 18,   rda_m: 8,    category: 'mineral' },
  magnesium_mg:   { label: 'Magnez',       unit: 'mg',  rda_f: 310,  rda_m: 400,  category: 'mineral' },
  phosphorus_mg:  { label: 'Fosfor',       unit: 'mg',  rda_f: 700,  rda_m: 700,  category: 'mineral' },
  potassium_mg:   { label: 'Potas',        unit: 'mg',  rda_f: 2600, rda_m: 3400, category: 'mineral' },
  sodium_mg:      { label: 'Sód',          unit: 'mg',  category: 'mineral' },
  zinc_mg:        { label: 'Cynk',         unit: 'mg',  rda_f: 8,    rda_m: 11,   category: 'mineral' },
  copper_mg:      { label: 'Miedź',        unit: 'mg',  rda_f: 0.9,  rda_m: 0.9,  category: 'mineral' },
  manganese_mg:   { label: 'Mangan',       unit: 'mg',  rda_f: 1.8,  rda_m: 2.3,  category: 'mineral' },
  selenium_ug:    { label: 'Selen',        unit: 'µg',  rda_f: 55,   rda_m: 55,   category: 'mineral' },
  iodine_ug:      { label: 'Jod',          unit: 'µg',  rda_f: 150,  rda_m: 150,  category: 'mineral' },
  choline_mg:     { label: 'Cholina',      unit: 'mg',  rda_f: 425,  rda_m: 550,  category: 'mineral' },
};

// Kolejność wyświetlania na dashboardzie (najważniejsze mikroskładniki)
export const DASHBOARD_NUTRIENTS = [
  'vitamin_d_ug',
  'vitamin_b12_ug',
  'iron_mg',
  'calcium_mg',
  'magnesium_mg',
  'zinc_mg',
  'selenium_ug',
  'iodine_ug',
  'vitamin_k1_ug',
  'vitamin_b9_ug',
  'vitamin_c_mg',
  'vitamin_a_ug',
];