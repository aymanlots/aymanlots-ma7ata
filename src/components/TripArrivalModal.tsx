import React, { useState } from 'react';
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
  MessageCircle
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
    receiveParcelAtDestination, 
    closeTrip, 
    showToast 
  } = useApp();

  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  
  // State for condition assignment on arrival scan
  const [scanCondition, setScanCondition] = useState<ParcelCondition>('normal');
  const [scanConditionNotes, setScanConditionNotes] = useState('');

  // Close trip with manual reason modal state
  const [showCloseReasonModal, setShowCloseReasonModal] = useState(false);
  const [closeReasonInput, setCloseReasonInput] = useState('');
  const [isClosingTrip, setIsClosingTrip] = useState(false);

  const trip = trips.find(t => t.id === tripProp?.id) || tripProp;

  if (!isOpen || !trip) return null;

  // Loaded parcels in loading order
  const allLoadedParcels: Parcel[] = trip.loaded_parcel_ids
    .map(id => parcels.find(p => p.id === id))
    .filter((p): p is Parcel => Boolean(p));

  const totalCount = trip.loaded_parcel_ids.length;
  const receivedCount = trip.received_parcel_ids.length;
  const missingCount = Math.max(0, totalCount - receivedCount);
  const isTripFinished = missingCount === 0 && totalCount > 0;

  const handleScanOrInput = async (scannedCode: string) => {
    if (!scannedCode.trim()) return;

    if (scanCondition === 'abnormal' && !scanConditionNotes.trim()) {
      showToast('يرجى كتابة ملاحظة بيان العيب في الكولي غير العادي', 'error');
      playErrorBeep();
      return;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/90 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div 
        className="w-full max-w-[380px] bg-[#1a0f00]/95 border border-[#D4AF37]/65 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-3.5 border-b border-[#D4AF37]/30 bg-[#120a00] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center font-black shadow-md">
                <Truck className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-black text-white">
                    تفريغ الرحلة [{trip.trip_code}]
                  </h3>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                    trip.status === 'closed'
                      ? 'bg-[#1a0f00] text-[#C2A878] border border-[#D4AF37]/30'
                      : isTripFinished
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[#D4AF37]/20 text-[#F5D799] border border-[#D4AF37]/40'
                  }`}>
                    {trip.status === 'closed' ? 'مغلقة' : isTripFinished ? 'اكتمل المسح' : 'قيد الاستقبال'}
                  </span>
                </div>
                <p className="text-[10px] text-[#C2A878] mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-[#D4AF37] shrink-0" />
                  <span>{trip.origin_station_name}</span>
                  <span className="text-[#8C6D3F]">➔</span>
                  <span>{trip.destination_station_name}</span>
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

          {/* Metrics & Driver Plate Bar */}
          <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-xs">
            <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/25">
              <span className="text-[9px] text-[#C2A878] block">الشيفور:</span>
              <span className="font-bold text-white text-[11px] truncate block">{trip.driver_name}</span>
            </div>
            <div className="bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/25">
              <span className="text-[9px] text-[#C2A878] block">العربة:</span>
              <span className="font-bold font-mono text-[#F5D799] text-[11px] truncate block">{trip.vehicle_plate}</span>
            </div>
            <div className="bg-[#0d0700] p-2 rounded-xl border border-emerald-500/30">
              <span className="text-[9px] text-emerald-400 block">تم المسح والدخول:</span>
              <span className="font-bold font-mono text-emerald-300 text-xs">
                {receivedCount} من {totalCount}
              </span>
            </div>
            <div className={`p-2 rounded-xl border ${
              missingCount > 0 ? 'bg-amber-500/10 border-[#D4AF37]/40 text-[#F5D799]' : 'bg-[#0d0700] border-[#D4AF37]/25 text-[#C2A878]'
            }`}>
              <span className="text-[9px] block">المتبقية:</span>
              <span className="font-bold font-mono text-xs">
                {missingCount === 0 ? '✓ لا يوجد نقص' : `${missingCount} كولي`}
              </span>
            </div>
          </div>
        </div>

        {/* Scan Actions & Condition Quick Toggle */}
        {trip.status !== 'closed' && (
          <div className="p-3 bg-[#0d0700] border-b border-[#D4AF37]/25 space-y-2.5 shrink-0">
            {/* Condition check upon arrival */}
            <div className="flex flex-col gap-1.5 bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30 text-xs">
              <span className="text-[10px] font-bold text-[#F5D799]">
                حالة الكولي الممسوح حالياً:
              </span>
              <div className="flex items-center gap-1.5 w-full">
                <button
                  type="button"
                  onClick={() => setScanCondition('normal')}
                  className={`flex-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition ${
                    scanCondition === 'normal'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500 font-black'
                      : 'bg-[#1a0f00] text-[#C2A878] border-[#D4AF37]/30'
                  }`}
                >
                  ✓ سليم (عادي)
                </button>
                <button
                  type="button"
                  onClick={() => setScanCondition('abnormal')}
                  className={`flex-1 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition ${
                    scanCondition === 'abnormal'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500 font-black'
                      : 'bg-[#1a0f00] text-[#C2A878] border-[#D4AF37]/30'
                  }`}
                >
                  ⚠ به تلف (غير عادي)
                </button>
              </div>
            </div>

            {scanCondition === 'abnormal' && (
              <input
                type="text"
                placeholder="بيان التلف أو العيب الحاصل أثناء النقل (إلزامي للتوثيق)..."
                value={scanConditionNotes}
                onChange={e => setScanConditionNotes(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/60 rounded-xl px-3 py-2 text-xs text-white placeholder-[#8C6D3F] focus:outline-none"
              />
            )}

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="btn-gold py-2.5 px-2.5 rounded-xl font-black text-[11px] flex items-center justify-center gap-1 shadow-md active:scale-95 transition"
                >
                  <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>تفريغ جماعي (Rafale)</span>
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
                  className="btn-cancel py-2.5 px-2.5 rounded-xl font-black text-[11px] flex items-center justify-center gap-1 border border-[#F5C84C]/50 text-[#F5C84C] hover:text-white transition"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>مانيفست الجمارك PDF</span>
                </button>
              </div>

              <form onSubmit={handleManualFormSubmit} className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="أو اكتب رقم الكولي / قارئ الباركود..."
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value)}
                  className="flex-1 bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-[#8C6D3F] focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-[#1a0f00] hover:bg-[#231400] text-[#F5D799] font-bold text-xs transition active:scale-95 border border-[#D4AF37]/35"
                >
                  تأكيد
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Parcels Manifest & Scanning Status (Loading Order) */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between pb-1">
            <span className="font-bold text-[#C2A878] text-[11px] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>مانيفست الشحنة:</span>
            </span>
            <span className="text-[10px] font-mono text-[#F5D799]">
              {receivedCount} تم مسحه • {missingCount} متبقي
            </span>
          </div>

          {allLoadedParcels.map((parcel, idx) => {
            const isScanned = trip.received_parcel_ids.includes(parcel.id);

            return (
              <div
                key={parcel.id}
                className={`p-2.5 rounded-2xl border transition flex items-center justify-between gap-2 ${
                  isScanned
                    ? 'bg-[#120a00]/80 border-emerald-500/35'
                    : 'bg-[#120a00] border-[#D4AF37]/45 shadow-md'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Order Number Badge */}
                  <div className={`w-6 h-6 rounded-lg font-mono font-black text-[11px] flex items-center justify-center shrink-0 border ${
                    isScanned
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-[#D4AF37]/20 text-[#F5D799] border-[#D4AF37]/40'
                  }`}>
                    #{idx + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-white text-[11px]">
                        {parcel.tracking_code}
                      </span>
                      {(parcel.is_returning || parcel.status === 'return_in_transit' || parcel.status === 'returned') && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          إرجاع ↩
                        </span>
                      )}
                      {parcel.condition === 'abnormal' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚠ به عيب
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#C2A878] truncate mt-0.5">
                      <span>{parcel.is_returning ? 'إرجاع للمرسل: ' : 'المستلم: '}<strong className="text-[#F5D799]">{parcel.is_returning ? parcel.sender_name : parcel.receiver_name}</strong></span>
                      <span className="mx-1">•</span>
                      <span>{parcel.description}</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge & Print Button */}
                <div className="shrink-0 flex items-center gap-1.5">
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
                      className="btn-cancel flex items-center gap-1 px-2 py-1 rounded-xl text-emerald-300 border border-emerald-500/40 font-bold text-[10px]"
                      title="إشعار المستلم عبر واتساب بوصول الكولي مع رابط QR"
                    >
                      <MessageCircle className="w-3 h-3 text-emerald-400" />
                      <span>واتساب</span>
                    </button>
                  )}

                  {onOpenTicket && (
                    <button
                      type="button"
                      onClick={() => onOpenTicket(parcel)}
                      className="btn-cancel flex items-center gap-1 px-2 py-1 rounded-xl bg-[#1a0f00] hover:bg-[#231400] text-[#F5D799] font-bold text-[10px] transition border border-[#D4AF37]/35"
                      title="طباعة لاصقة الكولي (10cm × 10cm)"
                    >
                      <Printer className="w-3 h-3 text-[#D4AF37]" />
                      <span>طباعة</span>
                    </button>
                  )}

                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                    isScanned
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-[#D4AF37]/15 text-[#F5D799] border border-[#D4AF37]/35 animate-pulse'
                  }`}>
                    {isScanned ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>دخلت</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        <span>انتظار</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Close Trip Action */}
        <div className="p-3.5 border-t border-[#D4AF37]/30 bg-[#120a00] shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel px-3.5 py-2.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/35 text-[#C2A878] font-bold text-xs hover:text-white transition"
          >
            إغلاق
          </button>

          {trip.status !== 'closed' && (
            <button
              type="button"
              onClick={handleInitiateCloseTrip}
              disabled={isClosingTrip}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] hover:brightness-110 text-[#140b00] font-black text-xs shadow-lg transition active:scale-95"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {isTripFinished 
                  ? 'إغلاق الرحلة واكتمال التفريغ ➔' 
                  : `إغلاق الرحلة يدويًا (${missingCount} متبقي)`}
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
