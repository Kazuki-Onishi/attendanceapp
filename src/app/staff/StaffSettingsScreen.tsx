import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { signOut } from 'firebase/auth';

import labels from '@/i18n/ja.json';
import { auth } from '@/lib/firebase';
import { useAppDispatch, useAppSelector } from '@/store';
import { setStatus } from '@/store/slices/authSlice';
import { setAvailableStores, setSelectedStoreId } from '@/store/slices/storeSlice';
import { listStoresForUser } from '@/features/stores/api';
import CreateStoreModal from '@/app/staff/CreateStoreModal';
import { useStoreVisibilityPreferences } from '@/features/staff/hooks/useStoreVisibilityPreferences';
import { useStorePalette } from '@/features/stores/hooks/useStorePalette';

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  manager: 1,
  staff: 2,
  kiosk: 3,
};

type StaffSettingsScreenProps = {
  onRequestJoin: () => void;
  canSwitchToAdmin?: boolean;
  onSwitchToAdmin?: () => void;
};

const StaffSettingsScreen: React.FC<StaffSettingsScreenProps> = ({ onRequestJoin, canSwitchToAdmin = false, onSwitchToAdmin }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const roles = useAppSelector((state) => state.auth.roles);
  const availableStores = useAppSelector((state) => state.store.availableStores);
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);

  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [createStoreVisible, setCreateStoreVisible] = useState(false);
  const [storeRefreshing, setStoreRefreshing] = useState(false);
  const [storeRefreshError, setStoreRefreshError] = useState<string | null>(null);

  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const settingsLabels = useMemo(() => staffLabels.settings ?? {}, [staffLabels]);
  const joinLabels = useMemo(() => staffLabels.join ?? {}, [staffLabels]);
  const securityLabels = useMemo(() => settingsLabels.security ?? {}, [settingsLabels]);
  const membershipLabels = useMemo(() => settingsLabels.membership ?? {}, [settingsLabels]);
  const shareLabels = useMemo(() => membershipLabels.share ?? {}, [membershipLabels]);

  const roleLabels = useMemo(() => membershipLabels.roles ?? {}, [membershipLabels]);
  const viewSwitchLabels = useMemo(() => settingsLabels.viewSwitch ?? {}, [settingsLabels]);

  const activeRoles = useMemo(() => roles.filter((role) => role.isResigned !== true), [roles]);

  const paletteStoreIds = useMemo(
    () => Array.from(new Set(activeRoles.map((role) => role.storeId))),
    [activeRoles],
  );
  const palette = useStorePalette(paletteStoreIds);
  const { preferences, loading: prefsLoading, error: prefsError, toggleShare, pending } =
    useStoreVisibilityPreferences({ userId: user?.uid ?? null });

  const confirmShareChange = useCallback(
    (storeId: string, nextValue: boolean) => {
      if (pending[storeId]) {
        return;
      }

      const title = shareLabels.confirmTitle ?? 'Update sharing';
      const message = nextValue
        ? shareLabels.confirmEnable ?? 'Make your profile visible to this store?'
        : shareLabels.confirmDisable ?? 'Hide your profile from this store?';
      const confirmLabel = shareLabels.confirm ?? 'Update';
      const cancelLabel = shareLabels.cancel ?? 'Cancel';

      Alert.alert(title, message, [
        { text: cancelLabel, style: 'cancel' },
        { text: confirmLabel, onPress: () => toggleShare(storeId, nextValue) },
      ]);
    },
    [pending, shareLabels, toggleShare],
  );

  const storeById = useMemo(() => {
    const map = new Map<string, (typeof availableStores)[number]>();
    availableStores.forEach((store) => {
      map.set(store.id, store);
    });
    return map;
  }, [availableStores]);

  const membershipItems = useMemo(() => {
    return activeRoles
      .map((role) => {
        const store = storeById.get(role.storeId);
        const storeLabel = store?.nameShort ?? store?.nameOfficial ?? role.storeId;
        const color = palette[role.storeId]?.color ?? '#38bdf8';
        return {
          storeId: role.storeId,
          storeLabel,
          role: role.role,
          roleLabel: roleLabels[role.role] ?? role.role,
          color,
          isSelected: selectedStoreId === role.storeId,
        };
      })
      .sort((a, b) => {
        const orderA = ROLE_ORDER[a.role] ?? 99;
        const orderB = ROLE_ORDER[b.role] ?? 99;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.storeLabel.localeCompare(b.storeLabel);
      });
  }, [activeRoles, palette, roleLabels, selectedStoreId, storeById]);

  const handleOpenCreateStore = useCallback(() => {
    setCreateStoreVisible(true);
    setStoreRefreshError(null);
  }, []);

  const handleCloseCreateStore = useCallback(() => {
    setCreateStoreVisible(false);
  }, []);

  const handleStoreCreated = useCallback(
    async (storeId: string) => {
      setCreateStoreVisible(false);
      if (!user?.uid) {
        return;
      }
      setStoreRefreshing(true);
      try {
        const stores = await listStoresForUser(user.uid);
        dispatch(setAvailableStores(stores));
        dispatch(setSelectedStoreId(storeId));
        setStoreRefreshError(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh stores.';
        setStoreRefreshError(message);
      } finally {
        setStoreRefreshing(false);
      }
    },
    [dispatch, user?.uid],
  );

  const handleSignOut = useCallback(async () => {
    if (signingOut) {
      return;
    }

    setSignOutError(null);
    setSigningOut(true);
    dispatch(setStatus('loading'));

    try {
      await signOut(auth());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to sign out.';
      setSignOutError(message);
      dispatch(setStatus('authenticated'));
    } finally {
      setSigningOut(false);
    }
  }, [dispatch, signingOut]);

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>{settingsLabels.profileTitle ?? 'Profile'}</Text>
          <Text style={styles.description}>
            {user?.displayName ??
              user?.email ??
              settingsLabels.profilePlaceholder ??
              'User details are unavailable.'}
          </Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.title}>{membershipLabels.title ?? 'Store membership'}</Text>
            {prefsLoading ? <ActivityIndicator color="#38bdf8" size="small" /> : null}
          </View>
          <Text style={styles.description}>
            {membershipLabels.description ??
              'Review the stores you belong to and control how your profile is shared.'}
          </Text>
          {prefsError ? <Text style={styles.error}>{prefsError}</Text> : null}
          {membershipItems.length === 0 ? (
            <Text style={styles.helperText}>
              {membershipLabels.empty ?? 'You have not joined any stores yet.'}
            </Text>
          ) : (
            <View style={styles.membershipList}>
              {membershipItems.map((item) => {
                const shareEnabled = preferences[item.storeId]?.shareProfile ?? true;
                const shareStatus = shareEnabled
                  ? shareLabels.visible ?? 'Profile shared'
                  : shareLabels.hidden ?? 'Profile hidden';
                const toggleDisabled = pending[item.storeId];
                return (
                  <View key={item.storeId} style={styles.membershipRow}>
                    <View style={styles.membershipInfo}>
                      <View style={[styles.storeDot, { backgroundColor: item.color }]} />
                      <View style={styles.membershipTextColumn}>
                        <Text style={styles.storeLabel}>{item.storeLabel}</Text>
                        <Text style={styles.storeRole}>
                          {(membershipLabels.rolePrefix ?? 'Role: ') + item.roleLabel}
                        </Text>
                        {item.isSelected ? (
                          <Text style={styles.currentBadge}>
                            {membershipLabels.currentBadge ?? 'Selected store'}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    <View style={styles.shareColumn}>
                      <Text style={styles.shareStatus}>{shareStatus}</Text>
                      <Switch
                        value={shareEnabled}
                        disabled={toggleDisabled}
                        onValueChange={(next) => confirmShareChange(item.storeId, next)}
                        trackColor={{ false: '#475569', true: '#22c55e' }}
                        thumbColor={shareEnabled ? '#f8fafc' : '#e2e8f0'}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.joinActions}>
            <TouchableOpacity style={[styles.actionButton, styles.joinButton]} onPress={onRequestJoin}>
              <Text style={styles.actionLabel}>
                {membershipLabels.joinAnother ?? joinLabels.cta ?? 'Join another store'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, styles.secondaryActionButton, styles.joinButton]}
              onPress={handleOpenCreateStore}
            >
              <Text style={[styles.actionLabel, styles.secondaryActionLabel]}>
                {membershipLabels.createStore ?? 'Create a new store'}
              </Text>
            </TouchableOpacity>
          </View>
          {storeRefreshing ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#38bdf8" size="small" />
              <Text style={styles.helperText}>{membershipLabels.refreshing ?? 'Updating store list...'}</Text>
            </View>
          ) : null}
          {storeRefreshError ? <Text style={styles.error}>{storeRefreshError}</Text> : null}
        </View>

        {canSwitchToAdmin ? (
          <View style={styles.card}>
            <Text style={styles.title}>{viewSwitchLabels.adminTitle ?? 'Admin tools'}</Text>
            <Text style={styles.description}>
              {viewSwitchLabels.staffToAdminDescription ??
                'Switch to the admin dashboard to manage stores and approvals.'}
            </Text>
            <TouchableOpacity style={styles.actionButton} onPress={onSwitchToAdmin}>
              <Text style={styles.actionLabel}>{viewSwitchLabels.toAdmin ?? 'Go to admin view'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>{securityLabels.title ?? 'Profile & security'}</Text>
          <Text style={styles.description}>
            {securityLabels.description ??
              'Treat your profile like a résumé. Choose which stores can view it using the toggles above.'}
          </Text>
          <Text style={styles.helperText}>
            {securityLabels.shareHelper ??
              'Profile editing and download options will be available in an upcoming update.'}
          </Text>
          <TouchableOpacity style={[styles.actionButton, styles.secondaryActionButton]} disabled>
            <Text style={[styles.actionLabel, styles.secondaryActionLabel]}>
              {securityLabels.manageLabel ?? 'Manage profile (coming soon)'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>{settingsLabels.sessionTitle ?? 'Session'}</Text>
          <Text style={styles.description}>
            {settingsLabels.sessionDescription ?? 'Sign out if you want to switch accounts.'}
          </Text>
          {signOutError ? <Text style={styles.error}>{signOutError}</Text> : null}
          <TouchableOpacity
            style={[styles.actionButton, styles.logoutButton, signingOut ? styles.actionButtonDisabled : null]}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <View style={styles.logoutContent}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.actionLabel}>
                  {settingsLabels.signOutInProgress ?? 'Signing out...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.actionLabel}>{settingsLabels.signOut ?? 'Sign out'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <CreateStoreModal
        visible={createStoreVisible}
        onClose={handleCloseCreateStore}
        actorUserId={user?.uid ?? null}
        onCreated={handleStoreCreated}
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
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
  joinActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  joinButton: {
    minWidth: 160,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  helperText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  membershipList: {
    gap: 12,
  },
  membershipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111b2e',
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  membershipInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  membershipTextColumn: {
    flex: 1,
    gap: 4,
  },
  storeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  storeLabel: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  storeRole: {
    color: '#94a3b8',
    fontSize: 13,
  },
  currentBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  shareColumn: {
    alignItems: 'flex-end',
    gap: 8,
  },
  shareStatus: {
    color: '#cbd5f5',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  secondaryActionButton: {
    backgroundColor: '#1f2945',
    borderWidth: 1,
    borderColor: '#334155',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryActionLabel: {
    color: '#cbd5f5',
  },
  logoutButton: {
    backgroundColor: '#dc2626',
  },
  logoutContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  error: {
    color: '#f87171',
  },
});

export default StaffSettingsScreen;
