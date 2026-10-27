import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Store,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  UserPlus,
  Plus,
  Coins,
  Share2,
  SlidersHorizontal,
  Package,
  Calendar,
  RotateCcw,
  MessageSquare,
  Copy,
  KeyRound,
  Search,
  QrCode,
  Clock,
  ChevronDown,
  X,
  ShieldCheck,
  ArrowRightLeft,
  Download,
  AlertTriangle,
  MessageCircle,
  Trash2,
  CheckCircle2,
  Pencil,
} from 'lucide-react';
import { Transaction, TransactionType, Parcel, Trip, Station } from '../types/database';
import { DailyFinancialReportModal } from './DailyFinancialReportModal';
import { ParcelDetailModal } from './ParcelDetailModal';
import { ParcelStickerModal } from './ParcelStickerModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { MoneyTransferModal } from './MoneyTransferModal';
import { BackupExportModal } from './BackupExportModal';
import { getDormantParcels, openWhatsAppParcelNotification } from '../utils/logisticsFeatures';

interface OwnerDashboardProps {
  onOpenNewVoucher: (initialType?: TransactionType) => void;
  onOpenNewParcel: () => void;
  onOpenLedger: () => void;
  onOpenParcels: () => void;
  onOpenSettings: () => void;
  onOpenTeamSettings?: () => void;
  onOpenCollabRoom?: () => void;
  onOpenCustomerAccounts?: () => void;
  onOpenPublicTracking?: () => void;
  onOpenGuidedTour?: () => void;
}

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  onOpenNewVoucher,
  onOpenNewParcel,
  onOpenLedger,
  onOpenParcels,
  onOpenTeamSettings,
  onOpenCollabRoom,
  onOpenCustomerAccounts,
  onOpenGuidedTour,
}) => {
  const {
    currentUser,
    currentTeam,
    currentWorkspace,
    stations,
    selectedStationId,
    setSelectedStationId,
    stationBalances,
    currencies,
    teamMembers,
    transactions,
    parcels,
    trips,
    hideAmounts,
    addBalanceAdjustment,
    addStation,
    updateStation,
    deleteStation,
    updateWorkspaceBranding,
    addWorkerByOwner,
    deleteTransaction,
    deleteParcel,
    deleteTrip,
    executeCurrencyExchange,
    convertCurrency,
    exchangeRate,
    setExchangeRate,
    showToast,
  } = useApp();

  const [showQuickExchange, setShowQuickExchange] = useState(false);
  const [exFromCurr, setExFromCurr] = useState<'MAD' | 'MRU'>('MAD');
  const [exAmountStr, setExAmountStr] = useState('1000');
  const [exRateStr, setExRateStr] = useState(() => String(exchangeRate || 3.8));
  const [exCustomerName, setExCustomerName] = useState('');
  const [isExchanging, setIsExchanging] = useState(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [selectedStationFilter, setSelectedStationFilter] = useState<string>(() => selectedStationId || 'all');

  // Keep local filter in sync with global station scope
  React.useEffect(() => {
    if (selectedStationId) {
      setSelectedStationFilter(selectedStationId);
    } else {
      setSelectedStationFilter('all');
    }
  }, [selectedStationId]);

  // Collapsible Sections
  const [isTopStationsOpen, setIsTopStationsOpen] = useState<boolean>(true);
  const [isChartSectionOpen, setIsChartSectionOpen] = useState<boolean>(false);
  const [isTreasuryDetailsOpen, setIsTreasuryDetailsOpen] = useState<boolean>(false);
  const [isWorkerOpsOpen, setIsWorkerOpsOpen] = useState<boolean>(false);
  const [visibleOpsCount, setVisibleOpsCount] = useState<number>(8);
  const [isStationsOpen, setIsStationsOpen] = useState<boolean>(false);
  const [isUnclaimedOpen, setIsUnclaimedOpen] = useState<boolean>(false);

  // Modal States
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjStationId, setAdjStationId] = useState(stations[0]?.id || '');
  const [adjCurrency, setAdjCurrency] = useState(currencies[0]?.code || 'MAD');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');

  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showMoneyTransferModal, setShowMoneyTransferModal] = useState(false);
  const [showBackupExportModal, setShowBackupExportModal] = useState(false);
  const [dormantMinDays, setDormantMinDays] = useState<number>(3);

  const [showNewStationModal, setShowNewStationModal] = useState(false);
  const [newStationName, setNewStationName] = useState('');
  const [newStationCity, setNewStationCity] = useState('');
  const [newStationCountry, setNewStationCountry] = useState<'MA' | 'MR'>('MA');
  const [newStationPhone, setNewStationPhone] = useState('');
  const [newStationCurrency, setNewStationCurrency] = useState('MAD');

  // Edit / Rename / Delete Existing Station Modal State
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editStationName, setEditStationName] = useState('');
  const [editStationCity, setEditStationCity] = useState('');
  const [editStationCountry, setEditStationCountry] = useState<'MA' | 'MR'>('MA');
  const [editStationPhone, setEditStationPhone] = useState('');
  const [editStationCurrency, setEditStationCurrency] = useState('MAD');

  // Rename Main Workspace / Agency Name Modal State
  const [showEditWorkspaceNameModal, setShowEditWorkspaceNameModal] = useState(false);
  const [workspaceNameInput, setWorkspaceNameInput] = useState('');

  const openEditStationModal = (st: Station) => {
    setEditingStation(st);
    setEditStationName(st.name || st.city || '');
    setEditStationCity(st.city || st.name || '');
    setEditStationCountry(st.country || 'MA');
    setEditStationCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    setEditStationPhone(st.phone || '');
  };

  const [showAddWorkerModal, setShowAddWorkerModal] = useState(false);
  const [workerName, setWorkerName] = useState('');
  const [workerPhone, setWorkerPhone] = useState('');
  const [workerStationId, setWorkerStationId] = useState(stations[0]?.id || '');
  const [workerRole, setWorkerRole] = useState<'worker' | 'owner'>('worker');
  const [createdWorkerCredentials, setCreatedWorkerCredentials] = useState<{
    name: string;
    phone: string;
    tempPassword: string;
  } | null>(null);

  const [selectedParcelDetail, setSelectedParcelDetail] = useState<Parcel | null>(null);
  const [selectedParcelSticker, setSelectedParcelSticker] = useState<Parcel | null>(null);
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Selected station for top Station Details inspection (null by default so it only opens when clicked)
  const [inspectedStationId, setInspectedStationId] = useState<string | null>(null);

  // Global Cash in Circulation across ALL stations (or selected station)
  const globalTotals = useMemo(() => {
    let totalMad = 0;
    let totalMru = 0;

    if (selectedStationFilter === 'all') {
      Object.values(stationBalances).forEach((bals) => {
        totalMad += bals['MAD'] || 0;
        totalMru += bals['MRU'] || 0;
      });
    } else {
      const bals = stationBalances[selectedStationFilter] || {};
      totalMad = bals['MAD'] || 0;
      totalMru = bals['MRU'] || 0;
    }

    totalMad = Math.round(totalMad * 100) / 100;
    totalMru = Math.round(totalMru * 100) / 100;
    const equivMad = Math.round((totalMad + totalMru / exchangeRate) * 100) / 100;

    return { totalMad, totalMru, equivMad };
  }, [stationBalances, exchangeRate, selectedStationFilter]);

  // Comprehensive Per-Station Analytics (Stock counts, Stock %, Cash balances, Cash %, Workers, Today's In/Out)
  const stationAnalytics = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];

    const rawList = stations.map((st) => {
      const bals = stationBalances[st.id] || {};
      const mad = Math.round((bals['MAD'] || 0) * 100) / 100;
      const mru = Math.round((bals['MRU'] || 0) * 100) / 100;
      const equivMad = Math.max(0, Math.round((mad + mru / (exchangeRate || 10)) * 100) / 100);

      // Parcels currently in station stock or linked to this station
      const registeredHere = parcels.filter(
        (p) => p.origin_station_id === st.id && p.status === 'registered'
      );
      const arrivedHere = parcels.filter(
        (p) => p.destination_station_id === st.id && p.status === 'arrived'
      );
      const incomingTransit = parcels.filter(
        (p) => p.destination_station_id === st.id && p.status === 'in_transit'
      );
      const outgoingTransit = parcels.filter(
        (p) => p.origin_station_id === st.id && p.status === 'in_transit'
      );
      const deliveredHere = parcels.filter(
        (p) =>
          (p.destination_station_id === st.id || p.origin_station_id === st.id) &&
          p.status === 'delivered'
      );
      const returningHere = parcels.filter(
        (p) =>
          (p.destination_station_id === st.id || p.origin_station_id === st.id) &&
          (p.status === 'return_in_transit' || p.status === 'returned')
      );

      // Active stock in station = registered waiting for dispatch + arrived waiting for pickup + incoming in transit
      const activeStockParcels = [
        ...registeredHere,
        ...arrivedHere,
        ...incomingTransit,
      ];
      const allStationParcels = parcels.filter(
        (p) => p.origin_station_id === st.id || p.destination_station_id === st.id
      );

      // Unpaid COD / shipping fees linked to this station
      let unpaidMad = 0;
      let unpaidMru = 0;
      allStationParcels.forEach((p) => {
        if (p.payment_status !== 'paid' && p.status !== 'cancelled') {
          const due = Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0));
          if (p.currency === 'MRU') unpaidMru += due;
          else unpaidMad += due;
        }
      });

      // Today's cash in/out for this station
      let todayInMad = 0;
      let todayOutMad = 0;
      let todayInMru = 0;
      let todayOutMru = 0;
      transactions.forEach((t) => {
        if (t.status === 'cancelled' || t.station_id !== st.id) return;
        if (!t.created_at?.startsWith(todayStr)) return;
        const isIn = ['cash_in', 'parcel_shipping_fee', 'parcel_cod_collection'].includes(t.type);
        if (t.currency === 'MRU') {
          if (isIn) todayInMru += Number(t.amount) || 0;
          else todayOutMru += Number(t.amount) || 0;
        } else {
          if (isIn) todayInMad += Number(t.amount) || 0;
          else todayOutMad += Number(t.amount) || 0;
        }
      });

      const workers = teamMembers.filter((m) => (m as any).station_id === st.id);

      return {
        station: st,
        mad,
        mru,
        equivMad,
        registeredCount: registeredHere.length,
        arrivedCount: arrivedHere.length,
        incomingTransitCount: incomingTransit.length,
        outgoingTransitCount: outgoingTransit.length,
        deliveredCount: deliveredHere.length,
        returningCount: returningHere.length,
        stockCount: activeStockParcels.length,
        totalParcelsCount: allStationParcels.length,
        recentParcels: allStationParcels.slice(0, 4),
        unpaidMad: Math.round(unpaidMad * 100) / 100,
        unpaidMru: Math.round(unpaidMru * 100) / 100,
        todayInMad: Math.round(todayInMad * 100) / 100,
        todayOutMad: Math.round(todayOutMad * 100) / 100,
        todayInMru: Math.round(todayInMru * 100) / 100,
        todayOutMru: Math.round(todayOutMru * 100) / 100,
        workers,
      };
    });

    const totalStockAll = rawList.reduce((acc, item) => acc + item.stockCount, 0);
    const totalParcelsAll = rawList.reduce((acc, item) => acc + item.totalParcelsCount, 0);
    const totalCashEquivAll = rawList.reduce((acc, item) => acc + item.equivMad, 0);

    return rawList.map((item) => {
      const stockRatio =
        totalStockAll > 0
          ? Math.round((item.stockCount / totalStockAll) * 100)
          : totalParcelsAll > 0
          ? Math.round((item.totalParcelsCount / totalParcelsAll) * 100)
          : Math.round(100 / Math.max(1, rawList.length));

      const cashRatio =
        totalCashEquivAll > 0
          ? Math.round((item.equivMad / totalCashEquivAll) * 100)
          : Math.round(100 / Math.max(1, rawList.length));

      return {
        ...item,
        stockPercent: Math.min(100, Math.max(0, stockRatio)),
        cashPercent: Math.min(100, Math.max(0, cashRatio)),
      };
    });
  }, [stations, stationBalances, parcels, transactions, teamMembers, exchangeRate]);

  const activeInspectedStation = useMemo(() => {
    if (!inspectedStationId) return null;
    return stationAnalytics.find((s) => s.station.id === inspectedStationId) || null;
  }, [stationAnalytics, inspectedStationId]);

  // 7-Day Activity Comparison Chart Data (Stock & Cash Activity across Stations)
  const chartData = useMemo(() => {
    const station1 = stations[0] || { id: 'st-1', city: 'المحطة 1', name: 'المحطة 1' };
    const station2 = stations[1] || { id: 'st-2', city: 'المحطة 2', name: 'المحطة 2' };

    const days: {
      dateStr: string;
      dayLabel: string;
      st1Count: number;
      st2Count: number;
    }[] = [];

    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayLabel = ARABIC_DAYS[d.getDay()];

      let st1Count = 0;
      let st2Count = 0;

      parcels.forEach((p) => {
        if (!p.created_at?.startsWith(dateStr)) return;
        if (p.origin_station_id === station1.id || p.destination_station_id === station1.id) {
          st1Count += 1;
        }
        if (p.origin_station_id === station2.id || p.destination_station_id === station2.id) {
          st2Count += 1;
        }
      });

      transactions.forEach((t) => {
        if (t.status === 'cancelled' || !t.created_at?.startsWith(dateStr)) return;
        if (t.station_id === station1.id) st1Count += 1;
        if (t.station_id === station2.id) st2Count += 1;
      });

      days.push({ dateStr, dayLabel, st1Count, st2Count });
    }

    const maxVal = Math.max(10, ...days.map((d) => Math.max(d.st1Count, d.st2Count)));

    return {
      station1Label: station1.city || station1.name || 'المحطة 1',
      station2Label: station2.city || station2.name || 'المحطة 2',
      days,
      maxVal,
    };
  }, [stations, parcels, transactions]);

  // Search Results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return parcels
      .filter(
        (p) =>
          p.tracking_code.toLowerCase().includes(q) ||
          String(p.parcel_number || '').includes(q) ||
          p.sender_name.toLowerCase().includes(q) ||
          p.receiver_name.toLowerCase().includes(q) ||
          p.sender_phone.includes(q) ||
          p.receiver_phone.includes(q)
      )
      .slice(0, 6);
  }, [searchQuery, parcels]);

  // Unclaimed & Returning Parcels
  const parcelAlerts = useMemo(() => {
    const thresholdDays = currentWorkspace?.unclaimed_days_threshold || 7;
    const nowMs = Date.now();
    const unclaimedList = parcels.filter((p) => {
      if (p.status !== 'arrived') return false;
      const refDate = p.arrived_at || p.updated_at || p.created_at;
      const daysDiff = Math.floor((nowMs - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff >= thresholdDays;
    });
    const returningList = parcels.filter(
      (p) => p.status === 'return_in_transit' || p.status === 'returned'
    );
    return { unclaimedList, returningList, thresholdDays };
  }, [parcels, currentWorkspace?.unclaimed_days_threshold]);

  // Combined Worker Operations Log
  const recentOperations = useMemo(() => {
    const filteredTx = transactions
      .filter((t) => selectedStationFilter === 'all' || t.station_id === selectedStationFilter)
      .map((t) => ({
        id: `tx-${t.id}`,
        kind: 'tx' as const,
        created_at: t.created_at,
        title: t.reason || t.person_name || 'سند صندوق نقدي',
        subtitle: `${t.station_name || 'المحطة'} • ${t.creator_name || 'عامل المحطة'}`,
        amount: t.amount ?? 0,
        currency: t.currency,
        isPositive: ['cash_in', 'parcel_shipping_fee', 'parcel_cod_collection'].includes(t.type),
        tx: t,
      }));

    const filteredParcels = parcels
      .filter(
        (p) =>
          selectedStationFilter === 'all' ||
          p.origin_station_id === selectedStationFilter ||
          p.destination_station_id === selectedStationFilter
      )
      .map((p) => ({
        id: `p-${p.id}`,
        kind: 'parcel' as const,
        created_at: p.created_at,
        title: `كولي #${p.parcel_number || p.tracking_code} — ${p.receiver_name}`,
        subtitle: `${p.origin_station_name || ''} ➔ ${p.destination_station_name || ''} • ${
          p.creator_name || 'عامل المحطة'
        }`,
        amount: p.amount_due ?? p.shipping_fee ?? 0,
        currency: p.currency,
        isPositive: true,
        parcel: p,
      }));

    const filteredTrips = trips
      .filter(
        (tr) =>
          selectedStationFilter === 'all' ||
          tr.origin_station_id === selectedStationFilter ||
          tr.destination_station_id === selectedStationFilter
      )
      .map((tr) => ({
        id: `tr-${tr.id}`,
        kind: 'trip' as const,
        created_at: tr.created_at,
        title: `رحلة ${tr.trip_code} — الشيفور: ${tr.driver_name} (${tr.vehicle_plate})`,
        subtitle: `${tr.origin_station_name || ''} ➔ ${tr.destination_station_name || ''} • ${
          tr.loaded_parcel_ids?.length || 0
        } كولي`,
        amount: tr.loaded_parcel_ids?.length || 0,
        currency: 'كولي',
        isPositive: true,
        trip: tr,
      }));

    return [...filteredTx, ...filteredParcels, ...filteredTrips].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [transactions, parcels, trips, selectedStationFilter]);

  // Today's Cash Flow Summary
  const todayCashStats = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    let inMad = 0;
    let outMad = 0;
    let inMru = 0;
    let outMru = 0;

    transactions.forEach((t) => {
      if (t.status === 'cancelled') return;
      if (selectedStationFilter !== 'all' && t.station_id !== selectedStationFilter) return;
      if (!t.created_at?.startsWith(todayStr)) return;
      const isIn = ['cash_in', 'parcel_shipping_fee', 'parcel_cod_collection'].includes(t.type);
      if (t.currency === 'MRU') {
        if (isIn) inMru += Number(t.amount) || 0;
        else outMru += Number(t.amount) || 0;
      } else {
        if (isIn) inMad += Number(t.amount) || 0;
        else outMad += Number(t.amount) || 0;
      }
    });

    return {
      inMad: Math.round(inMad * 100) / 100,
      outMad: Math.round(outMad * 100) / 100,
      inMru: Math.round(inMru * 100) / 100,
      outMru: Math.round(outMru * 100) / 100,
    };
  }, [transactions, selectedStationFilter]);

  const handleScanCode = (code: string) => {
    const cleaned = code.trim().toUpperCase();
    const found = parcels.find(
      (p) =>
        p.tracking_code.toUpperCase() === cleaned ||
        `#${p.parcel_number}` === cleaned ||
        String(p.parcel_number) === cleaned
    );
    setShowScanner(false);
    if (found) {
      setSelectedParcelDetail(found);
    } else {
      setSearchQuery(code.trim());
      showToast('تم وضع الرمز الممسوح في شريط البحث', 'info');
    }
  };

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(adjAmount);
    if (!amountNum || amountNum === 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }
    const res = await addBalanceAdjustment(adjStationId, adjCurrency, amountNum, adjNote);
    if (res.success) {
      setShowAdjustmentModal(false);
      setAdjAmount('');
      setAdjNote('');
    } else {
      showToast(res.error || 'فشل التعديل', 'error');
    }
  };

  const handleNewStationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationName || !newStationCity) {
      showToast('يرجى ملء جميع الحقول المطلوبة', 'error');
      return;
    }
    const res = await addStation(
      newStationName,
      newStationCity,
      newStationCountry,
      newStationPhone,
      undefined,
      newStationCurrency
    );
    if (res.success) {
      setShowNewStationModal(false);
      setNewStationName('');
      setNewStationCity('');
      setNewStationPhone('');
    }
  };

  const handleAddWorkerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim() || !workerPhone.trim()) {
      showToast('يرجى إدخال اسم ورقم هاتف الموظف', 'error');
      return;
    }
    const res = await addWorkerByOwner(
      workerName,
      workerPhone,
      workerStationId || stations[0]?.id,
      workerRole
    );
    if (res.success) {
      if (res.temporaryPassword) {
        setCreatedWorkerCredentials({
          name: workerName.trim(),
          phone: workerPhone.trim(),
          tempPassword: res.temporaryPassword,
        });
      }
      setShowAddWorkerModal(false);
      setWorkerName('');
      setWorkerPhone('');
    }
  };

  const shareInviteViaWhatsApp = () => {
    const code = currentWorkspace?.invite_code || currentTeam?.invite_code || '';
    const text = `السلام عليكم ورحمة الله، هذا رمز الانضمام لفريق إدارة "${
      currentWorkspace?.name || 'محطة الاتحادية'
    }":\nرمز الدعوة: ${code}\nافتح التطبيق واختر "الانضمام بواسطة رمز الدعوة" لبدء العمل فوراً.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const inviteCode = currentWorkspace?.invite_code || currentTeam?.invite_code || '—';

  const buildChartPoints = (key: 'st1Count' | 'st2Count') => {
    const width = 310;
    const height = 110;
    const padX = 18;
    const padY = 14;
    const stepX = (width - padX * 2) / 6;

    return chartData.days.map((d, i) => {
      const x = padX + i * stepX;
      const ratio = d[key] / chartData.maxVal;
      const y = height - padY - ratio * (height - padY * 2);
      return { x, y, val: d[key], label: d.dayLabel };
    });
  };

  const st1Points = buildChartPoints('st1Count');
  const st2Points = buildChartPoints('st2Count');

  return (
    <div className="space-y-2.5 pb-28 text-right">
      {/* ===================================================================== */}
      {/* 1. OWNER & WORKSPACE IDENTITY CARD                                    */}
      {/* ===================================================================== */}
      <div className="luxury-card rounded-[22px] p-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm sm:text-base font-black text-white truncate">
              {currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'محطة الاتحادية'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setWorkspaceNameInput(
                  currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'محطة الاتحادية'
                );
                setShowEditWorkspaceNameModal(true);
              }}
              className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/55 text-[10px] font-black text-[#F5C84C] inline-flex items-center gap-1 hover:bg-[#F5C84C]/30 cursor-pointer"
              title="تغيير اسم المحطة / الوكالة الرئيسي"
            >
              <Pencil className="w-2.5 h-2.5" />
              <span>تعديل الاسم</span>
            </button>
            <span className="px-3 py-0.5 rounded-full bg-gradient-to-r from-[#8c6d2c]/60 to-[#523d14]/70 border border-[#F5C84C]/60 text-[11px] font-black text-white shadow-sm">
              المدير
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-white/90 font-bold flex-wrap">
            <span>{currentUser?.name || 'مدير المحطة'}</span>
            <span>•</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(inviteCode);
                showToast(`تم نسخ رمز الدعوة: ${inviteCode}`, 'success');
              }}
              className="nav-tab-btn inline-flex items-center gap-1 text-[#F5C84C] hover:underline bg-transparent border-0 p-0 cursor-pointer font-mono text-xs"
              title="نسخ رمز الدعوة"
            >
              <span>رمز الدعوة : {inviteCode}</span>
              <Copy className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Left Avatar Box */}
        <div
          onClick={() => onOpenTeamSettings && onOpenTeamSettings()}
          className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F7D674] to-[#D4A238] text-[#111111] flex items-center justify-center font-black text-lg shadow-lg shrink-0 select-none cursor-pointer"
          title="إعدادات الفريق والحساب"
        >
          {(currentUser?.name || 'م').trim().charAt(0)}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 2. ROUNDED SEARCH BAR WITH QR SCANNER                                 */}
      {/* ===================================================================== */}
      <div className="space-y-2">
        <div className="luxury-card rounded-full px-3.5 py-2 flex items-center gap-2 border border-white/25">
          <Search className="w-4 h-4 text-white/80 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم الكولي، الرمز (ITT-) أو اسم المرسل/المستلم..."
            className="w-full bg-transparent text-xs text-white placeholder-white/75 focus:outline-none font-bold"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="مسح البحث"
              className="btn-cancel p-1 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="nav-tab-btn p-1.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] hover:bg-[#F5C84C]/30 transition shrink-0 cursor-pointer"
            title="مسح رمز QR للكولي"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>

        {/* Instant Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="luxury-card rounded-[22px] p-3 space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between text-[11px] text-[#F5C84C] font-black px-1">
              <span>نتائج البحث السريع ({searchResults.length})</span>
              <button
                type="button"
                onClick={onOpenParcels}
                className="nav-tab-btn text-[11px] text-white/80 underline bg-transparent border-0"
              >
                عرض الكل
              </button>
            </div>
            {searchResults.map((p) => (
              <div
                key={p.id}
                onClick={() => setSelectedParcelDetail(p)}
                className="p-2.5 rounded-xl bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-between gap-2 cursor-pointer transition"
              >
                <div className="min-w-0">
                  <div className="text-xs font-black text-white truncate">
                    <span className="text-[#F5C84C] font-mono ml-1.5">#{p.parcel_number}</span>
                    {p.sender_name} ➔ {p.receiver_name}
                  </div>
                  <div className="text-[10px] text-white/75 font-mono" dir="ltr">
                    {p.tracking_code} • {p.origin_station_name} ➔ {p.destination_station_name}
                  </div>
                </div>
                <span className="gold-pill px-2.5 py-1 text-[11px] font-mono shrink-0" dir="ltr">
                  {hideAmounts ? '••••' : p.amount_due} {p.currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 3. TOP STATIONS HUB (المحطات في الأعلى بشكل مختصر + تفاصيل بالسهم)    */}
      {/* ===================================================================== */}
      <div className="luxury-card rounded-[22px] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsTopStationsOpen((prev) => !prev)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsTopStationsOpen((prev) => !prev);
              }
            }}
            className="flex items-center gap-2 cursor-pointer select-none min-w-0 flex-1"
          >
            <Store className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3 className="text-xs sm:text-sm font-black text-white truncate">
              محطات الشبكة ({stations.length})
            </h3>
            <ChevronDown
              className={`w-4 h-4 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
                isTopStationsOpen ? 'rotate-180' : ''
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {onOpenGuidedTour && (
              <button
                type="button"
                onClick={onOpenGuidedTour}
                className="btn-cancel px-2 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer border border-[#F5C84C]/50 text-[#F5C84C]"
                title="جولة التعرف على التطبيق وإعداد المحطات والعملة والشعار"
              >
                <span>🧭 جولة الإعداد</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNewStationModal(true)}
              className="btn-gold px-2.5 py-1 rounded-xl text-[11px] font-black flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition"
            >
              <Plus className="w-3 h-3 stroke-[2.5]" />
              <span>إضافة محطة</span>
            </button>
          </div>
        </div>

        {/* Compact Interactive Stations Grid (تظهر كل محطة في سطر مختصر مع سهم صغير) */}
        {isTopStationsOpen && (
          stations.length === 0 ? (
            <div className="p-4 rounded-2xl bg-black/55 border border-dashed border-[#F5C84C]/50 text-center space-y-2 mt-1">
              <p className="text-xs font-black text-white">
                لم تقم بفتح أي محطة بعد — سمِّ محطاتك وحدد عملاتها وشعارك بنفسك!
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {onOpenGuidedTour && (
                  <button
                    type="button"
                    onClick={onOpenGuidedTour}
                    className="btn-gold px-3.5 py-2 rounded-xl text-xs font-black cursor-pointer"
                  >
                    🧭 ابدأ الإعداد التلقائي خطوة بخطوة
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNewStationModal(true)}
                  className="btn-cancel px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                >
                  + فتح محطة يدوياً
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/15">
              {stationAnalytics.map((item) => {
                const isSelected = inspectedStationId === item.station.id;
                const stCurr =
                  item.station.currency || (item.station.country === 'MR' ? 'MRU' : 'MAD');
                const stBal =
                  Math.round(((stationBalances[item.station.id] || {})[stCurr] || 0) * 100) / 100;
                return (
                  <div
                    key={item.station.id}
                    onClick={() => {
                      setInspectedStationId((prev) =>
                        prev === item.station.id ? null : item.station.id
                      );
                      setSelectedStationId(item.station.id);
                    }}
                    className={`px-2.5 py-2 rounded-xl border cursor-pointer transition flex items-center justify-between gap-1.5 ${
                      isSelected
                        ? 'bg-gradient-to-br from-[#8c6d2c]/45 to-black/80 border-[#F5C84C] shadow-[0_0_12px_rgba(245,200,76,0.25)]'
                        : 'bg-black/50 hover:bg-black/65 border-white/15'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm shrink-0">
                        {item.station.country === 'MA' ? '🇲🇦' : '🇲🇷'}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-xs font-black text-white truncate">
                          {item.station.name || item.station.city}
                        </h4>
                        <span className="text-[9px] text-white/70 font-mono block truncate" dir="ltr">
                          {hideAmounts ? '••••' : `${stBal.toLocaleString()} ${stCurr}`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditStationModal(item.station);
                        }}
                        className="p-1 rounded-md bg-black/60 border border-[#F5C84C]/40 text-[#F5C84C] hover:bg-[#F5C84C]/25 transition cursor-pointer"
                        title={`تعديل اسم أو حذف محطة ${item.station.name}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <span className="px-1.5 py-0.5 rounded-md bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C] font-mono font-black text-[10px]">
                        📦{item.stockCount}
                      </span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                          isSelected ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* Expanded Station Information Panel (only when a station is clicked) */}
        {activeInspectedStation && (
          <div className="bg-black/65 border border-[#F5C84C]/55 rounded-2xl p-3 space-y-2.5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-white/15 pb-2 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-base">
                  {activeInspectedStation.station.country === 'MA' ? '🇲🇦' : '🇲🇷'}
                </span>
                <div className="min-w-0">
                  <h4 className="text-xs font-black text-white truncate">
                    {activeInspectedStation.station.name} ({activeInspectedStation.station.city})
                  </h4>
                  <p className="text-[10px] text-white/75 font-mono" dir="ltr">
                    {activeInspectedStation.station.phone || 'بدون رقم هاتف'} •{' '}
                    {activeInspectedStation.workers.length} موظفين
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditStationModal(activeInspectedStation.station)}
                  className="btn-gold px-2 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0"
                >
                  <Pencil className="w-3 h-3" />
                  <span>تعديل الاسم</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInspectedStationId(null);
                    setSelectedStationFilter('all');
                  }}
                  className="btn-cancel px-2 py-1 rounded-xl text-[10px] font-black shrink-0"
                >
                  إغلاق ▲
                </button>
              </div>
            </div>

            {/* 1. Cash Balances & Today Flow in this Station */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-black/60 border border-[#F5C84C]/35 rounded-xl p-2 space-y-0.5">
                <span className="text-[10px] text-white/80 block font-bold">
                  صندوق الدرهم 🇲🇦
                </span>
                <div className="font-mono font-black text-xs text-[#F5C84C]" dir="ltr">
                  {hideAmounts ? '••••' : activeInspectedStation.mad.toLocaleString()} MAD
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono" dir="ltr">
                  <span className="text-emerald-400">
                    +{hideAmounts ? '••' : activeInspectedStation.todayInMad}
                  </span>
                  <span className="text-rose-400">
                    -{hideAmounts ? '••' : activeInspectedStation.todayOutMad}
                  </span>
                </div>
              </div>

              <div className="bg-black/60 border border-[#2ECC71]/35 rounded-xl p-2 space-y-0.5">
                <span className="text-[10px] text-white/80 block font-bold">
                  صندوق الأوقية 🇲🇷
                </span>
                <div className="font-mono font-black text-xs text-[#68E399]" dir="ltr">
                  {hideAmounts ? '••••' : activeInspectedStation.mru.toLocaleString()} MRU
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono" dir="ltr">
                  <span className="text-emerald-400">
                    +{hideAmounts ? '••' : activeInspectedStation.todayInMru}
                  </span>
                  <span className="text-rose-400">
                    -{hideAmounts ? '••' : activeInspectedStation.todayOutMru}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Parcel Stock Breakdown in this Station */}
            <div className="grid grid-cols-3 gap-1.5 text-center">
              <div className="bg-black/55 border border-white/15 rounded-xl p-1.5">
                <span className="text-[9px] text-white/75 block">مسجلة</span>
                <span className="text-xs font-mono font-black text-[#F5C84C]">
                  {activeInspectedStation.registeredCount}
                </span>
              </div>
              <div className="bg-black/55 border border-white/15 rounded-xl p-1.5">
                <span className="text-[9px] text-white/75 block">في الطريق</span>
                <span className="text-xs font-mono font-black text-sky-400">
                  {activeInspectedStation.incomingTransitCount}
                </span>
              </div>
              <div className="bg-black/55 border border-white/15 rounded-xl p-1.5">
                <span className="text-[9px] text-white/75 block">وصلت</span>
                <span className="text-xs font-mono font-black text-[#68E399]">
                  {activeInspectedStation.arrivedCount}
                </span>
              </div>
            </div>

            {/* 3. Assigned Station Workers & Quick Buttons */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 text-[10px]">
              <div className="truncate text-white/85">
                <span className="font-black text-[#F5C84C]">العمال: </span>
                {activeInspectedStation.workers.length === 0
                  ? 'غير معين'
                  : activeInspectedStation.workers.map((w) => w.name).join(' ، ')}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setAdjStationId(activeInspectedStation.station.id);
                    setShowAdjustmentModal(true);
                  }}
                  className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-bold"
                >
                  تسوية رصيد
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWorkerStationId(activeInspectedStation.station.id);
                    setShowAddWorkerModal(true);
                  }}
                  className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-bold"
                >
                  + موظف
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 4. COLLAPSIBLE CHART: PARCEL STOCK % & CASH LIQUIDITY COMPARISON      */}
      {/* ===================================================================== */}
      <div className="luxury-card rounded-[22px] p-3.5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsChartSectionOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsChartSectionOpen((prev) => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <span>مبيان نسبة ستوك الكوليات 📦 والسيولة المالية 💰</span>
            </h3>
            <p className="text-[10px] text-white/75 font-bold mt-0.5">
              اضغط على السهم لعرض نسب الستوك والفلوس لكل محطة ومبيان 7 أيام
            </p>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              isChartSectionOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isChartSectionOpen && (
          <div className="mt-3 pt-3 border-t border-white/15 space-y-3 animate-fadeIn">
            {/* Legend Pills: Stock % (Green) vs Cash Liquidity % (Gold) */}
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#006233]/35 border border-[#2ECC71]/50 text-[10px] font-black text-[#68E399]">
                <span className="w-2 h-2 rounded-full bg-[#2ECC71] shadow-[0_0_8px_#2ECC71]" />
                <span>نسبة ستوك الكوليات 📦</span>
              </div>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#8c6d2c]/35 border border-[#F5C84C]/55 text-[10px] font-black text-[#F5C84C]">
                <span className="w-2 h-2 rounded-full bg-[#F5C84C] shadow-[0_0_8px_#F5C84C]" />
                <span>نسبة السيولة المالية (الفلوس) 💰</span>
              </div>
            </div>

            {/* Per-Station Stock % & Cash % Visual Comparison Bars */}
            <div className="rounded-[18px] bg-black/45 border border-white/15 p-2.5 space-y-2.5">
              {stationAnalytics.map((item) => (
                <div
                  key={`chart-bar-${item.station.id}`}
                  onClick={() => setInspectedStationId(item.station.id)}
                  className="space-y-1 pb-2 last:pb-0 border-b last:border-b-0 border-white/10 cursor-pointer"
                >
                  <div className="flex items-center justify-between text-xs font-black">
                    <span className="text-white flex items-center gap-1.5">
                      <span>{item.station.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
                      <span>{item.station.name}</span>
                    </span>
                    <span className="text-[10px] text-white/75 font-mono">
                      📦 {item.stockCount} • 💰{' '}
                      {hideAmounts
                        ? '••••'
                        : selectedCurrency === 'MAD'
                        ? `${item.mad.toLocaleString()} MAD`
                        : `${item.mru.toLocaleString()} MRU`}
                    </span>
                  </div>

                  {/* Stock Ratio Bar (Green) */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#68E399] font-bold">نسبة ستوك الكوليات</span>
                      <span className="font-mono font-black text-[#68E399]">{item.stockPercent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#4ADE80] to-[#16A34A] shadow-[0_0_10px_#4ADE80] transition-all duration-300"
                        style={{ width: `${Math.max(6, item.stockPercent)}%` }}
                      />
                    </div>
                  </div>

                  {/* Cash Liquidity Ratio Bar (Gold) */}
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-[#F5C84C] font-bold">نسبة السيولة المالية (الفلوس)</span>
                      <span className="font-mono font-black text-[#F5C84C]">{item.cashPercent}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-l from-[#F7D674] to-[#D4A238] shadow-[0_0_10px_#F5C84C] transition-all duration-300"
                        style={{ width: `${Math.max(6, item.cashPercent)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 7-Day SVG Line Chart Container */}
            <div className="rounded-[18px] bg-black/35 border border-white/15 p-2.5 pt-3">
              <div className="flex items-center justify-between px-2 pb-1 text-[10px] text-white/80 font-bold">
                <span>حركة الكوليات والعمليات اليومية (7 أيام)</span>
                <span className="font-mono text-[#F5C84C]">
                  {chartData.station1Label} vs {chartData.station2Label}
                </span>
              </div>
              <svg viewBox="0 0 310 135" className="w-full h-auto overflow-visible">
                <defs>
                  <filter id="glowGreen" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glowGold" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.5" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {[22, 50, 78, 96].map((yPos) => (
                  <line
                    key={yPos}
                    x1="12"
                    y1={yPos}
                    x2="298"
                    y2={yPos}
                    stroke="rgba(255,255,255,0.10)"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                ))}

                <polyline
                  fill="none"
                  stroke="#4ADE80"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glowGreen)"
                  points={st1Points.map((p) => `${p.x},${p.y}`).join(' ')}
                />

                <polyline
                  fill="none"
                  stroke="#F5C84C"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#glowGold)"
                  points={st2Points.map((p) => `${p.x},${p.y}`).join(' ')}
                />

                {st1Points.map((p, idx) => (
                  <circle
                    key={`s1-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r="3.2"
                    fill="#FFFFFF"
                    stroke="#4ADE80"
                    strokeWidth="2"
                  />
                ))}

                {st2Points.map((p, idx) => (
                  <circle
                    key={`s2-${idx}`}
                    cx={p.x}
                    cy={p.y}
                    r="3.2"
                    fill="#FFFFFF"
                    stroke="#F5C84C"
                    strokeWidth="2"
                  />
                ))}

                {st1Points.map((p, idx) => (
                  <text
                    key={`lbl-${idx}`}
                    x={p.x}
                    y="124"
                    textAnchor="middle"
                    fill="#FFFFFF"
                    fontSize="9.5"
                    fontWeight="700"
                  >
                    {p.label}
                  </text>
                ))}
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 5. TREASURY & QUICK EXECUTIVE ACTIONS CARD (مختصر بالسهم)             */}
      {/* ===================================================================== */}
      <div className="luxury-card rounded-[22px] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#F5C84C]" />
            <h3 className="text-xs sm:text-sm font-black text-white">صناديق المحطات والسيولة</h3>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowDailyReport(true)}
              className="px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 cursor-pointer"
            >
              <Calendar className="w-3 h-3" />
              <span>إقفال اليومية</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTreasuryDetailsOpen((prev) => !prev)}
              className="btn-cancel px-2 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 cursor-pointer"
              title="إظهار أو إخفاء تفاصيل اليومية والأدوات الإضافية"
            >
              <span>المزيد</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                  isTreasuryDetailsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>
        </div>

        {/* Dual Treasury Cards (Always Visible & Compact) */}
        <div className="grid grid-cols-2 gap-2">
          <div
            onClick={onOpenLedger}
            className={`p-2.5 rounded-xl border cursor-pointer transition ${
              selectedCurrency === 'MAD'
                ? 'bg-black/65 border-[#F5C84C]/65'
                : 'bg-black/45 border-white/15'
            }`}
          >
            <span className="text-[10px] font-bold text-white/80 block">
              صندوق الدرهم 🇲🇦
            </span>
            <div className="text-sm sm:text-base font-black font-mono text-[#F5C84C] mt-0.5" dir="ltr">
              {hideAmounts ? '••••••' : globalTotals.totalMad.toLocaleString()}{' '}
              <span className="text-[10px] text-white">MAD</span>
            </div>
          </div>

          <div
            onClick={onOpenLedger}
            className={`p-2.5 rounded-xl border cursor-pointer transition ${
              selectedCurrency === 'MRU'
                ? 'bg-black/65 border-[#F5C84C]/65'
                : 'bg-black/45 border-white/15'
            }`}
          >
            <span className="text-[10px] font-bold text-white/80 block">
              صندوق الأوقية 🇲🇷
            </span>
            <div className="text-sm sm:text-base font-black font-mono text-[#F5C84C] mt-0.5" dir="ltr">
              {hideAmounts ? '••••••' : globalTotals.totalMru.toLocaleString()}{' '}
              <span className="text-[10px] text-white">MRU</span>
            </div>
          </div>
        </div>

        {/* Primary Cashbox (+ / -), Remittance, Exchange & Parcel Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => onOpenNewVoucher('cash_in')}
            className="btn-gold flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
          >
            <span className="text-sm font-black leading-none">+</span>
            <span>زيادة فلاكيس</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenNewVoucher('cash_out')}
            className="btn-delete flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
          >
            <span className="text-sm font-black leading-none">−</span>
            <span>سحب من لاكيس</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMoneyTransferModal(true)}
            className="btn-cancel flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-black border border-[#F5C84C]/45 text-[#F5C84C] transition active:scale-95 cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 shrink-0" />
            <span>إرسال/استقبال حوالة</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setExRateStr(String(exchangeRate || 3.8));
              setShowQuickExchange(prev => !prev);
            }}
            className={`flex items-center justify-center gap-1 py-2 px-2.5 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer ${
              showQuickExchange ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#2ECC71] shrink-0" />
            <span>صرف العملة 💱</span>
          </button>
        </div>

        {/* Quick Inline Currency Exchange Panel (درهم ⇄ أوقية) */}
        {showQuickExchange && (
          <div className="p-3 rounded-2xl bg-black/65 border border-[#F5C84C]/55 space-y-2.5 animate-fadeIn text-xs">
            <div className="flex items-center justify-between border-b border-white/15 pb-1.5">
              <span className="font-black text-[#F5C84C] flex items-center gap-1.5">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>صرف العملة فلاكيس (بين الدرهم MAD والأوقية MRU)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowQuickExchange(false)}
                className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-bold"
              >
                إغلاق ▲
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExFromCurr('MAD')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition ${
                  exFromCurr === 'MAD' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                🇲🇦 درهم ➔ 🇲🇷 أوقية (+MAD / -MRU)
              </button>
              <button
                type="button"
                onClick={() => setExFromCurr('MRU')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black transition ${
                  exFromCurr === 'MRU' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                🇲🇷 أوقية ➔ 🇲🇦 درهم (+MRU / -MAD)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-950/35 p-2 rounded-xl border border-emerald-500/40">
                <label className="block text-[10px] text-emerald-300 font-bold mb-1">
                  + المستلم فلاكيس ({exFromCurr}):
                </label>
                <input
                  type="number"
                  value={exAmountStr}
                  onChange={e => setExAmountStr(e.target.value)}
                  className="w-full bg-black/70 border border-emerald-500/40 rounded-lg px-2 py-1 text-white font-mono font-black text-xs"
                />
              </div>

              <div className="bg-rose-950/35 p-2 rounded-xl border border-rose-500/40 flex flex-col justify-between">
                <span className="text-[10px] text-rose-300 font-bold block">
                  − المسلّم للزبون ({exFromCurr === 'MAD' ? 'MRU' : 'MAD'}):
                </span>
                <span className="font-mono font-black text-sm text-[#F5C84C]" dir="ltr">
                  {convertCurrency(
                    parseFloat(exAmountStr) || 0,
                    exFromCurr,
                    exFromCurr === 'MAD' ? 'MRU' : 'MAD'
                  )}{' '}
                  {exFromCurr === 'MAD' ? 'MRU' : 'MAD'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 items-center">
              <div className="flex items-center gap-1 bg-black/60 p-1.5 rounded-xl border border-white/15">
                <span className="text-[10px] text-white/80 shrink-0">السعر:</span>
                <input
                  type="number"
                  step="0.01"
                  dir="ltr"
                  value={exRateStr}
                  onChange={e => {
                    setExRateStr(e.target.value);
                    const n = parseFloat(e.target.value);
                    if (!isNaN(n) && n > 0) setExchangeRate(n);
                  }}
                  className="w-full bg-black/80 border border-[#F5C84C]/50 rounded-lg px-2 py-1 text-center font-mono font-black text-white text-xs"
                />
              </div>
              <input
                type="text"
                placeholder="اسم الزبون (اختياري)"
                value={exCustomerName}
                onChange={e => setExCustomerName(e.target.value)}
                className="bg-black/60 border border-white/15 rounded-xl px-2.5 py-1.5 text-white text-xs focus:outline-none focus:border-[#F5C84C]"
              />
            </div>

            <button
              type="button"
              disabled={isExchanging || stations.length === 0}
              onClick={async () => {
                const targetStId =
                  (selectedStationFilter !== 'all' ? selectedStationFilter : selectedStationId) ||
                  stations[0]?.id ||
                  '';
                const fromAmt = parseFloat(exAmountStr) || 0;
                const toCurr = exFromCurr === 'MAD' ? 'MRU' : 'MAD';
                const toAmt = convertCurrency(fromAmt, exFromCurr, toCurr);
                if (!targetStId || fromAmt <= 0 || toAmt <= 0) {
                  showToast('يرجى تحديد محطة وإدخال مبلغ صحيح للصرف', 'error');
                  return;
                }
                setIsExchanging(true);
                try {
                  const res = await executeCurrencyExchange({
                    stationId: targetStId,
                    fromCurrency: exFromCurr,
                    toCurrency: toCurr,
                    fromAmount: fromAmt,
                    toAmount: toAmt,
                    rate: exchangeRate,
                    customerName: exCustomerName,
                  });
                  if (res.success) {
                    setExCustomerName('');
                    setShowQuickExchange(false);
                  }
                } finally {
                  setIsExchanging(false);
                }
              }}
              className="btn-gold w-full py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isExchanging
                  ? 'جاري تسجيل الصرف...'
                  : `تأكيد وتسجيل الصرف فلاكيس (+${parseFloat(exAmountStr) || 0} ${exFromCurr} / -${convertCurrency(
                      parseFloat(exAmountStr) || 0,
                      exFromCurr,
                      exFromCurr === 'MAD' ? 'MRU' : 'MAD'
                    )} ${exFromCurr === 'MAD' ? 'MRU' : 'MAD'})`}
              </span>
            </button>
          </div>
        )}

        {/* Collapsible Extra Treasury Details & Tools (تفتح بالسهم الصغير) */}
        {isTreasuryDetailsOpen && (
          <div className="pt-2.5 border-t border-white/15 space-y-2.5 animate-fadeIn">
            {/* Station Filter Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              <button
                type="button"
                onClick={() => setSelectedStationFilter('all')}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0 cursor-pointer ${
                  selectedStationFilter === 'all' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                كل المحطات ({stations.length})
              </button>
              {stations.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStationFilter(st.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-black shrink-0 cursor-pointer ${
                    selectedStationFilter === st.id ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  {st.city}
                </button>
              ))}
            </div>

            {/* Today's Cash In / Out */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/50 border border-emerald-500/35 rounded-xl p-2">
                <div className="flex items-center justify-between text-emerald-400 text-[10px] font-bold mb-0.5">
                  <span>مقبوضات اليوم (داخل)</span>
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                </div>
                <div className="font-mono font-black text-xs text-white" dir="ltr">
                  {hideAmounts
                    ? '••••'
                    : selectedCurrency === 'MAD'
                    ? `+${todayCashStats.inMad.toLocaleString()} MAD`
                    : `+${todayCashStats.inMru.toLocaleString()} MRU`}
                </div>
              </div>

              <div className="bg-black/50 border border-rose-500/35 rounded-xl p-2">
                <div className="flex items-center justify-between text-rose-400 text-[10px] font-bold mb-0.5">
                  <span>مصروفات اليوم (خارج)</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
                <div className="font-mono font-black text-xs text-white" dir="ltr">
                  {hideAmounts
                    ? '••••'
                    : selectedCurrency === 'MAD'
                    ? `-${todayCashStats.outMad.toLocaleString()} MAD`
                    : `-${todayCashStats.outMru.toLocaleString()} MRU`}
                </div>
              </div>
            </div>

            {/* Secondary Executive Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowMoneyTransferModal(true)}
                className="btn-gold flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>حوالة مالية / أمانة 💸</span>
              </button>

              <button
                type="button"
                onClick={() => setShowBackupExportModal(true)}
                className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black border border-emerald-500/45 text-emerald-300 transition active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>تصدير Excel / PDF 📊</span>
              </button>

              {onOpenCustomerAccounts && (
                <button
                  type="button"
                  onClick={onOpenCustomerAccounts}
                  className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>الحسابات والديون</span>
                </button>
              )}

              {onOpenCollabRoom && (
                <button
                  type="button"
                  onClick={onOpenCollabRoom}
                  className="btn-cancel flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>غرف الشراكة</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 5. COLLAPSIBLE: WORKERS OPERATIONS LOG (سجل عمليات العمال)             */}
      {/* ===================================================================== */}
      <div className="luxury-card rounded-[24px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsWorkerOpsOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsWorkerOpsOpen((prev) => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#F5C84C] shrink-0" />
            <h3 className="text-sm font-black text-white">
              سجل عمليات العمال ({recentOperations.length})
            </h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              isWorkerOpsOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isWorkerOpsOpen && (
          <div className="mt-3.5 pt-3 border-t border-white/15 space-y-2.5">
            {recentOperations.length === 0 ? (
              <div className="py-5 text-center text-xs text-white/75">
                لا توجد عمليات مسجلة حالياً.
              </div>
            ) : (
              <>
                {recentOperations.slice(0, visibleOpsCount).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (item.kind === 'parcel' && item.parcel) {
                        setSelectedParcelDetail(item.parcel);
                      } else if (item.kind === 'tx' && item.tx) {
                        setSelectedTxDetail(item.tx);
                      }
                    }}
                    className="p-3 rounded-2xl bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-between gap-2 cursor-pointer transition"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-white truncate">{item.title}</p>
                      <p className="text-[10px] text-white/75 mt-0.5 truncate">{item.subtitle}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-xs font-mono font-black border ${
                          item.kind === 'tx'
                            ? item.isPositive
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                            : 'gold-pill'
                        }`}
                        dir="ltr"
                      >
                        {hideAmounts
                          ? '••••'
                          : item.kind === 'tx'
                          ? `${item.isPositive ? '+' : '-'}${item.amount.toLocaleString()}`
                          : item.amount.toLocaleString()}{' '}
                        {item.currency}
                      </span>

                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (item.kind === 'tx' && item.tx) {
                            await deleteTransaction(item.tx.id);
                          } else if (item.kind === 'parcel' && item.parcel) {
                            await deleteParcel(item.parcel.id);
                          } else if (item.kind === 'trip' && item.trip) {
                            await deleteTrip(item.trip.id);
                          }
                        }}
                        title="حذف هذه العملية من السجل والنظام (للمدير فقط)"
                        className="btn-delete p-1.5 rounded-lg transition active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}

                {recentOperations.length > visibleOpsCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleOpsCount((prev) => prev + 10)}
                    className="btn-cancel w-full py-2 rounded-xl text-xs font-black"
                  >
                    عرض المزيد ({recentOperations.length - visibleOpsCount} متبقية)
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 6. COLLAPSIBLE: STATIONS & TEAM MANAGEMENT (إدارة المحطات والعمال)    */}
      {/* ===================================================================== */}
      <div className="luxury-card rounded-[24px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsStationsOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsStationsOpen((prev) => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-[#F5C84C] shrink-0" />
            <h3 className="text-sm font-black text-white">
              إدارة المحطات وفريق العمل ({stations.length} محطات • {teamMembers.length} أعضاء)
            </h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              isStationsOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isStationsOpen && (
          <div className="mt-3.5 pt-3 border-t border-white/15 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowAdjustmentModal(true)}
                className="btn-cancel py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>تسوية رصيد</span>
              </button>
              <button
                type="button"
                onClick={() => setShowNewStationModal(true)}
                className="py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة محطة</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddWorkerModal(true)}
                className="py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>إضافة موظف</span>
              </button>
              <button
                type="button"
                onClick={shareInviteViaWhatsApp}
                className="btn-cancel py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>مشاركة الرمز</span>
              </button>
            </div>

            <div className="space-y-2">
              {stations.map((station) => {
                const bals = stationBalances[station.id] || {};
                const stMad = bals['MAD'] || 0;
                const stMru = bals['MRU'] || 0;
                return (
                  <div
                    key={station.id}
                    className="bg-black/50 border border-white/15 rounded-2xl p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{station.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
                        <div className="min-w-0">
                          <h4 className="text-xs font-black text-white truncate">{station.name}</h4>
                          <p className="text-[10px] text-white/75 truncate">{station.city}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditStationModal(station)}
                          className="px-2 py-1 rounded-lg bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] text-[10px] font-black flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>تعديل الاسم</span>
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteStation(station.id);
                          }}
                          className="btn-delete p-1.5 rounded-lg text-[10px] font-black cursor-pointer"
                          title="حذف هذه المحطة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-black/60 p-2 rounded-xl border border-white/10">
                        <span className="text-[10px] text-white/75 block">صندوق الدرهم</span>
                        <span className="font-mono font-black text-[#F5C84C]" dir="ltr">
                          {hideAmounts ? '••••' : stMad.toLocaleString()} MAD
                        </span>
                      </div>
                      <div className="bg-black/60 p-2 rounded-xl border border-white/10">
                        <span className="text-[10px] text-white/75 block">صندوق الأوقية</span>
                        <span className="font-mono font-black text-[#F5C84C]" dir="ltr">
                          {hideAmounts ? '••••' : stMru.toLocaleString()} MRU
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 7. DORMANT STOCK ALERTS (تنبيهات الكوليات المتأخرة فالمحطة)             */}
      {/* ===================================================================== */}
      {(() => {
        const dormantItems = getDormantParcels(parcels, dormantMinDays);
        return (
          <div className="luxury-card rounded-[24px] p-4 border border-rose-500/40 space-y-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setIsUnclaimedOpen((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsUnclaimedOpen((prev) => !prev);
                }
              }}
              className="flex items-center justify-between gap-2 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
                <div>
                  <h3 className="text-sm font-black text-white">
                    تنبيهات الكوليات المتأخرة فالمحطة (Stock Dormant)
                  </h3>
                  <p className="text-[10px] text-white/75">
                    {dormantItems.length} كولي متأخرة (أكثر من {dormantMinDays} أيام) •{' '}
                    {parcelAlerts.returningList.length} قيد الإرجاع
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
                  isUnclaimedOpen ? 'rotate-180' : ''
                }`}
              />
            </div>

            {isUnclaimedOpen && (
              <div className="pt-3 border-t border-white/15 space-y-2.5 animate-fadeIn">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[10px] font-bold text-white/75">فلتر مدة التأخير:</span>
                  <div className="flex items-center gap-1">
                    {[1, 3, 5, 7].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDormantMinDays(d)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                          dormantMinDays === d ? 'btn-gold' : 'btn-cancel'
                        }`}
                      >
                        +{d} أيام
                      </button>
                    ))}
                  </div>
                </div>

                {dormantItems.length === 0 ? (
                  <div className="p-3 rounded-xl bg-black/45 border border-white/10 text-center text-xs text-emerald-300 font-bold">
                    ✓ ممتاز! لا توجد كوليات متأخرة في المحطات لأكثر من {dormantMinDays} أيام
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dormantItems.map(({ parcel: p, daysWaiting }) => (
                      <div
                        key={p.id}
                        className="p-2.5 rounded-xl bg-rose-950/35 border border-rose-500/40 flex items-center justify-between gap-2 text-xs"
                      >
                        <div
                          onClick={() => setSelectedParcelDetail(p)}
                          className="cursor-pointer min-w-0 flex-1"
                        >
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono font-black text-[#F5C84C]">
                              #{p.parcel_number}
                            </span>
                            <span className="font-bold text-white truncate">{p.receiver_name}</span>
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/25 border border-rose-500/50 text-rose-200 text-[9px] font-black">
                              ⏰ متأخر {daysWaiting} يوم
                            </span>
                          </div>
                          <span className="text-[10px] text-white/70 block mt-0.5">
                            المحطة: {p.destination_station_name || p.origin_station_name} •{' '}
                            {p.description}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              openWhatsAppParcelNotification(
                                p,
                                'dormant_reminder',
                                currentWorkspace?.custom_brand_name || currentWorkspace?.name,
                                daysWaiting
                              )
                            }
                            className="btn-gold px-2.5 py-1.5 rounded-xl text-[10px] font-black flex items-center gap-1"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>تذكير واتساب</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedParcelDetail(p)}
                            className="btn-cancel px-2 py-1.5 rounded-xl text-[10px] font-bold"
                          >
                            إدارة
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Adjustment Modal */}
      {showAdjustmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-bold text-white">تسوية محاسبية لصندوق المحطة</h3>
              <button
                type="button"
                onClick={() => setShowAdjustmentModal(false)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/90 font-bold block mb-1">المحطة:</label>
                <select
                  value={adjStationId}
                  onChange={(e) => setAdjStationId(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-bold"
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">العملة:</label>
                <select
                  value={adjCurrency}
                  onChange={(e) => setAdjCurrency(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-bold"
                >
                  <option value="MAD">درهم مغربي (MAD)</option>
                  <option value="MRU">أوقية موريتانية (MRU)</option>
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">
                  المبلغ (موجب للإضافة وسالب للخصم):
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="مثال: 5000 أو -200"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">بيان التسوية / الملاحظة:</label>
                <input
                  type="text"
                  required
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder="مثال: تغذية الصندوق برصيد نقدي من الإدارة"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  className="btn-cancel px-4 py-2 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black">
                  تأكيد التسوية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Station Modal */}
      {showNewStationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-bold text-white">إضافة محطة نقل دولية جديدة</h3>
              <button
                type="button"
                onClick={() => setShowNewStationModal(false)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleNewStationSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/90 font-bold block mb-1">اسم المحطة:</label>
                <input
                  type="text"
                  required
                  value={newStationName}
                  onChange={(e) => setNewStationName(e.target.value)}
                  placeholder="مثال: محطة العيون - المسيرة"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">المدينة:</label>
                <input
                  type="text"
                  required
                  value={newStationCity}
                  onChange={(e) => setNewStationCity(e.target.value)}
                  placeholder="مثال: العيون"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">الدولة:</label>
                <select
                  value={newStationCountry}
                  onChange={(e) => {
                    const c = e.target.value as 'MA' | 'MR';
                    setNewStationCountry(c);
                    setNewStationCurrency(c === 'MR' ? 'MRU' : 'MAD');
                  }}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-bold"
                >
                  <option value="MA">المملكة المغربية 🇲🇦</option>
                  <option value="MR">الجمهورية الإسلامية الموريتانية 🇲🇷</option>
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">العملة الأساسية للمحطة:</label>
                <select
                  value={newStationCurrency}
                  onChange={(e) => setNewStationCurrency(e.target.value)}
                  className="w-full bg-black/60 border border-[#F5C84C]/40 rounded-xl px-3 py-2 text-white font-bold"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label_ar} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">
                  رقم الهاتف للتواصل (اختياري):
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={newStationPhone}
                  onChange={(e) => setNewStationPhone(e.target.value)}
                  placeholder="+212 528 000 000"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white text-right font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewStationModal(false)}
                  className="btn-cancel px-4 py-2 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black">
                  إضافة المحطة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Rename / Delete Existing Station Modal */}
      {editingStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fadeIn">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right border border-[#F5C84C]/50">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-[#F5C84C]" />
                <span>تعديل اسم وبيانات المحطة</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStation(null)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!editStationName.trim()) {
                  showToast('يرجى إدخال اسم المحطة', 'error');
                  return;
                }
                const res = await updateStation(editingStation.id, {
                  name: editStationName.trim(),
                  city: editStationCity.trim() || editStationName.trim(),
                  country: editStationCountry,
                  currency: editStationCurrency,
                  phone: editStationPhone.trim(),
                });
                if (res.success) {
                  setEditingStation(null);
                }
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-white/90 font-bold block mb-1">اسم المحطة الجديد *</label>
                <input
                  type="text"
                  required
                  value={editStationName}
                  onChange={(e) => setEditStationName(e.target.value)}
                  placeholder="مثال: محطة الداخلة أو محطة نواكشوط"
                  className="w-full bg-black/60 border border-[#F5C84C]/50 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">المدينة *</label>
                <input
                  type="text"
                  required
                  value={editStationCity}
                  onChange={(e) => setEditStationCity(e.target.value)}
                  placeholder="مثال: الداخلة"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">الدولة:</label>
                <select
                  value={editStationCountry}
                  onChange={(e) => {
                    const c = e.target.value as 'MA' | 'MR';
                    setEditStationCountry(c);
                    setEditStationCurrency(c === 'MR' ? 'MRU' : 'MAD');
                  }}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-bold"
                >
                  <option value="MA">المملكة المغربية 🇲🇦</option>
                  <option value="MR">الجمهورية الإسلامية الموريتانية 🇲🇷</option>
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">العملة الأساسية للمحطة:</label>
                <select
                  value={editStationCurrency}
                  onChange={(e) => setEditStationCurrency(e.target.value)}
                  className="w-full bg-black/60 border border-[#F5C84C]/40 rounded-xl px-3 py-2 text-white font-bold"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label_ar} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">رقم الهاتف للتواصل (اختياري):</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={editStationPhone}
                  onChange={(e) => setEditStationPhone(e.target.value)}
                  placeholder="+212 528 000 000"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white text-right font-mono"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15">
                <button
                  type="button"
                  onClick={async () => {
                    const idToDelete = editingStation.id;
                    setEditingStation(null);
                    if (inspectedStationId === idToDelete) setInspectedStationId(null);
                    await deleteStation(idToDelete);
                  }}
                  className="btn-delete px-3 py-2 rounded-xl font-black flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف المحطة</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingStation(null)}
                    className="btn-cancel px-3.5 py-2 rounded-xl font-bold"
                  >
                    إلغاء
                  </button>
                  <button type="submit" className="btn-gold px-4 py-2 rounded-xl font-black">
                    حفظ التعديل
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Main Workspace / Agency Title Modal */}
      {showEditWorkspaceNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fadeIn">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right border border-[#F5C84C]/50">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-[#F5C84C]" />
                <span>تغيير اسم الوكالة / المحطة الرئيسي</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowEditWorkspaceNameModal(false)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!workspaceNameInput.trim()) return;
                await updateWorkspaceBranding({
                  customBrandName: workspaceNameInput.trim(),
                  customBrandPhone: currentWorkspace?.custom_brand_phone || currentUser?.phone || '',
                  customBrandLogoUrl: currentWorkspace?.custom_brand_logo_url || '',
                });
                setShowEditWorkspaceNameModal(false);
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="text-white/90 font-bold block mb-1">
                  اسم الوكالة / المحطة (يظهر في الأعلى وعلى البونات والملصقات):
                </label>
                <input
                  type="text"
                  required
                  value={workspaceNameInput}
                  onChange={(e) => setWorkspaceNameInput(e.target.value)}
                  placeholder="مثال: محطة الاتحادية للنقل"
                  className="w-full bg-black/60 border border-[#F5C84C]/50 rounded-xl px-3 py-2.5 text-white font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditWorkspaceNameModal(false)}
                  className="btn-cancel px-4 py-2 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button type="submit" className="btn-gold px-5 py-2 rounded-xl font-black">
                  حفظ الاسم الجديد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Worker Modal */}
      {showAddWorkerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#F5C84C]" />
                <span>إضافة موظف جديد وتعيينه بالمحطة</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddWorkerModal(false)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddWorkerSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/90 font-bold block mb-1">اسم الموظف الكامل *</label>
                <input
                  type="text"
                  required
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  placeholder="مثال: إبراهيم الصحراوي أو محمد الأمين"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">رقم هاتف الموظف *</label>
                <input
                  type="tel"
                  required
                  dir="ltr"
                  value={workerPhone}
                  onChange={(e) => setWorkerPhone(e.target.value)}
                  placeholder="+212 600 000 000 أو +222 40 00 00 00"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white text-right font-mono"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">محطة العمل المعين بها *</label>
                <select
                  value={workerStationId}
                  onChange={(e) => setWorkerStationId(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-bold"
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">الصلاحية *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWorkerRole('worker')}
                    className={`p-2 rounded-xl border text-center transition font-bold ${
                      workerRole === 'worker' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    💼 موظف محطة
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkerRole('owner')}
                    className={`p-2 rounded-xl border text-center transition font-bold ${
                      workerRole === 'owner' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    👑 مدير فرعي
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/15">
                <button
                  type="button"
                  onClick={() => setShowAddWorkerModal(false)}
                  className="btn-cancel px-4 py-2 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button type="submit" className="px-5 py-2 rounded-xl font-black">
                  حفظ وتعيين الموظف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Temporary Worker Credentials Modal */}
      {createdWorkerCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-[#F5C84C]" />
                <span>كلمة المرور المؤقتة للموظف</span>
              </h3>
              <button
                type="button"
                onClick={() => setCreatedWorkerCredentials(null)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/85">
              تم إنشاء حساب <strong className="text-white">{createdWorkerCredentials.name}</strong>{' '}
              بنجاح. شارك معه كلمة المرور المؤقتة (تظهر لمرة واحدة فقط وسيُطلب منه تغييرها فور أول
              دخول):
            </p>
            <div className="bg-black/60 border border-[#F5C84C]/50 rounded-2xl p-3 text-center space-y-1">
              <div className="text-[11px] text-white/80">
                رقم الهاتف:{' '}
                <span className="font-mono text-white" dir="ltr">
                  {createdWorkerCredentials.phone}
                </span>
              </div>
              <div className="text-xl font-black font-mono text-[#F5C84C] tracking-widest" dir="ltr">
                {createdWorkerCredentials.tempPassword}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(createdWorkerCredentials.tempPassword);
                  showToast('تم نسخ كلمة المرور المؤقتة', 'success');
                }}
                className="btn-cancel py-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>نسخ الرمز</span>
              </button>
              <a
                href={`https://wa.me/${createdWorkerCredentials.phone.replace(
                  /[^0-9]/g,
                  ''
                )}?text=${encodeURIComponent(
                  `مرحباً ${createdWorkerCredentials.name}، تم تفعيل حسابك في محطة الاتحادية.\nرقم الدخول: ${createdWorkerCredentials.phone}\nكلمة المرور المؤقتة: ${createdWorkerCredentials.tempPassword}\n(يرجى تغييرها فور تسجيل الدخول)`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="btn-gold py-2.5 rounded-xl font-black flex items-center justify-center gap-1.5"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>إرسال واتساب</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showScanner}
        title="مسح رمز الكولي (QR)"
        subtitle="وجّه الكاميرا نحو ملصق الكولي لفتح تفاصيله مباشرة"
        onClose={() => setShowScanner(false)}
        onScan={handleScanCode}
      />

      {/* Parcel Detail Modal */}
      <ParcelDetailModal
        parcel={selectedParcelDetail}
        isOpen={Boolean(selectedParcelDetail)}
        onClose={() => setSelectedParcelDetail(null)}
        onOpenTicket={(parcel) => {
          setSelectedParcelDetail(null);
          setSelectedParcelSticker(parcel);
        }}
      />

      {/* Parcel Sticker Modal */}
      {selectedParcelSticker && (
        <ParcelStickerModal
          parcel={selectedParcelSticker}
          isOpen={Boolean(selectedParcelSticker)}
          onClose={() => setSelectedParcelSticker(null)}
        />
      )}

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        isOpen={Boolean(selectedTxDetail)}
        transaction={selectedTxDetail}
        onClose={() => setSelectedTxDetail(null)}
      />

      {/* Daily Financial Report Modal */}
      <DailyFinancialReportModal
        isOpen={showDailyReport}
        onClose={() => setShowDailyReport(false)}
      />

      {/* Money Transfer / Hawala Modal */}
      <MoneyTransferModal
        isOpen={showMoneyTransferModal}
        onClose={() => setShowMoneyTransferModal(false)}
      />

      {/* Comprehensive Excel / PDF Export & Backup Modal */}
      <BackupExportModal
        isOpen={showBackupExportModal}
        onClose={() => setShowBackupExportModal(false)}
      />
    </div>
  );
};
