# دليل إعداد البريد عبر Resend للدومين `sahara-express.com`

يشرح هذا الدليل بخطوات بسيطة كيفية تفعيل إرسال البريد من العنوان **`noreply@sahara-express.com`** عبر خدمة **Resend**، وإضافة سجلات DNS (**SPF** و **DKIM** و **DMARC**)، والتأكد من حالة **Verified**، واختبار جودة الرسالة عبر **mail-tester.com**.

---

## الخطوة 1: ضبط متغيرات البيئة (`env`)

في ملف `.env` المحلي وفي إعدادات **Vercel -> Settings -> Environment Variables**، أضف المتغيرات التالية:

```env
MAIL_FROM="Sahara Express <noreply@sahara-express.com>"
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxx"
OTP_HASH_SECRET="ضع-هنا-مفتاحا-عشوائيا-طويلا"
```

---

## الخطوة 2: إضافة الدومين `sahara-express.com` في Resend

1. سجّل الدخول إلى حسابك في [https://resend.com](https://resend.com).
2. من القائمة الجانبية اضغط على **Domains** ثم اضغط زر **Add Domain**.
3. اكتب اسم الدومين: `sahara-express.com`، واختر المنطقة الأقرب (مثل `eu-west-1`) ثم اضغط **Add**.
4. اذهب إلى قسم **API Keys** في القائمة الجانبية، اضغط **Create API Key**، انسخ المفتاح الذي يبدأ بـ `re_` وضعه في المتغير `RESEND_API_KEY`.

---

## الخطوة 3: إضافة سجلات DNS (SPF و DKIM و DMARC)

افتح لوحة إدارة الـ DNS الخاصة بالدومين `sahara-express.com` (مثل Cloudflare أو Namecheap أو GoDaddy)، وأضف السجلات المعروضة لك في صفحة الدومين داخل Resend:

### 1. سجل DKIM (التوقيع الرقمي)
- **Type:** `TXT`
- **Name / Host:** `resend._domainkey`
- **Value / Content:** القيمة التي يعطيك إياها Resend وتبدأ بـ `p=MIGfMA0GCSqGSIb3...`

### 2. سجلات SPF (الإرسال عبر `send.sahara-express.com`)
- **السجل الأول (MX):**
  - **Type:** `MX`
  - **Name / Host:** `send`
  - **Value:** `feedback-smtp.eu-west-1.amazonses.com` *(حسب المنطقة المعروضة في حسابك)*
  - **Priority:** `10`
- **السجل الثاني (TXT):**
  - **Type:** `TXT`
  - **Name / Host:** `send`
  - **Value:** `v=spf1 include:amazonses.com ~all`

### 3. سجل DMARC (حماية الدومين)
- **Type:** `TXT`
- **Name / Host:** `_dmarc`
- **Value:**
  ```txt
  v=DMARC1; p=quarantine; rua=mailto:postmaster@sahara-express.com; pct=100; adkim=s; aspf=s
  ```

---

## الخطوة 4: التأكد أن الدومين Verified

1. بعد حفظ سجلات الـ DNS، انتظر من 2 إلى 10 دقائق.
2. ارجع إلى لوحة تحكم **Resend -> Domains -> sahara-express.com** واضغط على زر **Verify DNS Records**.
3. تأكد من ظهور شارة **`Verified`** باللون الأخضر بجانب الدومين وأن حالتي **DKIM** و **SPF** أصبحتا `Verified`.

---

## الخطوة 5: التجربة عبر mail-tester.com

1. افتح الموقع [https://www.mail-tester.com](https://www.mail-tester.com) وانسخ عنوان البريد المؤقت المعروض على الشاشة.
2. افتح تطبيق **Sahara Express**، واطلب إرسال رمز تحقق إلى ذلك البريد المؤقت.
3. ارجع إلى **mail-tester.com** واضغط **Then check your score** للتأكد من حصول الرسالة المرسلة من `noreply@sahara-express.com` على تقييم **10/10** واجتياز فحوصات SPF و DKIM و DMARC.
