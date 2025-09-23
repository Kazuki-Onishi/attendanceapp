export type AppRole =
  | 'staff'
  | 'employee'
  | 'senior'
  | 'manager'
  | 'admin'
  | 'owner'
  | 'kiosk';

export type RoleCapability =
  | 'approve_attendance'
  | 'approve_receipt'
  | 'approve_join_store'
  | 'approve_employment'
  | 'approve_allowance'
  | 'approve_commute'
  | 'request_employment'
  | 'request_allowance'
  | 'request_commute'
  | 'request_join_store';

const ROLE_RANKS: Record<AppRole, number> = {
  staff: 1,
  employee: 2,
  senior: 3,
  manager: 4,
  admin: 5,
  owner: 6,
  kiosk: 0,
};

const CAPABILITY_RANKS: Record<RoleCapability, number> = {
  approve_attendance: 4,
  approve_receipt: 4,
  approve_join_store: 4,
  approve_employment: 5,
  approve_allowance: 4,
  approve_commute: 4,
  request_employment: 3,
  request_allowance: 3,
  request_commute: 3,
  request_join_store: 1,
};

export const rankOfRole = (role: string | null | undefined): number => {
  if (!role) {
    return 0;
  }
  const normalized = role as AppRole;
  return ROLE_RANKS[normalized] ?? 0;
};

export const hasCapability = (
  role: string | null | undefined,
  capability: RoleCapability,
): boolean => {
  const requiredRank = CAPABILITY_RANKS[capability] ?? Number.POSITIVE_INFINITY;
  return rankOfRole(role) >= requiredRank;
};

export const roleForStore = (
  rolesByStore: Record<string, string> | undefined,
  storeId?: string | null,
): string | null => {
  if (!rolesByStore || !storeId) {
    return null;
  }
  return rolesByStore[storeId] ?? null;
};

export const isAdminRole = (role: string | null | undefined): boolean => {
  return rankOfRole(role) >= 4;
};

export const isOwnerRole = (role: string | null | undefined): boolean => role === 'owner';

export const isKioskRole = (role: string | null | undefined): boolean => role === 'kiosk';
