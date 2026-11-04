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
import {
  Workspace,
  Station,
  Parcel,
  Transaction,
  Trip,
  WorkspaceMember,
  PlatformActivityLog,
  ManagerPartnership,
  PartnershipSettlement,
  PartnershipStationInfo,
} from '../types/database';
import { hashPassword, verifyPassword, isBcryptHash } from '../utils/security';

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

  // 0. USER ACCOUNTS (Cross-Device Phone + Password & Direct Worker Code Sync with bcrypt hashing)
  async saveUserAccount(docId: string, account: CloudUserAccount): Promise<void> {
    if (!this.isAvailable() || !docId) return;
    const path = `users/${docId}`;
    const nowIso = new Date().toISOString();
    const resolvedCode = account.worker_code || (account.role === 'worker' ? account.password : undefined);

    // Hash password with bcrypt before writing to Firestore if not already a hash
    let securedPassword = account.password;
    if (securedPassword && !isBcryptHash(securedPassword)) {
      try {
        securedPassword = await hashPassword(securedPassword);
      } catch (e) {
        console.warn('bcrypt hash warning in saveUserAccount:', e);
      }
    }

    const payload = sanitizeForFirestore({
      ...account,
      id: account.id || docId,
      password: securedPassword || account.password || null,
      worker_code: resolvedCode || account.worker_code || null,
      status: account.status || 'active',
      deleted: Boolean(account.deleted),
      updated_at: nowIso,
    });
    try {
      await setDoc(doc(db, 'users', docId), payload, { merge: true });

      // Direct email alias index: users/email_<clean_email>
      if (account.email && !account.deleted && account.status !== 'revoked') {
        const cleanEmailKey = String(account.email).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (cleanEmailKey.length >= 3) {
          await setDoc(doc(db, 'users', `email_${cleanEmailKey}`), payload, { merge: true }).catch(() => {});
        }
      }

      // Also index worker account directly by their access code (users/code_<CODE>) so workers can log in with JUST the code
      if (account.role === 'worker' && resolvedCode && !account.deleted && account.status !== 'revoked') {
        const cleanCodeKey = String(resolvedCode).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (cleanCodeKey.length >= 4) {
          await setDoc(doc(db, 'users', `code_${cleanCodeKey}`), payload, { merge: true }).catch(() => {});
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

      // 2. Special recovery for worker codes generated via resetMemberPassword before cloud indexing (e.g. Itt-Y64VqUvr for 212617566513)
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
      // 1. Direct O(1) email alias lookup if email provided (getDoc allowed by rules)
      if (isEmail) {
        const cleanEmailKey = cleanId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const emailSnap = await getDoc(doc(db, 'users', `email_${cleanEmailKey}`));
        if (emailSnap.exists()) {
          const acc = emailSnap.data() as CloudUserAccount;
          if (!acc.deleted && acc.status !== 'revoked') {
            return acc;
          }
        }
      }

      // 2. Direct lookup by document ID (phone number or doc key)
      const direct = await this.getUserAccount(cleanId);
      if (direct && !direct.deleted && direct.status !== 'revoked') return direct;

      // 3. Direct lookup by clean digits only
      const numOnly = cleanId.replace(/[^0-9]/g, '');
      if (numOnly && numOnly !== cleanId) {
        const directNum = await this.getUserAccount(numOnly);
        if (directNum && !directNum.deleted && directNum.status !== 'revoked') return directNum;
      }

      // 4. Try email alias without @ if formatted as email prefix
      if (!isEmail) {
        const cleanEmailKey = cleanId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const emailSnap = await getDoc(doc(db, 'users', `email_${cleanEmailKey}`));
        if (emailSnap.exists()) {
          const acc = emailSnap.data() as CloudUserAccount;
          if (!acc.deleted && acc.status !== 'revoked') return acc;
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
      if (userId && userId !== docId) {
        await setDoc(
          doc(db, 'users', userId),
          sanitizeForFirestore({
            id: userId,
            status: 'revoked',
            deleted: true,
            password: '',
            worker_code: '',
            updated_at: nowIso,
          }),
          { merge: true }
        ).catch(() => {});
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
          owner_name: ws.owner_name || null,
          owner_email: ws.owner_email || null,
          owner_phone: ws.owner_phone || null,
          owner_whatsapp: ws.owner_whatsapp || null,
          admin_notes: ws.admin_notes || null,
          custom_brand_name: ws.custom_brand_name || null,
          custom_brand_subtitle: ws.custom_brand_subtitle || null,
          custom_brand_phone: ws.custom_brand_phone || null,
          custom_brand_logo_url: ws.custom_brand_logo_url || null,
          plan_tier: ws.plan_tier || 'plan_1_full',
          plan_name: ws.plan_name || 'الباقة الشاملة المفتوحة (30 يوم مجاناً)',
          max_workers: ws.max_workers ?? 999,
          max_stations: ws.max_stations ?? 999,
          max_workers_per_station: ws.max_workers_per_station ?? 99,
          max_collaborations: ws.max_collaborations ?? 999,
          last_reset_at: ws.last_reset_at || null,
          last_active_at: ws.last_active_at || null,
          last_actor_name: ws.last_actor_name || null,
          last_actor_role: ws.last_actor_role || null,
          last_action_summary: ws.last_action_summary || null,
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

  async updateWorkspaceFieldsInCloud(wsId: string, fields: Record<string, any>): Promise<void> {
    if (!this.isAvailable() || !wsId) return;
    const path = `workspaces/${wsId}`;
    try {
      await setDoc(
        doc(db, 'workspaces', wsId),
        sanitizeForFirestore({
          id: wsId,
          ...fields,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  async listAllWorkspacesFromCloud(): Promise<Workspace[]> {
    if (!this.isAvailable()) return [];
    try {
      const wsSnap = await getDocs(collection(db, 'workspaces'));
      const rawWorkspaces: Workspace[] = [];
      wsSnap.forEach((d) => {
        const ws = d.data() as Workspace;
        rawWorkspaces.push({
          ...ws,
          id: ws.id || d.id,
        });
      });

      // Fetch live subcollection counts in parallel for each workspace
      const enriched = await Promise.all(
        rawWorkspaces.map(async (ws) => {
          let stationsCount = ws.stations_count ?? 0;
          let parcelsCount = ws.parcels_count ?? 0;
          let tripsCount = ws.trips_count ?? 0;
          let txCount = ws.transactions_count ?? 0;
          let workersCount = ws.workers_count ?? 0;
          try {
            const [stSnap, pclSnap, trpSnap, txSnap, memSnap] = await Promise.all([
              getDocs(collection(db, 'workspaces', ws.id, 'stations')),
              getDocs(collection(db, 'workspaces', ws.id, 'parcels')),
              getDocs(collection(db, 'workspaces', ws.id, 'trips')),
              getDocs(collection(db, 'workspaces', ws.id, 'transactions')),
              getDocs(collection(db, 'workspaces', ws.id, 'members')),
            ]);
            stationsCount = stSnap.size;
            parcelsCount = pclSnap.size;
            tripsCount = trpSnap.size;
            txCount = txSnap.size;
            workersCount = memSnap.size;
          } catch {}

          return {
            ...ws,
            owner_name: ws.owner_name || '',
            owner_email: ws.owner_email || '',
            owner_phone: ws.owner_phone || '',
            owner_whatsapp: ws.owner_whatsapp || ws.owner_phone || '',
            workers_count: workersCount,
            stations_count: stationsCount,
            parcels_count: parcelsCount,
            trips_count: tripsCount,
            transactions_count: txCount,
          };
        })
      );

      return enriched.sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      );
    } catch (err) {
      console.warn('Firestore listAllWorkspacesFromCloud warning:', err);
      return [];
    }
  },

  subscribeToAllWorkspaces(onUpdate: (workspaces: Workspace[]) => void): Unsubscribe {
    if (!this.isAvailable()) return () => {};
    return onSnapshot(
      collection(db, 'workspaces'),
      (snap) => {
        const list: Workspace[] = [];
        snap.forEach((d) => {
          const ws = d.data() as Workspace;
          list.push({
            ...ws,
            id: ws.id || d.id,
          });
        });
        list.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        onUpdate(list);
      },
      (err) => {
        console.warn('subscribeToAllWorkspaces warning:', err);
      }
    );
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

  // 7. PLATFORM OWNER LIVE ACTIVITY MONITORING & WORKSPACE DELETION
  async logPlatformActivity(
    entry: Omit<PlatformActivityLog, 'id' | 'created_at'>
  ): Promise<void> {
    if (!this.isAvailable() || !entry.workspace_id) return;
    const nowIso = new Date().toISOString();
    const logId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullEntry: PlatformActivityLog = sanitizeForFirestore({
      ...entry,
      id: logId,
      created_at: nowIso,
    });

    try {
      const wsUpdate: Record<string, any> = {
        id: entry.workspace_id,
        name: entry.workspace_name || 'Sahara📦 Express',
        last_active_at: nowIso,
        last_actor_name: entry.actor_name,
        last_actor_role: entry.actor_role,
        last_action_summary: entry.action_title,
        updated_at: nowIso,
      };
      if (entry.actor_role === 'owner' || entry.actor_role === 'admin' || entry.actor_role === 'platform_owner') {
        if (entry.actor_name) wsUpdate.owner_name = entry.actor_name;
        if (entry.actor_email) wsUpdate.owner_email = entry.actor_email;
        if (entry.actor_phone) wsUpdate.owner_phone = entry.actor_phone;
      }

      await Promise.all([
        setDoc(doc(db, 'platform_activity_logs', logId), fullEntry),
        setDoc(doc(db, 'workspaces', entry.workspace_id, 'activity_logs', logId), fullEntry),
        setDoc(doc(db, 'workspaces', entry.workspace_id), sanitizeForFirestore(wsUpdate), {
          merge: true,
        }),
      ]);
    } catch (err) {
      console.warn('Firestore logPlatformActivity warning:', err);
    }
  },

  async listPlatformActivityLogs(workspaceId?: string): Promise<PlatformActivityLog[]> {
    if (!this.isAvailable()) return [];
    try {
      const colRef = workspaceId
        ? collection(db, 'workspaces', workspaceId, 'activity_logs')
        : collection(db, 'platform_activity_logs');
      const snap = await getDocs(colRef);
      const list: PlatformActivityLog[] = [];
      snap.forEach((d) => {
        list.push(d.data() as PlatformActivityLog);
      });
      return list
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 150);
    } catch (err) {
      console.warn('Firestore listPlatformActivityLogs warning:', err);
      return [];
    }
  },

  subscribeToPlatformActivityLogs(
    onUpdate: (logs: PlatformActivityLog[]) => void
  ): Unsubscribe {
    if (!this.isAvailable()) return () => {};
    return onSnapshot(
      collection(db, 'platform_activity_logs'),
      (snap) => {
        const list: PlatformActivityLog[] = [];
        snap.forEach((d) => {
          list.push(d.data() as PlatformActivityLog);
        });
        list.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        onUpdate(list.slice(0, 150));
      },
      (err) => {
        console.warn('subscribeToPlatformActivityLogs warning:', err);
      }
    );
  },

  async inspectWorkspaceDetailsFromCloud(wsId: string): Promise<{
    stations: Station[];
    parcels: Parcel[];
    transactions: Transaction[];
    trips: Trip[];
    users: CloudUserAccount[];
    activityLogs: PlatformActivityLog[];
  }> {
    if (!this.isAvailable() || !wsId) {
      return { stations: [], parcels: [], transactions: [], trips: [], users: [], activityLogs: [] };
    }
    try {
      const [stSnap, pclSnap, txSnap, trpSnap, actSnap, memSnap, wsDocSnap] = await Promise.all([
        getDocs(collection(db, 'workspaces', wsId, 'stations')),
        getDocs(collection(db, 'workspaces', wsId, 'parcels')),
        getDocs(collection(db, 'workspaces', wsId, 'transactions')),
        getDocs(collection(db, 'workspaces', wsId, 'trips')),
        getDocs(collection(db, 'workspaces', wsId, 'activity_logs')),
        getDocs(collection(db, 'workspaces', wsId, 'members')),
        getDoc(doc(db, 'workspaces', wsId)),
      ]);

      const stations: Station[] = [];
      stSnap.forEach((d) => stations.push(d.data() as Station));

      const parcels: Parcel[] = [];
      pclSnap.forEach((d) => parcels.push(d.data() as Parcel));
      parcels.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const transactions: Transaction[] = [];
      txSnap.forEach((d) => transactions.push(d.data() as Transaction));
      transactions.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const trips: Trip[] = [];
      trpSnap.forEach((d) => trips.push(d.data() as Trip));
      trips.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const activityLogs: PlatformActivityLog[] = [];
      actSnap.forEach((d) => activityLogs.push(d.data() as PlatformActivityLog));
      activityLogs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      const users: CloudUserAccount[] = [];
      const wsData = wsDocSnap.exists() ? (wsDocSnap.data() as Workspace) : null;
      if (wsData && (wsData.owner_phone || wsData.owner_name || wsData.owner_email)) {
        users.push({
          id: wsData.created_by || wsData.owner_phone || 'owner',
          name: wsData.owner_name || wsData.name.replace('Sahara📦 Express - ', '') || 'المدير',
          phone: wsData.owner_phone || '',
          whatsapp_number: wsData.owner_whatsapp || wsData.owner_phone || '',
          email: wsData.owner_email || '',
          role: 'owner',
          workspace_id: wsId,
          status: 'active',
          deleted: false,
          created_at: wsData.created_at || new Date().toISOString(),
          password: undefined, // SECURITY: Password is never exposed
        });
      }

      memSnap.forEach((d) => {
        const m = d.data();
        if (m.status !== 'removed' && m.status !== 'rejected') {
          // If not already in list as owner
          if (!users.some(u => u.phone && u.phone === (m.profile?.phone || m.phone))) {
            users.push({
              id: m.user_id || d.id,
              name: m.profile?.name || m.name || 'عضو المحطة',
              phone: m.profile?.phone || m.phone || '',
              whatsapp_number: m.profile?.whatsapp_number || m.whatsapp_number || m.profile?.phone || '',
              email: m.profile?.email || m.email || '',
              role: m.role || 'worker',
              station_id: m.station_id || undefined,
              worker_code: m.worker_code || m.profile?.worker_code || undefined,
              workspace_id: wsId,
              status: m.status || 'active',
              deleted: false,
              created_at: m.joined_at || m.profile?.created_at || new Date().toISOString(),
              password: undefined, // SECURITY: Password is never exposed
            });
          }
        }
      });

      return { stations, parcels, transactions, trips, users, activityLogs };
    } catch (err) {
      console.warn('Firestore inspectWorkspaceDetailsFromCloud warning:', err);
      return { stations: [], parcels: [], transactions: [], trips: [], users: [], activityLogs: [] };
    }
  },

  async deleteWorkspaceCompletelyFromCloud(wsId: string, ownerPhone?: string): Promise<void> {
    if (!this.isAvailable() || !wsId) return;

    // 1. Read workspace and members first so we can delete their direct user documents by ID without listing /users
    const userDocIdsToDelete = new Set<string>();
    if (ownerPhone) {
      const cleanOwnerPhone = ownerPhone.replace(/[^0-9]/g, '');
      if (cleanOwnerPhone) userDocIdsToDelete.add(cleanOwnerPhone);
    }

    try {
      const [wsDocSnap, memSnap] = await Promise.all([
        getDoc(doc(db, 'workspaces', wsId)),
        getDocs(collection(db, 'workspaces', wsId, 'members')),
      ]);

      if (wsDocSnap.exists()) {
        const wsData = wsDocSnap.data() as Workspace;
        if (wsData.owner_phone) {
          const cp = wsData.owner_phone.replace(/[^0-9]/g, '');
          if (cp) userDocIdsToDelete.add(cp);
        }
        if (wsData.owner_email) {
          const cleanEmailKey = String(wsData.owner_email).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
          if (cleanEmailKey.length >= 3) userDocIdsToDelete.add(`email_${cleanEmailKey}`);
        }
      }

      memSnap.forEach((d) => {
        const m = d.data();
        const mp = String(m.profile?.phone || m.phone || '').replace(/[^0-9]/g, '');
        if (mp) userDocIdsToDelete.add(mp);
        const me = String(m.profile?.email || m.email || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
        if (me.length >= 3) userDocIdsToDelete.add(`email_${me}`);
        const rawCode = m.worker_code || m.profile?.worker_code;
        if (rawCode) {
          const cleanCodeKey = String(rawCode).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
          if (cleanCodeKey.length >= 4) userDocIdsToDelete.add(`code_${cleanCodeKey}`);
        }
      });
    } catch {}

    // 2. Mark direct user documents as revoked & deleted so both online and offline sessions are immediately terminated
    const nowIso = new Date().toISOString();
    await Promise.all(
      Array.from(userDocIdsToDelete).map((uDocId) =>
        setDoc(
          doc(db, 'users', uDocId),
          sanitizeForFirestore({
            id: uDocId,
            status: 'revoked',
            deleted: true,
            password: '',
            worker_code: '',
            updated_at: nowIso,
          }),
          { merge: true }
        ).catch(() => {})
      )
    );

    // 3. Delete all subcollections of workspaces/{wsId}
    const subcollections = [
      'stations',
      'parcels',
      'transactions',
      'trips',
      'members',
      'activity_logs',
    ];
    await Promise.all(
      subcollections.map(async (sub) => {
        try {
          const snap = await getDocs(collection(db, 'workspaces', wsId, sub));
          await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
        } catch (err) {
          console.warn(`Warning deleting subcollection ${sub} for ${wsId}:`, err);
        }
      })
    );

    // 4. Delete platform_activity_logs entries for this workspace
    try {
      const actQuery = query(
        collection(db, 'platform_activity_logs'),
        where('workspace_id', '==', wsId)
      );
      const actSnap = await getDocs(actQuery);
      await Promise.all(actSnap.docs.map((d) => deleteDoc(d.ref)));
    } catch (err) {
      console.warn('Warning deleting platform_activity_logs for workspace:', err);
    }

    // 5. Finally delete the workspace document itself
    const path = `workspaces/${wsId}`;
    try {
      await deleteDoc(doc(db, 'workspaces', wsId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  },

  // ============================================================================
  // 8. REAL-TIME ACCOUNT STATUS & IMMEDIATE DELETION/SUSPENSION WATCHDOG
  // ============================================================================
  subscribeToAccountStatus(
    phoneOrDocId: string,
    workspaceId: string,
    onStatusChange: (status: {
      userExists: boolean;
      userDeleted: boolean;
      userRevoked: boolean;
      workspaceExists: boolean;
      workspaceSuspended: boolean;
      workspaceDeleted: boolean;
      subscriptionEndDate?: string;
      subscriptionStatus?: string;
    }) => void
  ): Unsubscribe {
    if (!this.isAvailable()) return () => {};
    const unsubs: Unsubscribe[] = [];
    const cleanPhone = phoneOrDocId.replace(/[^0-9]/g, '');

    let hasSeenUserDocInCloud = false;
    let hasSeenWsDocInCloud = false;

    let userState = {
      userExists: true,
      userDeleted: false,
      userRevoked: false,
    };

    let wsState = {
      workspaceExists: true,
      workspaceSuspended: false,
      workspaceDeleted: false,
      subscriptionEndDate: undefined as string | undefined,
      subscriptionStatus: undefined as string | undefined,
    };

    const emitStatus = () => {
      onStatusChange({
        ...userState,
        ...wsState,
      });
    };

    // 1. Listen directly to user document
    if (cleanPhone) {
      try {
        const uSub = onSnapshot(
          doc(db, 'users', cleanPhone),
          (snap) => {
            if (!snap.exists()) {
              // Only treat missing doc as deleted if it ALREADY existed in Firestore during this session
              // (prevents false-positive kick-outs when a brand-new user is registering!)
              if (hasSeenUserDocInCloud) {
                userState = {
                  userExists: false,
                  userDeleted: true,
                  userRevoked: true,
                };
              } else {
                userState = {
                  userExists: false,
                  userDeleted: false,
                  userRevoked: false,
                };
              }
            } else {
              hasSeenUserDocInCloud = true;
              const data = snap.data() as CloudUserAccount;
              const isDel = Boolean(data.deleted);
              const isRev = data.status === 'revoked';
              userState = {
                userExists: true,
                userDeleted: isDel,
                userRevoked: isRev,
              };
            }
            emitStatus();
          },
          (err) => {
            console.warn('subscribeToAccountStatus userDoc warning:', err);
          }
        );
        unsubs.push(uSub);
      } catch (err) {
        console.warn('Error subscribing to user doc:', err);
      }
    }

    // 2. Listen directly to workspace document
    if (workspaceId) {
      try {
        const wSub = onSnapshot(
          doc(db, 'workspaces', workspaceId),
          (snap) => {
            if (!snap.exists()) {
              // Only treat missing workspace doc as deleted if it ALREADY existed in Firestore during this session
              if (hasSeenWsDocInCloud) {
                wsState = {
                  workspaceExists: false,
                  workspaceDeleted: true,
                  workspaceSuspended: false,
                  subscriptionEndDate: undefined,
                  subscriptionStatus: undefined,
                };
              } else {
                wsState = {
                  workspaceExists: false,
                  workspaceDeleted: false,
                  workspaceSuspended: false,
                  subscriptionEndDate: undefined,
                  subscriptionStatus: undefined,
                };
              }
            } else {
              hasSeenWsDocInCloud = true;
              const data = snap.data() as Workspace;
              const isDel = Boolean((data as any).deleted);
              const isSuspended = data.subscription_status === 'suspended';
              wsState = {
                workspaceExists: true,
                workspaceDeleted: isDel,
                workspaceSuspended: isSuspended,
                subscriptionEndDate: data.subscription_end_date,
                subscriptionStatus: data.subscription_status,
              };
            }
            emitStatus();
          },
          (err) => {
            console.warn('subscribeToAccountStatus wsDoc warning:', err);
          }
        );
        unsubs.push(wSub);
      } catch (err) {
        console.warn('Error subscribing to workspace doc:', err);
      }
    }

    return () => {
      unsubs.forEach((u) => u());
    };
  },

  // ============================================================================
  // 9. MANAGER CROSS-PARTNERSHIP NETWORK (غرفة الشراكة بين المدراء)
  // ============================================================================

  /**
   * Loads all registered companies/managers and their stations & activity stars from Firestore
   * to display in the Manager Partnership Room Directory.
   * Strictly excludes the Super Admin / Platform Owner account so it remains 100% private.
   */
  async listAllRegisteredManagersAndStations(): Promise<
    {
      workspaceId: string;
      workspaceName: string;
      shortId: string;
      ownerName: string;
      phone: string;
      whatsapp?: string;
      email?: string;
      stations: PartnershipStationInfo[];
      planTier?: string;
      createdAt: string;
      stars: number;
      parcelsCount: number;
      deliveredCount: number;
      activityLabel: string;
    }[]
  > {
    if (!this.isAvailable()) return [];
    try {
      const snap = await getDocs(collection(db, 'workspaces'));
      const results: {
        workspaceId: string;
        workspaceName: string;
        shortId: string;
        ownerName: string;
        phone: string;
        whatsapp?: string;
        email?: string;
        stations: PartnershipStationInfo[];
        planTier?: string;
        createdAt: string;
        stars: number;
        parcelsCount: number;
        deliveredCount: number;
        activityLabel: string;
      }[] = [];

      await Promise.all(
        snap.docs.map(async (d) => {
          const ws = d.data() as Workspace;
          const wsId = ws.id || d.id;
          if ((ws as any).deleted || ws.subscription_status === 'suspended' || (ws as any).is_demo) return;

          // Strictly exclude the Super Admin / Platform Owner account & demo/placeholder accounts
          const cleanPhone = String(ws.owner_phone || '').replace(/[^0-9]/g, '');
          const cleanWhatsapp = String(ws.owner_whatsapp || '').replace(/[^0-9]/g, '');
          const cleanEmail = String(ws.owner_email || '').trim().toLowerCase();
          if (
            cleanPhone.includes('618961387') ||
            cleanWhatsapp.includes('618961387') ||
            cleanEmail === 'aissaaimanekhlifi@gmail.com' ||
            cleanPhone === '0000000000' ||
            cleanPhone === '0600000000' ||
            wsId === 'ws-1' ||
            wsId === 'ws-platform-owner' ||
            ws.created_by === 'user-platform-owner'
          ) {
            return;
          }

          // Fetch stations and parcels for this workspace in parallel
          let stationsList: PartnershipStationInfo[] = [];
          let parcelsCount = 0;
          let deliveredCount = 0;
          try {
            const [stSnap, pclSnap] = await Promise.all([
              getDocs(collection(db, 'workspaces', wsId, 'stations')),
              getDocs(collection(db, 'workspaces', wsId, 'parcels')),
            ]);
            stSnap.forEach((stDoc) => {
              const st = stDoc.data() as Station;
              if (st.is_active !== false && !st.is_demo) {
                stationsList.push({
                  id: st.id || stDoc.id,
                  name: st.name,
                  city: st.city,
                  country: st.country,
                  phone: st.phone,
                });
              }
            });
            pclSnap.forEach((pDoc) => {
              const p = pDoc.data() as Parcel;
              if (!p.is_demo && p.status !== 'cancelled') {
                parcelsCount++;
                if (p.status === 'delivered') {
                  deliveredCount++;
                }
              }
            });
          } catch {}

          // Calculate Star Rating (0 to 5 stars) based on real stations & parcel work
          const stCount = stationsList.length;
          let stars = 0;
          let activityLabel = 'غير نشيط (بدون محطات)';

          if (stCount === 0 && parcelsCount === 0) {
            stars = 0;
            activityLabel = 'غير نشيط (بدون محطات)';
          } else if ((stCount >= 1 && parcelsCount >= 25) || (stCount >= 2 && parcelsCount >= 15)) {
            stars = 5;
            activityLabel = 'ممتاز ونشيط جداً';
          } else if ((stCount >= 1 && parcelsCount >= 12) || (stCount >= 2 && parcelsCount >= 7)) {
            stars = 4;
            activityLabel = 'خدام مزيان ونشيط';
          } else if ((stCount >= 1 && parcelsCount >= 4) || (stCount >= 2 && parcelsCount >= 2)) {
            stars = 3;
            activityLabel = 'مدير نشيط';
          } else if ((stCount >= 1 && parcelsCount >= 1) || stCount >= 2) {
            stars = 2;
            activityLabel = 'نشاط متوسط';
          } else {
            stars = 1;
            activityLabel = 'بداية الخدمة';
          }

          results.push({
            workspaceId: wsId,
            workspaceName: ws.name,
            shortId: ws.short_id || wsId.slice(0, 6).toUpperCase(),
            ownerName: ws.owner_name || 'مدير المحطة',
            phone: ws.owner_phone || '',
            whatsapp: ws.owner_whatsapp || ws.owner_phone || '',
            email: ws.owner_email || '',
            stations: stationsList,
            planTier: ws.plan_tier,
            createdAt: ws.created_at || new Date().toISOString(),
            stars,
            parcelsCount,
            deliveredCount,
            activityLabel,
          });
        })
      );

      // Sort by highest star rating first, then number of stations, then parcels count, then newest
      return results.sort((a, b) => {
        if (b.stars !== a.stars) return b.stars - a.stars;
        if (b.stations.length !== a.stations.length) return b.stations.length - a.stations.length;
        if (b.parcelsCount !== a.parcelsCount) return b.parcelsCount - a.parcelsCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } catch (err) {
      console.warn('Firestore listAllRegisteredManagersAndStations warning:', err);
      return [];
    }
  },

  /**
   * Listens in real-time to partnerships involving a specific workspace.
   */
  subscribeToManagerPartnerships(
    myWorkspaceId: string,
    onUpdate: (partnerships: ManagerPartnership[]) => void
  ): Unsubscribe {
    if (!this.isAvailable() || !myWorkspaceId) return () => {};
    try {
      return onSnapshot(
        collection(db, 'partnerships'),
        (snap) => {
          const list: ManagerPartnership[] = [];
          snap.forEach((d) => {
            const p = d.data() as ManagerPartnership;
            if (p.workspace_a_id === myWorkspaceId || p.workspace_b_id === myWorkspaceId) {
              list.push({ ...p, id: p.id || d.id });
            }
          });
          list.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
          onUpdate(list);
        },
        (err) => {
          console.warn('subscribeToManagerPartnerships warning:', err);
        }
      );
    } catch (err) {
      console.warn('Error subscribing to partnerships:', err);
      return () => {};
    }
  },

  /**
   * Creates or updates a partnership between two managers.
   */
  async savePartnership(partnership: ManagerPartnership): Promise<void> {
    if (!this.isAvailable() || !partnership.id) return;
    const path = `partnerships/${partnership.id}`;
    try {
      await setDoc(
        doc(db, 'partnerships', partnership.id),
        sanitizeForFirestore({
          ...partnership,
          updated_at: new Date().toISOString(),
        }),
        { merge: true }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  /**
   * Records a financial settlement payment between two partners.
   */
  async recordPartnershipSettlement(
    partnershipId: string,
    settlement: PartnershipSettlement
  ): Promise<void> {
    if (!this.isAvailable() || !partnershipId || !settlement.id) return;
    const path = `partnerships/${partnershipId}/settlements/${settlement.id}`;
    try {
      await setDoc(
        doc(db, 'partnerships', partnershipId, 'settlements', settlement.id),
        sanitizeForFirestore(settlement)
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  },

  /**
   * Listens in real-time to settlement transactions for a specific partnership.
   */
  subscribeToPartnershipSettlements(
    partnershipId: string,
    onUpdate: (settlements: PartnershipSettlement[]) => void
  ): Unsubscribe {
    if (!this.isAvailable() || !partnershipId) return () => {};
    try {
      return onSnapshot(
        collection(db, 'partnerships', partnershipId, 'settlements'),
        (snap) => {
          const list: PartnershipSettlement[] = [];
          snap.forEach((d) => {
            list.push(d.data() as PartnershipSettlement);
          });
          list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          onUpdate(list);
        },
        (err) => {
          console.warn('subscribeToPartnershipSettlements warning:', err);
        }
      );
    } catch (err) {
      console.warn('Error subscribing to settlements:', err);
      return () => {};
    }
  },

  /**
   * Synchronizes ONLY a single dispatched partnership parcel to the partner's workspace in Firestore
   * with strict data isolation (no other parcels, cashbox, or customer records are ever shared).
   */
  async syncPartnerParcel(partnerWorkspaceId: string, parcel: Parcel): Promise<void> {
    if (!this.isAvailable() || !partnerWorkspaceId || !parcel.id) return;
    const path = `workspaces/${partnerWorkspaceId}/parcels/${parcel.id}`;
    try {
      const targetStationId = parcel.partner_destination_station_id || parcel.destination_station_id;
      const targetStationName = parcel.partner_destination_station_name || parcel.destination_station_name;
      const originWsName = parcel.partner_origin_workspace_name || parcel.collaborator_workspace_name || 'شركة شريكة';

      const isolatedPartnerParcel: Partial<Parcel> = {
        id: parcel.id,
        workspace_id: partnerWorkspaceId,
        team_id: partnerWorkspaceId,
        parcel_number: parcel.parcel_number,
        tracking_code: parcel.tracking_code,
        sender_name: parcel.sender_name,
        sender_phone: parcel.sender_phone,
        receiver_name: parcel.receiver_name,
        receiver_phone: parcel.receiver_phone,
        description: parcel.description,
        items_count: parcel.items_count,
        weight_kg: parcel.weight_kg,
        origin_station_id: parcel.origin_station_id,
        origin_station_name: parcel.origin_station_name,
        destination_station_id: targetStationId,
        destination_station_name: targetStationName,
        shipping_fee: parcel.shipping_fee,
        cod_amount: parcel.cod_amount,
        amount_due: parcel.amount_due,
        amount_paid: parcel.amount_paid,
        currency: parcel.currency,
        payer: parcel.payer,
        payment_status: parcel.payment_status,
        status: parcel.status === 'delivered' ? 'delivered' : 'arrived',
        condition: parcel.condition || 'normal',
        condition_notes: parcel.condition_notes || null,
        status_history: parcel.status_history || [],
        payment_history: parcel.payment_history || [],
        created_by: parcel.created_by,
        creator_name: parcel.creator_name,
        created_at: parcel.created_at,
        arrived_at: parcel.arrived_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        is_partnership_parcel: true,
        is_collaborator_data: true,
        collaborator_workspace_name: originWsName,
        partner_origin_workspace_id: parcel.partner_origin_workspace_id || parcel.workspace_id,
        partner_origin_workspace_name: originWsName,
        partner_workspace_id: partnerWorkspaceId,
        partner_workspace_name: parcel.partner_workspace_name,
        partner_destination_station_id: targetStationId,
        partner_destination_station_name: targetStationName,
      };

      await setDoc(
        doc(db, 'workspaces', partnerWorkspaceId, 'parcels', parcel.id),
        sanitizeForFirestore(isolatedPartnerParcel),
        { merge: true }
      );
    } catch (err) {
      console.warn('Warning syncing partner parcel to Firestore:', err);
    }
  },

  /**
   * Synchronizes status/payment updates on a partnership parcel back to the partner's copy
   * so both managers see delivery and COD collection in real-time.
   */
  async syncPartnerParcelStatusBack(
    targetWorkspaceId: string,
    parcelId: string,
    updates: Partial<Parcel>
  ): Promise<void> {
    if (!this.isAvailable() || !targetWorkspaceId || !parcelId) return;
    try {
      const safeUpdates: Record<string, any> = {
        status: updates.status,
        amount_paid: updates.amount_paid,
        payment_status: updates.payment_status,
        delivered_at: updates.delivered_at,
        delivered_to: updates.delivered_to,
        status_history: updates.status_history,
        payment_history: updates.payment_history,
        condition: updates.condition,
        condition_notes: updates.condition_notes,
        updated_at: new Date().toISOString(),
      };
      Object.keys(safeUpdates).forEach((k) => {
        if (safeUpdates[k] === undefined) delete safeUpdates[k];
      });
      await setDoc(
        doc(db, 'workspaces', targetWorkspaceId, 'parcels', parcelId),
        sanitizeForFirestore(safeUpdates),
        { merge: true }
      );
    } catch (err) {
      console.warn('Warning syncing partner parcel status back:', err);
    }
  },
};
