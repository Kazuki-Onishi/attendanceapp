export type AllowanceCalcType =
  | 'fixed'
  | 'per_shift'
  | 'per_hour'
  | 'per_day'
  | 'per_month'
  | string;

export interface AllowanceMaster {
  id: string;
  storeId: string | null;
  name: string | null;
  searchName: string;
  calcType: AllowanceCalcType | null;
  defaultAmount: number | null;
  active: boolean | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  raw: Record<string, unknown>;
}

export interface AllowanceAssignment {
  id: string;
  storeId: string | null;
  roleDocId: string | null;
  userId: string | null;
  name: string | null;
  status: string | null;
  masterId: string | null;
  amount: number | null;
  taxExempt: boolean | null;
  note: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  updatedAt: Date | null;
  raw: Record<string, unknown>;
}

export interface AllowanceAssignmentMap {
  byId: Record<string, AllowanceAssignment>;
  byUser: Record<string, AllowanceAssignment[]>;
}

