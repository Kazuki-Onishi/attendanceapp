import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import { listStoreMembers, listStoresForUser, type Store, type StoreMember } from '@/features/stores/api';
import { useAppSelector } from '@/store';
import { rankOfRole } from '@/utils/roles';
import StaffBulkActionModal, { type SelectedStaffTarget } from '@/app/admin/staff/StaffBulkActionModal';

const AdminStaffScreen: React.FC = () => {
  const auth = useAppSelector((state) => state.auth);
  const storeState = useAppSelector((state) => state.store);

  const [stores, setStores] = useState<Store[]>(storeState.availableStores);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(storeState.selectedStoreId ?? storeState.availableStores[0]?.id ?? null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [refreshingMembers, setRefreshingMembers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleDocIds, setSelectedRoleDocIds] = useState<Set<string>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);

  const adminLabels = (labels.admin ?? {}) as Record<string, any>;
  const bulkLabels = (adminLabels.bulk ?? {}) as Record<string, any>;

  const requesterUid = auth.user?.uid ?? '';
  const requesterName = auth.user?.displayName ?? auth.user?.email ?? null;

  const highestRank = useMemo(() => {
    let rank = 0;
    for (const role of auth.roles) {
      if (role.isResigned) {
        continue;
      }
      const value = rankOfRole(role.role);
      if (value > rank) {
        rank = value;
      }
    }
    return rank;
  }, [auth.roles]);

  const canProxy = highestRank >= rankOfRole('senior');

  useEffect(() => {
    let active = true;
    const loadStores = async () => {
      if (!auth.user?.uid) {
        setStores([]);
        return;
      }
      if (storeState.availableStores.length > 0) {
        setStores(storeState.availableStores);
        return;
      }
      try {
        setLoadingStores(true);
        const result = await listStoresForUser(auth.user.uid);
        if (!active) {
          return;
        }
        setStores(result);
        if (!selectedStoreId && result.length > 0) {
          setSelectedStoreId(result[0].id);
        }
      } catch (err) {
        if (!active) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load stores.';
        setError(message);
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
  }, [auth.user?.uid, selectedStoreId, storeState.availableStores]);

  const loadMembers = useCallback(
    async (storeId: string | null) => {
      if (!storeId) {
        setMembers([]);
        return;
      }
      setLoadingMembers(true);
      setError(null);
      try {
        const result = await listStoreMembers(storeId);
        setMembers(result);
        setSelectedRoleDocIds(new Set());
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load staff members.';
        setError(message);
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadMembers(selectedStoreId ?? null).catch(() => undefined);
  }, [loadMembers, selectedStoreId]);

  const handleRefresh = useCallback(() => {
    if (!selectedStoreId) {
      return;
    }
    setRefreshingMembers(true);
    loadMembers(selectedStoreId)
      .catch(() => undefined)
      .finally(() => setRefreshingMembers(false));
  }, [loadMembers, selectedStoreId]);

  const toggleSelect = useCallback(
    (roleDocId: string) => {
      setSelectedRoleDocIds((prev) => {
        const next = new Set(prev);
        if (next.has(roleDocId)) {
          next.delete(roleDocId);
        } else {
          next.add(roleDocId);
        }
        return next;
      });
    },
    [],
  );

  const toggleSelectAll = useCallback(() => {
    if (!selectedStoreId) {
      return;
    }
    const roleDocIdsForStore = members
      .filter((member) => member.storeId === selectedStoreId)
      .map((member) => `${member.userId}_${member.storeId}`);
    setSelectedRoleDocIds((prev) => {
      const allSelected = roleDocIdsForStore.every((id) => prev.has(id));
      if (allSelected) {
        const next = new Set(prev);
        roleDocIdsForStore.forEach((id) => next.delete(id));
        return next;
      }
      return new Set(roleDocIdsForStore);
    });
  }, [members, selectedStoreId]);

  const selectedCount = selectedRoleDocIds.size;

  const selectedTargets = useMemo<SelectedStaffTarget[]>(() => {
    if (!selectedStoreId) {
      return [];
    }
    return members
      .filter((member) => member.storeId === selectedStoreId && selectedRoleDocIds.has(`${member.userId}_${member.storeId}`))
      .map((member) => ({
        userId: member.userId,
        roleDocId: `${member.userId}_${member.storeId}`,
        name: member.displayName ?? member.email ?? member.userId,
        role: member.role,
      }));
  }, [members, selectedRoleDocIds, selectedStoreId]);

  const handleOpenModal = () => {
    if (!canProxy) {
      Alert.alert(
        bulkLabels.permissionTitle ?? 'Permission required',
        bulkLabels.permissionMessage ?? 'Senior role or higher is required to create proxy requests.',
      );
      return;
    }
    if (selectedCount === 0) {
      Alert.alert(bulkLabels.noneSelectedTitle ?? 'Select staff', bulkLabels.noneSelected ?? 'Select at least one staff member.');
      return;
    }
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
  };

  const showSuccessNotification = (count: number, batchId: string) => {
    const template =
      bulkLabels.sentMessageWithBatch ?? '{count}件を申請しました（batchId: {id}）';
    const message = template.replace('{count}', String(count)).replace('{id}', batchId);
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    } else {
      Alert.alert(bulkLabels.sentTitle ?? 'Requests created', message);
    }
  };

  const handleModalSubmitted = (result: { batchId: string; created: number }) => {
    showSuccessNotification(result.created, result.batchId);
    setSelectedRoleDocIds(new Set());
  };

  const renderStoreFilter = () => (
    <View style={styles.filterRow}>
      {stores.map((store) => {
        const active = selectedStoreId === store.id;
        const label = store.nameShort ?? store.nameOfficial ?? store.id;
        return (
          <TouchableOpacity
            key={store.id}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => setSelectedStoreId(store.id)}
          >
            <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderMember = ({ item }: { item: StoreMember }) => {
    const roleDocId = `${item.userId}_${item.storeId}`;
    const selected = selectedRoleDocIds.has(roleDocId);
    return (
      <TouchableOpacity
        style={[styles.memberRow, selected && styles.memberRowSelected]}
        onPress={() => toggleSelect(roleDocId)}
      >
        <View style={[styles.checkbox, selected && styles.checkboxActive]}>
          {selected ? <Text style={styles.checkboxLabel}>?</Text> : null}
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{item.displayName ?? item.email ?? item.userId}</Text>
          <Text style={styles.memberMeta}>{item.role}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const isLoading = loadingStores || loadingMembers;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{adminLabels.staffTitle ?? 'Staff management'}</Text>
        <Text style={styles.subtitle}>
          {(bulkLabels.countSelected ?? '{count} selected').replace('{count}', String(selectedCount))}
        </Text>
      </View>

      <View style={styles.filterContainer}>
        {renderStoreFilter()}
        <TouchableOpacity style={styles.selectAllButton} onPress={toggleSelectAll}>
          <Text style={styles.selectAllLabel}>{bulkLabels.selectAll ?? 'Select all'}</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={members.filter((member) => !selectedStoreId || member.storeId === selectedStoreId)}
        keyExtractor={(item) => `${item.userId}_${item.storeId}`}
        renderItem={renderMember}
        ListEmptyComponent={
          <View style={styles.placeholder}>
            {isLoading ? (
              <ActivityIndicator color="#38bdf8" />
            ) : (
              <Text style={styles.placeholderText}>{bulkLabels.noStaff ?? 'No staff found for this store.'}</Text>
            )}
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshingMembers} onRefresh={handleRefresh} tintColor="#38bdf8" />
        }
        contentContainerStyle={members.length === 0 && !isLoading ? styles.emptyList : undefined}
      />

      <View style={styles.footerBar}>
        <TouchableOpacity
          style={[styles.proxyButton, (!canProxy || selectedCount === 0) && styles.proxyButtonDisabled]}
          onPress={handleOpenModal}
          disabled={!canProxy || selectedCount === 0}
        >
          <Text style={styles.proxyButtonLabel}>{bulkLabels.applyToSelected ?? 'Apply to selected'}</Text>
        </TouchableOpacity>
        {!canProxy ? (
          <Text style={styles.footerHint}>{bulkLabels.applyDisabled ?? 'Senior role or higher is required to submit proxy requests.'}</Text>
        ) : null}
      </View>

      <StaffBulkActionModal
        visible={modalVisible}
        storeId={selectedStoreId}
        targets={selectedTargets}
        requesterUid={requesterUid}
        requesterName={requesterName}
        onClose={handleModalClose}
        onSubmitted={handleModalSubmitted}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 12,
    gap: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1f2945',
  },
  filterChipActive: {
    backgroundColor: '#2563eb',
  },
  filterChipLabel: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  filterChipLabelActive: {
    color: '#fff',
  },
  selectAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  selectAllLabel: {
    color: '#93c5fd',
    fontWeight: '600',
  },
  error: {
    color: '#f87171',
    paddingHorizontal: 24,
    marginTop: 12,
  },
  placeholder: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  placeholderText: {
    color: '#64748b',
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2a44',
    gap: 12,
  },
  memberRowSelected: {
    backgroundColor: 'rgba(37, 99, 235, 0.15)',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#2563eb',
  },
  checkboxLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  memberMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  footerBar: {
    padding: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2a44',
  },
  proxyButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  proxyButtonDisabled: {
    opacity: 0.6,
  },
  proxyButtonLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  footerHint: {
    marginTop: 8,
    color: '#facc15',
    textAlign: 'center',
  },
});

export default AdminStaffScreen;

