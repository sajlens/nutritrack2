import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert, Modal } from 'react-native';
import { router } from 'expo-router';
import { useNutriStore } from '../store/useNutriStore';
import { NUTRIENTS, DASHBOARD_NUTRIENTS } from '../constants/nutrients';
import { calculateDayScore } from '../lib/score';
import { localDateString, addDays, isToday as isTodayDate } from '../lib/dates';
import { Meal } from '../types';

// ── Pomocnicze ────────────────────────────────────────────────────────────

/** Zwraca metadane nutrientu, z obsługą wirtualnego klucza 'net_carbs'. */
function getMeta(key: string) {
  if (key === 'net_carbs') {
    return {
      label: 'Net carbs',
      unit: 'g',
      rda_personal: NUTRIENTS.carbs?.rda_personal ?? 0,
      limit: false,
    };
  }
  const meta = NUTRIENTS[key];
  return meta ? { ...meta, rda_personal: meta.rda_personal ?? 0 } : null;
}

/** Wyciąga wartość nutrientu dla pojedynczego itema, z obsługą net_carbs. */
function nutrientValue(itemNutrients: any, key: string): number {
  if (key === 'net_carbs') {
    return Math.max(0, (itemNutrients.carbs ?? 0) - (itemNutrients.fiber ?? 0));
  }
  return itemNutrients[key] ?? 0;
}

/** Grupuje produkty z wszystkich posiłków po nazwie i sumuje wkład w dany nutrient. */
function getNutrientBreakdown(meals: Meal[], key: string) {
  const grouped = new Map<string, { name: string; weight: number; value: number }>();
  for (const meal of meals) {
    for (const item of meal.items) {
      const val = nutrientValue(item.nutrients, key);
      if (val <= 0) continue;
      const existing = grouped.get(item.name);
      if (existing) {
        existing.weight += item.weight_grams;
        existing.value += val;
      } else {
        grouped.set(item.name, { name: item.name, weight: item.weight_grams, value: val });
      }
    }
  }
  const total = Array.from(grouped.values()).reduce((s, x) => s + x.value, 0);
  return {
    total,
    items: Array.from(grouped.values())
      .sort((a, b) => b.value - a.value)
      .map(x => ({ ...x, percent: total > 0 ? (x.value / total) * 100 : 0 })),
  };
}

/** Format wartości nutrientu dla wyświetlenia (różna precyzja w zależności od skali). */
function fmt(value: number): string {
  if (value === 0) return '0';
  if (value < 1) return value.toFixed(2);
  if (value < 10) return value.toFixed(1);
  return String(Math.round(value));
}

// ── Komponenty ────────────────────────────────────────────────────────────

function NutrientBar({ nutrientKey, value, onPress }: { nutrientKey: string; value: number; onPress?: () => void }) {
  const meta = NUTRIENTS[nutrientKey];
  if (!meta) return null;
  const rda = meta.rda_personal ?? meta.rda_f ?? 0;
  const pct = rda > 0 ? Math.min((value / rda) * 100, 100) : 0;

  let color: string;
  if (meta.limit) {
    color = pct <= 60 ? '#16a34a' : pct <= 90 ? '#f59e0b' : '#ef4444';
  } else {
    color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444';
  }

  const clickable = !!onPress && value > 0;

  return (
    <TouchableOpacity
      style={styles.nutrientRow}
      onPress={onPress}
      disabled={!clickable}
      activeOpacity={0.6}
    >
      <View style={styles.nutrientLabel}>
        <Text style={styles.nutrientName}>
          {meta.label}{meta.limit ? ' ↓' : ''}
        </Text>
        <Text style={styles.nutrientValue}>
          {value % 1 === 0 ? value : value.toFixed(1)} {meta.unit}
          {rda > 0 && <Text style={styles.nutrientRda}> / {rda}</Text>}
        </Text>
      </View>
      {rda > 0 && (
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
  const { todayMeals, isLoading, loadTodayMeals, getTodayTotals, selectedDate, setSelectedDate, deleteMeal } = useNutriStore();
  const totals = getTodayTotals();
  const dayScore = calculateDayScore(totals);
  const [breakdownKey, setBreakdownKey] = useState<string | null>(null);

  useEffect(() => {
    loadTodayMeals();
  }, []);

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

  const breakdownData = breakdownKey ? getNutrientBreakdown(todayMeals, breakdownKey) : null;
  const breakdownMeta = breakdownKey ? getMeta(breakdownKey) : null;

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
            <View style={[styles.scoreBadge, { backgroundColor: dayScore >= 80 ? '#16a34a' : dayScore >= 50 ? '#f59e0b' : '#ef4444' }]}>
              <Text style={styles.scoreText}>{dayScore}%</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.dateArrow, isToday && styles.dateArrowDisabled]} onPress={goToNextDay}>
            <Text style={[styles.dateArrowText, isToday && styles.dateArrowDisabledText]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Makro z paskami progresu — klikalne */}
        <View style={styles.macroRow}>
          {macros.map(({ key, label }) => {
            const isNetCarbs = key === 'net_carbs';
            const meta = NUTRIENTS[key];
            const val = isNetCarbs
              ? Math.max(0, Math.round(((totals as any).carbs ?? 0) - ((totals as any).fiber ?? 0)))
              : Math.round((totals as any)[key] ?? 0);
            const rda = isNetCarbs ? (NUTRIENTS.carbs?.rda_personal ?? 0) : (meta?.rda_personal ?? 0);
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
                  {breakdownData.items.length === 0 ? (
                    <Text style={styles.modalEmpty}>Brak produktów z tym składnikiem dzisiaj.</Text>
                  ) : (
                    breakdownData.items.map((item, i) => (
                      <View key={i} style={styles.breakdownRow}>
                        <View style={styles.breakdownTop}>
                          <Text style={styles.breakdownName} numberOfLines={2}>{item.name}</Text>
                          <Text style={styles.breakdownValue}>
                            {fmt(item.value)} {breakdownMeta.unit}
                          </Text>
                        </View>
                        <View style={styles.breakdownBottom}>
                          <Text style={styles.breakdownWeight}>{Math.round(item.weight)}g produktu</Text>
                          <Text style={styles.breakdownPct}>{Math.round(item.percent)}%</Text>
                        </View>
                        <View style={styles.breakdownBarBg}>
                          <View style={[styles.breakdownBarFill, { width: `${item.percent}%` }]} />
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
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
  dateLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
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
  breakdownTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  breakdownName: { fontSize: 14, color: '#111827', flex: 1, marginRight: 8 },
  breakdownValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  breakdownBottom: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  breakdownWeight: { fontSize: 12, color: '#6b7280' },
  breakdownPct: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  breakdownBarBg: { height: 4, backgroundColor: '#f3f4f6', borderRadius: 2 },
  breakdownBarFill: { height: 4, backgroundColor: '#16a34a', borderRadius: 2 },
});
