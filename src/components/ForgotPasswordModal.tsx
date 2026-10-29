import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { PasswordResetRequest } from '../types/database';
import {
  KeyRound,
  X,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Clock,
  Lock,
  Eye,
  EyeOff,
  RefreshCw,
  ArrowRight,
  LogIn,
  Sparkles,
} from 'lucide-react';

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdminView?: boolean;
  initialPhone?: string;
  onPasswordResetSuccess?: (phone: string, newPassword: string) => void;
}

type RecoveryStep = 'whatsapp_entry' | 'verify_and_reset' | 'reset_complete';

export const ForgotPasswordModal: React.FC<ForgotPasswordModalProps> = ({
  isOpen,
  onClose,
  isAdminView = false,
  initialPhone = '',
  onPasswordResetSuccess,
}) => {
  const {
    userRole,
    currentWorkspace,
    passwordResetRequests,
    resolvePasswordResetRequest,
    requestWhatsAppOtp,
    verifyWhatsAppOtpCode,
    resetPasswordWithWhatsAppOtp,
    loginWithCredentials,
    showToast,
  } = useApp();

  // Multi-user OTP flow state
  const [step, setStep] = useState<RecoveryStep>('whatsapp_entry');
  const [whatsappInput, setWhatsappInput] = useState(initialPhone);
  const [targetPhone, setTargetPhone] = useState('');
  const [targetWhatsapp, setTargetWhatsapp] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [matchedUserName, setMatchedUserName] = useState('');
  const [matchedUserRoleLabel, setMatchedUserRoleLabel] = useState('');

  // 6-digit OTP state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [isOtpVerified, setIsOtpVerified] = useState(false);
  const [remainingVerifyAttempts, setRemainingVerifyAttempts] = useState<number>(5);

  // 5-minute TTL & Rate Limit timers
  const [expiresAtMs, setExpiresAtMs] = useState<number>(0);
  const [remainingTtlSeconds, setRemainingTtlSeconds] = useState<number>(0);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [remainingSends, setRemainingSends] = useState<number>(3);
  const [maxSendsPerWindow, setMaxSendsPerWindow] = useState<number>(3);

  // Delivery status & preview helper (Nodemailer Gmail)
  const [deliveredViaGmail, setDeliveredViaGmail] = useState<boolean>(false);
  const [previewOtpCode, setPreviewOtpCode] = useState<string | undefined>(undefined);

  // New Password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // UI feedback state
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Admin panel state
  const [tempPasswordInputs, setTempPasswordInputs] = useState<Record<string, string>>({});

  // Sync initialPhone when modal opens
  useEffect(() => {
    if (isOpen && initialPhone && !whatsappInput) {
      setWhatsappInput(initialPhone);
    }
  }, [isOpen, initialPhone]);

  // Live 1-second ticker for 5-minute OTP expiration countdown & Rate-Limit cooldown
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      const now = Date.now();
      if (expiresAtMs > 0) {
        const diffSec = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
        setRemainingTtlSeconds(diffSec);
      }
      setCooldownSeconds(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, expiresAtMs]);

  if (!isOpen) return null;

  const formatCountdown = (totalSec: number): string => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const otpCodeJoined = otpDigits.join('');

  // Step 1: Request 6-digit OTP (dispatches to registered Gmail via Nodemailer and WhatsApp)
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanInput = whatsappInput.trim();
    if (!cleanInput || (cleanInput.length < 5 && !cleanInput.includes('@'))) {
      setErrorMsg('يرجى إدخال بريدك Gmail المسجل أو رقم الهاتف / الواتساب الصحيح');
      return;
    }

    setIsLoading(true);
    try {
      const res = await requestWhatsAppOtp(cleanInput);
      setIsLoading(false);

      if (!res.success) {
        if (res.cooldownSeconds && res.cooldownSeconds > 0) {
          setCooldownSeconds(res.cooldownSeconds);
        } else if (res.retryAfterSeconds && res.retryAfterSeconds > 0) {
          setCooldownSeconds(res.retryAfterSeconds);
        }
        if (typeof res.remainingSends === 'number') {
          setRemainingSends(res.remainingSends);
        }
        setErrorMsg(res.error || 'تعذر إرسال كود التحقق');
        return;
      }

      const expMs = res.expiresAtMs || Date.now() + 5 * 60 * 1000;
      setExpiresAtMs(expMs);
      setRemainingTtlSeconds(Math.max(0, Math.ceil((expMs - Date.now()) / 1000)));
      setCooldownSeconds(res.cooldownSeconds || 60);
      setRemainingSends(res.remainingSends ?? 2);
      setMaxSendsPerWindow(res.maxSendsPerWindow || 3);
      setTargetPhone(res.targetPhone || cleanInput);
      setTargetWhatsapp(res.targetWhatsapp || cleanInput);
      setTargetEmail(res.targetEmail || (cleanInput.includes('@') ? cleanInput : ''));
      setMatchedUserName(res.userName || 'مستخدم Sahara📦 Express');
      setMatchedUserRoleLabel(res.userRoleLabel || 'حساب مستخدم');
      setDeliveredViaGmail(Boolean(res.deliveredViaGmail));
      setPreviewOtpCode(res.otpCodeForPreview);
      setOtpDigits(['', '', '', '', '', '']);
      setIsOtpVerified(false);
      setRemainingVerifyAttempts(5);
      setStep('verify_and_reset');

      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 120);
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err?.message || 'حدث خطأ أثناء طلب كود التحقق');
    }
  };

  // Handle typing in the 6 OTP boxes
  const handleOtpDigitChange = (index: number, value: string) => {
    const cleanVal = value.replace(/[^0-9]/g, '');
    if (!cleanVal) {
      const next = [...otpDigits];
      next[index] = '';
      setOtpDigits(next);
      setIsOtpVerified(false);
      return;
    }

    // Support pasting or typing multiple digits at once
    if (cleanVal.length > 1) {
      const chars = cleanVal.slice(0, 6).split('');
      const next = [...otpDigits];
      chars.forEach((ch, idx) => {
        if (index + idx < 6) {
          next[index + idx] = ch;
        }
      });
      setOtpDigits(next);
      const focusIdx = Math.min(5, index + chars.length);
      otpInputRefs.current[focusIdx]?.focus();
      if (next.join('').length === 6) {
        triggerQuickVerify(next.join(''));
      }
      return;
    }

    const next = [...otpDigits];
    next[index] = cleanVal;
    setOtpDigits(next);
    setErrorMsg(null);

    if (index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    const fullCode = next.join('');
    if (fullCode.length === 6) {
      triggerQuickVerify(fullCode);
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    pasted.split('').forEach((ch, i) => {
      next[i] = ch;
    });
    setOtpDigits(next);
    const focusIdx = Math.min(5, pasted.length - 1);
    otpInputRefs.current[focusIdx]?.focus();
    if (pasted.length === 6) {
      triggerQuickVerify(pasted);
    }
  };

  const triggerQuickVerify = async (sixDigitCode: string) => {
    if (sixDigitCode.length !== 6) return;
    setIsVerifyingCode(true);
    setErrorMsg(null);
    const res = await verifyWhatsAppOtpCode(targetPhone || whatsappInput, sixDigitCode);
    setIsVerifyingCode(false);
    if (res.success) {
      setIsOtpVerified(true);
      setInfoMsg('تم التحقق من الكود بنجاح! أدخل كلمة المرور الجديدة بالأسفل.');
    } else {
      setIsOtpVerified(false);
      if (typeof res.remainingAttempts === 'number') {
        setRemainingVerifyAttempts(res.remainingAttempts);
      }
      setErrorMsg(res.error || 'كود التحقق غير صحيح');
    }
  };

  // Step 2: Submit OTP + New Password
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (otpCodeJoined.length !== 6) {
      setErrorMsg('يرجى إدخال كود التحقق المكون من 6 أرقام كاملاً');
      return;
    }

    if (remainingTtlSeconds <= 0) {
      setErrorMsg('انتهت صلاحية كود التحقق (5 دقائق). يرجى الضغط على إعادة إرسال كود جديد.');
      return;
    }

    const cleanPwd = newPassword.trim();
    if (cleanPwd.length < 8) {
      setErrorMsg('كلمة المرور الجديدة يجب أن تتكون من 8 أحرف أو أرقام على الأقل');
      return;
    }

    if (cleanPwd !== confirmPassword.trim()) {
      setErrorMsg('كلمة المرور وتأكيد كلمة المرور غير متطابقين');
      return;
    }

    setIsLoading(true);
    try {
      const res = await resetPasswordWithWhatsAppOtp(
        targetPhone || whatsappInput,
        otpCodeJoined,
        cleanPwd
      );
      setIsLoading(false);

      if (!res.success) {
        setErrorMsg(res.error || 'تعذر تغيير كلمة المرور');
        return;
      }

      if (res.targetPhone) {
        setTargetPhone(res.targetPhone);
      }
      setStep('reset_complete');
    } catch (err: any) {
      setIsLoading(false);
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ كلمة المرور الجديدة');
    }
  };

  const handleDirectLoginAfterReset = async () => {
    setIsLoading(true);
    const phoneToLogin = targetPhone || whatsappInput.trim();
    const res = await loginWithCredentials(phoneToLogin, newPassword.trim());
    setIsLoading(false);
    if (res.success) {
      if (onPasswordResetSuccess) {
        onPasswordResetSuccess(phoneToLogin, newPassword.trim());
      }
      onClose();
    } else {
      setErrorMsg(res.error || 'يرجى تسجيل الدخول من الشاشة الرئيسية');
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
    return r.status === 'pending' && r.target_role === 'worker' && r.workspace_id === currentWorkspace?.id;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xs" onClick={onClose} />

      <div
        className="w-full max-w-[400px] rounded-[24px] bg-[#1a0f00]/95 border border-[#D4AF37]/65 p-5 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-4"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Top Gold Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4882A] via-[#F5B05B] to-[#D4882A]" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4AF37]/25 pb-3 pt-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F5B05B]/25 to-[#D4882A]/20 border border-[#D4AF37]/50 text-[#F5D799] flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-[#F5D799]">
                {isAdminView
                  ? 'طلبات استعادة كلمة المرور المعلقة'
                  : step === 'whatsapp_entry'
                  ? 'استعادة كلمة المرور عبر بريد Gmail'
                  : step === 'verify_and_reset'
                  ? 'إدخال كود التحقق وتغيير كلمة السر'
                  : 'تم تغيير كلمة المرور بنجاح'}
              </h2>
              <p className="text-[11px] text-[#C8B08A] font-semibold">
                {isAdminView
                  ? 'لوحة معالجة وتعيين كلمات المرور المؤقتة'
                  : 'نظام التحقق الآمن بكود 6 أرقام عبر بريد Gmail'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-[#120a00] border border-[#D4AF37]/30 text-[#C8B08A] hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ================================================================ */}
        {/* ADMIN VIEW (When opened by Manager from Settings)                */}
        {/* ================================================================ */}
        {isAdminView ? (
          <div className="space-y-3 text-xs">
            {pendingRequests.length === 0 ? (
              <div className="p-6 text-center text-[#C8B08A] bg-[#120a00] rounded-2xl border border-[#D4AF37]/25">
                لا توجد طلبات استعادة كلمة مرور معلقة حالياً.
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((req: PasswordResetRequest) => (
                  <div
                    key={req.id}
                    className="p-3.5 bg-[#120a00] rounded-2xl border border-[#D4AF37]/40 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#F5D799] text-sm">{req.user_name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-[#D4AF37]/20 text-[#F5D799] font-bold">
                        {req.target_role === 'worker' ? 'موظف محطة' : 'مدير مساحة عمل'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[#C8B08A] font-mono">
                      <span>الهاتف: {req.user_phone}</span>
                      <span>الواتساب: {req.user_whatsapp}</span>
                    </div>

                    <div className="pt-2 border-t border-[#D4AF37]/20 flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="كلمة المرور المؤقتة"
                        value={tempPasswordInputs[req.id] || ''}
                        onChange={e =>
                          setTempPasswordInputs({ ...tempPasswordInputs, [req.id]: e.target.value })
                        }
                        className="flex-1 bg-[#1a0f00] border border-[#D4AF37]/40 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#D4AF37]"
                      />
                      <button
                        onClick={() => handleResolve(req.id, tempPasswordInputs[req.id])}
                        className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-xs transition"
                      >
                        تعيين وإرسال
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : step === 'whatsapp_entry' ? (
          /* ================================================================ */
          /* STEP 1: ENTER REGISTERED GMAIL OR PHONE TO RECEIVE 6-DIGIT OTP   */
          /* ================================================================ */
          <form onSubmit={handleSendOtp} className="space-y-3.5 text-xs">
            <div className="p-3 rounded-2xl bg-[#120a00] border border-[#D4AF37]/35 space-y-2">
              <div className="flex items-center gap-2 text-[#F5D799] font-bold">
                <ShieldCheck className="w-4 h-4 text-[#F5B05B] shrink-0" />
                <span>استعادة آمنة عبر بريد Gmail المسجل بالحساب</span>
              </div>
              <p className="text-[11px] text-[#C8B08A] leading-relaxed">
                أدخل <strong className="text-[#F5D799]">بريد Gmail</strong> الذي أنشأت به حسابك أو رقم الهاتف المسجل. سيقوم النظام بإرسال كود تحقق سري من <strong className="text-[#F5D799]">6 أرقام</strong> مباشرة إلى بريدك الإلكتروني عبر <strong className="text-amber-400">Nodemailer</strong> صالح لمدة <strong className="text-emerald-400">10 دقائق</strong>.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs font-bold flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p>{errorMsg}</p>
                  {cooldownSeconds > 0 && (
                    <p className="mt-1 text-[11px] text-amber-300 font-mono">
                      ⏳ يمكنك المحاولة مجدداً بعد: {formatCountdown(cooldownSeconds)}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[#E6C37A] font-bold">
                  بريد Gmail المسجل أو رقم الهاتف *
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (!whatsappInput.includes('@') && !whatsappInput.startsWith('212') && !whatsappInput.startsWith('+212')) {
                        setWhatsappInput('212' + whatsappInput.replace(/^0+/, ''));
                      }
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#120a00] border border-[#D4AF37]/30 text-[10px] text-[#F5D799] hover:border-[#D4AF37]"
                  >
                    🇲🇦 +212
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!whatsappInput.includes('@') && !whatsappInput.startsWith('222') && !whatsappInput.startsWith('+222')) {
                        setWhatsappInput('222' + whatsappInput.replace(/^0+/, ''));
                      }
                    }}
                    className="px-2 py-0.5 rounded-md bg-[#120a00] border border-[#D4AF37]/30 text-[10px] text-[#F5D799] hover:border-[#D4AF37]"
                  >
                    🇲🇷 +222
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="text"
                  placeholder="user@gmail.com أو 0612345678"
                  required
                  value={whatsappInput}
                  onChange={e => setWhatsappInput(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/50 focus:border-[#F5B05B] rounded-xl px-3.5 py-3 text-white font-mono text-sm pl-10 focus:outline-none"
                  dir="ltr"
                />
                {whatsappInput.includes('@') ? (
                  <Mail className="w-4 h-4 text-[#F5B05B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                ) : (
                  <Phone className="w-4 h-4 text-[#F5B05B] absolute left-3.5 top-1/2 -translate-y-1/2" />
                )}
              </div>
            </div>

            {/* Rate Limit & Security Specs Bar */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-xl bg-[#120a00] border border-[#D4AF37]/25">
                <span className="block text-[10px] text-[#C8B08A]">طول الكود</span>
                <span className="text-xs font-black text-[#F5D799] font-mono">6 أرقام</span>
              </div>
              <div className="p-2 rounded-xl bg-[#120a00] border border-[#D4AF37]/25">
                <span className="block text-[10px] text-[#C8B08A]">وقت الانتهاء</span>
                <span className="text-xs font-black text-emerald-400 font-mono">10 دقائق</span>
              </div>
              <div className="p-2 rounded-xl bg-[#120a00] border border-[#D4AF37]/25">
                <span className="block text-[10px] text-[#C8B08A]">المحرك</span>
                <span className="text-xs font-black text-amber-400 font-mono">Nodemailer</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || cooldownSeconds > 0}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] hover:brightness-110 text-[#1a0f00] font-black text-xs sm:text-sm shadow-lg shadow-[#E5953E]/25 border border-[#F8C885] transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              <span>
                {isLoading
                  ? 'جاري إرسال كود التحقق...'
                  : cooldownSeconds > 0
                  ? `يرجى الانتظار (${formatCountdown(cooldownSeconds)})`
                  : 'إرسال كود التحقق (6 أرقام) إلى بريد Gmail'}
              </span>
            </button>
          </form>
        ) : step === 'verify_and_reset' ? (
          /* ================================================================ */
          /* STEP 2: ENTER 6-DIGIT OTP CODE & CHANGE PASSWORD PAGE            */
          /* ================================================================ */
          <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5 text-xs">
            {/* Back & Account Summary Bar */}
            <div className="flex items-center justify-between bg-[#120a00] border border-[#D4AF37]/35 rounded-xl px-3 py-2">
              <div className="text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-[#F5D799]">{matchedUserName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[#D4AF37]/20 text-[#E6C37A] font-bold">
                    {matchedUserRoleLabel}
                  </span>
                </div>
                <p className="text-[11px] text-[#C8B08A] font-mono" dir="ltr">
                  {targetEmail ? targetEmail : `الهاتف: +${targetPhone}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('whatsapp_entry');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className="text-[11px] text-[#E6C37A] hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg bg-[#1a0f00] border border-[#D4AF37]/30 cursor-pointer"
              >
                <ArrowRight className="w-3 h-3" />
                <span>تعديل المعرّف</span>
              </button>
            </div>

            {/* Target Gmail notice */}
            {targetEmail && (
              <div className="p-3 rounded-2xl bg-[#120a00] border border-[#D4AF37]/40 text-center space-y-1">
                <div className="flex items-center justify-center gap-1.5 text-xs text-[#F5D799] font-bold">
                  <Mail className="w-4 h-4 text-[#F5B05B]" />
                  <span>تم إرسال كود التحقق (6 أرقام) إلى بريدك الإلكتروني Gmail:</span>
                </div>
                <div className="font-mono text-sm text-white font-bold bg-black/60 py-1 px-3 rounded-xl border border-[#D4AF37]/30 inline-block" dir="ltr">
                  {targetEmail}
                </div>
                {deliveredViaGmail ? (
                  <p className="text-[11px] text-emerald-400 font-bold mt-1">
                    ✓ تم إرسال الرسالة بنجاح عبر Nodemailer (تفقد الوارد أو Spam).
                  </p>
                ) : (
                  <p className="text-[11px] text-[#C8B08A] mt-1">
                    تفقد صندوق الوارد أو رسائل الترويج والـ Spam في تطبيق Gmail.
                  </p>
                )}
              </div>
            )}

            {/* Live 5-Minute Expiration Countdown Banner */}
            <div
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border ${
                remainingTtlSeconds > 60
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : remainingTtlSeconds > 0
                  ? 'bg-amber-950/50 border-amber-500/50 text-amber-200'
                  : 'bg-rose-950/70 border-rose-500/50 text-rose-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-bold">
                  {remainingTtlSeconds > 0
                    ? 'صلاحية الكود (10 دقائق):'
                    : 'انتهت صلاحية الكود (مرت 10 دقائق)'}
                </span>
              </div>
              <span className="font-mono text-sm font-black tracking-wider">
                {formatCountdown(remainingTtlSeconds)}
              </span>
            </div>

            {/* Preview helper for testing */}
            {previewOtpCode && (
              <div className="p-3 rounded-xl bg-[#120a00] border border-[#D4AF37]/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#F5D799] flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-[#F5B05B]" />
                    <span>كود التحقق المولد (للاختبار السريع):</span>
                  </span>
                  <span className="font-mono text-sm font-black tracking-widest text-emerald-400 bg-black/60 px-2.5 py-0.5 rounded-lg border border-emerald-500/40">
                    {previewOtpCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const digits = previewOtpCode.slice(0, 6).split('');
                    setOtpDigits(digits);
                    triggerQuickVerify(previewOtpCode);
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-[#D4AF37]/20 hover:bg-[#D4AF37]/30 border border-[#D4AF37]/50 text-[#F5D799] font-bold text-[11px] transition cursor-pointer"
                >
                  تعبئة الكود تلقائياً (6 أرقام)
                </button>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {infoMsg && !errorMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{infoMsg}</span>
              </div>
            )}

            {/* 6-Digit OTP Input Boxes */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[#E6C37A] font-bold">
                  أدخل كود التحقق (6 أرقام) *
                </label>
                <span className="text-[10px] text-[#C8B08A]">
                  المحاولات المتبقية: <strong className="text-[#F5D799] font-mono">{remainingVerifyAttempts}/5</strong>
                </span>
              </div>

              <div className="grid grid-cols-6 gap-2" dir="ltr">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => {
                      otpInputRefs.current[idx] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={digit}
                    onChange={e => handleOtpDigitChange(idx, e.target.value)}
                    onKeyDown={e => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    className={`w-full h-12 rounded-xl text-center font-mono text-lg font-black transition focus:outline-none border ${
                      isOtpVerified
                        ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300'
                        : digit
                        ? 'bg-[#120a00] border-[#F5B05B] text-[#F5D799]'
                        : 'bg-[#120a00] border-[#D4AF37]/40 text-white focus:border-[#F5B05B]'
                    }`}
                  />
                ))}
              </div>

              {/* Rate-Limited Resend Row */}
              <div className="flex items-center justify-between mt-2 text-[11px]">
                <span className="text-[#C8B08A]">
                  حصة الإرسال المتبقية:{' '}
                  <strong className="text-[#F5D799] font-mono">
                    {remainingSends}/{maxSendsPerWindow}
                  </strong>
                </span>

                <button
                  type="button"
                  disabled={cooldownSeconds > 0 || isLoading || remainingSends <= 0}
                  onClick={() => handleSendOtp()}
                  className="text-[#F5B05B] hover:text-[#F5D799] disabled:text-[#C8B08A]/50 font-bold flex items-center gap-1 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingCode ? 'animate-spin' : ''}`} />
                  <span>
                    {cooldownSeconds > 0
                      ? `إعادة الإرسال بعد ${cooldownSeconds} ث`
                      : remainingSends <= 0
                      ? 'تم استنفاد حصة الإرسال (انتظر 15 د)'
                      : 'إعادة إرسال كود جديد'}
                  </span>
                </button>
              </div>
            </div>

            {/* New Password Fields */}
            <div className="pt-2 border-t border-[#D4AF37]/25 space-y-3">
              <div>
                <label className="block text-[#E6C37A] font-bold mb-1">
                  كلمة المرور الجديدة (8 أحرف أو أرقام على الأقل) *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="أدخل كلمة المرور الجديدة"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 focus:border-[#F5B05B] rounded-xl px-3.5 py-2.5 text-white font-mono text-xs pl-10 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#C8B08A] hover:text-[#F5D799]"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[#E6C37A] font-bold mb-1">
                  تأكيد كلمة المرور الجديدة *
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    placeholder="أعد كتابة كلمة المرور الجديدة"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 focus:border-[#F5B05B] rounded-xl px-3.5 py-2.5 text-white font-mono text-xs pl-10 focus:outline-none"
                  />
                  <Lock className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || otpCodeJoined.length !== 6 || remainingTtlSeconds <= 0}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] hover:brightness-110 text-[#1a0f00] font-black text-xs sm:text-sm shadow-lg shadow-[#E5953E]/25 border border-[#F8C885] transition active:scale-95 disabled:opacity-50"
            >
              {isLoading ? 'جاري التحقق وتحديث كلمة المرور...' : 'تأكيد الكود وتغيير كلمة المرور'}
            </button>
          </form>
        ) : (
          /* ================================================================ */
          /* STEP 3: PASSWORD RESET COMPLETE                                  */
          /* ================================================================ */
          <div className="bg-[#120a00] p-5 rounded-2xl border border-emerald-500/40 text-center space-y-3 animate-fadeIn">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-base font-black text-[#F5D799]">
              تم تغيير كلمة المرور الخاصة بك بنجاح!
            </h3>
            <p className="text-xs text-[#C8B08A] leading-relaxed">
              تم التحقق من كود الـ OTP وتحديث كلمة المرور الجديدة لحسابك ({matchedUserName}) في قاعدة البيانات. يمكنك الآن الدخول فوراً.
            </p>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-950/70 border border-rose-500/40 text-rose-200 text-xs">
                {errorMsg}
              </div>
            )}

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleDirectLoginAfterReset}
                disabled={isLoading}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-[#F5B05B] via-[#E5953E] to-[#D4882A] text-[#1a0f00] font-black text-xs sm:text-sm shadow-lg flex items-center justify-center gap-2 transition active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                <span>{isLoading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول الآن بكلمة المرور الجديدة'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/30 text-[#C8B08A] hover:text-white text-xs font-bold transition"
              >
                العودة لشاشة الدخول
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
