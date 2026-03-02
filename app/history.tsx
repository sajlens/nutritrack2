import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';

export default function History() {
  const [meals, setMeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const load = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from('meals')
      .select('*, meal_items(*)')
      .order('eaten_at', { ascending: false })
      .limit(30);
    if (data) setMeals(data);
    setIsLoading(false);
  };

  useEffect(() => { load(); }, []);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const totalCal = (items: any[]) =>
    Math.round(items.reduce((s, i) => s + (i.calories ?? 0), 0));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
    >
      {meals.length === 0 && !isLoading && (
        <Text style={styles.empty}>Brak historii posiłków.</Text>
      )}
      {meals.map(meal => (
        <View key={meal.id} style={styles.card}>
          <Text style={styles.date}>{formatDate(meal.eaten_at)}</Text>
          <Text style={styles.input}>{meal.raw_input}</Text>
          <Text style={styles.meta}>
            {(meal.meal_items || []).length} składników · {totalCal(meal.meal_items || [])} kcal
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 40 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10 },
  date: { fontSize: 12, color: '#9ca3af', marginBottom: 4 },
  input: { fontSize: 15, color: '#111827', marginBottom: 6 },
  meta: { fontSize: 12, color: '#6b7280' },
});
