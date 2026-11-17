import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Trip, Parcel, ParcelCondition } from '../types/database';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { printOfficialTripManifestPDF, openWhatsAppParcelNotification } from '../utils/logisticsFeatures';
import { 
  X, 
  Truck, 
  Scan, 
  Package, 
  CheckCircle2, 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  MapPin, 
  FileText,
  Lock,
  Layers,
  Phone,
  Printer,
  Zap,
  MessageCircle,
  Edit3
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';

interface TripArrivalModalProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  onTripClosed?: (trip: Trip) => void;
  onOpenTicket?: (parcel: Parcel) => void;
}

export const TripArrivalModal: React.FC<TripArrivalModalProps> = ({
  trip: tripProp,
  isOpen,
  onClose,
  onTripClosed,
  onOpenTicket
}) => {
  const { 
    currentWorkspace,
    trips,
    parcels, 
    exchangeRate,
    hideAmounts,
    userRole,
    confirmTripArrivedAtDestination,
    receiveParcelAtDestination, 
    receiveAllParcelsInTrip,
    updateTripExpenses,
    closeTrip, 
    showToast 
  } = useApp();

  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isBatchReceiving, setIsBatchReceiving] = useState(false);
  const [showBulkWhatsApp, setShowBulkWhatsApp] = useState(false);
  const [notifiedParcelIds, setNotifiedParcelIds] = useState<Record<string, boolean>>({});
  
  // State for condition assignment on arrival scan
  const [scanCondition, setScanCondition] = useState<ParcelCondition>('normal');
  const [scanConditionNotes, setScanConditionNotes] = useState('');

  // Trip Expenses quick editor state
  const [showExpensesEditor, setShowExpensesEditor] = useState(false);
  const [fuelExpense, setFuelExpense] = useState('0');
  const [tollExpense, setTollExpense] = useState('0');
  const [driverCommission, setDriverCommission] = useState('0');
  const [otherExpense, setOtherExpense] = useState('0');
  const [expenseCurrency, setExpenseCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [deductFromCashbox, setDeductFromCashbox] = useState(false);

  // Close trip with manual reason modal state
  const [showCloseReasonModal, setShowCloseReasonModal] = useState(false);
  const [closeReasonInput, setCloseReasonInput] = useState('');
  const [isClosingTrip, setIsClosingTrip] = useState(false);

  const trip = trips.find(t => t.id === tripProp?.id) || tripProp;

  useEffect(() => {
    if (trip) {
      setFuelExpense(String(trip.fuel_expense ?? 0));
      setTollExpense(String(trip.toll_expense ?? 0));
      setDriverCommission(String(trip.driver_commission ?? 0));
      setOtherExpense(String(trip.other_expense ?? 0));
      setExpenseCurrency((trip.expense_currency as 'MAD' | 'MRU') || 'MAD');
      setDeductFromCashbox(Boolean(trip.deduct_from_cashbox));
      setShowExpensesEditor(false);
      setShowBulkWhatsApp(false);
    }
  }, [trip?.id]);

  if (!isOpen || !trip) return null;

  // Loaded parcels in loading order
  const allLoadedParcels: Parcel[] = trip.loaded_parcel_ids
    .map(id => parcels.find(p => p.id === id))
    .filter((p): p is Parcel => Boolean(p));

  const totalCount = trip.loaded_parcel_ids.length;
  const receivedCount = trip.received_parcel_ids.length;
  const missingCount = Math.max(0, totalCount - receivedCount);
  const isTripFinished = missingCount === 0 && totalCount > 0;

  // Trip Profit Calculation
  const expCurr = (trip.expense_currency as 'MAD' | 'MRU') || 'MAD';
  const totalRoadExpenses =
    Math.round(
      ((trip.fuel_expense || 0) +
        (trip.toll_expense || 0) +
        (trip.driver_commission || 0) +
        (trip.other_expense || 0)) *
        100
    ) / 100;
  const tripRevenueInExpCurrency = allLoadedParcels.reduce((acc, p) => {
    if (p.is_returning) return acc;
    const due = Number(p.amount_due) || 0;
    if (p.currency === expCurr) return acc + due;
    if (expCurr === 'MAD' && p.currency === 'MRU') {
      return acc + (exchangeRate > 0 ? due / exchangeRate : 0);
    }
    if (expCurr === 'MRU' && p.currency === 'MAD') {
      return acc + due * exchangeRate;
    }
    return acc + due;
  }, 0);
  const roundedRevenue = Math.round(tripRevenueInExpCurrency * 100) / 100;
  const netTripProfit = Math.round((roundedRevenue - totalRoadExpenses) * 100) / 100;

  // Bulk WhatsApp notification queue for arrived/loaded parcels
  const notifiableParcels = allLoadedParcels.filter(
    p => p.status !== 'delivered' && Boolean((p.is_returning ? p.sender_phone : p.receiver_phone)?.trim())
  );
  const pendingNotifyParcels = notifiableParcels.filter(p => !notifiedParcelIds[p.id]);

  const handleNotifyOneParcel = (parcel: Parcel) => {
    openWhatsAppParcelNotification(
      parcel,
      'arrived_receiver',
      currentWorkspace?.custom_brand_name || currentWorkspace?.name
    );
    setNotifiedParcelIds(prev => ({ ...prev, [parcel.id]: true }));
  };

  const handleSaveExpenses = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTripExpenses(trip.id, {
      fuelExpense: Math.max(0, parseFloat(fuelExpense) || 0),
      tollExpense: Math.max(0, parseFloat(tollExpense) || 0),
      driverCommission: Math.max(0, parseFloat(driverCommission) || 0),
      otherExpense: Math.max(0, parseFloat(otherExpense) || 0),
      expenseCurrency,
      deductFromCashbox,
    });
    setShowExpensesEditor(false);
  };

  const handleBatchReceiveAll = async () => {
    if (missingCount <= 0) return;
    setIsBatchReceiving(true);
    try {
      if (trip.status === 'departed') {
        await confirmTripArrivedAtDestination(trip.id);
      }
      const res = await receiveAllParcelsInTrip(trip.id);
      if (res.success) {
        playSuccessBeep();
      } else {
        playErrorBeep();
        showToast(res.error || 'تعذر تفريغ الكوليات دفعة واحدة', 'error');
      }
    } finally {
      setIsBatchReceiving(false);
    }
  };

  const handleScanOrInput = async (scannedCode: string) => {
    if (!scannedCode.trim()) return;

    if (scanCondition === 'abnormal' && !scanConditionNotes.trim()) {
      showToast('يرجى كتابة ملاحظة بيان العيب في الكولي غير العادي', 'error');
      playErrorBeep();
      return;
    }

    if (trip.status === 'departed') {
      await confirmTripArrivedAtDestination(trip.id);
    }

    const res = await receiveParcelAtDestination(
      trip.id,
      scannedCode.trim(),
      scanCondition,
      scanCondition === 'abnormal' ? scanConditionNotes.trim() : undefined
    );

    if (res.success) {
      playSuccessBeep();
      setManualCode('');
      setScanCondition('normal');
      setScanConditionNotes('');
      showToast(`تم مسح الكولي #${res.parcel?.parcel_number || ''} ودخوله المحطة بنجاح`, 'success');
      
      if (res.allScanned) {
        showToast('رائع! تم مسح واستقبال جميع كوليات هذه الرحلة بالكامل 🎉', 'success');
      }
    } else {
      playErrorBeep();
      showToast(res.error || 'تعذر تسجيل وصول الكولي', 'error');
    }
  };

  const handleManualFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScanOrInput(manualCode);
  };

  const handleExecuteClose = async (reason?: string) => {
    setIsClosingTrip(true);
    try {
      const res = await closeTrip(trip.id, reason);
      if (res.success && res.trip) {
        showToast(`تم إغلاق وتفريغ الرحلة [${res.trip.trip_code}] بنجاح`, 'success');
        setShowCloseReasonModal(false);
        if (onTripClosed) onTripClosed(res.trip);
        onClose();
      } else {
        showToast(res.error || 'تعذر إغلاق الرحلة', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ غير متوقع', 'error');
    } finally {
      setIsClosingTrip(false);
    }
  };

  const handleInitiateCloseTrip = () => {
    if (missingCount > 0) {
      setShowCloseReasonModal(true);
    } else {
      handleExecuteClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 bg-black/80 backdrop-blur-md animate-fadeIn overflow-y-auto" dir="rtl" onClick={onClose}>
      <div 
        className="w-[calc(100%-8px)] max-w-[420px] luxury-card border-2 border-[#D4AF37]/65 rounded-[22px] shadow-2xl overflow-hidden overflow-x-hidden flex flex-col text-right relative max-h-[92vh] my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-2.5 sm:p-3 border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center font-black shadow-md shrink-0">
                <Truck className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs sm:text-sm font-black text-white truncate">
                    📥 استلام رحلة [{trip.trip_code}]
                  </h3>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-lg font-black ${
                    trip.status === 'closed'
                      ? 'bg-black/40 text-white/75 border border-[#D4AF37]/30'
                      : isTripFinished
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#D4AF37]/20 text-[#F5D799] border border-[#D4AF37]/40'
                  }`}>
                    {trip.status === 'closed' ? '🔒 مغلقة' : isTripFinished ? '✅ اكتمل' : trip.status === 'departed' ? '🚚 رحلة' : '🏁 وصلات / تفريغ'}
                  </span>
                </div>
                <p className="text-[10px] text-white/80 font-bold mt-0.5 flex items-center gap-1 truncate">
                  <span>📍 {trip.origin_station_name}</span>
                  <span className="text-[#D4AF37]">⬅</span>
                  <span>{trip.destination_station_name}</span>
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="btn-cancel p-1.5 rounded-xl shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Step 4 (وصلات) Banner if trip is still 'departed' */}
          {trip.status === 'departed' && (
            <div className="mt-2 p-2 rounded-xl bg-amber-950/80 border border-[#F5C84C] flex items-center justify-between gap-2">
              <span className="text-[10px] font-black text-[#F5C84C]">
                🏁 المرحلة 4 (وصلات): أكد وصول الرحلة للمحطة قبل التفريغ
              </span>
              <button
                type="button"
                onClick={() => confirmTripArrivedAtDestination(trip.id)}
                className="px-2.5 py-1 rounded-lg bg-[#F5C84C] text-black font-black text-[10px] shrink-0 cursor-pointer"
              >
                🏁 وصلات للمحطة
              </button>
            </div>
          )}

          {/* Metrics & Driver Plate Bar (Compact 2x2) */}
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-black/50 px-2.5 py-1.5 rounded-xl border border-[#D4AF37]/30 flex items-center justify-between gap-1 min-w-0">
              <span className="text-[10px] font-bold text-white/75 shrink-0">👤 السائق:</span>
              <span className="font-black text-white text-[11px] truncate">{trip.driver_name}</span>
            </div>
            <div className="bg-black/50 px-2.5 py-1.5 rounded-xl border border-[#D4AF37]/30 flex items-center justify-between gap-1 min-w-0">
              <span className="text-[10px] font-bold text-white/75 shrink-0">🚛 اللوحة:</span>
              <span className="font-black font-mono text-[#F5D799] text-[11px] truncate">{trip.vehicle_plate}</span>
            </div>
            <div className="bg-emerald-500/10 px-2.5 py-1.5 rounded-xl border border-emerald-500/35 flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold text-emerald-300">✅ بالستوك:</span>
              <span className="font-black font-mono text-emerald-300 text-xs">
                {receivedCount}/{totalCount}
              </span>
            </div>
            <div className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-1 ${
              missingCount > 0 ? 'bg-amber-500/15 border-[#D4AF37]/50 text-[#F5D799]' : 'bg-black/50 border-[#D4AF37]/25 text-white/80'
            }`}>
              <span className="text-[10px] font-bold">📦 المتبقي:</span>
              <span className="font-black font-mono text-xs">
                {missingCount === 0 ? '0 ✓' : `${missingCount} كولي`}
              </span>
            </div>
          </div>

          {/* Trip Financials & Net Profit Strip (Visible to owner/manager) */}
          {userRole !== 'worker' && (
            <div className="mt-2 bg-black/50 p-2 rounded-xl border border-[#D4AF37]/30 space-y-1.5 text-[10px]">
              <div className="flex items-center justify-between">
                <span className="font-black text-white text-[11px]">💰 حساب الرحلة والربح الصافي:</span>
                <button
                  type="button"
                  onClick={() => setShowExpensesEditor(prev => !prev)}
                  className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{showExpensesEditor ? 'إغلاق' : '⚙️ المصاريف'}</span>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                <div className="bg-black/45 p-1 rounded-lg border border-white/10">
                  <span className="text-white/70 block font-sans font-bold">📥 المداخيل</span>
                  <span className="font-black text-emerald-400" dir="ltr">
                    {hideAmounts ? '••••' : roundedRevenue} {expCurr}
                  </span>
                </div>
                <div className="bg-black/45 p-1 rounded-lg border border-white/10">
                  <span className="text-white/70 block font-sans font-bold">📤 المصاريف</span>
                  <span className="font-black text-rose-400" dir="ltr">
                    {hideAmounts ? '••••' : totalRoadExpenses} {expCurr}
                  </span>
                </div>
                <div className="bg-black/45 p-1 rounded-lg border border-[#D4AF37]/35">
                  <span className="text-white/70 block font-sans font-bold">💎 الصافي</span>
                  <span
                    className={`font-black ${netTripProfit >= 0 ? 'text-[#F5C84C]' : 'text-rose-400'}`}
                    dir="ltr"
                  >
                    {hideAmounts ? '••••' : netTripProfit} {expCurr}
                  </span>
                </div>
              </div>

              {showExpensesEditor && (
                <form onSubmit={handleSaveExpenses} className="pt-2 border-t border-white/15 space-y-2">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="block text-[9px] font-bold text-white/80 mb-0.5">⛽ المازوط:</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={fuelExpense}
                        onChange={e => setFuelExpense(e.target.value)}
                        className="w-full bg-black/55 border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono font-black text-xs"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-white/80 mb-0.5">🛣️ الطريق/المعبر:</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tollExpense}
                        onChange={e => setTollExpense(e.target.value)}
                        className="w-full bg-black/55 border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono font-black text-xs"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-white/80 mb-0.5">👤 عمولة السائق:</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={driverCommission}
                        onChange={e => setDriverCommission(e.target.value)}
                        className="w-full bg-black/55 border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono font-black text-xs"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-white/80 mb-0.5">📝 أخرى:</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={otherExpense}
                        onChange={e => setOtherExpense(e.target.value)}
                        className="w-full bg-black/55 border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono font-black text-xs"
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={expenseCurrency}
                      onChange={e => setExpenseCurrency(e.target.value as 'MAD' | 'MRU')}
                      className="bg-black/55 border border-[#D4AF37]/40 rounded-lg px-2 py-1.5 text-white font-mono font-black text-xs"
                    >
                      <option value="MAD">MAD</option>
                      <option value="MRU">MRU</option>
                    </select>
                    <label className="flex items-center gap-1.5 text-[10px] font-bold text-white/90 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={deductFromCashbox}
                        disabled={Boolean(trip.deduct_from_cashbox)}
                        onChange={e => setDeductFromCashbox(e.target.checked)}
                        className="accent-[#D4AF37] w-3.5 h-3.5 rounded"
                      />
                      <span>{trip.deduct_from_cashbox ? '✓ مخصوم من الصندوق' : 'خصم من صندوق الانطلاق'}</span>
                    </label>
                  </div>
                  <button type="submit" className="btn-gold w-full py-1.5 rounded-lg font-black text-xs">
                    ✅ حفظ المصاريف
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Bulk WhatsApp Broadcast Bar when Trip has arrived / loaded parcels */}
          {notifiableParcels.length > 0 && (
            <div className="mt-2 bg-emerald-950/55 border border-emerald-500/45 rounded-xl p-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-emerald-300 truncate">
                    📲 إعلام جماعي للزبناء بوصول الرحلة
                  </p>
                  <p className="text-[9px] text-white/75 font-bold">
                    {pendingNotifyParcels.length > 0
                      ? `باقي ${pendingNotifyParcels.length} من ${notifiableParcels.length} زبون للإعلام`
                      : `تم إعلام جميع الزبناء (${notifiableParcels.length}) ✅`}
                  </p>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {pendingNotifyParcels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleNotifyOneParcel(pendingNotifyParcels[0])}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] flex items-center gap-1 shadow-sm cursor-pointer"
                    >
                      <MessageCircle className="w-3 h-3" />
                      <span>أرسل للتالي ({pendingNotifyParcels.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowBulkWhatsApp(prev => !prev)}
                    className="btn-cancel px-2 py-1.5 rounded-lg text-[10px] font-black cursor-pointer"
                  >
                    {showBulkWhatsApp ? 'إخفاء' : 'القائمة'}
                  </button>
                </div>
              </div>

              {showBulkWhatsApp && (
                <div className="max-h-36 overflow-y-auto space-y-1 pt-1 border-t border-emerald-500/25">
                  {notifiableParcels.map(p => {
                    const isSent = Boolean(notifiedParcelIds[p.id]);
                    const rem = Math.max(0, Math.round((p.amount_due - p.amount_paid) * 100) / 100);
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border text-[10px] ${
                          isSent ? 'bg-emerald-500/15 border-emerald-500/40' : 'bg-black/50 border-white/10'
                        }`}
                      >
                        <div className="min-w-0 flex-1 truncate">
                          <span className="font-mono font-black text-[#F5C84C] mr-1">#{p.parcel_number}</span>
                          <span className="font-black text-white">{p.is_returning ? p.sender_name : p.receiver_name}</span>
                          <span className="text-white/70 mx-1 font-mono" dir="ltr">
                            {rem > 0 ? `(الباقي: ${rem} ${p.currency})` : '(خالص ✓)'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleNotifyOneParcel(p)}
                          className={`px-2 py-1 rounded-md font-black text-[10px] shrink-0 cursor-pointer ${
                            isSent
                              ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40'
                              : 'bg-emerald-500 text-slate-950'
                          }`}
                        >
                          {isSent ? '✓ أُرسل' : '💬 واتساب'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Scan Actions & Condition Quick Toggle */}
        {trip.status !== 'closed' && (
          <div className="p-2.5 border-b border-[#D4AF37]/25 space-y-2 shrink-0">
            {/* Condition check upon arrival */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setScanCondition('normal')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition ${
                  scanCondition === 'normal'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'btn-cancel'
                }`}
              >
                ✅ سليم (عادي)
              </button>
              <button
                type="button"
                onClick={() => setScanCondition('abnormal')}
                className={`py-1.5 px-2 rounded-xl text-[11px] font-black border transition ${
                  scanCondition === 'abnormal'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'btn-cancel'
                }`}
              >
                ⚠️ به تلف / عيب
              </button>
            </div>

            {scanCondition === 'abnormal' && (
              <input
                type="text"
                placeholder="📝 ملاحظة التلف أو العيب..."
                value={scanConditionNotes}
                onChange={e => setScanConditionNotes(e.target.value)}
                className="w-full bg-black/55 border border-[#D4AF37]/60 rounded-xl px-2.5 py-2 text-xs font-black text-white focus:outline-none"
              />
            )}

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="btn-gold py-2 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 shadow-md active:scale-95 transition"
              >
                <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>تفريغ جماعي</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  printOfficialTripManifestPDF(
                    trip,
                    allLoadedParcels,
                    currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'إكسبريس الصحراء',
                    currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || ''
                  )
                }
                className="btn-cancel py-2 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 border border-[#F5C84C]/50 text-[#F5C84C] transition"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>مانيفست PDF</span>
              </button>
            </div>

            <form onSubmit={handleManualFormSubmit} className="flex gap-1.5">
              <input
                type="text"
                placeholder="🔢 كود الكولي (مثال: 0000466)..."
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                className="flex-1 min-w-0 bg-black/55 border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-2.5 py-2 text-xs text-white font-mono font-black focus:outline-none"
              />
              <button
                type="submit"
                className="btn-gold px-3 py-2 rounded-xl font-black text-xs shrink-0 transition active:scale-95"
              >
                📥 إدخال
              </button>
            </form>
          </div>
        )}

        {/* Parcels Manifest & Scanning Status (Loading Order) */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between pb-1 flex-wrap gap-1">
            <span className="font-black text-white text-[11px] flex items-center gap-1">
              <span>📦 الكوليات ({receivedCount}/{totalCount}):</span>
            </span>
            {trip.status !== 'closed' && missingCount > 0 && (
              <button
                type="button"
                disabled={isBatchReceiving}
                onClick={handleBatchReceiveAll}
                className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isBatchReceiving
                  ? '⏳ جاري التفريغ...'
                  : `⚡ تفريغ الكل للستوك (${missingCount})`}
              </button>
            )}
          </div>

          {allLoadedParcels.map((parcel, idx) => {
            const isScanned = trip.received_parcel_ids.includes(parcel.id);

            return (
              <div
                key={parcel.id}
                className={`p-2 rounded-xl border transition flex items-center justify-between gap-1.5 ${
                  isScanned
                    ? 'bg-emerald-500/10 border-emerald-500/40'
                    : 'bg-black/55 border-[#D4AF37]/45 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div className={`w-6 h-6 rounded-lg font-mono font-black text-[10px] flex items-center justify-center shrink-0 border ${
                    isScanned
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-[#D4AF37]/20 text-[#F5D799] border-[#D4AF37]/40'
                  }`}>
                    #{idx + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono font-black text-white text-[11px]">
                        {parcel.tracking_code}
                      </span>
                      {(parcel.is_returning || parcel.status === 'return_in_transit' || parcel.status === 'returned') && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ↩️ إرجاع
                        </span>
                      )}
                      {parcel.condition === 'abnormal' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚠️ عيب
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-white/80 font-bold truncate mt-0.5">
                      <span>👤 {parcel.is_returning ? parcel.sender_name : parcel.receiver_name}</span>
                      <span className="mx-1">•</span>
                      <span>📦 {parcel.description}</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge & Quick Action Buttons */}
                <div className="shrink-0 flex items-center gap-1">
                  {isScanned && (
                    <button
                      type="button"
                      onClick={() =>
                        openWhatsAppParcelNotification(
                          parcel,
                          'arrived_receiver',
                          currentWorkspace?.custom_brand_name || currentWorkspace?.name
                        )
                      }
                      className="btn-cancel px-2 py-1 rounded-lg text-emerald-300 border border-emerald-500/40 font-black text-[10px]"
                      title="إشعار واتساب"
                    >
                      💬
                    </button>
                  )}

                  {!isScanned && trip.status !== 'closed' && (
                    <button
                      type="button"
                      onClick={() => handleScanOrInput(parcel.tracking_code)}
                      className="px-2 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition cursor-pointer"
                    >
                      + للستوك
                    </button>
                  )}

                  {onOpenTicket && (
                    <button
                      type="button"
                      onClick={() => onOpenTicket(parcel)}
                      className="btn-cancel px-2 py-1 rounded-lg font-black text-[10px]"
                      title="طباعة الملصق"
                    >
                      🖨️
                    </button>
                  )}

                  <span className={`text-[9px] px-1.5 py-0.5 rounded-lg font-black ${
                    isScanned
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                      : 'bg-[#D4AF37]/20 text-[#F5D799] border border-[#D4AF37]/35'
                  }`}>
                    {isScanned ? '✓ ستوك' : '🚚 شاحنة'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Close Trip Action */}
        <div className="p-2.5 border-t border-[#D4AF37]/30 shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel px-3 py-2.5 rounded-xl font-black text-xs"
          >
            إغلاق
          </button>

          {trip.status !== 'closed' && (
            <button
              type="button"
              onClick={handleInitiateCloseTrip}
              disabled={isClosingTrip}
              className="btn-gold flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-black text-xs shadow-lg transition active:scale-95"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {isTripFinished 
                  ? '✅ إغلاق الرحلة واكتمال التفريغ' 
                  : `🔒 إغلاق الرحلة (${missingCount} متبقي)`}
              </span>
            </button>
          )}
        </div>

      </div>

      {/* Manual Close Reason Modal (Required when parcels are missing) */}
      {showCloseReasonModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md animate-fadeIn" dir="rtl">
          <div className="w-full max-w-[360px] bg-[#1a0f00] border-2 border-[#D4AF37]/65 rounded-[24px] p-4 shadow-2xl space-y-3.5 text-right">
            <div className="flex items-center gap-2 text-[#D4AF37]">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h4 className="font-black text-xs text-white">تأكيد إغلاق الرحلة مع نقص في الكوليات</h4>
            </div>

            <p className="text-[11px] text-[#EAD6B0] leading-relaxed">
              تنبيه: يوجد <strong className="text-[#F5D799] font-bold font-mono">{missingCount}</strong> كولي لم يتم مسحه بعد. يُشترط كتابة مبرر إداري رسمي قبل إغلاق الرحلة وتوثيقه في سجل التدقيق:
            </p>

            <div>
              <label className="block text-[10px] font-bold text-[#F5D799] mb-1">سبب ومبرر إغلاق الرحلة *</label>
              <textarea
                rows={3}
                required
                placeholder="مثال: تم إرجاع طردين من قِبل السائق لمحطة الانطلاق..."
                value={closeReasonInput}
                onChange={e => setCloseReasonInput(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/50 focus:border-[#F5D799] rounded-xl p-2.5 text-xs text-white focus:outline-none leading-relaxed"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCloseReasonModal(false)}
                className="btn-cancel flex-1 py-2 rounded-xl bg-[#120a00] border border-[#D4AF37]/35 text-[#C2A878] font-bold text-xs"
              >
                تراجع
              </button>
              <button
                type="button"
                onClick={() => handleExecuteClose(closeReasonInput)}
                disabled={!closeReasonInput.trim() || isClosingTrip}
                className="flex-[2] py-2 rounded-xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] text-[#140b00] font-black text-xs shadow-md disabled:opacity-50"
              >
                {isClosingTrip ? 'جاري الإغلاق...' : 'تأكيد الإغلاق ➔'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanOrInput}
        defaultBurstMode={true}
        title="تفريغ جماعي سريع للكوليات (Rafale)"
        subtitle={`الرحلة: ${trip.trip_code} • تفريغ بالمحطة`}
        placeholder="أدخل كود الكولي لتسجيل دخوله المحطة..."
      />
    </div>
  );
};
