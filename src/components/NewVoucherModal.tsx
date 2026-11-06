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
      className="fixed inset-0 z-50 flex items-center justify-center p-1.5 bg-black/75 animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="luxury-card border border-[#F5C84C]/45 rounded-[20px] w-full max-w-[430px] overflow-hidden shadow-2xl max-h-[95vh] flex flex-col text-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="px-2.5 py-2 bg-black/55 border-b border-white/15 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-black text-white truncate">💰 عملية فلاكيس</h3>
            <span className="text-[11px] text-[#F5C84C] font-bold truncate">
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
            className="btn-cancel p-1 rounded-lg transition cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handlePreSubmit} className="p-2 space-y-1.5 overflow-y-auto text-xs">
          {error && (
            <div className="p-1.5 rounded-xl bg-rose-950/70 border border-rose-500/40 flex items-center gap-1.5 text-rose-200 text-[11px] font-bold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* جوج أعمدة: اليمين (المحطة + نوع العملية) | اليسار (السبب + الهاتف فنفس السطر) */}
          <div className="grid grid-cols-2 gap-1.5 items-stretch">
            {/* RIGHT COLUMN: المحطة + نوع العملية */}
            <div className="bg-black/55 p-1.5 rounded-xl border border-white/15 space-y-1 flex flex-col justify-between">
              <div>
                <label className="block text-[10px] font-black text-white/90 mb-0.5">📍 المحطة</label>
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
                  className="w-full bg-black/65 border border-white/20 rounded-lg px-1.5 py-1 text-[11px] font-bold text-white focus:outline-none disabled:opacity-60"
                >
                  {stations.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => setType('cash_in')}
                  className={`py-1 px-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    type === 'cash_in' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  ➕إيداع
                </button>
                <button
                  type="button"
                  onClick={() => setType('cash_out')}
                  className={`py-1 px-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    type === 'cash_out' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  ➖سحب
                </button>
                <button
                  type="button"
                  onClick={() => setType('goods_payment')}
                  className={`py-1 px-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    type === 'goods_payment' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  📦سلع
                </button>
              </div>
            </div>

            {/* LEFT COLUMN: السبب + الهاتف فنفس السطر */}
            <div className="bg-black/55 p-1.5 rounded-xl border border-white/15 space-y-1 flex flex-col justify-between">
              <span className="block text-[10px] font-black text-white/90">
                📝 السبب {isOutflow && <span className="text-rose-400">*</span>} + 📞 الهاتف
              </span>
              <div className="grid grid-cols-2 gap-1">
                <input
                  type="text"
                  required={isOutflow}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={isOutflow ? '📝 السبب *' : '📝 البيان'}
                  className="w-full min-w-0 bg-black/65 border border-white/20 rounded-lg px-1.5 py-1 text-[11px] text-white focus:outline-none"
                />
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="📞 الهاتف"
                  dir="ltr"
                  className="w-full min-w-0 bg-black/65 border border-white/20 rounded-lg px-1.5 py-1 text-[11px] text-white font-mono text-left focus:outline-none"
                />
              </div>
              {isCashboxEmptyOrInsufficient ? (
                <span className="text-[9px] font-black text-rose-400 truncate block" dir="ltr">
                  ⚠️ بعد السحب: {resultingBalance.toLocaleString('en-US')} {currency}
                </span>
              ) : (
                <span className="text-[9px] font-bold text-white/70 truncate block">
                  ⚡ عملية فورية فصندوق المحطة
                </span>
              )}
            </div>
          </div>

          {/* لتحت فسطر واحد: المبلغ + العملة + زر التأكيد */}
          <div className="bg-black/55 p-1.5 rounded-xl border border-white/15 flex items-center gap-1">
            <input
              type="number"
              step="any"
              min="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="💰 المبلغ *"
              className="flex-1 min-w-[80px] bg-black/65 border border-white/20 rounded-lg px-2 py-1.5 text-sm font-black text-white focus:outline-none text-left font-mono"
              dir="ltr"
            />
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-20 shrink-0 bg-black/65 border border-white/20 rounded-lg px-1 py-1.5 text-[11px] font-bold text-[#F5C84C] focus:outline-none"
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn-gold px-3 py-1.5 rounded-lg font-black text-xs shrink-0 cursor-pointer"
            >
              {type === 'cash_in' ? '✅تأكيد (+)' : '✅تأكيد (−)'}
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
