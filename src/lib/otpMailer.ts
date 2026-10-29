import crypto from 'crypto';

// ============================================================================
// OTP SECURITY & RATE-LIMIT CONSTANTS
// ============================================================================
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes expiration
export const OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes rate-limit window
export const OTP_MAX_SENDS_PER_WINDOW = 3; // Max 3 sends per 10 minutes
export const OTP_MAX_VERIFY_ATTEMPTS = 5; // Max 5 verification attempts per OTP
export const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds minimum cooldown between sends

export interface HashedOtpRecord {
  identifier: string;
  email: string;
  phone?: string;
  otpHash: string;
  expiresAtMs: number;
  attempts: number;
  sendCount: number;
  windowStartMs: number;
  lastSentMs: number;
  verified: boolean;
  used: boolean;
  createdAt: string;
  updatedAt: string;
}

const OTP_HMAC_SECRET = process.env.OTP_HASH_SECRET || 'sahara-express-otp-hmac-secret-v1';

/**
 * Generates a cryptographically random 6-digit OTP code (100000 - 999999).
 * Never log this value.
 */
export function generateSixDigitOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Computes an HMAC-SHA256 hash of the 6-digit OTP bound to the target identifier.
 */
export function hashOtpCode(otpCode: string, identifier: string = ''): string {
  const normalizedId = identifier.trim().toLowerCase();
  return crypto
    .createHmac('sha256', OTP_HMAC_SECRET)
    .update(`${normalizedId}:${otpCode.trim()}`)
    .digest('hex');
}

/**
 * Constant-time comparison of an input OTP code against a stored HMAC-SHA256 hash.
 */
export function verifyOtpHash(inputCode: string, storedHash: string, identifier: string = ''): boolean {
  if (!/^\d{6}$/.test(inputCode.trim()) || !storedHash) {
    return false;
  }
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

/**
 * Removes any emoji characters from a string to enforce a clean sender name.
 */
function stripEmojis(text: string): string {
  return text
    .replace(
      /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1FA70}-\u{1FAFF}]/gu,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses and validates MAIL_FROM from environment variables.
 * Rejects missing MAIL_FROM or free consumer domains like gmail.com.
 */
export function resolveValidatedSender(): {
  valid: boolean;
  fromHeader?: string;
  senderName?: string;
  senderEmail?: string;
  error?: string;
} {
  const rawFrom = (process.env.MAIL_FROM || '').trim();
  if (!rawFrom) {
    return {
      valid: false,
      error: 'متغير البيئة MAIL_FROM غير مضبوط. يجب ضبطه على بريد من دومين خاص بك مثل: Sahara Express <no-reply@yourdomain.com>',
    };
  }

  let senderName = 'Sahara Express';
  let senderEmail = rawFrom;

  const angleMatch = rawFrom.match(/^(.*)<([^>]+)>$/);
  if (angleMatch) {
    const parsedName = stripEmojis(angleMatch[1].replace(/^["']|["']$/g, '').trim());
    senderName = parsedName || 'Sahara Express';
    senderEmail = angleMatch[2].trim().toLowerCase();
  } else {
    senderEmail = rawFrom.replace(/^["']|["']$/g, '').trim().toLowerCase();
  }

  const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
  const domainMatch = senderEmail.match(emailRegex);
  if (!domainMatch) {
    return {
      valid: false,
      error: 'صيغة MAIL_FROM غير صالحة. استخدم الصيغة: Sahara Express <no-reply@yourdomain.com>',
    };
  }

  const domain = domainMatch[1].toLowerCase();
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return {
      valid: false,
      error: 'لا يُسمح باستخدام gmail.com في عنوان المرسل MAIL_FROM. يجب استخدام دومين خاص تملكه (مثل no-reply@yourdomain.com).',
    };
  }

  return {
    valid: true,
    senderName,
    senderEmail,
    fromHeader: `${senderName} <${senderEmail}>`,
  };
}

export interface SendOtpEmailResult {
  delivered: boolean;
  provider?: 'resend' | 'brevo';
  messageId?: string;
  error?: string;
}

/**
 * Sends a 6-digit OTP email via a dedicated transactional email API (Resend or Brevo).
 * - Plain text + minimal HTML (white background, short sentence, bold code, "الرمز صالح 10 دقائق").
 * - No images, no buttons, no links, no emojis, no tracking.
 * - Subject: "رمز التحقق: 123456"
 * - No X-Mailer or List-Unsubscribe headers.
 * - Never logs the OTP code.
 */
export async function sendVerificationOtpEmail(
  toEmail: string,
  otpCode: string
): Promise<SendOtpEmailResult> {
  const cleanRecipient = toEmail.trim().toLowerCase();
  const senderConfig = resolveValidatedSender();

  if (!senderConfig.valid || !senderConfig.fromHeader || !senderConfig.senderEmail || !senderConfig.senderName) {
    return {
      delivered: false,
      error: senderConfig.error || 'إعداد MAIL_FROM غير صالح',
    };
  }

  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const brevoApiKey = (process.env.BREVO_API_KEY || '').trim();

  if (!resendApiKey && !brevoApiKey) {
    return {
      delivered: false,
      error: 'مفتاح خدمة البريد غير متوفر. يرجى ضبط RESEND_API_KEY أو BREVO_API_KEY في متغيرات البيئة.',
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

  // 1. Prefer Resend API if RESEND_API_KEY is configured
  if (resendApiKey) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: senderConfig.fromHeader,
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
          provider: 'resend',
          error: data?.message || `Resend API HTTP ${response.status}`,
        };
      }

      console.log('[Transactional Mail Sent]:', {
        provider: 'resend',
        messageId: data?.id || 'ok',
      });

      return {
        delivered: true,
        provider: 'resend',
        messageId: data?.id,
      };
    } catch (err: any) {
      console.error('[Resend Network Error]:', { message: err?.message });
      return {
        delivered: false,
        provider: 'resend',
        error: err?.message || 'تعذر الاتصال بخدمة Resend API',
      };
    }
  }

  // 2. Otherwise use Brevo API if BREVO_API_KEY is configured
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: senderConfig.senderName,
          email: senderConfig.senderEmail,
        },
        to: [{ email: cleanRecipient }],
        subject,
        textContent: textBody,
        htmlContent: htmlBody,
      }),
    });

    const data: any = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('[Brevo API Error]:', {
        status: response.status,
        code: data?.code,
        message: data?.message,
      });
      return {
        delivered: false,
        provider: 'brevo',
        error: data?.message || `Brevo API HTTP ${response.status}`,
      };
    }

    console.log('[Transactional Mail Sent]:', {
      provider: 'brevo',
      messageId: data?.messageId || 'ok',
    });

    return {
      delivered: true,
      provider: 'brevo',
      messageId: data?.messageId,
    };
  } catch (err: any) {
    console.error('[Brevo Network Error]:', { message: err?.message });
    return {
      delivered: false,
      provider: 'brevo',
      error: err?.message || 'تعذر الاتصال بخدمة Brevo API',
    };
  }
}
