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
    loadAllMatchingParcelsToTrip,
    unloadParcelFromTrip, 
    departTrip, 
    updateTripExpenses,
    showToast 
  } = useApp();

  const [showScanner, setShowScanner] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isDeparting, setIsDeparting] = useState(false);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
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

  const tripDestId = trip.partner_destination_station_id || trip.destination_station_id;

  // Available registered or returning parcels at this trip's origin station ready to be loaded (including partnership parcels!)
  const availableParcelsToLoad = parcels.filter(p => {
    if (p.status !== 'registered' && p.status !== 'return_in_transit') return false;
    if (trip.loaded_parcel_ids.includes(p.id)) return false;
    const isAtTripOrigin =
      p.is_returning || p.status === 'return_in_transit'
        ? p.destination_station_id === trip.origin_station_id || p.partner_destination_station_id === trip.origin_station_id
        : p.origin_station_id === trip.origin_station_id;
    return isAtTripOrigin;
  });

  // Parcels specifically heading to this trip's destination station
  const matchingRouteParcels = availableParcelsToLoad.filter(p => {
    const targetId =
      p.is_returning || p.status === 'return_in_transit'
        ? p.origin_station_id
        : p.partner_destination_station_id || p.destination_station_id;
    return targetId === tripDestId || targetId === trip.destination_station_id;
  });

  const handleBatchLoadMatching = async () => {
    const targetIds = (matchingRouteParcels.length > 0 ? matchingRouteParcels : availableParcelsToLoad).map(p => p.id);
    if (targetIds.length === 0) return;
    setIsBatchLoading(true);
    try {
      const res = await loadAllMatchingParcelsToTrip(trip.id, targetIds);
      if (res.success && res.loadedCount > 0) {
        playSuccessBeep();
      } else {
        playErrorBeep();
        showToast(res.error || 'لا توجد كوليات جاهزة للشحن', 'error');
      }
    } finally {
      setIsBatchLoading(false);
    }
  };

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
                    🚚 شحن رحلة [{trip.trip_code}]
                  </h3>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-lg font-black bg-[#D4AF37]/20 text-[#F5D799] border border-[#D4AF37]/40">
                    {trip.status === 'loading' ? '📦 شحن' : '📋 مانيفست'}
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

          {/* Driver & Plate Details Bar */}
          <div className="mt-2 grid grid-cols-3 gap-1.5 bg-black/50 p-2 rounded-xl border border-[#D4AF37]/30 text-xs">
            <div className="min-w-0">
              <span className="text-[9px] text-white/70 font-bold block">👤 السائق:</span>
              <span className="font-black text-white text-[11px] truncate block">{trip.driver_name}</span>
            </div>
            <div className="min-w-0">
              <span className="text-[9px] text-white/70 font-bold block">🚛 اللوحة:</span>
              <span className="font-black font-mono text-[#F5D799] text-[11px] truncate block">{trip.vehicle_plate}</span>
            </div>
            <div className="min-w-0">
              <span className="text-[9px] text-white/70 font-bold block">📦 المشحونة:</span>
              <span className="font-black text-[#D4AF37] font-mono text-xs">
                {trip.loaded_parcel_ids.length} كولي
              </span>
            </div>
          </div>

          {/* Trip Financials & Driver Road Expenses Summary Bar */}
          <div className="mt-2 bg-black/50 p-2 rounded-xl border border-[#D4AF37]/35 space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-black text-white flex items-center gap-1 text-[11px]">
                <span>💰 مداخيل ومصاريف الطريق:</span>
              </span>
              <button
                type="button"
                onClick={() => setShowExpensesEditor(!showExpensesEditor)}
                className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3" />
                <span>{showExpensesEditor ? 'إغلاق' : '⚙️ المصاريف'}</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5 text-center font-mono text-[10px]">
              <div className="bg-black/45 p-1.5 rounded-lg border border-white/10">
                <span className="text-white/75 block font-sans font-bold">📥 المداخيل</span>
                <span className="font-black text-emerald-400" dir="ltr">
                  {hideAmounts ? '••••' : roundedRevenue} {expCurr}
                </span>
              </div>
              <div className="bg-black/45 p-1.5 rounded-lg border border-white/10">
                <span className="text-white/75 block font-sans font-bold">📤 المصاريف</span>
                <span className="font-black text-rose-400" dir="ltr">
                  {hideAmounts ? '••••' : totalRoadExpenses} {expCurr}
                </span>
              </div>
              <div className="bg-black/45 p-1.5 rounded-lg border border-[#D4AF37]/35">
                <span className="text-white/75 block font-sans font-bold">💎 الصافي</span>
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
                  <div className="min-w-0">
                    <label className="block text-[9px] font-bold text-white/80 mb-0.5">⛽ المازوط / الوقود:</label>
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
                  <div className="min-w-0">
                    <label className="block text-[9px] font-bold text-white/80 mb-0.5">🛣️ الطريق / المعبر:</label>
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
                  <div className="min-w-0">
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
                  <div className="min-w-0">
                    <label className="block text-[9px] font-bold text-white/80 mb-0.5">📝 مصاريف أخرى:</label>
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
                  <button
                    type="submit"
                    className="btn-gold flex-1 py-1.5 rounded-lg font-black text-xs"
                  >
                    ✅ حفظ مصاريف الطريق
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Action Controls & Fast Scanner */}
        <div className="p-2.5 border-b border-[#D4AF37]/25 space-y-2 shrink-0">
          {warningMessage && (
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold flex items-center gap-1.5 animate-fadeIn">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
              <span>{warningMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setShowScanner(true)}
              className="btn-gold py-2 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 shadow-md active:scale-95 transition"
            >
              <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>مسح جماعي</span>
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
              className="btn-cancel py-2 px-2 rounded-xl font-black text-xs flex items-center justify-center gap-1 border border-[#F5C84C]/50 text-[#F5C84C] transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>مانيفست PDF</span>
            </button>
          </div>

          <form onSubmit={handleManualFormSubmit} className="flex gap-1.5">
            <input
              type="text"
              placeholder="🔢 رقم الكولي (مثال: 101)..."
              value={manualCode}
              onChange={e => setManualCode(e.target.value)}
              className="flex-1 min-w-0 bg-black/55 border border-[#D4AF37]/40 focus:border-[#F5D799] rounded-xl px-2.5 py-2 text-xs text-white font-mono font-black focus:outline-none"
            />
            <button
              type="submit"
              className="btn-gold px-3 py-2 rounded-xl font-black text-xs transition active:scale-95 shrink-0"
            >
              شحن
            </button>
          </form>

          {availableParcelsToLoad.length > 0 && trip.status === 'loading' && (
            <div className="space-y-1.5 pt-1 border-t border-[#D4AF37]/20">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black text-white">
                  📦 جاهز للشحن ({matchingRouteParcels.length > 0 ? `${matchingRouteParcels.length} للوجهة` : `${availableParcelsToLoad.length} بالمحطة`}):
                </span>
                <button
                  type="button"
                  disabled={isBatchLoading}
                  onClick={handleBatchLoadMatching}
                  className="px-2 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[10px] transition active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isBatchLoading
                    ? 'جاري الشحن...'
                    : matchingRouteParcels.length > 0
                    ? `شحن الكل (${matchingRouteParcels.length})`
                    : `شحن الكل (${availableParcelsToLoad.length})`}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1 max-h-20 overflow-y-auto pr-0.5 text-[10px]">
                {(matchingRouteParcels.length > 0 ? matchingRouteParcels : availableParcelsToLoad)
                  .slice(0, 40)
                  .map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleScanOrInput(p.tracking_code)}
                      className={`px-2 py-0.5 rounded-lg border font-mono font-black transition cursor-pointer ${
                        p.is_collaborator_data || p.partner_destination_station_id
                          ? 'bg-purple-950/80 hover:bg-purple-900 text-purple-200 border-purple-400/50'
                          : 'bg-[#D4AF37]/15 hover:bg-[#D4AF37]/30 text-[#F5D799] border-[#D4AF37]/35'
                      }`}
                    >
                      #{p.parcel_number} ({p.receiver_name})
                      {p.is_collaborator_data || p.partner_destination_station_id ? ' 🤝' : ''}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Loaded Parcels List (Loading Order) */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 text-xs">
          <div className="flex items-center justify-between pb-1">
            <span className="font-black text-white text-[11px] flex items-center gap-1">
              <span>📦 الكوليات المشحونة ({loadedParcelsList.length}):</span>
            </span>
          </div>

          {loadedParcelsList.length === 0 ? (
            <div className="text-center py-6 bg-black/45 rounded-2xl border border-dashed border-[#D4AF37]/30 p-4 space-y-1.5">
              <Package className="w-7 h-7 text-[#D4AF37]/60 mx-auto" />
              <p className="text-xs font-black text-white">الرحلة فارغة حالياً</p>
              <p className="text-[10px] text-white/75 font-bold">
                امسح بالكاميرا أو اختر من الكوليات الجاهزة أعلاه لشحنها
              </p>
            </div>
          ) : (
            loadedParcelsList.map((parcel, index) => (
              <div
                key={parcel.id}
                className="bg-black/55 p-2 rounded-xl border border-[#D4AF37]/35 flex items-center justify-between gap-1.5 transition shadow-sm"
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <div className="w-6 h-6 rounded-lg bg-[#D4AF37]/20 text-[#F5D799] font-mono font-black text-[10px] flex items-center justify-center shrink-0 border border-[#D4AF37]/35">
                    #{index + 1}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 flex-wrap">
                      <span className="font-mono font-black text-white text-[11px]">
                        {parcel.tracking_code}
                      </span>
                      {(parcel.is_returning || parcel.status === 'return_in_transit') && (
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

                <div className="flex items-center gap-1 shrink-0">
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

                  {trip.status === 'loading' && (
                    <button
                      type="button"
                      onClick={() => handleUnloadParcel(parcel.id)}
                      className="btn-delete p-1.5 rounded-lg"
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
        <div className="p-2.5 border-t border-[#D4AF37]/30 shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel px-3 py-2.5 rounded-xl font-black text-xs"
          >
            إغلاق
          </button>

          {trip.status === 'loading' && (
            <button
              type="button"
              onClick={handleDepartTrip}
              disabled={isDeparting || loadedParcelsList.length === 0}
              className="btn-gold flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl font-black text-xs shadow-lg active:scale-95 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isDeparting ? 'جاري الانطلاق...' : 'انطلاق الرحلة الآن'}</span>
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
