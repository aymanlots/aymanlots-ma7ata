import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, Transaction } from '../types/database';
import { ParcelStickerModal } from './ParcelStickerModal';
import { ParcelDetailModal } from './ParcelDetailModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import {
  Plus,
  Minus,
  Store,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
  Package,
  ShieldCheck,
  Search,
  QrCode,
  RotateCcw,
  X,
  MessageCircle,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';

interface WorkerStationViewProps {
  onOpenNewVoucher: () => void;
  onOpenNewParcel: () => void;
  onGoToParcels: () => void;
  onGoToCash: () => void;
}

export const WorkerStationView: React.FC<WorkerStationViewProps> = ({
  onOpenNewVoucher,
  onOpenNewParcel,
  onGoToParcels,
  onGoToCash,
}) => {
  const {
    currentUser,
    currentWorkspace,
    stations,
    selectedStationId,
    stationBalances,
    currencies,
    transactions,
    parcels,
    exchangeRate,
    hideAmounts,
    showToast,
  } = useApp();

  const [selectedCurrency, setSelectedCurrency] = useState<string>('MAD');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showScanner, setShowScanner] = useState<boolean>(false);
  const [activeBottomSheet, setActiveBottomSheet] = useState<'in' | 'out' | 'return' | null>(null);
  const [selectedParcelForReceipt, setSelectedParcelForReceipt] = useState<Parcel | null>(null);
  const [selectedParcelDetail, setSelectedParcelDetail] = useState<Parcel | null>(null);
  const [selectedTxDetail, setSelectedTxDetail] = useState<Transaction | null>(null);

  // Collapsible sections state (collapsed by default)
  const [isUnclaimedOpen, setIsUnclaimedOpen] = useState<boolean>(false);
  const [visibleUnclaimedCount, setVisibleUnclaimedCount] = useState<number>(10);
  const [isRecentOpsOpen, setIsRecentOpsOpen] = useState<boolean>(false);
  const [visibleRecentOpsCount, setVisibleRecentOpsCount] = useState<number>(10);

  useEffect(() => {
    if (searchQuery.trim() !== '') {
      setIsRecentOpsOpen(true);
    }
  }, [searchQuery]);

  const unclaimedDaysThreshold = currentWorkspace?.unclaimed_days_threshold ?? 7;
  const currentStation = stations.find((s) => s.id === selectedStationId) || stations[0];
  const balances = currentStation ? stationBalances[currentStation.id] || {} : {};
  const activeCurrencies = currencies.filter((c) => c.is_active);

  // Parcels related to this station
  const stationParcels = useMemo(() => {
    return parcels.filter(
      (p) =>
        !p.is_collaborator_data &&
        (p.origin_station_id === currentStation?.id || p.destination_station_id === currentStation?.id)
    );
  }, [parcels, currentStation?.id]);

  // Unclaimed arrived parcels at this station
  const arrivedUncollectedParcels = useMemo(() => {
    return stationParcels.filter(
      (p) =>
        p.destination_station_id === currentStation?.id &&
        p.status === 'arrived'
    );
  }, [stationParcels, currentStation?.id]);

  // Overdue unclaimed parcels (> unclaimedDaysThreshold days)
  const overdueUnclaimedParcels = useMemo(() => {
    const nowMs = Date.now();
    const thresholdMs = unclaimedDaysThreshold * 24 * 60 * 60 * 1000;
    return arrivedUncollectedParcels.filter((p) => {
      const arrivedEntry = [...(p.status_history || [])]
        .reverse()
        .find((h) => h.status === 'arrived');
      const refDate = arrivedEntry ? new Date(arrivedEntry.timestamp).getTime() : new Date(p.created_at).getTime();
      return nowMs - refDate >= thresholdMs;
    });
  }, [arrivedUncollectedParcels, unclaimedDaysThreshold]);

  // Search filtering
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return stationParcels
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
  }, [searchQuery, stationParcels]);

  // Combined operations in this station
  const recentOperations = useMemo(() => {
    const txItems = transactions
      .filter((t) => !t.is_collaborator_data && t.station_id === currentStation?.id)
      .map((t) => ({
        id: `tx-${t.id}`,
        kind: 'tx' as const,
        created_at: t.created_at,
        title: t.reason || t.person_name || 'سند صندوق نقدي',
        subtitle:
          t.type === 'cash_in'
            ? 'سند قبض نقدي'
            : t.type === 'cash_out'
            ? 'سند صرف نقدي'
            : t.type === 'parcel_shipping_fee'
            ? 'تحصيل أجرة شحن'
            : t.type === 'parcel_cod_collection'
            ? 'تحصيل قيمة بضاعة'
            : 'عملية صندوق',
        amount: t.amount ?? 0,
        currency: t.currency,
        isPositive: ['cash_in', 'parcel_shipping_fee', 'parcel_cod_collection'].includes(t.type),
        tx: t,
      }));

    const parcelItems = stationParcels.map((p) => ({
      id: `p-${p.id}`,
      kind: 'parcel' as const,
      created_at: p.created_at,
      title: `كولي #${p.parcel_number || p.tracking_code} — ${p.receiver_name}`,
      subtitle:
        p.status === 'pending' || p.status === 'registered'
          ? 'في المحطة'
          : p.status === 'in_transit'
          ? 'في الطريق'
          : p.status === 'arrived'
          ? 'وصلت المحطة'
          : p.status === 'delivered'
          ? 'تم التسليم'
          : p.status === 'return_in_transit'
          ? 'في طريق الإرجاع'
          : p.status === 'returned'
          ? 'تم الإرجاع للمرسل'
          : 'ملغاة',
      amount: p.amount_due ?? p.shipping_fee ?? 0,
      currency: p.currency,
      isPositive: true,
      parcel: p,
    }));

    return [...txItems, ...parcelItems].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [transactions, stationParcels, currentStation?.id]);

  const handleScanCode = (code: string) => {
    const cleaned = code.trim().toUpperCase();
    const found = stationParcels.find(
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

  if (!currentStation) {
    return (
      <div className="luxury-card p-10 text-center rounded-[24px] my-6">
        <Store className="w-12 h-12 text-[#F5C84C] mx-auto mb-3 opacity-80" />
        <h3 className="text-lg font-extrabold text-white mb-1">لم يتم تعيينك في أي محطة بعد</h3>
        <p className="text-sm text-white/80">يرجى التواصل مع مدير المحطة لتعيينك في محطة العمل الخاصة بك.</p>
      </div>
    );
  }

  const currentCurrencyBalance = balances[selectedCurrency] || 0;
  const formattedStationBalance = hideAmounts ? '••••' : currentCurrencyBalance.toLocaleString();

  return (
    <div className="space-y-4 pb-8">
      {/* 1. WORKER HEADER */}
      <div className="luxury-card rounded-[22px] p-4 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-11 h-11 rounded-2xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black text-base shadow-md shrink-0 leading-none select-none">
            <span>{(currentUser?.name || 'ع').trim().charAt(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm font-black text-white leading-snug break-words">
                {currentUser?.name || 'عامل المحطة'}
              </h2>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/50 text-[#F5C84C] border border-[#C9A24B]/40 shrink-0">
                العامل
              </span>
            </div>
            <p className="text-[11px] text-white/85 font-bold leading-relaxed break-words mt-0.5">
              {currentStation.name} • {currentStation.city}
            </p>
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/50 border border-white/15 text-xs font-extrabold text-[#F5C84C]">
            <Store className="w-3.5 h-3.5 text-[#F5C84C]" />
            {currentStation.city}
          </span>
        </div>
      </div>

      {/* 2. CARD "الصندوق" */}
      <div className="luxury-card rounded-[24px] p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#F5C84C]" />
            <h3 className="text-base font-black gold-text">الصندوق</h3>
          </div>

          {/* Currency Selector Pills */}
          <div className="flex items-center gap-1.5">
            {activeCurrencies.map((curr) => {
              const isSelected = selectedCurrency === curr.code;
              return (
                <button
                  key={curr.code}
                  type="button"
                  onClick={() => setSelectedCurrency(curr.code)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    isSelected ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  {curr.code === 'MAD' ? 'درهم (MAD)' : curr.code === 'MRU' ? 'أوقية (MRU)' : curr.label_ar}
                </button>
              );
            })}
          </div>
        </div>

        {/* Gold Balance Pill + Quick + and - Buttons */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onOpenNewVoucher}
            className="min-w-[52px] min-h-[52px] rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 active:scale-95"
            title="إدخال مبلغ للصندوق (سند قبض)"
          >
            <Plus className="w-5 h-5" />
            <span className="text-[10px] font-extrabold">إدخال</span>
          </button>

          <div
            onClick={onGoToCash}
            className="flex-1 min-w-0 overflow-hidden bg-black/50 border border-white/15 rounded-2xl py-2.5 px-3 text-center cursor-pointer shadow-lg flex flex-col justify-center"
          >
            <p className="text-[11px] font-extrabold text-white/80">الرصيد المتوفر حالياً</p>
            <p
              className="font-black text-[#F5C84C] tracking-tight mt-0.5"
              dir="ltr"
              style={{
                direction: 'ltr',
                unicodeBidi: 'isolate',
                whiteSpace: 'nowrap',
                fontSize: formattedStationBalance.length > 14 ? '0.75rem' : formattedStationBalance.length > 10 ? '0.9rem' : formattedStationBalance.length > 7 ? '1.1rem' : '1.35rem',
                lineHeight: '1.2',
              }}
            >
              {formattedStationBalance} <span className="text-xs font-sans font-bold text-white">{selectedCurrency}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenNewVoucher}
            className="min-w-[52px] min-h-[52px] rounded-2xl flex flex-col items-center justify-center transition-all cursor-pointer bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 active:scale-95"
            title="إخراج مبلغ من الصندوق (سند صرف)"
          >
            <Minus className="w-5 h-5" />
            <span className="text-[10px] font-extrabold">إخراج</span>
          </button>
        </div>

        <div className="flex items-center justify-between text-[11px] text-white/80 pt-2 border-t border-white/15 flex-wrap gap-2">
          <span>سعر الصرف المرجعي: 1 درهم = {exchangeRate} أوقية</span>
          <button
            type="button"
            onClick={onGoToCash}
            className="px-3 py-1.5 rounded-xl font-extrabold text-xs btn-cancel hover:text-[#F5C84C] cursor-pointer"
          >
            فتح سجل الصندوق ←
          </button>
        </div>
      </div>

      {/* 4. CARD "الطلبات" WITH THREE BIG BUTTONS: إدخال / إرسال / إرجاع */}
      <div className="luxury-card rounded-[24px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black gold-text">الطلبات والعمليات السريعة</h3>
          <span className="text-xs text-white/80 font-bold">اختر نوع العملية</span>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {/* زر إدخال */}
          <button
            type="button"
            onClick={() => setActiveBottomSheet('in')}
            className="min-h-[84px] rounded-[20px] p-3 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 hover:bg-emerald-500/25 active:scale-95"
          >
            <ArrowDownLeft className="w-5 h-5" />
            <span className="text-xs font-black">إدخال</span>
            <span className="text-[10px] font-bold">استلام أو قبض</span>
          </button>

          {/* زر إرسال */}
          <button
            type="button"
            onClick={() => setActiveBottomSheet('out')}
            className="min-h-[84px] rounded-[20px] p-3 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-lg bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 active:scale-95"
          >
            <ArrowUpRight className="w-5 h-5" />
            <span className="text-xs font-black">إرسال</span>
            <span className="text-[10px] font-extrabold">كولي جديد أو صرف</span>
          </button>

          {/* زر إرجاع */}
          <button
            type="button"
            onClick={() => setActiveBottomSheet('return')}
            className="min-h-[84px] rounded-[20px] p-3 flex flex-col items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md relative bg-blue-500/15 text-blue-300 border border-blue-500/35 hover:bg-blue-500/25 active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
            <span className="text-xs font-black">إرجاع ({overdueUnclaimedParcels.length})</span>
            <span className="text-[10px] font-bold">إرجاع للمرسل</span>
          </button>
        </div>
      </div>

      {/* 5. COLLAPSIBLE: "آخر العمليات (عدد العمليات)" AT BOTTOM */}
      <div className="luxury-card rounded-[24px] p-4 sm:p-5">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsRecentOpsOpen((prev) => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setIsRecentOpsOpen((prev) => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#F5C84C] shrink-0" />
            <h3 className="text-sm sm:text-base font-black text-white">
              آخر العمليات ({recentOperations.length})
            </h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              isRecentOpsOpen ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isRecentOpsOpen && (
          <div className="mt-4 pt-3 border-t border-white/15 space-y-3">
            <div className="flex items-center justify-end gap-2 text-xs font-extrabold">
              <button type="button" onClick={onGoToParcels} className="px-3 py-1.5 rounded-xl">
                كل الكوليات
              </button>
              <button type="button" onClick={onGoToCash} className="px-3 py-1.5 rounded-xl">
                سجل الصندوق
              </button>
            </div>

            {recentOperations.length === 0 ? (
              <div className="py-6 text-center text-xs text-white/75">
                لا توجد عمليات مسجلة في هذه المحطة حتى الآن.
              </div>
            ) : (
              <>
                <div className="space-y-2.5">
                  {recentOperations.slice(0, visibleRecentOpsCount).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (item.kind === 'parcel' && item.parcel) {
                          setSelectedParcelDetail(item.parcel);
                        } else if (item.kind === 'tx' && item.tx) {
                          setSelectedTxDetail(item.tx);
                        }
                      }}
                      className="p-3.5 rounded-2xl bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-between gap-3 cursor-pointer transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                            item.kind === 'parcel'
                              ? 'bg-[#F5C84C]/20 text-[#F5C84C] border border-[#F5C84C]/40'
                              : item.isPositive
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {item.kind === 'parcel' ? (
                            <Package className="w-5 h-5" />
                          ) : item.isPositive ? (
                            <ArrowDownLeft className="w-5 h-5" />
                          ) : (
                            <ArrowUpRight className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-extrabold text-white line-clamp-2 break-words leading-snug">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-white/75 mt-0.5 flex items-center gap-1 flex-wrap">
                            <span>{item.subtitle}</span>
                            <span>•</span>
                            <span
                              className="font-mono"
                              dir="ltr"
                              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                            >
                              {(() => {
                                const d = new Date(item.created_at);
                                if (isNaN(d.getTime())) return item.created_at;
                                return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
                              })()}
                            </span>
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-left">
                        <span
                          className="inline-block px-2.5 py-1 rounded-full gold-pill font-black text-xs font-mono"
                          dir="ltr"
                          style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                        >
                          {hideAmounts ? '••••' : item.amount.toLocaleString()} {item.currency}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {recentOperations.length > visibleRecentOpsCount && (
                  <button
                    type="button"
                    onClick={() => setVisibleRecentOpsCount((prev) => prev + 10)}
                    className="w-full py-2.5 rounded-xl text-xs font-black cursor-pointer"
                  >
                    عرض المزيد ({recentOperations.length - visibleRecentOpsCount} متبقية)
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* BOTTOM SHEET FOR "إدخال" / "إرسال" / "إرجاع" */}
      {activeBottomSheet && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-end sm:items-center justify-center p-4"
          onClick={() => setActiveBottomSheet(null)}
        >
          <div
            className="luxury-card w-full max-w-md rounded-[24px] p-5 space-y-4 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <h3 className="text-base font-black gold-text">
                {activeBottomSheet === 'in'
                  ? 'إدخال — اختر نوع العملية'
                  : activeBottomSheet === 'out'
                  ? 'إرسال — اختر نوع العملية'
                  : 'إرجاع كولي لم يستلمه صاحبه'}
              </h3>
              <button
                type="button"
                onClick={() => setActiveBottomSheet(null)}
                className="btn-cancel p-1.5 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {activeBottomSheet === 'in' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBottomSheet(null);
                    onGoToParcels();
                  }}
                  className="w-full min-h-[56px] p-4 rounded-2xl flex items-center justify-between text-right cursor-pointer bg-black/60 hover:bg-black/80 border border-white/15 transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">استلام كولي وارد في المحطة</p>
                      <p className="text-xs font-bold text-white/70">تأكيد وصول الكولي أو تسليمه للمستلم</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-[#F5C84C]">فتح الكوليات ←</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveBottomSheet(null);
                    onOpenNewVoucher();
                  }}
                  className="w-full min-h-[56px] p-4 rounded-2xl flex items-center justify-between text-right cursor-pointer bg-black/60 hover:bg-black/80 border border-white/15 transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center justify-center">
                      <ArrowDownLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">سند قبض نقدي (إدخال مال للصندوق)</p>
                      <p className="text-xs font-bold text-white/70">تسجيل مبلغ وارد بالدرهم أو الأوقية</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-emerald-300">تسجيل قبض ←</span>
                </button>
              </div>
            )}

            {activeBottomSheet === 'out' && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveBottomSheet(null);
                    onOpenNewParcel();
                  }}
                  className="w-full min-h-[56px] p-4 rounded-2xl flex items-center justify-between text-right cursor-pointer bg-black/60 hover:bg-black/80 border border-white/15 transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center">
                      <Package className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">إرسال كولي جديد</p>
                      <p className="text-xs font-bold text-white/70">إنشاء تذكرة كولي وطباعة الملصق الحراري</p>
                    </div>
                  </div>
                  <span className="text-xs font-black text-amber-300">ابدأ ←</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveBottomSheet(null);
                    onOpenNewVoucher();
                  }}
                  className="w-full min-h-[56px] p-4 rounded-2xl flex items-center justify-between text-right cursor-pointer bg-black/60 hover:bg-black/80 border border-white/15 transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center justify-center">
                      <ArrowUpRight className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-white">سند صرف نقدي (إخراج مال من الصندوق)</p>
                      <p className="text-xs font-bold text-white/70">تسجيل مصاريف أو دفع بضاعة</p>
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-rose-300">تسجيل صرف ←</span>
                </button>
              </div>
            )}

            {activeBottomSheet === 'return' && (
              <div className="space-y-3">
                <p className="text-xs text-white/80">
                  اختر كولياً واصلاً لم يستلمه صاحبه لبدء إجراءات الإرجاع إلى المرسل مع تحديد السبب:
                </p>
                {arrivedUncollectedParcels.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-black/50 text-center text-xs text-white/80">
                    لا توجد حالياً كوليات في حالة «وصلت المحطة» بانتظار الاستلام في هذه المحطة.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {arrivedUncollectedParcels.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setActiveBottomSheet(null);
                          setSelectedParcelDetail(p);
                        }}
                        className="w-full p-3 rounded-xl bg-black/50 hover:bg-black/70 border border-white/15 flex items-center justify-between text-right cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-[#F5C84C] font-mono" dir="ltr">
                            #{p.parcel_number || '—'} • {p.tracking_code}
                          </p>
                          <p className="text-xs font-bold text-white mt-0.5 line-clamp-2 break-words">
                            المستلم: {p.receiver_name} ← المرسل: {p.sender_name}
                          </p>
                        </div>
                        <span className="text-xs font-extrabold text-[#F5C84C] shrink-0">إرجاع إلى المرسل ←</span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveBottomSheet(null);
                    onGoToParcels();
                  }}
                  className="w-full py-2.5 rounded-xl text-xs font-extrabold btn-cancel text-center cursor-pointer hover:border-[#D4AF37]/50"
                >
                  عرض جميع الكوليات والمرجعات
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* QR SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={showScanner}
        title="مسح رمز الكولي (QR)"
        subtitle="وجّه الكاميرا نحو ملصق الكولي لفتح تفاصيله مباشرة"
        onClose={() => setShowScanner(false)}
        onScan={handleScanCode}
      />

      {/* PARCEL STICKER MODAL */}
      {selectedParcelForReceipt && (
        <ParcelStickerModal
          isOpen={!!selectedParcelForReceipt}
          parcel={selectedParcelForReceipt}
          onClose={() => setSelectedParcelForReceipt(null)}
        />
      )}

      {/* PARCEL DETAIL MODAL */}
      <ParcelDetailModal
        isOpen={!!selectedParcelDetail}
        parcel={selectedParcelDetail}
        onClose={() => setSelectedParcelDetail(null)}
        onOpenTicket={(parcel: Parcel) => {
          setSelectedParcelDetail(null);
          setSelectedParcelForReceipt(parcel);
        }}
      />

      {/* TRANSACTION DETAIL MODAL */}
      <TransactionDetailModal
        isOpen={!!selectedTxDetail}
        transaction={selectedTxDetail}
        onClose={() => setSelectedTxDetail(null)}
      />
    </div>
  );
};
