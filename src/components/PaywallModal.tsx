import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { PLATFORM_CONFIG } from '../config/constants';
import {
  X,
  Crown,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  ImagePlus,
  Users,
  ArrowRightLeft,
  Zap,
  ChevronDown,
  Store,
  UserCheck,
} from 'lucide-react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PlanId = 'plan_1_full' | 'plan_2_two_stations';

interface PlanOption {
  id: PlanId;
  name: string;
  badge: string;
  priceMad: number;
  subtitle: string;
  quotaBadge: string;
  isPopular?: boolean;
  highlights: string[];
  extraFeatures?: { icon: React.ElementType; title: string; desc: string }[];
}

const SUBSCRIPTION_PLANS: PlanOption[] = [
  {
    id: 'plan_1_full',
    name: 'الباك الأول: الباقة الشاملة المفتوحة',
    badge: 'يستفيد من كل شيء 👑',
    priceMad: 299,
    subtitle: 'صاحب الباك الأول يستفيد من كل شيء في التطبيق بدون أي قيود في المحطات أو العمال',
    quotaBadge: 'محطات مفتوحة بالكامل + عمال غير محدودين في كل محطة',
    isPopular: true,
    highlights: [
      'فتح عدد غير محدود من المحطات والمدن عبر الخط الصحراوي بدون قيود',
      'إضافة وتعيين عدد غير محدود من العمال في كل محطة',
      'إدارة شاملة للكوليات، الرحلات، والصناديق المزدوجة (MAD / MRU) مع الصرف اليدوي',
    ],
    extraFeatures: [
      {
        icon: ImagePlus,
        title: 'تعديل الصورة والشعار في الملصقات الحرارية (10×10)',
        desc: 'ضع لوغو وصورة وكالتك الخاصة واسمك التجاري على جميع ملصقات الكوليات والفواتير.',
      },
      {
        icon: Users,
        title: 'دفتر الزبناء والتجار الأوفياء (VIP) والكريدي',
        desc: 'حسابات خاصة للتجار، تسعيرة VIP تلقائية، وتتبع الديون والتحصيل.',
      },
      {
        icon: ArrowRightLeft,
        title: 'نظام الأمانة والحوالات المالية المستقل (Hawala)',
        desc: 'إرسال وصرف الحوالات المالية بين المحطات بكود سري (PIN) ووصل مستقل.',
      },
      {
        icon: Zap,
        title: 'المسح الجماعي السريع + تصدير شامل (Excel / PDF)',
        desc: 'وضع المسح المتتالي للسائق، تنبيهات الستوك المتأخر، ونسخ احتياطي بضغطة زر.',
      },
    ],
  },
  {
    id: 'plan_2_two_stations',
    name: 'الباك الثاني: باقة المحطتين (عامل لكل محطة)',
    badge: 'محطتين + عامل/محطة',
    priceMad: 199,
    subtitle: 'صاحب الباك الثاني يفتح محطتين (2) فقط، وفي كل محطة عامل واحد (1) فقط',
    quotaBadge: 'الحد الأقصى: فتح محطتين (2) فقط | عامل واحد (1) في كل محطة',
    highlights: [
      'فتح محطتين (2) فقط كحد أقصى في مساحة العمل (مثلاً: محطة الانطلاق ومحطة الوصول)',
      'تعيين عامل واحد (1) فقط في كل محطة (بإجمالي عاملين فقط في مساحة العمل)',
      'تسيير الكوليات والشحنات والرحلات بين المحطتين مع إشعارات الواتساب',
      'دفاتر الصناديق المزدوجة (الدرهم MAD والأوقية MRU) مع الصرف اليدوي',
      'طباعة ملصقات الكوليات وورقة الطريق الرسمية للسائق والجمارك (PDF)',
    ],
  },
];

export const PaywallModal: React.FC<PaywallModalProps> = ({ isOpen, onClose }) => {
  const {
    isSubscriptionExpired,
    daysUntilExpiry,
    currentTeam,
    currentWorkspace,
    currentUser,
    switchWorkspacePlan,
  } = useApp();

  const currentPlanTier: PlanId =
    currentWorkspace?.plan_tier === 'plan_2_two_stations' ||
    currentWorkspace?.max_stations === 2 ||
    currentWorkspace?.max_workers_per_station === 1
      ? 'plan_2_two_stations'
      : 'plan_1_full';

  const [selectedPlanId, setSelectedPlanId] = useState<PlanId>(currentPlanTier);
  const [expandedPlanDetails, setExpandedPlanDetails] = useState<PlanId | null>(currentPlanTier);
  const [isApplyingPlan, setIsApplyingPlan] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedPlanId(currentPlanTier);
      setExpandedPlanDetails(currentPlanTier);
    }
  }, [isOpen, currentPlanTier]);

  if (!isOpen) return null;

  const selectedPlan =
    SUBSCRIPTION_PLANS.find((p) => p.id === selectedPlanId) || SUBSCRIPTION_PLANS[0];

  const handleApplyPlanMode = async () => {
    setIsApplyingPlan(true);
    try {
      await switchWorkspacePlan(selectedPlanId);
    } finally {
      setIsApplyingPlan(false);
    }
  };

  const whatsappMessage = encodeURIComponent(
    `السلام عليكم، أرغب في تفعيل / تجديد اشتراك تطبيق محطة الاتحادية:\n` +
      `• *الباقة المختارة:* ${selectedPlan.name}\n` +
      `• *نظام الحصص:* ${selectedPlan.quotaBadge}\n` +
      `• *قيمة الباقة:* ${selectedPlan.priceMad} درهم / شهرياً\n` +
      `• *اسم مساحة العمل:* ${currentTeam?.name || 'محطة الاتحادية'}\n` +
      `• *معرف المساحة:* ${currentTeam?.short_id || '---'}\n` +
      `• *المدير المسؤول:* ${currentUser?.name || 'مدير المحطة'}`
  );

  const whatsappUrl = `https://wa.me/${PLATFORM_CONFIG.PAYMENT_CLEAN_PHONE}?text=${whatsappMessage}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[445px] rounded-[26px] luxury-card border border-[#F5C84C]/55 shadow-2xl text-right overflow-hidden relative my-4 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Decorative Gold Gradient Bar */}
        <div className="h-1.5 w-full bg-gradient-to-l from-[#F5C84C] via-[#E5A823] to-[#006233] shrink-0" />

        {/* Header */}
        <div className="p-4 border-b border-white/15 flex items-center justify-between bg-black/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border shadow-md ${
                isSubscriptionExpired
                  ? 'bg-rose-950/70 border-rose-500/40 text-rose-400'
                  : 'bg-[#F5C84C]/20 border-[#F5C84C]/50 text-[#F5C84C]'
              }`}
            >
              {isSubscriptionExpired ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <Crown className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-black text-white">
                {isSubscriptionExpired
                  ? 'تجديد اشتراك مساحة العمل'
                  : 'باقات اشتراك محطة الاتحادية'}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                    isSubscriptionExpired
                      ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                      : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isSubscriptionExpired
                    ? 'الاشتراك منتهي (وضع القراءة فقط)'
                    : `اشتراك نشط (${daysUntilExpiry} يوم متبقية)`}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-black bg-[#F5C84C]/20 text-[#F5C84C] border border-[#F5C84C]/40">
                  {currentPlanTier === 'plan_2_two_stations'
                    ? 'النظام الحالي: الباك الثاني (محطتين + عامل/محطة)'
                    : 'النظام الحالي: الباك الأول (شامل كل شيء)'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="btn-cancel p-2 rounded-xl transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body: Two Packages Comparison & Selection */}
        <div className="p-3.5 space-y-3 overflow-y-auto flex-1 text-xs">
          <div className="text-[11px] text-[#E6C37A] font-bold text-center bg-black/55 py-2 px-3 rounded-xl border border-[#F5C84C]/25">
            الباك الأول يستفيد من كل شيء بدون قيود • الباك الثاني يفتح محطتين فقط وعامل واحد في كل محطة
          </div>

          {/* Two Packages Grid / Stack */}
          <div className="space-y-2.5">
            {SUBSCRIPTION_PLANS.map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const isCurrentActive = currentPlanTier === plan.id;
              const isExpanded = expandedPlanDetails === plan.id;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`rounded-[22px] p-3.5 transition-all cursor-pointer border-2 relative overflow-hidden ${
                    isSelected
                      ? 'bg-gradient-to-b from-[#2b1d05]/95 to-black/90 border-[#F5C84C] shadow-[0_0_25px_rgba(245,200,76,0.2)]'
                      : 'bg-black/55 border-white/15 hover:border-white/30'
                  }`}
                >
                  {/* Top Row of Package Card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'border-[#F5C84C] bg-[#F5C84C]'
                              : 'border-white/40 bg-transparent'
                          }`}
                        >
                          {isSelected && (
                            <span className="w-1.5 h-1.5 rounded-full bg-black" />
                          )}
                        </div>
                        <h3 className="text-xs sm:text-sm font-black text-white">
                          {plan.name}
                        </h3>
                        <span
                          className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                            plan.isPopular
                              ? 'bg-[#F5C84C] text-[#111111]'
                              : 'bg-white/10 text-white/85 border border-white/20'
                          }`}
                        >
                          {plan.badge}
                        </span>
                        {isCurrentActive && (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            مفعل حالياً
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-white/80 leading-relaxed pr-5">
                        {plan.subtitle}
                      </p>
                    </div>

                    {/* Price Box */}
                    <div className="text-left shrink-0 bg-black/70 px-2.5 py-1.5 rounded-xl border border-[#F5C84C]/35">
                      <div className="text-base font-black font-mono text-[#F5C84C] leading-none">
                        {plan.priceMad} <span className="text-[10px] font-sans">درهم</span>
                      </div>
                      <span className="text-[9px] text-white/65 block mt-0.5">
                        شهرياً
                      </span>
                    </div>
                  </div>

                  {/* Stations & Workers Quota Badge */}
                  <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-black/65 border border-[#F5C84C]/30 flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 font-black text-[#F5C84C]">
                      <Store className="w-3.5 h-3.5 shrink-0" />
                      <span>{plan.quotaBadge}</span>
                    </div>
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  </div>

                  {/* Toggle Details Button (Compact Arrow) */}
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-[#E6C37A] flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-[#F5C84C]" />
                      <span>
                        {plan.id === 'plan_1_full'
                          ? 'جميع المحطات والعمال مفتوحين + الشعار والزبناء VIP'
                          : 'محطتين (2) فقط + عامل واحد (1) في كل محطة'}
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedPlanDetails(isExpanded ? null : plan.id);
                      }}
                      className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0"
                    >
                      <span>{isExpanded ? 'إخفاء التفاصيل' : 'عرض التفاصيل'}</span>
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[#F5C84C] transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                  </div>

                  {/* Collapsible Features List */}
                  {isExpanded && (
                    <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 animate-fadeIn">
                      {plan.highlights.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 text-[11px] text-white/90"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </div>
                      ))}

                      {plan.extraFeatures && (
                        <div className="grid grid-cols-1 gap-1.5 pt-1">
                          {plan.extraFeatures.map((feat, idx) => {
                            const FeatIcon = feat.icon;
                            return (
                              <div
                                key={idx}
                                className="p-2 rounded-xl bg-black/65 border border-[#F5C84C]/35 flex items-start gap-2"
                              >
                                <div className="w-7 h-7 rounded-lg bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] flex items-center justify-center shrink-0 mt-0.5">
                                  <FeatIcon className="w-3.5 h-3.5" />
                                </div>
                                <div>
                                  <span className="font-black text-[#F5C84C] text-[11px] block">
                                    {feat.title}
                                  </span>
                                  <span className="text-[10px] text-white/80 leading-relaxed block">
                                    {feat.desc}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Payment Method Info Box */}
          <div className="p-3 rounded-2xl bg-black/60 border border-white/15 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[11px] font-black text-white block">
                  تفعيل فوري عبر {PLATFORM_CONFIG.PAYMENT_PROVIDER_NAME}
                </span>
                <span className="text-[10px] text-white/70 block">
                  جميع بياناتك وسجلاتك محفوظة بأمان تام 100%
                </span>
              </div>
            </div>
            <span className="text-xs font-mono font-black text-[#F5C84C] shrink-0">
              {selectedPlan.priceMad} DH
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-white/15 bg-black/70 space-y-2 shrink-0">
          {currentPlanTier !== selectedPlanId && (
            <button
              type="button"
              disabled={isApplyingPlan}
              onClick={handleApplyPlanMode}
              className="w-full py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md active:scale-98 transition flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                {selectedPlanId === 'plan_2_two_stations'
                  ? 'تطبيق نظام الباك الثاني الآن (فتح محطتين + عامل لكل محطة)'
                  : 'تطبيق نظام الباك الأول الشامل الآن (فتح كل شيء بدون حدود)'}
              </span>
            </button>
          )}

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold flex items-center justify-center gap-2 w-full py-3 rounded-2xl font-black text-xs shadow-lg active:scale-98 transition"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>
              طلب اشتراك «{selectedPlan.name}» ({selectedPlan.priceMad} درهم) عبر واتساب
            </span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="btn-cancel w-full py-2 rounded-xl text-xs font-bold transition"
          >
            العودة إلى التطبيق
          </button>
        </div>
      </div>
    </div>
  );
};

