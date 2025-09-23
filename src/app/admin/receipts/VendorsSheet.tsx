import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import type { Vendor } from '@/features/receipts/types';

interface VendorsSheetProps {
  visible: boolean;
  vendors: Vendor[];
  loading?: boolean;
  selectedVendorId: string | null;
  onClose: () => void;
  onSelect: (vendor: Vendor | null) => void;
  onCreate: (name: string) => Promise<void>;
}

const VendorsSheet: React.FC<VendorsSheetProps> = ({
  visible,
  vendors,
  loading = false,
  selectedVendorId,
  onClose,
  onSelect,
  onCreate,
}) => {
  const vendorLabels = labels.receipts.vendors;
  const [newVendor, setNewVendor] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    const name = newVendor.trim();
    if (!name) {
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onCreate(name);
      setNewVendor('');
    } catch (err) {
      setError(err instanceof Error ? err.message : vendorLabels.error);
    } finally {
      setSaving(false);
    }
  }, [newVendor, onCreate, vendorLabels.error]);

  const renderItem = useCallback(
    ({ item }: { item: Vendor }) => {
      const isActive = selectedVendorId === item.id;
      return (
        <TouchableOpacity
          style={[styles.vendorItem, isActive && styles.vendorItemActive]}
          onPress={() => {
            onSelect(isActive ? null : item);
            onClose();
          }}
        >
          <Text style={[styles.vendorName, isActive && styles.vendorNameActive]}>{item.name}</Text>
        </TouchableOpacity>
      );
    },
    [selectedVendorId, onClose, onSelect],
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{vendorLabels.title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeLabel}>x</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.newVendorRow}>
            <TextInput
              style={styles.input}
              placeholder={vendorLabels.placeholder}
              placeholderTextColor="#94a3b8"
              value={newVendor}
              onChangeText={setNewVendor}
            />
            <TouchableOpacity style={styles.addButton} onPress={handleCreate} disabled={saving || !newVendor.trim()}>
              {saving ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.addButtonLabel}>{vendorLabels.add}</Text>}
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : (
            <FlatList
              data={vendors}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLabel: {
    color: '#f8fafc',
    fontSize: 18,
  },
  newVendorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#172554',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  vendorItem: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1f2937',
  },
  vendorItemActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.2)',
  },
  vendorName: {
    color: '#f8fafc',
    fontSize: 16,
  },
  vendorNameActive: {
    color: '#60a5fa',
  },
  listContent: {
    paddingBottom: 20,
  },
  error: {
    color: '#f87171',
  },
});

export default VendorsSheet;
