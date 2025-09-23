import { listUserStoreRoles } from '@/features/stores/api';
import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';

import { auth, firestore } from '@/lib/firebase';

import type { Attendance, AttendanceStatus } from './types';

type TimestampValue = Timestamp | ReturnType<typeof serverTimestamp>;
type AttendanceBreakDoc = {
  start: TimestampValue;
  end?: TimestampValue | null;
};

type AttendanceDoc = {
  userId: string;
  storeId: string;
  clockIn: TimestampValue;
  clockOut?: TimestampValue | null;
  breaks?: AttendanceBreakDoc[];
  status: AttendanceStatus;
  createdAt: TimestampValue;
  updatedAt: TimestampValue;
};

const COLLECTION_KEY = 'attendances';

const getCurrentUserId = (): string => {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('User is not authenticated.');
  }
  return currentUser.uid;
};

const toDate = (value?: TimestampValue | null): Date | undefined => {
  if (!value) {
    return undefined;
  }
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return undefined;
};

export const mapAttendance = (id: string, data: AttendanceDoc): Attendance => {
  const breaks: Attendance['breaks'] = [];
  for (const item of data.breaks ?? []) {
    const start = toDate(item.start);
    if (!start) {
      continue;
    }
    const end = toDate(item.end);
    breaks.push({ start, end: end ?? undefined });
  }

  return {
    id,
    userId: data.userId,
    storeId: data.storeId,
    clockIn: toDate(data.clockIn) ?? new Date(),
    clockOut: toDate(data.clockOut),
    breaks,
    status: data.status,
    createdAt: toDate(data.createdAt) ?? new Date(),
    updatedAt: toDate(data.updatedAt) ?? new Date(),
  };
};

export const getAttendancesCollection = () => collection(firestore(), COLLECTION_KEY);

const findOpenAttendanceDoc = async (userId: string) => {
  const openQuery = query(
    getAttendancesCollection(),
    where('userId', '==', userId),
    where('status', '==', 'open'),
    orderBy('clockIn', 'desc'),
    limit(1),
  );
  const snapshot = await getDocs(openQuery);
  return snapshot.docs[0] ?? null;
};

export const clockIn = async (storeId: string): Promise<Attendance> => {
  if (!storeId) {
    throw new Error('Store ID is required to clock in.');
  }

  const userId = getCurrentUserId();
  const existingOpen = await queryOpenAttendanceByUser(userId);

  if (existingOpen) {
    throw new Error('Already clocked-in at another store.');
  }

  const now = serverTimestamp();
  const docRef = await addDoc(getAttendancesCollection(), {
    userId,
    storeId,
    clockIn: now,
    clockOut: null,
    breaks: [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });

  const snapshot = await getDoc(docRef);
  return mapAttendance(snapshot.id, snapshot.data() as AttendanceDoc);
};

export const toggleBreak = async (): Promise<void> => {
  const userId = getCurrentUserId();
  const openDocSnapshot = await findOpenAttendanceDoc(userId);

  if (!openDocSnapshot) {
    throw new Error('No active shift found. Clock in before toggling a break.');
  }

  const now = serverTimestamp();
  await runTransaction(firestore(), async (transaction) => {
    const docRef = openDocSnapshot.ref;
    const freshSnapshot = await transaction.get(docRef);

    if (!freshSnapshot.exists()) {
      throw new Error('Attendance record no longer exists.');
    }

    const data = freshSnapshot.data() as AttendanceDoc;
    const breaks: AttendanceBreakDoc[] = (data.breaks ?? []).map((breakItem) => ({
      start: breakItem.start,
      end: breakItem.end ?? null,
    }));

    if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
      breaks[breaks.length - 1] = {
        ...breaks[breaks.length - 1],
        end: now,
      };
    } else {
      breaks.push({ start: now, end: null });
    }

    transaction.update(docRef, {
      breaks,
      updatedAt: now,
    });
  });
};

export const clockOut = async (): Promise<void> => {
  const userId = getCurrentUserId();
  const openDocSnapshot = await findOpenAttendanceDoc(userId);

  if (!openDocSnapshot) {
    throw new Error('No active shift found to clock out.');
  }

  const now = serverTimestamp();
  await runTransaction(firestore(), async (transaction) => {
    const docRef = openDocSnapshot.ref;
    const freshSnapshot = await transaction.get(docRef);

    if (!freshSnapshot.exists()) {
      throw new Error('Attendance record no longer exists.');
    }

    const data = freshSnapshot.data() as AttendanceDoc;
    const breaks: AttendanceBreakDoc[] = (data.breaks ?? []).map((breakItem) => ({
      start: breakItem.start,
      end: breakItem.end ?? null,
    }));

    if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
      breaks[breaks.length - 1] = {
        ...breaks[breaks.length - 1],
        end: now,
      };
    }

    transaction.update(docRef, {
      clockOut: now,
      status: 'closed',
      breaks,
      updatedAt: now,
    });
  });
};

const getDayRangeTimestamps = () => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return {
    start: Timestamp.fromDate(start),
    end: Timestamp.fromDate(end),
  };
};

export const subscribeToTodayAttendances = (
  storeId: string,
  listener: (records: Attendance[]) => void,
): (() => void) => {
  const userId = getCurrentUserId();
  const { start, end } = getDayRangeTimestamps();

  const todayQuery = query(
    getAttendancesCollection(),
    where('userId', '==', userId),
    where('storeId', '==', storeId),
    where('clockIn', '>=', start),
    where('clockIn', '<=', end),
    orderBy('clockIn', 'desc'),
  );

  return onSnapshot(todayQuery, (snapshot) => {
    const attendances = snapshot.docs.map((docSnapshot) =>
      mapAttendance(docSnapshot.id, docSnapshot.data() as AttendanceDoc),
    );
    listener(attendances);
  });
};

export const subscribeToOpenAttendance = (
  listener: (attendance: Attendance | null) => void,
): (() => void) => {
  const userId = getCurrentUserId();
  const openQuery = query(
    getAttendancesCollection(),
    where('userId', '==', userId),
    where('status', '==', 'open'),
    orderBy('clockIn', 'desc'),
    limit(1),
  );

  return onSnapshot(openQuery, (snapshot) => {
    if (snapshot.empty) {
      listener(null);
      return;
    }

    const docSnapshot = snapshot.docs[0];
    listener(mapAttendance(docSnapshot.id, docSnapshot.data() as AttendanceDoc));
  });
};



export const queryOpenAttendanceByUser = async (userId: string): Promise<Attendance | null> => {
  if (!userId) {
    return null;
  }

  const snapshot = await findOpenAttendanceDoc(userId);
  if (!snapshot) {
    return null;
  }

  return mapAttendance(snapshot.id, snapshot.data() as AttendanceDoc);
};

export const getOpenAttendanceForUser = async (userId: string): Promise<Attendance | null> => {
  const snapshot = await findOpenAttendanceDoc(userId);
  if (!snapshot) {
    return null;
  }
  return mapAttendance(snapshot.id, snapshot.data() as AttendanceDoc);
};

const assertUserBelongsToStore = async (userId: string, storeId: string) => {
  const roles = await listUserStoreRoles(userId);
  const match = roles.find((role) => role.storeId === storeId && role.isResigned !== true);
  if (!match) {
    throw new Error('User is not assigned to this store.');
  }
  return match;
};

export const kioskClockIn = async (userId: string, storeId: string): Promise<Attendance> => {
  if (!userId) {
    throw new Error('A user must be selected to clock in.');
  }
  if (!storeId) {
    throw new Error('Store context is missing.');
  }

  await assertUserBelongsToStore(userId, storeId);

  const existingOpen = await queryOpenAttendanceByUser(userId);
  if (existingOpen) {
    throw new Error('Already clocked-in at another store.');
  }

  const now = serverTimestamp();
  const docRef = await addDoc(getAttendancesCollection(), {
    userId,
    storeId,
    clockIn: now,
    clockOut: null,
    breaks: [],
    status: 'open',
    createdAt: now,
    updatedAt: now,
  });
  const snapshot = await getDoc(docRef);
  return mapAttendance(snapshot.id, snapshot.data() as AttendanceDoc);
};

export const kioskToggleBreak = async (userId: string, storeId?: string): Promise<void> => {
  if (!userId) {
    throw new Error('Select a staff member first.');
  }

  const openDocSnapshot = await findOpenAttendanceDoc(userId);

  if (!openDocSnapshot) {
    throw new Error('No active shift found for this staff member.');
  }

  const attendanceData = openDocSnapshot.data() as AttendanceDoc;
  if (storeId && attendanceData.storeId !== storeId) {
    throw new Error('Active shift belongs to another store.');
  }

  const now = serverTimestamp();
  await runTransaction(firestore(), async (transaction) => {
    const docRef = openDocSnapshot.ref;
    const freshSnapshot = await transaction.get(docRef);

    if (!freshSnapshot.exists()) {
      throw new Error('Attendance record no longer exists.');
    }

    const data = freshSnapshot.data() as AttendanceDoc;
    const breaks: AttendanceBreakDoc[] = (data.breaks ?? []).map((breakItem) => ({
      start: breakItem.start,
      end: breakItem.end ?? null,
    }));

    if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
      breaks[breaks.length - 1] = {
        ...breaks[breaks.length - 1],
        end: now,
      };
    } else {
      breaks.push({ start: now, end: null });
    }

    transaction.update(docRef, {
      breaks,
      updatedAt: now,
    });
  });
};

export const kioskClockOut = async (userId: string, storeId?: string): Promise<void> => {
  if (!userId) {
    throw new Error('Select a staff member first.');
  }

  const openDocSnapshot = await findOpenAttendanceDoc(userId);

  if (!openDocSnapshot) {
    throw new Error('No active shift found for this staff member.');
  }

  const attendanceData = openDocSnapshot.data() as AttendanceDoc;
  if (storeId && attendanceData.storeId !== storeId) {
    throw new Error('Active shift belongs to another store.');
  }

  const now = serverTimestamp();
  await runTransaction(firestore(), async (transaction) => {
    const docRef = openDocSnapshot.ref;
    const freshSnapshot = await transaction.get(docRef);

    if (!freshSnapshot.exists()) {
      throw new Error('Attendance record no longer exists.');
    }

    const data = freshSnapshot.data() as AttendanceDoc;
    const breaks: AttendanceBreakDoc[] = (data.breaks ?? []).map((breakItem) => ({
      start: breakItem.start,
      end: breakItem.end ?? null,
    }));

    if (breaks.length > 0 && !breaks[breaks.length - 1].end) {
      breaks[breaks.length - 1] = {
        ...breaks[breaks.length - 1],
        end: now,
      };
    }

    transaction.update(docRef, {
      clockOut: now,
      status: 'closed',
      breaks,
      updatedAt: now,
    });
  });
};

export const getLatestAttendanceForUser = async (
  userId: string,
  storeId: string,
): Promise<Attendance | null> => {
  if (!userId || !storeId) {
    return null;
  }

  const latestQuery = query(
    getAttendancesCollection(),
    where('userId', '==', userId),
    where('storeId', '==', storeId),
    orderBy('clockIn', 'desc'),
    limit(1),
  );

  const snapshot = await getDocs(latestQuery);
  if (snapshot.empty) {
    return null;
  }

  const docSnapshot = snapshot.docs[0];
  return mapAttendance(docSnapshot.id, docSnapshot.data() as AttendanceDoc);
};






