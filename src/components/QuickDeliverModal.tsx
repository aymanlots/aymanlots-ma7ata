import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, ParcelCondition } from '../types/database';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import confetti from 'canvas-confetti';
import { 
  X, 
  CheckCircle2, 
  Scan, 
  Package, 
  Phone, 
  MessageCircle, 
  DollarSign, 
  MapPin, 
  AlertTriangle, 
  Search, 
  UserCheck, 
  Truck,
  Printer
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';

interface QuickDeliverModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialParcel?: Parcel | null;
  onOpenTicket?: (parcel: Parcel) => void;
}

export const QuickDeliverModal: React.FC<QuickDeliverModalProps> = ({
  isOpen,
  onClose,
  initialParcel = null,
  onOpenTicket
}) => {
  const { 
    parcels, 
    hideAmounts,
    updateParcelStatus, 
    recordParcelPayment, 
    userRole,
    userAssignedStationId,
    selectedStationId,
    showToast 
  } = useApp();

  const workerStationId = userRole === 'worker' ? (userAssignedStationId || selectedStationId || '') : '';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(initialParcel);
  const [showScanner, setShowScanner] = useState(false);

  // Delivery form state
  const [deliveredTo, setDeliveredTo] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [confirmDebtNotice, setConfirmDebtNotice] = useState(false);

  useEffect(() => {
    if (initialParcel) {
      setSelectedParcel(initialParcel);
      setDeliveredTo(initialParcel.receiver_name);
      const rem = Math.max(0, Math.round((initialParcel.amount_due - initialParcel.amount_paid) * 100) / 100);
      setPaymentAmount(rem > 0 ? rem.toString() : '');
    } else {
      setSelectedParcel(null);
      setDeliveredTo('');
      setPaymentAmount('');
    }
    setConfirmDebtNotice(false);
    setErrorMessage(null);
  }, [initialParcel, isOpen]);

  if (!isOpen) return null;

  const handleFindParcel = (codeOrNumber: string) => {
    setErrorMessage(null);
    setConfirmDebtNotice(false);
    const clean = codeOrNumber.trim().toUpperCase().replace(/^#/, '');
    if (!clean) return;
    const numericId = parseInt(clean, 10);

    const found = parcels.find(p => 
      p.tracking_code.toUpperCase() === clean || 
      String(p.parcel_number) === clean ||
      (!isNaN(numericId) && p.parcel_number === numericId) ||
      p.id.toUpperCase() === clean ||
      p.receiver_phone.includes(clean)
    );

    if (found) {
      if (userRole === 'worker' && workerStationId && found.destination_station_id !== workerStationId) {
        playErrorBeep();
        setErrorMessage(`غير مسموح: هذا الكولي متجه إلى محطة (${found.destination_station_name}) ولا يمكنك تسليمه من محطتك الحالية.`);
        return;
      }
      playSuccessBeep();
      setSelectedParcel(found);
      setDeliveredTo(found.receiver_name);
      const rem = Math.max(0, Math.round((found.amount_due - found.amount_paid) * 100) / 100);
      setPaymentAmount(rem > 0 ? rem.toString() : '');
      setSearchQuery('');
    } else {
      playErrorBeep();
      setErrorMessage(`لم يتم العثور على أي كولي يطابق [${codeOrNumber}]`);
    }
  };

  const remaining = selectedParcel 
    ? Math.max(0, Math.round((selectedParcel.amount_due - selectedParcel.amount_paid) * 100) / 100)
    : 0;
  const isSettled = remaining <= 0;

  const handleConfirmDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParcel) return;
    setErrorMessage(null);

    if (selectedParcel.status === 'delivered') {
      setErrorMessage('هذا الكولي تم تسليمه مسبقاً بالفعل');
      return;
    }

    if (userRole === 'worker' && workerStationId && selectedParcel.destination_station_id !== workerStationId) {
      setErrorMessage(`غير مسموح: هذا الكولي تابع لمحطة الوصول (${selectedParcel.destination_station_name}) فقط.`);
      return;
    }

    const payAmt = parseFloat(paymentAmount) || 0;
    if (remaining > 0 && payAmt < remaining && !confirmDebtNotice) {
      setErrorMessage(`تنبيه: المبلغ المدفوع (${payAmt}) أقل من المتبقي (${remaining} ${selectedParcel.currency}). يرجى تحديد خانة الموافقة على بقاء ذمة مالية للمتابعة.`);
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. إذا تم دفع مبلغ نقدي عند التسليم، سجله فوراً
      if (payAmt > 0) {
        await recordParcelPayment(
          selectedParcel.id,
          payAmt,
          deliveredTo.trim() || selectedParcel.receiver_name,
          paymentNote.trim() || 'استخلاص نقدي عند تسليم الكولي للزبون'
        );
      }

      // 2. تحديث حالة الكولي إلى "تم التسليم"
      const res = await updateParcelStatus(
        selectedParcel.id,
        'delivered',
        {
          delivered_to: deliveredTo.trim() || selectedParcel.receiver_name,
          notes: 'تم التسليم بنجاح للزبون في المحطة'
        }
      );

      if (res.success) {
        try {
          confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
        } catch {}
        playSuccessBeep();
        showToast(`تم تسليم الكولي #${selectedParcel.parcel_number} للزبون بنجاح`, 'success');
        onClose();
      } else {
        setErrorMessage(res.error || 'تعذر تأكيد تسليم الكولي');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getWhatsAppLink = (rawPhone: string) => {
    const clean = rawPhone.replace(/[^0-9]/g, '');
    return `https://wa.me/${clean}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/90 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div 
        className="w-full max-w-[380px] bg-[#1a0f00]/95 border border-[#D4AF37]/65 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-[#D4AF37]/30 bg-[#120a00] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center font-black shadow-md">
              <UserCheck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">تسليم كولي للزبون واستخلاص المستحقات</h3>
              <p className="text-[10px] text-[#D4AF37] font-medium">
                مسح الباركود، التحقق المالي، وتسجيل التسليم الفوري
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-cancel p-1.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/30 text-[#C2A878] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Scanner Launcher */}
        <div className="p-3 bg-[#0d0700] border-b border-[#D4AF37]/25 space-y-2 shrink-0">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="py-2 px-3 rounded-xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] hover:brightness-110 text-[#140b00] font-black text-[11px] flex items-center justify-center gap-1 shadow-md active:scale-95 transition shrink-0"
            >
              <Scan className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>مسح</span>
            </button>

            <form 
              onSubmit={e => {
                e.preventDefault();
                handleFindParcel(searchQuery);
              }}
              className="flex-1 flex gap-1.5"
            >
              <input
                type="text"
                placeholder="رقم الكولي أو الهاتف..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-[#8C6D3F] focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/35 hover:bg-[#231400] text-[#F5D799] font-bold text-xs"
              >
                بحث
              </button>
            </form>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold text-xs">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Selected Parcel Delivery Screen */}
        <div className="p-3.5 overflow-y-auto flex-1 text-xs space-y-3.5">
          {!selectedParcel ? (
            <div className="text-center py-10 bg-[#120a00]/80 rounded-2xl border border-dashed border-[#D4AF37]/30 p-5 space-y-2">
              <Package className="w-9 h-9 text-[#D4AF37]/60 mx-auto" />
              <p className="text-xs font-bold text-[#F5D799]">لم يتم اختيار أي كولي للتسليم بعد</p>
              <p className="text-[10px] text-[#C2A878]">
                امسح باركود تذكرة الكولي بالكاميرا أو اكتب رقم الكولي للبدء بعملية التسليم
              </p>
            </div>
          ) : (
            <form onSubmit={handleConfirmDelivery} className="space-y-3.5">
              {/* Parcel Identity Card */}
              <div className="bg-[#120a00]/90 p-3.5 rounded-2xl border border-[#D4AF37]/35 space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-black text-[#F5D799] bg-[#D4AF37]/15 px-2 py-0.5 rounded-lg border border-[#D4AF37]/35">
                      #{selectedParcel.parcel_number}
                    </span>
                    <span className="font-mono text-[11px] font-bold text-white">
                      {selectedParcel.tracking_code}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onOpenTicket && (
                      <button
                        type="button"
                        onClick={() => onOpenTicket(selectedParcel)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a0f00] hover:bg-[#231400] text-[#F5D799] font-bold text-[10px] transition border border-[#D4AF37]/35"
                        title="طباعة لاصقة الكولي (10cm × 10cm)"
                      >
                        <Printer className="w-3 h-3 text-[#D4AF37]" />
                        <span>طباعة</span>
                      </button>
                    )}

                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      (selectedParcel.condition || 'normal') === 'normal'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}>
                      {(selectedParcel.condition || 'normal') === 'normal' ? '✓ سليم' : '⚠ به تلف'}
                    </span>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center justify-between text-[11px] text-[#EAD6B0]">
                  <div className="flex items-center gap-1.5 font-bold">
                    <MapPin className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                    <span>{selectedParcel.origin_station_name}</span>
                    <span className="text-[#8C6D3F]">➔</span>
                    <span>{selectedParcel.destination_station_name}</span>
                  </div>
                  <span className="text-[#C2A878] font-mono text-[10px]" dir="ltr">
                    {new Date(selectedParcel.created_at).toLocaleDateString('ar-MA')}
                  </span>
                </div>

                {/* Receiver Info with WhatsApp */}
                <div className="bg-[#0d0700] p-2.5 rounded-xl border border-[#D4AF37]/25 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[#C2A878] block">المستلم المعتمد:</span>
                    <span className="font-black text-white text-xs">{selectedParcel.receiver_name}</span>
                  </div>
                  {selectedParcel.receiver_phone && selectedParcel.receiver_phone.replace(/[^0-9]/g, '').length > 0 && (
                    <a
                      href={getWhatsAppLink(selectedParcel.receiver_phone)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200 font-bold bg-emerald-500/15 px-2.5 py-1 rounded-xl border border-emerald-500/30"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span dir="ltr">{selectedParcel.receiver_phone}</span>
                    </a>
                  )}
                </div>

                {/* Goods Description */}
                <div className="text-[11px] text-[#EAD6B0] bg-[#0d0700] p-2.5 rounded-xl border border-[#D4AF37]/20">
                  <span className="text-[#C2A878]">الوصف: </span>
                  <span className="text-white font-medium">{selectedParcel.description}</span>
                  <span className="text-[#8C6D3F] mr-1.5">({selectedParcel.items_count} طرد)</span>
                </div>
              </div>

              {/* Financial Balance Card */}
              <div className="bg-[#120a00]/90 p-3.5 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
                <span className="font-bold text-[#F5D799] flex items-center gap-1.5 text-xs">
                  <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                  <span>المستحقات المالية للتحصيل عند التسليم:</span>
                </span>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/20">
                    <span className="text-[9px] text-[#C2A878] block">المبلغ الإجمالي</span>
                    <span className="font-black text-white text-[11px]" dir="ltr">{hideAmounts ? '••••' : selectedParcel.amount_due} {selectedParcel.currency}</span>
                  </div>
                  <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/20">
                    <span className="text-[9px] text-[#C2A878] block">المدفوع مسبقاً</span>
                    <span className="font-black text-emerald-400 text-[11px]" dir="ltr">{hideAmounts ? '••••' : selectedParcel.amount_paid} {selectedParcel.currency}</span>
                  </div>
                  <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/20">
                    <span className="text-[9px] text-[#C2A878] block">المتبقي للقبض</span>
                    <span className={`font-black text-[11px] ${remaining > 0 ? 'text-rose-400' : 'text-emerald-400'}`} dir="ltr">
                      {hideAmounts ? '••••' : remaining} {selectedParcel.currency}
                    </span>
                  </div>
                </div>

                {/* If Remaining > 0, Payment Collection Input */}
                {remaining > 0 && (
                  <div className="space-y-1.5 pt-1.5 border-t border-[#D4AF37]/20">
                    <label className="block text-[10px] font-bold text-[#F5D799]">
                      المبلغ المستلم نقداً الآن من الزبون ({selectedParcel.currency}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max={remaining}
                      required
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      className="w-full bg-[#0d0700] border border-[#D4AF37]/60 rounded-xl px-3 py-2 text-white font-mono font-black text-sm focus:outline-none focus:border-[#F5D799]"
                    />
                  </div>
                )}
              </div>

              {/* Recipient Confirmation Input */}
              <div className="bg-[#120a00]/90 p-3.5 rounded-2xl border border-[#D4AF37]/35 space-y-1.5">
                <label className="block text-[11px] font-bold text-[#F5D799]">
                  اسم الشخص المستلم الفعلي عند شباك المحطة *
                </label>
                <input
                  type="text"
                  required
                  placeholder={selectedParcel.receiver_name}
                  value={deliveredTo}
                  onChange={e => setDeliveredTo(e.target.value)}
                  className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#F5D799]"
                />
              </div>

              {/* Debt Notice Confirmation Checkbox (if remaining debt) */}
              {remaining > 0 && (parseFloat(paymentAmount) || 0) < remaining && (
                <div className="bg-amber-950/30 border border-[#D4AF37]/50 p-3 rounded-xl flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="confirmDebtNotice"
                    checked={confirmDebtNotice}
                    onChange={e => setConfirmDebtNotice(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#D4AF37]/60 text-[#D4AF37] focus:ring-0 focus:outline-none cursor-pointer"
                  />
                  <label htmlFor="confirmDebtNotice" className="text-[10px] font-bold text-[#F5D799] cursor-pointer select-none">
                    أوافق على تسليم الكولي للزبون مع بقاء ذمة مالية معلقة قدرها {Math.max(0, remaining - (parseFloat(paymentAmount) || 0))} {selectedParcel.currency} بذمة الزبون
                  </label>
                </div>
              )}

              {/* Confirm Delivery Button */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || selectedParcel.status === 'delivered'}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] hover:brightness-110 text-[#140b00] font-black text-xs shadow-xl active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {isSubmitting 
                      ? 'جاري تأكيد التسليم...' 
                      : selectedParcel.status === 'delivered'
                      ? 'تم تسليم هذا الكولي مسبقاً'
                      : 'تأكيد الاستخلاص وتسليم الكولي للزبون ➔'}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>

      </div>

      {/* Barcode / QR Scanner */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleFindParcel}
        title="مسح تذكرة الكولي للتسليم"
        subtitle="امسح باركود الكولي المراد تسليمه للزبون"
        placeholder="أدخل كود الكولي..."
      />
    </div>
  );
};
