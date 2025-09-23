import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShiftEntry } from '@/features/shifts/lib/mergeEntries';

type StoreMeta = {
  id: string;
  color?: string | null;
};

type DayCellProps = {
  date: string; // YYYY-MM-DD
  isFocused: boolean;
  onPress: (date: string) => void;
  disabled?: boolean;
  entries?: ShiftEntry[];
  stores?: Record<string, StoreMeta>;
  isToday?: boolean;
  pending?: boolean;
};

const DayCell: React.FC<DayCellProps> = ({
  date,
  isFocused,
  onPress,
  disabled = false,
  entries = [],
  stores = {},
  isToday = false,
  pending = false,
}) => {
  const dayNumber = Number.parseInt(date.split('-')[2], 10);
  const uniqueStoreIds = Array.from(new Set(entries.map((entry) => entry.storeId)));

  return (
    <Pressable
      onPress={() => onPress(date)}
      disabled={disabled}
      style={({ pressed }) => [
        styles.day,
        isFocused && styles.dayFocused,
        isToday && styles.dayToday,
        disabled && styles.dayDisabled,
        pressed && !disabled && styles.dayPressed,
      ]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.dayLabel, isFocused && styles.dayLabelFocused]}>{dayNumber}</Text>
        {pending ? <View style={styles.pendingDot} /> : null}
      </View>
      <View style={styles.dotsRow}>
        {uniqueStoreIds.slice(0, 4).map((storeId) => {
          const store = stores[storeId];
          return (
            <View
              key={storeId}
              style={[styles.dot, { backgroundColor: store?.color ?? '#38bdf8' }]}
            />
          );
        })}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  day: {
    width: '14.28%',
    aspectRatio: 1,
    padding: 6,
    borderRadius: 12,
    justifyContent: 'space-between',
  },
  dayFocused: {
    backgroundColor: '#1d4ed8',
  },
  dayToday: {
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  dayDisabled: {
    opacity: 0.4,
  },
  dayPressed: {
    opacity: 0.8,
  },
  dayLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
    fontSize: 16,
  },
  dayLabelFocused: {
    color: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#facc15',
  },
});

export default DayCell;
