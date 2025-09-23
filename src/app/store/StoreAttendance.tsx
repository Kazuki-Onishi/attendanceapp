import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import {
  getLatestAttendanceForUser,
  getOpenAttendanceForUser,
  kioskClockIn,
  kioskClockOut,
  kioskToggleBreak,
} from '@/features/attendance/api';
import type { Attendance } from '@/features/attendance/types';
import { listStoreMembers, type StoreMember } from '@/features/stores/api';
import type { StoreStackParamList } from '@/navigation/StoreStack';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearKioskSession } from '@/store/slices/storeAuthSlice';

const formatTime = (value?: Date) => {
  if (!value) {
    return '--:--';
  }
  return value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const roleLabel = (role: StoreMember['role']) => {
  switch (role) {
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Manager';
    case 'kiosk':
      return 'Kiosk';
    default:
      return 'Staff';
  }
};

const StoreAttendance: React.FC = () => {
  const { storeId, storeName } = useAppSelector((state) => state.storeAuth);
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<StoreStackParamList>>();

  const [members, setMembers] = useState<StoreMember[]>([]);
  const [search, setSearch] = useState('');
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  const [selectedMember, setSelectedMember] = useState<StoreMember | null>(null);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<false | 'clockIn' | 'break' | 'clockOut'>(false);
  const [openAttendance, setOpenAttendance] = useState<Attendance | null>(null);
  const [latestAttendance, setLatestAttendance] = useState<Attendance | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);

  useEffect(() => {
    if (!storeId) {
      navigation.replace('LoginStore');
    }
  }, [navigation, storeId]);

  const loadMembers = useCallback(async () => {
    if (!storeId) {
      return;
    }
    setLoadingMembers(true);
    setMembersError(null);
    try {
      const list = await listStoreMembers(storeId);
      setMembers(list);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load store members.';
      setMembersError(message);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [storeId]);

  useFocusEffect(
    useCallback(() => {
      loadMembers();
      return () => undefined;
    }, [loadMembers]),
  );

  useEffect(() => {
    if (!selectedMember) {
      return;
    }
    const stillExists = members.some((member) => member.userId === selectedMember.userId);
    if (!stillExists) {
      setSelectedMember(null);
    }
  }, [members, selectedMember]);

  const refreshAttendance = useCallback(
    async (member: StoreMember | null) => {
      if (!member || !storeId) {
        setOpenAttendance(null);
        setLatestAttendance(null);
        return;
      }

      setLoadingAttendance(true);
      setAttendanceError(null);
      try {
        const [open, latest] = await Promise.all([
          getOpenAttendanceForUser(member.userId),
          getLatestAttendanceForUser(member.userId, storeId),
        ]);
        setOpenAttendance(open);
        setLatestAttendance(latest);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load attendance details.';
        setAttendanceError(message);
        setOpenAttendance(null);
        setLatestAttendance(null);
      } finally {
        setLoadingAttendance(false);
      }
    },
    [storeId],
  );

  useEffect(() => {
    refreshAttendance(selectedMember);
  }, [refreshAttendance, selectedMember]);

  const filteredMembers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return members;
    }
    return members.filter((member) => {
      const nameMatches = member.displayName.toLowerCase().includes(keyword);
      const emailMatches = (member.email ?? '').toLowerCase().includes(keyword);
      return nameMatches || emailMatches;
    });
  }, [members, search]);

  const handleSelectMember = useCallback((member: StoreMember) => {
    setSelectedMember(member);
    setInfo(null);
    setAttendanceError(null);
  }, []);

  const handleClockIn = useCallback(async () => {
    if (!selectedMember || !storeId) {
      return;
    }
    setIsProcessing('clockIn');
    setAttendanceError(null);
    setInfo(null);
    try {
      await kioskClockIn(selectedMember.userId, storeId);
      setInfo(`${selectedMember.displayName} clocked in.`);
      await refreshAttendance(selectedMember);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clock in.';
      setAttendanceError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [refreshAttendance, selectedMember, storeId]);

  const handleToggleBreak = useCallback(async () => {
    if (!selectedMember || !storeId) {
      return;
    }
    setIsProcessing('break');
    setAttendanceError(null);
    setInfo(null);
    try {
      await kioskToggleBreak(selectedMember.userId, storeId);
      setInfo('Break status updated.');
      await refreshAttendance(selectedMember);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to toggle break.';
      setAttendanceError(message);
    } finally {
      setIsProcessing(false);
    }
  }, [refreshAttendance, selectedMember, storeId]);

  const handleClockOut = useCallback(() => {
    if (!selectedMember || !storeId) {
      return;
    }
    Alert.alert('Clock out', `Clock out ${selectedMember.displayName}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clock out',
        style: 'destructive',
        onPress: async () => {
          setIsProcessing('clockOut');
          setAttendanceError(null);
          setInfo(null);
          try {
            await kioskClockOut(selectedMember.userId, storeId);
            setInfo(`${selectedMember.displayName} clocked out.`);
            await refreshAttendance(selectedMember);
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to clock out.';
            setAttendanceError(message);
          } finally {
            setIsProcessing(false);
          }
        },
      },
    ]);
  }, [refreshAttendance, selectedMember, storeId]);

  const handleCloseSession = useCallback(() => {
    dispatch(clearKioskSession());
    setSelectedMember(null);
    setSearch('');
  }, [dispatch]);

  const isOnBreak = useMemo(() => {
    if (!openAttendance) {
      return false;
    }
    const lastBreak = openAttendance.breaks[openAttendance.breaks.length - 1];
    return Boolean(lastBreak && !lastBreak.end);
  }, [openAttendance]);

  const clockInDisabled =
    !selectedMember || !storeId || Boolean(openAttendance) || isProcessing !== false;
  const breakDisabled = !selectedMember || !openAttendance || isProcessing !== false;
  const clockOutDisabled = !selectedMember || !openAttendance || isProcessing !== false;

  const renderMember = useCallback(
    ({ item }: { item: StoreMember }) => {
      const isActive = selectedMember?.userId === item.userId;
      return (
        <TouchableOpacity
          style={[styles.memberCard, isActive && styles.memberCardActive]}
          onPress={() => handleSelectMember(item)}
        >
          <Text style={styles.memberName}>{item.displayName}</Text>
          <Text style={styles.memberRole}>{roleLabel(item.role)}</Text>
          {item.email ? <Text style={styles.memberEmail}>{item.email}</Text> : null}
        </TouchableOpacity>
      );
    },
    [handleSelectMember, selectedMember?.userId],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Kiosk mode</Text>
          {storeName ? <Text style={styles.headerSubtitle}>{storeName}</Text> : null}
        </View>
        <TouchableOpacity style={styles.exitButton} onPress={handleCloseSession}>
          <Text style={styles.exitLabel}>End session</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchSection}>
        <TextInput
          placeholder="Search staff"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        {loadingMembers ? <ActivityIndicator size="small" color="#2563eb" /> : null}
      </View>
      {membersError ? <Text style={styles.error}>{membersError}</Text> : null}

      <FlatList
        data={filteredMembers}
        keyExtractor={(item) => item.userId}
        renderItem={renderMember}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.memberList}
      />

      <View style={styles.controlsCard}>
        <Text style={styles.controlsTitle}>
          {selectedMember ? selectedMember.displayName : 'Select a staff member'}
        </Text>
        <View style={styles.controlsRow}>
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
        {attendanceError ? <Text style={styles.error}>{attendanceError}</Text> : null}
      </View>

      <View style={styles.latestCard}>
        <Text style={styles.latestTitle}>Latest entry</Text>
        {loadingAttendance ? (
          <ActivityIndicator color="#2563eb" />
        ) : latestAttendance && selectedMember ? (
          <View>
            <Text style={styles.latestName}>{selectedMember.displayName}</Text>
            <Text style={styles.latestMeta}>
              In {formatTime(latestAttendance.clockIn)} | Out {formatTime(latestAttendance.clockOut)}
            </Text>
            <Text style={styles.latestStatus}>Status: {latestAttendance.status.toUpperCase()}</Text>
          </View>
        ) : (
          <Text style={styles.helper}>No attendance recorded yet.</Text>
        )}
      </View>
    </View>
  );
};

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  onPress,
  disabled,
  loading,
  variant,
}) => {
  const buttonStyles: ViewStyle[] = [
    styles.actionButton,
    variant === 'secondary' ? styles.actionButtonSecondary : undefined,
    variant === 'danger' ? styles.actionButtonDanger : undefined,
    disabled || loading ? styles.actionButtonDisabled : undefined,
  ].filter(Boolean) as ViewStyle[];

  return (
    <TouchableOpacity style={buttonStyles} onPress={onPress} disabled={disabled || loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionButtonLabel}>{label}</Text>}
    </TouchableOpacity>
  );
};

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: '#cbd5f5',
    marginTop: 4,
  },
  exitButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f8fafc',
  },
  exitLabel: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  searchSection: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  memberList: {
    paddingBottom: 16,
  },
  memberCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 4,
  },
  memberCardActive: {
    borderWidth: 2,
    borderColor: '#38bdf8',
  },
  memberName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  memberRole: {
    color: '#94a3b8',
  },
  memberEmail: {
    color: '#94a3b8',
    fontSize: 12,
  },
  separator: {
    height: 12,
  },
  controlsCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  controlsTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22d3ee',
  },
  actionButtonSecondary: {
    backgroundColor: '#10b981',
  },
  actionButtonDanger: {
    backgroundColor: '#ef4444',
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  latestCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  latestTitle: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 16,
  },
  latestName: {
    color: '#f8fafc',
    fontWeight: '600',
    fontSize: 18,
  },
  latestMeta: {
    color: '#cbd5f5',
  },
  latestStatus: {
    color: '#38bdf8',
    fontWeight: '600',
  },
  info: {
    color: '#38bdf8',
  },
  error: {
    color: '#f87171',
  },
  helper: {
    color: '#94a3b8',
  },
});

export default StoreAttendance;
