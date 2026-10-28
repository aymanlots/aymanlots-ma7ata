import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { 
  LayoutGrid, 
  Package, 
  Coins, 
  Settings, 
  Plus, 
  X,
  UserCheck
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
  const { parcels, currentWorkspace } = useApp();
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Check if parcels module is enabled (defaults to true)
  const isParcelsEnabled = currentWorkspace?.parcels_module_enabled !== false;

  // Active parcels in progress (registered + in_transit)
  const activeCount = parcels.filter(p => p.status === 'registered' || p.status === 'in_transit').length;

  return (
    <>
      {/* Quick Add Popover Menu */}
      {showAddMenu && (
        <div 
          className="fixed inset-0 z-50 bg-black/75 flex items-end justify-center p-4 pb-24 animate-fadeIn"
          onClick={() => setShowAddMenu(false)}
        >
          <div 
            className="w-full max-w-[380px] luxury-card rounded-[24px] p-5 shadow-2xl space-y-3 text-right"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between border-b border-white/15 pb-2.5">
              <span className="text-xs font-black text-[#F5C84C]">تسجيل عملية جديدة سريعة</span>
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
                className="w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-black/15 flex items-center justify-center font-bold">
                    <Package className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black">تسجيل كولي جديد (إرسالية)</h4>
                    <p className="text-[11px] font-bold opacity-80">شحن طرد وتوليد ملصق حراري</p>
                  </div>
                </div>
              </button>
            )}

            {/* Option 2: Cash Voucher (In/Out) */}
            <button
              type="button"
              onClick={() => {
                setShowAddMenu(false);
                onOpenNewVoucher();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-black/15 flex items-center justify-center font-bold">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-black">سند مالي (قبض / صرف)</h4>
                  <p className="text-[11px] font-bold opacity-80">تسجيل حركة نقدية بصندوق المحطة</p>
                </div>
              </div>
            </button>

            {/* Option 3: Quick Deliver (Single or Batch Delivery) */}
            {isParcelsEnabled && onOpenQuickDeliver && (
              <button
                type="button"
                onClick={() => {
                  setShowAddMenu(false);
                  onOpenQuickDeliver();
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-2xl transition active:scale-95 text-right cursor-pointer border border-[#F5C84C]/40 bg-[#F5C84C]/10 hover:bg-[#F5C84C]/20"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-bold">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-[#F5C84C]">تسليم سريع (كولي أو دفعة كوليات)</h4>
                    <p className="text-[11px] font-bold text-white/80">مسح وتأكيد استلام الزبون فورياً</p>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Pill Bottom Nav (Matches Reference Photo) */}
      <nav className="fixed bottom-2 left-0 right-0 z-40 w-full max-w-[430px] mx-auto px-3 pb-safe pointer-events-none" dir="rtl">
        <div
          className="pointer-events-auto w-full rounded-[24px] px-2 h-15 flex items-center justify-around relative shadow-[0_10px_30px_rgba(0,0,0,0.75)] border border-[#F5C84C]/30"
          style={{
            background: 'linear-gradient(180deg, rgba(132, 42, 23, 0.90) 0%, rgba(92, 26, 12, 0.94) 100%)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          {/* Tab 1: الرئيسية */}
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className={`nav-tab-btn flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
              currentTab === 'dashboard' ? 'text-[#F5C84C] font-black' : 'text-white/90 hover:text-[#F5C84C]'
            }`}
          >
            <LayoutGrid className={`w-5 h-5 mb-0.5 ${currentTab === 'dashboard' ? 'text-[#F5C84C]' : 'text-white/90'}`} />
            <span className="text-[10px] leading-tight font-extrabold">الرئيسية</span>
          </button>

          {/* Tab 2: الكوليات */}
          {isParcelsEnabled && (
            <button
              type="button"
              onClick={() => onSelectTab('parcels')}
              className={`nav-tab-btn relative flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
                currentTab === 'parcels' ? 'text-[#F5C84C] font-black' : 'text-white/90 hover:text-[#F5C84C]'
              }`}
            >
              <div className="relative">
                <Package className={`w-5 h-5 mb-0.5 ${currentTab === 'parcels' ? 'text-[#F5C84C]' : 'text-white/90'}`} />
                {activeCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 px-1 min-w-4 h-4 rounded-full bg-[#F5C84C] text-[#111111] text-[9px] font-black flex items-center justify-center shadow">
                    {activeCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] leading-tight font-extrabold">الكوليات</span>
            </button>
          )}

          {/* Center Prominent Rounded-Square Gold Button: + جديد */}
          <div className="relative -top-3.5 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setShowAddMenu(true)}
              className="w-13 h-13 rounded-2xl bg-[#F5C84C] text-[#111111] flex items-center justify-center shadow-[0_6px_20px_rgba(245,200,76,0.45)] transition-transform active:scale-90 cursor-pointer"
              title="تسجيل عملية جديدة"
            >
              <Plus className="w-6 h-6 stroke-[3]" />
            </button>
            <span className="block text-center text-[10px] font-black text-[#F5C84C] mt-0.5">
              جديد
            </span>
          </div>

          {/* Tab 3: الصناديق */}
          <button
            type="button"
            onClick={() => onSelectTab('cash')}
            className={`nav-tab-btn flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
              currentTab === 'cash' ? 'text-[#F5C84C] font-black' : 'text-white/90 hover:text-[#F5C84C]'
            }`}
          >
            <Coins className={`w-5 h-5 mb-0.5 ${currentTab === 'cash' ? 'text-[#F5C84C]' : 'text-white/90'}`} />
            <span className="text-[10px] leading-tight font-extrabold">الصناديق</span>
          </button>

          {/* Tab 4: الإعدادات */}
          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            className={`nav-tab-btn flex flex-col items-center justify-center w-15 h-full transition-all active:scale-95 cursor-pointer bg-transparent border-0 ${
              currentTab === 'settings' ? 'text-[#F5C84C] font-black' : 'text-white/90 hover:text-[#F5C84C]'
            }`}
          >
            <Settings className={`w-5 h-5 mb-0.5 ${currentTab === 'settings' ? 'text-[#F5C84C]' : 'text-white/90'}`} />
            <span className="text-[10px] leading-tight font-extrabold">الإعدادات</span>
          </button>
        </div>
      </nav>
    </>
  );
};
