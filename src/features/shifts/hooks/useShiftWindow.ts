import { useCallback, useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

export type ShiftWindow = {
  startDate: string | null;
  endDate: string | null;
  locked: boolean;
  adminMessage: string | null;
};

export type UseShiftWindowResult = ShiftWindow & {
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const EMPTY_WINDOW: ShiftWindow = {
  startDate: null,
  endDate: null,
  locked: false,
  adminMessage: null,
};

export const formatMonthKey = (date: Date): string =>
  `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;

export function useShiftWindow(monthKey: string | null): UseShiftWindowResult {
  const [window, setWindow] = useState<ShiftWindow>(EMPTY_WINDOW);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!monthKey) {
      setWindow(EMPTY_WINDOW);
      setLoading(false);
      setError(null);
      return () => undefined;
    }

    setLoading(true);
    const ref = doc(firestore(), 'submitWindows', monthKey);

    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        const data = snapshot.data() ?? null;
        if (!data) {
          setWindow(EMPTY_WINDOW);
          setError(null);
        } else {
          setWindow({
            startDate: typeof data.startDate === 'string' ? data.startDate : null,
            endDate: typeof data.endDate === 'string' ? data.endDate : null,
            locked: data.locked === true,
            adminMessage: typeof data.adminMessage === 'string' ? data.adminMessage : null,
          });
          setError(null);
        }
        setLoading(false);
      },
      (subscriptionError) => {
        setWindow(EMPTY_WINDOW);
        setError(subscriptionError.message ?? 'Failed to load submission window.');
        setLoading(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [monthKey]);

  const refresh = useCallback(async () => {
    if (!monthKey) {
      setWindow(EMPTY_WINDOW);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const snap = await getDoc(doc(firestore(), 'submitWindows', monthKey));
      const data = snap.data() ?? null;
      if (!data) {
        setWindow(EMPTY_WINDOW);
        setError(null);
      } else {
        setWindow({
          startDate: typeof data.startDate === 'string' ? data.startDate : null,
          endDate: typeof data.endDate === 'string' ? data.endDate : null,
          locked: data.locked === true,
          adminMessage: typeof data.adminMessage === 'string' ? data.adminMessage : null,
        });
        setError(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh submission window.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  return useMemo(
    () => ({
      ...window,
      loading,
      error,
      refresh,
    }),
    [window, loading, error, refresh],
  );
}
