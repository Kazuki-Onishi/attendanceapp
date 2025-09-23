import React, { useCallback, useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

import { auth } from '@/lib/firebase';
import type { RootStackParamList } from '@/navigation/RootStack';
import { useAppDispatch, useAppSelector } from '@/store';
import { setError, setStatus } from '@/store/slices/authSlice';

const SignUp: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const status = useAppSelector((state) => state.auth.status);
  const remoteError = useAppSelector((state) => state.auth.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const isSubmitting = status === 'loading';

  const handleSignUp = useCallback(async () => {
    const trimmedEmail = email.trim();
    const trimmedDisplayName = displayName.trim();

    if (!trimmedEmail || !password) {
      setLocalError('Enter both email and password.');
      return;
    }

    if (password.length < 8) {
      setLocalError('Use at least 8 characters for the password.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('The passwords do not match.');
      return;
    }

    setLocalError(null);
    dispatch(setError(null));
    dispatch(setStatus('loading'));

    try {
      const firebaseAuth = auth();
      const credential = await createUserWithEmailAndPassword(firebaseAuth, trimmedEmail, password);
      if (trimmedDisplayName) {
        await updateProfile(credential.user, { displayName: trimmedDisplayName });
      }
      dispatch(setStatus('authenticated'));
      navigation.goBack();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to create the account. Please check your details and try again.';
      dispatch(setError(message));
      dispatch(setStatus('error'));
    }
  }, [confirmPassword, dispatch, displayName, email, navigation, password]);

  const handleBackToLogin = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const displayError = localError ?? remoteError;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create your account</Text>

      <TextInput
        placeholder="Display name (optional)"
        autoCapitalize="words"
        style={styles.input}
        editable={!isSubmitting}
        value={displayName}
        onChangeText={setDisplayName}
      />

      <TextInput
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
        editable={!isSubmitting}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        editable={!isSubmitting}
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        placeholder="Confirm password"
        secureTextEntry
        style={styles.input}
        editable={!isSubmitting}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {displayError ? <Text style={styles.error}>{displayError}</Text> : null}

      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleSignUp}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Sign up</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkButton} onPress={handleBackToLogin} disabled={isSubmitting}>
        <Text style={styles.linkLabel}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderColor: '#cbd5f5',
    borderWidth: 1,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#2563eb',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  linkLabel: {
    color: '#2563eb',
    fontWeight: '600',
  },
  error: {
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 12,
  },
});

export default SignUp;
