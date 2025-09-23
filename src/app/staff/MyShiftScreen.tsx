import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import labels from '@/i18n/ja.json';
import { getStore, type Store } from '@/features/stores/api';
import { firestore } from '@/lib/firebase';
import { useAppSelector } from '@/store';
import { selectResolvedSelectedStoreId } from '@/store/selectors/staffSelectors';
import { resolveEffectiveWage, type WageSource } from '@/utils/wage';

const WEEK_LABELS = ['\u65e5', '\u6708', '\u706b', '\u6c34', '\u6728', '\u91d1', '\u571f'];

type ShiftEditionDoc = {
  date?: string;
  storeId?: string;
  userId?: string;
  startTime?: string | null;
  endTime?: string | null;
};

type ShiftEdition = {
  id: string;
  date: string;
  storeId: string;
  userId: string;
  startTime?: string | null;
  endTime?: string | null;
};

type WageDoc = WageSource & {
  hourlyWage1?: number | null;
};

type ShiftDay = {
  date: string;
  items: ShiftEdition[];
};

type MyShiftScreenProps = {
  onRequestJoin: () => void;
  isStoreSelected: boolean;
  hasStoreRoles: boolean;
};

const MyShiftScreen: React.FC<MyShiftScreenProps> = ({ onRequestJoin, isStoreSelected, hasStoreRoles }) => {
  const auth = useAppSelector((state) => state.auth);
  const resolvedStoreId = useAppSelector(selectResolvedSelectedStoreId);
  const uid = auth.user?.uid ?? null;
  const storeId = isStoreSelected ? resolvedStoreId : null;

  const staffLabels = labels.staff ?? ({} as Record<string, any>);
  const myShiftLabels = staffLabels.myShift ?? {};
  const joinLabels = staffLabels.join ?? {};
  const selectLabels = staffLabels.select ?? {};

  const showJoinState = !hasStoreRoles;
  const showSelectState = hasStoreRoles && !isStoreSelected;

  const [storeMeta, setStoreMeta] = useState<(Store & WageSource) | null>(null);
  const [memberWage, setMemberWage] = useState<WageSource | null>(null);
  const [personalWage, setPersonalWage] = useState<WageSource | null>(null);
  const [shifts, setShifts] = useState<ShiftEdition[]>([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDate(today));

  useEffect(() => {
    if (!storeId || showJoinState || showSelectState) {
      setStoreMeta(null);
      return;
    }

    getStore(storeId)
      .then((store) => {
        if (store) {
          setStoreMeta({ ...store, storeId });
        } else {
          setStoreMeta(null);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load store information.';
        setError((prev) => prev ?? message);
        setStoreMeta(null);
      });
  }, [storeId, showJoinState, showSelectState]);

  useEffect(() => {
    if (!uid || !storeId || showJoinState || showSelectState) {
      setMemberWage(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(firestore(), 'userStoreRoles', `${uid}_${storeId}`),
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as Partial<WageDoc>) : null;
        setMemberWage(toWageSource(data, storeId));
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Failed to load member settings.';
        setError((prev) => prev ?? message);
        setMemberWage(null);
      },
    );

    return () => unsubscribe();
  }, [uid, storeId, showJoinState, showSelectState]);

  useEffect(() => {
    if (!uid) {
      setPersonalWage(null);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(firestore(), 'users', uid),
      (snapshot) => {
        const data = snapshot.exists() ? (snapshot.data() as Partial<WageDoc>) : null;
        setPersonalWage(toWageSource(data, storeId));
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Failed to load personal settings.';
        setError((prev) => prev ?? message);
        setPersonalWage(null);
      },
    );

    return () => unsubscribe();
  }, [uid, storeId]);

  useEffect(() => {
    if (!uid || !storeId || showJoinState || showSelectState) {
      setShifts([]);
      setLoadingShifts(false);
      return;
    }

    const startStr = formatDate(startOfMonth(monthAnchor));
    const endStr = formatDate(endOfMonth(monthAnchor));

    setLoadingShifts(true);
    setError(null);

    const shiftsRef = collection(firestore(), 'shiftEditions');
    const shiftQuery = query(
      shiftsRef,
      where('storeId', '==', storeId),
      where('userId', '==', uid),
      where('date', '>=', startStr),
      where('date', '<=', endStr),
      orderBy('date', 'asc'),
    );

    const unsubscribe = onSnapshot(
      shiftQuery,
      (snapshot) => {
        const rows: ShiftEdition[] = snapshot.docs
          .map((docSnapshot) => {
            const data = docSnapshot.data() as ShiftEditionDoc;
            if (!data.date || !data.storeId || !data.userId) {
              return null;
            }
            return {
              id: docSnapshot.id,
              date: data.date,
              storeId: data.storeId,
              userId: data.userId,
              startTime: data.startTime ?? null,
              endTime: data.endTime ?? null,
            } as ShiftEdition;
          })
          .filter((entry): entry is ShiftEdition => Boolean(entry));

        setShifts(rows);
        setLoadingShifts(false);
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Failed to load shifts.';
        setError((prev) => prev ?? message);
        setShifts([]);
        setLoadingShifts(false);
      },
    );

    return () => unsubscribe();
  }, [uid, storeId, monthAnchor, showJoinState, showSelectState]);

  useEffect(() => {
    const selected = new Date(selectedDate);
    if (
      selected.getMonth() !== monthAnchor.getMonth() ||
      selected.getFullYear() !== monthAnchor.getFullYear()
    ) {
      setSelectedDate(formatDate(monthAnchor));
    }
  }, [monthAnchor, selectedDate]);

  const groupedShifts = useMemo<ShiftDay[]>(() => {
    const map = new Map<string, ShiftEdition[]>();
    shifts.forEach((shift) => {
      if (!map.has(shift.date)) {
        map.set(shift.date, []);
      }
      map.get(shift.date)!.push(shift);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: [...items].sort((a, b) => {
          const aStart = a.startTime ?? '99:99';
          const bStart = b.startTime ?? '99:99';
          return aStart.localeCompare(bStart);
        }),
      }));
  }, [shifts]);

  const minutesToday = useMemo(() => {
    const todayKey = formatDate(new Date());
    return shifts
      .filter((shift) => shift.date === todayKey)
      .reduce((total, shift) => total + calcDurationMinutes(shift), 0);
  }, [shifts]);

  const effectiveWage = useMemo(() => resolveEffectiveWage(memberWage, personalWage, storeMeta), [memberWage, personalWage, storeMeta]);
  const estimatedTodayPay = useMemo(() => (minutesToday / 60) * effectiveWage, [minutesToday, effectiveWage]);
  const wageLabel = effectiveWage > 0 ? formatCurrency(effectiveWage) : '--';

  if (!uid) {
    return (
      <View style={styles.centered}>
        <Text style={styles.helper}>Your session has expired. Please sign in again.</Text>
      </View>
    );
  }

  if (showJoinState) {
    return (
      <View style={styles.centered}>
        <View style={styles.joinCard}>
          <Text style={styles.joinTitle}>{joinLabels.heading ?? 'No store memberships yet'}</Text>
          <Text style={styles.joinDescription}>
            {joinLabels.description ?? 'Join a store to view and submit shifts.'}
          </Text>
          <TouchableOpacity style={styles.joinButton} onPress={onRequestJoin}>
            <Text style={styles.joinButtonLabel}>{joinLabels.cta ?? 'Join a store'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (showSelectState) {
    return (
      <View style={styles.centered}>
        <View style={styles.joinCard}>
          <Text style={styles.joinTitle}>{selectLabels.heading ?? 'Select a store'}</Text>
          <Text style={styles.joinDescription}>
            {selectLabels.description ?? 'Once a manager assigns a store, it will appear here.'}
          </Text>
          <TouchableOpacity style={styles.joinButton} onPress={onRequestJoin}>
            <Text style={styles.joinButtonLabel}>{joinLabels.cta ?? 'Join a store'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!storeId) {
    return null;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>{myShiftLabels.summaryTitle ?? 'Estimated pay today'}</Text>
        <Text style={styles.summaryAmount}>{formatCurrency(estimatedTodayPay)}</Text>
        <Text style={styles.summaryMeta}>
          {(myShiftLabels.summaryMeta ?? 'Effective hourly wage {wage} / total hours {hours}')
            .replace('{wage}', wageLabel)
            .replace('{hours}', formatDuration(minutesToday))}
        </Text>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.sectionHeader}>
        <TouchableOpacity style={styles.monthButton} onPress={() => setMonthAnchor(addMonths(monthAnchor, -1))}>
          <Text style={styles.monthButtonLabel}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>{`${monthAnchor.getFullYear()}/${String(monthAnchor.getMonth() + 1).padStart(2, '0')}`}</Text>
        <TouchableOpacity style={styles.monthButton} onPress={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
          <Text style={styles.monthButtonLabel}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {loadingShifts ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.helper}>{myShiftLabels.loading ?? 'Loading shifts...'}</Text>
        </View>
      ) : groupedShifts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.helper}>{myShiftLabels.empty ?? 'No shifts have been registered this month.'}</Text>
        </View>
      ) : (
        groupedShifts.map((group) => (
          <View key={group.date} style={styles.dayCard}>
            <Text style={styles.dayTitle}>{formatDayLabel(group.date)}</Text>
            {group.items.map((shift) => (
              <View key={shift.id} style={styles.shiftRow}>
                <View style={styles.shiftTimes}>
                  <Text style={styles.shiftTimeLabel}>
                    {`${shift.startTime ?? '--:--'} - ${shift.endTime ?? '--:--'}`}
                  </Text>
                </View>
                <Text style={styles.shiftDuration}>{formatDuration(calcDurationMinutes(shift))}</Text>
              </View>
            ))}
          </View>
        ))
      )}

      <View style={styles.footerSpacer} />
    </ScrollView>
  );
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const addMonths = (date: Date, diff: number): Date => new Date(date.getFullYear(), date.getMonth() + diff, 1);

const parseTimeToMinutes = (value?: string | null): number | null => {
  if (!value) {
    return null;
  }
  const [hourPart, minutePart] = value.split(':');
  const hours = Number.parseInt(hourPart, 10);
  const minutes = Number.parseInt(minutePart ?? '0', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
};

const readWage = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const parseWageMap = (value: unknown): Record<string, number | null | undefined> | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) {
    return undefined;
  }
  const result: Record<string, number | null | undefined> = {};
  entries.forEach(([key, wage]) => {
    result[key] = readWage(wage);
  });
  return result;
};

const toWageSource = (source: Partial<WageDoc> | null | undefined, storeId: string | null): WageSource | null => {
  if (!source) {
    return null;
  }
  return {
    storeId,
    hourlyWageOverrides: parseWageMap(source.hourlyWageOverrides ?? source.wagesByStore ?? source.storeHourlyWages),
    hourlyWage: readWage(
      source.hourlyWageOverride ??
        source.hourlyWage ??
        source.wage ??
        source.hourlyWage1 ??
        null,
    ),
    wage: readWage(source.wage ?? null),
    hourlyWageOverride: readWage(source.hourlyWageOverride ?? null),
    defaultHourlyWage: readWage(source.defaultHourlyWage ?? null),
    baseHourlyWage: readWage(source.baseHourlyWage ?? null),
  };
};

const formatCurrency = (value: number): string => {
  const safe = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  return safe.toLocaleString('en-US', { style: 'currency', currency: 'JPY' });
};

const formatDuration = (minutes: number): string => {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '--';
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
};

const formatDayLabel = (dateStr: string): string => {
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    return dateStr;
  }
  const [year, month, day] = parts.map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  if (Number.isNaN(date.getTime())) {
    return dateStr;
  }
  const week = WEEK_LABELS[date.getUTCDay()] ?? '';
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')} (${week})`;
};

const calcDurationMinutes = (shift: ShiftEdition): number => {
  const start = parseTimeToMinutes(shift.startTime);
  const end = parseTimeToMinutes(shift.endTime);
  if (start === null || end === null) {
    return 0;
  }
  if (end >= start) {
    return end - start;
  }
  return end + 24 * 60 - start;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    padding: 24,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    padding: 24,
  },
  joinCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    gap: 12,
    maxWidth: 320,
  },
  joinTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  joinDescription: {
    color: '#cbd5f5',
    textAlign: 'center',
    lineHeight: 20,
  },
  joinButton: {
    alignSelf: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  joinButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  summaryCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    gap: 8,
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 14,
  },
  summaryAmount: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
  },
  summaryMeta: {
    color: '#94a3b8',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  monthButton: {
    backgroundColor: '#172036',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  monthButtonLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  loadingBlock: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    gap: 12,
    alignItems: 'center',
  },
  emptyState: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  dayCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  dayTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#273449',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  shiftTimes: {
    flexDirection: 'column',
    gap: 4,
  },
  shiftTimeLabel: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  shiftDuration: {
    color: '#94a3b8',
    fontSize: 13,
  },
  helper: {
    color: '#94a3b8',
    textAlign: 'center',
  },
  error: {
    color: '#f87171',
  },
  footerSpacer: {
    height: 32,
  },
});

export default MyShiftScreen;





