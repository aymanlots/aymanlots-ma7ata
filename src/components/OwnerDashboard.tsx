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
} from 'lucide-react';
import { NewVoucherModal } from './NewVoucherModal';
import { MoneyTransferModal } from './MoneyTransferModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { ParcelDetailModal } from './ParcelDetailModal';
import { HelpPopover } from './HelpPopover';
import {
  formatDateTimeStandard,
  formatTrackingCodeNumeric,
  matchesTrackingCode,
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
  onOpenPlatformOwner,
}) => {
  const {
    userRole,
    stations,
    selectedStationId,
    setSelectedStationId,
    stationBalances,
    currencies,
    transactions,
    deleteTransaction,
    executeCurrencyExchange,
    moneyTransfers,
    payoutMoneyTransfer,
    parcels,
    exchangeRate,
    setExchangeRate,
    formatAmount,
    showToast,
  } = useApp();

  const isOwner = userRole === 'owner' || userRole === 'platform_owner';
  const isAllStations = selectedStationId === 'all' || (!selectedStationId && stations.length > 1);
  const activeStation = useMemo(() => {
    if (isAllStations) return null;
    return stations.find(s => s.id === selectedStationId) || stations[0] || null;
  }, [isAllStations, stations, selectedStationId]);

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

  // Inline Currency Exchange (صرف العملة بين الدرهم والأوقية داخل لاكيس المحطة)
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [fxStationId, setFxStationId] = useState<string>(activeStation?.id || stations[0]?.id || '');
  const [fxDirection, setFxDirection] = useState<'MAD_TO_MRU' | 'MRU_TO_MAD'>('MAD_TO_MRU');
  const [fxFromAmount, setFxFromAmount] = useState<string>('');
  const [fxRateInput, setFxRateInput] = useState<string>(String(exchangeRate || 3.8));
  const [fxCustomerName, setFxCustomerName] = useState<string>('');
  const [fxNote, setFxNote] = useState<string>('');
  const [fxError, setFxError] = useState<string>('');
  const [isExecutingFx, setIsExecutingFx] = useState(false);
  const [showFxNegativeWarning, setShowFxNegativeWarning] = useState(false);

  // Warning modal when paying out an incoming Hawala with empty/insufficient station cashbox
  const [pendingPayoutWarningTransfer, setPendingPayoutWarningTransfer] =
    useState<MoneyTransfer | null>(null);

  useEffect(() => {
    if (activeStation) {
      setFxStationId(activeStation.id);
    } else if (stations.length > 0 && !fxStationId) {
      setFxStationId(stations[0].id);
    }
  }, [activeStation, stations, fxStationId]);

  useEffect(() => {
    setFxRateInput(String(exchangeRate || 3.8));
  }, [exchangeRate]);

  const fxNumericFrom = parseFloat(fxFromAmount) || 0;
  const fxNumericRate = parseFloat(fxRateInput) || exchangeRate || 3.8;
  const fxFromCurrency: 'MAD' | 'MRU' = fxDirection === 'MAD_TO_MRU' ? 'MAD' : 'MRU';
  const fxToCurrency: 'MAD' | 'MRU' = fxDirection === 'MAD_TO_MRU' ? 'MRU' : 'MAD';
  const fxCalculatedToAmount = useMemo(() => {
    if (fxNumericFrom <= 0 || fxNumericRate <= 0) return 0;
    if (fxDirection === 'MAD_TO_MRU') {
      return Math.round(fxNumericFrom * fxNumericRate * 100) / 100;
    }
    return Math.round((fxNumericFrom / fxNumericRate) * 100) / 100;
  }, [fxNumericFrom, fxNumericRate, fxDirection]);

  const fxTargetStationId = activeStation?.id || fxStationId || stations[0]?.id || '';
  const fxCurrentOutBalance = stationBalances[fxTargetStationId]?.[fxToCurrency] || 0;
  const fxResultingOutBalance = fxCurrentOutBalance - fxCalculatedToAmount;

  const performCurrencyExchange = async () => {
    setIsExecutingFx(true);
    try {
      if (fxNumericRate !== exchangeRate) {
        setExchangeRate(fxNumericRate);
      }
      const res = await executeCurrencyExchange({
        stationId: fxTargetStationId,
        fromCurrency: fxFromCurrency,
        toCurrency: fxToCurrency,
        fromAmount: fxNumericFrom,
        toAmount: fxCalculatedToAmount,
        rate: fxNumericRate,
        customerName: fxCustomerName,
        note: fxNote,
      });
      if (!res.success) {
        setFxError(res.error || 'تعذر تنفيذ عملية الصرف');
      } else {
        setFxFromAmount('');
        setFxCustomerName('');
        setFxNote('');
        setShowFxNegativeWarning(false);
        setShowExchangeModal(false);
      }
    } finally {
      setIsExecutingFx(false);
    }
  };

  const handleExecuteFxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFxError('');
    if (!fxTargetStationId) {
      setFxError('يرجى اختيار المحطة أولاً');
      return;
    }
    if (fxNumericFrom <= 0 || fxCalculatedToAmount <= 0) {
      setFxError('يرجى إدخال مبلغ صحيح للصرف');
      return;
    }
    if (fxCurrentOutBalance <= 0 || fxResultingOutBalance < 0) {
      setShowFxNegativeWarning(true);
      return;
    }
    await performCurrencyExchange();
  };

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
            p.destination_station_id === activeStation.id
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

  // Scoped Parcels, Transactions, and Pending Hawalas for the active station (or all stations when 'all' is selected)
  const scopedParcels = useMemo(() => {
    if (!activeStation) return parcels;
    return parcels.filter(
      p =>
        p.origin_station_id === activeStation.id ||
        p.destination_station_id === activeStation.id
    );
  }, [parcels, activeStation]);

  const scopedTransactions = useMemo(() => {
    const confirmed = transactions.filter(t => t.status === 'confirmed');
    if (!activeStation) return confirmed;
    return confirmed.filter(t => t.station_id === activeStation.id);
  }, [transactions, activeStation]);

  const scopedPendingHawalas = useMemo(() => {
    const pending = moneyTransfers.filter(t => t.status === 'pending');
    if (!activeStation) return pending;
    return pending.filter(
      t =>
        t.destination_station_id === activeStation.id ||
        t.origin_station_id === activeStation.id
    );
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
      setSelectedParcelDetail(found);
    } else {
      setSearchQuery(code.trim());
      showToast('تم وضع الكود الممسوح في شريط البحث', 'info');
    }
  };

  return (
    <div className="space-y-3.5 pb-36 text-right animate-fadeIn" dir="rtl">
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
                ? `ابحث عن كولي في ${activeStation.name} (كود 0000466، مرسل، مستلم)...`
                : 'ابحث بكود التتبع (مثال: 0000466) أو اسم المرسل/المستلم...'
            }
            className="flex-1 bg-transparent text-xs font-bold text-white placeholder-white/75 focus:outline-none py-2 px-1"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="مسح البحث"
              className="btn-cancel px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 cursor-pointer"
            >
              مسح
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (onOpenScanner) onOpenScanner();
              else setScannerOpen(true);
            }}
            className="btn-gold w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
            title="مسح الباركود أو QR بالكاميرا"
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
              📦 {activeStation ? activeStation.name : 'الكوليات'} ({parcelStats.total})
            </h3>
          </div>

          <button
            type="button"
            onClick={handleOpenNewParcelAction}
            className="btn-gold px-3.5 py-2 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span>➕ تسجيل كولي جديد</span>
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center">
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">بالمكتب</span>
            <span className="text-base font-black font-mono text-[#F5C84C]">
              {parcelStats.waiting}
            </span>
          </div>
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">في الطريق</span>
            <span className="text-base font-black font-mono text-[#F5C84C]">
              {parcelStats.inTransit}
            </span>
          </div>
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">وصل للمحطة</span>
            <span className="text-base font-black font-mono text-[#F5C84C]">
              {parcelStats.arrived}
            </span>
          </div>
          <div
            onClick={handleGoToParcelsAction}
            className="bg-black/50 border border-white/15 rounded-xl p-2.5 cursor-pointer hover:border-[#F5C84C]/50 transition"
          >
            <span className="text-[10px] font-bold text-white/80 block">تم التسليم</span>
            <span className="text-base font-black font-mono text-emerald-400">
              {parcelStats.delivered}
            </span>
          </div>
        </div>
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
                💰 {activeStation ? `لاكيس ${activeStation.name}` : 'لاكيس المحطات'}
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
              الصناديق
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
            {/* أرصدة الصناديق ديناميكية حسب العملات المتاحة (1 عملة = 1 صندوق، 2 عملات = 2 صناديق، 3 عملات أو أكثر = 3 صناديق) */}
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
                      <span className="text-[11px] font-bold text-white/85">
                        {curr.label} {curr.flag}
                      </span>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[#F5C84C]">
                        {curr.code}
                      </span>
                    </div>
                    <p
                      dir="ltr"
                      className={`text-lg sm:text-xl font-black font-mono text-left ${
                        isNegative ? 'text-rose-400' : 'text-[#F5C84C]'
                      }`}
                    >
                      {formatAmount(curr.balance, curr.code)}
                    </p>
                    {isNegative && (
                      <span className="text-[10px] font-bold text-rose-300 block mt-0.5">
                        رصيد سالب (عجز فلاكيس)
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* الأزرار الأربعة المنظمة للعمليات المالية في المحطة */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openQuickVoucher('cash_in', activeStation?.id)}
                className="btn-gold py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>➕ إيداع</span>
              </button>

              <button
                type="button"
                onClick={() => openQuickVoucher('cash_out', activeStation?.id)}
                className="btn-gold py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>➖ سحب</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setHawalaInitialTab(scopedPendingHawalas.length > 0 ? 'list' : 'send');
                  setHawalaModalOpen(true);
                }}
                className="btn-gold py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer relative"
              >
                <Banknote className="w-4 h-4" />
                <span>💸 حوالة</span>
                {scopedPendingHawalas.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                    {scopedPendingHawalas.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setFxError('');
                  setShowFxNegativeWarning(false);
                  setShowExchangeModal(!showExchangeModal);
                }}
                className={`py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                  showExchangeModal ? 'btn-cancel' : 'btn-gold'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>💱 صرف عملة</span>
              </button>
            </div>

            {/* نافذة صرف العملة المدمجة داخل لاكيس المحطة بنفس التصميم الموحد */}
            {showExchangeModal && (
              <form
                onSubmit={handleExecuteFxSubmit}
                className="bg-black/65 border border-[#D4AF37]/40 rounded-2xl p-4 space-y-3 animate-fadeIn"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="w-4 h-4 text-[#F5C84C]" />
                    <span className="text-xs font-black text-white">
                      صرف العملة فلاكيس ({activeStation ? activeStation.name : 'المحطة'})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowExchangeModal(false)}
                    className="btn-cancel px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer"
                  >
                    إغلاق
                  </button>
                </div>

                {fxError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs font-bold text-rose-200">
                    {fxError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFxDirection('MAD_TO_MRU')}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-black transition cursor-pointer ${
                      fxDirection === 'MAD_TO_MRU' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    قبض درهم (+MAD) ⬅ تسليم أوقية (−MRU)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFxDirection('MRU_TO_MAD')}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-black transition cursor-pointer ${
                      fxDirection === 'MRU_TO_MAD' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    قبض أوقية (+MRU) ⬅ تسليم درهم (−MAD)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-white/85 mb-1">
                      المبلغ المستلم من الزبون (+{fxFromCurrency}) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      dir="ltr"
                      value={fxFromAmount}
                      onChange={e => setFxFromAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-black/70 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-sm font-mono font-black text-emerald-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-white/85 mb-1">
                      سعر الصرف (1 درهم = ? أوقية)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      required
                      dir="ltr"
                      value={fxRateInput}
                      onChange={e => setFxRateInput(e.target.value)}
                      className="w-full bg-black/70 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-sm font-mono font-black text-[#F5C84C] focus:outline-none"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between text-xs">
                  <span className="text-white/85 font-bold">
                    المبلغ المسلم للزبون (يُخصم من لاكيس −{fxToCurrency}):
                  </span>
                  <span dir="ltr" className="text-base font-mono font-black text-rose-400">
                    -{fxCalculatedToAmount.toLocaleString('en-US')} {fxToCurrency}
                  </span>
                </div>

                {showFxNegativeWarning && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/80 border-2 border-rose-500/60 space-y-2">
                    <div className="flex items-center gap-2 text-rose-200 font-black text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>تنبيه: لاكيس {fxToCurrency} في المحطة خاوية أو غير كافية!</span>
                    </div>
                    <p className="text-xs text-white font-bold">
                      الرصيد الحالي:{' '}
                      <span dir="ltr" className="font-mono text-[#F5C84C]">
                        {fxCurrentOutBalance.toLocaleString('en-US')} {fxToCurrency}
                      </span>{' '}
                      ➔ سيصبح بعد الصرف:{' '}
                      <span dir="ltr" className="font-mono text-rose-400 font-black">
                        {fxResultingOutBalance.toLocaleString('en-US')} {fxToCurrency}
                      </span>
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={isExecutingFx}
                        onClick={performCurrencyExchange}
                        className="btn-delete flex-1 py-2 rounded-xl font-black text-xs cursor-pointer"
                      >
                        نعم، نفذ الصرف (رصيد سالب)
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowFxNegativeWarning(false)}
                        className="btn-cancel px-3 py-2 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {!showFxNegativeWarning && (
                  <button
                    type="submit"
                    disabled={isExecutingFx}
                    className="btn-gold w-full py-2.5 rounded-xl font-black text-xs cursor-pointer"
                  >
                    {isExecutingFx
                      ? 'جاري تسجيل الصرف...'
                      : `تأكيد الصرف (+${fxNumericFrom || 0} ${fxFromCurrency} / -${fxCalculatedToAmount} ${fxToCurrency})`}
                  </button>
                )}
              </form>
            )}
          </div>
        )}
      </div>

      {/* 4. حوالات المحطة الجارية */}
      {scopedPendingHawalas.length > 0 && (
        <div className="luxury-card rounded-[22px] p-4 space-y-3 border border-[#F5C84C]/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-[#F5C84C]" />
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-white">
                  💸 حوالات بانتظار التسليم ({scopedPendingHawalas.length})
                </h3>
                <HelpPopover text='اضغط "تم الاستلام" عند تسليم الفلوس للمستلم ليتم خصمها (−) من لاكيس محطة الوصول.' />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setHawalaInitialTab('list');
                setHawalaModalOpen(true);
              }}
              className="btn-cancel px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer"
            >
              الكل
            </button>
          </div>

          <div className="space-y-2.5">
            {scopedPendingHawalas.map(t => {
              const isIncomingHere =
                activeStation && t.destination_station_id === activeStation.id;
              return (
                <div
                  key={t.id}
                  className="bg-black/55 border border-[#D4AF37]/35 rounded-2xl p-3.5 space-y-2.5"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        dir="ltr"
                        className="px-2 py-0.5 rounded-lg bg-[#D4AF37]/20 text-[#F5C84C] font-mono text-xs font-black"
                      >
                        {t.transfer_code}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-black/60 text-[#F5C84C] border border-[#D4AF37]/40 text-[10px] font-black">
                        {isIncomingHere
                          ? `📥 واردة إلى ${t.destination_station_name}`
                          : `📤 مرسلة من ${t.origin_station_name} إلى ${t.destination_station_name}`}
                      </span>
                    </div>
                    <span dir="ltr" className="text-sm font-mono font-black text-[#F5C84C]">
                      {t.payout_amount.toLocaleString('en-US')} {t.payout_currency}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-white/85">
                    <span>
                      المرسل: <strong>{t.sender_name}</strong> ({t.origin_station_name})
                    </span>
                    <span>
                      المستلم: <strong>{t.receiver_name}</strong> ({t.destination_station_name})
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                    <span className="text-[11px] text-white/75 font-mono">
                      كود التسليم: <strong className="text-[#F5C84C]">{t.secret_pin}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRequestHawalaPayout(t)}
                      className="btn-gold px-3.5 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        تم الاستلام (خصم -{t.payout_amount.toLocaleString('en-US')} {t.payout_currency} من{' '}
                        {t.destination_station_name})
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. عند اختيار "الكل" فقط: عرض أسماء المحطات فقط */}
      {isAllStations && stations.length > 0 && (
        <div className="luxury-card rounded-[22px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-[#F5C84C]" />
              <h3 className="text-sm font-black text-white">
                🏪 المحطات ({stations.length})
              </h3>
              <HelpPopover text="اضغط على أي محطة للدخول إليها وحدها وعرض كولياتها وصناديقها فقط." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {stations.map(st => {
              const stParcelsCount = parcels.filter(
                p => p.origin_station_id === st.id || p.destination_station_id === st.id
              ).length;

              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStationId(st.id)}
                  className="btn-cancel rounded-2xl p-3 text-right transition flex items-center justify-between gap-2 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-black truncate">
                      {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name}
                    </p>
                    <p className="text-[10px] opacity-80 mt-0.5 truncate">
                      {st.city} • {stParcelsCount} كولي
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. آخر الحركات المالية في المحطة المختارة (مطوي افتراضياً لتنظيم الواجهة) */}
      <div className="luxury-card rounded-[22px] p-4 space-y-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsRecentTxOpen(prev => !prev)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsRecentTxOpen(prev => !prev);
            }
          }}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <h3 className="text-xs font-black text-white flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-[#F5C84C]" />
            <span>
              {activeStation
                ? `سجل عمليات ${activeStation.name} (${scopedTransactions.length})`
                : `سجل العمليات المالية (${scopedTransactions.length})`}
            </span>
          </h3>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] transition-transform duration-200 ${
              isRecentTxOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isRecentTxOpen && (
          <div className="pt-2 border-t border-white/15 space-y-2 animate-fadeIn">
            {scopedTransactions.length === 0 ? (
              <div className="text-center py-6 text-xs text-white/70 bg-black/30 rounded-xl border border-white/10">
                لا توجد عمليات مالية مسجلة في هذه المحطة حتى الآن
              </div>
            ) : (
              <div className="space-y-2">
                {scopedTransactions.slice(0, 6).map(tx => {
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

                        {isOwner &&
                          (confirmDeleteTxId === tx.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  await deleteTransaction(tx.id);
                                  setConfirmDeleteTxId(null);
                                }}
                                className="btn-delete px-2 py-1 rounded-lg text-[10px] font-black cursor-pointer"
                              >
                                تأكيد
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTxId(null)}
                                className="btn-cancel px-1.5 py-1 rounded-lg text-[10px] cursor-pointer"
                              >
                                إلغاء
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTxId(tx.id)}
                              className="btn-delete p-1.5 rounded-lg transition cursor-pointer"
                              title="حذف العملية"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Commercial Features: Subscription Management */}
      {onOpenPlatformOwner && userRole === 'platform_owner' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 gap-2.5">
            <button
              type="button"
              onClick={onOpenPlatformOwner}
              className="luxury-card rounded-[20px] p-3.5 border border-[#D4AF37]/50 hover:border-[#F5C84C] transition flex items-center justify-between gap-2.5 text-right cursor-pointer shadow-lg"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5C84C] flex items-center justify-center shrink-0">
                  <Crown className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#F5C84C] truncate">
                    إدارة اشتراكات الشركات
                  </p>
                  <p className="text-[10px] text-white/75 truncate">
                    تفعيل / توقيف حسابات الشركات المشتركة
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-[#F5C84C] text-slate-950 font-black text-[10px] shrink-0">
                إدارة
              </span>
            </button>
          </div>
        </div>
      )}

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
