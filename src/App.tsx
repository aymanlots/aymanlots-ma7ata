/**
 * محطة الاتحادية | تطبيق إدارة محطات الإرساليات والكوليات والتحويلات المالية والصناديق النقدية
 * بين المملكة المغربية والجمهورية الإسلامية الموريتانية (عبر معبر الكركرات الدولي)
 * React + TypeScript + Vite + Tailwind CSS + PWA Offline-First
 */

import React, { useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { BottomNav, NavTab } from './components/BottomNav';
import { OwnerDashboard } from './components/OwnerDashboard';
import { WorkerStationView } from './components/WorkerStationView';
import { ParcelsView } from './components/ParcelsView';
import { LedgerView } from './components/LedgerView';
import { SettingsView } from './components/SettingsView';
import { NewVoucherModal } from './components/NewVoucherModal';
import { NewParcelModal } from './components/NewParcelModal';
import { ParcelStickerModal } from './components/ParcelStickerModal';
import { QuickDeliverModal } from './components/QuickDeliverModal';
import { PaywallModal } from './components/PaywallModal';
import { AuthModal } from './components/AuthModal';
import { OnboardingModal } from './components/OnboardingModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { DataPrivacyModal } from './components/DataPrivacyModal';
import { PlatformOwnerDashboard } from './components/PlatformOwnerDashboard';
import { AdminCollaborationRoomModal } from './components/AdminCollaborationRoomModal';
import { CustomerAccountsModal } from './components/CustomerAccountsModal';
import { PublicTrackingModal } from './components/PublicTrackingModal';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';
import { GuidedSetupTourModal } from './components/GuidedSetupTourModal';
import { StationScopeBar } from './components/StationScopeBar';
import { Toast } from './components/Toast';
import { Parcel, TransactionType } from './types/database';
import { AlertTriangle, Clock } from 'lucide-react';

const MainApp: React.FC = () => {
  const { 
    currentUser, 
    userRole, 
    currentWorkspace, 
    stations,
    daysUntilExpiry, 
    subscriptionRemainingLabel,
    isSubscriptionExpired,
    showToast,
    themeMode,
  } = useApp();

  const dir = 'rtl';

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [openSettingsTeam, setOpenSettingsTeam] = useState(false);
  const [showNewVoucher, setShowNewVoucher] = useState(false);
  const [voucherInitialType, setVoucherInitialType] = useState<TransactionType>('cash_in');
  const [showNewParcel, setShowNewParcel] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showPlatformOwnerDashboard, setShowPlatformOwnerDashboard] = useState(false);
  const [showCollabRoom, setShowCollabRoom] = useState(false);
  const [showCustomerAccounts, setShowCustomerAccounts] = useState(false);
  const [showPublicTracking, setShowPublicTracking] = useState(false);
  const [initialTrackingCode, setInitialTrackingCode] = useState<string>('');
  const [stickerParcel, setStickerParcel] = useState<Parcel | null>(null);
  const [stickerBatchParcels, setStickerBatchParcels] = useState<Parcel[] | undefined>(undefined);
  const [showGuidedTour, setShowGuidedTour] = useState(false);
  const [showQuickDeliver, setShowQuickDeliver] = useState(false);

  // Auto-open public tracking modal if URL has ?track=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackParam = params.get('track');
    if (trackParam) {
      setInitialTrackingCode(trackParam);
      setShowPublicTracking(true);
    }
  }, []);

  // Universal Semantic Button & Active-State Classifier
  // 1) Applies data-btn-role="add" | "remove" | "info" to every <button>
  // 2) Applies data-btn-active="true" | "false" to all multi-choice / tab / filter / toggle groups
  useEffect(() => {
    const isChoiceButtonActiveByClass = (btn: HTMLButtonElement): boolean => {
      const cls = btn.className || '';
      return (
        btn.classList.contains('btn-gold') ||
        cls.includes('from-[#F5B05B]') ||
        cls.includes('bg-[#F5C84C]') ||
        cls.includes('bg-amber-400') ||
        cls.includes('bg-amber-500') ||
        cls.includes('bg-emerald-500') ||
        cls.includes('bg-purple-500') ||
        cls.includes('bg-rose-500') ||
        cls.includes('border-amber-500') ||
        cls.includes('border-emerald-500') ||
        cls.includes('border-rose-500')
      );
    };

    const classifyButtonRole = (btn: HTMLButtonElement): 'add' | 'remove' | 'info' => {
      if (btn.dataset.btnRoleFixed === 'true' && btn.dataset.btnRole) {
        return btn.dataset.btnRole as 'add' | 'remove' | 'info';
      }

      const rawText = (btn.textContent || '').replace(/\s+/g, ' ').trim();
      const metaText = (
        (btn.getAttribute('title') || '') +
        ' ' +
        (btn.getAttribute('aria-label') || '')
      )
        .replace(/\s+/g, ' ')
        .trim();
      const fullText = `${rawText} ${metaText}`.trim();

      // 1. Explicit special cases
      if (/عملية فلاكيس/.test(rawText)) return 'add';
      if (/حوالة خارجة/.test(fullText)) return 'remove';
      if (/حوالة داخلة/.test(fullText)) return 'add';
      if (/الشراكة|شراكة/.test(fullText) && !/سلعة/.test(rawText)) return 'add';
      if (/صرف عملة|صرف العملة/.test(fullText) && !/تأكيد|تاكيد|حفظ/.test(rawText)) {
        return 'info';
      }
      if (
        /^📋|سجل عمليات|سجل كوليات|سجل رحلات|سجل التتبع|سجل إقفالات|تتبع شحنة|سجل الحوالات|كل الحوالات|البحث|فلاتر|فلتر|تفاصيل|تعديل|عرض|سجل العمليات|إدارة|الصناديق|الرئيسية|الطرود|الكوليات|الإعدادات|العين|القائمة|وضع الليل|وضع النهار|^🌙|^☀️/.test(
          rawText
        ) &&
        !/تأكيد|تاكيد|حفظ|\+|➕/.test(rawText)
      ) {
        return 'info';
      }

      // 2. Subtract / Exit / Delete / Cancel -> Red #C1272D
      if (
        btn.classList.contains('btn-delete') ||
        /سحب|حذف|إلغاء|الغاء|حوالة خارجة|رفض|خروج|إغلاق|اغلاق|تراجع|توقيف|تعليق|إرجاع|ارجاع|📦\s*سلع|ثمن السلع|رصيد سالب/.test(
          fullText
        ) ||
        (/^مسح/.test(rawText) && !/باركود|كود|متتالي|فردي/.test(fullText))
      ) {
        return 'remove';
      }

      if (
        rawText === '' &&
        btn.querySelector(
          '.lucide-x, .lucide-trash-2, .lucide-trash, .lucide-log-out, .lucide-minus'
        )
      ) {
        return 'remove';
      }

      // 3. Add / Enter / Confirm -> Green #006233
      if (
        btn.classList.contains('btn-add') ||
        /\+|➕|إضافة|اضافة|أضف|جديد|إيداع|ايداع|زيادة|قبض|حوالة|الشراكة|شراكة|تأكيد|تاكيد|حفظ|تسليم|تم التسليم|تم الاستلام|استلام|وصل|للستوك|قبول|شحن|إنشاء|انشاء|إرسال|ارسال|تفعيل|تسجيل الدخول|دخول مباشر|متابعة|إتمام|موافق/.test(
          rawText
        )
      ) {
        // Exception: choice toggle buttons like "مستلم واحد / عدة مستلمين" or "المرسل / المستلم" are info toggles, not confirm actions
        if (!/مستلم واحد|عدة مستلمين|عند الاستلام|خالص/.test(rawText)) {
          return 'add';
        }
      }

      if (rawText === '' && btn.querySelector('.lucide-plus, .lucide-check')) {
        return 'add';
      }

      // 4. Everything else (Info / Search / Browse / Navigation / Filters / Toggles) -> Blue #1565C0 in Day, Black #111111 + Gold #D4AF37 in Night
      return 'info';
    };

    const applyButtonRolesAndActiveState = () => {
      const buttons = document.querySelectorAll<HTMLButtonElement>('button');
      const visitedParents = new Set<HTMLElement>();

      buttons.forEach((btn) => {
        const role = classifyButtonRole(btn);
        if (btn.getAttribute('data-btn-role') !== role) {
          btn.setAttribute('data-btn-role', role);
        }

        const rawText = (btn.textContent || '').replace(/\s+/g, ' ').trim();
        const isLargePrimaryAction =
          btn.getAttribute('type') === 'submit' ||
          btn.classList.contains('btn-hero-action') ||
          /\+\s*إيداع|➕\s*إيداع|\+\s*زيادة|−\s*سحب|➖\s*سحب|-\s*سحب|تسجيل كولي جديد|كولي جديد|عملية فلاكيس|إضافة محطة|تسجيل الدخول|إنشاء حساب|تأكيد وإرسال|حفظ ونشر|تأكيد العملية|اعتماد وحفظ|حوالة داخلة|حوالة خارجة|سجل العمليات|سجل عمليات|سجل الحوالات/.test(
            rawText
          );

        if (isLargePrimaryAction) {
          if (btn.getAttribute('data-btn-size') !== 'large') {
            btn.setAttribute('data-btn-size', 'large');
          }
        } else if (btn.hasAttribute('data-btn-size')) {
          btn.removeAttribute('data-btn-size');
        }

        const parent = btn.parentElement;
        if (parent && !visitedParents.has(parent)) {
          visitedParents.add(parent);
          const directButtons = Array.from(parent.children).filter(
            (el): el is HTMLButtonElement =>
              el instanceof HTMLButtonElement && el.dataset.btnActiveFixed !== 'true'
          );

          if (directButtons.length >= 2) {
            const hasFormSubmitOrCancel = directButtons.some((b) => {
              const txt = (b.textContent || '').replace(/\s+/g, ' ').trim();
              return (
                b.getAttribute('type') === 'submit' ||
                /إلغاء|الغاء|إغلاق|اغلاق|تراجع|رجوع|حذف|خروج|تصفير|إعادة ضبط|طباعة|واتساب|PDF/.test(
                  txt
                )
              );
            });

            if (!hasFormSubmitOrCancel) {
              const activeFlags = directButtons.map((b) => isChoiceButtonActiveByClass(b));
              const activeCount = activeFlags.filter(Boolean).length;

              if (activeCount >= 1 && activeCount < directButtons.length) {
                directButtons.forEach((b, idx) => {
                  const targetVal = activeFlags[idx] ? 'true' : 'false';
                  if (b.getAttribute('data-btn-active') !== targetVal) {
                    b.setAttribute('data-btn-active', targetVal);
                  }
                });
                return;
              }
            }

            // Not a toggle/choice group with active/inactive split -> clear auto data-btn-active
            directButtons.forEach((b) => {
              if (b.hasAttribute('data-btn-active')) {
                b.removeAttribute('data-btn-active');
              }
            });
          }
        }
      });
    };

    applyButtonRolesAndActiveState();

    const observer = new MutationObserver(() => {
      applyButtonRolesAndActiveState();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, [themeMode]);

  // Launch Guided Tour strictly ONCE for new manager accounts - never repeats automatically
  useEffect(() => {
    if (!currentUser || !currentWorkspace) return;
    const userId = currentUser.id;
    const wsId = currentWorkspace.id;

    // Check if user or workspace has already seen, dismissed, or completed the tour
    const alreadySeenUser = localStorage.getItem(`alittihadia_guided_tour_seen_${userId}`) === 'true';
    const alreadyDismissed = localStorage.getItem(`alittihadia_guided_tour_dismissed_${userId}`) === 'true';
    const alreadyCompleted = localStorage.getItem(`alittihadia_guided_tour_completed_${wsId}`) === 'true';

    if (alreadySeenUser || alreadyDismissed || alreadyCompleted) {
      return;
    }

    // Workers never see the setup wizard
    if (userRole === 'worker') {
      localStorage.setItem(`alittihadia_guided_tour_seen_${userId}`, 'true');
      return;
    }

    // Trigger only if 0 stations exist in fresh workspace
    if (stations.length === 0) {
      setShowGuidedTour(true);
      // Immediately flag as seen so subsequent renders or refreshes never force it
      localStorage.setItem(`alittihadia_guided_tour_seen_${userId}`, 'true');
    }
  }, [currentUser?.id, currentWorkspace?.id, userRole, stations.length]);

  // Fixed Background Wrapper: framed strictly to phone width (max-w-[430px]) centered on screen
  const renderDesertFrameBackground = () => {
    return (
      <div className="desert-bg-frame fixed inset-0 flex justify-center pointer-events-none z-0 overflow-hidden">
        <div className="desert-bg-inner w-full max-w-[430px] h-full relative overflow-hidden">
          <img
            src="/assets/aistudio/WhatsApp_Image_2026-10-22_at_04.15.27_e3559304.jpeg"
            alt=""
            className="w-full h-full object-cover object-center block"
          />
          <div className="desert-bg-overlay absolute inset-0" />
        </div>
      </div>
    );
  };

  // If user is not logged in, prompt Auth modal over the visible Desert Background
  if (!currentUser) {
    return (
      <div
        className="app-viewport-shell min-h-screen w-full flex justify-center relative"
        dir={dir}
      >
        {renderDesertFrameBackground()}
        <div
          className={`app-viewport-shell w-full max-w-[430px] min-h-screen flex flex-col border-x relative z-10 overflow-x-hidden ${
            themeMode === 'dark'
              ? 'text-[#FFF8EB] border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.9)]'
              : 'text-[#111111] border-slate-700/60 shadow-[0_0_60px_rgba(0,0,0,0.7)]'
          }`}
        >
          <AuthModal
            isOpen={true}
            onOpenPublicTracking={() => setShowPublicTracking(true)}
          />
          <PublicTrackingModal
            isOpen={showPublicTracking}
            onClose={() => setShowPublicTracking(false)}
            initialTrackingCode={initialTrackingCode}
          />
          <Toast />
        </div>
      </div>
    );
  }

  // If user has no workspace, prompt Onboarding modal over the visible Desert Background
  if (!currentWorkspace) {
    return (
      <div
        className="app-viewport-shell min-h-screen w-full flex justify-center relative"
        dir={dir}
      >
        {renderDesertFrameBackground()}
        <div
          className={`app-viewport-shell w-full max-w-[430px] min-h-screen flex flex-col border-x relative z-10 overflow-x-hidden ${
            themeMode === 'dark'
              ? 'text-[#FFF8EB] border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.9)]'
              : 'text-[#111111] border-slate-700/60 shadow-[0_0_60px_rgba(0,0,0,0.7)]'
          }`}
        >
          <OnboardingModal isOpen={true} />
          <Toast />
        </div>
      </div>
    );
  }

  return (
    <div
      className="app-viewport-shell min-h-screen w-full flex justify-center relative"
      dir={dir}
    >
      {renderDesertFrameBackground()}

      <div
        className={`app-viewport-shell w-full max-w-[430px] min-h-screen flex flex-col border-x relative z-10 overflow-x-hidden ${
          themeMode === 'dark'
            ? 'text-[#FFF8EB] border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.9)]'
            : 'text-[#111111] border-slate-700/60 shadow-[0_0_60px_rgba(0,0,0,0.7)]'
        }`}
      >
        {/* Offline Status Top Banner */}
        <OfflineIndicator />

        {/* Top Header */}
        <Header
          onOpenSettings={() => setCurrentTab('settings')}
          onOpenPaywall={() => setShowPaywall(true)}
          onOpenPublicTracking={() => setShowPublicTracking(true)}
          onOpenCollabRoom={() => setShowCollabRoom(true)}
          onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
          onOpenPlatformOwner={
            userRole === 'platform_owner' ? () => setShowPlatformOwnerDashboard(true) : undefined
          }
        />

        {/* 3-Day Pre-Expiry Reminder Banner */}
        {!isSubscriptionExpired && daysUntilExpiry <= 3 && (
          <div 
            onClick={() => setShowPaywall(true)}
            className="luxury-card border-b border-[#D4AF37]/40 px-2.5 py-1.5 text-xs font-semibold text-[#E6C37A] flex items-center justify-between gap-2 cursor-pointer transition text-right"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>
                🔔 تذكير قبل الانتهاء: متبقي <strong className="font-mono text-[#F5C84C]">{subscriptionRemainingLabel}</strong> على انتهاء الاشتراك.
              </span>
            </div>
            <span className="text-[10px] font-black text-[#111111] bg-[#F5C84C] px-2 py-0.5 rounded-lg shrink-0">
              {userRole !== 'worker' ? 'تجديد الاشتراك' : 'مرتبط بالمدير'}
            </span>
          </div>
        )}

        {/* Expired or Suspended Paywall Warning Banner (Full Write Lock for Admin & Worker) */}
        {isSubscriptionExpired && (
          <div 
            onClick={() => setShowPaywall(true)}
            className="bg-rose-950/90 border-b border-rose-500/50 px-2.5 py-2 text-xs font-bold text-rose-200 flex items-center justify-between gap-2 cursor-pointer hover:bg-rose-950 transition text-right"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                {currentWorkspace?.subscription_status === 'suspended'
                  ? '⛔ تم توقيف الحساب مؤقتاً من طرف إدارة المنصة — لا يمكن إضافة أو إرسال أو استقبال أي كولي حتى إعادة التفعيل.'
                  : 'انتهت مدة الاشتراك — تم إيقاف الإضافة والإرسال والاستقبال للأدمين والعامل حتى التجديد.'}
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-rose-500/30 border border-rose-400/40 text-white font-black shrink-0">
              {userRole !== 'worker' ? 'تجديد الآن' : 'مرتبط بالمدير'}
            </span>
          </div>
        )}

        {/* Main View Area */}
        <main className="flex-1 w-full mx-auto px-1.5 py-2">
          {/* Universal Station Switcher & Active Station Context Bar */}
          {currentTab !== 'settings' && <StationScopeBar />}

          {currentTab === 'dashboard' && (
            userRole === 'owner' || userRole === 'platform_owner' || userRole === 'admin' ? (
              <OwnerDashboard
                onOpenNewVoucher={(type) => {
                  if (isSubscriptionExpired) {
                    showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن إضافة أو إرسال أو استقبال أي عملية حتى التجديد.', 'error');
                    setShowPaywall(true);
                    return;
                  }
                  setVoucherInitialType(type || 'cash_in');
                  setShowNewVoucher(true);
                }}
                onOpenNewParcel={() => {
                  if (isSubscriptionExpired) {
                    showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن تسجيل أو إرسال أي كولي حتى التجديد.', 'error');
                    setShowPaywall(true);
                    return;
                  }
                  setShowNewParcel(true);
                }}
                onOpenLedger={() => setCurrentTab('cash')}
                onOpenParcels={() => setCurrentTab('parcels')}
                onOpenSettings={() => setCurrentTab('settings')}
                onOpenTeamSettings={() => {
                  setOpenSettingsTeam(true);
                  setCurrentTab('settings');
                }}
                onOpenCollabRoom={() => setShowCollabRoom(true)}
                onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
                onOpenPublicTracking={() => setShowPublicTracking(true)}
                onOpenGuidedTour={() => setShowGuidedTour(true)}
                onOpenPlatformOwner={
                  userRole === 'platform_owner' ? () => setShowPlatformOwnerDashboard(true) : undefined
                }
              />
            ) : (
              <WorkerStationView
                onOpenNewVoucher={(type) => {
                  if (isSubscriptionExpired) {
                    showToast('انتهت صلاحية اشتراك المدير (30 يوماً) — لا يمكن إضافة أو إرسال أو استقبال أي عملية.', 'error');
                    return;
                  }
                  setVoucherInitialType(type || 'cash_in');
                  setShowNewVoucher(true);
                }}
                onOpenNewParcel={() => {
                  if (isSubscriptionExpired) {
                    showToast('انتهت صلاحية اشتراك المدير (30 يوماً) — لا يمكن تسجيل أو إرسال أي كولي.', 'error');
                    return;
                  }
                  setShowNewParcel(true);
                }}
                onGoToParcels={() => setCurrentTab('parcels')}
                onGoToCash={() => setCurrentTab('cash')}
              />
            )
          )}

          {currentTab === 'parcels' && (
            <ParcelsView 
              onOpenNewParcel={() => {
                if (isSubscriptionExpired) {
                  showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن تسجيل أو إرسال أي كولي حتى التجديد.', 'error');
                  if (userRole !== 'worker') setShowPaywall(true);
                  return;
                }
                setShowNewParcel(true);
              }}
              onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
              onOpenCollabRoom={() => setShowCollabRoom(true)}
            />
          )}

          {currentTab === 'cash' && (
            <LedgerView 
              onOpenNewVoucher={(type) => {
                if (isSubscriptionExpired) {
                  showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن إضافة أي سند مالي حتى التجديد.', 'error');
                  if (userRole !== 'worker') setShowPaywall(true);
                  return;
                }
                setVoucherInitialType(type || 'cash_in');
                setShowNewVoucher(true);
              }}
              onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              onOpenPaywall={() => setShowPaywall(true)}
              onOpenPrivacyModal={() => setShowPrivacyModal(true)}
              onOpenPlatformOwner={
                userRole === 'platform_owner' ? () => setShowPlatformOwnerDashboard(true) : undefined
              }
              onOpenCollabRoom={() => setShowCollabRoom(true)}
              onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
              onOpenGuidedTour={() => setShowGuidedTour(true)}
              initialOpenTeam={openSettingsTeam}
              onTeamOpened={() => setOpenSettingsTeam(false)}
            />
          )}
        </main>

        {/* Floating Bottom Navigation */}
        <BottomNav
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onOpenNewVoucher={() => {
            if (isSubscriptionExpired) {
              showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن إضافة أي سند مالي حتى التجديد.', 'error');
              if (userRole !== 'worker') setShowPaywall(true);
              return;
            }
            setVoucherInitialType('cash_in');
            setShowNewVoucher(true);
          }}
          onOpenNewParcel={() => {
            if (isSubscriptionExpired) {
              showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن تسجيل أو إرسال أي كولي حتى التجديد.', 'error');
              if (userRole !== 'worker') setShowPaywall(true);
              return;
            }
            setShowNewParcel(true);
          }}
          onOpenQuickDeliver={() => {
            if (isSubscriptionExpired) {
              showToast('انتهت صلاحية الاشتراك (30 يوماً) — لا يمكن استقبال أو تسليم أي كولي حتى التجديد.', 'error');
              if (userRole !== 'worker') setShowPaywall(true);
              return;
            }
            setShowQuickDeliver(true);
          }}
        />

        {/* Quick Deliver Modal (Single or Multi-Parcel Batch Delivery) */}
        <QuickDeliverModal
          isOpen={showQuickDeliver}
          onClose={() => setShowQuickDeliver(false)}
          onOpenTicket={(p) => setStickerParcel(p)}
        />

        {/* New Cash Voucher Modal */}
        <NewVoucherModal
          isOpen={showNewVoucher}
          defaultType={voucherInitialType}
          onClose={() => setShowNewVoucher(false)}
        />

        {/* New Parcel Intake Modal */}
        <NewParcelModal
          isOpen={showNewParcel}
          onClose={() => setShowNewParcel(false)}
          onParcelCreated={(parcel, allCreated) => {
            setStickerParcel(parcel);
            setStickerBatchParcels(allCreated && allCreated.length > 1 ? allCreated : undefined);
          }}
        />

        {/* 10cm x 10cm Parcel Sticker Modal */}
        <ParcelStickerModal
          parcel={stickerParcel}
          initialSelectedParcels={stickerBatchParcels}
          isOpen={Boolean(stickerParcel)}
          onClose={() => {
            setStickerParcel(null);
            setStickerBatchParcels(undefined);
          }}
        />

        {/* Co-Admin Live Collaboration & Broadcast Room Modal */}
        {showCollabRoom && (
          <AdminCollaborationRoomModal
            isOpen={showCollabRoom}
            onClose={() => setShowCollabRoom(false)}
          />
        )}

        {/* VIP / Merchant Customer Accounts & Credit Ledger Modal */}
        <CustomerAccountsModal
          isOpen={showCustomerAccounts}
          onClose={() => setShowCustomerAccounts(false)}
        />

        {/* Public Parcel Tracking Modal */}
        <PublicTrackingModal
          isOpen={showPublicTracking}
          onClose={() => setShowPublicTracking(false)}
          initialTrackingCode={initialTrackingCode}
        />

        {/* Mandatory One-Time Password Change Modal */}
        <ForcePasswordChangeModal />

        {/* Who Can See My Data - Privacy & Collaboration Modal */}
        <DataPrivacyModal
          isOpen={showPrivacyModal}
          onClose={() => setShowPrivacyModal(false)}
        />

        {/* Subscription Paywall Modal */}
        <PaywallModal
          isOpen={showPaywall}
          onClose={() => setShowPaywall(false)}
        />

        {/* Platform Owner Dashboard Modal (Strictly Platform Owner Only) */}
        {userRole === 'platform_owner' && (
          <PlatformOwnerDashboard
            isOpen={showPlatformOwnerDashboard}
            onClose={() => setShowPlatformOwnerDashboard(false)}
          />
        )}


        {/* Onboarding Modal */}
        <OnboardingModal
          isOpen={showOnboarding}
          onClose={() => setShowOnboarding(false)}
        />

        {/* Automatic Step-by-Step Guided Setup & App Tour Modal */}
        <GuidedSetupTourModal
          isOpen={showGuidedTour}
          onClose={() => setShowGuidedTour(false)}
          onSelectTab={setCurrentTab}
        />

        {/* Toast Notification Container */}
        <Toast />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainApp />
    </AppProvider>
  );
}
