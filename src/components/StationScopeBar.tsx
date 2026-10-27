import React, { useState } from 'react';
import { Store, Globe2, Plus, X, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const StationScopeBar: React.FC = () => {
  const {
    userRole,
    stations,
    selectedStationId,
    setSelectedStationId,
    addStation,
  } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newCountry, setNewCountry] = useState<'MA' | 'MR'>('MA');
  const [newDefaultCurrency, setNewDefaultCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [newPhone, setNewPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // يظهر فقط للمدير أو مشرف المنصة للتنقل السريع بين المحطات
  if (userRole !== 'owner' && userRole !== 'platform_owner' && userRole !== 'admin') {
    return null;
  }

  const isAllSelected = selectedStationId === 'all' || (!selectedStationId && stations.length > 1);
  const activeStation = !isAllSelected
    ? stations.find(s => s.id === selectedStationId) || stations[0] || null
    : null;

  const handleCreateStation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!newName.trim() || !newCity.trim()) {
      setFormError('يرجى إدخال اسم المحطة والمدينة');
      return;
    }
    setIsSaving(true);
    try {
      const res = await addStation({
        name: newName.trim(),
        city: newCity.trim(),
        country: newCountry,
        default_currency: newDefaultCurrency,
        phone: newPhone.trim(),
      });
      if (!res.success) {
        setFormError(res.error || 'تعذر إنشاء المحطة');
      } else {
        setShowAddModal(false);
        setNewName('');
        setNewCity('');
        setNewPhone('');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="luxury-card rounded-[22px] p-2.5 mb-3">
      {stations.length === 0 ? (
        <div className="flex items-center justify-between gap-2 px-1 py-0.5">
          <div className="flex items-center gap-2 text-xs text-white/90 font-bold">
            <Store className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <span>لا توجد محطات مسجلة — أضف محطتك الأولى للبدء</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormError('');
              setNewName('');
              setNewCity('');
              setNewCountry('MA');
              setNewDefaultCurrency('MAD');
              setNewPhone('');
              setShowAddModal(true);
            }}
            className="btn-gold px-3 py-1.5 rounded-xl font-black text-xs flex items-center gap-1 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ إضافة محطة</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {stations.map(station => {
            const isSelected = !isAllSelected && activeStation?.id === station.id;

            return (
              <button
                key={station.id}
                type="button"
                onClick={() => setSelectedStationId(station.id)}
                className={`flex-1 min-w-fit px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isSelected ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <span className="text-sm">{station.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
                <span>{station.name}</span>
              </button>
            );
          })}

          {/* زر الكل لعرض جميع المحطات معاً */}
          <button
            type="button"
            onClick={() => setSelectedStationId('all')}
            className={`min-w-fit px-3.5 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer ${
              isAllSelected ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span>الكل ({stations.length})</span>
          </button>
        </div>
      )}

      {/* نافذة إضافة محطة أولى عند عدم وجود محطات */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="luxury-card border border-[#F5C84C]/40 rounded-[26px] w-full max-w-[410px] p-5 shadow-2xl space-y-4 text-right"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/15">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">إضافة محطة جديدة</h3>
                  <p className="text-[11px] text-white/75">أدخل اسم المحطة والمدينة والعملة الأساسية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="btn-cancel p-1.5 rounded-xl cursor-pointer"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStation} className="space-y-3">
              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs font-bold text-rose-200">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-white/90 mb-1">اسم المحطة *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="مثال: محطة الداخلة"
                  className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-white/90 mb-1">المدينة *</label>
                  <input
                    type="text"
                    required
                    value={newCity}
                    onChange={e => setNewCity(e.target.value)}
                    placeholder="الداخلة / نواذيبو"
                    className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/90 mb-1">الدولة *</label>
                  <select
                    value={newCountry}
                    onChange={e => {
                      const c = e.target.value as 'MA' | 'MR';
                      setNewCountry(c);
                      setNewDefaultCurrency(c === 'MR' ? 'MRU' : 'MAD');
                    }}
                    className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2.5 text-xs text-white font-bold focus:outline-none"
                  >
                    <option value="MA">🇲🇦 المغرب (MA)</option>
                    <option value="MR">🇲🇷 موريتانيا (MR)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-white/90 mb-1">العملة الأساسية للصندوق</label>
                  <select
                    value={newDefaultCurrency}
                    onChange={e => setNewDefaultCurrency(e.target.value as 'MAD' | 'MRU')}
                    className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2.5 text-xs text-[#F5C84C] font-bold focus:outline-none"
                  >
                    <option value="MAD">درهم مغربي (MAD)</option>
                    <option value="MRU">أوقية موريتانية (MRU)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/90 mb-1">هاتف المحطة (اختياري)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="+212..."
                    className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2.5 text-xs text-white font-mono focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn-gold flex-1 py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'جاري الإضافة...' : 'إنشاء المحطة'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-cancel px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
