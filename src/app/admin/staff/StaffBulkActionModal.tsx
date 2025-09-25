import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useAllowanceMasters } from '@/features/allowances/hooks/useAllowanceMasters';
import { useActiveAllowanceAssignments } from '@/features/allowances/hooks/useActiveAllowanceAssignments';
import type { AllowanceAssignment, AllowanceMaster } from '@/features/allowances/types';
import { EmploymentSection } from '@/app/admin/staff/components/EmploymentSection';
import { AllowanceSection } from '@/app/admin/staff/components/AllowanceSection';
import type {
  AllowanceAddState,
  AllowanceEndState,
  AllowanceFormState,
  AllowanceUpdateState,
  AllowanceOption,
  EmploymentPayType,
  EmploymentTypeOption,
  HealthInsuranceType,
  PaidLeaveGrantType,
  RoleOption,
  SelectedStaffTarget,
} from '@/app/admin/staff/types';

/** =========================
 *  Types & Constants
 *  ========================= */
type StaffBulkActionModalProps = {
  visible: boolean;
  storeId: string | null;
  targets: SelectedStaffTarget[];
  requesterUid: string;
  requesterName?: string | null;
  onClose: () => void;
  onSubmitted?: (result: { batchId: string; created: number }) => void;
};

/**
 * i18n の実データ�E�E�E�E�E�E�E�E�E�E�E�E�E�E�E�Etaff.settings.proxy.modal.typeOptions�E�E�E�E�E�E�E�E�E�E�E�E�E�E�E�に合わせて
 * ラベルキーを定義し直し、E
 *
 * JSON 側:
 * typeOptions: {
 *   employment: "雁E�E�E�E�E�E�E�E��E�E�E�E�E�E�E�形態を変更",
 *   allowanceAdd: "手当を追加",
 *   allowanceUpdate: "手当を更新",
 *   allowanceEnd: "手当を終亁E,
 *   commute: "通勤費を更新"
 * }
 */
const REQUEST_TYPES: Array<{
  value: ApprovalType;
  labelKey: 'employment' | 'allowanceAdd' | 'allowanceUpdate' | 'allowanceEnd' | 'commute';
}> = [
  { value: 'employment_change', labelKey: 'employment' },
  { value: 'allowance_add', labelKey: 'allowanceAdd' },
  { value: 'allowance_update', labelKey: 'allowanceUpdate' },
  { value: 'allowance_end', labelKey: 'allowanceEnd' },
  { value: 'commute_update', labelKey: 'commute' },
];

/** =========================
 *  Helpers
 *  ========================= */
const createInitialAllowanceFormState = (): AllowanceFormState => ({
  applyToAllSelected: true,
  add: {
    masterId: null,
    name: '',
    amount: '',
    taxExempt: false,
    note: '',
    effectiveTo: '',
  },
  update: {
    allowanceId: null,
    masterId: null,
    searchTerm: '',
    amount: '',
    taxExempt: false,
    note: '',
    effectiveTo: '',
  },
  end: {
    allowanceId: null,
    masterId: null,
    searchTerm: '',
    note: '',
    effectiveTo: '',
  },
});

const toNumber = (value: string): number | null => {
  if (!value || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const normaliseText = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const toInputString = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

const formatAmount = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  try {
    return new Intl.NumberFormat('ja-JP').format(value);
  } catch {
    return String(value);
  }
};

const formatEffectiveRange = (
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
): string => {
  const from = effectiveFrom?.trim();
  const to = effectiveTo?.trim();
  if (!from && !to) return '-';
  if (from && to) return `${from} ~ ${to}`;
  return from ?? to ?? '-';
};

/** =========================
 *  Component
 *  ========================= */
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
  const proxyLabels = useMemo(
    () => (staffLabels.proxy?.modal ?? staffLabels.settings?.proxy?.modal ?? {}) as Record<string, any>,
    [staffLabels],
  );

  const [requestType, setRequestType] = useState<ApprovalType>('employment_change');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [commentRequired, setCommentRequired] = useState(false);
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [employmentType, setEmploymentType] = useState<EmploymentTypeOption>('employee');
  const [employmentRate, setEmploymentRate] = useState('');
  const [employmentHours, setEmploymentHours] = useState('');
  const [employmentNote, setEmploymentNote] = useState('');
  const [employmentRole, setEmploymentRole] = useState<string>(() => targets[0]?.role ?? 'staff');
  const [employmentOvertime, setEmploymentOvertime] = useState('');
  const [employmentJoinDate, setEmploymentJoinDate] = useState('');
  const [employmentWeeklyDays, setEmploymentWeeklyDays] = useState('');
  const [employmentDailyHours, setEmploymentDailyHours] = useState('');
  const [employmentPayType, setEmploymentPayType] = useState<EmploymentPayType>('monthly');
  const [healthInsuranceType, setHealthInsuranceType] = useState<HealthInsuranceType>('association');
  const [healthInsurancePrefecture, setHealthInsurancePrefecture] = useState('');
  const [healthInsuranceCareApplicable, setHealthInsuranceCareApplicable] = useState(false);
  const [pensionEnrolled, setPensionEnrolled] = useState(true);
  const [employmentInsuranceEnrolled, setEmploymentInsuranceEnrolled] = useState(true);
  const [employmentInsuranceCategory, setEmploymentInsuranceCategory] = useState('');
  const [paidLeaveGrantType, setPaidLeaveGrantType] = useState<PaidLeaveGrantType>('hireDate');
  const [paidLeaveFiscalMonth, setPaidLeaveFiscalMonth] = useState('');
  const [paidLeaveHourlyAllowed, setPaidLeaveHourlyAllowed] = useState(false);
  const [paidLeaveMinimumUnit, setPaidLeaveMinimumUnit] = useState('');
  const [showStandardRemuneration, setShowStandardRemuneration] = useState(false);
  const [standardRemunerationOverride, setStandardRemunerationOverride] = useState('');
  const [socialInsuranceEnabled, setSocialInsuranceEnabled] = useState(true);  const [allowanceForm, setAllowanceForm] = useState<AllowanceFormState>(createInitialAllowanceFormState);

  const [commuteMode, setCommuteMode] = useState<'perDay' | 'fixedMonthly'>('perDay');
  const [commuteAmount, setCommuteAmount] = useState('');
  const [commuteTaxExempt, setCommuteTaxExempt] = useState(true);

  const targetsCount = targets.length;
  const targetUserIds = useMemo(() => targets.map((t) => t.userId), [targets]);
  const targetNameByUserId = useMemo(() => {
    return targets.reduce<Record<string, string>>((acc, t) => {
      acc[t.userId] = t.name ?? '';
      return acc;
    }, {});
  }, [targets]);

  const showEmploymentOvertime = employmentType === 'employee';
  const contractorInsuranceDisabled = employmentType === 'contractor';
  const insuranceToggleDisabled = contractorInsuranceDisabled;
  const disableInsurance = contractorInsuranceDisabled || !socialInsuranceEnabled;
  const disablePaidLeave = employmentType === 'contractor';
  const canEditStandardRemuneration = Boolean(proxyLabels.canEditStandardRemuneration);
  const disableInsuranceMessage = contractorInsuranceDisabled
    ? proxyLabels.socialDisabledMessageContractor ?? 'Social insurance settings are disabled for contractors.'
    : !socialInsuranceEnabled
      ? proxyLabels.socialDisabledMessageManual ?? 'Social insurance can be configured later.'
      : null;
  const disablePaidLeaveMessage = disablePaidLeave
    ? proxyLabels.paidLeaveDisabledMessageContractor ?? 'Paid leave settings are disabled for contractors.'
    : null;

  const selectedNames = useMemo(() => {
    return targets
      .map((t) => (t.name ?? '').trim())
      .filter((name) => name.length > 0)
      .join(', ');
  }, [targets]);

  const selectedNamesLabel = useMemo(() => {
    if (!selectedNames) return null;
    const template = proxyLabels.selectedNamesLabel ?? 'Selected: {names}';
    return template.includes('{names}') ? template.replace('{names}', selectedNames) : `${template} ${selectedNames}`;
  }, [proxyLabels, selectedNames]);

  const { masters, loading: mastersLoading } = useAllowanceMasters(storeId ?? null);
  const {
    assignments = [],
    map: assignmentMapRaw,
    loading: assignmentsLoading,
    error: assignmentsError,
  } = useActiveAllowanceAssignments(storeId ?? null, targetUserIds);

  const assignmentMap = useMemo(
    () =>
      assignmentMapRaw ?? {
        byId: {} as Record<string, AllowanceAssignment>,
      },
    [assignmentMapRaw],
  );

  const masterById = useMemo(() => {
    return (masters ?? []).reduce<Record<string, AllowanceMaster>>((acc, m) => {
      acc[m.id] = m;
      return acc;
    }, {});
  }, [masters]);

  const masterByName = useMemo(() => {
    return (masters ?? []).reduce<Record<string, AllowanceMaster>>((acc, m) => {
      const key = normaliseText(m.name);
      if (key) acc[key] = m;
      return acc;
    }, {});
  }, [masters]);

  const resolveMasterForAllowance = useCallback(
    (assignment: AllowanceAssignment | null | undefined): AllowanceMaster | null => {
      if (!assignment) return null;
      if (assignment.masterId && masterById[assignment.masterId]) return masterById[assignment.masterId];
      const nameKey = normaliseText(assignment.name);
      if (nameKey && masterByName[nameKey]) return masterByName[nameKey];
      return null;
    },
    [masterById, masterByName],
  );

  const allowanceOptions = useMemo<AllowanceOption[]>(() => {
    return (assignments ?? []).map((assignment) => {
      const master = resolveMasterForAllowance(assignment);
      const allowanceTitle = assignment.name ?? proxyLabels.allowanceUnnamed ?? 'Untitled allowance';
      const displayUser = targetNameByUserId[assignment.userId ?? ''] ?? assignment.userId ?? '';

      const titleParts: string[] = [];
      if (displayUser) titleParts.push(displayUser);
      titleParts.push(allowanceTitle);
      const title = titleParts.join(' �E�E�E�E�E�E�E�E ');

      const subtitleParts: string[] = [];
      if (master?.name && master.name !== allowanceTitle) subtitleParts.push(master.name);
      if (typeof assignment.amount === 'number' && Number.isFinite(assignment.amount))
        subtitleParts.push(formatAmount(assignment.amount));
      const subtitle = subtitleParts.join(' �E�E�E�E�E�E�E�E ');

      const searchSource = [
        title,
        subtitle,
        assignment.userId ?? '',
        assignment.roleDocId ?? '',
        master?.searchName ?? '',
        master?.calcType ?? '',
      ]
        .filter(Boolean)
        .join(', ');

      return {
        id: assignment.id,
        title,
        subtitle,
        searchKey: normaliseText(searchSource),
        allowance: assignment,
        master,
      };
    });
  }, [assignments, proxyLabels.allowanceUnnamed, resolveMasterForAllowance, targetNameByUserId]);

  const filteredUpdateOptions = useMemo(() => {
    const term = normaliseText(allowanceForm.update.searchTerm);
    if (!term) return allowanceOptions;
    return allowanceOptions.filter((o) => o.searchKey.includes(term));
  }, [allowanceForm.update.searchTerm, allowanceOptions]);

  const filteredEndOptions = useMemo(() => {
    const term = normaliseText(allowanceForm.end.searchTerm);
    if (!term) return allowanceOptions;
    return allowanceOptions.filter((o) => o.searchKey.includes(term));
  }, [allowanceForm.end.searchTerm, allowanceOptions]);

  const selectedUpdateAllowance = useMemo(() => {
    if (!allowanceForm.update.allowanceId) return null;
    return assignmentMap.byId[allowanceForm.update.allowanceId] ?? null;
  }, [allowanceForm.update.allowanceId, assignmentMap.byId]);

  const selectedEndAllowance = useMemo(() => {
    if (!allowanceForm.end.allowanceId) return null;
    return assignmentMap.byId[allowanceForm.end.allowanceId] ?? null;
  }, [allowanceForm.end.allowanceId, assignmentMap.byId]);

  const selectedUpdateMaster = useMemo(
    () => resolveMasterForAllowance(selectedUpdateAllowance),
    [resolveMasterForAllowance, selectedUpdateAllowance],
  );
  const selectedEndMaster = useMemo(
    () => resolveMasterForAllowance(selectedEndAllowance),
    [resolveMasterForAllowance, selectedEndAllowance],
  );

  // ここを修復�E�E�E�E�E�E�E�E�E�E�E�E�E�E�E�proxyLabels.typeOptions の実キーでラベルを取征E
  const typeOptions = useMemo(
    () =>
      REQUEST_TYPES.map((option) => {
        const lbl =
          proxyLabels.typeOptions?.[option.labelKey] ??
          // 念のため settings 下にある場合にも対忁E
          labels?.staff?.settings?.proxy?.modal?.typeOptions?.[option.labelKey] ??
          // フォールバック
          option.value;
        return { value: option.value, label: lbl as string };
      }),
    [proxyLabels],
  );

  const roleOptions = useMemo<RoleOption[]>(() => {
    const lbls = (proxyLabels.employmentRoleOptions ?? {}) as Record<string, string>;
    const baseOptions: string[] = ['staff', 'employee', 'senior', 'manager', 'admin', 'owner'];
    const targetRoles = Array.from(new Set(targets.map((t) => t.role).filter(Boolean))) as string[];
    const combined = Array.from(new Set([...baseOptions, ...targetRoles]));
    const opts = combined.map((value) => ({
      value,
      label: lbls[value] ?? value.charAt(0).toUpperCase() + value.slice(1),
    }));
    if (employmentRole && !opts.some((o) => o.value === employmentRole)) {
      opts.push({ value: employmentRole, label: lbls[employmentRole] ?? employmentRole });
    }
    return opts;
  }, [employmentRole, proxyLabels, targets]);

  useEffect(() => {
    if (!visible) return;
    setEmploymentRole(targets[0]?.role ?? 'staff');
  }, [targets, visible]);

  useEffect(() => {
    if (employmentType === 'contractor') {
      setSocialInsuranceEnabled(false);
      setEmploymentPayType('commission');
    }
  }, [employmentType]);

  useEffect(() => {
    setEmploymentPayType((prev) => {
      if (employmentType === 'contractor') return 'commission';
      return prev === 'commission' ? 'monthly' : prev;
    });
  }, [employmentType]);

  // ---- Allowance form updaters
  const setAllowanceAdd = useCallback((patch: Partial<AllowanceAddState>) => {
    setAllowanceForm((prev) => ({ ...prev, add: { ...prev.add, ...patch } }));
  }, []);

  const setAllowanceUpdate = useCallback((patch: Partial<AllowanceUpdateState>) => {
    setAllowanceForm((prev) => ({ ...prev, update: { ...prev.update, ...patch } }));
  }, []);

  const setAllowanceEnd = useCallback((patch: Partial<AllowanceEndState>) => {
    setAllowanceForm((prev) => ({ ...prev, end: { ...prev.end, ...patch } }));
  }, []);

  const setApplyToAllSelected = useCallback((value: boolean) => {
    setAllowanceForm((prev) => ({ ...prev, applyToAllSelected: value }));
  }, []);

  const handleSelectAllowance = useCallback(
    (mode: 'update' | 'end', option: AllowanceOption) => {
      if (mode === 'update') {
        setAllowanceForm((prev) => ({
          ...prev,
          update: {
            ...prev.update,
            allowanceId: option.id,
            masterId: option.master?.id ?? option.allowance.masterId ?? null,
            amount: toInputString(option.allowance.amount),
            taxExempt: option.allowance.taxExempt ?? false,
            note: option.allowance.note ?? '',
            effectiveTo: option.allowance.effectiveTo ?? '',
            searchTerm: prev.update.searchTerm,
          },
        }));
      } else {
        setAllowanceForm((prev) => ({
          ...prev,
          end: {
            ...prev.end,
            allowanceId: option.id,
            masterId: option.master?.id ?? option.allowance.masterId ?? null,
            note: option.allowance.note ?? '',
            effectiveTo: option.allowance.effectiveTo ?? '',
            searchTerm: prev.end.searchTerm,
          },
        }));
      }
    },
    [setAllowanceForm],
  );

  const resetForm = useCallback(() => {
    setRequestType('employment_change');
    setEffectiveFrom('');
    setCommentRequired(false);
    setTitle('');
    setEmploymentType('employee');
    setEmploymentRate('');
    setEmploymentHours('');
    setEmploymentNote('');
    setEmploymentRole(targets[0]?.role ?? 'staff');
    setEmploymentOvertime('');
    setEmploymentJoinDate('');
    setEmploymentWeeklyDays('');
    setEmploymentDailyHours('');
    setEmploymentPayType('monthly');
    setHealthInsuranceType('association');
    setHealthInsurancePrefecture('');
    setHealthInsuranceCareApplicable(false);
    setPensionEnrolled(true);
    setEmploymentInsuranceEnrolled(true);
    setEmploymentInsuranceCategory('');
    setPaidLeaveGrantType('hireDate');
    setPaidLeaveFiscalMonth('');
    setPaidLeaveHourlyAllowed(false);
    setPaidLeaveMinimumUnit('');
    setShowStandardRemuneration(false);
    setSocialInsuranceEnabled(true);
    setStandardRemunerationOverride('');
    setAllowanceForm(createInitialAllowanceFormState());
    setCommuteMode('perDay');
    setCommuteAmount('');
    setCommuteTaxExempt(true);
  }, [targets]);

  const validate = useCallback((): string | null => {
    if (!effectiveFrom.trim()) {
      return proxyLabels.effectiveFromMissing ?? 'Enter an effective start date.';
    }

    switch (requestType) {
      case 'employment_change': {
        if (!employmentJoinDate.trim())
          return proxyLabels.validation?.employmentJoinDate ?? 'Enter a hire date.';

        const weeklyDaysValue = toNumber(employmentWeeklyDays);
        if ((weeklyDaysValue ?? 0) < 1 || (weeklyDaysValue ?? 0) > 5)
          return proxyLabels.validation?.employmentWeeklyDays ?? 'Enter weekly working days.';

        const dailyHoursValue = toNumber(employmentDailyHours);
        if ((dailyHoursValue ?? 0) <= 0 || (dailyHoursValue ?? 0) > 12)
          return proxyLabels.validation?.employmentDailyHours ?? 'Enter hours per day.';

        const requiresBaseRate = employmentPayType === 'hourly' || employmentPayType === 'monthly';
        if (requiresBaseRate && !employmentRate.trim())
          return proxyLabels.validation?.employmentRate ?? 'Enter a base rate.';

        if (!employmentHours.trim())
          return proxyLabels.validation?.employmentHours ?? 'Enter base hours.';

        if (!employmentRole)
          return proxyLabels.validation?.employmentRole ?? 'Select a role.';

        if (showEmploymentOvertime || employmentOvertime.trim()) {
          const overtimeValue = toNumber(employmentOvertime);
          if (overtimeValue === null || overtimeValue < 0)
            return proxyLabels.validation?.employmentOvertime ?? 'Enter a valid overtime value.';
        }

        if (!disableInsurance) {
          if (healthInsuranceType === 'association' && !healthInsurancePrefecture.trim())
            return proxyLabels.validation?.healthInsurancePrefecture ?? 'Enter a prefecture for health insurance.';

          if (employmentInsuranceEnrolled && !employmentInsuranceCategory.trim())
            return proxyLabels.validation?.employmentInsuranceCategory ?? 'Enter an employment insurance category.';
        }

        if (!disablePaidLeave) {
          if (paidLeaveGrantType === 'fiscalStart') {
            const fiscalMonthValue = toNumber(paidLeaveFiscalMonth);
            if (fiscalMonthValue === null || fiscalMonthValue < 1 || fiscalMonthValue > 12)
              return proxyLabels.validation?.paidLeaveFiscalMonth ?? 'Enter a valid fiscal month (1-12).';
          }

          const minimumUnitValue = toNumber(paidLeaveMinimumUnit);
          if ((minimumUnitValue ?? 0) <= 0)
            return proxyLabels.validation?.paidLeaveMinimumUnit ?? 'Enter a valid minimum leave unit.';
        }

        if (canEditStandardRemuneration && showStandardRemuneration) {
          const overrideValue = toNumber(standardRemunerationOverride);
          if ((overrideValue ?? 0) <= 0)
            return proxyLabels.validation?.standardRemuneration ?? 'Enter a valid standard remuneration override.';
        }

        break;
      }
      case 'allowance_add':
        if (!allowanceForm.add.name.trim())
          return proxyLabels.validation?.allowanceName ?? 'Enter an allowance name.';
        if ((toNumber(allowanceForm.add.amount) ?? 0) <= 0)
          return proxyLabels.validation?.allowanceAmount ?? 'Enter a valid allowance amount.';
        break;
      case 'allowance_update':
        if (!allowanceForm.update.allowanceId || !selectedUpdateAllowance)
          return proxyLabels.validation?.allowanceSelection ?? 'Select an existing allowance before continuing.';
        if ((toNumber(allowanceForm.update.amount) ?? 0) <= 0)
          return proxyLabels.validation?.allowanceAmount ?? 'Enter a valid allowance amount.';
        if (!selectedUpdateAllowance.name?.trim())
          return proxyLabels.validation?.allowanceName ?? 'The selected allowance is missing a name.';
        break;
      case 'allowance_end':
        if (!allowanceForm.end.allowanceId || !selectedEndAllowance)
          return proxyLabels.validation?.allowanceSelection ?? 'Select an existing allowance before continuing.';
        if (!selectedEndAllowance.name?.trim())
          return proxyLabels.validation?.allowanceName ?? 'The selected allowance is missing a name.';
        break;
      case 'commute_update':
        if ((toNumber(commuteAmount) ?? 0) <= 0)
          return proxyLabels.validation?.commuteAmount ?? 'Enter a valid commute amount.';
        break;
      default:
        break;
    }

    if (!targetsCount) {
      return proxyLabels.noSelection ?? 'Select at least one staff member.';
    }

    return null;
  }, [
    allowanceForm,
    canEditStandardRemuneration,
    commuteAmount,
    disableInsurance,
    disablePaidLeave,
    effectiveFrom,
    employmentDailyHours,
    employmentHours,
    employmentInsuranceCategory,
    employmentInsuranceEnrolled,
    employmentJoinDate,
    employmentOvertime,
    employmentPayType,
    employmentRate,
    employmentRole,
    employmentType,
    employmentWeeklyDays,
    healthInsurancePrefecture,
    healthInsuranceType,
    paidLeaveFiscalMonth,
    paidLeaveGrantType,
    paidLeaveMinimumUnit,
    proxyLabels,
    requestType,
    selectedEndAllowance,
    selectedUpdateAllowance,
    showEmploymentOvertime,
    showStandardRemuneration,
    standardRemunerationOverride,
    targetsCount,
  ]);  const buildPayload = useCallback(() => {
    const base = {
      title: title.trim() || null,
      commentRequired,
      effectiveFrom: effectiveFrom.trim() || null,
      applyToAllSelected: allowanceForm.applyToAllSelected,
    };

    switch (requestType) {
      case 'employment_change': {
        const weeklyDaysValue = toNumber(employmentWeeklyDays);
        const dailyHoursValue = toNumber(employmentDailyHours);
        const baseHoursValue = toNumber(employmentHours);
        const baseHourlyWage = employmentPayType === 'hourly' ? toNumber(employmentRate) : null;
        const baseMonthlyWage = employmentPayType === 'monthly' ? toNumber(employmentRate) : null;
        const expectedOvertime = showEmploymentOvertime ? toNumber(employmentOvertime) : null;
        const healthScheme = healthInsuranceType === 'association' ? 'kyokai' : 'kumiai';

        const insurance = disableInsurance
          ? null
          : {
              health: {
                scheme: healthScheme,
                prefectureCode: healthInsurancePrefecture.trim() || null,
                careRequired: healthInsuranceCareApplicable,
              },
              pension: {
                enrolled: pensionEnrolled,
              },
              employment: {
                enrolled: employmentInsuranceEnrolled,
                category: employmentInsuranceCategory.trim() || undefined,
              },
              qualificationAcquisitionDate: null,
              qualificationLossDate: null,
              standardMonthlyRemunerationOverride:
                canEditStandardRemuneration && showStandardRemuneration
                  ? toNumber(standardRemunerationOverride)
                  : null,
              standardBonusRemunerationOverride: null,
            };

        const grantPolicy = paidLeaveGrantType === 'fiscalStart' ? 'fiscal' : 'anniversary';
        const fiscalMonthValue = grantPolicy === 'fiscal' ? toNumber(paidLeaveFiscalMonth) : null;
        const leave = disablePaidLeave
          ? null
          : {
              grantPolicy,
              fiscalYearStartMonth: grantPolicy === 'fiscal' ? fiscalMonthValue ?? null : null,
              carryoverMonths: 24,
              allowTimeUnits: paidLeaveHourlyAllowed,
              minLeaveUnitHours: toNumber(paidLeaveMinimumUnit),
              allowHalfDay: true,
            };

        return {
          ...base,
          employment: {
            employmentType,
            salaryScheme: employmentPayType,
            role: employmentRole || null,
            hireDate: employmentJoinDate.trim() || null,
            workingDaysPerWeek: weeklyDaysValue,
            scheduledDailyHours: dailyHoursValue,
            baseHours: baseHoursValue,
            baseHourlyWage,
            baseMonthlyWage,
            expectedOvertimeHours: expectedOvertime,
            note: employmentNote.trim() || null,
            insurance,
            leave,
          },
        };
      }
      case 'allowance_add':
        return {
          ...base,
          allowance: {
            name: allowanceForm.add.name.trim() || null,
            amount: toNumber(allowanceForm.add.amount),
            taxExempt: allowanceForm.add.taxExempt,
            note: allowanceForm.add.note.trim() || null,
            effectiveTo: allowanceForm.add.effectiveTo.trim() || null,
            masterId: allowanceForm.add.masterId,
            applyToAllSelected: allowanceForm.applyToAllSelected,
          },
        };
      case 'allowance_update':
        return {
          ...base,
          allowance: {
            name: selectedUpdateAllowance?.name ?? null,
            amount: toNumber(allowanceForm.update.amount),
            taxExempt: allowanceForm.update.taxExempt,
            note: allowanceForm.update.note.trim() || null,
            effectiveTo: allowanceForm.update.effectiveTo.trim() || null,
            masterId: allowanceForm.update.masterId ?? selectedUpdateAllowance?.masterId ?? null,
            allowanceId: selectedUpdateAllowance?.id ?? null,
            applyToAllSelected: allowanceForm.applyToAllSelected,
          },
          allowanceSelection: {
            allowanceId: selectedUpdateAllowance?.id ?? null,
            roleDocId: selectedUpdateAllowance?.roleDocId ?? null,
            userId: selectedUpdateAllowance?.userId ?? null,
          },
        };
      case 'allowance_end':
        return {
          ...base,
          allowance: {
            name: selectedEndAllowance?.name ?? null,
            note: allowanceForm.end.note.trim() || null,
            effectiveTo: allowanceForm.end.effectiveTo.trim() || null,
            masterId: allowanceForm.end.masterId ?? selectedEndAllowance?.masterId ?? null,
            allowanceId: selectedEndAllowance?.id ?? null,
            applyToAllSelected: allowanceForm.applyToAllSelected,
          },
          allowanceSelection: {
            allowanceId: selectedEndAllowance?.id ?? null,
            roleDocId: selectedEndAllowance?.roleDocId ?? null,
            userId: selectedEndAllowance?.userId ?? null,
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
  }, [
    allowanceForm,
    commentRequired,
    canEditStandardRemuneration,
    commuteAmount,
    commuteMode,
    commuteTaxExempt,
    disableInsurance,
    disablePaidLeave,
    effectiveFrom,
    employmentDailyHours,
    employmentHours,
    employmentJoinDate,
    employmentNote,
    employmentOvertime,
    employmentPayType,
    employmentRate,
    employmentRole,
    employmentType,
    employmentWeeklyDays,
    healthInsuranceCareApplicable,
    healthInsurancePrefecture,
    healthInsuranceType,
    paidLeaveFiscalMonth,
    paidLeaveGrantType,
    paidLeaveHourlyAllowed,
    paidLeaveMinimumUnit,
    requestType,
    selectedEndAllowance,
    selectedUpdateAllowance,
    showEmploymentOvertime,
    showStandardRemuneration,
    standardRemunerationOverride,
    title,
  ]);  const handleSubmit = useCallback(async () => {
    if (!storeId) {
      Alert.alert(proxyLabels.storeMissingTitle ?? 'Store required', proxyLabels.storeMissing ?? 'Select a store first.');
      return;
    }

    const validationError = validate();
    if (validationError) {
      Alert.alert(proxyLabels.validationErrorTitle ?? 'Cannot submit', validationError);
      return;
    }

    const payload = buildPayload();
    const targetRoleDocIds = targets.map((t) => t.roleDocId);

    try {
      setSubmitting(true);
      const result = await createBatchApprovals({
        storeId,
        targetRoleDocIds,
        type: requestType,
        payload,
        requester: { uid: requesterUid, name: requesterName ?? null },
        title: (payload as any).title ?? undefined,
        commentRequired: (payload as any).commentRequired ?? false,
      });

      if (result.created > 0) {
        Alert.alert(
          proxyLabels.successTitle ?? 'Requests created',
          (proxyLabels.successMessage ?? '{count} requests were created.').replace(
            '{count}',
            String(result.created),
          ),
        );
        onSubmitted?.(result);
        resetForm();
        onClose();
      } else {
        Alert.alert(proxyLabels.errorTitle ?? 'Submission failed', proxyLabels.errorMessage ?? 'Could not create requests.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Submitting requests failed.';
      Alert.alert(proxyLabels.errorTitle ?? 'Submission failed', message);
    } finally {
      setSubmitting(false);
    }
  }, [
    buildPayload,
    onClose,
    onSubmitted,
    proxyLabels,
    requestType,
    requesterName,
    requesterUid,
    resetForm,
    storeId,
    targets,
    validate,
  ]);

  const renderCommuteForm = () => (
    <View style={styles.fieldGroup}>
      <Text style={styles.groupTitle}>{proxyLabels.commuteHeading ?? 'Commute settings'}</Text>
      <View style={styles.segmentedControl}>
        {[
          { value: 'perDay', label: proxyLabels.commutePerDay ?? 'Per day' },
          { value: 'fixedMonthly', label: proxyLabels.commuteFixed ?? 'Fixed monthly' },
        ].map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.segmentButton, commuteMode === option.value && styles.segmentButtonActive]}
            onPress={() => setCommuteMode(option.value as 'perDay' | 'fixedMonthly')}
          >
            <Text style={[styles.segmentLabel, commuteMode === option.value && styles.segmentLabelActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.fieldLabel}>{proxyLabels.amountLabel ?? 'Amount'}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder={proxyLabels.amountPlaceholder ?? 'e.g. 10000'}
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

  const renderFormBody = () => {
    switch (requestType) {
      case 'employment_change':
        return (
          <EmploymentSection
            styles={styles}
            proxyLabels={proxyLabels}
            showOvertime={showEmploymentOvertime}
            disableInsurance={disableInsurance}
            disablePaidLeave={disablePaidLeave}
            disableInsuranceMessage={disableInsuranceMessage}
            disablePaidLeaveMessage={disablePaidLeaveMessage}
            insuranceEnabled={socialInsuranceEnabled}
            insuranceToggleDisabled={insuranceToggleDisabled}
            onToggleInsuranceEnabled={setSocialInsuranceEnabled}
            canEditStandardRemuneration={canEditStandardRemuneration}
            showStandardRemuneration={showStandardRemuneration}
            employmentType={employmentType}
            employmentRole={employmentRole}
            employmentJoinDate={employmentJoinDate}
            employmentWeeklyDays={employmentWeeklyDays}
            employmentDailyHours={employmentDailyHours}
            employmentPayType={employmentPayType}
            employmentRate={employmentRate}
            employmentHours={employmentHours}
            employmentOvertime={employmentOvertime}
            employmentNote={employmentNote}
            healthInsuranceType={healthInsuranceType}
            healthInsurancePrefecture={healthInsurancePrefecture}
            healthInsuranceCareApplicable={healthInsuranceCareApplicable}
            pensionEnrolled={pensionEnrolled}
            employmentInsuranceEnrolled={employmentInsuranceEnrolled}
            employmentInsuranceCategory={employmentInsuranceCategory}
            paidLeaveGrantType={paidLeaveGrantType}
            paidLeaveFiscalMonth={paidLeaveFiscalMonth}
            paidLeaveHourlyAllowed={paidLeaveHourlyAllowed}
            paidLeaveMinimumUnit={paidLeaveMinimumUnit}
            standardRemunerationOverride={standardRemunerationOverride}
            roleOptions={roleOptions}
            onChangeType={setEmploymentType}
            onChangeRole={setEmploymentRole}
            onChangeJoinDate={setEmploymentJoinDate}
            onChangeWeeklyDays={setEmploymentWeeklyDays}
            onChangeDailyHours={setEmploymentDailyHours}
            onChangePayType={setEmploymentPayType}
            onChangeRate={setEmploymentRate}
            onChangeHours={setEmploymentHours}
            onChangeOvertime={setEmploymentOvertime}
            onChangeNote={setEmploymentNote}
            onChangeHealthInsuranceType={setHealthInsuranceType}
            onChangeHealthInsurancePrefecture={setHealthInsurancePrefecture}
            onToggleHealthInsuranceCare={setHealthInsuranceCareApplicable}
            onTogglePension={setPensionEnrolled}
            onToggleEmploymentInsurance={setEmploymentInsuranceEnrolled}
            onChangeEmploymentInsuranceCategory={setEmploymentInsuranceCategory}
            onChangePaidLeaveGrantType={setPaidLeaveGrantType}
            onChangePaidLeaveFiscalMonth={setPaidLeaveFiscalMonth}
            onTogglePaidLeaveHourlyAllowed={setPaidLeaveHourlyAllowed}
            onChangePaidLeaveMinimumUnit={setPaidLeaveMinimumUnit}
            onToggleStandardRemuneration={setShowStandardRemuneration}
            onChangeStandardRemuneration={setStandardRemunerationOverride}
          />
        );
      case 'allowance_add':
      case 'allowance_update':
      case 'allowance_end':
        return (
          <AllowanceSection
            styles={styles}
            proxyLabels={proxyLabels}
            requestType={requestType as 'allowance_add' | 'allowance_update' | 'allowance_end'}
            allowanceForm={allowanceForm}
            assignmentsLoading={assignmentsLoading}
            assignmentsError={assignmentsError}
            filteredUpdateOptions={filteredUpdateOptions}
            filteredEndOptions={filteredEndOptions}
            selectedUpdateAllowance={selectedUpdateAllowance}
            selectedEndAllowance={selectedEndAllowance}
            selectedUpdateMaster={selectedUpdateMaster}
            selectedEndMaster={selectedEndMaster}
            onToggleApplyAll={setApplyToAllSelected}
            onSelectAllowance={handleSelectAllowance}
            onChangeAdd={setAllowanceAdd}
            onChangeUpdate={setAllowanceUpdate}
            onChangeEnd={setAllowanceEnd}
            formatAmount={formatAmount}
            formatEffectiveRange={formatEffectiveRange}
          />
        );
      case 'commute_update':
        return renderCommuteForm();
      default:
        return null;
    }
  };

  const submitDisabled =
    submitting ||
    !targetsCount ||
    (requestType === 'allowance_update' && !allowanceForm.update.allowanceId) ||
    (requestType === 'allowance_end' && !allowanceForm.end.allowanceId);

  return (
    <Modal visible={visible} transparent animationType="fade" supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{proxyLabels.title ?? 'Proxy submission'}</Text>
            <Text style={styles.subtitle}>
              {proxyLabels.selectedLabel?.replace('{count}', String(targetsCount)) ?? `${targetsCount} selected`}
            </Text>
            {selectedNamesLabel ? (
              <Text style={[styles.subtitle, styles.selectedNames]}>{selectedNamesLabel}</Text>
            ) : null}
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{proxyLabels.typeLabel ?? 'Request type'}</Text>
              <View style={styles.segmentedControl}>
                {typeOptions.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentButton, requestType === option.value && styles.segmentButtonActive]}
                    onPress={() => setRequestType(option.value)}
                  >
                    <Text style={[styles.segmentLabel, requestType === option.value && styles.segmentLabelActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{proxyLabels.effectiveFromLabel ?? 'Effective from'}</Text>
              <TextInput
                style={styles.input}
                placeholder={proxyLabels.effectiveFromPlaceholder ?? 'YYYY-MM-DD'}
                placeholderTextColor="#64748b"
                value={effectiveFrom}
                onChangeText={setEffectiveFrom}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>{proxyLabels.titleLabel ?? 'Title (optional)'}</Text>
              <TextInput
                style={styles.input}
                placeholder={proxyLabels.titlePlaceholder ?? 'Optional title'}
                placeholderTextColor="#64748b"
                value={title}
                onChangeText={setTitle}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{proxyLabels.commentRequiredLabel ?? 'Comment required'}</Text>
                <Switch value={commentRequired} onValueChange={setCommentRequired} />
              </View>
            </View>

            {renderFormBody()}

            {mastersLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#94a3b8" />
                <Text style={styles.loadingLabel}>
                  {proxyLabels.loadingMasters ?? 'Loading allowance templates...'}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.footerButton, styles.cancelButton]} onPress={onClose} disabled={submitting}>
              <Text style={styles.footerButtonLabel}>{proxyLabels.cancel ?? 'Cancel'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerButton, styles.submitButton, submitDisabled && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitDisabled}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : (
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
  selectedNames: {
    color: '#cbd5f5',
    flexWrap: 'wrap',
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
  sectionStack: {
    gap: 24,
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
  segmentButtonDisabled: {
    opacity: 0.5,
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
  linkButton: {
    alignSelf: 'flex-end',
    paddingVertical: 6,
  },
  linkButtonLabel: {
    color: '#60a5fa',
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  sectionNotice: {
    color: '#f97316',
    fontSize: 12,
  },
  fieldLabel: {
    color: '#94a3b8',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingLabel: {
    color: '#94a3b8',
  },
  optionList: {
    gap: 8,
  },
  optionItem: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#111b2e',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#1f2a44',
    gap: 4,
  },
  optionItemSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#1b2a4d',
  },
  optionTitle: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  optionSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
  },
  optionMeta: {
    color: '#64748b',
    fontSize: 12,
  },
  disabledSection: {
    opacity: 0.35,
  },
  emptyState: {
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  readonlyValue: {
    color: '#f8fafc',
    paddingVertical: 6,
  },
  metaContainer: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#111b2e',
    gap: 6,
  },
  metaHeading: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  metaValue: {
    color: '#f8fafc',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  warningText: {
    color: '#f97316',
    fontSize: 12,
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
  submitButtonDisabled: {
    backgroundColor: '#1e3a8a',
    opacity: 0.6,
  },
});

export default StaffBulkActionModal;













