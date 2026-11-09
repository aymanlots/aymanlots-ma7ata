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
  getParcelSourceOwnershipInfo,
  canControlParcelOrigin,
  canControlParcelDestination,
  canAcceptOrRejectPartnerParcel,
  getPartnershipSixStepInfo,
  validateParcelScanOwnership,
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
import { HelpPopover } from './HelpPopover';

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
    isWorkerStationDeleted,
    hideAmounts,
    confirmParcelTripArrived,
    confirmTripArrivedAtDestination,
    updateParcelStatus,
    respondToPartnerParcel,
    acceptAllPendingPartnerParcels,
    deleteParcel,
    deleteTrip,
    showToast,
    t,
    language,
  } = useApp();
  const isRtl = language === 'ar' || language === 'hassaniya';

  const [itemToDelete, setItemToDelete] = useState<{
    type: 'parcel' | 'trip';
    id: string;
    label: string;
  } | null>(null);

  // Navigation Tabs within Parcels Module
  const [activeTab, setActiveTab] = useState<'parcels' | 'trips' | 'incoming'>('parcels');

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
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'own' | 'partnership'>('all');
  const [visibleParcelsCount, setVisibleParcelsCount] = useState<number>(60);

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

  // Reset pagination when filters change
  useEffect(() => {
    setVisibleParcelsCount(60);
  }, [statusFilter, ownershipFilter, stationFilter, paymentFilter, searchQuery]);

  // Compact / Collapsible UI States (اختصارات بالسهم الصغير)
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isParcelsLogOpen, setIsParcelsLogOpen] = useState(false);
  const [isTripsLogOpen, setIsTripsLogOpen] = useState(false);
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
    : (selectedStationId && selectedStationId !== 'all' ? selectedStationId : stations[0]?.id || '');
  const activeStation = stations.find(s => s.id === activeStationId) || stations[0];

  // Helper: check if parcel is an incoming partnership parcel that has NOT been shipped yet by the sender
  const isUnshippedIncomingPartnerParcel = (p: Parcel) => {
    const isIncomingPartner = Boolean(
      p.is_collaborator_data ||
        (p.partner_origin_workspace_id &&
          p.partner_origin_workspace_id !== currentWorkspace?.id)
    );
    return isIncomingPartner && (p.status === 'registered' || p.status === 'pending');
  };

  // 1. Filtered Parcels List (excludes incoming partnership parcels that are still in the sender's stock and not yet shipped)
  const filteredParcels = useMemo(() => {
    return parcels.filter(p => {
      if (isUnshippedIncomingPartnerParcel(p)) return false;

      // Status Filter
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;

      // Condition Filter (عادي / غير عادي)
      if (conditionFilter !== 'all') {
        const cond = p.condition || 'normal';
        if (cond !== conditionFilter) return false;
      }

      // Station Filter (Strictly isolate unshipped parcels to their origin station)
      if (stationFilter !== 'all') {
        const isOrigin = p.origin_station_id === stationFilter;
        const isShippedToDest =
          (p.destination_station_id === stationFilter ||
            p.partner_destination_station_id === stationFilter) &&
          p.status !== 'registered' &&
          p.status !== 'pending';
        if (!isOrigin && !isShippedToDest) {
          return false;
        }
      }

      // Source / Ownership Filter (الكل / سلعة محطتنا الخاصة / سلعة غرفة الشراكة)
      if (ownershipFilter !== 'all') {
        const ownership = getParcelSourceOwnershipInfo(p, currentWorkspace?.id, currentWorkspace?.name);
        if (ownershipFilter === 'own' && ownership.isPartnership) return false;
        if (ownershipFilter === 'partnership' && !ownership.isPartnership) return false;
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
  }, [
    parcels,
    statusFilter,
    conditionFilter,
    paymentFilter,
    stationFilter,
    ownershipFilter,
    dateFilter,
    searchQuery,
    currentWorkspace?.id,
    currentWorkspace?.name,
  ]);

  // Scoped parcels & trips for the currently selected station (excluding unshipped parcels from other stations so they stay exclusively in their origin station)
  const stationScopedParcels = useMemo(() => {
    const visibleParcels = parcels.filter(p => !isUnshippedIncomingPartnerParcel(p));
    if (stationFilter === 'all') return visibleParcels;
    return visibleParcels.filter(
      p =>
        p.origin_station_id === stationFilter ||
        ((p.destination_station_id === stationFilter ||
          p.partner_destination_station_id === stationFilter) &&
          p.status !== 'registered' &&
          p.status !== 'pending')
    );
  }, [parcels, stationFilter, currentWorkspace?.id]);

  const ownershipCounts = useMemo(() => {
    let ownCount = 0;
    let partnershipCount = 0;
    stationScopedParcels.forEach(p => {
      const info = getParcelSourceOwnershipInfo(p, currentWorkspace?.id, currentWorkspace?.name);
      if (info.isPartnership) partnershipCount++;
      else ownCount++;
    });
    return { ownCount, partnershipCount };
  }, [stationScopedParcels, currentWorkspace?.id, currentWorkspace?.name]);

  // الكوليات الواردة من غرفة الشراكة التي تنتظر القبول أو الرفض من المدير المستقبل أو عامل المحطة المستقبلة
  const pendingPartnerApprovalParcels = useMemo(() => {
    const stationFiltered =
      stationFilter === 'all'
        ? parcels
        : parcels.filter(
            p =>
              p.origin_station_id === stationFilter ||
              p.destination_station_id === stationFilter ||
              p.partner_destination_station_id === stationFilter
          );
    return stationFiltered.filter(p =>
      canAcceptOrRejectPartnerParcel(p, currentWorkspace?.id, userRole, activeStationId)
    );
  }, [parcels, stationFilter, currentWorkspace?.id, userRole, activeStationId]);

  const stationScopedTrips = useMemo(() => {
    if (stationFilter === 'all') return trips;
    return trips.filter(
      t =>
        t.origin_station_id === stationFilter ||
        ((t.destination_station_id === stationFilter ||
          t.partner_destination_station_id === stationFilter) &&
          t.status !== 'loading')
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

  // Incoming trips heading to my station (including partnership trips!)
  const incomingTrips = useMemo(() => {
    return trips.filter(t => {
      const isHeadingToStation =
        stationFilter === 'all'
          ? true
          : t.destination_station_id === stationFilter ||
            t.partner_destination_station_id === stationFilter;
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
      const scanAuth = validateParcelScanOwnership(
        found,
        currentWorkspace?.id,
        userRole,
        activeStationId
      );
      if (!scanAuth.allowed) {
        playErrorBeep();
        setIsBarcodeScannerOpen(false);
        showToast(scanAuth.reason || '⛔ غير مسموح بمسح هذا الكولي', 'error');
        return;
      }

      playSuccessBeep();
      setIsBarcodeScannerOpen(false);
      setDetailParcel(found);
      const numericCode = formatTrackingCodeNumeric(found.tracking_code, found.parcel_number);
      const ownershipInfo = getParcelSourceOwnershipInfo(
        found,
        currentWorkspace?.id,
        currentWorkspace?.name
      );
      showToast(
        `${ownershipInfo.workerScanAlert} — كود: ${numericCode}`,
        ownershipInfo.isPartnership ? 'info' : 'success'
      );
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

  if (userRole === 'worker' && isWorkerStationDeleted) {
    return (
      <div className="luxury-card p-6 sm:p-8 text-center rounded-[24px] my-6 space-y-4 border-2 border-rose-500/50 bg-black/85 shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center justify-center text-3xl mx-auto shadow-lg">
          ⛔
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base sm:text-lg font-black text-rose-400">
            تم إيقاف أو حذف هذه المحطة من طرف المدير
          </h3>
          <p className="text-xs sm:text-sm text-gray-300 font-bold leading-relaxed max-w-sm mx-auto">
            قام المدير بمسح أو إيقاف هذه المحطة نهائياً. لقد تم تجميد وإيقاف جميع العمليات على هذا الحساب.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-mono font-black text-rose-300">
          🔒 العمليات موقوفة بأمر من المدير
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2.5 pb-28 ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Top Banner & Compact Quick Actions */}
      <div className="luxury-card p-3.5 rounded-[22px] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-5 h-5 text-[#F5C84C] shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-white truncate">
              📦 {t('navParcels', 'الكوليات')}
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40 font-mono font-black shrink-0">
              {stats.total}
            </span>
            <HelpPopover
              title="قسم الكوليات والرحلات"
              text="من هنا يمكنك تسجيل كولي جديد، مسح الباركود، شحن الكوليات في رحلات، وتتبع وصولها وتسليمها للزبون."
            />
          </div>

          <button
            type="button"
            onClick={() => setIsMoreToolsOpen(prev => !prev)}
            className="btn-cancel px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
            title="إظهار أو إخفاء الأدوات السريعة"
          >
            <span>⚡ {t('toolsBtn', 'أدوات')}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                isMoreToolsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Primary 2 Buttons Always Accessible (Large & Prominent) */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onOpenNewParcel}
            className="btn-hero-action btn-add flex items-center justify-center gap-2 py-3.5 px-4 rounded-[12px] font-black text-sm sm:text-base cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
            <span>{t('newParcel', 'تسجيل كولي جديد')}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBarcodeScannerOpen(true)}
            className="btn-cancel flex items-center justify-center gap-2 py-3.5 px-4 rounded-[12px] font-black text-sm sm:text-base cursor-pointer"
          >
            <Scan className="w-5 h-5" />
            <span>{t('scannerTitle', 'سكانر QR')}</span>
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
                  <span>{t('customerAccountsBtn', 'حسابات الزبناء')}</span>
                </button>
              )}

              {onOpenCollabRoom && userRole === 'owner' && (
                <button
                  type="button"
                  onClick={onOpenCollabRoom}
                  className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{t('collabRoomTitle', 'غرف الشراكة')}</span>
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
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={
                  statusFilter === 'return_in_transit' || statusFilter === 'returned'
                    ? 'true'
                    : undefined
                }
                data-btn-active-fixed="true"
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
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active-fixed="true"
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

        {/* 3 Core Module Navigation Tabs in 1 Compact Row (Single Top Station Selector is used at Header level) */}
        <div className="grid grid-cols-3 gap-1.5 border-t border-white/15 pt-2 text-[10px] font-black">
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={activeTab === 'parcels' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setActiveTab('parcels')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl transition cursor-pointer truncate ${
              activeTab === 'parcels' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Package className="w-3 h-3 shrink-0" />
            <span className="truncate">{t('navParcels', 'الكوليات')} ({stationScopedParcels.length})</span>
          </button>

          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={activeTab === 'trips' ? 'true' : 'false'}
            data-btn-active-fixed="true"
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
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={activeTab === 'incoming' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setActiveTab('incoming')}
            className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-xl transition cursor-pointer truncate ${
              activeTab === 'incoming' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Inbox className="w-3 h-3 shrink-0" />
            <span className="truncate">الوارد ({incomingTrips.length})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PARCELS LIST (الكوليات والإرساليات - تتبع أوتوماتيك منظم) */}
      {/* ========================================================================= */}
      {activeTab === 'parcels' && (
        <div className="space-y-2.5">
          {/* Interactive 4-Stage Tracking Pipeline Bar (اضغط لفلترة أي مرحلة فوراً) */}
          <div className="luxury-card p-2.5 rounded-[20px] space-y-2">
            <div className="grid grid-cols-5 gap-1 text-center">
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'all' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter('all')}
                className={`p-1.5 rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                  statusFilter === 'all' ? 'btn-gold shadow-md' : 'btn-cancel'
                }`}
              >
                <span className="text-[9px] font-black block truncate w-full">الكل</span>
                <span className="text-xs font-mono font-black">{stats.total}</span>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'registered' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'registered' ? 'all' : 'registered')}
                className={`p-1.5 rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                  statusFilter === 'registered' ? 'btn-gold shadow-md' : 'btn-cancel'
                }`}
                title="المرحلة 1: مسجلة بالمحطة وجاهزة للشحن في رحلة"
              >
                <span className="text-[9px] font-black block truncate w-full">1. مسجلة</span>
                <span className="text-xs font-mono font-black">
                  {stats.registered}
                </span>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'in_transit' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'in_transit' ? 'all' : 'in_transit')}
                className={`p-1.5 rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                  statusFilter === 'in_transit' ? 'btn-gold shadow-md' : 'btn-cancel'
                }`}
                title="المرحلة 2: في الطريق داخل الشاحنة نحو محطة الوصول"
              >
                <span className="text-[9px] font-black block truncate w-full">2. بالطريق</span>
                <span className="text-xs font-mono font-black">
                  {stats.inTransit}
                </span>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'arrived' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'arrived' ? 'all' : 'arrived')}
                className={`p-1.5 rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                  statusFilter === 'arrived' ? 'btn-gold shadow-md' : 'btn-cancel'
                }`}
                title="المرحلة 3: وصلت فـ الستوك وجاهزة للتسليم للزبون"
              >
                <span className="text-[9px] font-black block truncate w-full">3. بالستوك</span>
                <span className="text-xs font-mono font-black">
                  {stats.arrived}
                </span>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'delivered' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}
                className={`p-1.5 rounded-xl border transition cursor-pointer flex flex-col items-center justify-center ${
                  statusFilter === 'delivered' ? 'btn-gold shadow-md' : 'btn-cancel'
                }`}
                title="المرحلة 4: تم تسليمها لصاحبها بنجاح"
              >
                <span className="text-[9px] font-black block truncate w-full">4. سُلِّمت</span>
                <span className="text-xs font-mono font-black">
                  {stats.delivered}
                </span>
              </button>
            </div>

            {(stats.totalUnpaidMad > 0 || stats.totalUnpaidMru > 0) && (
              <div className="bg-black/50 border border-[#F5C84C]/30 px-2.5 py-1.5 rounded-xl flex items-center justify-between text-[11px]">
                <span className="font-bold text-[#F5C84C]">💰 المتبقي للتحصيل من الكوليات:</span>
                <div className="flex items-center gap-2 font-mono font-black text-white" dir="ltr">
                  {stats.totalUnpaidMad > 0 && <span>{hideAmounts ? '••••' : stats.totalUnpaidMad} MAD</span>}
                  {stats.totalUnpaidMru > 0 && <span>{hideAmounts ? '••••' : stats.totalUnpaidMru} MRU</span>}
                </div>
              </div>
            )}
          </div>

          {/* Compact Search Bar + Dedicated Source Ownership Filter (فصل سلعة المحطة عن سلعة غرفة الشراكة) */}
          <div className="luxury-card p-2.5 rounded-[20px] space-y-2">
            {/* Ownership Filter Pills: الكل | سلعتنا الخاصة | سلعة غرفة الشراكة */}
            <div className="grid grid-cols-3 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/15 text-[10px] font-black">
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={ownershipFilter === 'all' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setOwnershipFilter('all')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer truncate ${
                  ownershipFilter === 'all' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                الكل ({stationScopedParcels.length})
              </button>
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={ownershipFilter === 'own' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setOwnershipFilter('own')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer truncate ${
                  ownershipFilter === 'own' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                🏠 سلعة محطتنا ({ownershipCounts.ownCount})
              </button>
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={ownershipFilter === 'partnership' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setOwnershipFilter('partnership')}
                className={`py-1.5 px-2 rounded-lg transition cursor-pointer truncate ${
                  ownershipFilter === 'partnership' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                🤝 غرفة الشراكة ({ownershipCounts.partnershipCount})
              </button>
            </div>

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
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={isFiltersOpen || activeFiltersCount > 0 ? 'true' : undefined}
                data-btn-active-fixed="true"
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
                          setExpandedParcelIds(new Set(filteredParcels.slice(0, visibleParcelsCount).map(p => p.id)));
                        }
                      }}
                      className="btn-cancel flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold transition"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>
                        {expandedParcelIds.size > 0
                          ? 'طي جميع الكوليات ▲'
                          : 'توسيع الكوليات ▼'}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BANNER: طلبات قبول الكوليات الواردة من غرفة الشراكة (للمدير فقط — المشكل 1) */}
          {userRole !== 'worker' && pendingPartnerApprovalParcels.length > 0 && (
            <div className="luxury-card p-3.5 rounded-[20px] border-2 border-purple-400/75 bg-purple-950/60 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-purple-500 text-white font-black text-xs flex items-center justify-center shadow">
                    {pendingPartnerApprovalParcels.length}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-black text-white">
                      🤝 كوليات بانتظار قبول المدير ({pendingPartnerApprovalParcels.length})
                    </h3>
                    <HelpPopover
                      title="قبول كوليات الشراكة (للمدير فقط)"
                      text="أرسل إليك شريك كوليات نحو محطتك — المدير وحده يملك صلاحية القبول أو الرفض قبل انطلاق الرحلة."
                    />
                  </div>
                </div>

                {pendingPartnerApprovalParcels.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      acceptAllPendingPartnerParcels(pendingPartnerApprovalParcels.map(p => p.id))
                    }
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] transition active:scale-95 cursor-pointer shadow-md"
                  >
                    ✅ قبول الكل ({pendingPartnerApprovalParcels.length})
                  </button>
                )}
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                {pendingPartnerApprovalParcels.map(pp => {
                  const numCode = formatTrackingCodeNumeric(pp.tracking_code, pp.parcel_number);
                  return (
                    <div
                      key={pp.id}
                      className="bg-black/65 border border-purple-400/45 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            dir="ltr"
                            className="font-mono font-black text-[11px] text-[#F5C84C] bg-black/80 px-2 py-0.5 rounded-lg border border-[#F5C84C]/40"
                          >
                            {numCode}
                          </span>
                          <span className="text-[10px] font-black text-purple-200 bg-purple-900/70 px-2 py-0.5 rounded-md border border-purple-400/40">
                            الشريك المرسل: {pp.partner_origin_workspace_name || 'شريك'}
                          </span>
                          <span className="font-black text-white">
                            المستلم: {pp.receiver_name} ({pp.receiver_phone})
                          </span>
                        </div>
                        <div className="text-[10px] text-white/85 font-bold flex items-center gap-1.5 flex-wrap">
                          <span>
                            من محطة: <strong className="text-[#F5C84C]">{pp.origin_station_name}</strong>
                          </span>
                          <span className="text-[#F5C84C]">⬅</span>
                          <span>
                            إلى محطة:{' '}
                            <strong className="text-emerald-300">
                              {pp.partner_destination_station_name || pp.destination_station_name}
                            </strong>
                          </span>
                          <span>• المحتوى: {pp.description} ({pp.items_count || 1} طرد)</span>
                          <span dir="ltr" className="font-mono text-[#F5C84C]">
                            • {pp.amount_due} {pp.currency}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => respondToPartnerParcel(pp.id, 'accepted')}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] transition active:scale-95 cursor-pointer"
                        >
                          ✅ قبول الكولية
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            respondToPartnerParcel(pp.id, 'rejected', 'تم رفض الكولية من طرف محطة الاستلام')
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/50 font-black text-[11px] transition active:scale-95 cursor-pointer"
                        >
                          ❌ رفض
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Standalone Toggle Button for Parcels Operations Log */}
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={isParcelsLogOpen ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setIsParcelsLogOpen(prev => !prev)}
            className="w-full py-2.5 px-3.5 rounded-[18px] font-black text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer transition shadow-md"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 shrink-0" />
              <span>📋 سجل عمليات الكوليات ({filteredParcels.length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black">
                {isParcelsLogOpen ? 'إخفاء السجل ▲' : 'عرض السجل ▼'}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isParcelsLogOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {/* Parcels List (Hidden until toggle button is clicked) */}
          {isParcelsLogOpen && (
            filteredParcels.length === 0 ? (
              <div className="luxury-card rounded-[22px] p-6 text-center space-y-2 animate-fadeIn">
                <div className="w-11 h-11 rounded-2xl bg-black/50 border border-white/15 text-[#F5C84C] flex items-center justify-center mx-auto">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-white">لا توجد كوليات مطابقة</h3>
                <p className="text-xs text-white/75">
                  جرب تغيير المرحلة أو البحث، أو اضغط على كولي جديد.
                </p>
              </div>
            ) : (
              <div className="space-y-2 animate-fadeIn">
                {filteredParcels.slice(0, visibleParcelsCount).map(parcel => {
                const remaining = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
                const isSettled = remaining <= 0;
                const payerLabel = parcel.payer === 'sender' ? 'المرسل' : 'المستلم';
                const isNormal = (parcel.condition || 'normal') === 'normal';
                const isExpanded = expandedParcelIds.has(parcel.id);
                const ownershipInfo = getParcelSourceOwnershipInfo(
                  parcel,
                  currentWorkspace?.id,
                  currentWorkspace?.name
                );

                const isDestForCurrentUser = canControlParcelDestination(
                  parcel,
                  currentWorkspace?.id,
                  userRole,
                  activeStationId
                );

                const isOriginForCurrentUser = canControlParcelOrigin(
                  parcel,
                  currentWorkspace?.id,
                  userRole,
                  activeStationId
                );

                const canApprovePartner = canAcceptOrRejectPartnerParcel(
                  parcel,
                  currentWorkspace?.id,
                  userRole,
                  activeStationId
                );

                const isOutgoingPartnerParcel = ownershipInfo.direction === 'outgoing_partner';
                const sixStep = getPartnershipSixStepInfo(
                  parcel,
                  parcel.current_trip_id ? trips.find(tr => tr.id === parcel.current_trip_id) : null
                );

                return (
                  <div 
                    key={parcel.id}
                    className={`luxury-card px-3 py-2.5 rounded-[18px] transition text-xs border ${
                      isExpanded
                        ? 'border-[#F5C84C]/55'
                        : ownershipInfo.isPartnership
                        ? 'border-purple-500/45'
                        : 'border-white/12'
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
                      className="flex items-center justify-between gap-1.5 cursor-pointer select-none"
                    >
                      {/* Right Side: Checkbox + Number + Ownership Badge + Explicit Route & Receiver */}
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

                        {/* Clear Visual Tag distinguishing Own Parcel vs Partnership Room Parcel */}
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border shrink-0 ${
                            ownershipInfo.isPartnership
                              ? 'bg-purple-950/90 text-purple-200 border-purple-400/60'
                              : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                          }`}
                          title={ownershipInfo.fullBannerTitle}
                        >
                          {ownershipInfo.isPartnership ? `🤝 ${sixStep.currentLabel}` : '🏠 محطتنا'}
                        </span>

                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-black text-white text-xs">
                            {parcel.receiver_name}
                          </span>
                          <span className="text-[10px] text-white/80 mr-1 font-bold">
                            (من محطة: <span className="text-[#F5C84C]">{parcel.origin_station_name}</span> ⬅ إلى محطة:{' '}
                            <span className="text-emerald-300">
                              {parcel.partner_destination_station_name || parcel.destination_station_name}
                            </span>)
                          </span>
                        </div>
                      </div>

                      {/* Left Side: Price + Direct 1-Click Next Action Button + Expand Arrow */}
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-black ${
                            isSettled
                              ? 'bg-[#006233]/35 text-[#2ECC71] border border-[#2ECC71]/40'
                              : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                          }`}
                          dir="ltr"
                        >
                          {hideAmounts ? '•••' : parcel.amount_due} {parcel.currency}
                        </span>

                        {/* PARTNER APPROVAL BUTTONS IF PENDING INCOMING PARTNER PARCEL (Manager Only) */}
                        {canApprovePartner && (
                          <>
                            <button
                              type="button"
                              onClick={() => respondToPartnerParcel(parcel.id, 'accepted')}
                              className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                              title="2. قبول الكولية الواردة من الشريك"
                            >
                              ✅ 2. قبول
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                respondToPartnerParcel(parcel.id, 'rejected', 'رفض استلام الكولية من طرف المدير المستقبل')
                              }
                              className="px-1.5 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/50 font-black text-[10px] transition active:scale-95 cursor-pointer"
                              title="رفض الكولية الواردة من الشريك"
                            >
                              ❌ رفض
                            </button>
                          </>
                        )}

                        {parcel.partner_acceptance_status === 'rejected' && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-rose-950/80 text-rose-300 font-black text-[9px] border border-rose-500/50">
                            ❌ مرفوضة
                          </span>
                        )}

                        {isOutgoingPartnerParcel && parcel.partner_acceptance_status === 'pending_approval' && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-amber-950/80 text-amber-300 font-black text-[9px] border border-amber-500/50">
                            ⏳ 1. طلب (بانتظار قبول الشريك)
                          </span>
                        )}

                        {/* DIRECT 1-CLICK STAGE PROGRESSION BUTTON (طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم) */}
                        {parcel.status === 'registered' &&
                          isOriginForCurrentUser &&
                          parcel.partner_acceptance_status !== 'rejected' &&
                          parcel.partner_acceptance_status !== 'pending_approval' && (
                          <button
                            type="button"
                            onClick={async () => {
                              await updateParcelStatus(parcel.id, 'in_transit', {
                                notes: 'تم شحن الكولي وانطلاقه في رحلة نحو محطة الوجهة',
                              });
                            }}
                            className="px-2 py-1 rounded-lg bg-[#F5C84C] hover:bg-[#ffe074] text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                            title="3. شحن الكولي في رحلة وإرساله في الطريق"
                          >
                            🚚 3. رحلة
                          </button>
                        )}

                        {parcel.status === 'in_transit' && !parcel.trip_arrived_at && isDestForCurrentUser && (
                          <button
                            type="button"
                            onClick={async () => {
                              await confirmParcelTripArrived(parcel.id);
                            }}
                            className="px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                            title="4. تأكيد وصول الرحلة للمحطة (وصلات)"
                          >
                            🏁 4. وصلات
                          </button>
                        )}

                        {parcel.status === 'in_transit' && Boolean(parcel.trip_arrived_at) && isDestForCurrentUser && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (parcel.current_trip_id) {
                                const foundTrip = trips.find(t => t.id === parcel.current_trip_id);
                                if (foundTrip && foundTrip.status !== 'closed') {
                                  setArrivalTrip(foundTrip);
                                  return;
                                }
                              }
                              await updateParcelStatus(parcel.id, 'arrived', {
                                notes: 'تم تفريغ الكولي وإدخاله للستوك بعد وصول الرحلة',
                              });
                              showToast(`تم تفريغ الكولي #${parcel.parcel_number} للستوك بنجاح ✓`, 'success');
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                            title="5. تفريغ الكولي وإدخاله للستوك"
                          >
                            📥 5. تفريغ
                          </button>
                        )}

                        {parcel.status === 'arrived' && isDestForCurrentUser && (
                          <button
                            type="button"
                            onClick={() => {
                              setQuickDeliverParcel(parcel);
                              setIsQuickDeliverOpen(true);
                            }}
                            className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                            title="6. تسليم الكولي للزبون الآن"
                          >
                            ✅ 6. تسليم
                          </button>
                        )}

                        {/* Read-only indicator for the Sender of a Partnership Parcel */}
                        {isOutgoingPartnerParcel &&
                          parcel.partner_acceptance_status === 'accepted' &&
                          parcel.status !== 'delivered' && (
                            <span
                              className="px-1.5 py-0.5 rounded-lg bg-purple-950/80 text-purple-200 font-black text-[9px] border border-purple-400/50"
                              title="المدير والعامل في محطة الاستلام هما المسؤولان عن تأكيد الوصول والتفريغ والتسليم"
                            >
                              {sixStep.currentLabel}
                            </span>
                          )}

                        {parcel.status === 'delivered' && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-white/15 text-white font-black text-[10px] border border-white/20">
                            ✓ 6. سُلِّم
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => toggleParcelExpand(parcel.id)}
                          className="p-1 rounded-lg bg-black/50 border border-white/15 text-[#F5C84C] flex items-center justify-center cursor-pointer"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Expanded Details (Only shown when arrow/row is clicked) */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 animate-fadeIn">
                        {/* Full Source & Ownership Banner inside Expanded Card */}
                        <div
                          className={`px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center justify-between gap-2 border ${
                            ownershipInfo.isPartnership
                              ? 'bg-purple-950/85 text-purple-200 border-purple-400/55'
                              : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          <span>{ownershipInfo.fullBannerTitle}</span>
                          <span className="text-[10px] opacity-90 shrink-0">
                            {ownershipInfo.isPartnership ? 'حساب الشريك مستقل' : 'خاص بمحطتنا'}
                          </span>
                        </div>

                        {/* 6-Step Partnership Progress Strip: طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم */}
                        {ownershipInfo.isPartnership && (
                          <div className="grid grid-cols-6 gap-1">
                            {sixStep.allSteps.map((st) => (
                              <div
                                key={st.step}
                                className={`text-center py-1 px-1 rounded-lg text-[9px] font-black border ${
                                  st.current
                                    ? 'bg-[#F5C84C] text-[#1a0f00] border-[#F5C84C]'
                                    : st.done
                                    ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
                                    : 'bg-black/40 text-white/45 border-white/10'
                                }`}
                              >
                                {st.step}. {st.label}
                              </div>
                            ))}
                          </div>
                        )}

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

                        {/* Route and Stations — Explicit من محطة ... إلى محطة (المشكل 3) */}
                        <div className="flex items-center justify-between flex-wrap gap-2 text-white text-[11px] bg-black/40 px-2.5 py-2 rounded-xl border border-white/10">
                          <div className="flex items-center gap-1.5 font-black flex-wrap">
                            <MapPin className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                            <span className="bg-black/60 px-2 py-0.5 rounded-lg border border-[#F5C84C]/35 text-[#F5C84C]">
                              من محطة: {parcel.origin_station_name}
                            </span>
                            <span className="text-[#F5C84C] font-black">⬅</span>
                            <span className="bg-emerald-950/60 px-2 py-0.5 rounded-lg border border-emerald-500/40 text-emerald-300">
                              إلى محطة: {parcel.partner_destination_station_name || parcel.destination_station_name}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/80 font-bold">
                            {isSettled ? '✓ خالص بالكامل' : `متبقي: ${remaining} ${parcel.currency}`} ({payerLabel})
                          </span>
                        </div>

                        {/* Sender Read-Only Notice for Outgoing Partnership Parcels (المشكل 2) */}
                        {isOutgoingPartnerParcel && (
                          <div className="bg-purple-950/60 border border-purple-400/50 rounded-xl px-2.5 py-2 text-[11px] text-purple-100 font-bold flex items-center justify-between gap-2">
                            <span>
                              🔒 أنت الطرف المرسل — المدير والعامل في محطة الاستلام ({parcel.partner_destination_station_name || parcel.destination_station_name}) هما المسؤولان عن تأكيد الوصول والتسليم.
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-black/60 border border-purple-400/40 text-[10px] font-black shrink-0">
                              {parcel.partner_acceptance_status === 'pending_approval'
                                ? '⏳ بانتظار قبول الشريك'
                                : parcel.partner_acceptance_status === 'rejected'
                                ? '❌ مرفوضة من الشريك'
                                : '✓ مقبولة عند الشريك'}
                            </span>
                          </div>
                        )}

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

                            {parcel.status === 'arrived' && isDestForCurrentUser && (
                              <button
                                type="button"
                                onClick={() => {
                                  setQuickDeliverParcel(parcel);
                                  setIsQuickDeliverOpen(true);
                                }}
                                className="btn-cancel flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[11px] border border-emerald-500/45 text-emerald-300 transition"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                                <span>تسليم للزبون</span>
                              </button>
                            )}

                            {parcel.status === 'registered' &&
                              isOriginForCurrentUser &&
                              parcel.partner_acceptance_status !== 'rejected' &&
                              parcel.partner_acceptance_status !== 'pending_approval' && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateParcelStatus(parcel.id, 'in_transit', {
                                    notes: 'تم شحن الكولي وانطلاقه في الطريق نحو محطة الوجهة',
                                  });
                                }}
                                className="btn-gold flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-black text-[11px] transition"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>🚚 شحن الكولي الآن</span>
                              </button>
                            )}

                            {parcel.status === 'in_transit' && !parcel.trip_arrived_at && isDestForCurrentUser && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await confirmParcelTripArrived(parcel.id);
                                }}
                                className="btn-gold flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-black text-[11px] transition"
                              >
                                <Inbox className="w-3.5 h-3.5" />
                                <span>🏁 4. وصلات للمحطة</span>
                              </button>
                            )}

                            {parcel.status === 'in_transit' && Boolean(parcel.trip_arrived_at) && isDestForCurrentUser && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateParcelStatus(parcel.id, 'arrived', {
                                    notes: 'تم تفريغ الكولي وإدخاله للستوك يدوياً بعد وصول الرحلة',
                                  });
                                  showToast(`تم تفريغ الكولي #${parcel.parcel_number} للستوك ✓`, 'success');
                                }}
                                className="btn-cancel flex items-center gap-1 px-2.5 py-1.5 rounded-xl font-bold text-[11px] border border-amber-500/40 text-amber-300 transition"
                              >
                                <Inbox className="w-3.5 h-3.5 text-amber-400" />
                                <span>📥 5. تفريغ للستوك الآن</span>
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

                            {/* حماية السجلات: العامل لا يرى زر الحذف نهائياً، وغرفة الشراكة مقفلة نهائياً عن الجميع */}
                            {(userRole === 'owner' || userRole === 'platform_owner') && (
                              (parcel.is_partnership_parcel || parcel.partner_workspace_id || parcel.partner_origin_workspace_id || parcel.is_collaborator_data) ? (
                                <span className="text-[10px] text-emerald-400 font-bold px-2 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-1" title="سجلات غرفة الشراكة محمية ومقفلة نهائياً ولا يمكن مسحها لضمان الأدلة">
                                  <span>🔒 سجل شراكة دائم</span>
                                </span>
                              ) : (
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
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {filteredParcels.length > visibleParcelsCount && (
                <button
                  type="button"
                  onClick={() => setVisibleParcelsCount(prev => prev + 100)}
                  className="w-full py-2.5 rounded-2xl btn-cancel font-black text-xs text-[#F5C84C] cursor-pointer"
                >
                  + عرض 100 كولي إضافي (المتبقي: {filteredParcels.length - visibleParcelsCount})
                </button>
              )}
              </div>
            )
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

          {/* Standalone Toggle Button for Trips Log */}
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={isTripsLogOpen ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setIsTripsLogOpen(prev => !prev)}
            className="w-full py-2.5 px-3.5 rounded-[18px] font-black text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer transition shadow-md"
          >
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 shrink-0" />
              <span>📋 سجل عمليات الرحلات ({stationScopedTrips.length})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-black">
                {isTripsLogOpen ? 'إخفاء السجل ▲' : 'عرض السجل ▼'}
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isTripsLogOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          </button>

          {isTripsLogOpen && (
            stationScopedTrips.length === 0 ? (
              <div className="luxury-card rounded-[22px] p-6 text-center space-y-3 animate-fadeIn">
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
              <div className="space-y-2 animate-fadeIn">
                {stationScopedTrips.map(trip => {
                const statusMeta = tripStatusNames[trip.status] || { label: trip.status, color: 'bg-black/60 text-[#F5C84C]' };
                const loadedCount = trip.loaded_parcel_ids.length;
                const receivedCount = trip.received_parcel_ids.length;
                const missingCount = Math.max(0, loadedCount - receivedCount);
                const isExpanded = expandedTripIds.has(trip.id);
                const isSenderOfPartnerTrip = Boolean(
                  trip.partner_workspace_id &&
                    trip.partner_workspace_id !== currentWorkspace?.id &&
                    !trip.is_collaborator_data
                );
                const isTripOriginForMe =
                  !trip.is_collaborator_data &&
                  (!trip.partner_origin_workspace_id || trip.partner_origin_workspace_id === currentWorkspace?.id) &&
                  (userRole !== 'worker' || trip.origin_station_id === activeStationId);
                const isTripDestForMe =
                  !isSenderOfPartnerTrip &&
                  (userRole !== 'worker' ||
                    trip.destination_station_id === activeStationId ||
                    trip.partner_destination_station_id === activeStationId);

                return (
                  <div
                    key={trip.id}
                    className={`luxury-card px-3 py-2.5 rounded-[18px] text-xs border transition ${
                      isExpanded
                        ? 'border-[#F5C84C]/55'
                        : trip.is_partnership_trip
                        ? 'border-purple-500/45'
                        : 'border-white/12'
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
                        {trip.is_partnership_trip && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-950/90 text-purple-200 border border-purple-400/60 shrink-0">
                            🤝 شراكة
                          </span>
                        )}
                        <div className="flex items-center gap-1 font-bold text-white truncate text-[11px]">
                          <span className="truncate text-[#F5C84C]">من محطة: {trip.origin_station_name}</span>
                          <span className="text-[#F5C84C]">⬅</span>
                          <span className="truncate text-emerald-300">إلى محطة: {trip.destination_station_name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <span className="text-[10px] font-mono font-black text-[#F5C84C] bg-black/50 px-2 py-0.5 rounded-lg border border-white/10">
                          📦 {loadedCount}
                        </span>

                        {trip.status === 'loading' && isTripOriginForMe && (
                          <button
                            type="button"
                            onClick={() => setDispatchTrip(trip)}
                            className="px-2 py-1 rounded-lg bg-[#F5C84C] text-slate-950 font-black text-[10px] cursor-pointer"
                          >
                            🚚 3. رحلة
                          </button>
                        )}

                        {trip.status === 'departed' && isTripDestForMe && (
                          <button
                            type="button"
                            onClick={() => confirmTripArrivedAtDestination(trip.id)}
                            className="px-2 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-[10px] cursor-pointer"
                          >
                            🏁 4. وصلات
                          </button>
                        )}

                        {trip.status === 'arrived' && isTripDestForMe && (
                          <button
                            type="button"
                            onClick={() => setArrivalTrip(trip)}
                            className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[10px] cursor-pointer"
                          >
                            📥 5. تفريغ
                          </button>
                        )}

                        <span className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleTripExpand(trip.id)}
                          className="p-1 rounded-lg bg-black/50 border border-white/15 text-[#F5C84C] cursor-pointer"
                        >
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-200 ${
                              isExpanded ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
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

                              {trip.status !== 'closed' && isTripDestForMe && (
                                <button
                                  type="button"
                                  onClick={() => setArrivalTrip(trip)}
                                  className="btn-gold flex-1 py-2 rounded-xl font-black text-[11px] transition text-center flex items-center justify-center gap-1"
                                >
                                  <Inbox className="w-3.5 h-3.5" />
                                  <span>استقبال وتفريغ للستوك</span>
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

                          {/* حماية رحلات غرفة الشراكة: مقفلة نهائياً عن الحذف، والعمال محجوب عنهم زر الحذف */}
                          {(userRole === 'owner' || userRole === 'platform_owner') && (
                            (trip.partner_workspace_id || trip.partner_destination_station_id || trip.is_collaborator_data) ? (
                              <div className="text-center py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-[11px] flex items-center justify-center gap-1.5" title="رحلات غرفة الشراكة محمية ومقفلة نهائياً ولا يمكن مسحها لضمان الأدلة">
                                <span>🔒 رحلة شراكة دائمة (محمية من الحذف)</span>
                              </div>
                            ) : (
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
                            )
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )
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
                const isSenderOfPartnerTrip = Boolean(
                  trip.partner_workspace_id &&
                    trip.partner_workspace_id !== currentWorkspace?.id &&
                    !trip.is_collaborator_data
                );
                const isDestForMe =
                  !isSenderOfPartnerTrip &&
                  (userRole !== 'worker' ||
                    trip.destination_station_id === activeStationId ||
                    trip.partner_destination_station_id === activeStationId);

                return (
                  <div 
                    key={trip.id}
                    className="luxury-card p-4 rounded-[22px] space-y-3"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/15">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-black text-xs text-[#F5C84C] bg-black/60 px-2 py-0.5 rounded-lg border border-[#F5C84C]/40">
                            {trip.trip_code}
                          </span>
                          {trip.is_partnership_trip && (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-950/90 text-purple-200 border border-purple-400/60">
                              🤝 رحلة شراكة
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-white/80 mt-1">
                          من: <strong className="text-[#F5C84C]">{trip.origin_station_name}</strong> • السائق: <strong className="text-white">{trip.driver_name}</strong> ({trip.vehicle_plate})
                        </p>
                      </div>

                      {isDestForMe && (
                        <div className="flex items-center gap-1.5">
                          {trip.status === 'departed' ? (
                            <button
                              type="button"
                              onClick={() => confirmTripArrivedAtDestination(trip.id)}
                              className="px-3 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs transition flex items-center gap-1 cursor-pointer"
                            >
                              <span>🏁 4. وصلات للمحطة</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setArrivalTrip(trip)}
                              className="btn-gold px-3 py-2 rounded-xl font-black text-xs transition flex items-center gap-1 cursor-pointer"
                            >
                              <Scan className="w-3.5 h-3.5" />
                              <span>📥 5. تفريغ للستوك</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-[#F5C84C] font-bold">
                      {isFinished ? '✓ تم مسح جميع الكوليات وإدخالها للستوك' : `${receivedCount} في الستوك / ${missingCount} متبقي بالشاحنة`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
