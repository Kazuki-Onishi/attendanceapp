import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type StoreAuthMode = 'kiosk' | null;

export interface StoreAuthState {
  storeId: string | null;
  storeName: string | null;
  mode: StoreAuthMode;
}

const initialState: StoreAuthState = {
  storeId: null,
  storeName: null,
  mode: null,
};

const storeAuthSlice = createSlice({
  name: 'storeAuth',
  initialState,
  reducers: {
    setKioskSession(state, action: PayloadAction<{ storeId: string; storeName: string }>) {
      state.storeId = action.payload.storeId;
      state.storeName = action.payload.storeName;
      state.mode = 'kiosk';
    },
    clearKioskSession(state) {
      state.storeId = null;
      state.storeName = null;
      state.mode = null;
    },
  },
});

export const { setKioskSession, clearKioskSession } = storeAuthSlice.actions;
export default storeAuthSlice.reducer;
