import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { 
  ShieldCheck, 
  Phone, 
  Lock, 
  User, 
  Crown, 
  LogIn,
  KeyRound,
  CheckCircle2,
  Package,
  Mail,
  ArrowRight,
  Clock,
  RefreshCw,
  Sparkles
} from 'lucide-react';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { LegalTermsModal } from './LegalTermsModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onOpenPublicTracking?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onOpenPublicTracking }) => {
  const { registerUser, loginWithCredentials, sendRegistrationEmailOtp, verifyRegistrationEmailOtp } = useApp();
  const [isSignUp, setIsSignUp] = useState(false); // Default to Login directly
  const [signUpStep, setSignUpStep] = useState<'form' | 'verify_email'>('form');
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isOwnerRole, setIsOwnerRole] = useState(true);
  const [teamInviteCode, setTeamInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 6-digit OTP verification state for mandatory registration Gmail
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [otpExpiresAtMs, setOtpExpiresAtMs] = useState<number>(0);
  const [remainingTtlSeconds, setRemainingTtlSeconds] = useState<number>(300);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [previewCode, setPreviewCode] = useState<string | undefined>(undefined);
  const [deliveredViaGmail, setDeliveredViaGmail] = useState<boolean>(false);

  // 1-second interval ticker for 5-minute countdown and resend cooldown
  useEffect(() => {
    if (!isOpen || signUpStep !== 'verify_email') return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (otpExpiresAtMs > 0) {
        const diff = Math.max(0, Math.ceil((otpExpiresAtMs - now) / 1000));
        setRemainingTtlSeconds(diff);
      }
      setCooldownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, signUpStep, otpExpiresAtMs]);

  if (!isOpen) return null;

  const formatCountdown = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handlePhoneChange = (val: string) => {
    setPhone(val);
  };

  // Step 1: Submit form or proceed to Email OTP verification
  const handleInitiateSignUp = async (e: React.FormEvent) => {
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

    if (!name || name.trim().length < 2) {
      setError('يرجى إدخال اسمك الكامل');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('بريد Gmail إجباري للتسجيل. يرجى إدخال عنوان بريد إلكتروني صحيح.');
      return;
    }

    if (!cleanEmail.endsWith('@gmail.com') && !cleanEmail.includes('@')) {
      setError('يرجى إدخال عنوان بريد Gmail صحيح ينتهي بـ @gmail.com');
      return;
    }

    setIsLoading(true);

    try {
      // Send 6-digit OTP code to user's Gmail using Nodemailer & Gmail App Password
      const otpRes = await sendRegistrationEmailOtp(cleanEmail, name.trim());
      setIsLoading(false);

      if (!otpRes.success) {
        setError(otpRes.error || 'تعذر إرسال كود التحقق إلى بريدك الإلكتروني');
        if (otpRes.cooldownSeconds) setCooldownSeconds(otpRes.cooldownSeconds);
        return;
      }

      const expMs = otpRes.expiresAtMs || Date.now() + 10 * 60 * 1000;
      setOtpExpiresAtMs(expMs);
      setRemainingTtlSeconds(Math.max(0, Math.ceil((expMs - Date.now()) / 1000)));
      setCooldownSeconds(otpRes.cooldownSeconds || 60);
      setPreviewCode(otpRes.previewCode);
      setDeliveredViaGmail(Boolean(otpRes.deliveredViaGmail));
      setOtpDigits(['', '', '', '', '', '']);
      setSignUpStep('verify_email');

      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'حدث خطأ أثناء معالجة الطلب');
    }
  };

  // Resend Email OTP
  const handleResendEmailOtp = async () => {
    if (cooldownSeconds > 0 || isLoading) return;
    setError(null);
    setIsLoading(true);

    try {
      const res = await sendRegistrationEmailOtp(email.trim().toLowerCase(), name.trim());
      setIsLoading(false);
      if (!res.success) {
        setError(res.error || 'تعذر إعادة إرسال الكود');
        if (res.cooldownSeconds) setCooldownSeconds(res.cooldownSeconds);
        return;
      }

      const expMs = res.expiresAtMs || Date.now() + 10 * 60 * 1000;
      setOtpExpiresAtMs(expMs);
      setRemainingTtlSeconds(Math.max(0, Math.ceil((expMs - Date.now()) / 1000)));
      setCooldownSeconds(res.cooldownSeconds || 60);
      setPreviewCode(res.previewCode);
      setDeliveredViaGmail(Boolean(res.deliveredViaGmail));
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 80);
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'حدث خطأ أثناء إعادة إرسال الكود');
    }
  };

  // Step 2: Verify 6-digit OTP from Gmail and finalize Registration
  const handleVerifyOtpAndRegister = async (codeToVerify?: string) => {
    const code = (codeToVerify || otpDigits.join('')).trim();
    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      setError('يرجى إدخال كود التحقق المكون من 6 أرقام كاملاً');
      return;
    }

    if (remainingTtlSeconds <= 0) {
      setError('انتهت صلاحية كود التحقق (مرت 5 دقائق). يرجى طلب كود جديد.');
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      const verifyRes = await verifyRegistrationEmailOtp(cleanEmail, code);
      if (!verifyRes.success) {
        setIsLoading(false);
        setError(verifyRes.error || 'كود التحقق غير صحيح أو منتهي الصلاحية');
        return;
      }

      // Code Verified successfully! Create the registered user account
      const cleanPhone = phone.trim();
      const res = await registerUser({
        name: name.trim(),
        phone: cleanPhone,
        whatsapp_number: cleanPhone,
        email: cleanEmail,
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
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'حدث خطأ أثناء تأكيد الحساب');
    }
  };

  // Handle typing inside 6 OTP boxes
  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/[^0-9]/g, '');
    if (!clean) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      return;
    }

    // Support paste of 6 digits
    if (clean.length > 1) {
      const chars = clean.slice(0, 6).split('');
      const next = [...otpDigits];
      chars.forEach((c, i) => {
        if (index + i < 6) next[index + i] = c;
      });
      setOtpDigits(next);
      const focusTarget = Math.min(5, index + chars.length);
      otpInputRefs.current[focusTarget]?.focus();
      if (next.join('').length === 6) {
        handleVerifyOtpAndRegister(next.join(''));
      }
      return;
    }

    const next = [...otpDigits];
    next[index] = clean;
    setOtpDigits(next);
    setError(null);

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (next.join('').length === 6) {
      handleVerifyOtpAndRegister(next.join(''));
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  // Standard Login submit
  const handleLoginSubmit = async (e: React.FormEvent) => {
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

    setIsLoading(true);
    try {
      const res = await loginWithCredentials(cleanPhone, password.trim());
      setIsLoading(false);
      if (res.success && onClose) {
        onClose();
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || 'حدث خطأ أثناء معالجة الطلب');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black animate-fadeIn overflow-y-auto" dir="rtl">
      <div 
        className="w-full max-w-[390px] rounded-[24px] bg-[#1a0f00]/95 border border-[#D4AF37]/65 p-5 shadow-2xl text-right overflow-hidden relative z-10 my-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Subtle Gold Accent Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4882A] via-[#F5B05B] to-[#D4882A]" />

        <div 
          className="relative w-20 h-20 rounded-full border-2 border-[#D4AF37] shadow-xl shadow-black/80 mx-auto mb-3 overflow-hidden flex items-center justify-center p-0"
          style={{ background: 'transparent', borderRadius: '50%', padding: 0, overflow: 'hidden' }}
        >
          <img 
            src="/assets/aistudio/image_9c11f636.png" 
            alt="Sahara📦 Express" 
            style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover', background: 'transparent', display: 'block' }}
          />
        </div>

        <h2 className="text-base sm:text-lg font-black text-[#F5D799] text-center mb-1">
          {isSignUp 
            ? (signUpStep === 'verify_email' ? 'تأكيد بريد Gmail بكود 6 أرقام' : 'إنشاء حساب جديد في Sahara📦 Express') 
            : 'تسجيل الدخول إلى Sahara📦 Express'}
        </h2>
        <p className="text-[11px] font-bold text-[#E6C37A] text-center mb-4 tracking-wide">
          للسفر ونقل البضائع والكوليات
        </p>

        {error && (
          <div className="p-3 bg-rose-950/70 border border-rose-500/40 rounded-xl text-xs text-rose-300 font-semibold mb-4 leading-relaxed">
            {error}
          </div>
        )}

        {/* ================================================================ */}
        {/* SIGN UP STEP 2: VERIFY GMAIL OTP (6 Digits + 5-Min Expiry)       */}
        {/* ================================================================ */}
        {isSignUp && signUpStep === 'verify_email' ? (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-2xl bg-[#120a00] border border-[#D4AF37]/40 space-y-2 text-center">
              <div className="w-9 h-9 mx-auto rounded-full bg-[#F5B05B]/20 border border-[#D4AF37]/50 text-[#F5D799] flex items-center justify-center">
                <Mail className="w-4 h-4" />
              </div>
              <p className="text-xs text-[#F5D799] font-bold">
                تم إرسال كود التحقق المكون من 6 أرقام إلى بريدك:
              </p>
              <p className="text-sm font-mono font-bold text-white bg-black/60 py-1 px-2.5 rounded-xl border border-[#D4AF37]/30 inline-block" dir="ltr">
                {email}
              </p>
              <p className="text-[11px] text-[#C8B08A]">
                تم إرسال الرمز من <strong>Sahara Express</strong> (<span className="font-mono">noreply@sahara-express.com</span>) عبر خدمة <strong>Resend</strong>. الرمز صالح لمدة 10 دقائق.
              </p>
            </div>

            {/* 6-Digit OTP Box Inputs */}
            <div>
              <label className="block text-[#E6C37A] font-bold text-center mb-2">
                أدخل كود التحقق (6 أرقام) *
              </label>
              <div className="flex justify-center items-center gap-2" dir="ltr">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => { otpInputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(idx, e.target.value)}
                    onKeyDown={e => handleDigitKeyDown(idx, e)}
                    className="w-11 h-12 rounded-xl bg-[#120a00] border-2 border-[#D4AF37]/50 focus:border-[#F5B05B] text-center text-xl font-bold font-mono text-white focus:outline-none transition shadow-inner shadow-black/80"
                  />
                ))}
              </div>
            </div>

            {/* Expiry Countdown & Resend */}
            <div className="flex items-center justify-between text-[11px] px-1 font-semibold">
              <div className="flex items-center gap-1.5 text-[#E6C37A]">
                <Clock className="w-3.5 h-3.5 text-[#F5B05B]" />
                <span>صلاحية الكود:</span>
                <span className={`font-mono font-bold ${remainingTtlSeconds < 60 ? 'text-rose-400 animate-pulse' : 'text-white'}`}>
                  {formatCountdown(remainingTtlSeconds)}
                </span>
              </div>

              <button
                type="button"
                onClick={handleResendEmailOtp}
                disabled={cooldownSeconds > 0 || isLoading}
                className="text-[#F5D799] hover:text-white font-bold transition flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>
                  {cooldownSeconds > 0 ? `إعادة الإرسال بعد (${cooldownSeconds}s)` : 'إعادة إرسال الكود'}
                </span>
              </button>
            </div>

            {/* Preview helper pill for testing if Nodemailer is running in simulated environment */}
            {previewCode && (
              <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-[11px] text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 font-bold">
                  <Sparkles className="w-3.5 h-3.5 text-[#F5B05B]" />
                  <span>كود التجربة السريع (للاختبار الفوري):</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const chars = previewCode.slice(0, 6).split('');
                    setOtpDigits(chars);
                    handleVerifyOtpAndRegister(previewCode);
                  }}
                  className="font-mono text-sm font-black text-[#F5B05B] tracking-widest underline cursor-pointer bg-black/40 px-3 py-1 rounded-lg border border-[#F5B05B]/30"
                >
                  {previewCode} (اضغط للتعبئة التلقائية)
                </button>
              </div>
            )}

            {/* Confirm & Complete Registration Button */}
            <button
              type="button"
              onClick={() => handleVerifyOtpAndRegister()}
              disabled={isLoading || otpDigits.join('').length !== 6}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] hover:brightness-110 text-[#1a0f00] font-black text-sm shadow-lg shadow-[#E5953E]/25 border border-[#F8C885] transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isLoading ? 'جاري التحقق وإنشاء الحساب...' : 'تأكيد البريد وإتمام التسجيل'}
            </button>

            {/* Back button to edit fields */}
            <button
              type="button"
              onClick={() => {
                setSignUpStep('form');
                setError(null);
              }}
              className="w-full py-2 text-center text-[11px] text-[#C8B08A] hover:text-[#F5D799] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>تعديل بريد Gmail أو معلومات الحساب</span>
            </button>
          </div>
        ) : (
          /* ================================================================ */
          /* SIGN IN / SIGN UP MAIN FORM                                      */
          /* ================================================================ */
          <form onSubmit={isSignUp ? handleInitiateSignUp : handleLoginSubmit} className="space-y-3 text-xs">
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

            {/* MANDATORY GMAIL FIELD FOR SIGN-UP */}
            {isSignUp && (
              <div>
                <label className="block text-[#E6C37A] font-bold mb-1">
                  بريد Gmail الخاص بك (إجباري) *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    dir="ltr"
                    placeholder="example@gmail.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3 py-2.5 text-white placeholder-[#A68966] focus:outline-none pl-9 font-mono text-left"
                    required
                  />
                  <Mail className="w-4 h-4 text-[#F5B05B] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
                <span className="text-[10px] text-[#C8B08A] block mt-1">
                  * سنرسل رمزاً من 6 أرقام عبر Resend للتأكد من ملكيتك للبريد قبل تفعيل الحساب
                </span>
              </div>
            )}

            <div>
              <label className="block text-[#E6C37A] font-bold mb-1">
                {isSignUp ? 'رقم الهاتف *' : 'رقم الهاتف أو المعرّف *'}
              </label>
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
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
                    className={`py-2.5 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
                  className="text-xs text-[#F5D799] hover:text-white font-bold underline underline-offset-4 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-[#F5B05B]" />
                  <span>نسيت كلمة المرور؟ (استعادة فورية بكود 6 أرقام إلى بريدك Gmail)</span>
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] hover:brightness-110 text-[#1a0f00] font-black text-sm shadow-lg shadow-[#E5953E]/25 border border-[#F8C885] transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isLoading 
                ? 'جاري المعالجة...' 
                : isSignUp 
                ? 'متابعة وإرسال كود التحقق لبريد Gmail ←' 
                : 'تسجيل الدخول'}
            </button>
          </form>
        )}

        {/* Toggle Sign in / Sign up */}
        <div className="text-center mt-4 pt-3 border-t border-[#D4AF37]/25 space-y-2">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setSignUpStep('form');
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
              className="w-full py-2.5 px-3 rounded-xl bg-[#120a00] border border-[#D4AF37]/35 text-[#E6C37A] text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-[#2a1800] transition cursor-pointer"
            >
              <Package className="w-4 h-4 text-[#F3A952]" />
              <span>تتبع شحنة للزبون بدون تسجيل الدخول</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowLegalTerms(true)}
            className="text-[11px] text-[#C8B08A] hover:text-[#F5D799] underline transition cursor-pointer"
          >
            الشروط والأحكام وسياسة الخصوصية
          </button>
        </div>

        {/* Forgot Password OTP Recovery Modal */}
        <ForgotPasswordModal
          isOpen={showForgotPassword}
          onClose={() => setShowForgotPassword(false)}
          initialPhone={phone}
          onPasswordResetSuccess={(resetPhone, newPwd) => {
            setPhone(resetPhone);
            setPassword(newPwd);
            setShowForgotPassword(false);
          }}
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
