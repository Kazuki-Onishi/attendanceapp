import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { doc, getDoc } from 'firebase/firestore';

import labels from '@/i18n/ja.json';
import { firestore } from '@/lib/firebase';
import type { ApprovalSummary } from '@/features/approvals/types';

interface ApprovalDetailModalProps {
  visible: boolean;
  approval: ApprovalSummary | null;
  onClose: () => void;
  onApprove?: (approval: ApprovalSummary) => void;
  onReject?: (approval: ApprovalSummary) => void;
}

type DiffEntry = {
  label: string;
  current: unknown;
  requested: unknown;
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '?';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toString() : '?';
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const readVariants = (source: unknown, paths: string[][]): unknown => {
  if (!source || typeof source !== 'object') {
    return null;
  }
  for (const path of paths) {
    let cursor: unknown = source;
    let valid = true;
    for (const key of path) {
      if (cursor && typeof cursor === 'object' && key in (cursor as Record<string, unknown>)) {
        cursor = (cursor as Record<string, unknown>)[key];
      } else {
        valid = false;
        break;
      }
    }
    if (valid && cursor !== undefined) {
      return cursor;
    }
  }
  return null;
};

const buildDiffEntries = (
  approval: ApprovalSummary | null,
  currentData: Record<string, unknown> | null,
): DiffEntry[] => {
  if (!approval) {
    return [];
  }
  const entries: DiffEntry[] = [];
  const payload = (approval.payload ?? {}) as Record<string, unknown>;
  const current = currentData ?? {};

  const pushEntry = (label: string, currentValue: unknown, requestedValue: unknown) => {
    if (requestedValue === undefined) {
      return;
    }
    entries.push({ label, current: currentValue, requested: requestedValue });
  };

  switch (approval.type) {
    case 'employment_change': {
      pushEntry(
        'Employment type',
        readVariants(current, [['employment', 'type'], ['employmentType']]),
        payload.employmentType,
      );
      pushEntry(
        'Base rate',
        readVariants(current, [['employment', 'baseRate'], ['baseRate'], ['hourlyWage']]),
        payload.baseRate,
      );
      pushEntry(
        'Base hours',
        readVariants(current, [['employment', 'baseHours']]),
        payload.baseHours,
      );
      pushEntry('Note', readVariants(current, [['employment', 'note']]), payload.note);
      pushEntry(
        'Effective from',
        readVariants(current, [['employment', 'effectiveFrom']]),
        payload.effectiveFrom,
      );
      break;
    }
    case 'allowance_add':
    case 'allowance_update':
    case 'allowance_end': {
      const allowance = (payload.allowance ?? {}) as Record<string, unknown>;
      pushEntry(
        'Allowance name',
        readVariants(current, [['allowance', 'name'], ['allowances', 'name']]),
        allowance.name,
      );
      pushEntry('Amount', readVariants(current, [['allowance', 'amount']]), allowance.amount);
      pushEntry(
        'Tax exempt',
        readVariants(current, [['allowance', 'taxExempt']]),
        allowance.taxExempt,
      );
      pushEntry(
        'Effective through',
        readVariants(current, [['allowance', 'effectiveTo']]),
        allowance.effectiveTo,
      );
      pushEntry('Notes', readVariants(current, [['allowance', 'note']]), allowance.note);
      break;
    }
    case 'commute_update': {
      const commute = (payload.commute ?? {}) as Record<string, unknown>;
      pushEntry(
        'Commute mode',
        readVariants(current, [['commute', 'mode'], ['commuteMode']]),
        commute.mode,
      );
      pushEntry(
        'Commute amount',
        readVariants(current, [['commute', 'amount'], ['commuteAmount']]),
        commute.amount,
      );
      pushEntry(
        'Tax exempt',
        readVariants(current, [['commute', 'taxExempt']]),
        commute.taxExempt,
      );
      break;
    }
    default:
      break;
  }

  return entries;
};

const ApprovalDetailModal: React.FC<ApprovalDetailModalProps> = ({
  visible,
  approval,
  onClose,
  onApprove,
  onReject,
}) => {
  const approvalsLabels = (labels.staff?.approvals ?? {}) as Record<string, any>;
  const detailLabels = (approvalsLabels.detail ?? {}) as Record<string, string>;

  const [currentData, setCurrentData] = useState<Record<string, unknown> | null>(null);
  const [currentLoading, setCurrentLoading] = useState(false);
  const [currentError, setCurrentError] = useState<string | null>(null);

  const resolvedTarget = useMemo(() => {
    if (!approval) {
      return null;
    }
    const explicitCol = typeof approval.target?.col === 'string' ? approval.target.col : null;
    const explicitId = typeof approval.target?.id === 'string' ? approval.target.id : null;
    const fallbackId =
      typeof approval.payload?.targetRoleDocId === 'string'
        ? (approval.payload.targetRoleDocId as string)
        : null;
    const col = explicitCol ?? (fallbackId ? 'userStoreRoles' : null);
    const id = explicitId ?? fallbackId;
    if (!col || !id) {
      return null;
    }
    return { col, id };
  }, [approval]);

  useEffect(() => {
    let cancelled = false;
    const fetchCurrent = async () => {
      if (!visible || !resolvedTarget) {
        setCurrentData(null);
        setCurrentError(null);
        setCurrentLoading(false);
        return;
      }
      setCurrentLoading(true);
      try {
        const snap = await getDoc(doc(firestore(), resolvedTarget.col, resolvedTarget.id));
        if (cancelled) {
          return;
        }
        if (snap.exists()) {
          setCurrentData(snap.data() as Record<string, unknown>);
          setCurrentError(null);
        } else {
          setCurrentData(null);
          setCurrentError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error
              ? err.message
              : detailLabels.loadError ?? 'Failed to load current data.';
          setCurrentError(message);
          setCurrentData(null);
        }
      } finally {
        if (!cancelled) {
          setCurrentLoading(false);
        }
      }
    };

    fetchCurrent().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, resolvedTarget, detailLabels.loadError]);

  const typeNameMap = useMemo(
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

  const diffEntries = useMemo(() => buildDiffEntries(approval, currentData), [approval, currentData]);

  const payloadEntries = useMemo(() => {
    if (!approval) {
      return [];
    }
    return Object.entries(approval.payload ?? {});
  }, [approval]);

  if (!approval) {
    return null;
  }

  const friendlyType = typeNameMap[approval.type] ?? approval.type;
  const submittedDisplay = approval.submittedByName ?? approval.submittedBy ?? null;
  const batchLabel =
    approval.batchContext?.id && (detailLabels.batchContext ?? 'Batch {index}/{count}')
      .replace(
        '{index}',
        typeof approval.batchContext.index === 'number'
          ? String(approval.batchContext.index + 1)
          : '?',
      )
      .replace(
        '{count}',
        typeof approval.batchContext.count === 'number'
          ? String(approval.batchContext.count)
          : '?',
      );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{approval.title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeLabel}>�~</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body}>
            <Text style={styles.meta}>
              {(detailLabels.typeLabel ?? 'Type') + ': ' + friendlyType}
            </Text>
            <Text style={styles.meta}>
              {(detailLabels.statusLabel ?? 'Status') + ': ' + approval.status}
            </Text>
            {approval.storeId ? (
              <Text style={styles.meta}>
                {(detailLabels.storeLabel ?? 'Store') + ': ' + approval.storeId}
              </Text>
            ) : null}
            {submittedDisplay ? (
              <Text style={styles.meta}>
                {(detailLabels.submittedByLabel ?? 'Submitted by') + ': ' + submittedDisplay}
              </Text>
            ) : null}
            {approval.submittedAt ? (
              <Text style={styles.meta}>
                {(detailLabels.submittedAtLabel ?? 'Submitted at') + ': ' + approval.submittedAt.toLocaleString()}
              </Text>
            ) : null}
            {batchLabel ? <Text style={styles.meta}>{batchLabel}</Text> : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {detailLabels.diffTitle ?? 'Requested changes'}
              </Text>
              {diffEntries.length ? (
                diffEntries.map((entry) => (
                  <View key={entry.label} style={styles.diffRow}>
                    <Text style={styles.diffLabel}>{entry.label}</Text>
                    <View style={styles.diffValues}>
                      <View style={styles.diffColumn}>
                        <Text style={styles.diffCaption}>
                          {detailLabels.currentValue ?? 'Current'}
                        </Text>
                        <Text style={styles.diffValue}>{formatValue(entry.current)}</Text>
                      </View>
                      <View style={styles.diffColumn}>
                        <Text style={styles.diffCaption}>
                          {detailLabels.requestedValue ?? 'Requested'}
                        </Text>
                        <Text style={[styles.diffValue, styles.diffValueHighlight]}>
                          {formatValue(entry.requested)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.empty}>
                  {detailLabels.noDiff ?? 'No structured diff available for this request.'}
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {detailLabels.requestedPayloadTitle ?? 'Requested payload'}
              </Text>
              {payloadEntries.length === 0 ? (
                <Text style={styles.empty}>
                  {detailLabels.noPayload ?? 'No payload attached.'}
                </Text>
              ) : (
                payloadEntries.map(([key, value]) => (
                  <View key={key} style={styles.payloadRow}>
                    <Text style={styles.payloadKey}>{key}</Text>
                    <Text style={styles.payloadValue}>{formatValue(value)}</Text>
                  </View>
                ))
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {detailLabels.currentDataTitle ?? 'Current document'}
              </Text>
              {currentLoading ? (
                <View style={styles.currentState}>
                  <ActivityIndicator color="#38bdf8" />
                  <Text style={styles.stateText}>
                    {detailLabels.loadingCurrent ?? 'Loading current values...'}
                  </Text>
                </View>
              ) : currentError ? (
                <Text style={styles.error}>{currentError}</Text>
              ) : currentData ? (
                <Text style={styles.payloadValue}>{formatValue(currentData)}</Text>
              ) : (
                <Text style={styles.empty}>
                  {detailLabels.noCurrent ?? 'No stored values were found for this target.'}
                </Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {onReject ? (
              <TouchableOpacity style={[styles.footerButton, styles.rejectButton]} onPress={() => onReject(approval)}>
                <Text style={styles.footerButtonLabel}>{detailLabels.reject ?? 'Reject'}</Text>
              </TouchableOpacity>
            ) : null}
            {onApprove ? (
              <TouchableOpacity style={[styles.footerButton, styles.approveButton]} onPress={() => onApprove(approval)}>
                <Text style={[styles.footerButtonLabel, styles.approveLabel]}>
                  {detailLabels.approve ?? 'Approve'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2a44',
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  closeLabel: {
    color: '#94a3b8',
    fontSize: 24,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  meta: {
    color: '#94a3b8',
    marginBottom: 6,
  },
  section: {
    marginTop: 12,
    gap: 12,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 16,
  },
  diffRow: {
    backgroundColor: '#111b2e',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  diffLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  diffValues: {
    flexDirection: 'row',
    gap: 12,
  },
  diffColumn: {
    flex: 1,
    gap: 4,
  },
  diffCaption: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  diffValue: {
    color: '#e2e8f0',
    fontFamily: 'monospace',
    fontSize: 13,
  },
  diffValueHighlight: {
    color: '#bfdbfe',
  },
  payloadRow: {
    gap: 4,
  },
  payloadKey: {
    color: '#94a3b8',
    fontWeight: '600',
  },
  payloadValue: {
    color: '#cbd5f5',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  empty: {
    color: '#64748b',
  },
  currentState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stateText: {
    color: '#94a3b8',
  },
  error: {
    color: '#f87171',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2a44',
  },
  footerButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  footerButtonLabel: {
    color: '#e2e8f0',
    fontWeight: '700',
  },
  rejectButton: {
    backgroundColor: '#1f2937',
  },
  approveButton: {
    backgroundColor: '#16a34a',
  },
  approveLabel: {
    color: '#f8fafc',
  },
});

export default ApprovalDetailModal;

