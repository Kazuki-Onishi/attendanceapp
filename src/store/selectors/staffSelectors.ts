import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/store';

export interface StaffStoreContextState {
  availableStoreIds: string[];
  selectedStoreId: string | null;
  hasAvailableStore: boolean;
  isStoreSelected: boolean;
  needsStoreSelection: boolean;
}

const selectStoreState = (state: RootState) =>
  state.store ?? { selectedStoreId: null, availableStores: [], availableStoreIds: [] };
const selectAuthRoles = (state: RootState) => state.auth?.roles ?? [];

const selectActiveRoles = createSelector([selectAuthRoles], (roles) =>
  roles.filter((role) => role.storeId && role.isResigned !== true),
);

const selectDerivedStoreIdsFromRoles = createSelector([selectActiveRoles], (roles) =>
  roles.map((role) => role.storeId),
);

export const selectAvailableStoreIds = createSelector(
  [selectStoreState, selectDerivedStoreIdsFromRoles],
  (storeState, derivedStoreIds) => {
    if ((storeState.availableStoreIds ?? []).length > 0) {
      return storeState.availableStoreIds ?? [];
    }
    return derivedStoreIds;
  },
);

export const selectHasAvailableStore = createSelector(
  [selectAvailableStoreIds],
  (storeIds) => storeIds.length > 0,
);

const selectRawSelectedStoreId = createSelector([selectStoreState], (store) => store.selectedStoreId);

export const selectResolvedSelectedStoreId = createSelector(
  [selectRawSelectedStoreId, selectAvailableStoreIds],
  (selectedStoreId, availableStoreIds) => {
    if (!selectedStoreId) {
      return null;
    }
    return availableStoreIds.includes(selectedStoreId) ? selectedStoreId : null;
  },
);

export const selectIsStoreSelected = createSelector(
  [selectResolvedSelectedStoreId],
  (resolvedStoreId) => resolvedStoreId !== null,
);

export const selectNeedsStoreSelection = createSelector(
  [selectHasAvailableStore, selectIsStoreSelected],
  (hasAvailableStore, isStoreSelected) => hasAvailableStore && !isStoreSelected,
);

export const selectStaffStoreContext = createSelector(
  [selectAvailableStoreIds, selectResolvedSelectedStoreId, selectHasAvailableStore, selectNeedsStoreSelection],
  (availableStoreIds, resolvedStoreId, hasAvailableStore, needsStoreSelection): StaffStoreContextState => ({
    availableStoreIds,
    selectedStoreId: resolvedStoreId,
    hasAvailableStore,
    isStoreSelected: resolvedStoreId !== null,
    needsStoreSelection,
  }),
);
