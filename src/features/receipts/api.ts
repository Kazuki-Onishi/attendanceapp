import {
  collection,
  doc,
  DocumentData,
  DocumentSnapshot,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

import { firestore } from '@/lib/firebase';

import type { Receipt, ReceiptImage, ReceiptStatus, Vendor } from './types';

type ReceiptDoc = {
  storeId?: string;
  paidAt?: string;
  amount?: number;
  currency?: string;
  method?: string;
  vendorId?: string | null;
  vendorName?: string | null;
  status?: string;
  images?: Array<{
    path?: string;
    w?: number | null;
    h?: number | null;
  }>;
  notes?: string | null;
  createdBy?: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type VendorDoc = {
  storeId?: string;
  name?: string;
  category?: string | null;
  isActive?: boolean;
  updatedAt?: unknown;
};

const receiptsCollection = () => collection(firestore(), 'receipts');
const vendorsCollection = () => collection(firestore(), 'vendors');

export const receiptDoc = (id: string) => doc(receiptsCollection(), id);
export const vendorDoc = (id: string) => doc(vendorsCollection(), id);

const mapReceiptImage = (input: { path?: string; w?: number | null; h?: number | null } | null | undefined): ReceiptImage | null => {
  if (!input?.path) {
    return null;
  }
  return {
    path: input.path,
    width: input.w ?? null,
    height: input.h ?? null,
  };
};

export const mapReceipt = (snapshot: DocumentSnapshot<DocumentData>): Receipt | null => {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data() as ReceiptDoc;
  if (!data.storeId || !data.paidAt) {
    return null;
  }
  const images = (data.images ?? [])
    .map((item) => mapReceiptImage(item))
    .filter((item): item is ReceiptImage => Boolean(item));

  return {
    id: snapshot.id,
    storeId: data.storeId,
    paidAt: data.paidAt,
    amount: data.amount ?? 0,
    currency: data.currency ?? 'JPY',
    method: (data.method ?? 'cash') as Receipt['method'],
    vendorId: data.vendorId ?? null,
    vendorName: data.vendorName ?? null,
    status: (data.status ?? 'draft') as ReceiptStatus,
    images,
    notes: data.notes ?? null,
    createdBy: data.createdBy ?? null,
    createdAt: (data.createdAt ?? null) as Receipt['createdAt'],
    updatedAt: (data.updatedAt ?? null) as Receipt['updatedAt'],
  };
};

export const mapVendor = (snapshot: DocumentSnapshot<DocumentData>): Vendor | null => {
  if (!snapshot.exists()) {
    return null;
  }
  const data = snapshot.data() as VendorDoc;
  if (!data.storeId || !data.name) {
    return null;
  }
  return {
    id: snapshot.id,
    storeId: data.storeId,
    name: data.name,
    category: data.category ?? null,
    isActive: data.isActive ?? true,
    updatedAt: (data.updatedAt ?? null) as Vendor['updatedAt'],
  };
};

export const fetchReceipt = async (id: string): Promise<Receipt | null> => {
  const snapshot = await getDoc(receiptDoc(id));
  return mapReceipt(snapshot);
};

export const listVendors = async (storeId: string): Promise<Vendor[]> => {
  if (!storeId) {
    return [];
  }
  const snapshot = await getDocs(
    query(vendorsCollection(), where('storeId', '==', storeId), orderBy('name', 'asc')),
  );
  return snapshot.docs
    .map((docSnapshot) => mapVendor(docSnapshot))
    .filter((vendor): vendor is Vendor => Boolean(vendor));
};

export const saveVendor = async (
  storeId: string,
  vendorId: string,
  name: string,
  category: string | null,
): Promise<void> => {
  const docRef = vendorDoc(vendorId);
  await setDoc(
    docRef,
    {
      storeId,
      name,
      category: category ?? null,
      isActive: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const deactivateVendor = async (vendorId: string): Promise<void> => {
  await updateDoc(vendorDoc(vendorId), {
    isActive: false,
    updatedAt: serverTimestamp(),
  });
};

