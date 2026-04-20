import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Modal, FlatList
} from 'react-native';
import { router } from 'expo-router';
import { parseMealDescription } from '../lib/claude';
import { resolveMealItems } from '../lib/calculations';
import { searchFoodAll, searchFood, getFoodByKey, calculateNutrients, isSupplementKey } from '../lib/nutrients';
import { useNutriStore } from '../store/useNutriStore';
import { MealItem } from '../types';
import { NUTRIENTS } from '../constants/nutrients';
import { supabase } from '../lib/supabase';

export default function AddMeal() {
  const TEMPLATE_CATEGORIES = [
    { key: 'napoje', label: 'Napoje' },
    { key: 'obiady', label: 'Obiady' },
    { key: 'przekaski', label: 'Przekąski' },
    { key: 'inne', label: 'Inne' },
  ];

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<MealItem[]>([]);
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'input' | 'confirm'>('input');

  const [searchModal, setSearchModal] = useState<{ visible: boolean; itemId: string }>({ visible: false, itemId: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [templatesModal, setTemplatesModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const [portionsModal, setPortionsModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [portionsInput, setPortionsInput] = useState('1');

  const [saveTemplateModal, setSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState('inne');

  const [supplementsModal, setSupplementsModal] = useState(false);
  const [supplements, setSupplements] = useState<any[]>([]);
  const [suppLoading, setSuppLoading] = useState(false);
  const [selectedSupplements, setSelectedSupplements] = useState<Set<string>>(new Set());

  const [quickAddModal, setQuickAddModal] = useState(false);
  const [quickAddQuery, setQuickAddQuery] = useState('');
  const [quickAddResults, setQuickAddResults] = useState<any[]>([]);
  const [quickAddSelected, setQuickAddSelected] = useState<any | null>(null);
  const [quickAddWeight, setQuickAddWeight] = useState('');
  const [quickAddItems, setQuickAddItems] = useState<{ result: any; weight: number; id: string }[]>([]);

  const [manageSuppModal, setManageSuppModal] = useState(false);
  const [editSuppModal, setEditSuppModal] = useState(false);
  const [editSupp, setEditSupp] = useState<any | null>(null);
  const [editSuppName, setEditSuppName] = useState('');
  const [editSuppKey, setEditSuppKey] = useState('');
  const [editSuppWeight, setEditSuppWeight] = useState('');

  const { addMeal } = useNutriStore();

  const handleQuickSearch = async (q: string) => {
    setQuickAddQuery(q);
    if (q.trim().length < 2) { setQuickAddResults([]); return; }
    const results = await searchFoodAll(q);
    setQuickAddResults(results);
  };

  const selectQuickProduct = (result: any) => {
    setQuickAddSelected(result);
    setQuickAddWeight(String(result.item.serving_g ?? 100));
  };

  const addQuickItem = () => {
    if (!quickAddSelected) return;
    const w = parseFloat(quickAddWeight.replace(',', '.'));
    if (isNaN(w) || w <= 0) { Alert.alert('Błąd', 'Podaj prawidłową wagę.'); return; }
    setQuickAddItems(prev => [...prev, {
      result: quickAddSelected,
      weight: w,
      id: Math.random().toString(36).slice(2),
    }]);
    setQuickAddSelected(null);
    setQuickAddQuery('');
    setQuickAddResults([]);
    setQuickAddWeight('');
  };

  const removeQuickItem = (id: string) => {
    setQuickAddItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSaveQuickAdd = async () => {
    if (quickAddItems.length === 0) return;
    setIsLoading(true);
    try {
      const mealItems: MealItem[] = quickAddItems.map(({ result, weight, id }) => ({
        id,
        name: result.item.name_pl,
        weight_grams: weight,
        nutrients: calculateNutrients(result.item.per_100g, weight),
        confirmed: true,
        nutrient_key: result.key,
      }));
      const label = quickAddItems.map(i => `${i.result.item.name_pl} ${i.weight}g`).join(', ');
      await addMeal(label, mealItems);
      setQuickAddItems([]);
      setQuickAddModal(false);
      router.replace('/');
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    const { data } = await supabase.from('meal_templates').select('*').order('created_at', { ascending: false });
    if (data) setTemplates(data);
    setTemplatesLoading(false);
  };

  const loadSupplements = async () => {
    setSuppLoading(true);
    const { data } = await supabase.from('supplements').select('*').order('created_at');
    if (data) setSupplements(data);
    setSuppLoading(false);
  };

  const handleParse = async () => {
    if (!input.trim()) return;
    setIsLoading(true);
    try {
      const parsed = await parseMealDescription(input);
      const resolved = await resolveMealItems(parsed);
      const weights: Record<string, string> = {};
      resolved.forEach(i => { weights[i.id] = String(i.weight_grams); });
      setItems(resolved);
      setWeightInputs(weights);
      setStep('confirm');
    } catch {
      Alert.alert('Błąd', 'Nie udało się przetworzyć opisu. Spróbuj ponownie.');
    } finally {
      setIsLoading(false);
    }
  };

  const openPortionsPicker = (template: any) => {
    setSelectedTemplate(template);
    setPortionsInput('1');
    setTemplatesModal(false);
    setPortionsModal(true);
  };

  const handleLoadTemplate = async (template: any, portions: number) => {
    setPortionsModal(false);
    setIsLoading(true);
    try {
      const itemsWithPortions = template.items.map((item: any) => ({
        ...item,
        weight_grams: item.weight_grams * portions,
      }));
      const resolved = await resolveMealItems(itemsWithPortions);
      const weights: Record<string, string> = {};
      resolved.forEach(i => { weights[i.id] = String(i.weight_grams); });
      setItems(resolved);
      setWeightInputs(weights);
      setInput(template.name + (portions !== 1 ? ' x' + portions : ''));
      setStep('confirm');
    } catch {
      Alert.alert('Błąd', 'Nie udało się załadować szablonu.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTemplate = (templateId: string, name: string) => {
    Alert.alert('Usuń ulubiony', 'Usunąć "' + name + '" z ulubionych?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          await supabase.from('meal_templates').delete().eq('id', templateId);
          setTemplates(prev => prev.filter(t => t.id !== templateId));
        }
      }
    ]);
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim() || input.trim();
    if (!name) { Alert.alert('Błąd', 'Podaj nazwę ulubionego posiłku.'); return; }
    const templateItems = items.map(item => ({
      name: item.nutrient_key ?? item.name,
      weight_grams: item.weight_grams,
      nutrient_key: item.nutrient_key,
    }));
    const { error } = await supabase.from('meal_templates').insert({ name, items: templateItems, category: templateCategory });
    if (error) {
      Alert.alert('Błąd', 'Nie udało się zapisać.');
    } else {
      Alert.alert('Zapisano!', '"' + name + '" dodany do ulubionych.');
      setSaveTemplateModal(false);
      setTemplateName('');
      setTemplateCategory('inne');
    }
  };

  const openSupplementsModal = () => {
    loadSupplements();
    setSupplementsModal(true);
  };

  const openManageSupplements = () => {
    setSupplementsModal(false);
    setManageSuppModal(true);
  };

  const openEditSupp = (supp: any | null) => {
    setEditSupp(supp);
    setEditSuppName(supp?.name ?? '');
    setEditSuppKey(supp?.nutrient_key ?? '');
    setEditSuppWeight(supp ? String(supp.weight_grams) : '');
    setManageSuppModal(false);
    setEditSuppModal(true);
  };

  const handleSaveSupp = async () => {
    const name = editSuppName.trim();
    const key = editSuppKey.trim();
    const w = parseFloat(editSuppWeight);
    if (!name || !key || isNaN(w) || w <= 0) {
      Alert.alert('Błąd', 'Wypełnij wszystkie pola poprawnie.');
      return;
    }
    if (editSupp) {
      await supabase.from('supplements').update({ name, nutrient_key: key, weight_grams: w }).eq('id', editSupp.id);
    } else {
      await supabase.from('supplements').insert({ name, nutrient_key: key, weight_grams: w });
    }
    setEditSuppModal(false);
    await loadSupplements();
    setManageSuppModal(true);
  };

  const handleDeleteSupp = (supp: any) => {
    Alert.alert('Usuń suplement', 'Usunąć "' + supp.name + '"?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Usuń', style: 'destructive', onPress: async () => {
          await supabase.from('supplements').delete().eq('id', supp.id);
          loadSupplements();
        }
      }
    ]);
  };

  const toggleSupplement = (id: string) => {
    setSelectedSupplements(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSaveSupplements = async () => {
    if (selectedSupplements.size === 0) { setSupplementsModal(false); return; }
    setIsLoading(true);
    try {
      const mealItems: MealItem[] = [];
      for (const suppId of selectedSupplements) {
        const supp = supplements.find((s: any) => s.id === suppId);
        if (!supp) continue;
        const foodItem = getFoodByKey(supp.nutrient_key);
        if (!foodItem) continue;
        const nutrients = calculateNutrients(foodItem.per_100g, supp.weight_grams, isSupplementKey(supp.nutrient_key));
        mealItems.push({
          id: Math.random().toString(36).slice(2),
          name: supp.name,
          weight_grams: supp.weight_grams,
          nutrients,
          confirmed: true,
          nutrient_key: supp.nutrient_key,
        });
      }
      const label = Array.from(selectedSupplements)
        .map((id: string) => supplements.find((s: any) => s.id === id)?.name)
        .filter(Boolean)
        .join(', ');
      await addMeal('Suplementy: ' + label, mealItems);
      setSelectedSupplements(new Set());
      setSupplementsModal(false);
      router.replace('/');
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać suplementów.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateWeight = (id: string, newWeight: string) => {
    setWeightInputs(prev => ({ ...prev, [id]: newWeight }));
    const w = parseFloat(newWeight);
    if (isNaN(w) || w <= 0) return;
    setItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      if (item.nutrient_key) {
        const results = searchFood(item.name);
        const found = results.find(r => r.key === item.nutrient_key) || results[0];
        if (found) return { ...item, weight_grams: w, nutrients: calculateNutrients(found.item.per_100g, w) };
      }
      return { ...item, weight_grams: w };
    }));
  };

  const openSearch = async (itemId: string, currentName: string) => {
    setSearchQuery(currentName);
    setSearchModal({ visible: true, itemId });
    const results = await searchFoodAll(currentName);
    setSearchResults(results);
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) { setSearchResults([]); return; }
    const results = await searchFoodAll(query);
    setSearchResults(results);
  };

  const selectFood = (result: any) => {
    const { itemId } = searchModal;
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      return { ...item, name: result.item.name_pl, nutrients: calculateNutrients(result.item.per_100g, item.weight_grams), nutrient_key: result.key };
    }));
    setSearchModal({ visible: false, itemId: '' });
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await addMeal(input, items);
      setInput(''); setItems([]); setStep('input');
      router.replace('/');
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać posiłku.');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'confirm') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Potwierdź posiłek</Text>
        <Text style={styles.subheading}>{input}</Text>

        {items.map(item => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.name}</Text>
              <TouchableOpacity style={styles.changeBtn} onPress={() => openSearch(item.id, item.name)}>
                <Text style={styles.changeBtnText}>zmień</Text>
              </TouchableOpacity>
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
            <View style={styles.itemNutrients}>
              {(['calories', 'protein', 'fat', 'carbs'] as const).map(key => (
                <Text key={key} style={styles.itemNutrient}>
                  {NUTRIENTS[key].label}: {Math.round((item.nutrients as any)[key] ?? 0)}{NUTRIENTS[key].unit}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.btnFavorite} onPress={() => { setTemplateName(input); setSaveTemplateModal(true); }}>
          <Text style={styles.btnFavoriteText}>⭐ Zapisz do ulubionych</Text>
        </TouchableOpacity>

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep('input')}>
            <Text style={styles.btnSecondaryText}>Wróć</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz</Text>}
          </TouchableOpacity>
        </View>

        <Modal visible={searchModal.visible} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Zmień składnik</Text>
              <TouchableOpacity onPress={() => setSearchModal({ visible: false, itemId: '' })}>
                <Text style={styles.modalClose}>Anuluj</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.searchInputPadded} value={searchQuery} onChangeText={handleSearch} placeholder="Szukaj produktu..." autoFocus />
            <FlatList
              data={searchResults}
              keyExtractor={item => item.key}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.searchResult} onPress={() => selectFood(item)}>
                  <Text style={styles.searchResultName}>{item.item.name_pl}</Text>
                  <Text style={styles.searchResultMeta}>{Math.round(item.item.per_100g.calories ?? 0)} kcal / 100g · {item.score}%</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.searchEmpty}>{searchQuery.length >= 2 ? 'Brak wyników.' : 'Wpisz min. 2 znaki.'}</Text>}
            />
          </View>
        </Modal>

        <Modal visible={saveTemplateModal} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Zapisz do ulubionych</Text>
              <TouchableOpacity onPress={() => setSaveTemplateModal(false)}>
                <Text style={styles.modalClose}>Anuluj</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Nazwa ulubionego posiłku:</Text>
              <TextInput style={styles.searchInputPadded} value={templateName} onChangeText={setTemplateName} placeholder="np. Śniadanie z owsianką..." autoFocus />
              <Text style={styles.fieldLabel}>Kategoria:</Text>
              <View style={styles.categoryRow}>
                {TEMPLATE_CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat.key}
                    style={[styles.categoryChip, templateCategory === cat.key && styles.categoryChipSelected]}
                    onPress={() => setTemplateCategory(cat.key)}
                  >
                    <Text style={[styles.categoryChipText, templateCategory === cat.key && styles.categoryChipTextSelected]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={styles.btnBlock} onPress={handleSaveTemplate}>
                <Text style={styles.btnPrimaryText}>Zapisz</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Co zjadłaś?</Text>
      <Text style={styles.hint}>Opisz posiłek naturalnie lub wybierz z ulubionych.</Text>
      <TextInput
        style={styles.textArea}
        value={input}
        onChangeText={setInput}
        placeholder="Opisz posiłek..."
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => { loadTemplates(); setTemplatesModal(true); }}>
          <Text style={styles.btnSecondaryText}>Ulubione</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnPrimary, !input.trim() && styles.btnDisabled]} onPress={handleParse} disabled={isLoading || !input.trim()}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Analizuj</Text>}
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btnSupplements} onPress={openSupplementsModal}>
        <Text style={styles.btnSupplementsText}>💊 Dodaj suplementy</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnQuickAdd} onPress={() => setQuickAddModal(true)}>
        <Text style={styles.btnQuickAddText}>🔍 Szybkie dodanie z bazy</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnAddProduct} onPress={() => router.push('/add-product')}>
        <Text style={styles.btnAddProductText}>🥦 Dodaj produkt do bazy</Text>
      </TouchableOpacity>

      {/* Modal: ulubione */}
      <Modal visible={templatesModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ulubione posiłki</Text>
            <TouchableOpacity onPress={() => setTemplatesModal(false)}>
              <Text style={styles.modalClose}>Zamknij</Text>
            </TouchableOpacity>
          </View>
          {templatesLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#16a34a" />
          ) : templates.length === 0 ? (
            <Text style={styles.searchEmpty}>{'Brak ulubionych.\nDodaj posiłek i zapisz go jako ulubiony ⭐'}</Text>
          ) : (
            <ScrollView>
              {TEMPLATE_CATEGORIES
                .map(cat => ({
                  key: cat.key,
                  label: cat.label,
                  data: templates.filter(t => (t.category || 'inne') === cat.key),
                }))
                .filter(s => s.data.length > 0)
                .map(section => {
                  const collapsed = collapsedSections.has(section.key);
                  return (
                    <View key={section.key}>
                      <TouchableOpacity
                        style={styles.sectionHeader}
                        onPress={() => setCollapsedSections(prev => {
                          const next = new Set(prev);
                          next.has(section.key) ? next.delete(section.key) : next.add(section.key);
                          return next;
                        })}
                      >
                        <Text style={styles.sectionHeaderText}>{section.label}</Text>
                        <Text style={styles.sectionHeaderArrow}>{collapsed ? '›' : '⌄'}</Text>
                      </TouchableOpacity>
                      {!collapsed && section.data.map(item => (
                        <TouchableOpacity key={item.id} style={styles.templateItem} onPress={() => openPortionsPicker(item)}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.templateName}>{item.name}</Text>
                            <Text style={styles.templateMeta}>{item.items.length} składników</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => { setTemplatesModal(false); router.push({ pathname: '/edit-meal', params: { templateId: item.id, templateName: item.name } }); }}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ marginRight: 12 }}
                          >
                            <Text style={{ fontSize: 16 }}>✏️</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteTemplate(item.id, item.name)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ fontSize: 16 }}>🗑️</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })
              }
            </ScrollView>
          )}
        </View>
      </Modal>


      {/* Modal: wybór porcji */}
      <Modal visible={portionsModal} animationType="fade" transparent>
        <View style={styles.portionsOverlay}>
          <View style={styles.portionsBox}>
            <Text style={styles.portionsTitle}>{selectedTemplate?.name}</Text>
            <Text style={styles.portionsHint}>Ile porcji?</Text>
            <TextInput
              style={styles.portionsInput}
              value={portionsInput}
              onChangeText={setPortionsInput}
              keyboardType="numeric"
              selectTextOnFocus
              autoFocus
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => { setPortionsModal(false); setPortionsInput('1'); setTemplatesModal(true); }}
              >
                <Text style={styles.btnSecondaryText}>Anuluj</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => {
                  const p = parseFloat(portionsInput.replace(',', '.'));
                  if (isNaN(p) || p <= 0) { Alert.alert('Błąd', 'Podaj liczbę większą od 0.'); return; }
                  setPortionsInput('1');
                  handleLoadTemplate(selectedTemplate, p);
                }}
              >
                <Text style={styles.btnPrimaryText}>Załaduj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Modal: szybkie dodanie z bazy */}
      <Modal visible={quickAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Szybkie dodanie</Text>
            <TouchableOpacity onPress={() => { setQuickAddModal(false); setQuickAddSelected(null); setQuickAddQuery(''); setQuickAddResults([]); setQuickAddItems([]); }}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>

          {quickAddSelected ? (
            <View style={styles.modalBody}>
              <Text style={styles.quickSelectedName}>{quickAddSelected.item.name_pl}</Text>
              <Text style={styles.quickSelectedMeta}>
                {Math.round(quickAddSelected.item.per_100g.calories ?? 0)} kcal · {Math.round(quickAddSelected.item.per_100g.protein ?? 0)}g B · {Math.round(quickAddSelected.item.per_100g.fat ?? 0)}g T · {Math.round(quickAddSelected.item.per_100g.carbs ?? 0)}g W / 100g
              </Text>
              <Text style={styles.fieldLabel}>Waga (g):</Text>
              <TextInput
                style={styles.searchInputPadded}
                value={quickAddWeight}
                onChangeText={setQuickAddWeight}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => { setQuickAddSelected(null); setQuickAddQuery(''); }}>
                  <Text style={styles.btnSecondaryText}>Wróć</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnPrimary} onPress={addQuickItem}>
                  <Text style={styles.btnPrimaryText}>Dodaj</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <TextInput
                value={quickAddQuery}
                onChangeText={handleQuickSearch}
                placeholder="Szukaj produktu..."
                autoFocus
                style={[styles.searchInputPadded, { margin: 16, marginBottom: 8 }]}
              />
              <FlatList
                data={quickAddResults}
                keyExtractor={item => item.key}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.searchResult} onPress={() => selectQuickProduct(item)}>
                    <Text style={styles.searchResultName}>{item.item.name_pl}</Text>
                    <Text style={styles.searchResultMeta}>
                      {Math.round(item.item.per_100g.calories ?? 0)} kcal / 100g · {item.score}%
                    </Text>
                  </TouchableOpacity>
                )}
                ListHeaderComponent={quickAddItems.length > 0 ? (
                  <View style={styles.quickItemsList}>
                    {quickAddItems.map(qi => (
                      <View key={qi.id} style={styles.quickItem}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.quickItemName}>{qi.result.item.name_pl}</Text>
                          <Text style={styles.quickItemMeta}>{qi.weight}g · {Math.round(calculateNutrients(qi.result.item.per_100g, qi.weight).calories ?? 0)} kcal</Text>
                        </View>
                        <TouchableOpacity onPress={() => removeQuickItem(qi.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    <TouchableOpacity
                      style={[styles.btnBlock, styles.btnBlockMargin, isLoading && styles.btnDisabled]}
                      onPress={handleSaveQuickAdd}
                      disabled={isLoading}
                    >
                      {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz ({quickAddItems.length})</Text>}
                    </TouchableOpacity>
                  </View>
                ) : null}
                ListEmptyComponent={<Text style={styles.searchEmpty}>{quickAddQuery.length >= 2 ? 'Brak wyników.' : 'Wpisz min. 2 znaki.'}</Text>}
              />
            </>
          )}
        </View>
      </Modal>

      {/* Modal: suplementy */}
      <Modal visible={supplementsModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Suplementy</Text>
            <TouchableOpacity onPress={() => { setSupplementsModal(false); setSelectedSupplements(new Set()); }}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.suppTopRow}>
            <Text style={styles.supplementHint}>Zaznacz co dzisiaj wzięłaś:</Text>
            <TouchableOpacity onPress={openManageSupplements}>
              <Text style={styles.manageSuppBtn}>Zarządzaj</Text>
            </TouchableOpacity>
          </View>
          {suppLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#16a34a" />
          ) : (
            supplements.map((supp: any) => {
              const selected = selectedSupplements.has(supp.id);
              return (
                <TouchableOpacity
                  key={supp.id}
                  style={[styles.supplementItem, selected && styles.supplementItemSelected]}
                  onPress={() => toggleSupplement(supp.id)}
                >
                  <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Text style={styles.checkboxTick}>✓</Text>}
                  </View>
                  <Text style={[styles.supplementName, selected && styles.supplementNameSelected]}>{supp.name}</Text>
                </TouchableOpacity>
              );
            })
          )}
          <TouchableOpacity
            style={[styles.btnBlock, styles.btnBlockMargin, selectedSupplements.size === 0 && styles.btnDisabled]}
            onPress={handleSaveSupplements}
            disabled={isLoading || selectedSupplements.size === 0}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz ({selectedSupplements.size})</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Modal: zarządzanie suplementami */}
      <Modal visible={manageSuppModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Zarządzaj suplementami</Text>
            <TouchableOpacity onPress={() => { setManageSuppModal(false); openSupplementsModal(); }}>
              <Text style={styles.modalClose}>Wróć</Text>
            </TouchableOpacity>
          </View>
          {suppLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color="#16a34a" />
          ) : (
            <FlatList
              data={supplements}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <View style={styles.suppManageItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supplementName}>{item.name}</Text>
                    <Text style={styles.templateMeta}>{item.weight_grams}g · {item.nutrient_key}</Text>
                  </View>
                  <TouchableOpacity onPress={() => openEditSupp(item)} style={{ marginRight: 12 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 16 }}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteSupp(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={{ fontSize: 16 }}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListFooterComponent={
                <TouchableOpacity style={styles.addSuppBtn} onPress={() => openEditSupp(null)}>
                  <Text style={styles.addSuppBtnText}>+ Dodaj nowy suplement</Text>
                </TouchableOpacity>
              }
            />
          )}
        </View>
      </Modal>

      {/* Modal: edycja suplementu */}
      <Modal visible={editSuppModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editSupp ? 'Edytuj suplement' : 'Nowy suplement'}</Text>
            <TouchableOpacity onPress={() => { setEditSuppModal(false); setManageSuppModal(true); }}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Nazwa wyświetlana:</Text>
            <TextInput style={styles.searchInputPadded} value={editSuppName} onChangeText={setEditSuppName} placeholder="np. Witamina C" autoFocus />
            <Text style={styles.fieldLabel}>Klucz produktu z bazy (nutrient_key):</Text>
            <TextInput style={styles.searchInputPadded} value={editSuppKey} onChangeText={setEditSuppKey} placeholder="np. witamina_c" autoCapitalize="none" />
            <Text style={styles.fieldLabel}>Waga porcji (g):</Text>
            <TextInput style={styles.searchInputPadded} value={editSuppWeight} onChangeText={setEditSuppWeight} keyboardType="numeric" placeholder="np. 5" />
            <TouchableOpacity style={styles.btnBlock} onPress={handleSaveSupp}>
              <Text style={styles.btnPrimaryText}>Zapisz</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  subheading: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  hint: { fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 20 },
  textArea: { backgroundColor: '#fff', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#e5e7eb', minHeight: 120, marginBottom: 16 },
  itemCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemName: { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  changeBtn: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  changeBtnText: { fontSize: 12, color: '#374151' },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  weightInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 6, width: 70, textAlign: 'center', fontSize: 14 },
  weightUnit: { fontSize: 13, color: '#6b7280' },
  itemNutrients: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  itemNutrient: { fontSize: 12, color: '#6b7280', backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  btnFavorite: { backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#fde68a' },
  btnFavoriteText: { color: '#b45309', fontSize: 15, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  btnPrimary: { flex: 1, backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnBlock: { backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnBlockMargin: { margin: 16 },
  btnSecondary: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnSecondaryText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  btnSupplements: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe' },
  btnSupplementsText: { color: '#1d4ed8', fontSize: 16, fontWeight: '600' },
  modalContainer: { flex: 1, backgroundColor: '#f9fafb' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: '#111827' },
  modalClose: { fontSize: 16, color: '#6b7280' },
  modalBody: { padding: 16, gap: 8 },
  searchInputPadded: { backgroundColor: '#fff', borderRadius: 12, padding: 14, fontSize: 16, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 },
  searchResult: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  searchResultName: { fontSize: 15, color: '#111827', marginBottom: 2 },
  searchResultMeta: { fontSize: 12, color: '#9ca3af' },
  searchEmpty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14, lineHeight: 22 },
  templateItem: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center' },
  templateName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  templateMeta: { fontSize: 12, color: '#9ca3af' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f3f4f6', paddingHorizontal: 16, paddingVertical: 10 },
  sectionHeaderText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  sectionHeaderArrow: { fontSize: 16, color: '#9ca3af' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  categoryChipSelected: { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  categoryChipText: { fontSize: 14, color: '#374151' },
  categoryChipTextSelected: { color: '#15803d', fontWeight: '600' },
  fieldLabel: { fontSize: 14, color: '#374151', marginBottom: 4 },
  suppTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  supplementHint: { fontSize: 14, color: '#6b7280' },
  manageSuppBtn: { fontSize: 14, color: '#16a34a', fontWeight: '600' },
  supplementItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  supplementItemSelected: { backgroundColor: '#f0fdf4' },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checkboxSelected: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  checkboxTick: { color: '#fff', fontSize: 14, fontWeight: '700' },
  supplementName: { fontSize: 16, color: '#374151' },
  supplementNameSelected: { color: '#15803d', fontWeight: '600' },
  suppManageItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  addSuppBtn: { borderWidth: 1.5, borderColor: '#16a34a', borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center', margin: 16 },
  addSuppBtnText: { color: '#16a34a', fontSize: 15, fontWeight: '600' },
  btnAddProduct: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#bbf7d0' },
  btnAddProductText: { color: '#15803d', fontSize: 16, fontWeight: '600' },
  btnQuickAdd: { backgroundColor: '#fefce8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#fde68a' },
  btnQuickAddText: { color: '#a16207', fontSize: 16, fontWeight: '600' },
  quickSelectedName: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  quickSelectedMeta: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  quickItemsList: { backgroundColor: '#f0fdf4', margin: 16, borderRadius: 12, padding: 12 },
  quickItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  quickItemName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  quickItemMeta: { fontSize: 12, color: '#6b7280' },
  portionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  portionsBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%' },
  portionsTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4, textAlign: 'center' },
  portionsHint: { fontSize: 13, color: '#6b7280', marginBottom: 16, textAlign: 'center' },
  portionsInput: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', padding: 12, fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 16, color: '#111827' },
});
