import React from 'react';
import { ActivityIndicator, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type { AllowanceAssignment, AllowanceMaster } from '@/features/allowances/types';
import type { AllowanceFormState, AllowanceOption } from '@/app/admin/staff/types';


export type AllowanceSectionProps = {
  styles: Record<string, any>;
  proxyLabels: Record<string, any>;
  requestType: 'allowance_add' | 'allowance_update' | 'allowance_end';
  allowanceForm: AllowanceFormState;
  assignmentsLoading: boolean;
  assignmentsError: Error | null;
  filteredUpdateOptions: AllowanceOption[];
  filteredEndOptions: AllowanceOption[];
  selectedUpdateAllowance: AllowanceAssignment | null;
  selectedEndAllowance: AllowanceAssignment | null;
  selectedUpdateMaster: AllowanceMaster | null;
  selectedEndMaster: AllowanceMaster | null;
  onToggleApplyAll: (value: boolean) => void;
  onSelectAllowance: (mode: 'update' | 'end', option: AllowanceOption) => void;
  onChangeAdd: (patch: Partial<AllowanceFormState['add']>) => void;
  onChangeUpdate: (patch: Partial<AllowanceFormState['update']>) => void;
  onChangeEnd: (patch: Partial<AllowanceFormState['end']>) => void;
  formatAmount: (value: number | null | undefined) => string;
  formatEffectiveRange: (from: string | null | undefined, to: string | null | undefined) => string;
};

const AllowanceOptionList: React.FC<{
  styles: Record<string, any>;
  proxyLabels: Record<string, any>;
  mode: 'update' | 'end';
  options: AllowanceOption[];
  selectedId: string | null;
  loading: boolean;
  error: Error | null;
  onSelect: (mode: 'update' | 'end', option: AllowanceOption) => void;
}> = ({ styles, proxyLabels, mode, options, selectedId, loading, error, onSelect }) => {
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color="#94a3b8" />
        <Text style={styles.loadingLabel}>{proxyLabels.loadingAllowances ?? 'Loading allowances...'}</Text>
      </View>
    );
  }

  if (!options.length) {
    return (
      <Text style={styles.emptyState}>{proxyLabels.allowanceEmpty ?? 'No allowances found for the selected staff.'}</Text>
    );
  }

  return (
    <View style={styles.optionList}>
      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <TouchableOpacity
            key={option.id}
            style={[styles.optionItem, selected && styles.optionItemSelected]}
            onPress={() => onSelect(mode, option)}
          >
            <Text style={styles.optionTitle}>{option.title}</Text>
            {option.subtitle ? <Text style={styles.optionSubtitle}>{option.subtitle}</Text> : null}
            {option.master?.calcType ? <Text style={styles.optionMeta}>{option.master.calcType}</Text> : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const AllowanceMeta: React.FC<{
  styles: Record<string, any>;
  proxyLabels: Record<string, any>;
  assignment: AllowanceAssignment | null;
  master: AllowanceMaster | null;
  formatAmount: (value: number | null | undefined) => string;
  formatEffectiveRange: (from: string | null | undefined, to: string | null | undefined) => string;
}> = ({ styles, proxyLabels, assignment, master, formatAmount, formatEffectiveRange }) => {
  if (!assignment && !master) {
    return null;
  }

  const heading = proxyLabels.allowanceMetaHeading ?? 'Selected allowance';
  const calcTypeLabel = proxyLabels.allowanceMetaCalcType ?? 'Calculation';
  const defaultAmountLabel = proxyLabels.allowanceMetaDefaultAmount ?? 'Default amount';
  const effectiveLabel = proxyLabels.allowanceMetaEffective ?? 'Effective period';
  const statusLabel = proxyLabels.allowanceMetaActive ?? 'Status';
  const activeValue = proxyLabels.allowanceMetaActiveValue ?? 'Active';
  const inactiveValue = proxyLabels.allowanceMetaInactiveValue ?? 'Inactive';

  const status = assignment?.status ?? (master?.active === false ? 'inactive' : 'active');
  const statusDisplay = status === 'active' ? activeValue : inactiveValue;
  const effectiveText = formatEffectiveRange(
    assignment?.effectiveFrom ?? master?.effectiveFrom,
    assignment?.effectiveTo ?? master?.effectiveTo,
  );
  const defaultAmount = master?.defaultAmount ?? null;
  const showInactiveWarning = master?.active === false;
  const showEndedWarning = assignment?.status && assignment.status !== 'active';

  return (
    <View style={styles.metaContainer}>
      <Text style={styles.metaHeading}>{heading}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{calcTypeLabel}</Text>
        <Text style={styles.metaValue}>{master?.calcType ?? '-'}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{defaultAmountLabel}</Text>
        <Text style={styles.metaValue}>{formatAmount(defaultAmount)}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{effectiveLabel}</Text>
        <Text style={styles.metaValue}>{effectiveText}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{statusLabel}</Text>
        <Text style={styles.metaValue}>{statusDisplay}</Text>
      </View>
      {showInactiveWarning ? (
        <Text style={styles.warningText}>
          {proxyLabels.allowanceMetaWarningInactive ?? 'This allowance template is inactive.'}
        </Text>
      ) : null}
      {showEndedWarning ? (
        <Text style={styles.warningText}>
          {proxyLabels.allowanceMetaWarningEnded ?? 'This allowance has already ended.'}
        </Text>
      ) : null}
    </View>
  );
};

export const AllowanceSection: React.FC<AllowanceSectionProps> = ({
  styles,
  proxyLabels,
  requestType,
  allowanceForm,
  assignmentsLoading,
  assignmentsError,
  filteredUpdateOptions,
  filteredEndOptions,
  selectedUpdateAllowance,
  selectedEndAllowance,
  selectedUpdateMaster,
  selectedEndMaster,
  onToggleApplyAll,
  onSelectAllowance,
  onChangeAdd,
  onChangeUpdate,
  onChangeEnd,
  formatAmount,
  formatEffectiveRange,
}) => {
  const renderAddForm = () => (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{proxyLabels.allowanceHeading ?? 'Allowance details'}</Text>
      <TextInput
        style={styles.input}
        placeholder={proxyLabels.allowanceNamePlaceholder ?? 'Allowance name'}
        placeholderTextColor="#64748b"
        value={allowanceForm.add.name}
        onChangeText={(value) => onChangeAdd({ name: value })}
      />
      <Text style={styles.fieldLabel}>{proxyLabels.amountLabel ?? 'Amount'}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={proxyLabels.amountPlaceholder ?? 'e.g. 5000'}
        placeholderTextColor="#64748b"
        value={allowanceForm.add.amount}
        onChangeText={(value) => onChangeAdd({ amount: value })}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{proxyLabels.taxExemptLabel ?? 'Tax exempt'}</Text>
        <Switch
          value={allowanceForm.add.taxExempt}
          onValueChange={(value) => onChangeAdd({ taxExempt: value })}
        />
      </View>
      <TextInput
        style={styles.input}
        placeholder={proxyLabels.allowanceEndPlaceholder ?? 'End date (optional)'}
        placeholderTextColor="#64748b"
        value={allowanceForm.add.effectiveTo}
        onChangeText={(value) => onChangeAdd({ effectiveTo: value })}
      />
      <TextInput
        style={[styles.input, styles.multilineInput]}
        multiline
        placeholder={proxyLabels.notePlaceholder ?? 'Notes'}
        placeholderTextColor="#64748b"
        value={allowanceForm.add.note}
        onChangeText={(value) => onChangeAdd({ note: value })}
      />
    </View>
  );

  const renderUpdateForm = () => {
    const hasSelection = Boolean(allowanceForm.update.allowanceId);
    return (
      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>{proxyLabels.allowanceSelectUpdate ?? 'Select allowance to update'}</Text>
        <TextInput
          style={styles.input}
          placeholder={proxyLabels.allowanceSearchPlaceholder ?? 'Search by allowance or staff name'}
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          value={allowanceForm.update.searchTerm}
          onChangeText={(value) => onChangeUpdate({ searchTerm: value })}
        />
        <AllowanceOptionList
          styles={styles}
          proxyLabels={proxyLabels}
          mode="update"
          options={filteredUpdateOptions}
          selectedId={allowanceForm.update.allowanceId}
          loading={assignmentsLoading}
          error={assignmentsError}
          onSelect={onSelectAllowance}
        />
        {assignmentsError ? <Text style={styles.warningText}>{assignmentsError.message}</Text> : null}
        <Text style={styles.fieldLabel}>{proxyLabels.allowanceSelectedLabel ?? 'Selected allowance'}</Text>
        <Text style={styles.readonlyValue}>
          {selectedUpdateAllowance?.name ?? proxyLabels.allowanceUnnamed ?? 'Unnamed allowance'}
        </Text>
        <Text style={styles.fieldLabel}>{proxyLabels.amountLabel ?? 'Amount'}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={proxyLabels.amountPlaceholder ?? 'e.g. 5000'}
          placeholderTextColor="#64748b"
          value={allowanceForm.update.amount}
          onChangeText={(value) => onChangeUpdate({ amount: value })}
          editable={hasSelection}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{proxyLabels.taxExemptLabel ?? 'Tax exempt'}</Text>
          <Switch
            value={allowanceForm.update.taxExempt}
            onValueChange={(value) => onChangeUpdate({ taxExempt: value })}
            disabled={!hasSelection}
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder={proxyLabels.allowanceEndPlaceholder ?? 'End date (optional)'}
          placeholderTextColor="#64748b"
          value={allowanceForm.update.effectiveTo}
          onChangeText={(value) => onChangeUpdate({ effectiveTo: value })}
          editable={hasSelection}
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          multiline
          placeholder={proxyLabels.notePlaceholder ?? 'Notes'}
          placeholderTextColor="#64748b"
          value={allowanceForm.update.note}
          onChangeText={(value) => onChangeUpdate({ note: value })}
          editable={hasSelection}
        />
        <AllowanceMeta
          styles={styles}
          proxyLabels={proxyLabels}
          assignment={selectedUpdateAllowance}
          master={selectedUpdateMaster}
          formatAmount={formatAmount}
          formatEffectiveRange={formatEffectiveRange}
        />
      </View>
    );
  };

  const renderEndForm = () => {
    const hasSelection = Boolean(allowanceForm.end.allowanceId);
    return (
      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>{proxyLabels.allowanceSelectEnd ?? 'Select allowance to end'}</Text>
        <TextInput
          style={styles.input}
          placeholder={proxyLabels.allowanceSearchPlaceholder ?? 'Search by allowance or staff name'}
          placeholderTextColor="#64748b"
          autoCapitalize="none"
          value={allowanceForm.end.searchTerm}
          onChangeText={(value) => onChangeEnd({ searchTerm: value })}
        />
        <AllowanceOptionList
          styles={styles}
          proxyLabels={proxyLabels}
          mode="end"
          options={filteredEndOptions}
          selectedId={allowanceForm.end.allowanceId}
          loading={assignmentsLoading}
          error={assignmentsError}
          onSelect={onSelectAllowance}
        />
        {assignmentsError ? <Text style={styles.warningText}>{assignmentsError.message}</Text> : null}
        <Text style={styles.fieldLabel}>{proxyLabels.allowanceSelectedLabel ?? 'Selected allowance'}</Text>
        <Text style={styles.readonlyValue}>
          {selectedEndAllowance?.name ?? proxyLabels.allowanceUnnamed ?? 'Unnamed allowance'}
        </Text>
        <TextInput
          style={styles.input}
          placeholder={proxyLabels.allowanceEndPlaceholder ?? 'End date (optional)'}
          placeholderTextColor="#64748b"
          value={allowanceForm.end.effectiveTo}
          onChangeText={(value) => onChangeEnd({ effectiveTo: value })}
          editable={hasSelection}
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          multiline
          placeholder={proxyLabels.notePlaceholder ?? 'Notes'}
          placeholderTextColor="#64748b"
          value={allowanceForm.end.note}
          onChangeText={(value) => onChangeEnd({ note: value })}
          editable={hasSelection}
        />
        <AllowanceMeta
          styles={styles}
          proxyLabels={proxyLabels}
          assignment={selectedEndAllowance}
          master={selectedEndMaster}
          formatAmount={formatAmount}
          formatEffectiveRange={formatEffectiveRange}
        />
      </View>
    );
  };

  const renderContent = () => {
    switch (requestType) {
      case 'allowance_add':
        return renderAddForm();
      case 'allowance_update':
        return renderUpdateForm();
      case 'allowance_end':
        return renderEndForm();
      default:
        return null;
    }
  };

  return (
    <View style={styles.fieldGroup}>
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>{proxyLabels.applyToAllSelected ?? 'Apply to all selected staff'}</Text>
        <Switch value={allowanceForm.applyToAllSelected} onValueChange={onToggleApplyAll} />
      </View>
      {renderContent()}
    </View>
  );
};
