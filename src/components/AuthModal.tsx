import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ShieldCheck, 
  Phone, 
  Lock, 
  User, 
  Crown, 
  LogIn,
  KeyRound,
  MessageCircle,
  CheckCircle2,
  Package
} from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { LegalTermsModal } from './LegalTermsModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onOpenPublicTracking?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onOpenPublicTracking }) => {
  const { registerUser, loginWithCredentials } = useApp();
  const [isSignUp, setIsSignUp] = useState(false); // Default to Login directly
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showLegalTerms, setShowLegalTerms] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem('ittihadiya_saved_login_phone') || '';
    } catch {
      return '';
    }
  });
  const [whatsapp, setWhatsapp] = useState('');
  const [sameAsPhone, setSameAsPhone] = useState(true);
  const [password, setPassword] = useState('');
  const [isOwnerRole, setIsOwnerRole] = useState(true);
  const [teamInviteCode, setTeamInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handlePhoneChange = (val: string) => {
    setPhone(val);
    if (sameAsPhone) {
      setWhatsapp(val);
    }
  };

  const handleToggleSameAsPhone = () => {
    const nextVal = !sameAsPhone;
    setSameAsPhone(nextVal);
    if (nextVal) {
      setWhatsapp(phone);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.trim();
    if (!cleanPhone || cleanPhone.length < 6) {
      setError('يرجى إدخال رقم هاتف صحيح');
      return;
    }

    try {
      localStorage.setItem('ittihadiya_saved_login_phone', cleanPhone);
    } catch {}

    if (!password || password.length < 6) {
      setError('كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام');
      return;
    }

    if (isSignUp && (!name || name.trim().length < 2)) {
      setError('يرجى إدخال اسمك الكامل');
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        const finalWhatsapp = sameAsPhone ? cleanPhone : (whatsapp.trim() || cleanPhone);
        const res = await registerUser({
          name: name.trim(),
          phone: cleanPhone,
          whatsapp_number: finalWhatsapp,
          password: password.trim(),
          isOwner: isOwnerRole,
          teamInviteCode: !isOwnerRole ? teamInviteCode.trim() : undefined,
        });

        setIsLoading(false);
        if (res.success && onClose) {
          onClose();
        } else if (res.error) {
          setError(res.error);
        }
      } else {
        const res = await loginWithCredentials(cleanPhone, password.trim());
        setIsLoading(false);
        if (res.success && onClose) {
          onClose();
        } else if (res.error) {
          setError(res.error);
        }
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'حدث خطأ أثناء معالجة الطلب');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black animate-fadeIn overflow-y-auto" dir="rtl">
      <div 
        className="w-full max-w-[380px] rounded-[24px] bg-[#1a0f00]/90 border border-[#D4AF37]/65 p-5 shadow-2xl text-right overflow-hidden relative z-10 my-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Subtle Gold Accent Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4882A] via-[#F5B05B] to-[#D4882A]" />

        <div 
          className="relative w-24 h-24 rounded-full border-2 border-[#D4AF37] shadow-xl shadow-black/80 mx-auto mb-3 overflow-hidden flex items-center justify-center p-0"
          style={{ background: 'transparent', borderRadius: '50%', padding: 0, overflow: 'hidden' }}
        >
          <img 
            src="/logo.png" 
            alt="شعار محطة الاتحادية" 
            style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover', background: 'transparent', display: 'block' }}
          />
        </div>

        <h2 className="text-lg font-black text-[#F5D799] text-center mb-1">
          {isSignUp ? 'إنشاء حساب جديد في محطة الاتحادية' : 'تسجيل الدخول إلى محطة الاتحادية'}
        </h2>
        <p className="text-xs font-bold text-[#E6C37A] text-center mb-4 tracking-wide">
          السفر ونقل البضائع والكوليات
        </p>

        {error && (
          <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-semibold mb-4">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          {isSignUp && (
            <div>
              <label className="block text-[#E6C37A] font-bold mb-1">الاسم الكامل *</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="مثال: سيدي محمد أو عبد الله"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white placeholder-[#A68966] focus:outline-none pl-9"
                  required
                />
                <User className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[#E6C37A] font-bold mb-1">رقم الهاتف *</label>
            <div className="relative">
              <input
                type="tel"
                placeholder="0600000000 أو 22200000000"
                value={phone}
                onChange={e => handlePhoneChange(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white placeholder-[#A68966] focus:outline-none pl-9 font-mono"
                required
              />
              <Phone className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* WhatsApp Number (Sign-up only) */}
          {isSignUp && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[#E6C37A] font-bold">رقم الواتساب *</label>
                <button
                  type="button"
                  onClick={handleToggleSameAsPhone}
                  className="text-[10px] text-[#F5D799] font-semibold flex items-center gap-1"
                >
                  <input
                    type="checkbox"
                    checked={sameAsPhone}
                    onChange={handleToggleSameAsPhone}
                    className="rounded accent-[#D4AF37] cursor-pointer"
                  />
                  <span>نفس رقم الهاتف</span>
                </button>
              </div>

              {!sameAsPhone ? (
                <div className="relative">
                  <input
                    type="tel"
                    placeholder="رقم الواتساب الخاص بك"
                    value={whatsapp}
                    onChange={e => setWhatsapp(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white placeholder-[#A68966] focus:outline-none pl-9 font-mono"
                    required
                  />
                  <MessageCircle className="w-4 h-4 text-[#F3A952] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              ) : (
                <div className="px-3 py-2 rounded-xl bg-[#120a00] border border-[#D4AF37]/30 text-[11px] text-[#C8B08A] flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#F3A952] shrink-0" />
                  <span>سيتم اعتماد رقم الهاتف للتواصل عبر الواتساب</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-[#E6C37A] font-bold mb-1">كلمة المرور *</label>
            <div className="relative">
              <input
                type="password"
                placeholder="6 أحرف أو أرقام على الأقل"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white placeholder-[#A68966] focus:outline-none pl-9 font-mono"
                required
              />
              <Lock className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
            {!isSignUp && (
              <span className="text-[10px] text-[#C8B08A] block mt-1">
                تسجيل الدخول برقم الهاتف وكلمة المرور مباشرة دون الحاجة لرسائل SMS
              </span>
            )}
          </div>

          {isSignUp && (
            <div className="pt-1">
              <label className="block text-[#E6C37A] font-bold mb-1.5">نوع الحساب *</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsOwnerRole(true)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition ${
                    isOwnerRole
                      ? 'bg-gradient-to-r from-[#F5B05B] to-[#D4882A] border-[#F8C885] text-[#1a0f00] font-black shadow-sm'
                      : 'bg-[#120a00] border-[#D4AF37]/35 text-[#C8B08A]'
                  }`}
                >
                  👑 مالك المحطة (مدير)
                </button>
                <button
                  type="button"
                  onClick={() => setIsOwnerRole(false)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition ${
                    !isOwnerRole
                      ? 'bg-gradient-to-r from-[#F5B05B] to-[#D4882A] border-[#F8C885] text-[#1a0f00] font-black shadow-sm'
                      : 'bg-[#120a00] border-[#D4AF37]/35 text-[#C8B08A]'
                  }`}
                >
                  💼 موظف محطة
                </button>
              </div>

              {!isOwnerRole && (
                <div className="mt-2.5">
                  <label className="block text-[#C8B08A] font-medium mb-1">رمز دعوة مساحة العمل (من المدير)</label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="أدخل رمز الدعوة هنا"
                      value={teamInviteCode}
                      onChange={e => setTeamInviteCode(e.target.value.toUpperCase())}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest pl-9"
                      required
                    />
                    <KeyRound className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                  <span className="text-[10px] text-[#E6C37A] block mt-1">
                    * سيتم إرسال طلب انضمام إلى مدير مساحة العمل للموافقة عليه
                  </span>
                </div>
              )}
            </div>
          )}

          {!isSignUp && (
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs text-[#C8B08A] hover:text-[#F5D799] transition"
              >
                نسيت كلمة المرور أو رمز الدخول؟
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-3 py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] hover:brightness-110 text-[#1a0f00] font-black text-sm shadow-lg shadow-[#E5953E]/25 border border-[#F8C885] transition active:scale-95 disabled:opacity-50"
          >
            {isLoading 
              ? 'جاري التحقق...' 
              : isSignUp 
              ? (isOwnerRole ? 'إنشاء مساحة العمل وبدء الإدارة' : 'إرسال طلب الانضمام للعامل') 
              : 'تسجيل الدخول'}
          </button>
        </form>

        {/* Toggle Sign in / Sign up */}
        <div className="text-center mt-4 pt-3 border-t border-[#D4AF37]/25 space-y-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="w-full py-2.5 px-3 rounded-xl bg-[#120a00] border border-[#D4AF37]/50 text-[#F5D799] hover:bg-[#2a1800] text-xs font-black transition cursor-pointer"
          >
            {isSignUp ? 'لديك حساب بالفعل؟ تسجيل الدخول' : 'إنشاء حساب جديد'}
          </button>
          {onOpenPublicTracking && (
            <button
              type="button"
              onClick={onOpenPublicTracking}
              className="w-full py-2.5 px-3 rounded-xl bg-[#120a00] border border-[#D4AF37]/35 text-[#E6C37A] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#2a1800] transition"
            >
              <Package className="w-4 h-4 text-[#F3A952]" />
              <span>تتبع شحنة للزبون بدون تسجيل الدخول</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowLegalTerms(true)}
            className="text-[11px] text-[#C8B08A] hover:text-[#F5D799] underline transition"
          >
            الشروط والأحكام وسياسة الخصوصية
          </button>
        </div>

        {/* Forgot Password Request Modal */}
        <ForgotPasswordModal
          isOpen={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
        />

        {/* Legal Terms & Privacy Modal */}
        <LegalTermsModal
          isOpen={showLegalTerms}
          onClose={() => setShowLegalTerms(false)}
        />

      </div>
    </div>
  );
};
