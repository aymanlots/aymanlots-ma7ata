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
    <div
      className="fixed inset-0 z-50 flex justify-center items-stretch p-0 m-0 bg-black/85 backdrop-blur-md animate-fadeIn overflow-hidden"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-full max-w-[430px] h-[100dvh] min-h-[100dvh] max-h-[100dvh] luxury-card border-x-2 border-y-0 border-[#D4AF37]/65 rounded-none shadow-2xl p-2.5 text-right relative overflow-hidden m-0 flex flex-col justify-between"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1.5 border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg leading-none">🚚</span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">إنشاء رحلة شحن جديدة</h3>
              <p className="text-[11px] text-[#D4AF37] font-black truncate">
                {originSt?.city || 'الانطلاق'} ➔ {destDisplayName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="btn-delete p-1.5 rounded-xl shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body — 100% Full Screen Vertical Stack (وحدة تحت وحدة بلا سكرول) */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col justify-between gap-1.5 py-1.5 min-h-0 overflow-hidden text-xs sm:text-sm"
        >
          {errorMessage && (
            <div className="p-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-black text-xs shrink-0 truncate">
              {errorMessage}
            </div>
          )}

          {/* 1. محطة الانطلاق */}
          <div className="bg-black/55 p-2 rounded-xl border border-white/15 flex flex-col justify-center shrink-0">
            <label className="block text-[#C2A878] mb-1 text-xs font-black truncate">📍 محطة الانطلاق *</label>
            <select
              value={originStationId}
              disabled={userRole === 'worker'}
              onChange={e => setOriginStationId(e.target.value)}
              className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2 py-2 text-white font-black text-xs focus:outline-none disabled:opacity-70 truncate"
            >
              {stations.map(st => (
                <option key={st.id} value={st.id}>
                  {st.name} ({st.city})
                </option>
              ))}
            </select>
          </div>

          {/* 2. محطة الوصول */}
          <div className="bg-black/55 p-2 rounded-xl border border-white/15 flex flex-col justify-center shrink-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#C2A878] text-xs font-black truncate">🎯 محطة الوصول *</label>
              <span className="font-mono font-black text-[11px] text-[#F5C84C]">
                📦 جاهز للشحن: {readyParcelsForRouteCount} كولي
              </span>
            </div>
            <select
              value={destinationStationId}
              onChange={e => setDestinationStationId(e.target.value)}
              className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2 py-2 text-white font-black text-xs focus:outline-none truncate"
            >
              {stations.filter(st => st.id !== originStationId).length > 0 && (
                <optgroup label="🏠 محطاتنا">
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
                          {st.name} ({st.city}){count > 0 ? ` [${count}📦]` : ''}
                        </option>
                      );
                    })}
                </optgroup>
              )}

              {partnerStations.length > 0 && (
                <optgroup label="🤝 الشركاء">
                  {partnerStations.map(ps => {
                    const count = parcels.filter(
                      p =>
                        p.status === 'registered' &&
                        p.origin_station_id === originStationId &&
                        (p.destination_station_id === ps.id || p.partner_destination_station_id === ps.id)
                    ).length;
                    return (
                      <option key={ps.id} value={ps.id}>
                        🤝 {ps.name} ({ps.city}){count > 0 ? ` [${count}📦]` : ''}
                      </option>
                    );
                  })}
                </optgroup>
              )}
            </select>
          </div>

          {/* 3. اسم الشيفور */}
          <div className="bg-black/55 p-2 rounded-xl border border-white/15 flex flex-col justify-center shrink-0">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#C2A878] text-xs font-black truncate">👤 اسم الشيفور *</label>
              {rememberedDrivers && rememberedDrivers.length > 0 && (
                <select
                  onChange={e => {
                    const d = rememberedDrivers.find(rd => rd.name === e.target.value);
                    if (d) handleSelectDriver(d);
                  }}
                  className="text-[10px] bg-black/60 text-[#F5C84C] border border-[#D4AF37]/30 rounded px-1.5 py-0.5 max-w-[110px] truncate"
                >
                  <option value="">شيفور سابق ▾</option>
                  {rememberedDrivers.map((d, i) => (
                    <option key={i} value={d.name}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>
            <input
              type="text"
              required
              placeholder="👤 اسم الشيفور *"
              value={driverName}
              onChange={e => setDriverName(e.target.value)}
              className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2 text-white font-black text-xs focus:outline-none"
            />
          </div>

          {/* 4. هاتف الشيفور */}
          <div className="bg-black/55 p-2 rounded-xl border border-white/15 flex flex-col justify-center shrink-0">
            <label className="block text-[#C2A878] mb-1 text-xs font-black truncate">📞 هاتف الشيفور</label>
            <input
              type="tel"
              dir="ltr"
              placeholder="06XXXXXXXX"
              value={driverPhone}
              onChange={e => setDriverPhone(e.target.value)}
              className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2 text-white font-mono font-black text-xs focus:outline-none"
            />
          </div>

          {/* 5. رقم اللوحة (ماتريكيل العربة) */}
          <div className="bg-black/55 p-2 rounded-xl border border-white/15 flex flex-col justify-center shrink-0">
            <label className="block text-[#C2A878] mb-1 text-xs font-black truncate">🚛 رقم اللوحة (Matricule) *</label>
            <input
              type="text"
              required
              placeholder="رقم تسجيل العربة *"
              value={vehiclePlate}
              onChange={e => setVehiclePlate(e.target.value)}
              className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2 text-white font-mono font-black text-xs focus:outline-none"
            />
          </div>

          {/* 6. ملاحظات الرحلة */}
          <div className="bg-black/55 p-2 rounded-xl border border-white/15 flex flex-col justify-center shrink-0">
            <label className="block text-[#C2A878] mb-1 text-xs font-black truncate">📝 ملاحظات الرحلة (اختياري)</label>
            <input
              type="text"
              placeholder="ملاحظات الرحلة..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2 text-white font-black text-xs focus:outline-none"
            />
          </div>

          {/* 7. زر التأكيد الكبير فالتحت */}
          <button
            type="submit"
            disabled={isSubmitting}
            data-btn-role="add"
            data-btn-role-fixed="true"
            className="btn-add w-full py-3 px-4 rounded-xl font-black text-sm flex items-center justify-center gap-1.5 cursor-pointer shadow-md shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? '⏳ جاري الإنشاء...' : '✅ تأكيد وإنشاء الرحلة الآن 🚚'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
