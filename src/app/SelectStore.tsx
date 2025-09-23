import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import JoinStoreModal from '@/app/staff/JoinStoreModal';
import CreateStoreModal from '@/app/staff/CreateStoreModal';
import {
  cancelStoreJoinRequest,
  listenStoreJoinRequests,
  type StoreJoinRequest,
} from '@/features/joinRequests/api';
import { listStoresForUser, type Store } from '@/features/stores/api';
import { useAppDispatch, useAppSelector } from '@/store';
import { setSelectedStoreId, setAvailableStores } from '@/store/slices/storeSlice';

type JoinRequestGroup = {
  pending: StoreJoinRequest[];
  approved: StoreJoinRequest[];
  others: StoreJoinRequest[];
};

const statusStyleFor = (status: StoreJoinRequest['status']) => {
  switch (status) {
    case 'approved':
      return styles.status_approved;
    case 'rejected':
      return styles.status_rejected;
    case 'canceled':
      return styles.status_canceled;
    default:
      return styles.status_pending;
  }
};

const SelectStore: React.FC = () => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const roles = useAppSelector((state) => state.auth.roles);
  const availableStores = useAppSelector((state) => state.store.availableStores);
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);

  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'refreshing'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [createStoreModalVisible, setCreateStoreModalVisible] = useState(false);
  const [joinRequests, setJoinRequests] = useState<StoreJoinRequest[]>([]);
  const [joinRequestsError, setJoinRequestsError] = useState<string | null>(null);
  const [joinRequestsLoading, setJoinRequestsLoading] = useState<boolean>(false);

  const hasStores = availableStores.length > 0;

  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const joinLabels = useMemo(() => staffLabels.join ?? {}, [staffLabels]);
  const selectLabels = useMemo(() => staffLabels.select ?? {}, [staffLabels]);
  const settingsLabels = useMemo(() => staffLabels.settings ?? {}, [staffLabels]);
  const storeCreationLabels = useMemo(() => settingsLabels.storeCreation ?? {}, [settingsLabels]);
  const requestLabels = useMemo(() => joinLabels.requestList ?? {}, [joinLabels]);
  const statusLabels = useMemo(() => joinLabels.status ?? {}, [joinLabels]);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const groupedRequests = useMemo<JoinRequestGroup>(() => {
    const pending = joinRequests.filter((request) => request.status === 'pending');
    const approved = joinRequests.filter((request) => request.status === 'approved');
    const others = joinRequests.filter(
      (request) => request.status !== 'pending' && request.status !== 'approved',
    );
    return { pending, approved, others };
  }, [joinRequests]);

  const loadStores = useCallback(
    async (mode: 'loading' | 'refreshing' = 'loading') => {
      if (!user?.uid) {
        setLoadingState('idle');
        setLoadError('User context is missing. Please log in again.');
        return;
      }
      setLoadingState(mode);
      try {
        const stores = await listStoresForUser(user.uid);
        if (!isMountedRef.current) {
          return;
        }
        dispatch(setAvailableStores(stores));
        setLoadError(null);
      } catch (err) {
        if (!isMountedRef.current) {
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load stores';
        setLoadError(message);
      } finally {
        if (isMountedRef.current) {
          setLoadingState('idle');
        }
      }
    },
    [dispatch, user?.uid],
  );

  useEffect(() => {
    loadStores('loading');
  }, [loadStores]);

  useEffect(() => {
    if (!user?.uid) {
      setJoinRequests([]);
      setJoinRequestsError(joinLabels.authError ?? 'Login information is missing. Please sign in again.');
      return;
    }
    setJoinRequestsLoading(true);
    setJoinRequestsError(null);
    const unsubscribe = listenStoreJoinRequests(
      user.uid,
      (requests) => {
        setJoinRequests(requests);
        setJoinRequestsLoading(false);
      },
      (error) => {
        setJoinRequestsError(error.message ?? 'Failed to load join requests.');
        setJoinRequestsLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user?.uid, joinLabels.authError]);

  const handleSelectStore = useCallback(
    (storeId: string) => {
      dispatch(setSelectedStoreId(storeId));
    },
    [dispatch],
  );

  const handleCancelRequest = useCallback(async (requestId: string) => {
    try {
      await cancelStoreJoinRequest(requestId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : requestLabels.cancelError ?? 'Could not cancel the join request.';
      setJoinRequestsError(message);
    }
  }, [requestLabels.cancelError]);

  const renderStoreItem = useCallback(
    ({ item }: { item: Store }) => {
      const isActive = item.id === selectedStoreId;
      const role = roles.find((assignment) => assignment.storeId === item.id)?.role;
      return (
        <TouchableOpacity
          style={[styles.card, isActive && styles.cardActive]}
          onPress={() => handleSelectStore(item.id)}
        >
          <Text style={styles.cardTitle}>{item.nameOfficial}</Text>
          {item.nameShort ? <Text style={styles.cardSubtitle}>{item.nameShort}</Text> : null}
          <Text style={styles.cardMeta}>{item.timezone}</Text>
          {role ? <Text style={styles.cardRole}>Role: {role}</Text> : null}
          {isActive ? <Text style={styles.cardSelected}>{selectLabels.selectedLabel ?? 'Selected'}</Text> : null}
        </TouchableOpacity>
      );
    },
    [handleSelectStore, roles, selectedStoreId, selectLabels.selectedLabel],
  );

  const isLoadingStores = loadingState === 'loading';
  const isRefreshing = loadingState === 'refreshing';

  const renderJoinRequest = (request: StoreJoinRequest, canCancel: boolean) => (
    <View key={request.id} style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <Text style={styles.requestStore}>{request.storeId}</Text>
        <View style={[styles.statusBadge, statusStyleFor(request.status)]}>
          <Text style={styles.statusBadgeLabel}>{renderStatusLabel(request.status, statusLabels)}</Text>
        </View>
      </View>
      {request.note ? <Text style={styles.requestNote}>{request.note}</Text> : null}
      {request.createdAt ? (
        <Text style={styles.requestMeta}>
          {(requestLabels.submittedAt ?? 'Submitted: {date}').replace(
            '{date}',
            request.createdAt.toLocaleString('ja-JP'),
          )}
        </Text>
      ) : null}
      {canCancel ? (
        <TouchableOpacity style={styles.requestCancel} onPress={() => handleCancelRequest(request.id)}>
          <Text style={styles.requestCancelLabel}>
            {requestLabels.cancelLabel ?? 'Cancel request'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const handleOpenCreateStore = useCallback(() => {
    setCreateStoreModalVisible(true);
  }, []);

  const handleCloseCreateStore = useCallback(() => {
    setCreateStoreModalVisible(false);
  }, []);

  const handleStoreCreated = useCallback(
    (newStoreId: string) => {
      setCreateStoreModalVisible(false);
      loadStores('refreshing');
      dispatch(setSelectedStoreId(newStoreId));
    },
    [dispatch, loadStores],
  );

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.centeredText}>You need to log in to choose a store.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          hasStores
            ? (
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadStores('refreshing')}
                tintColor="#2563eb"
                colors={['#2563eb']}
              />
            )
            : undefined
        }
      >
        <Text style={styles.title}>{selectLabels.title ?? 'Choose store'}</Text>
        <Text style={styles.subtitle}>
          {selectLabels.overview ?? 'Choose the store you want to use. You can switch later.'}
        </Text>

        <TouchableOpacity style={styles.joinCTABanner} onPress={() => setJoinModalVisible(true)}>
          <Text style={styles.joinCTALabel}>{joinLabels.cta ?? 'Send join request'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.createStoreBanner} onPress={handleOpenCreateStore}>
          <Text style={styles.createStoreLabel}>{storeCreationLabels.manageLabel ?? 'Create store'}</Text>
          <Text style={styles.createStoreDescription}>
            {storeCreationLabels.description ?? 'Create a store and share codes with your team.'}
          </Text>
        </TouchableOpacity>

        {hasStores ? (
          <View style={styles.listSection}>
            {isLoadingStores ? (
              <View style={styles.loaderRow}>
                <ActivityIndicator color="#2563eb" size="large" />
                <Text style={styles.loaderText}>{selectLabels.loading ?? 'Loading stores...'}</Text>
              </View>
            ) : null}
            {loadError ? <Text style={styles.error}>{loadError}</Text> : null}
            <FlatList
              data={availableStores}
              keyExtractor={(item) => item.id}
              renderItem={renderStoreItem}
              ItemSeparatorComponent={Separator}
              scrollEnabled={false}
            />
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{selectLabels.heading ?? 'No stores are available yet'}</Text>
            <Text style={styles.emptyDescription}>
              {selectLabels.emptyDescription ?? 'Ask a manager to add you or send a join request below.'}
            </Text>
            <TouchableOpacity style={styles.joinButton} onPress={() => setJoinModalVisible(true)}>
              <Text style={styles.joinButtonLabel}>{joinLabels.cta ?? 'Send join request'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.requestSection}>
          <Text style={styles.sectionTitle}>{requestLabels.title ?? 'Join request status'}</Text>
          {joinRequestsError ? <Text style={styles.error}>{joinRequestsError}</Text> : null}
          {joinRequestsLoading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator color="#2563eb" />
              <Text style={styles.loaderText}>{requestLabels.loading ?? 'Loading join requests...'}</Text>
            </View>
          ) : null}
          {joinRequests.length === 0 && !joinRequestsLoading ? (
            <Text style={styles.helperText}>{requestLabels.empty ?? 'No join requests have been submitted yet.'}</Text>
          ) : null}

          {groupedRequests.pending.length > 0 ? (
            <View style={styles.requestGroup}>
              <Text style={styles.requestGroupTitle}>{requestLabels.pending ?? 'Pending approval'}</Text>
              {groupedRequests.pending.map((request) => renderJoinRequest(request, true))}
            </View>
          ) : null}

          {groupedRequests.approved.length > 0 ? (
            <View style={styles.requestGroup}>
              <Text style={styles.requestGroupTitle}>{requestLabels.approved ?? 'Approved'}</Text>
              {groupedRequests.approved.map((request) => renderJoinRequest(request, false))}
            </View>
          ) : null}

          {groupedRequests.others.length > 0 ? (
            <View style={styles.requestGroup}>
              <Text style={styles.requestGroupTitle}>{requestLabels.history ?? 'History'}</Text>
              {groupedRequests.others.map((request) => renderJoinRequest(request, false))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      <CreateStoreModal
        visible={createStoreModalVisible}
        onClose={handleCloseCreateStore}
        actorUserId={user?.uid ?? null}
        onCreated={handleStoreCreated}
      />
      <JoinStoreModal visible={joinModalVisible} onClose={() => setJoinModalVisible(false)} />
    </View>
  );
};

const renderStatusLabel = (
  status: StoreJoinRequest['status'],
  statusLabels: Record<string, string>,
): string => {
  switch (status) {
    case 'approved':
      return statusLabels.approved ?? 'Approved';
    case 'rejected':
      return statusLabels.rejected ?? 'Rejected';
    case 'canceled':
      return statusLabels.canceled ?? 'Canceled';
    default:
      return statusLabels.pending ?? 'Pending approval';
  }
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    gap: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#f8fafc',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  joinCTABanner: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 4,
  },
  joinCTALabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  createStoreBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  createStoreLabel: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 16,
  },
  createStoreDescription: {
    color: '#cbd5f5',
    lineHeight: 18,
  },
  listSection: {
    gap: 16,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loaderText: {
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 8,
  },
  cardActive: {
    borderColor: '#2563eb',
    borderWidth: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f8fafc',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#cbd5f5',
  },
  cardMeta: {
    fontSize: 12,
    color: '#94a3b8',
  },
  cardRole: {
    fontSize: 12,
    color: '#38bdf8',
  },
  cardSelected: {
    marginTop: 12,
    fontSize: 12,
    color: '#2563eb',
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  separator: {
    height: 16,
  },
  error: {
    color: '#f87171',
  },
  emptyState: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    alignItems: 'center',
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyDescription: {
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },
  joinButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  joinButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  requestSection: {
    gap: 16,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 18,
  },
  helperText: {
    color: '#94a3b8',
  },
  requestGroup: {
    gap: 12,
  },
  requestGroupTitle: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  requestCard: {
    backgroundColor: '#111c32',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestStore: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 16,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeLabel: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  status_pending: {
    backgroundColor: '#facc15',
  },
  status_approved: {
    backgroundColor: '#4ade80',
  },
  status_rejected: {
    backgroundColor: '#f87171',
  },
  status_canceled: {
    backgroundColor: '#94a3b8',
  },
  requestNote: {
    color: '#cbd5f5',
    lineHeight: 18,
  },
  requestMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  requestCancel: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#1f2945',
  },
  requestCancelLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  centeredText: {
    color: '#475569',
    marginTop: 16,
    textAlign: 'center',
  },
});

export default SelectStore;
