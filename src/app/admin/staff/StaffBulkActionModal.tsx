import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import { createBatchApprovals } from '@/features/approvals/api';
import type { ApprovalType } from '@/features/approvals/types';

export type SelectedStaffTarget = {
  userId: string;
  roleDocId: string;
  name: string;
  role: string;
};

type StaffBulkActionModalProps = {
  visible: boolean;
  storeId: string | null;
  targets: SelectedStaffTarget[];
  requesterUid: string;
  requesterName?: string | null;
  onClose: () => void;
  onSubmitted?: (result: { batchId: string; created: number }) => void;
};

const REQUEST_TYPES: Array<{ value: ApprovalType; labelKey: string }> = [
  { value: 'employment_change', labelKey: 'employment' },
  { value: 'allowance_add', labelKey: 'allowanceAdd' },
  { value: 'allowance_update', labelKey: 'allowanceUpdate' },
  { value: 'allowance_end', labelKey: 'allowanceEnd' },
  { value: 'commute_update', labelKey: 'commute' },
];

const toNumber = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const StaffBulkActionModal: React.FC<StaffBulkActionModalProps> = ({
  visible,
  storeId,
  targets,
  requesterUid,
  requesterName,
  onClose,
  onSubmitted,
}) => {
  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const proxyLabels = useMemo(() => (staffLabels.proxy?.modal ?? {}) as Record<string, any>, [staffLabels]);

  const [requestType, setRequestType] = useState<ApprovalType>('employment_change');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [commentRequired, setCommentRequired] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [employmentType, setEmploymentType] = useState<'hourly' | 'salaried'>('hourly');
  const [employmentRate, setEmploymentRate] = useState('');
  const [employmentHours, setEmploymentHours] = useState('');
  const [employmentNote, setEmploymentNote] = useState('');

  const [allowanceName, setAllowanceName] = useState('');
  const [allowanceAmount, setAllowanceAmount] = useState('');
  const [allowanceTaxExempt, setAllowanceTaxExempt] = useState(false);
  const [allowanceNotes, setAllowanceNotes] = useState('');
  const [allowanceEndDate, setAllowanceEndDate] = useState('');

  const [commuteMode, setCommuteMode] = useState<'perDay' | 'fixedMonthly'>('perDay');
  const [commuteAmount, setCommuteAmount] = useState('');
  const [commuteTaxExempt, setCommuteTaxExempt] = useState(true);

  const targetsCount = targets.length;

  const typeOptions = useMemo(
    () =>
      REQUEST_TYPES.map((option) => ({
        value: option.value,
        label: proxyLabels.typeOptions?.[option.labelKey] ?? option.value,
      })),
    [proxyLabels],
  );

  const resetForm = () => {
    setRequestType('employment_change');
    setEffectiveFrom('');
    setCommentRequired(false);
    setTitle('');
    setEmploymentType('hourly');
    setEmploymentRate('');
    setEmploymentHours('');
    setEmploymentNote('');
    setAllowanceName('');
    setAllowanceAmount('');
    setAllowanceTaxExempt(false);
    setAllowanceNotes('');
    setAllowanceEndDate('');
    setCommuteMode('perDay');
    setCommuteAmount('');
    setCommuteTaxExempt(true);
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const validate = (): string | null => {
    if (!effectiveFrom.trim()) {
      return proxyLabels.effectiveFromMissing ?? 'Enter an effective start date.';
    }

    switch (requestType) {
      case 'employment_change': {
        const rate = toNumber(employmentRate);
        if (rate === null || rate <= 0) {
          return proxyLabels.validation?.employmentRate ?? 'Enter a valid base rate.';
        }
        const hours = employmentHours.trim() ? toNumber(employmentHours) : null;
        if (hours !== null && hours <= 0) {
          return proxyLabels.validation?.employmentHours ?? 'Monthly hours must be greater than zero.';
        }
        break;
      }
      case 'allowance_add':
      case 'allowance_update': {
        if (!allowanceName.trim()) {
          return proxyLabels.validation?.allowanceName ?? 'Enter an allowance name.';
        }
        const amount = toNumber(allowanceAmount);
        if (amount === null || amount <= 0) {
          return proxyLabels.validation?.allowanceAmount ?? 'Enter a valid allowance amount.';
        }
        break;
      }
      case 'allowance_end': {
        if (!allowanceName.trim()) {
          return proxyLabels.validation?.allowanceName ?? 'Enter an allowance name.';
        }
        break;
      }
      case 'commute_update': {
        const amount = toNumber(commuteAmount);
        if (amount === null || amount <= 0) {
          return proxyLabels.validation?.commuteAmount ?? 'Enter a valid commute amount.';
        }
        break;
      }
      default:
        break;
    }
    return null;
  };

  const buildPayload = (): Record<string, unknown> => {
    const base = {
      effectiveFrom: effectiveFrom || null,
      requestedAt: new Date().toISOString(),
    };

    switch (requestType) {
      case 'employment_change':
        return {
          ...base,
          employmentType,
          baseRate: toNumber(employmentRate),
          baseHours: toNumber(employmentHours),
          note: employmentNote || null,
        };
      case 'allowance_add':
      case 'allowance_update':
      case 'allowance_end':
        return {
          ...base,
          allowance: {
            name: allowanceName || null,
            amount: toNumber(allowanceAmount),
            taxExempt: allowanceTaxExempt,
            note: allowanceNotes || null,
            effectiveTo: allowanceEndDate || null,
          },
        };
      case 'commute_update':
        return {
          ...base,
          commute: {
            mode: commuteMode,
            amount: toNumber(commuteAmount),
            taxExempt: commuteTaxExempt,
          },
        };
      default:
        return base;
    }
  };

  const handleSubmit = async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert(proxyLabels.validationTitle ?? 'Check inputs', validationError);
      return;
    }
    if (!storeId) {
      Alert.alert(proxyLabels.storeMissingTitle ?? 'Store required', proxyLabels.storeMissing ?? 'Select a store before submitting.');
      return;
    }
    if (!targetsCount) {
      Alert.alert(proxyLabels.noSelectionTitle ?? 'No staff selected', proxyLabels.noSelection ?? 'Select at least one staff member.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const result = await createBatchApprovals({
        storeId,
        targetRoleDocIds: targets.map((item) => item.roleDocId),
        type: requestType,
        payload,
        requester: { uid: requesterUid, name: requesterName ?? null },
        title: title && title.trim().length > 0 ? title.trim() : null,
        commentRequired,
      });
      onSubmitted?.(result);
      resetForm();
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create approvals.';
      Alert.alert(proxyLabels.errorTitle ?? 'Submission failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderEmploymentForm = () => (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{proxyLabels.employmentHeading ?? 'Employment details'}</Text>
      <View style={styles.segmentedControl}>
        {(['hourly', 'salaried'] as const).map((value) => {
          const active = employmentType === value;
          return (
            <TouchableOpacity
              key={value}
              style={[styles.segmentButton, active && styles.segmentButtonActive]}
              onPress={() => setEmploymentType(value)}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {value === 'hourly'
                  ? proxyLabels.employmentTypeHourly ?? 'Hourly'
                  : proxyLabels.employmentTypeSalaried ?? 'Salaried'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>{proxyLabels.rateLabel ?? 'Base rate'}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={proxyLabels.ratePlaceholder ?? 'e.g. 1200'}
        placeholderTextColor="#64748b"
        value={employmentRate}
        onChangeText={setEmploymentRate}
      />
      <Text style={styles.fieldLabel}>{proxyLabels.hoursLabel ?? 'Monthly hours'}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={proxyLabels.hoursPlaceholder ?? 'e.g. 160'}
        placeholderTextColor="#64748b"
        value={employmentHours}
        onChangeText={setEmploymentHours}
      />
      <TextInput
        style={[styles.input, styles.multilineInput]}
        multiline
        placeholder={proxyLabels.notePlaceholder ?? 'Notes'}
        placeholderTextColor="#64748b"
        value={employmentNote}
        onChangeText={setEmploymentNote}
      />
    </View>
  );

  const renderAllowanceForm = () => (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{proxyLabels.allowanceHeading ?? 'Allowance details'}</Text>
      <TextInput
        style={styles.input}
        placeholder={proxyLabels.allowanceNamePlaceholder ?? 'Allowance name'}
        placeholderTextColor="#64748b"
        value={allowanceName}
        onChangeText={setAllowanceName}
      />
      <Text style={styles.fieldLabel}>{proxyLabels.amountLabel ?? 'Amount'}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={proxyLabels.amountPlaceholder ?? 'e.g. 5000'}
        placeholderTextColor="#64748b"
        value={allowanceAmount}
        onChangeText={setAllowanceAmount}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{proxyLabels.taxExemptLabel ?? 'Tax exempt'}</Text>
        <Switch value={allowanceTaxExempt} onValueChange={setAllowanceTaxExempt} />
      </View>
      <TextInput
        style={styles.input}
        placeholder={proxyLabels.allowanceEndPlaceholder ?? 'End date (optional)'}
        placeholderTextColor="#64748b"
        value={allowanceEndDate}
        onChangeText={setAllowanceEndDate}
      />
      <TextInput
        style={[styles.input, styles.multilineInput]}
        multiline
        placeholder={proxyLabels.notePlaceholder ?? 'Notes'}
        placeholderTextColor="#64748b"
        value={allowanceNotes}
        onChangeText={setAllowanceNotes}
      />
    </View>
  );

  const renderCommuteForm = () => (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{proxyLabels.commuteHeading ?? 'Commute details'}</Text>
      <View style={styles.segmentedControl}>
        {(['perDay', 'fixedMonthly'] as const).map((value) => {
          const active = commuteMode === value;
          return (
            <TouchableOpacity
              key={value}
              style={[styles.segmentButton, active && styles.segmentButtonActive]}
              onPress={() => setCommuteMode(value)}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
                {value === 'perDay'
                  ? proxyLabels.commutePerDay ?? 'Per day'
                  : proxyLabels.commuteFixed ?? 'Monthly fixed'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>{proxyLabels.amountLabel ?? 'Amount'}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={proxyLabels.amountPlaceholder ?? 'e.g. 600'}
        placeholderTextColor="#64748b"
        value={commuteAmount}
        onChangeText={setCommuteAmount}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{proxyLabels.taxExemptLabel ?? 'Tax exempt'}</Text>
        <Switch value={commuteTaxExempt} onValueChange={setCommuteTaxExempt} />
      </View>
    </View>
  );

  const renderForm = () => {
    switch (requestType) {
      case 'employment_change':
        return renderEmploymentForm();
      case 'allowance_add':
      case 'allowance_update':
      case 'allowance_end':
        return renderAllowanceForm();
      case 'commute_update':
        return renderCommuteForm();
      default:
        return null;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{proxyLabels.title ?? 'Proxy request'}</Text>
            <Text style={styles.subtitle}>
              {(proxyLabels.selectedLabel ?? '{count} staff selected').replace('{count}', String(targetsCount))}
            </Text>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>{proxyLabels.typeLabel ?? 'Request type'}</Text>
              <View style={styles.segmentedControl}>
                {typeOptions.map((option) => {
                  const active = requestType === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.segmentButton, active && styles.segmentButtonActive]}
                      onPress={() => setRequestType(option.value)}
                    >
                      <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>{proxyLabels.effectiveFromLabel ?? 'Effective from'}</Text>
              <TextInput
                style={styles.input}
                placeholder={proxyLabels.effectiveFromPlaceholder ?? 'YYYY-MM-DD'}
                placeholderTextColor="#64748b"
                value={effectiveFrom}
                onChangeText={setEffectiveFrom}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.groupTitle}>{proxyLabels.titleLabel ?? 'Title (optional)'}</Text>
              <TextInput
                style={styles.input}
                placeholder={proxyLabels.titlePlaceholder ?? 'e.g. Update employment terms'}
                placeholderTextColor="#64748b"
                value={title}
                onChangeText={setTitle}
              />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{proxyLabels.commentRequiredLabel ?? 'Require approval comment'}</Text>
              <Switch value={commentRequired} onValueChange={setCommentRequired} />
            </View>

            {renderForm()}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.footerButton, styles.cancelButton]} onPress={handleClose} disabled={submitting}>
              <Text style={styles.footerButtonLabel}>{proxyLabels.cancel ?? 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerButton, styles.submitButton]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.footerButtonLabel}>{proxyLabels.submit ?? 'Submit requests'}</Text>
              )}
            </TouchableOpacity>
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
    justifyContent: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2a44',
    gap: 6,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#94a3b8',
  },
  body: {
    maxHeight: 420,
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  bodyContent: {
    gap: 16,
  },
  fieldGroup: {
    gap: 12,
  },
  groupTitle: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#111b2e',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  segmentedControl: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1f2945',
  },
  segmentButtonActive: {
    backgroundColor: '#2563eb',
  },
  segmentLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  segmentLabelActive: {
    color: '#fff',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  fieldLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    padding: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1f2a44',
  },
  footerButton: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
  },
  footerButtonLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#1f2937',
  },
  submitButton: {
    backgroundColor: '#2563eb',
  },
});

export default StaffBulkActionModal;
