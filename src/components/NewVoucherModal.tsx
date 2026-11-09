import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  ShoppingBag,
  Phone,
  FileText,
  Camera,
  AlertCircle,
  CheckCircle2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { TransactionType } from '../types/database';

interface NewVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: TransactionType;
  fixedStationId?: string;
}

export const NewVoucherModal: React.FC<NewVoucherModalProps> = ({
  isOpen,
  onClose,
  defaultType = 'cash_in',
  fixedStationId,
}) => {
  const {
    stations,
    currencies,
    selectedStationId,
    stationBalances,
    createTransaction,
    convertCurrency,
    exchangeRate,
    userRole,
    userAssignedStationId,
    t,
    language,
  } = useApp();

  const dir = (language === 'ar' || language === 'hassaniya') ? 'rtl' : 'ltr';

  const resolveStationId = () => {
    if (userRole === 'worker' && userAssignedStationId) return userAssignedStationId;
    if (fixedStationId && fixedStationId !== 'all') return fixedStationId;
    if (selectedStationId && selectedStationId !== 'all') return selectedStationId;
    return stations[0]?.id || '';
  };

  const [type, setType] = useState<TransactionType>(defaultType);
  const [stationId, setStationId] = useState<string>(resolveStationId());
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>('MAD');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

  useEffect(() => {
    const resolved = resolveStationId();
    setStationId(resolved);
    const st = stations.find(s => s.id === resolved);
    if (st) {
      setCurrency(st.default_currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    }
  }, [fixedStationId, selectedStationId, userRole, userAssignedStationId, stations, isOpen]);

  if (!isOpen) return null;

  const isOutflow = type === 'cash_out' || type === 'goods_payment';
  const numAmount = parseFloat(amount) || 0;
  const currentStationBalance = stationBalances[stationId]?.[currency] || 0;
  const resultingBalance = isOutflow
    ? currentStationBalance - numAmount
    : currentStationBalance + numAmount;
  const isCashboxEmptyOrInsufficient =
    isOutflow && numAmount > 0 && (currentStationBalance <= 0 || resultingBalance < 0);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!stationId) {
      setError('الرجاء اختيار المحطة أولاً');
      return;
    }

    if (!numAmount || numAmount <= 0) {
      setError('الرجاء إدخال مبلغ صحيح أكبر من الصفر');
      return;
    }

    if (isOutflow && !reason.trim()) {
      setError('سبب العملية إلزامي عند سحب أو صرف مبالغ من الصندوق');
      return;
    }

    setShowConfirm(true);
  };

  const handleFinalConfirm = async () => {
    const res = await createTransaction({
      station_id: stationId,
      type,
      amount: numAmount,
      currency,
      phone_number: phoneNumber.trim(),
      reason:
        reason.trim() || (type === 'cash_in' ? 'إيداع نقدي فلاكيس (+)' : 'سحب من لاكيس (-)'),
      photo_url: photoPreview || undefined,
      note: note.trim(),
    });

    if (!res.success) {
      setError(res.error || 'حدث خطأ أثناء حفظ العملية');
      setShowConfirm(false);
      return;
    }

    setAmount('');
    setPhoneNumber('');
    setReason('');
    setPhotoPreview('');
    setNote('');
    setShowConfirm(false);
    onClose();
  };

  const equivalentCurrency = currency === 'MAD' ? 'MRU' : 'MAD';
  const equivalentValue =
    numAmount > 0 ? convertCurrency(numAmount, currency, equivalentCurrency) : 0;
  const selectedStationName = stations.find(s => s.id === stationId)?.name || t('stationLabel', 'المحطة');

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-center p-2.5 sm:p-4 m-0 bg-black/85 backdrop-blur-md animate-fadeIn overflow-hidden"
      onClick={onClose}
    >
      <div
        dir={dir}
        className={`luxury-card border-2 border-[#D4AF37]/65 rounded-2xl w-[96%] max-w-[420px] max-h-[94dvh] p-3.5 overflow-hidden shadow-2xl flex flex-col justify-between gap-2.5 ${dir === 'rtl' ? 'text-right' : 'text-left'} m-0`}
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="pb-2 border-b border-white/15 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm sm:text-base font-black text-white truncate">
              {type === 'cash_in' ? `➕ ${t('voucherDepositTitle', 'إيداع فلاكيس')}` : type === 'cash_out' ? `➖ ${t('voucherWithdrawTitle', 'سحب من لاكيس')}` : `📦 ${t('voucherGoodsTitle', 'أداء سلع')}`}
            </h3>
            <span className="text-xs sm:text-sm text-[#F5C84C] font-black truncate">
              📍 {selectedStationName} (
              <span
                dir="ltr"
                className={
                  currentStationBalance < 0 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono'
                }
              >
                {currentStationBalance.toLocaleString('en-US')} {currency}
              </span>
              )
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-delete p-1.5 rounded-xl transition cursor-pointer shrink-0"
            aria-label={t('close', 'إغلاق')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form with Clear, Comfortable Boxes & Text */}
        <form
          onSubmit={handlePreSubmit}
          className="flex-1 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden text-xs sm:text-sm"
        >
          {error && (
            <div className="p-2 rounded-xl bg-rose-950/70 border border-rose-500/40 flex items-center gap-1.5 text-rose-200 text-xs sm:text-sm font-black shrink-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{error}</span>
            </div>
          )}

          {/* 1. المحطة */}
          <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-center gap-1.5 shrink-0">
            <label className="block text-xs sm:text-sm font-black truncate">📍 {t('stationLabel', 'المحطة')}</label>
            <select
              value={stationId}
              disabled={userRole === 'worker' || Boolean(fixedStationId && fixedStationId !== 'all')}
              onChange={e => {
                const nextId = e.target.value;
                setStationId(nextId);
                const st = stations.find(s => s.id === nextId);
                if (st) {
                  setCurrency(st.default_currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
                }
              }}
              className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-black text-white focus:outline-none disabled:opacity-60 truncate"
            >
              {stations.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.city})
                </option>
              ))}
            </select>
          </div>

          {/* 2. نوع العملية */}
          <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-center gap-1.5 shrink-0">
            <label className="block text-xs sm:text-sm font-black truncate">⚡ {t('operationTypeLabel', 'نوع العملية')}</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                data-btn-role="add"
                data-btn-role-fixed="true"
                data-btn-active={type === 'cash_in' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setType('cash_in')}
                className="btn-add py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
              >
                ➕ {t('btnDeposit', 'إيداع')}
              </button>
              <button
                type="button"
                data-btn-role="remove"
                data-btn-role-fixed="true"
                data-btn-active={type === 'cash_out' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setType('cash_out')}
                className="btn-delete py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
              >
                ➖ {t('btnWithdraw', 'سحب')}
              </button>
              <button
                type="button"
                data-btn-role="remove"
                data-btn-role-fixed="true"
                data-btn-active={type === 'goods_payment' ? 'true' : 'false'}
                data-btn-active-fixed="true"
                onClick={() => setType('goods_payment')}
                className="btn-delete py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer"
              >
                📦 {t('btnGoods', 'سلع')}
              </button>
            </div>
          </div>

          {/* 3. المبلغ حدا العملة */}
          <div className="grid grid-cols-12 gap-2.5 shrink-0">
            <div className="col-span-7 bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-center gap-1.5">
              <label className="block text-xs sm:text-sm font-black truncate">💰 {t('amountLabel', 'المبلغ')} *</label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={amount}
                onChange={e => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setAmount(val);
                }}
                placeholder="0.00"
                className="w-full bg-black/65 border-2 border-[#D4AF37]/60 rounded-xl px-3 py-2.5 text-base font-mono font-black text-white focus:outline-none text-center"
                dir="ltr"
              />
            </div>

            <div className="col-span-5 bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-center gap-1.5">
              <label className="block text-xs sm:text-sm font-black truncate">💱 {t('currencyLabel', 'العملة')}</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full bg-black/65 border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-xs sm:text-sm font-black text-[#F5C84C] focus:outline-none"
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 4. السبب / البيان */}
          <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-center gap-1.5 shrink-0">
            <label className="block text-xs sm:text-sm font-black truncate">
              📝 {t('reasonDescriptionLabel', 'السبب / البيان')} {isOutflow && <span className="text-rose-400">*</span>}
            </label>
            <input
              type="text"
              required={isOutflow}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder={isOutflow ? t('reasonOutflowPlaceholder', 'اكتب سبب السحب أو الصرف *') : t('reasonInflowPlaceholder', 'اكتب بيان العملية...')}
              className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-black text-white focus:outline-none"
            />
          </div>

          {/* 5. رقم الهاتف */}
          <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-center gap-1.5 shrink-0">
            <div className="flex items-center justify-between">
              <label className="block text-xs sm:text-sm font-black truncate">📞 {t('phoneOptionalLabel', 'رقم الهاتف (اختياري)')}</label>
              {isCashboxEmptyOrInsufficient && (
                <span className="text-xs font-black text-rose-400 truncate" dir="ltr">
                  ⚠️ {t('afterWithdrawWarning', 'بعد السحب:')} {resultingBalance.toLocaleString('en-US')} {currency}
                </span>
              )}
            </div>
            <input
              type="tel"
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              placeholder="0600000000"
              dir="ltr"
              className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-black text-white font-mono text-left focus:outline-none"
            />
          </div>

          {/* 6. زر التأكيد الكبير فالتحت */}
          <button
            type="submit"
            data-btn-role={type === 'cash_in' ? 'add' : 'remove'}
            data-btn-role-fixed="true"
            className={`${
              type === 'cash_in' ? 'btn-add' : 'btn-delete'
            } w-full py-3.5 px-4 rounded-xl font-black text-sm sm:text-base cursor-pointer shadow-md shrink-0`}
          >
            {type === 'cash_in' ? `✅ ${t('confirmDepositBtn', 'تأكيد الإيداع فلاكيس (+)')}` : `✅ ${t('confirmWithdrawBtn', 'تأكيد السحب من لاكيس (−)')}`}
          </button>
        </form>

        {/* Confirmation Modal Overlay (with Empty Cashbox Warning when applicable) */}
        {showConfirm && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 animate-fadeIn"
            onClick={() => setShowConfirm(false)}
          >
            <div
              className="luxury-card border border-[#F5C84C]/50 rounded-[26px] p-5 max-w-[410px] w-full shadow-2xl space-y-4 text-right"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 text-[#F5C84C]">
                <CheckCircle2 className="w-7 h-7 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-white">تأكيد تسجيل العملية فلاكيس</h4>
                  <p className="text-xs text-white/75">المحطة: {selectedStationName}</p>
                </div>
              </div>

              {isCashboxEmptyOrInsufficient && (
                <div className="p-3.5 rounded-2xl bg-rose-950/80 border-2 border-rose-500/60 space-y-1.5">
                  <div className="flex items-center gap-2 text-rose-200 font-black text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>تنبيه: لاكيس المحطة خاوية أو غير كافية!</span>
                  </div>
                  <p className="text-xs text-white font-bold leading-relaxed">
                    الرصيد الحالي في الصندوق هو{' '}
                    <span dir="ltr" className="font-mono font-black text-[#F5C84C]">
                      {currentStationBalance.toLocaleString('en-US')} {currency}
                    </span>
                    ، وعند تنفيذ هذه العملية سيصبح الرصيد بالسالب:{' '}
                    <span dir="ltr" className="font-mono font-black text-rose-400 text-sm">
                      {resultingBalance.toLocaleString('en-US')} {currency}
                    </span>
                  </p>
                  <p className="text-[11px] text-rose-200 font-semibold">
                    هل تريد المتابعة وتسجيل العملية على كل حال؟
                  </p>
                </div>
              )}

              <div className="bg-black/65 rounded-2xl p-4 border border-white/15 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-white/80">نوع العملية:</span>
                  <span className="font-bold text-white">
                    {type === 'cash_in'
                      ? '+ زيادة فلاكيس (قبض)'
                      : type === 'cash_out'
                      ? '− سحب من لاكيس (صرف)'
                      : '− أداء سلع وبضائع'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/80">المبلغ:</span>
                  <span
                    className={`font-black text-sm font-mono ${
                      isOutflow ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                    dir="ltr"
                  >
                    {isOutflow ? '-' : '+'}
                    {numAmount.toLocaleString('en-US')} {currency}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/80">رصيد لاكيس بعد العملية:</span>
                  <span
                    className={`font-black text-sm font-mono ${
                      resultingBalance < 0 ? 'text-rose-400' : 'text-[#F5C84C]'
                    }`}
                    dir="ltr"
                  >
                    {resultingBalance.toLocaleString('en-US')} {currency}
                  </span>
                </div>
                {reason && (
                  <div className="flex justify-between">
                    <span className="text-white/80">السبب:</span>
                    <span className="font-bold text-white">{reason}</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleFinalConfirm}
                  className={`flex-1 py-2.5 rounded-xl font-black text-xs transition cursor-pointer ${
                    isCashboxEmptyOrInsufficient ? 'btn-delete' : 'btn-gold'
                  }`}
                >
                  {isCashboxEmptyOrInsufficient
                    ? 'نعم، نفذ العملية (رصيد سالب)'
                    : 'تأكيد وحفظ السند'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirm(false)}
                  className="btn-cancel px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  تراجع
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
