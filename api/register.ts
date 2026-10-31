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

  const subject = `رمز التحقق: ${otpCode}`;
  const textBody = `رمز التحقق الخاص بك هو: ${otpCode}\nالرمز صالح 10 دقائق.`;
  const htmlBody = [
    '<!DOCTYPE html>',
    '<html dir="rtl" lang="ar">',
    '<head><meta charset="utf-8"></head>',
    '<body style="background-color:#ffffff;color:#000000;font-family:sans-serif;padding:20px;margin:0;direction:rtl;text-align:right;">',
    '<p style="margin:0 0 12px 0;font-size:16px;">رمز التحقق الخاص بك هو:</p>',
    `<p style="margin:0 0 12px 0;font-size:24px;font-weight:bold;letter-spacing:4px;">${otpCode}</p>`,
    '<p style="margin:0;font-size:14px;">الرمز صالح 10 دقائق.</p>',
    '</body>',
    '</html>',
  ].join('');

  let lastResendError = '';
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  // 1. Try Resend API first (custom domain, then onboarding@resend.dev)
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

  // 2. Fallback to Brevo HTTP API if BREVO_API_KEY is configured
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
          sender: { name: 'Sahara Express', email: brevoSenderEmail },
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

  // 3. Automatic Fallback to Gmail SMTP (nodemailer) so ANY recipient email receives the code even without a verified Resend domain!
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
        from: `Sahara Express <${gmailUser}>`,
        to: cleanRecipient,
        subject,
        text: textBody,
        html: htmlBody,
      });

      console.log('[Gmail SMTP Fallback Sent]:', {
        from: gmailUser,
        messageId: info.messageId,
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
          'تعذر إرسال رمز التحقق عبر البريد الإلكتروني',
      };
    }
  }

  return {
    delivered: false,
    error:
      lastResendError ||
      'تعذر إرسال رمز التحقق عبر خدمة البريد الإلكتروني',
  };
}

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

    const rawEmail = String(body?.email || body?.targetEmail || body?.userEmail || '').trim().toLowerCase();
    const otpCodeInput = String(body?.otpCode || '').trim().replace(/\s+/g, '');
    const clientOtpRecord = body?.otpRecord;
    const nowMs = Date.now();

    // Verification Mode (if otpCode passed)
    if (otpCodeInput) {
      if (!rawEmail || !/^\d{6}$/.test(otpCodeInput)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً' });
      }
      let cached = emailCache.get(rawEmail);
      if (!cached && clientOtpRecord?.otp_hash && clientOtpRecord?.expires_at_ms) {
        cached = {
          email: rawEmail,
          otpHash: String(clientOtpRecord.otp_hash),
          expiresAtMs: Number(clientOtpRecord.expires_at_ms),
          attempts: Number(clientOtpRecord.attempts || 0),
          sendCount: Number(clientOtpRecord.send_count || 1),
          windowStartMs: Number(clientOtpRecord.window_start_ms || nowMs),
          lastSentMs: Number(clientOtpRecord.last_sent_ms || nowMs),
        };
      }

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
          attempts: cached.attempts,
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

    const nextSendCount = sendCount + 1;
    const nextWindowStartMs = windowExpired ? nowMs : existing?.windowStartMs || nowMs;

    emailCache.set(rawEmail, {
      email: rawEmail,
      otpHash,
      expiresAtMs,
      attempts: 0,
      sendCount: nextSendCount,
      windowStartMs: nextWindowStartMs,
      lastSentMs: nowMs,
    });

    return res.status(200).json({
      success: true,
      email: rawEmail,
      expiresAtMs,
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
      cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
      remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - nextSendCount),
      deliveredViaGmail: true,
      provider: delivery.provider || 'resend',
      messageId: delivery.messageId || null,
      otpRecord: {
        email: rawEmail,
        otp_hash: otpHash,
        expires_at_ms: expiresAtMs,
        attempts: 0,
        send_count: nextSendCount,
        window_start_ms: nextWindowStartMs,
        last_sent_ms: nowMs,
      },
    });
  } catch (err: any) {
    console.error('[API /register Error]:', { message: err?.message });
    return res.status(500).json({
      success: false,
      error: err?.message || 'حدث خطأ في الخادم أثناء معالجة الطلب',
    });
  }
}
