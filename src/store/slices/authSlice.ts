import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import type { UserStoreRole } from '@/features/stores/api';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'error';

export interface AuthUser {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  roles: UserStoreRole[];
  error?: string | null;
}

const initialState: AuthState = {
  user: null,
  status: 'loading',
  roles: [],
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      if (!action.payload) {
        state.roles = [];
      }
      state.error = null;
    },
    setStatus(state, action: PayloadAction<AuthStatus>) {
      state.status = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setUserStoreRoles(state, action: PayloadAction<UserStoreRole[]>) {
      state.roles = action.payload;
    },
    clearUserStoreRoles(state) {
      state.roles = [];
    },
  },
});

export const { setUser, setStatus, setError, setUserStoreRoles, clearUserStoreRoles } = authSlice.actions;
export default authSlice.reducer;
