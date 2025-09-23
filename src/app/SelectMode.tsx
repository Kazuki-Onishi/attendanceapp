import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import AttendanceScreen from '@/app/staff/Attendance';
import WorkingNowScreen from '@/app/admin/attendance/WorkingNowScreen';
import { getStore, Store } from '@/features/stores/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearSelectedStore } from '@/store/slices/storeSlice';

const SelectMode: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);
  const roles = useAppSelector((state) => state.auth.roles);
  const [store, setStore] = useState<Store | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeRole = roles.find((role) => role.storeId === selectedStoreId)?.role;
  const isManagerView = activeRole === 'manager' || activeRole === 'admin';

  useEffect(() => {
    let isActive = true;

    const fetchStore = async () => {
      if (!selectedStoreId) {
        setStore(null);
        return;
      }

      setIsLoading(true);
      try {
        const storeDoc = await getStore(selectedStoreId);
        if (!isActive) {
          return;
        }
        setStore(storeDoc);
        setError(null);
      } catch (err) {
        if (!isActive) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to fetch store details';
        setError(message);
        setStore(null);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    fetchStore();
    return () => {
      isActive = false;
    };
  }, [selectedStoreId]);

  if (!selectedStoreId) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerSection}>
        <Text style={styles.title}>Home</Text>
        {isLoading ? (
          <View style={styles.headerCard}>
            <ActivityIndicator color="#2563eb" />
          </View>
        ) : store ? (
          <View style={styles.headerCard}>
            <Text style={styles.headerLabel}>Active store</Text>
            <Text style={styles.headerName}>{store.nameOfficial}</Text>
            {store.nameShort ? <Text style={styles.headerSub}>{store.nameShort}</Text> : null}
            <Text style={styles.headerMeta}>{store.timezone}</Text>
            {activeRole ? <Text style={styles.headerRole}>Role: {activeRole}</Text> : null}
          </View>
        ) : error ? (
          <View style={styles.headerCard}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.attendanceSection}>
        {isManagerView ? <WorkingNowScreen /> : <AttendanceScreen />}
      </View>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => dispatch(clearSelectedStore())}>
        <Text style={styles.secondaryButtonLabel}>Switch store</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    gap: 16,
  },
  headerSection: {
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
    gap: 8,
  },
  headerLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#94a3b8',
  },
  headerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  headerSub: {
    fontSize: 14,
    color: '#475569',
  },
  headerMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  headerRole: {
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
  },
  attendanceSection: {
    flex: 1,
  },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  secondaryButtonLabel: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 16,
  },
  error: {
    color: '#dc2626',
  },
});

export default SelectMode;


