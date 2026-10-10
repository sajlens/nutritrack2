import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { NutrientValues } from '../types';
// Zapytania do Claude idą przez naszą funkcję na Cloudflare Pages (/api/claude),
// która trzyma klucz Anthropic po stronie serwera. W przeglądarce adres jest
// względny (ta sama domena), w apce na Androida trzeba podać pełny adres strony
// w EXPO_PUBLIC_API_BASE_URL (np. https://nutritrack.pages.dev).
const API_BASE = Platform.OS === 'web'
  ? ''
  : (Constants.expoConfig?.extra?.apiBaseUrl ?? '');

export async function claudeFetch({ body }: { body: string }): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_BASE}/api/claude`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token ?? ''}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Błąd AI (${res.status}): ${text.slice(0, 200)}`);
  }
  return res;
}

export interface ParsedFood {
  name: string;
  weight_grams: number;
  nutrient_key?: string;
}

export async function parseMealDescription(description: string): Promise<ParsedFood[]> {
  const response = await claudeFetch({
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Jesteś asystentem do śledzenia żywienia. Przeanalizuj opis posiłku i zwróć listę produktów z wagami w gramach.

Opis posiłku: "${description}"

Odpowiedz TYLKO w formacie JSON, bez żadnego tekstu przed ani po:
[
  {"name": "nazwa produktu po polsku", "weight_grams": 100},
  ...
]

Zasady:
- Jeśli waga nie jest podana, oszacuj typową porcję
- Używaj polskich nazw produktów
- Rozbij złożone dania na składniki
- Nie dodawaj żadnych wyjaśnień, tylko JSON`
      }]
    })
  });

  const data = await response.json();
  const text = data.content[0].text.trim();
  
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

// Pola szacowane dla dania z restauracji. Żeby rozszerzyć o kolejne wartości
// (np. witaminy/minerały), wystarczy dopisać wpisy do tej listy — reszta
// (prompt, parsowanie) dostosuje się automatycznie.
const RESTAURANT_MEAL_FIELDS: { key: keyof NutrientValues; label: string }[] = [
  { key: 'protein', label: 'białko (g)' },
  { key: 'fat', label: 'tłuszcz (g)' },
  { key: 'carbs', label: 'węglowodany (g)' },
  { key: 'fiber', label: 'błonnik (g)' },
  { key: 'sugar_g', label: 'cukry (g)' },
  { key: 'sodium_mg', label: 'sód (mg)' },
];

export interface RestaurantMealEstimate {
  name: string;
  weight_grams: number;
  nutrients: NutrientValues;
}

// Szacuje wartości odżywcze CAŁEGO opisanego dania jednym zapytaniem,
// bez próby dopasowania składników do lokalnej bazy produktów.
// To rozwiązuje problem dań restauracyjnych/złożonych, dla których
// dopasowanie do bazy (parseMealDescription + resolveMealItems) daje
// bardzo słabe rezultaty.
export async function estimateRestaurantMeal(description: string): Promise<RestaurantMealEstimate> {
  const fieldsJson = RESTAURANT_MEAL_FIELDS.map(f => `  "${f.key}": 0`).join(',\n');

  const response = await claudeFetch({
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Jesteś dietetykiem szacującym wartości odżywcze dania zjedzonego poza domem (restauracja, bar, na mieście), na podstawie opisu użytkownika.

Opis dania: "${description}"

Odpowiedz TYLKO w formacie JSON, bez żadnego tekstu przed ani po:
{
  "name": "krótka nazwa dania po polsku",
  "weight_grams": 0,
  "calories": 0,
${fieldsJson}
}

Zasady:
- Oszacuj realistyczne wartości na podstawie typowej receptury i wielkości porcji restauracyjnej/na mieście — takie dania mają zwykle więcej tłuszczu, soli i cukru niż domowe odpowiedniki (oleje, sosy, panierka, dosalanie).
- Jeśli opis zawiera kilka elementów (np. danie główne + napój + deser), zsumuj je w jedną całość.
- "weight_grams" to Twoje szacowanie łącznej wagi całej porcji w gramach.
- Wszystkie wartości liczbowe dotyczą całej opisanej porcji, NIE na 100g.
- Jeśli czegoś nie da się sensownie oszacować, wpisz najlepsze możliwe przybliżenie — nie zostawiaj 0, chyba że wartość faktycznie wynosi ok. 0.
- Nie dodawaj żadnych wyjaśnień, tylko JSON.`
      }]
    })
  });

  const data = await response.json();
  const text = data.content[0].text.trim();
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Nie udało się sparsować odpowiedzi AI.');
    parsed = JSON.parse(match[0]);
  }

  const nutrients: NutrientValues = { calories: Number(parsed.calories) || 0 };
  for (const field of RESTAURANT_MEAL_FIELDS) {
    const val = Number(parsed[field.key]);
    if (!isNaN(val)) (nutrients as any)[field.key] = val;
  }

  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : description,
    weight_grams: Number(parsed.weight_grams) || 0,
    nutrients,
  };
}

export interface MealPhoto {
  base64: string;
  mimeType: string;
}

// Szacuje wartości odżywcze na podstawie jednego lub kilku zdjęć
// (karta menu z opisem dania i/lub samo danie na talerzu) oraz procentu
// porcji, jaki faktycznie został zjedzony. Zwrócone wartości są już
// przeskalowane do zjedzonej ilości, nie do całej porcji z talerza.
export async function estimateMealFromPhotos(
  images: MealPhoto[],
  percentEaten: number,
  note?: string
): Promise<RestaurantMealEstimate> {
  const fieldsJson = RESTAURANT_MEAL_FIELDS.map(f => `  "${f.key}": 0`).join(',\n');

  const imageContent = images.map(img => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.mimeType,
      data: img.base64,
    },
  }));

  const noteText = note?.trim() ? `\n\nDodatkowy kontekst od użytkownika: "${note.trim()}"` : '';

  const response = await claudeFetch({
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Jesteś dietetykiem szacującym wartości odżywcze posiłku zjedzonego poza domem, na podstawie zdjęć. Zdjęcia mogą przedstawiać kartę dania z menu (nazwa, opis składników) i/lub samo danie na talerzu — użyj wszystkiego, co widoczne, żeby oszacować jak najdokładniej.${noteText}

Użytkownik zjadł ${percentEaten}% tego, co było na zdjęciu/w opisie dania.

Zadanie:
1. Na podstawie zdjęć oszacuj wartości odżywcze dla CAŁEGO dania (100% porcji widocznej na zdjęciu/w menu).
2. Przeskaluj te wartości do ${percentEaten}% — czyli do tego, co faktycznie zjedzono.
3. W odpowiedzi podaj wartości JUŻ PRZESKALOWANE do zjedzonej ilości (${percentEaten}%), nie wartości dla całego dania.

Odpowiedz TYLKO w formacie JSON, bez żadnego tekstu przed ani po:
{
  "name": "krótka nazwa dania po polsku",
  "weight_grams": 0,
  "calories": 0,
${fieldsJson}
}

Zasady:
- "weight_grams" to szacowana waga zjedzonej części (już po uwzględnieniu ${percentEaten}%), w gramach.
- Restauracyjne dania mają zwykle więcej tłuszczu, soli i cukru niż domowe odpowiedniki — uwzględnij to.
- Jeśli na zdjęciach jest kilka elementów (np. danie + napój), zsumuj je w jedną całość.
- Nie zostawiaj wartości 0, chyba że faktycznie wynosi ok. 0 — podaj najlepsze możliwe przybliżenie.
- Nie dodawaj żadnych wyjaśnień, tylko JSON.`,
          },
        ],
      }],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text.trim();
  const clean = text.replace(/```json|```/g, '').trim();

  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Nie udało się sparsować odpowiedzi AI.');
    parsed = JSON.parse(match[0]);
  }

  const nutrients: NutrientValues = { calories: Number(parsed.calories) || 0 };
  for (const field of RESTAURANT_MEAL_FIELDS) {
    const val = Number(parsed[field.key]);
    if (!isNaN(val)) (nutrients as any)[field.key] = val;
  }

  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : 'Posiłek ze zdjęcia',
    weight_grams: Number(parsed.weight_grams) || 0,
    nutrients,
  };
}

export async function getNutrientsFromClaude(
  foodName: string,
  weightGrams: number
): Promise<Record<string, number>> {
  const response = await claudeFetch({
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Podaj wartości odżywcze dla: ${foodName}, ${weightGrams}g.

Odpowiedz TYLKO w formacie JSON (wartości dla podanej wagi, nie per 100g):
{
  "calories": 0,
  "protein": 0,
  "fat": 0,
  "carbs": 0,
  "fiber": 0,
  "vitamin_a_ug": 0,
  "vitamin_b12_ug": 0,
  "vitamin_c_mg": 0,
  "vitamin_d_ug": 0,
  "vitamin_k1_ug": 0,
  "calcium_mg": 0,
  "iron_mg": 0,
  "magnesium_mg": 0,
  "zinc_mg": 0,
  "selenium_ug": 0,
  "iodine_ug": 0
}`
      }]
    })
  });

  const data = await response.json();
  const text = data.content[0].text.trim();
  
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {};
  }
}
