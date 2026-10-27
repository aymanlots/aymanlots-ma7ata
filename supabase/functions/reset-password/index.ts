// Supabase Edge Function: reset-password
// وظيفة الخادم لإعادة تعيين كلمات المرور وإنشاء حسابات العمال بأمان تام
// يستخدم مفتاح SUPABASE_SERVICE_ROLE_KEY حصراً داخل متغيرات بيئة الخادم (Deno.env) ولا يظهر أبداً في كود المتصفح.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let digits = phone.trim().replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.startsWith('00212')) digits = '212' + digits.slice(5);
  else if (digits.startsWith('00222')) digits = '222' + digits.slice(5);
  if (digits.startsWith('2120') && digits.length === 13) digits = '212' + digits.slice(4);
  if (digits.length === 10 && /^0[567]\d{8}$/.test(digits)) return '212' + digits.slice(1);
  if (digits.length === 9 && /^[567]\d{8}$/.test(digits)) return '212' + digits;
  if (digits.startsWith('2220') && digits.length === 12) digits = '222' + digits.slice(4);
  if (digits.length === 8 && /^[234]\d{7}$/.test(digits)) return '222' + digits;
  return digits;
}

function generateRandomTempPassword(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  let part = '';
  for (let i = 0; i < 8; i++) {
    part += chars.charAt(randomBytes[i] % chars.length);
  }
  return `Itt-${part}`;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'إعدادات بيئة الخادم غير مكتملة' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const action = body.action || 'reset_password';

    // عميل الإدارة الداخلي (Service Role داخل الخادم فقط)
    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // =========================================================================
    // العملية 0: استعادة تلقائية لكلمة مرور المدير وإرسالها إلى رقم الواتساب المسجل
    // =========================================================================
    if (action === 'auto_recover_manager') {
      const { target_phone } = body;
      const canonicalPhone = normalizePhoneNumber(target_phone || '');
      if (!canonicalPhone || canonicalPhone.length < 8) {
        return new Response(
          JSON.stringify({ success: false, error: 'يرجى إدخال رقم الهاتف المسجل به بشكل صحيح' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('*')
        .or(`phone.eq.${canonicalPhone},phone.eq.${(target_phone || '').trim()}`)
        .maybeSingle();

      if (!targetProfile) {
        return new Response(
          JSON.stringify({ success: false, error: 'لم يتم العثور على حساب مدير مسجل بهذا الرقم' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // التحقق من أن صاحب الحساب هو مدير مساحة عمل (admin)
      const { data: adminMembership } = await adminClient
        .from('workspace_members')
        .select('role, status, workspace_id')
        .eq('user_id', targetProfile.id)
        .eq('role', 'admin')
        .eq('status', 'active')
        .maybeSingle();

      if (!adminMembership) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'هذا الرقم غير مسجل كمدير مساحة عمل. إذا كنت عاملاً، اختر (عامل محطة) لإرسال الطلب لمديرك.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const registeredWhatsapp = normalizePhoneNumber(targetProfile.whatsapp_number || targetProfile.phone) || canonicalPhone;
      const tempPassword = generateRandomTempPassword();

      const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(targetProfile.id, {
        password: tempPassword,
        user_metadata: {
          name: targetProfile.name,
          phone: targetProfile.phone,
          whatsapp_number: registeredWhatsapp,
          must_change_password: true,
        },
      });

      if (updateAuthErr) {
        return new Response(
          JSON.stringify({ success: false, error: `تعذر تحديث كلمة المرور: ${updateAuthErr.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await adminClient
        .from('profiles')
        .update({ must_change_password: true, updated_at: new Date().toISOString() })
        .eq('id', targetProfile.id);

      // إرسال تلقائي عبر WhatsApp API إذا كانت متغيرات الربط مفعلة في الخادم
      const whatsappApiUrl = Deno.env.get('WHATSAPP_API_URL');
      const whatsappApiToken = Deno.env.get('WHATSAPP_API_TOKEN');
      let sentViaApi = false;
      if (whatsappApiUrl && whatsappApiToken) {
        try {
          const waRes = await fetch(whatsappApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${whatsappApiToken}`,
            },
            body: JSON.stringify({
              to: registeredWhatsapp,
              message: `مرحباً ${targetProfile.name}، كلمة المرور المؤقتة الخاصة بحسابك في محطة الاتحادية هي: ${tempPassword}\nسيُطلب منك تغييرها فور تسجيل الدخول.`,
            }),
          });
          sentViaApi = waRes.ok;
        } catch {
          sentViaApi = false;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          user_id: targetProfile.id,
          user_name: targetProfile.name,
          registered_whatsapp: registeredWhatsapp,
          temporary_password: tempPassword,
          sent_via_api: sentViaApi,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'غير مصرح: يرجى تسجيل الدخول أولاً' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. التحقق من هوية المستخدم المتصل عبر رمز الجلسة
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user: callerUser }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !callerUser) {
      return new Response(
        JSON.stringify({ success: false, error: 'جلسة الدخول غير صالحة أو منتهية' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحقق مما إذا كان المتصل هو مالك المنصة
    const { data: poRow } = await adminClient
      .from('platform_owners')
      .select('user_id')
      .eq('user_id', callerUser.id)
      .maybeSingle();
    const isCallerPlatformOwner = Boolean(poRow?.user_id);

    // =========================================================================
    // العملية 1: إنشاء حساب عامل جديد مباشرة بواسطة مدير مساحة العمل
    // =========================================================================
    if (action === 'create_worker') {
      const { workspace_id, station_id, name, phone } = body;
      const canonicalPhone = normalizePhoneNumber(phone || '');
      if (!workspace_id || !name || !canonicalPhone) {
        return new Response(
          JSON.stringify({ success: false, error: 'جميع بيانات العامل مطلوبة' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // التحقق من أن المتصل مدير نشط في مساحة العمل هذه
      const { data: adminMem } = await adminClient
        .from('workspace_members')
        .select('role, status')
        .eq('workspace_id', workspace_id)
        .eq('user_id', callerUser.id)
        .eq('status', 'active')
        .maybeSingle();

      if (!adminMem || adminMem.role !== 'admin') {
        return new Response(
          JSON.stringify({ success: false, error: 'صلاحية إضافة العمال مقتصرة على مدير مساحة العمل فقط' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // التحقق من حصة العمال في الباقة
      const { data: wsRow } = await adminClient
        .from('workspaces')
        .select('max_workers')
        .eq('id', workspace_id)
        .maybeSingle();
      const maxWorkers = wsRow?.max_workers ?? 10;

      const { count: currentWorkers } = await adminClient
        .from('workspace_members')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace_id)
        .eq('role', 'worker')
        .eq('status', 'active');

      if ((currentWorkers ?? 0) >= maxWorkers) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `تم بلوغ الحد الأقصى للعمال المسموح به في باقتك الحالية (${maxWorkers} عمال). يرجى ترقية الباقة.`,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const syntheticEmail = `${canonicalPhone}@alittihadia.app`;
      const tempPassword = generateRandomTempPassword();

      // إنشاء المستخدم في Supabase Auth مع إلزام تغيير كلمة المرور عند أول دخول
      const { data: createdAuth, error: createErr } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          name: name.trim(),
          phone: canonicalPhone,
          whatsapp_number: canonicalPhone,
          must_change_password: true,
        },
      });

      if (createErr || !createdAuth?.user) {
        return new Response(
          JSON.stringify({
            success: false,
            error: createErr?.message?.includes('already')
              ? 'هذا الرقم مسجل بالفعل في النظام. يمكنك دعوته عبر رمز الدعوة الخاص بمساحة العمل.'
              : (createErr?.message || 'تعذر إنشاء حساب العامل'),
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const workerUserId = createdAuth.user.id;

      // تحديث الملف الشخصي مع must_change_password = true
      await adminClient.from('profiles').upsert({
        id: workerUserId,
        name: name.trim(),
        phone: canonicalPhone,
        whatsapp_number: canonicalPhone,
        must_change_password: true,
      });

      // إضافة العامل لعضوية مساحة العمل
      await adminClient.from('workspace_members').upsert({
        workspace_id,
        user_id: workerUserId,
        role: 'worker',
        status: 'active',
      }, { onConflict: 'workspace_id,user_id' });

      // تعيين العامل في المحطة المحددة
      if (station_id) {
        await adminClient.from('station_workers').upsert({
          workspace_id,
          station_id,
          user_id: workerUserId,
        }, { onConflict: 'station_id,user_id' });
      }

      return new Response(
        JSON.stringify({
          success: true,
          user_id: workerUserId,
          phone: canonicalPhone,
          temporary_password: tempPassword,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =========================================================================
    // العملية 2: إعادة تعيين كلمة المرور (مدير يعيد تعيين عامل، أو مالك المنصة يعيد تعيين مدير)
    // =========================================================================
    const { target_user_id, target_phone, workspace_id } = body;
    let targetProfile: any = null;

    if (target_user_id) {
      const { data } = await adminClient
        .from('profiles')
        .select('*')
        .eq('id', target_user_id)
        .maybeSingle();
      targetProfile = data;
    }

    if (!targetProfile && target_phone) {
      const canonical = normalizePhoneNumber(target_phone);
      const { data } = await adminClient
        .from('profiles')
        .select('*')
        .or(`phone.eq.${canonical},phone.eq.${target_phone.trim()}`)
        .maybeSingle();
      targetProfile = data;
    }

    if (!targetProfile) {
      return new Response(
        JSON.stringify({ success: false, error: 'لم يتم العثور على الحساب المطلوب في قاعدة البيانات' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // التحقق من الصلاحية:
    // أ) مالك المنصة يمكنه إعادة تعيين كلمة مرور أي مدير مساحة عمل
    // ب) مدير مساحة العمل يمكنه إعادة تعيين كلمة مرور عامل ينتمي لمساحة عمله فقط
    let isAuthorized = false;

    if (isCallerPlatformOwner) {
      // تأكد أن الهدف ليس مالك منصة آخر
      const { data: targetPo } = await adminClient
        .from('platform_owners')
        .select('user_id')
        .eq('user_id', targetProfile.id)
        .maybeSingle();
      if (!targetPo) {
        isAuthorized = true;
      }
    } else if (workspace_id) {
      const { data: callerMem } = await adminClient
        .from('workspace_members')
        .select('role, status')
        .eq('workspace_id', workspace_id)
        .eq('user_id', callerUser.id)
        .eq('status', 'active')
        .maybeSingle();

      const { data: targetMem } = await adminClient
        .from('workspace_members')
        .select('role, status')
        .eq('workspace_id', workspace_id)
        .eq('user_id', targetProfile.id)
        .maybeSingle();

      if (callerMem?.role === 'admin' && targetMem?.role === 'worker') {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'غير مصرح: يحق لمدير المحطة إعادة تعيين كلمة مرور عماله فقط، ويحق لمالك المنصة إعادة تعيين كلمات مرور المدراء فقط.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tempPassword = generateRandomTempPassword();

    const { error: updateAuthErr } = await adminClient.auth.admin.updateUserById(targetProfile.id, {
      password: tempPassword,
      user_metadata: {
        name: targetProfile.name,
        phone: targetProfile.phone,
        whatsapp_number: targetProfile.whatsapp_number,
        must_change_password: true,
      },
    });

    if (updateAuthErr) {
      return new Response(
        JSON.stringify({ success: false, error: `تعذر تحديث كلمة المرور: ${updateAuthErr.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await adminClient
      .from('profiles')
      .update({ must_change_password: true, updated_at: new Date().toISOString() })
      .eq('id', targetProfile.id);

    return new Response(
      JSON.stringify({
        success: true,
        target_user_id: targetProfile.id,
        temporary_password: tempPassword,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'حدث خطأ داخلي في الخادم' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
