import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface CommentPromptModalProps {
  visible: boolean;
  title: string;
  requireComment?: boolean;
  onSubmit: (comment: string) => void;
  onCancel: () => void;
}

const CommentPromptModal: React.FC<CommentPromptModalProps> = ({
  visible,
  title,
  requireComment = false,
  onSubmit,
  onCancel,
}) => {
  const [comment, setComment] = useState('');

  const handleSubmit = () => {
    if (requireComment && comment.trim().length === 0) {
      return;
    }
    onSubmit(comment.trim());
    setComment('');
  };

  const handleClose = () => {
    setComment('');
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            placeholder="Add a comment"
            placeholderTextColor="#475569"
            multiline
            value={comment}
            onChangeText={setComment}
          />
          {requireComment && comment.trim().length === 0 ? (
            <Text style={styles.helper}>Comment is required for this action.</Text>
          ) : null}
          <View style={styles.footer}>
            <TouchableOpacity style={[styles.button, styles.cancelButton]} onPress={handleClose}>
              <Text style={styles.cancelLabel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={handleSubmit}
              disabled={requireComment && comment.trim().length === 0}
            >
              <Text style={styles.submitLabel}>Submit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  input: {
    minHeight: 100,
    backgroundColor: '#111b2e',
    borderRadius: 12,
    padding: 12,
    color: '#e2e8f0',
    textAlignVertical: 'top',
  },
  helper: {
    color: '#fbbf24',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  cancelButton: {
    backgroundColor: '#1f2937',
  },
  cancelLabel: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#2563eb',
  },
  submitLabel: {
    color: '#f8fafc',
    fontWeight: '700',
  },
});

export default CommentPromptModal;
