import nodemailer from 'nodemailer';
import crypto from 'crypto';

function getTransporter() {
  const user = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || 'fntivyfldifqgxwl').replace(/\s+/g, '');
  if (!user || !pass) {
    console.warn('[Vercel api/send-otp] Missing GMAIL credentials');
    return null;
  }
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });
}

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
    const userName = String(body?.userName || body?.name || 'عضو جديد').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
    }

    const transporter = getTransporter();
    if (!transporter) {
      return res.status(500).json({
        success: false,
        error: 'إعدادات البريد غير متوفرة بالسيرفر. يرجى ضبط GMAIL_USER و GMAIL_APP_PASSWORD في Vercel.',
      });
    }

    const otpCode = String(crypto.randomInt(100000, 1000000));
    const expiresAtMs = Date.now() + 5 * 60 * 1000;
    const sender = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();

    const info = await transporter.sendMail({
      from: `"Sahara📦 Express" <${sender}>`,
      to: email,
      subject: `🔐 كود التحقق [${otpCode}] - Sahara📦 Express`,
      html: `
        <div dir="rtl" style="font-family:sans-serif;max-width:500px;margin:auto;background:#1a0f00;color:#f5d799;padding:24px;border:2px solid #d4af37;border-radius:18px;">
          <h2 style="color:#f5b05b;text-align:center;">Sahara📦 Express</h2>
          <p style="color:#fff;">مرحباً ${userName}،</p>
          <p style="color:#e0d2bd;">كود التحقق السري الخاص بك هو:</p>
          <div style="text-align:center;margin:20px 0;">
            <div style="display:inline-block;background:#000;border:2px dashed #f5b05b;padding:14px 28px;border-radius:12px;font-size:34px;font-weight:900;letter-spacing:10px;color:#f5b05b;font-family:monospace;">${otpCode}</div>
          </div>
          <p style="font-size:12px;color:#c8b08a;text-align:center;">⏳ صالح لمدة 5 دقائق فقط.</p>
        </div>
      `,
      text: `كود التحقق الخاص بك هو: ${otpCode} (صالح لمدة 5 دقائق)`,
    });

    console.log('REAL SEND RESULT:', info.messageId, info.response);

    return res.status(200).json({
      success: true,
      email,
      expiresAtMs,
      ttlSeconds: 300,
      cooldownSeconds: 60,
      deliveredViaGmail: true,
      messageId: info.messageId,
    });
  } catch (smtpErr: any) {
    console.error('[REAL SEND ERROR]:', {
      message: smtpErr?.message,
      code: smtpErr?.code,
      command: smtpErr?.command,
      response: smtpErr?.response,
      responseCode: smtpErr?.responseCode,
    });

    return res.status(500).json({
      success: false,
      deliveredViaGmail: false,
      error: `فشل إرسال كود التحقق عبر البريد: ${smtpErr?.message || 'خطأ في خادم SMTP'}`,
    });
  }
}
