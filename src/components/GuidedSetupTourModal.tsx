import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { NavTab } from './BottomNav';
import {
  Store,
  Coins,
  Package,
  ImagePlus,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Sparkles,
  Printer,
  FileText,
  QrCode,
  MessageCircle,
  Truck,
  X,
  Compass,
} from 'lucide-react';

interface GuidedSetupTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: NavTab) => void;
}

export const GuidedSetupTourModal: React.FC<GuidedSetupTourModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
}) => {
  const {
    currentUser,
    currentWorkspace,
    stations,
    currencies,
    addStation,
    updateStation,
    deleteStation,
    addCurrency,
    addBalanceAdjustment,
    updateWorkspaceBranding,
    showToast,
  } = useApp();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Station Creation State
  const [stName, setStName] = useState('');
  const [stCity, setStCity] = useState('');
  const [stCountry, setStCountry] = useState<'MA' | 'MR'>('MA');
  const [stPhone, setStPhone] = useState('');
  const [stCurrency, setStCurrency] = useState<string>('MAD');
  const [isAddingStation, setIsAddingStation] = useState(false);

  // Step 2: Per-Station Currency & Opening Balance State
  const [stationCurrencyMap, setStationCurrencyMap] = useState<Record<string, string>>({});
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const [showNewCurrForm, setShowNewCurrForm] = useState(false);
  const [newCurrCode, setNewCurrCode] = useState('');
  const [newCurrLabel, setNewCurrLabel] = useState('');
  const [newCurrSymbol, setNewCurrSymbol] = useState('');
  const [isSavingStep2, setIsSavingStep2] = useState(false);

  // Step 4: Custom Logo & Branding for Thermal Stickers & PDF Bons
  const [brandName, setBrandName] = useState('');
  const [brandSubtitle, setBrandSubtitle] = useState('');
  const [brandPhone, setBrandPhone] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [isSavingFinish, setIsSavingFinish] = useState(false);

  // Initialize fields from workspace & stations when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setBrandName(
      currentWorkspace?.custom_brand_name ||
        currentWorkspace?.name ||
        `وكالة ${currentUser?.name || 'الشحن'}`
    );
    setBrandSubtitle(
      currentWorkspace?.custom_brand_subtitle || 'للشحن اللوجيستي والنقل الدولي السريع'
    );
    setBrandPhone(
      currentWorkspace?.custom_brand_phone ||
        currentWorkspace?.owner_phone ||
        currentUser?.phone ||
        ''
    );
    setBrandLogoUrl(currentWorkspace?.custom_brand_logo_url || '');
  }, [isOpen, currentWorkspace, currentUser]);

  // Sync station currency map whenever stations change
  useEffect(() => {
    const nextMap: Record<string, string> = {};
    stations.forEach((s) => {
      nextMap[s.id] = s.currency || (s.country === 'MR' ? 'MRU' : 'MAD');
    });
    setStationCurrencyMap((prev) => ({ ...nextMap, ...prev }));
  }, [stations]);

  // Automatically navigate the underlying app screen when step changes
  useEffect(() => {
    if (!isOpen) return;
    if (step === 1) onSelectTab('dashboard');
    else if (step === 2) onSelectTab('cash');
    else if (step === 3) onSelectTab('parcels');
    else if (step === 4) onSelectTab('settings');
  }, [step, isOpen, onSelectTab]);

  if (!isOpen) return null;

  const handleAddStationInStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = stName.trim() || stCity.trim();
    const cleanCity = stCity.trim() || stName.trim();
    if (!cleanName) {
      showToast('يرجى إدخال اسم المحطة أو المدينة أولاً', 'error');
      return;
    }

    setIsAddingStation(true);
    try {
      const defaultCurr = stCurrency || (stCountry === 'MR' ? 'MRU' : 'MAD');
      const res = await addStation(cleanName, cleanCity, stCountry, stPhone.trim(), undefined, defaultCurr);
      if (res.success && res.station) {
        setStationCurrencyMap((prev) => ({
          ...prev,
          [res.station!.id]: defaultCurr,
        }));
        setStName('');
        setStCity('');
        setStPhone('');
        // Toggle suggested country for second station convenience without forcing any name
        if (stations.length === 0) {
          const nextCountry = stCountry === 'MA' ? 'MR' : 'MA';
          setStCountry(nextCountry);
          setStCurrency(nextCountry === 'MR' ? 'MRU' : 'MAD');
        }
      }
    } finally {
      setIsAddingStation(false);
    }
  };

  const handleGoToStep2 = () => {
    if (stations.length === 0) {
      showToast('يرجى فتح وتسمية محطة واحدة على الأقل للمتابعة إلى إعداد العملات والصندوق', 'error');
      return;
    }
    setStep(2);
  };

  const handleSaveStep2AndNext = async () => {
    setIsSavingStep2(true);
    try {
      for (const st of stations) {
        const chosenCurr = stationCurrencyMap[st.id] || st.currency || (st.country === 'MR' ? 'MRU' : 'MAD');
        await updateStation(st.id, { currency: chosenCurr });

        const rawBal = parseFloat(openingBalances[st.id] || '0');
        if (!isNaN(rawBal) && rawBal > 0) {
          await addBalanceAdjustment(
            st.id,
            chosenCurr,
            rawBal,
            `رصيد افتتاحي لصندوق محطة ${st.name} (${chosenCurr})`
          );
        }
      }
      setOpeningBalances({});
      setStep(3);
    } finally {
      setIsSavingStep2(false);
    }
  };

  const handleAddCustomCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrCode.trim() || !newCurrLabel.trim()) {
      showToast('يرجى إدخال رمز واسم العملة', 'error');
      return;
    }
    await addCurrency(
      newCurrCode.trim().toUpperCase(),
      newCurrLabel.trim(),
      newCurrSymbol.trim() || newCurrCode.trim().toUpperCase()
    );
    setNewCurrCode('');
    setNewCurrLabel('');
    setNewCurrSymbol('');
    setShowNewCurrForm(false);
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 240;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxSize) {
          h = Math.round((h * maxSize) / w);
          w = maxSize;
        } else if (h > maxSize) {
          w = Math.round((w * maxSize) / h);
          h = maxSize;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const compressed = canvas.toDataURL('image/png', 0.9);
          setBrandLogoUrl(compressed);
          showToast('تم تجهيز صورة الشعار للملصقات وبونات الـ PDF بنجاح', 'success');
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCompleteTour = async () => {
    setIsSavingFinish(true);
    try {
      await updateWorkspaceBranding({
        custom_brand_name: brandName.trim() || currentWorkspace?.name || 'إكسبريس الصحراء',
        custom_brand_subtitle: brandSubtitle.trim(),
        custom_brand_phone: brandPhone.trim(),
        custom_brand_logo_url: brandLogoUrl.trim(),
      });

      if (currentUser?.id) {
        localStorage.setItem(`alittihadia_guided_tour_seen_${currentUser.id}`, 'true');
      }
      if (currentWorkspace?.id) {
        localStorage.setItem(`alittihadia_guided_tour_completed_${currentWorkspace.id}`, 'true');
        localStorage.removeItem(`alittihadia_guided_tour_pending_${currentWorkspace.id}`);
      }
      onSelectTab('dashboard');
      showToast('تم إعداد محطاتك وعملاتها وشعار الملصقات وبونات الـ PDF بنجاح!', 'success');
      onClose();
    } finally {
      setIsSavingFinish(false);
    }
  };

  const handleSkipForNow = () => {
    if (currentUser?.id) {
      localStorage.setItem(`alittihadia_guided_tour_seen_${currentUser.id}`, 'true');
      localStorage.setItem(`alittihadia_guided_tour_dismissed_${currentUser.id}`, 'true');
    }
    if (currentWorkspace?.id) {
      localStorage.setItem(`alittihadia_guided_tour_completed_${currentWorkspace.id}`, 'true');
      localStorage.removeItem(`alittihadia_guided_tour_pending_${currentWorkspace.id}`);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2.5 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      dir="rtl"
    >
      <div className="w-full max-w-[420px] luxury-card rounded-[26px] border-2 border-[#F5C84C]/70 p-4 shadow-[0_0_50px_rgba(0,0,0,0.95)] space-y-3.5 relative my-auto max-h-[92vh] overflow-y-auto">
        {/* Top Progress Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#F7D674] to-[#D4A238] text-[#111111] flex items-center justify-center shrink-0 shadow-md">
              <Compass className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-black text-white truncate">
                  إعداد حسابك وجولة التعرف على التطبيق
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] text-[10px] font-mono font-black shrink-0">
                  {step} / 4
                </span>
              </div>
              <p className="text-[10px] text-white/75 truncate">
                {step === 1 && 'الخطوة 1: افتح محطاتك وسمِّها بنفسك (الرئيسية)'}
                {step === 2 && 'الخطوة 2: صفحة الفلوس وتخصيص عملة كل محطة'}
                {step === 3 && 'الخطوة 3: التعرف على الكوليات والرحلات والـ QR'}
                {step === 4 && 'الخطوة 4 والأخيرة: صورة الملصقات وبونات الـ PDF'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkipForNow}
            className="btn-cancel p-1.5 rounded-xl text-[10px] font-bold shrink-0 text-white/80 hover:text-white"
            title="إغلاق الجولة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator Pills */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { num: 1 as const, label: '1. المحطات', icon: Store },
            { num: 2 as const, label: '2. الفلوس', icon: Coins },
            { num: 3 as const, label: '3. الكوليات', icon: Package },
            { num: 4 as const, label: '4. الشعار والـ PDF', icon: ImagePlus },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = step === item.num;
            const isDone = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  if (item.num > 1 && stations.length === 0) {
                    showToast('يرجى فتح محطة واحدة على الأقل أولاً', 'error');
                    return;
                  }
                  setStep(item.num);
                }}
                className={`py-1.5 px-1 rounded-xl border text-[10px] font-black flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-br from-[#F7D674] to-[#D4A238] text-[#111111] border-[#F5C84C] shadow-md'
                    : isDone
                    ? 'bg-[#006233]/35 text-[#68E399] border-[#2ECC71]/50'
                    : 'bg-black/55 text-white/70 border-white/15'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="truncate w-full text-center">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* =================================================================== */}
        {/* STEP 1: OPEN & NAME YOUR STATIONS                                   */}
        {/* =================================================================== */}
        {step === 1 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#8c6d2c]/30 to-black/75 border border-[#F5C84C]/45 space-y-1">
              <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>مرحباً بك يا {currentUser?.name || 'مدير المحطة'}!</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">
                حسابك الجديد فارغ ونظيف 100% بدون أي محطات مفروضة مسبقاً. ابدأ الآن بفتح محطاتك وتسميتها بالأسماء والمدن الخاصة بك (مثلاً: محطة رقم 1، محطة رقم 2...).
              </p>
            </div>

            {/* Form to Add a Station */}
            <form
              onSubmit={handleAddStationInStep1}
              className="p-3 rounded-2xl bg-black/60 border border-white/15 space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <span className="font-black text-[#F5C84C] text-xs flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5" />
                  <span>
                    {stations.length === 0
                      ? 'افتح محطتك الأولى وسمِّها:'
                      : `إضافة المحطة رقم (${stations.length + 1}):`}
                  </span>
                </span>
                <span className="text-[10px] text-white/75 font-mono">
                  المفتوحة حالياً: {stations.length}
                </span>
              </div>

              <div>
                <label className="block text-[10px] text-white/85 font-bold mb-1">
                  اسم المحطة أو المدينة *
                </label>
                <input
                  type="text"
                  required
                  value={stName}
                  onChange={(e) => {
                    setStName(e.target.value);
                    setStCity(e.target.value);
                  }}
                  placeholder="مثال: تازة، الداخلة، نواذيبو..."
                  className="w-full bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    الدولة / العلم:
                  </label>
                  <select
                    value={stCountry}
                    onChange={(e) => {
                      const c = e.target.value as 'MA' | 'MR';
                      setStCountry(c);
                      setStCurrency(c === 'MR' ? 'MRU' : 'MAD');
                    }}
                    className="w-full bg-black/75 border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                  >
                    <option value="MA">المغرب 🇲🇦</option>
                    <option value="MR">موريتانيا 🇲🇷</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    هاتف المحطة (اختياري):
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={stPhone}
                    onChange={(e) => setStPhone(e.target.value)}
                    placeholder="06..."
                    className="w-full bg-black/75 border border-white/20 rounded-xl px-2.5 py-2 text-white font-mono text-xs text-right focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAddingStation}
                className="btn-gold w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isAddingStation
                    ? 'جاري فتح المحطة...'
                    : stations.length === 0
                    ? 'فتح المحطة الأولى الآن'
                    : 'إضافة هذه المحطة للشبكة'}
                </span>
              </button>
            </form>

            {/* List of Added Stations */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black text-white px-1">
                <span>المحطات التي قمت بفتحها ({stations.length}):</span>
                {stations.length === 1 && (
                  <span className="text-[10px] text-[#F5C84C]">
                    يمكنك إضافة المحطة الثانية الآن أو المتابعة
                  </span>
                )}
              </div>

              {stations.length === 0 ? (
                <div className="p-3.5 rounded-2xl bg-black/45 border border-dashed border-white/20 text-center text-[11px] text-white/70">
                  لم تفتح أي محطة بعد. اكتب اسم محطتك الأولى في الأعلى واضغط <strong>"فتح المحطة الأولى الآن"</strong>.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                  {stations.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-2.5 rounded-xl bg-black/65 border border-[#F5C84C]/40 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] font-mono font-black text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-black text-white text-xs truncate">
                            {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name}
                          </div>
                          <div className="text-[10px] text-white/75 truncate">
                            المدينة: {st.city} • العملة: {st.currency || (st.country === 'MR' ? 'MRU' : 'MAD')}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteStation(st.id)}
                        className="btn-delete p-1.5 rounded-lg shrink-0"
                        title="حذف المحطة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Step 1 Footer */}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleGoToStep2}
                className="btn-gold w-full py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <span>التالي: الذهاب لصفحة الفلوس وتحديد العملة</span>
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 2: CASH PAGE — ASSIGN CURRENCY & OPENING BALANCE PER STATION   */}
        {/* =================================================================== */}
        {step === 2 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#006233]/35 to-black/75 border border-[#2ECC71]/45 space-y-1">
              <div className="flex items-center gap-1.5 text-[#68E399] font-black text-xs">
                <Coins className="w-4 h-4 shrink-0" />
                <span>أنت الآن في صفحة الفلوس والصناديق (اللاگيس)</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">
                من هنا تحدد لكل محطة <strong>العملة الرسمية الخاصة بها</strong> (الدرهم، الأوقية، أو أي عملة إضافية) ويمكنك وضع رصيد افتتاحي في صندوق كل محطة.
              </p>
            </div>

            {/* Per-Station Currency & Opening Balance Cards */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {stations.map((st, idx) => {
                const selectedCurr =
                  stationCurrencyMap[st.id] || st.currency || (st.country === 'MR' ? 'MRU' : 'MAD');
                return (
                  <div
                    key={st.id}
                    className="p-3 rounded-2xl bg-black/65 border border-[#F5C84C]/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-white text-xs flex items-center gap-1.5">
                        <span>{st.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
                        <span>
                          محطة {idx + 1}: {st.name} ({st.city})
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] font-mono text-[10px] font-black">
                        {selectedCurr}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-white/80 font-bold mb-1">
                          العملة الأساسية للمحطة:
                        </label>
                        <select
                          value={selectedCurr}
                          onChange={(e) =>
                            setStationCurrencyMap((prev) => ({
                              ...prev,
                              [st.id]: e.target.value,
                            }))
                          }
                          className="w-full bg-black/80 border border-[#F5C84C]/50 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                        >
                          {currencies.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label_ar} ({c.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/80 font-bold mb-1">
                          رصيد افتتاحي بالصندوق (اختياري):
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          dir="ltr"
                          value={openingBalances[st.id] || ''}
                          onChange={(e) =>
                            setOpeningBalances((prev) => ({
                              ...prev,
                              [st.id]: e.target.value,
                            }))
                          }
                          placeholder={`0 ${selectedCurr}`}
                          className="w-full bg-black/80 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-2 text-white font-mono text-xs text-center font-bold focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional Add Custom Currency */}
            <div className="bg-black/50 rounded-xl p-2.5 border border-white/15">
              <button
                type="button"
                onClick={() => setShowNewCurrForm((prev) => !prev)}
                className="text-[11px] font-black text-[#F5C84C] flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>هل تشتغل بعملة أخرى؟ اضغط لإضافة عملة جديدة (مثل EUR أو USD أو XOF)</span>
              </button>

              {showNewCurrForm && (
                <form onSubmit={handleAddCustomCurrency} className="mt-2 pt-2 border-t border-white/10 space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      type="text"
                      required
                      dir="ltr"
                      placeholder="الرمز (EUR)"
                      value={newCurrCode}
                      onChange={(e) => setNewCurrCode(e.target.value)}
                      className="bg-black/75 border border-white/20 rounded-lg px-2 py-1.5 text-white font-mono text-[11px] text-center"
                    />
                    <input
                      type="text"
                      required
                      placeholder="الاسم (أورو)"
                      value={newCurrLabel}
                      onChange={(e) => setNewCurrLabel(e.target.value)}
                      className="bg-black/75 border border-white/20 rounded-lg px-2 py-1.5 text-white text-[11px]"
                    />
                    <button
                      type="submit"
                      className="btn-gold rounded-lg text-[11px] font-black py-1.5 px-2"
                    >
                      + حفظ العملة
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Step 2 Footer */}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn-cancel py-2.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              <button
                type="button"
                disabled={isSavingStep2}
                onClick={handleSaveStep2AndNext}
                className="btn-gold flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <span>
                  {isSavingStep2
                    ? 'جاري حفظ عملات المحطات...'
                    : 'حفظ العملات والتعرف على صفحة الكوليات'}
                </span>
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 3: PARCELS & TRIPS AUTOMATIC TOUR                              */}
        {/* =================================================================== */}
        {step === 3 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#8c6d2c]/35 to-black/75 border border-[#F5C84C]/50 space-y-1">
              <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                <Package className="w-4 h-4 shrink-0" />
                <span>أنت الآن في صفحة الكوليات والرحلات (الإرساليات)</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">
                تم نقلك تلقائياً لصفحة الكوليات! إليك أهم الأدوات الذكية التي جهزناها لك ولعمالك في هذه الصفحة:
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <div className="p-2.5 rounded-xl bg-black/60 border border-white/15 flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C] flex items-center justify-center shrink-0 mt-0.5">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-white text-xs">
                    1. تسجيل الكوليات + حاسبة التسعيرة التلقائية
                  </h4>
                  <p className="text-[11px] text-white/75 leading-relaxed">
                    عند تسجيل كولي جديد، يحسب التطبيق التسعيرة أوتوماتيكياً حسب الوزن والوجهة مع دعم الزبناء الأوفياء (VIP) والكريدي.
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/60 border border-white/15 flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-white text-xs">
                    2. مسح جماعي سريع للسائق (Mode Scan Rapide en Rafale)
                  </h4>
                  <p className="text-[11px] text-white/75 leading-relaxed">
                    بضغطة زر يمسح السائق أو العامل عشرات الكوليات بالكاميرا متتالية بدون توقف لشحنها في الرحلة أو تفريغها عند الوصول.
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-black/60 border border-white/15 flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C] flex items-center justify-center shrink-0 mt-0.5">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-white text-xs">
                    3. إشعارات واتساب بالـ QR + مانيفست الجمارك وبون الـ PDF
                  </h4>
                  <p className="text-[11px] text-white/75 leading-relaxed">
                    إرسال رسالة واتساب جاهزة للعميل برابط التتبع والـ QR، وطباعة ملصق 10×10 سم أو بون كولي PDF أو مانيفست رسمي للسائق.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 Footer */}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-cancel py-2.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn-gold flex-1 py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <span>الخطوة الأخيرة: شعار الملصقات وبونات الـ PDF</span>
                <ArrowLeft className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 4: UPLOAD STICKER & PDF BON LOGO IMAGE                         */}
        {/* =================================================================== */}
        {step === 4 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#8c6d2c]/40 to-black/80 border border-[#F5C84C]/60 space-y-1">
              <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                <ImagePlus className="w-4 h-4 shrink-0" />
                <span>الخطوة الأخيرة: شعار خاص لملصقات QR وبونات الـ PDF فقط</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">
                اختر شعار وكالتك ليظهر فقط في <strong>ملصقات QR Code (10×10)</strong> وفي <strong>بونات الـ PDF والمانيفست</strong> (صورة التطبيق الرسمية ثابتة ولا تتغير).
              </p>
            </div>

            {/* Upload Logo + Inputs */}
            <div className="p-3 rounded-2xl bg-black/65 border border-white/15 space-y-2.5">
              <div className="flex items-center gap-3">
                {brandLogoUrl ? (
                  <div className="w-16 h-16 rounded-2xl bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden border-2 border-[#F5C84C]">
                    <img
                      src={brandLogoUrl}
                      alt="شعار الملصقات"
                      className="max-w-full max-h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-black/70 border border-dashed border-[#F5C84C]/50 flex items-center justify-center shrink-0 text-[#F5C84C]">
                    <QrCode className="w-7 h-7" />
                  </div>
                )}

                <div className="flex-1 space-y-1.5">
                  <label className="btn-gold w-full py-2 px-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-md active:scale-95 transition">
                    <ImagePlus className="w-4 h-4 shrink-0" />
                    <span>اختر شعاراً للملصقات وبونات الـ PDF</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoFileUpload}
                    />
                  </label>

                  {brandLogoUrl && (
                    <button
                      type="button"
                      onClick={() => setBrandLogoUrl('')}
                      className="btn-cancel w-full py-1 rounded-lg text-[10px] font-bold"
                    >
                      حذف الشعار المخصص
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    اسم الوكالة على الملصق والـ PDF:
                  </label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="اسم شركتك أو وكالتك..."
                    className="w-full bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-1.5 text-white text-xs font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    رقم الهاتف على البونات:
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={brandPhone}
                    onChange={(e) => setBrandPhone(e.target.value)}
                    placeholder="+212..."
                    className="w-full bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-1.5 text-white font-mono text-xs text-right focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-white/85 font-bold mb-1">
                  وصف خط النقل تحت الاسم (في ترويسة بونات الـ PDF):
                </label>
                <input
                  type="text"
                  value={brandSubtitle}
                  onChange={(e) => setBrandSubtitle(e.target.value)}
                  placeholder="مثال: خدمات الشحن اللوجيستي والنقل الدولي السريع"
                  className="w-full bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-1.5 text-white text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Live Dual Preview: Thermal Sticker + PDF Bon */}
            <div className="grid grid-cols-2 gap-2">
              {/* Preview 1: Thermal Sticker */}
              <div className="rounded-xl bg-white text-black p-2 border-2 border-black shadow-md space-y-1">
                <div className="flex items-center justify-between border-b border-black pb-1">
                  <span className="text-[9px] font-black bg-black text-white px-1.5 py-0.5 rounded">
                    ملصق حراري 10×10
                  </span>
                  <Printer className="w-3 h-3 text-black" />
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {brandLogoUrl && (
                    <img
                      src={brandLogoUrl}
                      alt="Logo"
                      className="w-7 h-7 object-contain border border-black/20 rounded p-0.5 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black truncate">
                      {brandName || 'اسم الوكالة'}
                    </div>
                    <div className="text-[8px] font-mono text-gray-700 truncate" dir="ltr">
                      {brandPhone || '0600000000'}
                    </div>
                  </div>
                </div>
                <div className="text-[9px] font-bold text-center bg-gray-100 border border-black/30 rounded py-0.5">
                  {stations[0]?.city || 'محطة 1'} ➔ {stations[1]?.city || 'محطة 2'}
                </div>
              </div>

              {/* Preview 2: Official PDF Bon */}
              <div className="rounded-xl bg-white text-black p-2 border-2 border-black shadow-md space-y-1">
                <div className="flex items-center justify-between border-b border-gray-300 pb-1">
                  <span className="text-[9px] font-black bg-black text-[#F5C84C] px-1.5 py-0.5 rounded">
                    بون PDF رسمي
                  </span>
                  <FileText className="w-3 h-3 text-black" />
                </div>
                <div className="flex items-center gap-1.5 pt-0.5">
                  {brandLogoUrl && (
                    <img
                      src={brandLogoUrl}
                      alt="Logo"
                      className="w-7 h-7 object-contain border border-gray-300 rounded p-0.5 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-black truncate">
                      {brandName || 'اسم الوكالة'}
                    </div>
                    <div className="text-[8px] text-gray-600 truncate">
                      {brandSubtitle || 'بون شحن وسندات PDF'}
                    </div>
                  </div>
                </div>
                <div className="text-[9px] font-bold text-center bg-amber-50 border border-amber-400/60 text-amber-900 rounded py-0.5">
                  بون كولي • بون صندوق • مانيفست
                </div>
              </div>
            </div>

            {/* Step 4 Footer */}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-cancel py-2.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق</span>
              </button>

              <button
                type="button"
                disabled={isSavingFinish}
                onClick={handleCompleteTour}
                className="btn-gold flex-1 py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isSavingFinish
                    ? 'جاري الحفظ...'
                    : 'حفظ الشعار وإنهاء الإعداد والبدء في العمل'}
                </span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
