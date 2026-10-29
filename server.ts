import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { createServer as createViteServer } from 'vite';
import { eq, desc } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  workspaces,
  stations,
  parcels,
  trips,
  transactions,
  auditLogs,
} from './src/db/schema.ts';
import { requireAuth } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';
import { cleanPhoneNumber } from './src/lib/supabase.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// GMAIL APP PASSWORD NODEMAILER SERVICE (Email Verification & Recovery)
// ============================================================================
interface SendMailOtpParams {
  toEmail: string;
  otpCode: string;
  subject: string;
  headerTitle: string;
  leadMessage: string;
  userName?: string;
  actionNote?: string;
}

function getMailTransporter() {
  const user = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || 'fntivyfldifqgxwl').replace(/\s+/g, '');
  if (!user || !pass) {
    console.warn('[Nodemailer Config Warning] Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables.');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

async function sendOtpViaNodemailerGmail(params: SendMailOtpParams): Promise<{
  delivered: boolean;
  messageId?: string;
  error?: string;
  previewCode?: string;
}> {
  const { toEmail, otpCode, subject, headerTitle, leadMessage, userName, actionNote } = params;
  const cleanEmail = toEmail.trim().toLowerCase();
  const transporter = getMailTransporter();

  const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0702; margin: 0; padding: 20px; color: #f5eedc; direction: rtl; text-align: right; }
    .container { max-width: 520px; margin: 0 auto; background: linear-gradient(180deg, #180e03 0%, #120901 100%); border: 1.5px solid #d4af37; border-radius: 20px; padding: 32px 28px; box-shadow: 0 16px 40px rgba(0,0,0,0.8); }
    .brand-header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid rgba(212,175,55,0.25); }
    .brand-logo-text { font-size: 24px; font-weight: 900; color: #f5d799; letter-spacing: 0.5px; margin: 0; }
    .brand-sub { font-size: 13px; color: #e5953e; margin-top: 4px; font-weight: 700; }
    .content { padding: 24px 0 16px 0; text-align: right; }
    .greeting { font-size: 16px; color: #f8c885; font-weight: 700; margin-bottom: 12px; }
    .lead { font-size: 14px; color: #e0d2bd; line-height: 1.6; margin-bottom: 24px; }
    .otp-wrapper { text-align: center; margin: 28px 0; }
    .otp-box { display: inline-block; background: #080400; border: 2px dashed #f5b05b; border-radius: 16px; padding: 18px 36px; }
    .otp-code { font-family: monospace, 'Courier New', Courier; font-size: 38px; font-weight: 900; letter-spacing: 12px; color: #f5b05b; text-shadow: 0 2px 8px rgba(245,176,91,0.3); }
    .badge-expiry { display: inline-block; margin-top: 10px; background: rgba(245,176,91,0.15); border: 1px solid rgba(245,176,91,0.4); color: #f8c885; font-size: 12px; font-weight: bold; padding: 6px 14px; border-radius: 999px; }
    .warning-box { background: rgba(180, 83, 9, 0.15); border-right: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin-top: 20px; font-size: 12px; color: #fde68a; line-height: 1.5; }
    .footer { text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(212,175,55,0.2); font-size: 11px; color: #a68966; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand-header">
      <h1 class="brand-logo-text">Sahara📦 Express</h1>
      <div class="brand-sub">للسفر ونقل البضائع والكوليات</div>
    </div>
    <div class="content">
      <div class="greeting">مرحباً ${userName || 'بك'}،</div>
      <div class="lead">${leadMessage}</div>
      <div class="otp-wrapper">
        <div class="otp-box">
          <div class="otp-code">${otpCode}</div>
        </div>
        <div>
          <span class="badge-expiry">⏳ صالح لمدة 5 دقائق فقط (مرة واحدة)</span>
        </div>
      </div>
      ${actionNote ? `<p style="font-size:13px;color:#c8b08a;margin:12px 0;">${actionNote}</p>` : ''}
      <div class="warning-box">
        ⚠️ <strong>تنبيه أمني:</strong> لا تشارك هذا الكود السري مع أي شخص. فريق العمل في Sahara Express لن يطلب منك هذا الكود أبداً.
      </div>
    </div>
    <div class="footer">
      نظام Sahara📦 Express الذكي لإدارة المحطات وتتبع الشحنات وحوالات الأمانة.<br>
      هذه رسالة آلية لحماية حسابك، يرجى عدم الرد عليها.
    </div>
  </div>
</body>
</html>
  `;

  if (!transporter) {
    console.warn(`[Nodemailer Warning] GMAIL credentials missing on server. Fallback preview code for ${cleanEmail}: ${otpCode}`);
    return {
      delivered: false,
      error: 'GMAIL_CREDENTIALS_MISSING',
      previewCode: otpCode,
    };
  }

  try {
    const sender = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
    const fromAddress = `"Sahara📦 Express" <${sender}>`;
    const sendResult = await transporter.sendMail({
      from: fromAddress,
      to: cleanEmail,
      subject,
      html: htmlContent,
      text: `${headerTitle}\nكود التحقق الخاص بك هو: ${otpCode}\nصالح لمدة 5 دقائق فقط.`,
    });
    console.log(`[Nodemailer SMTP Success] Email sent to ${cleanEmail}, messageId: ${sendResult.messageId}`);
    return {
      delivered: true,
      messageId: sendResult.messageId,
    };
  } catch (err: any) {
    console.error('[Nodemailer SMTP Error Details]:', {
      to: cleanEmail,
      message: err?.message,
      code: err?.code,
      command: err?.command,
      response: err?.response,
      responseCode: err?.responseCode,
    });
    return {
      delivered: false,
      error: err?.message || 'Error sending email via Nodemailer',
      previewCode: otpCode,
    };
  }
}

// ============================================================================
// REGISTRATION EMAIL OTP STORE (6 Digits + 5 Min Expiry + Rate Limits)
// ============================================================================
interface RegistrationEmailOtpRecord {
  email: string;
  otpCode: string;
  expiresAtMs: number;
  attempts: number;
  sendCount: number;
  windowStartMs: number;
  lastSentMs: number;
  verified: boolean;
  createdAt: string;
}

const registrationEmailOtpStore = new Map<string, RegistrationEmailOtpRecord>();

// ============================================================================
// GMAIL OTP STORE & RATE LIMITER (5-Minute Expiry + Rate Limit)
// ============================================================================
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes expiration
const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds minimum between sends
const OTP_WINDOW_MS = 15 * 60 * 1000; // 15 minutes rate-limit window
const OTP_MAX_SENDS_PER_WINDOW = 3; // Max 3 OTP sends per 15 minutes per user/IP
const OTP_MAX_VERIFY_ATTEMPTS = 5; // Max 5 verification attempts per OTP

interface ServerOtpRecord {
  id: string;
  phone: string;
  email?: string;
  otpCode: string;
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

const serverOtpStore = new Map<string, ServerOtpRecord>();
const ipRateLimitStore = new Map<string, { count: number; windowStartMs: number; lastSentMs: number }>();

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  // ============================================================================
  // REGISTRATION GMAIL OTP ENDPOINTS (6-Digit OTP + 5-Min Expiry + Nodemailer)
  // ============================================================================
  const handleSendEmailOtp = async (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const rawEmail = String(req.body?.email || req.body?.userEmail || '').trim().toLowerCase();
      const userName = String(req.body?.userName || req.body?.name || '').trim();

      if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال عنوان بريد إلكتروني صحيح (مثال: user@gmail.com)',
        });
      }

      // Check if ends with @gmail.com or valid domain
      if (!rawEmail.endsWith('@gmail.com') && !rawEmail.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال عنوان بريد Gmail صالح ينتهي بـ @gmail.com',
        });
      }

      const nowMs = Date.now();
      const existing = registrationEmailOtpStore.get(rawEmail);

      // Check 60-second cooldown
      if (existing && existing.lastSentMs && nowMs - existing.lastSentMs < OTP_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_COOLDOWN_MS - (nowMs - existing.lastSentMs)) / 1000);
        return res.status(429).json({
          success: false,
          rateLimited: true,
          cooldownSeconds: waitSec,
          retryAfterSeconds: waitSec,
          error: `يرجى الانتظار ${waitSec} ثانية قبل طلب إرسال كود تحقق جديد.`,
        });
      }

      // Check 15-minute window limit (max 5 sends for registration)
      const windowExpired = !existing?.windowStartMs || nowMs - existing.windowStartMs >= OTP_WINDOW_MS;
      const sendCount = windowExpired ? 0 : existing?.sendCount || 0;
      if (sendCount >= 5) {
        const retryAfterSec = Math.ceil((OTP_WINDOW_MS - (nowMs - (existing?.windowStartMs || nowMs))) / 1000);
        return res.status(429).json({
          success: false,
          rateLimited: true,
          retryAfterSeconds: retryAfterSec,
          error: `تم تجاوز الحد المسموح من طلبات الكود. يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة قبل المحاولة مجدداً.`,
        });
      }

      // Generate secure 6-digit OTP code (100000 - 999999)
      const otpCode = String(crypto.randomInt(100000, 1000000));
      const expiresAtMs = nowMs + OTP_TTL_MS; // Strictly 5 minutes

      const newRecord: RegistrationEmailOtpRecord = {
        email: rawEmail,
        otpCode,
        expiresAtMs,
        attempts: 0,
        sendCount: sendCount + 1,
        windowStartMs: windowExpired ? nowMs : existing?.windowStartMs || nowMs,
        lastSentMs: nowMs,
        verified: false,
        createdAt: existing?.createdAt || new Date(nowMs).toISOString(),
      };
      registrationEmailOtpStore.set(rawEmail, newRecord);

      // Send 6-digit OTP code directly to Gmail via Nodemailer with Gmail App Password
      const emailDelivery = await sendOtpViaNodemailerGmail({
        toEmail: rawEmail,
        otpCode,
        subject: `🔐 كود تأكيد التسجيل [${otpCode}] - Sahara📦 Express`,
        headerTitle: 'تأكيد التسجيل في Sahara Express',
        leadMessage: 'مرحباً بك في Sahara Express. لتأكيد عنوان بريدك الإلكتروني وإتمام إنشاء حسابك، يرجى استخدام كود التحقق السري التالي:',
        userName: userName || 'عضو جديد',
        actionNote: 'أدخل هذا الكود المكون من 6 أرقام في شاشة التسجيل للمتابعة.',
      });

      if (!emailDelivery.delivered) {
        console.error('[Registration Send Email OTP Failed]:', emailDelivery.error);
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: emailDelivery.error === 'GMAIL_CREDENTIALS_MISSING'
            ? 'بيانات Gmail غير متوفرة بالسيرفر. يرجى ضبط GMAIL_USER و GMAIL_APP_PASSWORD في Vercel.'
            : `تعذر إرسال الإيميل عبر خادم SMTP: ${emailDelivery.error || 'خطأ غير معروف في خادم البريد'}`,
          previewCode: emailDelivery.previewCode,
        });
      }

      return res.status(200).json({
        success: true,
        email: rawEmail,
        expiresAtMs,
        ttlSeconds: 300,
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        remainingSends: Math.max(0, 5 - newRecord.sendCount),
        deliveredViaGmail: true,
        messageId: emailDelivery.messageId || null,
        previewCode: emailDelivery.previewCode || undefined,
      });
    } catch (err: any) {
      console.error('[Registration Send Email OTP Crash]:', err);
      return res.status(500).json({
        success: false,
        error: err?.message || 'حدث خطأ في الخادم أثناء معالجة طلب البريد الإلكتروني',
      });
    }
  };

  app.post('/api/auth/register/send-email-otp', handleSendEmailOtp);
  app.post('/api/register/send-otp', handleSendEmailOtp);
  app.post('/api/register', handleSendEmailOtp);

  app.post('/api/auth/register/verify-email-otp', async (req, res) => {
    try {
      const rawEmail = String(req.body?.email || '').trim().toLowerCase();
      const codeInput = String(req.body?.otpCode || '').trim().replace(/\s+/g, '');

      if (!rawEmail || !/^\d{6}$/.test(codeInput)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال كود التحقق المكون من 6 أرقام كاملاً',
        });
      }

      const record = registrationEmailOtpStore.get(rawEmail);
      if (!record) {
        return res.status(400).json({
          success: false,
          error: 'لم يتم العثور على طلب تحقق نشط لهذا البريد. يرجى طلب كود جديد.',
        });
      }

      const nowMs = Date.now();
      if (nowMs > record.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية كود التحقق (مرت 5 دقائق). يرجى طلب كود جديد.',
        });
      }

      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة (5 محاولات). يرجى طلب كود جديد.',
        });
      }

      if (record.otpCode !== codeInput) {
        record.attempts += 1;
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts);
        return res.status(400).json({
          success: false,
          attempts: record.attempts,
          remainingAttempts,
          error:
            remainingAttempts > 0
              ? `كود التحقق غير صحيح. المحاولات المتبقية: ${remainingAttempts}`
              : 'تم استنفاد جميع المحاولات المسموحة لهذا الكود. يرجى طلب كود جديد.',
        });
      }

      // Mark verified
      record.verified = true;
      registrationEmailOtpStore.set(rawEmail, record);

      return res.json({
        success: true,
        verified: true,
        email: rawEmail,
      });
    } catch (err: any) {
      console.error('[Registration Verify Email OTP Error]:', err);
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء التحقق من كود البريد الإلكتروني',
      });
    }
  });

  // ============================================================================
  // FORGOT PASSWORD GMAIL OTP ENDPOINT (6-Digit OTP + 5-Min Expiry via Nodemailer)
  // ============================================================================
  app.post('/api/auth/forgot-password/send-otp', async (req, res) => {
    try {
      const rawPhone = String(req.body?.phone || '').trim();
      const rawEmail = String(req.body?.targetEmail || req.body?.email || '').trim().toLowerCase();
      const userName = String(req.body?.userName || '').trim();
      const clientOtpRecord = req.body?.existingRateState;

      const canonicalPhone = cleanPhoneNumber(rawPhone) || (rawEmail ? rawEmail.replace(/[^a-zA-Z0-9]/g, '_') : '');

      if (!rawEmail || !rawEmail.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'هذا الحساب لا يتوفر على بريد Gmail مسجل لاستلام كود التحقق. يرجى إدخال بريدك Gmail المسجل.',
        });
      }

      const nowMs = Date.now();
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown-ip';

      // 1. Check IP-level Rate Limit
      const ipState = ipRateLimitStore.get(clientIp);
      if (ipState) {
        const ipWindowExpired = nowMs - ipState.windowStartMs >= OTP_WINDOW_MS;
        if (!ipWindowExpired && ipState.count >= OTP_MAX_SENDS_PER_WINDOW * 2) {
          const retryAfterSec = Math.ceil((OTP_WINDOW_MS - (nowMs - ipState.windowStartMs)) / 1000);
          return res.status(429).json({
            success: false,
            rateLimited: true,
            retryAfterSeconds: retryAfterSec,
            error: `تم تجاوز الحد المسموح من طلبات الكود. يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة قبل المحاولة مجدداً.`,
          });
        }
      }

      // 2. Check User / Phone Rate Limit (merges server state + Firestore client state)
      const existing = serverOtpStore.get(canonicalPhone);
      const refWindowStartMs = Math.max(
        existing?.windowStartMs || 0,
        Number(clientOtpRecord?.window_start_ms || 0)
      );
      const refLastSentMs = Math.max(
        existing?.lastSentMs || 0,
        Number(clientOtpRecord?.last_sent_ms || 0)
      );
      const windowExpired = !refWindowStartMs || nowMs - refWindowStartMs >= OTP_WINDOW_MS;
      const currentSendCount = windowExpired
        ? 0
        : Math.max(existing?.sendCount || 0, Number(clientOtpRecord?.send_count || 0));

      // Enforce 60-second cooldown between consecutive sends
      if (refLastSentMs && nowMs - refLastSentMs < OTP_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_COOLDOWN_MS - (nowMs - refLastSentMs)) / 1000);
        return res.status(429).json({
          success: false,
          rateLimited: true,
          cooldownSeconds: waitSec,
          retryAfterSeconds: waitSec,
          error: `يرجى الانتظار ${waitSec} ثانية قبل طلب إرسال كود OTP جديد.`,
        });
      }

      // Enforce maximum 3 OTP sends per 15-minute window
      if (currentSendCount >= OTP_MAX_SENDS_PER_WINDOW) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((OTP_WINDOW_MS - (nowMs - refWindowStartMs)) / 1000)
        );
        const mins = Math.ceil(retryAfterSec / 60);
        return res.status(429).json({
          success: false,
          rateLimited: true,
          retryAfterSeconds: retryAfterSec,
          error: `لقد وصلت للحد الأقصى لإرسال الكود (${OTP_MAX_SENDS_PER_WINDOW} مرات خلال 15 دقيقة). يرجى المحاولة بعد ${mins} دقيقة.`,
        });
      }

      // 3. Generate cryptographically secure 6-digit OTP code (100000 - 999999)
      const otpCode = String(crypto.randomInt(100000, 1000000));
      const expiresAtMs = nowMs + OTP_TTL_MS; // Strictly 5 minutes
      const nextWindowStartMs = windowExpired ? nowMs : refWindowStartMs || nowMs;
      const nextSendCount = currentSendCount + 1;
      const nowIso = new Date(nowMs).toISOString();

      const newRecord: ServerOtpRecord = {
        id: canonicalPhone,
        phone: canonicalPhone,
        email: rawEmail,
        otpCode,
        expiresAtMs,
        attempts: 0,
        sendCount: nextSendCount,
        windowStartMs: nextWindowStartMs,
        lastSentMs: nowMs,
        verified: false,
        used: false,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      serverOtpStore.set(canonicalPhone, newRecord);

      // Update IP rate limit tracker
      ipRateLimitStore.set(clientIp, {
        count: ipState && nowMs - ipState.windowStartMs < OTP_WINDOW_MS ? ipState.count + 1 : 1,
        windowStartMs:
          ipState && nowMs - ipState.windowStartMs < OTP_WINDOW_MS ? ipState.windowStartMs : nowMs,
        lastSentMs: nowMs,
      });

      // 4. Send 6-digit OTP exclusively to user's registered Gmail via Nodemailer
      const emailDelivery = await sendOtpViaNodemailerGmail({
        toEmail: rawEmail,
        otpCode,
        subject: `🔐 كود استعادة كلمة المرور [${otpCode}] - Sahara📦 Express`,
        headerTitle: 'استعادة كلمة المرور',
        leadMessage: 'لقد تم طلب كود لإعادة تعيين كلمة المرور الخاصة بحسابك في Sahara Express. استخدم الكود السري التالي للمتابعة:',
        userName: userName || 'عضو Sahara Express',
        actionNote: 'أدخل هذا الكود في شاشة استعادة كلمة المرور لتعيين كلمة مرورك الجديدة.',
      });

      if (!emailDelivery.delivered) {
        console.error('[Forgot Password Send OTP Failed]:', emailDelivery.error);
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: emailDelivery.error === 'GMAIL_CREDENTIALS_MISSING'
            ? 'بيانات Gmail غير متوفرة بالسيرفر. يرجى ضبط GMAIL_USER و GMAIL_APP_PASSWORD في Vercel.'
            : `تعذر إرسال الإيميل عبر خادم SMTP: ${emailDelivery.error || 'خطأ في خادم البريد'}`,
          previewCode: emailDelivery.previewCode,
        });
      }

      return res.status(200).json({
        success: true,
        otpRecord: {
          id: canonicalPhone,
          phone: canonicalPhone,
          email: rawEmail,
          otp_code: otpCode,
          expires_at: new Date(expiresAtMs).toISOString(),
          expires_at_ms: expiresAtMs,
          attempts: 0,
          send_count: nextSendCount,
          window_start_ms: nextWindowStartMs,
          last_sent_ms: nowMs,
          verified: false,
          used: false,
          created_at: newRecord.createdAt,
          updated_at: nowIso,
        },
        expiresAtMs,
        ttlSeconds: 300,
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - nextSendCount),
        maxSendsPerWindow: OTP_MAX_SENDS_PER_WINDOW,
        deliveredViaGmail: emailDelivery.delivered,
        emailMessageId: emailDelivery.messageId || null,
        targetEmail: rawEmail,
        previewCode: emailDelivery.previewCode || (!emailDelivery.delivered ? otpCode : undefined),
      });
    } catch (err: any) {
      console.error('[Forgot Password Send OTP Error]:', err);
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ في الخادم أثناء توليد أو إرسال كود التحقق',
      });
    }
  });

  app.post('/api/auth/forgot-password/verify-otp', async (req, res) => {
    try {
      const canonicalPhone = cleanPhoneNumber(String(req.body?.phone || req.body?.whatsappNumber || ''));
      const codeInput = String(req.body?.otpCode || '').trim().replace(/\s+/g, '');

      if (!canonicalPhone || !/^\d{6}$/.test(codeInput)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال كود التحقق المكون من 6 أرقام بشكل صحيح',
        });
      }

      const record = serverOtpStore.get(canonicalPhone);
      if (!record) {
        // Defer to Firestore verification on client if server restarted
        return res.json({
          success: true,
          deferToCloudDb: true,
        });
      }

      const nowMs = Date.now();
      if (record.used) {
        return res.status(400).json({
          success: false,
          error: 'تم استخدام هذا الكود مسبقاً. يرجى طلب كود جديد.',
        });
      }

      if (nowMs > record.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية كود التحقق (مرت أكثر من 5 دقائق). يرجى طلب كود جديد.',
        });
      }

      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          error: 'تم تجاوز الحد الأقصى لمحاولات إدخال الكود (5 محاولات خاطئة). يرجى طلب كود جديد.',
        });
      }

      if (record.otpCode !== codeInput) {
        record.attempts += 1;
        record.updatedAt = new Date(nowMs).toISOString();
        serverOtpStore.set(canonicalPhone, record);
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts);
        return res.status(400).json({
          success: false,
          attempts: record.attempts,
          remainingAttempts,
          error:
            remainingAttempts > 0
              ? `كود التحقق غير صحيح. تبقى لديك ${remainingAttempts} محاولات.`
              : 'تم استنفاد جميع المحاولات المسموحة لهذا الكود. يرجى طلب كود جديد.',
        });
      }

      record.verified = true;
      record.updatedAt = new Date(nowMs).toISOString();
      serverOtpStore.set(canonicalPhone, record);

      return res.json({
        success: true,
        verified: true,
      });
    } catch (err) {
      console.error('[Forgot Password Verify OTP Error]:', err);
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء التحقق من الكود',
      });
    }
  });

  app.post('/api/auth/forgot-password/consume-otp', async (req, res) => {
    try {
      const canonicalPhone = cleanPhoneNumber(String(req.body?.phone || req.body?.whatsappNumber || ''));
      const record = serverOtpStore.get(canonicalPhone);
      if (record) {
        record.used = true;
        record.verified = true;
        record.updatedAt = new Date().toISOString();
        serverOtpStore.set(canonicalPhone, record);
      }
      return res.json({ success: true });
    } catch {
      return res.status(500).json({ success: false });
    }
  });

  // Authenticated User Profile Sync
  app.get('/api/me', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateUser((req as any).user);
      res.json({ user });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Cloud SQL Workspace & Data Sync Endpoint
  app.get('/api/workspace-state', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateUser((req as any).user);
      const workspaceId = (req.query.workspaceId as string) || 'ws-dakhla-main';

      let wsList: any[] = [];
      let stList: any[] = [];
      let prList: any[] = [];
      let trList: any[] = [];
      let txList: any[] = [];

      try {
        wsList = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
        stList = await db.select().from(stations).where(eq(stations.workspaceId, workspaceId));
        prList = await db
          .select()
          .from(parcels)
          .where(eq(parcels.workspaceId, workspaceId))
          .orderBy(desc(parcels.createdAt));
        trList = await db
          .select()
          .from(trips)
          .where(eq(trips.workspaceId, workspaceId))
          .orderBy(desc(trips.createdAt));
        txList = await db
          .select()
          .from(transactions)
          .where(eq(transactions.workspaceId, workspaceId))
          .orderBy(desc(transactions.createdAt));
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database query failed' });
      }

      res.json({
        user,
        workspace: wsList[0] || null,
        stations: stList,
        parcels: prList,
        trips: trList,
        transactions: txList,
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public Tracking Lookup from Cloud SQL
  app.get('/api/public-tracking/:code', async (req, res) => {
    try {
      const code = (req.params.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'Missing tracking code' });
      }
      try {
        const found = await db
          .select()
          .from(parcels)
          .where(eq(parcels.trackingCode, code))
          .limit(1);
        if (found.length === 0) {
          return res.status(404).json({ error: 'Parcel not found' });
        }
        return res.json({ parcel: found[0] });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database query failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Upsert Parcel to Cloud SQL
  app.post('/api/parcels', requireAuth, async (req, res) => {
    try {
      await getOrCreateUser((req as any).user);
      const body = req.body;
      if (!body?.id || !body?.tracking_code) {
        return res.status(400).json({ error: 'Invalid parcel payload' });
      }
      try {
        const [saved] = await db
          .insert(parcels)
          .values({
            id: String(body.id),
            workspaceId: String(body.workspace_id || 'ws-dakhla-main'),
            trackingCode: String(body.tracking_code),
            senderName: String(body.sender_name || ''),
            senderPhone: String(body.sender_phone || ''),
            receiverName: String(body.receiver_name || ''),
            receiverPhone: String(body.receiver_phone || ''),
            originStationId: String(body.origin_station_id || ''),
            destinationStationId: String(body.destination_station_id || ''),
            originStationName: body.origin_station_name ?? null,
            destinationStationName: body.destination_station_name ?? null,
            weightKg: String(body.weight_kg ?? '1.00'),
            piecesCount: Number(body.pieces_count ?? 1),
            description: body.description ?? '',
            amountDue: String(body.amount_due ?? '0.00'),
            amountPaid: String(body.amount_paid ?? '0.00'),
            currency: String(body.currency || 'MAD'),
            paymentStatus: String(body.payment_status || 'unpaid'),
            status: String(body.status || 'registered'),
            tripId: body.trip_id ?? null,
            driverName: body.driver_name ?? null,
            driverPhone: body.driver_phone ?? null,
            vehiclePlate: body.vehicle_plate ?? null,
            notes: body.notes ?? null,
          })
          .onConflictDoUpdate({
            target: parcels.id,
            set: {
              status: String(body.status || 'registered'),
              paymentStatus: String(body.payment_status || 'unpaid'),
              amountPaid: String(body.amount_paid ?? '0.00'),
              tripId: body.trip_id ?? null,
              driverName: body.driver_name ?? null,
              driverPhone: body.driver_phone ?? null,
              vehiclePlate: body.vehicle_plate ?? null,
              notes: body.notes ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();

        return res.json({ parcel: saved });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database write failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Upsert Transaction to Cloud SQL
  app.post('/api/transactions', requireAuth, async (req, res) => {
    try {
      await getOrCreateUser((req as any).user);
      const body = req.body;
      if (!body?.id || !body?.type) {
        return res.status(400).json({ error: 'Invalid transaction payload' });
      }
      try {
        const [saved] = await db
          .insert(transactions)
          .values({
            id: String(body.id),
            workspaceId: String(body.workspace_id || 'ws-dakhla-main'),
            stationId: String(body.station_id || ''),
            stationName: body.station_name ?? null,
            type: String(body.type),
            category: String(body.category || 'manual_Deposit'),
            amount: String(body.amount ?? '0.00'),
            currency: String(body.currency || 'MAD'),
            exchangeRateUsed: body.exchange_rate_used != null ? String(body.exchange_rate_used) : null,
            convertedAmount: body.converted_amount != null ? String(body.converted_amount) : null,
            convertedCurrency: body.converted_currency ?? null,
            relatedParcelId: body.related_parcel_id ?? null,
            description: String(body.description || ''),
            createdByUserId: body.created_by_user_id ?? null,
            createdByName: body.created_by_name ?? null,
          })
          .onConflictDoNothing()
          .returning();

        return res.json({ transaction: saved });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database write failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Upsert Audit Log to Cloud SQL
  app.post('/api/audit-logs', requireAuth, async (req, res) => {
    try {
      await getOrCreateUser((req as any).user);
      const body = req.body;
      if (!body?.id || !body?.action) {
        return res.status(400).json({ error: 'Invalid audit payload' });
      }
      try {
        await db
          .insert(auditLogs)
          .values({
            id: String(body.id),
            workspaceId: String(body.workspace_id || 'ws-dakhla-main'),
            userId: String(body.user_id || ''),
            userName: String(body.user_name || ''),
            userRole: String(body.user_role || 'owner'),
            action: String(body.action),
            entityType: String(body.entity_type || 'system'),
            entityId: String(body.entity_id || ''),
            details: String(body.details || ''),
          })
          .onConflictDoNothing();
        return res.json({ ok: true });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database write failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
