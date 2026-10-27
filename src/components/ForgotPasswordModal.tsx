import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PasswordResetRequest } from '../types/database';
import { 
  KeyRound, 
  X, 
  Send, 
  Phone, 
  MessageCircle, 
  CheckCircle2, 
  AlertCircle,
  ShieldCheck,
  UserCheck,
  UserX
} from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  // If true, shows admin resolution panel; if false, shows request submission form
  isAdminView?: boolean;
}

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  isAdminView = false
}) => {
  const { 
    currentUser, 
    userRole, 
    currentWorkspace, 
    passwordResetRequests, 
    submitPasswordResetRequest, 
    resolvePasswordResetRequest,
    showToast 
  } = useApp();

  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [accountType, setAccountType] = useState<'worker' | 'admin'>('worker');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedSuccessfully, setSubmittedSuccessfully] = useState(false);
  const [tempPasswordInputs, setTempPasswordInputs] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 6) {
      showToast('يرجى إدخال رقم هاتف صحيح', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await submitPasswordResetRequest({
        phone: cleanPhone,
        whatsapp: whatsapp.trim() || cleanPhone,
        accountType,
      });

      setIsSubmitting(false);
      if (res.success) {
        setSubmittedSuccessfully(true);
      } else {
        showToast(res.error || 'تعذر إرسال الطلب', 'error');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      showToast(err.message, 'error');
    }
  };

  const handleResolve = async (requestId: string, temporaryPassword?: string) => {
    try {
      const res = await resolvePasswordResetRequest(requestId, true, temporaryPassword || '123456');
      if (res.success) {
        showToast('تمت معالجة الطلب وتعيين رمز المرور المؤقت بنجاح', 'success');
      } else {
        showToast(res.error || 'حدث خطأ', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const pendingRequests = (passwordResetRequests || []).filter((r: PasswordResetRequest) => {
    if (userRole === 'platform_owner') return r.status === 'pending';
    // Workspace admin sees workers of their workspace
    return r.status === 'pending' && r.target_role === 'worker' && r.workspace_id === currentWorkspace?.id;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-[#060A14]/90 backdrop-blur-xs" onClick={onClose} />

      <div 
        className="w-full max-w-lg rounded-3xl bg-[#0F172A] border border-amber-500/30 p-5 sm:p-6 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-4"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">
                {isAdminView ? 'طلبات استعادة كلمة المرور المعلقة' : 'استعادة كلمة المرور أو رمز الدخول'}
              </h2>
              <p className="text-[11px] text-amber-400 font-bold">
                {isAdminView ? 'لوحة معالجة وتعيين كلمات المرور المؤقتة' : 'طلب إعادة تعيين رمز الدخول لحسابك'}
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

        {/* View 1: Admin Management View */}
        {isAdminView ? (
          <div className="space-y-3 text-xs">
            {pendingRequests.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800">
                لا توجد طلبات استعادة كلمة مرور معلقة حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((req: PasswordResetRequest) => (
                  <div key={req.id} className="p-3.5 bg-[#0B1220] rounded-2xl border border-amber-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm">{req.user_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold">
                        {req.target_role === 'worker' ? 'موظف محطة' : 'مدير مساحة عمل'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                      <span>الهاتف: {req.user_phone}</span>
                      <span>الواتساب: {req.user_whatsapp}</span>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="كلمة المرور المؤقتة (مثال: 123456)"
                        value={tempPasswordInputs[req.id] || ''}
                        onChange={e => setTempPasswordInputs({ ...tempPasswordInputs, [req.id]: e.target.value })}
                        className="flex-1 bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => handleResolve(req.id, tempPasswordInputs[req.id])}
                        className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
                      >
                        تعيين وإرسال
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : submittedSuccessfully ? (
          /* View 2: Successful submission state */
          <div className="bg-[#0B1220] p-6 rounded-2xl border border-emerald-500/30 text-center space-y-3 animate-fadeIn">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
            <h3 className="text-base font-bold text-white">تم استلام طلبك بنجاح!</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {accountType === 'worker'
                ? 'تم إرسال الطلب إلى مدير مساحة عملك. سيقوم المدير بتزويدك برمز دخول مؤقت عبر الواتساب.'
                : 'تم إرسال الطلب إلى إدارة المنصة. سيتم التواصل معك عبر الواتساب للتحقق من الهوية وإعادة تفعيل حسابك.'}
            </p>
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
            >
              العودة لشاشة الدخول
            </button>
          </div>
        ) : (
          /* View 3: User Submission Form */
          <form onSubmit={handleSubmitRequest} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-slate-300 font-bold mb-1">نوع الحساب *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAccountType('worker')}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    accountType === 'worker'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500'
                      : 'bg-[#0B1220] border-slate-800 text-slate-400'
                  }`}
                >
                  💼 موظف محطة
                </button>
                <button
                  type="button"
                  onClick={() => setAccountType('admin')}
                  className={`py-2 rounded-xl text-xs font-bold border transition ${
                    accountType === 'admin'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                      : 'bg-[#0B1220] border-slate-800 text-slate-400'
                  }`}
                >
                  👑 مالك / مدير مساحة عمل
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">رقم الهاتف المسجل به *</label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder="0600000000 أو 222..."
                  required
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full bg-[#0B1220] border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-white font-mono text-xs pl-9"
                />
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">رقم الواتساب للتواصل وتلقي الرمز:</label>
              <div className="relative">
                <input
                  type="tel"
                  placeholder={phone || 'رقم الواتساب'}
                  value={whatsapp}
                  onChange={e => setWhatsapp(e.target.value)}
                  className="w-full bg-[#0B1220] border border-slate-700 focus:border-amber-500 rounded-xl px-3 py-2.5 text-white font-mono text-xs pl-9"
                />
                <MessageCircle className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
              * بمجرد إرسال الطلب، يتلقى المسؤول إشعاراً لمطابقة بياناتك وتزويدك بكلمة مرور جديدة للدخول الفوري.
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 text-slate-950 font-black text-xs transition active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? 'جاري الإرسال...' : 'إرسال طلب الاستعادة للمسؤول'}
            </button>
          </form>
        )}

      </div>
    </div>
  );
};
