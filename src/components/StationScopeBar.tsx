import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Store, Globe, Pencil, Trash2, Plus, X } from 'lucide-react';
import { Station } from '../types/database';

interface StationScopeBarProps {
  compact?: boolean;
  onOpenNewStation?: () => void;
}

export const StationScopeBar: React.FC<StationScopeBarProps> = ({
  onOpenNewStation
}) => {
  const {
    stations,
    selectedStationId,
    setSelectedStationId,
    stationBalances,
    currencies,
    userRole,
    hideAmounts,
    updateStation,
    deleteStation,
    addStation,
  } = useApp();

  const isManager = userRole === 'owner' || userRole === 'platform_owner' || userRole === 'admin';

  // Edit Station Modal State
  const [editingStation, setEditingStation] = useState<Station | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editCountry, setEditCountry] = useState<'MA' | 'MR'>('MA');
  const [editCurrency, setEditCurrency] = useState('MAD');
  const [editPhone, setEditPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Quick Add Station Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newCountry, setNewCountry] = useState<'MA' | 'MR'>('MA');
  const [newCurrency, setNewCurrency] = useState('MAD');
  const [newPhone, setNewPhone] = useState('');

  const openEditStation = (st: Station) => {
    setEditingStation(st);
    setEditName(st.name || st.city || '');
    setEditCity(st.city || st.name || '');
    setEditCountry(st.country || 'MA');
    setEditCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    setEditPhone(st.phone || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStation || !editName.trim()) return;
    setIsSaving(true);
    try {
      const res = await updateStation(editingStation.id, {
        name: editName.trim(),
        city: editCity.trim() || editName.trim(),
        country: editCountry,
        currency: editCurrency,
        phone: editPhone.trim(),
      });
      if (res.success) {
        setEditingStation(null);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteStation = async () => {
    if (!editingStation) return;
    setIsSaving(true);
    try {
      await deleteStation(editingStation.id);
      setEditingStation(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickAddStation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsSaving(true);
    try {
      const res = await addStation(
        newName.trim(),
        newCity.trim() || newName.trim(),
        newCountry,
        newPhone.trim() || undefined,
        undefined,
        newCurrency
      );
      if (res.success) {
        setShowAddModal(false);
        setNewName('');
        setNewCity('');
        setNewPhone('');
      }
    } finally {
      setIsSaving(false);
    }
  };

  // If there are no stations yet, do not render
  if (stations.length === 0) return null;

  // If worker is restricted to one station, show an informative locked badge
  if (userRole === 'worker' && stations.length <= 1) {
    const current = stations[0];
    const curr = current.currency || (current.country === 'MR' ? 'MRU' : 'MAD');
    const bal = Math.round(((stationBalances[current.id] || {})[curr] || 0) * 100) / 100;
    return (
      <div className="mb-2.5 p-2 rounded-2xl bg-black/60 border border-[#F5C84C]/40 flex items-center justify-between text-xs" dir="rtl">
        <div className="flex items-center gap-2">
          <span className="text-base">{current.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
          <div>
            <div className="font-black text-white">{current.name || current.city}</div>
            <div className="text-[10px] text-white/70">محطتك المعتمدة للعمل</div>
          </div>
        </div>
        <div className="text-left font-mono font-bold text-[#F5C84C] text-xs">
          {hideAmounts ? '••••' : `${bal.toLocaleString()} ${curr}`}
        </div>
      </div>
    );
  }

  const activeStation = stations.find((s) => s.id === selectedStationId);
  const isAllSelected = selectedStationId === null || selectedStationId === 'all';

  return (
    <>
      <div
        className="mb-2.5 rounded-2xl p-2.5 bg-[#120b02]/90 border border-[#D4AF37]/50 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md animate-fadeIn"
        dir="rtl"
      >
        {/* Top Status Line: Clearly informs the user where they are + Direct Edit Station Name Button */}
        <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10 text-xs">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div className="w-6 h-6 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/60 flex items-center justify-center shrink-0 text-[#F5C84C]">
              {isAllSelected ? <Globe className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[#C8B08A] font-bold">المعطيات والصناديق المعروضة:</div>
              <div className="text-xs font-black text-white truncate flex items-center gap-1.5">
                {isAllSelected ? (
                  <span className="text-[#F5C84C]">🌐 نظرة شاملة (كافة المحطات معاً)</span>
                ) : (
                  <>
                    <span className="text-white truncate">
                      📍 {activeStation?.name || activeStation?.city}{' '}
                      <span className="text-[10px] text-white/70 font-mono">
                        ({activeStation?.country === 'MA' ? '🇲🇦 المغرب' : '🇲🇷 موريتانيا'})
                      </span>
                    </span>
                    {isManager && activeStation && (
                      <button
                        type="button"
                        onClick={() => openEditStation(activeStation)}
                        className="px-1.5 py-0.5 rounded-lg bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] text-[10px] font-black inline-flex items-center gap-1 shrink-0 hover:bg-[#F5C84C]/30 cursor-pointer"
                        title="تعديل اسم المحطة أو عملتها أو حذفها"
                      >
                        <Pencil className="w-2.5 h-2.5" />
                        <span>تعديل الاسم</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Current Active Station Box Balance */}
          {!isAllSelected && activeStation && (
            <div className="text-left shrink-0 font-mono">
              <span className="text-[9px] text-[#C8B08A] block">صندوق المحطة:</span>
              <span className="text-xs font-black text-[#F5C84C]">
                {hideAmounts
                  ? '••••'
                  : `${(
                      (stationBalances[activeStation.id] || {})[
                        activeStation.currency || (activeStation.country === 'MR' ? 'MRU' : 'MAD')
                      ] || 0
                    ).toLocaleString()} ${
                      activeStation.currency || (activeStation.country === 'MR' ? 'MRU' : 'MAD')
                    }`}
              </span>
            </div>
          )}
        </div>

        {/* Station Selector Buttons (Horizontal Scrollable Chips) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {stations.map((st) => {
            const isSelected = selectedStationId === st.id;
            const curr = st.currency || (st.country === 'MR' ? 'MRU' : 'MAD');
            const bal = Math.round(((stationBalances[st.id] || {})[curr] || 0) * 100) / 100;
            return (
              <div key={st.id} className="inline-flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedStationId(st.id)}
                  className={`px-2.5 py-1.5 rounded-xl border text-xs font-black shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                    isSelected
                      ? 'bg-gradient-to-r from-[#F7D674] to-[#D4A238] text-[#111111] border-[#F5C84C] shadow-md ring-2 ring-[#F5C84C]/50'
                      : 'bg-black/60 text-white/85 border-white/20 hover:border-[#D4AF37]/60 hover:bg-black/80'
                  }`}
                >
                  <span>{st.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
                  <span className="truncate max-w-[110px]">{st.name || st.city}</span>
                  <span
                    className={`text-[9px] font-mono px-1 py-0.2 rounded-md ${
                      isSelected ? 'bg-black/25 text-[#111111]' : 'bg-[#D4AF37]/20 text-[#F5C84C]'
                    }`}
                    dir="ltr"
                  >
                    {hideAmounts ? '••' : `${bal.toLocaleString()}`}
                  </span>
                </button>
                {isManager && (
                  <button
                    type="button"
                    onClick={() => openEditStation(st)}
                    className="p-1.5 rounded-lg bg-black/70 border border-[#F5C84C]/40 text-[#F5C84C] hover:bg-[#F5C84C]/25 transition cursor-pointer shrink-0"
                    title={`تعديل اسم أو حذف محطة ${st.name}`}
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Dedicated "All Stations" Button */}
          <button
            type="button"
            onClick={() => setSelectedStationId(null)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-black shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
              isAllSelected
                ? 'bg-gradient-to-r from-[#F7D674] to-[#D4A238] text-[#111111] border-[#F5C84C] shadow-md ring-2 ring-[#F5C84C]/50'
                : 'bg-black/60 text-white/85 border-white/20 hover:border-[#D4AF37]/60 hover:bg-black/80'
            }`}
            title="عرض جميع المحطات والصناديق معاً (نظرة شاملة)"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>كافة المحطات معاً</span>
          </button>

          {/* Quick "+ محطة" Button for Manager */}
          {isManager && (
            <button
              type="button"
              onClick={() => {
                if (onOpenNewStation) onOpenNewStation();
                else setShowAddModal(true);
              }}
              className="px-2.5 py-1.5 rounded-xl border border-[#F5C84C]/50 bg-[#F5C84C]/15 text-[#F5C84C] text-xs font-black shrink-0 flex items-center gap-1 cursor-pointer hover:bg-[#F5C84C]/25 active:scale-95"
              title="إضافة محطة جديدة"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>محطة جديدة</span>
            </button>
          )}
        </div>
      </div>

      {/* Edit / Rename / Delete Station Modal */}
      {editingStation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fadeIn" dir="rtl">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right border border-[#F5C84C]/50">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-black text-white flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-[#F5C84C]" />
                <span>تعديل اسم وبيانات المحطة</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStation(null)}
                className="btn-cancel p-1.5 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="text-white/90 font-bold block mb-1">اسم المحطة الجديد *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="مثال: محطة الداخلة أو محطة نواكشوط"
                  className="w-full bg-black/60 border border-[#F5C84C]/50 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">المدينة *</label>
                <input
                  type="text"
                  required
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  placeholder="مثال: الداخلة"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-white/90 font-bold block mb-1">الدولة:</label>
                  <select
                    value={editCountry}
                    onChange={(e) => {
                      const c = e.target.value as 'MA' | 'MR';
                      setEditCountry(c);
                      setEditCurrency(c === 'MR' ? 'MRU' : 'MAD');
                    }}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-2 text-white font-bold"
                  >
                    <option value="MA">المغرب 🇲🇦</option>
                    <option value="MR">موريتانيا 🇲🇷</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/90 font-bold block mb-1">العملة:</label>
                  <select
                    value={editCurrency}
                    onChange={(e) => setEditCurrency(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-2 text-white font-bold"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.label_ar})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">رقم هاتف المحطة (اختياري):</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+212..."
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-mono text-right"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/15">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleDeleteStation}
                  className="btn-delete px-3 py-2 rounded-xl font-black flex items-center gap-1"
                  title="حذف هذه المحطة نهائياً"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف المحطة</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingStation(null)}
                    className="btn-cancel px-3 py-2 rounded-xl font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="btn-gold px-4 py-2 rounded-xl font-black"
                  >
                    {isSaving ? 'جاري الحفظ...' : 'حفظ التعديل'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Add New Station Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-fadeIn" dir="rtl">
          <div className="w-full max-w-[360px] luxury-card rounded-3xl p-5 shadow-2xl space-y-4 text-right border border-[#F5C84C]/50">
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <h3 className="text-sm font-black text-white">إضافة محطة جديدة</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="btn-cancel p-1.5 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddStation} className="space-y-3 text-xs">
              <div>
                <label className="text-white/90 font-bold block mb-1">اسم المحطة *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: محطة العيون أو محطة نواذيبو"
                  className="w-full bg-black/60 border border-[#F5C84C]/50 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">المدينة *</label>
                <input
                  type="text"
                  required
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="مثال: العيون"
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-white/90 font-bold block mb-1">الدولة:</label>
                  <select
                    value={newCountry}
                    onChange={(e) => {
                      const c = e.target.value as 'MA' | 'MR';
                      setNewCountry(c);
                      setNewCurrency(c === 'MR' ? 'MRU' : 'MAD');
                    }}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-2 text-white font-bold"
                  >
                    <option value="MA">المغرب 🇲🇦</option>
                    <option value="MR">موريتانيا 🇲🇷</option>
                  </select>
                </div>

                <div>
                  <label className="text-white/90 font-bold block mb-1">العملة:</label>
                  <select
                    value={newCurrency}
                    onChange={(e) => setNewCurrency(e.target.value)}
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-2 text-white font-bold"
                  >
                    {currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.label_ar})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-white/90 font-bold block mb-1">رقم هاتف المحطة (اختياري):</label>
                <input
                  type="tel"
                  dir="ltr"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+212..."
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white font-mono text-right"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/15">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-cancel px-4 py-2 rounded-xl font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-gold px-5 py-2 rounded-xl font-black"
                >
                  {isSaving ? 'جاري الإضافة...' : 'إضافة المحطة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
