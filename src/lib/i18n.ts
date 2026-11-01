export type Language = 'ar';

export interface LanguageOption {
  code: Language;
  badge: string;
  name: string;
  dir: 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'ar', badge: '(عر) 🇲🇦', name: 'العربية الفصحى', dir: 'rtl' },
];

export const translations = {
  // Modern Standard Arabic (العربية الفصحى - اللغة الرسمية الوحيدة للنظام)
  ar: {
    appName: 'Sahara Express',
    tagline: 'للسفر ونقل البضائع والطرود والتحويلات المالية',
    routeTitle: 'خط النقل الدولي المغرب ⇋ موريتانيا (معبر الكركرات)',
    appSubtitle: 'لإدارة الشحن ونقل الطرود والتحويلات المالية',
    guergueratTitle: 'معبر الكركرات الدولي | المغرب - موريتانيا',
    
    // Navigation
    navDashboard: 'الرئيسية',
    navParcels: 'الطرود والإرساليات',
    navCash: 'الصناديق والقيود',
    navLedger: 'السجل المالي',
    navSettings: 'الإعدادات',
    navNew: 'جديد',
    navNewVoucher: 'إيصال / طرد جديد',
    navReceipts: 'مركز السندات PDF',
    navQuickDeliver: 'تسليم سريع',

    // Roles & Stations
    owner: 'مدير المحطة (مشرف)',
    worker: 'عامل المحطة',
    allStations: 'جميع المحطات',
    station: 'المحطة',
    cashRegister: 'صندوق النقدية',
    activeBox: 'الصندوق نشط',
    roleAdmin: 'مدير المحطة',
    roleWorker: 'عامل المحطة',
    roleOwner: 'صاحب الشركة',
    rolePlatformOwner: 'مالك المنصة',

    // Currencies
    mad: 'درهم مغربي',
    mru: 'أوقية موريتانية',
    eur: 'يورو أوروبي',
    madSymbol: 'د.م.',
    mruSymbol: 'أ.م.',
    eurSymbol: '€',
    exchangeRateLabel: 'سعر الصرف (درهم ⇋ أوقية)',
    converter: 'محوّل العملات (درهم ⇋ أوقية)',
    manualExchangeRates: 'سعر الصرف المعتمد (درهم ⇋ أوقية)',
    stations: 'المحطات',

    // Parcels
    parcelsTitle: 'إدارة الطرود والبضائع المشحونة',
    newParcel: 'تسجيل إرسالية جديدة',
    trackParcel: 'تتبع طرد',
    trackingCode: 'رمز التتبع',
    sender: 'المرسل',
    receiver: 'المستلم',
    senderPhone: 'هاتف المرسل',
    receiverPhone: 'هاتف المستلم',
    originStation: 'محطة الانطلاق',
    destStation: 'محطة الوصول',
    route: 'مسار الشحن',
    parcelCategory: 'نوع البضاعة',
    itemsCount: 'عدد الطرود',
    weight: 'الوزن (كلغ)',
    shippingFee: 'أجرة الشحن',
    codAmount: 'مبلغ التحصيل عند الاستلام (COD)',
    declaredValue: 'القيمة المصرح بها',
    paymentStatus: 'حالة الأداء',
    paidPrepaid: 'مدفوع مسبقاً بالمحطة',
    codUnpaid: 'الدفع عند الاستلام',
    parcelStatus: 'حالة الطرد',
    
    statusPending: 'قيد الانتظار بالمحطة',
    statusInTransit: 'في الطريق',
    statusArrived: 'وصلت محطة الوصول',
    statusDelivered: 'تم التسليم للمستلم',
    statusCancelled: 'ملغاة',

    parcelStatus_registered: 'مسجل بالمحطة',
    parcelStatus_in_transit: 'في الطريق',
    parcelStatus_received: 'وصل لمحطة الوجهة',
    parcelStatus_delivered: 'تم التسليم للزبون',
    parcelStatus_unclaimed: 'متأخر وغير مستلم',
    parcelStatus_returned: 'مرتجع للمرسل',

    payment_paid: 'مدفوع مسبقاً',
    payment_cash_on_delivery: 'الدفع عند الاستلام (COD)',

    markInTransit: 'إرسال في الطريق',
    markArrived: 'تسجيل وصول بالمحطة',
    deliverParcel: 'تسليم الطرد واستلام المبلغ',
    generateTicket: 'طباعة بون الشحن 10x10',
    cancelParcel: 'إلغاء الإرسالية',

    // Cash Ledger
    cashLedgerTitle: 'دفتر القيود والحسابات اليومية',
    newVoucher: 'سند قبض / صرف جديد',
    totalBalance: 'الرصيد الإجمالي',
    inflow: 'المداخيل (إيداعات)',
    outflow: 'المصاريف (سحوبات)',
    voucherNumber: 'رقم السند',
    voucherType: 'نوع المعاملة',
    amount: 'المبلغ',
    currency: 'العملة',
    date: 'التاريخ والتوقيت',
    reason: 'السبب والبيان',
    user: 'المسؤول / العامل',
    actions: 'الإجراءات',

    typeCashIn: 'قبض نقدي عام (مدخول)',
    typeCashOut: 'صرف نقدي (مصروف تشغيلي)',
    typeGoodsPayment: 'سداد بضائع للتاجر',
    typeShippingFee: 'استخلاص أجرة شحن',
    typeCodCollection: 'تحصيل مبلغ COD',
    typeCodPayout: 'تسليم تحصيل COD للتاجر',

    // Trips / Dispatch
    tripsTitle: 'إدارة الرحلات والترحيل البري',
    newTrip: 'تسجيل رحلة شحن جديدة',
    tripNumber: 'رقم الرحلة',
    driver: 'السائق',
    vehiclePlate: 'رقم الشاحنة / السيارة',
    driverPhone: 'هاتف السائق',
    departTrip: 'انطلاق الرحلة',
    arriveTrip: 'تأكيد وصول الرحلة وتفريغها',
    tripParcelsCount: 'عدد الطرود بالرحلة',

    // Auth & Access
    authTitle: 'تسجيل الدخول إلى Sahara Express',
    authWorkerDirectTitle: 'دخول العامل المباشر',
    authAdminTitle: 'دخول المدير (أدمن)',
    authChooseRole: 'اختر صفتك للدخول أو التسجيل:',
    authAdminTab: 'أدمين (مدير المحطة)',
    authWorkerTab: 'عامل (موظف محطة)',
    authWorkerNotice: 'حساب العامل مسجل مسبقاً لدى المدير. أدخل الاسم ورقم الهاتف وكلمة المرور المؤقتة التي استلمتها للدخول مباشرة بدون بريد إلكتروني.',
    authWorkerNameLabel: 'اسم العامل (الاسم الكامل) *',
    authWorkerPhoneLabel: 'رقم هاتف العامل *',
    authWorkerPasswordLabel: 'كلمة المرور المؤقتة من المدير *',
    authWorkerDirectButton: 'دخول مباشر لحساب العامل (بدون بريد)',
    authAdminEmailPhoneLabel: 'رقم الهاتف أو البريد الإلكتروني *',
    authAdminPasswordLabel: 'كلمة المرور *',
    authAdminLoginButton: 'تسجيل دخول المدير',
    authCreateAccountTab: 'إنشاء حساب شركة جديد',
    authAlreadyHaveAccount: 'لديك حساب بالفعل؟ تسجيل الدخول',
    authNeedAccount: 'ليس لديك حساب؟ إنشاء حساب جديد',
    authForgotPassword: 'نسيت كلمة المرور؟',
    authTrackingButton: 'تتبع شحنة للزبون بدون تسجيل الدخول',
    authTermsNotice: 'الشروط والأحكام وسياسة الخصوصية',
    authInvalidCredentials: 'رقم الهاتف أو كلمة المرور غير صحيحة',
    authInvalidWorkerCode: 'اسم العامل أو رقم هاتفه أو الرمز المؤقت غير صحيح',
    authDirectLoginNotice: '* دخول مباشر إلى المحطة المخصصة لك دون الحاجة لبريد أو كود تفعيل',

    // Settings
    settingsTitle: 'إعدادات المنظومة والمحطات',
    settingsLanguageSection: 'لغة التطبيق',
    settingsLanguageDesc: 'اللغة الرسمية المعتمدة هي العربية الفصحى.',
    settingsStationsSection: 'إدارة المحطات والفروع',
    settingsWorkersSection: 'إدارة العمال وفريق العمل',
    settingsSubscriptionSection: 'الاشتراك والباقات',
    settingsFinancialSection: 'أسعار الصرف والعملات',
    settingsBackupSection: 'النسخ الاحتياطي وتصدير البيانات',
    settingsPwaSection: 'تثبيت التطبيق على الهاتف والكمبيوتر',
    settingsInstallApp: 'تثبيت تطبيق الهاتف والكمبيوتر',
    settingsInstalledNotice: 'التطبيق مثبت وجاهز للعمل بدون إنترنت',
    settingsCurrencyMorocco: 'الدرهم المغربي (MAD)',
    settingsCurrencyMauritania: 'الأوقية الموريتانية الجديدة (MRU)',
    settingsExchangeRate: 'سعر الصرف (1 درهم = أوقية)',

    // Quick Add Menu
    quickAddTitle: 'تسجيل عملية جديدة سريعة',
    quickAddParcelTitle: 'إرسالية / طرد جديد',
    quickAddParcelDesc: 'تسجيل كولي جديد مع إيصال وملصق الباركود',
    quickAddCashInTitle: 'سند إيداع نقدي (مدخول)',
    quickAddCashInDesc: 'تسجيل مدخول نقدي مباشر في الصندوق',
    quickAddCashOutTitle: 'سند صرف نقدي (مصروف)',
    quickAddCashOutDesc: 'تسجيل مصروف أو نفقة تشغيلية من الصندوق',
    quickAddDeliverTitle: 'تسليم سريع (كولي أو دفعة طرود)',
    quickAddDeliverDesc: 'تأكيد استلام الزبون فورياً برقم الكود',
    quickAddTripTitle: 'ترحيل رحلة جديدة (شاحنة / سيارة)',
    quickAddTripDesc: 'تجميع الطرود وترحيلها نحو المحطة الأخرى',

    // Messages & Alerts
    alertCopied: 'تم النسخ بنجاح!',
    alertSaved: 'تم حفظ البيانات بنجاح',
    alertSubscriptionExpiring: 'تنبيه: اقترب موعد انتهاء الاشتراك',
    alertSubscriptionExpired: 'انتهت صلاحية الاشتراك — تم إيقاف العمليات حتى التجديد',
    languageChangedToast: 'اللغة المعتمدة هي العربية الفصحى 🇲🇦',
  },
};
