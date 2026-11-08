import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Transaction, TransactionType, MoneyTransfer } from '../types/database';
import { DailyFinancialReportModal } from './DailyFinancialReportModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { MoneyTransferModal } from './MoneyTransferModal';
import { exportService } from '../services/exportService';
import { formatDateTimeStandard } from '../utils/logisticsFeatures';
import { 
  FileText, 
  Download, 
  Phone, 
  Eye, 
  Edit3, 
  Ban, 
  AlertTriangle,
  X,
  Coins,
  Calendar,
  ArrowRightLeft,
  PlusCircle,
  Clock,
  User,
  Users,
  ChevronDown,
  Search,
  SlidersHorizontal,
  Store,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { HelpPopover } from './HelpPopover';
import { CurrencyExchangeModal } from './CurrencyExchangeModal';

interface LedgerViewProps {
  onOpenNewVoucher: (initialType?: TransactionType) => void;
  onOpenCustomerAccounts?: () => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  onOpenNewVoucher,
  onOpenCustomerAccounts,
}) => {
  const { 
    transactions, 
    stations, 
    currencies,
    currentWorkspace,
    userRole, 
    userAssignedStationId,
    isWorkerStationDeleted,
    stationBalances,
    selectedStationId,
    hideAmounts,
    updateStation,
    updateTransaction, 
    cancelTransaction,
    deleteTransaction,
    moneyTransfers,
    payoutMoneyTransfer,
    showToast 
  } = useApp();

  const workerStationId = userRole === 'worker' ? ((!isWorkerStationDeleted && userAssignedStationId) ? userAssignedStationId : '') : '';

  // Filters synchronized with globally selected active station
  const [filterStation, setFilterStation] = useState<string>(() =>
    workerStationId || selectedStationId || 'all'
  );
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Keep local filter in sync with top station selector
  useEffect(() => {
    if (userRole === 'worker' && workerStationId) {
      setFilterStation(workerStationId);
    } else if (selectedStationId) {
      setFilterStation(selectedStationId);
    } else {
      setFilterStation('all');
    }
  }, [selectedStationId, userRole, workerStationId]);

  // Compact / Collapsible UI States (اختصارات بالسهم الصغير)
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
  const [isStationBalancesOpen, setIsStationBalancesOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isOperationsLogOpen, setIsOperationsLogOpen] = useState(false);
  const [expandedTxIds, setExpandedTxIds] = useState<Set<string>>(new Set());

  const toggleTxExpand = (id: string) => {
    setExpandedTxIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Modals
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showMoneyTransferModal, setShowMoneyTransferModal] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [exchangeStationId, setExchangeStationId] = useState<string>(() =>
    selectedStationId && selectedStationId !== 'all' ? selectedStationId : (stations[0]?.id || '')
  );
  const [pendingPayoutWarningTransfer, setPendingPayoutWarningTransfer] = useState<MoneyTransfer | null>(null);

  useEffect(() => {
    if (userRole === 'worker' && workerStationId) {
      setExchangeStationId(workerStationId);
    } else if (selectedStationId && selectedStationId !== 'all') {
      setExchangeStationId(selectedStationId);
    } else if (stations[0]?.id && (!exchangeStationId || exchangeStationId === 'all')) {
      setExchangeStationId(stations[0].id);
    }
  }, [selectedStationId, stations, exchangeStationId, userRole, workerStationId]);

  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [cancellingTx, setCancellingTx] = useState<Transaction | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [deletingTx, setDeletingTx] = useState<Transaction | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Active Station or Global Totals for Quick Balance Cards
  const currentStation = stations.find(s => s.id === (filterStation !== 'all' ? filterStation : selectedStationId)) || stations[0];

  const displayedBalances = useMemo(() => {
    const currencyMeta: Record<string, { code: string; label: string; symbol: string; flag: string; color: string }> = {
      MAD: { code: 'MAD', label: 'صندوق الدرهم', symbol: 'درهم', flag: '🇲🇦', color: 'border-[#F5C84C]/40 text-[#F5C84C]' },
      MRU: { code: 'MRU', label: 'صندوق الأوقية', symbol: 'أوقية', flag: '🇲🇷', color: 'border-[#2ECC71]/40 text-[#68E399]' },
      EUR: { code: 'EUR', label: 'صندوق اليورو', symbol: 'يورو', flag: '🇪🇺', color: 'border-blue-400/40 text-blue-300' },
      USD: { code: 'USD', label: 'صندوق الدولار', symbol: 'دولار', flag: '🇺🇸', color: 'border-emerald-400/40 text-emerald-300' },
    };

    // Add any configured currencies from workspace
    currencies.forEach(c => {
      if (!currencyMeta[c.code]) {
        currencyMeta[c.code] = {
          code: c.code,
          label: `صندوق ${c.label_ar || c.code}`,
          symbol: c.symbol || c.code,
          flag: '🪙',
          color: 'border-[#D4AF37]/40 text-[#F5C84C]'
        };
      }
    });

    const getBal = (code: string): number => {
      if (filterStation !== 'all') {
        const bals = stationBalances[filterStation] || {};
        return Math.round((bals[code] || 0) * 100) / 100;
      }
      let total = 0;
      Object.values(stationBalances).forEach(bals => {
        total += bals[code] || 0;
      });
      return Math.round(total * 100) / 100;
    };

    // Collect candidate currencies for the current scope:
    const candidateCodes = new Set<string>();
    currencies.filter(c => c.is_active).forEach(c => candidateCodes.add(c.code));

    // Also include any currency that has a non-zero balance in this station/scope
    Object.keys(currencyMeta).forEach(code => {
      if (getBal(code) !== 0) {
        candidateCodes.add(code);
      }
    });

    // If specific station, also add station primary currency
    if (filterStation !== 'all') {
      const st = stations.find(s => s.id === filterStation);
      if (st?.currency) candidateCodes.add(st.currency);
      if (st?.default_currency) candidateCodes.add(st.default_currency);
    }

    // Default to at least MAD and MRU if empty
    if (candidateCodes.size === 0) {
      candidateCodes.add('MAD');
      candidateCodes.add('MRU');
    }

    const items = Array.from(candidateCodes).map(code => ({
      ...(currencyMeta[code] || {
        code,
        label: `صندوق ${code}`,
        symbol: code,
        flag: '🪙',
        color: 'border-[#F5C84C]/40 text-[#F5C84C]'
      }),
      balance: getBal(code),
    }));

    // Sort order: MAD, MRU, EUR, then others
    const sortOrder = ['MAD', 'MRU', 'EUR', 'USD'];
    items.sort((a, b) => {
      const idxA = sortOrder.indexOf(a.code);
      const idxB = sortOrder.indexOf(b.code);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.code.localeCompare(b.code);
    });

    const label = filterStation !== 'all'
      ? (stations.find(s => s.id === filterStation)?.name || 'المحطة')
      : `مجموع المحطات (${stations.length})`;

    return {
      items,
      label,
    };
  }, [stationBalances, filterStation, stations, currencies]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      // Station filter
      if (filterStation !== 'all' && tx.station_id !== filterStation) return false;

      // Type filter
      if (filterType !== 'all') {
        if (filterType === 'inflow') {
          const isIn = tx.type === 'cash_in' || tx.type === 'parcel_shipping_fee' || tx.type === 'parcel_cod_collection';
          if (!isIn) return false;
        } else if (filterType === 'outflow') {
          const isOut = tx.type === 'cash_out' || tx.type === 'goods_payment' || tx.type === 'parcel_cod_payout';
          if (!isOut) return false;
        } else if (tx.type !== filterType) {
          return false;
        }
      }

      // Date filter
      if (filterDate === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (new Date(tx.created_at) < today) return false;
      } else if (filterDate === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 86400000);
        if (new Date(tx.created_at) < weekAgo) return false;
      }

      // Search query (phone, reason, note, creator)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchPhone = tx.phone_number?.toLowerCase().includes(q);
        const matchReason = tx.reason?.toLowerCase().includes(q);
        const matchNote = tx.note?.toLowerCase().includes(q);
        const matchCreator = tx.creator_name?.toLowerCase().includes(q);
        if (!matchPhone && !matchReason && !matchNote && !matchCreator) return false;
      }

      return true;
    });
  }, [transactions, filterStation, filterType, filterDate, searchQuery]);

  const activeFiltersCount =
    (filterStation !== 'all' ? 1 : 0) +
    (filterType !== 'all' ? 1 : 0) +
    (filterDate !== 'all' ? 1 : 0);

  // Export to Official PDF
  const exportToPDF = () => {
    if (filteredTransactions.length === 0) {
      showToast('لا توجد بيانات لتصديرها', 'error');
      return;
    }
    exportService.exportTransactionsToPDF(
      filteredTransactions,
      currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'Sahara📦 Express'
    );
    showToast('جاري تحضير ملف PDF لسجل الصندوق...', 'success');
  };

  // Open Edit Modal
  const startEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditAmount(tx.amount.toString());
    setEditReason(tx.reason || '');
    setEditPhone(tx.phone_number || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    const newAmount = parseFloat(editAmount);
    if (!newAmount || newAmount <= 0) {
      showToast('المبلغ غير صحيح، يرجى إدخال قيمة أكبر من صفر', 'error');
      return;
    }

    if (!editReason.trim()) {
      showToast('يرجى كتابة سبب التعديل للتوثيق في سجل الرقابة المحاسبية', 'error');
      return;
    }

    const res = await updateTransaction(editingTx.id, {
      amount: newAmount,
      reason: editReason.trim(),
      phone_number: editPhone || null,
      note: `${editingTx.note || ''} [معدل]`,
    }, editReason.trim());

    if (res.success) {
      showToast('تم حفظ تعديل السند المالي بنجاح', 'success');
      setEditingTx(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancellingTx) return;

    if (!cancelReason.trim()) {
      showToast('يرجى كتابة سبب الإلغاء للتوثيق في سجل الرقابة المحاسبية', 'error');
      return;
    }

    const res = await cancelTransaction(cancellingTx.id, cancelReason.trim());
    if (res.success) {
      showToast('تم إلغاء السند المالي وتحديث الرصيد', 'success');
      setCancellingTx(null);
      setCancelReason('');
    }
  };

  const getTransactionTypeLabel = (type: TransactionType) => {
    switch (type) {
      case 'cash_in':
        return { label: '📥 إيداع نقدي', shortLabel: '📥 إيداع', color: 'bg-[#006233]/35 text-[#2ECC71] border-[#2ECC71]/40' };
      case 'parcel_shipping_fee':
        return { label: '📦 قبض أجرة شحن', shortLabel: '📦 شحن', color: 'bg-[#006233]/35 text-[#2ECC71] border-[#2ECC71]/40' };
      case 'parcel_cod_collection':
        return { label: '💰 قبض تحصيل (COD)', shortLabel: '💰 تحصيل', color: 'bg-black/60 text-[#F5C84C] border-[#F5C84C]/50' };
      case 'cash_out':
        return { label: '📤 صرف نقدي / مصاريف', shortLabel: '📤 صرف', color: 'bg-rose-950/70 text-rose-300 border-rose-500/40' };
      case 'goods_payment':
        return { label: '🤝 سداد بضاعة للمرسل', shortLabel: '🤝 سداد', color: 'bg-black/60 text-[#F5C84C] border-[#F5C84C]/40' };
      case 'parcel_cod_payout':
        return { label: '📤 تسليم مبلغ COD للتاجر', shortLabel: '📤 تسليم COD', color: 'bg-rose-950/70 text-rose-300 border-rose-500/40' };
      default:
        return { label: type, shortLabel: type, color: 'bg-black/50 text-white/80' };
    }
  };

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
            قام المدير بمسح أو إيقاف هذه المحطة نهائياً. تم تجميد وإيقاف جميع العمليات على هذا الحساب.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs font-mono font-black text-rose-300">
          🔒 العمليات موقوفة بأمر من المدير
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 pb-28 text-right">
      {/* 1. Compact Top Banner & Action Controls */}
      <div className="luxury-card rounded-[22px] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Coins className="w-5 h-5 text-[#F5C84C] shrink-0" />
            <h2 className="text-base sm:text-lg font-black text-white truncate">
              💰 الصناديق (لاكيس)
            </h2>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40 font-mono font-black shrink-0">
              {filteredTransactions.length}
            </span>
            <HelpPopover
              title="دفتر الصناديق (لاكيس)"
              text="إيداع وسحب السيولة النقدية، إرسال واستقبال الحوالات بين المحطات، وصرف العملات (MAD ⇄ MRU)."
            />
          </div>

          <button
            type="button"
            onClick={() => setIsMoreToolsOpen(prev => !prev)}
            className="btn-cancel px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
            title="إظهار أو إخفاء الأدوات المالية الإضافية"
          >
            <span>⚡ أدوات</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                isMoreToolsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Primary Cashbox Deposit & Withdraw Buttons (Large & Prominent) + Remittance & Exchange */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => onOpenNewVoucher('cash_in')}
              className="btn-hero-action btn-add flex items-center justify-center gap-2 py-3.5 px-4 rounded-[12px] text-sm sm:text-base font-black cursor-pointer"
            >
              <span>➕ إيداع</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenNewVoucher('cash_out')}
              className="btn-hero-action btn-delete flex items-center justify-center gap-2 py-3.5 px-4 rounded-[12px] text-sm sm:text-base font-black cursor-pointer"
            >
              <span>➖ سحب</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setShowMoneyTransferModal(true)}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-3 rounded-[12px] text-xs sm:text-sm font-black cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">💸 حوالة</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!exchangeStationId && stations[0]?.id) {
                  setExchangeStationId(selectedStationId || stations[0].id);
                }
                setShowConverter(prev => !prev);
              }}
              className={`flex items-center justify-center gap-1.5 px-3 py-3 rounded-[12px] text-xs sm:text-sm font-black cursor-pointer ${
                showConverter ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4 shrink-0" />
              <span className="whitespace-nowrap">💱 صرف عملة</span>
            </button>
          </div>
        </div>

        {/* Collapsible Secondary Tools (تفتح فقط عند الضغط على السهم) */}
        {isMoreToolsOpen && (
          <div className="pt-2 border-t border-white/15 grid grid-cols-2 gap-2 animate-fadeIn">
            <button
              type="button"
              onClick={() => setShowDailyReport(true)}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-[#F5C84C]" />
              <span>📊 التقرير اليومي</span>
            </button>

            <button
              type="button"
              onClick={() => setShowMoneyTransferModal(true)}
              className="btn-gold flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>💸 حوالات المحطات</span>
            </button>

            {onOpenCustomerAccounts && (
              <button
                type="button"
                onClick={onOpenCustomerAccounts}
                className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>👥 الكريدي والزبناء</span>
              </button>
            )}

            {(userRole === 'owner' || userRole === 'platform_owner') && (
              <button
                type="button"
                onClick={exportToPDF}
                className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>📄 PDF</span>
              </button>
            )}

          </div>
        )}
      </div>

      {/* Unified Currency Exchange Modal */}
      <CurrencyExchangeModal
        isOpen={showConverter}
        onClose={() => setShowConverter(false)}
        defaultStationId={
          (exchangeStationId && exchangeStationId !== 'all' ? exchangeStationId : '') ||
          currentStation?.id ||
          stations[0]?.id ||
          ''
        }
      />

      {/* 2. Compact Side-by-Side Dual Currency Boxes */}
      <div className="luxury-card rounded-[22px] p-3 space-y-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => {
            if (filterStation === 'all') setIsStationBalancesOpen(prev => !prev);
          }}
          className="flex items-center justify-between gap-2 select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Store className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
            <span className="text-xs font-black text-white truncate">
              أرصدة الصناديق — {displayedBalances.label}
            </span>
          </div>
          {filterStation === 'all' && (
            <div className="flex items-center gap-1 text-[10px] text-[#F5C84C] font-black shrink-0 cursor-pointer">
              <span>تفصيل المحطات</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  isStationBalancesOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          )}
        </div>

        {/* Dynamic Currency Balance Boxes (1, 2, 3 or more currencies) */}
        <div className={`grid gap-2 ${
          displayedBalances.items.length === 1 ? 'grid-cols-1' :
          displayedBalances.items.length === 2 ? 'grid-cols-2' :
          'grid-cols-1 sm:grid-cols-3'
        }`}>
          {displayedBalances.items.map(curr => {
            const isNegative = curr.balance < 0;
            const borderColorClass = curr.color.split(' ')[0];
            const textColorClass = curr.color.split(' ')[1];
            return (
              <div
                key={curr.code}
                className={`border rounded-xl p-2.5 transition-all ${
                  isNegative ? 'bg-rose-950/60 border-rose-500/50' : `bg-black/55 ${borderColorClass}`
                }`}
              >
                <div className="flex items-center justify-between text-[9px] text-white/70 font-bold mb-1">
                  <span>{curr.label} {curr.flag}</span>
                  <span className={`font-mono font-black px-1.5 py-0.2 rounded bg-black/40 ${textColorClass}`}>{curr.code}</span>
                </div>
                <div
                  className={`text-xl sm:text-2xl font-black font-mono tracking-tight mt-0.5 ${
                    isNegative ? 'text-rose-400' : textColorClass
                  }`}
                  dir="ltr"
                >
                  {hideAmounts ? '••••••' : curr.balance.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
                  <span className="text-[11px] font-bold font-sans opacity-80">{curr.symbol}</span>
                </div>
                {isNegative && (
                  <span className="text-[9px] font-black text-rose-300 block mt-0.5">
                    عجز فلاكيس
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Pending Hawalas standalone button (hidden log by default) */}
        {(() => {
          const pendingHawalas = moneyTransfers.filter(t => {
            if (t.status !== 'pending') return false;
            if (filterStation !== 'all') {
              return t.origin_station_id === filterStation || t.destination_station_id === filterStation;
            }
            return true;
          });
          if (pendingHawalas.length === 0) return null;
          return (
            <div className="pt-2 border-t border-white/15">
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                onClick={() => setShowMoneyTransferModal(true)}
                className="w-full py-2 px-3 rounded-xl font-black text-xs flex items-center justify-between gap-2 cursor-pointer shadow-sm"
              >
                <span>💸 سجل الحوالات بانتظار الاستلام ({pendingHawalas.length})</span>
                <span className="text-[11px] font-black">فتح السجل ⬅</span>
              </button>
            </div>
          );
        })()}

        {/* Collapsible Per-Station Balances List (Only when viewing 'all' stations) */}
        {filterStation === 'all' && isStationBalancesOpen && (
          <div className="pt-2 border-t border-white/15 space-y-1.5 animate-fadeIn">
            <div className="flex items-center justify-between text-[10px] text-white/75 px-1">
              <span>اضغط على أي محطة لفلترة سنداتها:</span>
              {filterStation !== 'all' && (
                <button
                  type="button"
                  onClick={() => setFilterStation('all')}
                  className="text-[#F5C84C] underline font-bold"
                >
                  عرض كل المحطات
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {stations.map(st => {
                const bals = stationBalances[st.id] || {};
                const stMad = Math.round((bals['MAD'] || 0) * 100) / 100;
                const stMru = Math.round((bals['MRU'] || 0) * 100) / 100;
                const stCurr = st.currency || (st.country === 'MR' ? 'MRU' : 'MAD');
                const isSelected = filterStation === st.id;
                return (
                  <div
                    key={st.id}
                    onClick={() => setFilterStation(isSelected ? 'all' : st.id)}
                    className={`p-2 rounded-xl border cursor-pointer transition text-[10px] space-y-1 ${
                      isSelected
                        ? 'bg-[#8c6d2c]/35 border-[#F5C84C]'
                        : 'bg-black/45 border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="font-black text-white truncate">
                        {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name || st.city}
                      </div>
                      {userRole === 'owner' && (
                        <select
                          value={stCurr}
                          onClick={e => e.stopPropagation()}
                          onChange={e => {
                            e.stopPropagation();
                            updateStation(st.id, { currency: e.target.value });
                          }}
                          title="تحديد عملة المحطة"
                          className="bg-black/80 border border-[#F5C84C]/50 rounded px-1 py-0.5 text-[9px] font-mono font-black text-[#F5C84C]"
                        >
                          {currencies.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.code}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="flex items-center justify-between font-mono text-[9px]" dir="ltr">
                      <span className="text-[#F5C84C]">
                        {hideAmounts ? '•••' : stMad.toLocaleString()} MAD
                      </span>
                      <span className="text-[#68E399]">
                        {hideAmounts ? '•••' : stMru.toLocaleString()} MRU
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 3. Standalone Button for Operations Log (سجل العمليات) */}
      <button
        type="button"
        data-btn-role="info"
        data-btn-role-fixed="true"
        data-btn-active={isOperationsLogOpen ? 'true' : 'false'}
        data-btn-active-fixed="true"
        onClick={() => setIsOperationsLogOpen(prev => !prev)}
        className="w-full py-2.5 px-3.5 rounded-[18px] font-black text-xs sm:text-sm flex items-center justify-between gap-2 cursor-pointer transition shadow-md"
      >
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 shrink-0" />
          <span>📋 سجل العمليات والسندات المالية ({filteredTransactions.length})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black">
            {isOperationsLogOpen ? 'إخفاء السجل ▲' : 'عرض السجل ▼'}
          </span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isOperationsLogOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {isOperationsLogOpen && (
        <div className="space-y-2.5 animate-fadeIn">
          {/* Compact Search Bar + Collapsible Filters Toggle */}
          <div className="luxury-card p-2.5 rounded-[20px] space-y-2">
            <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث بالهاتف، البيان، أو الموظف..."
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

        {/* Collapsible Filter Dropdowns */}
        {isFiltersOpen && (
          <div className="pt-2 border-t border-white/15 space-y-2 animate-fadeIn">
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <select
                value={filterStation}
                disabled={userRole === 'worker'}
                onChange={e => {
                  if (userRole === 'worker') return;
                  setFilterStation(e.target.value);
                }}
                className="bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#F5C84C] font-bold disabled:opacity-75"
              >
                {userRole !== 'worker' && <option value="all">كافة المحطات</option>}
                {(userRole === 'worker' && workerStationId
                  ? stations.filter(st => st.id === workerStationId)
                  : stations
                ).map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>

              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#F5C84C] font-bold"
              >
                <option value="all">كافة العمليات</option>
                <option value="inflow">📥 المقبوضات</option>
                <option value="outflow">📤 المصروفات</option>
                <option value="cash_in">إيداع نقدي</option>
                <option value="parcel_shipping_fee">أجرة شحن كولي</option>
                <option value="parcel_cod_collection">تحصيل COD</option>
                <option value="cash_out">تسليم نقدي</option>
                <option value="goods_payment">سداد بضاعة</option>
              </select>

              <select
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#F5C84C] font-bold"
              >
                <option value="all">كل التواريخ</option>
                <option value="today">اليوم فقط</option>
                <option value="week">آخر 7 أيام</option>
              </select>

              {filteredTransactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (expandedTxIds.size === filteredTransactions.length) {
                      setExpandedTxIds(new Set());
                    } else {
                      setExpandedTxIds(new Set(filteredTransactions.map(t => t.id)));
                    }
                  }}
                  className="btn-cancel flex items-center justify-center gap-1 px-2 py-1.5 rounded-xl text-[11px] font-bold"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>
                    {expandedTxIds.size === filteredTransactions.length
                      ? 'طي الكل ▲'
                      : 'توسيع الكل ▼'}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. Transactions List (Compact Collapsible Rows with Small Arrow) */}
      <div className="space-y-2">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-6 luxury-card rounded-[20px] p-4">
            <FileText className="w-7 h-7 text-[#F5C84C] mx-auto mb-1.5" />
            <p className="text-xs font-bold text-white">لا توجد سندات تطابق الفلترة المحددة</p>
            <p className="text-[11px] text-white/75 mt-0.5">جرّب تغيير خيارات البحث أو قم بتسجيل سند جديد</p>
          </div>
        ) : (
          filteredTransactions.map(tx => {
            const isCancelled = tx.status === 'cancelled';
            const isInflow = tx.type === 'cash_in' || tx.type === 'parcel_shipping_fee' || tx.type === 'parcel_cod_collection';
            const badge = getTransactionTypeLabel(tx.type);
            const isExpanded = expandedTxIds.has(tx.id);

            return (
              <div
                key={tx.id}
                className={`luxury-card rounded-[18px] px-3 py-2.5 transition border ${
                  isCancelled
                    ? 'opacity-65 border-rose-500/30'
                    : isExpanded
                    ? 'border-[#F5C84C]/55'
                    : 'border-white/12'
                }`}
              >
                {/* Compact 1-Line Summary Row (Click anywhere or on the arrow to expand) */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleTxExpand(tx.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleTxExpand(tx.id);
                    }
                  }}
                  className="flex items-center justify-between gap-2 cursor-pointer select-none"
                >
                  {/* Right Side: Short Badge + Reason + Station */}
                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${badge.color}`}>
                      {badge.shortLabel}
                    </span>

                    <div className="min-w-0 flex-1 truncate">
                      <span className="text-xs font-black text-white">
                        {tx.reason || 'سند صندوق نقدي'}
                      </span>
                      <span className="text-[10px] text-[#F5C84C] mr-1.5 font-bold">
                        ({tx.station_name || currentStation?.city})
                      </span>
                    </div>
                  </div>

                  {/* Left Side: Amount + Cancelled Pill + Small Arrow */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isCancelled && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-950/70 text-rose-300 font-bold border border-rose-500/40">
                        ملغى
                      </span>
                    )}

                    <span
                      className={`font-mono text-xs sm:text-sm font-black ${
                        isCancelled
                          ? 'line-through text-white/50'
                          : isInflow
                          ? 'text-[#2ECC71]'
                          : 'text-rose-400'
                      }`}
                      dir="ltr"
                    >
                      {hideAmounts ? '••••' : `${isInflow ? '+' : '-'}${tx.amount}`}{' '}
                      <span className="text-[10px] font-sans font-bold text-white/80">{tx.currency}</span>
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

                {/* Expanded Details (Only shown when clicked) */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 text-xs animate-fadeIn">
                    <div className="flex items-center justify-between flex-wrap gap-1.5 text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.color}`}>
                        {badge.label}
                      </span>
                      <span className="text-[10px] text-white/80 font-mono flex items-center gap-1" dir="ltr">
                        <Clock className="w-3 h-3 text-[#F5C84C]" />
                        <span>{formatDateTimeStandard(tx.created_at)}</span>
                      </span>
                    </div>

                    {(tx.phone_number || tx.note) && (
                      <div className="bg-black/45 p-2 rounded-xl border border-white/10 space-y-1">
                        {tx.phone_number && (
                          <div className="text-[11px] text-white/85 flex items-center justify-between">
                            <span className="text-white/70 text-[10px]">رقم الهاتف:</span>
                            <span className="font-mono text-[#F5C84C] flex items-center gap-1" dir="ltr">
                              <Phone className="w-3 h-3" />
                              <span>{tx.phone_number}</span>
                            </span>
                          </div>
                        )}
                        {tx.note && (
                          <p className="text-[10px] text-white/80 italic">
                            ملاحظة: "{tx.note}"
                          </p>
                        )}
                      </div>
                    )}

                    {/* Edit Notice Banner if Edited */}
                    {tx.edit_history && tx.edit_history.length > 0 && (
                      <div className="p-2 rounded-xl bg-black/50 border border-[#F5C84C]/40 text-[10px] text-white space-y-0.5">
                        <span className="font-bold flex items-center gap-1">
                          <Edit3 className="w-3 h-3 text-[#F5C84C]" />
                          <span>آخر تعديل: <strong>{tx.edit_history[tx.edit_history.length - 1].edited_by_name}</strong></span>
                        </span>
                        <p className="text-white/80 text-[10px]">
                          <strong className="text-[#F5C84C]">السبب:</strong> {tx.edit_history[tx.edit_history.length - 1].reason}
                        </p>
                      </div>
                    )}

                    {/* Cancellation Notice Banner if Cancelled */}
                    {isCancelled && (
                      <div className="p-2 rounded-xl bg-rose-950/60 border border-rose-500/40 text-[10px] text-rose-300 space-y-0.5">
                        <span className="font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-400" />
                          <span>أُلغي بواسطة: <strong>{tx.cancelled_by_name || 'المدير العام'}</strong></span>
                        </span>
                        <p className="text-rose-200 text-[10px]">
                          <strong className="text-rose-400">سبب الإلغاء:</strong> {tx.cancel_reason || 'تم إرجاع المبلغ للصندوق'}
                        </p>
                      </div>
                    )}

                    {/* Footer: Creator & Actions */}
                    <div className="flex flex-wrap items-center justify-between pt-1.5 border-t border-white/10 text-[11px] text-white/80 gap-2">
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3 text-[#F5C84C]" />
                        <span>سجّله: <strong className="text-white">{tx.creator_name || 'موظف المحطة'}</strong></span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDetailTx(tx)}
                          className="btn-gold flex items-center gap-1 font-black text-[11px] px-2.5 py-1 rounded-xl transition"
                        >
                          <FileText className="w-3 h-3" />
                          <span>تفاصيل السند</span>
                        </button>

                        {tx.photo_url && (
                          <button
                            type="button"
                            onClick={() => setSelectedPhoto(tx.photo_url || null)}
                            className="btn-cancel flex items-center gap-1 font-bold text-[11px] px-2.5 py-1 rounded-xl"
                          >
                            <Eye className="w-3 h-3" />
                            <span>الوصل</span>
                          </button>
                        )}

                        {(userRole === 'owner' || userRole === 'platform_owner') && (
                          <>
                            {!isCancelled && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => startEdit(tx)}
                                  className="btn-cancel p-1.5 rounded-lg transition"
                                  title="تعديل السند"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCancellingTx(tx)}
                                  className="btn-cancel p-1.5 rounded-lg transition text-amber-300"
                                  title="إلغاء السند مع بقائه في الأرشيف"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {/* حماية سجلات غرفة الشراكة: مقفلة نهائياً عن الحذف، والعمال محجوب عنهم زر الحذف */}
                            {(tx.is_partnership || tx.partner_workspace_id || tx.room_id || tx.svr_id || tx.hawala_meta?.is_partnership || tx.metadata?.is_partnership || tx.description?.includes('شراكة') || tx.description?.includes('غرفة الشراكة')) ? (
                              <span className="text-[10px] text-emerald-400 font-bold px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-1" title="سجلات غرفة الشراكة محمية ومقفلة نهائياً ولا يمكن مسحها لضمان الأدلة">
                                <span>🔒 سجل شراكة دائم</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeletingTx(tx)}
                                className="btn-delete px-2 py-1 rounded-lg transition flex items-center gap-1 text-[10px] font-black"
                                title="حذف السند نهائياً من النظام (للمدير فقط)"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>حذف</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75">
          <div className="w-full max-w-[370px] luxury-card rounded-[24px] p-5 shadow-2xl space-y-3.5 text-right">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-bold text-white">تعديل بيانات السند</h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/90 font-bold block mb-1">المبلغ المعدل:</label>
                <input
                  type="number"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">البيان / سبب التعديل (إلزامي للرقابة):</label>
                <input
                  type="text"
                  required
                  placeholder="اكتب سبب تعديل هذا السند..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">رقم الهاتف:</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="btn-cancel px-4 py-2 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl font-black"
                >
                  حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75">
          <div className="w-full max-w-[370px] luxury-card rounded-[24px] p-5 shadow-2xl space-y-3.5 text-right">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <span>تأكيد إلغاء السند المالي</span>
              </h3>
              <button
                type="button"
                onClick={() => setCancellingTx(null)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-white/80">
              هل أنت متأكد من إلغاء هذا السند بمبلغ <strong className="text-white">{cancellingTx.amount} {cancellingTx.currency}</strong>؟ سيتم إرجاع المبلغ فوراً إلى رصيد الصندوق وتوثيق العملية في سجل التدقيق.
            </p>

            <div>
              <label className="text-xs text-rose-300 font-bold block mb-1">سبب الإلغاء المكتوب (إلزامي للرقابة):</label>
              <input
                type="text"
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="مثال: خطأ في إدخال المبلغ / إلغاء طلب الزبون"
                className="w-full bg-black/60 border border-rose-500/50 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingTx(null)}
                className="btn-cancel px-4 py-2 rounded-xl text-xs font-bold"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="btn-delete px-5 py-2 rounded-xl text-xs font-black"
              >
                تأكيد الإلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-[370px] w-full luxury-card rounded-2xl p-2 overflow-hidden shadow-2xl">
            <button
              type="button"
              onClick={() => setSelectedPhoto(null)}
              className="btn-cancel absolute top-4 left-4 p-1.5 rounded-full z-10"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={selectedPhoto} alt="وصل السند" className="w-full h-auto max-h-[80vh] object-contain rounded-xl" />
          </div>
        </div>
      )}

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

      {/* Empty Cashbox Warning Modal for Direct Hawala Payout */}
      {pendingPayoutWarningTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="w-full max-w-md rounded-3xl luxury-card p-5 shadow-2xl text-right space-y-4 border-2 border-rose-500/50">
            <div className="flex items-center gap-2.5 text-rose-400">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <div>
                <h3 className="text-sm font-black text-white">تنبيه: لاكيس محطة الاستلام خاوية أو غير كافية!</h3>
                <p className="text-xs text-white/75">المحطة: {pendingPayoutWarningTransfer.destination_station_name}</p>
              </div>
            </div>
            {(() => {
              const curr = pendingPayoutWarningTransfer.payout_currency;
              const currentBal = stationBalances[pendingPayoutWarningTransfer.destination_station_id]?.[curr] || 0;
              const afterBal = currentBal - pendingPayoutWarningTransfer.payout_amount;
              return (
                <div className="bg-black/70 border border-rose-500/35 rounded-2xl p-3.5 space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/75">الرصيد الحالي فلاكيس:</span>
                    <span dir="ltr" className="font-mono font-black text-[#F5C84C]">
                      {currentBal.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/75">مبلغ الحوالة المسلم:</span>
                    <span dir="ltr" className="font-mono font-black text-rose-400">
                      -{pendingPayoutWarningTransfer.payout_amount.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/15 pt-1.5">
                    <span className="text-white font-black">رصيد الصندوق بعد التسليم:</span>
                    <span dir="ltr" className="font-mono font-black text-sm text-rose-400">
                      {afterBal.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                </div>
              );
            })()}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  const id = pendingPayoutWarningTransfer.id;
                  setPendingPayoutWarningTransfer(null);
                  await payoutMoneyTransfer(id);
                }}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-xs cursor-pointer"
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

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={detailTx}
        isOpen={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
      />

      {/* Owner Permanent Delete Transaction Modal */}
      {deletingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 animate-fadeIn">
          <div className="w-full max-w-[360px] rounded-[24px] luxury-card p-5 shadow-2xl text-right space-y-3.5 border border-rose-500/40">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-black text-white">حذف السند المالي نهائياً</h3>
            </div>
            <p className="text-xs text-white/85 leading-relaxed">
              هل أنت متأكد من حذف عملية{' '}
              <strong className="text-[#F5C84C]">
                [{deletingTx.reason || 'سند نقدي'} — {deletingTx.amount} {deletingTx.currency}]
              </strong>{' '}
              نهائياً من الصندوق وسجل العمليات؟
            </p>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setDeletingTx(null)}
                className="btn-cancel px-4 py-2 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteTransaction(deletingTx.id);
                  setDeletingTx(null);
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
