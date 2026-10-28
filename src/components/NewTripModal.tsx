import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Trip, RememberedDriver, RememberedVehicle } from '../types/database';
import { tripService } from '../services/tripService';
import { 
  X, 
  Truck, 
  User, 
  MapPin, 
  Calendar, 
  CheckCircle2, 
  ArrowRightLeft, 
  Clock, 
  Sparkles,
  Phone
} from 'lucide-react';

interface NewTripModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTripCreated?: (trip: Trip) => void;
}

export const NewTripModal: React.FC<NewTripModalProps> = ({
  isOpen,
  onClose,
  onTripCreated
}) => {
  const { 
    stations, 
    selectedStationId, 
    createTrip, 
    rememberedDrivers, 
    rememberedPlates,
    removeRememberedDriver,
    removeRememberedPlate,
    userRole,
    userAssignedStationId,
    showToast 
  } = useApp();

  const defaultOriginId =
    userRole === 'worker' && userAssignedStationId
      ? userAssignedStationId
      : selectedStationId || stations[0]?.id || '';

  const [originStationId, setOriginStationId] = useState<string>(defaultOriginId);
  const [destinationStationId, setDestinationStationId] = useState<string>(
    stations.find(s => s.id !== defaultOriginId)?.id || stations[1]?.id || ''
  );

  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const originSt = stations.find(s => s.id === originStationId);
  const destSt = stations.find(s => s.id === destinationStationId);

  const handleSelectDriver = (driver: RememberedDriver) => {
    setDriverName(driver.name);
    if (driver.phone) setDriverPhone(driver.phone);
  };

  const handleSelectPlate = (vehicle: RememberedVehicle) => {
    setVehiclePlate(vehicle.plate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!driverName.trim()) {
      setErrorMessage('يرجى إدخال اسم السائق (الشيفور)');
      return;
    }

    if (!vehiclePlate.trim()) {
      setErrorMessage('يرجى إدخال رقم تسجيل العربة (ماتريكيل العربة)');
      return;
    }

    if (originStationId === destinationStationId) {
      setErrorMessage('لا يمكن أن تكون محطة الانطلاق والوصول هي نفس المحطة');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createTrip({
        driverName: driverName.trim(),
        driverPhone: driverPhone.trim() || undefined,
        vehiclePlate: vehiclePlate.trim(),
        originStationId,
        destinationStationId,
        notes: notes.trim() || undefined,
      });

      if (res.success && res.trip) {
        showToast(`تم إنشاء الرحلة [${res.trip.trip_code}] وحفظ الشيفور والماتريكيل بنجاح`, 'success');
        if (onTripCreated) onTripCreated(res.trip);
        onClose();
      } else {
        setErrorMessage(res.error || 'تعذر إنشاء الرحلة');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/90 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div 
        className="w-full max-w-[380px] luxury-card border border-[#D4AF37]/65 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-[#D4AF37]/30 bg-black/55 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center font-bold shadow-md">
              <Truck className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">إنشاء وتجهيز رحلة شحن جديدة</h3>
              <p className="text-[10px] text-[#D4AF37] font-medium">
                {originSt?.name || originSt?.city || 'الانطلاق'} ➔ {destSt?.name || destSt?.city || 'الوصول'}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-3.5 space-y-3 overflow-y-auto flex-1 text-xs">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold text-xs">
              {errorMessage}
            </div>
          )}

          {/* Stations Routing */}
          <div className="bg-[#120a00]/90 p-3 rounded-2xl border border-[#D4AF37]/35 space-y-2">
            <span className="font-bold text-[#F5D799] block text-xs flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>خط سير الرحلة والمحطات:</span>
            </span>

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-[#C2A878] mb-1 text-[10px]">محطة الانطلاق والشحن *</label>
                <select
                  value={originStationId}
                  disabled={userRole === 'worker'}
                  onChange={e => setOriginStationId(e.target.value)}
                  className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#F5D799] disabled:opacity-70"
                >
                  {stations.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#C2A878] mb-1 text-[10px]">محطة الوصول والاستقبال *</label>
                <select
                  value={destinationStationId}
                  onChange={e => setDestinationStationId(e.target.value)}
                  className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#F5D799]"
                >
                  {stations.map(st => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Driver Info & Quick Selection */}
          <div className="bg-[#120a00]/90 p-3 rounded-2xl border border-[#D4AF37]/35 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F5D799] block text-xs flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>بيانات السائق (الشيفور):</span>
              </span>
              <span className="text-[9px] text-[#C2A878]">يُحفظ تلقائياً عند الإضافة</span>
            </div>

            {/* Quick Remembered Drivers Chips */}
            {rememberedDrivers && rememberedDrivers.length > 0 && (
              <div className="space-y-1">
                <span className="text-[9px] text-[#D4AF37] block">الشيافر المسجلين عندك (اضغط للاختيار):</span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {rememberedDrivers.map((d, i) => (
                    <div
                      key={i}
                      className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectDriver(d)}
                        className="font-bold text-white hover:text-[#F5D799] transition"
                      >
                        {d.name}
                      </button>
                      {(userRole === 'owner' || userRole === 'platform_owner') && (
                        <button
                          type="button"
                          onClick={() => removeRememberedDriver(d.name)}
                          title="حذف هذا الشيفور من القائمة"
                          className="text-rose-400 hover:text-rose-300 font-black px-0.5"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="block text-[#C2A878] mb-1 text-[10px]">اسم الشيفور الكامل *</label>
                <input
                  type="text"
                  required
                  placeholder="أدخل اسم الشيفور (سيبقى محفوظاً عندك)"
                  value={driverName}
                  onChange={e => setDriverName(e.target.value)}
                  className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-bold text-xs focus:outline-none focus:border-[#F5D799]"
                />
              </div>

              <div>
                <label className="block text-[#C2A878] mb-1 text-[10px]">رقم هاتف الشيفور (واتساب) [اختياري]:</label>
                <input
                  type="tel"
                  placeholder="+222... أو +212..."
                  value={driverPhone}
                  onChange={e => setDriverPhone(e.target.value)}
                  className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#F5D799]"
                />
              </div>
            </div>
          </div>

          {/* Vehicle Registration Plate & Quick Selection */}
          <div className="bg-[#120a00]/90 p-3 rounded-2xl border border-[#D4AF37]/35 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F5D799] block text-xs flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>ماتريكيل العربة (لوحة الترقيم):</span>
              </span>
              <span className="text-[9px] text-[#C2A878]">يُحفظ تلقائياً عند الإضافة</span>
            </div>

            {/* Quick Remembered Plates Chips */}
            {rememberedPlates && rememberedPlates.length > 0 && (
              <div className="space-y-1">
                <span className="text-[9px] text-[#D4AF37] block">الماتريكيلات المسجلة عندك (اضغط للاختيار):</span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {rememberedPlates.map((p, i) => (
                    <div
                      key={i}
                      className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-mono flex items-center gap-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectPlate(p)}
                        className="font-bold text-white hover:text-[#F5D799] transition"
                      >
                        {p.plate}
                      </button>
                      {(userRole === 'owner' || userRole === 'platform_owner') && (
                        <button
                          type="button"
                          onClick={() => removeRememberedPlate(p.plate)}
                          title="حذف هذا الماتريكيل من القائمة"
                          className="text-rose-400 hover:text-rose-300 font-black px-0.5"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[#C2A878] mb-1 text-[10px]">رقم اللوحة / الماتريكيل *</label>
              <input
                type="text"
                required
                placeholder="أدخل ماتريكيل العربة (سيبقى محفوظاً عندك)"
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value)}
                className="w-full bg-[#0d0700] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#F5D799]"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[#C2A878] mb-1 text-[10px]">ملاحظات تشغيلية عن الرحلة (اختياري):</label>
            <input
              type="text"
              placeholder="مثال: شحن سريع قبل إغلاق معبر الكركرات مساءً..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#F5D799]"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel flex-1 py-2.5 rounded-xl font-bold text-xs transition"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-gold flex-[2] py-2.5 rounded-xl font-black text-xs transition shadow-lg active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الإنشاء...' : 'إنشاء الرحلة وبدء الشحن ➔'}</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
