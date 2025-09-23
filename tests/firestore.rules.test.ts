/** @jest-environment node */

import { beforeAll, afterAll, beforeEach, describe, it, jest } from '@jest/globals';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';

describe('firestore security rules - approvals', () => {
  jest.setTimeout(20000);

  let testEnv: import('@firebase/rules-unit-testing').RulesTestEnvironment;

  const loadDb = (uid: string) => testEnv.authenticatedContext(uid).firestore();

  const withAdminContext = (callback: (db: ReturnType<typeof loadDb>) => Promise<void>) =>
    testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await callback(db);
    });

  const seedRole = async (uid: string, storeId: string, role: string) => {
    await withAdminContext(async (db) => {
      await setDoc(doc(db, 'userStoreRoles', `${uid}_${storeId}`), {
        userId: uid,
        storeId,
        role,
        isResigned: false,
      });
    });
  };

  const seedApproval = async (id: string, data: Record<string, unknown>) => {
    await withAdminContext(async (db) => {
      await setDoc(doc(db, 'approvals', id), data);
    });
  };

  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'rules-tests',
      firestore: {
        rules: readFileSync('firebase/firestore.rules', 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('allows senior role to create employment change approvals', async () => {
    await seedRole('U_senior', 'S1', 'senior');
    const db = loadDb('U_senior');
    const ref = doc(db, 'approvals', 'AP_EMP_1');
    await assertSucceeds(
      setDoc(ref, {
        type: 'employment_change',
        status: 'pending',
        storeId: 'S1',
        title: 'Employment change',
        submittedBy: 'U_senior',
        submittedAt: Timestamp.now(),
        commentRequired: false,
        payload: {},
      }),
    );
  });

  it('blocks staff role from creating employment change approvals', async () => {
    await seedRole('U_staff', 'S1', 'staff');
    const db = loadDb('U_staff');
    const ref = doc(db, 'approvals', 'AP_EMP_2');
    await assertFails(
      setDoc(ref, {
        type: 'employment_change',
        status: 'pending',
        storeId: 'S1',
        title: 'Employment change',
        submittedBy: 'U_staff',
        submittedAt: Timestamp.now(),
        commentRequired: false,
        payload: {},
      }),
    );
  });

  it('allows only admin/owner to approve employment change', async () => {
    await seedRole('U_admin', 'S1', 'admin');
    await seedRole('U_manager', 'S1', 'manager');

    await seedApproval('EMP_PENDING', {
      type: 'employment_change',
      status: 'pending',
      storeId: 'S1',
      title: 'Employment change',
      submittedBy: 'U_senior',
      submittedAt: Timestamp.now(),
      commentRequired: false,
      payload: {},
    });

    await assertSucceeds(
      updateDoc(doc(loadDb('U_admin'), 'approvals', 'EMP_PENDING'), {
        status: 'approved',
        decidedBy: 'U_admin',
        decidedAt: Timestamp.now(),
        comment: null,
      }),
    );

    await assertFails(
      updateDoc(doc(loadDb('U_manager'), 'approvals', 'EMP_PENDING'), {
        status: 'approved',
        decidedBy: 'U_manager',
        decidedAt: Timestamp.now(),
        comment: null,
      }),
    );
  });

  it('allows managers to reject commute update approvals', async () => {
    await seedRole('U_manager', 'S1', 'manager');

    await seedApproval('COMM_PENDING', {
      type: 'commute_update',
      status: 'pending',
      storeId: 'S1',
      title: 'Commute update',
      submittedBy: 'U_senior',
      submittedAt: Timestamp.now(),
      commentRequired: false,
      payload: {},
    });

    await assertSucceeds(
      updateDoc(doc(loadDb('U_manager'), 'approvals', 'COMM_PENDING'), {
        status: 'rejected',
        decidedBy: 'U_manager',
        decidedAt: Timestamp.now(),
        comment: 'Missing receipt',
      }),
    );
  });
});
