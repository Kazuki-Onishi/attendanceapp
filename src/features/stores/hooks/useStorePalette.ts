import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

export type StorePaletteEntry = {
  id: string;
  name?: string | null;
  color?: string | null;
};

const normaliseIds = (ids: string[]): string[] => Array.from(new Set(ids.filter(Boolean))).sort();

export function useStorePalette(storeIds: string[]): Record<string, StorePaletteEntry> {
  const storeIdsKey = useMemo(() => storeIds.join('|'), [storeIds]);
  const deduped = useMemo(() => normaliseIds(storeIds), [storeIdsKey]);
  const [palette, setPalette] = useState<Record<string, StorePaletteEntry>>({});

  useEffect(() => {
    if (!deduped.length) {
      setPalette({});
      return () => undefined;
    }

    const unsubscribes = deduped.map((storeId) =>
      onSnapshot(
        doc(firestore(), 'shops', storeId),
        (snapshot) => {
          const data = snapshot.data() ?? {};
          setPalette((prev) => ({
            ...prev,
            [storeId]: {
              id: storeId,
              name: typeof data.name === 'string' ? data.name : prev[storeId]?.name ?? null,
              color: typeof data.color === 'string' ? data.color : prev[storeId]?.color ?? null,
            },
          }));
        },
        () => {
          setPalette((prev) => ({
            ...prev,
            [storeId]: {
              id: storeId,
              name: prev[storeId]?.name ?? null,
              color: prev[storeId]?.color ?? null,
            },
          }));
        },
      ),
    );

    return () => {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [deduped]);

  return useMemo(() => palette, [palette]);
}
