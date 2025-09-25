import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import labels from '@/i18n/ja.json';
import type { StoreMember } from '@/features/stores/api';

type StaffMemberDetailModalProps = {
  visible: boolean;
  member: StoreMember | null;
  onClose: () => void;
};

const StaffMemberDetailModal: React.FC<StaffMemberDetailModalProps> = ({ visible, member, onClose }) => {
  const adminLabels = (labels.admin ?? {}) as Record<string, any>;
  const detailLabels = (adminLabels.staffDetail ?? {}) as Record<string, any>;

  if (!visible || !member) {
    return null;
  }

  const nameLabel = detailLabels.nameLabel ?? 'Name';
  const emailLabel = detailLabels.emailLabel ?? 'Email';
  const roleLabel = detailLabels.roleLabel ?? 'Role';
  const wageLabel = detailLabels.wageLabel ?? 'Hourly wage';
  const wageUnit = detailLabels.wageUnit ?? 'JPY/hour';
  const wageUnset = detailLabels.wageUnset ?? '--';
  const storeLabel = detailLabels.storeLabel ?? 'Store ID';
  const userIdLabel = detailLabels.userIdLabel ?? 'User ID';
  const closeLabel = detailLabels.close ?? 'Close';
  const title = detailLabels.title ?? 'Member details';

  const displayName = member.displayName ?? member.email ?? member.userId;
  const email = member.email ?? '-';
  const hourlyWage =
    typeof member.hourlyWage === 'number' && !Number.isNaN(member.hourlyWage)
      ? `${member.hourlyWage.toLocaleString('ja-JP')} ${wageUnit}`
      : wageUnset;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.row}>
            <Text style={styles.label}>{nameLabel}</Text>
            <Text style={styles.value}>{displayName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{emailLabel}</Text>
            <Text style={styles.value}>{email}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{roleLabel}</Text>
            <Text style={styles.value}>{member.role}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{wageLabel}</Text>
            <Text style={styles.value}>{hourlyWage}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{storeLabel}</Text>
            <Text style={styles.value}>{member.storeId ?? '-'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{userIdLabel}</Text>
            <Text style={styles.value}>{member.userId}</Text>
          </View>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeLabel}>{closeLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 24,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    color: '#94a3b8',
    fontSize: 14,
    flex: 1,
  },
  value: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
    flex: 1.5,
    textAlign: 'right',
  },
  closeButton: {
    marginTop: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
});

export default StaffMemberDetailModal;
