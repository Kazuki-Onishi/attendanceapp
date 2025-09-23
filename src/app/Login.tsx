import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import type { GoogleAuthRequestConfig } from 'expo-auth-session/providers/google';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
} from 'firebase/auth';

import { auth } from '@/lib/firebase';
import type { RootStackParamList } from '@/navigation/RootStack';
import { useAppDispatch, useAppSelector } from '@/store';
import { setError, setStatus } from '@/store/slices/authSlice';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_ENV = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  expo: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
};

const FALLBACK_GOOGLE_CLIENT_ID = '__DUMMY_CLIENT_ID__';
const GOOGLE_DEFAULT_CLIENT_ID =
  GOOGLE_ENV.expo ?? GOOGLE_ENV.web ?? GOOGLE_ENV.ios ?? GOOGLE_ENV.android ?? undefined;

const Login: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const status = useAppSelector((state) => state.auth.status);
  const remoteError = useAppSelector((state) => state.auth.error);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isGooglePrompting, setGooglePrompting] = useState(false);

  const isSubmitting = status === 'loading';

  const isGoogleConfigured = useMemo(
    () => Boolean(GOOGLE_DEFAULT_CLIENT_ID),
    [],
  );

  const googleRequestConfig: Partial<GoogleAuthRequestConfig> = useMemo(
    () => ({
      responseType: 'id_token',
      clientId: GOOGLE_DEFAULT_CLIENT_ID ?? FALLBACK_GOOGLE_CLIENT_ID,
      webClientId: GOOGLE_ENV.web ?? GOOGLE_DEFAULT_CLIENT_ID ?? FALLBACK_GOOGLE_CLIENT_ID,
      iosClientId: GOOGLE_ENV.ios ?? undefined,
      androidClientId: GOOGLE_ENV.android ?? undefined,
    }),
    [],
  );

  const [googleRequest, googleResponse, promptGoogleSignIn] = Google.useAuthRequest(googleRequestConfig);

  const handleEmailLogin = useCallback(async () => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    setLocalError(null);
    dispatch(setError(null));
    dispatch(setStatus('loading'));

    try {
      await signInWithEmailAndPassword(auth(), trimmedEmail, password);
      dispatch(setStatus('authenticated'));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to sign in with the provided credentials.';
      dispatch(setError(message));
      dispatch(setStatus('error'));
    }
  }, [dispatch, email, password]);

  useEffect(() => {
    if (!googleResponse) {
      return;
    }

    if (googleResponse.type === 'success') {
      const idToken = googleResponse.authentication?.idToken ?? googleResponse.params?.id_token;
      if (!idToken) {
        dispatch(setError('Google sign-in did not return a valid token.'));
        dispatch(setStatus('error'));
        return;
      }

      dispatch(setStatus('loading'));
      dispatch(setError(null));

      const credential = GoogleAuthProvider.credential(idToken);
      signInWithCredential(auth(), credential)
        .then(() => {
          dispatch(setStatus('authenticated'));
        })
        .catch((err) => {
          const message =
            err instanceof Error ? err.message : 'Google account sign-in failed. Please try again.';
          dispatch(setError(message));
          dispatch(setStatus('error'));
        });
    } else if (googleResponse.type === 'error') {
      const errMessage = googleResponse.error?.message ?? 'Google sign-in was cancelled or failed.';
      dispatch(setError(errMessage));
      dispatch(setStatus('error'));
    }
  }, [dispatch, googleResponse]);

  const handleGooglePress = useCallback(() => {
    if (!isGoogleConfigured) {
      setLocalError('Google sign-in is not configured. Set EXPO_PUBLIC_GOOGLE_* client IDs first.');
      return;
    }
    if (!googleRequest || isGooglePrompting) {
      return;
    }

    setLocalError(null);
    dispatch(setError(null));
    setGooglePrompting(true);

    promptGoogleSignIn()
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Unable to start Google sign-in.';
        dispatch(setError(message));
        dispatch(setStatus('error'));
      })
      .finally(() => {
        setGooglePrompting(false);
      });
  }, [dispatch, googleRequest, isGoogleConfigured, isGooglePrompting, promptGoogleSignIn]);

  const handleOpenStoreLogin = useCallback(() => {
    navigation.navigate('StoreStackModal');
  }, [navigation]);

  const handleOpenSignUp = useCallback(() => {
    navigation.navigate('SignUp');
  }, [navigation]);

  const displayError = localError ?? remoteError;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Attendance Manager</Text>
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
      {displayError ? <Text style={styles.error}>{displayError}</Text> : null}
      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleEmailLogin}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonLabel}>Sign in</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenSignUp} disabled={isSubmitting}>
        <Text style={styles.secondaryLabel}>Create a new account</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.googleButton, (isSubmitting || !isGoogleConfigured || isGooglePrompting) && styles.buttonDisabled]}
        onPress={handleGooglePress}
        disabled={isSubmitting || !isGoogleConfigured || isGooglePrompting}
      >
        {isSubmitting || isGooglePrompting ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text style={styles.googleLabel}>Sign in with Google</Text>
        )}
      </TouchableOpacity>

      {!isGoogleConfigured ? (
        <Text style={styles.helper}>Configure EXPO_PUBLIC_GOOGLE_* client IDs to enable Google sign-in.</Text>
      ) : null}

      <TouchableOpacity style={styles.linkButton} onPress={handleOpenStoreLogin} disabled={isSubmitting}>
        <Text style={styles.linkLabel}>Store kiosk login</Text>
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
  googleButton: {
    backgroundColor: '#e2e8f0',
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: '#2563eb',
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  googleLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '600',
  },
  helper: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 12,
    color: '#475569',
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

export default Login;
