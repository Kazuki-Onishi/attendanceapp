import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';

import { verifyStoreKioskLogin } from '@/features/stores/api';
import { useAppDispatch } from '@/store';
import { setKioskSession } from '@/store/slices/storeAuthSlice';
import type { StoreStackParamList } from '@/navigation/StoreStack';

const LoginStore: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigation = useNavigation<NativeStackNavigationProp<StoreStackParamList>>();

  const [storeCode, setStoreCode] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const session = await verifyStoreKioskLogin(storeCode, password);
      dispatch(setKioskSession(session));
      setPassword('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start kiosk session.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [dispatch, password, storeCode]);

  const handleReturn = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Store kiosk login</Text>
      <Text style={styles.subtitle}>Enter the store code and kiosk password configured for this device.</Text>
      <TextInput
        placeholder="Store code"
        autoCapitalize="characters"
        autoCorrect={false}
        value={storeCode}
        onChangeText={setStoreCode}
        style={styles.input}
        editable={!isSubmitting}
      />
      <TextInput
        placeholder="Store password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        editable={!isSubmitting}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <TouchableOpacity
        style={[styles.button, isSubmitting && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={isSubmitting}
      >
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonLabel}>Start kiosk session</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={handleReturn} disabled={isSubmitting}>
        <Text style={styles.linkLabel}>Back</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 20,
  },
  input: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5f5',
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
  },
  button: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563eb',
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
    alignItems: 'center',
    paddingVertical: 8,
  },
  linkLabel: {
    color: '#2563eb',
    fontWeight: '600',
  },
  error: {
    color: '#dc2626',
    textAlign: 'center',
  },
});

export default LoginStore;
