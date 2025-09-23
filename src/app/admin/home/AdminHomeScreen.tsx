import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { onSnapshot, orderBy, query, where } from 'firebase/firestore';

import {
  formatHM,
  isOnBreak,
  workedMinutes,
} from '@/features/attendance/selectors';
import { getAttendancesCollection, mapAttendance } from '@/features/attendance/api';
import type { Attendance } from '@/features/attendance/types';
import { listStoreMembers, listStoresForUser, type Store, type StoreMember } from '@/features/stores/api';
import { useAppSelector } from '@/store';

const REFRESH_INTERVAL_MS = 30_000;

const AdminHomeScreen: React.FC = () => {
  const auth = useAppSelector((state) => state.auth);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeFilter, setStoreFilter] = useState<'all' | string>('all');
  const [working, setWorking] = useState<Attendance[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, StoreMember>>(new Map());
  const [isLoadingStores, setIsLoadingStores] = useState(false);
  const [isRefreshingMembers, setIsRefreshingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  const userId = auth.user?.uid ?? null;

  const storeLookup = useMemo(() => {
    const map = new Map<string, Store>();
    stores.forEach((store) => map.set(store.id, store));
    return map;
  }, [stores]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!userId) {
      setStores([]);
      return;
    }

    let active = true;
    setError(null);
    setIsLoadingStores(true);
    listStoresForUser(userId)
      .then((list) => {
        if (!active) {
          return;
        }
        setStores(list);
        setStoreFilter((prev) => {
          if (list.length === 1 && prev === 'all') {
            return list[0].id;
          }
          return prev;
        });
      })
      .catch((err) => {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load stores.';
        setError(message);
      })
      .finally(() => {
        if (active) {
          setIsLoadingStores(false);
        }
      });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!stores.length) {
      setStoreFilter('all');
      return;
    }

    if (storeFilter !== 'all') {
      const exists = stores.some((store) => store.id === storeFilter);
      if (!exists) {
        setStoreFilter('all');
      }
    }
  }, [stores, storeFilter]);

  const hydrateMembers = async (storeIds: string[]) => {
    setError(null);
    const results = await Promise.all(
      storeIds.map(async (id) => {
        try {
          return await listStoreMembers(id);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to load members.';
          setError((prev) => prev ?? message);
          return [] as StoreMember[];
        }
      }),
    );

    const map = new Map<string, StoreMember>();
    results.flat().forEach((member) => {
      map.set(member.userId, member);
    });
    setMemberMap(map);
  };

  useEffect(() => {
    if (!stores.length) {
      setMemberMap(new Map());
      return;
    }

    let active = true;
    setIsRefreshingMembers(true);
    hydrateMembers(stores.map((store) => store.id))
      .catch(() => {
        /* error state handled in hydrateMembers */
      })
      .finally(() => {
        if (active) {
          setIsRefreshingMembers(false);
        }
      });

    return () => {
      active = false;
    };
  }, [stores]);

  useEffect(() => {
    const storeIds = storeFilter === 'all' ? stores.map((store) => store.id) : [storeFilter];

    if (!storeIds.length || (storeFilter !== 'all' && storeFilter === '')) {
      setWorking([]);
      return;
    }

    const constraints = [where('status', '==', 'open'), orderBy('clockIn', 'asc')];
    let q;

    if (storeFilter === 'all') {
      q = query(getAttendancesCollection(), ...constraints);
    } else {
      q = query(
        getAttendancesCollection(),
        where('storeId', '==', storeFilter),
        where('status', '==', 'open'),
        orderBy('clockIn', 'asc'),
      );
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records = snapshot.docs.map((doc) => mapAttendance(doc.id, doc.data() as any));
        setWorking(records);
      },
      (err) => {
        const message = err instanceof Error ? err.message : 'Failed to load attendance.';
        setError(message);
      },
    );

    return () => unsubscribe();
  }, [storeFilter, stores]);

  const renderItem = ({ item }: { item: Attendance }) => {
    const member = memberMap.get(item.userId);
    const onBreak = isOnBreak(item);
    const minutes = workedMinutes(item.clockIn, item.breaks, now);
    const duration = formatHM(minutes);
    const store = storeLookup.get(item.storeId);
    const storeLabel = store?.nameShort ?? store?.nameOfficial ?? item.storeId;
    const name = member?.displayName ?? item.userId;

    return (
      <View style={styles.row}>
        <View style={styles.rowDetails}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{storeLabel}</Text>
        </View>
        <Text style={styles.cell}>{item.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        <View style={styles.badgeCell}>{onBreak ? <Text style={styles.badge}>Break</Text> : null}</View>
        <Text style={styles.cell}>{duration}</Text>
      </View>
    );
  };

  const showAllOption = stores.length > 1;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Live attendance overview</Text>
      <View style={styles.filterRow}>
        {showAllOption ? (
          <TouchableOpacity
            style={[styles.filterButton, storeFilter === 'all' && styles.filterButtonActive]}
            onPress={() => setStoreFilter('all')}
          >
            <Text style={styles.filterLabel}>All stores</Text>
          </TouchableOpacity>
        ) : null}
        {stores.map((store) => (
          <TouchableOpacity
            key={store.id}
            style={[styles.filterButton, storeFilter === store.id && styles.filterButtonActive]}
            onPress={() => setStoreFilter(store.id)}
          >
            <Text style={styles.filterLabel}>{store.nameShort ?? store.nameOfficial}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={working}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            {isLoadingStores ? (
              <ActivityIndicator color="#2563eb" />
            ) : (
              <Text style={styles.helper}>No staff members are currently clocked in.</Text>
            )}
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshingMembers}
            onRefresh={() => {
              if (stores.length) {
                setIsRefreshingMembers(true);
                hydrateMembers(stores.map((store) => store.id))
                  .catch(() => undefined)
                  .finally(() => setIsRefreshingMembers(false));
              }
            }}
            tintColor="#2563eb"
          />
        }
        contentContainerStyle={working.length === 0 && styles.emptyList}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
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
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  helper: {
    color: '#94a3b8',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  rowDetails: {
    flex: 2,
  },
  name: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  cell: {
    flex: 1,
    color: '#f8fafc',
    textAlign: 'center',
  },
  badgeCell: {
    flex: 1,
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#f97316',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    fontWeight: '600',
  },
});

export default AdminHomeScreen;











