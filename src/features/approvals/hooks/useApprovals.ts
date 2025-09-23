import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  type DocumentData,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import type { ApprovalFilters, ApprovalStatus, ApprovalSummary } from '@/features/approvals/types';

const approvalsRef = () => collection(firestore(), 'approvals');

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
    submittedAt: data.submittedAt?.toDate?.() ?? null,
    commentRequired: data.commentRequired === true,
    payload: typeof data.payload === 'object' && data.payload ? (data.payload as Record<string, unknown>) : {},
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

export const useApprovals = (filters: ApprovalFilters = {}) => {
  const [items, setItems] = useState<ApprovalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const singleStoreId = filters.storeIds?.length === 1 ? filters.storeIds[0] : undefined;
  const singleStatus = filters.statuses?.length === 1 ? filters.statuses[0] : undefined;
  const singleType = filters.types?.length === 1 ? filters.types[0] : undefined;

  const constraints = useMemo(() => {
    const out: QueryConstraint[] = [];
    if (singleStoreId) {
      out.push(where('storeId', '==', singleStoreId));
    }
    if (singleStatus) {
      out.push(where('status', '==', singleStatus));
    }
    if (singleType) {
      out.push(where('type', '==', singleType));
    }
    out.push(orderBy('submittedAt', 'desc'));
    return out;
  }, [singleStoreId, singleStatus, singleType]);

  useEffect(() => {
    setLoading(true);
    const approvalsQuery = query(approvalsRef(), ...constraints);
    const unsubscribe = onSnapshot(
      approvalsQuery,
      (snapshot) => {
        setItems(snapshot.docs.map(mapApproval));
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message ?? 'Failed to load approvals.');
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [constraints]);

  const refetch = useCallback(() => {
    setLoading(true);
  }, []);

  return { approvals: items, loading, error, refetch };
};

