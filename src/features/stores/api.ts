import bcrypt from 'bcryptjs';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

export type StoreRole = 'staff' | 'manager' | 'admin' | 'kiosk';

export interface Store {
  id: string;
  nameOfficial: string;
  nameShort?: string | null;
  timezone: string;
  defaultHourlyWage?: number | null;
}

interface UserStoreRoleDoc {
  userId?: string;
  storeId?: string;
  role?: string;
  isResigned?: boolean;
  hourlyWage?: number;
  wage?: number;
}

interface StoreDoc {
  nameOfficial?: string;
  nameShort?: string | null;
  timezone?: string;
  defaultHourlyWage?: number;
  hourlyWage?: number;
}

export interface UserStoreRole {
  id: string;
  storeId: string;
  role: StoreRole;
  isResigned: boolean;
  hourlyWage?: number | null;
}

export interface StoreMember {
  userId: string;
  displayName: string;
  email?: string | null;
  role: StoreRole;
  hourlyWage?: number | null;
  storeId?: string;
}

const readHourlyWage = (value: unknown): number | null => {
  if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
};

const mapRole = (id: string, data: UserStoreRoleDoc | undefined): UserStoreRole | null => {
  if (!data?.storeId) {
    return null;
  }

  const allowedRoles: StoreRole[] = ['staff', 'manager', 'admin', 'kiosk'];
  const roleValue = allowedRoles.includes((data.role ?? 'staff') as StoreRole)
    ? (data.role as StoreRole)
    : 'staff';

  return {
    id,
    storeId: data.storeId,
    role: roleValue,
    isResigned: data.isResigned ?? false,
    hourlyWage: readHourlyWage(data.hourlyWage ?? data.wage ?? null),
  };
};

const mapStore = (id: string, data: StoreDoc | undefined): Store | null => {
  if (!data?.nameOfficial || !data.timezone) {
    return null;
  }

  return {
    id,
    nameOfficial: data.nameOfficial,
    nameShort: data.nameShort ?? null,
    timezone: data.timezone,
    defaultHourlyWage: readHourlyWage(data.defaultHourlyWage ?? data.hourlyWage ?? null),
  };
};

export const listUserStoreRoles = async (uid: string): Promise<UserStoreRole[]> => {
  if (!uid) {
    return [];
  }

  const db = firestore();
  const rolesRef = collection(db, 'userStoreRoles');
  const rolesSnapshot = await getDocs(query(rolesRef, where('userId', '==', uid)));

  return rolesSnapshot.docs
    .map((docSnapshot) => mapRole(docSnapshot.id, docSnapshot.data() as UserStoreRoleDoc | undefined))
    .filter((role): role is UserStoreRole => Boolean(role))
    .filter((role) => role.isResigned !== true);
};

export const listStoresForUser = async (uid: string): Promise<Store[]> => {
  const activeRoles = await listUserStoreRoles(uid);

  if (activeRoles.length === 0) {
    return [];
  }

  const db = firestore();
  const stores = await Promise.all(
    activeRoles.map(async ({ storeId }) => {
      const storeSnapshot = await getDoc(doc(db, 'stores', storeId));
      if (!storeSnapshot.exists()) {
        return null;
      }

      return mapStore(storeSnapshot.id, storeSnapshot.data() as StoreDoc | undefined);
    }),
  );

  return stores.filter((store): store is Store => Boolean(store));
};

interface StoreSecretDoc {
  passwordHash?: string;
  hash?: string;
  pinHash?: string;
}

interface StoreJoinSecretDoc {
  joinCodeHash?: string;
  codeHash?: string;
  tokenHash?: string;
  joinCode?: string;
  code?: string;
  token?: string;
}

interface UserDoc {
  name?: string;
  displayName?: string;
  email?: string | null;
}

export const verifyStoreKioskLogin = async (
  storeId: string,
  password: string,
): Promise<{ storeId: string; storeName: string }> => {
  const rawCode = storeId.trim();
  if (!rawCode) {
    throw new Error('Store code is required.');
  }
  const code = rawCode.toUpperCase();
  if (!password) {
    throw new Error('Store password is required.');
  }

  const db = firestore();
  const storeSnap = await getDoc(doc(db, 'stores', code));
  if (!storeSnap.exists()) {
    throw new Error('Store not found.');
  }

  const secretSnap = await getDoc(doc(db, 'stores', code, 'secrets', 'login'));
  if (!secretSnap.exists()) {
    throw new Error('Store login settings are not configured.');
  }

  const secrets = secretSnap.data() as StoreSecretDoc;
  const hash = secrets.passwordHash ?? secrets.hash ?? secrets.pinHash ?? null;
  if (!hash) {
    throw new Error('Store password is not configured.');
  }

  const isValid = await bcrypt.compare(password, hash);
  if (!isValid) {
    throw new Error('Invalid store password.');
  }

  const storeData = mapStore(storeSnap.id, storeSnap.data() as StoreDoc | undefined);
  if (!storeData) {
    throw new Error('Store definition is incomplete.');
  }

  return { storeId: storeData.id, storeName: storeData.nameOfficial };
};

export const verifyStoreJoinCode = async (
  storeId: string,
  authenticationCode: string,
): Promise<{ storeId: string; storeName: string }> => {
  const rawCode = storeId.trim();
  if (!rawCode) {
    throw new Error('Store code is required.');
  }
  const code = rawCode.toUpperCase();
  const secret = authenticationCode.trim();
  if (!secret) {
    throw new Error('Store authentication code is required.');
  }

  const db = firestore();
  const storeSnap = await getDoc(doc(db, 'stores', code));
  if (!storeSnap.exists()) {
    throw new Error('Store not found.');
  }

  const secretSnap = await getDoc(doc(db, 'stores', code, 'secrets', 'join'));
  if (!secretSnap.exists()) {
    throw new Error('Store join authentication is not configured.');
  }

  const secrets = secretSnap.data() as StoreJoinSecretDoc;
  const hash =
    secrets.joinCodeHash ??
    secrets.codeHash ??
    secrets.tokenHash ??
    null;
  const plain = secrets.joinCode ?? secrets.code ?? secrets.token ?? null;

  let isValid = false;
  if (hash) {
    try {
      isValid = await bcrypt.compare(secret, hash);
    } catch (_error) {
      isValid = false;
    }
  } else if (plain) {
    isValid = plain === secret;
  }

  if (!isValid) {
    throw new Error('Invalid store authentication code.');
  }

  const storeData = mapStore(storeSnap.id, storeSnap.data() as StoreDoc | undefined);
  if (!storeData) {
    throw new Error('Store definition is incomplete.');
  }

  return { storeId: storeData.id, storeName: storeData.nameOfficial };
};

export interface CreateStoreParams {
  storeId: string;
  nameOfficial: string;
  nameShort?: string | null;
  timezone: string;
  joinCode?: string | null;
  loginPassword: string;
  createdBy?: string | null;
}

export const createStoreWithJoinSecret = async ({
  storeId,
  nameOfficial,
  nameShort,
  timezone,
  joinCode,
  loginPassword,
  createdBy,
}: CreateStoreParams): Promise<void> => {
  const rawCode = storeId.trim();
  if (!rawCode) {
    throw new Error('Store code is required.');
  }
  const code = rawCode.toUpperCase();
  if (!/^[A-Z0-9]{6}$/u.test(code)) {
    throw new Error('Store code must be 6 alphanumeric characters.');
  }
  const officialName = nameOfficial.trim();
  if (!officialName) {
    throw new Error('Store official name is required.');
  }
  const tz = timezone.trim();
  if (!tz) {
    throw new Error('Store timezone is required.');
  }
  const trimmedPassword = loginPassword.trim();
  if (!trimmedPassword) {
    throw new Error('Store password is required.');
  }

  const db = firestore();
  const storeRef = doc(db, 'stores', code);
  const existing = await getDoc(storeRef);
  if (existing.exists()) {
    throw new Error('A store with this code already exists.');
  }

  const now = serverTimestamp();
  await setDoc(storeRef, {
    nameOfficial: officialName,
    nameShort: nameShort?.trim() || null,
    timezone: tz,
    defaultHourlyWage: null,
    createdAt: now,
    updatedAt: now,
    createdBy: createdBy ?? null,
  });

  const passwordHash = bcrypt.hashSync(trimmedPassword, 10);
  await setDoc(
    doc(db, 'stores', code, 'secrets', 'login'),
    {
      passwordHash,
      createdAt: now,
      updatedAt: now,
      createdBy: createdBy ?? null,
    },
    { merge: true },
  );

  const trimmedJoin = joinCode?.trim();
  if (trimmedJoin) {
    const hash = bcrypt.hashSync(trimmedJoin, 10);
    await setDoc(
      doc(db, 'stores', code, 'secrets', 'join'),
      {
        joinCodeHash: hash,
        createdAt: now,
        updatedAt: now,
        createdBy: createdBy ?? null,
      },
      { merge: true },
    );
  }

  if (createdBy) {
    await setDoc(
      doc(db, 'userStoreRoles', `${createdBy}_${code}`),
      {
        userId: createdBy,
        storeId: code,
        role: 'admin',
        isResigned: false,
        hourlyWage: null,
        source: 'self',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
  }
};


export const getStore = async (storeId: string): Promise<Store | null> => {
  const raw = storeId.trim();
  if (!raw) {
    return null;
  }

  const db = firestore();
  const upper = raw.toUpperCase();
  let snap = await getDoc(doc(db, 'stores', upper));
  if (!snap.exists() && upper !== raw) {
    snap = await getDoc(doc(db, 'stores', raw));
  }
  if (!snap.exists()) {
    return null;
  }

  return mapStore(snap.id, snap.data() as StoreDoc | undefined);
};

export const listStoreMembers = async (storeId: string): Promise<StoreMember[]> => {
  if (!storeId) {
    return [];
  }

  const db = firestore();
  const rolesRef = collection(db, 'userStoreRoles');
  const snapshot = await getDocs(query(rolesRef, where('storeId', '==', storeId)));

  const members = await Promise.all(
    snapshot.docs.map(async (docSnapshot) => {
      const role = mapRole(docSnapshot.id, docSnapshot.data() as UserStoreRoleDoc | undefined);
      if (!role || role.isResigned) {
        return null;
      }

      const data = docSnapshot.data() as UserStoreRoleDoc;
      const userId = data.userId;
      if (!userId) {
        return null;
      }

      const userSnap = await getDoc(doc(db, 'users', userId));
      if (!userSnap.exists()) {
        return null;
      }

      const userData = userSnap.data() as UserDoc | undefined;
      const displayName = userData?.name ?? userData?.displayName ?? 'Unknown';

      return {
        userId,
        displayName,
        email: userData?.email ?? null,
        role: role.role,
        hourlyWage: role.hourlyWage ?? readHourlyWage(data.hourlyWage ?? data.wage ?? null),
        storeId: role.storeId,
      } as StoreMember;
    }),
  );

  return members.filter((member): member is StoreMember => Boolean(member));
};
