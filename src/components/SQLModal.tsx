import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Code2, 
  ShieldCheck, 
  Share2, 
  Users, 
  Lock, 
  Crown,
  KeyRound,
  FileCheck
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { MASTER_SCHEMA_SQL } from '../config/schemaSql';

interface SQLModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SQLModal: React.FC<SQLModalProps> = ({ isOpen, onClose }) => {
  const { showToast } = useApp();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'sql' | 'steps' | 'security'>('sql');

  if (!isOpen) return null;

  const sqlCode = MASTER_SCHEMA_SQL;

  const copyAllSQL = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    showToast('تم نسخ سكريبت SQL الرئيسي بالكامل! يمكنك لصقه في Supabase SQL Editor', 'success');
    setTimeout(() => setCopied(false), 2500);
  };

  const copyPlatformOwnerCmd = () => {
    const cmd = `INSERT INTO public.platform_owners (user_id) VALUES ('<ضع_معرف_المستخدم_هنا>');`;
    navigator.clipboard.writeText(cmd);
    showToast('تم نسخ أمر إضافة مالك المنصة!', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-5 animate-fadeIn">
      <div 
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-[#131C2E] border border-slate-700/80 shadow-2xl text-right overflow-hidden"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0E1726]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">ملف قاعدة البيانات الشامل (Supabase SQL)</h2>
              <p className="text-[11px] text-slate-400">
                عزل مساحات العمل 100%، RLS على كل الجداول، وعزل العمال بالمحطات
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-cancel p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-800 bg-[#0B1220] px-4">
          <button
            onClick={() => setActiveTab('sql')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'sql'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            كود قاعدة البيانات (جاهز للصق)
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'steps'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            خطوات الإعداد ومالك المنصة
          </button>
          <button
            onClick={() => setActiveTab('security')}
            className={`py-2.5 px-4 text-xs font-bold border-b-2 transition ${
              activeTab === 'security'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            القرارات الأمنية وسياسات RLS
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 text-xs">
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between bg-[#0B1220] p-2.5 rounded-xl border border-slate-800">
                <span className="text-[11px] text-slate-400">
                  ملف موحد، مرتب، وجاهز للتشغيل لمرة واحدة في Supabase SQL Editor.
                </span>
                <button
                  onClick={copyAllSQL}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 transition active:scale-95"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'تم النسخ!' : 'نسخ الكود بالكامل'}</span>
                </button>
              </div>

              <div className="relative rounded-2xl bg-[#090E18] border border-slate-800 p-4 font-mono text-[11px] text-slate-300 leading-relaxed overflow-x-auto max-h-[50vh] dir-ltr text-left">
                <pre>{sqlCode}</pre>
              </div>
            </div>
          )}

          {activeTab === 'steps' && (
            <div className="space-y-3 text-slate-300 leading-relaxed text-right">
              <div className="bg-[#0B1220] p-3.5 rounded-xl border border-slate-800">
                <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">1</span>
                  <span>فتح محرر SQL في Supabase</span>
                </h4>
                <p className="text-xs text-slate-400">
                  افتح مشروعك في لوحة تحكم Supabase، ثم اضغط على <strong>SQL Editor</strong> من القائمة الجانبية ثم <strong>New query</strong>.
                </p>
              </div>

              <div className="bg-[#0B1220] p-3.5 rounded-xl border border-slate-800">
                <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">2</span>
                  <span>لصق الكود والتشغيل لمرة واحدة</span>
                </h4>
                <p className="text-xs text-slate-400">
                  انسخ الكود من التبويب السابق، الصقه في المحرر، واضغط زر <strong>Run</strong> الأخضر. سيتم بناء كل الجداول وسياسات RLS والدوال والتريجرز دفعة واحدة.
                </p>
              </div>

              {/* Platform Owner Manual Activation */}
              <div className="bg-gradient-to-r from-amber-950/40 via-[#0B1220] to-[#0B1220] p-3.5 rounded-xl border border-amber-500/30 space-y-2">
                <h4 className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>3. ترقية حسابك إلى مالك المنصة (Platform Owner) يدوياً</span>
                </h4>
                <p className="text-xs text-slate-300">
                  لأسباب أمنية، لا يتم منح صلاحية مالك المنصة برقم الهاتف. بعد أن تسجل حسابك لأول مرة في التطبيق:
                </p>
                <ol className="list-decimal list-inside text-xs text-slate-400 space-y-1">
                  <li>اذهب إلى <strong>Authentication ➡️ Users</strong> في Supabase وانسخ معرف المستخدم (User ID / UUID).</li>
                  <li>شغّل هذا السطر في SQL Editor:</li>
                </ol>
                <div className="bg-[#070B14] p-2.5 rounded-lg border border-amber-500/30 flex items-center justify-between font-mono text-[11px] text-amber-200 dir-ltr">
                  <code>INSERT INTO public.platform_owners (user_id) VALUES ('&lt;USER_ID&gt;');</code>
                  <button
                    onClick={copyPlatformOwnerCmd}
                    className="p-1 text-amber-400 hover:text-white"
                    title="نسخ الأمر"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-[#0B1220] p-3.5 rounded-xl border border-slate-800">
                <h4 className="font-bold text-white text-sm mb-1 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs">4</span>
                  <span>نسخ مفتاح anon والرابط</span>
                </h4>
                <p className="text-xs text-slate-400">
                  اذهب إلى Project Settings ➡️ API وانسخ Project URL ومفتاح anon public key فقط. الصقهما في التطبيق (لا تطلب أو تستخدم أبداً مفتاح service_role).
                </p>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-3 text-slate-300 text-right">
              <div className="bg-[#0B1220] p-3 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white mb-0.5">تغطية 100% لسياسات RLS الصارمة</h4>
                  <p className="text-slate-400 text-[11px]">
                    لا توجد أي سياسة تسمح بالوصول عبر true أو للزوار المجهولين (Zero Anonymous Access). كل عملية قراءة أو كتابة تشترط مصادقة المستخدم وتطابق مساحة العمل.
                  </p>
                </div>
              </div>

              <div className="bg-[#0B1220] p-3 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <Crown className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white mb-0.5">حماية مالك المنصة (جدول platform_owners)</h4>
                  <p className="text-slate-400 text-[11px]">
                    مالك المنصة محمي داخل جدول منفصل لا تملك أي واجهة برمجية صلاحية الكتابة فيه. مالك المنصة يرى بيانات الاشتراكات ومساحات العمل فقط ولا يملك أي وصول إلى البيانات المالية للمساحات المستقلة.
                  </p>
                </div>
              </div>

              <div className="bg-[#0B1220] p-3 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <Users className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white mb-0.5">عزل العمال حسب المحطة (Station Isolation)</h4>
                  <p className="text-slate-400 text-[11px]">
                    العامل يرى فقط المعاملات والكوليات الخاصة بمحطته المعين بها حصراً، ولا يمكنه الاطلاع على محطات أخرى داخل نفس مساحة العمل أو مساحات أخرى.
                  </p>
                </div>
              </div>

              <div className="bg-[#0B1220] p-3 rounded-xl border border-slate-800 flex items-start gap-2.5">
                <Lock className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white mb-0.5">تأمين دوال SECURITY DEFINER</h4>
                  <p className="text-slate-400 text-[11px]">
                    تم تحديد مسار البحث بصرامة: <code>SET search_path = public, pg_temp</code> مع فحص <code>auth.uid()</code> لمنع أي هجمات استغلال المسار (Search Path Hijacking).
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0E1726] flex justify-between items-center">
          <button
            onClick={copyAllSQL}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition active:scale-95"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'تم النسخ!' : 'نسخ الكود بالكامل'}</span>
          </button>

          <button
            onClick={onClose}
            className="btn-cancel px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
