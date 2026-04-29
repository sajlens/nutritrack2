import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { useNutriStore } from '../store/useNutriStore';
import { NUTRIENTS, DASHBOARD_NUTRIENTS } from '../constants/nutrients';
import { calculateDayScore } from '../lib/score';
import { localDateString, addDays, isToday as isTodayDate } from '../lib/dates';

function NutrientBar({ nutrientKey, value }: { nutrientKey: string; value: number }) {
  const meta = NUTRIENTS[nutrientKey];
  if (!meta) return null;
  const rda = meta.rda_personal ?? meta.rda_f ?? 0;
  const pct = rda > 0 ? Math.min((value / rda) * 100, 100) : 0;

  // Dla limitów: zielono gdy mało, czerwono gdy przekroczono
  // Dla celów: czerwono gdy mało, zielono gdy osiągnięto
  let color: string;
  if (meta.limit) {
    color = pct <= 60 ? '#16a34a' : pct <= 90 ? '#f59e0b' : '#ef4444';
  } else {
    color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444';
  }

  return (
    <View style={styles.nutrientRow}>
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
    </View>
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

export default function Dashboard() {
  const { todayMeals, isLoading, loadTodayMeals, getTodayTotals, selectedDate, setSelectedDate, deleteMeal } = useNutriStore();
  const totals = getTodayTotals();
  const dayScore = calculateDayScore(totals);

  useEffect(() => {
    loadTodayMeals();
  }, []);

  const goToPrevDay = () => {
    setSelectedDate(addDays(selectedDate, -1));
  };

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
    { key: 'fat', label: 'tłuszcz' },
  ];

  return (
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

      {/* Makro z paskami progresu */}
      <View style={styles.macroRow}>
        {macros.map(({ key, label }) => {
          const meta = NUTRIENTS[key];
          const val = Math.round((totals as any)[key] ?? 0);
          const rda = meta?.rda_personal ?? 0;
          const pct = rda > 0 ? Math.min((val / rda) * 100, 100) : 0;
          const color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444';
          return (
            <View key={key} style={styles.macroBox}>
              <Text style={styles.macroValue}>{val}</Text>
              <Text style={styles.macroLabel}>{label}</Text>
              {rda > 0 && (
                <>
                  <View style={styles.macroBg}>
                    <View style={[styles.macroFill, { width: `${pct}%`, backgroundColor: color }]} />
                  </View>
                  <Text style={styles.macroRda}>/ {rda}</Text>
                </>
              )}
            </View>
          );
        })}
      </View>

      {/* Mikroskładniki */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mikroskładniki</Text>
        {DASHBOARD_NUTRIENTS.map(key => (
          <NutrientBar key={key} nutrientKey={key} value={(totals as any)[key] ?? 0} />
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
  macroRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, gap: 8 },
  macroBox: { flex: 1, alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 10 },
  macroValue: { fontSize: 20, fontWeight: '700', color: '#16a34a' },
  macroLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  macroBg: { height: 4, backgroundColor: '#d1fae5', borderRadius: 2, width: '100%', marginTop: 6 },
  macroFill: { height: 4, borderRadius: 2 },
  macroRda: { fontSize: 10, color: '#9ca3af', marginTop: 2 },
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
});
