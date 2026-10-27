# دليل نشر دالة استعادة كلمة المرور (Edge Function) لغير المبرمجين

تُستخدم هذه الدالة السحابية (`reset-password`) لتمكين:
1. **مدير المحطة:** من إعادة تعيين كلمة مرور أي عامل نسي كلمة مروره، أو إنشاء حساب عامل جديد برمز دخول مؤقت يُعرض لمرة واحدة فقط.
2. **مالك المنصة:** من إعادة تعيين كلمة مرور أي مدير محطة نسي كلمة مروره.
3. **الأمان الكامل:** يبقى مفتاح الإدارة السري (`SUPABASE_SERVICE_ROLE_KEY`) محفوظاً تلقائياً داخل خوادم Supabase ولا يوضع أبداً داخل كود التطبيق.

---

## الطريقة الأولى: النشر المباشر من لوحة تحكم Supabase (بدون سطر أوامر - الأسهل)

1. افتح لوحة تحكم مشروعك في موقع [Supabase Dashboard](https://supabase.com/dashboard).
2. من القائمة الجانبية اليسرى، اضغط على **Edge Functions** (أيقونة البرق).
3. اضغط على الزر الأخضر **Deploy a new function** ثم اختر **Via Editor**.
4. في خانة **Function name** اكتب بالضبط:
   `reset-password`
5. افتح الملف `supabase/functions/reset-password/index.ts` الموجود في هذا المشروع، وانسخ كامل الكود الموجود بداخله، والصقه في المحرر داخل موقع Supabase.
6. اضغط على **Deploy function** في الأسفل.
7. انتهى! (ملاحظة: متغيرات البيئة `SUPABASE_URL` و `SUPABASE_ANON_KEY` و `SUPABASE_SERVICE_ROLE_KEY` تكون متوفرة تلقائياً داخل خادم Supabase Edge Functions دون الحاجة لإدخالها يدوياً).

---

## الطريقة الثانية: النشر عبر أداة سطر الأوامر (Supabase CLI)

إذا كنت تستخدم جهاز كمبيوتر مثبتاً عليه Supabase CLI:

1. سجل الدخول إلى حسابك:
   ```bash
   npx supabase login
   ```
2. اربط المجلد بمشروعك (استبدل `YOUR_PROJECT_REF` بمعرف مشروعك):
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```
3. انشر الدالة بأمر واحد:
   ```bash
   npx supabase functions deploy reset-password
   ```
