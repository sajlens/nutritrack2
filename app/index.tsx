import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native';
import { router } from 'expo-router';
import { useNutriStore } from '../store/useNutriStore';
import { NUTRIENTS, DASHBOARD_NUTRIENTS, getRdaFor, DayMode } from '../constants/nutrients';
import { calculateDayScore, getScoreBreakdown, ScoreItem } from '../lib/score';
import { localDateString, addDays, isToday as isTodayDate } from '../lib/dates';
import { Meal } from '../types';

// ── Pomocnicze ────────────────────────────────────────────────────────────

/** Zwraca metadane nutrientu, z obsługą wirtualnego klucza 'net_carbs'.
 *  RDA dobierane jest do trybu dnia (maintain/gain). */
function getMeta(key: string, mode: DayMode = 'maintain') {
  if (key === 'net_carbs' || key === 'effective_sugar' || key === 'omega_ratio'
      || key === 'glycemic_load' || key === 'ca_p_ratio' || key === 'na_k_ratio') {
    const meta = NUTRIENTS[key];
    return {
      label: meta?.label ?? key,
      unit: meta?.unit ?? '',
      rda_personal: meta ? (getRdaFor(meta, mode) ?? 0) : 0,
      limit: meta?.limit ?? false,
    };
  }
  const meta = NUTRIENTS[key];
  if (!meta) return null;
  return { ...meta, rda_personal: getRdaFor(meta, mode) ?? 0 };
}

/** Wyciąga wartość nutrientu dla pojedynczego itema, z obsługą wirtualnych kluczy. */
function nutrientValue(itemNutrients: any, key: string): number {
  if (key === 'net_carbs') {
    return Math.max(0, (itemNutrients.carbs ?? 0) - (itemNutrients.fiber ?? 0));
  }
  if (key === 'effective_sugar') {
    // Cukier "efektywny" = cukier, którego nie neutralizuje błonnik z tego samego produktu.
    // Formuła: sugar - min(sugar, fiber). Czyli błonnik kapuje cukier do swojej wysokości.
    // Przykłady:
    //   maliny (12g cukru, 7g błonnika) → 12 - min(12, 7) = 12 - 7 = 5g effective
    //   sok NFC (11g cukru, 0g błonnika) → 11 - 0 = 11g effective
    //   jabłko (10g cukru, 2.4g błonnika) → 10 - 2.4 = 7.6g effective
    //   miód (73g cukru, 0g błonnika) → 73g effective (cały cukier "działa")
    const sugar = itemNutrients.sugar_g ?? 0;
    const fiber = itemNutrients.fiber ?? 0;
    return Math.max(0, sugar - Math.min(sugar, fiber));
  }
  if (key === 'glycemic_load') {
    // GL = gi × carbs / 100 (gi jest per 100g/procent, carbs już przeskalowane do wagi)
    const gi = itemNutrients.gi ?? 0;
    const carbs = itemNutrients.carbs ?? 0;
    return (gi * carbs) / 100;
  }
  return itemNutrients[key] ?? 0;
}

/** Grupuje produkty z wszystkich posiłków po nazwie i sumuje wkład w dany nutrient. */
function getNutrientBreakdown(meals: Meal[], key: string) {
  // Grupowanie: posiłek -> lista składników wnoszących dany nutrient
  type Ingredient = { name: string; weight: number; value: number };
  type MealGroup = { mealId: string; mealName: string; total: number; items: Ingredient[] };
  const groups: MealGroup[] = [];

  for (const meal of meals) {
    const ingredients: Ingredient[] = [];
    let mealTotal = 0;
    // W obrębie jednego posiłku scalamy składniki o tej samej nazwie
    const merged = new Map<string, Ingredient>();
    for (const item of meal.items) {
      const val = nutrientValue(item.nutrients, key);
      if (val <= 0) continue;
      const existing = merged.get(item.name);
      if (existing) {
        existing.weight += item.weight_grams;
        existing.value += val;
      } else {
        merged.set(item.name, { name: item.name, weight: item.weight_grams, value: val });
      }
      mealTotal += val;
    }
    for (const ingr of merged.values()) ingredients.push(ingr);

    if (mealTotal > 0) {
      groups.push({
        mealId: meal.id,
        mealName: meal.raw_input || 'Posiłek',
        total: mealTotal,
        items: ingredients.sort((a, b) => b.value - a.value),
      });
    }
  }

  const total = groups.reduce((s, g) => s + g.total, 0);
  return {
    total,
    meals: groups
      .sort((a, b) => b.total - a.total)
      .map(g => ({
        ...g,
        percent: total > 0 ? (g.total / total) * 100 : 0,
        items: g.items.map(it => ({
          ...it,
          percent: total > 0 ? (it.value / total) * 100 : 0,
        })),
      })),
  };
}

/** Specjalny breakdown dla omega_ratio - pokazuje produkty psujące / poprawiające proporcję.
 * Algorytm:
 * - Dla każdego produktu liczymy "lokalne ratio" = omega6 / omega3
 * - Jeśli ratio > target (10) lub omega3=0 i omega6>0 → "psuje"
 * - Jeśli ratio < target (10) i omega3>0 → "poprawia"
 * - Pomijamy produkty z śladowymi ilościami obu (poniżej 0.1g)
 * Sortujemy po **wkładzie do dnia** (omega6 dla "psuje", omega3 dla "poprawia"), nie po ratio.
 * To znaczy: oliwa z małej porcji pokaże się na dole listy "psuje", a pestki słonecznika na górze.
 */
function getOmegaRatioBreakdown(meals: Meal[], targetRatio: number) {
  type OmegaItem = {
    name: string;
    weight: number;
    omega3: number;
    omega6: number;
    localRatio: number; // o6/o3, lub Infinity gdy o3=0
    impact: number; // dla "psuje" = omega6, dla "poprawia" = omega3 (do sortowania)
  };

  const merged = new Map<string, OmegaItem>();

  for (const meal of meals) {
    for (const item of meal.items) {
      const o3 = item.nutrients.omega3_g ?? 0;
      const o6 = item.nutrients.omega6_g ?? 0;
      // Pomijamy produkty z śladowymi ilościami obu (poniżej 0.05g każdy)
      if (o3 < 0.05 && o6 < 0.05) continue;

      const existing = merged.get(item.name);
      if (existing) {
        existing.weight += item.weight_grams;
        existing.omega3 += o3;
        existing.omega6 += o6;
      } else {
        merged.set(item.name, {
          name: item.name,
          weight: item.weight_grams,
          omega3: o3,
          omega6: o6,
          localRatio: 0,
          impact: 0,
        });
      }
    }
  }

  const psuje: OmegaItem[] = [];
  const poprawia: OmegaItem[] = [];

  for (const item of merged.values()) {
    item.localRatio = item.omega3 > 0 ? item.omega6 / item.omega3 : Infinity;

    // Klasyfikacja: psuje jeśli ratio > target ALBO tylko omega6 i co najmniej 0.1g
    if (item.localRatio > targetRatio && item.omega6 >= 0.1) {
      item.impact = item.omega6;
      psuje.push(item);
    }
    // Poprawia jeśli ratio < target i ma co najmniej 0.1g omega3
    else if (item.localRatio < targetRatio && item.omega3 >= 0.1) {
      item.impact = item.omega3;
      poprawia.push(item);
    }
    // Pozostałe (neutralne) pomijamy
  }

  // Sortujemy malejąco po wpływie
  psuje.sort((a, b) => b.impact - a.impact);
  poprawia.sort((a, b) => b.impact - a.impact);

  return { psuje, poprawia };
}

/** Specjalny breakdown dla ca_p_ratio - pokazuje produkty psujące / poprawiające proporcję.
 * Algorytm:
 * - Dla każdego produktu liczymy "lokalne ratio" = calcium / phosphorus
 * - Jeśli ratio < target (1.0) lub Ca=0 i P>0 → "psuje" (za mało wapnia względem fosforu)
 * - Jeśli ratio >= target lub Ca>0 i P=0 → "poprawia" (proporcjonalnie dużo wapnia)
 * - Pomijamy produkty z śladowymi ilościami obu
 * Sortujemy po **wkładzie do dnia**:
 *   - dla "psuje" sortujemy po phosphorus (kto wnosi najwięcej fosforu bez wapnia)
 *   - dla "poprawia" sortujemy po calcium (kto wnosi najwięcej wapnia)
 */
function getCaPRatioBreakdown(meals: Meal[], targetRatio: number) {
  type CaPItem = {
    name: string;
    weight: number;
    calcium: number;
    phosphorus: number;
    localRatio: number; // Ca/P, lub Infinity gdy P=0
    impact: number;
  };

  const merged = new Map<string, CaPItem>();

  for (const meal of meals) {
    for (const item of meal.items) {
      const ca = item.nutrients.calcium_mg ?? 0;
      const ph = item.nutrients.phosphorus_mg ?? 0;
      // Pomijamy produkty z śladowymi ilościami obu (poniżej 5mg każdy)
      if (ca < 5 && ph < 5) continue;

      const existing = merged.get(item.name);
      if (existing) {
        existing.weight += item.weight_grams;
        existing.calcium += ca;
        existing.phosphorus += ph;
      } else {
        merged.set(item.name, {
          name: item.name,
          weight: item.weight_grams,
          calcium: ca,
          phosphorus: ph,
          localRatio: 0,
          impact: 0,
        });
      }
    }
  }

  const psuje: CaPItem[] = [];
  const poprawia: CaPItem[] = [];

  for (const item of merged.values()) {
    item.localRatio = item.phosphorus > 0 ? item.calcium / item.phosphorus : Infinity;

    // Psuje jeśli ratio < target ALBO tylko fosfor i co najmniej 20mg
    if (item.localRatio < targetRatio && item.phosphorus >= 20) {
      item.impact = item.phosphorus;
      psuje.push(item);
    }
    // Poprawia jeśli ratio >= target i ma co najmniej 20mg wapnia
    else if (item.localRatio >= targetRatio && item.calcium >= 20) {
      item.impact = item.calcium;
      poprawia.push(item);
    }
    // Pozostałe (neutralne) pomijamy
  }

  // Sortujemy malejąco po wpływie
  psuje.sort((a, b) => b.impact - a.impact);
  poprawia.sort((a, b) => b.impact - a.impact);

  return { psuje, poprawia };
}

/** Specjalny breakdown dla na_k_ratio - pokazuje produkty psujące / poprawiające proporcję.
 * Algorytm (jak omega - im mniej tym lepiej):
 * - Dla każdego produktu liczymy "lokalne ratio" = sodium / potassium
 * - Jeśli ratio > target (1.0) lub K=0 i Na>0 → "psuje" (za dużo sodu względem potasu)
 * - Jeśli ratio <= target i K>0 → "poprawia" (proporcjonalnie dużo potasu)
 * Sortujemy po wpływie:
 *   - "psuje": po sodium (kto wnosi najwięcej sodu)
 *   - "poprawia": po potassium (kto wnosi najwięcej potasu)
 */
function getNaKRatioBreakdown(meals: Meal[], targetRatio: number) {
  type NaKItem = {
    name: string;
    weight: number;
    sodium: number;
    potassium: number;
    localRatio: number;
    impact: number;
  };

  const merged = new Map<string, NaKItem>();

  for (const meal of meals) {
    for (const item of meal.items) {
      const na = item.nutrients.sodium_mg ?? 0;
      const k = item.nutrients.potassium_mg ?? 0;
      // Pomijamy produkty z śladowymi ilościami obu (poniżej 10mg każdy)
      if (na < 10 && k < 10) continue;

      const existing = merged.get(item.name);
      if (existing) {
        existing.weight += item.weight_grams;
        existing.sodium += na;
        existing.potassium += k;
      } else {
        merged.set(item.name, {
          name: item.name,
          weight: item.weight_grams,
          sodium: na,
          potassium: k,
          localRatio: 0,
          impact: 0,
        });
      }
    }
  }

  const psuje: NaKItem[] = [];
  const poprawia: NaKItem[] = [];

  for (const item of merged.values()) {
    item.localRatio = item.potassium > 0 ? item.sodium / item.potassium : Infinity;

    // Psuje jeśli ratio > target ALBO tylko sód (min 50mg)
    if (item.localRatio > targetRatio && item.sodium >= 50) {
      item.impact = item.sodium;
      psuje.push(item);
    }
    // Poprawia jeśli ratio <= target i co najmniej 100mg potasu
    else if (item.localRatio <= targetRatio && item.potassium >= 100) {
      item.impact = item.potassium;
      poprawia.push(item);
    }
  }

  psuje.sort((a, b) => b.impact - a.impact);
  poprawia.sort((a, b) => b.impact - a.impact);

  return { psuje, poprawia };
}

/** Breakdown dla ładunku glikemicznego (GL).
 * Inaczej niż dla ratio - tu nie ma "psuje vs poprawia", tylko kto wnosi najwięcej GL.
 * Grupujemy w 3 kategorie wpływu:
 *   - wysokie (GL ≥ 10) → 🔴 spory ładunek z jednego produktu
 *   - średnie (GL 5-10) → 🟡 zauważalny
 *   - niskie (GL > 0, < 5) → 🟢 pomijalny
 * Pomijamy produkty bez gi (null/undefined) - nie mamy danych do liczenia.
 */
function getGlycemicLoadBreakdown(meals: Meal[]) {
  type GLItem = {
    name: string;
    weight: number;
    gi: number;
    carbs: number;
    gl: number;
  };

  const merged = new Map<string, GLItem>();

  for (const meal of meals) {
    for (const item of meal.items) {
      const gi = (item.nutrients as any).gi;
      const carbs = item.nutrients.carbs ?? 0;
      // Pomijamy produkty bez GI (brak danych) lub bez węgli
      if (typeof gi !== 'number' || gi <= 0 || carbs <= 0) continue;

      const existing = merged.get(item.name);
      if (existing) {
        existing.weight += item.weight_grams;
        existing.carbs += carbs;
        existing.gl += (gi * carbs) / 100;
      } else {
        merged.set(item.name, {
          name: item.name,
          weight: item.weight_grams,
          gi,
          carbs,
          gl: (gi * carbs) / 100,
        });
      }
    }
  }

  const wysokie: GLItem[] = [];
  const srednie: GLItem[] = [];
  const niskie: GLItem[] = [];

  for (const item of merged.values()) {
    if (item.gl >= 10) wysokie.push(item);
    else if (item.gl >= 5) srednie.push(item);
    else if (item.gl > 0) niskie.push(item);
  }

  wysokie.sort((a, b) => b.gl - a.gl);
  srednie.sort((a, b) => b.gl - a.gl);
  niskie.sort((a, b) => b.gl - a.gl);

  return { wysokie, srednie, niskie };
}

/** Format wartości nutrientu dla wyświetlenia (różna precyzja w zależności od skali). */
function fmt(value: number): string {
  if (value === 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}

// ── Komponenty ────────────────────────────────────────────────────────────

function NutrientBar({ nutrientKey, value, onPress, mode, totals }: { nutrientKey: string; value: number; onPress?: () => void; mode: DayMode; totals?: any }) {
  // Wirtualny klucz: stosunek omega-6 do omega-3
  let displayValue = value;
  let displayUnit: string | undefined;
  let displayLabel: string | undefined;
  let meta = NUTRIENTS[nutrientKey];

  if (nutrientKey === 'omega_ratio') {
    const o3 = totals?.omega3_g ?? 0;
    const o6 = totals?.omega6_g ?? 0;
    displayValue = o3 > 0 ? o6 / o3 : 0;
    meta = NUTRIENTS.omega_ratio;
    displayLabel = meta?.label;
    displayUnit = meta?.unit;
  }

  if (nutrientKey === 'ca_p_ratio') {
    const ca = totals?.calcium_mg ?? 0;
    const ph = totals?.phosphorus_mg ?? 0;
    displayValue = ph > 0 ? ca / ph : 0;
    meta = NUTRIENTS.ca_p_ratio;
    displayLabel = meta?.label;
    displayUnit = meta?.unit;
  }

  if (nutrientKey === 'na_k_ratio') {
    const na = totals?.sodium_mg ?? 0;
    const k = totals?.potassium_mg ?? 0;
    displayValue = k > 0 ? na / k : 0;
    meta = NUTRIENTS.na_k_ratio;
    displayLabel = meta?.label;
    displayUnit = meta?.unit;
  }

  if (nutrientKey === 'effective_sugar') {
    const sugar = totals?.sugar_g ?? 0;
    const fiber = totals?.fiber ?? 0;
    displayValue = Math.max(0, sugar - Math.min(sugar, fiber));
    meta = NUTRIENTS.effective_sugar;
    displayLabel = meta?.label;
    displayUnit = meta?.unit;
  }

  if (nutrientKey === 'glycemic_load') {
    // GL dnia jest zsumowane w sumNutrientValues (lib/calculations.ts)
    displayValue = (totals as any)?.glycemic_load ?? 0;
    meta = NUTRIENTS.glycemic_load;
    displayLabel = meta?.label;
    displayUnit = meta?.unit;
  }

  if (!meta) return null;
  const label = displayLabel ?? meta.label;
  const unit = displayUnit ?? meta.unit;

  // Wartość docelowa / zakres
  const rdaPoint = getRdaFor(meta, mode) ?? meta.rda_f ?? 0;
  const rdaMin = meta.rda_min;
  const rdaMax = meta.rda_max;
  const hasRange = rdaMin !== undefined && rdaMax !== undefined;

  let pct = 0;
  let color: string;

  if (hasRange) {
    // Tryb zakresu: zielony w przedziale, żółty blisko, czerwony daleko
    if (displayValue >= rdaMin! && displayValue <= rdaMax!) {
      pct = 100;
      color = '#16a34a';
    } else if (displayValue < rdaMin!) {
      pct = rdaMin! > 0 ? Math.min((displayValue / rdaMin!) * 100, 99) : 0;
      color = pct >= 70 ? '#f59e0b' : '#ef4444';
    } else {
      // przekroczenie górnej granicy
      const overshoot = (displayValue - rdaMax!) / rdaMax!;
      pct = 100; // pasek pełny
      color = overshoot < 0.25 ? '#f59e0b' : '#ef4444';
    }
  } else {
    pct = rdaPoint > 0 ? Math.min((displayValue / rdaPoint) * 100, 100) : 0;
    if (meta.limit) {
      color = pct <= 60 ? '#16a34a' : pct <= 90 ? '#f59e0b' : '#ef4444';
    } else {
      color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444';
    }
  }

  const clickable = !!onPress && displayValue > 0;
  const showBar = hasRange || rdaPoint > 0;
  const valueStr = displayValue % 1 === 0 ? String(displayValue) : displayValue.toFixed(1);
  const targetStr = hasRange ? `${rdaMin}–${rdaMax}` : String(rdaPoint);
  const indicator = meta.limit ? ' ↓' : (hasRange ? ' ↔' : '');

  return (
    <TouchableOpacity
      style={styles.nutrientRow}
      onPress={onPress}
      disabled={!clickable}
      activeOpacity={0.6}
    >
      <View style={styles.nutrientLabel}>
        <Text style={styles.nutrientName}>
          {label}{indicator}
        </Text>
        <Text style={styles.nutrientValue}>
          {valueStr} {unit}
          {showBar && <Text style={styles.nutrientRda}> / {targetStr}</Text>}
        </Text>
      </View>
      {showBar && (
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function formatDateLabel(dateStr: string): string {
  const today = localDateString();
  const yesterday = addDays(today, -1);
  if (dateStr === today) return 'Dziś';
  if (dateStr === yesterday) return 'Wczoraj';
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year}`;
}

// ── Główny ekran ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { todayMeals, isLoading, loadTodayMeals, getTodayTotals, selectedDate, setSelectedDate, deleteMeal, loadDayMode, setDayMode, getDayMode } = useNutriStore();
  const totals = getTodayTotals();
  const [breakdownKey, setBreakdownKey] = useState<string | null>(null);
  const [scoreModal, setScoreModal] = useState(false);

  const currentMode = getDayMode(selectedDate);
  const dayScore = calculateDayScore(totals, currentMode);
  const scoreBreakdown = scoreModal ? getScoreBreakdown(totals, currentMode) : null;

  useEffect(() => {
    loadTodayMeals();
  }, []);

  // Załaduj tryb dnia gdy zmienia się data
  useEffect(() => {
    loadDayMode(selectedDate);
  }, [selectedDate]);

  const toggleDayMode = () => {
    const newMode: DayMode = currentMode === 'gain' ? 'maintain' : 'gain';
    setDayMode(selectedDate, newMode);
  };

  const goToPrevDay = () => setSelectedDate(addDays(selectedDate, -1));
  const goToNextDay = () => {
    if (isTodayDate(selectedDate)) return;
    setSelectedDate(addDays(selectedDate, 1));
  };

  const isToday = isTodayDate(selectedDate);

  const handleDelete = (mealId: string) => {
    Alert.alert('Usuń posiłek', 'Czy na pewno chcesz usunąć ten posiłek?', [
      { text: 'Anuluj', style: 'cancel' },
      { text: 'Usuń', style: 'destructive', onPress: () => deleteMeal(mealId) },
    ]);
  };

  const handleEdit = (mealId: string) => {
    router.push({ pathname: '/edit-meal', params: { mealId } });
  };

  const macros = [
    { key: 'calories', label: 'kcal' },
    { key: 'protein', label: 'białko' },
    { key: 'carbs', label: 'węgle' },
    { key: 'net_carbs', label: 'net carbs' },
    { key: 'fat', label: 'tłuszcz' },
  ];

  const breakdownData = breakdownKey && breakdownKey !== 'omega_ratio' && breakdownKey !== 'ca_p_ratio' && breakdownKey !== 'na_k_ratio' && breakdownKey !== 'glycemic_load'
    ? getNutrientBreakdown(todayMeals, breakdownKey)
    : null;
  const omegaBreakdown = breakdownKey === 'omega_ratio'
    ? getOmegaRatioBreakdown(todayMeals, NUTRIENTS.omega_ratio.rda_personal ?? 10)
    : null;
  const caPBreakdown = breakdownKey === 'ca_p_ratio'
    ? getCaPRatioBreakdown(todayMeals, NUTRIENTS.ca_p_ratio.rda_personal ?? 1)
    : null;
  const naKBreakdown = breakdownKey === 'na_k_ratio'
    ? getNaKRatioBreakdown(todayMeals, NUTRIENTS.na_k_ratio.rda_personal ?? 1)
    : null;
  const glBreakdown = breakdownKey === 'glycemic_load'
    ? getGlycemicLoadBreakdown(todayMeals)
    : null;
  const breakdownMeta = breakdownKey ? getMeta(breakdownKey, currentMode) : null;

  return (
    <>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadTodayMeals} />}
      >
        <View style={styles.dateNav}>
          <TouchableOpacity style={styles.dateArrow} onPress={goToPrevDay}>
            <Text style={styles.dateArrowText}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={loadTodayMeals} style={styles.dateLabelRow}>
            <Text style={styles.dateLabel}>{formatDateLabel(selectedDate)}</Text>
            <TouchableOpacity
              onPress={() => setScoreModal(true)}
              style={[styles.scoreBadge, { backgroundColor: dayScore >= 80 ? '#16a34a' : dayScore >= 50 ? '#f59e0b' : '#ef4444' }]}
              activeOpacity={0.7}
            >
              <Text style={styles.scoreText}>{dayScore}%</Text>
            </TouchableOpacity>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dateArrow, isToday && styles.dateArrowDisabled]} onPress={goToNextDay}>
            <Text style={[styles.dateArrowText, isToday && styles.dateArrowDisabledText]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Toggle trybu dnia */}
        <TouchableOpacity onPress={toggleDayMode} style={styles.modeToggle} activeOpacity={0.7}>
          <Text style={styles.modeToggleLabel}>Tryb dnia:</Text>
          <View style={[styles.modeBadge, currentMode === 'gain' ? styles.modeBadgeGain : styles.modeBadgeMaintain]}>
            <Text style={[styles.modeBadgeText, currentMode === 'gain' ? styles.modeBadgeTextGain : styles.modeBadgeTextMaintain]}>
              {currentMode === 'gain' ? '💪 Gain' : '⚖️ Utrzymanie'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Makro z paskami progresu — klikalne */}
        <View style={styles.macroRow}>
          {macros.map(({ key, label }) => {
            const isNetCarbs = key === 'net_carbs';
            const meta = NUTRIENTS[key];
            const val = isNetCarbs
              ? Math.max(0, Math.round(((totals as any).carbs ?? 0) - ((totals as any).fiber ?? 0)))
              : Math.round((totals as any)[key] ?? 0);
            const rda = isNetCarbs
              ? (NUTRIENTS.net_carbs ? (getRdaFor(NUTRIENTS.net_carbs, currentMode) ?? 0) : 0)
              : (meta ? (getRdaFor(meta, currentMode) ?? 0) : 0);
            const pct = rda > 0 ? Math.min((val / rda) * 100, 100) : 0;
            const color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444';
            const clickable = val > 0;
            return (
              <TouchableOpacity
                key={key}
                style={styles.macroBox}
                onPress={() => clickable && setBreakdownKey(key)}
                disabled={!clickable}
                activeOpacity={0.6}
              >
                <Text style={styles.macroValue}>{val}</Text>
                <Text style={styles.macroLabel} numberOfLines={1}>{label}</Text>
                {rda > 0 && (
                  <>
                    <View style={styles.macroBg}>
                      <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={styles.macroRda}>/ {rda}</Text>
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Mikroskładniki — klikalne */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mikroskładniki</Text>
          {DASHBOARD_NUTRIENTS.map(key => (
            <NutrientBar
              key={key}
              nutrientKey={key}
              value={(totals as any)[key] ?? 0}
              onPress={() => setBreakdownKey(key)}
              mode={currentMode}
              totals={totals}
            />
          ))}
        </View>

        {/* Posiłki */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {isToday ? 'Dzisiejsze posiłki' : `Posiłki — ${formatDateLabel(selectedDate)}`}
          </Text>
          {todayMeals.length === 0 ? (
            <Text style={styles.empty}>Brak posiłków.</Text>
          ) : (
            todayMeals.map(meal => (
              <View key={meal.id} style={styles.mealCard}>
                <View style={styles.mealCardTop}>
                  <Text style={styles.mealInput} numberOfLines={2}>{meal.raw_input}</Text>
                  <View style={styles.mealActions}>
                    <TouchableOpacity style={styles.mealActionBtn} onPress={() => handleEdit(meal.id)}>
                      <Text style={styles.mealActionEdit}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.mealActionBtn} onPress={() => handleDelete(meal.id)}>
                      <Text style={styles.mealActionDelete}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <Text style={styles.mealMeta}>
                  {meal.items.length} składników · {Math.round(meal.total_nutrients.calories ?? 0)} kcal
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Modal breakdown */}
      <Modal
        visible={breakdownKey !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setBreakdownKey(null)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setBreakdownKey(null)} activeOpacity={1} />
          <View style={styles.modalCard}>
            {breakdownData && breakdownMeta && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{breakdownMeta.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      {fmt(breakdownData.total)} {breakdownMeta.unit}
                      {breakdownMeta.rda_personal > 0 && (
                        <Text style={styles.modalSubtitleMuted}>
                          {' '}/ {breakdownMeta.rda_personal} {breakdownMeta.unit} ({Math.round((breakdownData.total / breakdownMeta.rda_personal) * 100)}%)
                        </Text>
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBreakdownKey(null)} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {breakdownData.meals.length === 0 ? (
                    <Text style={styles.modalEmpty}>Brak produktów z tym składnikiem dzisiaj.</Text>
                  ) : (
                    breakdownData.meals.map(group => (
                      <View key={group.mealId} style={styles.breakdownGroup}>
                        {/* Nagłówek posiłku */}
                        <View style={styles.breakdownMealHeader}>
                          <Text style={styles.breakdownMealName} numberOfLines={2}>{group.mealName}</Text>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={styles.breakdownMealValue}>
                              {fmt(group.total)} {breakdownMeta.unit}
                            </Text>
                            <Text style={styles.breakdownMealPct}>{Math.round(group.percent)}%</Text>
                          </View>
                        </View>

                        {/* Składniki w posiłku */}
                        {group.items.map((item, i) => (
                          <View key={i} style={styles.breakdownIngredientRow}>
                            <View style={styles.breakdownTop}>
                              <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                              <Text style={styles.breakdownValue}>
                                {fmt(item.value)} {breakdownMeta.unit}
                              </Text>
                            </View>
                            <View style={styles.breakdownBottom}>
                              <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                              <Text style={styles.breakdownPct}>{Math.round(item.percent)}%</Text>
                            </View>
                            <View style={styles.breakdownBarBg}>
                              <View style={[styles.breakdownBarFill, { width: `${item.percent}%` }]} />
                            </View>
                          </View>
                        ))}
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            )}

            {omegaBreakdown && breakdownMeta && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{breakdownMeta.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      Cel: ≤ {breakdownMeta.rda_personal}:1
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBreakdownKey(null)} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {omegaBreakdown.psuje.length === 0 && omegaBreakdown.poprawia.length === 0 ? (
                    <Text style={styles.modalEmpty}>Brak istotnych produktów wpływających na proporcję dzisiaj.</Text>
                  ) : (
                    <>
                      {omegaBreakdown.psuje.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#991b1b' }]}>🔴 Psuje proporcję</Text>
                          </View>
                          {omegaBreakdown.psuje.map((item, i) => (
                            <View key={`bad-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>
                                  {item.localRatio === Infinity ? 'tylko ω6' : `${fmt(item.localRatio)}:1`}
                                </Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  ω6: {fmt(item.omega6)}g · ω3: {fmt(item.omega3)}g
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {omegaBreakdown.poprawia.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#f0fdf4', borderLeftColor: '#16a34a', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#166534' }]}>🟢 Poprawia proporcję</Text>
                          </View>
                          {omegaBreakdown.poprawia.map((item, i) => (
                            <View key={`good-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>
                                  {fmt(item.localRatio)}:1
                                </Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  ω6: {fmt(item.omega6)}g · ω3: {fmt(item.omega3)}g
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}

            {caPBreakdown && breakdownMeta && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{breakdownMeta.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      Cel: ≥ {breakdownMeta.rda_personal}:1
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBreakdownKey(null)} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {caPBreakdown.psuje.length === 0 && caPBreakdown.poprawia.length === 0 ? (
                    <Text style={styles.modalEmpty}>Brak istotnych produktów wpływających na proporcję dzisiaj.</Text>
                  ) : (
                    <>
                      {caPBreakdown.psuje.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#991b1b' }]}>🔴 Psuje proporcję (za mało Ca)</Text>
                          </View>
                          {caPBreakdown.psuje.map((item, i) => (
                            <View key={`bad-cap-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>
                                  {item.calcium === 0 ? 'tylko P' : `${fmt(item.localRatio)}:1`}
                                </Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  Ca: {fmt(item.calcium)}mg · P: {fmt(item.phosphorus)}mg
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {caPBreakdown.poprawia.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#f0fdf4', borderLeftColor: '#16a34a', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#166534' }]}>🟢 Poprawia proporcję (dużo Ca)</Text>
                          </View>
                          {caPBreakdown.poprawia.map((item, i) => (
                            <View key={`good-cap-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>
                                  {item.localRatio === Infinity ? 'tylko Ca' : `${fmt(item.localRatio)}:1`}
                                </Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  Ca: {fmt(item.calcium)}mg · P: {fmt(item.phosphorus)}mg
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}

            {naKBreakdown && breakdownMeta && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{breakdownMeta.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      Cel: ≤ {breakdownMeta.rda_personal}:1
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBreakdownKey(null)} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {naKBreakdown.psuje.length === 0 && naKBreakdown.poprawia.length === 0 ? (
                    <Text style={styles.modalEmpty}>Brak istotnych produktów wpływających na proporcję dzisiaj.</Text>
                  ) : (
                    <>
                      {naKBreakdown.psuje.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#991b1b' }]}>🔴 Psuje proporcję (za dużo Na)</Text>
                          </View>
                          {naKBreakdown.psuje.map((item, i) => (
                            <View key={`bad-nak-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>
                                  {item.localRatio === Infinity ? 'tylko Na' : `${fmt(item.localRatio)}:1`}
                                </Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  Na: {fmt(item.sodium)}mg · K: {fmt(item.potassium)}mg
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {naKBreakdown.poprawia.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#f0fdf4', borderLeftColor: '#16a34a', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#166534' }]}>🟢 Poprawia proporcję (dużo K)</Text>
                          </View>
                          {naKBreakdown.poprawia.map((item, i) => (
                            <View key={`good-nak-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>
                                  {item.sodium === 0 ? 'tylko K' : `${fmt(item.localRatio)}:1`}
                                </Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  Na: {fmt(item.sodium)}mg · K: {fmt(item.potassium)}mg
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}

            {glBreakdown && breakdownMeta && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>{breakdownMeta.label}</Text>
                    <Text style={styles.modalSubtitle}>
                      Cel: ≤ {breakdownMeta.rda_personal} GL/dzień
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setBreakdownKey(null)} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {glBreakdown.wysokie.length === 0 && glBreakdown.srednie.length === 0 && glBreakdown.niskie.length === 0 ? (
                    <Text style={styles.modalEmpty}>Brak produktów z danymi GI w tym dniu.</Text>
                  ) : (
                    <>
                      {glBreakdown.wysokie.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#fef2f2', borderLeftColor: '#ef4444', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#991b1b' }]}>🔴 Wysokie GL (≥10)</Text>
                          </View>
                          {glBreakdown.wysokie.map((item, i) => (
                            <View key={`high-gl-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>GL {fmt(item.gl)}</Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  IG: {item.gi} · węgle: {fmt(item.carbs)}g
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {glBreakdown.srednie.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#fffbeb', borderLeftColor: '#f59e0b', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#92400e' }]}>🟡 Średnie GL (5–10)</Text>
                          </View>
                          {glBreakdown.srednie.map((item, i) => (
                            <View key={`mid-gl-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>GL {fmt(item.gl)}</Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  IG: {item.gi} · węgle: {fmt(item.carbs)}g
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}

                      {glBreakdown.niskie.length > 0 && (
                        <View style={styles.breakdownGroup}>
                          <View style={[styles.breakdownMealHeader, { backgroundColor: '#f0fdf4', borderLeftColor: '#16a34a', borderLeftWidth: 3, paddingLeft: 10 }]}>
                            <Text style={[styles.breakdownMealName, { color: '#166534' }]}>🟢 Niskie GL (&lt;5)</Text>
                          </View>
                          {glBreakdown.niskie.map((item, i) => (
                            <View key={`low-gl-${i}`} style={styles.breakdownIngredientRow}>
                              <View style={styles.breakdownTop}>
                                <Text style={styles.breakdownIngredientName} numberOfLines={2}>↳ {item.name}</Text>
                                <Text style={styles.breakdownValue}>GL {fmt(item.gl)}</Text>
                              </View>
                              <View style={styles.breakdownBottom}>
                                <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g</Text>
                                <Text style={styles.breakdownPct}>
                                  IG: {item.gi} · węgle: {fmt(item.carbs)}g
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal: szczegóły wyniku dnia */}
      <Modal
        visible={scoreModal}
        animationType="slide"
        transparent
        onRequestClose={() => setScoreModal(false)}
      >
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setScoreModal(false)} activeOpacity={1} />
          <View style={styles.modalCard}>
            {scoreBreakdown && (
              <>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Wynik dnia: {scoreBreakdown.total}%</Text>
                    <Text style={styles.modalSubtitle}>
                      <Text style={styles.modalSubtitleMuted}>Co warto poprawić</Text>
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => setScoreModal(false)} style={styles.modalClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} contentContainerStyle={{ paddingBottom: 24 }}>
                  {(() => {
                    // 1. Kary (najpierw bo najszybsza poprawa)
                    const penalties = scoreBreakdown.items.filter(i => i.kind === 'kara');
                    // 2. Składowe gdzie najwięcej można ugrać (max - earned, posortowane malejąco)
                    const opportunities = scoreBreakdown.items
                      .filter(i => i.kind !== 'kara' && i.earned < i.max && i.hint)
                      .map(i => ({ ...i, toGain: i.max - i.earned }))
                      .sort((a, b) => b.toGain - a.toGain);
                    // 3. Co działa dobrze
                    const winning = scoreBreakdown.items.filter(i => i.kind !== 'kara' && i.earned === i.max && i.max > 0);

                    return (
                      <>
                        {penalties.length > 0 && (
                          <>
                            <Text style={styles.scoreSection}>⚠️ Kary</Text>
                            {penalties.map(it => (
                              <ScoreRow key={it.key} item={it} subtitle={it.hint} negative />
                            ))}
                          </>
                        )}

                        {opportunities.length > 0 && (
                          <>
                            <Text style={styles.scoreSection}>📈 Co podnieść</Text>
                            {opportunities.slice(0, 10).map(it => (
                              <ScoreRow key={it.key} item={it} subtitle={it.hint} toGain={it.toGain} />
                            ))}
                          </>
                        )}

                        {winning.length > 0 && (
                          <>
                            <Text style={styles.scoreSection}>✅ Cele osiągnięte</Text>
                            {winning.map(it => (
                              <View key={it.key} style={styles.scoreWinRow}>
                                <Text style={styles.scoreWinLabel}>{it.label}</Text>
                                <Text style={styles.scoreWinValue}>+{it.earned} pkt</Text>
                              </View>
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// Pomocniczy komponent do wiersza w modalu score
function ScoreRow({ item, subtitle, toGain, negative }: { item: ScoreItem; subtitle?: string; toGain?: number; negative?: boolean }) {
  return (
    <View style={[styles.scoreRow, negative && styles.scoreRowNegative]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.scoreRowLabel}>{item.label}</Text>
        {subtitle && <Text style={styles.scoreRowHint}>{subtitle}</Text>}
        <Text style={styles.scoreRowPct}>{Math.round(item.pct)}% celu</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        {negative ? (
          <Text style={styles.scoreRowPtsNeg}>{item.earned} pkt</Text>
        ) : (
          <>
            <Text style={styles.scoreRowPts}>{item.earned}/{item.max} pkt</Text>
            {toGain !== undefined && toGain > 0 && (
              <Text style={styles.scoreRowGain}>+{toGain} do zdobycia</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  dateArrow: { padding: 8 },
  dateArrowDisabled: { opacity: 0.3 },
  dateArrowText: { fontSize: 28, color: '#16a34a', lineHeight: 30 },
  dateArrowDisabledText: { color: '#9ca3af' },
  dateLabel: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modeToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  modeToggleLabel: { fontSize: 14, color: '#6b7280' },
  modeBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  modeBadgeMaintain: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
  modeBadgeGain: { backgroundColor: '#fef3c7', borderColor: '#fde68a' },
  modeBadgeText: { fontSize: 14, fontWeight: '700' },
  modeBadgeTextMaintain: { color: '#1e40af' },
  modeBadgeTextGain: { color: '#92400e' },
  dateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  scoreSection: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 8, paddingHorizontal: 4 },
  scoreRow: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, marginBottom: 6, backgroundColor: '#f9fafb', borderRadius: 10, gap: 12 },
  scoreRowNegative: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  scoreRowLabel: { fontSize: 14, fontWeight: '600', color: '#111827' },
  scoreRowHint: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  scoreRowPct: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  scoreRowPts: { fontSize: 13, fontWeight: '600', color: '#374151' },
  scoreRowPtsNeg: { fontSize: 13, fontWeight: '700', color: '#dc2626' },
  scoreRowGain: { fontSize: 11, color: '#16a34a', marginTop: 2, fontWeight: '600' },
  scoreWinRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  scoreWinLabel: { fontSize: 13, color: '#374151' },
  scoreWinValue: { fontSize: 12, color: '#16a34a', fontWeight: '600' },
  scoreText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  macroRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, gap: 6 },
  macroBox: { flex: 1, alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4 },
  macroValue: { fontSize: 17, fontWeight: '700', color: '#16a34a' },
  macroLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  macroBg: { height: 4, backgroundColor: '#d1fae5', borderRadius: 2, width: '100%', marginTop: 6 },
  macroFill: { height: 4, borderRadius: 2 },
  macroRda: { fontSize: 9, color: '#9ca3af', marginTop: 2 },
  section: { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  nutrientRow: { marginBottom: 10 },
  nutrientLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  nutrientName: { fontSize: 13, color: '#374151' },
  nutrientValue: { fontSize: 13, fontWeight: '500', color: '#111827' },
  nutrientRda: { color: '#9ca3af', fontWeight: '400' },
  barBg: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  mealCard: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginBottom: 8 },
  mealCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  mealInput: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  mealActions: { flexDirection: 'row', gap: 4 },
  mealActionBtn: { padding: 4 },
  mealActionEdit: { fontSize: 16 },
  mealActionDelete: { fontSize: 16 },
  mealMeta: { fontSize: 12, color: '#6b7280' },
  empty: { color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },

  // Modal breakdown
  modalBg: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  modalSubtitle: { fontSize: 14, color: '#111827', marginTop: 4, fontWeight: '500' },
  modalSubtitleMuted: { color: '#6b7280', fontWeight: '400' },
  modalClose: { padding: 4 },
  modalCloseText: { fontSize: 22, color: '#6b7280' },
  modalScroll: { paddingHorizontal: 20, paddingTop: 8 },
  modalEmpty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 32, fontSize: 14 },
  breakdownRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  breakdownGroup: { marginBottom: 16, backgroundColor: '#fafafa', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  breakdownMealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 10, marginBottom: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 8 },
  breakdownMealName: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  breakdownMealValue: { fontSize: 14, fontWeight: '700', color: '#16a34a' },
  breakdownMealPct: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  breakdownIngredientRow: { paddingVertical: 8, paddingLeft: 8 },
  breakdownIngredientName: { fontSize: 13, color: '#374151', flex: 1, marginRight: 8 },
  breakdownTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  breakdownName: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  breakdownValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  breakdownBottom: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  breakdownWeight: { fontSize: 12, color: '#6b7280' },
  breakdownPct: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  breakdownBarBg: { height: 4, backgroundColor: '#f3f4f6', borderRadius: 2 },
  breakdownBarFill: { height: 4, backgroundColor: '#16a34a', borderRadius: 2 },
});
