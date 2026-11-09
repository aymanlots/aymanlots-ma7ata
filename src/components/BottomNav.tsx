import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  LayoutGrid,
  Package,
  Coins,
  Settings,
  Plus,
  X,
  UserCheck,
} from 'lucide-react';

export type NavTab = 'dashboard' | 'parcels' | 'cash' | 'settings';

interface BottomNavProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenNewVoucher: () => void;
  onOpenNewParcel: () => void;
  onOpenQuickDeliver?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenNewVoucher,
  onOpenNewParcel,
  onOpenQuickDeliver,
}) => {
  const { parcels, currentWorkspace, t, language, themeMode } = useApp();
  const dir = language === 'ar' || language === 'hassaniya' ? 'rtl' : 'ltr';
  const [showAddMenu, setShowAddMenu] = useState(false);

  const isParcelsEnabled = currentWorkspace?.parcels_module_enabled !== false;
  const activeCount = parcels.filter(
    (p) => p.status === 'registered' || p.status === 'in_transit'
  ).length;

  return (
    <>
      {/* Quick Add Popover Menu — Ultra-Simple Icon-Driven */}
      {showAddMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center p-4 pb-24 animate-fadeIn"
          onClick={() => setShowAddMenu(false)}
        >
          <div
            className="w-full max-w-[380px] luxury-card rounded-[24px] p-4 shadow-2xl space-y-2.5 text-right"
            onClick={(e) => e.stopPropagation()}
            dir={dir}
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2">
              <span className="text-sm font-black text-[#F5C84C]">{t('quickAddTitle', 'عملية جديدة')}</span>
              <button
                type="button"
                data-btn-role="remove"
                data-btn-role-fixed="true"
                onClick={() => setShowAddMenu(false)}
                className="btn-delete p-1.5 rounded-xl"
                aria-label={t('btnClose', 'إغلاق')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: New Parcel Intake */}
            {isParcelsEnabled && (
              <button
                type="button"
                data-btn-role="add"
                data-btn-role-fixed="true"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenNewParcel();
                }}
                className="btn-add w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-black">{t('newParcel', 'تسجيل كولي جديد')}</h4>
                </div>
                <Plus className="w-5 h-5" />
              </button>
            )}

            {/* Option 2: Cash Voucher (In/Out) */}
            <button
              type="button"
              data-btn-role="add"
              data-btn-role-fixed="true"
              onClick={() => {
                setShowAddMenu(false);
                onOpenNewVoucher();
              }}
              className="btn-add w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <h4 className="text-sm font-black">{t('cashVoucherOption', 'عملية فلاكيس (إيداع / سحب)')}</h4>
              </div>
              <Coins className="w-5 h-5" />
            </button>

            {/* Option 3: Quick Deliver */}
            {isParcelsEnabled && onOpenQuickDeliver && (
              <button
                type="button"
                data-btn-role="add"
                data-btn-role-fixed="true"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenQuickDeliver();
                }}
                className="btn-add w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-black">{t('quickDeliverOption', 'تم التسليم (تسليم كولي للزبون)')}</h4>
                </div>
                <UserCheck className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Nav (Supports Light Mode & Dark Mode with 100% Filled Semantic Buttons) */}
      <nav
        className="fixed bottom-2 left-0 right-0 z-40 w-full max-w-[430px] mx-auto px-2.5 pb-safe pointer-events-none"
        dir={dir}
      >
        <div
          className={`pointer-events-auto w-full rounded-[24px] p-1.5 flex items-center justify-between gap-1.5 relative ${
            themeMode === 'dark'
              ? 'bg-[#080502]/90 backdrop-blur-xl shadow-[0_10px_30px_rgba(0,0,0,0.85)] border border-[#D4AF37]/40'
              : 'bg-white/80 backdrop-blur-md border-2 border-slate-400 shadow-[0_8px_28px_rgba(15,23,42,0.18)]'
          }`}
        >
          {/* Tab 1: الرئيسية */}
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={currentTab === 'dashboard' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => onSelectTab('dashboard')}
            className={`nav-tab-btn flex-1 h-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
              currentTab === 'dashboard' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <LayoutGrid className="w-4 h-4 mb-0.5 stroke-[2.5]" />
            <span className="text-[10px] leading-tight font-black">
              {t('navDashboard', 'الرئيسية')}
            </span>
          </button>

          {/* Tab 2: الطرود / الكوليات */}
          {isParcelsEnabled && (
            <button
              type="button"
              data-btn-role="info"
              data-btn-role-fixed="true"
              data-btn-active={currentTab === 'parcels' ? 'true' : 'false'}
              data-btn-active-fixed="true"
              onClick={() => onSelectTab('parcels')}
              className={`nav-tab-btn relative flex-1 h-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
                currentTab === 'parcels' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              <div className="relative">
                <Package className="w-4 h-4 mb-0.5 stroke-[2.5]" />
                {activeCount > 0 && (
                  <span className="badge-pill absolute -top-1.5 -right-3 px-1 min-w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center shadow bg-[#C1272D] text-white border border-white">
                    {activeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight font-black">
                {t('navParcels', 'الطرود')}
              </span>
            </button>
          )}

          {/* Center Prominent Filled Green Button: جديد */}
          <button
            type="button"
            data-btn-role="add"
            data-btn-role-fixed="true"
            data-btn-active-fixed="true"
            onClick={() => setShowAddMenu(true)}
            className="btn-add flex-1 h-12 rounded-2xl flex flex-col items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-lg"
            title={t('quickAddTitle', 'تسجيل عملية جديدة')}
          >
            <Plus className="w-4 h-4 mb-0.5 stroke-[3]" />
            <span className="text-[10px] leading-tight font-black">
              {t('navNew', 'جديد')}
            </span>
          </button>

          {/* Tab 3: الصناديق */}
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={currentTab === 'cash' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => onSelectTab('cash')}
            className={`nav-tab-btn flex-1 h-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
              currentTab === 'cash' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Coins className="w-4 h-4 mb-0.5 stroke-[2.5]" />
            <span className="text-[10px] leading-tight font-black">
              {t('navCash', 'الصناديق')}
            </span>
          </button>

          {/* Tab 4: الإعدادات */}
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={currentTab === 'settings' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => onSelectTab('settings')}
            className={`nav-tab-btn flex-1 h-12 rounded-2xl flex flex-col items-center justify-center transition-all active:scale-95 cursor-pointer ${
              currentTab === 'settings' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Settings className="w-4 h-4 mb-0.5 stroke-[2.5]" />
            <span className="text-[10px] leading-tight font-black">
              {t('navSettings', 'الإعدادات')}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
