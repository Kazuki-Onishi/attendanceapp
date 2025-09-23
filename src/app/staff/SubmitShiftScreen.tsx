import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import { useAppSelector } from '@/store';
import { selectResolvedSelectedStoreId } from '@/store/selectors/staffSelectors';
import { useShiftWindow, formatMonthKey } from '@/features/shifts/hooks/useShiftWindow';
import { useDayRequests } from '@/features/shifts/hooks/useDayRequests';
import { parseTimeRange } from '@/features/shifts/lib/parseTimeRange';
import { mergeEntries, type ShiftEntry } from '@/features/shifts/lib/mergeEntries';
import { entriesToSlots } from '@/features/shifts/lib/slotBrush';
import TimeRangeInput from '@/components/TimeRangeInput';
import DayCell from '@/components/DayCell';
import StorePill from '@/components/StorePill';
import OverwriteDialog from '@/components/OverwriteDialog';
import { useStorePalette } from '@/features/stores/hooks/useStorePalette';

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

type ToastState = {
  type: 'success' | 'error';
  message: string;
};

type SubmitShiftScreenProps = {
  onRequestJoin: () => void;
  isStoreSelected: boolean;
  hasStoreRoles: boolean;
};

const toDate = (value: string): Date => {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(year, month - 1, day);
};

const formatDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const compareDate = (left: string, right: string): number => toDate(left).getTime() - toDate(right).getTime();

const clampDate = (target: Date, start: string, end: string): string => {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (target.getTime() < startDate.getTime()) {
    return start;
  }
  if (target.getTime() > endDate.getTime()) {
    return end;
  }
  return formatDate(target);
};

const enumerateDates = (start: string, end: string): string[] => {
  const days: string[] = [];
  let cursor = toDate(start);
  const endDate = toDate(end);

  while (cursor.getTime() <= endDate.getTime()) {
    days.push(formatDate(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }

  return days;
};

const SubmitShiftScreen: React.FC<SubmitShiftScreenProps> = ({
  onRequestJoin,
  isStoreSelected,
  hasStoreRoles,
}) => {
  const auth = useAppSelector((state) => state.auth);
  const availableStores = useAppSelector((state) => state.store.availableStores);
  const resolvedStoreId = useAppSelector(selectResolvedSelectedStoreId);
  const uid = auth.user?.uid ?? null;

  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const submitLabels = useMemo(() => staffLabels.submit ?? {}, [staffLabels]);
  const joinLabels = useMemo(() => staffLabels.join ?? {}, [staffLabels]);
  const selectLabels = useMemo(() => staffLabels.select ?? {}, [staffLabels]);
  const windowLabels = useMemo(() => submitLabels.window ?? {}, [submitLabels]);
  const toastLabels = useMemo(() => submitLabels.toast ?? {}, [submitLabels]);

  const today = useMemo(() => new Date(), []);
  const [monthKey, setMonthKey] = useState<string>(formatMonthKey(today));
  const { startDate, endDate, locked, adminMessage, loading: windowLoading } = useShiftWindow(monthKey);
  const { days, loadDay, saveDayDiff, removeDay, isSaving, lastError } = useDayRequests({
    userId: uid,
    monthKey,
  });

  const [focusedDate, setFocusedDate] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>('');
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    if (lastError) {
      showToast('error', lastError);
    }
  }, [lastError, showToast]);

  useEffect(() => {
    if (startDate) {
      const inferredKey = `${startDate.slice(0, 4)}${startDate.slice(5, 7)}`;
      if (inferredKey !== monthKey) {
        setMonthKey(inferredKey);
      }
    }
  }, [startDate, monthKey]);

  useEffect(() => {
    if (!startDate || !endDate) {
      return;
    }

    setFocusedDate((prev) => {
      if (prev && compareDate(prev, startDate) >= 0 && compareDate(prev, endDate) <= 0) {
        return prev;
      }
      return clampDate(today, startDate, endDate);
    });
  }, [startDate, endDate, today]);

  const windowDates = useMemo(() => {
    if (!startDate || !endDate) {
      return [];
    }
    return enumerateDates(startDate, endDate);
  }, [startDate, endDate]);

  const paletteStoreIds = useMemo(() => {
    const ids = new Set<string>();
    availableStores.forEach((store) => ids.add(store.id));
    Object.values(days).forEach((state) => {
      state.entries.forEach((entry) => ids.add(entry.storeId));
    });
    return Array.from(ids);
  }, [availableStores, days]);

  const palette = useStorePalette(paletteStoreIds);

  const [activeStoreId, setActiveStoreId] = useState<string | null>(
    resolvedStoreId ?? availableStores[0]?.id ?? null,
  );

  useEffect(() => {
    const fallback = resolvedStoreId ?? availableStores[0]?.id ?? null;
    setActiveStoreId((prev) => prev ?? fallback);
  }, [resolvedStoreId, availableStores]);

  const focusedDayState = focusedDate ? days[focusedDate] : undefined;
  const focusedEntries = useMemo(() => focusedDayState?.entries ?? [], [focusedDayState]);

  const handleSelectDate = useCallback(
    async (date: string) => {
      setFocusedDate(date);
      await loadDay(date);
      setInputValue('');
    },
    [loadDay],
  );

  const handleAddEntry = useCallback(
    async (value: string) => {
      if (!focusedDate) {
        return;
      }
      if (!activeStoreId) {
        Alert.alert(
          submitLabels.storeMissingTitle ?? 'Store required',
          submitLabels.storeMissingBody ?? 'Select a store before adding availability.',
        );
        return;
      }
      const parsed = parseTimeRange(value);
      if (!parsed) {
        Alert.alert(
          submitLabels.validationPlaceholder ?? 'Invalid time range',
          submitLabels.inputHelper ?? 'Try formats like 10-18 or 10:00-18:00.',
        );
        return;
      }
      if (locked) {
        showToast('error', submitLabels.lockedMessage ?? 'Submission window is locked.');
        return;
      }

      const existing = await loadDay(focusedDate);
      const next = mergeEntries([
        ...(existing?.entries ?? focusedEntries),
        { storeId: activeStoreId, start: parsed.start, end: parsed.end },
      ]);
      await saveDayDiff(focusedDate, next);
      setInputValue('');
      showToast('success', toastLabels.saved ?? 'Saved.');
    },
    [focusedDate, activeStoreId, locked, loadDay, focusedEntries, saveDayDiff, submitLabels, toastLabels, showToast],
  );

  const focusNextDay = useCallback(() => {
    if (!focusedDate || !endDate) {
      return;
    }
    const nextDate = new Date(toDate(focusedDate).getTime() + 86_400_000);
    const next = formatDate(nextDate);
    if (compareDate(next, endDate) <= 0) {
      handleSelectDate(next);
    }
  }, [focusedDate, endDate, handleSelectDate]);

  const handleApplyTemplate = useCallback(
    async (templateText: string) => {
      if (!focusedDate) {
        return;
      }
      if (!templateText.trim()) {
        return;
      }
      const parsed = parseTimeRange(templateText);
      if (!parsed) {
        Alert.alert(
          submitLabels.validationPlaceholder ?? 'Invalid time range',
          submitLabels.inputHelper ?? 'Try formats like 10-18 or 10:00-18:00.',
        );
        return;
      }
      const existing = await loadDay(focusedDate);
      if (!activeStoreId) {
        Alert.alert(
          submitLabels.storeMissingTitle ?? 'Store required',
          submitLabels.storeMissingBody ?? 'Select a store before applying a template.',
        );
        return;
      }
      if ((existing?.entries?.length ?? 0) > 0) {
        const confirmed = await OverwriteDialog.open({
          title: submitLabels.overwriteTitle ?? 'Overwrite availability?',
          message:
            submitLabels.overwriteBody ??
            'Existing entries will be replaced by the template. Continue?',
          confirmText: submitLabels.overwriteConfirm ?? 'Overwrite',
          cancelText: submitLabels.overwriteCancel ?? 'Keep',
        });
        if (!confirmed) {
          return;
        }
      }
      const baseEntries = existing?.entries ?? [];
      const next = mergeEntries([
        ...baseEntries.filter((entry) => entry.storeId !== activeStoreId),
        { storeId: activeStoreId, start: parsed.start, end: parsed.end },
      ]);
      await saveDayDiff(focusedDate, next);
      showToast('success', submitLabels.templateApplied ?? 'Template applied.');
      focusNextDay();
    },
    [focusedDate, activeStoreId, loadDay, saveDayDiff, submitLabels, showToast, focusNextDay],
  );

  const handleRemoveEntry = useCallback(
    async (entry: ShiftEntry) => {
      if (!focusedDate) {
        return;
      }
      if (locked) {
        showToast('error', submitLabels.lockedMessage ?? 'Submission window is locked.');
        return;
      }
      const filtered = focusedEntries.filter(
        (item) =>
          !(
            item.storeId === entry.storeId &&
            item.start === entry.start &&
            item.end === entry.end &&
            (item.note ?? '') === (entry.note ?? '')
          ),
      );
      await saveDayDiff(focusedDate, filtered);
      showToast('success', submitLabels.entryRemoved ?? 'Entry removed.');
    },
    [focusedDate, locked, focusedEntries, saveDayDiff, submitLabels, showToast],
  );

  const handleClearDay = useCallback(async () => {
    if (!focusedDate) {
      return;
    }
    if ((focusedEntries.length ?? 0) === 0) {
      return;
    }
    const confirmed = await OverwriteDialog.open({
      title: submitLabels.clearTitle ?? 'Clear this day?',
      message:
        submitLabels.clearBody ?? 'All entries for this day will be removed. This action cannot be undone.',
      confirmText: submitLabels.clearConfirm ?? 'Clear',
      cancelText: submitLabels.clearCancel ?? 'Cancel',
    });
    if (!confirmed) {
      return;
    }
    await removeDay(focusedDate);
    showToast('success', submitLabels.cleared ?? 'Cleared.');
  }, [focusedDate, focusedEntries, removeDay, submitLabels, showToast]);

  const showJoinState = !hasStoreRoles;
  const showSelectState = hasStoreRoles && !isStoreSelected;
  const showDisabledState = showJoinState || showSelectState;

  const disabledTitle = showSelectState
    ? selectLabels.heading ?? 'Select a store'
    : joinLabels.heading ?? 'No store memberships yet';
  const disabledDescription = showSelectState
    ? selectLabels.description ?? 'Choose from the stores assigned by your manager.'
    : joinLabels.description ?? 'Send a join request and you can use the store after approval.';
  const disabledCtaLabel = joinLabels.cta ?? 'Join a store';

  const monthLabel = useMemo(() => {
    if (!startDate) {
      return '';
    }
    const date = toDate(startDate);
    return `${date.getFullYear()} / ${String(date.getMonth() + 1).padStart(2, '0')}`;
  }, [startDate]);

  const todaysSlots = useMemo(() => entriesToSlots(focusedEntries), [focusedEntries]);

  return (
    <View style={styles.container}>
      {toast ? (
        <View style={[styles.toast, toast.type === 'success' ? styles.toastSuccess : styles.toastError]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      ) : null}

      {showDisabledState ? (
        <View style={styles.disabledCard}>
          <Text style={styles.disabledTitle}>{disabledTitle}</Text>
          <Text style={styles.disabledDescription}>{disabledDescription}</Text>
          <TouchableOpacity style={styles.disabledButton} onPress={onRequestJoin}>
            <Text style={styles.disabledButtonLabel}>{disabledCtaLabel}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!showDisabledState ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{submitLabels.title ?? 'Shift submission'}</Text>
              {windowLoading ? <ActivityIndicator color="#38bdf8" /> : null}
            </View>
            {startDate && endDate ? (
              <Text style={styles.subtitle}>
                {(windowLabels.rangePrefix ?? 'Submission window:') + ` ${startDate} 〜 ${endDate}`}
              </Text>
            ) : (
              <Text style={styles.subtitle}>{windowLabels.missing ?? 'No submission window configured.'}</Text>
            )}
            {locked ? (
              <Text style={styles.lockedBanner}>
                {submitLabels.lockedMessage ?? 'This submission window is locked. Contact an administrator.'}
              </Text>
            ) : null}
            {adminMessage ? <Text style={styles.adminMessage}>{adminMessage}</Text> : null}
          </View>

          {windowDates.length ? (
            <View style={styles.card}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthLabel}>{monthLabel}</Text>
              </View>
              <View style={styles.weekRow}>
                {WEEK_LABELS.map((label) => (
                  <Text key={label} style={styles.weekLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.daysGrid}>
                {windowDates.map((date) => (
                  <DayCell
                    key={date}
                    date={date}
                    onPress={handleSelectDate}
                    isFocused={date === focusedDate}
                    entries={days[date]?.entries ?? []}
                    stores={palette}
                    disabled={locked}
                    isToday={date === formatDate(today)}
                    pending={Boolean(days[date]?.pending)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {focusedDate ? (
            <View style={styles.card}>
              <View style={styles.focusHeader}>
                <View>
                  <Text style={styles.focusDate}>{focusedDate}</Text>
                  <Text style={styles.focusHelper}>
                    {submitLabels.focusHelper ?? 'Add availability ranges for this day.'}
                  </Text>
                </View>
                {focusedEntries.length ? (
                  <TouchableOpacity
                    onPress={handleClearDay}
                    style={[styles.clearButton, (locked || isSaving) && styles.clearButtonDisabled]}
                    disabled={locked || isSaving}
                  >
                    <Text style={styles.clearButtonLabel}>{submitLabels.clearLabel ?? 'Clear day'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.storePillsRow}>
                {availableStores.map((store) => (
                  <StorePill
                    key={store.id}
                    label={store.nameShort ?? store.nameOfficial ?? store.id}
                    color={palette[store.id]?.color}
                    selected={activeStoreId === store.id}
                    onPress={() => setActiveStoreId(store.id)}
                    disabled={locked}
                  />
                ))}
              </View>

              <TimeRangeInput
                value={inputValue}
                onChangeText={setInputValue}
                onSubmit={handleAddEntry}
                onApplyTemplate={handleApplyTemplate}
                disabled={locked || isSaving}
                isSaving={isSaving}
                placeholder={submitLabels.inputPlaceholder ?? '例: 10-18 / 10:30-18'}
              />

              {focusedEntries.length ? (
                <View style={styles.entriesList}>
                  <Text style={styles.entriesTitle}>{submitLabels.entriesTitle ?? 'Registered entries'}</Text>
                  {focusedEntries.map((entry) => {
                    const store = availableStores.find((item) => item.id === entry.storeId);
                    const entryLabel = `${entry.start} - ${entry.end}`;
                    return (
                      <View key={`${entry.storeId}-${entry.start}-${entry.end}`} style={styles.entryRow}>
                        <View style={styles.entryStore}>
                          <View
                            style={[styles.entryDot, { backgroundColor: palette[entry.storeId]?.color ?? '#38bdf8' }]}
                          />
                          <Text style={styles.entryStoreLabel}>
                            {store?.nameShort ?? store?.nameOfficial ?? entry.storeId}
                          </Text>
                        </View>
                        <Text style={styles.entryTime}>{entryLabel}</Text>
                        <TouchableOpacity
                          onPress={() => handleRemoveEntry(entry)}
                          style={[styles.entryRemoveButton, (locked || isSaving) && styles.entryRemoveDisabled]}
                          disabled={locked || isSaving}
                        >
                          <Text style={styles.entryRemoveLabel}>{submitLabels.removeLabel ?? 'Remove'}</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.emptyEntries}>{submitLabels.focusEmpty ?? 'No entries registered for this day.'}</Text>
              )}
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.slotTitle}>{submitLabels.slotPreview ?? 'Slot preview (beta)'}</Text>
            <Text style={styles.slotHelper}>
              {submitLabels.slotHelper ?? 'Brush selection uses 30-minute slots. Preview shows current normalised slots.'}
            </Text>
            <View style={styles.slotGrid}>
              {todaysSlots.map((slot) => (
                <View
                  key={slot.index}
                  style={[styles.slotCell, slot.storeId ? styles.slotCellActive : null]}
                />
              ))}
            </View>
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 80,
    gap: 18,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#cbd5f5',
    fontSize: 14,
  },
  lockedBanner: {
    backgroundColor: '#7f1d1d',
    padding: 12,
    borderRadius: 12,
    color: '#fecaca',
    fontWeight: '600',
  },
  adminMessage: {
    backgroundColor: '#1f2937',
    padding: 12,
    borderRadius: 12,
    color: '#fbbf24',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekLabel: {
    width: '14.28%',
    textAlign: 'center',
    color: '#64748b',
    fontWeight: '600',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  focusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  focusDate: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  focusHelper: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 4,
  },
  storePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  entriesList: {
    gap: 12,
  },
  entriesTitle: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111b2e',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  entryStore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  entryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  entryStoreLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  entryTime: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  entryRemoveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#b91c1c',
  },
  entryRemoveDisabled: {
    opacity: 0.6,
  },
  entryRemoveLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  emptyEntries: {
    color: '#64748b',
    fontStyle: 'italic',
  },
  clearButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1f2937',
  },
  clearButtonDisabled: {
    opacity: 0.5,
  },
  clearButtonLabel: {
    color: '#f87171',
    fontWeight: '700',
  },
  slotTitle: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  slotHelper: {
    color: '#94a3b8',
    fontSize: 13,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  slotCell: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: '#111b2e',
  },
  slotCellActive: {
    backgroundColor: '#2563eb',
  },
  disabledCard: {
    margin: 24,
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    gap: 12,
  },
  disabledTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  disabledDescription: {
    color: '#cbd5f5',
    fontSize: 14,
  },
  disabledButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  disabledButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: 16,
    padding: 14,
    borderRadius: 12,
    zIndex: 10,
  },
  toastSuccess: {
    backgroundColor: '#166534',
  },
  toastError: {
    backgroundColor: '#7f1d1d',
  },
  toastText: {
    color: '#f8fafc',
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default SubmitShiftScreen;
