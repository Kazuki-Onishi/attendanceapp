import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, type QueryConstraint } from 'firebase/firestore';

import { firestore } from '@/lib/firebase';
import { buildAssignmentMap, mapAllowanceAssignment } from '../utils';
import type { AllowanceAssignment, AllowanceAssignmentMap } from '../types';

const IN_CLAUSE_LIMIT = 10;

const normaliseIds = (ids: string[]): string[] => {
  return Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0))).sort();
};

const chunkIds = (ids: string[]): string[][] => {
  if (ids.length === 0) {
    return [];
  }
  if (ids.length <= IN_CLAUSE_LIMIT) {
    return [ids];
  }
  const chunks: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += IN_CLAUSE_LIMIT) {
    chunks.push(ids.slice(offset, offset + IN_CLAUSE_LIMIT));
  }
  return chunks;
};

type HookState = {
  assignments: AllowanceAssignment[];
  map: AllowanceAssignmentMap;
  loading: boolean;
  error: Error | null;
};

export interface UseActiveAllowanceAssignmentsResult extends HookState {}

export function useActiveAllowanceAssignments(
  storeId: string | null | undefined,
  userIds: string[],
): UseActiveAllowanceAssignmentsResult {
  const [assignments, setAssignments] = useState<AllowanceAssignment[]>([]);
  const [map, setMap] = useState<AllowanceAssignmentMap>({ byId: {}, byUser: {} });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const normalisedUserIds = useMemo(() => normaliseIds(userIds), [userIds]);
  const userKey = useMemo(() => normalisedUserIds.join('|'), [normalisedUserIds]);
  const resolvedStoreId = useMemo(() => (typeof storeId === 'string' ? storeId.trim() : ''), [storeId]);

  useEffect(() => {
    if (!resolvedStoreId || normalisedUserIds.length === 0) {
      setAssignments([]);
      setMap({ byId: {}, byUser: {} });
      setLoading(false);
      setError(null);
      return () => undefined;
    }

    const baseRef = collection(firestore(), 'allowances');
    const chunks = chunkIds(normalisedUserIds);
    if (chunks.length === 0) {
      setAssignments([]);
      setMap({ byId: {}, byUser: {} });
      setLoading(false);
      setError(null);
      return () => undefined;
    }

    setLoading(true);
    setError(null);

    let readyCount = 0;
    const nextData = new Map<string, AllowanceAssignment>();

    const markReady = () => {
      readyCount += 1;
      if (readyCount >= chunks.length) {
        setLoading(false);
      }
    };

    const unsubscribes = chunks.map((chunk) => {
      const constraints: QueryConstraint[] = [
        where('storeId', '==', resolvedStoreId),
        where('status', '==', 'active'),
        where('userId', 'in', chunk),
      ];
      const q = query(baseRef, ...constraints);
      return onSnapshot(
        q,
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const assignment = mapAllowanceAssignment(
              change.doc.id,
              change.doc.data() as Record<string, unknown>,
            );
            if (change.type === 'removed') {
              nextData.delete(assignment.id);
            } else {
              nextData.set(assignment.id, assignment);
            }
          });

          const merged = Array.from(nextData.values()).filter((item) => item.storeId === resolvedStoreId);
          merged.sort((a, b) => {
            const left = a.userId ?? '';
            const right = b.userId ?? '';
            if (left === right) {
              const leftName = a.name ?? '';
              const rightName = b.name ?? '';
              return leftName.localeCompare(rightName, 'ja');
            }
            return left.localeCompare(right, 'ja');
          });

          setAssignments(merged);
          setMap(buildAssignmentMap(merged));
          markReady();
        },
        (err) => {
          nextData.clear();
          setError(err instanceof Error ? err : new Error('Failed to load allowance assignments'));
          setAssignments([]);
          setMap({ byId: {}, byUser: {} });
          markReady();
        },
      );
    });

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [resolvedStoreId, userKey, normalisedUserIds]);

  return useMemo(
    () => ({
      assignments,
      map,
      loading,
      error,
    }),
    [assignments, map, loading, error],
  );
}

