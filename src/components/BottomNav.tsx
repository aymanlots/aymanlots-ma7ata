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
  const dir = language === 'ar' || language === 'hass' ? 'rtl' : 'ltr';
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
              <span className="text-sm font-black text-[#F5C84C]">➕ عملية جديدة</span>
              <button
                type="button"
                onClick={() => setShowAddMenu(false)}
                className="btn-cancel p-1.5 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: New Parcel Intake */}
            {isParcelsEnabled && (
              <button
                type="button"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenNewParcel();
                }}
                className="btn-gold w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none">📦</span>
                  <h4 className="text-sm font-black">تسجيل كولي جديد</h4>
                </div>
                <Plus className="w-5 h-5" />
              </button>
            )}

            {/* Option 2: Cash Voucher (In/Out) */}
            <button
              type="button"
              onClick={() => {
                setShowAddMenu(false);
                onOpenNewVoucher();
              }}
              className="btn-gold w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl leading-none">💰</span>
                <h4 className="text-sm font-black">عملية فلاكيس (➕ إيداع / ➖ سحب)</h4>
              </div>
              <Coins className="w-5 h-5" />
            </button>

            {/* Option 3: Quick Deliver */}
            {isParcelsEnabled && onOpenQuickDeliver && (
              <button
                type="button"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenQuickDeliver();
                }}
                className="btn-cancel w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none">✅</span>
                  <h4 className="text-sm font-black">تسليم كولي للزبون</h4>
                </div>
                <UserCheck className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Nav (Supports Light Mode & Dark Mode) */}
      <nav
        className="fixed bottom-2 left-0 right-0 z-40 w-full max-w-[430px] mx-auto px-3 pb-safe pointer-events-none"
        dir={dir}
      >
        <div
          className={`pointer-events-auto w-full rounded-[24px] px-2 h-15 flex items-center justify-around relative ${
            themeMode === 'dark'
              ? 'shadow-[0_10px_30px_rgba(0,0,0,0.75)] border border-[#F5C84C]/30'
              : 'bg-white/85 backdrop-blur-md border-2 border-slate-400 shadow-[0_8px_28px_rgba(15,23,42,0.14)]'
          }`}
          style={
            themeMode === 'dark'
              ? {
                  background:
                    'linear-gradient(180deg, rgba(132, 42, 23, 0.90) 0%, rgba(92, 26, 12, 0.94) 100%)',
                  backdropFilter: 'blur(10px)',
                  WebkitBackdropFilter: 'blur(10px)',
                }
              : undefined
          }
        >
          {/* Tab 1: الرئيسية */}
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className={`nav-tab-btn flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
              currentTab === 'dashboard'
                ? themeMode === 'dark'
                  ? 'text-[#F5C84C] font-black'
                  : 'text-[#111111] font-black'
                : themeMode === 'dark'
                ? 'text-white/90 hover:text-[#F5C84C]'
                : 'text-slate-600 hover:text-[#111111]'
            }`}
          >
            <LayoutGrid
              className={`w-5 h-5 mb-0.5 ${
                currentTab === 'dashboard'
                  ? themeMode === 'dark'
                    ? 'text-[#F5C84C]'
                    : 'text-[#111111] stroke-[2.5]'
                  : themeMode === 'dark'
                  ? 'text-white/90'
                  : 'text-slate-600'
              }`}
            />
            <span className="text-[11px] leading-tight font-extrabold">
              {t('navDashboard', 'الرئيسية')}
            </span>
          </button>

          {/* Tab 2: الكوليات */}
          {isParcelsEnabled && (
            <button
              type="button"
              onClick={() => onSelectTab('parcels')}
              className={`nav-tab-btn relative flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
                currentTab === 'parcels'
                  ? themeMode === 'dark'
                    ? 'text-[#F5C84C] font-black'
                    : 'text-[#111111] font-black'
                  : themeMode === 'dark'
                  ? 'text-white/90 hover:text-[#F5C84C]'
                  : 'text-slate-600 hover:text-[#111111]'
              }`}
            >
              <div className="relative">
                <Package
                  className={`w-5 h-5 mb-0.5 ${
                    currentTab === 'parcels'
                      ? themeMode === 'dark'
                        ? 'text-[#F5C84C]'
                        : 'text-[#111111] stroke-[2.5]'
                      : themeMode === 'dark'
                      ? 'text-white/90'
                      : 'text-slate-600'
                  }`}
                />
                {activeCount > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2.5 px-1 min-w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center shadow ${
                      themeMode === 'dark'
                        ? 'bg-[#F5C84C] text-[#111111]'
                        : 'bg-white text-[#111111] border border-[#111111]'
                    }`}
                  >
                    {activeCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] leading-tight font-extrabold">
                {t('navParcels', 'الكوليات')}
              </span>
            </button>
          )}

          {/* Center Prominent Rounded-Square Button: + جديد */}
          <div className="relative -top-3.5 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowAddMenu(true)}
              className="btn-gold w-13 h-13 rounded-2xl flex items-center justify-center transition-transform active:scale-90 cursor-pointer"
              title={t('quickAddTitle', 'تسجيل عملية جديدة')}
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
            <span
              className={`block text-center text-[10px] font-black mt-0.5 ${
                themeMode === 'dark' ? 'text-[#F5C84C]' : 'text-[#111111]'
              }`}
            >
              {t('navNew', 'جديد')}
            </span>
          </div>

          {/* Tab 3: الصناديق */}
          <button
            type="button"
            onClick={() => onSelectTab('cash')}
            className={`nav-tab-btn flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
              currentTab === 'cash'
                ? themeMode === 'dark'
                  ? 'text-[#F5C84C] font-black'
                  : 'text-[#111111] font-black'
                : themeMode === 'dark'
                ? 'text-white/90 hover:text-[#F5C84C]'
                : 'text-slate-500 hover:text-[#111111]'
            }`}
          >
            <Coins
              className={`w-5 h-5 mb-0.5 ${
                currentTab === 'cash'
                  ? themeMode === 'dark'
                    ? 'text-[#F5C84C]'
                    : 'text-[#111111] stroke-[2.5]'
                  : themeMode === 'dark'
                  ? 'text-white/90'
                  : 'text-slate-500'
              }`}
            />
            <span className="text-[11px] leading-tight font-extrabold">
              {t('navCash', 'الصناديق')}
            </span>
          </button>

          {/* Tab 4: الإعدادات */}
          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            className={`nav-tab-btn flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
              currentTab === 'settings'
                ? themeMode === 'dark'
                  ? 'text-[#F5C84C] font-black'
                  : 'text-[#111111] font-black'
                : themeMode === 'dark'
                ? 'text-white/90 hover:text-[#F5C84C]'
                : 'text-slate-500 hover:text-[#111111]'
            }`}
          >
            <Settings
              className={`w-5 h-5 mb-0.5 ${
                currentTab === 'settings'
                  ? themeMode === 'dark'
                    ? 'text-[#F5C84C]'
                    : 'text-[#111111] stroke-[2.5]'
                  : themeMode === 'dark'
                  ? 'text-white/90'
                  : 'text-slate-500'
              }`}
            />
            <span className="text-[11px] leading-tight font-extrabold">
              {t('navSettings', 'الإعدادات')}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
