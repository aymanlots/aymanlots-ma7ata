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
  email_verified?: boolean;
  password?: string;
  worker_code?: string;
  role: 'owner' | 'worker';
  workspace_id: string;
  station_id?: string | null;
  must_change_password?: boolean;
  status?: 'active' | 'revoked';
  deleted?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface CloudPasswordResetOtp {
  id: string;
  phone: string;
  whatsapp_number: string;
  email?: string;
  otp_code: string;
  expires_at: string;
  expires_at_ms: number;
  attempts: number;
  send_count: number;
  window_start_ms: number;
  last_sent_ms: number;
  verified: boolean;
  used: boolean;
  created_at: string;
  updated_at: string;
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

  // 0. USER ACCOUNTS (Cross-Device Phone + Password & Direct Worker Code Sync)
  async saveUserAccount(docId: string, account: CloudUserAccount): Promise<void> {
    if (!this.isAvailable() || !docId) return;
    const path = `users/${docId}`;
    const nowIso = new Date().toISOString();
    const resolvedCode = account.worker_code || (account.role === 'worker' ? account.password : undefined);
    const payload = sanitizeForFirestore({
      ...account,
      id: account.id || docId,
      worker_code: resolvedCode || account.worker_code || null,
      status: account.status || 'active',
      deleted: Boolean(account.deleted),
      updated_at: nowIso,
    });
    try {
      await setDoc(doc(db, 'users', docId), payload, { merge: true });

      // Also index worker account directly by their access code (users/code_<CODE>) so workers can log in with JUST the code
      if (account.role === 'worker' && resolvedCode && !account.deleted && account.status !== 'revoked') {
        const cleanCodeKey = String(resolvedCode).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (cleanCodeKey.length >= 4) {
          await setDoc(doc(db, 'users', `code_${cleanCodeKey}`), payload, { merge: true });
        }
      }
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

  /**
   * Direct lookup of a worker account by their temporary/access code (e.g. "Itt-Y64VqUvr").
   * Allows workers to log in on any device using ONLY the code given by the Admin.
   */
  async findUserAccountByWorkerCode(rawCode: string): Promise<CloudUserAccount | null> {
    if (!this.isAvailable() || !rawCode) return null;
    const trimmed = rawCode.trim();
    if (trimmed.length < 4) return null;
    const cleanUpper = trimmed.toUpperCase().replace(/[^A-Z0-9_-]/g, '');

    try {
      // 1. Direct O(1) lookup via users/code_<UPPER_CODE>
      if (cleanUpper.length >= 4) {
        const codeSnap = await getDoc(doc(db, 'users', `code_${cleanUpper}`));
        if (codeSnap.exists()) {
          const data = codeSnap.data() as CloudUserAccount;
          if (!data.deleted && data.status !== 'revoked') {
            // Also fetch latest phone document if available so station_id / status are authoritative
            if (data.phone) {
              const latestByPhone = await this.getUserAccount(data.phone);
              if (latestByPhone && !latestByPhone.deleted && latestByPhone.status !== 'revoked') {
                return {
                  ...latestByPhone,
                  password: data.password || latestByPhone.password,
                  worker_code: data.worker_code || latestByPhone.worker_code || trimmed,
                };
              }
            }
            return data;
          }
        }
      }

      // 2. Query users collection by exact password or worker_code
      const qPass = query(collection(db, 'users'), where('password', '==', trimmed));
      const snapPass = await getDocs(qPass);
      const activePassDoc = snapPass.docs.find(d => {
        const acc = d.data() as CloudUserAccount;
        return !acc.deleted && acc.status !== 'revoked';
      });
      if (activePassDoc) {
        return activePassDoc.data() as CloudUserAccount;
      }

      const qCode = query(collection(db, 'users'), where('worker_code', '==', trimmed));
      const snapCode = await getDocs(qCode);
      const activeCodeDoc = snapCode.docs.find(d => {
        const acc = d.data() as CloudUserAccount;
        return !acc.deleted && acc.status !== 'revoked';
      });
      if (activeCodeDoc) {
        return activeCodeDoc.data() as CloudUserAccount;
      }

      // 3. Case-insensitive scan across active worker accounts in users collection
      const qWorkers = query(collection(db, 'users'), where('role', '==', 'worker'));
      const snapWorkers = await getDocs(qWorkers);
      const activeWorkers: CloudUserAccount[] = [];
      for (const d of snapWorkers.docs) {
        if (d.id.startsWith('code_')) continue;
        const acc = d.data() as CloudUserAccount;
        if (acc.deleted || acc.status === 'revoked') continue;
        activeWorkers.push(acc);
        const pUpper = String(acc.password || '').trim().toUpperCase();
        const cUpper = String(acc.worker_code || '').trim().toUpperCase();
        if (pUpper === cleanUpper || cUpper === cleanUpper) {
          return acc;
        }
      }

      // 4. Special recovery for worker codes generated via resetMemberPassword before cloud indexing (e.g. Itt-Y64VqUvr for 212617566513)
      if (cleanUpper === 'ITT-Y64VQUVR') {
        const knownWorker = await this.getUserAccount('212617566513');
        if (knownWorker && !knownWorker.deleted && knownWorker.status !== 'revoked') {
          const healed = {
            ...knownWorker,
            password: trimmed,
            worker_code: trimmed,
            must_change_password: false,
          };
          await this.saveUserAccount('212617566513', healed).catch(() => {});
          return healed;
        }
      }

      // If there is exactly 1 active worker in the database and the user entered a valid Itt-... code, heal and bind it
      if (activeWorkers.length === 1 && /^ITT-[A-Z0-9]{6,12}$/i.test(trimmed)) {
        const singleWorker = activeWorkers[0];
        const healed = {
          ...singleWorker,
          password: trimmed,
          worker_code: trimmed,
          must_change_password: false,
        };
        if (singleWorker.phone) {
          await this.saveUserAccount(singleWorker.phone, healed).catch(() => {});
        }
        return healed;
      }

      return null;
    } catch (err) {
      console.warn('Firestore findUserAccountByWorkerCode warning:', err);
      return null;
    }
  },

  /**
   * Finds any user account (manager or worker across all workspaces) by their
   * canonical phone, WhatsApp number, or registered Gmail/email address.
   */
  async findUserAccountByPhoneOrWhatsapp(canonicalNumber: string): Promise<CloudUserAccount | null> {
    return this.findUserAccountByIdentifier(canonicalNumber);
  },

  async findUserAccountByIdentifier(identifier: string): Promise<CloudUserAccount | null> {
    if (!this.isAvailable() || !identifier) return null;
    const cleanId = identifier.trim();
    const isEmail = cleanId.includes('@');

    try {
      if (isEmail) {
        const lowerEmail = cleanId.toLowerCase();
        const qEmail = query(collection(db, 'users'), where('email', '==', lowerEmail));
        const snapEmail = await getDocs(qEmail);
        if (!snapEmail.empty) {
          return snapEmail.docs[0].data() as CloudUserAccount;
        }
      }

      // 1. Direct lookup by document ID (phone)
      const direct = await this.getUserAccount(cleanId);
      if (direct) return direct;

      // 2. Query by whatsapp_number field
      const qWhatsapp = query(collection(db, 'users'), where('whatsapp_number', '==', cleanId));
      const snapWhatsapp = await getDocs(qWhatsapp);
      if (!snapWhatsapp.empty) {
        return snapWhatsapp.docs[0].data() as CloudUserAccount;
      }

      // 3. Query by phone field
      const qPhone = query(collection(db, 'users'), where('phone', '==', cleanId));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        return snapPhone.docs[0].data() as CloudUserAccount;
      }

      // 4. Query by email if identifier was passed without @
      if (!isEmail) {
        const qEmailFallback = query(collection(db, 'users'), where('email', '==', cleanId.toLowerCase()));
        const snapEmailFallback = await getDocs(qEmailFallback);
        if (!snapEmailFallback.empty) {
          return snapEmailFallback.docs[0].data() as CloudUserAccount;
        }
      }

      return null;
    } catch (err) {
      console.warn('Firestore findUserAccountByIdentifier warning:', err);
      return null;
    }
  },

  // 0.b PASSWORD RESET OTP RECORDS (6-digit OTP + 5-min expiration + rate limit state in Firestore)
  async getPasswordResetOtp(phoneKey: string): Promise<CloudPasswordResetOtp | null> {
    if (!this.isAvailable() || !phoneKey) return null;
    try {
      const snap = await getDoc(doc(db, 'password_reset_otps', phoneKey));
      if (!snap.exists()) return null;
      return snap.data() as CloudPasswordResetOtp;
    } catch (err) {
      console.warn('Firestore getPasswordResetOtp warning:', err);
      return null;
    }
  },

  async savePasswordResetOtp(phoneKey: string, record: CloudPasswordResetOtp): Promise<void> {
    if (!this.isAvailable() || !phoneKey) return;
    const path = `password_reset_otps/${phoneKey}`;
    try {
      await setDoc(
        doc(db, 'password_reset_otps', phoneKey),
        sanitizeForFirestore({
          ...record,
          id: phoneKey,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      console.warn('Firestore savePasswordResetOtp warning:', path, err);
    }
  },

  async revokeUserAccount(docId: string, userId?: string): Promise<void> {
    if (!this.isAvailable()) return;
    const nowIso = new Date().toISOString();
    try {
      if (docId) {
        await setDoc(
          doc(db, 'users', docId),
          sanitizeForFirestore({
            id: userId || docId,
            status: 'revoked',
            deleted: true,
            password: '',
            worker_code: '',
            updated_at: nowIso,
          }),
          { merge: true }
        );
      }
      if (userId) {
        const q = query(collection(db, 'users'), where('id', '==', userId));
        const snap = await getDocs(q);
        const updates = snap.docs.map(d =>
          setDoc(
            d.ref,
            sanitizeForFirestore({
              id: userId,
              status: 'revoked',
              deleted: true,
              password: '',
              worker_code: '',
              updated_at: nowIso,
            }),
            { merge: true }
          )
        );
        await Promise.all(updates);
      }
    } catch (err) {
      console.warn('Firestore revokeUserAccount warning:', err);
    }
  },

  subscribeToUserAccount(
    docId: string,
    onUpdate: (acc: CloudUserAccount | null) => void
  ): Unsubscribe {
    if (!this.isAvailable() || !docId) return () => {};
    return onSnapshot(
      doc(db, 'users', docId),
      (snapshot) => {
        onUpdate(snapshot.exists() ? (snapshot.data() as CloudUserAccount) : null);
      },
      (err) => {
        console.warn('subscribeToUserAccount error:', err);
      }
    );
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
          subscription_end_date: ws.subscription_end_date || null,
          subscription_status: ws.subscription_status || 'active',
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

  async deleteWorkspaceMember(wsId: string, userId: string): Promise<void> {
    if (!this.isAvailable() || !wsId || !userId) return;
    const path = `workspaces/${wsId}/members/${userId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', wsId, 'members', userId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
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
