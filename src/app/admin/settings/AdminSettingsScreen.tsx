import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import CreateStoreModal from '@/app/staff/CreateStoreModal';
import StaffFileAccessModal from '@/app/staff/StaffFileAccessModal';
import labels from '@/i18n/ja.json';
import { listStoresForUser } from '@/features/stores/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { setAvailableStores, setSelectedStoreId } from '@/store/slices/storeSlice';
import { rankOfRole } from '@/utils/roles';

type AdminSettingsScreenProps = {
  onSwitchToStaff?: () => void;
};

const AdminSettingsScreen: React.FC<AdminSettingsScreenProps> = ({ onSwitchToStaff }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const availableStores = useAppSelector((state) => state.store.availableStores);
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);
  const roles = useAppSelector((state) => state.auth.roles);

  const [createStoreModalVisible, setCreateStoreModalVisible] = useState(false);
  const [fileAccessModalVisible, setFileAccessModalVisible] = useState(false);
  const [targetStoreId, setTargetStoreId] = useState<string | null>(selectedStoreId ?? availableStores[0]?.id ?? null);
  const [storesRefreshing, setStoresRefreshing] = useState(false);
  const [storesError, setStoresError] = useState<string | null>(null);

  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const settingsLabels = useMemo(() => staffLabels.settings ?? {}, [staffLabels]);
  const storeCreationLabels = useMemo(() => settingsLabels.storeCreation ?? {}, [settingsLabels]);
  const proxyLabels = useMemo(() => settingsLabels.proxy ?? {}, [settingsLabels]);
  const fileAccessLabels = useMemo(() => settingsLabels.fileAccess ?? {}, [settingsLabels]);
  const viewSwitchLabels = useMemo(() => settingsLabels.viewSwitch ?? {}, [settingsLabels]);

  const highestRank = useMemo(() => {
    let rank = 0;
    roles.forEach((role) => {
      if (role.isResigned) {
        return;
      }
      const value = rankOfRole(role.role);
      if (value > rank) {
        rank = value;
      }
    });
    return rank;
  }, [roles]);

  const canProxyApply = highestRank >= rankOfRole('senior');

  useEffect(() => {
    if (!availableStores.length) {
      setTargetStoreId(null);
      return;
    }
    if (!targetStoreId || !availableStores.some((store) => store.id === targetStoreId)) {
      setTargetStoreId(availableStores[0].id);
    }
  }, [availableStores, targetStoreId]);

  const selectedStoreName = useMemo(() => {
    const store = availableStores.find((item) => item.id === targetStoreId);
    return store?.nameShort ?? store?.nameOfficial ?? targetStoreId ?? null;
  }, [availableStores, targetStoreId]);

  const handleOpenCreateStore = useCallback(() => {
    setCreateStoreModalVisible(true);
  }, []);

  const handleCloseCreateStore = useCallback(() => {
    setCreateStoreModalVisible(false);
  }, []);

  const handleStoreCreated = useCallback(
    async (storeId: string) => {
      setCreateStoreModalVisible(false);
      if (!user?.uid) {
        return;
      }
      setStoresRefreshing(true);
      try {
        const stores = await listStoresForUser(user.uid);
        dispatch(setAvailableStores(stores));
        dispatch(setSelectedStoreId(storeId));
        setTargetStoreId(storeId);
        setStoresError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh stores.';
        setStoresError(message);
      } finally {
        setStoresRefreshing(false);
      }
    },
    [dispatch, user?.uid],
  );

  const handleOpenFileAccess = useCallback(() => {
    if (targetStoreId) {
      setFileAccessModalVisible(true);
    }
  }, [targetStoreId]);

  const handleCloseFileAccess = useCallback(() => {
    setFileAccessModalVisible(false);
  }, []);

  const handleSelectStore = useCallback((storeId: string) => {
    setTargetStoreId(storeId);
  }, []);

  const handleOpenProxyModal = useCallback(() => {
    if (!canProxyApply) {
      Alert.alert(
        proxyLabels.disabledTitle ?? 'Permission required',
        proxyLabels.disabled ?? 'You need a senior role or higher to use proxy requests.',
      );
      return;
    }
    Alert.alert(
      proxyLabels.placeholderTitle ?? 'Proxy requests',
      proxyLabels.placeholderDescription ?? 'Proxy submission tooling is coming soon.',
    );
  }, [canProxyApply, proxyLabels]);

  const handleSwitchToStaff = useCallback(() => {
    onSwitchToStaff?.();
  }, [onSwitchToStaff]);

  const renderStoreChips = () => {
    if (!availableStores.length) {
      return (
        <Text style={styles.helperText}>
          {fileAccessLabels.storeNotSelected ?? 'You do not belong to any stores yet. Create a store first.'}
        </Text>
      );
    }

    return (
      <View style={styles.storeChipRow}>
        {availableStores.map((store) => {
          const isActive = targetStoreId === store.id;
          const label = store.nameShort ?? store.nameOfficial ?? store.id;
          return (
            <TouchableOpacity
              key={store.id}
              style={[styles.storeChip, isActive && styles.storeChipActive]}
              onPress={() => handleSelectStore(store.id)}
            >
              <Text style={[styles.storeChipLabel, isActive && styles.storeChipLabelActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        {onSwitchToStaff ? (
          <View style={styles.card}>
            <Text style={styles.title}>{viewSwitchLabels.staffTitle ?? 'Staff tools'}</Text>
            <Text style={styles.description}>
              {viewSwitchLabels.adminToStaffDescription ?? 'Switch back to the staff dashboard to review shifts and submissions.'}
            </Text>
            <TouchableOpacity style={styles.actionButton} onPress={handleSwitchToStaff}>
              <Text style={styles.actionLabel}>{viewSwitchLabels.toStaff ?? 'Go to staff view'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>{storeCreationLabels.title ?? 'Create a new store'}</Text>
          <Text style={styles.description}>
            {storeCreationLabels.description ?? 'Create a store and share codes with your team.'}
          </Text>
          <TouchableOpacity style={styles.actionButton} onPress={handleOpenCreateStore}>
            <Text style={styles.actionLabel}>{storeCreationLabels.manageLabel ?? 'Create store'}</Text>
          </TouchableOpacity>
          {storesRefreshing ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.helperText}>Updating store list...</Text>
            </View>
          ) : null}
          {storesError ? <Text style={styles.error}>{storesError}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{proxyLabels.title ?? 'Proxy requests'}</Text>
          <Text style={styles.description}>
            {proxyLabels.description ?? 'Submit updates such as employment, allowances, or commute settings on behalf of staff.'}
          </Text>
          <TouchableOpacity
            style={[styles.actionButton, !canProxyApply && styles.actionButtonDisabled]}
            onPress={handleOpenProxyModal}
            disabled={!canProxyApply}
          >
            <Text style={styles.actionLabel}>{proxyLabels.button ?? 'Open proxy actions'}</Text>
          </TouchableOpacity>
          {canProxyApply ? (
            <Text style={styles.helperText}>
              {proxyLabels.helper ?? 'Select staff from the management screen to begin a proxy request.'}
            </Text>
          ) : (
            <Text style={styles.disabledNote}>
              {proxyLabels.disabled ?? 'Senior role or higher is required to submit proxy requests.'}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{fileAccessLabels.title ?? 'Personal file access'}</Text>
          <Text style={styles.description}>
            {fileAccessLabels.description ??
              'Grant staff access to their personal store documents when necessary.'}
          </Text>
          {renderStoreChips()}
          <TouchableOpacity
            style={[styles.actionButton, !targetStoreId && styles.actionButtonDisabled]}
            onPress={handleOpenFileAccess}
            disabled={!targetStoreId}
          >
            <Text style={styles.actionLabel}>{fileAccessLabels.manageLabel ?? 'Manage file access'}</Text>
          </TouchableOpacity>
          {selectedStoreName ? (
            <Text style={styles.helperText}>
              {fileAccessLabels.descriptionWithStore
                ? fileAccessLabels.descriptionWithStore.replace('{store}', selectedStoreName)
                : `Managing access for ${selectedStoreName}`}
            </Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{'Coming soon'}</Text>
          <Text style={styles.description}>
            {'More administrative tools will appear here as they are built.'}
          </Text>
        </View>
      </ScrollView>

      <CreateStoreModal
        visible={createStoreModalVisible}
        onClose={handleCloseCreateStore}
        actorUserId={user?.uid ?? null}
        onCreated={handleStoreCreated}
      />
      <StaffFileAccessModal
        visible={fileAccessModalVisible}
        storeId={targetStoreId}
        actorUserId={user?.uid ?? null}
        onClose={handleCloseFileAccess}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingBottom: 48,
    gap: 16,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  description: {
    color: '#cbd5f5',
    lineHeight: 20,
  },
  actionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  helperText: {
    color: '#94a3b8',
  },
  disabledNote: {
    color: '#fbbf24',
  },
  error: {
    color: '#f87171',
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  storeChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1f2945',
  },
  storeChipActive: {
    backgroundColor: '#2563eb',
  },
  storeChipLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  storeChipLabelActive: {
    color: '#fff',
  },
});

export default AdminSettingsScreen;
