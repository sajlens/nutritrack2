export interface NutrientMeta {
  label: string;
  unit: string;
  rda_f?: number;        // RDA dla kobiet (standardowe)
  rda_m?: number;        // RDA dla mężczyzn (standardowe)
  rda_personal?: number; // RDA spersonalizowane: kobieta, 37l, 56kg, 164cm, trening siłowy 2x/tydz
  limit?: boolean;       // true = to jest limit max, nie cel min
  category: 'macro' | 'vitamin' | 'mineral' | 'carotenoid' | 'phyto' | 'other';
}

// Profil: kobieta, 37 lat, 56kg, 164cm, trening siłowy 2x/tydzień, dieta niskowęglowa
// Target: 1800 kcal | Białko: 110g | Węgle: 90g | Tłuszcze: 111g

export const NUTRIENTS: Record<string, NutrientMeta> = {
  // Makro
  calories:               { label: 'Kalorie',              unit: 'kcal', rda_personal: 1800, category: 'macro' },
  protein:                { label: 'Białko',               unit: 'g',    rda_personal: 110,   category: 'macro' },
  fat:                    { label: 'Tłuszcze',             unit: 'g',    rda_personal: 111,   category: 'macro' },
  carbs:                  { label: 'Węglowodany',          unit: 'g',    rda_personal: 90,  category: 'macro' },
  // Błonnik: wyższe zapotrzebowanie przy aktywności fizycznej
  fiber:                  { label: 'Błonnik',              unit: 'g',    rda_f: 25,   rda_m: 38,   rda_personal: 28,   category: 'macro' },
  sugar_g:                { label: 'Cukry',                unit: 'g',    rda_personal: 25,   limit: true, category: 'macro' },
  // Woda: +500ml przy treningu
  water_g:                { label: 'Woda z posiłków',      unit: 'g',    rda_f: 2700, rda_m: 3700, rda_personal: 800,  category: 'macro' },

  // Tłuszcze szczegółowe
  saturated_fat_g:        { label: 'Tłuszcze nasycone',        unit: 'g',  rda_personal: 20,   limit: true, category: 'macro' },
  monounsaturated_fat_g:  { label: 'Tłuszcze jednonienasycone', unit: 'g', rda_personal: 40,   category: 'macro' },
  polyunsaturated_fat_g:  { label: 'Tłuszcze wielonienasycone', unit: 'g', rda_personal: 20,   category: 'macro' },
  // Omega-3: wyższe przy treningu siłowym (działanie przeciwzapalne)
  omega3_g:               { label: 'Omega-3',              unit: 'g',    rda_f: 1.1,  rda_m: 1.6,  rda_personal: 2.0,  category: 'macro' },
  omega6_g:               { label: 'Omega-6',              unit: 'g',    rda_personal: 6,    limit: true, category: 'macro' },

  // Witaminy
  // Wit. A: standardowe dla kobiet
  vitamin_a_ug:           { label: 'Witamina A',           unit: 'µg',  rda_f: 700,  rda_m: 900,  rda_personal: 700,  category: 'vitamin' },
  // B1: lekko wyższe przy wyższym TDEE
  vitamin_b1_mg:          { label: 'Witamina B1',          unit: 'mg',  rda_f: 1.1,  rda_m: 1.2,  rda_personal: 1.2,  category: 'vitamin' },
  // B2: wyższe przy aktywności (metabolizm energii)
  vitamin_b2_mg:          { label: 'Witamina B2',          unit: 'mg',  rda_f: 1.1,  rda_m: 1.3,  rda_personal: 1.3,  category: 'vitamin' },
  // B3: wyższe przy wyższym TDEE i treningu
  vitamin_b3_mg:          { label: 'Witamina B3',          unit: 'mg',  rda_f: 14,   rda_m: 16,   rda_personal: 15,   category: 'vitamin' },
  vitamin_b5_mg:          { label: 'Witamina B5',          unit: 'mg',  rda_f: 5,    rda_m: 5,    rda_personal: 5,    category: 'vitamin' },
  // B6: wyższe przy wyższym spożyciu białka
  vitamin_b6_mg:          { label: 'Witamina B6',          unit: 'mg',  rda_f: 1.3,  rda_m: 1.3,  rda_personal: 1.5,  category: 'vitamin' },
  vitamin_b7_ug:          { label: 'Biotyna B7',           unit: 'µg',  rda_f: 30,   rda_m: 30,   rda_personal: 30,   category: 'vitamin' },
  vitamin_b9_ug:          { label: 'Folian B9',            unit: 'µg',  rda_f: 400,  rda_m: 400,  rda_personal: 400,  category: 'vitamin' },
  vitamin_b12_ug:         { label: 'Witamina B12',         unit: 'µg',  rda_f: 2.4,  rda_m: 2.4,  rda_personal: 2.4,  category: 'vitamin' },
  // Wit. C: wyższe przy treningu (stres oksydacyjny)
  vitamin_c_mg:           { label: 'Witamina C',           unit: 'mg',  rda_f: 75,   rda_m: 90,   rda_personal: 100,  category: 'vitamin' },
  // Wit. D: wyższe — ogólne niedobory w Polsce, ważna dla kości i mięśni
  vitamin_d_ug:           { label: 'Witamina D',           unit: 'µg',  rda_f: 15,   rda_m: 15,   rda_personal: 25,   category: 'vitamin' },
  // Wit. E: wyższe przy treningu (antyoksydant)
  vitamin_e_mg:           { label: 'Witamina E',           unit: 'mg',  rda_f: 15,   rda_m: 15,   rda_personal: 15,   category: 'vitamin' },
  vitamin_k1_ug:          { label: 'Witamina K1',          unit: 'µg',  rda_f: 90,   rda_m: 120,  rda_personal: 90,   category: 'vitamin' },
  // Wit. K2: ważna przy suplementacji D3, wspiera wapń w kościach
  vitamin_k2_ug:          { label: 'Witamina K2',          unit: 'µg',  rda_f: 90,   rda_m: 120,  rda_personal: 90,   category: 'vitamin' },

  // Minerały
  // Wapń: standardowe, ważne przy treningu siłowym
  calcium_mg:             { label: 'Wapń',                 unit: 'mg',  rda_f: 1000, rda_m: 1000, rda_personal: 1000, category: 'mineral' },
  // Żelazo: standardowe dla kobiety przed menopauzą
  iron_mg:                { label: 'Żelazo',               unit: 'mg',  rda_f: 18,   rda_m: 8,    rda_personal: 18,   category: 'mineral' },
  // Magnez: wyższe przy treningu siłowym (skurcze mięśni, synteza białka)
  magnesium_mg:           { label: 'Magnez',               unit: 'mg',  rda_f: 310,  rda_m: 400,  rda_personal: 350,  category: 'mineral' },
  phosphorus_mg:          { label: 'Fosfor',               unit: 'mg',  rda_f: 700,  rda_m: 700,  rda_personal: 700,  category: 'mineral' },
  // Potas: wyższe przy aktywności (utrata przez pot)
  potassium_mg:           { label: 'Potas',                unit: 'mg',  rda_f: 2600, rda_m: 3400, rda_personal: 3000, category: 'mineral' },
  sodium_mg:              { label: 'Sód',                  unit: 'mg',  rda_personal: 2000, limit: true, category: 'mineral' },
  // Cynk: wyższe przy treningu siłowym (synteza białka, testosteron)
  zinc_mg:                { label: 'Cynk',                 unit: 'mg',  rda_f: 8,    rda_m: 11,   rda_personal: 10,   category: 'mineral' },
  copper_mg:              { label: 'Miedź',                unit: 'mg',  rda_f: 0.9,  rda_m: 0.9,  rda_personal: 0.9,  category: 'mineral' },
  manganese_mg:           { label: 'Mangan',               unit: 'mg',  rda_f: 1.8,  rda_m: 2.3,  rda_personal: 1.8,  category: 'mineral' },
  selenium_ug:            { label: 'Selen',                unit: 'µg',  rda_f: 55,   rda_m: 55,   rda_personal: 55,   category: 'mineral' },
  iodine_ug:              { label: 'Jod',                  unit: 'µg',  rda_f: 150,  rda_m: 150,  rda_personal: 150,  category: 'mineral' },
  // Cholina: wyższe przy aktywności i wyższym spożyciu białka
  choline_mg:             { label: 'Cholina',              unit: 'mg',  rda_f: 425,  rda_m: 550,  rda_personal: 450,  category: 'mineral' },

  // Karotenoidy
  beta_carotene_ug:       { label: 'Beta-karoten',         unit: 'µg',  rda_personal: 4000, category: 'carotenoid' },
  // Luteina: standardowe (ochrona wzroku)
  lutein_zeaxanthin_ug:   { label: 'Luteina + zeaksantyna', unit: 'µg', rda_f: 6000, rda_m: 6000, rda_personal: 6000, category: 'carotenoid' },
  lycopene_ug:            { label: 'Likopen',              unit: 'µg',  rda_personal: 10000, category: 'carotenoid' },

  // Fitoskładniki
  polyphenols_mg:         { label: 'Polifenole',           unit: 'mg',  rda_personal: 1000, category: 'phyto' },
  quercetin_mg:           { label: 'Kwercetyna',           unit: 'mg',  rda_personal: 50,   category: 'phyto' },
  anthocyanins_mg:        { label: 'Antocyjany',           unit: 'mg',  rda_personal: 100,  category: 'phyto' },
  chlorogenic_acid_mg:    { label: 'Kwas chlorogenowy',    unit: 'mg',  rda_personal: 200,  category: 'phyto' },

  // Inne
  betaine_mg:             { label: 'Betaina',              unit: 'mg',  rda_f: 500,  rda_m: 500,  rda_personal: 500,  category: 'other' },
  caffeine_mg:            { label: 'Kofeina',              unit: 'mg',  rda_personal: 200,  limit: true, category: 'other' },
  coenzyme_q10_mg:        { label: 'Koenzym Q10',          unit: 'mg',  rda_personal: 100,  category: 'other' },
  carnitine_mg:           { label: 'Karnityna',            unit: 'mg',  rda_personal: 500,  category: 'other' },
  collagen_g:             { label: 'Kolagen',              unit: 'g',   rda_personal: 10,   category: 'other' },
  creatine_g:             { label: 'Kreatyna',             unit: 'g',   rda_personal: 5,    category: 'other' },
};

// Wszystkie składniki pogrupowane kategoriami
export const DASHBOARD_NUTRIENTS = [
  // Makro rozszerzone
  'fiber',
  'sugar_g',
  'water_g',
  'saturated_fat_g',
  'monounsaturated_fat_g',
  'polyunsaturated_fat_g',
  'omega3_g',
  'omega6_g',
  // Witaminy
  'vitamin_a_ug',
  'vitamin_b1_mg',
  'vitamin_b2_mg',
  'vitamin_b3_mg',
  'vitamin_b5_mg',
  'vitamin_b6_mg',
  'vitamin_b7_ug',
  'vitamin_b9_ug',
  'vitamin_b12_ug',
  'vitamin_c_mg',
  'vitamin_d_ug',
  'vitamin_e_mg',
  'vitamin_k1_ug',
  'vitamin_k2_ug',
  // Minerały
  'calcium_mg',
  'iron_mg',
  'magnesium_mg',
  'phosphorus_mg',
  'potassium_mg',
  'sodium_mg',
  'zinc_mg',
  'copper_mg',
  'manganese_mg',
  'selenium_ug',
  'iodine_ug',
  'choline_mg',
  // Karotenoidy
  'beta_carotene_ug',
  'lutein_zeaxanthin_ug',
  'lycopene_ug',
  // Fitoskładniki
  'polyphenols_mg',
  'quercetin_mg',
  'anthocyanins_mg',
  'chlorogenic_acid_mg',
  // Inne
  'betaine_mg',
  'caffeine_mg',
  'coenzyme_q10_mg',
  'carnitine_mg',
  'collagen_g',
  'creatine_g',
];
