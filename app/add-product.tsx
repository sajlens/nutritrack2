import { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert, Image,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { NUTRIENTS } from '../constants/nutrients';
import nutrientsDB from '../data/nutrients_db.json';

const LOCAL_DB_KEYS = new Set(Object.keys((nutrientsDB as any).items));

const ANTHROPIC_API_KEY = Constants.expoConfig?.extra?.anthropicApiKey ?? '';

const MANUAL_FIELDS = [
  'calories', 'protein', 'fat', 'carbs', 'fiber', 'sugar_g',
  'saturated_fat_g', 'omega3_g', 'omega6_g',
  'vitamin_a_ug', 'vitamin_b1_mg', 'vitamin_b2_mg', 'vitamin_b3_mg',
  'vitamin_b5_mg', 'vitamin_b6_mg', 'vitamin_b9_ug', 'vitamin_b12_ug',
  'vitamin_c_mg', 'vitamin_d_ug', 'vitamin_e_mg', 'vitamin_k1_ug', 'vitamin_k2_ug',
  'calcium_mg', 'iron_mg', 'magnesium_mg', 'phosphorus_mg', 'potassium_mg',
  'sodium_mg', 'zinc_mg', 'copper_mg', 'selenium_ug', 'iodine_ug', 'choline_mg',
  'beta_carotene_ug', 'lutein_zeaxanthin_ug',
];

async function analyzePhotos(
  images: { base64: string; mimeType: string }[],
  productName: string
): Promise<Record<string, number>> {
  const fieldList = MANUAL_FIELDS.map(k => `"${k}": 0`).join(',\n  ');

  const imageContent = images.map(img => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: img.mimeType,
      data: img.base64,
    },
  }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `Analizujesz etykietę produktu spożywczego: "${productName}".

Na zdjęciach może być tabela wartości odżywczych i/lub lista składników.

Zadanie:
1. Odczytaj wartości z tabeli wartości odżywczych (jeśli widoczna) — to priorytet, są dokładne
2. Na podstawie listy składników oszacuj wartości których nie ma w tabeli
3. Jeśli brak tabeli — oszacuj wszystko na podstawie składników i wiedzy ogólnej o produkcie

Podaj wartości PER 100g produktu.

Odpowiedz TYLKO w formacie JSON bez żadnego tekstu przed ani po:
{
  ${fieldList}
}`,
          },
        ],
      }],
    }),
  });

  const data = await response.json();
  const text = data.content[0].text.trim();
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {};
  }
}

async function estimateFromName(productName: string): Promise<Record<string, number>> {
  const fieldList = MANUAL_FIELDS.map(k => `"${k}": 0`).join(',\n  ');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Podaj wartości odżywcze dla produktu: "${productName}", per 100g.
Odpowiedz TYLKO w formacie JSON bez żadnego tekstu przed ani po:
{
  ${fieldList}
}`,
      }],
    }),
  });
  const data = await response.json();
  const text = data.content[0].text.trim();
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch {
    return {};
  }
}

function toKey(name: string): string {
  // ł i Ł nie mają separowalnych diakrytyk w Unicode (NFD ich nie rozkłada),
  // więc trzeba je podmienić ręcznie zanim odetniemy znaki spoza ASCII.
  return name
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export default function AddProduct() {
  const [mode, setMode] = useState<'choose' | 'photos' | 'manual'>('choose');
  const [namePl, setNamePl] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [category, setCategory] = useState('');
  const [servingG, setServingG] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; base64: string; mimeType: string }[]>([]);

  useFocusEffect(useCallback(() => {
    setMode('choose');
    setNamePl('');
    setNameEn('');
    setCategory('');
    setServingG('');
    setValues({});
    setPhotos([]);
    setIsLoading(false);
    setLoadingMsg('');
  }, []));

  const pickPhoto = async () => {
    if (photos.length >= 2) {
      Alert.alert('Maksymalnie 2 zdjęcia', 'Usuń jedno żeby dodać nowe.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0].base64) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      setPhotos(prev => [...prev, { uri: asset.uri, base64: asset.base64!, mimeType }]);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzePhotos = async () => {
    if (!namePl.trim()) { Alert.alert('Błąd', 'Podaj najpierw nazwę produktu.'); return; }
    if (photos.length === 0) { Alert.alert('Błąd', 'Dodaj co najmniej jedno zdjęcie.'); return; }
    setIsLoading(true);
    setLoadingMsg('Analizuję zdjęcia...');
    try {
      const estimated = await analyzePhotos(
        photos.map(p => ({ base64: p.base64, mimeType: p.mimeType })),
        namePl.trim()
      );
      const newValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(estimated)) {
        if (typeof v === 'number' && v !== 0) newValues[k] = String(v);
      }
      setValues(newValues);
      setMode('manual');
    } catch {
      Alert.alert('Błąd', 'Nie udało się przeanalizować zdjęć.');
    } finally {
      setIsLoading(false);
      setLoadingMsg('');
    }
  };

  const handleEstimateFromName = async () => {
    if (!namePl.trim()) { Alert.alert('Błąd', 'Podaj najpierw nazwę produktu.'); return; }
    setIsLoading(true);
    setLoadingMsg('Claude szacuje wartości...');
    try {
      const estimated = await estimateFromName(namePl.trim());
      const newValues: Record<string, string> = {};
      for (const [k, v] of Object.entries(estimated)) {
        if (typeof v === 'number' && v !== 0) newValues[k] = String(v);
      }
      setValues(newValues);
      setMode('manual');
    } catch {
      Alert.alert('Błąd', 'Nie udało się pobrać danych.');
    } finally {
      setIsLoading(false);
      setLoadingMsg('');
    }
  };

  const handleSave = async () => {
    if (!namePl.trim()) { Alert.alert('Błąd', 'Podaj nazwę produktu.'); return; }
    const key = toKey(namePl);

    // Walidacja: czy klucz nie koliduje z lokalną bazą produktów.
    // Bez tego mielibyśmy duplikat klucza co psuje FlatList w wyszukiwarce.
    if (LOCAL_DB_KEYS.has(key)) {
      const existing = (nutrientsDB as any).items[key];
      Alert.alert(
        'Produkt już istnieje',
        `W bazie aplikacji jest już produkt "${existing.name_pl}" z takim samym kluczem (${key}).\n\nJeśli chcesz dodać wariant — zmień nazwę (np. dopisz markę, "domowy", "bio").`,
      );
      return;
    }

    const per100g: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const num = parseFloat(v);
      if (!isNaN(num) && num !== 0) per100g[k] = num;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.from('custom_products').insert({
        key,
        name_pl: namePl.trim(),
        name_en: nameEn.trim() || null,
        category: category.trim() || 'inne',
        per_100g: per100g,
        serving_g: servingG ? parseFloat(servingG) : null,
      });
      if (error) {
        if (error.code === '23505') {
          Alert.alert('Błąd', 'Produkt o tej nazwie już istnieje w Twoich produktach.');
        } else {
          Alert.alert('Błąd', 'Nie udało się zapisać produktu.');
        }
        return;
      }
      Alert.alert('Zapisano!', '"' + namePl + '" dodany do bazy produktów.');
      router.back();
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać produktu.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Wybór trybu ──────────────────────────────────────────────────────────
  if (mode === 'choose') {
    return (
      <View style={styles.container}>
        <Text style={styles.heading}>Dodaj produkt do bazy</Text>
        <Text style={styles.hint}>Skąd pobrać dane odżywcze?</Text>

        <TouchableOpacity style={styles.modeCard} onPress={() => setMode('photos')}>
          <Text style={styles.modeIcon}>📸</Text>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Ze zdjęć etykiety</Text>
            <Text style={styles.modeDesc}>Wgraj 1-2 screenshoty etykiety. Claude odczyta tabelę wartości i uzupełni resztę ze składników.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.modeCard} onPress={() => { setMode('manual'); setValues({}); }}>
          <Text style={styles.modeIcon}>🤖</Text>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Dane ogólne (Claude)</Text>
            <Text style={styles.modeDesc}>Podaj nazwę produktu — Claude oszacuje wartości odżywcze. Możesz potem edytować.</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.modeCard, { borderStyle: 'dashed' }]} onPress={() => { setMode('manual'); setValues({}); }}>
          <Text style={styles.modeIcon}>✍️</Text>
          <View style={styles.modeText}>
            <Text style={styles.modeTitle}>Ręcznie</Text>
            <Text style={styles.modeDesc}>Wpisujesz wszystkie wartości samodzielnie.</Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Tryb zdjęć ───────────────────────────────────────────────────────────
  if (mode === 'photos') {
    return (
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Ze zdjęć etykiety</Text>
        <Text style={styles.hint}>Podaj nazwę i wgraj do 2 zdjęć etykiety (składniki i/lub tabela wartości odżywczych).</Text>

        <Text style={styles.fieldLabel}>Nazwa produktu *</Text>
        <TextInput style={styles.input} value={namePl} onChangeText={setNamePl} placeholder="np. Serek wiejski light Piątek" autoFocus />

        <Text style={styles.fieldLabel}>Zdjęcia etykiety (max 2):</Text>
        <View style={styles.photosRow}>
          {photos.map((photo, i) => (
            <View key={i} style={styles.photoThumb}>
              <Image source={{ uri: photo.uri }} style={styles.photoImg} />
              <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(i)}>
                <Text style={styles.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 2 && (
            <TouchableOpacity style={styles.photoAdd} onPress={pickPhoto}>
              <Text style={styles.photoAddText}>+ Dodaj{'\n'}zdjęcie</Text>
            </TouchableOpacity>
          )}
        </View>

        {isLoading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#16a34a" />
            <Text style={styles.loadingText}>{loadingMsg}</Text>
          </View>
        )}

        <View style={[styles.buttonRow, { marginTop: 16 }]}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setMode('choose')}>
            <Text style={styles.btnSecondaryText}>Wróć</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnPrimary, (photos.length === 0 || !namePl.trim() || isLoading) && styles.btnDisabled]}
            onPress={handleAnalyzePhotos}
            disabled={photos.length === 0 || !namePl.trim() || isLoading}
          >
            <Text style={styles.btnPrimaryText}>Analizuj</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // ── Formularz wartości (po analizie lub ręczny) ──────────────────────────
  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Sprawdź wartości</Text>
      <Text style={styles.hint}>Uzupełnij lub popraw wartości per 100g.</Text>

      <Text style={styles.sectionLabel}>Informacje podstawowe</Text>

      <Text style={styles.fieldLabel}>Nazwa (po polsku) *</Text>
      <TextInput style={styles.input} value={namePl} onChangeText={setNamePl} placeholder="np. Serek wiejski light" />

      <Text style={styles.fieldLabel}>Nazwa (po angielsku)</Text>
      <TextInput style={styles.input} value={nameEn} onChangeText={setNameEn} placeholder="np. Cottage cheese light" />

      <Text style={styles.fieldLabel}>Kategoria</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="np. nabiał, mięso, warzywa..." />

      <Text style={styles.fieldLabel}>Typowa porcja (g)</Text>
      <TextInput style={styles.input} value={servingG} onChangeText={setServingG} keyboardType="numeric" placeholder="np. 100" />

      {Object.keys(values).length === 0 && (
        <TouchableOpacity
          style={[styles.btnEstimate, isLoading && styles.btnDisabled]}
          onPress={handleEstimateFromName}
          disabled={isLoading || !namePl.trim()}
        >
          {isLoading
            ? <><ActivityIndicator color="#15803d" size="small" /><Text style={styles.btnEstimateText}> {loadingMsg}</Text></>
            : <Text style={styles.btnEstimateText}>🤖 Szacuj przez Claude</Text>
          }
        </TouchableOpacity>
      )}

      <Text style={styles.sectionLabel}>Wartości odżywcze per 100g</Text>

      {MANUAL_FIELDS.map(key => {
        const meta = NUTRIENTS[key];
        if (!meta) return null;
        return (
          <View key={key} style={styles.fieldRow}>
            <Text style={styles.fieldName}>{meta.label}</Text>
            <View style={styles.fieldInputRow}>
              <TextInput
                style={styles.fieldInput}
                value={values[key] ?? ''}
                onChangeText={v => setValues(prev => ({ ...prev, [key]: v }))}
                keyboardType="numeric"
                placeholder="0"
              />
              <Text style={styles.fieldUnit}>{meta.unit}</Text>
            </View>
          </View>
        );
      })}

      <View style={[styles.buttonRow, { marginTop: 8, marginBottom: 32 }]}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
          <Text style={styles.btnSecondaryText}>Anuluj</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btnPrimary, isLoading && styles.btnDisabled]} onPress={handleSave} disabled={isLoading}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 16 },
  heading: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 8 },
  hint: { fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },
  fieldLabel: { fontSize: 14, color: '#374151', marginBottom: 4 },
  input: { backgroundColor: '#fff', borderRadius: 10, padding: 12, fontSize: 15, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 12 },
  fieldRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  fieldName: { fontSize: 14, color: '#374151', flex: 1 },
  fieldInputRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fieldInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 6, width: 72, textAlign: 'right', fontSize: 14 },
  fieldUnit: { fontSize: 12, color: '#9ca3af', width: 28 },
  modeCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#e5e7eb' },
  modeIcon: { fontSize: 32 },
  modeText: { flex: 1 },
  modeTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  modeDesc: { fontSize: 13, color: '#6b7280', lineHeight: 18 },
  photosRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  photoThumb: { position: 'relative', width: 110, height: 110 },
  photoImg: { width: 110, height: 110, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  photoRemove: { position: 'absolute', top: -8, right: -8, backgroundColor: '#ef4444', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  photoAdd: { width: 110, height: 110, borderRadius: 10, borderWidth: 1.5, borderColor: '#16a34a', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  photoAddText: { color: '#16a34a', fontSize: 14, fontWeight: '600', textAlign: 'center' },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f0fdf4', borderRadius: 10, padding: 14, marginBottom: 8 },
  loadingText: { fontSize: 14, color: '#15803d' },
  btnEstimate: { backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: '#bbf7d0', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  btnEstimateText: { color: '#15803d', fontSize: 15, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  btnPrimary: { flex: 1, backgroundColor: '#16a34a', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnSecondary: { flex: 1, backgroundColor: '#e5e7eb', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnSecondaryText: { color: '#374151', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});
