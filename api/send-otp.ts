import crypto from 'crypto';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_SENDS_PER_WINDOW = 3; // 3 sends per 10 minutes
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
const OTP_HMAC_SECRET = process.env.OTP_HASH_SECRET || 'sahara-express-otp-hmac-secret-v1';
const DEFAULT_MAIL_FROM = 'Sahara Express <noreply@sahara-express.com>';

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

  if (
    !senderEmail.includes('@') ||
    senderEmail.endsWith('@gmail.com') ||
    senderEmail.endsWith('@googlemail.com') ||
    senderEmail.endsWith('@resend.dev')
  ) {
    return DEFAULT_MAIL_FROM;
  }
  return `${senderName} <${senderEmail}>`;
}

async function sendVerificationOtpEmail(
  toEmail: string,
  otpCode: string
): Promise<{ delivered: boolean; messageId?: string; error?: string }> {
  const cleanRecipient = toEmail.trim().toLowerCase();
  const fromAddress = resolveSenderFrom();
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();

  if (!resendApiKey) {
    return {
      delivered: false,
      error: 'مفتاح RESEND_API_KEY غير مضاف في Vercel Environment Variables. أضفه ثم اعمل Redeploy.',
    };
  }

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

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [cleanRecipient],
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Resend API Error]:', {
        status: response.status,
        name: data?.name,
        message: data?.message,
      });
      return {
        delivered: false,
        error: data?.message || `خطأ من Resend API (HTTP ${response.status})`,
      };
    }

    return {
      delivered: true,
      messageId: data?.id,
    };
  } catch (err: any) {
    console.error('[Resend Network Error]:', { message: err?.message });
    return {
      delivered: false,
      error: err?.message || 'تعذر الاتصال بخدمة Resend API',
    };
  }
}

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
    const phone = String(body?.phone || '').trim();
    const key = phone || email;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
    }

    const nowMs = Date.now();
    const existing = sendOtpRateStore.get(key);

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

    sendOtpRateStore.set(key, {
      otpHash,
      expiresAtMs,
      sendCount: nextSendCount,
      windowStartMs: nextWindowStartMs,
      lastSentMs: nowMs,
    });

    return res.status(200).json({
      success: true,
      email,
      targetEmail: email,
      expiresAtMs,
      ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
      cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
      remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - nextSendCount),
      maxSendsPerWindow: OTP_MAX_SENDS_PER_WINDOW,
      deliveredViaGmail: true,
      messageId: delivery.messageId || null,
      otpRecord: {
        id: key,
        phone,
        email,
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
  } catch (err: any) {
    console.error('[API /send-otp Error]:', { message: err?.message });
    return res.status(500).json({
      success: false,
      error: err?.message || 'فشل إرسال رمز التحقق عبر البريد',
    });
  }
}
