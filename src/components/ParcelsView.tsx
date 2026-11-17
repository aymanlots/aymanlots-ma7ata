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
  isRealPartnershipParcel,
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
  Truck,
  Scan,
  UserCheck,
  Inbox,
  CheckSquare,
  Square,
  Users,
  RotateCcw,
  MessageSquare,
  FileText,
  ChevronDown,
  SlidersHorizontal,
  Trash2,
  Copy,
  ArrowRight,
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
    managerPartnerships,
    userRole,
    userAssignedStationId,
    isWorkerStationDeleted,
    hideAmounts,
    exchangeRate,
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

  // Clean 2-level navigation: main Parcels view OR Trips & Incoming view
  const [activeTab, setActiveTab] = useState<'parcels' | 'trips' | 'incoming'>('parcels');

  // Search & Filter state for Parcels
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'settled' | 'unpaid'>('all');
  const [stationFilter, setStationFilter] = useState<string>(() =>
    userRole === 'worker' && userAssignedStationId
      ? userAssignedStationId
      : selectedStationId || 'all'
  );
  const [conditionFilter, setConditionFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'own' | 'partnership'>('all');
  const [visibleParcelsCount, setVisibleParcelsCount] = useState<number>(60);

  // Sync station filter with header scope
  useEffect(() => {
    if (userRole === 'worker' && userAssignedStationId) {
      setStationFilter(userAssignedStationId);
    } else if (selectedStationId) {
      setStationFilter(selectedStationId);
    } else {
      setStationFilter('all');
    }
  }, [selectedStationId, userRole, userAssignedStationId]);

  useEffect(() => {
    setVisibleParcelsCount(60);
  }, [statusFilter, ownershipFilter, stationFilter, paymentFilter, searchQuery]);

  // Collapsible secondary drawers (only secondary tools & advanced filters start closed)
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
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

  // Prevent stacked modals-on-modals on mobile
  const closeSiblingSubModals = () => {
    setTicketParcel(null);
    setBatchStickerParcels(undefined);
    setIsBatchStickerModalOpen(false);
    setDetailParcel(null);
    setIsNewTripOpen(false);
    setDispatchTrip(null);
    setArrivalTrip(null);
    setIsQuickDeliverOpen(false);
    setQuickDeliverParcel(null);
    setIsBarcodeScannerOpen(false);
  };

  const getParcelStaleDays = (p: Parcel): number => {
    if (p.status !== 'arrived' && p.status !== 'registered') return 0;
    const refDate = p.status === 'arrived' ? (p.arrived_at || p.created_at) : p.created_at;
    const ts = new Date(refDate).getTime();
    if (isNaN(ts)) return 0;
    return Math.max(0, Math.floor((Date.now() - ts) / 86400000));
  };

  // Active & Permission Station Context
  const activeStationId =
    userRole === 'worker' && userAssignedStationId
      ? userAssignedStationId
      : selectedStationId && selectedStationId !== 'all'
      ? selectedStationId
      : stations[0]?.id || '';
  const activeStation = stations.find(s => s.id === activeStationId) || stations[0];
  const permissionStationId =
    userRole === 'worker'
      ? userAssignedStationId || ''
      : selectedStationId && selectedStationId !== 'all'
      ? selectedStationId
      : 'all';

  const isUnshippedIncomingPartnerParcel = (p: Parcel) => {
    const isIncomingPartner = Boolean(
      p.is_collaborator_data ||
        (p.partner_origin_workspace_id && p.partner_origin_workspace_id !== currentWorkspace?.id)
    );
    return isIncomingPartner && (p.status === 'registered' || p.status === 'pending');
  };

  // Filtered parcels list
  const filteredParcels = useMemo(() => {
    return parcels.filter(p => {
      if (isUnshippedIncomingPartnerParcel(p)) return false;

      if (statusFilter !== 'all') {
        if (statusFilter === 'stale') {
          if (getParcelStaleDays(p) < 5) return false;
        } else if (statusFilter === 'return_in_transit') {
          if (p.status !== 'return_in_transit' && p.status !== 'returned') return false;
        } else if (p.status !== statusFilter) {
          return false;
        }
      }

      if (conditionFilter !== 'all') {
        const cond = p.condition || 'normal';
        if (cond !== conditionFilter) return false;
      }

      if (stationFilter !== 'all') {
        const isOrigin = p.origin_station_id === stationFilter;
        const isShippedToDest =
          (p.destination_station_id === stationFilter ||
            p.partner_destination_station_id === stationFilter) &&
          p.status !== 'registered' &&
          p.status !== 'pending';
        if (!isOrigin && !isShippedToDest) return false;
      }

      if (ownershipFilter !== 'all') {
        const ownership = getParcelSourceOwnershipInfo(p, currentWorkspace?.id, currentWorkspace?.name);
        if (ownershipFilter === 'own' && ownership.isPartnership) return false;
        if (ownershipFilter === 'partnership' && !ownership.isPartnership) return false;
      }

      const remaining = Math.max(0, Math.round((p.amount_due - p.amount_paid) * 100) / 100);
      if (paymentFilter === 'settled' && remaining > 0) return false;
      if (paymentFilter === 'unpaid' && remaining <= 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCode = matchesTrackingCode(p, searchQuery) || p.tracking_code.toLowerCase().includes(q);
        const matchNum = p.parcel_number?.toString().includes(q);
        const matchSender = p.sender_name.toLowerCase().includes(q) || p.sender_phone.includes(q);
        const matchReceiver = p.receiver_name.toLowerCase().includes(q) || p.receiver_phone.includes(q);
        const matchDesc = p.description.toLowerCase().includes(q);
        const matchDriver = p.driver_name?.toLowerCase().includes(q);
        const matchPlate = p.vehicle_plate?.toLowerCase().includes(q);
        if (
          !matchNum &&
          !matchCode &&
          !matchSender &&
          !matchReceiver &&
          !matchDesc &&
          !matchDriver &&
          !matchPlate
        ) {
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
    searchQuery,
    currentWorkspace?.id,
    currentWorkspace?.name,
  ]);

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
      canAcceptOrRejectPartnerParcel(p, currentWorkspace?.id, userRole, permissionStationId)
    );
  }, [parcels, stationFilter, currentWorkspace?.id, userRole, permissionStationId]);

  // Only show partnership complexity if workspace actually uses partnerships
  const hasPartnershipContext = useMemo(() => {
    return (
      ownershipCounts.partnershipCount > 0 ||
      pendingPartnerApprovalParcels.length > 0 ||
      managerPartnerships.some(p => p.status === 'active')
    );
  }, [ownershipCounts.partnershipCount, pendingPartnerApprovalParcels.length, managerPartnerships]);

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

  const stats = useMemo(() => {
    let registered = 0;
    let inTransit = 0;
    let arrived = 0;
    let delivered = 0;
    let returning = 0;
    let stale = 0;
    let totalUnpaidMad = 0;
    let totalUnpaidMru = 0;

    stationScopedParcels.forEach(p => {
      if (p.status === 'registered') registered++;
      else if (p.status === 'in_transit') inTransit++;
      else if (p.status === 'arrived') arrived++;
      else if (p.status === 'delivered') delivered++;
      else if (p.status === 'return_in_transit' || p.status === 'returned') returning++;

      if (getParcelStaleDays(p) >= 5) stale++;

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
      stale,
      totalUnpaidMad: Math.round(totalUnpaidMad * 100) / 100,
      totalUnpaidMru: Math.round(totalUnpaidMru * 100) / 100,
    };
  }, [stationScopedParcels]);

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
        permissionStationId
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

  // One-click arrive & unload helper (automatically handles Stage 4 "وصلات" then Stage 5 "تفريغ للستوك")
  const handleOneClickArriveToStock = async (parcel: Parcel) => {
    if (!parcel.trip_arrived_at) {
      const stage4Res = await confirmParcelTripArrived(parcel.id);
      if (!stage4Res.success) return;
    }
    const res = await updateParcelStatus(parcel.id, 'arrived', {
      notes: 'تم استلام وتفريغ الكولي في ستوك المحطة',
    });
    if (!res.success && res.error) {
      showToast(res.error, 'error');
    }
  };

  const statusNames: Record<string, string> = {
    registered: 'مسجلة بالمحطة',
    in_transit: 'بالطريق',
    arrived: 'فـ الستوك (للتسليم)',
    delivered: 'تم التسليم ✓',
    return_in_transit: 'قيد الإرجاع ↺',
    returned: 'تم الإرجاع ✓',
    cancelled: 'ملغاة',
  };

  const tripStatusNames: Record<string, { label: string; color: string }> = {
    loading: { label: 'قيد التحميل والشحن', color: 'bg-black/60 text-[#F5C84C] border-[#F5C84C]/40' },
    departed: { label: 'في الطريق 🚚', color: 'bg-[#006233]/35 text-[#2ECC71] border-[#2ECC71]/50' },
    arrived: { label: 'وصلت المحطة 🏁', color: 'bg-black/60 text-[#F5C84C] border-[#F5C84C]/40' },
    closed: { label: 'مكتملة ✓', color: 'bg-black/50 text-white/80 border-white/25' },
  };

  const activeFiltersCount =
    (conditionFilter !== 'all' ? 1 : 0) +
    (paymentFilter !== 'all' ? 1 : 0) +
    (statusFilter === 'return_in_transit' ? 1 : 0);

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

  const isInTripsMode = activeTab === 'trips' || activeTab === 'incoming';

  return (
    <div className={`space-y-2.5 pb-28 ${isRtl ? 'text-right' : 'text-left'}`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* 1. CLEAN TOP CARD — SAME 4-BUTTON SIMPLICITY AS CASHBOX & TRANSFERS */}
      <div className="luxury-card p-3.5 rounded-[22px] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package className="w-5 h-5 text-[#F5C84C] shrink-0" />
            <h1 className="text-base sm:text-lg font-black text-white truncate">
              📦 {isInTripsMode ? 'الرحلات والوارد' : t('navParcels', 'الكوليات')}
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40 font-mono font-black shrink-0">
              {isInTripsMode ? stationScopedTrips.length : stats.total}
            </span>
            <HelpPopover
              title="قسم الكوليات والرحلات"
              text="سجل كولي جديد، امسح الباركود، سلّم للزبناء، أو تبع الرحلات ببساطة."
            />
          </div>

          <button
            type="button"
            onClick={() => setIsMoreToolsOpen(prev => !prev)}
            className="btn-cancel px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
            title="أدوات إضافية"
          >
            <span>⚡ {t('toolsBtn', 'أدوات')}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                isMoreToolsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* 4 Clear Primary Action Buttons (Exact same layout rhythm as Cashboxes) */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onOpenNewParcel}
              className="btn-hero-action btn-add flex items-center justify-center gap-2 py-3.5 px-3 rounded-[12px] font-black text-sm sm:text-base cursor-pointer"
            >
              <PlusCircle className="w-5 h-5 shrink-0" />
              <span className="truncate">{t('newParcel', 'كولي جديد')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQuickDeliverParcel(null);
                setIsQuickDeliverOpen(true);
              }}
              className="btn-hero-action btn-gold flex items-center justify-center gap-2 py-3.5 px-3 rounded-[12px] font-black text-sm sm:text-base cursor-pointer"
            >
              <UserCheck className="w-5 h-5 shrink-0" />
              <span className="truncate">تسليم للزبون</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-btn-role="info"
              data-btn-role-fixed="true"
              onClick={() => setIsBarcodeScannerOpen(true)}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-3 rounded-[12px] text-xs sm:text-sm font-black cursor-pointer"
            >
              <Scan className="w-4 h-4 shrink-0 text-[#F5C84C]" />
              <span className="whitespace-nowrap">{t('scannerTitle', 'سكانر QR')}</span>
            </button>

            <button
              type="button"
              data-btn-role="info"
              data-btn-role-fixed="true"
              data-btn-active={isInTripsMode ? 'true' : 'false'}
              data-btn-active-fixed="true"
              onClick={() => setActiveTab(isInTripsMode ? 'parcels' : 'trips')}
              className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-[12px] text-xs sm:text-sm font-black cursor-pointer relative ${
                isInTripsMode ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              {isInTripsMode ? (
                <>
                  <ArrowRight className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">رجوع للكوليات</span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4 shrink-0" />
                  <span className="whitespace-nowrap">الرحلات ({stationScopedTrips.length})</span>
                  {incomingTrips.length > 0 && (
                    <span className="badge-pill px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black">
                      {incomingTrips.length}
                    </span>
                  )}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Collapsible Secondary Tools Drawer (keeps ALL features 1 tap away without cluttering screen) */}
        {isMoreToolsOpen && (
          <div className="pt-2 border-t border-white/15 grid grid-cols-2 gap-2 animate-fadeIn">
            <button
              type="button"
              onClick={() => setIsNewTripOpen(true)}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5 text-[#F5C84C]" />
              <span>رحلة جديدة</span>
            </button>

            {onOpenCustomerAccounts && (
              <button
                type="button"
                onClick={onOpenCustomerAccounts}
                className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>{t('customerAccountsBtn', 'حسابات الزبناء')}</span>
              </button>
            )}

            {onOpenCollabRoom && userRole === 'owner' && (
              <button
                type="button"
                onClick={onOpenCollabRoom}
                className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-purple-300" />
                <span>{t('collabRoomTitle', 'غرف الشراكة')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const chosen = parcels.filter(p => selectedParcelIds.has(p.id));
                setBatchStickerParcels(chosen.length > 0 ? chosen : filteredParcels.slice(0, 1));
                setIsBatchStickerModalOpen(true);
              }}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-[#F5C84C]" />
              <span>طباعة الملصقات{selectedParcelIds.size > 0 ? ` (${selectedParcelIds.size})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('parcels');
                setStatusFilter(statusFilter === 'return_in_transit' ? 'all' : 'return_in_transit');
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition cursor-pointer ${
                statusFilter === 'return_in_transit' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>المرجعة ({stats.returning})</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              title="تصدير سجل الكوليات بصيغة PDF"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>📄 تصدير PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* VIEW 1: PARCELS LIST (ALWAYS VISIBLE DIRECTLY — SIMPLE LIKE CASHBOXES)   */}
      {/* ========================================================================= */}
      {!isInTripsMode && (
        <div className="space-y-2.5">
          {/* 2. 4 Clear Status Cards (Tap to filter, tap again to show all) */}
          <div className="luxury-card rounded-[22px] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-white">📊 حالة الكوليات</span>
              <div className="flex items-center gap-2">
                {statusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[#F5C84C]/20 text-[#F5C84C] border border-[#F5C84C]/40 cursor-pointer"
                  >
                    عرض الكل ({stats.total})
                  </button>
                )}
                {(stats.totalUnpaidMad > 0 || stats.totalUnpaidMru > 0) && (
                  <span className="text-[11px] font-mono font-black text-[#F5C84C]" dir="ltr">
                    باقي: {hideAmounts ? '••••' : [
                      stats.totalUnpaidMad > 0 ? `${stats.totalUnpaidMad} MAD` : '',
                      stats.totalUnpaidMru > 0 ? `${stats.totalUnpaidMru} MRU` : '',
                    ].filter(Boolean).join(' | ')}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 text-center">
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'registered' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'registered' ? 'all' : 'registered')}
                className={`border rounded-xl p-2 transition cursor-pointer ${
                  statusFilter === 'registered' ? 'btn-gold shadow-md' : 'bg-black/55 border-white/15 hover:border-[#F5C84C]/40'
                }`}
              >
                <div className="text-[10px] font-bold opacity-85 truncate">مسجلة</div>
                <div className="text-base sm:text-lg font-mono font-black">{stats.registered}</div>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'in_transit' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'in_transit' ? 'all' : 'in_transit')}
                className={`border rounded-xl p-2 transition cursor-pointer ${
                  statusFilter === 'in_transit' ? 'btn-gold shadow-md' : 'bg-black/55 border-amber-500/30 hover:border-[#F5C84C]/40'
                }`}
              >
                <div className="text-[10px] font-bold opacity-85 truncate">بالطريق</div>
                <div className="text-base sm:text-lg font-mono font-black">{stats.inTransit}</div>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'arrived' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'arrived' ? 'all' : 'arrived')}
                className={`border rounded-xl p-2 transition cursor-pointer ${
                  statusFilter === 'arrived' ? 'btn-gold shadow-md' : 'bg-black/55 border-emerald-500/35 hover:border-emerald-400/60'
                }`}
              >
                <div className="text-[10px] font-bold opacity-85 truncate">بالمحطة</div>
                <div className="text-base sm:text-lg font-mono font-black text-emerald-400">{stats.arrived}</div>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={statusFilter === 'delivered' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setStatusFilter(statusFilter === 'delivered' ? 'all' : 'delivered')}
                className={`border rounded-xl p-2 transition cursor-pointer ${
                  statusFilter === 'delivered' ? 'btn-gold shadow-md' : 'bg-black/55 border-white/15 hover:border-[#F5C84C]/40'
                }`}
              >
                <div className="text-[10px] font-bold opacity-85 truncate">سُلِّمت</div>
                <div className="text-base sm:text-lg font-mono font-black">{stats.delivered}</div>
              </button>
            </div>

            {(stats.stale > 0 || statusFilter === 'stale') && (
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'stale' ? 'all' : 'stale')}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-black flex items-center justify-between transition cursor-pointer ${
                  statusFilter === 'stale'
                    ? 'bg-rose-500 text-white border-rose-400 shadow-md'
                    : 'bg-rose-950/55 border-rose-500/45 text-rose-200 hover:bg-rose-950/80'
                }`}
              >
                <span>⏰ كوليات معطلة فالمحطة (+5 أيام بلا استلام)</span>
                <span className="font-mono font-black px-2 py-0.5 rounded-lg bg-black/40 text-white">
                  {stats.stale}
                </span>
              </button>
            )}
          </div>

          {/* 3. Pending Partner Approvals Banner (Only when there are pending partner requests) */}
          {userRole !== 'worker' && pendingPartnerApprovalParcels.length > 0 && (
            <div className="luxury-card p-3.5 rounded-[20px] border-2 border-purple-400/75 bg-purple-950/60 space-y-2.5 animate-fadeIn">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-xl bg-purple-500 text-white font-black text-xs flex items-center justify-center shadow">
                    {pendingPartnerApprovalParcels.length}
                  </span>
                  <h3 className="text-xs sm:text-sm font-black text-white">
                    🤝 كوليات من شريك بانتظار القبول ({pendingPartnerApprovalParcels.length})
                  </h3>
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
                            الشريك: {pp.partner_origin_workspace_name || 'شريك'}
                          </span>
                          <span className="font-black text-white">
                            {pp.receiver_name} ({pp.receiver_phone})
                          </span>
                        </div>
                        <div className="text-[10px] text-white/85 font-bold flex items-center gap-1.5 flex-wrap">
                          <span>
                            من <strong className="text-[#F5C84C]">{pp.origin_station_name}</strong> ⬅ إلى{' '}
                            <strong className="text-emerald-300">
                              {pp.partner_destination_station_name || pp.destination_station_name}
                            </strong>
                          </span>
                          <span>• {pp.description} ({pp.items_count || 1})</span>
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
                          ✅ قبول
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

          {/* 4. Search & Optional Filters (Ownership filter only shown when Partnership exists) */}
          <div className="luxury-card p-2.5 rounded-[20px] space-y-2">
            {hasPartnershipContext && (
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
                  🏠 محطتنا ({ownershipCounts.ownCount})
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
                  🤝 الشراكة ({ownershipCounts.partnershipCount})
                </button>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="ابحث بكود الكولي، الاسم، الهاتف..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-xs text-white placeholder-white/65 focus:outline-none pl-8"
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
                className={`px-2.5 py-2 rounded-xl text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition ${
                  isFiltersOpen || activeFiltersCount > 0 ? 'btn-gold' : 'btn-cancel'
                }`}
                title="فلاتر البحث وتحديد الطباعة"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>فلاتر{activeFiltersCount > 0 ? ` (${activeFiltersCount})` : ''}</span>
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
                  إلغاء
                </button>
              </div>
            )}

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
                    <option value="all">الدفع (الكل)</option>
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
                          ? 'إلغاء تحديد الكل'
                          : 'تحديد الكل للطباعة'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (expandedParcelIds.size > 0) {
                          setExpandedParcelIds(new Set());
                        } else {
                          setExpandedParcelIds(
                            new Set(filteredParcels.slice(0, visibleParcelsCount).map(p => p.id))
                          );
                        }
                      }}
                      className="btn-cancel flex items-center gap-1 px-2.5 py-1 rounded-xl font-bold transition"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      <span>{expandedParcelIds.size > 0 ? 'طي الكل' : 'توسيع الكل'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 5. Direct Parcels List (Always Visible — Clean Rows + Smart 1-Tap Action) */}
          {filteredParcels.length === 0 ? (
            <div className="luxury-card rounded-[22px] p-6 text-center space-y-2 animate-fadeIn">
              <div className="w-11 h-11 rounded-2xl bg-black/50 border border-white/15 text-[#F5C84C] flex items-center justify-center mx-auto">
                <Package className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">لا توجد كوليات مطابقة</h3>
              <p className="text-xs text-white/75">
                سجل كولي جديد أو غيّر البحث والفلتر.
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
                  permissionStationId
                );

                const isOriginForCurrentUser = canControlParcelOrigin(
                  parcel,
                  currentWorkspace?.id,
                  userRole,
                  permissionStationId
                );

                const canApprovePartner = canAcceptOrRejectPartnerParcel(
                  parcel,
                  currentWorkspace?.id,
                  userRole,
                  permissionStationId
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
                    {/* Clean Compact Row */}
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
                          className="p-1 rounded-lg bg-black/50 text-[#F5C84C] transition shrink-0"
                          title="تحديد للطباعة"
                        >
                          {selectedParcelIds.has(parcel.id) ? (
                            <CheckSquare className="w-3.5 h-3.5 text-[#F5C84C]" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-white/50" />
                          )}
                        </button>

                        <span
                          dir="ltr"
                          className="font-mono text-[11px] font-black text-[#F5C84C] bg-black/60 px-1.5 py-0.5 rounded-lg border border-[#F5C84C]/40 shrink-0"
                        >
                          {formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number)}
                        </span>

                        {ownershipInfo.isPartnership && (
                          <span
                            className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-purple-950/90 text-purple-200 border border-purple-400/60 shrink-0"
                            title={ownershipInfo.fullBannerTitle}
                          >
                            🤝 شراكة
                          </span>
                        )}

                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-black text-white text-xs">
                            {parcel.receiver_name}
                          </span>
                          <span className="text-[10px] text-white/75 mr-1.5 font-bold">
                            {parcel.origin_station_name} ⬅{' '}
                            <span className="text-emerald-300">
                              {parcel.partner_destination_station_name || parcel.destination_station_name}
                            </span>
                          </span>
                        </div>
                      </div>

                      {/* Right Actions: Amount + Single Smart Action Button + Chevron */}
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

                        {canApprovePartner && (
                          <>
                            <button
                              type="button"
                              onClick={() => respondToPartnerParcel(parcel.id, 'accepted')}
                              className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer"
                            >
                              ✅ قبول
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                respondToPartnerParcel(
                                  parcel.id,
                                  'rejected',
                                  'رفض استلام الكولية من طرف المدير المستقبل'
                                )
                              }
                              className="px-1.5 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/50 font-black text-[10px] transition cursor-pointer"
                            >
                              ❌
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
                            ⏳ بانتظار الشريك
                          </span>
                        )}

                        {/* SMART 1-CLICK NEXT ACTION */}
                        {parcel.status === 'registered' &&
                          isOriginForCurrentUser &&
                          parcel.partner_acceptance_status !== 'rejected' &&
                          !(
                            parcel.partner_acceptance_status === 'pending_approval' &&
                            isRealPartnershipParcel(parcel, currentWorkspace?.id)
                          ) && (
                            <button
                              type="button"
                              onClick={async () => {
                                await updateParcelStatus(parcel.id, 'in_transit', {
                                  notes: 'تم شحن الكولي وانطلاقه في الطريق نحو محطة الوجهة',
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-[#F5C84C] hover:bg-[#ffe074] text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                              title="شحن وإرسال الكولي في الطريق"
                            >
                              🚚 إرسال
                            </button>
                          )}

                        {parcel.status === 'in_transit' && isDestForCurrentUser && (
                          <button
                            type="button"
                            onClick={() => handleOneClickArriveToStock(parcel)}
                            className="px-2 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                            title="استقبال وتفريغ الكولي في ستوك المحطة"
                          >
                            📥 وصل للمحطة
                          </button>
                        )}

                        {parcel.status === 'arrived' && isDestForCurrentUser && (
                          <>
                            {getParcelStaleDays(parcel) >= 5 && (
                              <button
                                type="button"
                                onClick={() =>
                                  openWhatsAppParcelNotification(
                                    parcel,
                                    'arrived_receiver',
                                    currentWorkspace?.custom_brand_name || currentWorkspace?.name
                                  )
                                }
                                className="px-2 py-1 rounded-lg bg-rose-500/25 hover:bg-rose-500/40 text-rose-200 border border-rose-500/50 font-black text-[10px] transition cursor-pointer"
                                title={`كولي معطل منذ ${getParcelStaleDays(parcel)} يوم — أرسل تذكير واتساب`}
                              >
                                ⏰ {getParcelStaleDays(parcel)}ي
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                closeSiblingSubModals();
                                setQuickDeliverParcel(parcel);
                                setIsQuickDeliverOpen(true);
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition active:scale-95 cursor-pointer shadow-sm"
                              title="تسليم الكولي للزبون"
                            >
                              ✅ تسليم
                            </button>
                          </>
                        )}

                        {isOutgoingPartnerParcel &&
                          parcel.partner_acceptance_status === 'accepted' &&
                          parcel.status !== 'delivered' && (
                            <span
                              className="px-1.5 py-0.5 rounded-lg bg-purple-950/80 text-purple-200 font-black text-[9px] border border-purple-400/50"
                              title="محطة الاستلام الشريكة هي المسؤولة عن الإكمال"
                            >
                              {sixStep.currentLabel}
                            </span>
                          )}

                        {parcel.status === 'delivered' && (
                          <span className="px-1.5 py-0.5 rounded-lg bg-white/15 text-white font-black text-[10px] border border-white/20">
                            ✓ سُلِّم
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

                    {/* Expanded Details (All features intact inside when tapped) */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 animate-fadeIn">
                        {ownershipInfo.isPartnership && (
                          <>
                            <div className="px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center justify-between gap-2 border bg-purple-950/85 text-purple-200 border-purple-400/55">
                              <span>{ownershipInfo.fullBannerTitle}</span>
                              <span className="text-[10px] opacity-90 shrink-0">حساب الشريك مستقل</span>
                            </div>

                            <div className="grid grid-cols-6 gap-1">
                              {sixStep.allSteps.map(st => (
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
                          </>
                        )}

                        <div className="flex items-center justify-between flex-wrap gap-1.5 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-mono font-black text-[#F5C84C] bg-black/60 px-2.5 py-0.5 rounded-lg border border-[#F5C84C]/40"
                              dir="ltr"
                            >
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

                        {!isNormal && parcel.condition_notes && (
                          <div className="bg-black/60 border border-[#F5C84C]/50 rounded-xl p-2 text-[11px] text-[#F5C84C] flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 text-[#F5C84C] shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold block">ملاحظة حالة الكولي:</span>
                              <span>{parcel.condition_notes}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between flex-wrap gap-2 text-white text-[11px] bg-black/40 px-2.5 py-2 rounded-xl border border-white/10">
                          <div className="flex items-center gap-1.5 font-black flex-wrap">
                            <MapPin className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                            <span className="text-[#F5C84C]">{parcel.origin_station_name}</span>
                            <span className="text-[#F5C84C]">⬅</span>
                            <span className="text-emerald-300">
                              {parcel.partner_destination_station_name || parcel.destination_station_name}
                            </span>
                          </div>
                          <span className="text-[10px] text-white/80 font-bold">
                            {isSettled ? '✓ خالص بالكامل' : `متبقي: ${remaining} ${parcel.currency}`} ({payerLabel})
                          </span>
                        </div>

                        {isOutgoingPartnerParcel && (
                          <div className="bg-purple-950/60 border border-purple-400/50 rounded-xl px-2.5 py-2 text-[11px] text-purple-100 font-bold flex items-center justify-between gap-2">
                            <span>
                              🔒 مرسلة للشريك في محطة ({parcel.partner_destination_station_name || parcel.destination_station_name}) — محطة الوصول هي المخولة بالتفريغ والتسليم.
                            </span>
                          </div>
                        )}

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

                        {parcel.driver_name && (
                          <div className="flex items-center gap-2 bg-black/50 border border-white/15 px-3 py-1.5 rounded-xl text-[11px] text-[#F5C84C]">
                            <Truck className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                            <span className="font-bold">السائق: {parcel.driver_name}</span>
                            {parcel.vehicle_plate && (
                              <span className="font-mono text-white" dir="ltr">({parcel.vehicle_plate})</span>
                            )}
                          </div>
                        )}

                        <div className="space-y-2 pt-1 border-t border-white/10">
                          <div className="text-[11px] font-bold text-white">
                            📦 {parcel.items_count} طرد — {parcel.description}
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
                              <span>التفاصيل</span>
                            </button>

                            {(userRole === 'owner' || userRole === 'platform_owner') &&
                              (isRealPartnershipParcel(parcel, currentWorkspace?.id) ? (
                                <span
                                  className="text-[10px] text-emerald-400 font-bold px-2 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-1"
                                  title="سجلات غرفة الشراكة محمية من الحذف"
                                >
                                  <span>🔒 سجل دائم</span>
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
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>حذف</span>
                                </button>
                              ))}
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
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: UNIFIED TRIPS & INCOMING VIEW (CLEAN 2-SUBTAB ORGANIZATION)       */}
      {/* ========================================================================= */}
      {isInTripsMode && (
        <div className="space-y-2.5 animate-fadeIn">
          {/* Sub-tabs: Outgoing/All Trips vs Incoming Trips + New Trip Button */}
          <div className="luxury-card p-3 rounded-[20px] space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#F5C84C]" />
                <span>
                  {activeTab === 'incoming'
                    ? `الرحلات القادمة نحو [${selectedStationId === 'all' || !selectedStationId ? 'كافة المحطات' : activeStation?.name || 'المحطة'}]`
                    : `رحلات الشحن (${stationScopedTrips.length})`}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setIsNewTripOpen(true)}
                className="btn-gold flex items-center gap-1 px-3 py-1.5 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>رحلة جديدة</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/15 text-xs font-black">
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={activeTab === 'trips' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setActiveTab('trips')}
                className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'trips' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span>كل الرحلات ({stationScopedTrips.length})</span>
              </button>

              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active={activeTab === 'incoming' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setActiveTab('incoming')}
                className={`py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'incoming' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <Inbox className="w-3.5 h-3.5" />
                <span>رحلات قادمة ({incomingTrips.length})</span>
              </button>
            </div>
          </div>

          {activeTab === 'trips' && (
            stationScopedTrips.length === 0 ? (
              <div className="luxury-card rounded-[22px] p-6 text-center space-y-3">
                <Truck className="w-6 h-6 text-[#F5C84C] mx-auto" />
                <h3 className="text-sm font-bold text-white">لا توجد رحلات شحن مسجلة بعد</h3>
                <button
                  type="button"
                  onClick={() => setIsNewTripOpen(true)}
                  className="btn-gold px-4 py-2 rounded-xl font-black text-xs transition cursor-pointer"
                >
                  إنشاء أول رحلة شحن الآن
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {stationScopedTrips.map(trip => {
                  const statusMeta = tripStatusNames[trip.status] || {
                    label: trip.status,
                    color: 'bg-black/60 text-[#F5C84C]',
                  };
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
                    (!trip.partner_origin_workspace_id ||
                      trip.partner_origin_workspace_id === currentWorkspace?.id) &&
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
                            <span className="truncate text-[#F5C84C]">{trip.origin_station_name}</span>
                            <span className="text-[#F5C84C]">⬅</span>
                            <span className="truncate text-emerald-300">{trip.destination_station_name}</span>
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
                              🚚 شحن
                            </button>
                          )}

                          {trip.status === 'departed' && isTripDestForMe && (
                            <button
                              type="button"
                              onClick={() => confirmTripArrivedAtDestination(trip.id)}
                              className="px-2 py-1 rounded-lg bg-amber-400 text-slate-950 font-black text-[10px] cursor-pointer"
                            >
                              🏁 وصلات
                            </button>
                          )}

                          {trip.status === 'arrived' && isTripDestForMe && (
                            <button
                              type="button"
                              onClick={() => setArrivalTrip(trip)}
                              className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[10px] cursor-pointer"
                            >
                              📥 تفريغ
                            </button>
                          )}

                          <span
                            className={`hidden sm:inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${statusMeta.color}`}
                          >
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

                          {userRole !== 'worker' && (() => {
                            const expCurr = (trip.expense_currency as 'MAD' | 'MRU') || 'MAD';
                            const tripExpTotal =
                              Math.round(
                                ((trip.fuel_expense || 0) +
                                  (trip.toll_expense || 0) +
                                  (trip.driver_commission || 0) +
                                  (trip.other_expense || 0)) *
                                  100
                              ) / 100;
                            const tripParcelsList = trip.loaded_parcel_ids
                              .map(id => parcels.find(p => p.id === id))
                              .filter((p): p is Parcel => Boolean(p));
                            const tripRev =
                              Math.round(
                                tripParcelsList.reduce((acc, p) => {
                                  if (p.is_returning) return acc;
                                  const due = Number(p.amount_due) || 0;
                                  if (p.currency === expCurr) return acc + due;
                                  if (expCurr === 'MAD' && p.currency === 'MRU') {
                                    return acc + (exchangeRate > 0 ? due / exchangeRate : 0);
                                  }
                                  if (expCurr === 'MRU' && p.currency === 'MAD') {
                                    return acc + due * exchangeRate;
                                  }
                                  return acc + due;
                                }, 0) * 100
                              ) / 100;
                            const tripNet = Math.round((tripRev - tripExpTotal) * 100) / 100;

                            return (
                              <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px] bg-black/50 p-2 rounded-xl border border-[#D4AF37]/30">
                                <div>
                                  <span className="text-white/70 block font-sans font-bold">📥 المداخيل</span>
                                  <span className="font-black text-emerald-400" dir="ltr">
                                    {hideAmounts ? '••••' : tripRev} {expCurr}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-white/70 block font-sans font-bold">📤 المصاريف</span>
                                  <span className="font-black text-rose-400" dir="ltr">
                                    {hideAmounts ? '••••' : tripExpTotal} {expCurr}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-white/70 block font-sans font-bold">💎 الربح الصافي</span>
                                  <span
                                    className={`font-black ${tripNet >= 0 ? 'text-[#F5C84C]' : 'text-rose-400'}`}
                                    dir="ltr"
                                  >
                                    {hideAmounts ? '••••' : tripNet} {expCurr}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}

                          <div className="pt-1 space-y-1.5">
                            {trip.status === 'loading' ? (
                              userRole !== 'worker' || trip.origin_station_id === activeStationId ? (
                                <button
                                  type="button"
                                  onClick={() => setDispatchTrip(trip)}
                                  className="btn-gold w-full py-2 rounded-xl font-black text-xs transition flex items-center justify-center gap-1.5"
                                >
                                  <Scan className="w-4 h-4" />
                                  <span>فتح لشحن ومسح الكوليات ➔</span>
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
                              <span>طباعة ورقة الطريق الرسمية (Manifeste PDF)</span>
                            </button>

                            {(userRole === 'owner' || userRole === 'platform_owner') &&
                              (trip.partner_workspace_id ||
                              trip.partner_destination_station_id ||
                              trip.is_collaborator_data ? (
                                <div className="text-center py-2 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-[11px] flex items-center justify-center gap-1.5">
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
                                  <span>حذف الرحلة نهائياً</span>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {activeTab === 'incoming' && (
            incomingTrips.length === 0 ? (
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
                    <div key={trip.id} className="luxury-card p-4 rounded-[22px] space-y-3">
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
                            من: <strong className="text-[#F5C84C]">{trip.origin_station_name}</strong> • السائق:{' '}
                            <strong className="text-white">{trip.driver_name}</strong> ({trip.vehicle_plate})
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
                                <span>🏁 وصلات للمحطة</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setArrivalTrip(trip)}
                                className="btn-gold px-3 py-2 rounded-xl font-black text-xs transition flex items-center gap-1 cursor-pointer"
                              >
                                <Scan className="w-3.5 h-3.5" />
                                <span>📥 تفريغ للستوك</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] text-[#F5C84C] font-bold">
                        {isFinished
                          ? '✓ تم مسح جميع الكوليات وإدخالها للستوك'
                          : `${receivedCount} في الستوك / ${missingCount} متبقي بالشاحنة`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ALL MODALS                                                                */}
      {/* ========================================================================= */}
      <NewTripModal
        isOpen={isNewTripOpen}
        onClose={() => setIsNewTripOpen(false)}
        onTripCreated={newT => {
          closeSiblingSubModals();
          setDispatchTrip(newT);
        }}
      />

      <TripDispatchModal
        trip={dispatchTrip}
        isOpen={Boolean(dispatchTrip)}
        onClose={() => setDispatchTrip(null)}
        onOpenTicket={p => {
          closeSiblingSubModals();
          setTicketParcel(p);
        }}
      />

      <TripArrivalModal
        trip={arrivalTrip}
        isOpen={Boolean(arrivalTrip)}
        onClose={() => setArrivalTrip(null)}
        onOpenTicket={p => {
          closeSiblingSubModals();
          setTicketParcel(p);
        }}
      />

      <QuickDeliverModal
        isOpen={isQuickDeliverOpen}
        onClose={() => {
          setIsQuickDeliverOpen(false);
          setQuickDeliverParcel(null);
        }}
        initialParcel={quickDeliverParcel}
        onOpenTicket={p => {
          closeSiblingSubModals();
          setTicketParcel(p);
        }}
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
        onOpenTicket={p => {
          closeSiblingSubModals();
          setTicketParcel(p);
        }}
      />

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
