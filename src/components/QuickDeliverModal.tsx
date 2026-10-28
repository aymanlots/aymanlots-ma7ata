import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel } from '../types/database';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import confetti from 'canvas-confetti';
import { 
  X, 
  CheckCircle2, 
  Scan, 
  Package, 
  DollarSign, 
  MapPin, 
  AlertTriangle, 
  UserCheck, 
  Printer,
  Trash2,
  Plus,
  Layers,
  MessageCircle,
  Clock
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';
import { 
  formatTrackingCodeNumeric, 
  formatDateTimeStandard, 
  matchesTrackingCode 
} from '../utils/logisticsFeatures';

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
  const [selectedParcels, setSelectedParcels] = useState<Parcel[]>([]);
  const [showScanner, setShowScanner] = useState(false);

  // Delivery form state
  const [deliveredTo, setDeliveredTo] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmDebtNotice, setConfirmDebtNotice] = useState(false);

  // Synchronize initial parcel when modal opens
  useEffect(() => {
    if (isOpen) {
      if (initialParcel) {
        setSelectedParcels([initialParcel]);
        setDeliveredTo(initialParcel.receiver_name);
        const rem = Math.max(0, Math.round((initialParcel.amount_due - initialParcel.amount_paid) * 100) / 100);
        setPaymentAmount(rem > 0 ? rem.toString() : '0');
      } else {
        setSelectedParcels([]);
        setDeliveredTo('');
        setPaymentAmount('');
      }
      setConfirmDebtNotice(false);
      setErrorMessage(null);
      setPaymentNote('');
    }
  }, [initialParcel, isOpen]);

  // Aggregate totals across all selected parcels
  const { totalDue, totalPaid, totalRemaining, totalItems, currency } = useMemo(() => {
    let due = 0;
    let paid = 0;
    let items = 0;
    let cur = 'MAD';
    selectedParcels.forEach(p => {
      due += Number(p.amount_due || 0);
      paid += Number(p.amount_paid || 0);
      items += Number(p.items_count || 1);
      if (p.currency) cur = p.currency;
    });
    const rem = Math.max(0, Math.round((due - paid) * 100) / 100);
    return {
      totalDue: Math.round(due * 100) / 100,
      totalPaid: Math.round(paid * 100) / 100,
      totalRemaining: rem,
      totalItems: items,
      currency: cur,
    };
  }, [selectedParcels]);

  // Update default payment amount whenever selected parcels change
  useEffect(() => {
    if (selectedParcels.length > 0) {
      setPaymentAmount(totalRemaining > 0 ? String(totalRemaining) : '0');
      if (!deliveredTo.trim() && selectedParcels[0]?.receiver_name) {
        setDeliveredTo(selectedParcels[0].receiver_name);
      }
    } else {
      setPaymentAmount('');
    }
  }, [totalRemaining, selectedParcels.length]);

  if (!isOpen) return null;

  // Add a parcel by scanned tracking code, numeric code, or parcel number
  const handleAddParcelByCode = (codeOrNumber: string) => {
    setErrorMessage(null);
    const clean = codeOrNumber.trim().toUpperCase().replace(/^#/, '');
    if (!clean) return;

    const found = parcels.find(p => matchesTrackingCode(p, clean));

    if (!found) {
      playErrorBeep();
      setErrorMessage(`لم يتم العثور على أي كولي يطابق [${codeOrNumber}]`);
      return;
    }

    // Role check: Worker station destination check
    if (userRole === 'worker' && workerStationId && found.destination_station_id !== workerStationId) {
      playErrorBeep();
      setErrorMessage(`غير مسموح: الكولي #${found.parcel_number} متجه إلى محطة (${found.destination_station_name}) ولا يمكنك تسليمه من محطتك.`);
      return;
    }

    // Check if already in the batch
    if (selectedParcels.some(p => p.id === found.id)) {
      playErrorBeep();
      setErrorMessage(`الكولي #${found.parcel_number} (${found.tracking_code}) مضاف بالفعل في هذه الدفعة.`);
      return;
    }

    // Check if already delivered
    if (found.status === 'delivered') {
      playErrorBeep();
      setErrorMessage(`تنبيه: الكولي #${found.parcel_number} تم تسليمه مسبقاً للزبون.`);
      return;
    }

    playSuccessBeep();
    setSelectedParcels(prev => [...prev, found]);
    if (!deliveredTo.trim()) {
      setDeliveredTo(found.receiver_name);
    }
    setSearchQuery('');
  };

  const handleRemoveParcel = (parcelId: string) => {
    setSelectedParcels(prev => prev.filter(p => p.id !== parcelId));
  };

  const handleConfirmBatchDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedParcels.length === 0) {
      setErrorMessage('يرجى مسح أو إضافة كولي واحد على الأقل للتسليم.');
      return;
    }

    setErrorMessage(null);

    // Validate worker restrictions across all parcels
    if (userRole === 'worker' && workerStationId) {
      const invalid = selectedParcels.find(p => p.destination_station_id !== workerStationId);
      if (invalid) {
        setErrorMessage(`غير مسموح: الكولي #${invalid.parcel_number} تابع لمحطة (${invalid.destination_station_name}) فقط.`);
        return;
      }
    }

    const payAmt = parseFloat(paymentAmount) || 0;
    if (totalRemaining > 0 && payAmt < totalRemaining && !confirmDebtNotice) {
      setErrorMessage(`تنبيه: المبلغ المدفوع (${payAmt} ${currency}) أقل من المتبقي الإجمالي (${totalRemaining} ${currency}). يرجى تحديد خانة الموافقة على بقاء ذمة مالية للمتابعة.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const recipientName = deliveredTo.trim() || selectedParcels[0]?.receiver_name || 'الزبون المستلم';
      let unallocatedPayment = payAmt;

      // 1. Process payments across parcels that have remaining balances
      for (const parcel of selectedParcels) {
        const parcelRem = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
        if (parcelRem > 0 && unallocatedPayment > 0) {
          const allocate = Math.min(unallocatedPayment, parcelRem);
          await recordParcelPayment(
            parcel.id,
            allocate,
            recipientName,
            paymentNote.trim() || `استخلاص نقدي عند تسليم دفعة كوليات (${selectedParcels.length} كوليات)`
          );
          unallocatedPayment = Math.max(0, Math.round((unallocatedPayment - allocate) * 100) / 100);
        }
      }

      // If user paid more than remaining due across unpaid parcels, allocate remainder to first parcel
      if (unallocatedPayment > 0 && selectedParcels.length > 0) {
        await recordParcelPayment(
          selectedParcels[0].id,
          unallocatedPayment,
          recipientName,
          paymentNote.trim() || 'فارق استخلاص نقدي إضافي'
        );
      }

      // 2. Mark all parcels as delivered
      for (const parcel of selectedParcels) {
        await updateParcelStatus(
          parcel.id,
          'delivered',
          {
            delivered_to: recipientName,
            notes: `تم التسليم بنجاح في دفعة (${selectedParcels.length} كوليات)`
          }
        );
      }

      try {
        confetti({ particleCount: 75, spread: 80, origin: { y: 0.6 } });
      } catch {}
      playSuccessBeep();
      showToast(`تم تسليم (${selectedParcels.length}) كوليات للزبون بنجاح واستخلاص ${payAmt} ${currency}`, 'success');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء تسليم الكوليات');
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
        className="w-full max-w-[420px] bg-[#1a0f00]/95 border border-[#D4AF37]/65 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-[#D4AF37]/30 bg-[#120a00] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center font-black shadow-md">
              <UserCheck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">تسليم سريع لكولي أو دفعة كوليات</h3>
              <p className="text-[10px] text-[#D4AF37] font-medium">
                مسح مستمر، تسليم كوليات متعددة للزبون دفعة واحدة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-cancel p-1.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/30 text-[#C2A878] hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Scanner Trigger */}
        <div className="p-3 bg-[#0d0700] border-b border-[#D4AF37]/25 space-y-2 shrink-0">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="py-2 px-3 rounded-xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] hover:brightness-110 text-[#140b00] font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition shrink-0 cursor-pointer"
              title="مسح رمز QR أو باركود الكولي"
            >
              <Scan className="w-4 h-4 stroke-[2.5]" />
              <span>مسح مستمر (كاميرا)</span>
            </button>

            <form 
              onSubmit={e => {
                e.preventDefault();
                handleAddParcelByCode(searchQuery);
              }}
              className="flex-1 flex gap-1.5"
            >
              <input
                type="text"
                placeholder="أدخل كود الكولي (مثال: 0000466)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="flex-1 bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-[#8C6D3F] focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/35 hover:bg-[#231400] text-[#F5D799] font-black text-xs cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة</span>
              </button>
            </form>
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold text-xs flex items-center gap-1.5 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="p-3.5 overflow-y-auto flex-1 text-xs space-y-3.5">
          {selectedParcels.length === 0 ? (
            <div className="text-center py-10 bg-[#120a00]/80 rounded-2xl border border-dashed border-[#D4AF37]/30 p-5 space-y-2.5">
              <Package className="w-10 h-10 text-[#D4AF37]/60 mx-auto" />
              <h4 className="text-xs font-bold text-[#F5D799]">لم يتم تحديد أي كولي للتسليم بعد</h4>
              <p className="text-[10px] text-[#C2A878] leading-relaxed max-w-[280px] mx-auto">
                امسح باركود أو QR كود الكولي بالكاميرا (يمكنك مسح عدة كوليات متتالية لنفس الزبون) أو اكتب الرقم للإضافة.
              </p>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#D4AF37] text-[#111111] font-black text-xs shadow transition active:scale-95 cursor-pointer mt-1"
              >
                <Scan className="w-4 h-4" />
                <span>فتح الماسح الضوئي الآن</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleConfirmBatchDelivery} className="space-y-3.5">
              
              {/* Batch Scanned Parcels List Header */}
              <div className="bg-[#120a00]/90 p-3 rounded-2xl border border-[#D4AF37]/35 space-y-2">
                <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-1.5">
                  <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                    <Layers className="w-4 h-4 text-[#D4AF37]" />
                    <span>الكوليات المحددة للتسليم ({selectedParcels.length} كولي):</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#D4AF37] bg-[#D4AF37]/15 px-2 py-0.5 rounded-lg border border-[#D4AF37]/30 font-bold">
                    إجمالي الطرود: {totalItems}
                  </span>
                </div>

                {/* Scanned Items Cards */}
                <div className="max-h-48 overflow-y-auto space-y-2 pr-0.5">
                  {selectedParcels.map((parcel, idx) => {
                    const rem = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
                    return (
                      <div 
                        key={parcel.id}
                        className="bg-[#0d0700] p-2.5 rounded-xl border border-[#D4AF37]/25 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-black text-[#F5D799] bg-[#D4AF37]/15 px-2 py-0.5 rounded-md border border-[#D4AF37]/35">
                              #{parcel.parcel_number}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-white" dir="ltr">
                              {formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            {onOpenTicket && (
                              <button
                                type="button"
                                onClick={() => onOpenTicket(parcel)}
                                className="p-1 rounded-lg bg-[#1a0f00] text-[#D4AF37] hover:text-white border border-[#D4AF37]/30 transition cursor-pointer"
                                title="طباعة الملصق"
                              >
                                <Printer className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleRemoveParcel(parcel.id)}
                              className="p-1 rounded-lg bg-rose-950/60 text-rose-300 hover:text-rose-100 border border-rose-500/40 transition cursor-pointer"
                              title="إزالة هذا الكولي من الدفعة"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-[#C2A878]">
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-[#D4AF37]" />
                            <span>{parcel.origin_station_name} ➔ {parcel.destination_station_name}</span>
                          </div>
                          <span className="text-white font-mono font-bold" dir="ltr">
                            {rem <= 0 ? '✓ خالص' : `باقي: ${rem} ${parcel.currency}`}
                          </span>
                        </div>

                        <div className="text-[10px] text-white/80 flex items-center justify-between">
                          <span>📦 {parcel.items_count} طرد ({parcel.description})</span>
                          <span>المرسل: {parcel.sender_name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowScanner(true)}
                    className="text-[10px] text-[#F5D799] font-bold flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ مسح كولي إضافي وإضافته لنفس الزبون</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedParcels([])}
                    className="text-[10px] text-rose-400 font-bold hover:underline cursor-pointer"
                  >
                    إفراغ القائمة
                  </button>
                </div>
              </div>

              {/* Combined Financial Balance Card */}
              <div className="bg-[#120a00]/90 p-3.5 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
                <span className="font-bold text-[#F5C84C] flex items-center gap-1.5 text-xs">
                  <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                  <span>المستحقات الإجمالية للدفعة ({selectedParcels.length} كولي):</span>
                </span>

                <div className="grid grid-cols-3 gap-1.5 text-center">
                  <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/20">
                    <span className="text-[9px] text-[#C2A878] block">المجموع الإجمالي</span>
                    <span className="font-black text-white text-[11px]" dir="ltr">
                      {hideAmounts ? '••••' : totalDue} {currency}
                    </span>
                  </div>
                  <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/20">
                    <span className="text-[9px] text-[#C2A878] block">المدفوع مسبقاً</span>
                    <span className="font-black text-[#2ECC71] text-[11px]" dir="ltr">
                      {hideAmounts ? '••••' : totalPaid} {currency}
                    </span>
                  </div>
                  <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/20">
                    <span className="text-[9px] text-[#C2A878] block">المتبقي للتحصيل</span>
                    <span className="font-black text-[#F5D799] text-[11px]" dir="ltr">
                      {hideAmounts ? '••••' : totalRemaining} {currency}
                    </span>
                  </div>
                </div>

                {/* Payment input field */}
                <div className="pt-1 space-y-1.5">
                  <label className="text-[11px] font-bold text-white block">
                    المبلغ المستخلص نقداً من الزبون الآن ({currency}):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={String(totalRemaining)}
                    className="w-full bg-[#0d0700] border border-[#D4AF37]/50 focus:border-[#F5D799] rounded-xl px-3 py-2 text-white font-mono font-black text-sm focus:outline-none"
                  />
                </div>

                {/* Recipient Name Field */}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-white block">
                    اسم الشخص المستلم الفعلي في المحطة *:
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveredTo}
                    onChange={e => setDeliveredTo(e.target.value)}
                    placeholder="اسم الزبون المستلم..."
                    className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#F5D799]"
                  />
                </div>

                {/* Note Field */}
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-[#C2A878] block">
                    ملاحظة الاستخلاص / التسليم (اختياري):
                  </label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={e => setPaymentNote(e.target.value)}
                    placeholder="مثال: تسليم كامل باليد نقداً"
                    className="w-full bg-[#0d0700] border border-[#D4AF37]/30 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#F5D799]"
                  />
                </div>
              </div>

              {/* Debt Notice Confirmation Checkbox (if remaining debt) */}
              {totalRemaining > 0 && (parseFloat(paymentAmount) || 0) < totalRemaining && (
                <div className="bg-amber-950/30 border border-[#D4AF37]/50 p-3 rounded-xl flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="confirmDebtNoticeBatch"
                    checked={confirmDebtNotice}
                    onChange={e => setConfirmDebtNotice(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-[#D4AF37]/60 text-[#D4AF37] focus:ring-0 focus:outline-none cursor-pointer"
                  />
                  <label htmlFor="confirmDebtNoticeBatch" className="text-[10px] font-bold text-[#F5D799] cursor-pointer select-none">
                    أوافق على تسليم الكوليات مع بقاء ذمة مالية معلقة قدرها {Math.max(0, totalRemaining - (parseFloat(paymentAmount) || 0))} {currency} بذمة الزبون
                  </label>
                </div>
              )}

              {/* Confirm Delivery Button */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={isSubmitting || selectedParcels.length === 0}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] hover:brightness-110 text-[#140b00] font-black text-xs shadow-xl active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {isSubmitting 
                      ? 'جاري تأكيد التسليم...' 
                      : `تأكيد استخلاص وتسليم (${selectedParcels.length}) كوليات للزبون ➔`}
                  </span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Continuous Barcode / QR Scanner */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleAddParcelByCode}
        defaultBurstMode={true}
        title="مسح مستمر لتسليم كوليات الزبون"
        subtitle="امسح تذاكر الكوليات واحداً تلو الآخر لتجميعها وتسليمها في دفعة واحدة"
        placeholder="أدخل كود الكولي (مثال: 0000466)..."
      />
    </div>
  );
};
