import React from 'react';
import { Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';

import type {
  EmploymentPayType,
  EmploymentTypeOption,
  HealthInsuranceType,
  PaidLeaveGrantType,
  RoleOption,
} from '@/app/admin/staff/types';

export type EmploymentSectionProps = {
  styles: Record<string, any>;
  proxyLabels: Record<string, any>;
  showOvertime: boolean;
  disableInsurance: boolean;
  disablePaidLeave: boolean;
  disableInsuranceMessage?: string | null;
  disablePaidLeaveMessage?: string | null;
  insuranceEnabled: boolean;
  insuranceToggleDisabled: boolean;
  canEditStandardRemuneration: boolean;
  showStandardRemuneration: boolean;
  employmentType: EmploymentTypeOption;
  employmentRole: string;
  employmentJoinDate: string;
  employmentWeeklyDays: string;
  employmentDailyHours: string;
  employmentPayType: EmploymentPayType;
  employmentRate: string;
  employmentHours: string;
  employmentOvertime: string;
  employmentNote: string;
  healthInsuranceType: HealthInsuranceType;
  healthInsurancePrefecture: string;
  healthInsuranceCareApplicable: boolean;
  pensionEnrolled: boolean;
  employmentInsuranceEnrolled: boolean;
  employmentInsuranceCategory: string;
  paidLeaveGrantType: PaidLeaveGrantType;
  paidLeaveFiscalMonth: string;
  paidLeaveHourlyAllowed: boolean;
  paidLeaveMinimumUnit: string;
  standardRemunerationOverride: string;
  roleOptions: RoleOption[];
  onChangeType: (value: EmploymentTypeOption) => void;
  onChangeRole: (value: string) => void;
  onChangeJoinDate: (value: string) => void;
  onChangeWeeklyDays: (value: string) => void;
  onChangeDailyHours: (value: string) => void;
  onChangePayType: (value: EmploymentPayType) => void;
  onChangeRate: (value: string) => void;
  onChangeHours: (value: string) => void;
  onChangeOvertime: (value: string) => void;
  onChangeNote: (value: string) => void;
  onChangeHealthInsuranceType: (value: HealthInsuranceType) => void;
  onChangeHealthInsurancePrefecture: (value: string) => void;
  onToggleHealthInsuranceCare: (value: boolean) => void;
  onTogglePension: (value: boolean) => void;
  onToggleEmploymentInsurance: (value: boolean) => void;
  onChangeEmploymentInsuranceCategory: (value: string) => void;
  onChangePaidLeaveGrantType: (value: PaidLeaveGrantType) => void;
  onChangePaidLeaveFiscalMonth: (value: string) => void;
  onTogglePaidLeaveHourlyAllowed: (value: boolean) => void;
  onChangePaidLeaveMinimumUnit: (value: string) => void;
  onToggleStandardRemuneration: (value: boolean) => void;
  onChangeStandardRemuneration: (value: string) => void;
  onToggleInsuranceEnabled: (value: boolean) => void;
};

const getBaseWageLabel = (
  proxyLabels: Record<string, any>,
  payType: EmploymentPayType,
): string => {
  const labels = proxyLabels.baseWageLabel ?? {};
  switch (payType) {
    case 'hourly':
      return labels.hourly ?? proxyLabels.rateLabel ?? 'Base hourly wage';
    case 'monthly':
      return labels.monthly ?? proxyLabels.monthlyRateLabel ?? 'Base monthly pay';
    case 'daily':
      return labels.daily ?? proxyLabels.dailyRateLabel ?? 'Base daily pay';
    case 'commission':
    default:
      return labels.commission ?? proxyLabels.commissionRateLabel ?? 'Commission baseline';
  }
};

export const EmploymentSection: React.FC<EmploymentSectionProps> = ({
  styles,
  proxyLabels,
  showOvertime,
  disableInsurance,
  disablePaidLeave,
  disableInsuranceMessage,
  disablePaidLeaveMessage,
  insuranceEnabled,
  insuranceToggleDisabled,
  canEditStandardRemuneration,
  showStandardRemuneration,
  employmentType,
  employmentRole,
  employmentJoinDate,
  employmentWeeklyDays,
  employmentDailyHours,
  employmentPayType,
  employmentRate,
  employmentHours,
  employmentOvertime,
  employmentNote,
  healthInsuranceType,
  healthInsurancePrefecture,
  healthInsuranceCareApplicable,
  pensionEnrolled,
  employmentInsuranceEnrolled,
  employmentInsuranceCategory,
  paidLeaveGrantType,
  paidLeaveFiscalMonth,
  paidLeaveHourlyAllowed,
  paidLeaveMinimumUnit,
  standardRemunerationOverride,
  roleOptions,
  onChangeType,
  onChangeRole,
  onChangeJoinDate,
  onChangeWeeklyDays,
  onChangeDailyHours,
  onChangePayType,
  onChangeRate,
  onChangeHours,
  onChangeOvertime,
  onChangeNote,
  onChangeHealthInsuranceType,
  onChangeHealthInsurancePrefecture,
  onToggleHealthInsuranceCare,
  onTogglePension,
  onToggleEmploymentInsurance,
  onChangeEmploymentInsuranceCategory,
  onChangePaidLeaveGrantType,
  onChangePaidLeaveFiscalMonth,
  onTogglePaidLeaveHourlyAllowed,
  onChangePaidLeaveMinimumUnit,
  onToggleStandardRemuneration,
  onChangeStandardRemuneration,
  onToggleInsuranceEnabled,
}) => {
  const payTypeOptions: Array<{ value: EmploymentPayType; label: string }> = [
    { value: 'monthly', label: proxyLabels.payTypeMonthly ?? 'Monthly salary' },
    { value: 'hourly', label: proxyLabels.payTypeHourly ?? 'Hourly wage' },
    { value: 'daily', label: proxyLabels.payTypeDaily ?? 'Daily pay' },
    { value: 'commission', label: proxyLabels.payTypeCommission ?? 'Commission / contract' },
  ];

  const payTypeInfo = (proxyLabels.payTypeInfo ?? {})[employmentPayType];
  const showBaseWageInput = employmentPayType === 'hourly' || employmentPayType === 'monthly';
  const baseWageLabel = getBaseWageLabel(proxyLabels, employmentPayType);

  const socialSwitchValue = insuranceToggleDisabled ? false : insuranceEnabled;
  const insuranceFieldsDisabled = disableInsurance;

  return (
    <View style={styles.sectionStack ?? styles.fieldGroup}>
      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>{proxyLabels.basicHeading ?? 'Basic details'}</Text>
        <View style={styles.segmentedControl}>
          {([
            { value: 'employee', label: proxyLabels.employmentTypeEmployee ?? '正社員 / 契約社員' },
            { value: 'hourlyEmployee', label: proxyLabels.employmentTypeHourlyEmployee ?? 'パート / アルバイト' },
            { value: 'contractor', label: proxyLabels.employmentTypeContractor ?? '業務委託' },
          ] as const).map((option) => {
            const active = employmentType === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.segmentButton, active && styles.segmentButtonActive]}
                onPress={() => onChangeType(option.value)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>{proxyLabels.employmentRoleLabel ?? 'Role'}</Text>
        <View style={styles.segmentedControl}>
          {roleOptions.map((option) => {
            const active = employmentRole === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.segmentButton, active && styles.segmentButtonActive]}
                onPress={() => onChangeRole(option.value)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>{proxyLabels.joinDateLabel ?? 'Hire date'}</Text>
        <TextInput
          style={styles.input}
          placeholder={proxyLabels.joinDatePlaceholder ?? 'YYYY-MM-DD'}
          placeholderTextColor="#64748b"
          value={employmentJoinDate}
          onChangeText={onChangeJoinDate}
        />

        <Text style={styles.fieldLabel}>{proxyLabels.weeklyDaysLabel ?? 'Working days per week'}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={proxyLabels.weeklyDaysPlaceholder ?? 'e.g. 5'}
          placeholderTextColor="#64748b"
          value={employmentWeeklyDays}
          onChangeText={onChangeWeeklyDays}
        />

        <Text style={styles.fieldLabel}>{proxyLabels.dailyHoursLabel ?? 'Hours per day'}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={proxyLabels.dailyHoursPlaceholder ?? 'e.g. 8'}
          placeholderTextColor="#64748b"
          value={employmentDailyHours}
          onChangeText={onChangeDailyHours}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>{proxyLabels.compensationHeading ?? 'Compensation'}</Text>
        <Text style={styles.fieldLabel}>{proxyLabels.payTypeLabel ?? 'Pay type'}</Text>
        <View style={styles.segmentedControl}>
          {payTypeOptions.map((option) => {
            const active = employmentPayType === option.value;
            const disabled = employmentType === 'contractor' && option.value !== 'commission';
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segmentButton,
                  disabled && styles.segmentButtonDisabled,
                  active && styles.segmentButtonActive,
                ]}
                disabled={disabled}
                onPress={() => onChangePayType(option.value)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {payTypeInfo ? <Text style={styles.sectionNotice}>{payTypeInfo}</Text> : null}

        {showBaseWageInput ? (
          <>
            <Text style={styles.fieldLabel}>{baseWageLabel}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={(proxyLabels.baseWagePlaceholder ?? {})[employmentPayType] ?? 'e.g. 250000'}
              placeholderTextColor="#64748b"
              value={employmentRate}
              onChangeText={onChangeRate}
            />
          </>
        ) : null}

        <Text style={styles.fieldLabel}>{proxyLabels.hoursLabel ?? 'Base hours'}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={proxyLabels.hoursPlaceholder ?? 'e.g. 160'}
          placeholderTextColor="#64748b"
          value={employmentHours}
          onChangeText={onChangeHours}
        />

        {showOvertime ? (
          <>
            <Text style={styles.fieldLabel}>{proxyLabels.employmentOvertimeLabel ?? 'Expected overtime (hours)'}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={proxyLabels.employmentOvertimePlaceholder ?? 'e.g. 20'}
              placeholderTextColor="#64748b"
              value={employmentOvertime}
              onChangeText={onChangeOvertime}
            />
          </>
        ) : null}
      </View>

      <View style={styles.fieldGroup}>
        <TextInput
          style={[styles.input, styles.multilineInput]}
          multiline
          placeholder={proxyLabels.notePlaceholder ?? 'Notes'}
          placeholderTextColor="#64748b"
          value={employmentNote}
          onChangeText={onChangeNote}
        />
      </View>

      <View style={styles.fieldGroup}>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{proxyLabels.socialToggleLabel ?? 'Enable social insurance settings'}</Text>
          <Switch
            value={socialSwitchValue}
            onValueChange={onToggleInsuranceEnabled}
            disabled={insuranceToggleDisabled}
          />
        </View>
        {!insuranceToggleDisabled && insuranceEnabled ? (
          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => onToggleInsuranceEnabled(false)}
          >
            <Text style={styles.linkButtonLabel}>{proxyLabels.socialSkipButton ?? '今は設定しない'}</Text>
          </TouchableOpacity>
        ) : null}
        {disableInsuranceMessage ? <Text style={styles.sectionNotice}>{disableInsuranceMessage}</Text> : null}
        <View
          style={[styles.fieldGroup, insuranceFieldsDisabled && styles.disabledSection]}
          pointerEvents={insuranceFieldsDisabled ? 'none' : 'auto'}
        >
          <Text style={styles.groupTitle}>{proxyLabels.socialHeading ?? 'Social insurance'}</Text>

          <Text style={styles.fieldLabel}>{proxyLabels.healthInsuranceLabel ?? 'Health insurance'}</Text>
          <View style={styles.segmentedControl}>
            {([
              { value: 'association', label: proxyLabels.healthInsuranceAssociation ?? '協会けんぽ' },
              { value: 'union', label: proxyLabels.healthInsuranceUnion ?? '組合' },
            ] as const).map((option) => {
              const active = healthInsuranceType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.segmentButton, active && styles.segmentButtonActive]}
                  onPress={() => onChangeHealthInsuranceType(option.value)}
                >
                  <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.fieldLabel}>{proxyLabels.healthInsurancePrefectureLabel ?? 'Prefecture'}</Text>
          <TextInput
            style={styles.input}
            placeholder={proxyLabels.healthInsurancePrefecturePlaceholder ?? 'e.g. 東京都'}
            placeholderTextColor="#64748b"
            value={healthInsurancePrefecture}
            onChangeText={onChangeHealthInsurancePrefecture}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {proxyLabels.healthInsuranceCareLabel ?? 'Nursing care applicable (40-64)'}
            </Text>
            <Switch value={healthInsuranceCareApplicable} onValueChange={onToggleHealthInsuranceCare} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>{proxyLabels.pensionLabel ?? 'Pension enrollment'}</Text>
            <Switch value={pensionEnrolled} onValueChange={onTogglePension} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {proxyLabels.employmentInsuranceLabel ?? 'Employment insurance enrollment'}
            </Text>
            <Switch value={employmentInsuranceEnrolled} onValueChange={onToggleEmploymentInsurance} />
          </View>

          <Text style={styles.fieldLabel}>{proxyLabels.employmentInsuranceCategoryLabel ?? 'Business category'}</Text>
          <TextInput
            style={styles.input}
            editable={employmentInsuranceEnrolled}
            placeholder={proxyLabels.employmentInsuranceCategoryPlaceholder ?? 'e.g. 飲食業'}
            placeholderTextColor="#64748b"
            value={employmentInsuranceCategory}
            onChangeText={onChangeEmploymentInsuranceCategory}
          />
        </View>
      </View>

      <View
        style={[styles.fieldGroup, disablePaidLeave && styles.disabledSection]}
        pointerEvents={disablePaidLeave ? 'none' : 'auto'}
      >
        <Text style={styles.groupTitle}>{proxyLabels.paidLeaveHeading ?? 'Paid leave'}</Text>
        {disablePaidLeaveMessage ? <Text style={styles.sectionNotice}>{disablePaidLeaveMessage}</Text> : null}

        <Text style={styles.fieldLabel}>{proxyLabels.paidLeaveGrantLabel ?? 'Grant method'}</Text>
        <View style={styles.segmentedControl}>
          {([
            { value: 'hireDate', label: proxyLabels.paidLeaveGrantHire ?? 'Hire date' },
            { value: 'fiscalStart', label: proxyLabels.paidLeaveGrantFiscal ?? 'Fiscal start' },
          ] as const).map((option) => {
            const active = paidLeaveGrantType === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[styles.segmentButton, active && styles.segmentButtonActive]}
                onPress={() => onChangePaidLeaveGrantType(option.value)}
              >
                <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {paidLeaveGrantType === 'fiscalStart' ? (
          <>
            <Text style={styles.fieldLabel}>{proxyLabels.paidLeaveFiscalMonthLabel ?? 'Fiscal start month'}</Text>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={proxyLabels.paidLeaveFiscalMonthPlaceholder ?? 'e.g. 4'}
              placeholderTextColor="#64748b"
              value={paidLeaveFiscalMonth}
              onChangeText={onChangePaidLeaveFiscalMonth}
            />
          </>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>{proxyLabels.paidLeaveHourlyAllowedLabel ?? 'Allow hourly leave'}</Text>
          <Switch value={paidLeaveHourlyAllowed} onValueChange={onTogglePaidLeaveHourlyAllowed} />
        </View>

        <Text style={styles.fieldLabel}>{proxyLabels.paidLeaveMinimumUnitLabel ?? 'Minimum unit (hours)'}</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={proxyLabels.paidLeaveMinimumUnitPlaceholder ?? 'e.g. 1'}
          placeholderTextColor="#64748b"
          value={paidLeaveMinimumUnit}
          onChangeText={onChangePaidLeaveMinimumUnit}
        />
      </View>

      {canEditStandardRemuneration ? (
        <View style={styles.fieldGroup}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>
              {proxyLabels.manualStandardToggle ?? 'Adjust standard remuneration manually'}
            </Text>
            <Switch value={showStandardRemuneration} onValueChange={onToggleStandardRemuneration} />
          </View>
          {showStandardRemuneration ? (
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder={proxyLabels.manualStandardPlaceholder ?? 'e.g. 300000'}
              placeholderTextColor="#64748b"
              value={standardRemunerationOverride}
              onChangeText={onChangeStandardRemuneration}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
};
