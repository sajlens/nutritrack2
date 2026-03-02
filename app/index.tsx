import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useNutriStore } from '../store/useNutriStore';
import { NUTRIENTS, DASHBOARD_NUTRIENTS } from '../constants/nutrients';

function NutrientBar({ nutrientKey, value }: { nutrientKey: string; value: number }) {
  const meta = NUTRIENTS[nutrientKey];
  if (!meta) return null;
  const rda = meta.rda_f ?? 0;
  const pct = rda > 0 ? Math.min((value / rda) * 100, 100) : 0;
  const color = pct >= 80 ? '#16a34a' : pct >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <View style={styles.nutrientRow}>
      <View style={styles.nutrientLabel}>
        <Text style={styles.nutrientName}>{meta.label}</Text>
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

export default function Dashboard() {
  const { todayMeals, isLoading, loadTodayMeals, getTodayTotals } = useNutriStore();
  const totals = getTodayTotals();

  useEffect(() => {
    loadTodayMeals();
  }, []);

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
      {/* Makro */}
      <View style={styles.macroRow}>
        {macros.map(({ key, label }) => (
          <View key={key} style={styles.macroBox}>
            <Text style={styles.macroValue}>
              {Math.round((totals as any)[key] ?? 0)}
            </Text>
            <Text style={styles.macroLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Mikroskładniki */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mikroskładniki</Text>
        {DASHBOARD_NUTRIENTS.map(key => (
          <NutrientBar
            key={key}
            nutrientKey={key}
            value={(totals as any)[key] ?? 0}
          />
        ))}
      </View>

      {/* Posiłki */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dzisiejsze posiłki</Text>
        {todayMeals.length === 0 ? (
          <Text style={styles.empty}>Brak posiłków. Dodaj pierwszy!</Text>
        ) : (
          todayMeals.map(meal => (
            <View key={meal.id} style={styles.mealCard}>
              <Text style={styles.mealInput}>{meal.raw_input}</Text>
              <Text style={styles.mealMeta}>
                {meal.items.length} składników ·{' '}
                {Math.round(meal.total_nutrients.calories ?? 0)} kcal
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
  macroRow: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, gap: 8 },
  macroBox: { flex: 1, alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12 },
  macroValue: { fontSize: 20, fontWeight: '700', color: '#16a34a' },
  macroLabel: { fontSize: 11, color: '#6b7280', marginTop: 2 },
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
  mealInput: { fontSize: 14, color: '#111827' },
  mealMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  empty: { color: '#9ca3af', textAlign: 'center', paddingVertical: 20 },
});
