import React, { useEffect, useRef } from 'react';
import { onAuthStateChanged, type Unsubscribe } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

import { auth, firestore } from '@/lib/firebase';
import { listUserStoreRoles, listStoresForUser, type UserStoreRole } from '@/features/stores/api';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  clearUserStoreRoles,
  setError,
  setStatus,
  setUser,
  setUserStoreRoles,
} from '@/store/slices/authSlice';
import {
  clearAvailableStores,
  clearSelectedStore,
  setAvailableStores,
  setSelectedStoreId,
} from '@/store/slices/storeSlice';
import { resetActiveView } from '@/store/slices/appViewSlice';

interface Props {
  children: React.ReactNode;
}

const mapRoleSnapshot = (role: unknown, id: string): UserStoreRole | null => {
  if (!role || typeof role !== 'object') {
    return null;
  }
  const data = role as Record<string, unknown>;
  const userId = typeof data.userId === 'string' ? data.userId : null;
  const storeId = typeof data.storeId === 'string' ? data.storeId : null;
  const roleName = typeof data.role === 'string' ? (data.role as UserStoreRole['role']) : 'staff';
  const isResigned = data.isResigned === true;
  if (!userId || !storeId || isResigned) {
    return null;
  }
  return {
    id,
    storeId,
    role: roleName,
    isResigned: false,
    hourlyWage: typeof data.hourlyWage === 'number' ? (data.hourlyWage as number) : null,
  };
};

const AuthBootstrapper: React.FC<Props> = ({ children }) => {
  const dispatch = useAppDispatch();
  const selectedStoreId = useAppSelector((state) => state.store.selectedStoreId);
  const selectedStoreIdRef = useRef<string | null>(selectedStoreId);

  useEffect(() => {
    selectedStoreIdRef.current = selectedStoreId;
  }, [selectedStoreId]);

  useEffect(() => {
    let unsubscribeAuth: Unsubscribe | undefined;
    let unsubscribeRoles: Unsubscribe | undefined;
    let isMounted = true;

    const refreshStoresForUser = async (uid: string) => {
      try {
        const stores = await listStoresForUser(uid);
        if (!isMounted) {
          return;
        }
        dispatch(setAvailableStores(stores));
        if (stores.length === 0) {
          dispatch(clearSelectedStore());
          return;
        }

        const currentSelected = selectedStoreIdRef.current;
        if (!currentSelected || !stores.some((store) => store.id === currentSelected)) {
          if (stores.length === 1) {
            dispatch(setSelectedStoreId(stores[0].id));
          }
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Failed to load stores.';
        dispatch(setError(message));
      }
    };

    const bootstrapAuth = async () => {
      dispatch(setStatus('loading'));
      try {
        const firebaseAuth = auth();

        unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
          if (!isMounted) {
            return;
          }

          if (!firebaseUser) {
            if (unsubscribeRoles) {
              unsubscribeRoles();
              unsubscribeRoles = undefined;
            }
            dispatch(setUser(null));
            dispatch(clearUserStoreRoles());
            dispatch(clearSelectedStore());
            dispatch(clearAvailableStores());
            dispatch(resetActiveView());
            dispatch(setStatus('idle'));
            return;
          }

          dispatch(setStatus('loading'));
          dispatch(
            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName,
            }),
          );

          const db = firestore();
          const rolesRef = collection(db, 'userStoreRoles');
          const rolesQuery = query(rolesRef, where('userId', '==', firebaseUser.uid));

          if (unsubscribeRoles) {
            unsubscribeRoles();
            unsubscribeRoles = undefined;
          }

          unsubscribeRoles = onSnapshot(
            rolesQuery,
            async (snapshot) => {
              if (!isMounted) {
                return;
              }

              const roles = snapshot.docs
                .map((docSnapshot) => mapRoleSnapshot(docSnapshot.data(), docSnapshot.id))
                .filter((role): role is UserStoreRole => Boolean(role));

              dispatch(setUserStoreRoles(roles));
              dispatch(setError(null));
              dispatch(setStatus('authenticated'));

              if (roles.length > 0) {
                await refreshStoresForUser(firebaseUser.uid);
              } else {
                dispatch(clearAvailableStores());
                dispatch(clearSelectedStore());
                dispatch(resetActiveView());
              }
            },
            (error) => {
              if (!isMounted) {
                return;
              }
              const message = error.message ?? 'Failed to load user roles.';
              dispatch(setUserStoreRoles([]));
              dispatch(setError(message));
              dispatch(clearAvailableStores());
              dispatch(clearSelectedStore());
              dispatch(resetActiveView());
              dispatch(setStatus('authenticated'));
            },
          );

          try {
            // Initial load
            const roles = await listUserStoreRoles(firebaseUser.uid);
            if (!isMounted) {
              return;
            }
            dispatch(setUserStoreRoles(roles));
            dispatch(setError(null));
            dispatch(setStatus('authenticated'));
            if (roles.length > 0) {
              await refreshStoresForUser(firebaseUser.uid);
            } else {
              dispatch(clearAvailableStores());
              dispatch(clearSelectedStore());
              dispatch(resetActiveView());
            }
          } catch (roleError) {
            if (!isMounted) {
              return;
            }
            const message =
              roleError instanceof Error ? roleError.message : 'Failed to load user roles.';
            dispatch(setUserStoreRoles([]));
            dispatch(setError(message));
            dispatch(clearAvailableStores());
            dispatch(clearSelectedStore());
            dispatch(resetActiveView());
            dispatch(setStatus('authenticated'));
          }
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Failed to initialise authentication.';
        dispatch(setUser(null));
        dispatch(clearUserStoreRoles());
        dispatch(clearSelectedStore());
        dispatch(clearAvailableStores());
        dispatch(setError(message));
        dispatch(resetActiveView());
        dispatch(setStatus('error'));
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
      if (unsubscribeAuth) {
        unsubscribeAuth();
      }
      if (unsubscribeRoles) {
        unsubscribeRoles();
      }
    };
  }, [dispatch]);

  return <>{children}</>;
};

export default AuthBootstrapper;
