export type ApprovalType =
  | 'shiftCorrection'
  | 'receipt'
  | 'storeMembership'
  | 'employment_change'
  | 'allowance_add'
  | 'allowance_update'
  | 'allowance_end'
  | 'commute_update';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ApprovalTarget {
  col: string | null;
  id: string | null;
}

export interface ApprovalBatchContext {
  id?: string;
  index?: number;
  count?: number;
}

export interface ApprovalSummary {
  id: string;
  storeId: string | null;
  type: ApprovalType;
  status: ApprovalStatus;
  title: string;
  submittedBy: string | null;
  submittedByName?: string | null;
  submittedAt: Date | null;
  commentRequired: boolean;
  payload: Record<string, unknown>;
  target?: ApprovalTarget | null;
  batchContext?: ApprovalBatchContext | null;
}

export interface ApprovalFilters {
  storeIds?: string[];
  types?: ApprovalType[];
  statuses?: ApprovalStatus[];
}

export interface ApprovalActionOptions {
  actorUserId: string;
  actorDisplayName?: string | null;
  comment?: string | null;
}

export interface BulkApprovalActionOptions {
  approvalIds: string[];
  actorUserId: string;
  actorDisplayName?: string | null;
  comment?: string | null;
}

