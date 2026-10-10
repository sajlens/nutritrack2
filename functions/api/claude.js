// Pośrednik do API Anthropic dla NutriTracka.
// Klucz Anthropic jest tylko tutaj (secret w Cloudflare), nigdy w kodzie apki.
// Dostęp mają tylko zalogowani użytkownicy Supabase — sprawdzamy ich token.
//
// Wymagane zmienne w Cloudflare Pages (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (secret)
//   SUPABASE_URL       — ten sam co EXPO_PUBLIC_SUPABASE_URL
//   SUPABASE_ANON_KEY  — ten sam co EXPO_PUBLIC_SUPABASE_ANON_KEY

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_TOKENS_LIMIT = 4096;

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'Brak konfiguracji serwera (zmienne środowiskowe).' }, 500);
  }

  // 1. Czy to zalogowany użytkownik?
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || auth.length < 20) {
    return json({ error: 'Brak logowania.' }, 401);
  }
  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: env.SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) {
    return json({ error: 'Sesja wygasła — zaloguj się ponownie.' }, 401);
  }

  // 2. Sprawdzamy, co apka chce wysłać.
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Nieprawidłowe zapytanie.' }, 400);
  }
  if (typeof body.model !== 'string' || !body.model.startsWith('claude-') || !Array.isArray(body.messages)) {
    return json({ error: 'Nieprawidłowe zapytanie.' }, 400);
  }

  const payload = {
    model: body.model,
    max_tokens: Math.min(Number(body.max_tokens) || 1024, MAX_TOKENS_LIMIT),
    messages: body.messages,
  };

  // 3. Przekazujemy do Anthropic.
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  return new Response(await res.text(), {
    status: res.status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
