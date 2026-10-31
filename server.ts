import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
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
import {
  OTP_TTL_MS,
  OTP_WINDOW_MS,
  OTP_MAX_SENDS_PER_WINDOW,
  OTP_MAX_VERIFY_ATTEMPTS,
  OTP_COOLDOWN_MS,
  generateSixDigitOtp,
  hashOtpCode,
  verifyOtpHash,
  sendVerificationOtpEmail,
} from './src/lib/otpMailer.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// REGISTRATION EMAIL OTP STORE (6 Digits Hashed + 10-Min Expiry + 3/10m Limit)
// ============================================================================
interface RegistrationEmailOtpRecord {
  email: string;
  otpHash: string;
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
// PASSWORD RECOVERY OTP STORE (6 Digits Hashed + 10-Min Expiry + 3/10m Limit)
// ============================================================================
interface ServerOtpRecord {
  id: string;
  phone: string;
  email: string;
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

const serverOtpStore = new Map<string, ServerOtpRecord>();
const ipRateLimitStore = new Map<string, { count: number; windowStartMs: number; lastSentMs: number }>();

async function startServer() {
  const app = express();
  const portArgIndex = process.argv.indexOf('--port');
  const portFromArg = portArgIndex !== -1 ? Number(process.argv[portArgIndex + 1]) : null;
  const PORT = portFromArg || (process.env.NODE_ENV === 'production' && process.env.PORT ? Number(process.env.PORT) : 3000);

  app.use(express.json({ limit: '5mb' }));

  // ============================================================================
  // REGISTRATION EMAIL OTP ENDPOINTS (6-Digit Hashed OTP + 10-Min Expiry)
  // ============================================================================
  const handleSendEmailOtp = async (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const rawEmail = String(req.body?.email || req.body?.userEmail || '').trim().toLowerCase();

      if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال عنوان بريد إلكتروني صحيح',
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
          error: `يرجى الانتظار ${waitSec} ثانية قبل طلب إرسال رمز تحقق جديد.`,
        });
      }

      // Check 10-minute window limit (max 3 sends per 10 minutes)
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
          error: `تم تجاوز الحد المسموح لإرسال الرمز (${OTP_MAX_SENDS_PER_WINDOW} مرات كل 10 دقائق). يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة.`,
        });
      }

      // Generate secure 6-digit random OTP and hash it immediately (never store or log plain code)
      const otpCode = generateSixDigitOtp();
      const otpHash = hashOtpCode(otpCode, rawEmail);
      const expiresAtMs = nowMs + OTP_TTL_MS; // 10 minutes

      const emailDelivery = await sendVerificationOtpEmail(rawEmail, otpCode);

      if (!emailDelivery.delivered) {
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: emailDelivery.error || 'تعذر إرسال رمز التحقق عبر خدمة البريد',
        });
      }

      const newRecord: RegistrationEmailOtpRecord = {
        email: rawEmail,
        otpHash,
        expiresAtMs,
        attempts: 0,
        sendCount: sendCount + 1,
        windowStartMs: windowExpired ? nowMs : existing?.windowStartMs || nowMs,
        lastSentMs: nowMs,
        verified: false,
        createdAt: existing?.createdAt || new Date(nowMs).toISOString(),
      };
      registrationEmailOtpStore.set(rawEmail, newRecord);

      return res.status(200).json({
        success: true,
        email: rawEmail,
        expiresAtMs,
        ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - newRecord.sendCount),
        deliveredViaGmail: true,
        messageId: emailDelivery.messageId || null,
        otpRecord: {
          email: rawEmail,
          otp_hash: otpHash,
          expires_at_ms: expiresAtMs,
          attempts: 0,
          send_count: newRecord.sendCount,
          window_start_ms: newRecord.windowStartMs,
          last_sent_ms: nowMs,
        },
      });
    } catch (err: any) {
      console.error('[Registration Send Email OTP Error]:', { message: err?.message });
      return res.status(500).json({
        success: false,
        error: err?.message || 'حدث خطأ في الخادم أثناء معالجة طلب البريد الإلكتروني',
      });
    }
  };

  const handleVerifyEmailOtp = async (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const rawEmail = String(req.body?.email || '').trim().toLowerCase();
      const codeInput = String(req.body?.otpCode || '').trim().replace(/\s+/g, '');
      const clientRecord = req.body?.otpRecord;

      if (!rawEmail || !/^\d{6}$/.test(codeInput)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً',
        });
      }

      const nowMs = Date.now();
      let record = registrationEmailOtpStore.get(rawEmail);
      if (!record && clientRecord?.otp_hash && clientRecord?.expires_at_ms) {
        record = {
          email: rawEmail,
          otpHash: String(clientRecord.otp_hash),
          expiresAtMs: Number(clientRecord.expires_at_ms),
          attempts: Number(clientRecord.attempts || 0),
          sendCount: Number(clientRecord.send_count || 1),
          windowStartMs: Number(clientRecord.window_start_ms || nowMs),
          lastSentMs: Number(clientRecord.last_sent_ms || nowMs),
          verified: false,
          createdAt: new Date(nowMs).toISOString(),
        };
      }

      if (!record) {
        return res.status(400).json({
          success: false,
          error: 'لم يتم العثور على طلب تحقق نشط لهذا البريد. يرجى طلب رمز جديد.',
        });
      }

      if (nowMs > record.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية رمز التحقق (مرت 10 دقائق). يرجى طلب رمز جديد.',
        });
      }

      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          error: 'تم تجاوز الحد الأقصى للمحاولات الخاطئة (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      if (!verifyOtpHash(codeInput, record.otpHash, rawEmail)) {
        record.attempts += 1;
        registrationEmailOtpStore.set(rawEmail, record);
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts);
        return res.status(400).json({
          success: false,
          attempts: record.attempts,
          remainingAttempts,
          error:
            remainingAttempts > 0
              ? `رمز التحقق غير صحيح. المحاولات المتبقية: ${remainingAttempts}`
              : 'تم استنفاد جميع المحاولات المسموحة (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      record.verified = true;
      registrationEmailOtpStore.set(rawEmail, record);

      return res.json({
        success: true,
        verified: true,
        email: rawEmail,
      });
    } catch (err: any) {
      console.error('[Registration Verify Email OTP Error]:', { message: err?.message });
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء التحقق من رمز البريد الإلكتروني',
      });
    }
  };

  app.post('/api/auth/register/send-email-otp', handleSendEmailOtp);
  app.post('/api/register/send-otp', handleSendEmailOtp);
  app.post('/api/send-otp', handleSendEmailOtp);
  app.post('/api/register', (req, res) => {
    if (req.body?.otpCode) {
      return handleVerifyEmailOtp(req, res);
    }
    return handleSendEmailOtp(req, res);
  });
  app.post('/api/auth/register/verify-email-otp', handleVerifyEmailOtp);

  // ============================================================================
  // FORGOT PASSWORD EMAIL OTP ENDPOINT (6-Digit Hashed OTP + 10-Min Expiry)
  // ============================================================================
  app.post('/api/auth/forgot-password/send-otp', async (req, res) => {
    try {
      const rawPhone = String(req.body?.phone || '').trim();
      const rawEmail = String(req.body?.targetEmail || req.body?.email || '').trim().toLowerCase();
      const clientOtpRecord = req.body?.existingRateState;

      const canonicalPhone = cleanPhoneNumber(rawPhone) || (rawEmail ? rawEmail.replace(/[^a-zA-Z0-9]/g, '_') : '');

      if (!rawEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال البريد الإلكتروني المسجل لاستلام رمز التحقق.',
        });
      }

      const nowMs = Date.now();
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        'unknown-ip';

      // 1. Check IP-level Rate Limit (3 sends per 10 minutes)
      const ipState = ipRateLimitStore.get(clientIp);
      if (ipState) {
        const ipWindowExpired = nowMs - ipState.windowStartMs >= OTP_WINDOW_MS;
        if (!ipWindowExpired && ipState.count >= OTP_MAX_SENDS_PER_WINDOW) {
          const retryAfterSec = Math.max(1, Math.ceil((OTP_WINDOW_MS - (nowMs - ipState.windowStartMs)) / 1000));
          return res.status(429).json({
            success: false,
            rateLimited: true,
            retryAfterSeconds: retryAfterSec,
            error: `تم تجاوز الحد المسموح لإرسال الرمز (${OTP_MAX_SENDS_PER_WINDOW} مرات كل 10 دقائق). يرجى الانتظار ${Math.ceil(retryAfterSec / 60)} دقيقة.`,
          });
        }
      }

      // 2. Check User Rate Limit (max 3 sends per 10 minutes)
      const existing = serverOtpStore.get(canonicalPhone) || serverOtpStore.get(rawEmail);
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

      if (refLastSentMs && nowMs - refLastSentMs < OTP_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_COOLDOWN_MS - (nowMs - refLastSentMs)) / 1000);
        return res.status(429).json({
          success: false,
          rateLimited: true,
          cooldownSeconds: waitSec,
          retryAfterSeconds: waitSec,
          error: `يرجى الانتظار ${waitSec} ثانية قبل طلب إرسال رمز جديد.`,
        });
      }

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
          error: `لقد وصلت للحد الأقصى لإرسال الرمز (${OTP_MAX_SENDS_PER_WINDOW} مرات كل 10 دقائق). يرجى المحاولة بعد ${mins} دقيقة.`,
        });
      }

      // 3. Generate cryptographically random 6-digit OTP and store only its hash
      const otpCode = generateSixDigitOtp();
      const otpHash = hashOtpCode(otpCode, canonicalPhone);
      const expiresAtMs = nowMs + OTP_TTL_MS; // 10 minutes
      const nextWindowStartMs = windowExpired ? nowMs : refWindowStartMs || nowMs;
      const nextSendCount = currentSendCount + 1;
      const nowIso = new Date(nowMs).toISOString();

      // 4. Send 6-digit OTP via dedicated transactional email API (Resend or Brevo)
      const emailDelivery = await sendVerificationOtpEmail(rawEmail, otpCode);

      if (!emailDelivery.delivered) {
        return res.status(500).json({
          success: false,
          deliveredViaGmail: false,
          error: emailDelivery.error || 'تعذر إرسال رمز التحقق عبر خدمة البريد',
        });
      }

      const newRecord: ServerOtpRecord = {
        id: canonicalPhone,
        phone: canonicalPhone,
        email: rawEmail,
        otpHash,
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
      serverOtpStore.set(rawEmail, newRecord);

      ipRateLimitStore.set(clientIp, {
        count: ipState && nowMs - ipState.windowStartMs < OTP_WINDOW_MS ? ipState.count + 1 : 1,
        windowStartMs:
          ipState && nowMs - ipState.windowStartMs < OTP_WINDOW_MS ? ipState.windowStartMs : nowMs,
        lastSentMs: nowMs,
      });

      return res.status(200).json({
        success: true,
        otpRecord: {
          id: canonicalPhone,
          phone: canonicalPhone,
          email: rawEmail,
          otp_hash: otpHash,
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
        ttlSeconds: Math.floor(OTP_TTL_MS / 1000),
        cooldownSeconds: Math.floor(OTP_COOLDOWN_MS / 1000),
        remainingSends: Math.max(0, OTP_MAX_SENDS_PER_WINDOW - nextSendCount),
        maxSendsPerWindow: OTP_MAX_SENDS_PER_WINDOW,
        deliveredViaGmail: true,
        emailMessageId: emailDelivery.messageId || null,
        targetEmail: rawEmail,
      });
    } catch (err: any) {
      console.error('[Forgot Password Send OTP Error]:', { message: err?.message });
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ في الخادم أثناء توليد أو إرسال رمز التحقق',
      });
    }
  });

  app.post('/api/auth/forgot-password/verify-otp', async (req, res) => {
    try {
      const rawPhone = String(req.body?.phone || req.body?.whatsappNumber || '').trim();
      const rawEmail = String(req.body?.email || '').trim().toLowerCase();
      const canonicalPhone = cleanPhoneNumber(rawPhone) || (rawEmail ? rawEmail.replace(/[^a-zA-Z0-9]/g, '_') : '');
      const codeInput = String(req.body?.otpCode || '').trim().replace(/\s+/g, '');
      const clientRecord = req.body?.otpRecord;

      if ((!canonicalPhone && !rawEmail) || !/^\d{6}$/.test(codeInput)) {
        return res.status(400).json({
          success: false,
          error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام بشكل صحيح',
        });
      }

      let record = serverOtpStore.get(canonicalPhone) || (rawEmail ? serverOtpStore.get(rawEmail) : undefined);

      // Reconstruct from hashed client/cloud state if serverless instance restarted
      if (!record && clientRecord?.otp_hash && clientRecord?.expires_at_ms) {
        record = {
          id: canonicalPhone,
          phone: canonicalPhone,
          email: rawEmail || String(clientRecord.email || ''),
          otpHash: String(clientRecord.otp_hash),
          expiresAtMs: Number(clientRecord.expires_at_ms),
          attempts: Number(clientRecord.attempts || 0),
          sendCount: Number(clientRecord.send_count || 1),
          windowStartMs: Number(clientRecord.window_start_ms || Date.now()),
          lastSentMs: Number(clientRecord.last_sent_ms || Date.now()),
          verified: Boolean(clientRecord.verified),
          used: Boolean(clientRecord.used),
          createdAt: String(clientRecord.created_at || new Date().toISOString()),
          updatedAt: new Date().toISOString(),
        };
      }

      if (!record) {
        return res.status(400).json({
          success: false,
          error: 'لا يوجد رمز تحقق نشط. يرجى طلب إرسال رمز جديد.',
        });
      }

      const nowMs = Date.now();
      if (record.used) {
        return res.status(400).json({
          success: false,
          error: 'تم استخدام هذا الرمز مسبقاً. يرجى طلب رمز جديد.',
        });
      }

      if (nowMs > record.expiresAtMs) {
        return res.status(400).json({
          success: false,
          expired: true,
          error: 'انتهت صلاحية رمز التحقق (مرت 10 دقائق). يرجى طلب رمز جديد.',
        });
      }

      if (record.attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
        return res.status(429).json({
          success: false,
          locked: true,
          remainingAttempts: 0,
          error: 'تم تجاوز الحد الأقصى لمحاولات إدخال الرمز (5 محاولات خاطئة). يرجى طلب رمز جديد.',
        });
      }

      const isValid =
        verifyOtpHash(codeInput, record.otpHash, record.id) ||
        (record.email ? verifyOtpHash(codeInput, record.otpHash, record.email) : false);

      if (!isValid) {
        record.attempts += 1;
        record.updatedAt = new Date(nowMs).toISOString();
        serverOtpStore.set(record.id, record);
        if (record.email) serverOtpStore.set(record.email, record);
        const remainingAttempts = Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts);
        return res.status(400).json({
          success: false,
          attempts: record.attempts,
          remainingAttempts,
          locked: remainingAttempts === 0,
          error:
            remainingAttempts > 0
              ? `رمز التحقق غير صحيح. تبقى لديك ${remainingAttempts} محاولات.`
              : 'تم استنفاد جميع المحاولات المسموحة لهذا الرمز (5 محاولات). يرجى طلب رمز جديد.',
        });
      }

      record.verified = true;
      record.updatedAt = new Date(nowMs).toISOString();
      serverOtpStore.set(record.id, record);
      if (record.email) serverOtpStore.set(record.email, record);

      return res.json({
        success: true,
        verified: true,
        remainingAttempts: Math.max(0, OTP_MAX_VERIFY_ATTEMPTS - record.attempts),
      });
    } catch (err: any) {
      console.error('[Forgot Password Verify OTP Error]:', { message: err?.message });
      return res.status(500).json({
        success: false,
        error: 'حدث خطأ أثناء التحقق من الرمز',
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
        if (record.email) serverOtpStore.set(record.email, record);
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
