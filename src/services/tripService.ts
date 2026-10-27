/**
 * خدمة إدارة رحلات الشحن (الديسباتش والتفريغ)
 * بين محطات الداخلة ونواذيبو
 */

import { 
  Trip, 
  TripStatus, 
  Parcel, 
  ParcelCondition, 
  RememberedDriver, 
  RememberedVehicle,
  ParcelStatusHistoryEntry,
  Station
} from '../types/database';
import { storageService, generateUUID, isValidUUID } from './storageService';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { parcelService } from './parcelService';

export function mapTripToSupabaseRow(trip: Trip): Record<string, any> {
  return {
    id: isValidUUID(trip.id) ? trip.id : generateUUID(),
    workspace_id: trip.workspace_id,
    trip_number: Number(trip.trip_number) || 1,
    trip_code: trip.trip_code,
    driver_name: trip.driver_name,
    driver_phone: trip.driver_phone || null,
    vehicle_plate: trip.vehicle_plate,
    origin_station_id: trip.origin_station_id,
    destination_station_id: trip.destination_station_id,
    status: trip.status || 'loading',
    parcels_count: Number(trip.parcels_count) || 0,
    loaded_parcel_ids: Array.isArray(trip.loaded_parcel_ids) ? trip.loaded_parcel_ids : [],
    received_parcel_ids: Array.isArray(trip.received_parcel_ids) ? trip.received_parcel_ids : [],
    departure_time: trip.departure_time || null,
    arrival_time: trip.arrival_time || null,
    closed_at: trip.closed_at || null,
    closed_by: isValidUUID(trip.closed_by) ? trip.closed_by : null,
    close_reason: trip.close_reason || null,
    notes: trip.notes || null,
    fuel_expense: Number(trip.fuel_expense) || 0,
    toll_expense: Number(trip.toll_expense) || 0,
    driver_commission: Number(trip.driver_commission) || 0,
    other_expense: Number(trip.other_expense) || 0,
    expense_currency: trip.expense_currency || 'MAD',
    deduct_from_cashbox: Boolean(trip.deduct_from_cashbox),
    created_by: isValidUUID(trip.created_by) ? trip.created_by : null,
    created_at: trip.created_at || new Date().toISOString(),
    updated_at: trip.updated_at || new Date().toISOString(),
  };
}

export function mapSupabaseRowToTrip(row: Record<string, any>, stations: Station[] = []): Trip {
  const originSt = stations.find(s => s.id === row.origin_station_id);
  const destSt = stations.find(s => s.id === row.destination_station_id);
  const loadedIds = Array.isArray(row.loaded_parcel_ids) ? row.loaded_parcel_ids.map(String) : [];
  const receivedIds = Array.isArray(row.received_parcel_ids) ? row.received_parcel_ids.map(String) : [];

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    trip_number: Number(row.trip_number) || 1,
    trip_code: row.trip_code || '',
    driver_name: row.driver_name || '',
    driver_phone: row.driver_phone || undefined,
    vehicle_plate: row.vehicle_plate || '',
    origin_station_id: row.origin_station_id,
    destination_station_id: row.destination_station_id,
    origin_station_name: originSt?.name || 'محطة الانطلاق',
    destination_station_name: destSt?.name || 'محطة الوصول',
    status: (row.status as TripStatus) || 'loading',
    parcels_count: Number(row.parcels_count ?? loadedIds.length),
    loaded_parcel_ids: loadedIds,
    received_parcel_ids: receivedIds,
    departure_time: row.departure_time || null,
    arrival_time: row.arrival_time || null,
    closed_at: row.closed_at || null,
    closed_by: row.closed_by || null,
    closed_by_name: undefined,
    close_reason: row.close_reason || null,
    notes: row.notes || null,
    fuel_expense: Number(row.fuel_expense) || 0,
    toll_expense: Number(row.toll_expense) || 0,
    driver_commission: Number(row.driver_commission) || 0,
    other_expense: Number(row.other_expense) || 0,
    expense_currency: row.expense_currency || 'MAD',
    deduct_from_cashbox: Boolean(row.deduct_from_cashbox),
    created_by: row.created_by || '',
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
  };
}

export const tripService = {
  // توليد رقم تسلسلي للرحلة
  getNextTripNumber(workspaceId: string, existingTrips: Trip[] = []): { tripNumber: number; tripCode: string } {
    const key = `ittihadiya_trip_seq_${workspaceId}`;
    let currentSeq = 0;
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        currentSeq = parseInt(saved, 10) || 0;
      }
    } catch {}

    const maxFromTrips = existingTrips
      .filter(t => t.workspace_id === workspaceId)
      .reduce((max, t) => Math.max(max, Number(t.trip_number) || 0), 0);

    const nextSeq = Math.max(currentSeq, maxFromTrips) + 1;
    try {
      localStorage.setItem(key, nextSeq.toString());
    } catch {}

    const year = new Date().getFullYear();
    const formattedNum = String(nextSeq).padStart(4, '0');
    const tripCode = `TRIP-${year}-${formattedNum}`;

    return { tripNumber: nextSeq, tripCode };
  },

  async syncTripToCloud(trip: Trip, onErrorToast?: (msg: string) => void): Promise<boolean> {
    if (!isSupabaseConfigured() || trip.is_demo) return true;
    if (
      !isValidUUID(trip.workspace_id) ||
      !isValidUUID(trip.origin_station_id) ||
      !isValidUUID(trip.destination_station_id)
    ) {
      return false;
    }

    const row = mapTripToSupabaseRow(trip);
    const supabase = getSupabaseClient();

    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      this.markTripPending(trip.id, row);
      onErrorToast?.('تعذر مزامنة الرحلة مع السحابة (غير متصل). تم الحفظ محلياً وسيتم الرفع عند عودة الإنترنت.');
      return false;
    }

    try {
      const { error } = await supabase.from('trips').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      this.clearTripPendingFlag(trip.id);
      return true;
    } catch (err) {
      console.warn('[tripService] Supabase trip upsert failed, queued for retry:', err);
      this.markTripPending(trip.id, row);
      onErrorToast?.('تعذر حفظ الرحلة في السحابة حالياً. تم حفظها محلياً وسيتمت مزامنتها تلقائياً.');
      return false;
    }
  },

  async syncTripParcelToCloud(
    op: 'upsert' | 'delete',
    payload: {
      workspace_id: string;
      trip_id: string;
      parcel_id: string;
      loaded_at?: string;
      received_at?: string | null;
      condition?: ParcelCondition;
      condition_notes?: string | null;
      scanned_by?: string | null;
      received_by?: string | null;
    },
    onErrorToast?: (msg: string) => void
  ): Promise<boolean> {
    if (!isSupabaseConfigured()) return true;
    if (!isValidUUID(payload.workspace_id) || !isValidUUID(payload.trip_id) || !isValidUUID(payload.parcel_id)) {
      return false;
    }

    const recordKey = `${payload.trip_id}:${payload.parcel_id}`;
    const row = {
      workspace_id: payload.workspace_id,
      trip_id: payload.trip_id,
      parcel_id: payload.parcel_id,
      loaded_at: payload.loaded_at || new Date().toISOString(),
      received_at: payload.received_at ?? null,
      condition: payload.condition || 'normal',
      condition_notes: payload.condition_notes ?? null,
      scanned_by: isValidUUID(payload.scanned_by) ? payload.scanned_by : null,
      received_by: isValidUUID(payload.received_by) ? payload.received_by : null,
    };

    const supabase = getSupabaseClient();
    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      storageService.enqueuePendingSync({
        service: 'trip',
        table: 'trip_parcels',
        operation: op,
        payload: row,
        onConflict: 'trip_id,parcel_id',
        match: op === 'delete' ? { trip_id: payload.trip_id, parcel_id: payload.parcel_id } : undefined,
        recordId: recordKey,
      });
      return false;
    }

    try {
      if (op === 'upsert') {
        const { error } = await supabase
          .from('trip_parcels')
          .upsert(row, { onConflict: 'trip_id,parcel_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('trip_parcels')
          .delete()
          .match({ trip_id: payload.trip_id, parcel_id: payload.parcel_id });
        if (error) throw error;
      }
      return true;
    } catch (err) {
      console.warn('[tripService] Supabase trip_parcels sync failed, queued for retry:', err);
      storageService.enqueuePendingSync({
        service: 'trip',
        table: 'trip_parcels',
        operation: op,
        payload: row,
        onConflict: 'trip_id,parcel_id',
        match: op === 'delete' ? { trip_id: payload.trip_id, parcel_id: payload.parcel_id } : undefined,
        recordId: recordKey,
      });
      onErrorToast?.('تعذر مزامنة حركة الطرد على الرحلة مع السحابة. تم حفظها محلياً.');
      return false;
    }
  },

  markTripPending(tripId: string, rowPayload: Record<string, any>): void {
    storageService.enqueuePendingSync({
      service: 'trip',
      table: 'trips',
      operation: 'upsert',
      payload: rowPayload,
      onConflict: 'id',
      recordId: tripId,
    });
    const cached = storageService.get<Trip[]>('TRIPS', []);
    if (cached.some(t => t.id === tripId)) {
      storageService.set(
        'TRIPS',
        cached.map(t => (t.id === tripId ? { ...t, pending_sync: true } : t))
      );
    }
  },

  clearTripPendingFlag(tripId: string): void {
    const cached = storageService.get<Trip[]>('TRIPS', []);
    if (cached.some(t => t.id === tripId && t.pending_sync)) {
      storageService.set(
        'TRIPS',
        cached.map(t => (t.id === tripId ? { ...t, pending_sync: false } : t))
      );
    }
  },

  async flushPendingSync(): Promise<{ synced: number; failed: number }> {
    if (!isSupabaseConfigured()) return { synced: 0, failed: 0 };
    const supabase = getSupabaseClient();
    if (!supabase || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      return { synced: 0, failed: 0 };
    }

    const pending = storageService.getPendingSync('trip');
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
        if (item.table === 'trips') {
          this.clearTripPendingFlag(item.recordId);
        }
        synced++;
      } catch (err) {
        console.warn('[tripService] Retry pending sync failed for', item.recordId, err);
        failed++;
      }
    }

    return { synced, failed };
  },

  async fetchFromCloud(
    workspaceId: string,
    stations: Station[] = []
  ): Promise<{ trips: Trip[]; drivers: RememberedDriver[]; plates: RememberedVehicle[] } | null> {
    if (!isSupabaseConfigured() || !isValidUUID(workspaceId)) return null;
    const supabase = getSupabaseClient();
    if (!supabase) return null;

    try {
      const [tripsRes, driversRes, vehiclesRes] = await Promise.all([
        supabase.from('trips').select('*').order('created_at', { ascending: false }),
        supabase
          .from('remembered_drivers')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('last_used', { ascending: false }),
        supabase
          .from('remembered_vehicles')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('last_used', { ascending: false }),
      ]);

      if (tripsRes.error) throw tripsRes.error;
      const mappedTrips = (tripsRes.data || []).map(row => mapSupabaseRowToTrip(row, stations));

      const pendingIds = new Set(
        storageService
          .getPendingSync('trip')
          .filter(op => op.table === 'trips')
          .map(op => op.recordId)
      );
      const localCached = storageService.get<Trip[]>('TRIPS', []);
      const unsyncedLocals = localCached.filter(
        t => !t.is_demo && (t.pending_sync || pendingIds.has(t.id)) && !mappedTrips.some(m => m.id === t.id)
      );
      const mergedTrips = [...unsyncedLocals, ...mappedTrips];
      storageService.set('TRIPS', mergedTrips);

      let drivers = this.getRememberedDrivers();
      if (!driversRes.error && driversRes.data && driversRes.data.length > 0) {
        drivers = driversRes.data.map(d => ({
          id: d.id,
          workspace_id: d.workspace_id,
          name: d.name,
          phone: d.phone || undefined,
          last_used: d.last_used || new Date().toISOString(),
        }));
        storageService.set('DRIVERS', drivers);
      }

      let plates = this.getRememberedPlates();
      if (!vehiclesRes.error && vehiclesRes.data && vehiclesRes.data.length > 0) {
        plates = vehiclesRes.data.map(v => ({
          id: v.id,
          workspace_id: v.workspace_id,
          plate: v.plate,
          last_used: v.last_used || new Date().toISOString(),
        }));
        storageService.set('PLATES', plates);
      }

      return { trips: mergedTrips, drivers, plates };
    } catch (err) {
      console.warn('[tripService] Failed to fetch trips from Supabase:', err);
      return null;
    }
  },

  // إنشاء رحلة جديدة
  createTrip(
    params: {
      workspaceId: string;
      driverName: string;
      driverPhone?: string;
      vehiclePlate: string;
      originStationId: string;
      destinationStationId: string;
      originStationName?: string;
      destinationStationName?: string;
      notes?: string;
      fuelExpense?: number;
      tollExpense?: number;
      driverCommission?: number;
      otherExpense?: number;
      expenseCurrency?: string;
      deductFromCashbox?: boolean;
      userId: string;
      userName: string;
      onErrorToast?: (msg: string) => void;
    },
    allTrips: Trip[]
  ): { trip: Trip; updatedList: Trip[] } {
    const { tripNumber, tripCode } = this.getNextTripNumber(params.workspaceId, allTrips);
    const now = new Date().toISOString();
    const tripId = isSupabaseConfigured() ? generateUUID() : `trip-${Date.now()}-${tripNumber}`;

    const newTrip: Trip = {
      id: tripId,
      workspace_id: params.workspaceId,
      trip_number: tripNumber,
      trip_code: tripCode,
      driver_name: params.driverName.trim(),
      driver_phone: params.driverPhone?.trim() || undefined,
      vehicle_plate: params.vehiclePlate.trim(),
      origin_station_id: params.originStationId,
      destination_station_id: params.destinationStationId,
      origin_station_name: params.originStationName || 'محطة الانطلاق',
      destination_station_name: params.destinationStationName || 'محطة الوصول',
      status: 'loading',
      parcels_count: 0,
      loaded_parcel_ids: [],
      received_parcel_ids: [],
      departure_time: null,
      arrival_time: null,
      closed_at: null,
      closed_by: null,
      closed_by_name: null,
      close_reason: null,
      notes: params.notes?.trim() || null,
      fuel_expense: Math.max(0, Number(params.fuelExpense) || 0),
      toll_expense: Math.max(0, Number(params.tollExpense) || 0),
      driver_commission: Math.max(0, Number(params.driverCommission) || 0),
      other_expense: Math.max(0, Number(params.otherExpense) || 0),
      expense_currency: params.expenseCurrency || 'MAD',
      deduct_from_cashbox: Boolean(params.deductFromCashbox),
      created_by: params.userId,
      creator_name: params.userName,
      created_at: now,
      updated_at: now,
    };

    // حفظ السائق واللوحة للاختيار السريع لاحقاً (محلياً وفي السحابة)
    this.rememberDriver(params.driverName.trim(), params.driverPhone?.trim(), params.workspaceId);
    this.rememberPlate(params.vehiclePlate.trim(), params.workspaceId);

    const updatedList = [newTrip, ...allTrips];
    storageService.set('TRIPS', updatedList);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(newTrip, params.onErrorToast);
    }

    return { trip: newTrip, updatedList };
  },

  // تحديث مصاريف الطريق للسائق على رحلة قائمة
  updateTripExpenses(
    tripId: string,
    expenses: {
      fuelExpense: number;
      tollExpense: number;
      driverCommission: number;
      otherExpense: number;
      expenseCurrency: string;
      deductFromCashbox?: boolean;
    },
    allTrips: Trip[],
    onErrorToast?: (msg: string) => void
  ): { success: boolean; error?: string; trip?: Trip; updatedTrips: Trip[] } {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) {
      return { success: false, error: 'الرحلة غير موجودة', updatedTrips: allTrips };
    }

    const now = new Date().toISOString();
    const updatedTrip: Trip = {
      ...trip,
      fuel_expense: Math.max(0, Math.round((Number(expenses.fuelExpense) || 0) * 100) / 100),
      toll_expense: Math.max(0, Math.round((Number(expenses.tollExpense) || 0) * 100) / 100),
      driver_commission: Math.max(0, Math.round((Number(expenses.driverCommission) || 0) * 100) / 100),
      other_expense: Math.max(0, Math.round((Number(expenses.otherExpense) || 0) * 100) / 100),
      expense_currency: expenses.expenseCurrency || trip.expense_currency || 'MAD',
      deduct_from_cashbox: expenses.deductFromCashbox ?? trip.deduct_from_cashbox,
      updated_at: now,
    };

    const updatedTrips = allTrips.map(t => (t.id === tripId ? updatedTrip : t));
    storageService.set('TRIPS', updatedTrips);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(updatedTrip, onErrorToast);
    }

    return { success: true, trip: updatedTrip, updatedTrips };
  },

  // مسح وشحن كولي على متن رحلة (Loading at origin)
  loadParcelToTrip(
    tripId: string,
    parcelIdentifier: string, // tracking code or parcel number string
    user: { id: string; name: string },
    allTrips: Trip[],
    allParcels: Parcel[],
    stationId?: string,
    onErrorToast?: (msg: string) => void
  ): { 
    success: boolean; 
    error?: string; 
    warning?: string; 
    trip?: Trip; 
    parcel?: Parcel; 
    updatedTrips: Trip[]; 
    updatedParcels: Parcel[] 
  } {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) {
      return { success: false, error: 'الرحلة غير موجودة', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    if (trip.status !== 'loading') {
      return { success: false, error: 'لا يمكن شحن طرود؛ الرحلة لم تعد في مرحلة التحميل والشحن', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    // البحث عن الكولي إما بكود التتبع أو بالرقم التسلسلي (مع أو بدون علامة #)
    const cleanId = parcelIdentifier.trim().toUpperCase().replace(/^#/, '');
    const numericId = parseInt(cleanId, 10);
    const parcel = allParcels.find(p => {
      if (p.workspace_id && trip.workspace_id && p.workspace_id !== trip.workspace_id) return false;
      return (
        p.tracking_code.toUpperCase() === cleanId ||
        String(p.parcel_number) === cleanId ||
        (!isNaN(numericId) && p.parcel_number === numericId) ||
        p.id.toUpperCase() === cleanId
      );
    });

    if (!parcel) {
      return { success: false, error: `لم يتم العثور على أي كولي بالرقم أو الباركود [${parcelIdentifier}]`, updatedTrips: allTrips, updatedParcels: allParcels };
    }

    // 1. منع مسح الكولي مرتين على نفس الرحلة
    if (trip.loaded_parcel_ids.includes(parcel.id)) {
      return { success: false, error: `تم شحن هذا الكولي #${parcel.parcel_number} مسبقاً على متن هذه الرحلة!`, updatedTrips: allTrips, updatedParcels: allParcels };
    }

    // 2. التحقق من تواجد الكولي بمحطة الانطلاق
    const isReturnParcel = Boolean(parcel.is_returning || parcel.status === 'return_in_transit');
    let stationWarning: string | undefined = undefined;
    if (isReturnParcel) {
      if (parcel.destination_station_id !== trip.origin_station_id) {
        stationWarning = `تنبيه: هذا الطرد في مسار إرجاع من [${parcel.destination_station_name}] إلى المحطة الأصلية [${parcel.origin_station_name}].`;
      }
    } else if (parcel.origin_station_id !== trip.origin_station_id) {
      stationWarning = `تنبيه: محطة انطلاق هذا الكولي المسجلة هي [${parcel.origin_station_name}] وليست [${trip.origin_station_name}].`;
    }

    if (parcel.status === 'delivered' || parcel.status === 'returned') {
      return { success: false, error: 'هذا الكولي تم تسليمه مسبقاً ولا يمكن شحنه مجدداً', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    const now = new Date().toISOString();
    const targetStatus = isReturnParcel ? 'return_in_transit' : 'in_transit';

    // تحديث سجل تاريخ الكولي
    const historyEntry: ParcelStatusHistoryEntry = {
      status: targetStatus,
      timestamp: now,
      changed_by_id: user.id,
      changed_by_name: user.name,
      trip_id: trip.id,
      trip_code: trip.trip_code,
      driver_name: trip.driver_name,
      vehicle_plate: trip.vehicle_plate,
      notes: isReturnParcel
        ? `إرجاع: تم شحن الطرد المرتجع على الرحلة ${trip.trip_code} عائداً إلى المحطة الأصلية (${trip.destination_station_name}) — السائق: ${trip.driver_name}`
        : `تم الشحن والتحميل على الرحلة ${trip.trip_code} (السائق: ${trip.driver_name} - العربة: ${trip.vehicle_plate})`,
      condition: parcel.condition,
      condition_notes: parcel.condition_notes || undefined,
      return_reason: parcel.return_reason || undefined,
    };

    const updatedParcel: Parcel = {
      ...parcel,
      status: targetStatus,
      is_returning: isReturnParcel,
      current_trip_id: trip.id,
      driver_name: trip.driver_name,
      vehicle_plate: trip.vehicle_plate,
      destination_station_id: isReturnParcel ? parcel.destination_station_id : trip.destination_station_id,
      destination_station_name: isReturnParcel ? parcel.destination_station_name : trip.destination_station_name,
      status_history: [...(parcel.status_history || []), historyEntry],
      updated_at: now
    };

    const updatedLoaded = [...trip.loaded_parcel_ids, parcel.id];
    const updatedTrip: Trip = {
      ...trip,
      loaded_parcel_ids: updatedLoaded,
      parcels_count: updatedLoaded.length,
      updated_at: now
    };

    const updatedTrips = allTrips.map(t => t.id === trip.id ? updatedTrip : t);
    const updatedParcels = allParcels.map(p => p.id === parcel.id ? updatedParcel : p);

    storageService.set('TRIPS', updatedTrips);
    storageService.set('PARCELS', updatedParcels);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(updatedTrip, onErrorToast);
      void parcelService.syncParcelToCloud(updatedParcel, onErrorToast);
      void this.syncTripParcelToCloud(
        'upsert',
        {
          workspace_id: trip.workspace_id,
          trip_id: trip.id,
          parcel_id: parcel.id,
          loaded_at: now,
          condition: parcel.condition,
          condition_notes: parcel.condition_notes || null,
          scanned_by: user.id,
        },
        onErrorToast
      );
    }

    return {
      success: true,
      warning: stationWarning,
      trip: updatedTrip,
      parcel: updatedParcel,
      updatedTrips,
      updatedParcels
    };
  },

  // إلغاء تحميل كولي من الرحلة قبل انطلاقها
  unloadParcelFromTrip(
    tripId: string,
    parcelId: string,
    user: { id: string; name: string },
    allTrips: Trip[],
    allParcels: Parcel[],
    onErrorToast?: (msg: string) => void
  ): { success: boolean; error?: string; trip?: Trip; updatedTrips: Trip[]; updatedParcels: Parcel[] } {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip || trip.status !== 'loading') {
      return { success: false, error: 'لا يمكن تعديل طرود الرحلة بعد انطلاقها', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) {
      return { success: false, error: 'الكولي غير موجود', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    const now = new Date().toISOString();
    const updatedLoaded = trip.loaded_parcel_ids.filter(id => id !== parcelId);
    const updatedTrip: Trip = {
      ...trip,
      loaded_parcel_ids: updatedLoaded,
      parcels_count: updatedLoaded.length,
      updated_at: now
    };

    const isReturnParcel = Boolean(parcel.is_returning || parcel.status === 'return_in_transit');
    const rollbackStatus = isReturnParcel ? 'return_in_transit' : 'registered';

    const rollbackHistory: ParcelStatusHistoryEntry = {
      status: rollbackStatus,
      timestamp: now,
      changed_by_id: user.id,
      changed_by_name: user.name,
      notes: `تم إلغاء الشحن من الرحلة ${trip.trip_code} وإرجاعه لمستودع المحطة`
    };

    const updatedParcel: Parcel = {
      ...parcel,
      status: rollbackStatus,
      current_trip_id: null,
      driver_name: null,
      vehicle_plate: null,
      status_history: [...(parcel.status_history || []), rollbackHistory],
      updated_at: now
    };

    const updatedTrips = allTrips.map(t => t.id === trip.id ? updatedTrip : t);
    const updatedParcels = allParcels.map(p => p.id === parcel.id ? updatedParcel : p);

    storageService.set('TRIPS', updatedTrips);
    storageService.set('PARCELS', updatedParcels);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(updatedTrip, onErrorToast);
      void parcelService.syncParcelToCloud(updatedParcel, onErrorToast);
      void this.syncTripParcelToCloud(
        'delete',
        {
          workspace_id: trip.workspace_id,
          trip_id: trip.id,
          parcel_id: parcel.id,
        },
        onErrorToast
      );
    }

    return { success: true, trip: updatedTrip, updatedTrips, updatedParcels };
  },

  // انطلاق الرحلة (Depart)
  departTrip(
    tripId: string,
    user: { id: string; name: string },
    allTrips: Trip[],
    allParcels: Parcel[],
    onErrorToast?: (msg: string) => void
  ): { success: boolean; error?: string; trip?: Trip; updatedTrips: Trip[]; updatedParcels: Parcel[] } {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) {
      return { success: false, error: 'الرحلة غير موجودة', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    if (trip.loaded_parcel_ids.length === 0) {
      return { success: false, error: 'لا يمكن إطلاق رحلة فارغة دون شحن كولي واحد على الأقل', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    const now = new Date().toISOString();
    const updatedTrip: Trip = {
      ...trip,
      status: 'departed',
      departure_time: now,
      updated_at: now
    };

    const updatedTrips = allTrips.map(t => t.id === trip.id ? updatedTrip : t);
    storageService.set('TRIPS', updatedTrips);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(updatedTrip, onErrorToast);
    }

    return { success: true, trip: updatedTrip, updatedTrips, updatedParcels: allParcels };
  },

  // مسح واستقبال كولي عند وصول الرحلة لمحطة الوجهة (Intake at destination)
  receiveParcelAtDestination(
    tripId: string,
    parcelIdentifier: string,
    condition: ParcelCondition,
    conditionNotes: string | undefined,
    user: { id: string; name: string },
    allTrips: Trip[],
    allParcels: Parcel[],
    onErrorToast?: (msg: string) => void
  ): { 
    success: boolean; 
    error?: string; 
    trip?: Trip; 
    parcel?: Parcel; 
    allScanned?: boolean;
    updatedTrips: Trip[]; 
    updatedParcels: Parcel[] 
  } {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) {
      return { success: false, error: 'الرحلة غير موجودة', updatedTrips: allTrips, updatedParcels: allParcels };
    }

    const cleanId = parcelIdentifier.trim().toUpperCase().replace(/^#/, '');
    const numericId = parseInt(cleanId, 10);
    const parcel = allParcels.find(p => {
      if (p.workspace_id && trip.workspace_id && p.workspace_id !== trip.workspace_id) return false;
      return (
        p.tracking_code.toUpperCase() === cleanId ||
        String(p.parcel_number) === cleanId ||
        (!isNaN(numericId) && p.parcel_number === numericId) ||
        p.id.toUpperCase() === cleanId
      );
    });

    if (!parcel) {
      return { success: false, error: `لم يتم العثور على أي كولي بالرقم [${parcelIdentifier}]`, updatedTrips: allTrips, updatedParcels: allParcels };
    }

    if (!trip.loaded_parcel_ids.includes(parcel.id)) {
      return { success: false, error: `هذا الكولي #${parcel.parcel_number} لم يتم تسجيله على مانيفست هذه الرحلة`, updatedTrips: allTrips, updatedParcels: allParcels };
    }

    if (trip.received_parcel_ids.includes(parcel.id)) {
      return { success: false, error: `تم مسح واستقبال هذا الكولي #${parcel.parcel_number} مسبقاً في هذه المحطة!`, updatedTrips: allTrips, updatedParcels: allParcels };
    }

    const now = new Date().toISOString();
    const isReturnParcel = Boolean(parcel.is_returning || parcel.status === 'return_in_transit');
    const arrivalStatus = isReturnParcel ? 'return_in_transit' : 'arrived';

    const historyEntry: ParcelStatusHistoryEntry = {
      status: arrivalStatus,
      timestamp: now,
      changed_by_id: user.id,
      changed_by_name: user.name,
      trip_id: trip.id,
      trip_code: trip.trip_code,
      driver_name: trip.driver_name,
      vehicle_plate: trip.vehicle_plate,
      condition,
      condition_notes: condition === 'abnormal' ? conditionNotes : undefined,
      notes: isReturnParcel
        ? `إرجاع: وصل الطرد المرتجع إلى المحطة الأصلية (${trip.destination_station_name}) ودخل المستودع بانتظار تسليمه للمرسل`
        : `وصل الكولي لمحطة الوجهة ودخل المستودع (الحالة: ${condition === 'normal' ? 'سليم/عادي' : 'غير عادي - ' + (conditionNotes || '')})`
    };

    const updatedParcel: Parcel = {
      ...parcel,
      status: arrivalStatus,
      is_returning: isReturnParcel,
      condition,
      condition_notes: condition === 'abnormal' ? conditionNotes : parcel.condition_notes,
      status_history: [...(parcel.status_history || []), historyEntry],
      updated_at: now
    };

    const updatedReceived = [...trip.received_parcel_ids, parcel.id];
    const isAllScanned = updatedReceived.length === trip.loaded_parcel_ids.length;

    const updatedTrip: Trip = {
      ...trip,
      status: isAllScanned ? 'arrived' : (trip.status === 'departed' ? 'arrived' : trip.status),
      arrival_time: trip.arrival_time || now,
      received_parcel_ids: updatedReceived,
      updated_at: now
    };

    const updatedTrips = allTrips.map(t => t.id === trip.id ? updatedTrip : t);
    const updatedParcels = allParcels.map(p => p.id === parcel.id ? updatedParcel : p);

    storageService.set('TRIPS', updatedTrips);
    storageService.set('PARCELS', updatedParcels);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(updatedTrip, onErrorToast);
      void parcelService.syncParcelToCloud(updatedParcel, onErrorToast);
      void this.syncTripParcelToCloud(
        'upsert',
        {
          workspace_id: trip.workspace_id,
          trip_id: trip.id,
          parcel_id: parcel.id,
          received_at: now,
          condition,
          condition_notes: condition === 'abnormal' ? (conditionNotes || null) : null,
          received_by: user.id,
        },
        onErrorToast
      );
    }

    return {
      success: true,
      trip: updatedTrip,
      parcel: updatedParcel,
      allScanned: isAllScanned,
      updatedTrips,
      updatedParcels
    };
  },

  // إغلاق الرحلة (أوتوماتيكي أو يدوي مع كتابة سبب الإلزام في حال وجود كوليات مفقودة)
  closeTrip(
    tripId: string,
    user: { id: string; name: string },
    closeReason: string | undefined,
    allTrips: Trip[],
    onErrorToast?: (msg: string) => void
  ): { success: boolean; error?: string; trip?: Trip; updatedTrips: Trip[] } {
    const trip = allTrips.find(t => t.id === tripId);
    if (!trip) {
      return { success: false, error: 'الرحلة غير موجودة', updatedTrips: allTrips };
    }

    const missingCount = trip.loaded_parcel_ids.length - trip.received_parcel_ids.length;
    if (missingCount > 0 && (!closeReason || !closeReason.trim())) {
      return { 
        success: false, 
        error: `يوجد ${missingCount} كولي لم يتم مسحه بعد. يُشترط كتابة سبب ومبرر إداري لإغلاق الرحلة يدويًا.`, 
        updatedTrips: allTrips 
      };
    }

    const now = new Date().toISOString();
    const updatedTrip: Trip = {
      ...trip,
      status: 'closed',
      closed_at: now,
      closed_by: user.id,
      closed_by_name: user.name,
      close_reason: closeReason?.trim() || (missingCount === 0 ? 'تم اكتمال مسح وتفريغ جميع الكوليات بنجاح' : null),
      updated_at: now
    };

    const updatedTrips = allTrips.map(t => t.id === trip.id ? updatedTrip : t);
    storageService.set('TRIPS', updatedTrips);

    if (isSupabaseConfigured()) {
      void this.syncTripToCloud(updatedTrip, onErrorToast);
    }

    return { success: true, trip: updatedTrip, updatedTrips };
  },

  // حفظ واسترجاع السائقين المحفوظين
  rememberDriver(name: string, phone?: string, workspaceId?: string): void {
    if (!name.trim()) return;
    const now = new Date().toISOString();
    const list = storageService.get<RememberedDriver[]>('DRIVERS', [
      { name: 'محمد الأمين ولد فال', phone: '+22246123456', last_used: now },
      { name: 'بوشعيب الصحراوي', phone: '+212661234567', last_used: now },
      { name: 'سيدي عالي ولد احميتي', phone: '+22236987654', last_used: now }
    ]);
    const filtered = list.filter(d => d.name.toLowerCase() !== name.trim().toLowerCase());
    const entry: RememberedDriver = {
      workspace_id: workspaceId,
      name: name.trim(),
      phone: phone?.trim(),
      last_used: now,
    };
    const updated = [entry, ...filtered].slice(0, 15);
    storageService.set('DRIVERS', updated);

    if (isSupabaseConfigured() && isValidUUID(workspaceId)) {
      const row = {
        workspace_id: workspaceId,
        name: name.trim(),
        phone: phone?.trim() || null,
        last_used: now,
      };
      const supabase = getSupabaseClient();
      if (supabase && (typeof navigator === 'undefined' || navigator.onLine)) {
        supabase
          .from('remembered_drivers')
          .upsert(row, { onConflict: 'workspace_id,name' })
          .then(({ error }) => {
            if (error) {
              storageService.enqueuePendingSync({
                service: 'trip',
                table: 'remembered_drivers',
                operation: 'upsert',
                payload: row,
                onConflict: 'workspace_id,name',
                recordId: `${workspaceId}:${name.trim()}`,
              });
            }
          });
      } else {
        storageService.enqueuePendingSync({
          service: 'trip',
          table: 'remembered_drivers',
          operation: 'upsert',
          payload: row,
          onConflict: 'workspace_id,name',
          recordId: `${workspaceId}:${name.trim()}`,
        });
      }
    }
  },

  getRememberedDrivers(): RememberedDriver[] {
    return storageService.get<RememberedDriver[]>('DRIVERS', [
      { name: 'محمد الأمين ولد فال', phone: '+22246123456', last_used: new Date().toISOString() },
      { name: 'بوشعيب الصحراوي', phone: '+212661234567', last_used: new Date().toISOString() },
      { name: 'سيدي عالي ولد احميتي', phone: '+22236987654', last_used: new Date().toISOString() }
    ]);
  },

  // حفظ واسترجاع ماتريكيلات العربات
  rememberPlate(plate: string, workspaceId?: string): void {
    if (!plate.trim()) return;
    const now = new Date().toISOString();
    const list = storageService.get<RememberedVehicle[]>('PLATES', [
      { plate: '68-أ-1234 (شاحنة الداخلة)', last_used: now },
      { plate: '1458-BK-00 (فان نواذيبو)', last_used: now },
      { plate: '24-ب-5678 (تويوتا لاندكروزر)', last_used: now }
    ]);
    const filtered = list.filter(v => v.plate.toLowerCase() !== plate.trim().toLowerCase());
    const entry: RememberedVehicle = {
      workspace_id: workspaceId,
      plate: plate.trim(),
      last_used: now,
    };
    const updated = [entry, ...filtered].slice(0, 15);
    storageService.set('PLATES', updated);

    if (isSupabaseConfigured() && isValidUUID(workspaceId)) {
      const row = {
        workspace_id: workspaceId,
        plate: plate.trim(),
        last_used: now,
      };
      const supabase = getSupabaseClient();
      if (supabase && (typeof navigator === 'undefined' || navigator.onLine)) {
        supabase
          .from('remembered_vehicles')
          .upsert(row, { onConflict: 'workspace_id,plate' })
          .then(({ error }) => {
            if (error) {
              storageService.enqueuePendingSync({
                service: 'trip',
                table: 'remembered_vehicles',
                operation: 'upsert',
                payload: row,
                onConflict: 'workspace_id,plate',
                recordId: `${workspaceId}:${plate.trim()}`,
              });
            }
          });
      } else {
        storageService.enqueuePendingSync({
          service: 'trip',
          table: 'remembered_vehicles',
          operation: 'upsert',
          payload: row,
          onConflict: 'workspace_id,plate',
          recordId: `${workspaceId}:${plate.trim()}`,
        });
      }
    }
  },

  getRememberedPlates(): RememberedVehicle[] {
    return storageService.get<RememberedVehicle[]>('PLATES', [
      { plate: '68-أ-1234 (شاحنة الداخلة)', last_used: new Date().toISOString() },
      { plate: '1458-BK-00 (فان نواذيبو)', last_used: new Date().toISOString() },
      { plate: '24-ب-5678 (تويوتا لاندكروزر)', last_used: new Date().toISOString() }
    ]);
  }
};
