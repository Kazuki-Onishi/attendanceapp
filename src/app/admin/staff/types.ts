import type { AllowanceAssignment, AllowanceMaster } from '@/features/allowances/types';

export type EmploymentTypeOption = 'employee' | 'hourlyEmployee' | 'contractor';
export type EmploymentPayType = 'hourly' | 'monthly' | 'daily' | 'commission';
export type HealthInsuranceType = 'association' | 'union';
export type PaidLeaveGrantType = 'hireDate' | 'fiscalStart';

export type SelectedStaffTarget = {
  userId: string;
  roleDocId: string;
  name: string;
  role: string;
};

export type AllowanceAddState = {
  masterId: string | null;
  name: string;
  amount: string;
  taxExempt: boolean;
  note: string;
  effectiveTo: string;
};

export type AllowanceUpdateState = {
  allowanceId: string | null;
  masterId: string | null;
  searchTerm: string;
  amount: string;
  taxExempt: boolean;
  note: string;
  effectiveTo: string;
};

export type AllowanceEndState = {
  allowanceId: string | null;
  masterId: string | null;
  searchTerm: string;
  note: string;
  effectiveTo: string;
};

export type AllowanceFormState = {
  applyToAllSelected: boolean;
  add: AllowanceAddState;
  update: AllowanceUpdateState;
  end: AllowanceEndState;
};

export type AllowanceOption = {
  id: string;
  title: string;
  subtitle: string;
  searchKey: string;
  allowance: AllowanceAssignment;
  master: AllowanceMaster | null;
};

export type RoleOption = {
  value: string;
  label: string;
};

