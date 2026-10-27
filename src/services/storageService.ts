import { PendingSyncOperation } from '../types/database';

/**
 * خدمة التخزين المحلي والبيانات المؤقتة
 * طبقة مستقلة تتيح الاستبدال السلس لـ Supabase غداً دون المساس بالواجهات
 */

const STORAGE_KEYS = {
  USER: 'aman_user',
  WORKSPACE: 'aman_workspace',
  WORKSPACES_ALL: 'aman_workspaces_all',
  MEMBERS: 'aman_workspace_members',
  STATIONS: 'aman_stations',
  STATION_WORKERS: 'aman_station_workers',
  CURRENCIES: 'aman_currencies',
  TRANSACTIONS: 'aman_transactions',
  PARCELS: 'ittihadiya_parcels',
  TRIPS: 'ittihadiya_trips',
  DRIVERS: 'ittihadiya_drivers',
  PLATES: 'ittihadiya_plates',
  SUBSCRIPTION: 'aman_subscription',
  SUBSCRIPTIONS_ALL: 'aman_subscriptions_all',
  AUDIT_LOGS: 'aman_audit_logs',
  JOIN_REQUESTS: 'aman_join_requests',
  RESET_REQUESTS: 'aman_password_reset_requests',
  COLLABORATIONS: 'aman_collaborations',
  RATE: 'ittihadiya_rate',
  PARCEL_COUNTER: 'ittihadiya_parcel_counter',
  TRIP_COUNTER: 'ittihadiya_trip_counter',
  PENDING_SYNC: 'alittihadia_pending_sync_v1',
} as const;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value?: string | null): boolean {
  if (!value) return false;
  return UUID_REGEX.test(value.trim());
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const storageService = {
  get<T>(key: keyof typeof STORAGE_KEYS, defaultValue: T): T {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS[key]);
      if (!saved) return defaultValue;
      return JSON.parse(saved) as T;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: keyof typeof STORAGE_KEYS, value: T): void {
    try {
      if (value === null || value === undefined) {
        localStorage.removeItem(STORAGE_KEYS[key]);
      } else {
        localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
      }
    } catch (e) {
      console.warn(`Failed to save to localStorage (${key}):`, e);
    }
  },

  remove(key: keyof typeof STORAGE_KEYS): void {
    try {
      localStorage.removeItem(STORAGE_KEYS[key]);
    } catch {}
  },

  clearAllWorkspaceData(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
      localStorage.removeItem(STORAGE_KEYS.PARCELS);
      localStorage.removeItem(STORAGE_KEYS.AUDIT_LOGS);
      localStorage.removeItem(STORAGE_KEYS.PARCEL_COUNTER);
    } catch {}
  },

  getPendingSync(service?: PendingSyncOperation['service']): PendingSyncOperation[] {
    const all = this.get<PendingSyncOperation[]>('PENDING_SYNC', []);
    if (!service) return all;
    return all.filter(item => item.service === service);
  },

  enqueuePendingSync(op: Omit<PendingSyncOperation, 'id' | 'createdAt'>): PendingSyncOperation {
    const all = this.get<PendingSyncOperation[]>('PENDING_SYNC', []);
    const entry: PendingSyncOperation = {
      ...op,
      id: generateUUID(),
      createdAt: new Date().toISOString(),
    };
    const filtered = all.filter(
      existing =>
        !(
          existing.table === op.table &&
          existing.recordId === op.recordId &&
          existing.operation === op.operation
        )
    );
    this.set('PENDING_SYNC', [...filtered, entry]);
    return entry;
  },

  removePendingSync(id: string): void {
    const all = this.get<PendingSyncOperation[]>('PENDING_SYNC', []);
    this.set(
      'PENDING_SYNC',
      all.filter(item => item.id !== id)
    );
  },
};
