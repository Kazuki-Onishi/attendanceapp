import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

import labels from '@/i18n/ja.json';
import { firestore } from '@/lib/firebase';
import { useAppSelector } from '@/store';

const t = labels.storeSales;

const JST_OFFSET_MINUTES = 9 * 60;

const initialFormState = {
  total: '',
  cash: '',
  card: '',
  paypay: '',
  notes: '',
};

type FormState = typeof initialFormState;

type SalesDailyDoc = {
  total?: number | null;
  cash?: number | null;
  card?: number | null;
  paypay?: number | null;
  notes?: string | null;
  updatedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
};

const toJstDateKey = (date: Date): string => {
  const utc = date.getTime() + date.getTimezoneOffset() * 60_000;
  const jst = new Date(utc + JST_OFFSET_MINUTES * 60_000);
  const year = jst.getFullYear();
  const month = String(jst.getMonth() + 1).padStart(2, '0');
  const day = String(jst.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDisplayDate = (dateKey: string): string => {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = Number.parseInt(yearStr ?? '', 10);
  const month = Number.parseInt(monthStr ?? '', 10);
  const day = Number.parseInt(dayStr ?? '', 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return dateKey;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
};

const formatTimestamp = (value: Timestamp | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const date = value.toDate();
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const StoreSalesScreen: React.FC = () => {
  const storeAuth = useAppSelector((state) => state.storeAuth);
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);
  const storeId = storeAuth.storeId ?? selectedStoreId ?? null;

  const dateKey = useMemo(() => toJstDateKey(new Date()), []);
  const displayDate = useMemo(() => formatDisplayDate(dateKey), [dateKey]);

  const [form, setForm] = useState<FormState>(initialFormState);
  const formDirtyRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [docExists, setDocExists] = useState(false);
  const [updatedLabel, setUpdatedLabel] = useState<string | null>(null);

  useEffect(() => {
    setForm(initialFormState);
    formDirtyRef.current = false;
    setMessage(null);
    setError(null);
    setUpdatedLabel(null);
  }, [storeId, dateKey]);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      setDocExists(false);
      return () => undefined;
    }

    setLoading(true);
    setLoadError(null);

    const docRef = doc(firestore(), 'salesDaily', `${storeId}_${dateKey}`);
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        setLoading(false);
        if (!snapshot.exists()) {
          setDocExists(false);
          if (!formDirtyRef.current) {
            setForm(initialFormState);
          }
          setUpdatedLabel(null);
          return;
        }
        setDocExists(true);
        const data = snapshot.data() as SalesDailyDoc;
        const nextForm: FormState = {
          total: data.total != null ? String(data.total) : '',
          cash: data.cash != null ? String(data.cash) : '',
          card: data.card != null ? String(data.card) : '',
          paypay: data.paypay != null ? String(data.paypay) : '',
          notes: data.notes ?? '',
        };
        if (!formDirtyRef.current) {
          setForm(nextForm);
        }
        setUpdatedLabel(formatTimestamp(data.updatedAt));
      },
      (err) => {
        setLoading(false);
        setLoadError(err instanceof Error ? err.message : 'Failed to load sales data.');
      },
    );

    return () => unsubscribe();
  }, [storeId, dateKey]);

  const handleChange = useCallback((key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    formDirtyRef.current = true;
    setMessage(null);
    setError(null);
  }, []);

  const parseAmount = useCallback((value: string, label: string): number | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = trimmed.replace(/[,\s]/g, '');
    if (!/^[-]?\d+(\.\d+)?$/.test(normalized)) {
      throw new Error(`${label} must be a numeric value.`);
    }
    return Number(normalized);
  }, []);

  const handleSave = useCallback(async () => {
    if (!storeId) {
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      setError(null);

      const total = parseAmount(form.total, t.total);
      const cash = parseAmount(form.cash, t.cash);
      const card = parseAmount(form.card, t.card);
      const paypay = parseAmount(form.paypay, t.paypay);
      const cleanedNotes = form.notes.trim();

      const docRef = doc(firestore(), 'salesDaily', `${storeId}_${dateKey}`);
      const timestamp = serverTimestamp();

      const payload: Record<string, unknown> = {
        storeId,
        dateKey,
        total,
        cash,
        card,
        paypay,
        notes: cleanedNotes.length ? cleanedNotes : null,
        updatedAt: timestamp,
      };

      if (!docExists) {
        payload.createdAt = timestamp;
      }

      await setDoc(docRef, payload, { merge: true });
      formDirtyRef.current = false;
      setMessage(t.saved);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t.error);
      }
    } finally {
      setSaving(false);
    }
  }, [storeId, form, parseAmount, dateKey, docExists]);

  if (!storeId) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t.noStore}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.dateValue}>{`${t.dateLabel}: ${displayDate}`}</Text>
      </View>

      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.helper}>{t.loading}</Text>
        </View>
      ) : null}

      {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.helper}>{t.helper}</Text>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t.total}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={form.total}
          onChangeText={(value) => handleChange('total', value)}
          placeholder="0"
          placeholderTextColor="#64748b"
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t.cash}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={form.cash}
          onChangeText={(value) => handleChange('cash', value)}
          placeholder="0"
          placeholderTextColor="#64748b"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t.card}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={form.card}
          onChangeText={(value) => handleChange('card', value)}
          placeholder="0"
          placeholderTextColor="#64748b"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t.paypay}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={form.paypay}
          onChangeText={(value) => handleChange('paypay', value)}
          placeholder="0"
          placeholderTextColor="#64748b"
        />
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.label}>{t.notes}</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          multiline
          value={form.notes}
          onChangeText={(value) => handleChange('notes', value)}
          placeholder={t.notes}
          placeholderTextColor="#64748b"
        />
      </View>

      {updatedLabel ? <Text style={styles.updated}>{`Updated at: ${updatedLabel}`}</Text> : null}

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonLabel}>{t.save}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    padding: 24,
    gap: 16,
    paddingBottom: 48,
  },
  header: {
    gap: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
  },
  dateValue: {
    color: '#cbd5f5',
  },
  helper: {
    color: '#94a3b8',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  formGroup: {
    gap: 6,
  },
  label: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 16,
  },
  notesInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginVertical: 4,
  },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  success: {
    color: '#34d399',
  },
  error: {
    color: '#f87171',
  },
  updated: {
    color: '#94a3b8',
    fontSize: 13,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center',
  },
});

export default StoreSalesScreen;










