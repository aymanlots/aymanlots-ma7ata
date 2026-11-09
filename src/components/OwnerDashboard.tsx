import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, TransactionType, MoneyTransfer } from '../types/database';
import {
  Wallet,
  Package,
  Plus,
  Search,
  CheckCircle2,
  Eye,
  Clock,
  Store,
  QrCode,
  Banknote,
  Trash2,
  ArrowLeftRight,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  X,
  Crown,
  Users,
  User,
} from 'lucide-react';
import { NewVoucherModal } from './NewVoucherModal';
import { MoneyTransferModal } from './MoneyTransferModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ParcelDetailModal } from './ParcelDetailModal';
import { HelpPopover } from './HelpPopover';
import { CurrencyExchangeModal } from './CurrencyExchangeModal';
import {
  formatDateTimeStandard,
  formatTrackingCodeNumeric,
  matchesTrackingCode,
  validateParcelScanOwnership,
} from '../utils/logisticsFeatures';

interface OwnerDashboardProps {
  onNavigateToParcel?: (parcelId: string) => void;
  onNavigateToNewParcel?: () => void;
  onNavigateToView?: (view: 'dashboard' | 'parcels' | 'cash' | 'audit' | 'settings') => void;
  onOpenScanner?: () => void;
  onOpenNewVoucher?: (type?: TransactionType) => void;
  onOpenNewParcel?: () => void;
  onOpenLedger?: () => void;
  onOpenParcels?: () => void;
  onOpenSettings?: () => void;
  onOpenTeamSettings?: () => void;
  onOpenCollabRoom?: () => void;
  onOpenCustomerAccounts?: () => void;
  onOpenPublicTracking?: () => void;
  onOpenGuidedTour?: () => void;
  onOpenPlatformOwner?: () => void;
}

export const OwnerDashboard: React.FC<OwnerDashboardProps> = ({
  onNavigateToParcel,
  onNavigateToNewParcel,
  onNavigateToView,
  onOpenScanner,
  onOpenNewParcel,
  onOpenLedger,
  onOpenParcels,
  onOpenSettings,
  onOpenTeamSettings,
  onOpenPlatformOwner,
}) => {
  const {
    currentWorkspace,
    userRole,
    stations,
    selectedStationId,
    setSelectedStationId,
    workspaceMembers,
    stationBalances,
    currencies,
    transactions,
    auditLogs,
    deleteTransaction,
    moneyTransfers,
    payoutMoneyTransfer,
    parcels,
    formatAmount,
    showToast,
    t,
  } = useApp();

  const isOwner = userRole === 'owner' || userRole === 'admin' || userRole === 'platform_owner';
  const isAllStations = selectedStationId === 'all' || !selectedStationId;
  const activeStation = useMemo(() => {
    if (isAllStations) return null;
    return stations.find(s => s.id === selectedStationId) || null;
  }, [isAllStations, stations, selectedStationId]);

  const scopedWorkers = useMemo(() => {
    const workers = workspaceMembers.filter(m => m.role === 'worker');
    if (!activeStation) return workers;
    return workers.filter(w => w.station_id === activeStation.id);
  }, [workspaceMembers, activeStation]);

  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedParcelDetail, setSelectedParcelDetail] = useState<Parcel | null>(null);

  // الصندوق والعمليات المالية مطوية افتراضياً في الرئيسية حتى يدخل المستخدم للصندوق ليرى الفلوس
  const [isCashboxOpen, setIsCashboxOpen] = useState(false);
  const [isRecentTxOpen, setIsRecentTxOpen] = useState(false);

  // Modals state
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [voucherType, setVoucherType] = useState<TransactionType>('cash_in');
  const [voucherStationId, setVoucherStationId] = useState<string | undefined>(undefined);
  const [hawalaModalOpen, setHawalaModalOpen] = useState(false);
  const [hawalaInitialTab, setHawalaInitialTab] = useState<'send' | 'list'>('send');
  const [showExchangeModal, setShowExchangeModal] = useState(false);

  // Warning modal when paying out an incoming Hawala with empty/insufficient station cashbox
  const [pendingPayoutWarningTransfer, setPendingPayoutWarningTransfer] =
    useState<MoneyTransfer | null>(null);

  const openQuickVoucher = (type: TransactionType, stationId?: string) => {
    setVoucherType(type);
    setVoucherStationId(stationId || activeStation?.id || stations[0]?.id);
    setVoucherModalOpen(true);
  };

  const handleOpenNewParcelAction = () => {
    if (onOpenNewParcel) onOpenNewParcel();
    else if (onNavigateToNewParcel) onNavigateToNewParcel();
  };

  const handleGoToCashAction = () => {
    if (onOpenLedger) onOpenLedger();
    else if (onNavigateToView) onNavigateToView('cash');
  };

  const handleGoToParcelsAction = () => {
    if (onOpenParcels) onOpenParcels();
    else if (onNavigateToView) onNavigateToView('parcels');
  };

  // Global search filter for parcels (scoped to activeStation if selected)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const baseParcels = activeStation
      ? parcels.filter(
          p =>
            p.origin_station_id === activeStation.id ||
            ((p.destination_station_id === activeStation.id ||
              p.partner_destination_station_id === activeStation.id) &&
              p.status !== 'registered' &&
              p.status !== 'pending')
        )
      : parcels;
    return baseParcels
      .filter(
        p =>
          matchesTrackingCode(p, searchQuery) ||
          p.tracking_code.toLowerCase().includes(q) ||
          String(p.parcel_number || '').includes(q) ||
          p.sender_name.toLowerCase().includes(q) ||
          p.receiver_name.toLowerCase().includes(q) ||
          p.sender_phone.includes(q) ||
          p.receiver_phone.includes(q) ||
          p.description.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [parcels, searchQuery, activeStation]);

  // Scoped Parcels, Transactions, and Pending Hawalas for the active station (excluding unshipped parcels from other stations so they only appear in their origin station)
  const scopedParcels = useMemo(() => {
    const visibleParcels = parcels.filter(p => {
      const isIncomingPartner = Boolean(
        p.is_collaborator_data ||
          (p.partner_origin_workspace_id &&
            p.partner_origin_workspace_id !== currentWorkspace?.id)
      );
      if (isIncomingPartner && (p.status === 'registered' || p.status === 'pending')) {
        return false;
      }
      return true;
    });
    if (!activeStation) return visibleParcels;
    return visibleParcels.filter(
      p =>
        p.origin_station_id === activeStation.id ||
        ((p.destination_station_id === activeStation.id ||
          p.partner_destination_station_id === activeStation.id) &&
          p.status !== 'registered' &&
          p.status !== 'pending')
    );
  }, [parcels, activeStation, currentWorkspace?.id]);

  const scopedTransactions = useMemo(() => {
    const confirmed = transactions.filter(t => t.status === 'confirmed');
    if (!activeStation) return confirmed;
    return confirmed.filter(t => t.station_id === activeStation.id);
  }, [transactions, activeStation]);

  const scopedPendingHawalas = useMemo(() => {
    const pending = moneyTransfers.filter(t => t.status === 'pending');
    if (!activeStation) return pending;
    return pending.filter(t => t.destination_station_id === activeStation.id);
  }, [moneyTransfers, activeStation]);

  // Dynamic Cash totals for the current scope (1, 2, 3+ currencies e.g. MAD, MRU, EUR)
  const scopedCurrencies = useMemo(() => {
    const currencyMeta: Record<string, { code: string; label: string; symbol: string; flag: string }> = {
      MAD: { code: 'MAD', label: 'الدرهم المغربي', symbol: 'د.م.', flag: '🇲🇦' },
      MRU: { code: 'MRU', label: 'الأوقية الموريتانية', symbol: 'أ.م.', flag: '🇲🇷' },
      EUR: { code: 'EUR', label: 'اليورو الأوروبي', symbol: '€', flag: '🇪🇺' },
      USD: { code: 'USD', label: 'الدولار الأمريكي', symbol: '$', flag: '🇺🇸' },
    };

    currencies.forEach(c => {
      if (!currencyMeta[c.code]) {
        currencyMeta[c.code] = {
          code: c.code,
          label: c.label_ar || c.code,
          symbol: c.symbol || c.code,
          flag: '🪙',
        };
      }
    });

    const getBal = (code: string): number => {
      if (activeStation) {
        return Math.round((stationBalances[activeStation.id]?.[code] || 0) * 100) / 100;
      }
      let sum = 0;
      stations.forEach(s => {
        sum += stationBalances[s.id]?.[code] || 0;
      });
      return Math.round(sum * 100) / 100;
    };

    const candidateCodes = new Set<string>();
    currencies.filter(c => c.is_active).forEach(c => candidateCodes.add(c.code));

    Object.keys(currencyMeta).forEach(code => {
      if (getBal(code) !== 0) {
        candidateCodes.add(code);
      }
    });

    if (activeStation) {
      if (activeStation.currency) candidateCodes.add(activeStation.currency);
      if (activeStation.default_currency) candidateCodes.add(activeStation.default_currency);
    }

    if (candidateCodes.size === 0) {
      candidateCodes.add('MAD');
      candidateCodes.add('MRU');
    }

    const items = Array.from(candidateCodes).map(code => ({
      ...(currencyMeta[code] || {
        code,
        label: code,
        symbol: code,
        flag: '🪙',
      }),
      balance: getBal(code),
    }));

    const sortOrder = ['MAD', 'MRU', 'EUR', 'USD'];
    items.sort((a, b) => {
      const idxA = sortOrder.indexOf(a.code);
      const idxB = sortOrder.indexOf(b.code);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.code.localeCompare(b.code);
    });

    return items;
  }, [activeStation, stations, stationBalances, currencies]);

  // Parcel stats for the current scope
  const parcelStats = useMemo(() => {
    const waiting = scopedParcels.filter(p => p.status === 'registered').length;
    const inTransit = scopedParcels.filter(p => p.status === 'in_transit').length;
    const arrived = scopedParcels.filter(p => p.status === 'arrived').length;
    const delivered = scopedParcels.filter(p => p.status === 'delivered').length;
    return { waiting, inTransit, arrived, delivered, total: scopedParcels.length };
  }, [scopedParcels]);

  const handleRequestHawalaPayout = async (transfer: MoneyTransfer) => {
    const destBal =
      stationBalances[transfer.destination_station_id]?.[transfer.payout_currency] || 0;
    const afterBal = destBal - transfer.payout_amount;
    if (destBal <= 0 || afterBal < 0) {
      setPendingPayoutWarningTransfer(transfer);
      return;
    }
    await payoutMoneyTransfer(transfer.id);
  };

  const handleConfirmNegativeHawalaPayout = async () => {
    if (!pendingPayoutWarningTransfer) return;
    const id = pendingPayoutWarningTransfer.id;
    setPendingPayoutWarningTransfer(null);
    await payoutMoneyTransfer(id);
  };

  const handleBarcodeScanned = (code: string) => {
    const found = parcels.find(p => matchesTrackingCode(p, code));
    setScannerOpen(false);
    if (found) {
      const scanValidation = validateParcelScanOwnership(
        found,
        currentWorkspace?.id,
        userRole,
        undefined
      );
      if (!scanValidation.allowed) {
        showToast(scanValidation.reason || '⛔ لا تملك صلاحية مسح هذا الكولي (ينتمي لمدير آخر)', 'error');
        return;
      }
      setSelectedParcelDetail(found);
    } else {
      setSearchQuery(code.trim());
      showToast('تم وضع الكود الممسوح في شريط البحث', 'info');
    }
  };

  const {
    language,
  } = useApp();
  const isRtl = language === 'ar' || language === 'hassaniya';

  return (
    <div className={`space-y-3.5 pb-36 ${isRtl ? 'text-right' : 'text-left'} animate-fadeIn`} dir={isRtl ? 'rtl' : 'ltr'}>
      {/* 1. شريط البحث السريع عن كولي (بتصميم شفاف مضبب واضح + مربع صغير للسكان في آخره) */}
      <div className="relative">
        <div className="luxury-card rounded-2xl p-1.5 flex items-center gap-2 border border-white/20">
          <Search className="w-4 h-4 text-[#F5C84C] mr-2.5 shrink-0 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={
              activeStation
                ? `${t('searchInStation', 'ابحث عن كولي في')} ${activeStation.name}...`
                : t('searchPlaceholder', 'ابحث بكود التتبع (مثال: 0000466) أو اسم المرسل/المستلم...')
            }
            className="flex-1 bg-transparent text-xs font-bold text-white placeholder-white/75 focus:outline-none py-2 px-1"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label={t('clearSearch', 'مسح')}
              className="btn-cancel px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer"
            >
              {t('clearSearch', 'مسح')}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onOpenScanner) onOpenScanner();
              else setScannerOpen(true);
            }}
            className="btn-gold w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            title={t('scannerTitle', 'مسح الباركود أو QR بالكاميرا')}
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>

        {searchResults.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-2 luxury-card rounded-2xl shadow-2xl z-30 overflow-hidden divide-y divide-white/15">
            {searchResults.map(parcel => (
              <div
                key={parcel.id}
                onClick={() => {
                  if (onNavigateToParcel) onNavigateToParcel(parcel.id);
                  else setSelectedParcelDetail(parcel);
                  setSearchQuery('');
                }}
                className="p-3 hover:bg-white/10 flex items-center justify-between cursor-pointer transition"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black text-[#F5C84C]" dir="ltr">
                      {formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number)}
                    </span>
                    <span className="text-xs font-bold text-white">{parcel.description}</span>
                  </div>
                  <p className="text-[11px] text-white/80 mt-0.5">
                    من: {parcel.sender_name} ({parcel.origin_station_name}) ⬅ إلى: {parcel.receiver_name} ({parcel.destination_station_name})
                  </p>
                </div>
                <Eye className="w-4 h-4 text-[#F5C84C]" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. ملخص الكوليات والطرود للمحطة المختارة */}
      <div className="luxury-card rounded-[22px] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-[#F5C84C]" />
            <h3 className="text-sm sm:text-base font-black text-white">
              {activeStation ? activeStation.name : t('navParcels', 'الكوليات')} ({parcelStats.total})
            </h3>
          </div>

          <button
            type="button"
            onClick={handleOpenNewParcelAction}
            className="btn-hero-action btn-add px-4 py-3 rounded-[12px] font-black text-sm sm:text-base flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
            <span>{t('newParcel', 'تسجيل كولي جديد')}</span>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">{t('inOffice', 'بالمكتب')}</span>
            <span className="text-base font-black font-mono text-[#F5C84C]">
              {parcelStats.waiting}
            </span>
          </div>
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">{t('inTransit', 'في الطريق')}</span>
            <span className="text-base font-black font-mono text-[#F5C84C]">
              {parcelStats.inTransit}
            </span>
          </div>
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">{t('arrivedAtStation', 'وصل للمحطة')}</span>
            <span className="text-base font-black font-mono text-[#F5C84C]">
              {parcelStats.arrived}
            </span>
          </div>
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">{t('deliveredToCustomer', 'تم التسليم')}</span>
            <span className="text-base font-black font-mono text-emerald-400">
              {parcelStats.delivered}
            </span>
          </div>
        </div>
      </div>

      {/* 2.5 عمال المحطة المختارة (أو كل المحطات) — كل عامل ببطونة ديالو تعرض خدمتو بوحدو */}
      <div className="luxury-card rounded-[22px] p-3.5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3
              key={`workers-heading-${activeStation?.id || 'all'}-${scopedWorkers.length}`}
              className="text-xs sm:text-sm font-black text-white truncate"
            >
              {activeStation
                ? `عمال ${activeStation.name} (${scopedWorkers.length})`
                : `عمال المحطات (${scopedWorkers.length})`}
            </h3>
          </div>
          {scopedWorkers.length > 0 && (
            <span className="text-[10px] font-bold text-[#F5C84C]">
              اضغط على اسم العامل لعرض عملياته
            </span>
          )}
        </div>

        {scopedWorkers.length === 0 ? (
          <div className="text-[11px] text-white/70 bg-black/40 border border-white/10 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <span>
              {activeStation
                ? `لا يوجد عامل معين في ${activeStation.name} حالياً`
                : 'لا يوجد عمال مسجلون حالياً'}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {scopedWorkers.map(w => {
              const stName = stations.find(s => s.id === w.station_id)?.name || 'محطة';
              const isSelected = selectedWorkerId === w.user_id;
              return (
                <button
                  key={`${w.user_id}-${w.profile?.name || ''}-${stName}`}
                  type="button"
                  data-btn-role={isSelected ? 'add' : 'info'}
                  data-btn-role-fixed="true"
                  onClick={() => setSelectedWorkerId(prev => (prev === w.user_id ? null : w.user_id))}
                  className={`px-3 py-2 rounded-xl border flex items-center gap-1.5 text-xs font-black transition active:scale-95 cursor-pointer ${
                    isSelected
                      ? 'btn-add border-emerald-400 shadow-lg'
                      : 'bg-black/60 border-[#D4AF37]/40 text-white hover:border-[#F5C84C]'
                  }`}
                >
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>{w.profile?.name || 'عامل'}</span>
                  <span className="text-[10px] opacity-90 font-bold">
                    ({stName})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* بطاقة تفاصيل العامل المختار: سميتو والمحطة ديالو + شنو دار + آخر العمليات اللي دار مرتبين من الجديد للقديم مع التاريخ والوقت */}
        {(() => {
          if (!selectedWorkerId) return null;
          const workerObj = scopedWorkers.find(w => w.user_id === selectedWorkerId);
          if (!workerObj) return null;

          const workerId = workerObj.user_id;
          const workerName = workerObj.profile?.name || 'عامل';
          const workerPhone = workerObj.profile?.phone || '';
          const workerStation = stations.find(s => s.id === workerObj.station_id);
          const workerStationName = workerStation?.name || 'غير محدد';

          // جمع جميع العمليات الخاصة بهذا العامل حصرياً (بـ user_id ديالو فقط باش ما يتخلطش مع حتى عامل آخر)
          interface WorkerActivityItem {
            id: string;
            category: 'parcel' | 'cash' | 'hawala' | 'other';
            badge: string;
            title: string;
            details: string;
            stationName: string;
            timestamp: string;
          }

          const activityMap = new Map<string, WorkerActivityItem>();

          // 1. الكوليات التي سجلها العامل أو قام بتحديث حالتها أو قبض خلاصها
          parcels.forEach(p => {
            if (p.created_by === workerId) {
              const key = `parcel-create-${p.id}`;
              activityMap.set(key, {
                id: key,
                category: 'parcel',
                badge: '📦 تسجيل كولي',
                title: `تسجيل كولي جديد [${p.tracking_code}] (${p.origin_station_name} ➔ ${p.destination_station_name})`,
                details: `المرسل: ${p.sender_name} | المستلم: ${p.receiver_name} | ثمن الشحن: ${p.amount_due} ${p.currency}`,
                stationName: p.origin_station_name || workerStationName,
                timestamp: p.created_at,
              });
            }

            (p.status_history || []).forEach((h, idx) => {
              if (h.changed_by_id === workerId && h.status !== 'registered') {
                const statusLabel =
                  h.status === 'delivered'
                    ? '✅ تسليم كولي للمستلم'
                    : h.status === 'arrived'
                    ? '📥 استقبال وتفريغ كولي فالستوك'
                    : h.status === 'in_transit'
                    ? '🚚 شحن كولي فالرحلة'
                    : `تحديث حالة كولي (${h.status})`;
                const key = `parcel-status-${p.id}-${h.timestamp}-${idx}`;
                activityMap.set(key, {
                  id: key,
                  category: 'parcel',
                  badge: '📦 حركة كولي',
                  title: `${statusLabel} [${p.tracking_code}]`,
                  details: `المستلم: ${p.receiver_name}${h.notes ? ` — ${h.notes}` : ''}`,
                  stationName:
                    h.status === 'in_transit'
                      ? p.origin_station_name || workerStationName
                      : p.destination_station_name || workerStationName,
                  timestamp: h.timestamp,
                });
              }
            });
          });

          // 2. العمليات المالية فـ لاكيس والحوالات التي نفذها هذا العامل حصرياً
          transactions.forEach(tx => {
            if (tx.created_by !== workerId) return;
            const isHawala = Boolean(tx.hawala_transfer_id || tx.hawala_meta);
            const isOut = tx.type === 'cash_out' || tx.type === 'goods_payment' || tx.type === 'parcel_cod_payout';
            const sign = isOut ? '-' : '+';
            const key = `tx-${tx.id}`;
            activityMap.set(key, {
              id: key,
              category: isHawala ? 'hawala' : 'cash',
              badge: isHawala
                ? isOut
                  ? '💸 تسليم حوالة'
                  : '💸 إرسال حوالة'
                : isOut
                ? '📤 سحب من الصندوق'
                : '📥 إيداع في الصندوق',
              title: `${tx.reason || (isOut ? 'سحب مالي من لاكيس' : 'إيداع مالي فلاكيس')} (${sign}${tx.amount} ${tx.currency})`,
              details: tx.note || `المبلغ: ${sign}${tx.amount} ${tx.currency}`,
              stationName: tx.station_name || workerStationName,
              timestamp: tx.created_at,
            });
          });

          // 3. سجل العمليات الإضافية الخاصة بهذا العامل حصرياً (من auditLogs)
          auditLogs.forEach(log => {
            if (log.user_id !== workerId) return;
            // تجنب التكرار إذا كانت العملية مسجلة أعلاه عبر الكولي أو السند المالي
            if (log.table_name === 'transactions' && activityMap.has(`tx-${log.record_id}`)) return;
            if (log.table_name === 'parcels' && log.action === 'INSERT' && activityMap.has(`parcel-create-${log.record_id}`)) return;
            if (log.table_name === 'parcels' && log.action === 'STATUS_CHANGE') return;

            const key = `audit-${log.id}`;
            const cat: WorkerActivityItem['category'] =
              log.table_name === 'parcels'
                ? 'parcel'
                : log.table_name === 'hawala_transfers'
                ? 'hawala'
                : log.table_name === 'transactions'
                ? 'cash'
                : 'other';
            activityMap.set(key, {
              id: key,
              category: cat,
              badge:
                cat === 'parcel'
                  ? '📦 كولي'
                  : cat === 'hawala'
                  ? '💸 حوالة'
                  : cat === 'cash'
                  ? '💰 صندوق'
                  : '📋 عملية',
              title: log.reason || `${log.action} (${log.table_name})`,
              details: log.details || '',
              stationName: log.station_name || workerStationName,
              timestamp: log.created_at,
            });
          });

          // ترتيب جميع عمليات العامل من الجديد للقديم (الأحدث أولاً)
          const workerActivities = Array.from(activityMap.values()).sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          const parcelOpsCount = workerActivities.filter(a => a.category === 'parcel').length;
          const cashOpsCount = workerActivities.filter(a => a.category === 'cash').length;
          const hawalaOpsCount = workerActivities.filter(a => a.category === 'hawala').length;

          return (
            <div
              key={`worker-card-${workerId}`}
              className="mt-2 bg-black/75 border-2 border-emerald-500/60 rounded-2xl p-3.5 space-y-3 animate-fadeIn"
            >
              {/* رأس بطاقة العامل: سميتو + المحطة ديالو + زر إغلاق */}
              <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg bg-emerald-600 text-white text-[10px] font-black">
                      👤 العامل
                    </span>
                    <h4 className="text-sm font-black text-white truncate">{workerName}</h4>
                    {workerPhone && (
                      <span dir="ltr" className="text-[11px] font-mono text-white/75">
                        ({workerPhone})
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-black text-[#F5C84C]">
                    📍 المحطة ديالو: {workerStationName}{' '}
                    {workerStation?.city ? `(${workerStation.city})` : ''}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedWorkerId(null)}
                  className="btn-cancel px-2.5 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>إغلاق</span>
                </button>
              </div>

              {/* ملخص شنو دار هاد العامل بوحدو */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-black/60 border border-white/15 rounded-xl p-2">
                  <span className="text-[10px] font-bold text-white/75 block">📦 الكوليات</span>
                  <span className="text-sm font-black font-mono text-[#F5C84C]">{parcelOpsCount}</span>
                </div>
                <div className="bg-black/60 border border-white/15 rounded-xl p-2">
                  <span className="text-[10px] font-bold text-white/75 block">💰 الصندوق</span>
                  <span className="text-sm font-black font-mono text-emerald-400">{cashOpsCount}</span>
                </div>
                <div className="bg-black/60 border border-white/15 rounded-xl p-2">
                  <span className="text-[10px] font-bold text-white/75 block">💸 الحوالات</span>
                  <span className="text-sm font-black font-mono text-amber-300">{hawalaOpsCount}</span>
                </div>
              </div>

              {/* قائمة آخر العمليات اللي دار مرتبين من الجديد للقديم مع التاريخ والوقت */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[#F5C84C]">
                    🕒 آخر العمليات اللي دار ({workerActivities.length}) — من الجديد للقديم:
                  </span>
                </div>

                {workerActivities.length === 0 ? (
                  <div className="text-center py-5 text-xs text-white/70 bg-black/40 rounded-xl border border-white/10">
                    لم يقم العامل ({workerName}) بتسجيل أي عملية حتى الآن.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                    {workerActivities.map(act => (
                      <div
                        key={act.id}
                        className="p-2.5 rounded-xl bg-black/60 border border-white/15 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5C84C] text-[10px] font-black">
                            {act.badge}
                          </span>
                          <span
                            dir="ltr"
                            className="text-[10px] font-mono font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded-md border border-white/10"
                          >
                            🕒 {formatDateTimeStandard(act.timestamp)}
                          </span>
                        </div>
                        <p className="text-xs font-black text-white leading-snug">{act.title}</p>
                        {act.details && (
                          <p className="text-[11px] font-semibold text-white/80 leading-snug">
                            {act.details}
                          </p>
                        )}
                        <div className="text-[10px] font-bold text-white/60 flex items-center justify-between pt-0.5">
                          <span>👤 العامل: {workerName}</span>
                          <span>📍 المحطة: {act.stationName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* 3. صندوق (لاكيس) المحطة: مطوي افتراضياً حتى يدخل المستخدم للصندوق ليرى الفلوس */}
      <div className="luxury-card rounded-[22px] p-4 space-y-3.5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsCashboxOpen(prev => !prev)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsCashboxOpen(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm sm:text-base font-black text-white">
                {activeStation ? `${t('cashRegister', 'صندوق')} ${activeStation.name}` : t('stationsCashbox', 'صندوق المحطات')}
              </h3>
              <HelpPopover text="اضغط لعرض أرصدة الصناديق (درهم / أوقية)، الإيداع، السحب، الحوالات، وصرف العملة." />
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleGoToCashAction();
              }}
              className="btn-cancel px-2.5 py-1.5 rounded-xl text-[11px] font-black cursor-pointer"
            >
              {t('navCash', 'الصناديق')}
            </button>
            <ChevronDown
              className={`w-5 h-5 text-[#F5C84C] transition-transform duration-200 ${
                isCashboxOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>

        {isCashboxOpen && (
          <div className="pt-3 border-t border-white/15 space-y-3.5 animate-fadeIn">
            {/* أرصدة الصناديق ديناميكية حسب العملات المتاحة */}
            <div className={`grid gap-2.5 ${
              scopedCurrencies.length === 1 ? 'grid-cols-1' :
              scopedCurrencies.length === 2 ? 'grid-cols-2' :
              'grid-cols-1 sm:grid-cols-3'
            }`}>
              {scopedCurrencies.map(curr => {
                const isNegative = curr.balance < 0;
                return (
                  <div
                    key={curr.code}
                    className={`p-3.5 rounded-2xl border transition-all ${
                      isNegative
                        ? 'bg-rose-950/60 border-rose-500/50'
                        : 'bg-black/55 border-[#D4AF37]/35'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] font-bold text-white/70">
                        {curr.label} {curr.flag}
                      </span>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[#F5C84C] font-mono">
                        {curr.code}
                      </span>
                    </div>
                    <p
                      dir="ltr"
                      className={`text-xl sm:text-2xl font-black font-mono tracking-tight text-left ${
                        isNegative ? 'text-rose-400' : 'text-[#F5C84C]'
                      }`}
                    >
                      {formatAmount(curr.balance, curr.code)}
                    </p>
                    {isNegative && (
                      <span className="text-[9px] font-black text-rose-300 block mt-0.5">
                        رصيد سالب (عجز فلاكيس)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* الأزرار الأربعة المنظمة للعمليات المالية فالمحطة */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => openQuickVoucher('cash_in', activeStation?.id)}
                className="btn-hero-action btn-add py-3.5 px-4 rounded-[12px] font-black text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowDownLeft className="w-5 h-5" />
                <span>{t('deposit', 'إيداع')}</span>
              </button>

              <button
                type="button"
                onClick={() => openQuickVoucher('cash_out', activeStation?.id)}
                className="btn-hero-action btn-delete py-3.5 px-4 rounded-[12px] font-black text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowUpRight className="w-5 h-5" />
                <span>{t('withdraw', 'سحب')}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setHawalaInitialTab(scopedPendingHawalas.length > 0 ? 'list' : 'send');
                  setHawalaModalOpen(true);
                }}
                className="btn-gold py-3 px-3.5 rounded-[12px] font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer relative"
              >
                <Banknote className="w-4 h-4" />
                <span>{t('remittance', 'حوالة')}</span>
                {scopedPendingHawalas.length > 0 && (
                  <span className="badge-pill px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                    {scopedPendingHawalas.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowExchangeModal(!showExchangeModal);
                }}
                className={`py-3 px-3.5 rounded-[12px] font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 cursor-pointer ${
                  showExchangeModal ? 'btn-cancel' : 'btn-gold'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>{t('currencyExchange', 'صرف عملة')}</span>
              </button>
            </div>

            {/* Unified Currency Exchange Modal */}
            <CurrencyExchangeModal
              isOpen={showExchangeModal}
              onClose={() => setShowExchangeModal(false)}
              defaultStationId={activeStation?.id}
            />
          </div>
        )}
      </div>

      {/* 4 & 5. الحوالات تدار من زر الحوالة فالصندوق أعلاه، والمحطات تدار من الشريط العلوي الموحد */}

      {/* 6. بوطونة مستقلة لسجل العمليات المالية */}
      <div className="space-y-2.5">
        <button
          type="button"
          data-btn-role="info"
          data-btn-role-fixed="true"
          data-btn-active={isRecentTxOpen ? 'true' : undefined}
          data-btn-active-fixed="true"
          onClick={() => setIsRecentTxOpen(prev => !prev)}
          className="btn-gold w-full py-3 px-4 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer shadow-md"
        >
          <span className="flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              {activeStation
                ? `${t('stationTxs', 'سجل عمليات')} ${activeStation.name} (${scopedTransactions.length})`
                : `${t('financialTxsRegistry', 'سجل العمليات المالية')} (${scopedTransactions.length})`}
            </span>
          </span>
          <ChevronDown
            className={`w-5 h-5 shrink-0 transition-transform duration-200 ${
              isRecentTxOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isRecentTxOpen && (
          <div className="luxury-card rounded-[22px] p-4 space-y-2.5 animate-fadeIn">
            {scopedTransactions.length === 0 ? (
              <div className="text-center py-6 text-xs text-white/70 bg-black/30 rounded-xl border border-white/10">
                لا توجد عمليات مالية مسجلة في هذه المحطة حتى الآن
              </div>
            ) : (
              <div className="space-y-2">
                {scopedTransactions.slice(0, 12).map(tx => {
                  const isOut = tx.type === 'cash_out' || tx.type === 'goods_payment';
                  return (
                    <div
                      key={tx.id}
                      className="p-3 rounded-xl bg-black/50 border border-white/15 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white truncate">
                          {tx.reason || (isOut ? 'سحب من الصندوق' : 'إيداع في الصندوق')}
                        </p>
                        <p className="text-[10px] text-white/70 mt-0.5">
                          {tx.station_name} • {tx.creator_name} •{' '}
                          <span dir="ltr" className="font-mono">
                            {formatDateTimeStandard(tx.created_at)}
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          dir="ltr"
                          className={`text-xs font-black font-mono ${
                            isOut ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {formatAmount(tx.amount, tx.currency, isOut ? '-' : '+')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* إدارة اشتراكات الشركات موجودة في الشريط العلوي (زر التاج) وفي الإعدادات بدون تكرار */}

      {/* نافذة التنبيه عند تسليم حوالة ولاكيس المحطة خاوية */}
      {pendingPayoutWarningTransfer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-fadeIn"
          onClick={() => setPendingPayoutWarningTransfer(null)}
        >
          <div
            className="luxury-card border-2 border-rose-500/60 rounded-[26px] p-5 max-w-[410px] w-full shadow-2xl space-y-4 text-right"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400">
                <AlertTriangle className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-white">
                    تنبيه: لاكيس محطة الاستلام خاوية أو غير كافية!
                  </h4>
                  <p className="text-[11px] text-white/80 font-bold">
                    المحطة: {pendingPayoutWarningTransfer.destination_station_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingPayoutWarningTransfer(null)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const curr = pendingPayoutWarningTransfer.payout_currency;
              const currentBal =
                stationBalances[pendingPayoutWarningTransfer.destination_station_id]?.[curr] || 0;
              const afterBal = currentBal - pendingPayoutWarningTransfer.payout_amount;
              return (
                <div className="bg-black/65 border border-rose-500/40 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/80 font-bold">الرصيد الحالي في الصندوق:</span>
                    <span dir="ltr" className="font-mono font-black text-[#F5C84C]">
                      {currentBal.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/80 font-bold">مبلغ الحوالة المسلم للمستلم:</span>
                    <span dir="ltr" className="font-mono font-black text-rose-400">
                      -{pendingPayoutWarningTransfer.payout_amount.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/15 pt-2">
                    <span className="text-white font-black">رصيد الصندوق بعد التسليم:</span>
                    <span dir="ltr" className="font-mono font-black text-sm text-rose-400">
                      {afterBal.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleConfirmNegativeHawalaPayout}
                className="btn-delete flex-1 py-2.5 rounded-xl font-black text-xs cursor-pointer"
              >
                نعم، تم الاستلام (رصيد سالب)
              </button>
              <button
                type="button"
                onClick={() => setPendingPayoutWarningTransfer(null)}
                className="btn-cancel px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <NewVoucherModal
        isOpen={voucherModalOpen}
        onClose={() => setVoucherModalOpen(false)}
        defaultType={voucherType}
        fixedStationId={voucherStationId}
      />

      <MoneyTransferModal
        isOpen={hawalaModalOpen}
        onClose={() => setHawalaModalOpen(false)}
        initialTab={hawalaInitialTab}
      />

      <BarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="مسح كود الكولي (QR / باركود)"
      />

      <ParcelDetailModal
        parcel={selectedParcelDetail}
        isOpen={Boolean(selectedParcelDetail)}
        onClose={() => setSelectedParcelDetail(null)}
      />
    </div>
  );
};
