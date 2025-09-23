import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import { useAppSelector } from '@/store';
import { useApprovals } from '@/features/approvals/hooks/useApprovals';
import type { ApprovalSummary, ApprovalType } from '@/features/approvals/types';
import { approveMany, rejectMany } from '@/features/approvals/api';
import { hasCapability, rankOfRole, type RoleCapability } from '@/utils/roles';
import ApprovalDetailModal from '@/app/admin/approvals/ApprovalDetailModal';
import CommentPromptModal from '@/app/admin/approvals/CommentPromptModal';

const CAPABILITY_BY_APPROVAL_TYPE: Record<string, RoleCapability | undefined> = {
  shiftCorrection: 'approve_attendance',
  receipt: 'approve_receipt',
  storeMembership: 'approve_join_store',
  employment_change: 'approve_employment',
  allowance_add: 'approve_allowance',
  allowance_update: 'approve_allowance',
  allowance_end: 'approve_allowance',
  commute_update: 'approve_commute',
};

const ApprovalsScreen: React.FC = () => {
  const auth = useAppSelector((state) => state.auth);
  const stores = useAppSelector((state) => state.store.availableStores);
  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const approvalsLabels = useMemo(
    () => (staffLabels.approvals ?? {}) as Record<string, any>,
    [staffLabels],
  );

  const typeLabelMap = useMemo(
    () => ({
      shiftCorrection: approvalsLabels.types?.shiftCorrection ?? 'Shift corrections',
      receipt: approvalsLabels.types?.receipt ?? 'Receipts',
      storeMembership: approvalsLabels.types?.storeMembership ?? 'Membership',
      employment_change: approvalsLabels.types?.employmentChange ?? 'Employment change',
      allowance_add: approvalsLabels.types?.allowanceAdd ?? 'Allowance add',
      allowance_update: approvalsLabels.types?.allowanceUpdate ?? 'Allowance update',
      allowance_end: approvalsLabels.types?.allowanceEnd ?? 'Allowance end',
      commute_update: approvalsLabels.types?.commuteUpdate ?? 'Commute update',
    }),
    [approvalsLabels.types],
  );

  const statusLabelMap: Record<'pending' | 'approved' | 'rejected', string> = {
    pending: approvalsLabels.status?.pending ?? 'Pending',
    approved: approvalsLabels.status?.approved ?? 'Approved',
    rejected: approvalsLabels.status?.rejected ?? 'Rejected',
  };

  const typeOptions: Array<{ value: ApprovalType | 'all'; label: string }> = [
    { value: 'all', label: approvalsLabels.allTypes ?? 'All types' },
    { value: 'shiftCorrection', label: typeLabelMap.shiftCorrection },
    { value: 'receipt', label: typeLabelMap.receipt },
    { value: 'storeMembership', label: typeLabelMap.storeMembership },
    { value: 'employment_change', label: typeLabelMap.employment_change },
    { value: 'allowance_add', label: typeLabelMap.allowance_add },
    { value: 'allowance_update', label: typeLabelMap.allowance_update },
    { value: 'allowance_end', label: typeLabelMap.allowance_end },
    { value: 'commute_update', label: typeLabelMap.commute_update },
  ];

  const [selectedStoreId, setSelectedStoreId] = useState<string | 'all'>('all');
  const [selectedType, setSelectedType] = useState<ApprovalType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] =
    useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailApproval, setDetailApproval] = useState<ApprovalSummary | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalSummary[]>([]);
  const [bulkWorking, setBulkWorking] = useState(false);

  const storeFilter = useMemo(() => {
    if (selectedStoreId === 'all') {
      return undefined;
    }
    return [selectedStoreId];
  }, [selectedStoreId]);

  const typeFilter = useMemo(() => {
    if (selectedType === 'all') {
      return undefined;
    }
    return [selectedType];
  }, [selectedType]);

  const { approvals, loading, error } = useApprovals({
    storeIds: storeFilter,
    statuses: [selectedStatus],
    types: typeFilter,
  });

  const toggleSelection = useCallback(
    (id: string) => {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
    },
    [setSelectedIds],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const openDetail = useCallback((approval: ApprovalSummary) => {
    setDetailApproval(approval);
    setDetailVisible(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailVisible(false);
  }, []);

  const actorUserId = auth.user?.uid;

  const selectedApprovals = useMemo(
    () => approvals.filter((item) => selectedIds.includes(item.id)),
    [approvals, selectedIds],
  );

  const hasMixedBatchSelection = useCallback((items: ApprovalSummary[]) => {
    let activeBatchId: string | null = null;
    let hasMixed = false;
    let hasBatched = false;
    let hasUnbatched = false;
    items.forEach((item) => {
      const batchId = typeof item.batchContext?.id === 'string' ? item.batchContext.id : null;
      if (batchId) {
        hasBatched = true;
        if (!activeBatchId) {
          activeBatchId = batchId;
        } else if (activeBatchId !== batchId) {
          hasMixed = true;
        }
      } else {
        hasUnbatched = true;
      }
    });
    return hasMixed || (hasBatched && hasUnbatched);
  }, []);

  const hasMixedBatch = useMemo(
    () => hasMixedBatchSelection(selectedApprovals),
    [selectedApprovals, hasMixedBatchSelection],
  );

  const {
    staleRole,
    staleAllowance,
    missingRole,
    allowanceNameRequired,
    missingAllowance,
    genericUpdateError,
    errorTitle,
  } = approvalsLabels;

  const resolveErrorMessage = useCallback(
    (code?: string | null) => {
      switch (code) {
        case 'STALE_ROLE_DOCUMENT':
          return staleRole ?? 'Staff record has changed. Please reload and retry.';
        case 'STALE_ALLOWANCE_DOCUMENT':
          return staleAllowance ?? 'Allowance data has changed. Please reload and retry.';
        case 'MISSING_ROLE_DOCUMENT':
          return missingRole ?? 'Target staff record was not found.';
        case 'ALLOWANCE_NAME_REQUIRED':
          return allowanceNameRequired ?? 'Enter an allowance name before continuing.';
        case 'ALLOWANCE_NOT_FOUND':
          return missingAllowance ?? 'The specified allowance could not be found.';
        default:
          if (code && code !== 'UNKNOWN') {
            return code;
          }
          return genericUpdateError ?? 'Failed to update approvals.';
      }
    },
    [staleRole, staleAllowance, missingRole, allowanceNameRequired, missingAllowance, genericUpdateError],
  );

  // ▼▼ 修正：\r\n を含んだ壊れたブロックを置き換え ▼▼
    const roles = useMemo(() => auth.roles ?? [], [auth.roles]);

  const roleMap = useMemo(() => {
    const map = new Map<string, string>();
    roles.forEach((role) => {
      if (role.isResigned) {
        return;
      }
      map.set(role.storeId, role.role);
    });
    return map;
  }, [roles]);

  const highestRole = useMemo(() => {
    let candidate: string | null = null;
    roles.forEach((role) => {
      if (role.isResigned) {
        return;
      }
      if (!candidate || rankOfRole(role.role) > rankOfRole(candidate)) {
        candidate = role.role;
      }
    });
    return candidate;
  }, [roles]);

  const resolveRoleForApproval = useCallback(
    (approval: ApprovalSummary) => {
      if (approval.storeId && roleMap.has(approval.storeId)) {
        return roleMap.get(approval.storeId) ?? highestRole;
      }
      return highestRole;
    },
    [roleMap, highestRole],
  );

  const canApproveApproval = useCallback(
    (approval: ApprovalSummary) => {
      const capability = CAPABILITY_BY_APPROVAL_TYPE[approval.type];
      if (!capability) {
        return true;
      }
      const roleName = resolveRoleForApproval(approval);
      return hasCapability(roleName ?? null, capability);
    },
    [resolveRoleForApproval],
  );

  const unauthorizedForTargets = useCallback(
    (target: ApprovalSummary[]) => target.filter((item) => !canApproveApproval(item)),
    [canApproveApproval],
  );

  const selectedUnauthorized = useMemo(
    () => unauthorizedForTargets(selectedApprovals),
    [selectedApprovals, unauthorizedForTargets],
  );

  const selectedUnauthorizedCount = selectedUnauthorized.length;
  const disableBulkActions =
    selectedIds.length === 0 || bulkWorking || selectedUnauthorizedCount > 0 || hasMixedBatch;

  const executeAction = useCallback(
    async (action: 'approve' | 'reject', comment: string, overrides?: ApprovalSummary[]) => {
      if (!actorUserId) {
        Alert.alert('Not signed in', 'You must be signed in to perform this action.');
        return;
      }
      const targetApprovals = overrides ?? selectedApprovals;
      if (!targetApprovals.length) {
        return;
      }
      if (hasMixedBatchSelection(targetApprovals)) {
        Alert.alert(
          approvalsLabels.mixedBatchTitle ?? 'Batch mismatch',
          approvalsLabels.mixedBatchMessage ??
            'Select approvals from the same batch to continue.',
        );
        return;
      }
      setBulkWorking(true);
      const targetIds = targetApprovals.map((approval) => approval.id);
      try {
        if (action === 'approve') {
          await approveMany({ approvalIds: targetIds, actorUserId, comment });
        } else {
          await rejectMany({ approvalIds: targetIds, actorUserId, comment });
        }
        setSelectedIds([]);
      } catch (err) {
        // ▼▼ 修正：resolveErrorMessage を使ってローカライズされた文言に変換 ▼▼
        const rawMessage = err instanceof Error ? err.message : null;
        const message = resolveErrorMessage(rawMessage);
        Alert.alert(errorTitle ?? 'Error', message);
        // ▲▲ 修正ここまで ▲▲
      } finally {
        setBulkWorking(false);
        setPendingApprovals([]);
      }
    },
    [
      actorUserId,
      selectedApprovals,
      approvalsLabels,
      hasMixedBatchSelection,
      resolveErrorMessage, // 依存に追加
    ],
  );

  const handleBulkAction = useCallback(
    (action: 'approve' | 'reject', overrides?: ApprovalSummary[]) => {
      const targetApprovals = overrides ?? selectedApprovals;
      if (!targetApprovals.length) {
        return;
      }
      if (hasMixedBatchSelection(targetApprovals)) {
        Alert.alert(
          approvalsLabels.mixedBatchTitle ?? 'Batch mismatch',
          approvalsLabels.mixedBatchMessage ??
            'Select approvals from the same batch to continue.',
        );
        return;
      }
      const unauthorized = unauthorizedForTargets(targetApprovals);
      if (unauthorized.length > 0) {
        Alert.alert(
          approvalsLabels.unauthorizedTitle ?? 'Not permitted',
          (approvalsLabels.unauthorizedMessage ??
            'You cannot act on {count} selected items.').replace(
            '{count}',
            String(unauthorized.length),
          ),
        );
        return;
      }
      if (overrides) {
        setSelectedIds(targetApprovals.map((item) => item.id));
      }
      setPendingAction(action);
      setPendingApprovals(targetApprovals);
      const requiresComment = targetApprovals.some((item) => item.commentRequired);
      if (requiresComment) {
        setCommentModalVisible(true);
      } else {
        executeAction(action, '', targetApprovals);
      }
    },
    [
      selectedApprovals,
      executeAction,
      unauthorizedForTargets,
      approvalsLabels,
      hasMixedBatchSelection,
    ],
  );

  const handleCommentSubmit = useCallback(
    (comment: string) => {
      if (pendingAction) {
        executeAction(pendingAction, comment, pendingApprovals);
      }
      setPendingAction(null);
      setPendingApprovals([]);
      setCommentModalVisible(false);
    },
    [pendingAction, executeAction, pendingApprovals],
  );

  const handleCommentCancel = useCallback(() => {
    setCommentModalVisible(false);
    setPendingAction(null);
    setPendingApprovals([]);
  }, []);

  const renderStoreFilter = () => (
    <View style={styles.filterRow}>
      <TouchableOpacity
        style={[styles.filterChip, selectedStoreId === 'all' && styles.filterChipActive]}
        onPress={() => setSelectedStoreId('all')}
      >
        <Text
          style={[
            styles.filterChipLabel,
            selectedStoreId === 'all' && styles.filterChipLabelActive,
          ]}
        >
          {approvalsLabels.allStores ?? 'All stores'}
        </Text>
      </TouchableOpacity>
      {stores.map((store) => {
        const active = selectedStoreId === store.id;
        const label = store.nameShort ?? store.nameOfficial ?? store.id;
        return (
          <TouchableOpacity
            key={store.id}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => setSelectedStoreId(store.id)}
          >
            <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderTypeFilter = () => (
    <View style={styles.filterRow}>
      {typeOptions.map((type) => {
        const active = selectedType === type.value;
        return (
          <TouchableOpacity
            key={type.value}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => setSelectedType(type.value)}
          >
            <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderStatusFilter = () => (
    <View style={styles.filterRow}>
      {(['pending', 'approved', 'rejected'] as const).map((status) => {
        const active = selectedStatus === status;
        return (
          <TouchableOpacity
            key={status}
            style={[styles.filterChip, active && styles.filterChipActive]}
            onPress={() => {
              setSelectedStatus(status);
              clearSelection();
            }}
          >
            <Text style={[styles.filterChipLabel, active && styles.filterChipLabelActive]}>
              {statusLabelMap[status]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderItem = ({ item }: { item: ApprovalSummary }) => {
    const active = selectedIds.includes(item.id);
    const submittedBy = item.submittedByName ?? item.submittedBy ?? null;
    const batchLabel = (() => {
      const ctx = item.batchContext;
      if (!ctx?.id) {
        return null;
      }
      const index = typeof ctx.index === 'number' ? ctx.index + 1 : null;
      const count = typeof ctx.count === 'number' ? ctx.count : null;
      return (approvalsLabels.batchTag ?? 'Batch {index}/{count}')
        .replace('{index}', index ? String(index) : '?')
        .replace('{count}', count ? String(count) : '?');
    })();

    return (
      <TouchableOpacity style={styles.row} onPress={() => openDetail(item)}>
        <TouchableOpacity
          style={[styles.checkbox, active && styles.checkboxActive]}
          onPress={() => toggleSelection(item.id)}
        >
          {active ? <Text style={styles.checkboxLabel}>✓</Text> : null}
        </TouchableOpacity>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle}>{item.title}</Text>
          <View style={styles.rowMeta}>
            {item.storeId ? <Text style={styles.rowMetaText}>{item.storeId}</Text> : null}
            <Text style={styles.rowMetaText}>{typeLabelMap[item.type]}</Text>
            {submittedBy ? (
              <Text style={styles.rowMetaText}>
                {(approvalsLabels.submittedBy ?? 'By {name}').replace('{name}', submittedBy)}
              </Text>
            ) : null}
            {batchLabel ? <Text style={styles.batchTag}>{batchLabel}</Text> : null}
            {item.commentRequired ? (
              <Text style={styles.commentBadge}>
                {approvalsLabels.commentRequired ?? 'Comment required'}
              </Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.filters} contentContainerStyle={styles.filtersContent}>
        <Text style={styles.sectionTitle}>{approvalsLabels.filterStores ?? 'Stores'}</Text>
        {renderStoreFilter()}
        <Text style={styles.sectionTitle}>{approvalsLabels.filterType ?? 'Type'}</Text>
        {renderTypeFilter()}
        <Text style={styles.sectionTitle}>{approvalsLabels.filterStatus ?? 'Status'}</Text>
        {renderStatusFilter()}
      </ScrollView>

      <View style={styles.listContainer}>
        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={styles.stateText}>
              {approvalsLabels.loading ?? 'Loading approvals...'}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : approvals.length === 0 ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateText}>
              {approvalsLabels.empty ?? 'No approvals to display.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={approvals}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>

      {selectedUnauthorizedCount > 0 ? (
        <Text style={styles.footerWarning}>
          {(approvalsLabels.unauthorizedSelected ??
            'You cannot act on {count} selected items.').replace(
            '{count}',
            String(selectedUnauthorizedCount),
          )}
        </Text>
      ) : null}
      {hasMixedBatch ? (
        <Text style={styles.footerWarning}>
          {approvalsLabels.mixedBatchWarning ??
            'Select approvals from the same batch before using bulk actions.'}
        </Text>
      ) : null}

      <View style={styles.footerBar}>
        <TouchableOpacity
          style={[styles.footerButton, styles.secondaryButton]}
          onPress={clearSelection}
          disabled={!selectedIds.length}
        >
          <Text style={styles.footerButtonLabel}>
            {approvalsLabels.clearSelection ?? 'Clear'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.footerButton,
            styles.rejectButton,
            disableBulkActions && styles.footerButtonDisabled,
          ]}
          onPress={() => handleBulkAction('reject')}
          disabled={disableBulkActions}
        >
          <Text style={styles.footerButtonLabel}>
            {bulkWorking
              ? approvalsLabels.working ?? 'Processing...'
              : approvalsLabels.reject ?? 'Reject'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.footerButton,
            styles.approveButton,
            disableBulkActions && styles.footerButtonDisabled,
          ]}
          onPress={() => handleBulkAction('approve')}
          disabled={disableBulkActions}
        >
          <Text style={styles.footerButtonLabel}>
            {bulkWorking
              ? approvalsLabels.working ?? 'Processing...'
              : approvalsLabels.approve ?? 'Approve'}
          </Text>
        </TouchableOpacity>
      </View>

      <ApprovalDetailModal
        visible={detailVisible}
        approval={detailApproval}
        onClose={closeDetail}
        onApprove={(approval) => {
          handleBulkAction('approve', [approval]);
        }}
        onReject={(approval) => {
          handleBulkAction('reject', [approval]);
        }}
      />

      <CommentPromptModal
        visible={commentModalVisible}
        title={
          pendingAction === 'approve'
            ? approvalsLabels.commentApproveTitle ?? 'Add approval comment'
            : approvalsLabels.commentRejectTitle ?? 'Add rejection comment'
        }
        requireComment={pendingApprovals.some((item) => item.commentRequired)}
        onSubmit={handleCommentSubmit}
        onCancel={handleCommentCancel}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  filters: {
    maxHeight: 220,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2a44',
  },
  filtersContent: {
    padding: 20,
    gap: 16,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
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
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111b2e',
    borderRadius: 14,
    padding: 16,
    gap: 12,
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
  rowContent: {
    flex: 1,
    gap: 6,
  },
  rowTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  rowMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rowMetaText: {
    color: '#94a3b8',
    fontSize: 12,
  },
  commentBadge: {
    backgroundColor: '#f59e0b',
    color: '#0f172a',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
  batchTag: {
    backgroundColor: '#1e40af',
    color: '#bfdbfe',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '700',
  },
  stateContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    color: '#94a3b8',
  },
  error: {
    color: '#f87171',
  },
  footerWarning: {
    color: '#f97316',
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  footerBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2a44',
  },
  footerButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  footerButtonLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  footerButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButton: {
    backgroundColor: '#1f2937',
  },
  rejectButton: {
    backgroundColor: '#b91c1c',
  },
  approveButton: {
    backgroundColor: '#16a34a',
  },
});

export default ApprovalsScreen;

