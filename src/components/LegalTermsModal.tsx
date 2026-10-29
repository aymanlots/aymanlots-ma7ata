import React, { useState } from 'react';
import { X, ShieldCheck, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface LegalTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'privacy' | 'terms';
}

export const LegalTermsModal: React.FC<LegalTermsModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'terms'
}) => {
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(defaultTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-[#060A14]/90 backdrop-blur-xs" onClick={onClose} />

      <div 
        className="w-full max-w-2xl rounded-3xl bg-[#0F172A] border border-amber-500/30 p-5 sm:p-6 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {activeTab === 'terms' ? 'شروط وأحكام الاستخدام' : 'سياسة الخصوصية وحماية البيانات'}
              </h2>
              <p className="text-[11px] text-amber-400 font-bold">
                تطبيق Sahara📦 Express لإدارة الإرساليات والكاش الدولي
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex bg-[#0B1220] p-1 rounded-2xl border border-slate-800 shrink-0 gap-1 text-xs font-bold">
          <button
            onClick={() => setActiveTab('terms')}
            className={`flex-1 py-2 rounded-xl transition ${
              activeTab === 'terms'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            شروط الاستخدام
          </button>
          <button
            onClick={() => setActiveTab('privacy')}
            className={`flex-1 py-2 rounded-xl transition ${
              activeTab === 'privacy'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            سياسة الخصوصية
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pr-1 text-xs text-slate-300 space-y-4 leading-relaxed">
          {activeTab === 'terms' ? (
            <div className="space-y-4 bg-[#0B1220] p-4 rounded-2xl border border-slate-800">
              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>1. طبيعة المنصة ونطاق الخدمة</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  تطبيق "Sahara📦 Express" هو نظام سحابي متخصص لتنظيم وتوثيق عمليات نقل البضائع، إصدار الوصولات والتذاكر الحرارية، وإدارة حركة الصناديق النقدية بين محطات الداخلة (المغرب) ونواذيبو (موريتانيا).
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>2. مسؤولية المدير ومستخدمي الحساب</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  يتحمل كل مدير مساحة عمل المسؤولية القانونية والتنظيمية الكاملة عن صحة البيانات والأسماء والمبالغ المسجلة في حسابه، وعن محتوى الطرود والإرساليات المسجلة تحت إدارته، والالتزام بالقوانين الجمركية والتجارية المعمول بها في المغرب وموريتانيا.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>3. عدم معالجة المدفوعات المصرفية المباشرة</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  المنصة لا تعمل كبنك أو معالج بطاقات بنكية، ولا تقتطع أموالاً إلكترونية تلقائياً؛ بل توثق فقط العمليات النقدية والتسليم اليدوي والتحويلات المسجلة من قِبل أمناء الصناديق والمحطات.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>4. شروط الاشتراك والفوترة</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  تستفيد مساحات العمل الجديدة من فترة تجريبية مجانية مدتها 15 يوماً. بعد انتهائها، يتطلب استمرار تسجيل المعاملات الجديدة تجديد الاشتراك عبر التحويل اليدوي (كاش بلوس)، مع بقاء كافة السجلات السابقة محفوظة ومتاحة للقراءة دائماً حتى في حال عدم التجديد.
                </p>
              </section>
            </div>
          ) : (
            <div className="space-y-4 bg-[#0B1220] p-4 rounded-2xl border border-slate-800">
              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>1. البيانات التي يتم جمعها</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  نجمع فقط البيانات الأساسية اللازمة للتشغيل: الاسم الكامل، رقم الهاتف، رقم الواتساب، وبيانات الإرساليات (أسماء وأرقام هواتف المرسلين والمستلمين ووصف البضاعة).
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>2. العزل الصارم بين مساحات العمل (Multi-Tenant Isolation)</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  تعتمد المنصة تقنية عزل البيانات على مستوى كل سطر في قاعدة البيانات (Row Level Security). بيانات مساحة عملك وصناديقك وكولياتك معزولة 100%، ولا يملك أي مدير أو مستخدم في مساحة أخرى أي قدرة على رؤيتها أو تعديلها.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>3. خصوصية رقم الواتساب وجهات الاتصال</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  رقم الواتساب الخاص بك محمي، ولا يظهر إلا لأعضاء نفس مساحة العمل المعتمدين، وللمدراء الآخرين الذين وافقت أنت صراحة وبشكل متبادل على التعاون معهم.
                </p>
              </section>

              <section className="space-y-1.5">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>4. المشاركة الاختيارية بين المدراء</span>
                </h3>
                <p className="text-slate-400 text-[11px]">
                  أي مشاركة بين المدراء اختيارية بالكامل وبموافقة متبادلة، وتكون البيانات المشتركة للقراءة فقط، مع إمكانية إلغائها وإخفائها في أي ثانية بنقرة واحدة من شاشة "من يمكنه رؤية بياناتي؟".
                </p>
              </section>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 text-center shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
          >
            فهمت وموافق
          </button>
        </div>

      </div>
    </div>
  );
};
