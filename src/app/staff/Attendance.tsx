import React, { useCallback, useEffect, useMemo, useState } from 'react';


import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

import {
  clockIn,
  clockOut,
  subscribeToOpenAttendance,
  subscribeToTodayAttendances,
  toggleBreak,
} from '@/features/attendance/api';
import type { Attendance } from '@/features/attendance/types';
import { useAppSelector } from '@/store';

const formatTime = (value?: Date) => {
  if (!value) {
    return '--:--';
  }
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const getBreakLabel = (index: number, start: Date, end?: Date) => {
  const startLabel = formatTime(start);
  if (!end) {
    return `Break ${index + 1}: ${startLabel} - ...`;
  }
  return `Break ${index + 1}: ${startLabel} - ${formatTime(end)}`;
};

const AttendanceScreen: React.FC = () => {
  const storeId = useAppSelector((state) => state.store.selectedStoreId);
  const [todayAttendances, setTodayAttendances] = useState<Attendance[]>([]);
  const [openAttendance, setOpenAttendance] = useState<Attendance | null>(null);
  const [isProcessing, setIsProcessing] = useState<false | 'clockIn' | 'break' | 'clockOut'>(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) {
      setTodayAttendances([]);
      return;
    }

    setError(null);
    try {
      const unsubscribe = subscribeToTodayAttendances(storeId, (records) => {
        setTodayAttendances(records);
      });
      return () => unsubscribe();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load attendance history.';
      setError(message);
    }
  }, [storeId]);

  useEffect(() => {
    try {
      const unsubscribe = subscribeToOpenAttendance((attendance) => {
        setOpenAttendance(attendance);
      });
      return () => unsubscribe();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to observe active shift.';
      setError(message);
    }
  }, []);

  const isOnBreak = useMemo(() => {
    if (!openAttendance) {
      return false;
    }
    const lastBreak = openAttendance.breaks[openAttendance.breaks.length - 1];
    return Boolean(lastBreak && !lastBreak.end);
  }, [openAttendance]);

  const handleClockIn = useCallback(async () => {
    if (!storeId) {
      Alert.alert('No store selected', 'Please choose a store before clocking in.');
      return;
    }

    setIsProcessing('clockIn');
    setError(null);
    setInfo(null);
    try {
      await clockIn(storeId);
      setInfo('You are clocked in. Have a good shift!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clock in.';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [storeId]);

  const handleToggleBreak = useCallback(async () => {
    setIsProcessing('break');
    setError(null);
    setInfo(null);
    try {
      await toggleBreak();
      setInfo(isOnBreak ? 'Break ended.' : 'Break started.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update break.';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [isOnBreak]);

  const handleClockOut = useCallback(async () => {
    setIsProcessing('clockOut');
    setError(null);
    setInfo(null);
    try {
      await clockOut();
      setInfo('Shift closed. Goodbye!');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clock out.';
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const clockInDisabled = !storeId || Boolean(openAttendance) || isProcessing !== false;
  const breakDisabled = !openAttendance || isProcessing !== false;
  const clockOutDisabled = !openAttendance || isProcessing !== false;

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Shift controls</Text>
      <View style={styles.buttonRow}>
        <ActionButton
          label="Clock in"
          onPress={handleClockIn}
          disabled={clockInDisabled}
          loading={isProcessing === 'clockIn'}
        />
        <ActionButton
          label={isOnBreak ? 'End break' : 'Start break'}
          onPress={handleToggleBreak}
          disabled={breakDisabled}
          loading={isProcessing === 'break'}
          variant="secondary"
        />
        <ActionButton
          label="Clock out"
          onPress={handleClockOut}
          disabled={clockOutDisabled}
          loading={isProcessing === 'clockOut'}
          variant="danger"
        />
      </View>
      {info ? <Text style={styles.info}>{info}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.subheading}>Today</Text>
      {storeId ? null : (
        <Text style={styles.helper}>Select a store to begin tracking attendance.</Text>
      )}
      {storeId && todayAttendances.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.helper}>No attendance records for today yet.</Text>
        </View>
      ) : null}
      {storeId ? (
        <FlatList
          data={todayAttendances}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AttendanceCard attendance={item} />}
          ItemSeparatorComponent={Separator}
          ListFooterComponent={FooterSpacer}
        />
      ) : null}
    </View>
  );
};

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

const ActionButton: React.FC<ActionButtonProps> = ({ label, onPress, disabled, loading, variant }) => {
  const buttonStyles = [
    styles.button,
    variant === 'secondary' ? styles.buttonSecondary : undefined,
    variant === 'danger' ? styles.buttonDanger : undefined,
    disabled || loading ? styles.buttonDisabled : undefined,
  ].filter(Boolean) as ViewStyle[];

  return (
    <TouchableOpacity style={buttonStyles} onPress={onPress} disabled={disabled || loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </TouchableOpacity>
  );
};

const Separator = () => <View style={styles.separator} />;
const FooterSpacer = () => <View style={styles.footerSpacer} />;


type AttendanceCardProps = {
  attendance: Attendance;
};

const AttendanceCard: React.FC<AttendanceCardProps> = ({ attendance }) => {
  const { clockIn: start, clockOut: end, status, breaks } = attendance;
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {formatTime(start)} - {formatTime(end)}
        </Text>
        <Text style={styles.status}>{status.toUpperCase()}</Text>
      </View>
      {breaks.length ? (
        <View style={styles.breakList}>
          {breaks.map((item, index) => (
            <Text key={`${attendance.id}-break-${index}`} style={styles.breakItem}>
              {getBreakLabel(index, item.start, item.end)}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.breakPlaceholder}>No breaks recorded.</Text>
      )}
      <Text style={styles.timestamp}>Updated {formatTime(attendance.updatedAt)}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    gap: 12,
  },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
  },
  buttonSecondary: {
    backgroundColor: '#10b981',
  },
  buttonDanger: {
    backgroundColor: '#ef4444',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  info: {
    color: '#2563eb',
  },
  error: {
    color: '#dc2626',
  },
  subheading: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  helper: {
    color: '#475569',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  separator: {
    height: 16,
  },
  footerSpacer: {
    height: 32,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 3,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  status: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
  },
  breakList: {
    gap: 4,
  },
  breakItem: {
    color: '#475569',
    fontSize: 14,
  },
  breakPlaceholder: {
    color: '#94a3b8',
    fontSize: 14,
  },
  timestamp: {
    fontSize: 12,
    color: '#94a3b8',
  },
});

export default AttendanceScreen;

