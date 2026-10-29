import {
  OTP_TTL_MS,
  OTP_WINDOW_MS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_COOLDOWN_MS,
  generateSixDigitOtp,
  hashOtpCode,
  sendVerificationOtpEmail,
} from '../src/lib/otpMailer.ts';

interface RateEntry {
  otpHash: string;
  expiresAtMs: number;
  sendCount: number;
  windowStartMs: number;
  lastSentMs: number;
}

const sendOtpRateStore = new Map<string, RateEntry>();

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

    const email = String(body?.email || body?.targetEmail || body?.userEmail || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
    }

    const nowMs = Date.now();
    const existing = sendOtpRateStore.get(email);

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
    const otpHash = hashOtpCode(otpCode, email);
    const expiresAtMs = nowMs + OTP_TTL_MS;

    const delivery = await sendVerificationOtpEmail(email, otpCode);
    if (!delivery.delivered) {
      return res.status(500).json({
        success: false,
        deliveredViaGmail: false,
        error: delivery.error || 'تعذر إرسال رمز التحقق عبر خدمة البريد',
      });
    }

    sendOtpRateStore.set(email, {
      otpHash,
      expiresAtMs,
      sendCount: sendCount + 1,
      windowStartMs: windowExpired ? nowMs : existing?.windowStartMs || nowMs,
      lastSentMs: nowMs,
    });

    return res.status(200).json({
      success: true,
      email,
      expiresAtMs,
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
      cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
      remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - (sendCount + 1)),
      deliveredViaGmail: true,
      messageId: delivery.messageId || null,
    });
  } catch (err: any) {
    console.error('[API /send-otp Error]:', { message: err?.message });
    return res.status(500).json({
      success: false,
      error: err?.message || 'فشل إرسال رمز التحقق عبر البريد',
    });
  }
}
