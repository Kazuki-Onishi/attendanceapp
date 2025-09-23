import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
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
  orderBy,
  query,
  where,
  QueryConstraint,
} from 'firebase/firestore';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import labels from '@/i18n/ja.json';
import { firestore } from '@/lib/firebase';
import { listStoresForUser, type Store } from '@/features/stores/api';
import { mapReceipt, mapVendor } from '@/features/receipts/api';
import type { Receipt, ReceiptMethod, ReceiptStatus, Vendor } from '@/features/receipts/types';
import { useAppSelector } from '@/store';
import type { ReceiptsStackParamList } from '@/navigation/admin/ReceiptsStack';

const METHODS: ReceiptMethod[] = ['cash', 'card', 'qr', 'transfer'];
const STATUSES: ReceiptStatus[] = ['draft', 'locked'];

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfMonth = (date: Date): string => {
  return formatDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
};

const endOfMonth = (date: Date): string => {
  return formatDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
};

const formatCurrency = (amount: number, currency: string): string => {
  if (!Number.isFinite(amount)) {
    return '-';
  }
  const formatter = new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  return formatter.format(amount);
};

type Navigation = NativeStackNavigationProp<ReceiptsStackParamList, 'ReceiptsHome'>;

const ReceiptsHome: React.FC = () => {
  const navigation = useNavigation<Navigation>();
  const auth = useAppSelector((state) => state.auth);
  const userId = auth.user?.uid ?? null;

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string | null>(null);

  const [dateStart, setDateStart] = useState<string>(() => startOfMonth(new Date()));
  const [dateEnd, setDateEnd] = useState<string>(() => endOfMonth(new Date()));
  const [amountMin, setAmountMin] = useState<string>('');
  const [amountMax, setAmountMax] = useState<string>('');
  const [methodFilter, setMethodFilter] = useState<ReceiptMethod | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<ReceiptStatus | 'all'>('all');
  const [vendorFilter, setVendorFilter] = useState<string | 'all'>('all');

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(false);

  const receiptLabels = labels.receipts;

  useEffect(() => {
    if (!userId) {
      setStores([]);
      setStoreId(null);
      return;
    }
    setReceiptsError(null);
    let cancelled = false;
    listStoresForUser(userId)
      .then((result) => {
        if (cancelled) {
          return;
        }
        setStores(result);
        setStoreId((prev) => {
          if (prev && result.some((store) => store.id === prev)) {
            return prev;
          }
          return result[0]?.id ?? null;
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setReceiptsError(err instanceof Error ? err.message : 'Failed to load stores.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!storeId) {
      setVendors([]);
      return () => undefined;
    }
    setVendorsLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(firestore(), 'vendors'), where('storeId', '==', storeId), orderBy('name', 'asc')),
      (snapshot) => {
        setVendorsLoading(false);
        const list = snapshot.docs
          .map((docSnapshot) => mapVendor(docSnapshot))
          .filter((vendor): vendor is Vendor => Boolean(vendor));
        setVendors(list);
        if (vendorFilter !== 'all' && !list.some((vendor) => vendor.id === vendorFilter)) {
          setVendorFilter('all');
        }
      },
      () => {
        setVendorsLoading(false);
      },
    );
    return () => unsubscribe();
  }, [storeId, vendorFilter]);

  useEffect(() => {
    if (!storeId) {
      setReceipts([]);
      return () => undefined;
    }

    const constraints: QueryConstraint[] = [where('storeId', '==', storeId)];
    const validStart = dateStart && /^\d{4}-\d{2}-\d{2}$/.test(dateStart) ? dateStart : null;
    const validEnd = dateEnd && /^\d{4}-\d{2}-\d{2}$/.test(dateEnd) ? dateEnd : null;
    if (validStart) {
      constraints.push(where('paidAt', '>=', validStart));
    }
    if (validEnd) {
      constraints.push(where('paidAt', '<=', validEnd));
    }
    if (statusFilter !== 'all') {
      constraints.push(where('status', '==', statusFilter));
    }
    if (vendorFilter !== 'all') {
      constraints.push(where('vendorId', '==', vendorFilter));
    }
    constraints.push(orderBy('paidAt', 'desc'));

    setReceiptsLoading(true);
    setReceiptsError(null);

    const unsubscribe = onSnapshot(
      query(collection(firestore(), 'receipts'), ...constraints),
      (snapshot) => {
        setReceiptsLoading(false);
        const list = snapshot.docs
          .map((docSnapshot) => mapReceipt(docSnapshot))
          .filter((item): item is Receipt => Boolean(item));
        setReceipts(list);
      },
      (err) => {
        setReceiptsLoading(false);
        setReceiptsError(err instanceof Error ? err.message : 'Failed to load receipts.');
      },
    );

    return () => unsubscribe();
  }, [storeId, dateStart, dateEnd, statusFilter, vendorFilter]);

  const filteredReceipts = useMemo(() => {
    const minAmount = amountMin.trim() ? Number(amountMin.trim()) : null;
    const maxAmount = amountMax.trim() ? Number(amountMax.trim()) : null;
    return receipts.filter((receipt) => {
      if (methodFilter !== 'all' && receipt.method !== methodFilter) {
        return false;
      }
      if (minAmount !== null && Number.isFinite(minAmount) && receipt.amount < minAmount) {
        return false;
      }
      if (maxAmount !== null && Number.isFinite(maxAmount) && receipt.amount > maxAmount) {
        return false;
      }
      return true;
    });
  }, [receipts, methodFilter, amountMin, amountMax]);

  const methodsLabels = receiptLabels.methods;
  const statusLabels = receiptLabels.status;

  const handleCreateReceipt = useCallback(() => {
    if (!storeId) {
      return;
    }
    const newId = doc(collection(firestore(), 'receipts')).id;
    navigation.navigate('ReceiptEdit', { receiptId: newId, storeId });
  }, [navigation, storeId]);

  const handleEdit = useCallback(
    (receipt: Receipt) => {
      navigation.navigate('ReceiptEdit', { receiptId: receipt.id, storeId: receipt.storeId });
    },
    [navigation],
  );

  const renderReceipt = useCallback(
    ({ item }: { item: Receipt }) => {
      const attachmentCount = item.images?.length ?? 0;
      const methodLabel = methodsLabels[item.method] ?? item.method;
      const statusLabel = statusLabels[item.status] ?? item.status;
      return (
        <TouchableOpacity style={styles.receiptCard} onPress={() => handleEdit(item)}>
          <View style={styles.receiptHeader}>
            <Text style={styles.receiptDate}>{item.paidAt}</Text>
            <Text style={styles.receiptAmount}>{formatCurrency(item.amount, item.currency)}</Text>
          </View>
          <View style={styles.receiptMetaRow}>
            <Text style={styles.receiptMeta}>{item.vendorName ?? '-'}</Text>
            <Text style={styles.receiptMeta}>{methodLabel}</Text>
          </View>
          <View style={styles.receiptMetaRow}>
            <Text style={[styles.receiptStatus, item.status === 'locked' && styles.statusLocked]}>
              {statusLabel}
            </Text>
            <Text style={styles.receiptMeta}>{`${receiptLabels.list.attachments}: ${attachmentCount}`}</Text>
          </View>
        </TouchableOpacity>
      );
    },
    [handleEdit, methodsLabels, receiptLabels.list.attachments, statusLabels],
  );

  const keyExtractor = useCallback((item: Receipt) => item.id, []);

  const storeButtons = useMemo(() => {
    return stores.map((store) => {
      const isActive = store.id === storeId;
      return (
        <TouchableOpacity
          key={store.id}
          style={[styles.filterPill, isActive && styles.filterPillActive]}
          onPress={() => setStoreId(store.id)}
        >
          <Text style={[styles.filterPillLabel, isActive && styles.filterPillLabelActive]}>
            {store.nameShort ?? store.nameOfficial}
          </Text>
        </TouchableOpacity>
      );
    });
  }, [stores, storeId]);

  const vendorButtons = useMemo(() => {
    if (vendorsLoading) {
      return (
        <View style={styles.vendorRow}>
          <ActivityIndicator color="#2563eb" />
        </View>
      );
    }
    return (
      <ScrollView horizontal style={styles.vendorRow} showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.filterPill, vendorFilter === 'all' && styles.filterPillActive]}
          onPress={() => setVendorFilter('all')}
        >
          <Text
            style={[styles.filterPillLabel, vendorFilter === 'all' && styles.filterPillLabelActive]}
          >
            {receiptLabels.filters.reset}
          </Text>
        </TouchableOpacity>
        {vendors.map((vendor) => {
          const isActive = vendorFilter === vendor.id;
          return (
            <TouchableOpacity
              key={vendor.id}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => setVendorFilter(isActive ? 'all' : vendor.id)}
            >
              <Text style={[styles.filterPillLabel, isActive && styles.filterPillLabelActive]}>
                {vendor.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }, [vendors, vendorFilter, vendorsLoading, receiptLabels.filters.reset]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{receiptLabels.listTitle}</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={handleCreateReceipt} disabled={!storeId}>
          <Text style={styles.primaryButtonLabel}>{receiptLabels.actions.new}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.filterContainer} horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{receiptLabels.filters.store}</Text>
          <View style={styles.filterRow}>{storeButtons}</View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{receiptLabels.filters.dateRange}</Text>
          <View style={styles.filterInputsRow}>
            <TextInput
              value={dateStart}
              onChangeText={setDateStart}
              style={styles.input}
              placeholder={receiptLabels.filters.dateStart}
              placeholderTextColor="#64748b"
            />
            <Text style={styles.filterSeparator}>~</Text>
            <TextInput
              value={dateEnd}
              onChangeText={setDateEnd}
              style={styles.input}
              placeholder={receiptLabels.filters.dateEnd}
              placeholderTextColor="#64748b"
            />
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{receiptLabels.filters.amountRange}</Text>
          <View style={styles.filterInputsRow}>
            <TextInput
              value={amountMin}
              onChangeText={setAmountMin}
              style={styles.input}
              placeholder={receiptLabels.filters.amountMin}
              keyboardType="numeric"
              placeholderTextColor="#64748b"
            />
            <Text style={styles.filterSeparator}>~</Text>
            <TextInput
              value={amountMax}
              onChangeText={setAmountMax}
              style={styles.input}
              placeholder={receiptLabels.filters.amountMax}
              keyboardType="numeric"
              placeholderTextColor="#64748b"
            />
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{receiptLabels.filters.method}</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterPill, methodFilter === 'all' && styles.filterPillActive]}
              onPress={() => setMethodFilter('all')}
            >
              <Text style={[styles.filterPillLabel, methodFilter === 'all' && styles.filterPillLabelActive]}>{receiptLabels.filters.reset}</Text>
            </TouchableOpacity>
            {METHODS.map((method) => {
              const isActive = methodFilter === method;
              return (
                <TouchableOpacity
                  key={method}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setMethodFilter(method)}
                >
                  <Text style={[styles.filterPillLabel, isActive && styles.filterPillLabelActive]}>
                    {methodsLabels[method] ?? method}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{receiptLabels.filters.status}</Text>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'all' && styles.filterPillActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterPillLabel, statusFilter === 'all' && styles.filterPillLabelActive]}>{receiptLabels.filters.reset}</Text>
            </TouchableOpacity>
            {STATUSES.map((status) => {
              const isActive = statusFilter === status;
              return (
                <TouchableOpacity
                  key={status}
                  style={[styles.filterPill, isActive && styles.filterPillActive]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text style={[styles.filterPillLabel, isActive && styles.filterPillLabelActive]}>
                    {statusLabels[status] ?? status}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>

      <View style={styles.filterGroup}>
        <Text style={styles.filterLabel}>{receiptLabels.filters.vendor}</Text>
        {vendorButtons}
      </View>

      {receiptsError ? <Text style={styles.error}>{receiptsError}</Text> : null}

      {receiptsLoading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.helper}>{receiptLabels.list.loading}</Text>
        </View>
      ) : filteredReceipts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.helper}>{receiptLabels.list.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredReceipts}
          keyExtractor={keyExtractor}
          renderItem={renderReceipt}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 16,
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
    fontSize: 22,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  filterContainer: {
    maxHeight: 180,
  },
  filterGroup: {
    marginRight: 16,
    gap: 8,
  },
  filterLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  filterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  filterPillActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  filterPillLabel: {
    color: '#cbd5f5',
    fontWeight: '500',
  },
  filterPillLabelActive: {
    color: '#fff',
  },
  filterInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterSeparator: {
    color: '#94a3b8',
  },
  input: {
    backgroundColor: '#172554',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 140,
  },
  vendorRow: {
    flexDirection: 'row',
    gap: 8,
  },
  list: {
    gap: 12,
    paddingBottom: 32,
  },
  receiptCard: {
    backgroundColor: '#111c32',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptDate: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  receiptAmount: {
    color: '#f97316',
    fontWeight: '700',
  },
  receiptMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptMeta: {
    color: '#94a3b8',
  },
  receiptStatus: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  statusLocked: {
    color: '#f87171',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  helper: {
    color: '#94a3b8',
  },
  error: {
    color: '#f87171',
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    backgroundColor: '#111c32',
  },
});

export default ReceiptsHome;

