import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Trip, Parcel } from '../types/database';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { printOfficialTripManifestPDF } from '../utils/logisticsFeatures';
import { 
  X, 
  Truck, 
  Scan, 
  Package, 
  Trash2, 
  Send, 
  AlertTriangle, 
  MapPin, 
  Layers,
  Printer,
  DollarSign,
  Edit3,
  FileText,
  Zap
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';

interface TripDispatchModalProps {
  trip: Trip | null;
  isOpen: boolean;
  onClose: () => void;
  onTripDeparted?: (trip: Trip) => void;
  onOpenTicket?: (parcel: Parcel) => void;
}

export const TripDispatchModal: React.FC<TripDispatchModalProps> = ({
  trip: tripProp,
  isOpen,
  onClose,
  onTripDeparted,
  onOpenTicket
}) => {
  const { 
    currentWorkspace,
    trips,
    parcels, 
    exchangeRate,
    hideAmounts,
    loadParcelToTrip, 
    unloadParcelFromTrip, 
    departTrip, 
    updateTripExpenses,
    showToast 
  } = useApp();

  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isDeparting, setIsDeparting] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Driver Road Expenses Editing State
  const [showExpensesEditor, setShowExpensesEditor] = useState(false);
  const [fuelExpense, setFuelExpense] = useState('0');
  const [tollExpense, setTollExpense] = useState('0');
  const [driverCommission, setDriverCommission] = useState('0');
  const [otherExpense, setOtherExpense] = useState('0');
  const [expenseCurrency, setExpenseCurrency] = useState<'MAD' | 'MRU'>('MAD');

  const trip = trips.find(t => t.id === tripProp?.id) || tripProp;

  useEffect(() => {
    if (trip) {
      setFuelExpense(String(trip.fuel_expense ?? 0));
      setTollExpense(String(trip.toll_expense ?? 0));
      setDriverCommission(String(trip.driver_commission ?? 0));
      setOtherExpense(String(trip.other_expense ?? 0));
      setExpenseCurrency((trip.expense_currency as 'MAD' | 'MRU') || 'MAD');
      setShowExpensesEditor(false);
    }
  }, [trip?.id]);

  if (!isOpen || !trip) return null;

  // Retrieve parcels in loading order
  const loadedParcelsList: Parcel[] = trip.loaded_parcel_ids
    .map(id => parcels.find(p => p.id === id))
    .filter((p): p is Parcel => Boolean(p));

  // Available registered or returning parcels ready to be loaded onto this trip
  const availableParcelsToLoad = parcels.filter(
    p =>
      !p.is_collaborator_data &&
      (p.status === 'registered' || p.status === 'return_in_transit') &&
      !trip.loaded_parcel_ids.includes(p.id)
  );

  // Calculate Trip Revenue, Road Expenses & Net Profit
  const expCurr = (trip.expense_currency as 'MAD' | 'MRU') || 'MAD';
  const totalRoadExpenses =
    Math.round(
      ((trip.fuel_expense || 0) +
        (trip.toll_expense || 0) +
        (trip.driver_commission || 0) +
        (trip.other_expense || 0)) *
        100
    ) / 100;

  const tripRevenueInExpCurrency = loadedParcelsList.reduce((acc, p) => {
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

  const handleSaveExpenses = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateTripExpenses(trip.id, {
      fuelExpense: Math.max(0, parseFloat(fuelExpense) || 0),
      tollExpense: Math.max(0, parseFloat(tollExpense) || 0),
      driverCommission: Math.max(0, parseFloat(driverCommission) || 0),
      otherExpense: Math.max(0, parseFloat(otherExpense) || 0),
      expenseCurrency,
    });
    setShowExpensesEditor(false);
  };

  const handleScanOrInput = async (scannedCode: string) => {
    setWarningMessage(null);
    if (!scannedCode.trim()) return;

    const res = await loadParcelToTrip(trip.id, scannedCode.trim());

    if (res.success) {
      playSuccessBeep();
      setManualCode('');
      if (res.warning) {
        setWarningMessage(res.warning);
        showToast(res.warning, 'info');
      } else {
        showToast(`تم شحن الكولي #${res.parcel?.parcel_number || ''} في الرحلة بنجاح`, 'success');
      }
    } else {
      playErrorBeep();
      showToast(res.error || 'تعذر شحن الكولي', 'error');
    }
  };

  const handleManualFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleScanOrInput(manualCode);
  };

  const handleUnloadParcel = async (parcelId: string) => {
    const res = await unloadParcelFromTrip(trip.id, parcelId);
    if (res.success) {
      showToast('تم إلغاء شحن الكولي من الرحلة', 'info');
    } else {
      showToast(res.error || 'تعذر إلغاء الكولي', 'error');
    }
  };

  const handleDepartTrip = async () => {
    if (trip.loaded_parcel_ids.length === 0) {
      showToast('لا يمكن إطلاق الرحلة دون شحن كولي واحد على الأقل', 'error');
      return;
    }

    setIsDeparting(true);
    try {
      const res = await departTrip(trip.id);
      if (res.success && res.trip) {
        showToast(`انطلقت الرحلة [${res.trip.trip_code}] في طريقها نحو ${trip.destination_station_name}`, 'success');
        if (onTripDeparted) onTripDeparted(res.trip);
        onClose();
      } else {
        showToast(res.error || 'تعذر تأكيد انطلاق الرحلة', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'حدث خطأ أثناء الانطلاق', 'error');
    } finally {
      setIsDeparting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/90 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div 
        className="w-full max-w-[390px] bg-[#1a0f00]/95 border border-[#D4AF37]/65 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
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
                    شحن الرحلة [{trip.trip_code}]
                  </h3>
                  <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-[#D4AF37]/20 text-[#F5D799] border border-[#D4AF37]/40">
                    {trip.status === 'loading' ? 'قيد التحميل' : 'مانيفست الشحن'}
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

          {/* Driver & Plate Details Bar */}
          <div className="mt-2.5 grid grid-cols-3 gap-1.5 bg-[#0d0700] p-2 rounded-xl border border-[#D4AF37]/25 text-xs">
            <div>
              <span className="text-[9px] text-[#C2A878] block">السائق:</span>
              <span className="font-bold text-white text-[11px] truncate block">{trip.driver_name}</span>
            </div>
            <div>
              <span className="text-[9px] text-[#C2A878] block">العربة:</span>
              <span className="font-bold font-mono text-[#F5D799] text-[11px] truncate block">{trip.vehicle_plate}</span>
            </div>
            <div>
              <span className="text-[9px] text-[#C2A878] block">المشحونة:</span>
              <span className="font-bold text-[#D4AF37] font-mono text-xs">
                {trip.loaded_parcel_ids.length} كولي
              </span>
            </div>
          </div>

          {/* Trip Financials & Driver Road Expenses Summary Bar */}
          <div className="mt-2 bg-[#0d0700] p-2.5 rounded-xl border border-[#D4AF37]/35 space-y-2 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-black text-[#F5D799] flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-[#2ECC71]" />
                <span>حساب مصاريف الطريق وصافي الرحلة:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowExpensesEditor(!showExpensesEditor)}
                className="btn-cancel px-2 py-0.5 rounded-lg bg-[#1a0f00] border border-[#D4AF37]/40 text-[#F5D799] text-[10px] font-bold flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>{showExpensesEditor ? 'إغلاق' : 'تعديل المصاريف'}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
              <div className="bg-[#140b00] p-1.5 rounded-lg border border-white/10">
                <span className="text-[#C2A878] block font-sans">مداخيل الكوليات</span>
                <span className="font-black text-emerald-400" dir="ltr">
                  {hideAmounts ? '••••' : roundedRevenue} {expCurr}
                </span>
              </div>
              <div className="bg-[#140b00] p-1.5 rounded-lg border border-white/10">
                <span className="text-[#C2A878] block font-sans">مصاريف الطريق</span>
                <span className="font-black text-rose-400" dir="ltr">
                  {hideAmounts ? '••••' : totalRoadExpenses} {expCurr}
                </span>
              </div>
              <div className="bg-[#140b00] p-1.5 rounded-lg border border-[#D4AF37]/35">
                <span className="text-[#C2A878] block font-sans">صافي الرحلة</span>
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
                    <label className="block text-[9px] text-[#C2A878] mb-0.5">المازوط / الوقود:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={fuelExpense}
                      onChange={e => setFuelExpense(e.target.value)}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#C2A878] mb-0.5">الطريق السيار / المعبر:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tollExpense}
                      onChange={e => setTollExpense(e.target.value)}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#C2A878] mb-0.5">عمولة السائق:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={driverCommission}
                      onChange={e => setDriverCommission(e.target.value)}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] text-[#C2A878] mb-0.5">مصاريف أخرى:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={otherExpense}
                      onChange={e => setOtherExpense(e.target.value)}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-lg px-2 py-1 text-white font-mono text-xs"
                      dir="ltr"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={expenseCurrency}
                    onChange={e => setExpenseCurrency(e.target.value as 'MAD' | 'MRU')}
                    className="bg-[#120a00] border border-[#D4AF37]/40 rounded-lg px-2 py-1.5 text-white font-mono text-xs"
                  >
                    <option value="MAD">MAD</option>
                    <option value="MRU">MRU</option>
                  </select>
                  <button
                    type="submit"
                    className="flex-1 py-1.5 rounded-lg font-black text-xs"
                  >
                    حفظ مصاريف الطريق
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Action Controls & Fast Scanner */}
        <div className="p-3 bg-[#0d0700] border-b border-[#D4AF37]/25 space-y-2.5 shrink-0">
          {warningMessage && (
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] flex items-center gap-1.5 animate-fadeIn">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>{warningMessage}</span>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setShowScanner(true)}
                className="btn-gold py-2.5 px-2.5 rounded-xl font-black text-[11px] flex items-center justify-center gap-1 shadow-md active:scale-95 transition"
              >
                <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>مسح جماعي (Rafale)</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  printOfficialTripManifestPDF(
                    trip,
                    loadedParcelsList,
                    currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'إكسبريس الصحراء',
                    currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || '',
                    currentWorkspace?.custom_brand_logo_url || '',
                    currentWorkspace?.custom_brand_subtitle || ''
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
                placeholder="اكتب رقم الكولي (مثال: 101) ثم اضغط شحن..."
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                className="flex-1 bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-3 py-2 text-xs text-white font-mono placeholder-[#8C6D3F] focus:outline-none"
              />
              <button
                type="submit"
                className="px-3.5 py-2 rounded-xl bg-[#1a0f00] hover:bg-[#231400] text-[#F5D799] font-bold text-xs transition active:scale-95 border border-[#D4AF37]/35"
              >
                شحن
              </button>
            </form>
          </div>

          {availableParcelsToLoad.length > 0 && trip.status === 'loading' && (
            <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[10px] text-[#C2A878]">
              <span>كوليات جاهزة للشحن:</span>
              {availableParcelsToLoad.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleScanOrInput(String(p.parcel_number))}
                  className="btn-cancel px-2 py-0.5 rounded-lg bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#F5D799] border border-[#D4AF37]/35 font-mono font-bold transition"
                >
                  #{p.parcel_number} ({p.tracking_code}){p.is_returning || p.status === 'return_in_transit' ? ' [إرجاع ↩]' : ''}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Loaded Parcels List (Loading Order) */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between pb-1">
            <span className="font-bold text-[#C2A878] text-[11px] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>ترتيب الكوليات المشحونة:</span>
            </span>
            <span className="text-[11px] font-mono text-[#F5D799] font-bold">
              {loadedParcelsList.length} كولي
            </span>
          </div>

          {loadedParcelsList.length === 0 ? (
            <div className="text-center py-10 bg-[#120a00]/80 rounded-2xl border border-dashed border-[#D4AF37]/30 p-5 space-y-2">
              <Package className="w-9 h-9 text-[#D4AF37]/60 mx-auto" />
              <p className="text-xs font-bold text-[#F5D799]">الرحلة لا زالت فارغة</p>
              <p className="text-[10px] text-[#C2A878]">
                اضغط على &quot;مسح باركود كولي بالكاميرا&quot; أو استخدم قارئ الباركود لشحن الكوليات واحداً تلو الآخر
              </p>
            </div>
          ) : (
            loadedParcelsList.map((parcel, index) => (
              <div
                key={parcel.id}
                className="bg-[#120a00]/90 p-2.5 rounded-2xl border border-[#D4AF37]/35 flex items-center justify-between gap-2 transition shadow-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-lg bg-[#D4AF37]/20 text-[#F5D799] font-mono font-black text-[11px] flex items-center justify-center shrink-0 border border-[#D4AF37]/35">
                    #{index + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-white text-[11px]">
                        {parcel.tracking_code}
                      </span>
                      {(parcel.is_returning || parcel.status === 'return_in_transit') && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          إرجاع ↩
                        </span>
                      )}
                      {parcel.condition === 'abnormal' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚠ غير عادي
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#C2A878] truncate mt-0.5">
                      <span>{parcel.is_returning ? `إرجاع للمرسل: ` : `إلى: `}<strong className="text-[#F5D799]">{parcel.is_returning ? parcel.sender_name : parcel.receiver_name}</strong></span>
                      <span className="mx-1">•</span>
                      <span>{parcel.description}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
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

                  {trip.status === 'loading' && (
                    <button
                      type="button"
                      onClick={() => handleUnloadParcel(parcel.id)}
                      className="btn-delete p-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 transition border border-rose-500/30"
                      title="إلغاء شحن هذا الكولي"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Depart Action Button */}
        <div className="p-3.5 border-t border-[#D4AF37]/30 bg-[#120a00] shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel px-3.5 py-2.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/35 text-[#C2A878] font-bold text-xs hover:text-white transition"
          >
            إغلاق
          </button>

          {trip.status === 'loading' && (
            <button
              type="button"
              onClick={handleDepartTrip}
              disabled={isDeparting || loadedParcelsList.length === 0}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F5D799] via-[#D4AF37] to-[#B68A2E] hover:brightness-110 text-[#140b00] font-black text-xs shadow-lg active:scale-95 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isDeparting ? 'جاري الانطلاق...' : 'انطلاق الرحلة وتوثيق المغادرة ➔'}</span>
            </button>
          )}
        </div>

      </div>

      {/* Barcode / QR Camera Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScanOrInput}
        defaultBurstMode={true}
        title="مسح جماعي سريع لشحن الرحلة (Rafale)"
        subtitle={`الرحلة: ${trip.trip_code} (الشيفور: ${trip.driver_name})`}
        placeholder="أدخل كود الكولي لشحنه على العربة..."
      />
    </div>
  );
};
