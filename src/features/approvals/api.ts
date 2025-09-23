import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  runTransaction,
  type QueryConstraint,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import type {
  ApprovalActionOptions,
  ApprovalFilters,
  ApprovalStatus,
  ApprovalSummary,
  ApprovalType,
  BulkApprovalActionOptions,
} from './types';

const approvalsCollection = () => collection(firestore(), 'approvals');
const approvalLogsCollection = () => collection(firestore(), 'approvalLogs');

const parseRoleDocId = (roleDocId: string): { userId: string | null; storeId: string | null } => {
  if (!roleDocId) {
    return { userId: null, storeId: null };
  }
  const lastUnderscore = roleDocId.lastIndexOf('_');
  if (lastUnderscore <= 0 || lastUnderscore === roleDocId.length - 1) {
    return { userId: roleDocId, storeId: null };
  }
  return { userId: roleDocId.slice(0, lastUnderscore), storeId: roleDocId.slice(lastUnderscore + 1) };
};

const resolveTargetRole = (
  approval: ApprovalSummary,
): { roleDocId: string; userId: string | null; storeId: string | null } => {
  const payloadRoleId =
    typeof approval.payload?.targetRoleDocId === 'string'
      ? (approval.payload.targetRoleDocId as string)
      : null;
  const targetRoleId = typeof approval.target?.id === 'string' ? approval.target.id : payloadRoleId;
  if (!targetRoleId) {
    throw new Error('MISSING_ROLE_DOCUMENT');
  }
  const parsed = parseRoleDocId(targetRoleId);
  const payloadUserId =
    typeof approval.payload?.targetUserId === 'string'
      ? (approval.payload.targetUserId as string)
      : null;
  return {
    roleDocId: targetRoleId,
    userId: payloadUserId ?? parsed.userId,
    storeId: parsed.storeId ?? approval.storeId ?? null,
  };
};

const assertFreshDocument = (
  submittedAt: Date | null,
  updatedAt: unknown,
  errorCode: string,
): void => {
  if (!submittedAt || !(updatedAt instanceof Timestamp)) {
    return;
  }
  if (updatedAt.toMillis() > submittedAt.getTime()) {
    throw new Error(errorCode);
  }
};

const slugifyAllowanceName = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
};

const buildAllowanceDocId = (roleDocId: string, name: string): string => {
  const slug = slugifyAllowanceName(name);
  if (!slug) {
    throw new Error('ALLOWANCE_NAME_REQUIRED');
  }
  return `${roleDocId}__${slug}`;
};

const readString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
};

const readBoolean = (value: unknown): boolean | null => {
  return typeof value === 'boolean' ? value : null;
};

const logApprovalAction = async ({
  approval,
  action,
  actorUserId,
  actorDisplayName,
  comment,
}: {
  approval: ApprovalSummary;
  action: 'approved' | 'rejected';
  actorUserId: string;
  actorDisplayName?: string | null;
  comment?: string | null;
}): Promise<void> => {
  await addDoc(approvalLogsCollection(), {
    approvalId: approval.id,
    storeId: approval.storeId ?? null,
    type: approval.type,
    action,
    actorUserId,
    actorDisplayName: actorDisplayName ?? null,
    comment: comment ?? null,
    batchId: approval.batchContext?.id ?? null,
    createdAt: serverTimestamp(),
  });
};

const mapApproval = (docSnapshot: QueryDocumentSnapshot<DocumentData>): ApprovalSummary => {
  const data = docSnapshot.data() ?? {};
  return {
    id: docSnapshot.id,
    storeId: typeof data.storeId === 'string' ? data.storeId : null,
    type: (data.type as ApprovalSummary['type']) ?? 'shiftCorrection',
    status: (data.status as ApprovalStatus) ?? 'pending',
    title: typeof data.title === 'string' ? data.title : docSnapshot.id,
    submittedBy: typeof data.submittedBy === 'string' ? data.submittedBy : null,
    submittedByName: typeof data.submittedByName === 'string' ? data.submittedByName : null,
    submittedAt: data.submittedAt instanceof Timestamp ? data.submittedAt.toDate() : null,
    commentRequired: data.commentRequired === true,
    payload:
      typeof data.payload === 'object' && data.payload
        ? (data.payload as Record<string, unknown>)
        : {},
    target:
      typeof data.target === 'object' && data.target
        ? {
            col: typeof data.target.col === 'string' ? data.target.col : null,
            id: typeof data.target.id === 'string' ? data.target.id : null,
          }
        : null,
    batchContext:
      typeof data.batchContext === 'object' && data.batchContext
        ? {
            id: typeof data.batchContext.id === 'string' ? data.batchContext.id : undefined,
            index:
              typeof data.batchContext.index === 'number' ? data.batchContext.index : undefined,
            count:
              typeof data.batchContext.count === 'number' ? data.batchContext.count : undefined,
          }
        : null,
  };
};

export const listApprovals = async (filters: ApprovalFilters = {}): Promise<ApprovalSummary[]> => {
  const constraints: QueryConstraint[] = [];
  const storeIds = filters.storeIds?.filter(Boolean);
  if (storeIds && storeIds.length === 1) {
    constraints.push(where('storeId', '==', storeIds[0]));
  }
  if (filters.statuses?.length === 1) {
    constraints.push(where('status', '==', filters.statuses[0]));
  }
  if (filters.types?.length === 1) {
    constraints.push(where('type', '==', filters.types[0]));
  }

  const approvalsRef = approvalsCollection();
  const approvalsQuery = constraints.length
    ? query(approvalsRef, ...constraints, orderBy('submittedAt', 'desc'))
    : query(approvalsRef, orderBy('submittedAt', 'desc'));

  const snapshot = await getDocs(approvalsQuery);
  return snapshot.docs.map(mapApproval);
};

export const approveShiftCorrection = async (
  approval: ApprovalSummary,
  { actorUserId, actorDisplayName, comment }: ApprovalActionOptions,
): Promise<void> => {
  const batch = writeBatch(firestore());
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  batch.update(approvalRef, {
    status: 'approved',
    decidedBy: actorUserId,
    decidedByName: actorDisplayName ?? null,
    decidedAt: serverTimestamp(),
    comment: comment ?? null,
  });

  const correctionId = String(
    (approval.payload?.correctionRequestId as string | undefined) ??
      (approval.payload?.targetId as string | undefined) ??
      approval.id,
  );
  const attendancePath = approval.payload?.attendancePath as unknown;

  if (typeof correctionId === 'string' && correctionId) {
    const correctionRef = doc(firestore(), 'correctionRequests', correctionId);
    batch.update(correctionRef, {
      status: 'approved',
      resolvedAt: serverTimestamp(),
      resolvedBy: actorUserId,
      resolvedByName: actorDisplayName ?? null,
    });
  }

  if (Array.isArray(attendancePath) && attendancePath.length >= 2) {
    const mappedPath = attendancePath.map((segment) => String(segment));
    const [firstSegment, ...restSegments] = mappedPath;
    const attendanceRef = doc(firestore(), firstSegment, ...restSegments);
    const attendancePatch = (approval.payload?.attendancePatch ?? {}) as Record<string, unknown>;
    if (Object.keys(attendancePatch).length > 0) {
      batch.set(
        attendanceRef,
        {
          ...attendancePatch,
          updatedAt: serverTimestamp(),
          updatedBy: actorUserId,
          updatedByName: actorDisplayName ?? null,
        },
        { merge: true },
      );
    }
  }

  await batch.commit();
};

export const approveReceipt = async (
  approval: ApprovalSummary,
  { actorUserId, actorDisplayName, comment }: ApprovalActionOptions,
): Promise<void> => {
  const batch = writeBatch(firestore());
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  batch.update(approvalRef, {
    status: 'approved',
    decidedBy: actorUserId,
    decidedByName: actorDisplayName ?? null,
    decidedAt: serverTimestamp(),
    comment: comment ?? null,
  });

  const receiptId = String(
    (approval.payload?.receiptId as string | undefined) ??
      (approval.payload?.targetId as string | undefined) ??
      approval.id,
  );
  const receiptRef = doc(firestore(), 'receipts', receiptId);
  batch.update(receiptRef, {
    status: 'locked',
    approvalComment: comment ?? null,
    approvedAt: serverTimestamp(),
    approvedBy: actorUserId,
    approvedByName: actorDisplayName ?? null,
  });

  await batch.commit();
};

export const rejectReceipt = async (
  approval: ApprovalSummary,
  { actorUserId, actorDisplayName, comment }: ApprovalActionOptions,
): Promise<void> => {
  const batch = writeBatch(firestore());
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  batch.update(approvalRef, {
    status: 'rejected',
    decidedBy: actorUserId,
    decidedByName: actorDisplayName ?? null,
    decidedAt: serverTimestamp(),
    comment: comment ?? null,
  });

  const receiptId = String(
    (approval.payload?.receiptId as string | undefined) ??
      (approval.payload?.targetId as string | undefined) ??
      approval.id,
  );
  const receiptRef = doc(firestore(), 'receipts', receiptId);
  batch.update(receiptRef, {
    status: 'draft',
    rejectionComment: comment ?? null,
    rejectedAt: serverTimestamp(),
    rejectedBy: actorUserId,
    rejectedByName: actorDisplayName ?? null,
  });

  await batch.commit();
};

export const approveStoreMembership = async (
  approval: ApprovalSummary,
  { actorUserId, actorDisplayName, comment }: ApprovalActionOptions,
): Promise<void> => {
  const batch = writeBatch(firestore());
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  batch.update(approvalRef, {
    status: 'approved',
    decidedBy: actorUserId,
    decidedByName: actorDisplayName ?? null,
    decidedAt: serverTimestamp(),
    comment: comment ?? null,
  });

  const requestId = String(
    (approval.payload?.joinRequestId as string | undefined) ??
      (approval.payload?.targetId as string | undefined) ??
      approval.id,
  );
  const storeId = String((approval.payload?.storeId as string | undefined) ?? approval.storeId ?? '');
  const userId = String(
    (approval.payload?.userId as string | undefined) ??
      (approval.payload?.submittedBy as string | undefined) ??
      approval.submittedBy ??
      '',
  );

  if (storeId && userId) {
    const roleRef = doc(firestore(), 'userStoreRoles', `${userId}_${storeId}`);
    batch.set(
      roleRef,
      {
        userId,
        storeId,
        role: (approval.payload as any)?.role ?? 'staff',
        isResigned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: actorUserId,
        updatedByName: actorDisplayName ?? null,
        source: 'approval',
      },
      { merge: true },
    );
  }

  if (requestId) {
    const joinRequestRef = doc(firestore(), 'storeJoinRequests', requestId);
    batch.update(joinRequestRef, {
      status: 'approved',
      resolvedAt: serverTimestamp(),
      resolvedBy: actorUserId,
      resolvedByName: actorDisplayName ?? null,
      managerComment: comment ?? null,
    });
  }

  await batch.commit();
};

export const rejectStoreMembership = async (
  approval: ApprovalSummary,
  { actorUserId, actorDisplayName, comment }: ApprovalActionOptions,
): Promise<void> => {
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  await updateDoc(approvalRef, {
    status: 'rejected',
    decidedBy: actorUserId,
    decidedByName: actorDisplayName ?? null,
    decidedAt: serverTimestamp(),
    comment: comment ?? null,
  });

  const requestId = String(
    (approval.payload?.joinRequestId as string | undefined) ??
      (approval.payload?.targetId as string | undefined) ??
      approval.id,
  );
  if (requestId) {
    const joinRequestRef = doc(firestore(), 'storeJoinRequests', requestId);
    await updateDoc(joinRequestRef, {
      status: 'rejected',
      resolvedAt: serverTimestamp(),
      resolvedBy: actorUserId,
      resolvedByName: actorDisplayName ?? null,
      managerComment: comment ?? null,
    });
  }
};

const approveGeneric = async (
  approval: ApprovalSummary,
  { actorUserId, actorDisplayName, comment }: ApprovalActionOptions,
): Promise<void> => {
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  await updateDoc(approvalRef, {
    status: 'approved',
    decidedBy: actorUserId,
    decidedByName: actorDisplayName ?? null,
    decidedAt: serverTimestamp(),
    comment: comment ?? null,
  });
};

const approveEmploymentChange = async (
  approval: ApprovalSummary,
  options: ApprovalActionOptions,
): Promise<void> => {
  const { roleDocId } = resolveTargetRole(approval);
  await runTransaction(firestore(), async (txn) => {
    const roleRef = doc(firestore(), 'userStoreRoles', roleDocId);
    const approvalRef = doc(firestore(), 'approvals', approval.id);
    const roleSnap = await txn.get(roleRef);
    if (!roleSnap.exists()) {
      throw new Error('MISSING_ROLE_DOCUMENT');
    }
    const roleData = roleSnap.data();
    assertFreshDocument(approval.submittedAt, roleData?.updatedAt, 'STALE_ROLE_DOCUMENT');

    const payload = approval.payload as Record<string, unknown>;
    txn.update(roleRef, {
      employment: {
        type: readString(payload?.employmentType),
        baseRate: readNumber(payload?.baseRate),
        baseHours: readNumber(payload?.baseHours),
        note: readString(payload?.note),
        effectiveFrom: readString(payload?.effectiveFrom),
      },
      updatedAt: serverTimestamp(),
      updatedBy: options.actorUserId,
      updatedByName: options.actorDisplayName ?? null,
    });

    txn.update(approvalRef, {
      status: 'approved',
      decidedBy: options.actorUserId,
      decidedByName: options.actorDisplayName ?? null,
      decidedAt: serverTimestamp(),
      comment: options.comment ?? null,
    });
  });
};

const approveAllowanceChange = async (
  approval: ApprovalSummary,
  options: ApprovalActionOptions,
): Promise<void> => {
  const { roleDocId, storeId, userId } = resolveTargetRole(approval);
  if (!storeId || !userId) {
    throw new Error('MISSING_ROLE_DOCUMENT');
  }
  const payload = approval.payload as Record<string, unknown>;
  const allowancePayload = (payload?.allowance ?? {}) as Record<string, unknown>;
  const name = readString(allowancePayload?.name);
  if (!name) {
    throw new Error('ALLOWANCE_NAME_REQUIRED');
  }
  const amount = readNumber(allowancePayload?.amount);
  const taxExempt = readBoolean(allowancePayload?.taxExempt) ?? false;
  const note = readString(allowancePayload?.note);
  const payloadEffectiveFrom = readString(payload?.effectiveFrom);
  const payloadEffectiveTo = readString(allowancePayload?.effectiveTo);
  const allowanceRefId = buildAllowanceDocId(roleDocId, name);

  await runTransaction(firestore(), async (txn) => {
    const allowanceRef = doc(firestore(), 'allowances', allowanceRefId);
    const approvalRef = doc(firestore(), 'approvals', approval.id);
    const allowanceSnap = await txn.get(allowanceRef);
    const existing = allowanceSnap.exists() ? allowanceSnap.data() : null;

    const allowSubmittedAt = approval.submittedAt;
    assertFreshDocument(allowSubmittedAt, existing?.updatedAt, 'STALE_ALLOWANCE_DOCUMENT');

    const baseData = {
      roleDocId,
      storeId,
      userId,
      name,
      updatedAt: serverTimestamp(),
      updatedBy: options.actorUserId,
      updatedByName: options.actorDisplayName ?? null,
    };

    const type = approval.type;
    if (type === 'allowance_add') {
      txn.set(
        allowanceRef,
        {
          ...baseData,
          createdAt: existing?.createdAt ?? serverTimestamp(),
          status: 'active',
          amount,
          taxExempt,
          note: note ?? null,
          effectiveFrom: payloadEffectiveFrom ?? existing?.effectiveFrom ?? null,
          effectiveTo: payloadEffectiveTo ?? existing?.effectiveTo ?? null,
        },
        { merge: true },
      );
    } else if (type === 'allowance_update') {
      if (!existing) {
        throw new Error('ALLOWANCE_NOT_FOUND');
      }
      txn.set(
        allowanceRef,
        {
          ...existing,
          ...baseData,
          status: 'active',
          amount: amount ?? existing.amount ?? null,
          taxExempt,
          note: note ?? existing.note ?? null,
          effectiveFrom: payloadEffectiveFrom ?? existing.effectiveFrom ?? null,
          effectiveTo: payloadEffectiveTo ?? existing.effectiveTo ?? null,
        },
        { merge: true },
      );
    } else {
      // allowance_end
      if (!existing) {
        throw new Error('ALLOWANCE_NOT_FOUND');
      }
      txn.set(
        allowanceRef,
        {
          ...existing,
          ...baseData,
          status: 'ended',
          endedAt: serverTimestamp(),
          effectiveTo: payloadEffectiveTo ?? payloadEffectiveFrom ?? existing.effectiveTo ?? null,
        },
        { merge: true },
      );
    }

    txn.update(approvalRef, {
      status: 'approved',
      decidedBy: options.actorUserId,
      decidedByName: options.actorDisplayName ?? null,
      decidedAt: serverTimestamp(),
      comment: options.comment ?? null,
    });
  });
};

const approveCommuteUpdate = async (
  approval: ApprovalSummary,
  options: ApprovalActionOptions,
): Promise<void> => {
  const { roleDocId } = resolveTargetRole(approval);
  await runTransaction(firestore(), async (txn) => {
    const roleRef = doc(firestore(), 'userStoreRoles', roleDocId);
    const approvalRef = doc(firestore(), 'approvals', approval.id);
    const roleSnap = await txn.get(roleRef);
    if (!roleSnap.exists()) {
      throw new Error('MISSING_ROLE_DOCUMENT');
    }
    const roleData = roleSnap.data();
    assertFreshDocument(approval.submittedAt, roleData?.updatedAt, 'STALE_ROLE_DOCUMENT');

    const payload = approval.payload as Record<string, unknown>;
    const commutePayload = (payload?.commute ?? {}) as Record<string, unknown>;
    const modeRaw = readString(commutePayload?.mode);
    const mode = modeRaw === 'perDay' || modeRaw === 'fixedMonthly' ? modeRaw : null;

    txn.update(roleRef, {
      commute: {
        mode,
        amount: readNumber(commutePayload?.amount),
        taxExempt: readBoolean(commutePayload?.taxExempt),
        effectiveFrom: readString(payload?.effectiveFrom),
      },
      updatedAt: serverTimestamp(),
      updatedBy: options.actorUserId,
      updatedByName: options.actorDisplayName ?? null,
    });

    txn.update(approvalRef, {
      status: 'approved',
      decidedBy: options.actorUserId,
      decidedByName: options.actorDisplayName ?? null,
      decidedAt: serverTimestamp(),
      comment: options.comment ?? null,
    });
  });
};

export const approveApproval = async (approval: ApprovalSummary, options: ApprovalActionOptions) => {
  switch (approval.type) {
    case 'shiftCorrection':
      return approveShiftCorrection(approval, options);
    case 'receipt':
      return approveReceipt(approval, options);
    case 'storeMembership':
      return approveStoreMembership(approval, options);
    case 'employment_change':
      return approveEmploymentChange(approval, options);
    case 'allowance_add':
    case 'allowance_update':
    case 'allowance_end':
      return approveAllowanceChange(approval, options);
    case 'commute_update':
      return approveCommuteUpdate(approval, options);
    default:
      return approveGeneric(approval, options);
  }
};

export const rejectApproval = async (approval: ApprovalSummary, options: ApprovalActionOptions) => {
  const approvalRef = doc(firestore(), 'approvals', approval.id);
  switch (approval.type) {
    case 'receipt':
      return rejectReceipt(approval, options);
    case 'storeMembership':
      return rejectStoreMembership(approval, options);
    default:
      await updateDoc(approvalRef, {
        status: 'rejected',
        decidedBy: options.actorUserId,
        decidedByName: options.actorDisplayName ?? null,
        decidedAt: serverTimestamp(),
        comment: options.comment ?? null,
      });
  }
};

export const loadApproval = async (id: string): Promise<ApprovalSummary | null> => {
  const approvalSnap = await getDoc(doc(firestore(), 'approvals', id));
  if (!approvalSnap.exists()) {
    return null;
  }
  return mapApproval(approvalSnap as QueryDocumentSnapshot<DocumentData>);
};

export const approveMany = async ({
  approvalIds,
  actorUserId,
  actorDisplayName,
  comment,
}: BulkApprovalActionOptions): Promise<void> => {
  const uniqueIds = Array.from(new Set(approvalIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return;
  }

  const approvals = await Promise.all(uniqueIds.map((id) => loadApproval(id)));
  const valid = approvals.filter((item): item is ApprovalSummary => Boolean(item));
  for (const approval of valid) {
    await approveApproval(approval, { actorUserId, actorDisplayName, comment });
    await logApprovalAction({
      approval,
      action: 'approved',
      actorUserId,
      actorDisplayName,
      comment,
    });
  }
};

export const rejectMany = async ({
  approvalIds,
  actorUserId,
  actorDisplayName,
  comment,
}: BulkApprovalActionOptions): Promise<void> => {
  const uniqueIds = Array.from(new Set(approvalIds.filter(Boolean)));
  if (!uniqueIds.length) {
    return;
  }

  const approvals = await Promise.all(uniqueIds.map((id) => loadApproval(id)));
  const valid = approvals.filter((item): item is ApprovalSummary => Boolean(item));
  for (const approval of valid) {
    await rejectApproval(approval, { actorUserId, actorDisplayName, comment });
    await logApprovalAction({
      approval,
      action: 'rejected',
      actorUserId,
      actorDisplayName,
      comment,
    });
  }
};

export interface CreateBatchApprovalsParams {
  storeId: string | null;
  targetRoleDocIds: string[];
  type: ApprovalType;
  payload: Record<string, unknown>;
  requester: { uid: string; name?: string | null };
  title?: string | null;
  commentRequired?: boolean;
}

const generateBatchId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createBatchApprovals = async ({
  storeId,
  targetRoleDocIds,
  type,
  payload,
  requester,
  title,
  commentRequired = false,
}: CreateBatchApprovalsParams): Promise<{ batchId: string; created: number }> => {
  if (!targetRoleDocIds.length) {
    return { batchId: '', created: 0 };
  }

  const batchId = generateBatchId();
  const batch = writeBatch(firestore());
  const approvalsRef = approvalsCollection();
  const defaultTitle = title ?? `${type}`;

  targetRoleDocIds.forEach((roleDocId, index) => {
    const approvalRef = doc(approvalsRef);
    const parsed = parseRoleDocId(roleDocId);
    batch.set(approvalRef, {
      type,
      status: 'pending',
      storeId,
      title: defaultTitle,
      submittedBy: requester.uid,
      submittedByName: requester.name ?? null,
      submittedAt: serverTimestamp(),
      commentRequired,
      payload: {
        ...payload,
        targetRoleDocId: roleDocId,
        targetUserId: parsed.userId,
      },
      target: {
        col: 'userStoreRoles',
        id: roleDocId,
      },
      batchContext: {
        id: batchId,
        index,
        count: targetRoleDocIds.length,
      },
    });
  });

  await batch.commit();
  return { batchId, created: targetRoleDocIds.length };
};
