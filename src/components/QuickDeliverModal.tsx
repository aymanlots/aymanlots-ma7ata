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
  matchesTrackingCode,
  getParcelSourceOwnershipInfo,
  canControlParcelDestination,
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
    currentWorkspace,
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
  const [pendingArrivalParcel, setPendingArrivalParcel] = useState<Parcel | null>(null);
  const [confirmDebtNotice, setConfirmDebtNotice] = useState(false);

  // Only parcels that have arrived in destination station stock (status === 'arrived') AND belong to this destination station/partner are eligible for delivery
  const arrivedStockParcels = useMemo(() => {
    const activeStation = workerStationId || (selectedStationId && selectedStationId !== 'all' ? selectedStationId : '');
    return parcels.filter(p => {
      if (p.status !== 'arrived') return false;
      if (!canControlParcelDestination(p, currentWorkspace?.id, userRole, activeStation)) {
        return false;
      }
      if (
        activeStation &&
        p.destination_station_id !== activeStation &&
        p.partner_destination_station_id !== activeStation
      ) {
        return false;
      }
      if (selectedParcels.some(sel => sel.id === p.id)) return false;
      return true;
    });
  }, [parcels, currentWorkspace?.id, userRole, workerStationId, selectedStationId, selectedParcels]);

  const getNonArrivedErrorMessage = (found: Parcel): string => {
    if (found.status === 'delivered') {
      return `تنبيه: الكولي #${found.parcel_number} تم تسليمه مسبقاً للزبون (${found.delivered_to || found.receiver_name}).`;
    }
    if (found.status === 'in_transit') {
      return `الكولي #${found.parcel_number} مسجل حالياً "في الطريق". يمكنك تأكيد دخوله للستوك بضغطة واحدة أدناه ثم تسليمه فوراً.`;
    }
    if (found.status === 'registered' || found.status === 'pending') {
      return `الكولي #${found.parcel_number} مسجل في محطة الانطلاق "${found.origin_station_name}". إذا وصل لمحطتك، اضغط الزر أدناه لإدخاله للستوك وتسليمه فوراً.`;
    }
    if (found.status === 'return_in_transit' || found.status === 'returned') {
      return `⛔ الكولي #${found.parcel_number} في مسار الإرجاع للمرسل ولا يمكن تسليمه من نافذة التسليم العادي.`;
    }
    return `⛔ لا يمكن تسليم الكولي #${found.parcel_number} لأنه غير موجود في ستوك المحطة حالياً.`;
  };

  // Synchronize initial parcel when modal opens
  useEffect(() => {
    if (isOpen) {
      setConfirmDebtNotice(false);
      setPaymentNote('');
      setPendingArrivalParcel(null);
      if (initialParcel) {
        if (initialParcel.status !== 'arrived') {
          setSelectedParcels([]);
          setDeliveredTo('');
          setPaymentAmount('');
          setErrorMessage(getNonArrivedErrorMessage(initialParcel));
          if (initialParcel.status === 'in_transit') {
            setPendingArrivalParcel(initialParcel);
          }
        } else {
          setSelectedParcels([initialParcel]);
          setDeliveredTo(initialParcel.receiver_name);
          const rem = Math.max(0, Math.round((initialParcel.amount_due - initialParcel.amount_paid) * 100) / 100);
          setPaymentAmount(rem > 0 ? rem.toString() : '0');
          setErrorMessage(null);
        }
      } else {
        setSelectedParcels([]);
        setDeliveredTo('');
        setPaymentAmount('');
        setErrorMessage(null);
      }
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

  const handleConfirmQuickStockArrival = async (targetParcel: Parcel) => {
    const res = await updateParcelStatus(targetParcel.id, 'arrived', {
      notes: 'تم تأكيد وصول الكولي للستوك مباشرة عند التسليم',
    });
    if (res.success) {
      playSuccessBeep();
      const updated: Parcel = { ...targetParcel, status: 'arrived', arrived_at: new Date().toISOString() };
      setPendingArrivalParcel(null);
      setErrorMessage(null);
      setSelectedParcels(prev => [...prev.filter(p => p.id !== updated.id), updated]);
      if (!deliveredTo.trim()) {
        setDeliveredTo(updated.receiver_name);
      }
      showToast(`تم إدخال الكولي #${updated.parcel_number} للستوك وهو جاهز للتسليم الآن ✓`, 'success');
    } else {
      playErrorBeep();
      setErrorMessage(res.error || 'تعذر إدخال الكولي للستوك');
    }
  };

  // Add a parcel by scanned tracking code, numeric code, or parcel number
  const handleAddParcelByCode = (codeOrNumber: string) => {
    setErrorMessage(null);
    setPendingArrivalParcel(null);
    const clean = codeOrNumber.trim().toUpperCase().replace(/^#/, '');
    if (!clean) return;

    const found = parcels.find(p => matchesTrackingCode(p, clean));

    if (!found) {
      playErrorBeep();
      setErrorMessage(`لم يتم العثور على أي كولي يطابق [${codeOrNumber}]`);
      return;
    }

    // Strict destination & partner check (المشكل 2 + المشكل 4)
    if (!canControlParcelDestination(found, currentWorkspace?.id, userRole, workerStationId)) {
      playErrorBeep();
      const isOutgoingPartner = Boolean(
        found.partner_workspace_id &&
          found.partner_workspace_id !== currentWorkspace?.id &&
          !found.is_collaborator_data
      );
      setErrorMessage(
        isOutgoingPartner
          ? `غير مسموح: أنت أرسلت الكولي #${found.parcel_number} عبر غرفة الشراكة إلى محطة "${found.destination_station_name}" (${found.partner_workspace_name || 'الشريك'}). المدير والعامل في محطة الاستلام هما الوحيدان المخولان بتأكيد الوصول والتسليم.`
          : found.partner_acceptance_status === 'pending_approval'
          ? `يرجى أولاً قبول الكولي #${found.parcel_number} في طلبات غرفة الشراكة قبل تسليمه.`
          : `غير مسموح: الكولي #${found.parcel_number} متجه إلى محطة (${found.destination_station_name}) ولا يمكنك تسليمه من محطتك.`
      );
      return;
    }

    // Check if already in the batch
    if (selectedParcels.some(p => p.id === found.id)) {
      playErrorBeep();
      setErrorMessage(`الكولي #${found.parcel_number} (${found.tracking_code}) مضاف بالفعل في هذه الدفعة.`);
      return;
    }

    // Require parcel to be in station stock (status === 'arrived'), or offer 1-click arrival confirmation ONLY if already shipped ('in_transit')
    if (found.status !== 'arrived') {
      playErrorBeep();
      setErrorMessage(getNonArrivedErrorMessage(found));
      if (found.status === 'in_transit') {
        setPendingArrivalParcel(found);
      }
      return;
    }

    playSuccessBeep();
    const ownershipInfo = getParcelSourceOwnershipInfo(found, currentWorkspace?.id, currentWorkspace?.name);
    showToast(ownershipInfo.workerScanAlert, ownershipInfo.isPartnership ? 'info' : 'success');
    setSelectedParcels(prev => [...prev, found]);
    if (!deliveredTo.trim()) {
      setDeliveredTo(found.receiver_name);
    }
    setSearchQuery('');
  };

  const handleSelectSameReceiverStock = (receiverPhone: string, receiverName: string) => {
    const cleanPhone = (receiverPhone || '').replace(/\D/g, '');
    const matching = arrivedStockParcels.filter(p => {
      const pPhone = (p.receiver_phone || '').replace(/\D/g, '');
      return (cleanPhone && pPhone === cleanPhone) || (receiverName && p.receiver_name.trim() === receiverName.trim());
    });
    if (matching.length > 0) {
      playSuccessBeep();
      setSelectedParcels(prev => [...prev, ...matching]);
      if (!deliveredTo.trim() && receiverName) {
        setDeliveredTo(receiverName);
      }
    }
  };

  const handleRemoveParcel = (parcelId: string) => {
    setSelectedParcels(prev => prev.filter(p => p.id !== parcelId));
  };

  const handleConfirmBatchDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedParcels.length === 0) {
      setErrorMessage('يرجى مسح أو اختيار كولي واحد على الأقل من ستوك المحطة للتسليم.');
      return;
    }

    setErrorMessage(null);

    // Ensure every parcel in the batch is strictly in 'arrived' status
    const notArrivedParcel = selectedParcels.find(p => p.status !== 'arrived');
    if (notArrivedParcel) {
      playErrorBeep();
      setErrorMessage(getNonArrivedErrorMessage(notArrivedParcel));
      return;
    }

    // Validate worker restrictions across all parcels
    if (userRole === 'worker' && workerStationId) {
      const invalid = selectedParcels.find(
        p => p.destination_station_id !== workerStationId && p.partner_destination_station_id !== workerStationId
      );
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
          const payRes = await recordParcelPayment(
            parcel.id,
            allocate,
            recipientName,
            paymentNote.trim() || `استخلاص نقدي عند تسليم دفعة كوليات (${selectedParcels.length} كوليات)`
          );
          if (!payRes.success) {
            throw new Error(payRes.error || `تعذر تسجيل دفعة الكولي #${parcel.parcel_number}`);
          }
          unallocatedPayment = Math.max(0, Math.round((unallocatedPayment - allocate) * 100) / 100);
        }
      }

      // If user paid more than remaining due across unpaid parcels, allocate remainder to first parcel
      if (unallocatedPayment > 0 && selectedParcels.length > 0) {
        const extraRes = await recordParcelPayment(
          selectedParcels[0].id,
          unallocatedPayment,
          recipientName,
          paymentNote.trim() || 'فارق استخلاص نقدي إضافي'
        );
        if (!extraRes.success) {
          throw new Error(extraRes.error || 'تعذر تسجيل الدفعة الإضافية');
        }
      }

      // 2. Mark all parcels as delivered
      for (const parcel of selectedParcels) {
        const statusRes = await updateParcelStatus(
          parcel.id,
          'delivered',
          {
            delivered_to: recipientName,
            notes: `تم التسليم بنجاح في دفعة (${selectedParcels.length} كوليات)`
          }
        );
        if (!statusRes.success) {
          throw new Error(statusRes.error || `تعذر تسليم الكولي #${parcel.parcel_number}`);
        }
      }

      try {
        confetti({ particleCount: 75, spread: 80, origin: { y: 0.6 } });
      } catch {}
      playSuccessBeep();
      showToast(`تم تسليم (${selectedParcels.length}) كوليات للزبون بنجاح واستخلاص ${payAmt} ${currency}`, 'success');
      onClose();
    } catch (err: any) {
      playErrorBeep();
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
    <div
      className="fixed inset-0 z-50 flex justify-center items-center p-2.5 sm:p-4 m-0 bg-black/85 backdrop-blur-md animate-fadeIn overflow-hidden"
      onClick={onClose}
    >
      <div 
        className="w-[96%] max-w-[420px] max-h-[94dvh] luxury-card border-2 border-[#D4AF37]/65 rounded-2xl shadow-2xl overflow-hidden flex flex-col justify-between gap-2.5 p-3.5 text-right relative m-0"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pb-2 border-b border-[#D4AF37]/30 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center font-black shadow-md shrink-0">
              <UserCheck className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">📦 تسليم كوليات الستوك</h3>
              <p className="text-xs text-[#D4AF37] font-bold truncate">
                الكوليات الجاهزة في ستوك المحطة (وصلت ✓)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-cancel p-1.5 rounded-xl shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search & Scanner Trigger */}
        <div className="pb-2 border-b border-[#D4AF37]/25 space-y-2 shrink-0">
          <form 
            onSubmit={e => {
              e.preventDefault();
              handleAddParcelByCode(searchQuery);
            }}
            className="flex items-center gap-2 w-full"
          >
            <div className="flex-1 min-w-0">
              <input
                type="text"
                placeholder="🔢 كود الكولي (0000466)..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-black/55 border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-3 py-2.5 text-xs sm:text-sm text-white font-mono font-black focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="btn-gold px-3 py-2.5 rounded-xl text-xs sm:text-sm font-black shrink-0 cursor-pointer flex items-center gap-1 shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة</span>
            </button>
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="btn-cancel px-3 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1 shrink-0 cursor-pointer whitespace-nowrap"
              title="مسح رمز QR أو باركود الكولي"
            >
              <Scan className="w-4 h-4 text-[#F5C84C]" />
              <span>📷</span>
            </button>
          </form>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-200 font-bold text-xs sm:text-sm space-y-2 animate-fadeIn leading-relaxed">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>{errorMessage}</span>
              </div>
              {pendingArrivalParcel && (
                <button
                  type="button"
                  onClick={() => handleConfirmQuickStockArrival(pendingArrivalParcel)}
                  className="w-full py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition active:scale-95 flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>📥 إدخال الكولي #{pendingArrivalParcel.parcel_number} للستوك وتسليمه ➔</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="overflow-hidden flex-1 flex flex-col justify-between gap-2.5 text-xs sm:text-sm min-h-0">
          {/* Arrived Stock Quick-Picker for Bulk Delivery */}
          <div className="bg-black/50 p-2.5 rounded-xl border border-emerald-500/30 space-y-1.5 shrink-0">
            <div className="flex items-center justify-between gap-1 flex-wrap">
              <span className="font-black text-emerald-300 text-xs sm:text-sm flex items-center gap-1">
                <span>📦 في الستوك ({arrivedStockParcels.length}):</span>
              </span>
              {arrivedStockParcels.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    playSuccessBeep();
                    setSelectedParcels(prev => [...prev, ...arrivedStockParcels]);
                    if (!deliveredTo.trim() && arrivedStockParcels[0]?.receiver_name) {
                      setDeliveredTo(arrivedStockParcels[0].receiver_name);
                    }
                  }}
                  className="text-xs font-black px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 transition cursor-pointer"
                >
                  + تحديد الكل ({arrivedStockParcels.length})
                </button>
              )}
            </div>

            {arrivedStockParcels.length === 0 ? (
              <p className="text-xs text-white/75 font-bold bg-black/45 p-2 rounded-xl border border-[#D4AF37]/20 text-center">
                {selectedParcels.length > 0
                  ? '✅ تم تحديد جميع كوليات الستوك في الدفعة أدناه'
                  : 'لا توجد حالياً كوليات في ستوك المحطة.'}
              </p>
            ) : (
              <div className="max-h-24 overflow-y-auto space-y-1.5 pr-0.5">
                {arrivedStockParcels.map(sp => {
                  const spRem = Math.max(0, Math.round((sp.amount_due - sp.amount_paid) * 100) / 100);
                  const spOwnership = getParcelSourceOwnershipInfo(sp, currentWorkspace?.id, currentWorkspace?.name);
                  return (
                    <div
                      key={sp.id}
                      className={`bg-black/55 px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${
                        spOwnership.isPartnership ? 'border-purple-500/50' : 'border-[#D4AF37]/25'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-black text-[#F5D799] bg-[#D4AF37]/15 px-1.5 py-0.5 rounded border border-[#D4AF37]/30">
                            #{sp.parcel_number}
                          </span>
                          <span className="font-black text-white text-xs sm:text-sm truncate">
                            👤 {sp.receiver_name}
                          </span>
                        </div>
                        <div className="text-xs text-white/80 font-bold flex items-center gap-1.5 truncate">
                          <span className="truncate">📦 {sp.description}</span>
                          <span>•</span>
                          <span className="font-mono text-white font-black shrink-0" dir="ltr">
                            {spRem <= 0 ? '✅ خالص' : `⏳ ${spRem} ${sp.currency}`}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddParcelByCode(sp.tracking_code)}
                        className="btn-add px-2.5 py-1.5 rounded-xl font-black text-xs shrink-0 cursor-pointer transition"
                      >
                        + تسليم
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {selectedParcels.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center bg-black/45 rounded-2xl border border-dashed border-[#D4AF37]/30 p-4 space-y-2.5">
              <Package className="w-8 h-8 text-[#D4AF37]/60 mx-auto" />
              <h4 className="text-sm font-black text-white">لم يتم تحديد أي كولي للتسليم</h4>
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="btn-gold inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm shadow transition active:scale-95 cursor-pointer"
              >
                <Scan className="w-4 h-4" />
                <span>📷 مسح باركود الكولي</span>
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleConfirmBatchDelivery}
              className="flex-1 flex flex-col justify-between gap-2 min-h-0 overflow-hidden"
            >
              {/* 1. الكوليات المحددة للتسليم */}
              <div className="bg-black/50 p-2.5 rounded-xl border border-[#D4AF37]/35 space-y-1.5 shrink-0">
                <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-1">
                  <span className="text-[#F5C84C] font-black text-xs sm:text-sm">
                    📋 المحددة للتسليم ({selectedParcels.length}) — 📦 الطرود: {totalItems}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedParcels([])}
                    className="text-xs text-rose-400 font-black hover:underline cursor-pointer"
                  >
                    🗑️ إفراغ
                  </button>
                </div>

                <div className="max-h-20 overflow-y-auto space-y-1 pr-0.5">
                  {selectedParcels.map((parcel) => {
                    const rem = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
                    return (
                      <div 
                        key={parcel.id}
                        className="bg-black/55 px-2.5 py-1.5 rounded-xl border border-[#D4AF37]/25 flex items-center justify-between gap-1.5"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 truncate">
                          <span className="font-mono text-xs font-black text-[#F5D799]">
                            #{parcel.parcel_number}
                          </span>
                          <span className="truncate font-bold text-xs sm:text-sm">📦 {parcel.description}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs font-mono font-black" dir="ltr">
                            {rem <= 0 ? '✅ خالص' : `⏳ ${rem} ${parcel.currency}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveParcel(parcel.id)}
                            className="btn-delete p-1 rounded-lg"
                            title="إزالة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. ملخص المبالغ */}
              <div className="grid grid-cols-3 gap-2 text-center shrink-0">
                <div className="bg-black/55 p-2 rounded-xl border border-[#D4AF37]/20">
                  <span className="text-[10px] text-white/75 font-bold block">💰 المجموع</span>
                  <span className="font-black text-white font-mono text-xs sm:text-sm" dir="ltr">
                    {hideAmounts ? '••••' : totalDue} {currency}
                  </span>
                </div>
                <div className="bg-black/55 p-2 rounded-xl border border-[#D4AF37]/20">
                  <span className="text-[10px] text-white/75 font-bold block">✅ المدفوع</span>
                  <span className="font-black text-emerald-400 font-mono text-xs sm:text-sm" dir="ltr">
                    {hideAmounts ? '••••' : totalPaid} {currency}
                  </span>
                </div>
                <div className="bg-black/55 p-2 rounded-xl border border-[#D4AF37]/20">
                  <span className="text-[10px] text-white/75 font-bold block">⏳ المتبقي</span>
                  <span className="font-black text-[#F5D799] font-mono text-xs sm:text-sm" dir="ltr">
                    {hideAmounts ? '••••' : totalRemaining} {currency}
                  </span>
                </div>
              </div>

              {/* 3. المستخلص الآن حدا اسم المستلم */}
              <div className="grid grid-cols-2 gap-2.5 shrink-0">
                <div className="bg-black/50 p-2.5 rounded-xl border border-[#D4AF37]/45 flex flex-col justify-center gap-1">
                  <label className="text-xs sm:text-sm font-black text-white block truncate">
                    💵 المستخلص ({currency}):
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={String(totalRemaining)}
                    className="w-full bg-black/55 border border-[#D4AF37]/50 focus:border-[#F5D799] rounded-xl px-2.5 py-2 text-white font-mono font-black text-xs sm:text-sm focus:outline-none text-center"
                  />
                </div>

                <div className="bg-black/50 p-2.5 rounded-xl border border-[#D4AF37]/45 flex flex-col justify-center gap-1">
                  <label className="text-xs sm:text-sm font-black text-white block truncate">
                    👤 اسم المستلم *:
                  </label>
                  <input
                    type="text"
                    required
                    value={deliveredTo}
                    onChange={e => setDeliveredTo(e.target.value)}
                    placeholder="اسم المستلم..."
                    className="w-full bg-black/55 border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-white font-black text-xs sm:text-sm focus:outline-none focus:border-[#F5D799]"
                  />
                </div>
              </div>

              {/* 4. ملاحظة التسليم */}
              <div className="bg-black/50 p-2 rounded-xl border border-[#D4AF37]/35 flex flex-col justify-center shrink-0">
                <input
                  type="text"
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  placeholder="📝 ملاحظة التسليم (اختياري)..."
                  className="w-full bg-black/55 border border-[#D4AF37]/30 rounded-xl px-2.5 py-2 text-white font-bold text-xs sm:text-sm focus:outline-none focus:border-[#F5D799]"
                />
              </div>

              {/* Debt Notice Confirmation Checkbox (if remaining debt) */}
              {totalRemaining > 0 && (parseFloat(paymentAmount) || 0) < totalRemaining && (
                <div className="bg-amber-950/30 border border-[#D4AF37]/50 p-2 rounded-xl flex items-center gap-2 shrink-0">
                  <input
                    type="checkbox"
                    id="confirmDebtNoticeBatch"
                    checked={confirmDebtNotice}
                    onChange={e => setConfirmDebtNotice(e.target.checked)}
                    className="w-4 h-4 rounded border-[#D4AF37]/60 text-[#D4AF37] focus:ring-0 focus:outline-none cursor-pointer"
                  />
                  <label htmlFor="confirmDebtNoticeBatch" className="text-xs font-black text-[#F5D799] cursor-pointer select-none truncate">
                    ⚠️ أوافق على التسليم مع بقاء كريدي ({Math.max(0, totalRemaining - (parseFloat(paymentAmount) || 0))} {currency})
                  </label>
                </div>
              )}

              {/* 5. زر تأكيد التسليم الكبير فالتحت */}
              <button
                type="submit"
                disabled={isSubmitting || selectedParcels.length === 0}
                data-btn-role="add"
                data-btn-role-fixed="true"
                className="btn-add w-full py-3.5 px-4 rounded-xl font-black text-sm sm:text-base shadow-xl transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer shrink-0"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isSubmitting 
                    ? '⏳ جاري التسليم...' 
                    : `✅ تأكيد تسليم (${selectedParcels.length}) كوليات للزبون`}
                </span>
              </button>
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
