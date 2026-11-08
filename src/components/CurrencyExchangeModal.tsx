import React, { useState, useEffect, useMemo } from 'react';
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
  const [rate, setRate] = useState<string>('');
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

  const parsedFrom = parseFloat(fromAmount) || 0;
  const parsedRate = parseFloat(rate) || 0;

  // حساب المبلغ المحول أوتوماتيكياً حسب تسعيرة الصرف المدخلة
  const calculatedToAmount = useMemo(() => {
    if (parsedFrom <= 0 || parsedRate <= 0) return 0;
    if (fromCurrency === 'MRU' && toCurrency === 'MAD') {
      // إذا أدخل المستخدم 4 (أي 4 أوقية لكل درهم) يقسم، وإذا أدخل 0.25 يضرب
      if (parsedRate >= 1) {
        return Number((parsedFrom / parsedRate).toFixed(2));
      } else {
        return Number((parsedFrom * parsedRate).toFixed(2));
      }
    }
    if (fromCurrency === 'MAD' && toCurrency === 'MRU') {
      // إذا أدخل المستخدم 4 (أي 4 أوقية لكل درهم) يضرب، وإذا أدخل 0.25 يقسم
      if (parsedRate >= 1) {
        return Number((parsedFrom * parsedRate).toFixed(2));
      } else {
        return Number((parsedFrom / parsedRate).toFixed(2));
      }
    }
    return Number((parsedFrom * parsedRate).toFixed(2));
  }, [parsedFrom, parsedRate, fromCurrency, toCurrency]);

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
      setErrorMsg('المرجو إدخال المبلغ وتسعيرة الصرف بشكل صحيح');
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
        note: `صرف مباشر: استلام ${parsedFrom} ${fromCurrency} وتسليم ${calculatedToAmount} ${toCurrency} (تسعيرة الصرف: ${parsedRate})`,
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex justify-center items-center p-2.5 sm:p-4 m-0 bg-black/85 backdrop-blur-md animate-fade-in overflow-hidden"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-[96%] max-w-[420px] max-h-[94dvh] rounded-2xl luxury-card border-2 border-[#D4AF37]/65 p-3.5 relative overflow-hidden shadow-2xl m-0 flex flex-col justify-between gap-2.5 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/10 dark:border-white/15 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-lg">💱</span>
            <h3 className="text-sm sm:text-base font-black text-black dark:text-white truncate">
              تحويل وصرف العملة
            </h3>
            <HelpPopover
              title="كيفاش كيخدم صرف العملة؟"
              text="هاد النافذة كتزيد العملة اللي شديتي من الزبون فالصندوق (+) وكتنقص العملة اللي عطيتيه (-) أوتوماتيكياً فـ حركة وحدة مضبوطة."
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-delete p-1.5 rounded-xl flex items-center justify-center transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden text-xs sm:text-sm"
        >
          {/* 1. المحطة + أرصدة الصندوق */}
          <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs sm:text-sm font-black text-black dark:text-white flex items-center gap-1 shrink-0">
                📍 المحطة:
              </span>
              <select
                value={activeStation?.id || ''}
                onChange={(e) => setStationId(e.target.value)}
                disabled={userRole === 'worker' && !!workerStationId}
                className="flex-1 min-w-0 px-2.5 py-2 rounded-xl bg-white dark:bg-black/60 border border-black/20 dark:border-white/20 text-xs sm:text-sm font-black text-black dark:text-white outline-none focus:border-[#D4AF37]"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-center">
              {(['MAD', 'MRU', 'EUR'] as ExchangeCurrency[]).map((curr) => (
                <div
                  key={curr}
                  className={`py-1.5 px-2 rounded-xl border ${
                    toCurrency === curr
                      ? 'bg-[#D4AF37]/15 border-[#D4AF37]'
                      : 'bg-white/80 dark:bg-black/40 border-black/10 dark:border-white/10'
                  }`}
                >
                  <div className="text-[10px] font-black text-black/60 dark:text-white/60">{curr}</div>
                  <div className="text-xs sm:text-sm font-black font-mono text-black dark:text-white truncate" dir="ltr">
                    {(currentBalances[curr] || 0).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. العملة المستلمة (+) حدا العملة المسلمة (−) */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex flex-col justify-between gap-1.5">
              <span className="text-xs sm:text-sm font-black truncate">📥 العملة المستلمة (+)</span>
              <select
                value={fromCurrency}
                onChange={(e) => setFromCurrency(e.target.value as ExchangeCurrency)}
                className="w-full px-2.5 py-2.5 rounded-xl bg-white dark:bg-black/70 border border-emerald-500/40 text-xs sm:text-sm font-black text-black dark:text-white outline-none"
              >
                <option value="MAD">🇲🇦 درهم (MAD)</option>
                <option value="MRU">🇲🇷 أوقية (MRU)</option>
                <option value="EUR">🇪🇺 أورو (EUR)</option>
              </select>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs sm:text-sm font-black truncate">📤 المسلمة (−)</span>
                <button
                  type="button"
                  onClick={handleSwapCurrencies}
                  title="عكس العملتين"
                  className="px-2 py-0.5 rounded-lg bg-[#D4AF37] text-black text-[10px] font-black flex items-center gap-1 shadow-sm shrink-0"
                >
                  <ArrowLeftRight className="w-3 h-3" /> عكس
                </button>
              </div>
              <select
                value={toCurrency}
                onChange={(e) => setToCurrency(e.target.value as ExchangeCurrency)}
                className="w-full px-2.5 py-2.5 rounded-xl bg-white dark:bg-black/70 border border-amber-500/40 text-xs sm:text-sm font-black text-black dark:text-white outline-none"
              >
                <option value="MRU">🇲🇷 أوقية (MRU)</option>
                <option value="MAD">🇲🇦 درهم (MAD)</option>
                <option value="EUR">🇪🇺 أورو (EUR)</option>
              </select>
            </div>
          </div>

          {/* 3. المبلغ المستلم + خانة تسعيرة الصرف */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex flex-col justify-between gap-1.5">
              <label className="block text-xs sm:text-sm font-black truncate">💰 المبلغ المراد صرفه *</label>
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

            <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 flex flex-col justify-between gap-1.5">
              <label className="block text-xs sm:text-sm font-black truncate text-amber-500 dark:text-amber-400">
                📊 تسعيرة الصرف *
              </label>
              <input
                type="number"
                step="any"
                required
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="تسعيرة الصرف..."
                dir="ltr"
                className="w-full px-2.5 py-2.5 rounded-xl bg-white dark:bg-black/70 border-2 border-amber-500/50 dark:border-amber-400/50 text-sm sm:text-base font-black font-mono text-center text-black dark:text-white outline-none focus:border-[#D4AF37]"
              />
            </div>
          </div>

          {/* 4. الحساب الأوتوماتيكي للصافي المسلم + اسم الزبون */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-amber-500/40 dark:border-amber-400/40 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <label className="block text-xs sm:text-sm font-black truncate text-emerald-600 dark:text-emerald-400">
                  ⚡ الصافي (محسوب أوتوماتيك)
                </label>
              </div>
              <div
                dir="ltr"
                className="w-full px-2.5 py-2.5 rounded-xl bg-emerald-500/10 dark:bg-emerald-950/40 border-2 border-emerald-500/50 text-sm sm:text-base font-black font-mono text-center text-emerald-600 dark:text-emerald-300 truncate"
              >
                {calculatedToAmount > 0 ? `${calculatedToAmount.toLocaleString('en-US')} ${toCurrency}` : `0.00 ${toCurrency}`}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 flex flex-col justify-between gap-1.5">
              <label className="block text-xs sm:text-sm font-black truncate">👤 اسم الزبون (اختياري)</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="اسم الزبون..."
                className="w-full px-2.5 py-2.5 rounded-xl bg-white dark:bg-black/70 border border-black/25 dark:border-white/25 text-xs sm:text-sm font-black text-black dark:text-white outline-none"
              />
            </div>
          </div>

          {(errorMsg || successMsg) && (
            <div className="p-2 rounded-xl bg-black/40 border border-white/20 text-xs sm:text-sm font-black text-center shrink-0 truncate">
              {errorMsg ? `⚠️ ${errorMsg}` : successMsg}
            </div>
          )}

          {/* 5. زر التأكيد الكبير فالتحت */}
          <button
            type="submit"
            disabled={isSubmitting || parsedFrom <= 0}
            data-btn-role="add"
            data-btn-role-fixed="true"
            className="btn-add w-full py-3.5 px-4 rounded-xl font-black text-sm sm:text-base shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
          >
            <span>✅ تأكيد وصرف العملة الآن</span>
            {calculatedToAmount > 0 && (
              <span className="font-mono text-xs sm:text-sm bg-black/15 px-2 py-0.5 rounded-lg" dir="ltr">
                {parsedFrom} {fromCurrency} ➔ {calculatedToAmount} {toCurrency}
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
