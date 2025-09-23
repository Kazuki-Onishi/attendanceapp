import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  setDoc,
  type DocumentData,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
  Timestamp,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

export type StoreJoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'canceled';

export interface StoreJoinRequest {
  id: string;
  userId: string;
  storeId: string;
  note: string | null;
  source: 'self' | 'admin';
  status: StoreJoinRequestStatus;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface StoreJoinRequestDoc {
  userId?: string;
  storeId?: string;
  note?: string;
  source?: string;
  status?: string;
  createdAt?: { seconds: number; nanoseconds: number };
  updatedAt?: { seconds: number; nanoseconds: number };
}

const toDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return null;
};

const mapRequest = (snapshotId: string, data: StoreJoinRequestDoc | undefined): StoreJoinRequest | null => {
  if (!data?.userId || !data.storeId) {
    return null;
  }

  const status = (data.status as StoreJoinRequestStatus | undefined) ?? 'pending';
  const source = data.source === 'admin' ? 'admin' : 'self';

  return {
    id: snapshotId,
    userId: data.userId,
    storeId: data.storeId,
    note: typeof data.note === 'string' && data.note.trim().length > 0 ? data.note : null,
    source,
    status,
    createdAt: toDate(data.createdAt ?? null),
    updatedAt: toDate(data.updatedAt ?? null),
  };
};

export const listenStoreJoinRequests = (
  userId: string,
  onChange: (requests: StoreJoinRequest[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe => {
  const db = firestore();
  const requestsRef = collection(db, 'storeJoinRequests');
  const subscription = onSnapshot(
    query(requestsRef, where('userId', '==', userId), orderBy('createdAt', 'desc')),
    (snapshot: QuerySnapshot<DocumentData>) => {
      const requests = snapshot.docs
        .map((docSnapshot) => mapRequest(docSnapshot.id, docSnapshot.data() as StoreJoinRequestDoc | undefined))
        .filter((request): request is StoreJoinRequest => Boolean(request));
      onChange(requests);
    },
    onError,
  );

  return subscription;
};

export const createStoreJoinRequest = async (params: {
  userId: string;
  storeId: string;
  note?: string | null;
}): Promise<void> => {
  const db = firestore();
  const requestsRef = collection(db, 'storeJoinRequests');
  const storeId = params.storeId.trim();
  if (!storeId) {
    throw new Error('Store code is required.');
  }

  const payload = {
    userId: params.userId,
    storeId,
    note: params.note?.trim() ?? null,
    source: 'self' as const,
    status: 'pending' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const requestRef = await addDoc(requestsRef, payload);

  const approvalRef = doc(db, 'approvals', requestRef.id);
  await setDoc(approvalRef, {
    type: 'storeMembership',
    status: 'pending',
    title: `Join request: ${storeId}`,
    storeId,
    submittedBy: params.userId,
    submittedAt: serverTimestamp(),
    commentRequired: false,
    payload: {
      joinRequestId: requestRef.id,
      storeId,
      userId: params.userId,
      note: params.note?.trim() ?? null,
    },
  }, { merge: true });
};

export const cancelStoreJoinRequest = async (requestId: string, actorUserId?: string): Promise<void> => {
  const db = firestore();
  const requestRef = doc(db, 'storeJoinRequests', requestId);
  await updateDoc(requestRef, {
    status: 'canceled',
    updatedAt: serverTimestamp(),
  });
  const approvalRef = doc(db, 'approvals', requestId);
  try {
    await updateDoc(approvalRef, {
      status: 'rejected',
      decidedAt: serverTimestamp(),
      decidedBy: actorUserId ?? null,
      comment: 'Cancelled by requester',
    });
  } catch (error) {
    // approval entry may not exist yet; ignore
  }
};

export const markStoreJoinRequestStatus = async (
  requestId: string,
  status: StoreJoinRequestStatus,
): Promise<void> => {
  const db = firestore();
  const requestRef = doc(db, 'storeJoinRequests', requestId);
  await updateDoc(requestRef, {
    status,
    updatedAt: serverTimestamp(),
  });
};
