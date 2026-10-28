import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, ParcelStatus } from '../types/database';
import {
  formatDateTimeStandard,
  formatTrackingCodeNumeric,
  getPublicTrackingLink,
} from '../utils/logisticsFeatures';
import {
  X,
  Search,
  Package,
  MapPin,
  Clock,
  Copy,
  Check,
  MessageCircle,
  AlertCircle,
  Truck,
} from 'lucide-react';

interface PublicTrackingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTrackingCode?: string;
  initialCode?: string;
}

export const PublicTrackingModal: React.FC<PublicTrackingModalProps> = ({
  isOpen,
  onClose,
  initialTrackingCode = '',
  initialCode = '',
}) => {
  const { fetchPublicParcelTracking, showToast } = useApp();
  const effectiveInitialCode = initialCode || initialTrackingCode;

  const [codeQuery, setCodeQuery] = useState(effectiveInitialCode);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackedParcel, setTrackedParcel] = useState<
    (Partial<Parcel> & { workspace_name?: string }) | null
  >(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (isOpen && effectiveInitialCode.trim()) {
      setCodeQuery(effectiveInitialCode.trim());
      handleLookup(effectiveInitialCode.trim());
    }
  }, [isOpen, effectiveInitialCode]);

  if (!isOpen) return null;

  const handleLookup = async (rawCode?: string) => {
    const target = (rawCode ?? codeQuery).trim();
    if (!target) {
      setErrorMsg('يرجى كتابة كود التتبع المكون من أرقام (مثال: 0000466)');
      return;
    }

    setErrorMsg(null);
    setIsSearching(true);
    try {
      const res = await fetchPublicParcelTracking(target);
      if (res.success && res.parcel) {
        setTrackedParcel(res.parcel);
      } else {
        setTrackedParcel(null);
        setErrorMsg(res.error || 'لم يتم العثور على شحنة بهذا الكود');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء البحث عن الشحنة');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleLookup();
  };

  const statusLabels: Record<ParcelStatus, string> = {
    registered: 'تم التسجيل في محطة الانطلاق',
    in_transit: 'في الطريق الدولي (قيد النقل)',
    arrived: 'وصلت إلى محطة الوجهة (جاهزة للاستلام)',
    delivered: 'تم التسليم للمستلم بنجاح',
    return_in_transit: 'في طريق الإرجاع للمرسل',
    returned: 'تم الإرجاع للمرسل',
    cancelled: 'ملغاة',
    pending: 'قيد المعالجة',
  };

  const getStepReach = (status?: ParcelStatus) => {
    if (status === 'delivered') return 4;
    if (status === 'arrived') return 3;
    if (status === 'in_transit') return 2;
    return 1;
  };

  const currentStep = getStepReach(trackedParcel?.status as ParcelStatus);
  const remainingAmount = Math.max(
    0,
    Math.round(((Number(trackedParcel?.amount_due) || 0) - (Number(trackedParcel?.amount_paid) || 0)) * 100) / 100
  );

  const displayNumericCode = trackedParcel
    ? formatTrackingCodeNumeric(trackedParcel.tracking_code, trackedParcel.parcel_number)
    : '';

  const publicShareLink = displayNumericCode
    ? getPublicTrackingLink(displayNumericCode, trackedParcel?.parcel_number)
    : '';

  const handleCopyCodeOnly = () => {
    if (!displayNumericCode) return;
    navigator.clipboard.writeText(displayNumericCode);
    setCopiedCode(true);
    showToast(`تم نسخ الكود: ${displayNumericCode}`, 'success');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyTrackingLink = () => {
    if (!publicShareLink) return;
    navigator.clipboard.writeText(publicShareLink);
    setCopiedLink(true);
    showToast('تم نسخ رابط التتبع المباشر للزبون', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleSendWhatsAppCode = () => {
    if (!trackedParcel || !displayNumericCode) return;
    const msg =
      `📦 *${trackedParcel.workspace_name || 'محطة الاتحادية'} — تتبع الكولي*\n` +
      `• *كود التتبع:* ${displayNumericCode}\n` +
      `• *من محطة:* ${trackedParcel.origin_station_name || 'الانطلاق'} ➔ *إلى:* ${trackedParcel.destination_station_name || 'الوصول'}\n` +
      `• *المرسل:* ${trackedParcel.sender_name || '—'} | *المستلم:* ${trackedParcel.receiver_name || '—'}\n` +
      `• *الحالة:* ${statusLabels[(trackedParcel.status as ParcelStatus) || 'registered']}\n` +
      `🔍 *رابط التتبع:*\n${publicShareLink}`;
    const rawPhone = (trackedParcel.receiver_phone || trackedParcel.sender_phone || '').replace(/[^0-9]/g, '');
    const waUrl = rawPhone
      ? `https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] luxury-card rounded-[24px] p-4 sm:p-5 shadow-2xl text-right overflow-hidden relative my-4 max-h-[92vh] flex flex-col border border-[#D4AF37]/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-[#F5C84C]">
                خدمة تتبع الكوليات للزبناء
              </h3>
              <p className="text-[11px] text-white/80">
                تتبع فوري بكود الأرقام (مثال: 0000466)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-cancel p-1.5 rounded-xl bg-black/50 border border-white/20 text-white/80 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-3.5 py-3.5 pr-0.5 text-xs">
          {/* Search Form */}
          <form onSubmit={handleFormSubmit} className="space-y-2">
            <label className="block text-[11px] font-bold text-[#F5D799]">
              أدخل كود التتبع المكون من أرقام (مثال: 0000466):
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={codeQuery}
                  onChange={(e) => setCodeQuery(e.target.value)}
                  placeholder="مثال: 0000466"
                  dir="ltr"
                  className="w-full bg-black/60 border border-white/25 focus:border-[#F5C84C] rounded-xl px-3 py-2.5 text-white font-mono text-sm font-black text-center tracking-widest focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="btn-gold px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-1.5 shrink-0 shadow-md"
              >
                <Search className="w-4 h-4" />
                <span>{isSearching ? 'بحث...' : 'تتبع الآن'}</span>
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-rose-200 font-bold flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Tracked Parcel Result */}
          {trackedParcel && (
            <div className="space-y-3 animate-fadeIn">
              {/* Top Status Card */}
              <div className="bg-black/60 border border-[#F5C84C]/40 rounded-2xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/15 pb-2.5">
                  <div>
                    <span className="text-[10px] text-white/70 block">
                      {trackedParcel.workspace_name || 'محطة الاتحادية للنقل الدولي'}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      <button
                        type="button"
                        onClick={handleCopyCodeOnly}
                        className="font-mono font-black text-base text-[#140b00] bg-[#F5C84C] px-2.5 py-0.5 rounded-lg flex items-center gap-1.5"
                        dir="ltr"
                      >
                        <span>{displayNumericCode}</span>
                        {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      {trackedParcel.parcel_number && (
                        <span
                          className="font-mono text-[11px] bg-white/10 px-2 py-0.5 rounded-lg text-white font-bold"
                          dir="ltr"
                        >
                          #{trackedParcel.parcel_number}
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 font-black text-[11px]">
                    {statusLabels[(trackedParcel.status as ParcelStatus) || 'registered'] ||
                      trackedParcel.status}
                  </span>
                </div>

                {/* Date & Time */}
                {trackedParcel.created_at && (
                  <div className="flex items-center justify-between bg-black/45 px-2.5 py-1.5 rounded-xl border border-white/10 text-[11px]">
                    <span className="text-white/70">تاريخ وساعة التسجيل:</span>
                    <span className="font-mono font-black text-[#F5D799]" dir="ltr">
                      {formatDateTimeStandard(trackedParcel.created_at)}
                    </span>
                  </div>
                )}

                {/* Route & Parties */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">📍 منين جاية (الانطلاق):</span>
                    <span className="font-black text-white">
                      {trackedParcel.origin_station_name || 'الانطلاق'}
                    </span>
                  </div>
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">🏁 فين غادية (الوجهة):</span>
                    <span className="font-black text-[#F5C84C]">
                      {trackedParcel.destination_station_name || 'الوصول'}
                    </span>
                  </div>
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">👤 شكون مولاها (المرسل):</span>
                    <span className="font-bold text-white block">{trackedParcel.sender_name}</span>
                    {trackedParcel.sender_phone && (
                      <span className="font-mono text-[10px] text-white/70" dir="ltr">
                        {trackedParcel.sender_phone}
                      </span>
                    )}
                  </div>
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">🎯 المستلم:</span>
                    <span className="font-bold text-white block">{trackedParcel.receiver_name}</span>
                    {trackedParcel.receiver_phone && (
                      <span className="font-mono text-[10px] text-white/70" dir="ltr">
                        {trackedParcel.receiver_phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Package & Payment Summary */}
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/15 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-white/70 block">📦 البضاعة والعدد:</span>
                    <span className="font-bold text-white">
                      {trackedParcel.items_count || 1} طرد — {trackedParcel.description}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-white/70 block">💳 حالة الأداء:</span>
                    <span
                      className={`font-black font-mono text-xs ${
                        remainingAmount <= 0 ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {remainingAmount <= 0
                        ? '✓ خالص بالكامل'
                        : `متبقي: ${remainingAmount} ${trackedParcel.currency || 'MAD'}`}
                    </span>
                  </div>
                </div>

                {trackedParcel.driver_name && (
                  <div className="bg-black/45 p-2 rounded-xl border border-white/10 flex items-center justify-between text-[11px]">
                    <span className="text-white/70 flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5 text-[#F5C84C]" />
                      <span>السائق والعربة:</span>
                    </span>
                    <span className="font-bold text-white">
                      {trackedParcel.driver_name} {trackedParcel.vehicle_plate ? `(${trackedParcel.vehicle_plate})` : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* 4-Step Golden Timeline */}
              <div className="bg-black/60 border border-white/15 rounded-2xl p-3.5 space-y-3">
                <h4 className="font-black text-xs text-[#F5C84C] flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  <span>مراحل سير الشحنة:</span>
                </h4>

                <div className="relative space-y-3 pr-7 before:absolute before:right-[9px] before:top-2 before:bottom-4 before:w-[2px] before:bg-[#F5C84C]/40">
                  {[
                    {
                      step: 1,
                      title: 'تم التسجيل في المحطة',
                      sub: trackedParcel.origin_station_name || 'محطة الانطلاق',
                    },
                    {
                      step: 2,
                      title: 'في الطريق',
                      sub: trackedParcel.route || 'بين المحطات',
                    },
                    {
                      step: 3,
                      title: 'وصلت إلى محطة الوجهة',
                      sub: trackedParcel.destination_station_name || 'جاهزة للاستلام في المحطة',
                    },
                    {
                      step: 4,
                      title: 'تم التسليم للمستلم',
                      sub: trackedParcel.delivered_to
                        ? `تسلّمها: ${trackedParcel.delivered_to}`
                        : `المستلم: ${trackedParcel.receiver_name}`,
                    },
                  ].map((item) => {
                    const isDone = currentStep >= item.step;
                    return (
                      <div key={item.step} className="relative">
                        <div
                          className={`absolute -right-7 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                            isDone
                              ? 'bg-[#F5C84C] text-[#111]'
                              : 'bg-black border border-white/30 text-white/40'
                          }`}
                        >
                          {isDone ? '✓' : item.step}
                        </div>
                        <div
                          className={`p-2 rounded-xl border ${
                            isDone
                              ? 'bg-[#F5C84C]/10 border-[#F5C84C]/40 text-white'
                              : 'bg-black/30 border-white/10 text-white/45'
                          }`}
                        >
                          <div className="font-black text-[11px]">{item.title}</div>
                          <div className="text-[10px] opacity-80">{item.sub}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Copy Numeric Code + Send via WhatsApp + Share Link */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleCopyCodeOnly}
                  className="btn-gold py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5"
                >
                  {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedCode ? 'تم نسخ الكود!' : `نسخ الكود (${displayNumericCode})`}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendWhatsAppCode}
                  className="py-2.5 px-3 rounded-xl bg-emerald-500/25 border border-emerald-500/50 text-emerald-300 font-black text-xs flex items-center justify-center gap-1.5 hover:bg-emerald-500/35 transition"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>إرسال فواتساب</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyTrackingLink}
                  className="col-span-2 btn-cancel py-2 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>تم نسخ رابط التتبع المباشر!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#F5C84C]" />
                      <span>نسخ رابط التتبع الكامل لإرساله يدوياً</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
