export type ProductCategory = 'phone' | 'accessory' | 'tv' | 'trotinette' | 'other';

export type IMEIStatus = 'in_stock' | 'sold' | 'returned';

export interface IMEIItem {
  imei: string;
  status: IMEIStatus;
  soldAt?: string;
  bonNumber?: string;
}

export interface Product {
  id?: number;
  name: string;
  category: ProductCategory;
  image?: string; // base64, compressed <= 400px
  purchasePrice: number;
  retailPrice: number;
  wholesalePrice: number;
  quantity: number;
  supplierId?: number;
  imeiList: IMEIItem[];
  barcode?: string;
  createdAt: string;
  notes?: string;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  totalDebt: number; // What we owe to supplier
  paidAmount: number; // What we have paid
}

export interface SupplierPayment {
  id?: number;
  supplierId: number;
  amount: number;
  date: string;
  note?: string;
}

export type CustomerType = 'wholesale' | 'retail';

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  CIN?: string;
  address?: string;
  customerType?: CustomerType; // 'wholesale' (Grossiste) or 'retail' (Détaillant)
  creditLimit?: number; // Optional credit ceiling in DH
  totalCredit: number; // Balance owed to shop
}

export interface Installment {
  id: string; // unique identifier
  amount: number;
  dueDate: string; // YYYY-MM-DD
  paid: boolean;
  paidAt?: string;
  note?: string;
}

export type PaymentMethod = 'cash' | 'cheque' | 'transfer' | 'other';

export interface CustomerPayment {
  id?: number;
  customerId: number;
  saleId?: number; // if applied to a specific bon
  amount: number;
  date: string;
  note?: string;
  paymentMethod?: PaymentMethod;
  status?: 'active' | 'cancelled';
  cancellationReason?: string;
  cancelledAt?: string;
}

export type CreditAuditAction = 'create' | 'edit' | 'cancel';
export type CreditAuditEntity = 'payment' | 'due_date' | 'installment' | 'credit_limit';

export interface CreditAuditLog {
  id?: number;
  customerId: number;
  customerName: string;
  saleId?: number;
  bonNumber?: string;
  entityType: CreditAuditEntity;
  action: CreditAuditAction;
  oldValue: string;
  newValue: string;
  reason: string;
  date: string; // ISO date-time string
}

export type PriceType = 'retail' | 'wholesale';
export type PaymentType = 'cash' | 'credit' | 'installment';
export type SaleStatus = 'active' | 'returned' | 'partially_returned';

export interface SaleItem {
  productId: number;
  name: string;
  category: ProductCategory;
  imei?: string;
  quantity: number;
  price: number; // Actual sold unit price (customizable per sale)
  originalPrice?: number; // Catalog retail or wholesale price
  costPrice: number;
  type: PriceType;
  isReturned?: boolean;
}

export interface Sale {
  id?: number;
  bonNumber: string; // Format: G-0001
  customerId?: number;
  customerName: string;
  customerPhone?: string;
  items: SaleItem[];
  subtotal?: number; // Total items before discount
  discountAmount?: number; // Total discount amount in DH
  discountType?: 'fixed' | 'percent';
  discountValue?: number; // Raw entered discount value (DH or %)
  totalAmount: number; // Final net total after discount
  paidAmount: number;
  remainingAmount: number;
  paymentType: PaymentType;
  dueDate?: string; // Optional payment due date (YYYY-MM-DD)
  installments?: Installment[]; // Optional manual/automatic installments schedule
  hasWarranty?: boolean; // Whether warranty was selected for this sale
  warrantyMonths: number; // 0 if no warranty, or >= 1
  date: string;
  notes?: string;
  status: SaleStatus;
}

export type WarrantyStatus = 'active' | 'expired' | 'void';

export interface Warranty {
  id?: number;
  saleId: number;
  bonNumber: string;
  productId: number;
  productName: string;
  imei?: string;
  customerName: string;
  customerPhone?: string;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
}

export type SavTicketStatus = 'open' | 'in_progress' | 'resolved';

export interface SavTicket {
  id?: number;
  warrantyId?: number;
  bonNumber?: string;
  imei?: string;
  customerName: string;
  customerPhone?: string;
  productName?: string;
  issue: string;
  status: SavTicketStatus;
  createdAt: string;
  resolvedAt?: string;
  cost?: number;
  resolutionNotes?: string;
}

export interface StoreSettings {
  storeName: string;
  storeSubtitle?: string;
  logo?: string;
  address: string;
  phone: string;
  ice?: string; // Identifiant Commun de l'Entreprise
  rc?: string;
  defaultWarrantyMonths: number;
  language: 'ar' | 'fr';
  theme: 'dark' | 'light';
  lastBackupDate?: string;
}

export type AppTab = 
  | 'dashboard' 
  | 'stock' 
  | 'pos' 
  | 'bons' 
  | 'warranty' 
  | 'customers' 
  | 'suppliers' 
  | 'settings';
