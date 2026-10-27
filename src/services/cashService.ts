import { 
  Transaction, 
  TransactionType, 
  TransactionStatus, 
  TransactionEditEntry,
  DailyClosingReport, 
  Station, 
  AuditLogEntry 
} from '../types/database';
import { storageService, generateUUID, isValidUUID } from './storageService';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export function mapTransactionToSupabaseRow(tx: Transaction): Record<string, any> {
  const personPhone = tx.person_phone ?? tx.phone_number ?? null;
  const personName = (tx.person_name || tx.creator_name || personPhone || tx.reason || 'عميل المحطة').trim();

  return {
    id: isValidUUID(tx.id) ? tx.id : generateUUID(),
    workspace_id: tx.workspace_id,
    station_id: tx.station_id,
    created_by: isValidUUID(tx.created_by) ? tx.created_by : null,
    type: tx.type,
    amount: Math.max(0.01, Math.round(Number(tx.amount) * 100) / 100),
    currency: tx.currency === 'MRU' ? 'MRU' : 'MAD',
    person_name: personName,
    person_phone: personPhone,
    reason: tx.reason || null,
    photo_url: tx.photo_url || null,
    status: tx.status || 'confirmed',
    note: tx.note || null,
    parcel_id: isValidUUID(tx.parcel_id) ? tx.parcel_id : null,
    edit_history: Array.isArray(tx.edit_history) ? tx.edit_history : [],
    created_at: tx.created_at || new Date().toISOString(),
    updated_at: tx.updated_at || new Date().toISOString(),
  };
}

export function mapSupabaseRowToTransaction(row: Record<string, any>, stations: Station[] = []): Transaction {
  const st = stations.find(s => s.id === row.station_id);
  const editHistory: TransactionEditEntry[] = Array.isArray(row.edit_history) ? row.edit_history : [];
  const cancelEntry = [...editHistory].reverse().find(e => e.action === 'CANCEL');

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    team_id: row.workspace_id,
    station_id: row.station_id,
    station_name: st?.name || 'محطة الاتحادية',
    created_by: row.created_by || '',
    creator_name: row.person_name || undefined,
    person_name: row.person_name || '',
    person_phone: row.person_phone ?? null,
    phone_number: row.person_phone ?? null,
    type: row.type as TransactionType,
    amount: Math.round(Number(row.amount ?? 0) * 100) / 100,
    currency: row.currency || 'MAD',
    reason: row.reason ?? null,
    photo_url: row.photo_url ?? null,
    status: (row.status as TransactionStatus) || 'confirmed',
    note: row.note ?? null,
    parcel_id: row.parcel_id ?? null,
    edit_history: editHistory,
    cancelled_by_name: cancelEntry?.edited_by_name ?? null,
    cancelled_at: cancelEntry?.edited_at ?? null,
    cancel_reason: cancelEntry?.reason ?? null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

export function mapAuditLogToSupabaseRow(audit: AuditLogEntry): Record<string, any> {
  return {
    id: isValidUUID(audit.id) ? audit.id : generateUUID(),
    workspace_id: audit.workspace_id,
    user_id: isValidUUID(audit.user_id) ? audit.user_id : null,
    action: audit.action,
    table_name: audit.table_name,
    record_id: String(audit.record_id),
    reason: audit.reason || null,
    old_data: audit.old_data || null,
    new_data: audit.new_data
      ? { ...audit.new_data, _audit_user_name: audit.user_name || undefined }
      : null,
    created_at: audit.created_at || new Date().toISOString(),
  };
}

export function mapSupabaseRowToAuditLog(row: Record<string, any>): AuditLogEntry {
  const newData = row.new_data && typeof row.new_data === 'object' ? row.new_data : null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    team_id: row.workspace_id,
    user_id: row.user_id || null,
    user_name: newData?._audit_user_name || newData?.creator_name || undefined,
    action: (row.action as AuditLogEntry['action']) || 'INSERT',
    table_name: row.table_name || 'transactions',
    record_id: String(row.record_id || ''),
    reason: row.reason || undefined,
    old_data: row.old_data || null,
    new_data: newData,
    created_at: row.created_at || new Date().toISOString(),
  };
}

export const cashService = {
  // حساب أرصدة الصناديق بدقة لكل عملة على حدة (MAD و MRU مفصولتان تماماً)
  calculateStationBalances(
    stations: Station[],
    transactions: Transaction[]
  ): Record<string, { MAD: number; MRU: number }> {
    const balances: Record<string, { MAD: number; MRU: number }> = {};

    stations.forEach(s => {
      balances[s.id] = { MAD: 0, MRU: 0 };
    });

    transactions.forEach(tx => {
      if (tx.status !== 'confirmed' || tx.deleted_at) return;

      if (!balances[tx.station_id]) {
        balances[tx.station_id] = { MAD: 0, MRU: 0 };
      }

      const curr = tx.currency === 'MRU' ? 'MRU' : 'MAD';
      const amt = Number(tx.amount);
      if (isNaN(amt)) return;

      const isInflow = tx.type === 'cash_in' || tx.type === 'parcel_shipping_fee' || tx.type === 'parcel_cod_collection';
      const isOutflow = tx.type === 'cash_out' || tx.type === 'goods_payment' || tx.type === 'parcel_cod_payout';

      if (isInflow) {
        balances[tx.station_id][curr] += amt;
      } else if (isOutflow) {
        balances[tx.station_id][curr] -= amt;
      }

      balances[tx.station_id][curr] = Math.round(balances[tx.station_id][curr] * 100) / 100;
    });

    return balances;
  },

  async syncTransactionAndAuditToCloud(
    tx: Transaction,
    audit?: AuditLogEntry,
    onErrorToast?: (msg: string) => void
  ): Promise<boolean> {
    if (!isSupabaseConfigured() || tx.is_demo) return true;
    if (!isValidUUID(tx.workspace_id) || !isValidUUID(tx.station_id)) {
      return false;
    }

    const txRow = mapTransactionToSupabaseRow(tx);
    const auditRow = audit && !audit.is_demo && isValidUUID(audit.workspace_id)
      ? mapAuditLogToSupabaseRow(audit)
      : null;

    const supabase = getSupabaseClient();
    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.markTransactionPending(tx.id, txRow, audit?.id, auditRow);
      onErrorToast?.('تعذر مزامنة السند المالي مع السحابة (غير متصل). تم الحفظ محلياً وسيتم الرفع عند عودة الإنترنت.');
      return false;
    }

    try {
      // Phase 4: Migrate Base64 receipt image to private Supabase Storage bucket 'receipts'
      if (typeof txRow.photo_url === 'string' && txRow.photo_url.startsWith('data:image/')) {
        const uploadedPath = await this.uploadReceiptPhoto(tx.workspace_id, txRow.photo_url);
        if (uploadedPath) {
          txRow.photo_url = uploadedPath;
        }
      }

      const { error: txErr } = await supabase.from('transactions').upsert(txRow, { onConflict: 'id' });
      if (txErr) throw txErr;

      if (auditRow) {
        const { error: auditErr } = await supabase.from('audit_logs').upsert(auditRow, { onConflict: 'id' });
        if (auditErr) {
          storageService.enqueuePendingSync({
            service: 'cash',
            table: 'audit_logs',
            operation: 'upsert',
            payload: auditRow,
            onConflict: 'id',
            recordId: audit!.id,
          });
        }
      }

      this.clearTransactionPendingFlag(tx.id);
      return true;
    } catch (err) {
      console.warn('[cashService] Supabase transaction upsert failed, queued for retry:', err);
      this.markTransactionPending(tx.id, txRow, audit?.id, auditRow);
      onErrorToast?.('تعذر حفظ السند المالي في السحابة حالياً. تم حفظه محلياً وسيتمت مزامنته تلقائياً.');
      return false;
    }
  },

  async syncAuditToCloud(audit: AuditLogEntry): Promise<boolean> {
    if (!isSupabaseConfigured() || audit.is_demo || !isValidUUID(audit.workspace_id)) return true;
    const auditRow = mapAuditLogToSupabaseRow(audit);
    const supabase = getSupabaseClient();
    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      storageService.enqueuePendingSync({
        service: 'cash',
        table: 'audit_logs',
        operation: 'upsert',
        payload: auditRow,
        onConflict: 'id',
        recordId: audit.id,
      });
      return false;
    }
    try {
      const { error } = await supabase.from('audit_logs').upsert(auditRow, { onConflict: 'id' });
      if (error) throw error;
      return true;
    } catch {
      storageService.enqueuePendingSync({
        service: 'cash',
        table: 'audit_logs',
        operation: 'upsert',
        payload: auditRow,
        onConflict: 'id',
        recordId: audit.id,
      });
      return false;
    }
  },

  async uploadReceiptPhoto(workspaceId: string, dataUrlOrPath: string): Promise<string> {
    if (!dataUrlOrPath) return '';
    if (!dataUrlOrPath.startsWith('data:image/')) return dataUrlOrPath;
    if (!isSupabaseConfigured() || !isValidUUID(workspaceId) || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return dataUrlOrPath; // Offline fallback: keep compressed data URL until online sync migrates it
    }
    const supabase = getSupabaseClient();
    if (!supabase) return dataUrlOrPath;

    try {
      const parts = dataUrlOrPath.split(',');
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const binaryStr = atob(parts[1]);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: mime });
      const filePath = `${workspaceId}/receipt-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}.jpg`;

      const { error } = await supabase.storage
        .from('receipts')
        .upload(filePath, blob, { contentType: mime, upsert: true });

      if (error) {
        console.warn('[cashService] Storage upload fallback:', error.message);
        return dataUrlOrPath;
      }
      return `storage://receipts/${filePath}`;
    } catch (err) {
      console.warn('[cashService] Failed to upload receipt to storage:', err);
      return dataUrlOrPath;
    }
  },

  async resolveReceiptPhotoUrl(photoUrl?: string | null): Promise<string | null> {
    if (!photoUrl) return null;
    if (!photoUrl.startsWith('storage://receipts/')) return photoUrl;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const objectPath = photoUrl.replace('storage://receipts/', '');
    try {
      const { data, error } = await supabase.storage
        .from('receipts')
        .createSignedUrl(objectPath, 3600);
      if (error || !data?.signedUrl) return null;
      return data.signedUrl;
    } catch {
      return null;
    }
  },

  async syncStationBalanceToCloud(
    stationId: string,
    workspaceId: string,
    currency: 'MAD' | 'MRU',
    balance: number
  ): Promise<void> {
    if (!isSupabaseConfigured() || !isValidUUID(stationId) || !isValidUUID(workspaceId)) return;
    const supabase = getSupabaseClient();
    const row = {
      station_id: stationId,
      workspace_id: workspaceId,
      currency,
      balance: Math.round(Number(balance) * 100) / 100,
      updated_at: new Date().toISOString(),
    };

    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      storageService.enqueuePendingSync({
        service: 'cash',
        table: 'station_balances',
        operation: 'upsert',
        payload: row,
        onConflict: 'station_id,currency',
        recordId: `${stationId}:${currency}`,
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('station_balances')
        .upsert(row, { onConflict: 'station_id,currency' });
      if (error) throw error;
    } catch {
      // Non-fatal: trg_update_station_balance in PostgreSQL already maintains station_balances on transaction insert/update
    }
  },

  markTransactionPending(
    txId: string,
    txRow: Record<string, any>,
    auditId?: string,
    auditRow?: Record<string, any> | null
  ): void {
    storageService.enqueuePendingSync({
      service: 'cash',
      table: 'transactions',
      operation: 'upsert',
      payload: txRow,
      onConflict: 'id',
      recordId: txId,
    });

    if (auditId && auditRow) {
      storageService.enqueuePendingSync({
        service: 'cash',
        table: 'audit_logs',
        operation: 'upsert',
        payload: auditRow,
        onConflict: 'id',
        recordId: auditId,
      });
    }

    const cached = storageService.get<Transaction[]>('TRANSACTIONS', []);
    if (cached.some(t => t.id === txId)) {
      storageService.set(
        'TRANSACTIONS',
        cached.map(t => (t.id === txId ? { ...t, pending_sync: true } : t))
      );
    }
  },

  clearTransactionPendingFlag(txId: string): void {
    const cached = storageService.get<Transaction[]>('TRANSACTIONS', []);
    if (cached.some(t => t.id === txId && t.pending_sync)) {
      storageService.set(
        'TRANSACTIONS',
        cached.map(t => (t.id === txId ? { ...t, pending_sync: false } : t))
      );
    }
  },

  async flushPendingSync(): Promise<{ synced: number; failed: number }> {
    if (!isSupabaseConfigured()) return { synced: 0, failed: 0 };
    const supabase = getSupabaseClient();
    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return { synced: 0, failed: 0 };
    }

    const pending = storageService.getPendingSync('cash');
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        if (item.operation === 'upsert') {
          const payload = { ...item.payload };
          if (
            item.table === 'transactions' &&
            typeof payload.photo_url === 'string' &&
            payload.photo_url.startsWith('data:image/') &&
            payload.workspace_id
          ) {
            const uploadedPath = await this.uploadReceiptPhoto(payload.workspace_id, payload.photo_url);
            if (uploadedPath) {
              payload.photo_url = uploadedPath;
            }
          }
          const { error } = await supabase
            .from(item.table)
            .upsert(payload, { onConflict: item.onConflict || 'id' });
          if (error) throw error;
        } else if (item.operation === 'delete' && item.match) {
          const { error } = await supabase.from(item.table).delete().match(item.match);
          if (error) throw error;
        }
        storageService.removePendingSync(item.id);
        if (item.table === 'transactions') {
          this.clearTransactionPendingFlag(item.recordId);
        }
        synced++;
      } catch (err) {
        console.warn('[cashService] Retry pending sync failed for', item.recordId, err);
        failed++;
      }
    }

    return { synced, failed };
  },

  async fetchFromCloud(
    workspaceId: string,
    stations: Station[] = []
  ): Promise<{
    transactions: Transaction[];
    auditLogs: AuditLogEntry[];
    stationBalances: Record<string, { MAD: number; MRU: number }>;
  } | null> {
    if (!isSupabaseConfigured() || !isValidUUID(workspaceId)) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const [txRes, auditRes, balRes] = await Promise.all([
        supabase.from('transactions').select('*').order('created_at', { ascending: false }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }),
        supabase.from('station_balances').select('*'),
      ]);

      if (txRes.error) throw txRes.error;
      const mappedTx = (txRes.data || []).map(row => mapSupabaseRowToTransaction(row, stations));

      const pendingTxIds = new Set(
        storageService
          .getPendingSync('cash')
          .filter(op => op.table === 'transactions')
          .map(op => op.recordId)
      );
      const localCachedTx = storageService.get<Transaction[]>('TRANSACTIONS', []);
      const unsyncedLocalTx = localCachedTx.filter(
        t => !t.is_demo && (t.pending_sync || pendingTxIds.has(t.id)) && !mappedTx.some(m => m.id === t.id)
      );
      const mergedTx = [...unsyncedLocalTx, ...mappedTx];
      storageService.set('TRANSACTIONS', mergedTx);

      let mergedAudit = storageService.get<AuditLogEntry[]>('AUDIT_LOGS', []).filter(a => !a.is_demo);
      if (!auditRes.error && auditRes.data) {
        const mappedAudit = auditRes.data.map(mapSupabaseRowToAuditLog);
        const pendingAuditIds = new Set(
          storageService
            .getPendingSync('cash')
            .filter(op => op.table === 'audit_logs')
            .map(op => op.recordId)
        );
        const unsyncedAudit = mergedAudit.filter(
          a => (a.pending_sync || pendingAuditIds.has(a.id)) && !mappedAudit.some(m => m.id === a.id)
        );
        mergedAudit = [...unsyncedAudit, ...mappedAudit];
        storageService.set('AUDIT_LOGS', mergedAudit);
      }

      const calculatedBalances = this.calculateStationBalances(stations, mergedTx);
      if (!balRes.error && balRes.data && balRes.data.length > 0 && mergedTx.length === 0) {
        balRes.data.forEach((b: any) => {
          if (!calculatedBalances[b.station_id]) {
            calculatedBalances[b.station_id] = { MAD: 0, MRU: 0 };
          }
          const curr = b.currency === 'MRU' ? 'MRU' : 'MAD';
          calculatedBalances[b.station_id][curr] = Math.round(Number(b.balance ?? 0) * 100) / 100;
        });
      }

      return {
        transactions: mergedTx,
        auditLogs: mergedAudit,
        stationBalances: calculatedBalances,
      };
    } catch (err) {
      console.warn('[cashService] Failed to fetch transactions from Supabase:', err);
      return null;
    }
  },

  createTransaction(
    params: {
      workspaceId: string;
      stationId: string;
      stationName: string;
      type: TransactionType;
      amount: number;
      currency: string;
      personName: string;
      personPhone?: string;
      reason?: string;
      note?: string;
      photoUrl?: string;
      parcelId?: string;
      userId: string;
      userName: string;
      onErrorToast?: (msg: string) => void;
    },
    allTransactions: Transaction[],
    auditLogs: AuditLogEntry[]
  ): { transaction: Transaction; updatedTransactions: Transaction[]; updatedAuditLogs: AuditLogEntry[] } {
    const now = new Date().toISOString();
    const cleanAmount = Math.round(Number(params.amount) * 100) / 100;
    const txId = isSupabaseConfigured()
      ? generateUUID()
      : `tx-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
    const auditId = isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`;

    const newTx: Transaction = {
      id: txId,
      workspace_id: params.workspaceId,
      team_id: params.workspaceId,
      station_id: params.stationId,
      station_name: params.stationName,
      created_by: params.userId,
      creator_name: params.userName,
      person_name: (params.personName || params.userName || params.personPhone || params.reason || 'عميل المحطة').trim(),
      person_phone: params.personPhone?.trim() || null,
      phone_number: params.personPhone?.trim() || null,
      type: params.type,
      amount: cleanAmount,
      currency: params.currency || 'MAD',
      reason: params.reason?.trim() || null,
      note: params.note?.trim() || null,
      photo_url: params.photoUrl || null,
      parcel_id: params.parcelId || null,
      status: 'confirmed',
      edit_history: [],
      created_at: now,
      updated_at: now,
    };

    const audit: AuditLogEntry = {
      id: auditId,
      workspace_id: params.workspaceId,
      team_id: params.workspaceId,
      user_id: params.userId,
      user_name: params.userName,
      action: 'INSERT',
      table_name: 'transactions',
      record_id: newTx.id,
      old_data: null,
      new_data: newTx,
      created_at: now,
    };

    const updatedTransactions = [newTx, ...allTransactions];
    const updatedAuditLogs = [audit, ...auditLogs];

    storageService.set('TRANSACTIONS', updatedTransactions);
    storageService.set('AUDIT_LOGS', updatedAuditLogs);

    if (isSupabaseConfigured()) {
      void this.syncTransactionAndAuditToCloud(newTx, audit, params.onErrorToast);
    }

    return { transaction: newTx, updatedTransactions, updatedAuditLogs };
  },

  // تعديل معاملة مع إلزامية كتابة السبب وحفظ السجل
  updateTransaction(
    params: {
      transactionId: string;
      reason: string; // إلزامي
      newAmount?: number;
      newPersonName?: string;
      newPersonPhone?: string;
      newReason?: string;
      newNote?: string;
      userId: string;
      userName: string;
      onErrorToast?: (msg: string) => void;
    },
    allTransactions: Transaction[],
    auditLogs: AuditLogEntry[]
  ): { success: boolean; transaction?: Transaction; updatedTransactions: Transaction[]; updatedAuditLogs: AuditLogEntry[]; error?: string } {
    if (!params.reason || params.reason.trim().length < 3) {
      return { 
        success: false, 
        updatedTransactions: allTransactions, 
        updatedAuditLogs: auditLogs,
        error: 'يجب كتابة سبب التعديل بشكل واضح (3 أحرف على الأقل)' 
      };
    }

    const tx = allTransactions.find(t => t.id === params.transactionId);
    if (!tx) {
      return { 
        success: false, 
        updatedTransactions: allTransactions, 
        updatedAuditLogs: auditLogs,
        error: 'المعاملة غير موجودة' 
      };
    }

    const now = new Date().toISOString();
    const previousData = { ...tx };

    const editEntry: TransactionEditEntry = {
      edited_at: now,
      edited_by_id: params.userId,
      edited_by_name: params.userName,
      reason: params.reason.trim(),
      action: 'UPDATE' as const,
      previous_data: {
        amount: tx.amount,
        reason: tx.reason,
        phone_number: tx.phone_number,
        note: tx.note,
      }
    };

    const nextPhone = params.newPersonPhone !== undefined ? (params.newPersonPhone.trim() || null) : tx.person_phone;

    const updatedTx: Transaction = {
      ...tx,
      amount: params.newAmount !== undefined ? Math.round(Number(params.newAmount) * 100) / 100 : tx.amount,
      person_name: params.newPersonName !== undefined ? params.newPersonName.trim() : tx.person_name,
      person_phone: nextPhone,
      phone_number: nextPhone,
      reason: params.newReason !== undefined ? (params.newReason.trim() || null) : tx.reason,
      note: params.newNote !== undefined ? (params.newNote.trim() || null) : tx.note,
      updated_at: now,
      edit_history: [...(tx.edit_history || []), editEntry]
    };

    const auditId = isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`;
    const audit: AuditLogEntry = {
      id: auditId,
      workspace_id: tx.workspace_id,
      team_id: tx.workspace_id,
      user_id: params.userId,
      user_name: params.userName,
      action: 'UPDATE',
      table_name: 'transactions',
      record_id: tx.id,
      reason: params.reason.trim(),
      old_data: previousData,
      new_data: updatedTx,
      created_at: now,
    };

    const updatedTransactions = allTransactions.map(t => t.id === params.transactionId ? updatedTx : t);
    const updatedAuditLogs = [audit, ...auditLogs];

    storageService.set('TRANSACTIONS', updatedTransactions);
    storageService.set('AUDIT_LOGS', updatedAuditLogs);

    if (isSupabaseConfigured()) {
      void this.syncTransactionAndAuditToCloud(updatedTx, audit, params.onErrorToast);
    }

    return { success: true, transaction: updatedTx, updatedTransactions, updatedAuditLogs };
  },

  // إلغاء معاملة مع إلزامية كتابة السبب وحفظ السجل
  cancelTransaction(
    params: {
      transactionId: string;
      reason: string; // إلزامي
      userId: string;
      userName: string;
      onErrorToast?: (msg: string) => void;
    },
    allTransactions: Transaction[],
    auditLogs: AuditLogEntry[]
  ): { success: boolean; transaction?: Transaction; updatedTransactions: Transaction[]; updatedAuditLogs: AuditLogEntry[]; error?: string } {
    if (!params.reason || params.reason.trim().length < 3) {
      return { 
        success: false, 
        updatedTransactions: allTransactions, 
        updatedAuditLogs: auditLogs,
        error: 'يجب كتابة سبب الإلغاء بشكل واضح (3 أحرف على الأقل)' 
      };
    }

    const tx = allTransactions.find(t => t.id === params.transactionId);
    if (!tx) {
      return { 
        success: false, 
        updatedTransactions: allTransactions, 
        updatedAuditLogs: auditLogs,
        error: 'المعاملة غير موجودة' 
      };
    }

    const now = new Date().toISOString();
    const previousData = { ...tx };
    const writtenReason = params.reason.trim();

    const cancelEntry: TransactionEditEntry = {
      edited_at: now,
      edited_by_id: params.userId,
      edited_by_name: params.userName,
      reason: writtenReason,
      action: 'CANCEL' as const,
      previous_data: {
        amount: tx.amount,
        status: tx.status,
      }
    };

    const updatedTx: Transaction = {
      ...tx,
      status: 'cancelled',
      cancelled_by_name: params.userName,
      cancelled_at: now,
      cancel_reason: writtenReason,
      note: `${tx.note ? tx.note + ' | ' : ''}[تم الإلغاء: ${writtenReason}]`,
      updated_at: now,
      edit_history: [...(tx.edit_history || []), cancelEntry]
    };

    const auditId = isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`;
    const audit: AuditLogEntry = {
      id: auditId,
      workspace_id: tx.workspace_id,
      team_id: tx.workspace_id,
      user_id: params.userId,
      user_name: params.userName,
      action: 'CANCEL',
      table_name: 'transactions',
      record_id: tx.id,
      reason: writtenReason,
      old_data: previousData,
      new_data: updatedTx,
      created_at: now,
    };

    const updatedTransactions = allTransactions.map(t => t.id === params.transactionId ? updatedTx : t);
    const updatedAuditLogs = [audit, ...auditLogs];

    storageService.set('TRANSACTIONS', updatedTransactions);
    storageService.set('AUDIT_LOGS', updatedAuditLogs);

    if (isSupabaseConfigured()) {
      void this.syncTransactionAndAuditToCloud(updatedTx, audit, params.onErrorToast);
    }

    return { success: true, transaction: updatedTx, updatedTransactions, updatedAuditLogs };
  },

  // تقرير إغلاق اليومية الدقيق للمحطة
  generateDailyClosingReport(
    stationId: string,
    stationName: string,
    dateString: string, // YYYY-MM-DD
    transactions: Transaction[],
    generatedByName: string
  ): DailyClosingReport {
    // تصفية المعاملات للمحطة والتاريخ
    const targetDate = dateString.split('T')[0];
    const stationTx = transactions.filter(tx => tx.station_id === stationId && tx.status === 'confirmed');

    // المعاملات السابقة لليوم لحساب الرصيد الافتتاحي
    const beforeTx = stationTx.filter(tx => {
      const txDate = tx.created_at.split('T')[0];
      return txDate < targetDate;
    });

    // معاملات نفس اليوم
    const todayTx = stationTx.filter(tx => {
      const txDate = tx.created_at.split('T')[0];
      return txDate === targetDate;
    });

    const currencies = ['MAD', 'MRU'].map(curr => {
      let opening = 0;
      beforeTx.forEach(tx => {
        if (tx.currency !== curr) return;
        const amt = Number(tx.amount) || 0;
        const isIn = tx.type === 'cash_in' || tx.type === 'parcel_shipping_fee' || tx.type === 'parcel_cod_collection';
        opening += isIn ? amt : -amt;
      });

      let totalIn = 0;
      let totalOut = 0;
      let count = 0;

      todayTx.forEach(tx => {
        if (tx.currency !== curr) return;
        count++;
        const amt = Number(tx.amount) || 0;
        const isIn = tx.type === 'cash_in' || tx.type === 'parcel_shipping_fee' || tx.type === 'parcel_cod_collection';
        if (isIn) totalIn += amt;
        else totalOut += amt;
      });

      const closing = Math.round((opening + totalIn - totalOut) * 100) / 100;

      return {
        currency: curr,
        opening_balance: Math.round(opening * 100) / 100,
        total_in: Math.round(totalIn * 100) / 100,
        total_out: Math.round(totalOut * 100) / 100,
        closing_balance: closing,
        transactions_count: count
      };
    });

    return {
      station_id: stationId,
      station_name: stationName,
      date: targetDate,
      currencies,
      generated_at: new Date().toISOString(),
      generated_by: generatedByName
    };
  }
};
