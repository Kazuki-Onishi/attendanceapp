import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import labels from '@/i18n/ja.json';
import { createStoreWithJoinSecret, getStore } from '@/features/stores/api';

const DEBOUNCE_MS = 400;
const generateStoreId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.random() * chars.length);
    result += chars[index];
  }
  return result;
};

interface CreateStoreModalProps {
  visible: boolean;
  onClose: () => void;
  actorUserId: string | null;
  onCreated?: (storeId: string) => void;
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'exists'; storeName: string }
  | { status: 'error'; message: string };

const CreateStoreModal: React.FC<CreateStoreModalProps> = ({ visible, onClose, actorUserId, onCreated }) => {
  const staffLabels = useMemo(() => (labels.staff ?? {}) as Record<string, any>, []);
  const settingsLabels = useMemo(() => staffLabels.settings ?? {}, [staffLabels]);
  const creationLabels = useMemo(() => settingsLabels.storeCreation ?? {}, [settingsLabels]);

  const [storeId, setStoreId] = useState('');
  const [nameOfficial, setNameOfficial] = useState('');
  const [nameShort, setNameShort] = useState('');
  const [timezone, setTimezone] = useState('Asia/Tokyo');
  const [storePassword, setStorePassword] = useState('');
  const [storePasswordConfirm, setStorePasswordConfirm] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinCodeConfirm, setJoinCodeConfirm] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [previewState, setPreviewState] = useState<PreviewState>({ status: 'idle' });
  const [lastCreatedStoreId, setLastCreatedStoreId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setNameOfficial('');
    setNameShort('');
    setTimezone('Asia/Tokyo');
    setStorePassword('');
    setStorePasswordConfirm('');
    setJoinCode('');
    setJoinCodeConfirm('');
    setFormError(null);
    setSubmitState('idle');
    setPreviewState({ status: 'idle' });
    setLastCreatedStoreId(null);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const newId = generateStoreId();
    setStoreId(newId);
    resetForm();
  }, [resetForm, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const trimmed = storeId.trim();
    if (!trimmed) {
      setPreviewState({ status: 'idle' });
      return;
    }

    let active = true;
    setPreviewState({ status: 'checking' });
    const handle = setTimeout(() => {
      getStore(trimmed)
        .then((store) => {
          if (!active) {
            return;
          }
          if (store) {
            const name = store.nameOfficial ?? trimmed;
            setPreviewState({ status: 'exists', storeName: name });
          } else {
            setPreviewState({ status: 'available' });
          }
        })
        .catch((error: unknown) => {
          if (!active) {
            return;
          }
          const message =
            error instanceof Error
              ? error.message
              : creationLabels.checkError ?? 'Failed to check the store code.';
          setPreviewState({ status: 'error', message });
        });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [storeId, visible, creationLabels.checkError]);

  const passwordsMatch = useMemo(
    () => storePassword.trim() === storePasswordConfirm.trim() && storePassword.trim().length > 0,
    [storePassword, storePasswordConfirm],
  );

  const joinCodesMatch = useMemo(
    () => joinCode.trim() === joinCodeConfirm.trim(),
    [joinCode, joinCodeConfirm],
  );

  const allowSubmit = useMemo(() => {
    return (
      submitState !== 'submitting' &&
      Boolean(storeId.trim()) &&
      Boolean(nameOfficial.trim()) &&
      Boolean(timezone.trim()) &&
      passwordsMatch &&
      (joinCode.trim().length === 0 || joinCodesMatch) &&
      (previewState.status === 'available' || previewState.status === 'idle')
    );
  }, [joinCodesMatch, joinCode, nameOfficial, passwordsMatch, previewState.status, storeId, submitState, timezone]);

  const handleRegenerateStoreId = useCallback(() => {
    const newId = generateStoreId();
    setStoreId(newId);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedId = storeId.trim();
    const trimmedName = nameOfficial.trim();
    const trimmedTimezone = timezone.trim();
    const trimmedPassword = storePassword.trim();
    const trimmedJoin = joinCode.trim();
    const trimmedJoinConfirm = joinCodeConfirm.trim();

    if (!trimmedId) {
      setFormError(creationLabels.storeIdRequired ?? 'Enter a store code.');
      return;
    }
    if (!trimmedName) {
      setFormError(creationLabels.nameOfficialRequired ?? 'Enter the official store name.');
      return;
    }
    if (!trimmedTimezone) {
      setFormError(creationLabels.timezoneRequired ?? 'Enter the store timezone.');
      return;
    }
    if (!trimmedPassword) {
      setFormError(creationLabels.storePasswordRequired ?? 'Enter the store password.');
      return;
    }
    if (trimmedPassword !== storePasswordConfirm.trim()) {
      setFormError(creationLabels.storePasswordMismatch ?? 'Store passwords do not match.');
      return;
    }
    if (trimmedJoin && trimmedJoin !== trimmedJoinConfirm) {
      setFormError(creationLabels.joinCodeMismatch ?? 'Authentication codes do not match.');
      return;
    }

    try {
      setSubmitState('submitting');
      setFormError(null);
      await createStoreWithJoinSecret({
        storeId: trimmedId,
        nameOfficial: trimmedName,
        nameShort: nameShort.trim() || null,
        timezone: trimmedTimezone,
        joinCode: trimmedJoin || null,
        loginPassword: trimmedPassword,
        createdBy: actorUserId ?? null,
      });
      setSubmitState('success');
      onCreated?.(trimmedId);
      setLastCreatedStoreId(trimmedId);
      setNameOfficial('');
      setNameShort('');
      setTimezone('Asia/Tokyo');
      setStorePassword('');
      setStorePasswordConfirm('');
      setJoinCode('');
      setJoinCodeConfirm('');
      setPreviewState({ status: 'idle' });
      setStoreId(generateStoreId());
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : creationLabels.submitError ?? 'Failed to create the store.';
      setFormError(message);
      setSubmitState('idle');
    }
  }, [
    actorUserId,
    creationLabels,
    joinCode,
    joinCodeConfirm,
    nameOfficial,
    nameShort,
    storeId,
    storePassword,
    storePasswordConfirm,
    timezone,
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          style={styles.sheetContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.title}>{creationLabels.title ?? 'Create a new store'}</Text>
            <Text style={styles.description}>
              {creationLabels.description ??
                'Define the store details and share the generated codes with staff members and managers.'}
            </Text>

            <View style={styles.formGroup}>
              <View style={styles.storeIdHeader}>
                <Text style={styles.label}>{creationLabels.storeIdLabel ?? 'Store code'}</Text>
                <TouchableOpacity style={styles.regenerateButton} onPress={handleRegenerateStoreId}>
                  <Text style={styles.regenerateLabel}>
                    {creationLabels.regenerateLabel ?? 'Regenerate'}
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput
                value={storeId}
                editable={false}
                selectTextOnFocus
                placeholder={creationLabels.storeIdPlaceholder ?? 'e.g. 123456'}
                placeholderTextColor="#64748b"
                style={[styles.textInput, styles.readOnlyInput]}
              />
              {previewState.status === 'checking' ? (
                <View style={styles.previewRow}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.previewText}>{creationLabels.codeChecking ?? 'Checking store code...'}</Text>
                </View>
              ) : null}
              {previewState.status === 'available' ? (
                <Text style={styles.previewResolved}>
                  {creationLabels.codeAvailable ?? 'Store code is available.'}
                </Text>
              ) : null}
              {previewState.status === 'exists' ? (
                <Text style={styles.previewError}>
                  {(creationLabels.codeExists ?? 'A store with this code already exists ({name}).').replace('{name}', previewState.storeName)}
                </Text>
              ) : null}
              {previewState.status === 'error' ? (
                <Text style={styles.previewError}>{previewState.message}</Text>
              ) : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{creationLabels.nameOfficialLabel ?? 'Official name'}</Text>
              <TextInput
                value={nameOfficial}
                onChangeText={setNameOfficial}
                placeholder={creationLabels.nameOfficialPlaceholder ?? 'Enter the official store name'}
                placeholderTextColor="#64748b"
                style={styles.textInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{creationLabels.nameShortLabel ?? 'Short name (optional)'}</Text>
              <TextInput
                value={nameShort}
                onChangeText={setNameShort}
                placeholder={creationLabels.nameShortPlaceholder ?? 'Display name for menus'}
                placeholderTextColor="#64748b"
                style={styles.textInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{creationLabels.timezoneLabel ?? 'Timezone'}</Text>
              <TextInput
                value={timezone}
                onChangeText={setTimezone}
                placeholder={creationLabels.timezonePlaceholder ?? 'e.g. Asia/Tokyo'}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{creationLabels.storePasswordLabel ?? 'Store password'}</Text>
              <TextInput
                value={storePassword}
                onChangeText={setStorePassword}
                placeholder={
                  creationLabels.storePasswordPlaceholder ?? 'Password for kiosk or admin login'
                }
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.textInput}
              />
              <TextInput
                value={storePasswordConfirm}
                onChangeText={setStorePasswordConfirm}
                placeholder={
                  creationLabels.storePasswordConfirmPlaceholder ?? 'Re-enter store password'
                }
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.textInput, styles.textInputSpacing]}
              />
              {storePassword && storePasswordConfirm && !passwordsMatch ? (
                <Text style={styles.previewError}>
                  {creationLabels.storePasswordMismatch ?? 'Store passwords do not match.'}
                </Text>
              ) : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{creationLabels.joinCodeLabel ?? 'Authentication code (optional)'}</Text>
              <TextInput
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder={creationLabels.joinCodePlaceholder ?? 'Create a shared code for staff'}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.textInput}
              />
              <TextInput
                value={joinCodeConfirm}
                onChangeText={setJoinCodeConfirm}
                placeholder={
                  creationLabels.joinCodeConfirmPlaceholder ?? 'Re-enter authentication code'
                }
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[styles.textInput, styles.textInputSpacing]}
              />
              {joinCode && !joinCodesMatch ? (
                <Text style={styles.previewError}>
                  {creationLabels.joinCodeMismatch ?? 'Authentication codes do not match.'}
                </Text>
              ) : null}
            </View>

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            {submitState === 'success' ? (
              <Text style={styles.successMessage}>
                {(creationLabels.submitSuccess ??
                  'Store was created successfully. Share code {storeId} with your team.').replace(
                  '{storeId}',
                  lastCreatedStoreId ?? '',
                )}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, (!allowSubmit || submitState === 'submitting') && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!allowSubmit}
            >
              {submitState === 'submitting' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonLabel}>
                  {creationLabels.submitLabel ?? 'Create store'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>{creationLabels.close ?? 'Close'}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    maxHeight: '85%',
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    marginVertical: 12,
    width: 52,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#1f2945',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '700',
  },
  description: {
    color: '#cbd5f5',
    lineHeight: 20,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    color: '#f8fafc',
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#111c32',
    color: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  readOnlyInput: {
    color: '#f8fafc',
  },
  textInputSpacing: {
    marginTop: 8,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  previewText: {
    color: '#94a3b8',
  },
  previewResolved: {
    color: '#bbf7d0',
  },
  previewError: {
    color: '#fca5a5',
    fontWeight: '600',
  },
  formError: {
    color: '#fca5a5',
    fontWeight: '600',
  },
  successMessage: {
    color: '#86efac',
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonLabel: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: 8,
    backgroundColor: '#1f2945',
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  closeLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
  storeIdHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  regenerateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#1f2945',
  },
  regenerateLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
    fontSize: 12,
  },
});

export default CreateStoreModal;


