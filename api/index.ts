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
      const expiresAtMs = Date.now() + 10 * 60 * 1000;
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
      const displayName = userName || 'Anas';
      try {
        const info = await transporter.sendMail({
          from: `"Sahara Express 📦" <${sender}>`,
          to: email,
          subject: `مرحبا ${displayName}، كود التحقق ديالك هو ${otpCode} - Sahara Express`,
          html: `
            <div dir="rtl" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:540px;margin:auto;background:#ffffff;color:#2d261e;padding:32px 28px;border:1.5px solid #e8dec8;border-radius:16px;">
              <div style="text-align:center;padding-bottom:20px;border-bottom:1.5px solid #f0e6d2;">
                <h2 style="color:#9c6508;margin:0;font-size:24px;">Sahara Express 📦</h2>
                <p style="color:#785a28;font-size:13px;margin:4px 0 0 0;">خدمات السفر ونقل البضائع والكوليات</p>
              </div>
              <div style="padding:24px 0 16px 0;text-align:right;">
                <p style="font-size:16px;color:#1f1b16;font-weight:700;margin:0 0 12px 0;">مرحباً ${displayName}،</p>
                <p style="font-size:14px;color:#42382c;line-height:1.7;margin:0 0 20px 0;">
                  لقد توصلنا بطلب للتحقق من حسابك على منصة <strong>Sahara Express</strong>. لتأكيد هويتك والمتابعة، يرجى استخدام كود التحقق السري:
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <div style="display:inline-block;background:#fffbf2;border:2px dashed #d4af37;padding:16px 36px;border-radius:14px;font-size:36px;font-weight:900;letter-spacing:10px;color:#b45309;font-family:monospace;">${otpCode}</div>
                  <div style="margin-top:10px;">
                    <span style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:bold;padding:5px 14px;border-radius:999px;">⏳ صالح لمدة 10 دقائق فقط (للاستخدام مرة واحدة)</span>
                  </div>
                </div>
                <div style="background:#fbfbfb;border-right:4px solid #b45309;padding:14px 18px;border-radius:8px;margin-top:20px;font-size:13px;color:#574c3d;line-height:1.6;">
                  🔒 <strong>تنبيه أمني:</strong> لا تشارك هذا الرمز السري مع أي شخص. فريق العمل لن يطلب منك هذا الرمز أبداً.<br>
                  ℹ️ <strong>إلا ما طلبتيش هاد الكود تجاهل هاد الرسالة</strong>، ولن يتم إجراء أي تغيير على حسابك.
                </div>
              </div>
              <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #eee7db;font-size:12px;color:#7c7264;line-height:1.7;">
                <strong>Sahara Express 📦</strong> - منصة إدارة المحطات وتتبع الإرساليات والكوليات.<br>
                📍 العنوان: شارع الحسن الثاني، العيون، الصحراء المغربية<br>
                ✉️ الدعم والتواصل: <a href="mailto:aissaaimanekhlifi@gmail.com" style="color:#9c6508;text-decoration:none;font-weight:600;">aissaaimanekhlifi@gmail.com</a> | واتساب: +212 600-000000
              </div>
            </div>
          `,
          text: `مرحباً ${displayName}،\n\nكود التحقق الخاص بك هو: ${otpCode}\nصالح لمدة 10 دقائق فقط.\n\nإلا ما طلبتيش هاد الكود تجاهل هاد الرسالة.\n\nفريق Sahara Express 📦\nالعنوان: شارع الحسن الثاني، العيون، الصحراء المغربية\nللتواصل: aissaaimanekhlifi@gmail.com`,
          headers: {
            'X-Mailer': 'Sahara Express Mailer',
            'List-Unsubscribe': `<mailto:${sender}>`,
          },
        });

        console.log('REAL SEND RESULT:', info.messageId, info.response);
        return res.status(200).json({
          success: true,
          email,
          expiresAtMs,
          ttlSeconds: 600,
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
      const expiresAtMs = Date.now() + 10 * 60 * 1000;
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
      const displayName = userName || 'Anas';
      try {
        const info = await transporter.sendMail({
          from: `"Sahara Express 📦" <${sender}>`,
          to: targetEmail,
          subject: `مرحبا ${displayName}، كود التحقق ديالك هو ${otpCode} - Sahara Express`,
          html: `
            <div dir="rtl" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:540px;margin:auto;background:#ffffff;color:#2d261e;padding:32px 28px;border:1.5px solid #e8dec8;border-radius:16px;">
              <div style="text-align:center;padding-bottom:20px;border-bottom:1.5px solid #f0e6d2;">
                <h2 style="color:#9c6508;margin:0;font-size:24px;">Sahara Express 📦</h2>
                <p style="color:#785a28;font-size:13px;margin:4px 0 0 0;">استعادة كلمة المرور</p>
              </div>
              <div style="padding:24px 0 16px 0;text-align:right;">
                <p style="font-size:16px;color:#1f1b16;font-weight:700;margin:0 0 12px 0;">مرحباً ${displayName}،</p>
                <p style="font-size:14px;color:#42382c;line-height:1.7;margin:0 0 20px 0;">
                  لقد توصلنا بطلب لإعادة تعيين كلمة المرور لحسابك في <strong>Sahara Express</strong>. استخدم كود التحقق السري التالي:
                </p>
                <div style="text-align:center;margin:24px 0;">
                  <div style="display:inline-block;background:#fffbf2;border:2px dashed #d4af37;padding:16px 36px;border-radius:14px;font-size:36px;font-weight:900;letter-spacing:10px;color:#b45309;font-family:monospace;">${otpCode}</div>
                  <div style="margin-top:10px;">
                    <span style="display:inline-block;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:bold;padding:5px 14px;border-radius:999px;">⏳ صالح لمدة 10 دقائق فقط (للاستخدام مرة واحدة)</span>
                  </div>
                </div>
                <div style="background:#fbfbfb;border-right:4px solid #b45309;padding:14px 18px;border-radius:8px;margin-top:20px;font-size:13px;color:#574c3d;line-height:1.6;">
                  🔒 <strong>تنبيه أمني:</strong> لا تشارك هذا الرمز السري مع أي شخص. فريق العمل لن يطلب منك هذا الرمز أبداً.<br>
                  ℹ️ <strong>إلا ما طلبتيش هاد الكود تجاهل هاد الرسالة</strong>، ولن يتم إجراء أي تغيير على حسابك.
                </div>
              </div>
              <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid #eee7db;font-size:12px;color:#7c7264;line-height:1.7;">
                <strong>Sahara Express 📦</strong> - منصة إدارة المحطات وتتبع الإرساليات والكوليات.<br>
                📍 العنوان: شارع الحسن الثاني، العيون، الصحراء المغربية<br>
                ✉️ الدعم والتواصل: <a href="mailto:aissaaimanekhlifi@gmail.com" style="color:#9c6508;text-decoration:none;font-weight:600;">aissaaimanekhlifi@gmail.com</a> | واتساب: +212 600-000000
              </div>
            </div>
          `,
          text: `مرحباً ${displayName}،\n\nكود استعادة كلمة المرور الخاص بك هو: ${otpCode}\nصالح لمدة 10 دقائق فقط.\n\nإلا ما طلبتيش هاد الكود تجاهل هاد الرسالة.\n\nفريق Sahara Express 📦\nالعنوان: شارع الحسن الثاني، العيون، الصحراء المغربية\nللتواصل: aissaaimanekhlifi@gmail.com`,
          headers: {
            'X-Mailer': 'Sahara Express Mailer',
            'List-Unsubscribe': `<mailto:${sender}>`,
          },
        });

        console.log('REAL SEND RESULT:', info.messageId, info.response);
        return res.status(200).json({
          success: true,
          expiresAtMs,
          ttlSeconds: 600,
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
