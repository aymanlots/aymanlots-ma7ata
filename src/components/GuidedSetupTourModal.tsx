import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { NavTab } from './BottomNav';
import {
  Store,
  Users,
  Coins,
  Compass,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Search,
  EyeOff,
  Handshake,
  Globe,
  LayoutGrid,
  Package,
  Settings,
  Key,
  Copy,
  X,
  Zap,
  MessageCircle,
  Wallet,
} from 'lucide-react';

interface GuidedSetupTourModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab: (tab: NavTab) => void;
}

type TourLang = 'ar' | 'hassaniya' | 'fr' | 'en' | 'es';

interface CreatedWorkerCred {
  name: string;
  phone: string;
  stationName: string;
  code: string;
}

const TOUR_COPY: Record<
  TourLang,
  {
    headerTitle: string;
    step1Short: string;
    step2Short: string;
    step3Short: string;
    step4Short: string;
    step1Sub: string;
    step2Sub: string;
    step3Sub: string;
    step4Sub: string;
    welcomePrefix: string;
    step1Desc: string;
    stationNameLabel: string;
    stationNamePlaceholder: string;
    cityLabel: string;
    cityPlaceholder: string;
    countryLabel: string;
    phoneOptLabel: string;
    addStationBtn: string;
    addAnotherStationBtn: string;
    addingStation: string;
    addedStationsTitle: string;
    noStationsYet: string;
    step1ErrorEmpty: string;
    step1NeedOne: string;
    nextToStep2: string;
    step2Title: string;
    step2Desc: string;
    workerStationLabel: string;
    workerNameLabel: string;
    workerNamePlaceholder: string;
    workerPhoneLabel: string;
    addWorkerBtn: string;
    addingWorker: string;
    workerAddedBadge: string;
    workerCodeLabel: string;
    copyCodeBtn: string;
    copiedCodeToast: string;
    currentWorkersTitle: string;
    noWorkersYet: string;
    step2NeedFields: string;
    step2NeedOne: string;
    skipWorkerLater: string;
    nextToStep3: string;
    step3Title: string;
    step3Desc: string;
    stationCurrLabel: string;
    openingCashLabel: string;
    addCustomCurrToggle: string;
    currCodePlaceholder: string;
    currNamePlaceholder: string;
    saveCurrBtn: string;
    currFieldsRequired: string;
    savingCash: string;
    nextToStep4: string;
    step4Title: string;
    step4Desc: string;
    appSectionsTab: string;
    shortcutsTab: string;
    tapSectionHint: string;
    finishTourBtn: string;
    prevBtn: string;
    closeTitle: string;
    doneToast: string;
    morocco: string;
    mauritania: string;
    sections: Array<{
      tab?: NavTab;
      title: string;
      desc: string;
      icon: 'dashboard' | 'parcels' | 'new' | 'cash' | 'settings';
    }>;
    shortcuts: Array<{
      title: string;
      desc: string;
      icon: 'station' | 'search' | 'plus' | 'eye' | 'collab' | 'lang' | 'whatsapp';
    }>;
  }
> = {
  ar: {
    headerTitle: 'جولة البداية وإعداد الحساب',
    step1Short: '1. المحطة',
    step2Short: '2. العامل',
    step3Short: '3. الصندوق',
    step4Short: '4. الشرح',
    step1Sub: 'الخطوة 1: سمِّ محطتك الأولى للانطلاق',
    step2Sub: 'الخطوة 2: أضف عاملاً وحدد له محطته',
    step3Sub: 'الخطوة 3: أضف الفلوس في الصناديق لبداية الخدمة',
    step4Sub: 'الخطوة 4: جولة شاملة في التطبيق واختصاراته',
    welcomePrefix: 'مرحباً بك يا',
    step1Desc: 'أول خطوة هي تسمية محطتك (أو محطاتك) وتحديد الدولة والعملة. يمكنك تعديلها أو إضافة محطات أخرى لاحقاً.',
    stationNameLabel: 'اسم المحطة *',
    stationNamePlaceholder: 'مثال: محطة الداخلة، نواذيبو، كازا...',
    cityLabel: 'المدينة *',
    cityPlaceholder: 'اسم المدينة',
    countryLabel: 'الدولة',
    phoneOptLabel: 'هاتف المحطة (اختياري)',
    addStationBtn: 'إنشاء وتسمية المحطة',
    addAnotherStationBtn: 'إضافة محطة أخرى',
    addingStation: 'جاري إنشاء المحطة...',
    addedStationsTitle: 'المحطات المضافة',
    noStationsYet: 'لم تقم بإضافة أي محطة بعد. اكتب اسم المحطة أعلاه ثم اضغط إنشاء.',
    step1ErrorEmpty: 'يرجى إدخال اسم المحطة أولاً',
    step1NeedOne: 'يرجى إنشاء محطة واحدة على الأقل قبل المتابعة لإضافة العامل',
    nextToStep2: 'التالي: إضافة عامل للمحطة',
    step2Title: 'أضف عاملاً لمحطتك',
    step2Desc: 'أدخل اسم العامل ورقم هاتفه واختر محطته. سيتم توليد كود دخول خاص به ليشتغل من هاتفه فوراً.',
    workerStationLabel: 'المحطة المخصصة للعامل',
    workerNameLabel: 'اسم العامل الكامل *',
    workerNamePlaceholder: 'مثال: محمد، أحمد...',
    workerPhoneLabel: 'رقم هاتف العامل *',
    addWorkerBtn: 'إضافة العامل وتوليد كود الدخول',
    addingWorker: 'جاري إضافة العامل...',
    workerAddedBadge: 'تم إنشاء حساب العامل — احتفظ بكود الدخول:',
    workerCodeLabel: 'كود الدخول المباشر:',
    copyCodeBtn: 'نسخ الكود',
    copiedCodeToast: 'تم نسخ كود دخول العامل بنجاح',
    currentWorkersTitle: 'العمال المسجلون',
    noWorkersYet: 'لم تضف أي عامل بعد. أضف عاملك الأول أعلاه ليتم ربطه بالمحطة.',
    step2NeedFields: 'يرجى إدخال اسم العامل ورقم هاتفه أولاً',
    step2NeedOne: 'يرجى إضافة عامل واحد على الأقل أو الضغط على التخطي مؤقتاً',
    skipWorkerLater: 'تخطي إضافة عامل الآن',
    nextToStep3: 'التالي: إضافة الفلوس فالصناديق',
    step3Title: 'تعبئة الفلوس في الصناديق لبداية الخدمة',
    step3Desc: 'أدخل الرصيد الافتتاحي (الفلوس) الموجود في صندوق كل محطة لبدء الحسابات والحوالات والعمليات المالية.',
    stationCurrLabel: 'عملة الصندوق',
    openingCashLabel: 'المبلغ الافتتاحي (الفلوس)',
    addCustomCurrToggle: 'إضافة عملة أخرى (مثل EUR أو USD)',
    currCodePlaceholder: 'الرمز (EUR)',
    currNamePlaceholder: 'الاسم (أورو)',
    saveCurrBtn: 'حفظ',
    currFieldsRequired: 'يرجى إدخال رمز واسم العملة',
    savingCash: 'جاري حفظ الرصيد...',
    nextToStep4: 'حفظ الفلوس والانتقال لجولة التطبيق',
    step4Title: 'جولة شاملة في التطبيق والاختصارات',
    step4Desc: 'اضغط على أي قسم لمعاينته مباشرة في الخلفية، وتعرف على أهم الاختصارات التي تسرّع عملك اليومي:',
    appSectionsTab: 'أقسام التطبيق',
    shortcutsTab: 'الاختصارات السريعة',
    tapSectionHint: 'اضغط على أي بطاقة لتجربة فتح صفحتها:',
    finishTourBtn: 'إنهاء الجولة والبدء في العمل',
    prevBtn: 'السابق',
    closeTitle: 'إغلاق الجولة',
    doneToast: 'ألف مبروك! تم إعداد محطتك والعامل والصندوق بنجاح، يمكنك البدء في العمل الآن.',
    morocco: 'المغرب',
    mauritania: 'موريتانيا',
    sections: [
      {
        tab: 'dashboard',
        title: 'الرئيسية (لوحة التحكم)',
        desc: 'بحث سريع عن الكوليات، مراقبة عمليات كل عامل بضغطة زر، ملخص الحالات الأربع، وصندوق المحطة.',
        icon: 'dashboard',
      },
      {
        tab: 'parcels',
        title: 'الكوليات والرحلات',
        desc: 'تسجيل كولي فردي أو متعدد، تسيير الرحلات والشحن، المانيفست، ملصقات QR (10×10) وبونات PDF.',
        icon: 'parcels',
      },
      {
        title: 'الزر الأخضر (+ جديد)',
        desc: 'اختصار فوري في وسط الشريط السفلي لتسجيل كولي جديد، عملية صندوق (إيداع/سحب)، أو تسليم سريع.',
        icon: 'new',
      },
      {
        tab: 'cash',
        title: 'الصناديق والسجل المالي',
        desc: 'تفصيل رصيد كل محطة بكل العملات، الحوالات بين المحطات، صرف العملة، الكريدي، والتقرير اليومي PDF.',
        icon: 'cash',
      },
      {
        tab: 'settings',
        title: 'الإعدادات والإدارة',
        desc: 'إدارة المحطات والعمال وأكواد الدخول، تسعيرة الصرف، شعار التذاكر، لغة التطبيق، والنسخ الاحتياطي.',
        icon: 'settings',
      },
    ],
    shortcuts: [
      {
        title: 'تبديل المحطات من الشريط العلوي',
        desc: 'بدّل بين "كل المحطات" أو محطة واحدة لعزل كولياتها وصناديقها وعمالها بدقة.',
        icon: 'station',
      },
      {
        title: 'شريط البحث + سكانر الكاميرا (QR)',
        desc: 'ابحث بكود التتبع أو الهاتف أو امسح باركود الكولي بالكاميرا للشحن والتفريغ والتسليم الفوري.',
        icon: 'search',
      },
      {
        title: 'اختصار + جديد من أي صفحة',
        desc: 'في أي شاشة كنت، الزر الأخضر في الأسفل يفتح لك الكولي الجديد أو الصندوق أو التسليم في ثانية.',
        icon: 'plus',
      },
      {
        title: 'زر العين لإخفاء المبالغ',
        desc: 'اضغط على أيقونة العين في الأعلى لإخفاء أرصدة الصناديق مؤقتاً للخصوصية أمام الزبناء.',
        icon: 'eye',
      },
      {
        title: 'غرفة الشراكة والتعاون',
        desc: 'تواصل وتبادل الكوليات مع مدراء وشركاء محطات أخرى مع عزل كامل لبيانات كل طرف.',
        icon: 'collab',
      },
      {
        title: '5 لغات + الوضع الليلي والنهاري',
        desc: 'غيّر اللغة (العربية، الحسانية، الفرنسية، الإنجليزية، الإسبانية) أو المظهر من الشريط العلوي.',
        icon: 'lang',
      },
      {
        title: 'تتبع الزبون ورسائل واتساب',
        desc: 'أرسل رابط تتبع مباشر بالـ QR للزبون عبر واتساب أو اطبع له وصل التسليم فوراً.',
        icon: 'whatsapp',
      },
    ],
  },
  hassaniya: {
    headerTitle: 'جولة البداية وتجهيز الحساب',
    step1Short: '1. المحطة',
    step2Short: '2. العامل',
    step3Short: '3. الصندوق',
    step4Short: '4. الشرح',
    step1Sub: 'الخطوة 1: سمِّ محطتك اللولة باش تبدا',
    step2Sub: 'الخطوة 2: زيد عامل وخصص لو محطتو',
    step3Sub: 'الخطوة 3: زيد الفظة فالصناديق باش تبدا الخدمة',
    step4Sub: 'الخطوة 4: جولة كاملة تشرح لك التطبيق والاختصارات',
    welcomePrefix: 'مرحباً بك يا',
    step1Desc: 'أول حاجة تدير سمية المحطة ديالك وتختار الدولة والعملة. تقدر تعدلها أو تزيد محطات أخرى من بعد.',
    stationNameLabel: 'اسم المحطة *',
    stationNamePlaceholder: 'مثال: الداخلة، نواذيبو، نواكشوط...',
    cityLabel: 'الدشرة / المدينة *',
    cityPlaceholder: 'اسم المدينة',
    countryLabel: 'الدولة',
    phoneOptLabel: 'تلفون المحطة (اختياري)',
    addStationBtn: 'فتح وتسمية المحطة',
    addAnotherStationBtn: 'زيد محطة أخرى',
    addingStation: 'جاري فتح المحطة...',
    addedStationsTitle: 'المحطات المفتوحة',
    noStationsYet: 'ما زلت ما فتحت حتى محطة. اكتب سميتها الفوق واضغط فتح.',
    step1ErrorEmpty: 'عافاك دخل اسم المحطة اللول',
    step1NeedOne: 'عافاك افتح محطة وحدة على الأقل قبل ما تزيد العامل',
    nextToStep2: 'التالي: زيد عامل للمحطة',
    step2Title: 'زيد عامل للمحطة',
    step2Desc: 'دخل اسم العامل وتلفونو واختار محطتو. التطبيق يعطيه كود دخول مباشر يخدم بيه فتلفونو.',
    workerStationLabel: 'محطة العامل',
    workerNameLabel: 'اسم العامل الكامل *',
    workerNamePlaceholder: 'مثال: محمد، سيدي...',
    workerPhoneLabel: 'رقم تلفون العامل *',
    addWorkerBtn: 'زيد العامل وولّد الكود',
    addingWorker: 'جاري زيادة العامل...',
    workerAddedBadge: 'تزاد العامل بنجاح — ها هو كود الدخول ديالو:',
    workerCodeLabel: 'كود الدخول المباشر:',
    copyCodeBtn: 'نسخ الكود',
    copiedCodeToast: 'تنسخ كود العامل بنجاح',
    currentWorkersTitle: 'العمال اللي كاينين',
    noWorkersYet: 'ما زلت ما زدت حتى عامل. زيد العامل اللول الفوق.',
    step2NeedFields: 'عافاك دخل اسم العامل ورقم تلفونو',
    step2NeedOne: 'عافاك زيد عامل واحد على الأقل ولا تخطا هاد الخطوة ذرك',
    skipWorkerLater: 'تخطي زيادة عامل ذرك',
    nextToStep3: 'التالي: زيد الفظة فالصناديق',
    step3Title: 'زيد الفظة فالصناديق باش تبداو الخدمة',
    step3Desc: 'دخل شحال ديال الفظة فصندوق كل محطة باش تبداو الخدمة والحوالات وتسليم الشكاير.',
    stationCurrLabel: 'عملة الصندوق',
    openingCashLabel: 'الفظة اللي فالصندوق',
    addCustomCurrToggle: 'زيد عملة أخرى (بحال EUR ولا USD)',
    currCodePlaceholder: 'الرمز (EUR)',
    currNamePlaceholder: 'الاسم (أورو)',
    saveCurrBtn: 'حفظ',
    currFieldsRequired: 'دخل رمز واسم العملة',
    savingCash: 'جاري حفظ الفظة...',
    nextToStep4: 'حفظ الفظة والمرور لجولة التطبيق',
    step4Title: 'جولة كاملة تشرح لك التطبيق والاختصارات',
    step4Desc: 'اضغط على أي صفحة باش تشوفها مباشرة، وتعرف على أهم الاختصارات اللي تسهل عليك الخدمة:',
    appSectionsTab: 'أقسام التطبيق',
    shortcutsTab: 'الاختصارات السريعة',
    tapSectionHint: 'اضغط على أي قسم باش تفتحو وتشوفو:',
    finishTourBtn: 'سالي الجولة وبدا الخدمة',
    prevBtn: 'اللي قبل',
    closeTitle: 'إغلاق الجولة',
    doneToast: 'تبارك الله! تجهزت المحطة والعامل والصندوق، تقدر تبدا الخدمة ذرك.',
    morocco: 'المغرب',
    mauritania: 'موريتانيا',
    sections: [
      {
        tab: 'dashboard',
        title: 'الرئيسية',
        desc: 'بحث سريع على الشكاير، متابعة خدمة كل عامل بوحدو، ملخص الحالات، وصندوق المحطة.',
        icon: 'dashboard',
      },
      {
        tab: 'parcels',
        title: 'الشكاير والرحلات',
        desc: 'تقييد شكارة ولا بزاف، تسيير الرحلات، المانيفست، ملصقات QR وبونات PDF.',
        icon: 'parcels',
      },
      {
        title: 'الزر الأخضر (+ جديد)',
        desc: 'اختصار فوسط الشريط التحتاني لتقييد شكارة جديدة، عملية فالصندوق، ولا تسليم سريع للزبون.',
        icon: 'new',
      },
      {
        tab: 'cash',
        title: 'الصناديق',
        desc: 'حساب كل محطة، الحوالات بين المحطات، صرف العملة، الكريدي، والتقرير اليومي.',
        icon: 'cash',
      },
      {
        tab: 'settings',
        title: 'الإعدادات',
        desc: 'إدارة المحطات والعمال والأكواد، سعر الصرف، شعار التيكيت، اللغة والنسخ الاحتياطي.',
        icon: 'settings',
      },
    ],
    shortcuts: [
      {
        title: 'تبديل المحطات من الفوق',
        desc: 'بدّل بين كل المحطات ولا محطة وحدة باش تعزل حساباتها وشكايرها.',
        icon: 'station',
      },
      {
        title: 'البحث + سكانر الكاميرا (QR)',
        desc: 'قلب بالكود ولا بالتلفون، ولا امسح QR بالكاميرا للشحن والتسليم بالزربة.',
        icon: 'search',
      },
      {
        title: 'اختصار + جديد فوسط الشريط',
        desc: 'من أي صفحة كتقدر تقيد شكارة ولا دير إيداع/سحب بضغطة وحدة.',
        icon: 'plus',
      },
      {
        title: 'زر العين لتغطية الفظة',
        desc: 'خبّي أرقام الصندوق قدام الزبناء بضغطة وحدة على العين الفوق.',
        icon: 'eye',
      },
      {
        title: 'غرفة الشراكة',
        desc: 'تعاون وتبادل الشكاير مع مدراء آخرين بأمان وخصوصية تامة.',
        icon: 'collab',
      },
      {
        title: '5 لغات + وضع الليل والنهار',
        desc: 'بدّل اللغة ولا اللون من الشريط الفوقاني وقت ما بغيتي.',
        icon: 'lang',
      },
      {
        title: 'واتساب وتتبع الزبون',
        desc: 'صيفط للزبون رابط التتبع ديالو فالواتساب مباشرة.',
        icon: 'whatsapp',
      },
    ],
  },
  fr: {
    headerTitle: 'Configuration initiale & Visite guidée',
    step1Short: '1. Station',
    step2Short: '2. Agent',
    step3Short: '3. Caisse',
    step4Short: '4. Visite',
    step1Sub: 'Étape 1 : Nommez votre première station',
    step2Sub: 'Étape 2 : Ajoutez un agent à la station',
    step3Sub: 'Étape 3 : Alimentez les caisses pour démarrer',
    step4Sub: 'Étape 4 : Visite complète de l’application et raccourcis',
    welcomePrefix: 'Bienvenue',
    step1Desc: 'Commencez par nommer votre station et choisir son pays et sa devise. Vous pourrez en ajouter d’autres plus tard.',
    stationNameLabel: 'Nom de la station *',
    stationNamePlaceholder: 'Ex : Agence Dakhla, Nouadhibou...',
    cityLabel: 'Ville *',
    cityPlaceholder: 'Nom de la ville',
    countryLabel: 'Pays',
    phoneOptLabel: 'Téléphone (optionnel)',
    addStationBtn: 'Créer la station',
    addAnotherStationBtn: 'Ajouter une autre station',
    addingStation: 'Création en cours...',
    addedStationsTitle: 'Stations créées',
    noStationsYet: 'Aucune station ajoutée. Saisissez le nom ci-dessus puis cliquez sur Créer.',
    step1ErrorEmpty: 'Veuillez saisir le nom de la station',
    step1NeedOne: 'Veuillez créer au moins une station avant d’ajouter un agent',
    nextToStep2: 'Suivant : Ajouter un agent',
    step2Title: 'Ajouter un agent de station',
    step2Desc: 'Saisissez le nom et le téléphone de votre agent. Un code d’accès direct sera généré automatiquement.',
    workerStationLabel: 'Station assignée',
    workerNameLabel: 'Nom complet de l’agent *',
    workerNamePlaceholder: 'Ex : Mohamed, Ahmed...',
    workerPhoneLabel: 'Téléphone de l’agent *',
    addWorkerBtn: 'Ajouter l’agent et générer le code',
    addingWorker: 'Ajout en cours...',
    workerAddedBadge: 'Agent créé — Conservez son code d’accès :',
    workerCodeLabel: 'Code d’accès direct :',
    copyCodeBtn: 'Copier',
    copiedCodeToast: 'Code d’accès copié',
    currentWorkersTitle: 'Agents enregistrés',
    noWorkersYet: 'Aucun agent ajouté pour le moment. Ajoutez votre premier agent ci-dessus.',
    step2NeedFields: 'Veuillez saisir le nom et le téléphone de l’agent',
    step2NeedOne: 'Ajoutez au moins un agent ou cliquez sur Ignorer pour le moment',
    skipWorkerLater: 'Ignorer pour le moment',
    nextToStep3: 'Suivant : Alimenter les caisses',
    step3Title: 'Ajouter des fonds initiaux aux caisses',
    step3Desc: 'Saisissez le solde de départ de chaque caisse pour démarrer les transferts, encaissements et livraisons.',
    stationCurrLabel: 'Devise de la caisse',
    openingCashLabel: 'Montant initial en caisse',
    addCustomCurrToggle: 'Ajouter une autre devise (EUR, USD...)',
    currCodePlaceholder: 'Code (EUR)',
    currNamePlaceholder: 'Nom (Euro)',
    saveCurrBtn: 'Enregistrer',
    currFieldsRequired: 'Veuillez saisir le code et le nom de la devise',
    savingCash: 'Enregistrement des soldes...',
    nextToStep4: 'Enregistrer et voir la visite guidée',
    step4Title: 'Visite complète & Raccourcis rapides',
    step4Desc: 'Touchez une section pour la prévisualiser en direct et découvrez les raccourcis essentiels :',
    appSectionsTab: 'Sections de l’app',
    shortcutsTab: 'Raccourcis rapides',
    tapSectionHint: 'Touchez une carte pour ouvrir son écran :',
    finishTourBtn: 'Terminer la visite et commencer',
    prevBtn: 'Précédent',
    closeTitle: 'Fermer',
    doneToast: 'Configuration terminée ! Votre station, agent et caisse sont prêts.',
    morocco: 'Maroc',
    mauritania: 'Mauritanie',
    sections: [
      { tab: 'dashboard', title: 'Accueil (Tableau de bord)', desc: 'Recherche colis, suivi individuel par agent, statistiques en temps réel et caisse rapide.', icon: 'dashboard' },
      { tab: 'parcels', title: 'Colis & Voyages', desc: 'Enregistrement simple ou multiple, expéditions, manifeste, étiquettes QR et bons PDF.', icon: 'parcels' },
      { title: 'Bouton Vert (+ Nouveau)', desc: 'Raccourci central en bas pour créer un colis, une opération de caisse ou une livraison rapide.', icon: 'new' },
      { tab: 'cash', title: 'Caisses & Journal financier', desc: 'Soldes multi-devises, transferts inter-stations, change, comptes clients et rapport PDF.', icon: 'cash' },
      { tab: 'settings', title: 'Paramètres', desc: 'Gestion stations/agents/codes, taux de change, logo PDF, langues et sauvegardes.', icon: 'settings' },
    ],
    shortcuts: [
      { title: 'Sélecteur de station en haut', desc: 'Basculez entre Toutes les stations ou une agence précise pour isoler ses données.', icon: 'station' },
      { title: 'Recherche + Scanner QR caméra', desc: 'Recherchez par code ou scannez directement les colis pour charger ou livrer.', icon: 'search' },
      { title: 'Raccourci central + Nouveau', desc: 'Accessible depuis n’importe quel écran pour enregistrer colis ou caisse en un geste.', icon: 'plus' },
      { title: 'Bouton Œil (Confidentialité)', desc: 'Masquez instantanément les montants devant les clients.', icon: 'eye' },
      { title: 'Espace Partenariat', desc: 'Collaborez et échangez des colis avec d’autres gestionnaires en toute sécurité.', icon: 'collab' },
      { title: '5 Langues + Mode Nuit/Jour', desc: 'Changez la langue et le thème depuis la barre supérieure.', icon: 'lang' },
      { title: 'Suivi public & WhatsApp', desc: 'Partagez le lien de suivi QR et les reçus PDF en un clic.', icon: 'whatsapp' },
    ],
  },
  en: {
    headerTitle: 'First-Time Setup & App Tour',
    step1Short: '1. Station',
    step2Short: '2. Worker',
    step3Short: '3. Cashbox',
    step4Short: '4. Tour',
    step1Sub: 'Step 1: Name your first station',
    step2Sub: 'Step 2: Add a worker to your station',
    step3Sub: 'Step 3: Add opening cashbox funds to start',
    step4Sub: 'Step 4: Full app overview & quick shortcuts',
    welcomePrefix: 'Welcome',
    step1Desc: 'Start by naming your station and setting its country and currency. You can edit or add more stations anytime.',
    stationNameLabel: 'Station Name *',
    stationNamePlaceholder: 'e.g., Dakhla Station, Nouadhibou...',
    cityLabel: 'City *',
    cityPlaceholder: 'City name',
    countryLabel: 'Country',
    phoneOptLabel: 'Station Phone (optional)',
    addStationBtn: 'Create Station',
    addAnotherStationBtn: 'Add Another Station',
    addingStation: 'Creating station...',
    addedStationsTitle: 'Added Stations',
    noStationsYet: 'No stations added yet. Enter a station name above and tap Create.',
    step1ErrorEmpty: 'Please enter a station name first',
    step1NeedOne: 'Please create at least one station before adding a worker',
    nextToStep2: 'Next: Add a Worker',
    step2Title: 'Add a Station Worker',
    step2Desc: 'Enter the worker name, phone number, and assigned station. A direct login code will be generated automatically.',
    workerStationLabel: 'Assigned Station',
    workerNameLabel: 'Worker Full Name *',
    workerNamePlaceholder: 'e.g., Mohamed, Ahmed...',
    workerPhoneLabel: 'Worker Phone Number *',
    addWorkerBtn: 'Add Worker & Generate Code',
    addingWorker: 'Adding worker...',
    workerAddedBadge: 'Worker account created — Save their login code:',
    workerCodeLabel: 'Direct Login Code:',
    copyCodeBtn: 'Copy Code',
    copiedCodeToast: 'Worker login code copied',
    currentWorkersTitle: 'Registered Workers',
    noWorkersYet: 'No workers added yet. Add your first worker above.',
    step2NeedFields: 'Please enter worker name and phone number',
    step2NeedOne: 'Add at least one worker or tap Skip for now',
    skipWorkerLater: 'Skip adding a worker for now',
    nextToStep3: 'Next: Fund Cashboxes',
    step3Title: 'Add Opening Funds to Cashboxes',
    step3Desc: 'Enter the starting balance for each station cashbox so your team can start transfers and operations immediately.',
    stationCurrLabel: 'Cashbox Currency',
    openingCashLabel: 'Opening Cash Amount',
    addCustomCurrToggle: 'Add another currency (EUR, USD...)',
    currCodePlaceholder: 'Code (EUR)',
    currNamePlaceholder: 'Name (Euro)',
    saveCurrBtn: 'Save',
    currFieldsRequired: 'Please enter currency code and name',
    savingCash: 'Saving balances...',
    nextToStep4: 'Save Funds & Start App Tour',
    step4Title: 'Full App Tour & Quick Shortcuts',
    step4Desc: 'Tap any section below to preview it live in the background, and review the built-in shortcuts:',
    appSectionsTab: 'App Sections',
    shortcutsTab: 'Quick Shortcuts',
    tapSectionHint: 'Tap a card to switch to that screen:',
    finishTourBtn: 'Finish Tour & Start Working',
    prevBtn: 'Back',
    closeTitle: 'Close Tour',
    doneToast: 'Setup complete! Your station, worker, and cashbox are ready.',
    morocco: 'Morocco',
    mauritania: 'Mauritania',
    sections: [
      { tab: 'dashboard', title: 'Dashboard', desc: 'Fast parcel search, per-worker activity tracking, status overview, and quick cashbox.', icon: 'dashboard' },
      { tab: 'parcels', title: 'Parcels & Trips', desc: 'Single or batch parcel intake, trip dispatch, cargo manifests, 10x10 QR labels & PDFs.', icon: 'parcels' },
      { title: 'Center Green (+ New)', desc: 'Instant bottom shortcut to register a parcel, cash voucher, or quick customer delivery.', icon: 'new' },
      { tab: 'cash', title: 'Cashboxes & Ledger', desc: 'Per-station multi-currency balances, transfers, currency exchange, credit & daily PDF.', icon: 'cash' },
      { tab: 'settings', title: 'Settings', desc: 'Manage stations, workers & access codes, exchange rates, sticker logos, languages & export.', icon: 'settings' },
    ],
    shortcuts: [
      { title: 'Top Station Switcher', desc: 'Switch between All Stations or one station to isolate its parcels, workers, and cash.', icon: 'station' },
      { title: 'Search + Camera QR Scanner', desc: 'Search by tracking code or phone, or scan QR codes continuously for trips & delivery.', icon: 'search' },
      { title: 'Center + New Shortcut', desc: 'Available from every tab to add parcels, cash entries, or quick deliveries in seconds.', icon: 'plus' },
      { title: 'Privacy Eye Toggle', desc: 'Hide cashbox amounts instantly when customers are nearby.', icon: 'eye' },
      { title: 'Partnership Room', desc: 'Connect with partner station managers and exchange parcels securely.', icon: 'collab' },
      { title: '5 Languages + Night/Day Theme', desc: 'Switch language and light/dark appearance right from the top bar.', icon: 'lang' },
      { title: 'Public Tracking & WhatsApp', desc: 'Share live QR tracking links and receipts with customers on WhatsApp.', icon: 'whatsapp' },
    ],
  },
  es: {
    headerTitle: 'Configuración inicial y Tour',
    step1Short: '1. Estación',
    step2Short: '2. Agente',
    step3Short: '3. Caja',
    step4Short: '4. Tour',
    step1Sub: 'Paso 1: Nombra tu primera estación',
    step2Sub: 'Paso 2: Añade un agente a tu estación',
    step3Sub: 'Paso 3: Añade dinero a las cajas para empezar',
    step4Sub: 'Paso 4: Tour completo de la app y atajos',
    welcomePrefix: 'Bienvenido',
    step1Desc: 'Empieza nombrando tu estación y eligiendo su país y moneda. Podrás editarla o añadir más cuando quieras.',
    stationNameLabel: 'Nombre de la estación *',
    stationNamePlaceholder: 'Ej: Estación Dakhla, Nouadhibou...',
    cityLabel: 'Ciudad *',
    cityPlaceholder: 'Nombre de la ciudad',
    countryLabel: 'País',
    phoneOptLabel: 'Teléfono (opcional)',
    addStationBtn: 'Crear estación',
    addAnotherStationBtn: 'Añadir otra estación',
    addingStation: 'Creando estación...',
    addedStationsTitle: 'Estaciones creadas',
    noStationsYet: 'Aún no hay estaciones. Escribe el nombre arriba y pulsa Crear.',
    step1ErrorEmpty: 'Introduce el nombre de la estación primero',
    step1NeedOne: 'Crea al menos una estación antes de añadir un agente',
    nextToStep2: 'Siguiente: Añadir agente',
    step2Title: 'Añadir un agente de estación',
    step2Desc: 'Introduce el nombre y teléfono del agente y elige su estación. Se generará su código de acceso directo.',
    workerStationLabel: 'Estación asignada',
    workerNameLabel: 'Nombre completo del agente *',
    workerNamePlaceholder: 'Ej: Mohamed, Ahmed...',
    workerPhoneLabel: 'Teléfono del agente *',
    addWorkerBtn: 'Añadir agente y generar código',
    addingWorker: 'Añadiendo agente...',
    workerAddedBadge: 'Agente creado — Guarda su código de acceso:',
    workerCodeLabel: 'Código de acceso directo:',
    copyCodeBtn: 'Copiar',
    copiedCodeToast: 'Código de acceso copiado',
    currentWorkersTitle: 'Agentes registrados',
    noWorkersYet: 'Aún no hay agentes añadidos. Añade tu primer agente arriba.',
    step2NeedFields: 'Introduce el nombre y teléfono del agente',
    step2NeedOne: 'Añade al menos un agente u omite este paso por ahora',
    skipWorkerLater: 'Omitir por ahora',
    nextToStep3: 'Siguiente: Fondos de caja',
    step3Title: 'Añadir dinero inicial a las cajas',
    step3Desc: 'Introduce el saldo inicial de cada caja para comenzar transferencias y operaciones al instante.',
    stationCurrLabel: 'Moneda de la caja',
    openingCashLabel: 'Saldo inicial en caja',
    addCustomCurrToggle: 'Añadir otra moneda (EUR, USD...)',
    currCodePlaceholder: 'Código (EUR)',
    currNamePlaceholder: 'Nombre (Euro)',
    saveCurrBtn: 'Guardar',
    currFieldsRequired: 'Introduce código y nombre de la moneda',
    savingCash: 'Guardando saldos...',
    nextToStep4: 'Guardar fondos y ver el tour',
    step4Title: 'Tour completo y Atajos rápidos',
    step4Desc: 'Pulsa cualquier sección para verla en directo y descubre los atajos principales:',
    appSectionsTab: 'Secciones',
    shortcutsTab: 'Atajos rápidos',
    tapSectionHint: 'Pulsa una tarjeta para abrir esa pantalla:',
    finishTourBtn: 'Finalizar tour y empezar a trabajar',
    prevBtn: 'Anterior',
    closeTitle: 'Cerrar',
    doneToast: 'Configuración completada. Tu estación, agente y caja están listos.',
    morocco: 'Marruecos',
    mauritania: 'Mauritania',
    sections: [
      { tab: 'dashboard', title: 'Inicio (Panel)', desc: 'Búsqueda rápida, control por agente, resumen de envíos y caja rápida.', icon: 'dashboard' },
      { tab: 'parcels', title: 'Paquetes y Viajes', desc: 'Registro simple o múltiple, despachos, manifiesto, etiquetas QR y PDF.', icon: 'parcels' },
      { title: 'Botón Verde (+ Nuevo)', desc: 'Atajo central inferior para registrar paquete, movimiento de caja o entrega rápida.', icon: 'new' },
      { tab: 'cash', title: 'Cajas y Libro financiero', desc: 'Saldos por moneda, transferencias, cambio de divisas, crédito y reporte diario.', icon: 'cash' },
      { tab: 'settings', title: 'Ajustes', desc: 'Estaciones, agentes y códigos, tipos de cambio, logo PDF, idiomas y copias.', icon: 'settings' },
    ],
    shortcuts: [
      { title: 'Selector de estación superior', desc: 'Cambia entre Todas las estaciones o una sola para aislar sus datos.', icon: 'station' },
      { title: 'Búsqueda + Escáner QR cámara', desc: 'Busca por código o escanea paquetes en serie para envío o entrega.', icon: 'search' },
      { title: 'Atajo central + Nuevo', desc: 'Disponible en toda la app para registrar paquetes o caja en segundos.', icon: 'plus' },
      { title: 'Ojo de privacidad', desc: 'Oculta los importes de caja al instante delante de clientes.', icon: 'eye' },
      { title: 'Sala de Asociación', desc: 'Colabora e intercambia paquetes de forma segura con otros gestores.', icon: 'collab' },
      { title: '5 Idiomas + Modo Noche/Día', desc: 'Cambia idioma y tema desde la barra superior.', icon: 'lang' },
      { title: 'Seguimiento público y WhatsApp', desc: 'Envía enlaces QR de seguimiento y recibos por WhatsApp.', icon: 'whatsapp' },
    ],
  },
};

export const GuidedSetupTourModal: React.FC<GuidedSetupTourModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
}) => {
  const {
    currentUser,
    currentWorkspace,
    stations,
    workspaceMembers,
    currencies,
    language,
    addStation,
    updateStation,
    deleteStation,
    addWorkerByOwner,
    addCurrency,
    addBalanceAdjustment,
    showToast,
    t,
  } = useApp();

  const langKey: TourLang = (language as TourLang) in TOUR_COPY ? (language as TourLang) : 'ar';
  const copy = TOUR_COPY[langKey];
  const dir = langKey === 'ar' || langKey === 'hassaniya' ? 'rtl' : 'ltr';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Station Name & Creation
  const [stName, setStName] = useState('');
  const [stCity, setStCity] = useState('');
  const [stCityEditedManually, setStCityEditedManually] = useState(false);
  const [stCountry, setStCountry] = useState<'MA' | 'MR'>('MA');
  const [stPhone, setStPhone] = useState('');
  const [stCurrency, setStCurrency] = useState<string>('MAD');
  const [isAddingStation, setIsAddingStation] = useState(false);

  // Step 2: Add Worker
  const [workerStationId, setWorkerStationId] = useState<string>('');
  const [workerName, setWorkerName] = useState('');
  const [workerPhone, setWorkerPhone] = useState('');
  const [isAddingWorker, setIsAddingWorker] = useState(false);
  const [createdWorkers, setCreatedWorkers] = useState<CreatedWorkerCred[]>([]);
  const [latestWorkerCred, setLatestWorkerCred] = useState<CreatedWorkerCred | null>(null);

  // Step 3: Cashbox Opening Funds
  const [stationCurrencyMap, setStationCurrencyMap] = useState<Record<string, string>>({});
  const [openingBalances, setOpeningBalances] = useState<Record<string, string>>({});
  const [showNewCurrForm, setShowNewCurrForm] = useState(false);
  const [newCurrCode, setNewCurrCode] = useState('');
  const [newCurrLabel, setNewCurrLabel] = useState('');
  const [isSavingStep3, setIsSavingStep3] = useState(false);

  // Step 4: App & Shortcuts Tour Tab
  const [tourTab, setTourTab] = useState<'sections' | 'shortcuts'>('sections');
  const [highlightedTab, setHighlightedTab] = useState<NavTab>('dashboard');

  const existingWorkers = useMemo(() => {
    return workspaceMembers.filter((m) => m.role === 'worker' && m.status === 'active' && !m.is_demo);
  }, [workspaceMembers]);

  // Reset to Step 1 when modal opens fresh
  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setTourTab('sections');
    setHighlightedTab('dashboard');
  }, [isOpen]);

  // Keep workerStationId & stationCurrencyMap synced with stations
  useEffect(() => {
    if (stations.length > 0 && (!workerStationId || !stations.some((s) => s.id === workerStationId))) {
      setWorkerStationId(stations[0].id);
    }
    const nextMap: Record<string, string> = {};
    stations.forEach((s) => {
      nextMap[s.id] = s.currency || s.default_currency || (s.country === 'MR' ? 'MRU' : 'MAD');
    });
    setStationCurrencyMap((prev) => ({ ...nextMap, ...prev }));
  }, [stations, workerStationId]);

  // Navigate underlying view smoothly as user moves through the 4 steps
  useEffect(() => {
    if (!isOpen) return;
    if (step === 1) onSelectTab('dashboard');
    else if (step === 2) onSelectTab('settings');
    else if (step === 3) onSelectTab('cash');
    else if (step === 4) onSelectTab(highlightedTab);
  }, [step, isOpen, highlightedTab, onSelectTab]);

  if (!isOpen) return null;

  const markOnboardingFinished = () => {
    if (currentUser?.id) {
      localStorage.setItem(`alittihadia_guided_tour_seen_${currentUser.id}`, 'true');
    }
    if (currentWorkspace?.id) {
      localStorage.setItem(`alittihadia_guided_tour_completed_${currentWorkspace.id}`, 'true');
      localStorage.removeItem(`alittihadia_guided_tour_pending_${currentWorkspace.id}`);
    }
  };

  // Step 1 Handlers
  const handleAddStationInStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = stName.trim() || stCity.trim();
    const cleanCity = (stCityEditedManually ? stCity.trim() : cleanName) || cleanName;
    if (!cleanName) {
      showToast(copy.step1ErrorEmpty, 'error');
      return;
    }

    setIsAddingStation(true);
    try {
      const defaultCurr = stCurrency || (stCountry === 'MR' ? 'MRU' : 'MAD');
      const res = await addStation(cleanName, cleanCity, stCountry, stPhone.trim(), undefined, defaultCurr);
      if (res.success && res.station) {
        setStationCurrencyMap((prev) => ({
          ...prev,
          [res.station!.id]: defaultCurr,
        }));
        if (!workerStationId) {
          setWorkerStationId(res.station.id);
        }
        setStName('');
        setStCity('');
        setStCityEditedManually(false);
        setStPhone('');
        if (stations.length === 0) {
          const nextCountry = stCountry === 'MA' ? 'MR' : 'MA';
          setStCountry(nextCountry);
          setStCurrency(nextCountry === 'MR' ? 'MRU' : 'MAD');
        }
      }
    } finally {
      setIsAddingStation(false);
    }
  };

  const handleGoToStep2 = () => {
    if (stations.length === 0) {
      showToast(copy.step1NeedOne, 'error');
      return;
    }
    if (!workerStationId && stations[0]) {
      setWorkerStationId(stations[0].id);
    }
    setStep(2);
  };

  // Step 2 Handlers
  const handleAddWorkerInStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim() || !workerPhone.trim()) {
      showToast(copy.step2NeedFields, 'error');
      return;
    }
    const targetStationId = workerStationId || stations[0]?.id;
    if (!targetStationId) {
      showToast(copy.step1NeedOne, 'error');
      return;
    }

    setIsAddingWorker(true);
    try {
      const res = await addWorkerByOwner(workerName.trim(), workerPhone.trim(), targetStationId);
      if (res.success) {
        const targetStation = stations.find((s) => s.id === targetStationId);
        const cred: CreatedWorkerCred = {
          name: workerName.trim(),
          phone: workerPhone.trim(),
          stationName: targetStation?.name || '',
          code: res.temporaryPassword || '',
        };
        setLatestWorkerCred(cred);
        setCreatedWorkers((prev) => [cred, ...prev]);
        setWorkerName('');
        setWorkerPhone('');
      } else if (res.error) {
        showToast(res.error, 'error');
      }
    } finally {
      setIsAddingWorker(false);
    }
  };

  const handleGoToStep3 = () => {
    if (existingWorkers.length === 0 && createdWorkers.length === 0) {
      showToast(copy.step2NeedOne, 'error');
      return;
    }
    setStep(3);
  };

  // Step 3 Handlers
  const handleAddCustomCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCurrCode.trim() || !newCurrLabel.trim()) {
      showToast(copy.currFieldsRequired, 'error');
      return;
    }
    await addCurrency(
      newCurrCode.trim().toUpperCase(),
      newCurrLabel.trim(),
      newCurrCode.trim().toUpperCase()
    );
    setNewCurrCode('');
    setNewCurrLabel('');
    setShowNewCurrForm(false);
  };

  const handleSaveStep3AndNext = async () => {
    setIsSavingStep3(true);
    try {
      for (const st of stations) {
        const chosenCurr =
          stationCurrencyMap[st.id] || st.currency || st.default_currency || (st.country === 'MR' ? 'MRU' : 'MAD');
        if (st.currency !== chosenCurr || st.default_currency !== chosenCurr) {
          await updateStation(st.id, { currency: chosenCurr, default_currency: chosenCurr });
        }

        const rawBal = parseFloat(openingBalances[st.id] || '0');
        if (!isNaN(rawBal) && rawBal > 0) {
          await addBalanceAdjustment(
            st.id,
            chosenCurr,
            rawBal,
            `رصيد افتتاحي لصندوق محطة ${st.name} (${chosenCurr})`
          );
        }
      }
      setOpeningBalances({});
      setStep(4);
    } finally {
      setIsSavingStep3(false);
    }
  };

  // Step 4 Handlers
  const handleCompleteTour = () => {
    markOnboardingFinished();
    onSelectTab('dashboard');
    showToast(copy.doneToast, 'success');
    onClose();
  };

  const handleSkipForNow = () => {
    markOnboardingFinished();
    onSelectTab('dashboard');
    onClose();
  };

  const ForwardArrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  const BackArrow = dir === 'rtl' ? ArrowRight : ArrowLeft;

  const renderSectionIcon = (icon: 'dashboard' | 'parcels' | 'new' | 'cash' | 'settings') => {
    if (icon === 'dashboard') return <LayoutGrid className="w-4 h-4" />;
    if (icon === 'parcels') return <Package className="w-4 h-4" />;
    if (icon === 'new') return <Plus className="w-4 h-4 stroke-[2.75]" />;
    if (icon === 'cash') return <Wallet className="w-4 h-4" />;
    return <Settings className="w-4 h-4" />;
  };

  const renderShortcutIcon = (icon: 'station' | 'search' | 'plus' | 'eye' | 'collab' | 'lang' | 'whatsapp') => {
    if (icon === 'station') return <Store className="w-4 h-4" />;
    if (icon === 'search') return <Search className="w-4 h-4" />;
    if (icon === 'plus') return <Plus className="w-4 h-4" />;
    if (icon === 'eye') return <EyeOff className="w-4 h-4" />;
    if (icon === 'collab') return <Handshake className="w-4 h-4" />;
    if (icon === 'lang') return <Globe className="w-4 h-4" />;
    return <MessageCircle className="w-4 h-4" />;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2.5 bg-black/80 backdrop-blur-sm animate-fadeIn overflow-y-auto"
      dir={dir}
      data-no-translate="true"
    >
      <div className="w-full max-w-[420px] luxury-card rounded-[26px] border-2 border-[#F5C84C]/70 p-4 shadow-[0_0_50px_rgba(0,0,0,0.95)] space-y-3.5 relative my-auto max-h-[92vh] overflow-y-auto">
        {/* Top Progress Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#F7D674] to-[#D4A238] text-[#111111] flex items-center justify-center shrink-0 shadow-md">
              <Compass className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-black text-white truncate">
                  {copy.headerTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] text-[10px] font-mono tabular-nums font-black shrink-0">
                  {step} / 4
                </span>
              </div>
              <p className="text-[10px] text-white/75 truncate">
                {step === 1 && copy.step1Sub}
                {step === 2 && copy.step2Sub}
                {step === 3 && copy.step3Sub}
                {step === 4 && copy.step4Sub}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSkipForNow}
            className="btn-cancel min-w-[36px] min-h-[36px] p-1.5 rounded-xl text-[10px] font-bold shrink-0 text-white/80 hover:text-white flex items-center justify-center cursor-pointer"
            title={copy.closeTitle}
            aria-label={copy.closeTitle}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 4-Step Progress Bar */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            { num: 1 as const, label: copy.step1Short, icon: Store },
            { num: 2 as const, label: copy.step2Short, icon: Users },
            { num: 3 as const, label: copy.step3Short, icon: Coins },
            { num: 4 as const, label: copy.step4Short, icon: Compass },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = step === item.num;
            const isDone = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active-fixed="true"
                onClick={() => {
                  if (item.num > 1 && stations.length === 0) {
                    showToast(copy.step1NeedOne, 'error');
                    return;
                  }
                  setStep(item.num);
                }}
                className={`min-h-[44px] py-1.5 px-1 rounded-xl border text-[10px] font-black flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-br from-[#F7D674] to-[#D4A238] text-[#111111] border-[#F5C84C] shadow-md'
                    : isDone
                    ? 'bg-[#006233]/35 text-[#68E399] border-[#2ECC71]/50'
                    : 'bg-black/55 text-white/70 border-white/15'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate w-full text-center">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* =================================================================== */}
        {/* STEP 1: STATION NAME & CREATION                                     */}
        {/* =================================================================== */}
        {step === 1 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#8c6d2c]/30 to-black/75 border border-[#F5C84C]/45 space-y-1">
              <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                <Store className="w-4 h-4 shrink-0" />
                <span>
                  {copy.welcomePrefix} {currentUser?.name || ''}
                </span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">{copy.step1Desc}</p>
            </div>

            <form
              onSubmit={handleAddStationInStep1}
              className="p-3 rounded-2xl bg-black/60 border border-white/15 space-y-2.5"
            >
              <div>
                <label className="block text-[10px] text-white/85 font-bold mb-1">
                  {copy.stationNameLabel}
                </label>
                <input
                  type="text"
                  required
                  value={stName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStName(val);
                    if (!stCityEditedManually) {
                      setStCity(val);
                    }
                  }}
                  placeholder={copy.stationNamePlaceholder}
                  className="w-full min-h-[42px] bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    {copy.cityLabel}
                  </label>
                  <input
                    type="text"
                    value={stCity}
                    onChange={(e) => {
                      setStCity(e.target.value);
                      setStCityEditedManually(true);
                    }}
                    placeholder={copy.cityPlaceholder}
                    className="w-full min-h-[40px] bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    {copy.countryLabel}
                  </label>
                  <select
                    value={stCountry}
                    onChange={(e) => {
                      const c = e.target.value as 'MA' | 'MR';
                      setStCountry(c);
                      setStCurrency(c === 'MR' ? 'MRU' : 'MAD');
                    }}
                    className="w-full min-h-[40px] bg-black/75 border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                  >
                    <option value="MA">🇲🇦 {copy.morocco}</option>
                    <option value="MR">🇲🇷 {copy.mauritania}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-white/85 font-bold mb-1">
                  {copy.phoneOptLabel}
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={stPhone}
                  onChange={(e) => setStPhone(e.target.value)}
                  placeholder="06..."
                  className="w-full min-h-[40px] bg-black/75 border border-white/20 rounded-xl px-2.5 py-2 text-white font-mono text-xs text-left focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isAddingStation}
                data-btn-role="add"
                data-btn-role-fixed="true"
                className="btn-add w-full min-h-[44px] py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {isAddingStation
                    ? copy.addingStation
                    : stations.length === 0
                    ? copy.addStationBtn
                    : copy.addAnotherStationBtn}
                </span>
              </button>
            </form>

            {/* List of Added Stations */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-black text-white px-1">
                <span>
                  {copy.addedStationsTitle} ({stations.length})
                </span>
              </div>

              {stations.length === 0 ? (
                <div className="p-3 rounded-2xl bg-black/45 border border-dashed border-white/20 text-center text-[11px] text-white/70">
                  {copy.noStationsYet}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                  {stations.map((st, idx) => (
                    <div
                      key={st.id}
                      className="p-2.5 rounded-xl bg-black/65 border border-[#F5C84C]/40 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-6 h-6 rounded-lg bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] font-mono tabular-nums font-black text-[11px] flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="font-black text-white text-xs truncate">
                            {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name}
                          </div>
                          <div className="text-[10px] text-white/75 truncate">
                            {st.city} · {st.currency || st.default_currency || (st.country === 'MR' ? 'MRU' : 'MAD')}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteStation(st.id)}
                        className="btn-delete min-w-[34px] min-h-[34px] p-1.5 rounded-lg shrink-0 flex items-center justify-center cursor-pointer"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={handleGoToStep2}
                className="btn-gold w-full min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <span>{copy.nextToStep2}</span>
                <ForwardArrow className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 2: ADD A WORKER TO A STATION                                   */}
        {/* =================================================================== */}
        {step === 2 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#006233]/35 to-black/75 border border-[#2ECC71]/45 space-y-1">
              <div className="flex items-center gap-1.5 text-[#68E399] font-black text-xs">
                <Users className="w-4 h-4 shrink-0" />
                <span>{copy.step2Title}</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">{copy.step2Desc}</p>
            </div>

            <form
              onSubmit={handleAddWorkerInStep2}
              className="p-3 rounded-2xl bg-black/60 border border-white/15 space-y-2.5"
            >
              <div>
                <label className="block text-[10px] text-white/85 font-bold mb-1">
                  {copy.workerStationLabel}
                </label>
                <select
                  value={workerStationId || stations[0]?.id || ''}
                  onChange={(e) => setWorkerStationId(e.target.value)}
                  className="w-full min-h-[40px] bg-black/75 border border-[#F5C84C]/50 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    {copy.workerNameLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder={copy.workerNamePlaceholder}
                    className="w-full min-h-[40px] bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-white/85 font-bold mb-1">
                    {copy.workerPhoneLabel}
                  </label>
                  <input
                    type="tel"
                    required
                    dir="ltr"
                    value={workerPhone}
                    onChange={(e) => setWorkerPhone(e.target.value)}
                    placeholder="06..."
                    className="w-full min-h-[40px] bg-black/75 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-2 text-white font-mono text-xs text-left focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAddingWorker}
                data-btn-role="add"
                data-btn-role-fixed="true"
                className="btn-add w-full min-h-[44px] py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>{isAddingWorker ? copy.addingWorker : copy.addWorkerBtn}</span>
              </button>
            </form>

            {/* Generated Access Code Card */}
            {latestWorkerCred && latestWorkerCred.code && (
              <div className="p-3 rounded-2xl bg-emerald-950/75 border border-emerald-400/60 space-y-2 animate-fadeIn">
                <div className="text-[11px] font-black text-emerald-300">
                  {copy.workerAddedBadge}
                </div>
                <div className="flex items-center justify-between gap-2 bg-black/60 border border-white/15 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white truncate">
                      {latestWorkerCred.name} · {latestWorkerCred.stationName}
                    </div>
                    <div className="text-[11px] text-white/80 flex items-center gap-1.5 mt-0.5">
                      <span>{copy.workerCodeLabel}</span>
                      <span dir="ltr" className="font-mono tabular-nums font-black text-[#F5C84C]">
                        {latestWorkerCred.code}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(latestWorkerCred.code);
                      showToast(`${copy.copiedCodeToast}: ${latestWorkerCred.code}`, 'success');
                    }}
                    className="btn-gold px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copy.copyCodeBtn}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Existing / Added Workers List */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-black text-white px-1">
                {copy.currentWorkersTitle} ({existingWorkers.length})
              </div>

              {existingWorkers.length === 0 ? (
                <div className="p-3 rounded-2xl bg-black/45 border border-dashed border-white/20 text-center text-[11px] text-white/70">
                  {copy.noWorkersYet}
                </div>
              ) : (
                <div className="space-y-1.5 max-h-28 overflow-y-auto pr-0.5">
                  {existingWorkers.map((w) => {
                    const stName = stations.find((s) => s.id === w.station_id)?.name || '';
                    const code = w.worker_code || w.profile?.worker_code || '';
                    return (
                      <div
                        key={w.user_id}
                        className="p-2 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white truncate">
                            {w.profile?.name || 'Worker'}
                          </div>
                          <div className="text-[10px] text-white/70 truncate">
                            {stName} · <span dir="ltr" className="font-mono">{w.profile?.phone}</span>
                          </div>
                        </div>
                        {code && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(code);
                              showToast(`${copy.copiedCodeToast}: ${code}`, 'success');
                            }}
                            className="px-2 py-1 rounded-lg bg-[#F5C84C]/15 border border-[#F5C84C]/40 text-[#F5C84C] font-mono text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer"
                            dir="ltr"
                          >
                            <Key className="w-3 h-3" />
                            <span>{code}</span>
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Step 2 Footer */}
            <div className="pt-2 border-t border-white/15 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="btn-cancel min-h-[44px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
                >
                  <BackArrow className="w-4 h-4" />
                  <span>{copy.prevBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={handleGoToStep3}
                  className="btn-gold flex-1 min-h-[44px] py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
                >
                  <span>{copy.nextToStep3}</span>
                  <ForwardArrow className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {existingWorkers.length === 0 && createdWorkers.length === 0 && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="w-full py-1.5 text-[11px] font-bold text-white/70 hover:text-white underline cursor-pointer bg-transparent border-0"
                >
                  {copy.skipWorkerLater}
                </button>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 3: ADD MONEY TO CASHBOXES TO START OPERATIONS                  */}
        {/* =================================================================== */}
        {step === 3 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#006233]/35 to-black/75 border border-[#2ECC71]/45 space-y-1">
              <div className="flex items-center gap-1.5 text-[#68E399] font-black text-xs">
                <Coins className="w-4 h-4 shrink-0" />
                <span>{copy.step3Title}</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">{copy.step3Desc}</p>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
              {stations.map((st, idx) => {
                const selectedCurr =
                  stationCurrencyMap[st.id] ||
                  st.currency ||
                  st.default_currency ||
                  (st.country === 'MR' ? 'MRU' : 'MAD');
                return (
                  <div
                    key={st.id}
                    className="p-3 rounded-2xl bg-black/65 border border-[#F5C84C]/40 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-white text-xs truncate">
                        {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {idx + 1}. {st.name}
                      </span>
                      <span className="text-[#F5C84C] font-mono tabular-nums text-[11px] font-black shrink-0">
                        {selectedCurr}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-white/80 font-bold mb-1">
                          {copy.stationCurrLabel}
                        </label>
                        <select
                          value={selectedCurr}
                          onChange={(e) =>
                            setStationCurrencyMap((prev) => ({
                              ...prev,
                              [st.id]: e.target.value,
                            }))
                          }
                          className="w-full min-h-[40px] bg-black/80 border border-[#F5C84C]/50 rounded-xl px-2.5 py-2 text-white text-xs font-bold focus:outline-none"
                        >
                          {currencies.map((c) => (
                            <option key={c.code} value={c.code}>
                              {t(c.code.toLowerCase(), c.label_ar)} ({c.code})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-white/80 font-bold mb-1">
                          {copy.openingCashLabel}
                        </label>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          dir="ltr"
                          value={openingBalances[st.id] || ''}
                          onChange={(e) =>
                            setOpeningBalances((prev) => ({
                              ...prev,
                              [st.id]: e.target.value,
                            }))
                          }
                          placeholder={`0 ${selectedCurr}`}
                          className="w-full min-h-[40px] bg-black/80 border border-white/20 focus:border-[#F5C84C] rounded-xl px-2.5 py-2 text-white font-mono tabular-nums text-xs text-center font-bold focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Optional Add Custom Currency */}
            <div className="bg-black/50 rounded-xl p-2.5 border border-white/15">
              <button
                type="button"
                onClick={() => setShowNewCurrForm((prev) => !prev)}
                className="text-[11px] font-black text-[#F5C84C] flex items-center gap-1 cursor-pointer bg-transparent border-0 p-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{copy.addCustomCurrToggle}</span>
              </button>

              {showNewCurrForm && (
                <form
                  onSubmit={handleAddCustomCurrency}
                  className="mt-2 pt-2 border-t border-white/10 space-y-2"
                >
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      type="text"
                      required
                      dir="ltr"
                      placeholder={copy.currCodePlaceholder}
                      value={newCurrCode}
                      onChange={(e) => setNewCurrCode(e.target.value)}
                      className="bg-black/75 border border-white/20 rounded-lg px-2 py-1.5 text-white font-mono text-[11px] text-center"
                    />
                    <input
                      type="text"
                      required
                      placeholder={copy.currNamePlaceholder}
                      value={newCurrLabel}
                      onChange={(e) => setNewCurrLabel(e.target.value)}
                      className="bg-black/75 border border-white/20 rounded-lg px-2 py-1.5 text-white text-[11px]"
                    />
                    <button
                      type="submit"
                      className="btn-gold rounded-lg text-[11px] font-black py-1.5 px-2 cursor-pointer"
                    >
                      {copy.saveCurrBtn}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Step 3 Footer */}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-cancel min-h-[44px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <BackArrow className="w-4 h-4" />
                <span>{copy.prevBtn}</span>
              </button>

              <button
                type="button"
                disabled={isSavingStep3}
                onClick={handleSaveStep3AndNext}
                className="btn-gold flex-1 min-h-[44px] py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <span>{isSavingStep3 ? copy.savingCash : copy.nextToStep4}</span>
                <ForwardArrow className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 4: FULL APP OVERVIEW & SHORTCUTS TOUR                          */}
        {/* =================================================================== */}
        {step === 4 && (
          <div className="space-y-3 text-xs animate-fadeIn">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-[#8c6d2c]/40 to-black/80 border border-[#F5C84C]/60 space-y-1">
              <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                <Compass className="w-4 h-4 shrink-0" />
                <span>{copy.step4Title}</span>
              </div>
              <p className="text-[11px] text-white/90 leading-relaxed">{copy.step4Desc}</p>
            </div>

            {/* Sub-Tabs: App Sections vs Quick Shortcuts */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/65 border border-white/15">
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active-fixed="true"
                onClick={() => setTourTab('sections')}
                className={`min-h-[40px] py-1.5 px-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  tourTab === 'sections' ? 'btn-gold' : 'text-white/75 hover:text-white'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>{copy.appSectionsTab}</span>
              </button>
              <button
                type="button"
                data-btn-role="info"
                data-btn-role-fixed="true"
                data-btn-active-fixed="true"
                onClick={() => setTourTab('shortcuts')}
                className={`min-h-[40px] py-1.5 px-2 rounded-lg text-[11px] font-black flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  tourTab === 'shortcuts' ? 'btn-gold' : 'text-white/75 hover:text-white'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>{copy.shortcutsTab}</span>
              </button>
            </div>

            {tourTab === 'sections' ? (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-[#F5C84C] px-1">{copy.tapSectionHint}</p>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                  {copy.sections.map((sec) => {
                    const isFocused = sec.tab && highlightedTab === sec.tab;
                    return (
                      <button
                        key={sec.title}
                        type="button"
                        data-btn-role="info"
                        data-btn-role-fixed="true"
                        data-btn-active-fixed="true"
                        onClick={() => {
                          if (sec.tab) {
                            setHighlightedTab(sec.tab);
                            onSelectTab(sec.tab);
                          }
                        }}
                        className={`w-full p-2.5 rounded-xl border flex items-start gap-2.5 text-start transition cursor-pointer ${
                          isFocused
                            ? 'bg-[#D4AF37]/15 border-[#F5C84C]'
                            : 'bg-black/60 border-white/15 hover:border-[#F5C84C]/50'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                            sec.icon === 'new'
                              ? 'bg-[#006233]/35 border border-emerald-500/50 text-emerald-300'
                              : 'bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C]'
                          }`}
                        >
                          {renderSectionIcon(sec.icon)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-black text-white text-xs">{sec.title}</h4>
                          <p className="text-[11px] text-white/75 leading-relaxed mt-0.5">
                            {sec.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                {copy.shortcuts.map((sc) => (
                  <div
                    key={sc.title}
                    className="p-2.5 rounded-xl bg-black/60 border border-white/15 flex items-start gap-2.5"
                  >
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                      {renderShortcutIcon(sc.icon)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-black text-white text-xs">{sc.title}</h4>
                      <p className="text-[11px] text-white/75 leading-relaxed mt-0.5">{sc.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Step 4 Footer */}
            <div className="pt-2 border-t border-white/15 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-cancel min-h-[44px] py-2.5 px-3 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer"
              >
                <BackArrow className="w-4 h-4" />
                <span>{copy.prevBtn}</span>
              </button>

              <button
                type="button"
                onClick={handleCompleteTour}
                data-btn-role="add"
                data-btn-role-fixed="true"
                className="btn-add flex-1 min-h-[44px] py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>{copy.finishTourBtn}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
