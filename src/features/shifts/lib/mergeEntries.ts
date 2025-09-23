export type ShiftEntry = {
  storeId: string;
  start: string; // HH:mm
  end: string; // HH:mm
  note?: string;
};

const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map((value) => Number.parseInt(value, 10));
  return hours * 60 + minutes;
};

const toHHMM = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const canCombine = (a: ShiftEntry, b: ShiftEntry): boolean => {
  if (a.storeId !== b.storeId) {
    return false;
  }
  if ((a.note ?? '') !== (b.note ?? '')) {
    return false;
  }
  return true;
};

/**
 * Merge overlapping or back-to-back ranges per store while preserving notes.
 */
export function mergeEntries(entries: ShiftEntry[]): ShiftEntry[] {
  if (!entries.length) {
    return [];
  }

  const grouped = new Map<string, ShiftEntry[]>();

  entries.forEach((entry) => {
    const list = grouped.get(entry.storeId) ?? [];
    list.push({ ...entry });
    grouped.set(entry.storeId, list);
  });

  const merged: ShiftEntry[] = [];

  grouped.forEach((list, _storeId) => {
    list.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    let current = { ...list[0] };

    for (let i = 1; i < list.length; i += 1) {
      const next = list[i];
      if (!canCombine(current, next)) {
        merged.push(current);
        current = { ...next };
        continue;
      }

      const currentEnd = toMinutes(current.end);
      const nextStart = toMinutes(next.start);
      const nextEnd = toMinutes(next.end);

      if (nextStart <= currentEnd) {
        if (nextEnd > currentEnd) {
          current.end = toHHMM(nextEnd);
        }
      } else if (nextStart === currentEnd) {
        current.end = toHHMM(nextEnd);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }

    merged.push(current);
  });

  return merged.sort((a, b) => {
    if (a.storeId === b.storeId) {
      return toMinutes(a.start) - toMinutes(b.start);
    }
    return a.storeId.localeCompare(b.storeId);
  });
}
