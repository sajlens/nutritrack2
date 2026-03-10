const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY!;

export interface ParsedFood {
  name: string;
  weight_grams: number;
  nutrient_key?: string;
}

export async function parseMealDescription(description: string): Promise<ParsedFood[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
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

export async function getNutrientsFromClaude(
  foodName: string,
  weightGrams: number
): Promise<Record<string, number>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
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
