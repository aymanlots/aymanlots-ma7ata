import crypto from 'crypto';
import nodemailer from 'nodemailer';

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

export const DEFAULT_MAIL_FROM = 'Sahara Express <noreply@sahara-express.com>';
export const RESEND_SANDBOX_FROM = 'Sahara Express <onboarding@resend.dev>';

/**
 * Parses and validates MAIL_FROM from environment variables.
 */
export function resolveValidatedSender(): {
  valid: boolean;
  fromHeader: string;
  senderName: string;
  senderEmail: string;
  error?: string;
} {
  const rawFrom = (process.env.MAIL_FROM || DEFAULT_MAIL_FROM).trim();

  let senderName = 'Sahara Express';
  let senderEmail = 'noreply@sahara-express.com';

  const angleMatch = rawFrom.match(/^(.*)<([^>]+)>$/);
  if (angleMatch) {
    const parsedName = stripEmojis(angleMatch[1].replace(/^["']|["']$/g, '').trim());
    senderName = parsedName || 'Sahara Express';
    senderEmail = angleMatch[2].trim().toLowerCase();
  } else if (rawFrom.includes('@')) {
    senderEmail = rawFrom.replace(/^["']|["']$/g, '').trim().toLowerCase();
  }

  const emailRegex = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;
  const domainMatch = senderEmail.match(emailRegex);
  if (!domainMatch) {
    return {
      valid: true,
      senderName: 'Sahara Express',
      senderEmail: 'noreply@sahara-express.com',
      fromHeader: DEFAULT_MAIL_FROM,
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
  provider?: 'resend' | 'gmail-smtp' | 'brevo';
  messageId?: string;
  error?: string;
}

/**
 * Sends a 6-digit OTP email with automatic multi-provider fallback:
 * 1. Tries Resend API (with MAIL_FROM, then onboarding@resend.dev if domain is unverified).
 * 2. If Resend fails (e.g., domain not verified in Resend DNS or sandbox restriction for external emails),
 *    automatically falls back to Gmail SMTP (nodemailer) or Brevo API so emails deliver to ANY recipient
 *    (like bojidaanas458@gmail.com) without requiring a paid domain.
 */
export async function sendVerificationOtpEmail(
  toEmail: string,
  otpCode: string
): Promise<SendOtpEmailResult> {
  const cleanRecipient = toEmail.trim().toLowerCase();
  const senderConfig = resolveValidatedSender();
  const primaryFrom = senderConfig.fromHeader || DEFAULT_MAIL_FROM;

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

  // 1. Try Resend API if RESEND_API_KEY is present
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
          console.log('[Resend Mail Sent]:', {
            from: candidateFrom,
            messageId: data?.id || 'ok',
          });
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

  // 3. Fallback to Gmail SMTP (nodemailer) — works for ANY recipient email without needing a verified domain!
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
        provider: 'gmail-smtp',
        error:
          lastResendError ||
          smtpErr?.message ||
          'تعذر إرسال رمز التحقق عبر Resend أو Gmail SMTP',
      };
    }
  }

  return {
    delivered: false,
    provider: 'resend',
    error:
      lastResendError ||
      'تعذر إرسال البريد: دومين sahara-express.com غير مفعل في Resend بعد، ولم يتم إعداد GMAIL_USER و GMAIL_APP_PASSWORD.',
  };
}
