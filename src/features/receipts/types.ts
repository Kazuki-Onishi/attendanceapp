import type { Timestamp } from 'firebase/firestore';

export type ReceiptMethod = 'cash' | 'card' | 'qr' | 'transfer';
export type ReceiptStatus = 'draft' | 'locked';

export type ReceiptImage = {
  path: string;
  width?: number | null;
  height?: number | null;
};

export interface Receipt {
  id: string;
  storeId: string;
  paidAt: string;
  amount: number;
  currency: string;
  method: ReceiptMethod;
  vendorId?: string | null;
  vendorName?: string | null;
  status: ReceiptStatus;
  images: ReceiptImage[];
  notes?: string | null;
  createdBy?: string | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface Vendor {
  id: string;
  storeId: string;
  name: string;
  category?: string | null;
  isActive: boolean;
  updatedAt?: Timestamp | null;
}
