import React, { useState, useEffect } from 'react';
import { X, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { HelpPopover } from './HelpPopover';

type ExchangeCurrency = 'MAD' | 'MRU' | 'EUR';

interface CurrencyExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultStationId?: string;
}

export const CurrencyExchangeModal: React.FC<CurrencyExchangeModalProps> = ({
  isOpen,
  onClose,
  defaultStationId,
}) => {
  const { stations, userRole, userAssignedStationId, executeCurrencyExchange, stationBalances } = useApp();
  const workerStationId = userAssignedStationId || '';

  const [stationId, setStationId] = useState<string>(
    defaultStationId || workerStationId || stations[0]?.id || ''
  );
  const [fromCurrency, setFromCurrency] = useState<ExchangeCurrency>('MAD');
  const [toCurrency, setToCurrency] = useState<ExchangeCurrency>('MRU');
  const [fromAmount, setFromAmount] = useState<string>('');
  const [rate, setRate] = useState<string>('4');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (defaultStationId && defaultStationId !== 'all') {
      setStationId(defaultStationId);
    } else if (!stationId && (workerStationId || stations[0]?.id)) {
      setStationId(workerStationId || stations[0]?.id || '');
    }
  }, [defaultStationId, workerStationId, stations, stationId]);

  // Set smart default rate when switching currency pairs
  useEffect(() => {
    if (fromCurrency === 'MAD' && toCurrency === 'MRU') setRate('4');
    else if (fromCurrency === 'MRU' && toCurrency === 'MAD') setRate('0.25');
    else if (fromCurrency === 'EUR' && toCurrency === 'MAD') setRate('10.8');
    else if (fromCurrency === 'MAD' && toCurrency === 'EUR') setRate('0.092');
    else if (fromCurrency === 'EUR' && toCurrency === 'MRU') setRate('43');
    else if (fromCurrency === 'MRU' && toCurrency === 'EUR') setRate('0.023');
    else setRate('1');
  }, [fromCurrency, toCurrency]);

  if (!isOpen) return null;

  const parsedFrom = parseFloat(fromAmount) || 0;
  const parsedRate = parseFloat(rate) || 0;
  const calculatedToAmount = Number((parsedFrom * parsedRate).toFixed(2));

  const activeStation = stations.find(s => s.id === stationId) || stations[0];
  const currentBalances = activeStation ? (stationBalances[activeStation.id] || { MAD: 0, MRU: 0, EUR: 0 }) : { MAD: 0, MRU: 0, EUR: 0 };
  const availableToBalance = currentBalances[toCurrency] || 0;

  const handleSwapCurrencies = () => {
    const prevFrom = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(prevFrom);
    setErrorMsg('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!activeStation) {
      setErrorMsg('المرجو اختيار المحطة');
      return;
    }
    if (fromCurrency === toCurrency) {
      setErrorMsg('لا يمكن صرف نفس العملة');
      return;
    }
    if (parsedFrom <= 0 || parsedRate <= 0 || calculatedToAmount <= 0) {
      setErrorMsg('المرجو إدخال المبلغ وسعر الصرف بشكل صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await executeCurrencyExchange({
        stationId: activeStation.id,
        fromCurrency,
        toCurrency,
        fromAmount: parsedFrom,
        toAmount: calculatedToAmount,
        rate: parsedRate,
        customerName: customerName.trim() || 'زبون صرف مباشر',
        customerPhone: customerPhone.trim() || undefined,
        note: `صرف مباشر: استلام ${parsedFrom} ${fromCurrency} وتسليم ${calculatedToAmount} ${toCurrency}`,
      });

      if (!res.success) {
        setErrorMsg(res.error || 'تعذر تنفيذ عملية الصرف');
      } else {
        setSuccessMsg(`✅ تم الصرف: +${parsedFrom.toLocaleString()} ${fromCurrency} ➔ -${calculatedToAmount.toLocaleString()} ${toCurrency}`);
        setFromAmount('');
        setCustomerName('');
        setCustomerPhone('');
        setTimeout(() => {
          setSuccessMsg('');
          onClose();
        }, 1100);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء تنفيذ الصرف');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-1 sm:p-2 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div
        dir="rtl"
        className="w-[calc(100%-8px)] max-w-[420px] rounded-[22px] luxury-card border-2 border-[#D4AF37]/65 p-3 relative overflow-x-hidden shadow-[0_20px_50px_rgba(0,0,0,0.85)] my-auto"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 pb-2 mb-2.5 border-b border-black/10 dark:border-white/15">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base">💱</span>
            <h3 className="text-sm sm:text-base font-black text-black dark:text-white truncate">
              صرف العملة المباشر
            </h3>
            <HelpPopover
              title="كيفاش كيخدم صرف العملة؟"
              text="هاد النافذة كتزيد العملة اللي شديتي من الزبون فالصندوق (+) وكتنقص العملة اللي عطيتيه (-) أوتوماتيكياً فـ حركة وحدة مضبوطة."
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 hover:bg-red-500/20 text-black dark:text-white flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Station Selector + Live Cashbox Balances */}
        <div className="mb-2.5 p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[11px] font-black text-black dark:text-white flex items-center gap-1 shrink-0">
              📍 المحطة:
            </span>
            <select
              value={activeStation?.id || ''}
              onChange={(e) => setStationId(e.target.value)}
              disabled={userRole === 'worker' && !!workerStationId}
              className="flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-white dark:bg-black/60 border border-black/20 dark:border-white/20 text-xs font-black text-black dark:text-white outline-none focus:border-[#D4AF37]"
            >
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.city})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            {(['MAD', 'MRU', 'EUR'] as ExchangeCurrency[]).map((curr) => (
              <div
                key={curr}
                className={`py-1 px-1.5 rounded-lg border ${
                  toCurrency === curr
                    ? 'bg-[#D4AF37]/15 border-[#D4AF37]'
                    : 'bg-white/80 dark:bg-black/40 border-black/10 dark:border-white/10'
                }`}
              >
                <div className="text-[9px] font-black text-black/60 dark:text-white/60">{curr}</div>
                <div className="text-xs font-black font-mono text-black dark:text-white truncate" dir="ltr">
                  {(currentBalances[curr] || 0).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5">
          {/* 2-Column Main Exchange Grid (Same style as NewParcelModal / NewVoucherModal) */}
          <div className="grid grid-cols-2 gap-2 relative">
            {/* RIGHT COLUMN: What we receive (+) */}
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/35 space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">
                  📥 استلام (+)
                </span>
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-900 dark:text-emerald-200">
                  يدخل للصندوق
                </span>
              </div>

              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value as ExchangeCurrency)}
                className="w-full px-2 py-2 rounded-xl bg-white dark:bg-black/70 border border-emerald-500/40 text-xs sm:text-sm font-black text-black dark:text-white outline-none"
              >
                <option value="MAD">🇲🇦 درهم (MAD)</option>
                <option value="MRU">🇲🇷 أوقية (MRU)</option>
                <option value="EUR">🇪🇺 أورو (EUR)</option>
              </select>

              <div>
                <label className="block text-[10px] font-black text-black/70 dark:text-white/70 mb-0.5">
                  💰 المبلغ المستلم
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0.00"
                  dir="ltr"
                  className="w-full px-2.5 py-2.5 rounded-xl bg-white dark:bg-black/80 border-2 border-emerald-500/50 text-sm sm:text-base font-black font-mono text-center text-black dark:text-white outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* LEFT COLUMN: What we give (-) */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border-2 border-amber-500/35 space-y-2 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-900 dark:text-amber-300">
                  📤 تسليم (-)
                </span>
                <button
                  type="button"
                  onClick={handleSwapCurrencies}
                  title="عكس العملتين"
                  className="px-1.5 py-0.5 rounded bg-[#D4AF37] text-black text-[10px] font-black flex items-center gap-0.5 shadow-sm hover:brightness-110"
                >
                  <ArrowLeftRight className="w-3 h-3" /> عكس
                </button>
              </div>

              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value as ExchangeCurrency)}
                className="w-full px-2 py-2 rounded-xl bg-white dark:bg-black/70 border border-amber-500/40 text-xs sm:text-sm font-black text-black dark:text-white outline-none"
              >
                <option value="MRU">🇲🇷 أوقية (MRU)</option>
                <option value="MAD">🇲🇦 درهم (MAD)</option>
                <option value="EUR">🇪🇺 أورو (EUR)</option>
              </select>

              <div>
                <label className="block text-[10px] font-black text-black/70 dark:text-white/70 mb-0.5">
                  💸 الصافي المسلم
                </label>
                <div
                  dir="ltr"
                  className="w-full px-2.5 py-2.5 rounded-xl bg-black/10 dark:bg-black/70 border-2 border-amber-500/50 text-sm sm:text-base font-black font-mono text-center text-amber-800 dark:text-[#D4AF37] truncate"
                >
                  {calculatedToAmount > 0 ? calculatedToAmount.toLocaleString() : '0.00'}
                </div>
              </div>
            </div>
          </div>

          {/* Exchange Rate + Optional Customer Name/Phone in 1 Compact Box */}
          <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 space-y-2">
            <div className="grid grid-cols-2 gap-2 items-center">
              <div>
                <label className="block text-[11px] font-black text-black dark:text-white mb-0.5">
                  ⚖️ سعر الصرف (1 {fromCurrency} =)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  dir="ltr"
                  className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-black/70 border border-black/25 dark:border-white/25 text-xs sm:text-sm font-black font-mono text-center text-black dark:text-white outline-none focus:border-[#D4AF37]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-black dark:text-white mb-0.5">
                  👤 الزبون (اختياري)
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="اسم الزبون..."
                  className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-black/70 border border-black/25 dark:border-white/25 text-xs sm:text-sm font-black text-black dark:text-white outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            {calculatedToAmount > availableToBalance && (
              <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-[11px] font-black text-amber-900 dark:text-amber-300 text-center">
                ⚠️ تنبيه: رصيد {toCurrency} المتوفر ({availableToBalance.toLocaleString()}) أقل من المطلوب ({calculatedToAmount.toLocaleString()})
              </div>
            )}

            {errorMsg && (
              <div className="p-2 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-black text-red-700 dark:text-red-300 text-center">
                ⚠️ {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs font-black text-emerald-800 dark:text-emerald-200 text-center flex items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Big Unified Confirm Button */}
            <button
              type="submit"
              disabled={isSubmitting || parsedFrom <= 0}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B5952F] text-black font-black text-xs sm:text-sm shadow-md hover:brightness-110 active:scale-[0.99] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <span>✅ تأكيد وصرف العملة الآن</span>
              {calculatedToAmount > 0 && (
                <span className="font-mono text-xs bg-black/15 px-2 py-0.5 rounded-lg" dir="ltr">
                  {parsedFrom} {fromCurrency} ➔ {calculatedToAmount} {toCurrency}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
