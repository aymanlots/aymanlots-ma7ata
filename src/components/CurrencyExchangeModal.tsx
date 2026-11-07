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
    <div
      className="fixed inset-0 z-[130] flex justify-center items-stretch p-0 m-0 bg-black/85 backdrop-blur-md animate-fade-in overflow-hidden"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-full max-w-[430px] h-[100dvh] min-h-[100dvh] max-h-[100dvh] rounded-none luxury-card border-x-2 border-y-0 border-[#D4AF37]/65 p-2.5 relative overflow-hidden shadow-2xl m-0 flex flex-col justify-between text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-black/10 dark:border-white/15 shrink-0">
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
          className="flex-1 flex flex-col justify-between gap-1.5 py-1.5 min-h-0 overflow-hidden text-xs sm:text-sm"
        >
          {/* 1. المحطة + أرصدة الصندوق */}
          <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-black dark:text-white flex items-center gap-1 shrink-0">
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

          {/* 2. العملة المستلمة (+) */}
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex flex-col justify-center shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black">📥 العملة المستلمة (+)</span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20">
                يدخل للصندوق
              </span>
            </div>
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value as ExchangeCurrency)}
              className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-black/70 border border-emerald-500/40 text-xs font-black text-black dark:text-white outline-none"
            >
              <option value="MAD">🇲🇦 درهم مغربي (MAD)</option>
              <option value="MRU">🇲🇷 أوقية موريتانية (MRU)</option>
              <option value="EUR">🇪🇺 أورو (EUR)</option>
            </select>
          </div>

          {/* 3. المبلغ المستلم */}
          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex flex-col justify-center shrink-0">
            <label className="block text-xs font-black mb-1">💰 المبلغ المستلم *</label>
            <input
              type="number"
              step="any"
              required
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              placeholder="0.00"
              dir="ltr"
              className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-black/80 border-2 border-emerald-500/50 text-sm font-black font-mono text-center text-black dark:text-white outline-none focus:border-emerald-500"
            />
          </div>

          {/* 4. العملة المسلمة (−) + زر عكس العملتين */}
          <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/35 flex flex-col justify-center shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black">📤 العملة المسلمة (−)</span>
              <button
                type="button"
                onClick={handleSwapCurrencies}
                title="عكس العملتين"
                className="px-2 py-0.5 rounded-lg bg-[#D4AF37] text-black text-[10px] font-black flex items-center gap-1 shadow-sm"
              >
                <ArrowLeftRight className="w-3 h-3" /> عكس العملتين
              </button>
            </div>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value as ExchangeCurrency)}
              className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-black/70 border border-amber-500/40 text-xs font-black text-black dark:text-white outline-none"
            >
              <option value="MRU">🇲🇷 أوقية موريتانية (MRU)</option>
              <option value="MAD">🇲🇦 درهم مغربي (MAD)</option>
              <option value="EUR">🇪🇺 أورو (EUR)</option>
            </select>
          </div>

          {/* 5. سعر الصرف + الصافي المسلم */}
          <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 flex flex-col justify-center shrink-0">
            <div className="grid grid-cols-2 gap-2 items-center">
              <div>
                <label className="block text-[11px] font-black mb-1 truncate">
                  ⚖️ سعر الصرف (1 {fromCurrency} =)
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={rate}
                  onChange={(e) => setRate(e.target.value)}
                  dir="ltr"
                  className="w-full px-2 py-2 rounded-xl bg-white dark:bg-black/70 border border-black/25 dark:border-white/25 text-xs font-black font-mono text-center text-black dark:text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black mb-1 truncate">
                  💸 الصافي المسلم ({toCurrency})
                </label>
                <div
                  dir="ltr"
                  className="w-full px-2 py-2 rounded-xl bg-black/10 dark:bg-black/70 border border-amber-500/50 text-xs font-black font-mono text-center truncate"
                >
                  {calculatedToAmount > 0 ? calculatedToAmount.toLocaleString() : '0.00'}
                </div>
              </div>
            </div>
          </div>

          {/* 6. اسم الزبون */}
          <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/15 dark:border-white/15 flex flex-col justify-center shrink-0">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-black truncate">👤 اسم الزبون (اختياري)</label>
              {calculatedToAmount > availableToBalance && (
                <span className="text-[10px] font-black text-rose-400 truncate">
                  ⚠️ رصيد {toCurrency} أقل من المطلوب
                </span>
              )}
            </div>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="اسم الزبون..."
              className="w-full px-2.5 py-2 rounded-xl bg-white dark:bg-black/70 border border-black/25 dark:border-white/25 text-xs font-black text-black dark:text-white outline-none"
            />
          </div>

          {(errorMsg || successMsg) && (
            <div className="p-1.5 rounded-xl bg-black/40 border border-white/20 text-xs font-black text-center shrink-0 truncate">
              {errorMsg ? `⚠️ ${errorMsg}` : successMsg}
            </div>
          )}

          {/* 7. زر التأكيد الكبير فالتحت */}
          <button
            type="submit"
            disabled={isSubmitting || parsedFrom <= 0}
            data-btn-role="add"
            data-btn-role-fixed="true"
            className="btn-add w-full py-3 rounded-xl font-black text-sm shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <span>✅ تأكيد وصرف العملة الآن</span>
            {calculatedToAmount > 0 && (
              <span className="font-mono text-xs bg-black/15 px-2 py-0.5 rounded-lg" dir="ltr">
                {parsedFrom} {fromCurrency} ➔ {calculatedToAmount} {toCurrency}
              </span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
