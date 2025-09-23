import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import {
  grantStoreFileAccess,
  listenStoreFileAccess,
  revokeStoreFileAccess,
  type StoreFileAccess,
} from '@/features/fileAccess/api';
import { listStoreMembers, type StoreMember } from '@/features/stores/api';

interface StaffFileAccessModalProps {
  visible: boolean;
  storeId: string | null;
  onClose: () => void;
  actorUserId: string | null;
}

type MemberRow = StoreMember & {
  accessStatus: StoreFileAccess['status'];
  grantedAt?: Date | null;
};

const StaffFileAccessModal: React.FC<StaffFileAccessModalProps> = ({ visible, storeId, onClose, actorUserId }) => {
  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const settingsLabels = useMemo(() => staffLabels.settings ?? {}, [staffLabels]);
  const accessLabels = useMemo(() => settingsLabels.fileAccess ?? {}, [settingsLabels]);

  const [storeMembers, setStoreMembers] = useState<StoreMember[]>([]);
  const [accessEntries, setAccessEntries] = useState<StoreFileAccess[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [savingUserIds, setSavingUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) {
      return;
    }
    setAccessError(null);
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!storeId) {
      setStoreMembers([]);
      setAccessEntries([]);
      setMembersError(accessLabels.storeNotSelected ?? 'Select a store to manage file access.');
      return;
    }

    let active = true;
    setMembersError(null);
    setLoadingMembers(true);

    listStoreMembers(storeId)
      .then((list) => {
        if (!active) {
          return;
        }
        const filtered = list.filter((member) => member.role === 'staff');
        setStoreMembers(filtered);
        setMembersError(null);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : accessLabels.loadMembersError ?? 'Failed to load store members.';
        setMembersError(message);
        setStoreMembers([]);
      })
      .finally(() => {
        if (active) {
          setLoadingMembers(false);
        }
      });

    return () => {
      active = false;
    };
  }, [storeId, visible, accessLabels.storeNotSelected, accessLabels.loadMembersError]);

  useEffect(() => {
    if (!visible || !storeId) {
      return undefined;
    }

    const unsubscribe = listenStoreFileAccess(
      storeId,
      (entries) => {
        setAccessEntries(entries);
      },
      (error) => {
        const message =
          error.message ?? accessLabels.loadAccessError ?? 'Failed to load file access entries.';
        setAccessError(message);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [storeId, visible, accessLabels.loadAccessError]);

  const memberRows: MemberRow[] = useMemo(() => {
    if (!storeMembers.length) {
      return [];
    }
    const accessMap = new Map(accessEntries.map((entry) => [entry.userId, entry]));
    return storeMembers.map((member) => {
      const access = accessMap.get(member.userId);
      return {
        ...member,
        accessStatus: access?.status ?? 'revoked',
        grantedAt: access?.grantedAt ?? null,
      };
    });
  }, [storeMembers, accessEntries]);

  const handleUpdate = async (userId: string, nextStatus: 'granted' | 'revoked') => {
    if (!storeId || !actorUserId) {
      setAccessError(accessLabels.permissionMissing ?? 'You do not have permission to change access.');
      return;
    }

    setAccessError(null);
    setSavingUserIds((prev) => new Set(prev).add(userId));

    try {
      if (nextStatus === 'granted') {
        await grantStoreFileAccess(storeId, userId, actorUserId);
      } else {
        await revokeStoreFileAccess(storeId, userId, actorUserId);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : accessLabels.updateError ?? 'Failed to update file access.';
      setAccessError(message);
    } finally {
      setSavingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const renderMemberCard = (member: MemberRow) => {
    const isSaving = savingUserIds.has(member.userId);
    const granted = member.accessStatus === 'granted';

    return (
      <View key={member.userId} style={styles.memberCard}>
        <View style={styles.memberHeader}>
          <View style={styles.memberDetails}>
            <Text style={styles.memberName}>{member.displayName}</Text>
            {member.email ? <Text style={styles.memberEmail}>{member.email}</Text> : null}
          </View>
          <View style={[styles.statusBadge, granted ? styles.statusGranted : styles.statusRevoked]}>
            <Text style={styles.statusBadgeLabel}>
              {granted
                ? accessLabels.statusGranted ?? 'Granted'
                : accessLabels.statusRevoked ?? 'Not granted'}
            </Text>
          </View>
        </View>
        <View style={styles.memberActions}>
          <TouchableOpacity
            style={[styles.actionButton, granted && styles.actionButtonSecondary, isSaving && styles.actionButtonDisabled]}
            onPress={() => handleUpdate(member.userId, granted ? 'revoked' : 'granted')}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color={granted ? '#2563eb' : '#0f172a'} />
            ) : (
              <Text style={[styles.actionLabel, granted && styles.actionLabelSecondary]}>
                {granted
                  ? accessLabels.revokeLabel ?? 'Revoke access'
                  : accessLabels.grantLabel ?? 'Grant access'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.title}>{accessLabels.title ?? 'Personal file access'}</Text>
            <Text style={styles.description}>
              {accessLabels.description ??
                'Grant staff access to their personal store files. Only managers and admins can change this setting.'}
            </Text>

            {!storeId ? (
              <Text style={styles.helper}>{accessLabels.storeNotSelected ?? 'Select a store first.'}</Text>
            ) : null}

            {membersError ? <Text style={styles.error}>{membersError}</Text> : null}
            {accessError ? <Text style={styles.error}>{accessError}</Text> : null}

            {loadingMembers ? (
              <View style={styles.loadingBlock}>
                <ActivityIndicator color="#2563eb" />
                <Text style={styles.helper}>{accessLabels.loading ?? 'Loading staff...'}</Text>
              </View>
            ) : null}

            {!loadingMembers && memberRows.length === 0 ? (
              <Text style={styles.helper}>{accessLabels.empty ?? 'No staff members found for this store.'}</Text>
            ) : null}

            {memberRows.map(renderMemberCard)}

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>{accessLabels.close ?? 'Close'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '85%',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    marginVertical: 12,
    width: 52,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1f2945',
  },
  sheetContent: {
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: '#cbd5f5',
    lineHeight: 20,
  },
  helper: {
    color: '#94a3b8',
  },
  error: {
    color: '#f87171',
    fontWeight: '600',
  },
  loadingBlock: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  memberCard: {
    backgroundColor: '#111c32',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  memberHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  memberDetails: {
    flex: 1,
    gap: 2,
  },
  memberName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  memberEmail: {
    color: '#94a3b8',
    fontSize: 12,
  },
  memberActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionButton: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#4ade80',
    alignItems: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: '#1f2945',
    borderWidth: 1,
    borderColor: '#2563eb',
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  actionLabelSecondary: {
    color: '#2563eb',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusGranted: {
    backgroundColor: '#4ade80',
  },
  statusRevoked: {
    backgroundColor: '#1f2945',
  },
  statusBadgeLabel: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeLabel: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default StaffFileAccessModal;
