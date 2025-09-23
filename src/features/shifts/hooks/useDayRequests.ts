import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import { mergeEntries, type ShiftEntry } from '@/features/shifts/lib/mergeEntries';

export type DayRequest = {
  userId: string;
  date: string; // YYYY-MM-DD
  entries: ShiftEntry[];
  updatedAt: Timestamp | null;
};

type DayState = {
  date: string;
  entries: ShiftEntry[];
  loading: boolean;
  pending: boolean;
  error: string | null;
  updatedAt: Timestamp | null;
};

type DayStateMap = Record<string, DayState>;

const emptyState: DayState = {
  date: '',
  entries: [],
  loading: false,
  pending: false,
  error: null,
  updatedAt: null,
};

const entriesEqual = (a: ShiftEntry[], b: ShiftEntry[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left.storeId !== right.storeId || left.start !== right.start || left.end !== right.end) {
      return false;
    }
    if ((left.note ?? '') !== (right.note ?? '')) {
      return false;
    }
  }
  return true;
};

const toMonthDocRef = (userId: string, monthKey: string) =>
  doc(firestore(), 'shiftRequests', userId, 'months', monthKey);

const toDayDocRef = (userId: string, monthKey: string, date: string) =>
  doc(firestore(), 'shiftRequests', userId, 'months', monthKey, 'days', date);

const sanitizeEntries = (entries: ShiftEntry[]): ShiftEntry[] => mergeEntries(entries);

export type UseDayRequestsOptions = {
  userId: string | null;
  monthKey: string | null;
};

export type UseDayRequestsResult = {
  days: DayStateMap;
  loadDay: (date: string, force?: boolean) => Promise<DayRequest | null>;
  saveDayDiff: (date: string, nextEntries: ShiftEntry[]) => Promise<void>;
  removeDay: (date: string) => Promise<void>;
  isSaving: boolean;
  lastError: string | null;
};

export function useDayRequests({ userId, monthKey }: UseDayRequestsOptions): UseDayRequestsResult {
  const [dayStates, setDayStates] = useState<DayStateMap>({});
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    setDayStates({});
    setPendingCount(0);
    setLastError(null);

    if (!userId || !monthKey) {
      return () => undefined;
    }

    const daysRef = collection(firestore(), 'shiftRequests', userId, 'months', monthKey, 'days');

    const unsubscribe = onSnapshot(
      daysRef,
      (snapshot) => {
        setDayStates((prev) => {
          const next: DayStateMap = {};
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() ?? {};
            const entriesRaw = Array.isArray(data.entries) ? (data.entries as ShiftEntry[]) : [];
            const entries = sanitizeEntries(entriesRaw);
            const date = typeof data.date === 'string' ? data.date : docSnap.id;
            const prevState = prev[date];
            const equalToPrev = prevState ? entriesEqual(prevState.entries, entries) : false;
            next[date] = {
              date,
              entries,
              loading: false,
              pending: equalToPrev ? prevState?.pending ?? false : false,
              error: null,
              updatedAt: (data.updatedAt as Timestamp) ?? null,
            };
          });

          // preserve optimistic dates not yet in snapshot
          Object.keys(prev).forEach((date) => {
            if (!next[date] && prev[date]?.pending) {
              next[date] = prev[date];
            }
          });

          return next;
        });
      },
      (error) => {
        setLastError(error.message ?? 'Failed to load shift requests.');
      },
    );

    return () => {
      unsubscribe();
    };
  }, [userId, monthKey]);

  const loadDay = useCallback(
    async (date: string, force = false) => {
      if (!userId || !monthKey) {
        return null;
      }

      const existing = dayStates[date];
      if (existing && !force && !existing.loading) {
        return {
          userId,
          date,
          entries: existing.entries,
          updatedAt: existing.updatedAt,
        };
      }

      setDayStates((prev) => ({
        ...prev,
        [date]: {
          ...(prev[date] ?? { ...emptyState, date }),
          loading: true,
          error: null,
        },
      }));

      try {
        const ref = toDayDocRef(userId, monthKey, date);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setDayStates((prev) => ({
            ...prev,
            [date]: {
              date,
              entries: [],
              loading: false,
              pending: false,
              error: null,
              updatedAt: null,
            },
          }));
          return null;
        }

        const data = snap.data() ?? {};
        const entries = sanitizeEntries(Array.isArray(data.entries) ? (data.entries as ShiftEntry[]) : []);
        const updatedAt = (data.updatedAt as Timestamp) ?? null;

        setDayStates((prev) => ({
          ...prev,
          [date]: {
            date,
            entries,
            loading: false,
            pending: false,
            error: null,
            updatedAt,
          },
        }));

        return {
          userId,
          date,
          entries,
          updatedAt,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load day request.';
        setDayStates((prev) => ({
          ...prev,
          [date]: {
            ...(prev[date] ?? { ...emptyState, date }),
            loading: false,
            error: message,
          },
        }));
        setLastError(message);
        return null;
      }
    },
    [userId, monthKey, dayStates],
  );

  const saveDayDiff = useCallback(
    async (date: string, nextEntriesRaw: ShiftEntry[]) => {
      if (!userId || !monthKey) {
        return;
      }

      const nextEntries = sanitizeEntries(nextEntriesRaw);
      const prevEntries = (dayStates[date]?.entries ?? []).map((entry) => ({ ...entry }));

      if (entriesEqual(prevEntries, nextEntries)) {
        return;
      }

      setDayStates((prev) => ({
        ...prev,
        [date]: {
          ...(prev[date] ?? { ...emptyState, date }),
          entries: nextEntries,
          loading: false,
          pending: true,
          error: null,
          updatedAt: prev[date]?.updatedAt ?? null,
        },
      }));
      setPendingCount((count) => count + 1);
      setLastError(null);

      try {
        const monthRef = toMonthDocRef(userId, monthKey);
        await setDoc(
          monthRef,
          {
            userId,
            month: monthKey,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        const dayRef = toDayDocRef(userId, monthKey, date);

        if (nextEntries.length === 0) {
          await deleteDoc(dayRef);
        } else {
          await setDoc(
            dayRef,
            {
              userId,
              date,
              entries: nextEntries,
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save shift request.';
        setDayStates((prev) => ({
          ...prev,
          [date]: {
            ...(prev[date] ?? { ...emptyState, date }),
            entries: prevEntries,
            loading: false,
            pending: false,
            error: message,
            updatedAt: prev[date]?.updatedAt ?? null,
          },
        }));
        setLastError(message);
      } finally {
        setPendingCount((count) => Math.max(0, count - 1));
      }
    },
    [userId, monthKey, dayStates],
  );

  const removeDay = useCallback(
    async (date: string) => {
      await saveDayDiff(date, []);
    },
    [saveDayDiff],
  );

  const isSaving = pendingCount > 0;

  return useMemo(
    () => ({
      days: dayStates,
      loadDay,
      saveDayDiff,
      removeDay,
      isSaving,
      lastError,
    }),
    [dayStates, loadDay, saveDayDiff, removeDay, isSaving, lastError],
  );
}
