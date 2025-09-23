import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

export type StoreVisibilityPreference = {
  shareProfile: boolean;
  updatedAt?: Date | null;
};

export type StoreVisibilityMap = Record<string, StoreVisibilityPreference>;

export type UseStoreVisibilityOptions = {
  userId: string | null;
};

export type UseStoreVisibilityResult = {
  preferences: StoreVisibilityMap;
  loading: boolean;
  error: string | null;
  toggleShare: (storeId: string, nextValue: boolean) => Promise<void>;
  pending: Record<string, boolean>;
};

const DEFAULT_PREF: StoreVisibilityPreference = {
  shareProfile: true,
};

export function useStoreVisibilityPreferences({
  userId,
}: UseStoreVisibilityOptions): UseStoreVisibilityResult {
  const [preferences, setPreferences] = useState<StoreVisibilityMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!userId) {
      setPreferences({});
      setLoading(false);
      setError(null);
      return () => undefined;
    }

    setLoading(true);
    const prefsRef = collection(firestore(), 'storeMemberSettings', userId, 'stores');

    const unsubscribe = onSnapshot(
      prefsRef,
      (snapshot) => {
        const next: StoreVisibilityMap = {};
        snapshot.forEach((docSnapshot) => {
          const data = docSnapshot.data() ?? {};
          next[docSnapshot.id] = {
            shareProfile: data.shareProfile !== false,
            updatedAt: data.updatedAt?.toDate?.() ?? null,
          };
        });
        setPreferences(next);
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        setError(snapshotError.message ?? 'Failed to load visibility preferences.');
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [userId]);

  const toggleShare = useCallback(
    async (storeId: string, nextValue: boolean) => {
      if (!userId || !storeId) {
        return;
      }

      setPending((prev) => ({ ...prev, [storeId]: true }));
      setPreferences((prev) => ({
        ...prev,
        [storeId]: {
          ...(prev[storeId] ?? DEFAULT_PREF),
          shareProfile: nextValue,
        },
      }));
      setError(null);

      try {
        const ref = doc(firestore(), 'storeMemberSettings', userId, 'stores', storeId);
        await setDoc(
          ref,
          {
            shareProfile: nextValue,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update visibility.';
        setPreferences((prev) => ({
          ...prev,
          [storeId]: {
            ...(prev[storeId] ?? DEFAULT_PREF),
            shareProfile: !nextValue,
          },
        }));
        setError(message);
      } finally {
        setPending((prev) => ({
          ...prev,
          [storeId]: false,
        }));
      }
    },
    [userId],
  );

  return useMemo(
    () => ({
      preferences,
      loading,
      error,
      toggleShare,
      pending,
    }),
    [preferences, loading, error, toggleShare, pending],
  );
}
