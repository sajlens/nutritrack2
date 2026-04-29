// Pomocnicze funkcje dat — zawsze używamy LOKALNEJ strefy czasowej.
//
// Dlaczego to jest osobny plik:
// `new Date().toISOString().split('T')[0]` zwraca datę w UTC. W Polsce (UTC+1/+2)
// gdy jest np. 1 maja 00:30 lokalnie, w UTC to wciąż 30 kwietnia 22:30,
// więc dashboard pokazałby "wczoraj" zamiast "dziś". Te helpery to naprawiają.

/** Zwraca lokalną datę w formacie 'YYYY-MM-DD' (np. '2026-04-29'). */
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Dla daty 'YYYY-MM-DD' (lokalnej) zwraca początek i koniec dnia jako ISO UTC.
 * Używamy do filtrów Supabase, bo `eaten_at` to timestamptz (UTC).
 *
 * Przykład: dla '2026-04-29' w PL czas letni (UTC+2):
 *   startIso = '2026-04-28T22:00:00.000Z'
 *   endIso   = '2026-04-29T21:59:59.999Z'
 */
export function localDayRangeUtc(dateStr: string): { startIso: string; endIso: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0, 0);
  const end = new Date(y, m - 1, d, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Dodaje dni do daty 'YYYY-MM-DD'. Bezpieczne dla zmian czasu (DST). */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

/** Czy podana data to dzisiaj (lokalnie)? */
export function isToday(dateStr: string): boolean {
  return dateStr === localDateString();
}
