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
import { normalizePhoneNumber } from '../lib/supabase';

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

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  const errMsg = error instanceof Error ? error.message : String(error);
  const isOfflineOrTransient =
    errMsg.includes('Could not reach Cloud Firestore backend') ||
    errMsg.includes('the client is offline') ||
    errMsg.includes('unavailable') ||
    errMsg.includes('network-request-failed');

  if (isOfflineOrTransient) {
    console.warn(`Firestore offline/transient notice [${operationType} ${path}]:`, errMsg);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
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

  isMasterEmailOrPhone(phone?: string, email?: string): boolean {
    const cleanP = String(phone || '').replace(/[^0-9]/g, '');
    const cleanE = String(email || '').trim().toLowerCase();
    return cleanP.includes('618961387') || cleanE === 'aissaaimanekhlifi@gmail.com';
  },

  getEmailDocId(email?: string): string {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return '';
    const cleanEmailKey = cleanEmail.replace(/[^a-z0-9_]/g, '_');
    return cleanEmailKey.length >= 3 ? `email_${cleanEmailKey}` : '';
  },

  getPhoneDocVariants(rawPhone?: string): string[] {
    const raw = String(rawPhone || '').trim();
    if (!raw) return [];
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    const normalized = normalizePhoneNumber(raw);
    const set = new Set<string>();
    if (normalized) set.add(normalized);
    if (digitsOnly) set.add(digitsOnly);
    if (normalized.startsWith('212') && normalized.length === 12) {
      set.add('0' + normalized.slice(3));
    }
    if (normalized.startsWith('222') && normalized.length === 11) {
      set.add(normalized.slice(3));
    }
    return Array.from(set).filter((v) => v.length >= 6);
  },

  async deleteUserDocsForDeletedWorkspace(
    workspaceId: string,
    seedDocIds: string[] = []
  ): Promise<number> {
    if (!this.isAvailable()) return 0;
    const toCheck = new Set<string>(seedDocIds.filter(Boolean));
    const verifiedDeleteIds = new Set<string>();
    const phoneOtpKeys = new Set<string>();

    for (const docId of Array.from(toCheck)) {
      try {
        const snap = await getDoc(doc(db, 'users', docId));
        if (!snap.exists()) continue;
        const data = snap.data() as CloudUserAccount;
        if (
          this.isMasterEmailOrPhone(data.phone, data.email) ||
          data.workspace_id === 'ws-platform-owner' ||
          data.workspace_id === 'ws-1'
        ) {
          continue;
        }
        const belongsToTarget =
          !workspaceId ||
          data.workspace_id === workspaceId ||
          !data.workspace_id ||
          Boolean(data.deleted) ||
          data.status === 'revoked';

        if (!belongsToTarget) continue;

        verifiedDeleteIds.add(docId);
        if (data.id && data.id !== docId) verifiedDeleteIds.add(data.id);
        this.getPhoneDocVariants(data.phone).forEach((pv) => {
          verifiedDeleteIds.add(pv);
          phoneOtpKeys.add(pv);
        });
        this.getPhoneDocVariants(data.whatsapp_number).forEach((pv) => {
          verifiedDeleteIds.add(pv);
          phoneOtpKeys.add(pv);
        });
        const emailDoc = this.getEmailDocId(data.email);
        if (emailDoc) verifiedDeleteIds.add(emailDoc);
        if (data.email) verifiedDeleteIds.add(String(data.email).trim().toLowerCase());
        if (data.worker_code) {
          const codeKey = String(data.worker_code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
          if (codeKey.length >= 4) verifiedDeleteIds.add(`code_${codeKey}`);
        }
      } catch {}
    }

    let cleanedCount = 0;
    await Promise.all(
      Array.from(verifiedDeleteIds).map(async (uId) => {
        try {
          const snap = await getDoc(doc(db, 'users', uId));
          if (!snap.exists()) return;
          const data = snap.data() as CloudUserAccount;
          if (
            this.isMasterEmailOrPhone(data.phone, data.email) ||
            data.workspace_id === 'ws-platform-owner' ||
            data.workspace_id === 'ws-1'
          ) {
            return;
          }
          if (
            !workspaceId ||
            data.workspace_id === workspaceId ||
            !data.workspace_id ||
            Boolean(data.deleted) ||
            data.status === 'revoked'
          ) {
            await deleteDoc(doc(db, 'users', uId));
            cleanedCount++;
          }
        } catch (err) {
          console.warn(`Failed deleting user doc ${uId}:`, err);
        }
      })
    );

    await Promise.all(
      Array.from(phoneOtpKeys).map((pk) =>
        deleteDoc(doc(db, 'password_reset_otps', pk)).catch(() => {})
      )
    );

    return cleanedCount;
  },

  /**
   * Registration duplicate check that automatically detects & cleans leftover orphan /users records
   * from previously deleted managers or removed workers so they can re-register freely.
   * Never deletes records belonging to an active, expired, or suspended (non-deleted) workspace.
   */
  async findActiveUserForRegistration(
    identifier: string,
    kind: 'phone' | 'email'
  ): Promise<CloudUserAccount | null> {
    if (!this.isAvailable() || !identifier) return null;
    const cleanId = identifier.trim();
    const cleanLower = cleanId.toLowerCase();

    const candidateDocIds =
      kind === 'email'
        ? Array.from(new Set([this.getEmailDocId(cleanLower), cleanLower].filter(Boolean)))
        : this.getPhoneDocVariants(cleanId);

    for (const docId of candidateDocIds) {
      try {
        const snap = await getDoc(doc(db, 'users', docId));
        if (!snap.exists()) continue;
        const acc = snap.data() as CloudUserAccount;

        if (
          this.isMasterEmailOrPhone(acc.phone, acc.email) ||
          acc.workspace_id === 'ws-platform-owner' ||
          acc.workspace_id === 'ws-1'
        ) {
          return acc;
        }

        if (acc.deleted || acc.status === 'revoked') {
          await deleteDoc(doc(db, 'users', docId)).catch(() => {});
          continue;
        }

        const createdMs = new Date(acc.created_at || 0).getTime();
        const isOldEnough = isNaN(createdMs) || Date.now() - createdMs > 20000;

        if (!acc.workspace_id) {
          if (isOldEnough) {
            await deleteDoc(doc(db, 'users', docId)).catch(() => {});
            continue;
          }
          return acc;
        }

        if (acc.workspace_id !== 'ws-external') {
          const wsSnap = await getDoc(doc(db, 'workspaces', acc.workspace_id));
          if (!wsSnap.exists()) {
            if (isOldEnough) {
              await this.deleteUserDocsForDeletedWorkspace(acc.workspace_id, [docId]);
              continue;
            }
            return acc;
          }

          const wsData = wsSnap.data() as Workspace;
          if (wsData.deleted) {
            await this.deleteUserDocsForDeletedWorkspace(acc.workspace_id, [docId]);
            continue;
          }

          if (acc.role === 'worker' && acc.id) {
            const memSnap = await getDoc(doc(db, 'workspaces', acc.workspace_id, 'members', acc.id));
            if (!memSnap.exists() || memSnap.data()?.status === 'removed') {
              await this.deleteUserDocsForDeletedWorkspace(acc.workspace_id, [docId]);
              continue;
            }
          }

          if (kind === 'email' && acc.role === 'owner' && wsData.owner_email) {
            const wsOwnerEmail = String(wsData.owner_email).trim().toLowerCase();
            if (wsOwnerEmail && wsOwnerEmail !== cleanLower) {
              await deleteDoc(doc(db, 'users', docId)).catch(() => {});
              continue;
            }
          }
        }

        return acc;
      } catch (err) {
        console.warn('findActiveUserForRegistration check warning:', docId, err);
      }
    }

    return null;
  },

  /**
   * Super Admin utility: safely unlocks leftover credentials (Gmail or Phone) from previously
   * deleted accounts without ever touching another active/suspended manager's live account.
   */
  async unlockDeletedAccountCredentials(
    identifiers: { email?: string; phone?: string },
    targetWorkspaceId?: string
  ): Promise<{
    success: boolean;
    status: 'unlocked' | 'already_free' | 'active_conflict';
    cleanedDocs: number;
    workspaceName?: string;
    message: string;
  }> {
    if (!this.isAvailable()) {
      return {
        success: false,
        status: 'already_free',
        cleanedDocs: 0,
        message: 'السحابة غير متصلة حالياً',
      };
    }

    const cleanEmail = String(identifiers.email || '').trim().toLowerCase();
    const cleanPhone = String(identifiers.phone || '').trim();

    if (this.isMasterEmailOrPhone(cleanPhone, cleanEmail)) {
      return {
        success: false,
        status: 'active_conflict',
        cleanedDocs: 0,
        workspaceName: 'حساب صاحب التطبيق',
        message: 'لا يمكن تعديل أو حذف بيانات حساب صاحب التطبيق الرئيسي.',
      };
    }

    const candidateDocIds = new Set<string>();
    if (cleanEmail) {
      const emailDoc = this.getEmailDocId(cleanEmail);
      if (emailDoc) candidateDocIds.add(emailDoc);
      candidateDocIds.add(cleanEmail);
    }
    if (cleanPhone) {
      this.getPhoneDocVariants(cleanPhone).forEach((pv) => candidateDocIds.add(pv));
    }

    let totalCleaned = 0;

    for (const docId of Array.from(candidateDocIds)) {
      try {
        const snap = await getDoc(doc(db, 'users', docId));
        if (!snap.exists()) continue;
        const acc = snap.data() as CloudUserAccount;

        if (
          this.isMasterEmailOrPhone(acc.phone, acc.email) ||
          acc.workspace_id === 'ws-platform-owner' ||
          acc.workspace_id === 'ws-1'
        ) {
          return {
            success: false,
            status: 'active_conflict',
            cleanedDocs: 0,
            workspaceName: 'حساب صاحب التطبيق',
            message: 'لا يمكن مسح بيانات صاحب التطبيق.',
          };
        }

        if (acc.deleted || acc.status === 'revoked' || !acc.workspace_id) {
          await deleteDoc(doc(db, 'users', docId));
          totalCleaned++;
          continue;
        }

        if (acc.workspace_id !== 'ws-external') {
          const wsSnap = await getDoc(doc(db, 'workspaces', acc.workspace_id));
          if (wsSnap.exists()) {
            const wsData = wsSnap.data() as Workspace;
            const isTargetDeleted = Boolean(wsData.deleted);
            const isStaleEmail =
              Boolean(cleanEmail) &&
              acc.role === 'owner' &&
              Boolean(wsData.owner_email) &&
              String(wsData.owner_email).trim().toLowerCase() !== cleanEmail;
            let isRemovedWorker = false;
            if (acc.role === 'worker' && acc.id) {
              const memSnap = await getDoc(doc(db, 'workspaces', acc.workspace_id, 'members', acc.id));
              isRemovedWorker = !memSnap.exists() || memSnap.data()?.status === 'removed';
            }

            if (!isTargetDeleted && !isStaleEmail && !isRemovedWorker) {
              if (targetWorkspaceId && acc.workspace_id === targetWorkspaceId) {
                // If Super Admin runs unlock directly on a card that wasn't flagged deleted yet, keep protection unless already deleted
                return {
                  success: false,
                  status: 'active_conflict',
                  cleanedDocs: 0,
                  workspaceName: wsData.name,
                  message: `هذا الحساب (${wsData.name}) ما زال موجوداً في اللائحة ولم يُحذف بعد — اضغط أولاً على "حذف الحساب نهائياً" من داخل بطاقته.`,
                };
              }
              return {
                success: false,
                status: 'active_conflict',
                cleanedDocs: 0,
                workspaceName: wsData.name,
                message: `⚠️ هذا البريد أو الرقم مرتبط بحساب موجود حالياً باسم "${wsData.name}" — لم يتم مسحه حفاظاً على بياناته. إذا أردت حذفه، افتح بطاقته من اللائحة واضغط حذف نهائي.`,
              };
            }

            if (isStaleEmail || isRemovedWorker) {
              await deleteDoc(doc(db, 'users', docId));
              totalCleaned++;
              continue;
            }
          }

          // Workspace does not exist or is marked deleted -> safe to wipe all orphan auth docs for that workspace
          totalCleaned += await this.deleteUserDocsForDeletedWorkspace(acc.workspace_id, [docId]);
        } else {
          await deleteDoc(doc(db, 'users', docId));
          totalCleaned++;
        }
      } catch (err) {
        console.warn('unlockDeletedAccountCredentials warning:', docId, err);
      }
    }

    if (totalCleaned > 0) {
      return {
        success: true,
        status: 'unlocked',
        cleanedDocs: totalCleaned,
        message: '✅ تم فك الحظر وحذف البقايا القديمة بنجاح! يقدر دابا يعاود يسجل بنفس Gmail والرقم من جديد.',
      };
    }

    return {
      success: true,
      status: 'already_free',
      cleanedDocs: 0,
      message: '✅ هاد البريد/الرقم حر أصلاً فالسحابة وما كاين عليه حتى بلوك — يقدر يسجل بيه دابا مباشرة.',
    };
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
          plan_name: ws.plan_name || 'الباك الثاني (299 درهم — شهر تجريبي مجاني)',
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

  isMasterPlatformWorkspace(ws: Workspace): boolean {
    const wsId = ws.id || '';
    const cleanPhone = String(ws.owner_phone || '').replace(/[^0-9]/g, '');
    const cleanWhatsapp = String(ws.owner_whatsapp || '').replace(/[^0-9]/g, '');
    const cleanEmail = String(ws.owner_email || '').trim().toLowerCase();
    return (
      cleanPhone.includes('618961387') ||
      cleanWhatsapp.includes('618961387') ||
      cleanEmail === 'aissaaimanekhlifi@gmail.com' ||
      wsId === 'ws-1' ||
      wsId === 'ws-platform-owner' ||
      ws.created_by === 'user-platform-owner'
    );
  },

  async isOwnerUserValidInCloud(ws: Workspace): Promise<boolean> {
    if (!this.isAvailable() || !ws?.id) return false;
    if (ws.deleted || (ws as any).is_demo) return false;
    if (this.isMasterPlatformWorkspace(ws)) return true;

    const cleanPhone = String(ws.owner_phone || '').replace(/[^0-9]/g, '');
    const cleanEmail = String(ws.owner_email || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');

    const createdMs = new Date(ws.created_at || 0).getTime();
    const isBrandNew = !isNaN(createdMs) && Date.now() - createdMs < 20000;

    if (!cleanPhone && cleanEmail.length < 3) {
      return isBrandNew;
    }

    try {
      if (cleanPhone) {
        const uSnap = await getDoc(doc(db, 'users', cleanPhone));
        if (!uSnap.exists()) {
          return isBrandNew;
        }
        const uData = uSnap.data() as CloudUserAccount;
        if (uData.deleted || uData.status === 'revoked') {
          return false;
        }
      }
      return true;
    } catch {
      return true;
    }
  },

  async listAllWorkspacesFromCloud(): Promise<Workspace[]> {
    if (!this.isAvailable()) return [];
    try {
      const [wsSnap, actSnap] = await Promise.all([
        getDocs(collection(db, 'workspaces')),
        getDocs(collection(db, 'platform_activity_logs')).catch(() => null),
      ]);

      const rawWorkspaces: Workspace[] = [];
      const seenWsIds = new Set<string>();

      wsSnap.forEach((d) => {
        const ws = d.data() as Workspace;
        const resolvedId = ws.id || d.id;
        if (!(ws as any).is_demo && !this.isMasterPlatformWorkspace({ ...ws, id: resolvedId })) {
          seenWsIds.add(resolvedId);
          rawWorkspaces.push({
            ...ws,
            id: resolvedId,
          });
        }
      });

      // Recover deleted/old workspaces that may only remain in platform_activity_logs
      if (actSnap) {
        const logRecoveredMap = new Map<string, Workspace>();
        actSnap.forEach((d) => {
          const log = d.data() as PlatformActivityLog;
          const wsId = log.workspace_id;
          if (
            !wsId ||
            seenWsIds.has(wsId) ||
            wsId === 'ws-1' ||
            wsId === 'ws-platform-owner' ||
            wsId === 'ws-external'
          ) {
            return;
          }
          if (this.isMasterEmailOrPhone(log.actor_phone, log.actor_email)) return;

          const existing = logRecoveredMap.get(wsId);
          const isOwnerLog = log.actor_role === 'owner' || log.actor_role === 'admin';
          const createdTs = existing?.created_at && new Date(existing.created_at).getTime() < new Date(log.created_at || 0).getTime()
            ? existing.created_at
            : (log.created_at || new Date().toISOString());
          const latestTs = existing?.last_active_at && new Date(existing.last_active_at).getTime() > new Date(log.created_at || 0).getTime()
            ? existing.last_active_at
            : (log.created_at || new Date().toISOString());

          logRecoveredMap.set(wsId, {
            id: wsId,
            short_id: log.workspace_short_id || existing?.short_id || '',
            name: log.workspace_name || existing?.name || 'حساب مدير محذوف',
            invite_code: existing?.invite_code || '',
            created_by: existing?.created_by || (isOwnerLog ? log.actor_id : null),
            owner_name: isOwnerLog && log.actor_name ? log.actor_name : (existing?.owner_name || log.actor_name || ''),
            owner_email: isOwnerLog && log.actor_email ? log.actor_email : (existing?.owner_email || ''),
            owner_phone: isOwnerLog && log.actor_phone ? log.actor_phone : (existing?.owner_phone || ''),
            owner_whatsapp: isOwnerLog && log.actor_phone ? log.actor_phone : (existing?.owner_whatsapp || ''),
            created_at: createdTs,
            last_active_at: latestTs,
            deleted: true,
            deleted_at: latestTs,
            subscription_status: 'suspended',
            stations_count: 0,
          });
        });

        logRecoveredMap.forEach((recWs) => {
          rawWorkspaces.push(recWs);
        });
      }

      // Read-only enrichment: NEVER auto-delete workspaces here so deleted & stopped accounts always stay visible
      const enrichedResults = await Promise.all(
        rawWorkspaces.map(async (ws) => {
          let isDeletedFlag = Boolean(ws.deleted);
          if (!isDeletedFlag) {
            const cleanPhone = String(ws.owner_phone || '').replace(/[^0-9]/g, '');
            const createdMs = new Date(ws.created_at || 0).getTime();
            const isBrandNew = !isNaN(createdMs) && Date.now() - createdMs < 20000;
            if (cleanPhone && !isBrandNew) {
              try {
                const uSnap = await getDoc(doc(db, 'users', cleanPhone));
                if (!uSnap.exists()) {
                  isDeletedFlag = true;
                } else {
                  const uData = uSnap.data() as CloudUserAccount;
                  if (uData.deleted || uData.status === 'revoked') {
                    isDeletedFlag = true;
                  }
                }
              } catch {}
            }
          }

          let stationsCount = isDeletedFlag ? 0 : (ws.stations_count ?? 0);
          if (!isDeletedFlag) {
            try {
              const stSnap = await getDocs(collection(db, 'workspaces', ws.id, 'stations'));
              stationsCount = stSnap.size;
            } catch {}
          }

          return {
            ...ws,
            deleted: isDeletedFlag,
            deleted_at: ws.deleted_at || (isDeletedFlag ? ws.updated_at || ws.last_active_at || ws.created_at : undefined),
            owner_name: ws.owner_name || '',
            owner_email: ws.owner_email || '',
            owner_phone: ws.owner_phone || '',
            owner_whatsapp: ws.owner_whatsapp || ws.owner_phone || '',
            stations_count: stationsCount,
          } as Workspace;
        })
      );

      return enrichedResults.sort(
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
      async (snap) => {
        const candidates: Workspace[] = [];
        snap.forEach((d) => {
          const ws = d.data() as Workspace;
          const resolvedId = ws.id || d.id;
          if (!(ws as any).is_demo && !this.isMasterPlatformWorkspace({ ...ws, id: resolvedId })) {
            candidates.push({
              ...ws,
              id: resolvedId,
            });
          }
        });

        // Read-only enrichment without deleting any workspace
        const enriched = await Promise.all(
          candidates.map(async (ws) => {
            let isDeletedFlag = Boolean(ws.deleted);
            if (!isDeletedFlag) {
              const cleanPhone = String(ws.owner_phone || '').replace(/[^0-9]/g, '');
              const createdMs = new Date(ws.created_at || 0).getTime();
              const isBrandNew = !isNaN(createdMs) && Date.now() - createdMs < 20000;
              if (cleanPhone && !isBrandNew) {
                try {
                  const uSnap = await getDoc(doc(db, 'users', cleanPhone));
                  if (!uSnap.exists()) {
                    isDeletedFlag = true;
                  } else {
                    const uData = uSnap.data() as CloudUserAccount;
                    if (uData.deleted || uData.status === 'revoked') {
                      isDeletedFlag = true;
                    }
                  }
                } catch {}
              }
            }
            return {
              ...ws,
              deleted: isDeletedFlag,
              deleted_at: ws.deleted_at || (isDeletedFlag ? ws.updated_at || ws.last_active_at || ws.created_at : undefined),
            } as Workspace;
          })
        );

        enriched.sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        onUpdate(enriched);
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
      const safeMember: Record<string, any> = { ...member };
      delete safeMember.password;
      if (safeMember.profile && typeof safeMember.profile === 'object') {
        safeMember.profile = { ...safeMember.profile };
        delete safeMember.profile.password;
      }
      await setDoc(
        doc(db, 'workspaces', wsId, 'members', member.user_id),
        sanitizeForFirestore({
          ...safeMember,
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
  // STRICT PRIVACY POLICY: Only logs who logged in/registered, who opened a station, who deleted, and who renamed.
  // NEVER logs parcel numbers, worker phone numbers, or cashbox/financial amounts.
  isAllowedPlatformActivityType(actionType?: string): boolean {
    const allowed = new Set([
      'LOGIN',
      'REGISTER',
      'LOGOUT',
      'STATION_CREATE',
      'STATION_DELETE',
      'STATION_RENAME',
      'BRAND_RENAME',
      'PLAN_CHANGE',
      'SUBSCRIPTION_UPDATE',
    ]);
    return Boolean(actionType && allowed.has(actionType));
  },

  async logPlatformActivity(
    entry: Omit<PlatformActivityLog, 'id' | 'created_at'>
  ): Promise<void> {
    if (!this.isAvailable() || !entry.workspace_id) return;
    // Block any parcel, trip, worker, or cash activity from being logged to the Platform Owner feed
    if (!this.isAllowedPlatformActivityType(entry.action_type)) return;

    const nowIso = new Date().toISOString();
    const logId = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const fullEntry: PlatformActivityLog = sanitizeForFirestore({
      ...entry,
      // Strip worker phone numbers if actor is a worker
      actor_phone: entry.actor_role === 'worker' ? undefined : entry.actor_phone,
      id: logId,
      created_at: nowIso,
    });

    try {
      // Never resurrect a deleted workspace via activity logging
      if (entry.action_type !== 'REGISTER') {
        const existingWsSnap = await getDoc(doc(db, 'workspaces', entry.workspace_id));
        if (!existingWsSnap.exists() || (existingWsSnap.data() as any)?.deleted) {
          return;
        }
      }

      const wsUpdate: Record<string, any> = {
        id: entry.workspace_id,
        name: entry.workspace_name || 'Sahara📦 Express',
        last_active_at: nowIso,
        last_actor_name: entry.actor_name,
        last_actor_role: entry.actor_role,
        last_action_summary: entry.action_title,
        updated_at: nowIso,
      };
      if (entry.actor_role === 'owner' || entry.actor_role === 'admin') {
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
        const item = d.data() as PlatformActivityLog;
        if (this.isAllowedPlatformActivityType(item.action_type)) {
          list.push({
            ...item,
            actor_phone: item.actor_role === 'worker' ? undefined : item.actor_phone,
          });
        }
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
          const item = d.data() as PlatformActivityLog;
          if (this.isAllowedPlatformActivityType(item.action_type)) {
            list.push({
              ...item,
              actor_phone: item.actor_role === 'worker' ? undefined : item.actor_phone,
            });
          }
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
      const [stSnap, actSnap] = await Promise.all([
        getDocs(collection(db, 'workspaces', wsId, 'stations')),
        getDocs(collection(db, 'workspaces', wsId, 'activity_logs')),
      ]);

      const stations: Station[] = [];
      stSnap.forEach((d) => {
        const st = d.data() as Station;
        // Strip cashbox balances so Platform Owner never sees money
        stations.push({
          ...st,
          balances: undefined,
        });
      });

      const activityLogs: PlatformActivityLog[] = [];
      actSnap.forEach((d) => {
        const log = d.data() as PlatformActivityLog;
        if (this.isAllowedPlatformActivityType(log.action_type)) {
          activityLogs.push({
            ...log,
            actor_phone: log.actor_role === 'worker' ? undefined : log.actor_phone,
          });
        }
      });
      activityLogs.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

      return { stations, parcels: [], transactions: [], trips: [], users: [], activityLogs };
    } catch (err) {
      console.warn('Firestore inspectWorkspaceDetailsFromCloud warning:', err);
      return { stations: [], parcels: [], transactions: [], trips: [], users: [], activityLogs: [] };
    }
  },

  async deleteWorkspaceCompletelyFromCloud(
    wsId: string,
    ownerPhone?: string,
    ownerEmail?: string
  ): Promise<void> {
    if (!this.isAvailable() || !wsId) return;
    if (wsId === 'ws-1' || wsId === 'ws-platform-owner') return;

    const nowIso = new Date().toISOString();
    const seedUserDocIds = new Set<string>();
    this.getPhoneDocVariants(ownerPhone).forEach((pv) => seedUserDocIds.add(pv));
    if (ownerEmail) {
      const emailDoc = this.getEmailDocId(ownerEmail);
      if (emailDoc) seedUserDocIds.add(emailDoc);
      seedUserDocIds.add(ownerEmail.trim().toLowerCase());
    }

    let wsData: Workspace | null = null;
    let resolvedOwnerName = '';
    let resolvedOwnerPhone = ownerPhone || '';
    let resolvedOwnerWhatsapp = '';
    let resolvedOwnerEmail = ownerEmail || '';

    try {
      const [wsDocSnap, memSnap, actSnap] = await Promise.all([
        getDoc(doc(db, 'workspaces', wsId)),
        getDocs(collection(db, 'workspaces', wsId, 'members')),
        getDocs(query(collection(db, 'platform_activity_logs'), where('workspace_id', '==', wsId))).catch(() => null),
      ]);

      if (wsDocSnap.exists()) {
        wsData = wsDocSnap.data() as Workspace;
        if (this.isMasterPlatformWorkspace(wsData)) {
          return;
        }
        resolvedOwnerName = wsData.owner_name || '';
        resolvedOwnerPhone = wsData.owner_phone || resolvedOwnerPhone;
        resolvedOwnerWhatsapp = wsData.owner_whatsapp || '';
        resolvedOwnerEmail = wsData.owner_email || resolvedOwnerEmail;

        if (wsData.created_by) seedUserDocIds.add(wsData.created_by);
        this.getPhoneDocVariants(wsData.owner_phone).forEach((pv) => seedUserDocIds.add(pv));
        this.getPhoneDocVariants(wsData.owner_whatsapp).forEach((pv) => seedUserDocIds.add(pv));
        if (wsData.owner_email) {
          const emailDoc = this.getEmailDocId(wsData.owner_email);
          if (emailDoc) seedUserDocIds.add(emailDoc);
          seedUserDocIds.add(wsData.owner_email.trim().toLowerCase());
        }
      }

      memSnap.forEach((d) => {
        const m = d.data();
        if (m.user_id) seedUserDocIds.add(m.user_id);
        this.getPhoneDocVariants(m.profile?.phone || m.phone).forEach((pv) => seedUserDocIds.add(pv));
        this.getPhoneDocVariants(m.profile?.whatsapp_number).forEach((pv) => seedUserDocIds.add(pv));
        const meRaw = String(m.profile?.email || m.email || '').trim().toLowerCase();
        if (meRaw) {
          const emailDoc = this.getEmailDocId(meRaw);
          if (emailDoc) seedUserDocIds.add(emailDoc);
          seedUserDocIds.add(meRaw);
          if ((m.role === 'admin' || m.role === 'owner') && !resolvedOwnerEmail) {
            resolvedOwnerEmail = meRaw;
          }
        }
        const rawCode = m.worker_code || m.profile?.worker_code;
        if (rawCode) {
          const cleanCodeKey = String(rawCode).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
          if (cleanCodeKey.length >= 4) seedUserDocIds.add(`code_${cleanCodeKey}`);
        }
      });

      if (actSnap) {
        actSnap.forEach((d) => {
          const log = d.data() as PlatformActivityLog;
          if (log.actor_role === 'owner' || log.actor_role === 'admin') {
            if (log.actor_id) seedUserDocIds.add(log.actor_id);
            this.getPhoneDocVariants(log.actor_phone).forEach((pv) => seedUserDocIds.add(pv));
            if (log.actor_email) {
              const emailDoc = this.getEmailDocId(log.actor_email);
              if (emailDoc) seedUserDocIds.add(emailDoc);
              if (!resolvedOwnerEmail) resolvedOwnerEmail = log.actor_email;
            }
            if (log.actor_name && !resolvedOwnerName) resolvedOwnerName = log.actor_name;
            if (log.actor_phone && !resolvedOwnerPhone) resolvedOwnerPhone = log.actor_phone;
          }
        });
      }

      // Inspect phone docs before deleting so we capture any email stored only on /users/{phone}
      for (const pv of this.getPhoneDocVariants(resolvedOwnerPhone)) {
        try {
          const uSnap = await getDoc(doc(db, 'users', pv));
          if (uSnap.exists()) {
            const uData = uSnap.data() as CloudUserAccount;
            if (!uData.workspace_id || uData.workspace_id === wsId) {
              if (uData.email) {
                const emailDoc = this.getEmailDocId(uData.email);
                if (emailDoc) seedUserDocIds.add(emailDoc);
                if (!resolvedOwnerEmail) resolvedOwnerEmail = uData.email;
              }
              if (uData.name && !resolvedOwnerName) resolvedOwnerName = uData.name;
            }
          }
        } catch {}
      }
    } catch {}

    // 1. Delete ONLY this workspace's user docs from /users so they can immediately re-register with same phone & Gmail
    await this.deleteUserDocsForDeletedWorkspace(wsId, Array.from(seedUserDocIds));

    // 2. Delete all operational subcollections of workspaces/{wsId}
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

    // 3. Delete any partnerships involving ONLY this workspace (and their settlements)
    try {
      const partSnap = await getDocs(collection(db, 'partnerships'));
      const matchingPartnerships = partSnap.docs.filter((d) => {
        const p = d.data() as ManagerPartnership;
        return p.workspace_a_id === wsId || p.workspace_b_id === wsId;
      });
      await Promise.all(
        matchingPartnerships.map(async (pDoc) => {
          try {
            const setSnap = await getDocs(collection(db, 'partnerships', pDoc.id, 'settlements'));
            await Promise.all(setSnap.docs.map((sd) => deleteDoc(sd.ref)));
          } catch {}
          await deleteDoc(pDoc.ref).catch(() => {});
        })
      );
    } catch (err) {
      console.warn('Warning deleting partnerships for workspace:', err);
    }

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

    // 5. Preserve a clean soft-deleted archive record on workspaces/{wsId} (if it exists)
    // so it stays visible in Super Admin's "ممسوحين" list with 0 stations/data and unblocked credentials
    if (wsData) {
      const path = `workspaces/${wsId}`;
      try {
        await setDoc(
          doc(db, 'workspaces', wsId),
          sanitizeForFirestore({
            id: wsId,
            name: wsData.name || 'حساب محذوف',
            short_id: wsData.short_id || '',
            owner_name: resolvedOwnerName || null,
            owner_phone: resolvedOwnerPhone || null,
            owner_whatsapp: resolvedOwnerWhatsapp || resolvedOwnerPhone || null,
            owner_email: resolvedOwnerEmail || null,
            deleted: true,
            deleted_at: nowIso,
            subscription_status: 'suspended',
            stations_count: 0,
            workers_count: 0,
            parcels_count: 0,
            last_action_summary: 'تم حذف الحساب نهائياً (بياناته ممسوحة ويمكنه إعادة التسجيل)',
            updated_at: nowIso,
          }),
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
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

    // 1. Listen directly to user document in /users/{cleanPhone}
    if (cleanPhone) {
      try {
        const uSub = onSnapshot(
          doc(db, 'users', cleanPhone),
          (snap) => {
            if (!snap.exists()) {
              userState = {
                userExists: false,
                userDeleted: true,
                userRevoked: true,
              };
            } else {
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

    // 2. Listen directly to workspace document in /workspaces/{workspaceId}
    if (workspaceId) {
      try {
        const wSub = onSnapshot(
          doc(db, 'workspaces', workspaceId),
          (snap) => {
            if (!snap.exists()) {
              wsState = {
                workspaceExists: false,
                workspaceDeleted: true,
                workspaceSuspended: false,
                subscriptionEndDate: undefined,
                subscriptionStatus: undefined,
              };
            } else {
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
          const ws = { ...(d.data() as Workspace), id: (d.data() as Workspace).id || d.id };
          const wsId = ws.id;
          if ((ws as any).deleted || ws.subscription_status === 'suspended' || (ws as any).is_demo) return;

          // Strictly exclude the Super Admin / Platform Owner account & demo/placeholder accounts
          const cleanPhone = String(ws.owner_phone || '').replace(/[^0-9]/g, '');
          const cleanWhatsapp = String(ws.owner_whatsapp || '').replace(/[^0-9]/g, '');
          const cleanEmail = String(ws.owner_email || '').trim().toLowerCase();
          if (
            this.isMasterPlatformWorkspace(ws) ||
            cleanPhone === '0000000000' ||
            cleanPhone === '0600000000'
          ) {
            return;
          }

          // Verify that the manager's user account still exists in /users (if deleted from /users in Firebase, auto-clean and exclude!)
          const isValidOwner = await this.isOwnerUserValidInCloud(ws);
          if (!isValidOwner) return;

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
   * Immediately propagates station updates (name, phone, city) or deletion across all active partnerships
   * so partner phones see the updated name/phone immediately and deleted stations vanish in real time.
   */
  async updateStationInPartnerships(
    wsId: string,
    stationId: string,
    updatedStationInfo: PartnershipStationInfo | null
  ): Promise<void> {
    if (!this.isAvailable() || !wsId || !stationId) return;
    try {
      const snap = await getDocs(collection(db, 'partnerships'));
      const updates: Promise<any>[] = [];
      snap.forEach((d) => {
        const p = d.data() as ManagerPartnership;
        if (p.workspace_a_id === wsId || p.workspace_b_id === wsId) {
          let changed = false;
          let newStationsA = [...(p.workspace_a_stations || [])];
          let newStationsB = [...(p.workspace_b_stations || [])];

          if (p.workspace_a_id === wsId) {
            if (updatedStationInfo === null) {
              const filtered = newStationsA.filter((s) => s.id !== stationId);
              if (filtered.length !== newStationsA.length) {
                newStationsA = filtered;
                changed = true;
              }
            } else {
              const idx = newStationsA.findIndex((s) => s.id === stationId);
              if (idx !== -1) {
                newStationsA[idx] = updatedStationInfo;
                changed = true;
              } else {
                newStationsA.push(updatedStationInfo);
                changed = true;
              }
            }
          }

          if (p.workspace_b_id === wsId) {
            if (updatedStationInfo === null) {
              const filtered = newStationsB.filter((s) => s.id !== stationId);
              if (filtered.length !== newStationsB.length) {
                newStationsB = filtered;
                changed = true;
              }
            } else {
              const idx = newStationsB.findIndex((s) => s.id === stationId);
              if (idx !== -1) {
                newStationsB[idx] = updatedStationInfo;
                changed = true;
              } else {
                newStationsB.push(updatedStationInfo);
                changed = true;
              }
            }
          }

          if (changed) {
            updates.push(
              setDoc(
                doc(db, 'partnerships', d.id),
                sanitizeForFirestore({
                  workspace_a_stations: newStationsA,
                  workspace_b_stations: newStationsB,
                  updated_at: new Date().toISOString(),
                }),
                { merge: true }
              )
            );
          }
        }
      });
      await Promise.all(updates);
    } catch (err) {
      console.warn('Error updating station in partnerships:', err);
    }
  },

  /**
   * Propagates manager name, phone, or WhatsApp changes across all partnerships.
   */
  async updateManagerProfileInPartnerships(
    wsId: string,
    ownerName: string,
    ownerPhone: string,
    ownerWhatsapp?: string
  ): Promise<void> {
    if (!this.isAvailable() || !wsId) return;
    try {
      const snap = await getDocs(collection(db, 'partnerships'));
      const updates: Promise<any>[] = [];
      snap.forEach((d) => {
        const p = d.data() as ManagerPartnership;
        const patch: Record<string, any> = { updated_at: new Date().toISOString() };
        let changed = false;

        if (p.workspace_a_id === wsId) {
          patch.workspace_a_owner_name = ownerName;
          patch.workspace_a_phone = ownerPhone;
          if (ownerWhatsapp) patch.workspace_a_whatsapp = ownerWhatsapp;
          changed = true;
        }
        if (p.workspace_b_id === wsId) {
          patch.workspace_b_owner_name = ownerName;
          patch.workspace_b_phone = ownerPhone;
          if (ownerWhatsapp) patch.workspace_b_whatsapp = ownerWhatsapp;
          changed = true;
        }

        if (changed) {
          updates.push(
            setDoc(doc(db, 'partnerships', d.id), sanitizeForFirestore(patch), { merge: true })
          );
        }
      });
      await Promise.all(updates);
    } catch (err) {
      console.warn('Error updating manager profile in partnerships:', err);
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
   * Preserves the real parcel tracking status (registered -> in_transit -> arrived -> delivered).
   */
  async syncPartnerParcel(partnerWorkspaceId: string, parcel: Parcel): Promise<void> {
    if (!this.isAvailable() || !partnerWorkspaceId || !parcel.id) return;
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
        route: parcel.route,
        description: parcel.description,
        category: parcel.category,
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
        status: parcel.status || 'registered',
        condition: parcel.condition || 'normal',
        condition_notes: parcel.condition_notes || null,
        current_trip_id: parcel.current_trip_id || null,
        driver_name: parcel.driver_name || null,
        vehicle_plate: parcel.vehicle_plate || null,
        status_history: parcel.status_history || [],
        payment_history: parcel.payment_history || [],
        created_by: parcel.created_by,
        creator_name: parcel.creator_name,
        created_at: parcel.created_at,
        trip_arrived_at: parcel.trip_arrived_at || null,
        arrived_at: parcel.arrived_at || null,
        delivered_at: parcel.delivered_at || null,
        delivered_to: parcel.delivered_to || null,
        last_scanned_by_name: parcel.last_scanned_by_name || null,
        last_scanned_at_station: parcel.last_scanned_at_station || null,
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
        partner_acceptance_status: parcel.partner_acceptance_status || 'pending_approval',
        partner_rejection_reason: parcel.partner_rejection_reason || null,
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
   * Synchronizes status/trip/payment updates on a partnership parcel back to the partner's copy
   * so both managers and their assigned station workers see trip loading, departure, arrival, and delivery in real-time.
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
        current_trip_id: updates.current_trip_id,
        driver_name: updates.driver_name,
        vehicle_plate: updates.vehicle_plate,
        trip_arrived_at: updates.trip_arrived_at,
        arrived_at: updates.arrived_at,
        delivered_at: updates.delivered_at,
        delivered_to: updates.delivered_to,
        last_scanned_by_name: updates.last_scanned_by_name,
        last_scanned_at_station: updates.last_scanned_at_station,
        origin_station_name: updates.origin_station_name,
        destination_station_name: updates.destination_station_name,
        partner_destination_station_name: updates.partner_destination_station_name,
        route: updates.route,
        status_history: updates.status_history,
        payment_history: updates.payment_history,
        condition: updates.condition,
        condition_notes: updates.condition_notes,
        is_returning: updates.is_returning,
        return_reason: updates.return_reason,
        return_notes: updates.return_notes,
        return_fee: updates.return_fee,
        return_initiated_at: updates.return_initiated_at,
        returned_to_sender_at: updates.returned_to_sender_at,
        returned_to_sender_name: updates.returned_to_sender_name,
        partner_acceptance_status: updates.partner_acceptance_status,
        partner_rejection_reason: updates.partner_rejection_reason,
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

  /**
   * Mirrors a partnership trip (created towards a partner's station or updated upon arrival/unloading)
   * to the counterpart partner workspace so both managers and the destination station worker can track and unload the trip.
   */
  async syncPartnerTrip(targetWorkspaceId: string, trip: Trip): Promise<void> {
    if (!this.isAvailable() || !targetWorkspaceId || !trip.id) return;
    try {
      const partnerTripCopy: Trip = {
        ...trip,
        workspace_id: targetWorkspaceId,
        destination_station_id: trip.partner_destination_station_id || trip.destination_station_id,
        destination_station_name: trip.partner_destination_station_name || trip.destination_station_name,
        is_partnership_trip: true,
        is_collaborator_data: true,
        collaborator_workspace_name: trip.partner_origin_workspace_name || 'شركة شريكة',
        updated_at: new Date().toISOString(),
      };
      await setDoc(
        doc(db, 'workspaces', targetWorkspaceId, 'trips', trip.id),
        sanitizeForFirestore(partnerTripCopy),
        { merge: true }
      );
    } catch (err) {
      console.warn('Warning syncing partner trip to Firestore:', err);
    }
  },

  /**
   * Public tracking lookup across cloud workspaces by tracking code or numeric code
   * so customers can track their shipment on any device without logging in.
   */
  async findParcelByTrackingCodeFromCloud(
    rawCode: string
  ): Promise<(Partial<Parcel> & { workspace_name?: string }) | null> {
    if (!this.isAvailable() || !rawCode) return null;
    const clean = rawCode.trim().toUpperCase().replace(/^#/, '');
    const digitsOnly = clean.replace(/[^0-9]/g, '');
    const numericVal = digitsOnly ? parseInt(digitsOnly, 10) : NaN;

    try {
      const wsSnap = await getDocs(collection(db, 'workspaces'));
      for (const wsDoc of wsSnap.docs) {
        const wsData = wsDoc.data() as Workspace & { deleted?: boolean };
        if (wsData.deleted) continue;
        const pSnap = await getDocs(collection(db, 'workspaces', wsDoc.id, 'parcels'));
        for (const pDoc of pSnap.docs) {
          const p = pDoc.data() as Parcel;
          const pCode = String(p.tracking_code || '').toUpperCase();
          const pDigits = pCode.replace(/[^0-9]/g, '');
          const matchExact = pCode === clean;
          const matchDigits = Boolean(digitsOnly && pDigits && (pDigits === digitsOnly || pDigits.endsWith(digitsOnly)));
          const matchNum = !isNaN(numericVal) && Number(p.parcel_number) === numericVal && clean.length <= 7;
          if (matchExact || matchDigits || matchNum) {
            return {
              ...p,
              workspace_name: wsData.custom_brand_name || wsData.name || 'Sahara📦 Express',
            };
          }
        }
      }
    } catch (err) {
      console.warn('Cloud public tracking search warning:', err);
    }
    return null;
  },
};
