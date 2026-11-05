import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Trip, RememberedDriver, RememberedVehicle } from '../types/database';
import { 
  X, 
  Truck, 
  User, 
  MapPin, 
  CheckCircle2, 
  Package
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
    parcels,
    selectedStationId, 
    currentWorkspace,
    managerPartnerships,
    registeredManagersNetwork,
    loadRegisteredManagersNetwork,
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
      : selectedStationId && selectedStationId !== 'all'
      ? selectedStationId
      : stations[0]?.id || '';

  // Refresh network when modal opens so partner stations are always up to date
  useEffect(() => {
    if (isOpen && loadRegisteredManagersNetwork) {
      loadRegisteredManagersNetwork();
    }
  }, [isOpen]);

  // Active partner stations from Partnership Room (غرفة الشراكة)
  const partnerStations = useMemo(() => {
    const myWsId = currentWorkspace?.id || '';
    if (!myWsId) return [];
    const list: Array<{
      id: string;
      name: string;
      city: string;
      partnerWorkspaceId: string;
      partnerWorkspaceName: string;
    }> = [];
    const seenIds = new Set<string>();

    for (const p of managerPartnerships) {
      if (p.status !== 'active') continue;
      const isA = p.workspace_a_id === myWsId;
      const partnerWsId = isA ? p.workspace_b_id : p.workspace_a_id;
      const partnerWsName = isA ? p.workspace_b_name : p.workspace_a_name;
      const liveNet = registeredManagersNetwork.find(m => m.workspaceId === partnerWsId);
      const mergedStations = [
        ...(liveNet?.stations || []),
        ...((isA ? p.workspace_b_stations : p.workspace_a_stations) || []),
      ];

      for (const st of mergedStations) {
        if (!st?.id || seenIds.has(st.id)) continue;
        if (stations.some(own => own.id === st.id)) continue;
        seenIds.add(st.id);
        list.push({
          id: st.id,
          name: st.name,
          city: st.city || st.name,
          partnerWorkspaceId: partnerWsId,
          partnerWorkspaceName: liveNet?.workspaceName || partnerWsName || 'شريك معتمد',
        });
      }
    }

    return list;
  }, [currentWorkspace?.id, managerPartnerships, registeredManagersNetwork, stations]);

  const [originStationId, setOriginStationId] = useState<string>(defaultOriginId);
  const [destinationStationId, setDestinationStationId] = useState<string>('');

  // Auto-select valid origin & destination stations when modal opens or stations/partners change
  useEffect(() => {
    if (!isOpen) return;
    const validOrigin =
      userRole === 'worker' && userAssignedStationId
        ? userAssignedStationId
        : stations.some(s => s.id === originStationId)
        ? originStationId
        : defaultOriginId;

    if (validOrigin !== originStationId) {
      setOriginStationId(validOrigin);
    }

    const allDestinations = [
      ...stations.filter(s => s.id !== validOrigin).map(s => s.id),
      ...partnerStations.map(ps => ps.id),
    ];

    if (!destinationStationId || destinationStationId === validOrigin || !allDestinations.includes(destinationStationId)) {
      // Prefer a destination that already has registered parcels waiting at validOrigin
      const destWithWaitingParcels = allDestinations.find(destId =>
        parcels.some(
          p =>
            p.status === 'registered' &&
            p.origin_station_id === validOrigin &&
            (p.destination_station_id === destId || p.partner_destination_station_id === destId)
        )
      );
      setDestinationStationId(destWithWaitingParcels || allDestinations[0] || '');
    }
  }, [isOpen, originStationId, defaultOriginId, stations, partnerStations, parcels, userRole, userAssignedStationId]);

  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const originSt = stations.find(s => s.id === originStationId);
  const destOwnSt = stations.find(s => s.id === destinationStationId);
  const destPartnerSt = partnerStations.find(ps => ps.id === destinationStationId);
  const destDisplayName = destOwnSt
    ? `${destOwnSt.name} (${destOwnSt.city})`
    : destPartnerSt
    ? `🤝 ${destPartnerSt.name} (${destPartnerSt.city}) — ${destPartnerSt.partnerWorkspaceName}`
    : 'الوصول';

  // Count parcels at origin ready to be loaded for this destination
  const readyParcelsForRouteCount = parcels.filter(
    p =>
      (p.status === 'registered' || p.status === 'return_in_transit') &&
      p.origin_station_id === originStationId &&
      (p.destination_station_id === destinationStationId ||
        p.partner_destination_station_id === destinationStationId)
  ).length;

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

    if (!destinationStationId) {
      setErrorMessage('يرجى اختيار محطة الوصول (من محطاتك أو من محطات الشركاء في غرفة الشراكة)');
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
        showToast(`تم إنشاء الرحلة [${res.trip.trip_code}] بنجاح`, 'success');
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
        className="w-full max-w-[390px] luxury-card border border-[#D4AF37]/65 rounded-[24px] shadow-[0_20px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
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
              <p className="text-[10px] text-[#D4AF37] font-medium truncate max-w-[250px]">
                {originSt?.name || originSt?.city || 'الانطلاق'} ➔ {destDisplayName}
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
          <div className="bg-[#120a00]/90 p-3 rounded-2xl border border-[#D4AF37]/35 space-y-2.5">
            <span className="font-bold text-[#F5D799] block text-xs flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>خط سير الرحلة (محطاتنا أو محطات غرفة الشراكة):</span>
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
                      🏠 {st.name} ({st.city})
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
                  {stations.filter(st => st.id !== originStationId).length > 0 && (
                    <optgroup label="🏠 محطاتنا الداخلية">
                      {stations
                        .filter(st => st.id !== originStationId)
                        .map(st => {
                          const count = parcels.filter(
                            p =>
                              p.status === 'registered' &&
                              p.origin_station_id === originStationId &&
                              p.destination_station_id === st.id
                          ).length;
                          return (
                            <option key={st.id} value={st.id}>
                              🏠 {st.name} ({st.city}){count > 0 ? ` — [${count} كولي جاهز]` : ''}
                            </option>
                          );
                        })}
                    </optgroup>
                  )}

                  {partnerStations.length > 0 && (
                    <optgroup label="🤝 محطات الشركاء المعتمدة (غرفة الشراكة)">
                      {partnerStations.map(ps => {
                        const count = parcels.filter(
                          p =>
                            p.status === 'registered' &&
                            p.origin_station_id === originStationId &&
                            (p.destination_station_id === ps.id || p.partner_destination_station_id === ps.id)
                        ).length;
                        return (
                          <option key={ps.id} value={ps.id}>
                            🤝 {ps.name} ({ps.city}) — شريك: {ps.partnerWorkspaceName}
                            {count > 0 ? ` [${count} كولي جاهز]` : ''}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            {destPartnerSt && (
              <div className="px-2.5 py-1.5 rounded-xl bg-purple-950/75 border border-purple-400/50 text-purple-200 text-[10px] font-black flex items-center justify-between">
                <span>🤝 رحلة شراكة نحو محطة الشريك: {destPartnerSt.partnerWorkspaceName}</span>
                <span>مزامنة تلقائية ✓</span>
              </div>
            )}

            <div className="px-2.5 py-1.5 rounded-xl bg-black/60 border border-white/10 text-[10px] font-bold flex items-center justify-between">
              <span className="text-[#C2A878] flex items-center gap-1">
                <Package className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>كوليات مسجلة جاهزة للشحن في هذا الخط:</span>
              </span>
              <span className="font-mono font-black text-[#F5C84C]">
                {readyParcelsForRouteCount} كولي
              </span>
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
