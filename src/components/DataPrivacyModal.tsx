import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Server,
  HardDrive,
  Users,
  Handshake,
  Crown,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';

interface DataPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DataPrivacyModal: React.FC<DataPrivacyModalProps> = ({ isOpen, onClose }) => {
  const {
    currentUser,
    userRole,
    currentWorkspace,
    workspaceMembers,
    collaborations,
    isSupabaseLive,
    showToast,
  } = useApp();

  const [copiedId, setCopiedId] = useState(false);
  const [openRoleCard, setOpenRoleCard] = useState<string | null>('owner');
  const [openStorageSection, setOpenStorageSection] = useState(false);
  const [openSecurityGuarantees, setOpenSecurityGuarantees] = useState(false);

  if (!isOpen) return null;

  const activePartners = collaborations.filter((c) => c.status === 'accepted');
  const myWsId = currentWorkspace?.id || '';

  const handleCopyShortId = () => {
    if (!currentWorkspace?.short_id) return;
    navigator.clipboard.writeText(currentWorkspace.short_id);
    setCopiedId(true);
    showToast('تم نسخ معرف مساحة العمل (6 أحرف)', 'success');
    setTimeout(() => setCopiedId(false), 2000);
  };

  const roleCards = [
    {
      id: 'owner',
      title: '1. مدير المحطة (أنت / مالك مساحة العمل)',
      badge: userRole === 'owner' ? 'دورك الحالي' : 'مدير مساحتك',
      icon: Crown,
      canSee: [
        'جميع الكوليات والإرساليات المسجلة في محطاتك.',
        'جميع دفاتر الصناديق (الدرهم MAD والأوقية MRU) والإيصالات المالية.',
        'إدارة العمال وتعيين المحطات ورموز الدعوة وتخصيص الملصق الحراري.',
        'بيانات الكوليات المشتركة من شركاء الغرف المتعاونة (حسب الإذن الممنوح).',
      ],
      cannotSee: [
        'بيانات أي مدير آخر غير مرتبط معك في غرفة شراكة نشطة.',
        'دفاتر الصندوق المالي (اللاگيس) لأي مدير آخر حتى لو كان شريكاً معك.',
      ],
    },
    {
      id: 'worker',
      title: `2. عمال المحطات التابعون لك (${workspaceMembers.length} عضو)`,
      badge: userRole === 'worker' ? 'دورك الحالي' : 'صلاحيات مقيدة',
      icon: Users,
      canSee: [
        'الكوليات الصادرة من محطته أو الواردة إليها فقط لتنفيذ الاستلام والتسليم.',
        'عمليات الصندوق الخاصة بمحطته المعينة فقط.',
        'إضافة إيصالات وشحنات جديدة وتحديث حالة الاستلام ضمن محطته.',
      ],
      cannotSee: [
        'صناديق أو معاملات المحطات الأخرى غير المعينة له.',
        'حذف البيانات أو تغيير إعدادات مساحة العمل أو إضافة/حذف عمال.',
        'بيانات غرف الشراكة الخارجية بين المدراء.',
      ],
    },
    {
      id: 'partners',
      title: `3. المدراء المتعاونون في غرف الشراكة (${activePartners.length} شريك نشط)`,
      badge: activePartners.length > 0 ? 'مشاركة محددة' : 'لا يوجد شركاء حالياً',
      icon: Handshake,
      canSee:
        activePartners.length === 0
          ? ['لا يوجد أي شريك مرتبط حالياً — بياناتك معزولة 100% عن جميع المدراء الآخرين.']
          : activePartners.map((c) => {
              const isRequester = c.requester_workspace_id === myWsId;
              const partnerName = isRequester
                ? c.target_workspace_name || 'شريك متعاون'
                : c.requester_workspace_name || 'شريك متعاون';
              const myShareParcels = isRequester ? c.requester_share_parcels : c.target_share_parcels;
              const myShareReports = isRequester ? c.requester_share_reports : c.target_share_reports;

              const allowedList = [
                myShareParcels ? 'الكوليات' : null,
                myShareReports ? 'التقارير' : null,
              ].filter(Boolean);

              return `${partnerName}: يرى فقط (${
                allowedList.length > 0 ? allowedList.join(' + ') : 'لا شيء — مغلق'
              })`;
            }),
      cannotSee: [
        'الصندوق المالي (اللاگيس) الخاص بك — معزول تماماً ولا يمكن مشاركته أبداً.',
        'أي قسم تغلقه أنت من مفاتيح المشاركة اللحظية في غرفة الشراكة.',
        'بيانات عمالك أو رمز دعوة فريقك.',
      ],
    },
    {
      id: 'platform',
      title: '4. إدارة المنصة والاشتراكات',
      badge: 'إدارة الحسابات فقط',
      icon: ShieldCheck,
      canSee: [
        `اسم مساحة العمل (${currentWorkspace?.name || 'محطتك'}) ومعرفها القصير (${
          currentWorkspace?.short_id || '------'
        }).`,
        'اسم صاحب الحساب وحالة الاشتراك وتاريخ انتهاء الصلاحية لتقديم الدعم وتفعيل الباقات.',
      ],
      cannotSee: [
        'تفاصيل معاملاتك المالية اليومية أو أرصدة صناديقك الخاصة.',
        'قوائم زبنائك أو تفاصيل الكوليات والرحلات الخاصة بوكالتك.',
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-[26px] luxury-card border border-[#F5C84C]/45 shadow-2xl text-right overflow-hidden relative my-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gold Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-l from-[#F5C84C] via-[#E5A823] to-[#006233] shrink-0" />

        {/* Header */}
        <div className="p-4 border-b border-white/15 flex items-center justify-between bg-black/55 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] flex items-center justify-center shrink-0 shadow-md">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">مركز الأمان وخصوصية البيانات</h2>
              <p className="text-[10px] text-[#E6C37A] mt-0.5">
                شفافية كاملة حول أين تُحفظ بياناتك ومن يملك صلاحية رؤيتها
              </p>
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

        {/* Scrollable Content */}
        <div className="p-3.5 space-y-3 overflow-y-auto flex-1 text-xs">
          {/* 1. Workspace Isolation Summary Card */}
          <div className="p-3.5 rounded-2xl bg-black/55 border border-[#F5C84C]/30 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#F5C84C] shrink-0" />
                <span className="font-black text-white text-xs">
                  عزل مساحات العمل (Multi-Workspace Isolation)
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[9px] font-black">
                معزول ومؤمّن 100%
              </span>
            </div>

            <p className="text-[11px] text-white/80 leading-relaxed">
              تعمل وكالتك داخل مساحة عمل مستقلة تماماً بمعرّف فريد. لا يمكن لأي وكالة أخرى رؤية كولياتك أو صناديقك المالية.
            </p>

            <div className="flex items-center justify-between bg-black/70 p-2.5 rounded-xl border border-white/15">
              <div>
                <span className="text-[10px] text-white/65 block">
                  معرف مساحة العمل الخاصة بك ({currentWorkspace?.name || 'محطتك'}):
                </span>
                <span
                  className="font-mono font-black text-sm text-[#F5C84C] tracking-widest"
                  dir="ltr"
                >
                  {currentWorkspace?.short_id || '------'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyShortId}
                className="btn-cancel px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1.5 transition"
              >
                {copiedId ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-[#F5C84C]" />
                )}
                <span>{copiedId ? 'تم النسخ' : 'نسخ المعرف'}</span>
              </button>
            </div>
          </div>

          {/* 2. Collapsible: أين تُحفظ البيانات؟ */}
          <div className="rounded-2xl bg-black/50 border border-white/15 p-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpenStorageSection((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenStorageSection((prev) => !prev);
                }
              }}
              className="flex items-center justify-between gap-2 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                {isSupabaseLive ? (
                  <Server className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <HardDrive className="w-4 h-4 text-[#F5C84C] shrink-0" />
                )}
                <div>
                  <span className="font-black text-white text-xs block">
                    أين تُحفظ بيانات المحطة؟
                  </span>
                  <span className="text-[10px] text-white/65">
                    {isSupabaseLive
                      ? 'تخزين سحابي مشفر + نسخة محلية للطوارئ'
                      : 'تخزين محلي آمن على جهازك (Offline-First)'}
                  </span>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
                  openStorageSection ? 'rotate-180' : ''
                }`}
              />
            </div>

            {openStorageSection && (
              <div className="mt-2.5 pt-2.5 border-t border-white/15 space-y-2 text-[11px] text-white/80 leading-relaxed animate-fadeIn">
                <p>
                  • يتم حفظ جميع الكوليات والرحلات وإيصالات الصندوق محلياً على جهازك ليعمل التطبيق بسرعة فائقة حتى عند انقطاع الإنترنت في الطريق الصحراوي.
                </p>
                <p>
                  • يمكنك في أي وقت أخذ نسخة احتياطية كاملة (Excel / PDF / JSON) من قسم الإعدادات أو من زر التصدير السريع.
                </p>
              </div>
            )}
          </div>

          {/* 3. Who Can See My Data? (Compact Collapsible Cards) */}
          <div className="space-y-2">
            <h3 className="text-xs font-black text-[#F5C84C] flex items-center gap-1.5 px-1">
              <Eye className="w-4 h-4 text-[#F5C84C]" />
              <span>من يمكنه رؤية بياناتي؟ (اضغط للتفاصيل)</span>
            </h3>

            {roleCards.map((card) => {
              const IconComp = card.icon;
              const isExpanded = openRoleCard === card.id;
              return (
                <div
                  key={card.id}
                  className="rounded-2xl bg-black/55 border border-white/15 overflow-hidden transition-all"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenRoleCard(isExpanded ? null : card.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenRoleCard(isExpanded ? null : card.id);
                      }
                    }}
                    className="p-3 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-white/5 transition"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-xl bg-[#F5C84C]/15 border border-[#F5C84C]/40 text-[#F5C84C] flex items-center justify-center shrink-0">
                        <IconComp className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-white text-[11px] truncate">
                        {card.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-black/70 text-[#E6C37A] border border-[#F5C84C]/30 font-bold">
                        {card.badge}
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#F5C84C] transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-2 border-t border-white/10 bg-black/40 space-y-2.5 animate-fadeIn">
                      {/* Can See */}
                      <div className="space-y-1">
                        <span className="text-[10px] font-black text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>ما يُسمح برؤيته:</span>
                        </span>
                        <ul className="space-y-1 pr-3 text-[11px] text-white/85">
                          {card.canSee.map((item, i) => (
                            <li key={i} className="list-disc leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Cannot See */}
                      <div className="space-y-1 pt-1 border-t border-white/10">
                        <span className="text-[10px] font-black text-rose-400 flex items-center gap-1">
                          <EyeOff className="w-3 h-3" />
                          <span>محجوب ولا يمكن رؤيته:</span>
                        </span>
                        <ul className="space-y-1 pr-3 text-[11px] text-white/75">
                          {card.cannotSee.map((item, i) => (
                            <li key={i} className="list-disc leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 4. Collapsible: ضمانات الأمان وعدم ضياع السجلات */}
          <div className="rounded-2xl bg-black/50 border border-[#F5C84C]/30 p-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => setOpenSecurityGuarantees((prev) => !prev)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpenSecurityGuarantees((prev) => !prev);
                }
              }}
              className="flex items-center justify-between gap-2 cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#F5C84C] shrink-0" />
                <span className="font-black text-white text-xs">
                  ضمانات حماية السجلات المالية (سجل تدقيق غير قابل للمسح)
                </span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
                  openSecurityGuarantees ? 'rotate-180' : ''
                }`}
              />
            </div>

            {openSecurityGuarantees && (
              <ul className="mt-2.5 pt-2.5 border-t border-white/15 space-y-1.5 text-[11px] text-white/80 pr-4 list-disc animate-fadeIn">
                <li>
                  <strong className="text-white">منع الحذف الصامت:</strong> لا يمكن لأي عامل مسح إيصال مالي لإخفاء عجز في الصندوق؛ الإلغاء يتطلب ذكر السبب ويُوثق في سجل التدقيق (Audit Log).
                </li>
                <li>
                  <strong className="text-white">حماية الحساب الشخصي:</strong> اسم المستخدم ({currentUser?.name || 'المدير'}) وكلمة المرور محمية ومشفرة ولا تشارك مع أي طرف.
                </li>
                <li>
                  <strong className="text-white">إخفاء الأرصدة بنقرة زر:</strong> يمكنك دائماً الضغط على أيقونة العين في الشريط العلوي لإخفاء المبالغ المالية (••••) أثناء العمل أمام الزبناء.
                </li>
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 border-t border-white/15 bg-black/65 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn-gold w-full py-2.5 rounded-xl font-black text-xs transition active:scale-95 shadow-md"
          >
            فهمت، إغلاق نافذة الخصوصية
          </button>
        </div>
      </div>
    </div>
  );
};
