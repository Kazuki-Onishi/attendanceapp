import React from 'react';
import { Keyboard, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type TimeRangeInputProps = {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: (value: string) => void | Promise<void>;
  onApplyTemplate?: (value: string) => void | Promise<void>;
  placeholder?: string;
  disabled?: boolean;
  isSaving?: boolean;
};

const TimeRangeInput: React.FC<TimeRangeInputProps> = ({
  value,
  onChangeText,
  onSubmit,
  onApplyTemplate,
  placeholder,
  disabled = false,
  isSaving = false,
}) => {
  const handleSubmit = () => {
    if (disabled || !value.trim()) {
      return;
    }
    Keyboard.dismiss();
    onSubmit(value.trim());
  };

  const handleApplyTemplate = () => {
    if (!onApplyTemplate || disabled) {
      return;
    }
    onApplyTemplate(value.trim());
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, disabled && styles.inputDisabled]}
        placeholder={placeholder ?? '10-18 / 10:00-18:00'}
        placeholderTextColor="#475569"
        value={value}
        editable={!disabled}
        onChangeText={onChangeText}
        onSubmitEditing={handleSubmit}
        keyboardType="numbers-and-punctuation"
        returnKeyType="done"
      />
      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, (disabled || !value.trim()) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={disabled || !value.trim() || isSaving}
        >
          <Text style={styles.primaryLabel}>{isSaving ? 'Saving…' : 'Add'}</Text>
        </TouchableOpacity>
        {onApplyTemplate ? (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton, disabled && styles.buttonDisabled]}
            onPress={handleApplyTemplate}
            disabled={disabled}
          >
            <Text style={styles.secondaryLabel}>Apply template</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#e2e8f0',
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
  },
  primaryLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#1f2945',
  },
  secondaryLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
});

export default TimeRangeInput;
