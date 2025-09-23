export interface WageSource {
  storeId?: string | null;
  hourlyWage?: number | null;
  wage?: number | null;
  hourlyWageOverride?: number | null;
  defaultHourlyWage?: number | null;
  baseHourlyWage?: number | null;
  hourlyWageOverrides?: Record<string, number | null | undefined>;
  wagesByStore?: Record<string, number | null | undefined>;
  storeHourlyWages?: Record<string, number | null | undefined>;
}

const readWage = (value: unknown): number | null => {
  if (typeof value !== 'number') {
    return null;
  }
  if (!Number.isFinite(value)) {
    return null;
  }
  return value;
};

const wageFromMap = (
  source: WageSource | null | undefined,
  storeId: string | null | undefined,
): number | null => {
  if (!source || !storeId) {
    return null;
  }

  const candidates = [source.hourlyWageOverrides, source.wagesByStore, source.storeHourlyWages];
  for (const map of candidates) {
    if (map && Object.prototype.hasOwnProperty.call(map, storeId)) {
      const wage = readWage(map[storeId]);
      if (wage !== null) {
        return wage;
      }
    }
  }
  return null;
};

const resolveStoreId = (
  member: WageSource | null | undefined,
  personal: WageSource | null | undefined,
  store: WageSource | null | undefined,
): string | null => {
  if (member?.storeId) {
    return member.storeId;
  }
  if (personal?.storeId) {
    return personal.storeId;
  }
  if (store?.storeId) {
    return store.storeId;
  }
  if (typeof (store as { id?: string } | undefined)?.id === 'string') {
    return (store as { id?: string }).id ?? null;
  }
  return null;
};

export const resolveEffectiveWage = (
  member?: WageSource | null,
  personal?: WageSource | null,
  store?: WageSource | null,
): number => {
  const storeId = resolveStoreId(member, personal, store);

  const candidates: Array<number | null> = [
    wageFromMap(personal, storeId),
    readWage(personal?.hourlyWageOverride),
    readWage(personal?.hourlyWage),
    readWage(personal?.wage),
    wageFromMap(member, storeId),
    readWage(member?.hourlyWageOverride),
    readWage(member?.hourlyWage),
    readWage(member?.wage),
    readWage(store?.defaultHourlyWage),
    readWage(store?.hourlyWage),
    readWage(store?.baseHourlyWage),
  ];

  for (const wage of candidates) {
    if (wage !== null && wage !== undefined) {
      return wage;
    }
  }

  return 0;
};
