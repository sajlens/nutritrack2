import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useNutriStore } from '../store/useNutriStore';
import { NUTRIENTS, EDITABLE_TARGETS, EditableTargetKey, getRdaFor } from '../constants/nutrients';

type Mode = 'maintain' | 'gain';

/** Wartość dla pola: liczba + flag czy auto-wyliczone czy ręczne. */
type FieldState = { value: string; isAuto: boolean };
type FormState = Record<string, FieldState>;

/** Pole "kalorie" jest źródłem dla skalowania. Reszta to "zależne". */
const SCALABLE_FIELDS = ['protein', 'fat', 'carbs', 'net_carbs', 'fiber'] as const;

/** Defaultowe cele z constants/nutrients.ts dla danego trybu */
function getDefault(key: EditableTargetKey, mode: Mode): number {
  const meta = NUTRIENTS[key];
  return meta ? (getRdaFor(meta, mode) ?? 0) : 0;
}

/** Skaluje wartość proporcjonalnie do nowych kcal */
function scaleByCalories(field: EditableTargetKey, newKcal: number, mode: Mode): number {
  const defaultKcal = getDefault('calories', mode);
  const defaultField = getDefault(field, mode);
  if (defaultKcal === 0) return defaultField;
  return Math.round(defaultField * newKcal / defaultKcal);
}

export default function Settings() {
  const { userTargets, loadUserTargets, saveUserTargets } = useNutriStore();
  const [form, setForm] = useState<FormState>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      await loadUserTargets();
      setIsLoaded(true);
    })();
  }, []);

  // Po załadowaniu - zainicjalizuj formularz
  // Pole "auto" gdy: jest puste w bazie ALBO jego wartość pasuje do proporcjonalnego skalowania
  useEffect(() => {
    if (!isLoaded) return;
    const init: FormState = {};
    for (const mode of ['maintain', 'gain'] as const) {
      const caloriesOverride = (userTargets as any)[`calories_${mode}`];
      const caloriesValue = caloriesOverride ?? getDefault('calories', mode);
      init[`calories_${mode}`] = {
        value: String(caloriesValue),
        isAuto: false,
      };

      for (const field of SCALABLE_FIELDS) {
        const overrideKey = `${field}_${mode}`;
        const override = (userTargets as any)[overrideKey];
        const expectedAuto = scaleByCalories(field, caloriesValue, mode);
        const actualValue = override ?? getDefault(field, mode);
        const isAuto = override == null || Math.abs(actualValue - expectedAuto) < 0.5;
        init[overrideKey] = {
          value: String(isAuto ? expectedAuto : actualValue),
          isAuto,
        };
      }
    }
    setForm(init);
  }, [isLoaded, userTargets]);

  const updateCalories = (mode: Mode, newValue: string) => {
    setForm(prev => {
      const next = { ...prev };
      next[`calories_${mode}`] = { value: newValue, isAuto: false };
      const kcal = parseFloat(newValue.replace(',', '.'));
      if (!isNaN(kcal) && kcal > 0) {
        for (const field of SCALABLE_FIELDS) {
          const key = `${field}_${mode}`;
          if (next[key]?.isAuto) {
            const scaled = scaleByCalories(field, kcal, mode);
            next[key] = { value: String(scaled), isAuto: true };
          }
        }
      }
      return next;
    });
  };

  const updateField = (field: EditableTargetKey, mode: Mode, newValue: string) => {
    setForm(prev => ({
      ...prev,
      [`${field}_${mode}`]: { value: newValue, isAuto: false },
    }));
  };

  const resetToAuto = (field: EditableTargetKey, mode: Mode) => {
    const kcalStr = form[`calories_${mode}`]?.value ?? '';
    const kcal = parseFloat(kcalStr.replace(',', '.'));
    if (isNaN(kcal) || kcal <= 0) return;
    const scaled = scaleByCalories(field, kcal, mode);
    setForm(prev => ({
      ...prev,
      [`${field}_${mode}`]: { value: String(scaled), isAuto: true },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const targets: any = {};
      for (const key of EDITABLE_TARGETS) {
        for (const mode of ['maintain', 'gain'] as const) {
          const overrideKey = `${key}_${mode}`;
          const raw = form[overrideKey]?.value?.replace(',', '.').trim();
          const value = raw ? parseFloat(raw) : NaN;
          if (!isNaN(value) && value > 0) {
            targets[overrideKey] = value;
          } else {
            targets[overrideKey] = null;
          }
        }
      }
      await saveUserTargets(targets);
      Alert.alert('Zapisano', 'Cele zostały zaktualizowane.');
      router.back();
    } catch {
      Alert.alert('Błąd', 'Nie udało się zapisać.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetAll = () => {
    Alert.alert(
      'Reset do defaultów',
      'Wszystkie cele wrócą do wartości domyślnych. Kontynuować?',
      [
        { text: 'Anuluj', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive', onPress: async () => {
            const empty: any = {};
            for (const key of EDITABLE_TARGETS) {
              for (const mode of ['maintain', 'gain'] as const) {
                empty[`${key}_${mode}`] = null;
              }
            }
            await saveUserTargets(empty);
            const init: FormState = {};
            for (const mode of ['maintain', 'gain'] as const) {
              init[`calories_${mode}`] = { value: String(getDefault('calories', mode)), isAuto: false };
              for (const field of SCALABLE_FIELDS) {
                init[`${field}_${mode}`] = { value: String(getDefault(field, mode)), isAuto: true };
              }
            }
            setForm(init);
          }
        }
      ]
    );
  };

  if (!isLoaded) {
    return (
      <View style={styles.container}>
        <ActivityIndicator style={{ marginTop: 40 }} color="#16a34a" />
      </View>
    );
  }

  const renderModeSection = (mode: Mode, badgeBg: string, badgeBorder: string, badgeColor: string, badgeText: string, badgeSubtext: string) => {
    const kcalKey = `calories_${mode}`;
    return (
      <View style={styles.modeSection}>
        <View style={[styles.modeBadge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
          <Text style={[styles.modeBadgeText, { color: badgeColor }]}>{badgeText}</Text>
          <Text style={[styles.modeBadgeSubtext, { color: badgeColor }]}>{badgeSubtext}</Text>
        </View>

        {/* Pole główne: Kalorie */}
        <View style={styles.fieldRowMain}>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabelMain}>
              Kalorie <Text style={styles.fieldUnit}>(kcal)</Text>
            </Text>
            <Text style={styles.fieldHelp}>Reszta makro liczy się proporcjonalnie</Text>
          </View>
          <TextInput
            style={styles.inputMain}
            value={form[kcalKey]?.value ?? ''}
            onChangeText={v => updateCalories(mode, v)}
            keyboardType="numeric"
          />
        </View>

        {/* Pola zależne */}
        {SCALABLE_FIELDS.map(field => {
          const key = `${field}_${mode}`;
          const meta = NUTRIENTS[field];
          if (!meta) return null;
          const state = form[key];
          const isAuto = state?.isAuto ?? true;
          return (
            <View key={key} style={[styles.fieldRow, isAuto && styles.fieldRowAuto]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>
                  {meta.label} <Text style={styles.fieldUnit}>({meta.unit})</Text>
                  {isAuto ? <Text style={styles.autoTag}>  auto</Text> : null}
                </Text>
              </View>
              {!isAuto && (
                <TouchableOpacity onPress={() => resetToAuto(field, mode)} style={styles.resetIcon} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.resetIconText}>↻</Text>
                </TouchableOpacity>
              )}
              <TextInput
                style={[styles.input, isAuto && styles.inputAuto]}
                value={state?.value ?? ''}
                onChangeText={v => updateField(field, mode, v)}
                keyboardType="numeric"
              />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backText}>‹ Wróć</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Cele żywieniowe</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Ustaw kalorie - reszta makro przeliczy się proporcjonalnie. Możesz też nadpisać każde pole ręcznie. Kliknij ↻ żeby wrócić do trybu auto.
        </Text>

        {renderModeSection('maintain', '#dcfce7', '#bbf7d0', '#15803d', '🛡 Tryb maintain', 'Dni utrzymaniowe')}
        {renderModeSection('gain', '#fef3c7', '#fde68a', '#92400e', '💪 Tryb gain', 'Dni treningowe')}

        <TouchableOpacity
          style={[styles.btnPrimary, isSaving && styles.btnDisabled]}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Zapisz</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnReset} onPress={handleResetAll}>
          <Text style={styles.btnResetText}>Reset do defaultów</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backText: { fontSize: 16, color: '#16a34a', fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: '#111827' },
  scroll: { padding: 16, paddingBottom: 48 },
  intro: { fontSize: 13, color: '#6b7280', marginBottom: 20, lineHeight: 20 },
  modeSection: { marginBottom: 24 },
  modeBadge: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  modeBadgeText: { fontSize: 16, fontWeight: '700' },
  modeBadgeSubtext: { fontSize: 12, marginTop: 2 },
  fieldRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#16a34a',
  },
  fieldLabelMain: { fontSize: 16, fontWeight: '700', color: '#111827' },
  fieldHelp: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  inputMain: {
    width: 110,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 10,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    color: '#111827',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  fieldRowAuto: {
    backgroundColor: '#f9fafb',
  },
  fieldLabel: { fontSize: 14, color: '#111827' },
  fieldUnit: { fontSize: 12, color: '#9ca3af', fontWeight: '400' },
  autoTag: { fontSize: 11, color: '#16a34a', fontWeight: '600' },
  resetIcon: { paddingHorizontal: 10 },
  resetIconText: { fontSize: 18, color: '#16a34a' },
  input: {
    width: 80,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    padding: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    color: '#111827',
  },
  inputAuto: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    borderColor: '#e5e7eb',
  },
  btnPrimary: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  btnPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  btnReset: {
    backgroundColor: 'transparent',
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  btnResetText: { color: '#ef4444', fontSize: 14, fontWeight: '500' },
});
