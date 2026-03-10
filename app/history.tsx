import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useNutriStore } from '../store/useNutriStore';

export default function History() {
  const [meals, setMeals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { deleteMeal } = useNutriStore();

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

  const handleDelete = (mealId: string) => {
    Alert.alert('Usuń posiłek', 'Czy na pewno chcesz usunąć ten posiłek?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          await deleteMeal(mealId);
          setMeals(prev => prev.filter(m => m.id !== mealId));
        }
      }
    ]);
  };

  const handleEdit = (mealId: string) => {
    router.push({ pathname: '/edit-meal', params: { mealId } });
  };

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
          <View style={styles.cardHeader}>
            <Text style={styles.date}>{formatDate(meal.eaten_at)}</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => handleEdit(meal.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.editBtn}>✏️</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDelete(meal.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.deleteBtn}>🗑️</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  date: { fontSize: 12, color: '#9ca3af', flex: 1 },
  actions: { flexDirection: 'row', gap: 12 },
  editBtn: { fontSize: 16 },
  deleteBtn: { fontSize: 16 },
  input: { fontSize: 15, color: '#111827', marginBottom: 6 },
  meta: { fontSize: 12, color: '#6b7280' },
});
