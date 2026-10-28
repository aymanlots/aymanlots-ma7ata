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
  } = useApp();

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
  const selectedStationName = stations.find(s => s.id === stationId)?.name || 'المحطة';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="luxury-card border border-[#F5C84C]/45 rounded-[28px] w-full max-w-[425px] overflow-hidden shadow-2xl max-h-[92vh] flex flex-col text-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 bg-black/55 border-b border-white/15 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-black text-white">تسجيل عملية في لاكيس المحطة</h3>
            <p className="text-xs text-[#F5C84C] font-bold mt-0.5">
              المحطة: {selectedStationName} • الرصيد الحالي:{' '}
              <span
                dir="ltr"
                className={
                  currentStationBalance < 0 ? 'text-rose-400 font-mono' : 'text-emerald-400 font-mono'
                }
              >
                {currentStationBalance.toLocaleString('en-US')} {currency}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel p-2 rounded-xl transition cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handlePreSubmit} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 flex items-center gap-2 text-rose-200 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type Selector */}
          <div>
            <label className="block text-xs font-bold text-white/90 mb-2">
              نوع العملية فلاكيس (+ أو −)
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setType('cash_in')}
                className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition cursor-pointer ${
                  type === 'cash_in' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <div className="flex items-center gap-1 font-mono font-black text-sm">
                  <span>+</span>
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-black">+ زيادة فلاكيس</span>
              </button>

              <button
                type="button"
                onClick={() => setType('cash_out')}
                className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition cursor-pointer ${
                  type === 'cash_out' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <div className="flex items-center gap-1 font-mono font-black text-sm">
                  <span>−</span>
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-black">− سحب من لاكيس</span>
              </button>

              <button
                type="button"
                onClick={() => setType('goods_payment')}
                className={`p-2.5 rounded-xl flex flex-col items-center gap-1 transition cursor-pointer ${
                  type === 'goods_payment' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="text-[11px] font-black">أداء سلع (−)</span>
              </button>
            </div>
          </div>

          {/* Station & Currency */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-white/90 mb-1">المحطة</label>
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
                className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-[#F5C84C] disabled:opacity-60"
              >
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-white/90 mb-1">العملة</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs font-bold text-[#F5C84C] focus:outline-none focus:border-[#F5C84C]"
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>
                    {c.label_ar} ({c.code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Live warning when cashbox is empty / insufficient */}
          {isCashboxEmptyOrInsufficient && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 flex items-start gap-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-black text-rose-200">
                  تنبيه: لاكيس المحطة خاوية أو غير كافية ({currentStationBalance.toLocaleString('en-US')}{' '}
                  {currency})
                </p>
                <p className="text-white/90 font-bold">
                  إذا أكملت العملية سيصبح رصيد الصندوق:{' '}
                  <span dir="ltr" className="text-rose-400 font-mono font-black">
                    {resultingBalance.toLocaleString('en-US')} {currency}
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-white/90 mb-1">المبلغ المالي</label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0.01"
                required
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-black/65 border border-white/20 rounded-2xl px-4 py-3 text-xl font-black text-white focus:outline-none focus:border-[#F5C84C] text-left font-mono"
                dir="ltr"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-black bg-[#D4AF37]/20 text-[#F5C84C] px-2.5 py-1 rounded-lg">
                {currency}
              </span>
            </div>

            {numAmount > 0 && (currency === 'MAD' || currency === 'MRU') && (
              <div className="mt-2 px-3 py-1.5 rounded-xl bg-black/55 border border-white/15 flex items-center justify-between text-xs">
                <span className="text-white/80">القيمة المقابلة (بسعر {exchangeRate}):</span>
                <span className="font-bold text-emerald-400 font-mono" dir="ltr">
                  ≈ {equivalentValue.toLocaleString('en-US')} {equivalentCurrency}
                </span>
              </div>
            )}
          </div>

          {/* Reason & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-white/90 mb-1 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>البيان / سبب العملية {isOutflow && <span className="text-rose-400">*</span>}</span>
              </label>
              <input
                type="text"
                required={isOutflow}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={isOutflow ? 'مثال: مصاريف، تسليم مبلغ...' : 'مثال: دفعة زبون، تغذية الصندوق...'}
                className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F5C84C]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-white/90 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <span>رقم الهاتف (اختياري)</span>
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="+212 6XX-XXXXXX"
                dir="ltr"
                className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono text-left focus:outline-none focus:border-[#F5C84C]"
              />
            </div>
          </div>

          {/* Receipt Photo Attachment */}
          <div>
            <label className="block text-xs font-bold text-white/90 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>إرفاق صورة الوصل (اختياري)</span>
              </span>
              {photoPreview && (
                <button
                  type="button"
                  onClick={() => setPhotoPreview('')}
                  className="btn-delete px-2 py-0.5 rounded-lg flex items-center gap-1 text-[10px]"
                >
                  <Trash2 className="w-3 h-3" /> إزالة الصورة
                </button>
              )}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoUpload}
              className="hidden"
            />
            {!photoPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-cancel w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>التقاط أو رفع صورة الفاتورة / الوصل</span>
              </button>
            ) : (
              <div className="relative rounded-xl overflow-hidden border border-white/20 max-h-32 bg-black/65 flex items-center justify-center">
                <img src={photoPreview} alt="معاينة الوصل" className="max-h-32 object-contain" />
              </div>
            )}
          </div>

          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="submit"
              className="btn-gold flex-1 py-3 rounded-xl font-black text-xs cursor-pointer"
            >
              {type === 'cash_in' ? '+ تسجيل زيادة فلاكيس' : '− تسجيل سحب من لاكيس'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel px-5 py-3 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              إلغاء
            </button>
          </div>
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
