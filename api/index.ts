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

interface OtpEntry {
  otpHash: string;
  expiresAtMs: number;
  attempts: number;
  sendCount: number;
  windowStartMs: number;
  lastSentMs: number;
  used: boolean;
}

const memoryStore = new Map<string, OtpEntry>();

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  const url = req.url || '';

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const nowMs = Date.now();

    // 1. Route: Send Registration Email OTP
    if (url.includes('register/send') || url.includes('/api/register') || url.includes('register-otp')) {
      const email = String(body?.email || body?.userEmail || '').trim().toLowerCase();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
      }

      const existing = memoryStore.get(email);
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

      memoryStore.set(email, {
        otpHash,
        expiresAtMs,
        attempts: 0,
        sendCount: sendCount + 1,
        windowStartMs: windowExpired ? nowMs : existing?.windowStartMs || nowMs,
        lastSentMs: nowMs,
        used: false,
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
    }

    // 2. Route: Verify Registration Email OTP
    if (url.includes('register/verify')) {
      const email = String(body?.email || '').trim().toLowerCase();
      const code = String(body?.otpCode || '').trim().replace(/\s+/g, '');

      if (!email || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً' });
      }

      const record = memoryStore.get(email);
      if (!record) {
        return res.status(400).json({ success: false, error: 'لم يتم العثور على رمز نشط. يرجى طلب رمز جديد.' });
      }

      if (nowMs > record.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية رمز التحقق (10 دقائق). يرجى طلب رمز جديد.',
        });
      }

      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          error: 'تم تجاوز الحد الأقصى للمحاولات (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      if (!verifyOtpHash(code, record.otpHash, email)) {
        record.attempts += 1;
        memoryStore.set(email, record);
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts);
        return res.status(400).json({
          success: false,
          remainingAttempts,
          error:
            remainingAttempts > 0
              ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remainingAttempts}`
              : 'تم استنفاد جميع المحاولات (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      return res.status(200).json({ success: true, verified: true, email });
    }

    // 3. Route: Forgot Password Send OTP
    if (url.includes('forgot-password/send-otp')) {
      const targetEmail = String(body?.targetEmail || body?.email || '').trim().toLowerCase();
      const phone = String(body?.phone || '').trim();
      const key = phone || targetEmail;

      if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
        return res.status(400).json({ success: false, error: 'البريد الإلكتروني غير صالح' });
      }

      const existing = memoryStore.get(key);
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
      const otpHash = hashOtpCode(otpCode, key);
      const expiresAtMs = nowMs + OTP_TTL_MS;

      const delivery = await sendVerificationOtpEmail(targetEmail, otpCode);
      if (!delivery.delivered) {
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: delivery.error || 'تعذر إرسال رمز الاستعادة عبر خدمة البريد',
        });
      }

      const nextSendCount = sendCount + 1;
      const nextWindowStartMs = windowExpired ? nowMs : existing?.windowStartMs || nowMs;

      memoryStore.set(key, {
        otpHash,
        expiresAtMs,
        attempts: 0,
        sendCount: nextSendCount,
        windowStartMs: nextWindowStartMs,
        lastSentMs: nowMs,
        used: false,
      });

      return res.status(200).json({
        success: true,
        expiresAtMs,
        ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - nextSendCount),
        maxSendsPerWindow: OTP_MAX_SENDS_PER_WINDOW,
        deliveredViaGmail: true,
        targetEmail,
        messageId: delivery.messageId || null,
        otpRecord: {
          id: key,
          phone,
          email: targetEmail,
          otp_hash: otpHash,
          expires_at_ms: expiresAtMs,
          attempts: 0,
          send_count: nextSendCount,
          window_start_ms: nextWindowStartMs,
          last_sent_ms: nowMs,
          verified: false,
          used: false,
        },
      });
    }

    // 4. Route: Forgot Password Verify OTP
    if (url.includes('forgot-password/verify-otp')) {
      const phone = String(body?.phone || body?.whatsappNumber || '').trim();
      const email = String(body?.email || '').trim().toLowerCase();
      const key = phone || email;
      const code = String(body?.otpCode || '').trim().replace(/\s+/g, '');
      const clientRecord = body?.otpRecord;

      if (!key || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام' });
      }

      let record = memoryStore.get(key);
      if (!record && clientRecord?.otp_hash && clientRecord?.expires_at_ms) {
        record = {
          otpHash: String(clientRecord.otp_hash),
          expiresAtMs: Number(clientRecord.expires_at_ms),
          attempts: Number(clientRecord.attempts || 0),
          sendCount: Number(clientRecord.send_count || 1),
          windowStartMs: Number(clientRecord.window_start_ms || nowMs),
          lastSentMs: Number(clientRecord.last_sent_ms || nowMs),
          used: Boolean(clientRecord.used),
        };
      }

      if (!record) {
        return res.status(400).json({ success: false, error: 'لا يوجد رمز تحقق نشط. يرجى طلب رمز جديد.' });
      }

      if (record.used) {
        return res.status(400).json({ success: false, error: 'تم استخدام هذا الرمز مسبقاً.' });
      }

      if (nowMs > record.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية رمز التحقق (10 دقائق). يرجى طلب رمز جديد.',
        });
      }

      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          remainingAttempts: 0,
          error: 'تم تجاوز الحد الأقصى للمحاولات (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      const valid =
        verifyOtpHash(code, record.otpHash, key) ||
        (email ? verifyOtpHash(code, record.otpHash, email) : false);

      if (!valid) {
        record.attempts += 1;
        memoryStore.set(key, record);
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts);
        return res.status(400).json({
          success: false,
          remainingAttempts,
          locked: remainingAttempts === 0,
          error:
            remainingAttempts > 0
              ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remainingAttempts}`
              : 'تم استنفاد جميع المحاولات (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      return res.status(200).json({
        success: true,
        verified: true,
        remainingAttempts: Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts),
      });
    }

    return res.status(200).json({
      success: true,
      service: 'Sahara Express API',
      status: 'operational',
    });
  } catch (err: any) {
    console.error('[API /index Error]:', { message: err?.message });
    return res.status(500).json({
      success: false,
      error: err?.message || 'حدث خطأ في الخادم أثناء معالجة الطلب',
    });
  }
}
