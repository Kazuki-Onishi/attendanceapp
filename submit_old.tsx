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
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import { useAppSelector } from '@/store';
import { parseSpanInput, spansToMultiline, type NormalizedSpan } from '@/utils/spanInput';

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

type AvailabilityMode = 'spans' | 'allOk' | 'allNg';
type RequestStatus = 'draft' | 'submitted';

type ShiftRequestRecord = {
  id: string;
  date: string;
  status: RequestStatus;
  type: 'span' | 'allOk' | 'allNg';
  startTime: string | null;
  endTime: string | null;
  rawText?: string | null;
  sequence: number;
};

type ToastState = {
  type: 'success' | 'error';
  message: string;
};

const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: '下書き',
  submitted: '提出済み',
};

const AVAILABILITY_LABEL: Record<AvailabilityMode, string> = {
  spans: '時間帯を入力',
  allOk: '終日OK',
  allNg: '終日NG',
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateString = (value: string): Date | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, diff: number): Date => new Date(date.getFullYear(), date.getMonth() + diff, 1);
const addDays = (date: Date, diff: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + diff);

const formatMonthKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const formatDisplayDate = (dateStr: string): string => {
  const parsed = parseDateString(dateStr);
  if (!parsed) {
    return dateStr;
  }
  const month = parsed.getMonth() + 1;
  const day = parsed.getDate();
  const week = WEEK_LABELS[parsed.getDay()] ?? '';
  return `${month}月${day}日(${week})`;
};

const formatMonthLabel = (anchor: Date): string => `${anchor.getFullYear()}年${anchor.getMonth() + 1}月`;

const SubmitShiftScreen: React.FC = () => {
  const auth = useAppSelector((state) => state.auth);
  const storeId = useAppSelector((state) => state.store.selectedStoreId);
  const uid = auth.user?.uid ?? null;

  const today = useMemo(() => new Date(), []);

  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(today));
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDate(today));
  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>('spans');
  const [inputValue, setInputValue] = useState<string>('');
  const [formDirty, setFormDirty] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [requestsByDate, setRequestsByDate] = useState<Record<string, ShiftRequestRecord[]>>({});
  const [loadingRequests, setLoadingRequests] = useState<boolean>(false);
  const [savingState, setSavingState] = useState<RequestStatus | null>(null);
  const [currentStatus, setCurrentStatus] = useState<RequestStatus | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monthKey = useMemo(() => formatMonthKey(monthAnchor), [monthAnchor]);
  const selectedDateLabel = useMemo(() => formatDisplayDate(selectedDate), [selectedDate]);
  const monthLabel = useMemo(() => formatMonthLabel(monthAnchor), [monthAnchor]);

  const showToast = useCallback((type: ToastState['type'], message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ type, message });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!uid || !storeId) {
      setRequestsByDate({});
      setLoadingRequests(false);
      return;
    }

    setLoadingRequests(true);
    const db = firestore();
    const requestsRef = collection(db, 'shiftRequests');
    const subscription = onSnapshot(
      query(
        requestsRef,
        where('uid', '==', uid),
        where('storeId', '==', storeId),
        where('monthKey', '==', monthKey),
      ),
      (snapshot) => {
        const grouped: Record<string, ShiftRequestRecord[]> = {};
        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data() as Record<string, unknown>;
          const date = typeof data.date === 'string' ? data.date : null;
          if (!date) {
            return;
          }

          const rawType = typeof data.type === 'string' ? data.type : undefined;
          let type: ShiftRequestRecord['type'];
          if (rawType === 'allOk' || rawType === 'allNg' || rawType === 'span') {
            type = rawType;
          } else if (docSnapshot.id.endsWith('_ALL_OK')) {
            type = 'allOk';
          } else if (docSnapshot.id.endsWith('_ALL_NG')) {
            type = 'allNg';
          } else {
            type = 'span';
          }

          const status: RequestStatus = data.status === 'submitted' ? 'submitted' : 'draft';

          const record: ShiftRequestRecord = {
            id: docSnapshot.id,
            date,
            status,
            type,
            startTime: typeof data.startTime === 'string' ? data.startTime : null,
            endTime: typeof data.endTime === 'string' ? data.endTime : null,
            rawText: typeof data.rawText === 'string' ? data.rawText : null,
            sequence: typeof data.sequence === 'number' ? data.sequence : 0,
          };

          if (!grouped[date]) {
            grouped[date] = [];
          }
          grouped[date].push(record);
        });

        Object.keys(grouped).forEach((date) => {
          grouped[date].sort((a, b) => {
            if (a.sequence !== b.sequence) {
              return a.sequence - b.sequence;
            }
            const aStart = a.startTime ?? '';
            const bStart = b.startTime ?? '';
            return aStart.localeCompare(bStart);
          });
        });

        setRequestsByDate(grouped);
        setLoadingRequests(false);
      },
      (err) => {
        setLoadingRequests(false);
        showToast('error', err instanceof Error ? err.message : 'シフト提出の取得に失敗しました。');
      },
    );

    return () => subscription();
  }, [uid, storeId, monthKey, showToast]);

  useEffect(() => {
    const parsed = parseDateString(selectedDate);
    if (!parsed) {
      return;
    }
    if (
      parsed.getMonth() !== monthAnchor.getMonth() ||
      parsed.getFullYear() !== monthAnchor.getFullYear()
    ) {
      setMonthAnchor(startOfMonth(parsed));
    }
  }, [selectedDate, monthAnchor]);

  useEffect(() => {
    setFormDirty(false);
    setFormError(null);
  }, [selectedDate]);

  useEffect(() => {
    const dayRequests = requestsByDate[selectedDate] ?? [];
    setCurrentStatus(dayRequests.length ? dayRequests[0].status : null);

    if (!formDirty) {
      if (dayRequests.some((req) => req.type === 'allOk')) {
        setAvailabilityMode('allOk');
        setInputValue('');
      } else if (dayRequests.some((req) => req.type === 'allNg')) {
        setAvailabilityMode('allNg');
        setInputValue('');
      } else if (dayRequests.length) {
        const spans: NormalizedSpan[] = dayRequests
          .filter((req) => req.type === 'span' && req.startTime && req.endTime)
          .map((req) => ({ start: req.startTime as string, end: req.endTime as string }));
        setAvailabilityMode('spans');
        setInputValue(spansToMultiline(spans));
      } else {
        setAvailabilityMode('spans');
        setInputValue('');
      }
    }
  }, [requestsByDate, selectedDate, formDirty]);

  const summaryItems = useMemo(() => {
    return Object.entries(requestsByDate)
      .map(([date, records]) => {
        const status = records[0]?.status ?? 'draft';
        let detail: string;
        if (records.some((item) => item.type === 'allOk')) {
          detail = '終日OK';
        } else if (records.some((item) => item.type === 'allNg')) {
          detail = '終日NG';
        } else {
          detail = records
            .filter((item) => item.type === 'span' && item.startTime && item.endTime)
            .map((item) => `${item.startTime}-${item.endTime}`)
            .join(', ');
        }
        if (!detail) {
          detail = '登録なし';
        }
        return { date, status, detail };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [requestsByDate]);

  const handleModeChange = useCallback(
    (mode: AvailabilityMode) => {
      if (mode === availabilityMode) {
        return;
      }
      setAvailabilityMode(mode);
      setFormDirty(true);
      setFormError(null);
      if (mode !== 'spans') {
        setInputValue('');
      }
    },
    [availabilityMode],
  );

  const handleInputChange = useCallback((value: string) => {
    setInputValue(value);
    setFormDirty(true);
    setFormError(null);
    if (availabilityMode !== 'spans') {
      setAvailabilityMode('spans');
    }
  }, [availabilityMode]);

  const handleMonthChange = useCallback((diff: number) => {
    const next = addMonths(monthAnchor, diff);
    setMonthAnchor(next);
    setSelectedDate(formatDate(next));
  }, [monthAnchor]);

  const handleDayShift = useCallback((diff: number) => {
    const base = parseDateString(selectedDate) ?? new Date();
    const next = addDays(base, diff);
    setSelectedDate(formatDate(next));
    setMonthAnchor(startOfMonth(next));
  }, [selectedDate]);

  const handleAction = useCallback(
    async (nextStatus: RequestStatus) => {
      if (!uid || !storeId) {
        showToast('error', '店舗情報またはユーザー情報が不足しています。');
        return;
      }

      const parsedDate = parseDateString(selectedDate);
      if (!parsedDate) {
        setFormError('対象日を正しく選択してください。');
        return;
      }

      const dateStr = formatDate(parsedDate);
      const targetMonthKey = formatMonthKey(parsedDate);

      let spans: NormalizedSpan[] = [];
      let warnings: string[] = [];
      let normalizedRawText = inputValue.trim();

      if (availabilityMode === 'spans') {
        const { spans: parsedSpans, errors, warnings: parseWarnings, normalizedText } = parseSpanInput(inputValue);
        if (errors.length) {
          setFormError(errors[0]);
          return;
        }
        spans = parsedSpans;
        warnings = parseWarnings;
        if (normalizedText) {
          normalizedRawText = normalizedText;
        }
        if (nextStatus === 'submitted' && spans.length === 0) {
          setFormError('提出する時間帯を入力してください。');
          return;
        }
        if (!formDirty && spans.length === 0 && (requestsByDate[dateStr] ?? []).length === 0) {
          setFormError('時間帯を入力してください。');
          return;
        }
        if (normalizedText && normalizedText !== inputValue.trim()) {
          setInputValue(normalizedText);
        }
      } else if (nextStatus === 'submitted') {
        // All-day modes can be submitted without spans
      }

      const db = firestore();
      const batch = writeBatch(db);
      const existingEntries = requestsByDate[dateStr] ?? [];
      existingEntries.forEach((entry) => {
        batch.delete(doc(db, 'shiftRequests', entry.id));
      });

      if (availabilityMode === 'spans') {
        spans.forEach((span, index) => {
          const docId = `${uid}_${storeId}_${dateStr}_${span.start.replace(':', '')}-${span.end.replace(':', '')}`;
          const docRef = doc(db, 'shiftRequests', docId);
          const timestamp = serverTimestamp();
          batch.set(docRef, {
            uid,
            storeId,
            date: dateStr,
            monthKey: targetMonthKey,
            status: nextStatus,
            type: 'span',
            mode: 'spans',
            startTime: span.start,
            endTime: span.end,
            rawText: normalizedRawText,
            sequence: index,
            updatedAt: timestamp,
            createdAt: timestamp,
          });
        });
      } else {
        const suffix = availabilityMode === 'allOk' ? '_ALL_OK' : '_ALL_NG';
        const docRef = doc(db, 'shiftRequests', `${uid}_${storeId}_${dateStr}${suffix}`);
        const timestamp = serverTimestamp();
        const allDayRawText = availabilityMode === 'allOk' ? 'ALL_OK' : 'ALL_NG';
        batch.set(docRef, {
          uid,
          storeId,
          date: dateStr,
          monthKey: targetMonthKey,
          status: nextStatus,
          type: availabilityMode === 'allOk' ? 'allOk' : 'allNg',
          mode: availabilityMode,
          startTime: null,
          endTime: null,
          rawText: allDayRawText,
          sequence: 0,
          updatedAt: timestamp,
          createdAt: timestamp,
        });
      }

      setSavingState(nextStatus);
      setFormError(null);

      try {
        await batch.commit();
        setFormDirty(false);
        const successMessage = nextStatus === 'submitted' ? 'シフトを提出しました。' : '下書きを保存しました。';
        if (warnings.length) {
          showToast('success', `${successMessage} (${warnings[0]})`);
        } else {
          showToast('success', successMessage);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '保存に失敗しました。';
        showToast('error', message);
      } finally {
        setSavingState(null);
      }
    },
    [availabilityMode, inputValue, requestsByDate, selectedDate, showToast, storeId, uid, formDirty],
  );

  const isSubmitting = savingState === 'submitted';
  const isSavingDraft = savingState === 'draft';

  const currentSummary = useMemo(() => {
    const dayRequests = requestsByDate[selectedDate] ?? [];
    if (!dayRequests.length) {
      return '登録なし';
    }
    if (dayRequests.some((req) => req.type === 'allOk')) {
      return '終日OK';
    }
    if (dayRequests.some((req) => req.type === 'allNg')) {
      return '終日NG';
    }
    return dayRequests
      .filter((req) => req.type === 'span' && req.startTime && req.endTime)
      .map((req) => `${req.startTime}-${req.endTime}`)
      .join(', ');
  }, [requestsByDate, selectedDate]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {toast ? (
        <View style={[styles.toast, toast.type === 'error' ? styles.toastError : styles.toastSuccess]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>提出内容</Text>
          <Text style={styles.sectionSubtitle}>{monthLabel}</Text>
        </View>

        <View style={styles.dateSelector}>
          <TouchableOpacity onPress={() => handleDayShift(-1)} style={styles.pillButton}>
            <Text style={styles.pillButtonLabel}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.dateLabel}>{selectedDateLabel}</Text>
          <TouchableOpacity onPress={() => handleDayShift(1)} style={styles.pillButton}>
            <Text style={styles.pillButtonLabel}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modeSwitcher}>
          {(['spans', 'allOk', 'allNg'] as AvailabilityMode[]).map((mode) => {
            const isActive = availabilityMode === mode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => handleModeChange(mode)}
                style={[styles.modeButton, isActive && styles.modeButtonActive]}
              >
                <Text style={[styles.modeButtonLabel, isActive && styles.modeButtonLabelActive]}>
                  {AVAILABILITY_LABEL[mode]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {availabilityMode === 'spans' ? (
          <View style={styles.inputBlock}>
            <Text style={styles.helperText}>
              一行につき 10-18 や 10:00-18:00 の形式で入力してください。複数行で複数スパンを登録できます。
            </Text>
            <TextInput
              style={styles.textArea}
              multiline
              value={inputValue}
              onChangeText={handleInputChange}
              placeholder={'例:\n10-18\n19-22'}
              placeholderTextColor="#64748b"
            />
          </View>
        ) : (
          <Text style={styles.helperText}>
            {availabilityMode === 'allOk'
              ? 'この日は終日勤務可能として登録します。'
              : 'この日は勤務不可として登録します。'}
          </Text>
        )}

        {currentStatus ? (
          <Text style={styles.currentStatus}>{`現在のステータス: ${STATUS_LABEL[currentStatus]}`}</Text>
        ) : null}
        <Text style={styles.currentSummary}>{`保存済み: ${currentSummary}`}</Text>

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton, isSavingDraft && styles.actionButtonDisabled]}
            onPress={() => handleAction('draft')}
            disabled={isSavingDraft || isSubmitting}
          >
            {isSavingDraft ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.actionButtonLabel}>下書きを保存</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton, isSubmitting && styles.actionButtonDisabled]}
            onPress={() => handleAction('submitted')}
            disabled={isSubmitting || isSavingDraft}
          >
            {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonLabel}>提出する</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.sectionTitle}>当月の提出状況</Text>
          <View style={styles.monthNavRow}>
            <TouchableOpacity onPress={() => handleMonthChange(-1)} style={styles.pillButton}>
              <Text style={styles.pillButtonLabel}>{'<'}</Text>
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity onPress={() => handleMonthChange(1)} style={styles.pillButton}>
              <Text style={styles.pillButtonLabel}>{'>'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {loadingRequests ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color="#2563eb" />
            <Text style={styles.helperText}>提出状況を読み込み中...</Text>
          </View>
        ) : summaryItems.length === 0 ? (
          <Text style={styles.helperText}>この月の提出はまだありません。</Text>
        ) : (
          summaryItems.map((item) => {
            const isSelected = item.date === selectedDate;
            return (
              <TouchableOpacity
                key={item.date}
                onPress={() => setSelectedDate(item.date)}
                style={[styles.summaryRow, isSelected && styles.summaryRowActive]}
              >
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryDate}>{formatDisplayDate(item.date)}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      item.status === 'submitted' ? styles.statusBadgeSubmitted : styles.statusBadgeDraft,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusBadgeLabel,
                        item.status === 'submitted' ? styles.statusBadgeLabelSubmitted : styles.statusBadgeLabelDraft,
                      ]}
                    >
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>
                <Text style={styles.summaryDetail}>{item.detail}</Text>
              </TouchableOpacity>
            );
          })
        )}
      </View>
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
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#94a3b8',
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  dateLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  pillButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#273449',
  },
  pillButtonLabel: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 16,
  },
  modeSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#172036',
    borderRadius: 999,
    padding: 4,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 8,
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#2563eb',
  },
  modeButtonLabel: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  modeButtonLabelActive: {
    color: '#fff',
  },
  inputBlock: {
    gap: 8,
  },
  textArea: {
    minHeight: 120,
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    textAlignVertical: 'top',
    fontSize: 16,
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  currentStatus: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  currentSummary: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  errorText: {
    color: '#f87171',
    fontSize: 13,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  actionButtonLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  primaryButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  loadingBlock: {
    gap: 12,
    alignItems: 'center',
  },
  summaryRow: {
    backgroundColor: '#172036',
    borderRadius: 12,
    padding: 16,
    gap: 6,
    marginTop: 8,
  },
  summaryRowActive: {
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryDate: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  summaryDetail: {
    color: '#cbd5f5',
    fontSize: 13,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusBadgeDraft: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  statusBadgeSubmitted: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBadgeLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusBadgeLabelDraft: {
    color: '#60a5fa',
  },
  statusBadgeLabelSubmitted: {
    color: '#34d399',
  },
  monthNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  monthLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  toast: {
    borderRadius: 12,
    padding: 12,
  },
  toastText: {
    color: '#0f172a',
    fontWeight: '600',
    textAlign: 'center',
  },
  toastSuccess: {
    backgroundColor: '#bbf7d0',
  },
  toastError: {
    backgroundColor: '#fecaca',
  },
});

export default SubmitShiftScreen;

