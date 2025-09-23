import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type StorePillProps = {
  label: string;
  color?: string | null;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

const StorePill: React.FC<StorePillProps> = ({ label, color, selected = false, onPress, disabled }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.wrapper, selected && styles.wrapperSelected, disabled && styles.wrapperDisabled]}
    >
      <View style={[styles.dot, color ? { backgroundColor: color } : styles.dotFallback]} />
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#1f2945',
  },
  wrapperSelected: {
    backgroundColor: '#2563eb',
  },
  wrapperDisabled: {
    opacity: 0.6,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#94a3b8',
  },
  dotFallback: {
    backgroundColor: '#334155',
  },
  label: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  labelSelected: {
    color: '#fff',
  },
});

export default StorePill;
