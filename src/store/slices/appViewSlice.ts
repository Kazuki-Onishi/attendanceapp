import { PayloadAction, createSlice } from '@reduxjs/toolkit';

export type AppViewMode = 'staff' | 'admin';

export interface AppViewState {
  activeView: AppViewMode;
}

const initialState: AppViewState = {
  activeView: 'staff',
};

const appViewSlice = createSlice({
  name: 'appView',
  initialState,
  reducers: {
    setActiveView(state, action: PayloadAction<AppViewMode>) {
      state.activeView = action.payload;
    },
    resetActiveView(state) {
      state.activeView = 'staff';
    },
  },
});

export const { setActiveView, resetActiveView } = appViewSlice.actions;
export default appViewSlice.reducer;
