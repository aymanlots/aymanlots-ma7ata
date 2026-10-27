import {
  collection,
  doc,
  setDoc,
  getDocs,
  getDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  Unsubscribe
} from 'firebase/firestore';
import { db, auth, isFirebaseConfigured } from '../lib/firebase';
import { Workspace, Station, Parcel, Transaction, Trip, WorkspaceMember } from '../types/database';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export interface CloudUserAccount {
  id: string;
  name: string;
  phone: string;
  whatsapp_number?: string;
  email?: string;
  password?: string;
  role: 'owner' | 'worker';
  workspace_id: string;
  station_id?: string | null;
  must_change_password?: boolean;
  created_at: string;
  updated_at?: string;
}

/**
 * Recursively converts any `undefined` values in objects or arrays to `null`
 * so Firestore `setDoc` never fails with `Unsupported field value: undefined`.
 */
export function sanitizeForFirestore<T>(input: T): T {
  if (input === undefined) {
    return null as unknown as T;
  }
  if (input === null || typeof input !== 'object') {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(input as Record<string, any>)) {
    result[key] = val === undefined ? null : sanitizeForFirestore(val);
  }
  return result as T;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
      tenantId: auth.currentUser?.tenantId || null,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const firebaseSyncService = {
  isAvailable(): boolean {
    return isFirebaseConfigured();
  },

  // 0. USER ACCOUNTS (Cross-Device Phone + Password & Google Gmail Sync)
  async saveUserAccount(docId: string, account: CloudUserAccount): Promise<void> {
    if (!this.isAvailable() || !docId) return;
    const path = `users/${docId}`;
    try {
      await setDoc(
        doc(db, 'users', docId),
        sanitizeForFirestore({
          ...account,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async getUserAccount(docId: string): Promise<CloudUserAccount | null> {
    if (!this.isAvailable() || !docId) return null;
    try {
      const snap = await getDoc(doc(db, 'users', docId));
      if (!snap.exists()) return null;
      return snap.data() as CloudUserAccount;
    } catch (err) {
      console.warn('Firestore getUserAccount warning:', err);
      return null;
    }
  },

  // 1. WORKSPACE SYNC
  async syncWorkspace(ws: Workspace): Promise<void> {
    if (!this.isAvailable()) return;
    const path = `workspaces/${ws.id}`;
    try {
      await setDoc(
        doc(db, 'workspaces', ws.id),
        sanitizeForFirestore({
          id: ws.id,
          short_id: ws.short_id || '',
          invite_code: ws.invite_code || '',
          name: ws.name,
          created_by: ws.created_by || null,
          owner_id: ws.created_by || null,
          owner_phone: ws.owner_phone || null,
          owner_whatsapp: ws.owner_whatsapp || null,
          custom_brand_name: ws.custom_brand_name || null,
          custom_brand_subtitle: ws.custom_brand_subtitle || null,
          custom_brand_phone: ws.custom_brand_phone || null,
          custom_brand_logo_url: ws.custom_brand_logo_url || null,
          plan_tier: ws.plan_tier || 'plan_1_full',
          plan_name: ws.plan_name || 'الباقة الشاملة المفتوحة (30 يوم مجاناً)',
          max_workers: ws.max_workers ?? 999,
          max_stations: ws.max_stations ?? 999,
          max_collaborations: ws.max_collaborations ?? 999,
          last_reset_at: ws.last_reset_at || null,
          created_at: ws.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async syncWorkspaceMember(wsId: string, member: WorkspaceMember): Promise<void> {
    if (!this.isAvailable() || !wsId || !member.user_id) return;
    const path = `workspaces/${wsId}/members/${member.user_id}`;
    try {
      await setDoc(
        doc(db, 'workspaces', wsId, 'members', member.user_id),
        sanitizeForFirestore({
          ...member,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async findWorkspaceByInviteCode(code: string): Promise<Workspace | null> {
    if (!this.isAvailable() || !code) return null;
    try {
      const q = query(collection(db, 'workspaces'), where('invite_code', '==', code.toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return snap.docs[0].data() as Workspace;
    } catch (err) {
      console.warn('Firestore findWorkspaceByInviteCode error:', err);
      return null;
    }
  },

  // 1.b LOAD FULL WORKSPACE ON NEW DEVICE LOGIN
  async loadFullWorkspaceFromCloud(wsId: string): Promise<{
    workspace: Workspace | null;
    stations: Station[];
    parcels: Parcel[];
    transactions: Transaction[];
    trips: Trip[];
    members: WorkspaceMember[];
  }> {
    if (!this.isAvailable() || !wsId) {
      return { workspace: null, stations: [], parcels: [], transactions: [], trips: [], members: [] };
    }
    try {
      const [wsSnap, stSnap, pclSnap, txSnap, trpSnap, memSnap] = await Promise.all([
        getDoc(doc(db, 'workspaces', wsId)),
        getDocs(collection(db, 'workspaces', wsId, 'stations')),
        getDocs(collection(db, 'workspaces', wsId, 'parcels')),
        getDocs(collection(db, 'workspaces', wsId, 'transactions')),
        getDocs(collection(db, 'workspaces', wsId, 'trips')),
        getDocs(collection(db, 'workspaces', wsId, 'members')),
      ]);

      const workspace = wsSnap.exists() ? (wsSnap.data() as Workspace) : null;
      const stations: Station[] = [];
      stSnap.forEach(d => stations.push(d.data() as Station));

      const parcels: Parcel[] = [];
      pclSnap.forEach(d => parcels.push(d.data() as Parcel));

      const transactions: Transaction[] = [];
      txSnap.forEach(d => transactions.push(d.data() as Transaction));

      const trips: Trip[] = [];
      trpSnap.forEach(d => trips.push(d.data() as Trip));

      const members: WorkspaceMember[] = [];
      memSnap.forEach(d => members.push(d.data() as WorkspaceMember));

      return { workspace, stations, parcels, transactions, trips, members };
    } catch (err) {
      console.warn('Firestore loadFullWorkspaceFromCloud warning:', err);
      return { workspace: null, stations: [], parcels: [], transactions: [], trips: [], members: [] };
    }
  },

  // 2. STATIONS SYNC
  async syncStation(wsId: string, station: Station): Promise<void> {
    if (!this.isAvailable() || !wsId || !station?.id) return;
    const path = `workspaces/${wsId}/stations/${station.id}`;
    try {
      await setDoc(
        doc(db, 'workspaces', wsId, 'stations', station.id),
        sanitizeForFirestore({
          ...station,
          workspace_id: wsId,
          team_id: wsId,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteStation(wsId: string, stationId: string): Promise<void> {
    if (!this.isAvailable() || !wsId || !stationId) return;
    const path = `workspaces/${wsId}/stations/${stationId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', wsId, 'stations', stationId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // 3. PARCELS SYNC
  async syncParcel(wsId: string, parcel: Parcel): Promise<void> {
    if (!this.isAvailable() || !wsId || !parcel?.id) return;
    const path = `workspaces/${wsId}/parcels/${parcel.id}`;
    try {
      await setDoc(
        doc(db, 'workspaces', wsId, 'parcels', parcel.id),
        sanitizeForFirestore({
          ...parcel,
          workspace_id: wsId,
          team_id: wsId,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteParcel(wsId: string, parcelId: string): Promise<void> {
    if (!this.isAvailable() || !wsId || !parcelId) return;
    const path = `workspaces/${wsId}/parcels/${parcelId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', wsId, 'parcels', parcelId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // 4. TRANSACTIONS SYNC
  async syncTransaction(wsId: string, tx: Transaction): Promise<void> {
    if (!this.isAvailable() || !wsId || !tx?.id) return;
    const path = `workspaces/${wsId}/transactions/${tx.id}`;
    try {
      await setDoc(
        doc(db, 'workspaces', wsId, 'transactions', tx.id),
        sanitizeForFirestore({
          ...tx,
          workspace_id: wsId,
          team_id: wsId,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteTransaction(wsId: string, txId: string): Promise<void> {
    if (!this.isAvailable() || !wsId || !txId) return;
    const path = `workspaces/${wsId}/transactions/${txId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', wsId, 'transactions', txId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // 5. TRIPS SYNC
  async syncTrip(wsId: string, trip: Trip): Promise<void> {
    if (!this.isAvailable() || !wsId || !trip?.id) return;
    const path = `workspaces/${wsId}/trips/${trip.id}`;
    try {
      await setDoc(
        doc(db, 'workspaces', wsId, 'trips', trip.id),
        sanitizeForFirestore({
          ...trip,
          workspace_id: wsId,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async deleteTrip(wsId: string, tripId: string): Promise<void> {
    if (!this.isAvailable() || !wsId || !tripId) return;
    const path = `workspaces/${wsId}/trips/${tripId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', wsId, 'trips', tripId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  async clearAllWorkspaceData(wsId: string, resetTimestamp?: string): Promise<void> {
    if (!this.isAvailable() || !wsId) return;
    const nowIso = resetTimestamp || new Date().toISOString();
    try {
      await setDoc(
        doc(db, 'workspaces', wsId),
        {
          last_reset_at: nowIso,
          updated_at: nowIso,
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore set last_reset_at warning:', err);
    }

    // Delete transactions, parcels, trips, and stations in parallel so no orphan records remain
    const subcollections = ['transactions', 'parcels', 'trips', 'stations'];
    await Promise.all(
      subcollections.map(async (sub) => {
        const path = `workspaces/${wsId}/${sub}`;
        try {
          const snap = await getDocs(collection(db, 'workspaces', wsId, sub));
          const deletions = snap.docs.map((d) => deleteDoc(d.ref));
          await Promise.all(deletions);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, path);
        }
      })
    );
  },

  // 6. REAL-TIME SUBSCRIPTION FOR WORKSPACE DATA
  subscribeToWorkspace(
    wsId: string,
    callbacks: {
      onWorkspace?: (ws: Workspace | null) => void;
      onStations?: (stations: Station[]) => void;
      onParcels?: (parcels: Parcel[]) => void;
      onTransactions?: (transactions: Transaction[]) => void;
      onTrips?: (trips: Trip[]) => void;
      onMembers?: (members: WorkspaceMember[]) => void;
    }
  ): Unsubscribe {
    if (!this.isAvailable() || !wsId) return () => {};

    const unsubs: Unsubscribe[] = [];

    // Workspace document listener (tracks branding, name, and last_reset_at across devices)
    if (callbacks.onWorkspace) {
      const wsPath = `workspaces/${wsId}`;
      const un = onSnapshot(
        doc(db, 'workspaces', wsId),
        (snapshot) => {
          callbacks.onWorkspace?.(snapshot.exists() ? (snapshot.data() as Workspace) : null);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, wsPath);
        }
      );
      unsubs.push(un);
    }

    // Stations listener
    if (callbacks.onStations) {
      const stationsPath = `workspaces/${wsId}/stations`;
      const un = onSnapshot(
        collection(db, 'workspaces', wsId, 'stations'),
        (snapshot) => {
          const items: Station[] = [];
          snapshot.forEach((d) => items.push(d.data() as Station));
          callbacks.onStations?.(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, stationsPath);
        }
      );
      unsubs.push(un);
    }

    // Parcels listener
    if (callbacks.onParcels) {
      const parcelsPath = `workspaces/${wsId}/parcels`;
      const un = onSnapshot(
        collection(db, 'workspaces', wsId, 'parcels'),
        (snapshot) => {
          const items: Parcel[] = [];
          snapshot.forEach((d) => items.push(d.data() as Parcel));
          callbacks.onParcels?.(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, parcelsPath);
        }
      );
      unsubs.push(un);
    }

    // Transactions listener
    if (callbacks.onTransactions) {
      const txPath = `workspaces/${wsId}/transactions`;
      const un = onSnapshot(
        collection(db, 'workspaces', wsId, 'transactions'),
        (snapshot) => {
          const items: Transaction[] = [];
          snapshot.forEach((d) => items.push(d.data() as Transaction));
          callbacks.onTransactions?.(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, txPath);
        }
      );
      unsubs.push(un);
    }

    // Trips listener
    if (callbacks.onTrips) {
      const tripsPath = `workspaces/${wsId}/trips`;
      const un = onSnapshot(
        collection(db, 'workspaces', wsId, 'trips'),
        (snapshot) => {
          const items: Trip[] = [];
          snapshot.forEach((d) => items.push(d.data() as Trip));
          callbacks.onTrips?.(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, tripsPath);
        }
      );
      unsubs.push(un);
    }

    // Members listener
    if (callbacks.onMembers) {
      const membersPath = `workspaces/${wsId}/members`;
      const un = onSnapshot(
        collection(db, 'workspaces', wsId, 'members'),
        (snapshot) => {
          const items: WorkspaceMember[] = [];
          snapshot.forEach((d) => items.push(d.data() as WorkspaceMember));
          callbacks.onMembers?.(items);
        },
        (error) => {
          handleFirestoreError(error, OperationType.GET, membersPath);
        }
      );
      unsubs.push(un);
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  },
};
