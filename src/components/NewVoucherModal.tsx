import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { TransactionType } from '../types/database';
import { compressReceiptImage } from '../lib/imageCompressor';
import confetti from 'canvas-confetti';
import { 
  X, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Package, 
  Camera, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Phone,
  FileText,
  RotateCcw
} from 'lucide-react';

interface NewVoucherModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialType?: TransactionType;
}

export const NewVoucherModal: React.FC<NewVoucherModalProps> = ({
  isOpen,
  onClose,
  initialType = 'cash_in',
}) => {
  const { 
    stations, 
    selectedStationId, 
    currencies, 
    createTransaction, 
    isSubscriptionExpired 
  } = useApp();

  const [stationId, setStationId] = useState<string>(selectedStationId || stations[0]?.id || '');
  const [type, setType] = useState<TransactionType>(initialType);
  const [amountStr, setAmountStr] = useState<string>('');
  const [currency, setCurrency] = useState<string>(currencies[0]?.code || 'MAD');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [keepOpenForNext, setKeepOpenForNext] = useState<boolean>(false);

  // Confirmation step modal
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setType(initialType);
    const defaultStId = selectedStationId || stations[0]?.id || '';
    const targetStId = stations.some(s => s.id === stationId) ? stationId : defaultStId;
    if (targetStId && targetStId !== stationId) {
      setStationId(targetStId);
    }
    const st = stations.find(s => s.id === targetStId);
    if (st) {
      setCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    }
  }, [isOpen, initialType, stations, selectedStationId]);

  useEffect(() => {
    const st = stations.find(s => s.id === stationId);
    if (st) {
      setCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    }
  }, [stationId, stations]);

  if (!isOpen) return null;

  const currentStation = stations.find(s => s.id === stationId);
  const numAmount = parseFloat(amountStr) || 0;

  // Handle Photo Capture
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressing(true);
      const { dataUrl } = await compressReceiptImage(file);
      setPhotoDataUrl(dataUrl);
    } catch (err) {
      console.error(err);
      setErrorMessage('فشل في معالجة الصورة. يرجى تجربة صورة أخرى.');
    } finally {
      setIsCompressing(false);
    }
  };

  const removePhoto = () => {
    setPhotoDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleQuickAddAmount = (add: number) => {
    const current = parseFloat(amountStr) || 0;
    setAmountStr((current + add).toString());
  };

  const validateAndPrepare = () => {
    setErrorMessage(null);

    if (numAmount <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح أكبر من 0');
      return;
    }

    if (!stationId) {
      setErrorMessage('يرجى تحديد المحطة');
      return;
    }

    setShowConfirmModal(true);
  };

  const handleFinalSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const defaultReason =
        type === 'cash_in'
          ? 'إيداع وزيادة فلوس فلاكيس (+)'
          : type === 'cash_out'
          ? 'سحب وصرف فلوس من لاكيس (-)'
          : 'سداد بضاعة وتخليص (-)';

      const result = await createTransaction({
        station_id: stationId,
        type,
        amount: numAmount,
        currency,
        phone_number: phoneNumber,
        reason: reason.trim() || defaultReason,
        photo_url: photoDataUrl || undefined,
        note,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'حدث خطأ أثناء حفظ الإيصال');
        setShowConfirmModal(false);
        setIsSubmitting(false);
        return;
      }

      // Trigger celebratory tactile confetti
      confetti({
        particleCount: 40,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#10B981', '#34D399', '#059669', '#38BDF8'],
      });

      setShowConfirmModal(false);
      setIsSubmitting(false);

      if (keepOpenForNext) {
        // Reset only amount, phone and reason for the next voucher in same session!
        setAmountStr('');
        setPhoneNumber('');
        setReason('');
        setNote('');
        setPhotoDataUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-2.5 animate-fadeIn" dir="rtl">
      <div 
        className="w-full max-w-[380px] max-h-[92vh] flex flex-col rounded-[24px] luxury-card border border-[#D4AF37]/65 shadow-2xl text-right overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#D4AF37]/25 bg-black/55">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-base ${
              type === 'cash_in'
                ? 'bg-emerald-500 text-black'
                : 'bg-rose-500 text-white'
            }`}>
              {type === 'cash_in' ? '+' : '-'}
            </div>
            <div>
              <h2 className="text-sm font-black text-[#F5D799]">
                {type === 'cash_in'
                  ? '+ زيادة فلوس فلاكيس (إيداع)'
                  : type === 'cash_out'
                  ? '- سحب فلوس من لاكيس (صرف)'
                  : '- سداد بضاعة من لاكيس'}
              </h2>
              <p className="text-[10px] text-[#C8B08A]">
                {currentStation?.name || 'محطة الإرساليات'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="btn-cancel p-1.5 rounded-xl transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-4 space-y-3.5 overflow-y-auto max-h-[calc(92vh-130px)] pb-20">
          
          {/* Paywall Alert Banner if expired */}
          {isSubscriptionExpired && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>فترة اشتراك فريق العمل منتهية. لا يمكن حفظ الإيصال قبل تجديد الاشتراك.</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-200 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {stations.length === 0 && (
            <div className="p-3 bg-amber-950/70 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>يرجى إضافة وتسمية محطة واحدة على الأقل قبل تسجيل السندات النقدية.</span>
            </div>
          )}

          {/* 1. Operation Type: 3 Large Tactile Buttons with clear + and - */}
          <div>
            <label className="block text-xs font-bold text-[#F5D799] mb-2">اختر نوع العملية فلاكيس (+ أو -):</label>
            <div className="grid grid-cols-3 gap-2">
              
              {/* Type 1: cash_in (+) */}
              <button
                type="button"
                onClick={() => setType('cash_in')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition active:scale-95 ${
                  type === 'cash_in' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <span className="text-base font-black leading-none mb-0.5 text-emerald-400">+</span>
                <span className="text-[11px] font-black">زيادة فلاكيس</span>
                <span className="text-[9px] mt-0.5 opacity-80">إيداع / قبض (+)</span>
              </button>

              {/* Type 2: cash_out (-) */}
              <button
                type="button"
                onClick={() => setType('cash_out')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition active:scale-95 ${
                  type === 'cash_out' ? 'btn-delete' : 'btn-cancel'
                }`}
              >
                <span className="text-base font-black leading-none mb-0.5 text-rose-400">−</span>
                <span className="text-[11px] font-black">سحب من لاكيس</span>
                <span className="text-[9px] mt-0.5 opacity-80">صرف / تسليم (-)</span>
              </button>

              {/* Type 3: goods_payment (-) */}
              <button
                type="button"
                onClick={() => setType('goods_payment')}
                className={`flex flex-col items-center justify-center p-2.5 rounded-2xl transition active:scale-95 ${
                  type === 'goods_payment' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <Package className="w-4 h-4 mb-0.5" />
                <span className="text-[11px] font-black">سداد بضاعة</span>
                <span className="text-[9px] mt-0.5 opacity-80">شراء وتخليص (-)</span>
              </button>

            </div>
          </div>

          {/* 2. Station & Currency Row */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-[#E6C37A] mb-1">المحطة</label>
              <select
                value={stationId}
                onChange={e => setStationId(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-xs font-semibold text-white focus:outline-none focus:border-[#D4AF37]"
              >
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.city})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#E6C37A] mb-1">العملة</label>
              <div className="flex gap-1.5">
                {currencies.map(curr => (
                  <button
                    key={curr.code}
                    type="button"
                    onClick={() => setCurrency(curr.code)}
                    className={`flex-1 py-2 px-1 rounded-xl text-[11px] font-black transition truncate ${
                      currency === curr.code ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    {curr.label_ar}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Amount Input with Big Digits & Quick Add Chips */}
          <div>
            <label className="block text-xs font-bold text-[#E6C37A] mb-1">
              المبلغ ({currency === 'MAD' ? 'درهم' : currency === 'MRU' ? 'أوقية' : currency})
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/50 focus:border-[#D4AF37] rounded-2xl px-4 py-3 text-xl font-bold font-mono-numbers text-white placeholder-[#A68966] focus:outline-none text-left pl-16"
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#E6C37A]">
                {currency === 'MAD' ? 'درهم' : currency === 'MRU' ? 'أوقية' : currency}
              </span>
            </div>

            {/* Quick Add Chips */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {[100, 200, 400, 500, 1000, 2000].map(val => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAddAmount(val)}
                  className="btn-cancel px-2.5 py-1 rounded-lg text-[11px] font-bold active:scale-95 transition"
                >
                  +{val.toLocaleString()}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setAmountStr('')}
                className="btn-cancel p-1 rounded-lg active:scale-95 transition"
                title="تصفير المبلغ"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* 4. Phone Number (Mandatory for cash_out) */}
          {type === 'cash_out' && (
            <div className="animate-fadeIn">
              <label className="block text-xs font-bold text-[#E6C37A] mb-1 flex items-center justify-between">
                <span>رقم هاتف المستلم (إلزامي)</span>
                <span className="text-[10px] text-rose-400 font-semibold">* إلزامي</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="0600000000 أو 22200000000"
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  className="w-full bg-[#120a00] border border-rose-500/50 focus:border-rose-500 rounded-xl px-4 py-2 text-xs font-medium text-white placeholder-[#A68966] focus:outline-none pl-10"
                />
                <Phone className="w-4 h-4 text-rose-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          {/* 5. Reason / Description */}
          <div>
            <label className="block text-xs font-bold text-[#E6C37A] mb-1">
              السبب أو التفاصيل
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder={
                  type === 'goods_payment' ? 'مثال: شحنة بضائع واردة من نواذيبو' :
                  type === 'cash_out' ? 'مثال: تسليم بموجب اتصال هاتفي من المشرف' :
                  'مثال: تغذية الصندوق من الإدارة'
                }
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-4 py-2 text-xs text-white placeholder-[#A68966] focus:outline-none"
              />
              <FileText className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* 6. Receipt Photo Capture */}
          <div>
            <label className="block text-xs font-bold text-[#E6C37A] mb-1 flex items-center justify-between">
              <span>صورة الإيصال أو المستند (اختياري)</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              className="hidden"
            />

            {photoDataUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-[#D4AF37]/50 bg-[#120a00] h-32 flex items-center justify-center">
                <img
                  src={photoDataUrl}
                  alt="مستند الإيصال"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={removePhoto}
                  className="btn-delete absolute top-2 left-2 p-1.5 rounded-full shadow-md active:scale-95 transition"
                  title="حذف الصورة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressing}
                className="btn-cancel w-full h-20 rounded-2xl border border-dashed flex flex-col items-center justify-center transition active:scale-98"
              >
                {isCompressing ? (
                  <div className="flex items-center gap-2 text-xs text-[#F5D799]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جارٍ معالجة وضغط الصورة...</span>
                  </div>
                ) : (
                  <>
                    <Camera className="w-5 h-5 mb-1" />
                    <span className="text-xs font-semibold">التقاط صورة للإيصال عبر الكاميرا</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Quick consecutive entry checkbox */}
          <div className="pt-1">
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-[#120a00] border border-[#D4AF37]/30 cursor-pointer">
              <input
                type="checkbox"
                checked={keepOpenForNext}
                onChange={e => setKeepOpenForNext(e.target.checked)}
                className="w-4 h-4 rounded accent-[#D4AF37]"
              />
              <span className="text-xs text-[#E6C37A] font-medium">
                إبقاء النموذج مفتوحاً لتسجيل إيصال آخر فوراً
              </span>
            </label>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-[#D4AF37]/25 bg-black/55 flex items-center gap-2.5">
          <button
            type="button"
            onClick={validateAndPrepare}
            disabled={numAmount <= 0}
            className="btn-gold flex-1 py-3 px-4 rounded-xl font-black text-xs disabled:opacity-40 transition active:scale-98 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
            <span>حفظ الإيصال</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn-cancel py-3 px-4 rounded-xl font-bold text-xs transition"
          >
            إلغاء
          </button>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 animate-fadeIn">
            <div className="w-full max-w-[360px] rounded-[24px] luxury-card border border-[#D4AF37]/65 p-5 shadow-2xl text-right">
              <div className="w-11 h-11 rounded-full bg-[#1a0f00] border border-[#D4AF37]/50 text-[#F3A952] flex items-center justify-center mx-auto mb-2.5">
                <AlertCircle className="w-5 h-5 stroke-[2.5]" />
              </div>

              <h3 className="text-sm font-black text-[#F5D799] text-center mb-1">
                تأكيد تسجيل الإيصال
              </h3>

              <div className="bg-[#120a00] p-3 rounded-xl border border-[#D4AF37]/35 my-3 text-xs space-y-2">
                <div className="flex justify-between text-[#C8B08A]">
                  <span>المحطة:</span>
                  <span className="font-bold text-white">{currentStation?.name}</span>
                </div>
                <div className="flex justify-between text-[#C8B08A]">
                  <span>نوع العملية:</span>
                  <span className={`font-bold ${
                    type === 'goods_payment' ? 'text-[#F3A952]' :
                    type === 'cash_out' ? 'text-rose-400' : 'text-[#F5D799]'
                  }`}>
                    {type === 'goods_payment' ? 'سداد قيمة بضاعة (خصم)' :
                     type === 'cash_out' ? 'تسليم نقدي (خصم)' : 'إيداع نقدي (إضافة)'}
                  </span>
                </div>
                <div className="flex justify-between text-[#C8B08A] text-sm font-bold border-t border-[#D4AF37]/25 pt-2">
                  <span>المبلغ:</span>
                  <span className="font-mono-numbers text-[#F5D799]">{numAmount.toLocaleString()} {currency === 'MAD' ? 'درهم' : currency === 'MRU' ? 'أوقية' : currency}</span>
                </div>

                {/* Clear impact statement */}
                <div className={`p-2 rounded-lg text-center font-bold text-xs mt-2 ${
                  type === 'cash_in'
                    ? 'bg-[#1a0f00] text-[#F5D799] border border-[#D4AF37]/40'
                    : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                }`}>
                  {type === 'cash_in' ? (
                    `سيتم إضافة ${numAmount.toLocaleString()} ${currency === 'MAD' ? 'درهم' : currency === 'MRU' ? 'أوقية' : currency} إلى رصيد المحطة`
                  ) : (
                    `سيتم خصم ${numAmount.toLocaleString()} ${currency === 'MAD' ? 'درهم' : currency === 'MRU' ? 'أوقية' : currency} من رصيد المحطة`
                  )}
                </div>

                {phoneNumber && (
                  <div className="flex justify-between text-[#C8B08A] pt-1">
                    <span>رقم المستلم:</span>
                    <span className="text-white font-mono">{phoneNumber}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-[#C8B08A] text-center mb-3.5">
                هل أنت متأكد من حفظ هذه المعاملة وتحديث الرصيد فوراً؟
              </p>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  disabled={isSubmitting}
                  className="btn-gold flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>جارٍ الحفظ...</span>
                    </>
                  ) : (
                    <span>نعم، تأكيد المعاملة</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isSubmitting}
                  className="btn-cancel px-4 py-2.5 rounded-xl text-xs font-bold transition"
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
