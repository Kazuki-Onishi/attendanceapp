import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import { useAppSelector } from '@/store';
import {
  getStore,
  listStoreMembers,
  listStoresForUser,
  type Store,
  type StoreMember,
} from '@/features/stores/api';

const DAYS_IN_WEEK = 7;
const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0);
const addMonths = (date: Date, diff: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + diff, 1);
const formatMonthLabel = (anchor: Date): string =>
  `${anchor.getFullYear()}/${String(anchor.getMonth() + 1).padStart(2, '0')}`;

const formatTimeRange = (start?: string | null, end?: string | null): string =>
  `${start ?? '--:--'} - ${end ?? '--:--'}`;

const parseTimeToMinutes = (time?: string | null): number => {
  if (!time) {
    return Number.POSITIVE_INFINITY;
  }
  const [hourPart, minutePart] = time.split(':');
  const hours = Number.parseInt(hourPart, 10);
  const minutes = Number.parseInt(minutePart ?? '0', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return Number.POSITIVE_INFINITY;
  }
  return hours * 60 + minutes;
};

const formatRequestStatus = (status?: string | null): string => {
  if (!status) {
    return 'Requested';
  }
  const normalized = status.toLowerCase();
  switch (normalized) {
    case 'pending':
      return 'Pending approval';
    case 'approved':
      return 'Approved';
    case 'rejected':
    case 'denied':
      return 'Rejected';
    case 'cancelled':
    case 'canceled':
      return 'Canceled';
    default:
      return status;
  }
};

type ShiftEntry = {
  id: string;
  date: string;
  storeId: string;
  userId: string;
  startTime?: string | null;
  endTime?: string | null;
};

type ShiftRequestEntry = {
  id: string;
  date: string;
  storeId: string;
  userId: string;
  startTime?: string | null;
  endTime?: string | null;
  status?: string | null;
};

type ShiftEditionByDate = Record<string, ShiftEntry[]>;
type ShiftRequestByDate = Record<string, ShiftRequestEntry[]>;

type CombinedShiftEntry =
  | (ShiftEntry & { kind: 'confirmed' })
  | (ShiftRequestEntry & { kind: 'request' });

const StoreShiftsScreen: React.FC = () => {
  const storeAuth = useAppSelector((state) => state.storeAuth);
  const auth = useAppSelector((state) => state.auth);
  const selectedStoreStateId = useAppSelector((state) => state.store.selectedStoreId);
  const kioskStoreId = storeAuth.storeId;

  const [stores, setStores] = useState<Store[]>([]);
  const [storeFilter, setStoreFilter] = useState<string | null>(
    () => kioskStoreId ?? selectedStoreStateId ?? null,
  );
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => formatDate(new Date()));
  const [shiftsByDate, setShiftsByDate] = useState<ShiftEditionByDate>({});
  const [shiftRequestsByDate, setShiftRequestsByDate] = useState<ShiftRequestByDate>({});
  const [members, setMembers] = useState<Map<string, StoreMember>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingShifts, setLoadingShifts] = useState(false);

  const userId = auth.user?.uid ?? null;
  const todayStr = formatDate(new Date());

  useEffect(() => {
    if (kioskStoreId && storeFilter !== kioskStoreId) {
      setStoreFilter(kioskStoreId);
    }
  }, [kioskStoreId, storeFilter]);

  useEffect(() => {
    if (!kioskStoreId && selectedStoreStateId && storeFilter !== selectedStoreStateId) {
      setStoreFilter(selectedStoreStateId);
    }
  }, [kioskStoreId, selectedStoreStateId, storeFilter]);

  useEffect(() => {
    let active = true;

    if (!kioskStoreId && !userId) {
      setStores([]);
      setStoreFilter(null);
      setLoadingStores(false);
      return () => {
        active = false;
      };
    }

    setLoadingStores(true);

    const loadStores = async () => {
      try {
        if (kioskStoreId) {
          const store = await getStore(kioskStoreId);
          if (!active) {
            return;
          }
          if (store) {
            setStores([store]);
          } else {
            setStores([]);
            setError((prev) => prev ?? 'Failed to load store information.');
          }
          return;
        }

        if (!userId) {
          if (!active) {
            return;
          }
          setStores([]);
          setStoreFilter(null);
          return;
        }

        const result = await listStoresForUser(userId);
        if (!active) {
          return;
        }
        setStores(result);
      } catch (err) {
        if (!active) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load store information.';
        setError((prev) => prev ?? message);
        setStores([]);
      } finally {
        if (active) {
          setLoadingStores(false);
        }
      }
    };

    loadStores();

    return () => {
      active = false;
    };
  }, [userId, kioskStoreId]);

  useEffect(() => {
    if (!stores.length) {
      if (!kioskStoreId) {
        setStoreFilter(null);
      }
      return;
    }

    if (storeFilter && stores.some((store) => store.id === storeFilter)) {
      return;
    }

    const fallback = [kioskStoreId, selectedStoreStateId, stores[0]?.id].find(
      (candidate): candidate is string =>
        Boolean(candidate && stores.some((store) => store.id === candidate)),
    );

    if (fallback) {
      setStoreFilter(fallback);
    } else {
      setStoreFilter(stores[0].id);
    }
  }, [stores, storeFilter, kioskStoreId, selectedStoreStateId]);

  useEffect(() => {
    if (!stores.length) {
      setMembers(new Map());
      return;
    }

    let active = true;

    const loadMembers = async () => {
      try {
        const results = await Promise.all(
          stores.map((store) => listStoreMembers(store.id)),
        );
        if (!active) {
          return;
        }
        const map = new Map<string, StoreMember>();
        results.flat().forEach((member) => {
          map.set(member.userId, member);
        });
        setMembers(map);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load staff information.';
        if (active) {
          setError((prev) => prev ?? message);
        }
      }
    };

    loadMembers();

    return () => {
      active = false;
    };
  }, [stores]);

  useEffect(() => {
    if (!storeFilter) {
      setShiftsByDate({});
      setShiftRequestsByDate({});
      setLoadingShifts(false);
      return;
    }

    const start = startOfMonth(monthAnchor);
    const end = endOfMonth(monthAnchor);
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    setLoadingShifts(true);
    setShiftsByDate({});
    setShiftRequestsByDate({});

    const db = firestore();
    const shiftsRef = collection(db, 'shiftEditions');
    const requestsRef = collection(db, 'shiftRequests');

    const shiftQuery = query(
      shiftsRef,
      where('storeId', '==', storeFilter),
      where('date', '>=', startStr),
      where('date', '<=', endStr),
      orderBy('date', 'asc'),
    );

    const requestQuery = query(
      requestsRef,
      where('storeId', '==', storeFilter),
      where('date', '>=', startStr),
      where('date', '<=', endStr),
      orderBy('date', 'asc'),
    );

    const unsubscribeShifts = onSnapshot(
      shiftQuery,
      (snapshot) => {
        const grouped: ShiftEditionByDate = {};
        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data() as ShiftEntry;
          const entry: ShiftEntry = {
            id: docSnapshot.id,
            date: data.date,
            storeId: data.storeId,
            userId: data.userId,
            startTime: data.startTime ?? null,
            endTime: data.endTime ?? null,
          };
          if (!entry.date) {
            return;
          }
          if (!grouped[entry.date]) {
            grouped[entry.date] = [];
          }
          grouped[entry.date].push(entry);
        });
        setShiftsByDate(grouped);
        setLoadingShifts(false);
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Failed to load shifts.';
        setError((prev) => prev ?? message);
        setLoadingShifts(false);
      },
    );

    const unsubscribeRequests = onSnapshot(
      requestQuery,
      (snapshot) => {
        const grouped: ShiftRequestByDate = {};
        snapshot.docs.forEach((docSnapshot) => {
          const data = docSnapshot.data() as ShiftRequestEntry;
          const entry: ShiftRequestEntry = {
            id: docSnapshot.id,
            date: data.date,
            storeId: data.storeId,
            userId: data.userId,
            startTime: data.startTime ?? null,
            endTime: data.endTime ?? null,
            status: data.status ?? null,
          };
          if (!entry.date) {
            return;
          }
          if (!grouped[entry.date]) {
            grouped[entry.date] = [];
          }
          grouped[entry.date].push(entry);
        });
        setShiftRequestsByDate(grouped);
      },
      (err) => {
        const message =
          err instanceof Error ? err.message : 'Failed to load shift requests.';
        setError((prev) => prev ?? message);
      },
    );

    return () => {
      unsubscribeShifts();
      unsubscribeRequests();
    };
  }, [monthAnchor, storeFilter]);

  useEffect(() => {
    const anchorMonth = monthAnchor.getMonth();
    const anchorYear = monthAnchor.getFullYear();
    const selected = new Date(selectedDate);
    if (
      selected.getMonth() !== anchorMonth ||
      selected.getFullYear() !== anchorYear
    ) {
      setSelectedDate(formatDate(monthAnchor));
    }
  }, [monthAnchor, selectedDate]);

  const combineDayEntries = useCallback(
    (date: string): CombinedShiftEntry[] => {
      const confirmed = shiftsByDate[date] ?? [];
      const requests = shiftRequestsByDate[date] ?? [];

      const merged: CombinedShiftEntry[] = [
        ...confirmed.map((entry) => ({ ...entry, kind: 'confirmed' as const })),
        ...requests.map((entry) => ({ ...entry, kind: 'request' as const })),
      ];

      return merged.sort((a, b) => {
        const diff = parseTimeToMinutes(a.startTime) - parseTimeToMinutes(b.startTime);
        if (diff !== 0) {
          return diff;
        }
        if (a.kind === b.kind) {
          return a.userId.localeCompare(b.userId);
        }
        return a.kind === 'confirmed' ? -1 : 1;
      });
    },
    [shiftRequestsByDate, shiftsByDate],
  );

  const todayEntries = useMemo(
    () => combineDayEntries(todayStr),
    [combineDayEntries, todayStr],
  );
  const selectedDayEntries = useMemo(
    () => combineDayEntries(selectedDate),
    [combineDayEntries, selectedDate],
  );

  const monthLabel = formatMonthLabel(monthAnchor);

  const calendarCells = useMemo(() => {
    const first = startOfMonth(monthAnchor);
    const last = endOfMonth(monthAnchor);
    const leading = first.getDay();
    const totalDays = last.getDate();

    const cells: Array<{
      label: string;
      date: string | null;
      isToday: boolean;
      confirmedCount: number;
      requestCount: number;
    }> = [];

    for (let i = 0; i < leading; i += 1) {
      cells.push({
        label: '',
        date: null,
        isToday: false,
        confirmedCount: 0,
        requestCount: 0,
      });
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const dayDate = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), day);
      const dateStr = formatDate(dayDate);
      const confirmedCount = shiftsByDate[dateStr]?.length ?? 0;
      const requestCount = shiftRequestsByDate[dateStr]?.length ?? 0;

      cells.push({
        label: String(day),
        date: dateStr,
        isToday: dateStr === todayStr,
        confirmedCount,
        requestCount,
      });
    }

    while (cells.length % DAYS_IN_WEEK !== 0) {
      cells.push({
        label: '',
        date: null,
        isToday: false,
        confirmedCount: 0,
        requestCount: 0,
      });
    }

    return cells;
  }, [monthAnchor, shiftRequestsByDate, shiftsByDate, todayStr]);

  const storeLookup = useMemo(() => {
    const map = new Map<string, Store>();
    stores.forEach((store) => map.set(store.id, store));
    return map;
  }, [stores]);

  const showStoreFilter = stores.length > 1;
  const showStoreName = stores.length > 1;

  const renderShiftRow = (entry: CombinedShiftEntry) => {
    const member = members.get(entry.userId);
    const store = storeLookup.get(entry.storeId);
    const isRequest = entry.kind === 'request';
    const timeLabel = formatTimeRange(entry.startTime, entry.endTime);
    const statusLabel = isRequest ? formatRequestStatus(entry.status) : null;

    return (
      <View
        key={`${entry.kind}-${entry.id}`}
        style={[styles.shiftRow, isRequest && styles.shiftRowRequest]}
      >
        <View style={styles.shiftRowDetails}>
          <Text style={[styles.shiftName, isRequest && styles.shiftNameMuted]}>
            {member?.displayName ?? entry.userId}
          </Text>
          <Text style={[styles.shiftTime, isRequest && styles.shiftTimeMuted]}>{timeLabel}</Text>
          {isRequest && statusLabel ? (
            <Text style={styles.shiftRequestStatus}>Request: {statusLabel}</Text>
          ) : null}
        </View>
        {showStoreName ? (
          <Text style={[styles.shiftStore, isRequest && styles.shiftStoreMuted]}>
            {store?.nameShort ?? store?.nameOfficial ?? entry.storeId}
          </Text>
        ) : null}
      </View>
    );
  };

  if (!stores.length) {
    return (
      <View style={styles.loadingContainer}>
        {loadingStores ? (
          <ActivityIndicator color="#2563eb" />
        ) : (
          <Text style={styles.helper}>No stores have been registered.</Text>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.sectionTitle}>Today's shifts</Text>
      <View style={styles.card}>
        {loadingShifts ? (
          <ActivityIndicator color="#2563eb" />
        ) : !storeFilter ? (
          <Text style={styles.placeholder}>Select a store.</Text>
        ) : todayEntries.length ? (
          todayEntries.map(renderShiftRow)
        ) : (
          <Text style={styles.placeholder}>There are no shifts scheduled for today.</Text>
        )}
      </View>

      {showStoreFilter ? (
        <View style={styles.filterRow}>
          {stores.map((store) => {
            const isActive = storeFilter === store.id;
            return (
              <TouchableOpacity
                key={store.id}
                style={[styles.filterButton, isActive && styles.filterButtonActive]}
                onPress={() => {
                  if (!isActive) {
                    setStoreFilter(store.id);
                  }
                }}
                disabled={isActive}
              >
                <Text style={styles.filterLabel}>
                  {store.nameShort ?? store.nameOfficial}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.monthHeader}>
        <TouchableOpacity onPress={() => setMonthAnchor(addMonths(monthAnchor, -1))}>
          <Text style={styles.monthNav}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={styles.sectionTitle}>{monthLabel}</Text>
        <TouchableOpacity onPress={() => setMonthAnchor(addMonths(monthAnchor, 1))}>
          <Text style={styles.monthNav}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarContainer}>
        <View style={styles.calendarGrid}>
          {WEEK_LABELS.map((label) => (
            <Text key={label} style={[styles.calendarCell, styles.calendarHeader]}>
              {label}
            </Text>
          ))}
          {calendarCells.map((cell, index) => {
            const hasDot = cell.confirmedCount > 0 || cell.requestCount > 0;
            const dotStyle =
              cell.confirmedCount > 0
                ? styles.calendarDot
                : cell.requestCount > 0
                ? styles.calendarDotRequest
                : styles.calendarDot;
            return (
              <TouchableOpacity
                key={`calendar-${index}`}
                disabled={!cell.date}
                style={[
                  styles.calendarCell,
                  styles.calendarDay,
                  cell.date === selectedDate && styles.calendarDaySelected,
                ]}
                onPress={() => cell.date && setSelectedDate(cell.date)}
              >
                <Text
                  style={[
                    styles.calendarDayLabel,
                    cell.isToday && styles.calendarDayToday,
                    cell.date === selectedDate && styles.calendarDayLabelSelected,
                  ]}
                >
                  {cell.label}
                </Text>
                {hasDot ? <View style={dotStyle} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.dayDetail}>
          <Text style={styles.dayDetailTitle}>{selectedDate}</Text>
          <View style={styles.card}>
            {loadingShifts ? (
              <ActivityIndicator color="#2563eb" />
            ) : !storeFilter ? (
              <Text style={styles.placeholder}>Select a store.</Text>
            ) : selectedDayEntries.length ? (
              selectedDayEntries.map(renderShiftRow)
            ) : (
              <Text style={styles.placeholder}>No shifts on this day.</Text>
            )}
          </View>
        </View>
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
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  helper: {
    color: '#94a3b8',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  placeholder: {
    color: '#cbd5f5',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterButton: {
    backgroundColor: '#1e293b',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterButtonActive: {
    backgroundColor: '#2563eb',
  },
  filterLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  error: {
    color: '#f87171',
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthNav: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  calendarContainer: {
    gap: 16,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${100 / DAYS_IN_WEEK}%`,
    alignItems: 'center',
    paddingVertical: 12,
  },
  calendarHeader: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  calendarDay: {
    borderRadius: 12,
  },
  calendarDaySelected: {
    backgroundColor: '#2563eb',
  },
  calendarDayLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  calendarDayLabelSelected: {
    color: '#fff',
  },
  calendarDayToday: {
    textDecorationLine: 'underline',
  },
  calendarDot: {
    marginTop: 6,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#38bdf8',
  },
  calendarDotRequest: {
    marginTop: 6,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#94a3b8',
  },
  dayDetail: {
    gap: 12,
  },
  dayDetailTitle: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  shiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  shiftRowRequest: {
    backgroundColor: 'rgba(148, 163, 184, 0.18)',
  },
  shiftRowDetails: {
    flex: 1,
    gap: 4,
  },
  shiftName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  shiftNameMuted: {
    color: '#e2e8f0',
  },
  shiftTime: {
    color: '#cbd5f5',
  },
  shiftTimeMuted: {
    color: '#94a3b8',
  },
  shiftRequestStatus: {
    color: '#94a3b8',
    fontSize: 12,
  },
  shiftStore: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  shiftStoreMuted: {
    color: '#cbd5f5',
  },
});

export default StoreShiftsScreen;
