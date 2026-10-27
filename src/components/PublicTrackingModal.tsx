import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, ParcelStatus } from '../types/database';
import {
  X,
  Search,
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  Truck,
  Copy,
  Check,
  MessageCircle,
  AlertCircle,
  Sparkles,
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
      setErrorMsg('يرجى كتابة رقم التتبع الخاص بالشحنة (مثال: ITT-2026-00101)');
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
        setErrorMsg(res.error || 'لم يتم العثور على شحنة بهذا الرقم');
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

  const publicShareLink = trackedParcel?.tracking_code
    ? `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(
        trackedParcel.tracking_code
      )}`
    : '';

  const handleCopyTrackingLink = () => {
    if (!publicShareLink) return;
    navigator.clipboard.writeText(publicShareLink);
    setCopiedLink(true);
    showToast('تم نسخ رابط التتبع المباشر للزبون', 'success');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[390px] rounded-[24px] p-4 sm:p-5 shadow-2xl text-right overflow-hidden relative my-4 max-h-[92vh] flex flex-col"
        style={{
          background: 'rgba(10, 15, 12, 0.94)',
          border: '1px solid rgba(245, 200, 76, 0.45)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9)',
        }}
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
                تتبع فوري لحالة الشحنة بدون تسجيل الدخول
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
              أدخل كود التتبع المطبوع على التذكرة الحرارية:
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={codeQuery}
                  onChange={(e) => setCodeQuery(e.target.value.toUpperCase())}
                  placeholder="مثال: ITT-2026-00101"
                  dir="ltr"
                  className="w-full bg-black/60 border border-white/25 focus:border-[#F5C84C] rounded-xl px-3 py-2.5 text-white font-mono text-xs text-center tracking-wider focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2.5 rounded-xl font-black text-xs flex items-center gap-1.5 shrink-0 shadow-md"
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
                      <span
                        className="font-mono font-black text-sm text-[#F5C84C]"
                        dir="ltr"
                      >
                        {trackedParcel.tracking_code}
                      </span>
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

                  <span className="px-2.5 py-1 rounded-full bg-[#006233]/40 border border-[#2ECC71]/50 text-[#2ECC71] font-black text-[11px]">
                    {statusLabels[(trackedParcel.status as ParcelStatus) || 'registered'] ||
                      trackedParcel.status}
                  </span>
                </div>

                {/* Route & Parties */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">محطة الانطلاق:</span>
                    <span className="font-black text-white">
                      {trackedParcel.origin_station_name || 'الداخلة'}
                    </span>
                  </div>
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">محطة الوصول:</span>
                    <span className="font-black text-[#F5C84C]">
                      {trackedParcel.destination_station_name || 'نواذيبو'}
                    </span>
                  </div>
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">المرسل:</span>
                    <span className="font-bold text-white">{trackedParcel.sender_name}</span>
                  </div>
                  <div className="bg-black/45 p-2.5 rounded-xl border border-white/10">
                    <span className="text-white/60 block text-[10px]">المستلم:</span>
                    <span className="font-bold text-white">{trackedParcel.receiver_name}</span>
                  </div>
                </div>

                {/* Package & Payment Summary */}
                <div className="bg-black/50 p-2.5 rounded-xl border border-white/15 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-white/70 block">البضاعة والعدد:</span>
                    <span className="font-bold text-white">
                      {trackedParcel.items_count || 1} طرد — {trackedParcel.description}
                    </span>
                  </div>
                  <div className="text-left">
                    <span className="text-[10px] text-white/70 block">حالة الأداء:</span>
                    <span
                      className={`font-black font-mono text-xs ${
                        remainingAmount <= 0 ? 'text-[#2ECC71]' : 'text-amber-300'
                      }`}
                    >
                      {remainingAmount <= 0
                        ? '✓ خالص بالكامل'
                        : `متبقي: ${remainingAmount} ${trackedParcel.currency || 'MAD'}`}
                    </span>
                  </div>
                </div>
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
                      title: 'في الطريق الدولي',
                      sub: trackedParcel.route || 'عبر معبر الكركرات',
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
                          className={`text-xs font-black ${
                            isDone ? 'text-white' : 'text-white/50'
                          }`}
                        >
                          {item.title}
                        </div>
                        <div className="text-[11px] text-white/70">{item.sub}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Share Tracking Link Bar */}
              <div className="bg-black/50 border border-white/15 rounded-2xl p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-black text-white block">
                    رابط التتبع المباشر لهذه الشحنة:
                  </span>
                  <span
                    className="text-[10px] text-white/70 font-mono truncate block"
                    dir="ltr"
                  >
                    {publicShareLink}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyTrackingLink}
                  className="px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1 shrink-0"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'تم النسخ' : 'نسخ الرابط'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/15 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel w-full py-2.5 rounded-xl font-black text-xs"
          >
            إغلاق نافذة التتبع
          </button>
        </div>
      </div>
    </div>
  );
};
