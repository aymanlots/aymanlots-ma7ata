import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Lock, ShieldCheck, LogOut } from 'lucide-react';

export const ForcePasswordChangeModal: React.FC = () => {
  const { currentUser, changeMandatoryPassword, logout } = useApp();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!currentUser || !currentUser.must_change_password) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.trim().length < 8) {
      setError('كلمة المرور الجديدة يجب أن تتكون من 8 أحرف أو أرقام على الأقل');
      return;
    }

    if (newPassword.trim() !== confirmPassword.trim()) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setIsSaving(true);
    try {
      const res = await changeMandatoryPassword(newPassword.trim());
      if (!res.success && res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء تحديث كلمة المرور');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-md animate-fadeIn" dir="rtl">
      <div className="w-full max-w-[375px] rounded-[24px] bg-[#1a0f00] border-2 border-[#D4AF37]/80 p-5 shadow-2xl text-right space-y-4">
        <div className="flex items-center gap-3 border-b border-[#D4AF37]/30 pb-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-black text-[#F5D799]">
              تغيير كلمة المرور المؤقتة إجباري
            </h2>
            <p className="text-[11px] text-[#C8B08A]">
              لقد سجلت الدخول بكلمة مرور مؤقتة. يرجى تعيين كلمة مرور خاصة بك للمتابعة.
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-300 font-bold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="block text-[#E6C37A] font-bold mb-1">
              كلمة المرور الجديدة (8 خانات على الأقل) *
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={8}
                placeholder="8 أحرف أو أرقام على الأقل"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white font-mono pl-9 focus:outline-none"
              />
              <Lock className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-[#E6C37A] font-bold mb-1">
              تأكيد كلمة المرور الجديدة *
            </label>
            <div className="relative">
              <input
                type="password"
                required
                minLength={8}
                placeholder="أعد كتابة كلمة المرور الجديدة"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white font-mono pl-9 focus:outline-none"
              />
              <Lock className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] text-[#1a0f00] font-black text-xs shadow-lg transition active:scale-95 disabled:opacity-50"
          >
            {isSaving ? 'جاري حفظ كلمة المرور...' : 'حفظ كلمة المرور الجديدة والمتابعة'}
          </button>
        </form>

        <div className="pt-2 border-t border-[#D4AF37]/20 text-center">
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 text-xs text-rose-300 hover:text-rose-200 font-bold"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </div>
  );
};
