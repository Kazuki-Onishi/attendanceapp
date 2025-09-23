import Constants from 'expo-constants';
import { FirebaseApp, FirebaseError, FirebaseOptions, getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { Firestore, getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const REQUIRED_KEYS: Array<keyof FirebaseOptions> = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

const toEnvKey = (key: keyof FirebaseOptions): string =>
  `EXPO_PUBLIC_FIREBASE_${String(key).replace(/([A-Z])/g, '_$1').toUpperCase()}`;

const readFirebaseOptions = (): FirebaseOptions | null => {
  const extra = (Constants?.expoConfig?.extra ?? Constants?.manifest?.extra ?? {}) as {
    firebase?: Partial<FirebaseOptions>;
  };

  const fallback = REQUIRED_KEYS.reduce((acc, key) => {
    const envKey = toEnvKey(key);
    const value = process.env[envKey as keyof NodeJS.ProcessEnv];
    if (value) {
      acc[key] = value;
    }
    return acc;
  }, {} as Partial<FirebaseOptions>);

  const options: Partial<FirebaseOptions> = {
    ...fallback,
    ...extra.firebase,
  };

  const isValid = REQUIRED_KEYS.every((key) => options[key]);

  return isValid ? (options as FirebaseOptions) : null;
};

let cachedApp: FirebaseApp | null = null;
let cachedFirestore: Firestore | null = null;

export const getFirebaseApp = (): FirebaseApp => {
  if (cachedApp) {
    return cachedApp;
  }

  const config = readFirebaseOptions();

  if (!config) {
    throw new Error('Firebase configuration is missing. Set EXPO_PUBLIC_FIREBASE_* env vars.');
  }

  cachedApp = getApps().length ? getApp() : initializeApp(config);
  return cachedApp;
};

export const auth = () => getAuth(getFirebaseApp());

const ensureFirestore = (): Firestore => {
  if (cachedFirestore) {
    return cachedFirestore;
  }

  const app = getFirebaseApp();

  try {
    cachedFirestore = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch (error) {
    if (error instanceof FirebaseError && error.code === 'failed-precondition') {
      cachedFirestore = getFirestore(app);
    } else {
      throw error;
    }
  }

  return cachedFirestore;
};

export const firestore = () => ensureFirestore();

export const storage = () => getStorage(getFirebaseApp());
