import { PayloadAction, createSlice } from '@reduxjs/toolkit';

import type { Store } from '@/features/stores/api';

export interface StoreState {
  selectedStoreId: string | null;
  availableStores: Store[];
  availableStoreIds: string[];
}

const initialState: StoreState = {
  selectedStoreId: null,
  availableStores: [],
  availableStoreIds: [],
};

const storeSlice = createSlice({
  name: 'store',
  initialState,
  reducers: {
    setSelectedStoreId(state, action: PayloadAction<string>) {
      state.selectedStoreId = action.payload;
    },
    clearSelectedStore(state) {
      state.selectedStoreId = null;
    },
    setAvailableStores(state, action: PayloadAction<Store[]>) {
      state.availableStores = action.payload;
      state.availableStoreIds = action.payload.map((store) => store.id);
    },
    clearAvailableStores(state) {
      state.availableStores = [];
      state.availableStoreIds = [];
    },
  },
});

export const { setSelectedStoreId, clearSelectedStore, setAvailableStores, clearAvailableStores } = storeSlice.actions;
export default storeSlice.reducer;
