# دليل إعداد ونشر تطبيق أمان (Aman) - Supabase & Vercel / Netlify

تطبيق **"Aman - أمان"** مصمم لإدارة محطات الإرساليات وتحويل الكاش بين **الداخلة (المغرب)** و **نواذيبو (موريتانيا)** بأعلى معايير الأمان وعزل البيانات التام بين "الكليكات".

---

## 1. خطوات إعداد Supabase في دقيقتين

1. **إنشاء مشروع جديد**:
   - توجه إلى [Supabase Dashboard](https://supabase.com/dashboard) واضغط **New Project**.
   - اختر اسماً للمشروع (مثال: `aman-cash`) وكلمة سر قوية لقاعدة البيانات.
   - اختر أقرب سيرفر (مثلاً: West Europe - Frankfurt أو London).

2. **تنفيذ كود SQL**:
   - من القائمة الجانبية في Supabase، اضغط على **SQL Editor**.
   - اضغط **New query**.
   - افتح الملف `supabase/schema.sql` وانسخ محتواه بالكامل، ثم الصقه في المحرر واضغط **Run**.
   - سيقوم الكود بإنشاء:
     - الجداول العشرة (profiles, teams, team_members, stations, station_balances, transactions...)
     - محرك حساب الرصيد التلقائي (Triggers)
     - نظام حماية الاشتراك (Paywall trigger يمنع الإدخال بعد انتهاء الـ 7 أيام)
     - دوال RPC المجهزة (`create_team`, `join_team`, `add_balance_adjustment`, `regenerate_invite_code`)
     - تفعيل RLS وسياسات الأمان المعزولة عبر `SECURITY DEFINER`
     - مجلد التخزين `receipts` لحفظ صور الوصولات

3. **الحصول على مفاتيح الاتصال (API Keys)**:
   - في Supabase، اذهب إلى: **Project Settings** ➡️ **API**.
   - انسخ:
     - **Project URL**
     - **Project API Keys** (مفتاح `anon` `public`).

4. **تفعيل تسجيل الدخول برقم الهاتف / البريد**:
   - اذهب إلى **Authentication** ➡️ **Providers**.
   - فعّل **Email** و/أو **Phone** (يمكنك استخدام الهاتف أو البريد الإلكتروني).
   - *ملاحظة*: يمكنك تعطيل خيار "Confirm email" للتجربة السريعة الفورية.

---

## 2. القرارات الأمنية الهامة (Security Rationale)

1. **حساب الرصيد محمي بالكامل من التلاعب (Server-Authoritative)**:
   - واجهة المستخدم والـ Frontend لا تملك أي صلاحية تعديل جدول `station_balances` مباشرة (لا يوجد أي `UPDATE/INSERT` policy للمستخدمين).
   - يتم التعديل فقط وحصرياً عبر الـ Trigger في Postgres استجابة لبون معتمد (`confirmed transaction`).
2. **عزل الكليكات 100% (Strict Tenant Isolation)**:
   - الدوال `is_team_member` و `is_team_owner` و `can_access_station` مبنية بصيغة `SECURITY DEFINER` لمنع أي مشكلة دوران متكرر (Infinite recursion) وضمان أن كل كليكة لا تشاهد سوى بياناتها فقط.
3. **حماية الـ Paywall في قلب قاعدة البيانات**:
   - حتى لو حاول مخترق إرسال بون عبر الـ API مباشرة، يتدخل الـ Trigger `check_subscription_active` ويرفض العملية فوراً إذا كانت فترة الاشتراك منتهية.
4. **تعديلات البونات مسجلة في الـ Audit Log**:
   - كل تعديل أو إلغاء لبون يسجل البيانات القديمة والجديدة والمنفّذ في جدول `audit_log`.

---

## 3. إعداد المتغيرات في البيئة المحلية (.env)

أنشئ ملف `.env` في المجلد الرئيسي وضع القيم:
```env
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"
VITE_ADMIN_WHATSAPP="212600000000"
```

---

## 4. خطوات النشر على Vercel أو Netlify

### النشر على Vercel:
1. ارفع المشروع إلى GitHub أو GitLab.
2. توجه إلى [Vercel](https://vercel.com) واضغط **Add New Project**.
3. اختر المستودع الخاص بك.
4. الإعدادات الافتراضية:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. في قسم **Environment Variables** أضف:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_WHATSAPP`
6. اضغط **Deploy**. سيعمل تطبيق الـ PWA فوراً مع دعم كامل للـ HTTPS وتثبيت التطبيق على الهواتف.

### النشر على Netlify:
1. توجه إلى [Netlify](https://app.netlify.com) واضغط **Add new site** ➡️ **Import an existing project**.
2. اختر مستودع Git.
3. إعدادات البناء:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
4. أضف متغيرات البيئة نفسها من قسم **Site configuration** ➡️ **Environment variables**.
5. أنشئ ملف `public/_redirects` بمحتوى:
   ```
   /*    /index.html   200
   ```
   (تم تجهيزه تلقائياً في المشروع).
