import {
  OTP_TTL_MS,
  OTP_WINDOW_MS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_COOLDOWN_MS,
  generateSixDigitOtp,
  hashOtpCode,
  verifyOtpHash,
  sendVerificationOtpEmail,
} from '../src/lib/otpMailer';

interface RegistrationRecord {
  email: string;
  otpHash: string;
  expiresAtMs: number;
  attempts: number;
  sendCount: number;
  windowStartMs: number;
  lastSentMs: number;
}

const emailCache = new Map<string, RegistrationRecord>();

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed. Use POST.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const rawEmail = String(body?.email || body?.userEmail || '').trim().toLowerCase();
    const otpCodeInput = String(body?.otpCode || '').trim().replace(/\s+/g, '');
    const nowMs = Date.now();

    // Verification Mode (if otpCode passed)
    if (otpCodeInput) {
      if (!rawEmail || !/^\d{6}$/.test(otpCodeInput)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً' });
      }
      const cached = emailCache.get(rawEmail);
      if (!cached) {
        return res.status(400).json({ success: false, error: 'لم يتم العثور على رمز تحقق نشط. اطلب رمزاً جديداً.' });
      }
      if (nowMs > cached.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية رمز التحقق (10 دقائق). اطلب رمزاً جديداً.',
        });
      }
      if (cached.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          error: 'تم تجاوز الحد الأقصى للمحاولات (5 محاولات). اطلب رمزاً جديداً.',
        });
      }
      if (!verifyOtpHash(otpCodeInput, cached.otpHash, rawEmail)) {
        cached.attempts += 1;
        emailCache.set(rawEmail, cached);
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - cached.attempts);
        return res.status(400).json({
          success: false,
          remainingAttempts,
          error:
            remainingAttempts > 0
              ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remainingAttempts}`
              : 'تم استنفاد جميع المحاولات (5 محاولات). اطلب رمزاً جديداً.',
        });
      }
      return res.status(200).json({ success: true, verified: true, email: rawEmail });
    }

    // Send OTP Mode
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
    }

    const existing = emailCache.get(rawEmail);
    if (existing && existing.lastSentMs && nowMs - existing.lastSentMs < OTP_COOLDOWN_MS) {
      const waitSec = Math.ceil((OTP_COOLDOWN_MS - (nowMs - existing.lastSentMs)) / 1000);
      return res.status(429).json({
        success: false,
        rateLimited: true,
        cooldownSeconds: waitSec,
        error: `يرجى الانتظار ${waitSec} ثانية قبل طلب رمز جديد.`,
      });
    }

    const windowExpired = !existing?.windowStartMs || nowMs - existing.windowStartMs >= OTP_WINDOW_MS;
    const sendCount = windowExpired ? 0 : existing?.sendCount || 0;
    if (sendCount >= OTP_MAX_SENDS_PER_WINDOW) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((OTP_WINDOW_MS - (nowMs - (existing?.windowStartMs || nowMs))) / 1000)
      );
      return res.status(429).json({
        success: false,
        rateLimited: true,
        retryAfterSeconds: retryAfterSec,
        error: `تم تجاوز الحد المسموح لإرسال الرمز (3 مرات كل 10 دقائق). يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة.`,
      });
    }

    const otpCode = generateSixDigitOtp();
    const otpHash = hashOtpCode(otpCode, rawEmail);
    const expiresAtMs = nowMs + OTP_TTL_MS;

    const delivery = await sendVerificationOtpEmail(rawEmail, otpCode);
    if (!delivery.delivered) {
      return res.status(500).json({
        success: false,
        deliveredViaGmail: false,
        error: delivery.error || 'تعذر إرسال رمز التحقق عبر خدمة البريد الإلكتروني',
      });
    }

    emailCache.set(rawEmail, {
      email: rawEmail,
      otpHash,
      expiresAtMs,
      attempts: 0,
      sendCount: sendCount + 1,
      windowStartMs: windowExpired ? nowMs : existing?.windowStartMs || nowMs,
      lastSentMs: nowMs,
    });

    return res.status(200).json({
      success: true,
      email: rawEmail,
      expiresAtMs,
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
      cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
      remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - (sendCount + 1)),
      deliveredViaGmail: true,
      messageId: delivery.messageId || null,
    });
  } catch (err: any) {
    console.error('[API /register Error]:', { message: err?.message });
    return res.status(500).json({
      success: false,
      error: err?.message || 'حدث خطأ في الخادم أثناء معالجة الطلب',
    });
  }
}
