import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { getStore, verifyStoreJoinCode } from '@/features/stores/api';
import {
  cancelStoreJoinRequest,
  createStoreJoinRequest,
  listenStoreJoinRequests,
  type StoreJoinRequest,
} from '@/features/joinRequests/api';
import { useAppSelector } from '@/store';

const DEBOUNCE_MS = 400;

type JoinStoreModalProps = {
  visible: boolean;
  onClose: () => void;
};

type StorePreviewState =
  | { status: 'idle'; message?: string }
  | { status: 'loading' }
  | { status: 'resolved'; storeName: string }
  | { status: 'error'; message: string };

const statusStyleFor = (status: StoreJoinRequest['status']) => {
  switch (status) {
    case 'approved':
      return styles.status_approved;
    case 'rejected':
      return styles.status_rejected;
    case 'canceled':
      return styles.status_canceled;
    default:
      return styles.status_pending;
  }
};

const JoinStoreModal: React.FC<JoinStoreModalProps> = ({ visible, onClose }) => {
  const user = useAppSelector((state) => state.auth.user);

  const staffLabels = (labels.staff ?? {}) as Record<string, any>;
  const joinLabels = staffLabels.join ?? {};
  const formLabels = joinLabels.form ?? {};
  const statusLabels = joinLabels.status ?? {};
  const messages = joinLabels.messages ?? {};

  const [storeCode, setStoreCode] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [requests, setRequests] = useState<StoreJoinRequest[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<StorePreviewState>({ status: 'idle' });

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingRequestCount = useMemo(() => requests.filter((req) => req.status === 'pending').length, [requests]);

  const isStoreResolved = previewState.status === 'resolved';
  const allowSubmit =
    Boolean(user?.uid) &&
    storeCode.trim().length > 0 &&
    authCode.trim().length > 0 &&
    isStoreResolved &&
    submitState !== 'submitting' &&
    pendingRequestCount === 0;
  const isSubmitting = submitState === 'submitting';

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (!user?.uid) {
      setRequests([]);
      setRequestError(joinLabels.authError ?? 'Login information is missing.');
      return;
    }

    setRequestError(null);
    setRequests([]);

    const unsubscribe = listenStoreJoinRequests(
      user.uid,
      (next) => {
        setRequests(next);
        setRequestError(null);
      },
      (error) => {
        setRequestError(error.message ?? 'Failed to load join requests.');
      },
    );

    return () => {
      unsubscribe();
    };
  }, [visible, user?.uid, joinLabels.authError]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = storeCode.trim();
    const normalized = trimmed.toUpperCase();
    if (!trimmed) {
      setPreviewState({ status: 'idle' });
      return;
    }

    setPreviewState({ status: 'loading' });
    debounceTimerRef.current = setTimeout(() => {
      getStore(normalized)
        .then((store) => {
          if (!store) {
            setPreviewState({
              status: 'error',
              message: formLabels.storeInvalid ?? 'Store code was not found.',
            });
            return;
          }
          const name = store.nameOfficial ?? trimmed;
          setPreviewState({ status: 'resolved', storeName: name });
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : formLabels.storeInvalid ?? 'Store code was not found.';
          setPreviewState({ status: 'error', message });
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [storeCode, visible, formLabels.storeInvalid]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setFormError(null);
    setSubmitState('idle');
    setAuthCode('');
  }, [visible]);

  const handleSubmit = async () => {
    if (!user?.uid) {
      setFormError(joinLabels.authError ?? 'Login information is missing.');
      return;
    }
    const trimmedStoreCode = storeCode.trim();
    if (!trimmedStoreCode) {
      setFormError(formLabels.storeCodeRequired ?? 'Enter the store code.');
      return;
    }
    const normalizedStoreId = trimmedStoreCode.toUpperCase();
    const trimmedAuthCode = authCode.trim();
    if (!trimmedAuthCode) {
      setFormError(formLabels.authCodeRequired ?? 'Enter the authentication code.');
      return;
    }
    if (pendingRequestCount > 0) {
      setFormError(formLabels.pendingExists ?? 'You already have a pending request.');
      return;
    }

    try {
      setSubmitState('submitting');
      setFormError(null);
      const verification = await verifyStoreJoinCode(normalizedStoreId, trimmedAuthCode);
      await createStoreJoinRequest({
        userId: user.uid,
        storeId: verification.storeId,
        note: note.trim().length > 0 ? note.trim() : null,
      });
      setSubmitState('success');
      setStoreCode('');
      setAuthCode('');
      setNote('');
    } catch (error) {
      let message: string;
      if (error instanceof Error) {
        if (error.message == 'Invalid store authentication code.') {
          message = formLabels.authCodeInvalid ?? error.message;
        } else if (error.message == 'Store join authentication is not configured.') {
          message =
            formLabels.authCodeNotConfigured ?? 'Store join authentication is not configured.';
        } else {
          message = error.message;
        }
      } else {
        message = formLabels.submitError ?? 'Failed to send the join request.';
      }
      setFormError(message);
      setSubmitState('idle');
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    try {
      await cancelStoreJoinRequest(requestId);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : formLabels.cancelError ?? 'Failed to cancel the request.';
      setFormError(message);
    }
  };

  const renderStatusLabel = (status: StoreJoinRequest['status']) => {
    switch (status) {
      case 'approved':
        return statusLabels.approved ?? 'Approved';
      case 'rejected':
        return statusLabels.rejected ?? 'Rejected';
      case 'canceled':
        return statusLabels.canceled ?? 'Canceled';
      default:
        return statusLabels.pending ?? 'Pending approval';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetContainer}
        >
          <View style={styles.sheetHandle} />
          <ScrollView contentContainerStyle={styles.sheetContent} bounces={false}>
            <Text style={styles.title}>{joinLabels.modalTitle ?? 'Join a store'}</Text>
            <Text style={styles.description}>
              {joinLabels.modalDescription ??
                'Enter the store code and authentication code to send a join request. After a manager approves it you can use the store.'}
            </Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{formLabels.storeCodeLabel ?? 'Store code'}</Text>
              <TextInput
                value={storeCode}
                onChangeText={setStoreCode}
                placeholder={formLabels.storeCodePlaceholder ?? 'e.g. STORE1234'}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.textInput}
              />
              {previewState.status === 'loading' ? (
                <View style={styles.previewRow}>
                  <ActivityIndicator size="small" color="#2563eb" />
                  <Text style={styles.previewText}>{formLabels.storeChecking ?? 'Checking the store...'}</Text>
                </View>
              ) : null}
              {previewState.status === 'resolved' ? (
                <Text style={styles.previewResolved}>{previewState.storeName}</Text>
              ) : null}
              {previewState.status === 'error' ? (
                <Text style={styles.previewError}>{previewState.message}</Text>
              ) : null}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{formLabels.authCodeLabel ?? 'Authentication code'}</Text>
              <TextInput
                value={authCode}
                onChangeText={setAuthCode}
                placeholder={formLabels.authCodePlaceholder ?? 'e.g. 123456'}
                placeholderTextColor="#64748b"
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={styles.textInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{formLabels.noteLabel ?? 'Message (optional)'}</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={formLabels.notePlaceholder ?? 'Add context for the manager if needed'}
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={3}
                style={[styles.textInput, styles.noteInput]}
              />
            </View>

            {formError ? <Text style={styles.formError}>{formError}</Text> : null}
            {submitState === 'success' ? (
              <Text style={styles.successMessage}>
                {messages.submitSuccess ?? 'The join request was sent. Please wait for approval.'}
              </Text>
            ) : null}

            <TouchableOpacity
              style={[styles.primaryButton, (!allowSubmit || isSubmitting) && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={!allowSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonLabel}>
                  {formLabels.submitLabel ?? 'Send join request'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.sectionDivider} />

            <Text style={styles.sectionTitle}>{joinLabels.requestListTitle ?? 'Request history'}</Text>
            {requestError ? <Text style={styles.formError}>{requestError}</Text> : null}
            {requests.length === 0 ? (
              <Text style={styles.helperText}>{joinLabels.requestListEmpty ?? 'No join requests yet.'}</Text>
            ) : (
              requests.map((request) => {
                const isPending = request.status === 'pending';
                return (
                  <View key={request.id} style={styles.requestCard}>
                    <View style={styles.requestHeader}>
                      <Text style={styles.requestStore}>{request.storeId}</Text>
                      <View style={[styles.statusBadge, statusStyleFor(request.status)]}>
                        <Text style={styles.statusBadgeLabel}>{renderStatusLabel(request.status)}</Text>
                      </View>
                    </View>
                    {request.note ? <Text style={styles.requestNote}>{request.note}</Text> : null}
                    {request.createdAt ? (
                      <Text style={styles.requestMeta}>
                        {(messages.submittedAt ?? 'Submitted: {date}').replace(
                          '{date}',
                          request.createdAt.toLocaleString('ja-JP'),
                        )}
                      </Text>
                    ) : null}
                    {isPending ? (
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => handleCancelRequest(request.id)}
                      >
                        <Text style={styles.secondaryButtonLabel}>
                          {formLabels.cancelLabel ?? 'Cancel request'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            )}

            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeLabel}>{joinLabels.modalClose ?? 'Close'}</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#1f2937',
    marginTop: 12,
  },
  sheetContent: {
    padding: 24,
    gap: 16,
    paddingBottom: 48,
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    fontSize: 16,
  },
  noteInput: {
    minHeight: 96,
    textAlignVertical: 'top',
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
    color: '#fda4af',
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
  sectionDivider: {
    height: 1,
    backgroundColor: '#1f2945',
    marginVertical: 8,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 18,
  },
  helperText: {
    color: '#94a3b8',
  },
  requestCard: {
    backgroundColor: '#111c32',
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requestStore: {
    color: '#f8fafc',
    fontWeight: '700',
    fontSize: 16,
  },
  requestNote: {
    color: '#cbd5f5',
    lineHeight: 18,
  },
  requestMeta: {
    color: '#94a3b8',
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusBadgeLabel: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 12,
  },
  status_pending: {
    backgroundColor: '#facc15',
  },
  status_approved: {
    backgroundColor: '#4ade80',
  },
  status_rejected: {
    backgroundColor: '#f87171',
  },
  status_canceled: {
    backgroundColor: '#e2e8f0',
  },
  secondaryButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#1f2945',
  },
  secondaryButtonLabel: {
    color: '#cbd5f5',
    fontWeight: '600',
  },
  closeButton: {
    alignSelf: 'center',
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    marginTop: 8,
  },
  closeLabel: {
    color: '#fff',
    fontWeight: '700',
  },
});

export default JoinStoreModal;

