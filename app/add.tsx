import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert
} from 'react-native';
import { router } from 'expo-router';
import { parseMealDescription } from '../lib/claude';
import { resolveMealItems } from '../lib/calculations';
import { useNutriStore } from '../store/useNutriStore';
import { MealItem } from '../types';
import { NUTRIENTS } from '../constants/nutrients';

export default function AddMeal() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<MealItem[]>([]);
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const { addMeal } = useNutriStore();

  const handleParse = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    try {
      const parsed = await parseMealDescription(input);
      const resolved = await resolveMealItems(parsed);
      setItems(resolved);
      setStep('confirm');
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się przetworzyć opisu. Spróbuj ponownie.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await addMeal(input, items);
      setInput('');
      setItems([]);
      setStep('input');
      router.replace('/');
    } catch (e) {
      Alert.alert('Błąd', 'Nie udało się zapisać posiłku.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateWeight = (id: string, newWeight: string) => {
    const w = parseFloat(newWeight);
    if (isNaN(w)) return;
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      return { ...item, weight_grams: w };
    }));
  };

  if (step === 'confirm') {
    return (
      <ScrollView style={styles.container}>
        <Text style={styles.heading}>Potwierdź posiłek</Text>
        <Text style={styles.subheading}>{input}</Text>

        {items.map(item => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.name}</Text>
              <View style={styles.weightRow}>
                <TextInput
                  style={styles.weightInput}
                  value={String(item.weight_grams)}
                  onChangeText={v => updateWeight(item.id, v)}
                  keyboardType="numeric"
                />
                <Text style={styles.weightUnit}>g</Text>
              </View>
            </View>
            <View style={styles.itemNutrients}>
              {(['calories', 'protein', 'fat', 'carbs'] as const).map(key => (
                <Text key={key} style={styles.itemNutrient}>
                  {NUTRIENTS[key].label}: {Math.round((item.nutrients as any)[key] ?? 0)}{NUTRIENTS[key].unit}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('input')}>
            <Text style={styles.btnSecondaryText}>Wróć</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={isLoading}>
            {isLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnPrimaryText}>Zapisz</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Co zjadłaś?</Text>
      <Text style={styles.hint}>
        Opisz posiłek naturalnie, np. "owsianka z bananem i łyżką masła orzechowego"
      </Text>
      <TextInput
        style={styles.textArea}
        value={input}
        onChangeText={setInput}
        placeholder="Opisz posiłek..."
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <TouchableOpacity
        style={[styles.btnPrimary, !input.trim() && styles.btnDisabled]}
        onPress={handleParse}
        disabled={isLoading || !input.trim()}
      >
        {isLoading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.btnPrimaryText}>Analizuj →</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  hint: { fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 20 },
  textArea: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    fontSize: 16, borderWidth: 1, borderColor: '#e5e7eb',
    minHeight: 120, marginBottom: 16,
  },
  itemCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb',
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  weightInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    padding: 6, width: 60, textAlign: 'center', fontSize: 14,
  },
  weightUnit: { fontSize: 13, color: '#6b7280' },
  itemNutrients: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemNutrient: { fontSize: 12, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  buttonRow: { flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 32 },
  btnPrimary: { flex: 1, backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnSecondary: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnSecondaryText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
