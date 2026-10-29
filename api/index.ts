import nodemailer from 'nodemailer';
import crypto from 'crypto';

interface OtpEntry {
  code: string;
  expiresAtMs: number;
  attempts: number;
}

const memoryStore = new Map<string, OtpEntry>();

function getTransporter() {
  const user = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
  const pass = (process.env.GMAIL_APP_PASSWORD || 'fntivyfldifqgxwl').replace(/\s+/g, '');
  if (!user || !pass) {
    console.warn('[Vercel API /index] GMAIL_USER or GMAIL_APP_PASSWORD missing');
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
  // Always guarantee JSON response
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

    // 1. Route: Send Registration Email OTP
    if (url.includes('register/send') || url.includes('/api/register') || url.includes('register-otp')) {
      const email = String(body?.email || body?.userEmail || '').trim().toLowerCase();
      const userName = String(body?.userName || body?.name || 'عضو جديد').trim();

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' });
      }

      const otpCode = String(crypto.randomInt(100000, 1000000));
      const expiresAtMs = Date.now() + 5 * 60 * 1000;
      memoryStore.set(email, { code: otpCode, expiresAtMs, attempts: 0 });

      const transporter = getTransporter();
      if (!transporter) {
        return res.status(500).json({
          success: false,
          error: 'إعدادات Gmail غير متوفرة في بيئة Vercel. يرجى إضافة GMAIL_USER و GMAIL_APP_PASSWORD في Vercel.',
          previewCode: otpCode,
        });
      }

      const sender = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
      try {
        const info = await transporter.sendMail({
          from: `"Sahara📦 Express" <${sender}>`,
          to: email,
          subject: `🔐 كود تأكيد التسجيل [${otpCode}] - Sahara📦 Express`,
          html: `<div dir="rtl" style="font-family:sans-serif;background:#1a0f00;color:#f5d799;padding:24px;border:1px solid #d4af37;border-radius:16px;">
            <h2 style="color:#f5b05b;text-align:center;">Sahara📦 Express</h2>
            <p>مرحباً ${userName}، كود التحقق الخاص بك هو:</p>
            <div style="font-size:32px;font-family:monospace;letter-spacing:8px;color:#f5b05b;text-align:center;padding:12px;background:#000;border-radius:10px;margin:16px 0;">${otpCode}</div>
            <p style="font-size:12px;color:#c8b08a;text-align:center;">صالح لمدة 5 دقائق فقط.</p>
          </div>`,
          text: `كود التحقق الخاص بك هو: ${otpCode}`,
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
        console.error('[Vercel API /index SMTP Error Details]:', {
          to: email,
          message: smtpErr?.message,
          code: smtpErr?.code,
          command: smtpErr?.command,
          response: smtpErr?.response,
        });
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: `فشل إرسال كود التحقق عبر البريد: ${smtpErr?.message || 'خطأ في خادم SMTP'}`,
          previewCode: otpCode,
        });
      }
    }

    // 2. Route: Verify Registration Email OTP
    if (url.includes('register/verify')) {
      const email = String(body?.email || '').trim().toLowerCase();
      const code = String(body?.otpCode || '').trim();

      if (!email || !/^\d{6}$/.test(code)) {
        return res.status(400).json({ success: false, error: 'يرجى إدخال كود التحقق المكون من 6 أرقام كاملاً' });
      }

      const record = memoryStore.get(email);
      if (record && Date.now() > record.expiresAtMs) {
        return res.status(400).json({ success: false, error: 'انتهت صلاحية كود التحقق (5 دقائق). يرجى طلب كود جديد.' });
      }

      if (record && record.code !== code) {
        record.attempts += 1;
        return res.status(400).json({ success: false, error: 'كود التحقق غير صحيح. تأكد من الكود المرسل لبريدك.' });
      }

      return res.status(200).json({ success: true, verified: true, email });
    }

    // 3. Route: Forgot Password Send OTP
    if (url.includes('forgot-password/send-otp')) {
      const targetEmail = String(body?.targetEmail || body?.email || '').trim().toLowerCase();
      const phone = String(body?.phone || '').trim();
      const userName = String(body?.userName || 'عضو Sahara Express').trim();

      if (!targetEmail || !targetEmail.includes('@')) {
        return res.status(400).json({ success: false, error: 'بريد Gmail غير متوفر لهذا الحساب' });
      }

      const otpCode = String(crypto.randomInt(100000, 1000000));
      const expiresAtMs = Date.now() + 5 * 60 * 1000;
      memoryStore.set(targetEmail, { code: otpCode, expiresAtMs, attempts: 0 });

      const transporter = getTransporter();
      if (!transporter) {
        return res.status(500).json({
          success: false,
          error: 'بيانات Gmail غير متوفرة في بيئة Vercel. يرجى إضافة GMAIL_USER و GMAIL_APP_PASSWORD في Vercel.',
          previewCode: otpCode,
        });
      }

      const sender = (process.env.GMAIL_USER || 'aissaaimanekhlifi@gmail.com').trim();
      try {
        const info = await transporter.sendMail({
          from: `"Sahara📦 Express" <${sender}>`,
          to: targetEmail,
          subject: `🔐 كود استعادة كلمة المرور [${otpCode}] - Sahara📦 Express`,
          html: `<div dir="rtl" style="font-family:sans-serif;background:#1a0f00;color:#f5d799;padding:24px;border:1px solid #d4af37;border-radius:16px;">
            <h2 style="color:#f5b05b;text-align:center;">استعادة كلمة المرور - Sahara📦 Express</h2>
            <p>مرحباً ${userName}، كود استعادة كلمة المرور هو:</p>
            <div style="font-size:32px;font-family:monospace;letter-spacing:8px;color:#f5b05b;text-align:center;padding:12px;background:#000;border-radius:10px;margin:16px 0;">${otpCode}</div>
            <p style="font-size:12px;color:#c8b08a;text-align:center;">صالح لمدة 5 دقائق فقط.</p>
          </div>`,
          text: `كود استعادة كلمة المرور هو: ${otpCode}`,
        });

        console.log('REAL SEND RESULT:', info.messageId, info.response);
        return res.status(200).json({
          success: true,
          expiresAtMs,
          ttlSeconds: 300,
          cooldownSeconds: 60,
          remainingSends: 2,
          maxSendsPerWindow: 3,
          deliveredViaGmail: true,
          targetEmail,
          messageId: info.messageId,
          otpRecord: {
            id: phone || targetEmail,
            phone,
            email: targetEmail,
            otp_code: otpCode,
            expires_at_ms: expiresAtMs,
          },
        });
      } catch (smtpErr: any) {
        console.error('[Vercel API /index Forgot Password SMTP Error]:', smtpErr);
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: `تعذر إرسال كود الاستعادة عبر البريد: ${smtpErr?.message || 'خطأ في خادم SMTP'}`,
          previewCode: otpCode,
        });
      }
    }

    // Default Fallback
    return res.status(200).json({
      success: true,
      service: 'Sahara Express API',
      status: 'operational',
      url,
    });
  } catch (err: any) {
    console.error('[Vercel API /index Fatal Catch]:', err);
    return res.status(500).json({
      success: false,
      error: err?.message || 'حدث خطأ في الخادم أثناء معالجة الطلب',
    });
  }
}
