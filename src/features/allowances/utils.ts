import { Timestamp } from 'firebase/firestore';

import type { AllowanceAssignment, AllowanceMaster } from './types';

const readString = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return null;
};

const readNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const readBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (value === 'true') {
      return true;
    }
    if (value === 'false') {
      return false;
    }
  }
  return null;
};

const readDateString = (value: unknown): string | null => {
  const str = readString(value);
  if (str) {
    return str;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return null;
};

const readTimestamp = (value: unknown): Date | null => {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  if (value instanceof Date) {
    return value;
  }
  return null;
};

const normaliseSearchSource = (parts: Array<string | null | undefined>): string => {
  return parts
    .flatMap((part) => {
      if (!part) {
        return [];
      }
      return part.split(/\s+/);
    })
    .map((part) => part.toLowerCase())
    .join(' ')
    .trim();
};

export const mapAllowanceMaster = (id: string, data: Record<string, unknown>): AllowanceMaster => {
  const name = readString(data.name);
  const kana = readString(data.kana ?? data.nameKana ?? data.furigana ?? data.yomi);
  const searchTokens = normaliseSearchSource([
    name,
    readString(data.code),
    readString(data.slug),
    readString(data.keywords),
    kana,
    ...(Array.isArray(data.tags) ? data.tags.map((item) => (typeof item === 'string' ? item : null)) : []),
  ]);

  return {
    id,
    storeId: readString(data.storeId),
    name,
    searchName: searchTokens,
    calcType: (typeof data.calcType === 'string' ? data.calcType : null),
    defaultAmount: readNumber(data.defaultAmount),
    active: readBoolean(data.active),
    effectiveFrom: readDateString(data.effectiveFrom),
    effectiveTo: readDateString(data.effectiveTo),
    raw: data,
  };
};

export const mapAllowanceAssignment = (
  id: string,
  data: Record<string, unknown>,
): AllowanceAssignment => {
  return {
    id,
    storeId: readString(data.storeId),
    roleDocId: readString(data.roleDocId),
    userId: readString(data.userId),
    name: readString(data.name),
    status: readString(data.status),
    masterId: readString(data.masterId),
    amount: readNumber(data.amount),
    taxExempt: readBoolean(data.taxExempt),
    note: readString(data.note),
    effectiveFrom: readDateString(data.effectiveFrom),
    effectiveTo: readDateString(data.effectiveTo),
    updatedAt: readTimestamp(data.updatedAt),
    raw: data,
  };
};

export const buildAssignmentMap = (
  assignments: AllowanceAssignment[],
): { byId: Record<string, AllowanceAssignment>; byUser: Record<string, AllowanceAssignment[]> } => {
  return assignments.reduce(
    (acc, assignment) => {
      acc.byId[assignment.id] = assignment;
      const userKey = assignment.userId ?? 'unknown';
      if (!acc.byUser[userKey]) {
        acc.byUser[userKey] = [];
      }
      acc.byUser[userKey].push(assignment);
      return acc;
    },
    { byId: {}, byUser: {} } as {
      byId: Record<string, AllowanceAssignment>;
      byUser: Record<string, AllowanceAssignment[]>;
    },
  );
};

export const createAllowanceHelpers = () => ({
  readString,
  readNumber,
  readBoolean,
  readDateString,
  readTimestamp,
  mapAllowanceMaster,
  mapAllowanceAssignment,
  buildAssignmentMap,
});

