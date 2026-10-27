/**
 * ثوابت النظام الموحدة - محطة الاتحادية
 * تم تجميع جميع المتغيرات العامة هنا لسهولة التعديل المركزي
 */

// وضع البيانات التجريبية: مغلق الآن حتى يحصل كل حساب جديد على مساحة عمل خاصة ونظيفة 100%
export const DEMO_MODE = false;

export const PLATFORM_CONFIG = {
  // رقم الهاتف المعتمد لتحويل كاش بلوس وتأكيد الاشتراك عبر الواتساب
  PAYMENT_PHONE: '+212618961387',
  PAYMENT_CLEAN_PHONE: '212618961387',
  PAYMENT_PROVIDER_NAME: 'كاش بلوس (Cash Plus)',
  PROVIDER_NAME: 'كاش بلوس (Cash Plus)',
  
  // مدة التجربة الافتراضية لمساحات العمل الجديدة (بالأيام)
  DEFAULT_FREE_TRIAL_DAYS: 15,
  
  // عدد الأيام قبل الانتهاء لبدء عرض شريط التنبيه
  WARNING_EXPIRY_DAYS: 7,

  // سعر الاشتراك الشهري (بالدرهم المغربي)
  SUBSCRIPTION_PRICE_MAD: 199,
  
  // إعدادات الطابعات الحرارية المعتمدة
  THERMAL_PRINTER_WIDTHS: {
    MM58: '58mm',
    MM80: '80mm',
  } as const,

  // أسماء المحطات الافتراضية القياسية
  DEFAULT_STATIONS: {
    DAKHLA: {
      name: 'محطة الداخلة الرئيسية',
      city: 'الداخلة',
      country: 'MA' as const,
    },
    NOUADHIBOU: {
      name: 'محطة نواذيبو الدولية',
      city: 'نواذيبو',
      country: 'MR' as const,
    },
    ORIGIN: {
      name: 'محطة الداخلة الرئيسية',
      city: 'الداخلة',
      country: 'MA' as const,
    },
    DEST: {
      name: 'محطة نواذيبو الدولية',
      city: 'نواذيبو',
      country: 'MR' as const,
    }
  }
};
