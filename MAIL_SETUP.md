# دليل إعداد البريد الإلكتروني المخصّص وسجلات DNS (SPF / DKIM / DMARC)

يشرح هذا الدليل بخطوات عملية وبسيطة كيفية ربط **دومين خاص تملكه** (مثل `yourdomain.com`) مع خدمة إرسال بريد مخصّصة (**Resend** أو **Brevo**) لضمان وصول رموز التحقق (OTP) مباشرة إلى صندوق الوارد الأساسي (Inbox) وعدم ذهابها إلى قسم الرسائل غير المرغوب فيها (Spam).

---

## الخطوة 1: تجهيز متغيرات البيئة (Environment Variables)

في ملف `.env` المحلي وفي إعدادات الاستضافة (مثل **Vercel -> Settings -> Environment Variables**)، قم بإضافة المتغيرات التالية:

```env
# عنوان المرسل من الدومين الذي تملكه (بدون إيموجي وبدون gmail.com)
MAIL_FROM="Sahara Express <no-reply@yourdomain.com>"

# مفتاح API السري (اختر خدمة واحدة فقط: Resend أو Brevo)
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxx"
# أو في حال استخدام Brevo:
# BREVO_API_KEY="xkeysib-xxxxxxxxxxxxxxxxxxxxxxxxx"

# مفتاح سري لتشفير الرموز (HMAC-SHA256)
OTP_HASH_SECRET="ضع-هنا-نصا-عشوائيا-طويلا-ومؤمنا"
```

> **ملاحظة مهمة:** استبدل `yourdomain.com` باسم النطاق الحقيقي الذي تملكه (مثلاً `sahara-express.ma` أو `saharaexpress.com`). النظام يرفض تلقائياً أي عنوان ينتهي بـ `@gmail.com`.

---

## الخطوة 2: إضافة الدومين في خدمة الإرسال (Resend أو Brevo)

### الخيار أ: استخدام Resend (موصى به)
1. أنشئ حساباً في [https://resend.com](https://resend.com).
2. من القائمة الجانبية، انتقل إلى **Domains** ثم اضغط **Add Domain**.
3. أدخل اسم الدومين الخاص بك (مثال: `yourdomain.com`) واختر المنطقة الأقرب (مثل `eu-west-1`) ثم اضغط **Add**.
4. ستظهر لك قائمة سجلات DNS مطلوبة (SPF و DKIM).
5. من قسم **API Keys**، اضغط **Create API Key**، انسخ المفتاح الذي يبدأ بـ `re_` وضعه في متغير البيئة `RESEND_API_KEY`.

### الخيار ب: استخدام Brevo
1. أنشئ حساباً في [https://www.brevo.com](https://www.brevo.com).
2. اذهب إلى **Senders, Domains & Dedicated IPs** -> تبويب **Domains** -> اضغط **Add a domain**.
3. أدخل اسم الدومين الخاص بك ثم انسخ سجلات DNS المعروضة.
4. من قائمة الحساب في الأعلى، اختر **SMTP & API** -> تبويب **API Keys** -> اضغط **Generate a new API key**، انسخ المفتاح وضعه في متغير البيئة `BREVO_API_KEY`.

---

## الخطوة 3: إضافة سجلات DNS (SPF و DKIM و DMARC)

ادخل إلى لوحة تحكم الدومين لدى مزوّد النطاق أو DNS الخاص بك (مثل **Cloudflare** أو **Namecheap** أو **GoDaddy**) وافتح صفحة **DNS Records**، ثم أضف السجلات الثلاثة التالية:

### 1. سجل SPF (يسمح لخوادم المزوّد بإرسال البريد نيابة عن دومينك)
إذا كنت تستخدم **Resend**، ستعطيك المنصة سجلّين لـ `send` (سجل `MX` وسجل `TXT`):
- **النوع (Type):** `TXT`
- **الاسم (Name / Host):** `send` (أو `@` حسب ما يظهر لك في لوحة المزوّد)
- **القيمة (Content / Value):**
  - في Resend: `v=spf1 include:amazonses.com ~all`
  - في Brevo: `v=spf1 include:spf.brevo.com ~all`
- **TTL:** `Auto` أو `3600`

### 2. سجل DKIM (التوقيع الرقمي المشفّر للرسالة)
انسخ القيم كما تظهر حرفياً في لوحة Resend أو Brevo:
- **النوع (Type):** `TXT` (أو `CNAME` في بعض الإعدادات)
- **الاسم (Name / Host):** `resend._domainkey` (أو `mail._domainkey` في Brevo)
- **القيمة (Content / Value):** انسخ النص الطويل الذي يبدأ بـ `p=MIGfMA0GCSqGSIb3...` من لوحة تحكم Resend/Brevo.
- **مهم في Cloudflare:** إذا كان السجل من نوع `CNAME`، اجعل حالة **Proxy status** على **DNS only (سحابة رمادية)** وليس البرتقالية.

### 3. سجل DMARC (سياسة حماية الدومين من الانتحال)
أضف سجل `TXT` التالي لحماية سمعة الدومين:
- **النوع (Type):** `TXT`
- **الاسم (Name / Host):** `_dmarc`
- **القيمة (Content / Value):**
  ```txt
  v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com; pct=100; adkim=s; aspf=s
  ```
  *(استبدل `yourdomain.com` باسم دومينك الحقيقي).*

---

## الخطوة 4: التأكد أن الدومين أصبح Verified

1. بعد إضافة السجلات في لوحة DNS، انتظر من **2 إلى 10 دقائق**.
2. ارجع إلى صفحة **Domains** في لوحة تحكم **Resend** (أو **Brevo**) واضغط على زر **Verify DNS Records**.
3. تأكد أن جميع العلامات بجانب **DKIM** و **SPF** و **DMARC** تحوّلت إلى اللون الأخضر وظهرت شارة **`Verified`** أعلى الدومين.
4. يمكنك أيضاً التحقق بنفسك عبر الطرفية (Terminal) أو موقع [https://mxtoolbox.com](https://mxtoolbox.com):
   ```bash
   dig TXT _dmarc.yourdomain.com +short
   dig TXT resend._domainkey.yourdomain.com +short
   ```

---

## الخطوة 5: اختبار جودة الرسالة عبر mail-tester.com

للتأكد بنسبة 100% أن رسائل التحقق لا تُصنّف كـ Spam وتحصل على تقييم **10/10**:

1. افتح الموقع: [https://www.mail-tester.com](https://www.mail-tester.com).
2. سيظهر لك عنوان بريد مؤقت على الشاشة (مثال: `test-xxxxxxx@srv1.mail-tester.com`) — اضغط زر النسخ لنسخه.
3. افتح تطبيقك وانتقل إلى نافذة **التسجيل** أو **نسيت كلمة المرور**، وألصق هذا البريد المؤقت في حقل البريد الإلكتروني ثم اضغط **إرسال رمز التحقق**.
4. ارجع إلى صفحة **mail-tester.com** واضغط على الزر الأزرق **"Then check your score"** (تحقق من النتيجة).
5. ستظهر لك النتيجة التفصيلية؛ تأكد من النقاط التالية في التقرير:
   - التقييم الكلي **9/10** أو **10/10**.
   - قسم **SPF** باللون الأخضر (`PASS`).
   - قسم **DKIM** باللون الأخضر (`Your DKIM signature is valid`).
   - قسم **DMARC** باللون الأخضر (`PASS`).
   - قسم **SpamAssassin** خالٍ من تحذيرات الصور أو الروابط أو ترويسات البريد الجماعي.
