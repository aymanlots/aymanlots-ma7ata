import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Transaction, TransactionType } from '../types/database';
import { DailyFinancialReportModal } from './DailyFinancialReportModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { MoneyTransferModal } from './MoneyTransferModal';
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
  Store
} from 'lucide-react';

interface LedgerViewProps {
  onOpenNewVoucher: () => void;
  onOpenCustomerAccounts?: () => void;
}

export const LedgerView: React.FC<LedgerViewProps> = ({ onOpenNewVoucher, onOpenCustomerAccounts }) => {
  const { 
    transactions, 
    stations, 
    currencies,
    userRole, 
    stationBalances,
    selectedStationId,
    hideAmounts,
    updateStation,
    updateTransaction, 
    cancelTransaction, 
    exchangeRate,
    setExchangeRate,
    convertCurrency,
    showToast 
  } = useApp();

  // Filters synchronized with globally selected active station
  const [filterStation, setFilterStation] = useState<string>(() => selectedStationId || 'all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterDate, setFilterDate] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Keep local filter in sync with top station selector
  useEffect(() => {
    if (selectedStationId) {
      setFilterStation(selectedStationId);
    } else {
      setFilterStation('all');
    }
  }, [selectedStationId]);

  // Compact / Collapsible UI States (اختصارات بالسهم الصغير)
  const [isMoreToolsOpen, setIsMoreToolsOpen] = useState(false);
  const [isStationBalancesOpen, setIsStationBalancesOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
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
  const [calcAmount, setCalcAmount] = useState('1000');
  const [calcFrom, setCalcFrom] = useState<'MAD' | 'MRU'>('MAD');
  const [manualRateStr, setManualRateStr] = useState<string>(() => String(exchangeRate || 3.8));

  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [cancellingTx, setCancellingTx] = useState<Transaction | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  // Active Station or Global Totals for Quick Balance Cards
  const currentStation = stations.find(s => s.id === (filterStation !== 'all' ? filterStation : selectedStationId)) || stations[0];

  const displayedBalances = useMemo(() => {
    if (filterStation !== 'all') {
      const bals = stationBalances[filterStation] || {};
      return {
        mad: Math.round((bals['MAD'] || 0) * 100) / 100,
        mru: Math.round((bals['MRU'] || 0) * 100) / 100,
        label: stations.find(s => s.id === filterStation)?.name || 'المحطة'
      };
    }
    let totalMad = 0;
    let totalMru = 0;
    Object.values(stationBalances).forEach(bals => {
      totalMad += bals['MAD'] || 0;
      totalMru += bals['MRU'] || 0;
    });
    return {
      mad: Math.round(totalMad * 100) / 100,
      mru: Math.round(totalMru * 100) / 100,
      label: `مجموع المحطات (${stations.length})`
    };
  }, [stationBalances, filterStation, stations]);

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

  // Export to CSV with UTF-8 BOM
  const exportToCSV = () => {
    if (filteredTransactions.length === 0) {
      showToast('لا توجد بيانات لتصديرها', 'error');
      return;
    }

    const headers = [
      'رقم السند',
      'التاريخ والوقت',
      'المحطة',
      'نوع العملية',
      'المبلغ',
      'العملة',
      'رقم الهاتف',
      'السبب والبيان',
      'الموظف المنشئ',
      'الحالة',
      'ملاحظات'
    ];

    const rows = filteredTransactions.map(tx => [
      tx.id,
      new Date(tx.created_at).toLocaleString('ar-MA'),
      tx.station_name || tx.station_id,
      tx.type,
      tx.amount,
      tx.currency,
      tx.phone_number || '',
      `"${(tx.reason || '').replace(/"/g, '""')}"`,
      tx.creator_name || '',
      tx.status === 'confirmed' ? 'معتمد' : tx.status === 'cancelled' ? 'ملغى' : 'معلق',
      `"${(tx.note || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `كشف_حساب_محطة_الاتحادية_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('تم تصدير جدول البيانات بنجاح', 'success');
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

  return (
    <div className="space-y-2.5 pb-28 text-right">
      {/* 1. Compact Top Banner & Action Controls */}
      <div className="luxury-card rounded-[22px] p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Coins className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h2 className="text-xs sm:text-sm font-black text-white truncate">
              دفتر الصناديق والقيود المالية
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-[#F5C84C] border border-[#F5C84C]/40 font-black shrink-0">
              {filteredTransactions.length} سند
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsMoreToolsOpen(prev => !prev)}
            className="btn-cancel px-2.5 py-1 rounded-xl text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
            title="إظهار أو إخفاء الأدوات المالية الإضافية"
          >
            <span>أدوات مالية</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                isMoreToolsOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Primary 3 Buttons Always Visible */}
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={onOpenNewVoucher}
            className="btn-gold flex items-center justify-center gap-1 py-2 px-2 rounded-xl text-[11px] font-black transition active:scale-95 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">سند جديد</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setManualRateStr(String(exchangeRate || 3.8));
              setShowConverter(prev => !prev);
            }}
            className={`flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-[11px] font-black transition active:scale-95 cursor-pointer ${
              showConverter ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
            <span className="truncate">صرف العملة</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDailyReport(true)}
            className="btn-cancel flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-[11px] font-black transition active:scale-95 cursor-pointer"
          >
            <Calendar className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
            <span className="truncate">التقرير اليومي</span>
          </button>
        </div>

        {/* Collapsible Secondary Tools (تفتح فقط عند الضغط على السهم) */}
        {isMoreToolsOpen && (
          <div className="pt-2 border-t border-white/15 grid grid-cols-2 gap-2 animate-fadeIn">
            <button
              type="button"
              onClick={() => setShowMoneyTransferModal(true)}
              className="btn-gold flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>حوالة مالية / أمانة 💸</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setManualRateStr(String(exchangeRate || 3.8));
                setShowConverter(!showConverter);
              }}
              className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[#F5C84C]" />
              <span>محوّل وسعر الصرف اليدوي</span>
            </button>

            {onOpenCustomerAccounts && (
              <button
                type="button"
                onClick={onOpenCustomerAccounts}
                className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>حسابات الزبناء والكريدي</span>
              </button>
            )}

            {userRole === 'owner' && (
              <button
                type="button"
                onClick={exportToCSV}
                className="btn-cancel flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition active:scale-95 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>تصدير CSV</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Live Currency Converter & Manual Rate Editor Widget */}
      {showConverter && (
        <div className="luxury-card rounded-[20px] p-3.5 animate-fadeIn space-y-2.5 border border-[#F5C84C]/55">
          <div className="flex items-center justify-between border-b border-white/15 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-black text-[#F5C84C]">
              <ArrowRightLeft className="w-4 h-4 text-[#F5C84C]" />
              <span>صرف العملة وتعديل سعر الصرف يدوياً (درهم ⇄ أوقية)</span>
            </div>
            <button
              type="button"
              onClick={() => setShowConverter(false)}
              className="btn-cancel px-2.5 py-1 rounded-lg text-[10px] font-bold"
            >
              إغلاق ▲
            </button>
          </div>

          {/* Manual Exchange Rate Input Row */}
          <div className="bg-black/65 p-2.5 rounded-xl border border-[#F5C84C]/35 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-white">سعر الصرف اليدوي:</span>
              <span className="text-[10px] font-mono text-[#E6C37A]" dir="ltr">
                1 MAD =
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-1 max-w-[190px]">
              <input
                type="number"
                step="0.01"
                min="0.01"
                dir="ltr"
                value={manualRateStr}
                onChange={e => {
                  const val = e.target.value;
                  setManualRateStr(val);
                  const num = parseFloat(val);
                  if (!isNaN(num) && num > 0) {
                    setExchangeRate(num);
                  }
                }}
                className="w-full bg-black/80 border border-[#F5C84C]/60 focus:border-[#F5C84C] rounded-lg px-2.5 py-1 text-center font-mono font-black text-white text-xs"
              />
              <span className="text-[10px] font-mono font-bold text-[#68E399] shrink-0">MRU</span>
              <button
                type="button"
                onClick={() => {
                  const num = parseFloat(manualRateStr);
                  if (!isNaN(num) && num > 0) {
                    setExchangeRate(num);
                    showToast(`تم تثبيت سعر الصرف اليدوي: 1 درهم = ${num} أوقية`, 'success');
                  } else {
                    showToast('يرجى إدخال سعر صرف صحيح أكبر من 0', 'error');
                  }
                }}
                className="btn-gold px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0"
              >
                حفظ
              </button>
            </div>
          </div>

          {/* Conversion Amount Calculator Row */}
          <div className="grid grid-cols-3 gap-2 items-end text-xs">
            <div>
              <label className="text-[10px] text-white/80 block mb-1">المبلغ المراد صرفه:</label>
              <input
                type="number"
                value={calcAmount}
                onChange={(e) => setCalcAmount(e.target.value)}
                className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-[10px] text-white/80 block mb-1">من العملة:</label>
              <select
                value={calcFrom}
                onChange={(e) => setCalcFrom(e.target.value as 'MAD' | 'MRU')}
                className="w-full bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-white font-bold"
              >
                <option value="MAD">درهم (MAD)</option>
                <option value="MRU">أوقية (MRU)</option>
              </select>
            </div>

            <div className="bg-black/60 px-2.5 py-1.5 rounded-xl border border-[#2ECC71]/45 text-center">
              <span className="text-[9px] text-white/75 block">الصافي بعد الصرف:</span>
              <span className="text-xs font-black font-mono text-[#68E399]" dir="ltr">
                {convertCurrency(parseFloat(calcAmount) || 0, calcFrom, calcFrom === 'MAD' ? 'MRU' : 'MAD')} {calcFrom === 'MAD' ? 'MRU' : 'MAD'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 2. Compact Side-by-Side Dual Currency Boxes + Collapsible Per-Station Breakdown */}
      <div className="luxury-card rounded-[22px] p-3 space-y-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsStationBalancesOpen(prev => !prev)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsStationBalancesOpen(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <Store className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
            <span className="text-xs font-black text-white truncate">
              أرصدة الصناديق — {displayedBalances.label}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-[#F5C84C] font-black shrink-0">
            <span>تفصيل المحطات</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isStationBalancesOpen ? 'rotate-180' : ''
              }`}
            />
          </div>
        </div>

        {/* 2 Compact Boxes in 1 Row */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-black/55 border border-[#F5C84C]/40 rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[10px] text-white/80 font-bold">
              <span>صندوق الدرهم 🇲🇦</span>
              <span className="text-[#F5C84C] font-mono">MAD</span>
            </div>
            <div
              className={`text-sm sm:text-base font-black font-mono mt-0.5 ${
                displayedBalances.mad < 0 ? 'text-rose-400' : 'text-[#F5C84C]'
              }`}
              dir="ltr"
            >
              {hideAmounts ? '••••••' : displayedBalances.mad.toLocaleString()}{' '}
              <span className="text-[10px] font-sans text-white/80">درهم</span>
            </div>
          </div>

          <div className="bg-black/55 border border-[#2ECC71]/40 rounded-xl p-2.5">
            <div className="flex items-center justify-between text-[10px] text-white/80 font-bold">
              <span>صندوق الأوقية 🇲🇷</span>
              <span className="text-[#68E399] font-mono">MRU</span>
            </div>
            <div
              className={`text-sm sm:text-base font-black font-mono mt-0.5 ${
                displayedBalances.mru < 0 ? 'text-rose-400' : 'text-[#68E399]'
              }`}
              dir="ltr"
            >
              {hideAmounts ? '••••••' : displayedBalances.mru.toLocaleString()}{' '}
              <span className="text-[10px] font-sans text-white/80">أوقية</span>
            </div>
          </div>
        </div>

        {/* Collapsible Per-Station Balances List */}
        {isStationBalancesOpen && (
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

      {/* 3. Compact Search Bar + Collapsible Filters Toggle */}
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
                onChange={e => setFilterStation(e.target.value)}
                className="bg-black/60 border border-white/20 rounded-xl px-2 py-1.5 text-[11px] text-white focus:outline-none focus:border-[#F5C84C] font-bold"
              >
                <option value="all">كافة المحطات</option>
                {stations.map(st => (
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
                        <span>{new Date(tx.created_at).toLocaleString('ar-MA')}</span>
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

                        {userRole === 'owner' && !isCancelled && (
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
                              className="btn-delete p-1.5 rounded-lg transition"
                              title="إلغاء السند"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
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

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={detailTx}
        isOpen={Boolean(detailTx)}
        onClose={() => setDetailTx(null)}
      />
    </div>
  );
};
