import { mergeEntries, type ShiftEntry } from './mergeEntries';

export const DEFAULT_SLOT_FREQUENCY_MINUTES = 30;

export type Slot = {
  index: number;
  start: string;
  end: string;
  storeId: string | null;
};

export type SlotBrushPayload = {
  storeId: string | null;
};

const toHHMM = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const buildSlots = (
  stepMinutes: number = DEFAULT_SLOT_FREQUENCY_MINUTES,
  startMinutes: number = 0,
  endMinutes: number = 24 * 60,
): Slot[] => {
  const slots: Slot[] = [];
  const total = Math.floor((endMinutes - startMinutes) / stepMinutes);

  for (let index = 0; index < total; index += 1) {
    const start = startMinutes + index * stepMinutes;
    const end = start + stepMinutes;
    slots.push({
      index,
      start: toHHMM(start),
      end: toHHMM(end),
      storeId: null,
    });
  }

  return slots;
};

export const applyBrush = (
  slots: Slot[],
  fromIndex: number,
  toIndex: number,
  payload: SlotBrushPayload,
): Slot[] => {
  const [startIndex, endIndex] = fromIndex <= toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  return slots.map((slot) => {
    if (slot.index < startIndex || slot.index > endIndex) {
      return slot;
    }
    return { ...slot, storeId: payload.storeId };
  });
};

export const slotsToEntries = (slots: Slot[]): ShiftEntry[] => {
  const entries: ShiftEntry[] = [];
  let current: Slot | null = null;

  for (const slot of slots) {
    const storeId = slot.storeId;
    if (!storeId) {
      if (current && current.storeId) {
        const { storeId: prevStoreId, start, end } = current;
        entries.push({ storeId: prevStoreId, start, end });
      }
      current = null;
      continue;
    }

    if (!current || !current.storeId) {
      current = { ...slot, storeId };
      continue;
    }

    if (current.storeId === storeId && current.end === slot.start) {
      current.end = slot.end;
      continue;
    }

    const { storeId: prevStoreId, start, end } = current;
    if (prevStoreId) {
      entries.push({ storeId: prevStoreId, start, end });
    }
    current = { ...slot, storeId };
  }

  if (current && current.storeId) {
    const { storeId, start, end } = current;
    entries.push({ storeId, start, end });
  }

  return mergeEntries(entries);
};

export const entriesToSlots = (
  entries: ShiftEntry[],
  stepMinutes: number = DEFAULT_SLOT_FREQUENCY_MINUTES,
): Slot[] => {
  const slots = buildSlots(stepMinutes);

  const toMinutes = (value: string) => {
    const [h, m] = value.split(':').map((part) => Number.parseInt(part, 10));
    return h * 60 + m;
  };

  entries.forEach((entry) => {
    const start = toMinutes(entry.start);
    const end = toMinutes(entry.end);

    slots.forEach((slot) => {
      const slotStart = toMinutes(slot.start);
      const slotEnd = toMinutes(slot.end);
      if (slotEnd <= start || slotStart >= end) {
        return;
      }
      slot.storeId = entry.storeId;
    });
  });

  return slots;
};
