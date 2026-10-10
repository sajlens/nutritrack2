# NutriTrack — wersja webowa

## 1. Podmień pliki

Wypakuj tę paczkę do folderu projektu (nadpisz istniejące pliki), potem:

```
npm install
```

## 2. Sprawdź lokalnie

```
npx expo start --web
```

Wszystko poza funkcjami AI powinno działać od razu (logowanie, posiłki, historia, usuwanie z potwierdzeniem).
AI lokalnie nie zadziała, bo `/api/claude` istnieje dopiero na Cloudflare.

## 3. Cloudflare Pages

Nowy projekt jak przy Bazie domowej: **Workers & Pages → Pages**, nazwa `nutritrack`.

**Jeśli przez GitHub:**
- Build command: `npx expo export --platform web`
- Build output directory: `dist`

**Jeśli z komputera:**
```
npm run build:web
npx wrangler pages deploy
```

**Settings → Variables and Secrets:**

| Nazwa | Typ | Wartość |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | zwykła | adres Supabase (potrzebny przy budowaniu przez GitHub) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | zwykła | anon key Supabase (j.w.) |
| `SUPABASE_URL` | zwykła | ten sam adres Supabase |
| `SUPABASE_ANON_KEY` | zwykła | ten sam anon key |
| `ANTHROPIC_API_KEY` | secret | klucz Anthropic |

Przy wdrażaniu z komputera `EXPO_PUBLIC_*` bierze się z Twojego lokalnego `.env`.
Po dodaniu zmiennych: redeploy.

## 4. Android (jeśli dalej chcesz używać APK)

Apka na Androida też przechodzi na `/api/claude`. Dopisz do `.env` (i do zmiennych w EAS):

```
EXPO_PUBLIC_API_BASE_URL=https://nutritrack.pages.dev
```

i zbuduj APK od nowa. `EXPO_PUBLIC_ANTHROPIC_API_KEY` możesz usunąć — nie jest już używany.

Stary klucz Anthropic był zaszyty w APK, więc dało się go z niego wyciągnąć.
Po przejściu na nową wersję warto wygenerować nowy klucz w konsoli Anthropic,
wpisać go w Cloudflare, a stary usunąć.

## Co się zmieniło

- `lib/alert.ts` — nowy; okienka i potwierdzenia działające w przeglądarce
- `app/*.tsx` — `Alert` importowany z `lib/alert` zamiast z `react-native`
- `functions/api/claude.js` — nowy; pośrednik do Anthropic, wpuszcza tylko zalogowanych
- `lib/claude.ts`, `app/add-product.tsx` — zapytania AI idą przez `/api/claude`
- `app/_layout.tsx` — na komputerze apka ma szerokość telefonu i stoi na środku
- `app.config.js` — ustawienia web, usunięty klucz Anthropic
- `package.json`, `package-lock.json` — dodane `react-native-web` i `@expo/metro-runtime`
- `wrangler.toml` — nowy
- `store/useNutriStore.ts` — poprawka daty posiłku z poprzedniej rozmowy
