import crypto from 'crypto';
import nodemailer from 'nodemailer';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_SENDS_PER_WINDOW = 3; // 3 sends per 10 minutes
const OTP_MAX_VERIFY_ATTEMPTS = 5; // 5 attempts max
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
const OTP_HMAC_SECRET = process.env.OTP_HASH_SECRET || 'sahara-express-otp-hmac-secret-v1';
const DEFAULT_MAIL_FROM = 'Sahara Express <noreply@sahara-express.com>';
const RESEND_SANDBOX_FROM = 'Sahara Express <onboarding@resend.dev>';

function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function hashOtpCode(otpCode: string, identifier: string = ''): string {
  const normalizedId = identifier.trim().toLowerCase();
  return crypto
    .createHmac('sha256', OTP_HMAC_SECRET)
    .update(`${normalizedId}:${otpCode.trim()}`)
    .digest('hex');
}

function verifyOtpHash(inputCode: string, storedHash: string, identifier: string = ''): boolean {
  if (!/^\d{6}$/.test(inputCode.trim()) || !storedHash) return false;
  const candidateHash = hashOtpCode(inputCode.trim(), identifier);
  try {
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function resolveSenderFrom(): string {
  const rawFrom = (process.env.MAIL_FROM || DEFAULT_MAIL_FROM).trim();
  const angleMatch = rawFrom.match(/^(.*)<([^>]+)>$/);
  let senderName = 'Sahara Express';
  let senderEmail = 'noreply@sahara-express.com';

  if (angleMatch) {
    senderName = angleMatch[1].replace(/^["']|["']$/g, '').trim() || 'Sahara Express';
    senderEmail = angleMatch[2].trim().toLowerCase();
  } else if (rawFrom.includes('@')) {
    senderEmail = rawFrom.replace(/^["']|["']$/g, '').trim().toLowerCase();
  }

  if (!senderEmail.includes('@')) {
    return DEFAULT_MAIL_FROM;
  }
  return `${senderName} <${senderEmail}>`;
}

async function sendVerificationOtpEmail(
  toEmail: string,
  otpCode: string
): Promise<{ delivered: boolean; provider?: string; messageId?: string; error?: string }> {
  const cleanRecipient = toEmail.trim().toLowerCase();
  const primaryFrom = resolveSenderFrom();

  const recipientName = cleanRecipient.split('@')[0] || 'عميلنا الكريم';
  const subject = `تأكيد حسابك في صحارى إكسبريس`;
  const textBody = [
    `السلام عليكم ورحمة الله (${recipientName})،`,
    '',
    'شكراً لتسجيلك في منصة صحارى إكسبريس لنقل المسافرين والبضائع.',
    'لإتمام تأكيد بريدك الإلكتروني، يرجى إدخال رمز التفعيل التالي في التطبيق:',
    '',
    otpCode,
    '',
    'هذا الرمز صالح لمدة 10 دقائق فقط.',
    'إذا لم تطلب هذا الرمز، يمكنك تجاهل هذه الرسالة بأمان.',
    '',
    'مع تحيات فريق صحارى إكسبريس - الداخلة / الكركرات',
  ].join('\n');

  const htmlBody = [
    '<!DOCTYPE html>',
    '<html dir="rtl" lang="ar">',
    '<head><meta charset="utf-8"></head>',
    '<body style="background-color:#ffffff;color:#111111;font-family:Tahoma,Arial,sans-serif;padding:20px;margin:0;direction:rtl;text-align:right;line-height:1.7;">',
    `<p style="margin:0 0 12px 0;font-size:15px;">السلام عليكم ورحمة الله (${recipientName})،</p>`,
    '<p style="margin:0 0 12px 0;font-size:15px;">شكراً لتسجيلك في منصة <strong>صحارى إكسبريس</strong>. لإتمام تأكيد بريدك الإلكتروني، يرجى إدخال رمز التفعيل التالي في التطبيق:</p>',
    `<p style="margin:16px 0;font-size:22px;font-weight:bold;color:#111111;">${otpCode}</p>`,
    '<p style="margin:0 0 12px 0;font-size:14px;color:#333333;">هذا الرمز صالح لمدة 10 دقائق فقط. إذا لم تطلب هذا الرمز، يرجى تجاهل هذه الرسالة.</p>',
    '<p style="margin:16px 0 0 0;font-size:13px;color:#555555;">مع تحيات فريق صحارى إكسبريس</p>',
    '</body>',
    '</html>',
  ].join('');

  let lastResendError = '';
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  if (resendApiKey) {
    const candidateFroms =
      primaryFrom.toLowerCase().includes('@resend.dev') ||
      primaryFrom.toLowerCase().includes('@gmail.com')
        ? [RESEND_SANDBOX_FROM]
        : [primaryFrom, RESEND_SANDBOX_FROM];

    for (const candidateFrom of candidateFroms) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: candidateFrom,
            to: [cleanRecipient],
            subject,
            text: textBody,
            html: htmlBody,
          }),
        });

        const data: any = await response.json().catch(() => ({}));
        if (response.ok) {
          return {
            delivered: true,
            provider: 'resend',
            messageId: data?.id,
          };
        }

        lastResendError = data?.message || `Resend API HTTP ${response.status}`;
        console.warn('[Resend Attempt Failed]:', {
          from: candidateFrom,
          status: response.status,
          message: lastResendError,
        });
      } catch (err: any) {
        lastResendError = err?.message || 'Resend network error';
      }
    }
  }

  const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();
  const brevoSenderEmail = (
    process.env.BREVO_SENDER_EMAIL ||
    process.env.GMAIL_USER ||
    'aissaaimanekhlifi@gmail.com'
  ).trim();

  if (brevoApiKey) {
    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'صحارى إكسبريس', email: brevoSenderEmail },
          to: [{ email: cleanRecipient }],
          subject,
          textContent: textBody,
          htmlContent: htmlBody,
        }),
      });
      const brevoData: any = await brevoRes.json().catch(() => ({}));
      if (brevoRes.ok) {
        return {
          delivered: true,
          provider: 'brevo',
          messageId: brevoData?.messageId || 'brevo-ok',
        };
      }
    } catch (err: any) {
      console.warn('[Brevo Fallback Failed]:', err?.message);
    }
  }

  const gmailUser = (
    process.env.GMAIL_USER ||
    process.env.SMTP_USER ||
    'aissaaimanekhlifi@gmail.com'
  ).trim();
  const gmailPass = (
    process.env.GMAIL_APP_PASSWORD ||
    process.env.SMTP_PASS ||
    'fntivyfldifqgxwl'
  )
    .replace(/\s+/g, '')
    .trim();

  if (gmailUser && gmailPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      const info = await transporter.sendMail({
        from: `"صحارى إكسبريس" <${gmailUser}>`,
        replyTo: gmailUser,
        to: cleanRecipient,
        subject,
        text: textBody,
      });

      return {
        delivered: true,
        provider: 'gmail-smtp',
        messageId: info.messageId,
      };
    } catch (smtpErr: any) {
      console.error('[Gmail SMTP Fallback Error]:', { message: smtpErr?.message });
      return {
        delivered: false,
        error:
          lastResendError ||
          smtpErr?.message ||
          'تعذر إرسال رمز التحقق عبر خدمة البريد',
      };
    }
  }

  return {
    delivered: false,
    error: lastResendError || 'تعذر إرسال رمز التحقق عبر خدمة البريد',
  };
}

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
    if ((url.includes('register/send') || url.includes('/api/register') || url.includes('register-otp')) && !body?.otpCode) {
      const email = String(body?.email || body?.targetEmail || body?.userEmail || '').trim().toLowerCase();

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

      const nextSendCount = sendCount + 1;
      const nextWindowStartMs = windowExpired ? nowMs : existing?.windowStartMs || nowMs;

      memoryStore.set(email, {
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
        email,
        expiresAtMs,
        ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - nextSendCount),
        deliveredViaGmail: true,
        provider: delivery.provider || 'resend',
        messageId: delivery.messageId || null,
        otpRecord: {
          email,
          otp_hash: otpHash,
          expires_at_ms: expiresAtMs,
          attempts: 0,
          send_count: nextSendCount,
          window_start_ms: nextWindowStartMs,
          last_sent_ms: nowMs,
        },
      });
    }

    // 2. Route: Verify Registration Email OTP
    if (url.includes('register/verify') || (url.includes('/api/register') && body?.otpCode)) {
      const email = String(body?.email || body?.userEmail || '').trim().toLowerCase();
      const code = String(body?.otpCode || '').trim().replace(/\s+/g, '');
      const clientRecord = body?.otpRecord;

      if (!email || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً' });
      }

      let record = memoryStore.get(email);
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
          attempts: record.attempts,
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
        provider: delivery.provider || 'resend',
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
