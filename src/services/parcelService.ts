import { 
  Parcel, 
  ParcelStatus, 
  ParcelCondition,
  ParcelPayer,
  PaymentStatus,
  ParcelStatusHistoryEntry, 
  ParcelPaymentEntry,
  Station
} from '../types/database';
import { storageService, generateUUID, isValidUUID } from './storageService';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';

export function mapParcelToSupabaseRow(parcel: Parcel): Record<string, any> {
  return {
    id: isValidUUID(parcel.id) ? parcel.id : generateUUID(),
    workspace_id: parcel.workspace_id,
    parcel_number: Number(parcel.parcel_number) || 101,
    tracking_code: parcel.tracking_code,
    origin_station_id: parcel.origin_station_id,
    destination_station_id: parcel.destination_station_id,
    sender_name: parcel.sender_name,
    sender_phone: parcel.sender_phone,
    receiver_name: parcel.receiver_name,
    receiver_phone: parcel.receiver_phone,
    route: parcel.route,
    description: parcel.description,
    category: parcel.category || 'بضائع عامة',
    items_count: Math.max(1, Number(parcel.items_count) || 1),
    weight_kg: parcel.weight_kg !== undefined && parcel.weight_kg !== null ? Number(parcel.weight_kg) : null,
    declared_value: parcel.declared_value !== undefined && parcel.declared_value !== null ? Number(parcel.declared_value) : null,
    amount_due: Number(parcel.amount_due ?? parcel.shipping_fee ?? 0),
    payer: parcel.payer || 'sender',
    amount_paid: Number(parcel.amount_paid ?? 0),
    currency: parcel.currency === 'MRU' ? 'MRU' : 'MAD',
    status: parcel.status || 'registered',
    condition: parcel.condition || 'normal',
    condition_notes: parcel.condition_notes || null,
    current_trip_id: isValidUUID(parcel.current_trip_id) ? parcel.current_trip_id : null,
    driver_name: parcel.driver_name || null,
    vehicle_plate: parcel.vehicle_plate || null,
    is_returning: Boolean(parcel.is_returning || parcel.status === 'return_in_transit' || parcel.status === 'returned'),
    return_reason: parcel.return_reason || null,
    return_notes: parcel.return_notes || null,
    return_fee: Number(parcel.return_fee ?? 0),
    return_initiated_at: parcel.return_initiated_at || null,
    return_initiated_by: isValidUUID(parcel.return_initiated_by) ? parcel.return_initiated_by : null,
    returned_to_sender_at: parcel.returned_to_sender_at || null,
    returned_to_sender_name: parcel.returned_to_sender_name || null,
    status_history: Array.isArray(parcel.status_history) ? parcel.status_history : [],
    payment_history: Array.isArray(parcel.payment_history) ? parcel.payment_history : [],
    notes: parcel.notes || null,
    delivered_to: parcel.delivered_to || null,
    delivered_at: parcel.delivered_at || null,
    created_by: isValidUUID(parcel.created_by) ? parcel.created_by : null,
    created_at: parcel.created_at || new Date().toISOString(),
    updated_at: parcel.updated_at || new Date().toISOString(),
  };
}

export function mapSupabaseRowToParcel(row: Record<string, any>, stations: Station[] = []): Parcel {
  const amountDue = Math.round(Number(row.amount_due ?? 0) * 100) / 100;
  const amountPaid = Math.round(Number(row.amount_paid ?? 0) * 100) / 100;
  const payer: ParcelPayer = row.payer === 'receiver' ? 'receiver' : 'sender';
  const paymentStatus: PaymentStatus =
    amountPaid >= amountDue && amountDue > 0
      ? 'paid'
      : amountPaid > 0
      ? 'partial'
      : payer === 'receiver'
      ? 'cod'
      : 'unpaid';

  const originSt = stations.find(s => s.id === row.origin_station_id);
  const destSt = stations.find(s => s.id === row.destination_station_id);
  const statusHistory: ParcelStatusHistoryEntry[] = Array.isArray(row.status_history) ? row.status_history : [];

  return {
    id: row.id,
    tracking_code: row.tracking_code,
    parcel_number: Number(row.parcel_number) || 101,
    workspace_id: row.workspace_id,
    team_id: row.workspace_id,
    origin_station_id: row.origin_station_id,
    destination_station_id: row.destination_station_id,
    origin_station_name: originSt?.name || 'محطة الانطلاق',
    destination_station_name: destSt?.name || 'محطة الوصول',
    sender_name: row.sender_name || '',
    sender_phone: row.sender_phone || '',
    receiver_name: row.receiver_name || '',
    receiver_phone: row.receiver_phone || '',
    route: row.route || `${originSt?.city || 'الانطلاق'} ➔ ${destSt?.city || 'الوصول'}`,
    description: row.description || '',
    category: row.category || 'بضائع عامة',
    items_count: Number(row.items_count) || 1,
    weight_kg: row.weight_kg !== null && row.weight_kg !== undefined ? Number(row.weight_kg) : undefined,
    declared_value: row.declared_value !== null && row.declared_value !== undefined ? Number(row.declared_value) : undefined,
    amount_due: amountDue,
    shipping_fee: amountDue,
    cod_amount: payer === 'receiver' ? Math.max(0, Math.round((amountDue - amountPaid) * 100) / 100) : 0,
    payer,
    amount_paid: amountPaid,
    currency: row.currency || 'MAD',
    payment_status: paymentStatus,
    status: (row.status as ParcelStatus) || 'registered',
    condition: (row.condition as ParcelCondition) || 'normal',
    condition_notes: row.condition_notes || null,
    current_trip_id: row.current_trip_id || null,
    driver_name: row.driver_name || null,
    vehicle_plate: row.vehicle_plate || null,
    is_returning: Boolean(row.is_returning || row.status === 'return_in_transit' || row.status === 'returned'),
    return_reason: row.return_reason || null,
    return_notes: row.return_notes || null,
    return_fee: Number(row.return_fee ?? 0),
    return_initiated_at: row.return_initiated_at || null,
    return_initiated_by: row.return_initiated_by || null,
    returned_to_sender_at: row.returned_to_sender_at || null,
    returned_to_sender_name: row.returned_to_sender_name || null,
    status_history: statusHistory,
    payment_history: Array.isArray(row.payment_history) ? row.payment_history : [],
    created_by: row.created_by || '',
    creator_name: statusHistory[0]?.changed_by_name || undefined,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
    delivered_at: row.delivered_at || null,
    delivered_to: row.delivered_to || null,
    notes: row.notes || null,
  };
}

export const parcelService = {
  // توليد رقم تسلسلي فريد وتصاعدي للكولي داخل مساحة العمل (محلياً)
  getNextParcelNumber(workspaceId: string, existingParcels: Parcel[] = []): { parcelNumber: number; trackingCode: string } {
    const key = `ittihadiya_seq_${workspaceId}`;
    let currentSeq = 100;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        currentSeq = parseInt(saved, 10) || 100;
      }
    } catch {}

    const maxFromParcels = existingParcels
      .filter(p => p.workspace_id === workspaceId)
      .reduce((max, p) => Math.max(max, Number(p.parcel_number) || 0), 100);

    const nextSeq = Math.max(currentSeq, maxFromParcels) + 1;
    try {
      localStorage.setItem(key, nextSeq.toString());
    } catch {}

    const year = new Date().getFullYear();
    const formattedNum = String(nextSeq).padStart(5, '0');
    const trackingCode = `ITT-${year}-${formattedNum}`;

    return { parcelNumber: nextSeq, trackingCode };
  },

  // توليد رقم تسلسلي ذري عبر قاعدة البيانات عند تفعيل Supabase لمنع التصادم بين الأجهزة
  async getNextParcelNumberAsync(
    workspaceId: string,
    existingParcels: Parcel[] = []
  ): Promise<{ parcelNumber: number; trackingCode: string }> {
    if (isSupabaseConfigured() && isValidUUID(workspaceId) && (typeof navigator === 'undefined' || navigator.onLine)) {
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          const { data, error } = await supabase.rpc('rpc_next_parcel_number', {
            p_workspace_id: workspaceId,
          });
          if (!error && data && data.success && data.parcel_number && data.tracking_code) {
            const num = Number(data.parcel_number);
            const code = String(data.tracking_code);
            try {
              localStorage.setItem(`ittihadiya_seq_${workspaceId}`, num.toString());
            } catch {}
            return { parcelNumber: num, trackingCode: code };
          }
        } catch (err) {
          console.warn('[parcelService] rpc_next_parcel_number fallback to local sequence:', err);
        }
      }
    }
    return this.getNextParcelNumber(workspaceId, existingParcels);
  },

  // مزامنة كولي واحد مع Supabase مع حفظ معلق في حال انقطاع الاتصال
  async syncParcelToCloud(
    parcel: Parcel,
    onErrorToast?: (msg: string) => void
  ): Promise<boolean> {
    if (!isSupabaseConfigured() || parcel.is_demo) return true;
    if (
      !isValidUUID(parcel.workspace_id) ||
      !isValidUUID(parcel.origin_station_id) ||
      !isValidUUID(parcel.destination_station_id)
    ) {
      return false;
    }

    const row = mapParcelToSupabaseRow(parcel);
    const supabase = getSupabaseClient();

    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.markParcelPending(parcel.id, row);
      onErrorToast?.('تعذر المزامنة مع السحابة (غير متصل). تم الحفظ محلياً وسيتم الرفع عند عودة الإنترنت.');
      return false;
    }

    try {
      const { error } = await supabase.from('parcels').upsert(row, { onConflict: 'id' });
      if (error) {
        throw error;
      }
      this.clearParcelPendingFlag(parcel.id);
      return true;
    } catch (err) {
      console.warn('[parcelService] Supabase upsert failed, queued for retry:', err);
      this.markParcelPending(parcel.id, row);
      onErrorToast?.('تعذر حفظ الكولي في السحابة حالياً. تم حفظه محلياً وسيتمت مزامنته تلقائياً.');
      return false;
    }
  },

  markParcelPending(parcelId: string, rowPayload: Record<string, any>): void {
    storageService.enqueuePendingSync({
      service: 'parcel',
      table: 'parcels',
      operation: 'upsert',
      payload: rowPayload,
      onConflict: 'id',
      recordId: parcelId,
    });
    const cached = storageService.get<Parcel[]>('PARCELS', []);
    if (cached.some(p => p.id === parcelId)) {
      storageService.set(
        'PARCELS',
        cached.map(p => (p.id === parcelId ? { ...p, pending_sync: true } : p))
      );
    }
  },

  clearParcelPendingFlag(parcelId: string): void {
    const cached = storageService.get<Parcel[]>('PARCELS', []);
    if (cached.some(p => p.id === parcelId && p.pending_sync)) {
      storageService.set(
        'PARCELS',
        cached.map(p => (p.id === parcelId ? { ...p, pending_sync: false } : p))
      );
    }
  },

  async flushPendingSync(): Promise<{ synced: number; failed: number }> {
    if (!isSupabaseConfigured()) return { synced: 0, failed: 0 };
    const supabase = getSupabaseClient();
    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return { synced: 0, failed: 0 };
    }

    const pending = storageService.getPendingSync('parcel');
    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        if (item.operation === 'upsert') {
          const { error } = await supabase
            .from(item.table)
            .upsert(item.payload, { onConflict: item.onConflict || 'id' });
          if (error) throw error;
        } else if (item.operation === 'delete' && item.match) {
          const { error } = await supabase.from(item.table).delete().match(item.match);
          if (error) throw error;
        }
        storageService.removePendingSync(item.id);
        this.clearParcelPendingFlag(item.recordId);
        synced++;
      } catch (err) {
        console.warn('[parcelService] Retry pending sync failed for', item.recordId, err);
        failed++;
      }
    }

    return { synced, failed };
  },

  async fetchFromCloud(workspaceId: string, stations: Station[] = []): Promise<Parcel[] | null> {
    if (!isSupabaseConfigured() || !isValidUUID(workspaceId)) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const { data, error } = await supabase
        .from('parcels')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const mapped = (data || []).map(row => mapSupabaseRowToParcel(row, stations));

      // Preserve any locally-pending unsynced parcels so offline work is never lost
      const pendingIds = new Set(storageService.getPendingSync('parcel').map(op => op.recordId));
      const localCached = storageService.get<Parcel[]>('PARCELS', []);
      const unsyncedLocals = localCached.filter(
        p => !p.is_demo && (p.pending_sync || pendingIds.has(p.id)) && !mapped.some(m => m.id === p.id)
      );

      const merged = [...unsyncedLocals, ...mapped];
      storageService.set('PARCELS', merged);
      return merged;
    } catch (err) {
      console.warn('[parcelService] Failed to fetch parcels from Supabase:', err);
      return null;
    }
  },

  createParcel(
    params: {
      id?: string;
      parcelNumber?: number;
      trackingCode?: string;
      workspaceId: string;
      originStationId: string;
      destinationStationId: string;
      originStationName?: string;
      destinationStationName?: string;
      senderName: string;
      senderPhone: string;
      receiverName: string;
      receiverPhone: string;
      description: string;
      category?: string;
      itemsCount: number;
      weightKg?: number;
      declaredValue?: number;
      amountDue: number;
      codAmount?: number;
      payer: ParcelPayer;
      amountPaid: number;
      currency: string;
      notes?: string;
      userId: string;
      userName: string;
      route?: string;
      condition?: ParcelCondition;
      conditionNotes?: string;
      onErrorToast?: (msg: string) => void;
    },
    allParcels: Parcel[]
  ): { parcel: Parcel; updatedList: Parcel[] } {
    const seq =
      params.parcelNumber && params.trackingCode
        ? { parcelNumber: params.parcelNumber, trackingCode: params.trackingCode }
        : this.getNextParcelNumber(params.workspaceId, allParcels);
    const { parcelNumber, trackingCode } = seq;
    const now = new Date().toISOString();

    const parcelCondition: ParcelCondition = params.condition || 'normal';

    const initialStatusHistory: ParcelStatusHistoryEntry[] = [
      {
        status: 'registered',
        timestamp: now,
        changed_by_id: params.userId,
        changed_by_name: params.userName,
        condition: parcelCondition,
        condition_notes: parcelCondition === 'abnormal' ? params.conditionNotes?.trim() : undefined,
        notes: parcelCondition === 'abnormal' 
          ? `تم تسجيل الكولي بحالة غير عادية: ${params.conditionNotes?.trim() || 'بدون تفاصيل'}` 
          : 'تم تسجيل الكولي في النظام بنجاح وبحالة سليمة'
      }
    ];

    const initialPayments: ParcelPaymentEntry[] = [];
    if (params.amountPaid > 0) {
      initialPayments.push({
        id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        amount: Math.round(Number(params.amountPaid) * 100) / 100,
        currency: params.currency,
        paid_by: params.payer === 'sender' ? params.senderName : params.receiverName,
        recorded_by_id: params.userId,
        recorded_by_name: params.userName,
        recorded_at: now,
        note: 'دفعة أولية مسجلة عند إنشاء الكولي'
      });
    }

    const amountDue = Math.round(Number(params.amountDue) * 100) / 100;
    const amountPaid = Math.round(Number(params.amountPaid) * 100) / 100;
    const parcelId = params.id || (isSupabaseConfigured() ? generateUUID() : `pcl-${Date.now()}-${parcelNumber}`);

    const newParcel: Parcel = {
      id: parcelId,
      tracking_code: trackingCode,
      parcel_number: parcelNumber,
      workspace_id: params.workspaceId,
      team_id: params.workspaceId,
      origin_station_id: params.originStationId,
      destination_station_id: params.destinationStationId,
      origin_station_name: params.originStationName || 'محطة الانطلاق',
      destination_station_name: params.destinationStationName || 'محطة الوصول',
      sender_name: params.senderName.trim(),
      sender_phone: params.senderPhone.trim(),
      receiver_name: params.receiverName.trim(),
      receiver_phone: params.receiverPhone.trim(),
      route: params.route?.trim() || `${params.originStationName || 'الانطلاق'} ➔ ${params.destinationStationName || 'الوصول'}`,
      description: params.description.trim(),
      category: params.category || 'طرد بضائع عامة',
      items_count: Number(params.itemsCount) || 1,
      weight_kg: params.weightKg ? Number(params.weightKg) : undefined,
      declared_value: params.declaredValue ? Number(params.declaredValue) : undefined,
      amount_due: amountDue,
      shipping_fee: amountDue,
      cod_amount: params.codAmount !== undefined ? Math.round(Number(params.codAmount) * 100) / 100 : 0,
      payer: params.payer,
      amount_paid: amountPaid,
      currency: params.currency || 'MAD',
      payment_status: amountPaid >= amountDue ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
      status: 'registered',
      condition: parcelCondition,
      condition_notes: parcelCondition === 'abnormal' ? (params.conditionNotes?.trim() || null) : null,
      current_trip_id: null,
      driver_name: null,
      vehicle_plate: null,
      status_history: initialStatusHistory,
      payment_history: initialPayments,
      created_by: params.userId,
      creator_name: params.userName,
      created_at: now,
      updated_at: now,
      notes: params.notes?.trim() || null,
    };

    const updatedList = [newParcel, ...allParcels];
    storageService.set('PARCELS', updatedList);

    if (isSupabaseConfigured()) {
      void this.syncParcelToCloud(newParcel, params.onErrorToast);
    }

    return { parcel: newParcel, updatedList };
  },

  updateStatus(
    parcelId: string,
    newStatus: ParcelStatus,
    userId: string,
    userName: string,
    note: string | undefined,
    allParcels: Parcel[],
    deliveredTo?: string,
    condition?: ParcelCondition,
    conditionNotes?: string,
    onErrorToast?: (msg: string) => void
  ): { success: boolean; parcel?: Parcel; updatedList: Parcel[]; warningUnpaid?: boolean } {
    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return { success: false, updatedList: allParcels };

    const now = new Date().toISOString();
    const remaining = Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100;
    const warningUnpaid = newStatus === 'delivered' && remaining > 0;

    const effectiveCondition = condition || parcel.condition || 'normal';
    const effectiveConditionNotes = condition === 'abnormal' 
      ? conditionNotes?.trim() 
      : (parcel.condition_notes || undefined);

    const newHistoryEntry: ParcelStatusHistoryEntry = {
      status: newStatus,
      timestamp: now,
      changed_by_id: userId,
      changed_by_name: userName,
      condition: effectiveCondition,
      condition_notes: effectiveConditionNotes,
      trip_id: parcel.current_trip_id,
      driver_name: parcel.driver_name,
      vehicle_plate: parcel.vehicle_plate,
      notes: note?.trim() || undefined
    };

    const updatedParcel: Parcel = {
      ...parcel,
      status: newStatus,
      condition: effectiveCondition,
      condition_notes: effectiveCondition === 'abnormal' ? (effectiveConditionNotes || null) : parcel.condition_notes,
      status_history: [...(parcel.status_history || []), newHistoryEntry],
      updated_at: now,
      notes: note?.trim() ? `${parcel.notes || ''} [${note.trim()}]`.trim() : parcel.notes,
      delivered_at: newStatus === 'delivered' ? now : parcel.delivered_at,
      delivered_to: newStatus === 'delivered' ? (deliveredTo || parcel.receiver_name) : parcel.delivered_to,
    };

    const updatedList = allParcels.map(p => p.id === parcelId ? updatedParcel : p);
    storageService.set('PARCELS', updatedList);

    if (isSupabaseConfigured()) {
      void this.syncParcelToCloud(updatedParcel, onErrorToast);
    }

    return { 
      success: true, 
      parcel: updatedParcel, 
      updatedList, 
      warningUnpaid 
    };
  },

  recordPayment(
    parcelId: string,
    amount: number,
    paidBy: string,
    userId: string,
    userName: string,
    note: string | undefined,
    allParcels: Parcel[],
    onErrorToast?: (msg: string) => void
  ): { success: boolean; parcel?: Parcel; updatedList: Parcel[]; newPayment?: ParcelPaymentEntry } {
    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return { success: false, updatedList: allParcels };

    const numAmount = Math.round(Number(amount) * 100) / 100;
    if (numAmount <= 0) return { success: false, updatedList: allParcels };

    const now = new Date().toISOString();
    const newPayment: ParcelPaymentEntry = {
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: numAmount,
      currency: parcel.currency,
      paid_by: paidBy.trim() || (parcel.payer === 'sender' ? parcel.sender_name : parcel.receiver_name),
      recorded_by_id: userId,
      recorded_by_name: userName,
      recorded_at: now,
      note: note?.trim() || 'تسديد دفعة'
    };

    const newTotalPaid = Math.round((parcel.amount_paid + numAmount) * 100) / 100;
    const newPaymentStatus: PaymentStatus =
      newTotalPaid >= parcel.amount_due ? 'paid' : newTotalPaid > 0 ? 'partial' : 'unpaid';

    const updatedParcel: Parcel = {
      ...parcel,
      amount_paid: newTotalPaid,
      payment_status: newPaymentStatus,
      payment_history: [...(parcel.payment_history || []), newPayment],
      updated_at: now
    };

    const updatedList = allParcels.map(p => p.id === parcelId ? updatedParcel : p);
    storageService.set('PARCELS', updatedList);

    if (isSupabaseConfigured()) {
      void this.syncParcelToCloud(updatedParcel, onErrorToast);
    }

    return { success: true, parcel: updatedParcel, updatedList, newPayment };
  },

  updateParcel(
    parcelId: string,
    updates: Partial<Parcel>,
    allParcels: Parcel[],
    onErrorToast?: (msg: string) => void
  ): { success: boolean; parcel?: Parcel; updatedList: Parcel[] } {
    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return { success: false, updatedList: allParcels };

    const updatedParcel: Parcel = {
      ...parcel,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const updatedList = allParcels.map(p => (p.id === parcelId ? updatedParcel : p));
    storageService.set('PARCELS', updatedList);

    if (isSupabaseConfigured()) {
      void this.syncParcelToCloud(updatedParcel, onErrorToast);
    }

    return { success: true, parcel: updatedParcel, updatedList };
  }
};
