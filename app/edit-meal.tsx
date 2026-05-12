import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Modal, FlatList
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { searchFoodAll, calculateNutrients, setProductOverride, deleteProductOverride } from '../lib/nutrients';
import { useNutriStore } from '../store/useNutriStore';
import { MealItem } from '../types';
import { supabase } from '../lib/supabase';
import { resolveMealItems } from '../lib/calculations';
import { localDateString, addDays } from '../lib/dates';

export default function EditMeal() {
  const { mealId, templateId, templateName: templateNameParam } = useLocalSearchParams<{ mealId: string; templateId: string; templateName: string }>();
  const isTemplate = !!templateId;
  const { todayMeals, updateMeal, deleteMeal } = useNutriStore();

  const [items, setItems] = useState<MealItem[]>([]);
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [rawInput, setRawInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [eatenAt, setEatenAt] = useState<string>('');
  const [originalEatenAt, setOriginalEatenAt] = useState<string>('');

  const [searchModal, setSearchModal] = useState<{ visible: boolean; itemId: string | null }>({ visible: false, itemId: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [addModal, setAddModal] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<any[]>([]);
  const [addWeight, setAddWeight] = useState('100');
  const [addSelected, setAddSelected] = useState<any | null>(null);

  const [editServingModal, setEditServingModal] = useState(false);
  const [editServingProduct, setEditServingProduct] = useState<any | null>(null);
  const [editServingG, setEditServingG] = useState('');
  const [editServingNote, setEditServingNote] = useState('');

  // Reset state when mealId or templateId changes (component stays mounted in Tabs)
  useEffect(() => {
    if (isTemplate) {
      supabase.from('meal_templates').select('*').eq('id', templateId).single().then(async ({ data }) => {
        if (!data) { Alert.alert('Błąd', 'Nie znaleziono szablonu.'); router.back(); return; }
        const resolved = await resolveMealItems(data.items);
        const weights: Record<string, string> = {};
        resolved.forEach(i => { weights[i.id] = String(i.weight_grams); });
        setItems(resolved);
        setWeightInputs(weights);
        setRawInput(data.name);
      });
    } else {
      const meal = todayMeals.find(m => m.id === mealId);
      if (!meal) {
        Alert.alert('Błąd', 'Nie znaleziono posiłku.');
        router.back();
        return;
      }
      setItems(meal.items);
      setWeightInputs(Object.fromEntries(meal.items.map(i => [i.id, String(i.weight_grams)])));
      setRawInput(meal.raw_input);
      setEatenAt(meal.eaten_at);
      setOriginalEatenAt(meal.eaten_at);
    }
    // Reset modal states
    setIsSaving(false);
    setSearchModal({ visible: false, itemId: null });
    setAddModal(false);
    setAddSelected(null);
  }, [mealId, templateId]);

  const updateWeight = (id: string, newWeight: string) => {
    setWeightInputs(prev => ({ ...prev, [id]: newWeight }));
    const w = parseFloat(newWeight);
    if (isNaN(w) || w <= 0) return;
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      // Custom item (bez klucza w bazie, np. danie restauracyjne) — wartości
      // odżywcze są absolutne dla wagi porcji. Skalujemy je proporcjonalnie do
      // nowej wagi. Guard przeciw dzieleniu przez 0, gdy oryginalna waga była 0.
      if (!item.nutrient_key && item.weight_grams === 0) {
        return { ...item, weight_grams: w };
      }
      const per100g = Object.fromEntries(
        Object.entries(item.nutrients).map(([k, v]) => [k, typeof v === 'number' ? v / item.weight_grams * 100 : v])
      ) as any;
      return { ...item, weight_grams: w, nutrients: calculateNutrients(per100g, w) };
    }));
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) {
      Alert.alert('Uwaga', 'Posiłek musi mieć co najmniej jeden składnik.');
      return;
    }
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const openChangeSearch = async (itemId: string, currentName: string) => {
    setSearchQuery(currentName);
    setSearchModal({ visible: true, itemId });
    const results = await searchFoodAll(currentName);
    setSearchResults(results);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    const results = await searchFoodAll(q);
    setSearchResults(results);
  };

  const openEditServing = (result: any) => {
    setEditServingProduct(result);
    setEditServingG(result.item.serving_g ? String(result.item.serving_g) : '');
    setEditServingNote(result.item.serving_note ?? '');
    setEditServingModal(true);
  };

  const handleSaveServing = async () => {
    if (!editServingProduct) return;
    const g = parseFloat(editServingG.replace(',', '.'));
    if (isNaN(g) || g <= 0) { Alert.alert('Błąd', 'Podaj poprawną wagę.'); return; }
    const note = editServingNote.trim() || null;
    try {
      await setProductOverride(editServingProduct.key, g, note);
      const refreshed = await searchFoodAll(searchQuery || addQuery);
      if (searchQuery) setSearchResults(refreshed);
      if (addQuery) setAddResults(refreshed);
      setEditServingModal(false);
      setEditServingProduct(null);
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać porcji.');
    }
  };

  const handleResetServing = () => {
    if (!editServingProduct) return;
    Alert.alert('Reset porcji', 'Przywrócić domyślną porcję?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive', onPress: async () => {
          await deleteProductOverride(editServingProduct.key);
          const refreshed = await searchFoodAll(searchQuery || addQuery);
          if (searchQuery) setSearchResults(refreshed);
          if (addQuery) setAddResults(refreshed);
          setEditServingModal(false);
          setEditServingProduct(null);
        }
      }
    ]);
  };

  const selectFood = (result: any) => {
    const { itemId } = searchModal;
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        name: result.item.name_pl,
        nutrients: calculateNutrients(result.item.per_100g, item.weight_grams),
        nutrient_key: result.key,
        confirmed: true,
      };
    }));
    setSearchModal({ visible: false, itemId: null });
  };

  const handleAddSearch = async (q: string) => {
    setAddQuery(q);
    setAddSelected(null);
    if (q.trim().length < 2) { setAddResults([]); return; }
    const results = await searchFoodAll(q);
    setAddResults(results);
  };

  const confirmAddItem = () => {
    if (!addSelected) return;
    const w = parseFloat(addWeight);
    if (isNaN(w) || w <= 0) { Alert.alert('Błąd', 'Podaj prawidłową wagę.'); return; }
    const nutrients = calculateNutrients(addSelected.item.per_100g, w);
    const newItem: MealItem = {
      id: Math.random().toString(36).slice(2),
      name: addSelected.item.name_pl,
      weight_grams: w,
      nutrients,
      confirmed: true,
      nutrient_key: addSelected.key,
    };
    setWeightInputs(prev => ({ ...prev, [newItem.id]: String(w) }));
    setItems(prev => [...prev, newItem]);
    setAddModal(false);
    setAddQuery('');
    setAddResults([]);
    setAddSelected(null);
    setAddWeight('100');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (isTemplate) {
        const templateItems = items.map(item => ({
          name: item.nutrient_key ?? item.name,
          weight_grams: item.weight_grams,
          nutrient_key: item.nutrient_key,
          // Zachowaj wartości odżywcze dla itemów bez klucza w bazie
          // (np. ręcznie wpisane dania restauracyjne).
          custom_nutrients: !item.nutrient_key ? item.nutrients : undefined,
        }));
        await supabase.from('meal_templates').update({ name: rawInput, items: templateItems }).eq('id', templateId);
        router.back();
      } else {
        if (!mealId) return;
        const dateChanged = localDateString(new Date(eatenAt)) !== localDateString(new Date(originalEatenAt));
        await updateMeal(mealId, rawInput, items, dateChanged ? eatenAt : undefined);
        if (dateChanged) {
          const movedTo = formatDateLabel(eatenAt);
          Alert.alert('Przeniesiono', `Posiłek został przeniesiony na: ${movedTo}.`, [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } else {
          router.back();
        }
      }
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać zmian.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    const label = isTemplate ? 'ulubiony' : 'posiłek';
    Alert.alert('Usuń ' + label, 'Czy na pewno chcesz usunąć ten ' + label + '?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          if (isTemplate) {
            await supabase.from('meal_templates').delete().eq('id', templateId);
          } else {
            await deleteMeal(mealId!);
          }
          router.back();
        }
      }
    ]);
  };

  // Sumy makro dla całego posiłku/szablonu — wyświetlane w nagłówku.
  const totals = items.reduce((acc, i) => {
    acc.calories += i.nutrients.calories ?? 0;
    acc.protein += i.nutrients.protein ?? 0;
    acc.fat += i.nutrients.fat ?? 0;
    acc.carbs += i.nutrients.carbs ?? 0;
    acc.fiber += i.nutrients.fiber ?? 0;
    acc.sugar_g += i.nutrients.sugar_g ?? 0;
    return acc;
  }, { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar_g: 0 });

  // Przesuwa eaten_at o `days` dni — godzina pozostaje bez zmian.
  const shiftEatenAt = (days: number) => {
    if (!eatenAt) return;
    const d = new Date(eatenAt);
    d.setDate(d.getDate() + days);
    setEatenAt(d.toISOString());
  };

  function formatDateLabel(iso: string): string {
    if (!iso) return '';
    const dateStr = localDateString(new Date(iso));
    const today = localDateString();
    if (dateStr === today) return 'Dziś';
    if (dateStr === addDays(today, -1)) return 'Wczoraj';
    if (dateStr === addDays(today, -2)) return 'Przedwczoraj';
    if (dateStr === addDays(today, 1)) return 'Jutro';
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}`;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>{isTemplate ? 'Edytuj ulubiony' : 'Edytuj posiłek'}</Text>

      <TextInput
        style={styles.rawInput}
        value={rawInput}
        onChangeText={setRawInput}
        placeholder={isTemplate ? 'Nazwa ulubionego...' : 'Opis posiłku...'}
        multiline
      />

      {!isTemplate && (
        <View style={styles.dateSection}>
          <Text style={styles.dateSectionLabel}>Data posiłku</Text>
          <View style={styles.dateNav}>
            <TouchableOpacity style={styles.dateArrow} onPress={() => shiftEatenAt(-1)}>
              <Text style={styles.dateArrowText}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.dateValue}>{formatDateLabel(eatenAt)}</Text>
            <TouchableOpacity style={styles.dateArrow} onPress={() => shiftEatenAt(1)}>
              <Text style={styles.dateArrowText}>›</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <Text style={styles.sectionLabel}>Składniki</Text>
      <View style={styles.totalsBar}>
        <Text style={styles.totalsBarTitle}>Łącznie</Text>
        <View style={styles.totalsBarRow}>
          <Text style={styles.totalsBarItem}>{Math.round(totals.calories)} kcal</Text>
          <Text style={styles.totalsBarItem}>B {Math.round(totals.protein)}g</Text>
          <Text style={styles.totalsBarItem}>T {Math.round(totals.fat)}g</Text>
          <Text style={styles.totalsBarItem}>W {Math.round(totals.carbs)}g</Text>
          <Text style={styles.totalsBarItem}>Bł {Math.round(totals.fiber)}g</Text>
          <Text style={styles.totalsBarItem}>C {Math.round(totals.sugar_g)}g</Text>
        </View>
      </View>

      {items.map(item => (
        <View key={item.id} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openChangeSearch(item.id, item.name)}>
                <Text style={styles.actionBtnText}>zmień</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={() => removeItem(item.id)}>
                <Text style={[styles.actionBtnText, styles.actionBtnDangerText]}>usuń</Text>
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.weightRow}>
            <TextInput
              style={styles.weightInput}
              value={weightInputs[item.id] ?? String(item.weight_grams)}
              onChangeText={v => updateWeight(item.id, v)}
              keyboardType="numeric"
            />
            <Text style={styles.weightUnit}>g</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.addItemBtn} onPress={() => setAddModal(true)}>
        <Text style={styles.addItemBtnText}>+ Dodaj składnik</Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.btnDanger} onPress={handleDelete}>
          <Text style={styles.btnDangerText}>{isTemplate ? 'Usuń ulubiony' : 'Usuń posiłek'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={isSaving}>
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz</Text>}
        </TouchableOpacity>
      </View>

      {/* Modal: zmiana składnika */}
      <Modal visible={searchModal.visible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Zmień składnik</Text>
            <TouchableOpacity onPress={() => setSearchModal({ visible: false, itemId: null })}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={handleSearch}
            placeholder="Szukaj produktu..."
            autoFocus
          />
          <FlatList
            data={searchResults}
            keyExtractor={item => item.key}
            renderItem={({ item }) => (
              <View style={styles.searchResultRow}>
                <TouchableOpacity style={styles.searchResultMain} onPress={() => selectFood(item)}>
                  <Text style={styles.searchResultName}>{item.item.name_pl}</Text>
                  <Text style={styles.searchResultMeta}>
                    {Math.round(item.item.per_100g.calories ?? 0)} kcal / 100g · {item.score}%
                    {item.item.serving_g ? ` · porcja: ${item.item.serving_g}g${item.item.serving_note ? ` (${item.item.serving_note})` : ""}` : ""}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => openEditServing(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.searchResultEdit}
                >
                  <Text style={{ fontSize: 16 }}>✏️</Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.searchEmpty}>
                {searchQuery.length >= 2 ? 'Brak wyników.' : 'Wpisz min. 2 znaki.'}
              </Text>
            }
          />
        </View>
      </Modal>

      {/* Modal: dodaj składnik */}
      <Modal visible={addModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Dodaj składnik</Text>
            <TouchableOpacity onPress={() => { setAddModal(false); setAddSelected(null); setAddQuery(''); }}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.searchInput}
            value={addQuery}
            onChangeText={handleAddSearch}
            placeholder="Szukaj produktu..."
            autoFocus
          />
          {addSelected ? (
            <View style={styles.selectedProduct}>
              <Text style={styles.selectedProductName}>{addSelected.item.name_pl}</Text>
              <View style={styles.weightRow}>
                <TextInput
                  style={styles.weightInput}
                  value={addWeight}
                  onChangeText={setAddWeight}
                  keyboardType="numeric"
                />
                <Text style={styles.weightUnit}>g</Text>
              </View>
              {addSelected.item.serving_g ? (
                <TouchableOpacity
                  style={styles.servingHint}
                  onPress={() => setAddWeight(String(addSelected.item.serving_g))}
                >
                  <Text style={styles.servingHintText}>
                    🍽️ {addSelected.item.serving_note ?? '1 porcja'} = {addSelected.item.serving_g}g
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={[styles.btnPrimary, { flex: 0 }]} onPress={confirmAddItem}>
                <Text style={styles.btnPrimaryText}>Dodaj do posiłku</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{ marginTop: 8, alignItems: 'center' }} onPress={() => setAddSelected(null)}>
                <Text style={{ color: '#6b7280', fontSize: 14 }}>Wróć do wyszukiwania</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={addResults}
              keyExtractor={item => item.key}
              renderItem={({ item }) => (
                <View style={styles.searchResultRow}>
                  <TouchableOpacity style={styles.searchResultMain} onPress={() => setAddSelected(item)}>
                    <Text style={styles.searchResultName}>{item.item.name_pl}</Text>
                    <Text style={styles.searchResultMeta}>
                      {Math.round(item.item.per_100g.calories ?? 0)} kcal / 100g · {item.score}%
                      {item.item.serving_g ? ` · porcja: ${item.item.serving_g}g${item.item.serving_note ? ` (${item.item.serving_note})` : ''}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => openEditServing(item)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={styles.searchResultEdit}
                  >
                    <Text style={{ fontSize: 16 }}>✏️</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.searchEmpty}>
                  {addQuery.length >= 2 ? 'Brak wyników.' : 'Wpisz min. 2 znaki.'}
                </Text>
              }
            />
          )}
        </View>
      </Modal>

      {/* Modal: edycja standardowej porcji produktu */}
      <Modal visible={editServingModal} animationType="fade" transparent onRequestClose={() => setEditServingModal(false)}>
        <View style={styles.portionsOverlay}>
          <View style={[styles.portionsBox, { maxWidth: 360 }]}>
            <Text style={styles.portionsTitle}>{editServingProduct?.item.name_pl}</Text>
            <Text style={[styles.portionsHint, { fontSize: 12, marginBottom: 16 }]}>
              Ustaw standardową porcję dla tego produktu.
            </Text>

            <Text style={styles.fieldLabel}>Waga porcji (g):</Text>
            <TextInput
              style={styles.searchInputPadded}
              value={editServingG}
              onChangeText={setEditServingG}
              keyboardType="numeric"
              placeholder="np. 22"
            />

            <Text style={styles.fieldLabel}>Opis (opcjonalnie):</Text>
            <TextInput
              style={styles.searchInputPadded}
              value={editServingNote}
              onChangeText={setEditServingNote}
              placeholder="np. 1 gruby kabanos"
            />

            <TouchableOpacity style={[styles.btnPrimary, { flex: 0, marginTop: 16 }]} onPress={handleSaveServing}>
              <Text style={styles.btnPrimaryText}>Zapisz</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnSecondary, { flex: 0, marginTop: 8 }]} onPress={handleResetServing}>
              <Text style={styles.btnSecondaryText}>Reset do domyślnej</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => setEditServingModal(false)}>
              <Text style={{ color: '#6b7280', fontSize: 14 }}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 12 },
  rawInput: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16, minHeight: 60 },
  dateSection: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16 },
  dateSectionLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateArrow: { paddingHorizontal: 16, paddingVertical: 4 },
  dateArrowText: { fontSize: 28, color: '#16a34a', lineHeight: 30 },
  dateValue: { fontSize: 16, fontWeight: '600', color: '#111827' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalsBar: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#bbf7d0' },
  totalsBarTitle: { fontSize: 11, fontWeight: '700', color: '#15803d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  totalsBarRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, rowGap: 4 },
  totalsBarItem: { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  itemActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  actionBtnText: { fontSize: 12, color: '#374151' },
  actionBtnDanger: { backgroundColor: '#fef2f2' },
  actionBtnDangerText: { color: '#ef4444' },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  weightInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 6, width: 70, textAlign: 'center', fontSize: 14, backgroundColor: '#f9fafb' },
  weightUnit: { fontSize: 13, color: '#6b7280' },
  addItemBtn: { borderWidth: 1.5, borderColor: '#16a34a', borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 16 },
  addItemBtnText: { color: '#16a34a', fontSize: 15, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  btnPrimary: { flex: 1, backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center' },
  btnSecondary: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db' },
  btnSecondaryText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  searchResultMain: { flex: 1, padding: 16 },
  searchResultEdit: { padding: 16 },
  portionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  portionsBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%' },
  portionsTitle: { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 4, textAlign: 'center' },
  portionsHint: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 6 },
  searchInputPadded: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#d1d5db', color: '#111827' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDanger: { flex: 1, backgroundColor: '#fee2e2', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnDangerText: { color: '#dc2626', fontSize: 16, fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modalClose: { fontSize: 16, color: '#6b7280' },
  searchInput: { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#e5e7eb' },
  searchResult: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  searchResultName: { fontSize: 15, color: '#111827', marginBottom: 2 },
  searchResultMeta: { fontSize: 12, color: '#9ca3af' },
  searchEmpty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14 },
  selectedProduct: { margin: 16, backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  selectedProductName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  servingHint: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#bbf7d0' },
  servingHintText: { fontSize: 13, color: '#15803d', fontWeight: '600' },
});
