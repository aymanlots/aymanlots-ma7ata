import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface RegistrationRecord {
  email: string;
  otpCode: string;
  expiresAtMs: number;
}

// In-memory fallback cache (per serverless instance)
const emailCache = new Map<string, RegistrationRecord>();

function getTransporter() {
  const user = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || 'fntivyfldifqgxwl').replace(/\s+/g, '');
  if (!user || !pass) {
    console.warn('[Vercel API /register] GMAIL_USER or GMAIL_APP_PASSWORD missing in process.env');
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export default async function handler(req: any, res: any) {
  // Always guarantee JSON response header
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // Handle CORS Preflight
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
    const userName = String(body?.userName || body?.name || 'عضو جديد').trim();
    const otpCodeInput = String(body?.otpCode || '').trim();

    // Verification Mode (if otpCode passed)
    if (otpCodeInput) {
      if (!rawEmail || !/^\d{6}$/.test(otpCodeInput)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال كود التحقق المكون من 6 أرقام كاملاً' });
      }
      const cached = emailCache.get(rawEmail);
      if (cached && Date.now() > cached.expiresAtMs) {
        return res.status(400).json({ success: false, error: 'انتهت صلاحية كود التحقق (5 دقائق). اطلب كوداً جديداً.' });
      }
      if (cached && cached.otpCode !== otpCodeInput) {
        return res.status(400).json({ success: false, error: 'كود التحقق غير صحيح' });
      }
      return res.status(200).json({ success: true, verified: true, email: rawEmail });
    }

    // Send OTP Mode
    if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
    }

    const otpCode = String(crypto.randomInt(100000, 1000000));
    const expiresAtMs = Date.now() + 5 * 60 * 1000;
    emailCache.set(rawEmail, { email: rawEmail, otpCode, expiresAtMs });

    const transporter = getTransporter();
    if (!transporter) {
      console.error('[Vercel API /register] Transporter initialization failed due to missing credentials');
      return res.status(500).json({
        success: false,
        error: 'بيانات Gmail غير متوفرة في بيئة Vercel. يرجى إضافة GMAIL_USER و GMAIL_APP_PASSWORD في إعدادات Vercel Environment Variables.',
        previewCode: otpCode,
      });
    }

    const sender = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
    const html = `
      <div dir="rtl" style="font-family:Arial,sans-serif;max-width:500px;margin:auto;background:#1a0f00;color:#f5d799;border:1.5px solid #d4af37;border-radius:18px;padding:24px;">
        <h2 style="color:#f5b05b;text-align:center;margin-top:0;">Sahara📦 Express</h2>
        <p style="color:#fff;font-size:14px;line-height:1.6;">مرحباً ${userName}،<br>كود التحقق الخاص بتأكيد تسجيل حسابك هو:</p>
        <div style="text-align:center;margin:22px 0;">
          <div style="display:inline-block;background:#080400;border:2px dashed #f5b05b;padding:14px 28px;border-radius:12px;font-size:32px;font-weight:900;letter-spacing:10px;color:#f5b05b;font-family:monospace;">${otpCode}</div>
        </div>
        <p style="color:#c8b08a;font-size:12px;text-align:center;">⏳ صالح لمدة 5 دقائق فقط. لا تشاركه مع أي شخص.</p>
      </div>
    `;

    try {
      const sendInfo = await transporter.sendMail({
        from: `"Sahara📦 Express" <${sender}>`,
        to: rawEmail,
        subject: `🔐 كود تأكيد التسجيل [${otpCode}] - Sahara📦 Express`,
        html,
        text: `كود التحقق الخاص بك هو: ${otpCode} (صالح لمدة 5 دقائق)`,
      });

      console.log(`[Vercel API /register SMTP Success] Sent to ${rawEmail}, messageId: ${sendInfo.messageId}`);

      return res.status(200).json({
        success: true,
        email: rawEmail,
        expiresAtMs,
        ttlSeconds: 300,
        cooldownSeconds: 60,
        deliveredViaGmail: true,
        messageId: sendInfo.messageId,
      });
    } catch (smtpErr: any) {
      console.error('[Vercel API /register SMTP Error Details]:', {
        to: rawEmail,
        message: smtpErr?.message,
        code: smtpErr?.code,
        command: smtpErr?.command,
        response: smtpErr?.response,
        responseCode: smtpErr?.responseCode,
      });

      return res.status(500).json({
        success: false,
        deliveredViaGmail: false,
        error: `تعذر إرسال كود التحقق عبر البريد الإلكتروني: ${smtpErr?.message || 'خطأ في خادم SMTP'}`,
        previewCode: otpCode,
      });
    }
  } catch (err: any) {
    console.error('[Vercel API /register Fatal Error]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'حدث خطأ في الخادم أثناء معالجة الطلب',
    });
  }
}
