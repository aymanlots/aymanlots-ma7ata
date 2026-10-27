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
import { PaywallModal } from './components/PaywallModal';
import { SQLModal } from './components/SQLModal';
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
import { Parcel } from './types/database';
import { AlertTriangle, Clock } from 'lucide-react';

const MainApp: React.FC = () => {
  const { 
    currentUser, 
    userRole, 
    currentWorkspace, 
    stations,
    daysUntilExpiry, 
    isSubscriptionExpired 
  } = useApp();

  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [openSettingsTeam, setOpenSettingsTeam] = useState(false);
  const [showNewVoucher, setShowNewVoucher] = useState(false);
  const [showNewParcel, setShowNewParcel] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSQLModal, setShowSQLModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showPlatformOwnerDashboard, setShowPlatformOwnerDashboard] = useState(false);
  const [showCollabRoom, setShowCollabRoom] = useState(false);
  const [showCustomerAccounts, setShowCustomerAccounts] = useState(false);
  const [showPublicTracking, setShowPublicTracking] = useState(false);
  const [initialTrackingCode, setInitialTrackingCode] = useState<string>('');
  const [stickerParcel, setStickerParcel] = useState<Parcel | null>(null);
  const [showGuidedTour, setShowGuidedTour] = useState(false);

  // Auto-open public tracking modal if URL has ?track=CODE
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const trackParam = params.get('track');
    if (trackParam) {
      setInitialTrackingCode(trackParam);
      setShowPublicTracking(true);
    }
  }, []);

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

  // Fixed Mobile Frame Background Wrapper (Guerguerat Border Crossing with Moroccan & Mauritanian Flags & Delivery Van)
  const renderDesertFrameBackground = () => (
    <div className="fixed inset-y-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] pointer-events-none z-0 overflow-hidden">
      <img
        src="/assets/aistudio/WhatsApp_Image_2026-10-22_at_04.15.27_e3559304.jpeg"
        alt=""
        className="w-full h-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/25 to-black/45" />
    </div>
  );

  // If user is not logged in, prompt Auth modal (plus Public Tracking modal if open)
  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-[#080c14] flex justify-center relative" dir="rtl">
        {renderDesertFrameBackground()}
        <div className="w-full max-w-[430px] min-h-screen relative z-10">
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

  // If user has no workspace, prompt Onboarding modal
  if (!currentWorkspace) {
    return (
      <div className="min-h-screen w-full bg-[#080c14] flex justify-center relative" dir="rtl">
        {renderDesertFrameBackground()}
        <div className="w-full max-w-[430px] min-h-screen relative z-10">
          <OnboardingModal isOpen={true} />
          <Toast />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-[#080c14] flex justify-center selection:bg-[#D4AF37]/30 selection:text-[#FFF8EB] relative" dir="rtl">
      {renderDesertFrameBackground()}

      <div className="w-full max-w-[430px] min-h-screen text-[#FFF8EB] flex flex-col border-x border-white/15 shadow-[0_0_60px_rgba(0,0,0,0.9)] relative z-10 overflow-x-hidden">
        {/* Offline Status Top Banner */}
        <OfflineIndicator />

        {/* Top Header */}
        <Header
          onOpenSettings={() => setCurrentTab('settings')}
          onOpenPaywall={() => setShowPaywall(true)}
          onOpenPublicTracking={() => setShowPublicTracking(true)}
          onOpenCollabRoom={() => setShowCollabRoom(true)}
          onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
        />

        {/* 3-Day Expiry Warning Banner */}
        {!isSubscriptionExpired && daysUntilExpiry <= 3 && (
          <div 
            onClick={() => setShowPaywall(true)}
            className="luxury-card border-b border-[#D4AF37]/40 px-3.5 py-2 text-xs font-semibold text-[#E6C37A] flex items-center justify-between cursor-pointer transition text-right"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>
                تنبيه: يتبقى <strong>{daysUntilExpiry} أيام</strong> على انتهاء اشتراك مساحة العمل. انقر للتجديد.
              </span>
            </div>
            <span className="text-[10px] underline font-bold text-[#F5C84C]">تجديد الاشتراك</span>
          </div>
        )}

        {/* Expired Paywall Warning Banner */}
        {isSubscriptionExpired && (
          <div 
            onClick={() => setShowPaywall(true)}
            className="bg-rose-950/80 border-b border-rose-500/40 px-3.5 py-2 text-xs font-bold text-rose-300 flex items-center justify-between cursor-pointer hover:bg-rose-950 transition text-right"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                انتهت صلاحية الاشتراك. يرجى تجديد الاشتراك لمتابعة تسجيل الكوليات والسندات النقدية.
              </span>
            </div>
            <span className="text-[10px] underline font-bold">تجديد الآن</span>
          </div>
        )}

        {/* Main View Area */}
        <main className="flex-1 w-full mx-auto px-3 py-3">
          {/* Universal Station Switcher & Active Station Context Bar */}
          {currentTab !== 'settings' && <StationScopeBar />}

          {currentTab === 'dashboard' && (
            userRole === 'owner' || userRole === 'platform_owner' || userRole === 'admin' ? (
              <OwnerDashboard
                onOpenNewVoucher={() => setShowNewVoucher(true)}
                onOpenNewParcel={() => setShowNewParcel(true)}
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
              />
            ) : (
              <WorkerStationView
                onOpenNewVoucher={() => setShowNewVoucher(true)}
                onOpenNewParcel={() => setShowNewParcel(true)}
                onGoToParcels={() => setCurrentTab('parcels')}
                onGoToCash={() => setCurrentTab('cash')}
              />
            )
          )}

          {currentTab === 'parcels' && (
            <ParcelsView 
              onOpenNewParcel={() => setShowNewParcel(true)}
              onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
              onOpenCollabRoom={() => setShowCollabRoom(true)}
            />
          )}

          {currentTab === 'cash' && (
            <LedgerView 
              onOpenNewVoucher={() => setShowNewVoucher(true)}
              onOpenCustomerAccounts={() => setShowCustomerAccounts(true)}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              onOpenSQLModal={() => setShowSQLModal(true)}
              onOpenPaywall={() => setShowPaywall(true)}
              onOpenPrivacyModal={() => setShowPrivacyModal(true)}
              onOpenPlatformOwner={() => setShowPlatformOwnerDashboard(true)}
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
          onOpenNewVoucher={() => setShowNewVoucher(true)}
          onOpenNewParcel={() => setShowNewParcel(true)}
        />

        {/* New Cash Voucher Modal */}
        <NewVoucherModal
          isOpen={showNewVoucher}
          onClose={() => setShowNewVoucher(false)}
        />

        {/* New Parcel Intake Modal */}
        <NewParcelModal
          isOpen={showNewParcel}
          onClose={() => setShowNewParcel(false)}
          onParcelCreated={(parcel) => setStickerParcel(parcel)}
        />

        {/* 10cm x 10cm Parcel Sticker Modal */}
        <ParcelStickerModal
          parcel={stickerParcel}
          isOpen={Boolean(stickerParcel)}
          onClose={() => setStickerParcel(null)}
        />

        {/* Co-Admin Live Collaboration & Broadcast Room Modal */}
        <AdminCollaborationRoomModal
          isOpen={showCollabRoom}
          onClose={() => setShowCollabRoom(false)}
        />

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

        {/* SQL Migration Modal */}
        <SQLModal
          isOpen={showSQLModal}
          onClose={() => setShowSQLModal(false)}
        />

        {/* Platform Owner Dashboard Modal */}
        <PlatformOwnerDashboard
          isOpen={showPlatformOwnerDashboard}
          onClose={() => setShowPlatformOwnerDashboard(false)}
        />

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
