import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Modal, FlatList
} from 'react-native';
import { router } from 'expo-router';
import { parseMealDescription } from '../lib/claude';
import { resolveMealItems } from '../lib/calculations';
import { searchFoodAll, searchFood, getFoodByKey, getFoodByKeyAll, calculateNutrients, isSupplementKey, setProductOverride, deleteProductOverride } from '../lib/nutrients';
import { useNutriStore } from '../store/useNutriStore';
import { MealItem } from '../types';
import { NUTRIENTS } from '../constants/nutrients';
import { supabase } from '../lib/supabase';

export default function AddMeal() {
  const TEMPLATE_CATEGORIES = [
    { key: 'sniadania', label: 'Śniadania' },
    { key: 'napoje', label: 'Napoje' },
    { key: 'obiady', label: 'Obiady' },
    { key: 'przekaski', label: 'Przekąski' },
    { key: 'dodatki', label: 'Dodatki' },
    { key: 'restauracja', label: 'Restauracja' },
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

  const [editServingModal, setEditServingModal] = useState(false);
  const [editServingProduct, setEditServingProduct] = useState<any | null>(null);
  const [editServingG, setEditServingG] = useState('');
  const [editServingNote, setEditServingNote] = useState('');

  const [templatesModal, setTemplatesModal] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    () => new Set(TEMPLATE_CATEGORIES.map(c => c.key))
  );

  const [portionsModal, setPortionsModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [portionsInput, setPortionsInput] = useState('1');
  const [portionsMode, setPortionsMode] = useState<'portions' | 'grams'>('portions');

  const [saveTemplateModal, setSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateCategory, setTemplateCategory] = useState('inne');

  const [changeCategoryModal, setChangeCategoryModal] = useState(false);
  const [changeCategoryTemplate, setChangeCategoryTemplate] = useState<any | null>(null);

  const [supplementsModal, setSupplementsModal] = useState(false);
  const [supplements, setSupplements] = useState<any[]>([]);
  const [suppLoading, setSuppLoading] = useState(false);
  const [selectedSupplements, setSelectedSupplements] = useState<Map<string, number>>(new Map());

  const [quickAddModal, setQuickAddModal] = useState(false);
  const [quickAddQuery, setQuickAddQuery] = useState('');
  const [quickAddResults, setQuickAddResults] = useState<any[]>([]);
  const [quickAddSelected, setQuickAddSelected] = useState<any | null>(null);
  const [quickAddWeight, setQuickAddWeight] = useState('');
  const [quickAddServingCount, setQuickAddServingCount] = useState<number | null>(null);
  const [quickAddItems, setQuickAddItems] = useState<{ result: any; weight: number; id: string }[]>([]);

  const [restaurantModal, setRestaurantModal] = useState(false);
  const [addExtraModal, setAddExtraModal] = useState(false);
  const [addExtraQuery, setAddExtraQuery] = useState('');
  const [addExtraResults, setAddExtraResults] = useState<any[]>([]);
  const [addExtraSelected, setAddExtraSelected] = useState<any | null>(null);
  const [addExtraWeight, setAddExtraWeight] = useState('');
  const [restMode, setRestMode] = useState<'choose' | 'manual' | 'ai'>('choose');
  const [restName, setRestName] = useState('');
  const [restWeight, setRestWeight] = useState('');
  const [restCalories, setRestCalories] = useState('');
  const [restProtein, setRestProtein] = useState('');
  const [restCarbs, setRestCarbs] = useState('');
  const [restFat, setRestFat] = useState('');
  const [restFiber, setRestFiber] = useState('');
  const [restSugar, setRestSugar] = useState('');
  const [restSodium, setRestSodium] = useState('');
  const [restDesc, setRestDesc] = useState('');

  const [manageSuppModal, setManageSuppModal] = useState(false);
  const [editSuppModal, setEditSuppModal] = useState(false);
  const [editSupp, setEditSupp] = useState<any | null>(null);
  const [editSuppName, setEditSuppName] = useState('');
  const [editSuppKey, setEditSuppKey] = useState('');
  const [editSuppWeight, setEditSuppWeight] = useState('');
  const [editSuppMode, setEditSuppMode] = useState<'simple' | 'composite'>('simple');
  const [editSuppItems, setEditSuppItems] = useState<{ id: string; nutrient_key: string; name: string; weight_grams: number }[]>([]);
  const [suppIngrQuery, setSuppIngrQuery] = useState('');
  const [suppIngrResults, setSuppIngrResults] = useState<any[]>([]);
  const [suppIngrSelected, setSuppIngrSelected] = useState<any | null>(null);
  const [suppIngrWeight, setSuppIngrWeight] = useState('');

  const { addMeal } = useNutriStore();

  const handleQuickSearch = async (q: string) => {
    setQuickAddQuery(q);
    if (q.trim().length < 2) { setQuickAddResults([]); return; }
    const results = await searchFoodAll(q);
    setQuickAddResults(results);
  };

  const selectQuickProduct = (result: any) => {
    setQuickAddSelected(result);
    const serving = result.item.serving_g;
    setQuickAddWeight(String(serving ?? 100));
    // Inicjalizuj licznik porcji tylko dla produktów z niestandardową porcją (≠ 100g)
    setQuickAddServingCount(serving && serving !== 100 ? 1 : null);
  };

  // Zmiana liczby porcji przez stepper (chip stays fixed at 1 portion)
  const changeServingCount = (delta: number) => {
    if (!quickAddSelected) return;
    const serving = quickAddSelected.item.serving_g;
    if (!serving) return;
    const current = quickAddServingCount ?? 1;
    const next = Math.max(1, current + delta);
    setQuickAddServingCount(next);
    setQuickAddWeight(String(next * serving));
  };

  // Ręczna edycja wagi → liczba porcji traci sens (chyba że dokładnie się zgadza)
  const onQuickWeightChange = (val: string) => {
    setQuickAddWeight(val);
    const w = parseFloat(val.replace(',', '.'));
    const serving = quickAddSelected?.item.serving_g;
    if (!isNaN(w) && serving && w % serving === 0) {
      setQuickAddServingCount(w / serving);
    } else {
      setQuickAddServingCount(null);
    }
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
    setQuickAddServingCount(null);
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

  const resetRestaurantModal = () => {
    setRestaurantModal(false);
    setRestMode('choose');
    setRestName(''); setRestWeight(''); setRestCalories(''); setRestProtein('');
    setRestCarbs(''); setRestFat(''); setRestFiber(''); setRestSugar('');
    setRestSodium(''); setRestDesc('');
  };

  const handleRestaurantManualSave = async () => {
    const name = restName.trim();
    if (!name) { Alert.alert('Błąd', 'Podaj nazwę dania.'); return; }
    const cal = parseFloat(restCalories.replace(',', '.'));
    if (isNaN(cal) || cal <= 0) { Alert.alert('Błąd', 'Podaj prawidłowe kalorie.'); return; }

    const nutrients: any = { calories: cal };
    const prot = parseFloat(restProtein.replace(',', '.'));
    if (!isNaN(prot)) nutrients.protein = prot;
    const carb = parseFloat(restCarbs.replace(',', '.'));
    if (!isNaN(carb)) nutrients.carbs = carb;
    const fat = parseFloat(restFat.replace(',', '.'));
    if (!isNaN(fat)) nutrients.fat = fat;
    const fib = parseFloat(restFiber.replace(',', '.'));
    if (!isNaN(fib)) nutrients.fiber = fib;
    const sug = parseFloat(restSugar.replace(',', '.'));
    if (!isNaN(sug)) nutrients.sugar_g = sug;
    const sod = parseFloat(restSodium.replace(',', '.'));
    if (!isNaN(sod)) nutrients.sodium_mg = sod;

    const w = parseFloat(restWeight.replace(',', '.'));
    const weight = !isNaN(w) && w > 0 ? w : 0;

    const mealItem: MealItem = {
      id: Math.random().toString(36).slice(2),
      name,
      weight_grams: weight,
      nutrients,
      confirmed: true,
    };

    setInput(name);
    setItems([mealItem]);
    setWeightInputs({ [mealItem.id]: String(weight) });
    setStep('confirm');
    resetRestaurantModal();
  };

  const handleRestaurantAI = async () => {
    const desc = restDesc.trim();
    if (!desc) { Alert.alert('Błąd', 'Opisz danie.'); return; }
    setIsLoading(true);
    try {
      const parsed = await parseMealDescription(desc);
      const resolved = await resolveMealItems(parsed);
      const weights: Record<string, string> = {};
      resolved.forEach(i => { weights[i.id] = String(i.weight_grams); });
      setInput(desc);
      setItems(resolved);
      setWeightInputs(weights);
      setStep('confirm');
      resetRestaurantModal();
    } catch {
      Alert.alert('Błąd', 'Nie udało się przeanalizować.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtraSearch = async (q: string) => {
    setAddExtraQuery(q);
    if (q.trim().length < 2) { setAddExtraResults([]); return; }
    const results = await searchFoodAll(q);
    setAddExtraResults(results);
  };

  const selectExtraProduct = (result: any) => {
    setAddExtraSelected(result);
    setAddExtraWeight(String(result.item.serving_g ?? 100));
  };

  const addExtraItem = () => {
    if (!addExtraSelected) return;
    const w = parseFloat(addExtraWeight.replace(',', '.'));
    if (isNaN(w) || w <= 0) { Alert.alert('Błąd', 'Podaj prawidłową wagę.'); return; }
    const newItem: MealItem = {
      id: Math.random().toString(36).slice(2),
      name: addExtraSelected.item.name_pl,
      weight_grams: w,
      nutrients: calculateNutrients(addExtraSelected.item.per_100g, w),
      confirmed: true,
      nutrient_key: addExtraSelected.key,
    };
    setItems(prev => [...prev, newItem]);
    setWeightInputs(prev => ({ ...prev, [newItem.id]: String(w) }));
    setAddExtraModal(false);
    setAddExtraSelected(null);
    setAddExtraQuery('');
    setAddExtraResults([]);
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    const { data } = await supabase.from('meal_templates').select('*').order('created_at', { ascending: false });
    if (data) {
      // Liczymy sumy makro dla każdego szablonu, żeby wyświetlić w liście.
      // Używamy resolveMealItems który obsługuje zarówno nutrient_key jak i custom_nutrients.
      const withTotals = await Promise.all(data.map(async (tpl: any) => {
        try {
          const resolved = await resolveMealItems(tpl.items || []);
          const totals = resolved.reduce((acc, i) => {
            acc.calories += i.nutrients.calories ?? 0;
            acc.protein += i.nutrients.protein ?? 0;
            acc.fat += i.nutrients.fat ?? 0;
            acc.carbs += i.nutrients.carbs ?? 0;
            acc.fiber += i.nutrients.fiber ?? 0;
            acc.sugar_g += i.nutrients.sugar_g ?? 0;
            return acc;
          }, { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0, sugar_g: 0 });
          return { ...tpl, _totals: totals };
        } catch {
          return { ...tpl, _totals: null };
        }
      }));
      setTemplates(withTotals);
    }
    setTemplatesLoading(false);
  };

  const loadSupplements = async () => {
    setSuppLoading(true);
    const { data } = await supabase.from('supplements').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('created_at');
    if (data) setSupplements(data);
    setSuppLoading(false);
  };

  const moveSupp = async (suppId: string, direction: 'up' | 'down') => {
    const idx = supplements.findIndex(s => s.id === suppId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= supplements.length) return;
    const reordered = [...supplements];
    [reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]];
    // Optymistyczna aktualizacja UI
    setSupplements(reordered);
    // Zapisz nowe sort_order dla wszystkich (proste i niezawodne)
    const updates = reordered.map((s, i) => supabase.from('supplements').update({ sort_order: i }).eq('id', s.id));
    await Promise.all(updates);
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
    setPortionsMode('portions');
    setTemplatesModal(false);
    setPortionsModal(true);
  };

  const getTemplateTotalWeight = (template: any): number => {
    if (!template?.items) return 0;
    return template.items.reduce((sum: number, it: any) => sum + (it.weight_grams ?? 0), 0);
  };

  const handleLoadTemplate = async (template: any, portions: number) => {
    setPortionsModal(false);
    setIsLoading(true);
    try {
      const itemsWithPortions = template.items.map((item: any) => {
        // Custom_nutrients (np. dania restauracyjne) skalują się proporcjonalnie
        // do liczby porcji, podobnie jak weight_grams.
        let scaledCustom: any = undefined;
        if (item.custom_nutrients) {
          scaledCustom = {};
          for (const [k, v] of Object.entries(item.custom_nutrients)) {
            if (typeof v === 'number') scaledCustom[k] = v * portions;
          }
        }
        return {
          ...item,
          weight_grams: (item.weight_grams ?? 0) * portions,
          custom_nutrients: scaledCustom,
        };
      });
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

  const openChangeCategoryModal = (item: any) => {
    setChangeCategoryTemplate(item);
    setChangeCategoryModal(true);
  };

  const handleChangeCategory = async (newCategory: string) => {
    if (!changeCategoryTemplate) return;
    await supabase.from('meal_templates').update({ category: newCategory }).eq('id', changeCategoryTemplate.id);
    setTemplates(prev => prev.map(t => t.id === changeCategoryTemplate.id ? { ...t, category: newCategory } : t));
    setChangeCategoryModal(false);
    setChangeCategoryTemplate(null);
  };

  const handleSaveTemplate = async () => {
    const name = templateName.trim() || input.trim();
    if (!name) { Alert.alert('Błąd', 'Podaj nazwę ulubionego posiłku.'); return; }
    const templateItems = items.map(item => ({
      name: item.nutrient_key ?? item.name,
      weight_grams: item.weight_grams,
      nutrient_key: item.nutrient_key,
      // Dla itemów bez nutrient_key (np. ręcznie wpisane danie z restauracji)
      // zapisujemy wartości odżywcze wprost — inaczej przepadną przy ładowaniu szablonu.
      custom_nutrients: !item.nutrient_key ? item.nutrients : undefined,
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
    if (supp?.items && Array.isArray(supp.items) && supp.items.length > 0) {
      setEditSuppMode('composite');
      setEditSuppItems(supp.items.map((it: any) => ({
        id: Math.random().toString(36).slice(2),
        nutrient_key: it.nutrient_key,
        name: it.name ?? it.nutrient_key,
        weight_grams: it.weight_grams,
      })));
      setEditSuppKey('');
      setEditSuppWeight('');
    } else {
      setEditSuppMode('simple');
      setEditSuppItems([]);
      setEditSuppKey(supp?.nutrient_key ?? '');
      setEditSuppWeight(supp ? String(supp.weight_grams) : '');
    }
    setSuppIngrQuery('');
    setSuppIngrResults([]);
    setSuppIngrSelected(null);
    setSuppIngrWeight('');
    setManageSuppModal(false);
    setEditSuppModal(true);
  };

  const handleSaveSupp = async () => {
    const name = editSuppName.trim();
    if (!name) { Alert.alert('Błąd', 'Podaj nazwę.'); return; }

    if (editSuppMode === 'composite') {
      if (editSuppItems.length === 0) {
        Alert.alert('Błąd', 'Dodaj przynajmniej jeden składnik.');
        return;
      }
      const itemsPayload = editSuppItems.map(it => ({
        nutrient_key: it.nutrient_key,
        name: it.name,
        weight_grams: it.weight_grams,
      }));
      // Dla zachowania wstecznej kompatybilności zapisujemy też nutrient_key i weight_grams
      // jako pierwszy składnik (gdyby coś poszło nie tak z items, fallback zadziała).
      const fallbackKey = itemsPayload[0].nutrient_key;
      const fallbackWeight = itemsPayload[0].weight_grams;
      if (editSupp) {
        await supabase.from('supplements').update({
          name, nutrient_key: fallbackKey, weight_grams: fallbackWeight, items: itemsPayload,
        }).eq('id', editSupp.id);
      } else {
        await supabase.from('supplements').insert({
          name, nutrient_key: fallbackKey, weight_grams: fallbackWeight, items: itemsPayload,
        });
      }
    } else {
      const key = editSuppKey.trim();
      const w = parseFloat(editSuppWeight);
      if (!key || isNaN(w) || w <= 0) {
        Alert.alert('Błąd', 'Wypełnij wszystkie pola poprawnie.');
        return;
      }
      if (editSupp) {
        await supabase.from('supplements').update({ name, nutrient_key: key, weight_grams: w, items: null }).eq('id', editSupp.id);
      } else {
        await supabase.from('supplements').insert({ name, nutrient_key: key, weight_grams: w });
      }
    }
    setEditSuppModal(false);
    await loadSupplements();
    setManageSuppModal(true);
  };

  // Wyszukiwanie składnika dla suplementu kompozytowego
  useEffect(() => {
    const q = suppIngrQuery.trim();
    if (q.length < 2) { setSuppIngrResults([]); return; }
    let cancelled = false;
    (async () => {
      const results = await searchFoodAll(q);
      if (!cancelled) setSuppIngrResults(results);
    })();
    return () => { cancelled = true; };
  }, [suppIngrQuery]);

  const handleAddSuppIngredient = () => {
    if (!suppIngrSelected) { Alert.alert('Błąd', 'Wybierz produkt.'); return; }
    const w = parseFloat(suppIngrWeight);
    if (isNaN(w) || w <= 0) { Alert.alert('Błąd', 'Podaj poprawną wagę.'); return; }
    setEditSuppItems(prev => [...prev, {
      id: Math.random().toString(36).slice(2),
      nutrient_key: suppIngrSelected.key,
      name: suppIngrSelected.item.name_pl,
      weight_grams: w,
    }]);
    setSuppIngrQuery('');
    setSuppIngrResults([]);
    setSuppIngrSelected(null);
    setSuppIngrWeight('');
  };

  const handleRemoveSuppIngredient = (id: string) => {
    setEditSuppItems(prev => prev.filter(it => it.id !== id));
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
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, 1);
      return next;
    });
  };

  const changeSuppPortions = (id: string, delta: number) => {
    setSelectedSupplements(prev => {
      const next = new Map(prev);
      const current = next.get(id) ?? 1;
      const updated = current + delta;
      if (updated < 1) return next; // minimum 1 porcja
      if (updated > 99) return next;
      next.set(id, updated);
      return next;
    });
  };

  const handleSaveSupplements = async () => {
    if (selectedSupplements.size === 0) { setSupplementsModal(false); return; }
    setIsLoading(true);
    try {
      const mealItems: MealItem[] = [];
      for (const [suppId, portions] of selectedSupplements) {
        const supp = supplements.find((s: any) => s.id === suppId);
        if (!supp) continue;
        const portionsCount = portions || 1;

        // Suplement kompozytowy — dodaj każdy składnik osobno
        if (supp.items && Array.isArray(supp.items) && supp.items.length > 0) {
          for (const ingr of supp.items) {
            const foodItem = await getFoodByKeyAll(ingr.nutrient_key);
            if (!foodItem) continue;
            const totalWeight = ingr.weight_grams * portionsCount;
            const nutrients = calculateNutrients(foodItem.per_100g, totalWeight);
            mealItems.push({
              id: Math.random().toString(36).slice(2),
              name: portionsCount > 1 ? `${ingr.name ?? foodItem.name_pl} (×${portionsCount})` : (ingr.name ?? foodItem.name_pl),
              weight_grams: totalWeight,
              nutrients,
              confirmed: true,
              nutrient_key: ingr.nutrient_key,
            });
          }
        } else {
          // Suplement prosty
          const foodItem = getFoodByKey(supp.nutrient_key);
          if (!foodItem) continue;
          const totalWeight = supp.weight_grams * portionsCount;
          const nutrients = calculateNutrients(foodItem.per_100g, totalWeight);
          mealItems.push({
            id: Math.random().toString(36).slice(2),
            name: portionsCount > 1 ? `${supp.name} (×${portionsCount})` : supp.name,
            weight_grams: totalWeight,
            nutrients,
            confirmed: true,
            nutrient_key: supp.nutrient_key,
          });
        }
      }
      const label = Array.from(selectedSupplements.entries())
        .map(([id, portions]) => {
          const supp = supplements.find((s: any) => s.id === id);
          if (!supp) return null;
          return portions > 1 ? `${supp.name} ×${portions}` : supp.name;
        })
        .filter(Boolean)
        .join(', ');
      await addMeal('Suplementy: ' + label, mealItems);
      setSelectedSupplements(new Map());
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
      // Odśwież listę wyników
      const refreshed = await searchFoodAll(searchQuery || quickAddQuery);
      if (searchQuery) setSearchResults(refreshed);
      if (quickAddQuery) setQuickAddResults(refreshed);
      setEditServingModal(false);
      setEditServingProduct(null);
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać porcji.');
    }
  };

  const handleResetServing = async () => {
    if (!editServingProduct) return;
    Alert.alert('Reset porcji', 'Przywrócić domyślną porcję?', [
      { text: 'Anuluj', style: 'cancel' },
      {
        text: 'Reset', style: 'destructive', onPress: async () => {
          await deleteProductOverride(editServingProduct.key);
          const refreshed = await searchFoodAll(searchQuery || quickAddQuery);
          if (searchQuery) setSearchResults(refreshed);
          if (quickAddQuery) setQuickAddResults(refreshed);
          setEditServingModal(false);
          setEditServingProduct(null);
        }
      }
    ]);
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
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={styles.changeBtn} onPress={() => openSearch(item.id, item.name)}>
                  <Text style={styles.changeBtnText}>zmień</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.changeBtn} onPress={() => {
                  setItems(prev => prev.filter(i => i.id !== item.id));
                  setWeightInputs(prev => { const next = { ...prev }; delete next[item.id]; return next; });
                }}>
                  <Text style={[styles.changeBtnText, { color: '#ef4444' }]}>usuń</Text>
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
            <View style={styles.itemNutrients}>
              {(['calories', 'protein', 'fat', 'carbs'] as const).map(key => (
                <Text key={key} style={styles.itemNutrient}>
                  {NUTRIENTS[key].label}: {Math.round((item.nutrients as any)[key] ?? 0)}{NUTRIENTS[key].unit}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.btnAddExtra} onPress={() => setAddExtraModal(true)}>
          <Text style={styles.btnAddExtraText}>➕ Dodaj składnik</Text>
        </TouchableOpacity>

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

        {/* Modal: dodaj extra składnik */}
        <Modal visible={addExtraModal} animationType="slide" presentationStyle="pageSheet">
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Dodaj składnik</Text>
              <TouchableOpacity onPress={() => { setAddExtraModal(false); setAddExtraSelected(null); setAddExtraQuery(''); setAddExtraResults([]); }}>
                <Text style={styles.modalClose}>Anuluj</Text>
              </TouchableOpacity>
            </View>
            {addExtraSelected ? (
              <View style={styles.modalBody}>
                <Text style={styles.quickSelectedName}>{addExtraSelected.item.name_pl}</Text>
                <Text style={styles.quickSelectedMeta}>
                  {Math.round(addExtraSelected.item.per_100g.calories ?? 0)} kcal · {Math.round(addExtraSelected.item.per_100g.protein ?? 0)}g B · {Math.round(addExtraSelected.item.per_100g.fat ?? 0)}g T · {Math.round(addExtraSelected.item.per_100g.carbs ?? 0)}g W / 100g
                </Text>
                <Text style={styles.fieldLabel}>Waga (g):</Text>
                <TextInput style={styles.searchInputPadded} value={addExtraWeight} onChangeText={setAddExtraWeight} keyboardType="numeric" selectTextOnFocus autoFocus />
                <View style={styles.buttonRow}>
                  <TouchableOpacity style={styles.btnSecondary} onPress={() => { setAddExtraSelected(null); setAddExtraQuery(''); }}>
                    <Text style={styles.btnSecondaryText}>Wróć</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnPrimary} onPress={addExtraItem}>
                    <Text style={styles.btnPrimaryText}>Dodaj</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <TextInput
                  value={addExtraQuery}
                  onChangeText={handleExtraSearch}
                  placeholder="Szukaj produktu..."
                  autoFocus
                  style={[styles.searchInputPadded, { margin: 16, marginBottom: 8 }]}
                />
                <FlatList
                  data={addExtraResults}
                  keyExtractor={item => item.key}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.searchResult} onPress={() => selectExtraProduct(item)}>
                      <Text style={styles.searchResultName}>{item.item.name_pl}</Text>
                      <Text style={styles.searchResultMeta}>{Math.round(item.item.per_100g.calories ?? 0)} kcal / 100g · {item.score}%</Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={<Text style={styles.searchEmpty}>{addExtraQuery.length >= 2 ? 'Brak wyników.' : 'Wpisz min. 2 znaki.'}</Text>}
                />
              </>
            )}
          </View>
        </Modal>

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
                <View style={styles.searchResultRow}>
                  <TouchableOpacity style={styles.searchResultMain} onPress={() => selectFood(item)}>
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
        <TouchableOpacity style={styles.btnSecondary} onPress={() => {
          loadTemplates();
          setCollapsedSections(new Set(TEMPLATE_CATEGORIES.map(c => c.key)));
          setTemplatesModal(true);
        }}>
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

      <TouchableOpacity style={styles.btnRestaurant} onPress={() => setRestaurantModal(true)}>
        <Text style={styles.btnRestaurantText}>🍽 Posiłek z restauracji</Text>
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
                            {item._totals && (
                              <Text style={styles.templateMacros}>
                                {Math.round(item._totals.calories)} kcal · B {Math.round(item._totals.protein)}g · T {Math.round(item._totals.fat)}g · W {Math.round(item._totals.carbs)}g · Bł {Math.round(item._totals.fiber)}g · C {Math.round(item._totals.sugar_g)}g
                              </Text>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => openChangeCategoryModal(item)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            style={{ marginRight: 12 }}
                          >
                            <Text style={{ fontSize: 16 }}>📁</Text>
                          </TouchableOpacity>
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


      {/* Modal: zmiana kategorii ulubionego */}
      <Modal visible={changeCategoryModal} animationType="fade" transparent onRequestClose={() => setChangeCategoryModal(false)}>
        <View style={styles.portionsOverlay}>
          <View style={styles.portionsBox}>
            <Text style={styles.portionsTitle}>{changeCategoryTemplate?.name}</Text>
            <Text style={[styles.portionsHint, { marginBottom: 12 }]}>Wybierz kategorię:</Text>
            {TEMPLATE_CATEGORIES.map(cat => {
              const isCurrent = (changeCategoryTemplate?.category || 'inne') === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.categoryChip, isCurrent && styles.categoryChipSelected, { marginBottom: 8, width: '100%', justifyContent: 'center' }]}
                  onPress={() => handleChangeCategory(cat.key)}
                >
                  <Text style={[styles.categoryChipText, isCurrent && styles.categoryChipTextSelected]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={[styles.btnSecondary, { marginTop: 8 }]} onPress={() => setChangeCategoryModal(false)}>
              <Text style={styles.btnSecondaryText}>Anuluj</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal: wybór porcji */}
      <Modal visible={portionsModal} animationType="fade" transparent>
        <View style={styles.portionsOverlay}>
          <View style={styles.portionsBox}>
            <Text style={styles.portionsTitle}>{selectedTemplate?.name}</Text>
            {(() => {
              const totalW = getTemplateTotalWeight(selectedTemplate);
              return totalW > 0 ? (
                <Text style={[styles.portionsHint, { fontSize: 12, marginBottom: 8 }]}>
                  1 porcja = {Math.round(totalW)}g
                </Text>
              ) : null;
            })()}

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.categoryChip, portionsMode === 'portions' && styles.categoryChipSelected, { flex: 1, justifyContent: 'center' }]}
                onPress={() => { setPortionsMode('portions'); setPortionsInput('1'); }}
              >
                <Text style={[styles.categoryChipText, portionsMode === 'portions' && styles.categoryChipTextSelected]}>Porcje</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.categoryChip, portionsMode === 'grams' && styles.categoryChipSelected, { flex: 1, justifyContent: 'center' }]}
                onPress={() => {
                  setPortionsMode('grams');
                  const totalW = getTemplateTotalWeight(selectedTemplate);
                  setPortionsInput(totalW > 0 ? String(Math.round(totalW)) : '');
                }}
                disabled={getTemplateTotalWeight(selectedTemplate) === 0}
              >
                <Text style={[styles.categoryChipText, portionsMode === 'grams' && styles.categoryChipTextSelected]}>Gramy</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.portionsHint}>{portionsMode === 'portions' ? 'Ile porcji?' : 'Ile gramów?'}</Text>
            <View style={styles.portionsStepperRow}>
              <TouchableOpacity
                style={styles.portionsStepperBtn}
                onPress={() => {
                  const current = parseFloat(portionsInput.replace(',', '.')) || 0;
                  const step = portionsMode === 'portions' ? 0.5 : 10;
                  const min = portionsMode === 'portions' ? 0.1 : 5;
                  const next = Math.max(min, Math.round((current - step) * 100) / 100);
                  setPortionsInput(String(next));
                }}
              >
                <Text style={styles.portionsStepperBtnText}>−</Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.portionsInput, { flex: 1, marginBottom: 0 }]}
                value={portionsInput}
                onChangeText={setPortionsInput}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
              />
              <TouchableOpacity
                style={styles.portionsStepperBtn}
                onPress={() => {
                  const current = parseFloat(portionsInput.replace(',', '.')) || 0;
                  const step = portionsMode === 'portions' ? 0.5 : 10;
                  const next = Math.round((current + step) * 100) / 100;
                  setPortionsInput(String(next));
                }}
              >
                <Text style={styles.portionsStepperBtnText}>+</Text>
              </TouchableOpacity>
            </View>
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
                  const value = parseFloat(portionsInput.replace(',', '.'));
                  if (isNaN(value) || value <= 0) { Alert.alert('Błąd', 'Podaj liczbę większą od 0.'); return; }
                  let portions = value;
                  if (portionsMode === 'grams') {
                    const totalW = getTemplateTotalWeight(selectedTemplate);
                    if (totalW <= 0) { Alert.alert('Błąd', 'Ten szablon nie ma wagi - użyj trybu Porcje.'); return; }
                    portions = value / totalW;
                  }
                  setPortionsInput('1');
                  handleLoadTemplate(selectedTemplate, portions);
                }}
              >
                <Text style={styles.btnPrimaryText}>Załaduj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Modal: posiłek z restauracji */}
      <Modal visible={restaurantModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Posiłek z restauracji</Text>
            <TouchableOpacity onPress={resetRestaurantModal}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>

          {restMode === 'choose' ? (
            <View style={styles.modalBody}>
              <Text style={styles.restModeHint}>Jak chcesz dodać danie?</Text>
              <TouchableOpacity style={styles.restModeBtn} onPress={() => setRestMode('manual')}>
                <Text style={styles.restModeBtnTitle}>Wpisz wartości ręcznie</Text>
                <Text style={styles.restModeBtnDesc}>Masz tabelę odżywczą z restauracji</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.restModeBtn} onPress={() => setRestMode('ai')}>
                <Text style={styles.restModeBtnTitle}>Oszacuj przez AI</Text>
                <Text style={styles.restModeBtnDesc}>Opisz danie i składniki, Claude oszacuje wartości</Text>
              </TouchableOpacity>
            </View>
          ) : restMode === 'manual' ? (
            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Nazwa dania *</Text>
              <TextInput style={styles.searchInputPadded} value={restName} onChangeText={setRestName} placeholder="np. Burger wołowy" autoFocus />

              <Text style={styles.fieldLabel}>Waga porcji (g) — opcjonalnie</Text>
              <TextInput style={styles.searchInputPadded} value={restWeight} onChangeText={setRestWeight} keyboardType="numeric" placeholder="np. 350" />

              <Text style={styles.fieldLabel}>Kalorie (kcal) *</Text>
              <TextInput style={styles.searchInputPadded} value={restCalories} onChangeText={setRestCalories} keyboardType="numeric" placeholder="np. 650" />

              <View style={styles.restRow}>
                <View style={styles.restField}>
                  <Text style={styles.fieldLabel}>Białko (g)</Text>
                  <TextInput style={styles.searchInputPadded} value={restProtein} onChangeText={setRestProtein} keyboardType="numeric" placeholder="0" />
                </View>
                <View style={styles.restField}>
                  <Text style={styles.fieldLabel}>Węgle (g)</Text>
                  <TextInput style={styles.searchInputPadded} value={restCarbs} onChangeText={setRestCarbs} keyboardType="numeric" placeholder="0" />
                </View>
                <View style={styles.restField}>
                  <Text style={styles.fieldLabel}>Tłuszcz (g)</Text>
                  <TextInput style={styles.searchInputPadded} value={restFat} onChangeText={setRestFat} keyboardType="numeric" placeholder="0" />
                </View>
              </View>

              <View style={styles.restRow}>
                <View style={styles.restField}>
                  <Text style={styles.fieldLabel}>Błonnik (g)</Text>
                  <TextInput style={styles.searchInputPadded} value={restFiber} onChangeText={setRestFiber} keyboardType="numeric" placeholder="0" />
                </View>
                <View style={styles.restField}>
                  <Text style={styles.fieldLabel}>Cukry (g)</Text>
                  <TextInput style={styles.searchInputPadded} value={restSugar} onChangeText={setRestSugar} keyboardType="numeric" placeholder="0" />
                </View>
                <View style={styles.restField}>
                  <Text style={styles.fieldLabel}>Sód (mg)</Text>
                  <TextInput style={styles.searchInputPadded} value={restSodium} onChangeText={setRestSodium} keyboardType="numeric" placeholder="0" />
                </View>
              </View>

              <TouchableOpacity style={[styles.btnBlock, styles.btnBlockMargin, isLoading && styles.btnDisabled]} onPress={handleRestaurantManualSave} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz</Text>}
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={styles.modalBody}>
              <Text style={styles.fieldLabel}>Opisz danie i składniki</Text>
              <TextInput
                style={[styles.textArea, { marginBottom: 16 }]}
                value={restDesc}
                onChangeText={setRestDesc}
                placeholder="np. Burger wołowy 200g, bułka, sałata, pomidor, sos, frytki 150g"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                autoFocus
              />
              <TouchableOpacity style={[styles.btnBlock, isLoading && styles.btnDisabled]} onPress={handleRestaurantAI} disabled={isLoading}>
                {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Analizuj przez AI</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Modal: szybkie dodanie z bazy */}
      <Modal visible={quickAddModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Szybkie dodanie</Text>
            <TouchableOpacity onPress={() => { setQuickAddModal(false); setQuickAddSelected(null); setQuickAddQuery(''); setQuickAddResults([]); setQuickAddItems([]); setQuickAddServingCount(null); }}>
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
                onChangeText={onQuickWeightChange}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
              />
              {quickAddSelected.item.serving_g && quickAddSelected.item.serving_g !== 100 ? (
                <View style={styles.servingRow}>
                  <TouchableOpacity
                    style={[styles.servingHint, styles.servingHintInRow]}
                    onPress={() => {
                      setQuickAddWeight(String(quickAddSelected.item.serving_g));
                      setQuickAddServingCount(1);
                    }}
                  >
                    <Text style={styles.servingHintText}>
                      🍽️ {quickAddSelected.item.serving_note ?? '1 porcja'} = {quickAddSelected.item.serving_g}g
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => changeServingCount(-1)}
                      disabled={(quickAddServingCount ?? 0) <= 1}
                    >
                      <Text style={[styles.stepperBtnText, (quickAddServingCount ?? 0) <= 1 && styles.stepperBtnDisabled]}>−</Text>
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{quickAddServingCount ?? '—'}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => changeServingCount(1)}
                    >
                      <Text style={styles.stepperBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : quickAddSelected.item.serving_g === 100 ? (
                <TouchableOpacity
                  style={styles.servingHint}
                  onPress={() => setQuickAddWeight('100')}
                >
                  <Text style={styles.servingHintText}>
                    🍽️ {quickAddSelected.item.serving_note ?? '1 porcja'} = 100g
                  </Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.btnSecondary} onPress={() => { setQuickAddSelected(null); setQuickAddQuery(''); setQuickAddServingCount(null); }}>
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
                  <View style={styles.searchResultRow}>
                    <TouchableOpacity style={styles.searchResultMain} onPress={() => selectQuickProduct(item)}>
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
            <TouchableOpacity onPress={() => { setSupplementsModal(false); setSelectedSupplements(new Map()); }}>
              <Text style={styles.modalClose}>Anuluj</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.suppTopRow}>
            <Text style={styles.supplementHint}>Zaznacz co dzisiaj wzięłaś:</Text>
            <TouchableOpacity onPress={openManageSupplements}>
              <Text style={styles.manageSuppBtn}>Zarządzaj</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {suppLoading ? (
            <ActivityIndicator style={{ marginTop: 20 }} color="#16a34a" />
          ) : (
            supplements.map((supp: any) => {
              const portions = selectedSupplements.get(supp.id);
              const selected = portions !== undefined;
              return (
                <View
                  key={supp.id}
                  style={[styles.supplementItem, selected && styles.supplementItemSelected]}
                >
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}
                    onPress={() => toggleSupplement(supp.id)}
                  >
                    <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                      {selected && <Text style={styles.checkboxTick}>✓</Text>}
                    </View>
                    <Text style={[styles.supplementName, selected && styles.supplementNameSelected]}>{supp.name}</Text>
                  </TouchableOpacity>
                  {selected && (
                    <View style={styles.portionsControl}>
                      <TouchableOpacity
                        style={styles.portionsBtn}
                        onPress={() => changeSuppPortions(supp.id, -1)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.portionsBtnText}>−</Text>
                      </TouchableOpacity>
                      <Text style={styles.portionsCount}>{portions}</Text>
                      <TouchableOpacity
                        style={styles.portionsBtn}
                        onPress={() => changeSuppPortions(supp.id, 1)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.portionsBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
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
          </ScrollView>
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
              renderItem={({ item, index }) => (
                <View style={styles.suppManageItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.supplementName}>{item.name}</Text>
                    <Text style={styles.templateMeta}>
                      {item.items && Array.isArray(item.items) && item.items.length > 0
                        ? `${item.items.length} składnik${item.items.length === 1 ? '' : item.items.length < 5 ? 'i' : 'ów'}`
                        : `${item.weight_grams}g · ${item.nutrient_key}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => moveSupp(item.id, 'up')}
                    disabled={index === 0}
                    style={{ marginRight: 8, opacity: index === 0 ? 0.3 : 1 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 18 }}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveSupp(item.id, 'down')}
                    disabled={index === supplements.length - 1}
                    style={{ marginRight: 12, opacity: index === supplements.length - 1 ? 0.3 : 1 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={{ fontSize: 18 }}>↓</Text>
                  </TouchableOpacity>
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

            <TouchableOpacity style={[styles.btnBlock, { marginTop: 16 }]} onPress={handleSaveServing}>
              <Text style={styles.btnPrimaryText}>Zapisz</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btnSecondary, { marginTop: 8 }]} onPress={handleResetServing}>
              <Text style={styles.btnSecondaryText}>Reset do domyślnej</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => setEditServingModal(false)}>
              <Text style={{ color: '#6b7280', fontSize: 14 }}>Anuluj</Text>
            </TouchableOpacity>
          </View>
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
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Nazwa wyświetlana:</Text>
            <TextInput style={styles.searchInputPadded} value={editSuppName} onChangeText={setEditSuppName} placeholder="np. Witamina C" />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12 }}>
              <TouchableOpacity
                style={[styles.categoryChip, editSuppMode === 'simple' && styles.categoryChipSelected, { flex: 1, justifyContent: 'center' }]}
                onPress={() => setEditSuppMode('simple')}
              >
                <Text style={[styles.categoryChipText, editSuppMode === 'simple' && styles.categoryChipTextSelected]}>Pojedynczy produkt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.categoryChip, editSuppMode === 'composite' && styles.categoryChipSelected, { flex: 1, justifyContent: 'center' }]}
                onPress={() => setEditSuppMode('composite')}
              >
                <Text style={[styles.categoryChipText, editSuppMode === 'composite' && styles.categoryChipTextSelected]}>Kilka składników</Text>
              </TouchableOpacity>
            </View>

            {editSuppMode === 'simple' ? (
              <>
                <Text style={styles.fieldLabel}>Klucz produktu z bazy (nutrient_key):</Text>
                <TextInput style={styles.searchInputPadded} value={editSuppKey} onChangeText={setEditSuppKey} placeholder="np. witamina_c" autoCapitalize="none" />
                <Text style={styles.fieldLabel}>Waga porcji (g):</Text>
                <TextInput style={styles.searchInputPadded} value={editSuppWeight} onChangeText={setEditSuppWeight} keyboardType="numeric" placeholder="np. 5" />
              </>
            ) : (
              <>
                <Text style={styles.fieldLabel}>Składniki:</Text>
                {editSuppItems.length === 0 ? (
                  <Text style={[styles.searchEmpty, { marginVertical: 8 }]}>Brak składników. Dodaj pierwszy poniżej.</Text>
                ) : (
                  editSuppItems.map(it => (
                    <View key={it.id} style={styles.suppManageItem}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.supplementName}>{it.name}</Text>
                        <Text style={styles.templateMeta}>{it.weight_grams}g · {it.nutrient_key}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleRemoveSuppIngredient(it.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={{ fontSize: 16 }}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  ))
                )}

                <View style={{ marginTop: 16, padding: 12, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
                  <Text style={[styles.fieldLabel, { marginTop: 0 }]}>Dodaj składnik:</Text>
                  {suppIngrSelected ? (
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={[styles.supplementName, { flex: 1 }]}>{suppIngrSelected.item.name_pl}</Text>
                        <TouchableOpacity onPress={() => { setSuppIngrSelected(null); setSuppIngrWeight(''); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={{ fontSize: 14, color: '#6b7280' }}>Zmień</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput
                        style={styles.searchInputPadded}
                        value={suppIngrWeight}
                        onChangeText={setSuppIngrWeight}
                        keyboardType="numeric"
                        placeholder="Waga w gramach"
                      />
                      <TouchableOpacity style={[styles.btnBlock, { marginTop: 8 }]} onPress={handleAddSuppIngredient}>
                        <Text style={styles.btnPrimaryText}>Dodaj składnik</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <TextInput
                        style={styles.searchInputPadded}
                        value={suppIngrQuery}
                        onChangeText={setSuppIngrQuery}
                        placeholder="Szukaj produktu..."
                        autoCapitalize="none"
                      />
                      {suppIngrResults.length > 0 && (
                        <View style={{ marginTop: 8, maxHeight: 220, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb' }}>
                          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                            {suppIngrResults.slice(0, 8).map((r: any) => (
                              <TouchableOpacity
                                key={r.key}
                                style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                                onPress={() => { setSuppIngrSelected(r); setSuppIngrQuery(''); setSuppIngrResults([]); }}
                              >
                                <Text style={{ fontSize: 14, color: '#111827' }}>{r.item.name_pl}</Text>
                                <Text style={{ fontSize: 12, color: '#6b7280' }}>{r.key}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </>
            )}

            <TouchableOpacity style={[styles.btnBlock, { marginTop: 16, marginBottom: 24 }]} onPress={handleSaveSupp}>
              <Text style={styles.btnPrimaryText}>Zapisz</Text>
            </TouchableOpacity>
          </ScrollView>
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
  btnAddExtra: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#bfdbfe' },
  btnAddExtraText: { color: '#1d4ed8', fontSize: 15, fontWeight: '600' },
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
  searchResultRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  searchResultMain: { flex: 1, padding: 16 },
  searchResultEdit: { padding: 16 },
  searchResultName: { fontSize: 15, color: '#111827', marginBottom: 2 },
  searchResultMeta: { fontSize: 12, color: '#9ca3af' },
  searchEmpty: { textAlign: 'center', color: '#9ca3af', marginTop: 40, fontSize: 14, lineHeight: 22 },
  templateItem: { backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', flexDirection: 'row', alignItems: 'center' },
  templateName: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 2 },
  templateMeta: { fontSize: 12, color: '#9ca3af' },
  templateMacros: { fontSize: 12, fontWeight: '500', color: '#15803d', marginTop: 4 },
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
  portionsControl: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  portionsBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  portionsBtnText: { fontSize: 18, fontWeight: '600', color: '#111827' },
  portionsCount: { fontSize: 16, fontWeight: '600', color: '#111827', minWidth: 20, textAlign: 'center' },
  supplementNameSelected: { color: '#15803d', fontWeight: '600' },
  suppManageItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  addSuppBtn: { borderWidth: 1.5, borderColor: '#16a34a', borderStyle: 'dashed', borderRadius: 12, padding: 14, alignItems: 'center', margin: 16 },
  addSuppBtnText: { color: '#16a34a', fontSize: 15, fontWeight: '600' },
  btnAddProduct: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#bbf7d0' },
  btnAddProductText: { color: '#15803d', fontSize: 16, fontWeight: '600' },
  btnQuickAdd: { backgroundColor: '#fefce8', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#fde68a' },
  btnQuickAddText: { color: '#a16207', fontSize: 16, fontWeight: '600' },
  btnRestaurant: { backgroundColor: '#fef2f2', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 10, borderWidth: 1, borderColor: '#fecaca' },
  btnRestaurantText: { color: '#b91c1c', fontSize: 16, fontWeight: '600' },
  restModeHint: { fontSize: 15, color: '#6b7280', marginBottom: 16 },
  restModeBtn: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e5e7eb' },
  restModeBtnTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  restModeBtnDesc: { fontSize: 13, color: '#6b7280' },
  restRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  restField: { flex: 1 },
  quickSelectedName: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 },
  quickSelectedMeta: { fontSize: 13, color: '#6b7280', marginBottom: 16 },
  servingHint: { backgroundColor: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 8, alignItems: 'center', borderWidth: 1, borderColor: '#bbf7d0' },
  servingHintInRow: { flex: 1, marginTop: 0, padding: 10 },
  servingHintText: { fontSize: 14, color: '#15803d', fontWeight: '600' },
  servingRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1, borderColor: '#bbf7d0', paddingHorizontal: 4 },
  stepperBtn: { paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
  stepperBtnText: { fontSize: 22, color: '#15803d', fontWeight: '700', lineHeight: 24 },
  stepperBtnDisabled: { color: '#a7d4ba' },
  stepperValue: { fontSize: 16, fontWeight: '700', color: '#15803d', minWidth: 24, textAlign: 'center' },
  quickItemsList: { backgroundColor: '#f0fdf4', margin: 16, borderRadius: 12, padding: 12 },
  quickItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  quickItemName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  quickItemMeta: { fontSize: 12, color: '#6b7280' },
  portionsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  portionsBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%' },
  portionsTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4, textAlign: 'center' },
  portionsHint: { fontSize: 13, color: '#6b7280', marginBottom: 16, textAlign: 'center' },
  portionsInput: { backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', padding: 12, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 16, color: '#111827' },
  portionsStepperRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginBottom: 16 },
  portionsStepperBtn: { backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1, borderColor: '#bbf7d0', paddingHorizontal: 18, justifyContent: 'center', alignItems: 'center', minWidth: 50 },
  portionsStepperBtnText: { fontSize: 26, color: '#15803d', fontWeight: '700', lineHeight: 28 },
});
