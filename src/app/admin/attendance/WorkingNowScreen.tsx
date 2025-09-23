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
import { onSnapshot, query, where } from 'firebase/firestore';

import { formatMinutesAsHours, isOnBreak, workedMinutes } from '@/features/attendance/selectors';
import { getAttendancesCollection, mapAttendance } from '@/features/attendance/api';
import type { Attendance } from '@/features/attendance/types';
import { listStoreMembers, listStoresForUser, type Store, type StoreMember } from '@/features/stores/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { setSelectedStoreId } from '@/store/slices/storeSlice';

const WorkingNowScreen: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);
  const user = useAppSelector((state) => state.auth.user);

  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [working, setWorking] = useState<Attendance[]>([]);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setStores([]);
      return;
    }
    setStoresLoading(true);
    listStoresForUser(user.uid)
      .then((list) => setStores(list))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stores.'))
      .finally(() => setStoresLoading(false));
  }, [user?.uid]);

  useEffect(() => {
    if (!selectedStoreId) {
      setWorking([]);
      return;
    }

    const q = query(
      getAttendancesCollection(),
      where('storeId', '==', selectedStoreId),
      where('status', '==', 'open'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const records = snapshot.docs.map((doc) => mapAttendance(doc.id, doc.data() as any));
        setWorking(records);
      },
      (err) => {
        setError(err instanceof Error ? err.message : 'Failed to load working users.');
      },
    );

    return () => unsubscribe();
  }, [selectedStoreId]);

  useEffect(() => {
    if (!selectedStoreId) {
      setMembers([]);
      return;
    }

    listStoreMembers(selectedStoreId)
      .then((list) => setMembers(list))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load members.'));
  }, [selectedStoreId]);

  const memberLookup = useMemo(() => {
    const map = new Map<string, StoreMember>();
    members.forEach((m) => map.set(m.userId, m));
    return map;
  }, [members]);

  const handleRefresh = () => {
    if (!selectedStoreId) {
      return;
    }
    setRefreshing(true);
    listStoreMembers(selectedStoreId)
      .then((list) => setMembers(list))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load members.'))
      .finally(() => setRefreshing(false));
  };

  const handleSelectStore = (storeId: string) => {
    dispatch(setSelectedStoreId(storeId));
    setDropdownOpen(false);
  };

  const selectedStore = stores.find((store) => store.id === selectedStoreId);
  const storeLabel = selectedStore?.nameShort ?? selectedStore?.nameOfficial ?? 'Select store';

  const renderItem = ({ item }: { item: Attendance }) => {
    const member = memberLookup.get(item.userId);
    const name = member?.displayName ?? item.userId;
    const onBreak = isOnBreak(item);
    const minutes = workedMinutes(item.clockIn, item.breaks);

    return (
      <View style={styles.row}>
        <View style={styles.nameCell}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{item.userId}</Text>
        </View>
        <Text style={styles.cell}>{item.clockIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        <View style={styles.badgeCell}>{onBreak ? <Text style={styles.badge}>On break</Text> : null}</View>
        <Text style={styles.cell}>{formatMinutesAsHours(minutes)}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Working now</Text>
        <View style={styles.storeSelector}>
          <TouchableOpacity
            style={styles.storeButton}
            onPress={() => setDropdownOpen((prev) => !prev)}
            disabled={storesLoading || stores.length === 0}
          >
            <View style={styles.storeButtonContent}>
              <Text style={styles.storeButtonLabel}>{storeLabel}</Text>
              {storesLoading ? <ActivityIndicator size="small" color="#f8fafc" /> : null}
            </View>
          </TouchableOpacity>
          {dropdownOpen ? (
            <View style={styles.dropdown}>
              {stores.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={[
                    styles.dropdownItem,
                    store.id === selectedStoreId && styles.dropdownItemActive,
                  ]}
                  onPress={() => handleSelectStore(store.id)}
                >
                  <Text style={styles.dropdownLabel}>{store.nameShort ?? store.nameOfficial}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={working}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2563eb" />
        }
        ListEmptyComponent={<Text style={styles.empty}>No one is currently working.</Text>}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#f8fafc',
    fontSize: 24,
    fontWeight: '700',
  },
  storeSelector: {
    position: 'relative',
  },
  storeButton: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  storeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeButtonLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  dropdown: {
    position: 'absolute',
    top: 48,
    right: 0,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 20,
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dropdownItemActive: {
    backgroundColor: '#2563eb',
  },
  dropdownLabel: {
    color: '#f8fafc',
    fontWeight: '500',
  },
  error: {
    color: '#f87171',
  },
  empty: {
    color: '#94a3b8',
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  nameCell: {
    flex: 2,
  },
  cell: {
    flex: 1,
    color: '#f8fafc',
  },
  badgeCell: {
    flex: 1,
    alignItems: 'center',
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
  badge: {
    backgroundColor: '#f97316',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
    fontWeight: '600',
  },
});

export default WorkingNowScreen;



