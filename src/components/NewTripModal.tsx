import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Trip, RememberedDriver, RememberedVehicle } from '../types/database';
import { 
  X, 
  Truck, 
  User, 
  MapPin, 
  CheckCircle2, 
  Package,
  ChevronDown,
  Wallet
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

  // Initialize origin station whenever the modal opens
  useEffect(() => {
    if (isOpen && defaultOriginId) {
      setOriginStationId(defaultOriginId);
    }
  }, [isOpen, defaultOriginId]);

  // Auto-select valid destination station when modal opens or origin/stations change
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
  }, [isOpen, originStationId, destinationStationId, defaultOriginId, stations, partnerStations, parcels, userRole, userAssignedStationId]);

  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [notes, setNotes] = useState('');
  const [showExpenses, setShowExpenses] = useState(false);
  const [fuelExpense, setFuelExpense] = useState('');
  const [tollExpense, setTollExpense] = useState('');
  const [driverCommission, setDriverCommission] = useState('');
  const [otherExpense, setOtherExpense] = useState('');
  const [expenseCurrency, setExpenseCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [deductFromCashbox, setDeductFromCashbox] = useState(false);
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
        fuelExpense: Math.max(0, parseFloat(fuelExpense) || 0),
        tollExpense: Math.max(0, parseFloat(tollExpense) || 0),
        driverCommission: Math.max(0, parseFloat(driverCommission) || 0),
        otherExpense: Math.max(0, parseFloat(otherExpense) || 0),
        expenseCurrency,
        deductFromCashbox,
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
      className="fixed inset-0 z-50 flex justify-center items-center p-2.5 sm:p-4 m-0 bg-black/85 backdrop-blur-md animate-fadeIn overflow-hidden"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-[96%] max-w-[420px] max-h-[94dvh] luxury-card border-2 border-[#D4AF37]/65 rounded-2xl shadow-2xl p-3.5 text-right relative overflow-hidden m-0 flex flex-col justify-between gap-2.5"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg leading-none">🚚</span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white truncate">إنشاء رحلة شحن جديدة</h3>
              <p className="text-xs text-[#D4AF37] font-black truncate">
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

        {/* Form Body */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col justify-between gap-2.5 min-h-0 overflow-y-auto pr-0.5 text-xs sm:text-sm"
        >
          {errorMessage && (
            <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 font-black text-xs sm:text-sm shrink-0 truncate">
              {errorMessage}
            </div>
          )}

          {/* السطر الفوقاني: [ محطة الانطلاق ] حدا [ محطة الوصول ] */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            {/* محطة الانطلاق */}
            <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-between gap-1.5">
              <label className="block text-[#C2A878] text-xs sm:text-sm font-black truncate">📍 محطة الانطلاق *</label>
              <select
                value={originStationId}
                disabled={userRole === 'worker'}
                onChange={e => setOriginStationId(e.target.value)}
                className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none disabled:opacity-70 truncate"
              >
                {stations.map(st => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.city})
                  </option>
                ))}
              </select>
            </div>

            {/* محطة الوصول */}
            <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <label className="text-[#C2A878] text-xs sm:text-sm font-black truncate">🎯 محطة الوصول *</label>
                <span className="font-mono font-black text-[10px] text-[#F5C84C] shrink-0">
                  📦 {readyParcelsForRouteCount}
                </span>
              </div>
              <select
                value={destinationStationId}
                onChange={e => setDestinationStationId(e.target.value)}
                className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none truncate"
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
          </div>

          {/* 3. اسم الشيفور + هاتف الشيفور */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <label className="text-[#C2A878] text-xs sm:text-sm font-black truncate">👤 اسم الشيفور *</label>
                {rememberedDrivers && rememberedDrivers.length > 0 && (
                  <select
                    onChange={e => {
                      const d = rememberedDrivers.find(rd => rd.name === e.target.value);
                      if (d) handleSelectDriver(d);
                    }}
                    className="text-[10px] bg-black/60 text-[#F5C84C] border border-[#D4AF37]/30 rounded px-1 py-0.5 max-w-[85px] truncate"
                  >
                    <option value="">سابق ▾</option>
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
                className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none"
              />
            </div>

            <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-between gap-1.5">
              <label className="block text-[#C2A878] text-xs sm:text-sm font-black truncate">📞 هاتف الشيفور</label>
              <input
                type="tel"
                dir="ltr"
                placeholder="0600000000"
                value={driverPhone}
                onChange={e => setDriverPhone(e.target.value)}
                className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2.5 text-white font-mono font-black text-xs sm:text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* 4. رقم اللوحة + ملاحظات الرحلة */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-between gap-1.5">
              <label className="block text-[#C2A878] text-xs sm:text-sm font-black truncate">🚛 رقم اللوحة *</label>
              <input
                type="text"
                required
                placeholder="رقم تسجيل العربة *"
                value={vehiclePlate}
                onChange={e => setVehiclePlate(e.target.value)}
                className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2.5 text-white font-mono font-black text-xs sm:text-sm focus:outline-none"
              />
            </div>

            <div className="bg-black/55 p-2.5 rounded-xl border border-white/15 flex flex-col justify-between gap-1.5">
              <label className="block text-[#C2A878] text-xs sm:text-sm font-black truncate">📝 ملاحظات (اختياري)</label>
              <input
                type="text"
                placeholder="ملاحظات الرحلة..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-[#0d0700] border border-white/20 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* 4.5 مصاريف الطريق للسائق (اختياري - لحساب الربح الصافي للرحلة) */}
          <div className="bg-black/55 rounded-xl border border-[#D4AF37]/30 overflow-hidden shrink-0">
            <button
              type="button"
              onClick={() => setShowExpenses(prev => !prev)}
              className="w-full px-3 py-2 flex items-center justify-between text-xs font-black text-[#F5C84C] hover:bg-white/5 transition cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                <span>⛽ مصاريف الرحلة والربح الصافي (اختياري)</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${showExpenses ? 'rotate-180' : ''}`}
              />
            </button>

            {showExpenses && (
              <div className="p-2.5 pt-1 border-t border-white/10 space-y-2 animate-fadeIn">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-white/80 mb-0.5">⛽ المازوط:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      dir="ltr"
                      value={fuelExpense}
                      onChange={e => setFuelExpense(e.target.value)}
                      className="w-full bg-[#0d0700] border border-white/20 rounded-lg px-2 py-1.5 text-white font-mono font-black text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/80 mb-0.5">🛣️ الطريق / المعبر:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      dir="ltr"
                      value={tollExpense}
                      onChange={e => setTollExpense(e.target.value)}
                      className="w-full bg-[#0d0700] border border-white/20 rounded-lg px-2 py-1.5 text-white font-mono font-black text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/80 mb-0.5">👤 عمولة الشيفور:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      dir="ltr"
                      value={driverCommission}
                      onChange={e => setDriverCommission(e.target.value)}
                      className="w-full bg-[#0d0700] border border-white/20 rounded-lg px-2 py-1.5 text-white font-mono font-black text-xs focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-white/80 mb-0.5">📝 مصاريف أخرى:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      dir="ltr"
                      value={otherExpense}
                      onChange={e => setOtherExpense(e.target.value)}
                      className="w-full bg-[#0d0700] border border-white/20 rounded-lg px-2 py-1.5 text-white font-mono font-black text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <select
                    value={expenseCurrency}
                    onChange={e => setExpenseCurrency(e.target.value as 'MAD' | 'MRU')}
                    className="bg-[#0d0700] border border-[#D4AF37]/40 rounded-lg px-2 py-1.5 text-white font-mono font-black text-xs"
                  >
                    <option value="MAD">MAD</option>
                    <option value="MRU">MRU</option>
                  </select>

                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-white/90 cursor-pointer flex-1">
                    <input
                      type="checkbox"
                      checked={deductFromCashbox}
                      onChange={e => setDeductFromCashbox(e.target.checked)}
                      className="accent-[#D4AF37] w-4 h-4 rounded"
                    />
                    <span>خصم تلقائي من صندوق المحطة</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* 5. زر التأكيد الكبير فالتحت */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            data-btn-role="add"
            data-btn-role-fixed="true"
            className="btn-add w-full py-3.5 px-4 rounded-xl font-black text-sm sm:text-base flex items-center justify-center gap-2 cursor-pointer shadow-md shrink-0"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{isSubmitting ? 'جاري الإنشاء...' : 'تأكيد وإنشاء الرحلة الآن'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
