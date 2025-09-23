import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  type DocumentData,
  type FirestoreError,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

export type FileAccessStatus = 'granted' | 'revoked';

export interface StoreFileAccess {
  id: string;
  storeId: string;
  userId: string;
  status: FileAccessStatus;
  grantedBy?: string | null;
  grantedAt?: Date | null;
  revokedBy?: string | null;
  revokedAt?: Date | null;
  updatedAt?: Date | null;
}

interface StoreFileAccessDoc {
  storeId?: string;
  userId?: string;
  status?: FileAccessStatus;
  grantedBy?: string;
  grantedAt?: { seconds: number; nanoseconds: number } | null;
  revokedBy?: string;
  revokedAt?: { seconds: number; nanoseconds: number } | null;
  updatedAt?: { seconds: number; nanoseconds: number } | null;
}

const toDate = (
  input: { seconds: number; nanoseconds: number } | undefined | null,
): Date | null => {
  if (!input) {
    return null;
  }
  const { seconds, nanoseconds } = input;
  return new Date(seconds * 1000 + Math.floor(nanoseconds / 1_000_000));
};

const mapFileAccess = (
  snapshotId: string,
  data: StoreFileAccessDoc | undefined,
): StoreFileAccess | null => {
  if (!data?.storeId || !data.userId) {
    return null;
  }

  const status: FileAccessStatus = data.status === 'granted' ? 'granted' : 'revoked';

  return {
    id: snapshotId,
    storeId: data.storeId,
    userId: data.userId,
    status,
    grantedBy: data.grantedBy ?? null,
    grantedAt: toDate(data.grantedAt ?? null),
    revokedBy: data.revokedBy ?? null,
    revokedAt: toDate(data.revokedAt ?? null),
    updatedAt: toDate(data.updatedAt ?? null),
  };
};

export const listenStoreFileAccess = (
  storeId: string,
  onChange: (entries: StoreFileAccess[]) => void,
  onError?: (error: FirestoreError) => void,
): Unsubscribe => {
  const db = firestore();
  const accessRef = collection(db, 'storeFileAccess');
  const subscription = onSnapshot(
    query(accessRef, where('storeId', '==', storeId)),
    (snapshot: QuerySnapshot<DocumentData>) => {
      const entries = snapshot.docs
        .map((docSnapshot) => mapFileAccess(docSnapshot.id, docSnapshot.data() as StoreFileAccessDoc | undefined))
        .filter((entry): entry is StoreFileAccess => Boolean(entry));
      onChange(entries);
    },
    onError,
  );

  return subscription;
};

const accessDocRef = (storeId: string, userId: string) =>
  doc(firestore(), 'storeFileAccess', `${storeId}_${userId}`);

const basePayload = (storeId: string, userId: string) => ({
  storeId,
  userId,
});

export const grantStoreFileAccess = async (
  storeId: string,
  userId: string,
  actorUserId: string,
): Promise<void> => {
  const now = serverTimestamp();
  await setDoc(
    accessDocRef(storeId, userId),
    {
      ...basePayload(storeId, userId),
      status: 'granted' as const,
      grantedBy: actorUserId,
      grantedAt: now,
      updatedAt: now,
      revokedBy: null,
      revokedAt: null,
    },
    { merge: true },
  );
};

export const revokeStoreFileAccess = async (
  storeId: string,
  userId: string,
  actorUserId: string,
): Promise<void> => {
  const now = serverTimestamp();
  await setDoc(
    accessDocRef(storeId, userId),
    {
      ...basePayload(storeId, userId),
      status: 'revoked' as const,
      revokedBy: actorUserId,
      revokedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );
};
