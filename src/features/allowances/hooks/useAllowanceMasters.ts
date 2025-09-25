import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import { mapAllowanceMaster } from '../utils';
import type { AllowanceMaster } from '../types';

export interface UseAllowanceMastersResult {
  masters: AllowanceMaster[];
  loading: boolean;
  error: Error | null;
}

export function useAllowanceMasters(storeId: string | null | undefined): UseAllowanceMastersResult {
  const [masters, setMasters] = useState<AllowanceMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!storeId) {
      setMasters([]);
      setError(null);
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);
    setError(null);

    const mastersRef = collection(firestore(), 'allowanceMasters');
    const mastersQuery = query(mastersRef, where('storeId', '==', storeId), orderBy('name', 'asc'));

    const unsubscribe = onSnapshot(
      mastersQuery,
      (snapshot) => {
        const items = snapshot.docs.map((docSnapshot) =>
          mapAllowanceMaster(docSnapshot.id, docSnapshot.data() as Record<string, unknown>),
        );
        items.sort((a, b) => {
          const left = a.name ?? '';
          const right = b.name ?? '';
          return left.localeCompare(right, 'ja');
        });
        setMasters(items);
        setLoading(false);
      },
      (err) => {
        setError(err instanceof Error ? err : new Error('Failed to load allowance masters'));
        setMasters([]);
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [storeId]);

  return useMemo(
    () => ({
      masters,
      loading,
      error,
    }),
    [masters, loading, error],
  );
}

