import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';

import labels from '@/i18n/ja.json';
import { firestore, storage } from '@/lib/firebase';
import { mapReceipt, mapVendor, saveVendor } from '@/features/receipts/api';
import type { ReceiptMethod, ReceiptStatus, Vendor } from '@/features/receipts/types';
import VendorsSheet from '@/app/admin/receipts/VendorsSheet';
import type { ReceiptsStackParamList } from '@/navigation/admin/ReceiptsStack';
import { useAppSelector } from '@/store';

type ReceiptEditRoute = RouteProp<ReceiptsStackParamList, 'ReceiptEdit'>;

type ImageState = {
  id: string;
  path: string | null;
  uri: string;
  width?: number | null;
  height?: number | null;
  isLocal: boolean;
};

type FormState = {
  paidAt: string;
  amount: string;
  currency: string;
  method: ReceiptMethod;
  vendorId: string | null;
  vendorName: string;
  notes: string;
  status: ReceiptStatus;
};

const METHOD_OPTIONS: ReceiptMethod[] = ['cash', 'card', 'qr', 'transfer'];

const isValidDateKey = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const createLocalImageState = (uri: string, width?: number | null, height?: number | null): ImageState => {
  const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  return { id, path: null, uri, width: width ?? null, height: height ?? null, isLocal: true };
};

const ReceiptEditScreen: React.FC = () => {
  const route = useRoute<ReceiptEditRoute>();
  const navigation = useNavigation();

  const { receiptId, storeId } = route.params;
  const auth = useAppSelector((state) => state.auth);
  const userId = auth.user?.uid ?? null;

  const receiptLabels = labels.receipts;
  const editLabels = receiptLabels.edit;
  const methodLabels = receiptLabels.methods;
  const statusLabels = receiptLabels.status;

  const [form, setForm] = useState<FormState>(() => ({
    paidAt: formatDateKey(new Date()),
    amount: '',
    currency: 'JPY',
    method: 'cash',
    vendorId: null,
    vendorName: '',
    notes: '',
    status: 'draft',
  }));
  const [images, setImages] = useState<ImageState[]>([]);
  const [deletedImagePaths, setDeletedImagePaths] = useState<string[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState<boolean>(false);
  const [vendorsVisible, setVendorsVisible] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentExists, setDocumentExists] = useState<boolean>(false);
  const [formDirty, setFormDirty] = useState<boolean>(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: documentExists ? editLabels.titleEdit : editLabels.titleNew,
    });
  }, [navigation, documentExists, editLabels.titleEdit, editLabels.titleNew]);

  useEffect(() => {
    if (!storeId) {
      return () => undefined;
    }
    setVendorsLoading(true);
    const unsubscribe = onSnapshot(
      query(collection(firestore(), 'vendors'), where('storeId', '==', storeId), orderBy('name', 'asc')),
      (snapshot) => {
        setVendorsLoading(false);
        const list = snapshot.docs
          .map((docSnapshot) => mapVendor(docSnapshot))
          .filter((item): item is Vendor => Boolean(item));
        setVendors(list);
      },
      () => {
        setVendorsLoading(false);
      },
    );
    return () => unsubscribe();
  }, [storeId]);

  useEffect(() => {
    const docRef = doc(firestore(), 'receipts', receiptId);
    const unsubscribe = onSnapshot(
      docRef,
      async (snapshot) => {
        setLoading(false);
        const mapped = mapReceipt(snapshot);
        if (!mapped) {
          setDocumentExists(false);
          return;
        }
        setDocumentExists(true);
        if (!formDirty) {
          setForm({
            paidAt: mapped.paidAt ?? formatDateKey(new Date()),
            amount: mapped.amount ? String(mapped.amount) : '',
            currency: mapped.currency ?? 'JPY',
            method: mapped.method ?? 'cash',
            vendorId: mapped.vendorId ?? null,
            vendorName: mapped.vendorName ?? '',
            notes: mapped.notes ?? '',
            status: mapped.status ?? 'draft',
          });
        }
        const imageStates: ImageState[] = await Promise.all(
          (mapped.images ?? []).map(async (image) => {
            try {
              const download = await getDownloadURL(ref(storage(), image.path));
              return {
                id: `${receiptId}_${image.path}`,
                path: image.path,
                uri: download,
                width: image.width ?? null,
                height: image.height ?? null,
                isLocal: false,
              } as ImageState;
            } catch (err) {
              return {
                id: `${receiptId}_${image.path}`,
                path: image.path,
                uri: '',
                width: image.width ?? null,
                height: image.height ?? null,
                isLocal: false,
              } as ImageState;
            }
          })
        );
        if (!formDirty) {
          setImages(imageStates);
        }
      },
      (err) => {
        setLoading(false);
        setError(err instanceof Error ? err.message : editLabels.error);
      },
    );
    return () => unsubscribe();
  }, [receiptId, editLabels.error, formDirty]);

  const isLocked = form.status === 'locked';

  const markDirty = useCallback(() => {
    setFormDirty(true);
    setMessage(null);
    setError(null);
  }, []);

  const handleFieldChange = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    markDirty();
  }, [markDirty]);

  const pickImage = useCallback(async () => {
    if (isLocked) {
      return;
    }

    const launchPicker = async (mode: 'camera' | 'library') => {
      const permissionRequest =
        mode === 'camera'
          ? ImagePicker.requestCameraPermissionsAsync
          : ImagePicker.requestMediaLibraryPermissionsAsync;
      const { status } = await permissionRequest();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to the camera or photo library.');
        return;
      }

      const launcher =
        mode === 'camera'
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync;
      const result = await launcher({ allowsEditing: false, quality: 0.8 });
      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      const localImage = createLocalImageState(asset.uri, asset.width, asset.height);
      setImages((prev) => [...prev, localImage]);
      markDirty();
    };

    Alert.alert(editLabels.images, undefined, [
      { text: editLabels.pickOption.camera, onPress: () => launchPicker('camera') },
      { text: editLabels.pickOption.library, onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [editLabels.images, editLabels.pickOption.camera, editLabels.pickOption.library, isLocked, markDirty]);

  const removeImage = useCallback(
    (image: ImageState) => {
      if (isLocked) {
        return;
      }
      setImages((prev) => prev.filter((item) => item.id !== image.id));
      if (!image.isLocal && image.path) {
        setDeletedImagePaths((prev) => [...prev, image.path!]);
      }
      markDirty();
    },
    [isLocked, markDirty],
  );

  const uploadImage = useCallback(async (receiptIdentifier: string, image: ImageState) => {
    if (!image.isLocal || !image.uri) {
      return { path: image.path!, width: image.width ?? null, height: image.height ?? null };
    }
    const response = await fetch(image.uri);
    const blob = await response.blob();
    const extension = blob.type?.split('/')?.[1] ?? 'jpg';
    const filename = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
    const storagePath = `receipts/${receiptIdentifier}/${filename}`;
    const storageRef = ref(storage(), storagePath);
    await uploadBytes(storageRef, blob);
    return { path: storagePath, width: image.width ?? null, height: image.height ?? null };
  }, []);

  const deleteRemovedImages = useCallback(async (paths: string[]) => {
    await Promise.all(
      paths.map(async (pathValue) => {
        try {
          await deleteObject(ref(storage(), pathValue));
        } catch (err) {
          // ignore errors for missing files
        }
      }),
    );
  }, []);

  const saveReceipt = useCallback(
    async (nextStatus: ReceiptStatus) => {
      if (!storeId) {
        setError('Store context is missing.');
        return;
      }
      if (!userId) {
        setError('User context is missing.');
        return;
      }

      if (!form.paidAt || !isValidDateKey(form.paidAt)) {
        setError('Enter the date in YYYY-MM-DD format.');
        return;
      }

      const normalizedAmount = form.amount.replace(/[,\s]/g, '');
      const amountValue = Number(normalizedAmount);
      if (!Number.isFinite(amountValue) || amountValue < 0) {
        setError('Enter the amount using digits only.');
        return;
      }

      try {
        setSaving(true);
        setMessage(null);
        setError(null);

        const imagesPayload: Array<{ path: string; w?: number | null; h?: number | null }> = [];
        const normalizedImages: ImageState[] = [];
        for (const image of images) {
          const uploaded = await uploadImage(receiptId, image);
          imagesPayload.push({ path: uploaded.path, w: uploaded.width ?? null, h: uploaded.height ?? null });
          normalizedImages.push({ ...image, path: uploaded.path, isLocal: false });
        }

        const docRef = doc(firestore(), 'receipts', receiptId);
        const payload: Record<string, unknown> = {
          storeId,
          paidAt: form.paidAt,
          amount: amountValue,
          currency: form.currency,
          method: form.method,
          vendorId: form.vendorId ?? null,
          vendorName: form.vendorName.trim() || null,
          notes: form.notes.trim() || null,
          status: nextStatus,
          images: imagesPayload,
          updatedAt: serverTimestamp(),
        };

        if (!documentExists) {
          payload.createdAt = serverTimestamp();
          payload.createdBy = userId;
        }

        await setDoc(docRef, payload, { merge: true });
        if (deletedImagePaths.length) {
          await deleteRemovedImages(deletedImagePaths);
          setDeletedImagePaths([]);
        }

        setImages(normalizedImages);
        setForm((prev) => ({ ...prev, status: nextStatus }));
        setFormDirty(false);
        setMessage(editLabels.saved);
      } catch (err) {
        setError(err instanceof Error ? err.message : editLabels.error);
      } finally {
        setSaving(false);
      }
    },
    [storeId, userId, form, images, uploadImage, receiptId, documentExists, deletedImagePaths, deleteRemovedImages, editLabels.saved, editLabels.error],
  );

  const handleSaveDraft = useCallback(() => {
    saveReceipt('draft');
  }, [saveReceipt]);

  const handleLock = useCallback(() => {
    saveReceipt('locked');
  }, [saveReceipt]);

  const handleUnlock = useCallback(() => {
    saveReceipt('draft');
  }, [saveReceipt]);

  const renderImage = useCallback(
    ({ item }: { item: ImageState }) => (
      <View style={styles.imageCard}>
        {item.uri ? (
          <Image source={{ uri: item.uri }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.helper}>Preview unavailable</Text>
          </View>
        )}
        {!isLocked ? (
          <TouchableOpacity style={styles.deleteBadge} onPress={() => removeImage(item)}>
            <Text style={styles.deleteBadgeLabel}>x</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ),
    [isLocked, removeImage],
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  const statusLabel = statusLabels[form.status] ?? form.status;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {isLocked ? <Text style={styles.warning}>{editLabels.lockedWarning}</Text> : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{editLabels.paidAt}</Text>
          <TextInput
            value={form.paidAt}
            onChangeText={(value) => handleFieldChange('paidAt', value)}
            style={[styles.input, isLocked && styles.inputDisabled]}
            editable={!isLocked}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#64748b"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{editLabels.amount}</Text>
          <TextInput
            value={form.amount}
            onChangeText={(value) => handleFieldChange('amount', value)}
            style={[styles.input, isLocked && styles.inputDisabled]}
            editable={!isLocked}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor="#64748b"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{editLabels.method}</Text>
          <View style={styles.methodRow}>
            {METHOD_OPTIONS.map((option) => {
              const active = form.method === option;
              return (
                <TouchableOpacity
                  key={option}
                  style={[styles.methodButton, active && styles.methodButtonActive, isLocked && styles.inputDisabled]}
                  onPress={() => !isLocked && handleFieldChange('method', option)}
                  disabled={isLocked}
                >
                  <Text style={[styles.methodLabel, active && styles.methodLabelActive]}>
                    {methodLabels[option] ?? option}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{editLabels.vendor}</Text>
          <View style={styles.vendorRow}>
            <TextInput
              value={form.vendorName}
              onChangeText={(value) => handleFieldChange('vendorName', value)}
              style={[styles.input, styles.vendorInput, isLocked && styles.inputDisabled]}
              editable={!isLocked}
              placeholder={receiptLabels.vendors.placeholder}
              placeholderTextColor="#64748b"
            />
            <TouchableOpacity
              style={[styles.secondaryButton, isLocked && styles.secondaryButtonDisabled]}
              onPress={() => !isLocked && setVendorsVisible(true)}
              disabled={isLocked}
            >
              <Text style={styles.secondaryButtonLabel}>{receiptLabels.vendors.title}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{editLabels.notes}</Text>
          <TextInput
            value={form.notes}
            onChangeText={(value) => handleFieldChange('notes', value)}
            style={[styles.input, styles.notesInput, isLocked && styles.inputDisabled]}
            editable={!isLocked}
            multiline
            placeholder={editLabels.notes}
            placeholderTextColor="#64748b"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{`${editLabels.images} (${images.length})`}</Text>
          <FlatList
            data={images}
            keyExtractor={(item) => item.id}
            renderItem={renderImage}
            horizontal
            style={styles.imageList}
            contentContainerStyle={styles.imageListContent}
          />
          {!isLocked ? (
            <TouchableOpacity style={styles.secondaryButton} onPress={pickImage}>
              <Text style={styles.secondaryButtonLabel}>{editLabels.addImage}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{editLabels.status}</Text>
          <Text style={styles.statusValue}>{statusLabel}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.secondaryButton, (saving || isLocked) && styles.secondaryButtonDisabled]}
          onPress={handleSaveDraft}
          disabled={saving || isLocked}
        >
          {saving ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.secondaryButtonLabel}>{editLabels.save}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={isLocked ? handleUnlock : handleLock}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonLabel}>{isLocked ? editLabels.unlock : editLabels.lock}</Text>}
        </TouchableOpacity>
      </View>

      <VendorsSheet
        visible={vendorsVisible}
        vendors={vendors}
        loading={vendorsLoading}
        selectedVendorId={form.vendorId}
        onClose={() => setVendorsVisible(false)}
        onSelect={(vendor) => {
          handleFieldChange('vendorId', vendor?.id ?? null);
          handleFieldChange('vendorName', vendor?.name ?? '');
          setVendorsVisible(false);
        }}
        onCreate={async (name) => {
          if (!storeId) {
            return;
          }
          const newVendorId = doc(collection(firestore(), 'vendors')).id;
          await saveVendor(storeId, newVendorId, name, null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  contentContainer: {
    padding: 20,
    gap: 16,
    paddingBottom: 100,
  },
  fieldGroup: {
    gap: 8,
  },
  label: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#172554',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.6,
  },
  vendorRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  vendorInput: {
    flex: 1,
  },
  notesInput: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  methodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1d4ed8',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  methodButtonActive: {
    backgroundColor: '#2563eb',
  },
  methodLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  methodLabelActive: {
    color: '#fff',
  },
  imageList: {
    maxHeight: 140,
  },
  imageListContent: {
    gap: 12,
  },
  imageCard: {
    width: 120,
    height: 120,
    backgroundColor: '#111c32',
    borderRadius: 12,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 999,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBadgeLabel: {
    color: '#f87171',
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#0f172a',
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonDisabled: {
    opacity: 0.6,
  },
  secondaryButtonLabel: {
    color: '#0f172a',
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  error: {
    color: '#f87171',
  },
  success: {
    color: '#34d399',
  },
  warning: {
    color: '#facc15',
  },
  helper: {
    color: '#94a3b8',
    fontSize: 12,
  },
  statusValue: {
    color: '#38bdf8',
    fontWeight: '600',
  },
});

export default ReceiptEditScreen;
