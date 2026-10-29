import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, Trip } from '../types/database';
import { ParcelStickerModal } from './ParcelStickerModal';
import { ParcelDetailModal } from './ParcelDetailModal';
import { NewTripModal } from './NewTripModal';
import { TripDispatchModal } from './TripDispatchModal';
import { TripArrivalModal } from './TripArrivalModal';
import { QuickDeliverModal } from './QuickDeliverModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { exportService } from '../services/exportService';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';
import {
  printOfficialTripManifestPDF,
  printOfficialParcelBonPDF,
  openWhatsAppParcelNotification,
  formatDateTimeStandard,
  formatTrackingCodeNumeric,
  matchesTrackingCode,
} from '../utils/logisticsFeatures';
import { 
  Package, 
  Search, 
  PlusCircle, 
  MapPin, 
  Printer, 
  Eye, 
  AlertTriangle,
  MessageCircle,
  FileSpreadsheet,
  Truck,
  Scan,
  UserCheck,
  Layers,
  Inbox,
  CheckSquare,
  Square,
  Users,
  RotateCcw,
  MessageSquare,
  FileText,
  ChevronDown,
  SlidersHorizontal,
  BarChart3,
  Trash2,
  Copy
} from 'lucide-react';

interface ParcelsViewProps {
  onOpenNewParcel: () => void;
  onOpenCustomerAccounts?: () => void;
  onOpenCollabRoom?: () => void;
}

export const ParcelsView: React.FC<ParcelsViewProps> = ({ 
  onOpenNewParcel,
  onOpenCustomerAccounts,
  onOpenCollabRoom,
}) => {
  const { 
    parcels, 
    trips,
    stations, 
    selectedStationId,
    currentWorkspace, 
    userRole,
    userAssignedStationId,
    hideAmounts,
    deleteParcel,
    deleteTrip,
    showToast 
  } = useApp();

  const [itemToDelete, setItemToDelete] = useState<{
    type: 'parcel' | 'trip';
    id: string;
    label: string;
  } | null>(null);

  // Navigation Tabs within Parcels Module
  const [activeTab, setActiveTab] = useState<'parcels' | 'trips' | 'incoming' | 'overview'>('parcels');

  // Search & Filter state for Parcels Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'settled' | 'unpaid'>('all');
  const [stationFilter, setStationFilter] = useState<string>(() =>
    userRole === 'worker' && userAssignedStationId
      ? userAssignedStationId
      : selectedStationId || 'all'
  );
  const [dateFilter] = useState<string>('all');
  const [conditionFilter, setConditionFilter] = useState<string>('all');

  // Keep station filter in sync with global station scope (and locked for workers)
  useEffect(() => {
    if (userRole === 'worker' && userAssignedStationId) {
      setStationFilter(userAssignedStationId);
    } else if (selectedStationId) {
      setStationFilter(selectedStationId);
    } else {
      setStationFilter('all');
    }
  }, [selectedStationId, userRole, userAssignedStationId]);

  // Compact / Collapsible UI States (اختصارات بالسهم الصغير)
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [expandedParcelIds, setExpandedParcelIds] = useState<Set<string>>(new Set());
  const [expandedTripIds, setExpandedTripIds] = useState<Set<string>>(new Set());

  const toggleParcelExpand = (id: string) => {
    setExpandedParcelIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTripExpand = (id: string) => {
    setExpandedTripIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Modals state
  const [ticketParcel, setTicketParcel] = useState<Parcel | null>(null);
  const [batchStickerParcels, setBatchStickerParcels] = useState<Parcel[] | undefined>(undefined);
  const [isBatchStickerModalOpen, setIsBatchStickerModalOpen] = useState(false);
  const [selectedParcelIds, setSelectedParcelIds] = useState<Set<string>>(new Set());
  const [detailParcel, setDetailParcel] = useState<Parcel | null>(null);
  const [isNewTripOpen, setIsNewTripOpen] = useState(false);
  const [dispatchTrip, setDispatchTrip] = useState<Trip | null>(null);
  const [arrivalTrip, setArrivalTrip] = useState<Trip | null>(null);
  const [quickDeliverParcel, setQuickDeliverParcel] = useState<Parcel | null>(null);
  const [isQuickDeliverOpen, setIsQuickDeliverOpen] = useState(false);
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // Active Station context (for workers or selected station)
  const activeStationId = (userRole === 'worker' && userAssignedStationId)
    ? userAssignedStationId
    : (selectedStationId || stations[0]?.id || '');
  const activeStation = stations.find(s => s.id === activeStationId) || stations[0];

  // 1. Filtered Parcels List
  const filteredParcels = useMemo(() => {
    return parcels.filter(p => {
      // Status Filter
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;

      // Condition Filter (عادي / غير عادي)
      if (conditionFilter !== 'all') {
        const cond = p.condition || 'normal';
        if (cond !== conditionFilter) return false;
      }

      // Station Filter
      if (stationFilter !== 'all') {
        if (p.origin_station_id !== stationFilter && p.destination_station_id !== stationFilter) {
          return false;
        }
      }

      // Payment Filter
      const remaining = Math.max(0, Math.round((p.amount_due - p.amount_paid) * 100) / 100);
      if (paymentFilter === 'settled' && remaining > 0) return false;
      if (paymentFilter === 'unpaid' && remaining <= 0) return false;

      // Date Filter
      if (dateFilter !== 'all') {
        const parcelDate = p.created_at.split('T')[0];
        const today = new Date().toISOString().split('T')[0];
        if (dateFilter === 'today' && parcelDate !== today) return false;
      }

      // Search Query (Number, Code, Sender, Receiver, Phone, Description, Driver, Plate)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = matchesTrackingCode(p, searchQuery) || p.tracking_code.toLowerCase().includes(q);
        const matchNum = p.parcel_number?.toString().includes(q);
        const matchSender = p.sender_name.toLowerCase().includes(q) || p.sender_phone.includes(q);
        const matchReceiver = p.receiver_name.toLowerCase().includes(q) || p.receiver_phone.includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchDriver = p.driver_name?.toLowerCase().includes(q);
        const matchPlate = p.vehicle_plate?.toLowerCase().includes(q);
        if (!matchNum && !matchCode && !matchSender && !matchReceiver && !matchDesc && !matchDriver && !matchPlate) {
          return false;
        }
      }

      return true;
    });
  }, [parcels, statusFilter, conditionFilter, paymentFilter, stationFilter, dateFilter, searchQuery]);

  // Scoped parcels & trips for the currently selected station (or all when stationFilter === 'all')
  const stationScopedParcels = useMemo(() => {
    if (stationFilter === 'all') return parcels;
    return parcels.filter(
      p => p.origin_station_id === stationFilter || p.destination_station_id === stationFilter
    );
  }, [parcels, stationFilter]);

  const stationScopedTrips = useMemo(() => {
    if (stationFilter === 'all') return trips;
    return trips.filter(
      t => t.origin_station_id === stationFilter || t.destination_station_id === stationFilter
    );
  }, [trips, stationFilter]);

  // Statistics (Scoped to the selected station or all stations)
  const stats = useMemo(() => {
    let registered = 0;
    let inTransit = 0;
    let arrived = 0;
    let delivered = 0;
    let returning = 0;
    let abnormalCount = 0;
    let totalUnpaidMad = 0;
    let totalUnpaidMru = 0;

    const thresholdDays = currentWorkspace?.unclaimed_days_threshold || 5;
    const nowMs = Date.now();
    const unclaimedList: Parcel[] = [];

    stationScopedParcels.forEach(p => {
      if (p.status === 'registered') registered++;
      else if (p.status === 'in_transit') inTransit++;
      else if (p.status === 'arrived') {
        arrived++;
        const refDate = p.arrived_at || p.updated_at || p.created_at;
        const daysDiff = Math.floor((nowMs - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff >= thresholdDays) {
          unclaimedList.push(p);
        }
      }
      else if (p.status === 'delivered') delivered++;
      else if (p.status === 'return_in_transit' || p.status === 'returned') returning++;

      if (p.condition === 'abnormal') abnormalCount++;

      const rem = Math.max(0, Math.round((p.amount_due - p.amount_paid) * 100) / 100);
      if (rem > 0) {
        if (p.currency === 'MRU') totalUnpaidMru += rem;
        else totalUnpaidMad += rem;
      }
    });

    return {
      total: stationScopedParcels.length,
      registered,
      inTransit,
      arrived,
      delivered,
      returning,
      unclaimedList,
      thresholdDays,
      abnormalCount,
      totalUnpaidMad: Math.round(totalUnpaidMad * 100) / 100,
      totalUnpaidMru: Math.round(totalUnpaidMru * 100) / 100
    };
  }, [stationScopedParcels, currentWorkspace?.unclaimed_days_threshold]);

  // Incoming trips heading to my station (or all incoming trips when 'all' is selected)
  const incomingTrips = useMemo(() => {
    return trips.filter(t => {
      const isHeadingToStation =
        stationFilter === 'all' ? true : t.destination_station_id === stationFilter;
      const isEnRouteOrArrived = t.status === 'departed' || t.status === 'arrived';
      return isHeadingToStation && isEnRouteOrArrived;
    });
  }, [trips, stationFilter]);

  // Export PDF
  const handleExportPDF = () => {
    if (parcels.length === 0) {
      showToast('لا توجد كوليات لتصديرها حالياً', 'info');
      return;
    }
    exportService.exportParcelsToPDF(stationScopedParcels, currentWorkspace?.name || 'Sahara📦 Express');
    showToast('تم فتح وتحميل سجل الكوليات بصيغة PDF بنجاح', 'success');
  };

  const getWhatsAppLink = (rawPhone: string) => {
    const clean = rawPhone.replace(/[^0-9]/g, '');
    return `https://wa.me/${clean}`;
  };

  const handleGlobalScanResult = (code: string) => {
    const found = parcels.find(p => matchesTrackingCode(p, code));

    if (found) {
      playSuccessBeep();
      setIsBarcodeScannerOpen(false);
      setDetailParcel(found);
      const numericCode = formatTrackingCodeNumeric(found.tracking_code, found.parcel_number);
      showToast(`تم العثور على الكولي ${numericCode} (${found.sender_name} ➔ ${found.receiver_name})`, 'success');
    } else {
      playErrorBeep();
      showToast(`لم يتم العثور على أي كولي بالرقم [${code}]`, 'error');
    }
  };

  const statusNames: Record<string, string> = {
    registered: 'تم التسجيل',
    in_transit: 'في الطريق',
    arrived: 'وصلت المحطة',
    delivered: 'تم التسليم',
    return_in_transit: 'قيد الإرجاع ↺',
    returned: 'تم الإرجاع ✓',
    cancelled: 'ملغاة'
  };

  const tripStatusNames: Record<string, { label: string; color: string }> = {
    loading: { label: 'قيد التحميل والشحن', color: 'bg-black/60 text-[#F5C84C] border-[#F5C84C]/40' },
    departed: { label: 'انطلقت في الطريق 🚚', color: 'bg-[#006233]/35 text-[#2ECC71] border-[#2ECC71]/50' },
    arrived: { label: 'وصلت محطة الوجهة 🏁', color: 'bg-black/60 text-[#F5C84C] border-[#F5C84C]/40' },
    closed: { label: 'مغلقة ومكتملة ✓', color: 'bg-black/50 text-white/80 border-white/25' }
  };

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (conditionFilter !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0) +
    (stationFilter !== 'all' ? 1 : 0);

  return (
    <div className="space-y-2.5 pb-28 text-right">
      {/* Top Banner & Compact Quick Actions */}
      <div className="luxury-card p-3.5 rounded-[22px] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h1 className="text-xs sm:text-sm font-black text-white truncate">
              إدارة الكوليات والديسباتش
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40 font-black shrink-0">
              {stats.total} كولي
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsMoreToolsOpen(prev => !prev)}
            className="btn-cancel px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
            title="إظهار أو إخفاء الأدوات السريعة"
          >
            <span>أدوات سريعة</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                isMoreToolsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Primary 2 Buttons Always Accessible */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsBarcodeScannerOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
          >
            <Scan className="w-3.5 h-3.5" />
            <span>مسح باركود / QR</span>
          </button>

          <button
            type="button"
            onClick={onOpenNewParcel}
            className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 text-[#F5C84C]" />
            <span>كولي جديد</span>
          </button>
        </div>

        {/* Collapsible Secondary Quick Actions (تفتح فقط عند الضغط على السهم) */}
        {isMoreToolsOpen && (
          <div className="pt-2 border-t border-white/15 space-y-2 animate-fadeIn">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setQuickDeliverParcel(null);
                  setIsQuickDeliverOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>تسليم سريع</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNewTripOpen(true)}
                className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>رحلة جديدة</span>
              </button>

              {onOpenCustomerAccounts && (
                <button
                  type="button"
                  onClick={onOpenCustomerAccounts}
                  className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>حسابات الزبناء</span>
                </button>
              )}

              {onOpenCollabRoom && userRole === 'owner' && (
                <button
                  type="button"
                  onClick={onOpenCollabRoom}
                  className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>غرف الشراكة</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const chosen = parcels.filter(p => selectedParcelIds.has(p.id));
                  setBatchStickerParcels(chosen.length > 0 ? chosen : filteredParcels.slice(0, 1));
                  setIsBatchStickerModalOpen(true);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2.5 rounded-xl font-black text-[11px] transition active:scale-95 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  طباعة الملصقات{selectedParcelIds.size > 0 ? ` (${selectedParcelIds.size})` : ''}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('parcels');
                  setStatusFilter(statusFilter === 'return_in_transit' ? 'all' : 'return_in_transit');
                }}
                className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-black flex items-center gap-1 transition cursor-pointer ${
                  statusFilter === 'return_in_transit' || statusFilter === 'returned'
                    ? 'btn-gold'
                    : 'btn-cancel'
                }`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>المرجعة ({stats.returning})</span>
              </button>

              <button
                type="button"
                onClick={handleExportPDF}
                className="btn-cancel px-2.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1 text-[11px] font-black"
                title="تصدير سجل الكوليات بصيغة PDF"
              >
                <FileText className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>PDF</span>
              </button>
            </div>
          </div>
        )}

        {/* 4 Core Module Navigation Tabs in 1 Compact Row */}
        <div className="grid grid-cols-4 gap-1 border-t border-white/15 pt-2 text-[10px] font-black">
          <button
            type="button"
            onClick={() => setActiveTab('parcels')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl transition cursor-pointer truncate ${
              activeTab === 'parcels' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Package className="w-3 h-3 shrink-0" />
            <span className="truncate">الكوليات ({stationScopedParcels.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('trips')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl transition cursor-pointer truncate ${
              activeTab === 'trips' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Truck className="w-3 h-3 shrink-0" />
            <span className="truncate">الرحلات ({stationScopedTrips.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('incoming')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl transition cursor-pointer truncate ${
              activeTab === 'incoming' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Inbox className="w-3 h-3 shrink-0" />
            <span className="truncate">الوارد ({incomingTrips.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl transition cursor-pointer truncate ${
              activeTab === 'overview' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Layers className="w-3 h-3 shrink-0" />
            <span className="truncate">المحطات</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PARCELS LIST (الكوليات والإرساليات - مختصرة بالسهم) */}
      {/* ========================================================================= */}
      {activeTab === 'parcels' && (
        <div className="space-y-2.5">
          {/* Collapsible Stats & Alerts Bar (مختصر في سطر واحد بالسهم) */}
          <div className="luxury-card px-3.5 py-2.5 rounded-[20px]">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsStatsOpen(prev => !prev)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsStatsOpen(prev => !prev);
                }
              }}
              className="flex items-center justify-between gap-2 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <BarChart3 className="w-4 h-4 text-[#F5C84C] shrink-0" />
                <span className="text-xs font-black text-white">ملخص الحالات والتحصيل</span>
                <span className="text-[10px] text-white/80 font-mono">
                  (مسجل: <strong className="text-[#F5C84C]">{stats.registered}</strong> • طريق:{' '}
                  <strong className="text-[#F5C84C]">{stats.inTransit}</strong> • وصلت:{' '}
                  <strong className="text-[#2ECC71]">{stats.arrived}</strong>)
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
                  isStatsOpen ? 'rotate-180' : ''
                }`}
              />
            </div>

            {isStatsOpen && (
              <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 animate-fadeIn">
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  <div className="bg-black/50 border border-white/10 p-2 rounded-xl text-center">
                    <span className="text-[9px] text-white/75 font-bold block">تم التسجيل</span>
                    <span className="text-sm font-black text-[#F5C84C]">{stats.registered}</span>
                  </div>
                  <div className="bg-black/50 border border-white/10 p-2 rounded-xl text-center">
                    <span className="text-[9px] text-white/75 font-bold block">في الطريق</span>
                    <span className="text-sm font-black text-[#F5C84C]">{stats.inTransit}</span>
                  </div>
                  <div className="bg-black/50 border border-white/10 p-2 rounded-xl text-center">
                    <span className="text-[9px] text-white/75 font-bold block">وصلت المحطة</span>
                    <span className="text-sm font-black text-[#2ECC71]">{stats.arrived}</span>
                  </div>
                  <div className="bg-black/50 border border-white/10 p-2 rounded-xl text-center">
                    <span className="text-[9px] text-white/75 font-bold block">تم التسليم</span>
                    <span className="text-sm font-black text-white">{stats.delivered}</span>
                  </div>
                </div>

                {(stats.totalUnpaidMad > 0 || stats.totalUnpaidMru > 0) && (
                  <div className="bg-black/50 border border-[#F5C84C]/35 p-2.5 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                      <span className="font-bold text-[#F5C84C] text-[11px]">المتبقي للتحصيل:</span>
                    </div>
                    <div className="flex items-center gap-2 font-mono font-black text-xs text-white" dir="ltr">
                      {stats.totalUnpaidMad > 0 && <span>{hideAmounts ? '••••' : stats.totalUnpaidMad} MAD</span>}
                      {stats.totalUnpaidMru > 0 && <span>{hideAmounts ? '••••' : stats.totalUnpaidMru} MRU</span>}
                    </div>
                  </div>
                )}

                {(stats.unclaimedList.length > 0 || stats.returning > 0) && (
                  <div className="bg-black/50 border border-white/15 p-2.5 rounded-xl space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-white font-bold text-[11px]">
                        <RotateCcw className="w-3.5 h-3.5 text-[#F5C84C]" />
                        <span>تنبيهات استرجاع ({stats.unclaimedList.length} متأخرة • {stats.returning} مرجعة)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === 'return_in_transit' ? 'all' : 'return_in_transit')}
                        className="btn-cancel text-[10px] px-2 py-0.5 rounded-lg font-bold"
                      >
                        {statusFilter === 'return_in_transit' ? 'عرض الكل' : 'فلترة المرجعة'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Compact Search Bar + Collapsible Filters Toggle */}
          <div className="luxury-card p-2.5 rounded-[20px] space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="ابحث بكود التتبع (0000466)، الزبون، الهاتف..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/65 focus:outline-none pl-8"
                />
                <Search className="w-3.5 h-3.5 text-[#F5C84C] absolute left-2.5 top-1/2 -translate-y-1/2" />
              </div>

              <button
                type="button"
                onClick={() => setIsFiltersOpen(prev => !prev)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition ${
                  isFiltersOpen || activeFiltersCount > 0 ? 'btn-gold' : 'btn-cancel'
                }`}
                title="إظهار أو إخفاء الفلاتر وتحديد الطباعة"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>فلاتر{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-200 ${
                    isFiltersOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            </div>

            {selectedParcelIds.size > 0 && (
              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const chosen = parcels.filter(p => selectedParcelIds.has(p.id));
                    setBatchStickerParcels(chosen);
                    setIsBatchStickerModalOpen(true);
                  }}
                  className="btn-gold flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black transition shadow-md"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة المحددة ({selectedParcelIds.size})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedParcelIds(new Set())}
                  className="btn-cancel px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                >
                  إلغاء التحديد
                </button>
              </div>
            )}

            {/* Collapsible Filters & Batch Selection Controls */}
            {isFiltersOpen && (
              <div className="pt-2 border-t border-white/15 space-y-2 animate-fadeIn">
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-white text-[11px] font-bold focus:outline-none focus:border-[#F5C84C]"
                  >
                    <option value="all">جميع الحالات</option>
                    <option value="registered">تم التسجيل</option>
                    <option value="in_transit">في الطريق</option>
                    <option value="arrived">دخلت المحطة</option>
                    <option value="delivered">تم التسليم</option>
                    <option value="return_in_transit">في طريق الإرجاع للمرسل ↺</option>
                    <option value="returned">تم الإرجاع للمرسل ✓</option>
                  </select>

                  <select
                    value={conditionFilter}
                    onChange={e => setConditionFilter(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-white text-[11px] font-bold focus:outline-none focus:border-[#F5C84C]"
                  >
                    <option value="all">حالة الطرد (الكل)</option>
                    <option value="normal">✓ عادي وسليم</option>
                    <option value="abnormal">⚠ غير عادي</option>
                  </select>

                  <select
                    value={paymentFilter}
                    onChange={e => setPaymentFilter(e.target.value as 'all' | 'settled' | 'unpaid')}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-white text-[11px] font-bold focus:outline-none focus:border-[#F5C84C]"
                  >
                    <option value="all">جميع حالات الدفع</option>
                    <option value="settled">خالص بالكامل</option>
                    <option value="unpaid">متبقي بذمة العميل</option>
                  </select>

                  <select
                    value={stationFilter}
                    disabled={userRole === 'worker'}
                    onChange={e => setStationFilter(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-white text-[11px] font-bold focus:outline-none focus:border-[#F5C84C] disabled:opacity-65"
                  >
                    {userRole !== 'worker' && <option value="all">جميع المحطات</option>}
                    {stations
                      .filter(s => userRole !== 'worker' || s.id === activeStationId)
                      .map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                  </select>
                </div>

                {filteredParcels.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        const allSelected = filteredParcels.every(p => selectedParcelIds.has(p.id));
                        if (allSelected) {
                          setSelectedParcelIds(new Set());
                        } else {
                          setSelectedParcelIds(new Set(filteredParcels.map(p => p.id)));
                        }
                      }}
                      className="btn-cancel flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold transition"
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      <span>
                        {filteredParcels.every(p => selectedParcelIds.has(p.id))
                          ? 'إلغاء الكل'
                          : 'تحديد الكل'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (expandedParcelIds.size === filteredParcels.length) {
                          setExpandedParcelIds(new Set());
                        } else {
                          setExpandedParcelIds(new Set(filteredParcels.map(p => p.id)));
                        }
                      }}
                      className="btn-cancel flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold transition"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>
                        {expandedParcelIds.size === filteredParcels.length
                          ? 'طي جميع الكوليات ▲'
                          : 'توسيع جميع الكوليات ▼'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parcels List (Compact Collapsible Rows) */}
          {filteredParcels.length === 0 ? (
            <div className="luxury-card rounded-[22px] p-6 text-center space-y-2">
              <div className="w-11 h-11 rounded-2xl bg-black/50 border border-white/15 text-[#F5C84C] flex items-center justify-center mx-auto">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">لا توجد كوليات مطابقة</h3>
              <p className="text-xs text-white/75">
                جرب تغيير شروط البحث أو اضغط على كولي جديد.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredParcels.map(parcel => {
                const remaining = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
                const isSettled = remaining <= 0;
                const payerLabel = parcel.payer === 'sender' ? 'المرسل' : 'المستلم';
                const isNormal = (parcel.condition || 'normal') === 'normal';
                const isExpanded = expandedParcelIds.has(parcel.id);

                return (
                  <div 
                    key={parcel.id}
                    className={`luxury-card px-3 py-2.5 rounded-[18px] transition text-xs border ${
                      isExpanded ? 'border-[#F5C84C]/55' : 'border-white/12'
                    }`}
                  >
                    {/* Compact Summary Header (Always Visible — Click to Expand/Collapse) */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleParcelExpand(parcel.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleParcelExpand(parcel.id);
                        }
                      }}
                      className="flex items-center justify-between gap-2 cursor-pointer select-none"
                    >
                      {/* Right Side: Checkbox + Number + Sender -> Receiver */}
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedParcelIds(prev => {
                              const next = new Set(prev);
                              if (next.has(parcel.id)) next.delete(parcel.id);
                              else next.add(parcel.id);
                              return next;
                            });
                          }}
                          className="nav-tab-btn p-1 rounded-lg bg-black/50 text-[#F5C84C] transition shrink-0"
                          title="تحديد للطباعة الجماعية"
                        >
                          {selectedParcelIds.has(parcel.id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#F5C84C]" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-white/60" />
                          )}
                        </button>

                        <span
                          dir="ltr"
                          className="font-mono text-[11px] font-black text-[#F5C84C] bg-black/60 px-1.5 py-0.5 rounded-lg border border-[#F5C84C]/40 shrink-0"
                        >
                          {formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number)}
                        </span>

                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-black text-white text-xs">
                            {parcel.sender_name}
                          </span>
                          <span className="text-[#F5C84C] mx-1">➔</span>
                          <span className="font-black text-white text-xs">
                            {parcel.receiver_name}
                          </span>
                          <span className="text-[10px] text-white/65 mr-1.5">
                            ({parcel.destination_station_name})
                          </span>
                        </div>
                      </div>

                      {/* Left Side: Payment/Price + Status + Small Arrow */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-black ${
                            isSettled
                              ? 'bg-[#006233]/35 text-[#2ECC71] border border-[#2ECC71]/40'
                              : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                          }`}
                          dir="ltr"
                        >
                          {hideAmounts ? '•••' : parcel.amount_due} {parcel.currency}{' '}
                          {isSettled ? '✓' : '⏳'}
                        </span>

                        <span className="hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40">
                          {statusNames[parcel.status] || parcel.status}
                        </span>

                        <span className="p-1 rounded-lg bg-black/50 border border-white/15 text-[#F5C84C] flex items-center justify-center">
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </div>
                    </div>

                    {/* Expanded Details (Only shown when arrow/row is clicked) */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 animate-fadeIn">
                        {/* Tracking Code, Quick Copy, Status & Date */}
                        <div className="flex items-center justify-between flex-wrap gap-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-[#F5C84C] bg-black/60 px-2.5 py-0.5 rounded-lg border border-[#F5C84C]/40" dir="ltr">
                              {formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const codeNum = formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number);
                                navigator.clipboard?.writeText(codeNum);
                                showToast(`تم نسخ كود التتبع (${codeNum})`, 'success');
                              }}
                              className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer"
                              title="نسخ كود التتبع لإرساله يدوياً"
                            >
                              <Copy className="w-3 h-3 text-[#F5C84C]" />
                              <span>نسخ الكود</span>
                            </button>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40">
                              {statusNames[parcel.status] || parcel.status}
                            </span>
                          </div>
                          <span className="text-white/85 font-mono text-[10px]" dir="ltr">
                            {formatDateTimeStandard(parcel.created_at)}
                          </span>
                        </div>

                        {/* Abnormal Notes if present */}
                        {!isNormal && parcel.condition_notes && (
                          <div className="bg-black/60 border border-[#F5C84C]/50 rounded-xl p-2 text-[11px] text-[#F5C84C] flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-[#F5C84C] shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">ملاحظة حالة الكولي:</span>
                              <span>{parcel.condition_notes}</span>
                            </div>
                          </div>
                        )}

                        {/* Route and Stations */}
                        <div className="flex items-center justify-between text-white text-[11px] bg-black/40 px-2.5 py-1.5 rounded-xl border border-white/10">
                          <div className="flex items-center gap-1 font-bold">
                            <MapPin className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                            <span>{parcel.origin_station_name}</span>
                            <span className="text-[#F5C84C]">➔</span>
                            <span>{parcel.destination_station_name}</span>
                          </div>
                          <span className="text-[10px] text-white/80">
                            {isSettled ? '✓ خالص بالكامل' : `متبقي: ${remaining} ${parcel.currency}`} ({payerLabel})
                          </span>
                        </div>

                        {/* Sender & Receiver with WhatsApp link */}
                        <div className="space-y-1.5 bg-black/50 p-2.5 rounded-xl border border-white/15">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white/75 text-[10px]">المرسل:</span>
                              <span className="font-bold text-white">{parcel.sender_name}</span>
                            </div>
                            <a
                              href={getWhatsAppLink(parcel.sender_phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[11px] text-[#F5C84C] font-mono"
                              dir="ltr"
                            >
                              <MessageCircle className="w-3 h-3 text-[#2ECC71]" />
                              <span>{parcel.sender_phone}</span>
                            </a>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-white/75 text-[10px]">المستلم:</span>
                              <span className="font-bold text-white">{parcel.receiver_name}</span>
                            </div>
                            <a
                              href={getWhatsAppLink(parcel.receiver_phone)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 text-[11px] text-[#F5C84C] font-mono"
                              dir="ltr"
                            >
                              <MessageCircle className="w-3 h-3 text-[#2ECC71]" />
                              <span>{parcel.receiver_phone}</span>
                            </a>
                          </div>
                        </div>

                        {/* Driver & Trip Info if loaded on a trip */}
                        {parcel.driver_name && (
                          <div className="flex items-center gap-2 bg-black/50 border border-white/15 px-3 py-1.5 rounded-xl text-[11px] text-[#F5C84C]">
                            <Truck className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                            <span className="font-bold">السائق: {parcel.driver_name}</span>
                            {parcel.vehicle_plate && (
                              <span className="font-mono text-white" dir="ltr">({parcel.vehicle_plate})</span>
                            )}
                          </div>
                        )}

                        {/* Description & Action Buttons */}
                        <div className="space-y-2 pt-1 border-t border-white/10">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="font-bold text-white">
                              📦 {parcel.items_count} طرد — {parcel.description}
                            </span>
                          </div>

                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                const tpl =
                                  parcel.status === 'arrived'
                                    ? 'arrived_receiver'
                                    : parcel.status === 'in_transit'
                                    ? 'in_transit_receiver'
                                    : parcel.status === 'delivered'
                                    ? 'delivered_sender'
                                    : 'registered_sender';
                                openWhatsAppParcelNotification(
                                  parcel,
                                  tpl,
                                  currentWorkspace?.custom_brand_name || currentWorkspace?.name
                                );
                              }}
                              className="btn-cancel flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[11px] border border-emerald-500/40 text-emerald-300 transition"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>واتساب QR</span>
                            </button>

                            {parcel.status !== 'delivered' &&
                              (userRole !== 'worker' || parcel.destination_station_id === activeStationId) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickDeliverParcel(parcel);
                                    setIsQuickDeliverOpen(true);
                                  }}
                                  className="btn-cancel flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>تسليم</span>
                                </button>
                              )}

                            <button
                              type="button"
                              onClick={() => setTicketParcel(parcel)}
                              className="btn-cancel flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[11px] transition"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>ملصق</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                printOfficialParcelBonPDF(parcel, {
                                  name: currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'Sahara📦 Express',
                                  subtitle: currentWorkspace?.custom_brand_subtitle || 'للسفر ونقل البضائع والكوليات',
                                  phone: currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || '',
                                  logoUrl: currentWorkspace?.custom_brand_logo_url || '',
                                })
                              }
                              className="btn-cancel flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[11px] border border-[#F5C84C]/45 text-[#F5C84C] transition"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>بون PDF</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setDetailParcel(parcel)}
                              className="btn-gold flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-[11px] transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>التفاصيل والتتبع</span>
                            </button>

                            {(userRole === 'owner' || userRole === 'platform_owner') && (
                              <button
                                type="button"
                                onClick={() =>
                                  setItemToDelete({
                                    type: 'parcel',
                                    id: parcel.id,
                                    label: `${parcel.tracking_code} (${parcel.sender_name} ➔ ${parcel.receiver_name})`,
                                  })
                                }
                                className="btn-delete flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-black text-[11px] transition"
                                title="حذف الكولي نهائياً (للمدير فقط)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>حذف الكولي</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TRIPS MANAGEMENT (الرحلات والديسباتش - مختصرة بالسهم) */}
      {/* ========================================================================= */}
      {activeTab === 'trips' && (
        <div className="space-y-2.5">
          <div className="luxury-card flex items-center justify-between p-3 rounded-[20px]">
            <h2 className="text-xs font-black text-white flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#F5C84C]" />
              <span>رحلات الشحن ({stationScopedTrips.length})</span>
            </h2>
            <button
              type="button"
              onClick={() => setIsNewTripOpen(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>رحلة جديدة</span>
            </button>
          </div>

          {stationScopedTrips.length === 0 ? (
            <div className="luxury-card rounded-[22px] p-6 text-center space-y-3">
              <Truck className="w-6 h-6 text-[#F5C84C] mx-auto" />
              <h3 className="text-sm font-bold text-white">لا توجد رحلات شحن مسجلة لهذه المحطة بعد</h3>
              <button
                type="button"
                onClick={() => setIsNewTripOpen(true)}
                className="px-4 py-2 rounded-xl font-black text-xs transition"
              >
                إنشاء أول رحلة شحن الآن
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {stationScopedTrips.map(trip => {
                const statusMeta = tripStatusNames[trip.status] || { label: trip.status, color: 'bg-black/60 text-[#F5C84C]' };
                const loadedCount = trip.loaded_parcel_ids.length;
                const receivedCount = trip.received_parcel_ids.length;
                const missingCount = Math.max(0, loadedCount - receivedCount);
                const isExpanded = expandedTripIds.has(trip.id);

                return (
                  <div
                    key={trip.id}
                    className={`luxury-card px-3 py-2.5 rounded-[18px] text-xs border transition ${
                      isExpanded ? 'border-[#F5C84C]/55' : 'border-white/12'
                    }`}
                  >
                    {/* Compact Trip Summary Row */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleTripExpand(trip.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleTripExpand(trip.id);
                        }
                      }}
                      className="flex items-center justify-between gap-2 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="font-mono font-black text-[11px] text-[#F5C84C] bg-black/60 px-2 py-0.5 rounded-lg border border-[#F5C84C]/40 shrink-0">
                          {trip.trip_code}
                        </span>
                        <div className="flex items-center gap-1 font-bold text-white truncate">
                          <span className="truncate">{trip.origin_station_name}</span>
                          <span className="text-[#F5C84C]">➔</span>
                          <span className="truncate">{trip.destination_station_name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] font-mono font-black text-[#F5C84C] bg-black/50 px-2 py-0.5 rounded-lg border border-white/10">
                          📦 {loadedCount}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                        <span className="p-1 rounded-lg bg-black/50 border border-white/15 text-[#F5C84C]">
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </span>
                      </div>
                    </div>

                    {/* Expanded Trip Details & Actions */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 animate-fadeIn">
                        <div className="bg-black/50 p-2.5 rounded-xl border border-white/15 flex items-center justify-between">
                          <span className="text-white/80 text-[11px]">
                            السائق: <strong className="text-white">{trip.driver_name}</strong>
                          </span>
                          <span className="font-mono font-bold text-[#F5C84C]" dir="ltr">
                            {trip.vehicle_plate}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] bg-black/50 px-3 py-1.5 rounded-xl border border-white/10">
                          <span className="text-white/80">
                            الكوليات المحملة: <strong className="text-[#F5C84C]">{loadedCount}</strong>
                          </span>
                          {trip.status !== 'loading' && (
                            <span className="text-white/80">
                              المستلم: <strong className="text-[#2ECC71]">{receivedCount}</strong> / مفقود:{' '}
                              <strong className={missingCount > 0 ? 'text-rose-400' : 'text-white'}>
                                {missingCount}
                              </strong>
                            </span>
                          )}
                        </div>

                        <div className="pt-1 space-y-1.5">
                          {trip.status === 'loading' ? (
                            userRole !== 'worker' || trip.origin_station_id === activeStationId ? (
                              <button
                                type="button"
                                onClick={() => setDispatchTrip(trip)}
                                className="btn-gold w-full py-2 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5"
                              >
                                <Scan className="w-4 h-4" />
                                <span>فتح لشحن ومسح الكوليات (ديسباتش) ➔</span>
                              </button>
                            ) : (
                              <div className="w-full py-2 px-3 rounded-xl bg-black/50 border border-white/15 text-center text-[11px] text-white/75 font-bold">
                                رحلة قيد التحميل من محطة ({trip.origin_station_name})
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-2 w-full">
                              {(userRole !== 'worker' || trip.origin_station_id === activeStationId) && (
                                <button
                                  type="button"
                                  onClick={() => setDispatchTrip(trip)}
                                  className="btn-cancel flex-1 py-2 rounded-xl font-bold text-[11px] transition text-center"
                                >
                                  مانيفست الشحن ({loadedCount})
                                </button>
                              )}

                              {trip.status !== 'closed' &&
                                (userRole !== 'worker' || trip.destination_station_id === activeStationId) && (
                                  <button
                                    type="button"
                                    onClick={() => setArrivalTrip(trip)}
                                    className="btn-gold flex-1 py-2 rounded-xl font-black text-[11px] transition text-center flex items-center justify-center gap-1"
                                  >
                                    <Inbox className="w-3.5 h-3.5" />
                                    <span>استقبال وتفريغ</span>
                                  </button>
                                )}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const tripParcels = trip.loaded_parcel_ids
                                .map(id => parcels.find(p => p.id === id))
                                .filter((p): p is Parcel => Boolean(p));
                              printOfficialTripManifestPDF(
                                trip,
                                tripParcels,
                                currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'إكسبريس الصحراء',
                                currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || '',
                                currentWorkspace?.custom_brand_logo_url || '',
                                currentWorkspace?.custom_brand_subtitle || ''
                              );
                            }}
                            className="btn-cancel w-full py-2 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 border border-[#F5C84C]/45 text-[#F5C84C]"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>طباعة ورقة الطريق الرسمية والجمارك (Manifeste PDF)</span>
                          </button>

                          {(userRole === 'owner' || userRole === 'platform_owner') && (
                            <button
                              type="button"
                              onClick={() =>
                                setItemToDelete({
                                  type: 'trip',
                                  id: trip.id,
                                  label: `${trip.trip_code} (${trip.driver_name} — ${trip.vehicle_plate})`,
                                })
                              }
                              className="btn-delete w-full py-2 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف الرحلة نهائياً (للمدير فقط)</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: INCOMING TRIPS TO STATION */}
      {/* ========================================================================= */}
      {activeTab === 'incoming' && (
        <div className="space-y-3">
          <div className="luxury-card p-3.5 rounded-[22px] space-y-1">
            <h2 className="text-xs font-black text-white flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-[#F5C84C]" />
              <span>الرحلات القادمة نحو [{activeStation?.name || 'المحطة'}]</span>
            </h2>
          </div>

          {incomingTrips.length === 0 ? (
            <div className="luxury-card rounded-[22px] p-6 text-center space-y-2">
              <Truck className="w-6 h-6 text-[#F5C84C] mx-auto" />
              <h3 className="text-xs font-bold text-white">لا توجد رحلات قادمة في الطريق حالياً</h3>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingTrips.map(trip => {
                const totalLoaded = trip.loaded_parcel_ids.length;
                const receivedCount = trip.received_parcel_ids.length;
                const missingCount = Math.max(0, totalLoaded - receivedCount);
                const isFinished = missingCount === 0 && totalLoaded > 0;

                return (
                  <div 
                    key={trip.id}
                    className="luxury-card p-4 rounded-[22px] space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/15">
                      <div>
                        <span className="font-mono font-black text-xs text-[#F5C84C] bg-black/60 px-2 py-0.5 rounded-lg border border-[#F5C84C]/40">
                          {trip.trip_code}
                        </span>
                        <p className="text-[11px] text-white/80 mt-1">
                          السائق: <strong className="text-white">{trip.driver_name}</strong> ({trip.vehicle_plate})
                        </p>
                      </div>

                      {(userRole !== 'worker' || trip.destination_station_id === activeStationId) && (
                        <button
                          type="button"
                          onClick={() => setArrivalTrip(trip)}
                          className="px-3 py-2 rounded-xl font-black text-xs transition flex items-center gap-1"
                        >
                          <Scan className="w-3.5 h-3.5" />
                          <span>مسح الاستقبال</span>
                        </button>
                      )}
                    </div>

                    <div className="text-[11px] text-[#F5C84C] font-bold">
                      {isFinished ? '✓ تم مسح جميع الكوليات' : `${receivedCount} تم مسحه / ${missingCount} متبقي`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: STATION OVERVIEW */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          {stations.map(st => {
            const inTransitParcels = parcels.filter(
              p => p.destination_station_id === st.id && p.status === 'in_transit'
            );
            const waitingForDelivery = parcels.filter(
              p => p.destination_station_id === st.id && p.status === 'arrived'
            );

            return (
              <div 
                key={st.id}
                className="luxury-card p-4 rounded-[22px] space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-white/15">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{st.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
                    <div>
                      <h3 className="text-xs font-black text-white">{st.name} ({st.city})</h3>
                      <span className="text-[10px] text-white/75">{st.address}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-black/50 p-2.5 rounded-xl border border-white/15 text-center">
                    <span className="block text-[10px] text-white/75">قادم في الطريق</span>
                    <span className="font-black text-sm text-[#F5C84C]">{inTransitParcels.length} كولي</span>
                  </div>
                  <div className="bg-black/50 p-2.5 rounded-xl border border-white/15 text-center">
                    <span className="block text-[10px] text-white/75">بانتظار التسليم</span>
                    <span className="font-black text-sm text-[#2ECC71]">{waitingForDelivery.length} كولي</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ALL MODALS */}
      {/* ========================================================================= */}

      <NewTripModal
        isOpen={isNewTripOpen}
        onClose={() => setIsNewTripOpen(false)}
        onTripCreated={(newT) => {
          setIsNewTripOpen(false);
          setDispatchTrip(newT);
        }}
      />

      <TripDispatchModal
        trip={dispatchTrip}
        isOpen={Boolean(dispatchTrip)}
        onClose={() => setDispatchTrip(null)}
        onOpenTicket={(p) => setTicketParcel(p)}
      />

      <TripArrivalModal
        trip={arrivalTrip}
        isOpen={Boolean(arrivalTrip)}
        onClose={() => setArrivalTrip(null)}
        onOpenTicket={(p) => setTicketParcel(p)}
      />

      <QuickDeliverModal
        isOpen={isQuickDeliverOpen}
        onClose={() => {
          setIsQuickDeliverOpen(false);
          setQuickDeliverParcel(null);
        }}
        initialParcel={quickDeliverParcel}
        onOpenTicket={(p) => setTicketParcel(p)}
      />

      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onScan={handleGlobalScanResult}
        title="مسح باركود أو رمز كولي (QR)"
        subtitle="امسح تذكرة الكولي بالكاميرا أو بقارئ الباركود اليدوي لعرض تفاصيله وتسليمه"
      />

      <ParcelStickerModal
        parcel={ticketParcel}
        initialSelectedParcels={batchStickerParcels}
        isOpen={Boolean(ticketParcel) || isBatchStickerModalOpen}
        onClose={() => {
          setTicketParcel(null);
          setBatchStickerParcels(undefined);
          setIsBatchStickerModalOpen(false);
        }}
      />

      <ParcelDetailModal
        parcel={detailParcel}
        isOpen={Boolean(detailParcel)}
        onClose={() => setDetailParcel(null)}
        onOpenTicket={(p) => setTicketParcel(p)}
      />

      {/* Owner Delete Confirmation Modal for Parcel or Trip */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 animate-fadeIn">
          <div className="w-full max-w-[360px] rounded-[24px] luxury-card p-5 shadow-2xl text-right space-y-3.5 border border-rose-500/40">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white">
                {itemToDelete.type === 'parcel' ? 'تأكيد حذف الكولي نهائياً' : 'تأكيد حذف الرحلة نهائياً'}
              </h3>
            </div>
            <p className="text-xs text-white/85 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف{' '}
              <strong className="text-[#F5C84C]" dir="ltr">
                [{itemToDelete.label}]
              </strong>{' '}
              نهائياً من النظام؟
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="btn-cancel px-4 py-2 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (itemToDelete.type === 'parcel') {
                    await deleteParcel(itemToDelete.id);
                  } else {
                    await deleteTrip(itemToDelete.id);
                  }
                  setItemToDelete(null);
                }}
                className="btn-delete px-5 py-2 rounded-xl text-xs font-black shadow-md flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تأكيد الحذف النهائي</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
