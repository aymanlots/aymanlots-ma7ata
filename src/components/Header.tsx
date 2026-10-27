import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PWAInstallButton } from './PWAInstallButton';
import { 
  Store, 
  User, 
  Crown, 
  Menu,
  X,
  Settings,
  LogOut,
  Eye,
  EyeOff,
  Search,
  Users,
  Radio,
  Languages
} from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenPaywall: () => void;
  onOpenPublicTracking?: () => void;
  onOpenCollabRoom?: () => void;
  onOpenCustomerAccounts?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  onOpenSettings, 
  onOpenPaywall,
  onOpenPublicTracking,
  onOpenCollabRoom,
  onOpenCustomerAccounts
}) => {
  const { 
    currentUser, 
    currentWorkspace,
    userRole, 
    stations, 
    selectedStationId, 
    setSelectedStationId,
    daysUntilExpiry,
    isSubscriptionExpired,
    logout,
    hideAmounts,
    toggleHideAmounts,
    setLanguage
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const currentStation = stations.find(s => s.id === selectedStationId);

  return (
    <>
      <header className="sticky top-0 z-40 bg-[#080502]/90 backdrop-blur-xl border-b border-[#D4AF37]/25 px-3.5 py-2.5 pt-safe relative shadow-2xl">
        <div className="w-full mx-auto flex items-center justify-between gap-2 relative z-10" dir="rtl">
          
          {/* Right Section (RTL): Large Golden Title + Quick Pills */}
          <div className="flex flex-col items-start text-right min-w-0 flex-1">
            <h1 className="text-[20px] sm:text-[22px] font-black tracking-tight text-[#E6C37A] leading-tight truncate max-w-full drop-shadow-[0_2px_8px_rgba(212,175,55,0.25)]">
              {currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'محطة الاتحادية'}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenPublicTracking && onOpenPublicTracking()}
                className="nav-tab-btn flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1a0f00]/90 border border-[#D4AF37]/50 text-[10px] font-extrabold text-[#F5C84C] hover:border-[#F5C84C] transition active:scale-95 cursor-pointer"
                title="تتبع الشحنة للزبون"
              >
                <span className="w-2 h-2 rounded-full bg-[#F5C84C]" />
                <span>تتبع الشحنة</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="nav-tab-btn flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#006233]/35 border border-[#2ECC71]/45 text-[10px] font-extrabold text-[#FFF8EB] hover:border-[#2ECC71] transition active:scale-95 cursor-pointer"
                title="القائمة والمحطات"
              >
                <span className="w-2 h-2 rounded-full bg-[#2ECC71]" />
                <span className="max-w-[85px] truncate">{currentStation ? (currentStation.name || currentStation.city) : 'كافة المحطات'}</span>
                <Menu className="w-3 h-3 text-[#F5C84C] mr-0.5" />
              </button>

              <button
                type="button"
                onClick={toggleHideAmounts}
                className="nav-tab-btn flex items-center justify-center w-7 h-7 rounded-full bg-[#1a0f00]/90 border border-[#D4AF37]/45 text-[#F5C84C] hover:border-[#F5C84C] transition active:scale-95 cursor-pointer"
                title={hideAmounts ? 'إظهار المبالغ المالية' : 'إخفاء المبالغ المالية (وضع الخصوصية)'}
              >
                {hideAmounts ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Left Section (RTL): Circular 3D Official Logo */}
          <div 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="shrink-0 overflow-hidden rounded-full p-0 flex items-center justify-center cursor-pointer shadow-[0_0_20px_rgba(212,175,55,0.25)] active:scale-95 transition"
            style={{ background: 'transparent', borderRadius: '50%', padding: 0, overflow: 'hidden', width: '68px', height: '68px', border: '2px solid #D4AF37' }}
            title="القائمة الرئيسية"
          >
            <img 
              src={currentWorkspace?.custom_brand_logo_url || '/logo.png'} 
              alt="شعار محطة الاتحادية" 
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/logo.png';
              }}
              style={{ borderRadius: '50%', width: '68px', height: '68px', objectFit: 'cover', background: 'transparent', display: 'block' }}
            />
          </div>

        </div>
      </header>

      {/* Mobile Drawer / Full Dropdown Menu (Constrained to 390px) */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm animate-fadeIn flex flex-col justify-end items-center"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div 
            className="w-full max-w-[390px] bg-[#140b00] border-t-2 border-[#D4AF37]/60 rounded-t-3xl p-5 shadow-2xl max-h-[85vh] overflow-y-auto space-y-3.5 text-right"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header of Drawer */}
            <div className="flex items-center justify-between border-b border-[#D4AF37]/25 pb-3">
              <div className="flex items-center gap-2.5">
                <div 
                  className="w-10 h-10 rounded-full border border-[#D4AF37] overflow-hidden shrink-0 flex items-center justify-center p-0"
                  style={{ background: 'transparent', borderRadius: '50%', padding: 0, overflow: 'hidden' }}
                >
                  <img 
                    src="/logo.png" 
                    alt="محطة الاتحادية" 
                    style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover', background: 'transparent', display: 'block' }} 
                  />
                </div>
                <div>
                  <h3 className="text-sm font-black text-[#E6C37A]">محطة الاتحادية</h3>
                  <p className="text-[10px] text-[#D9B36C] font-semibold">السفر ونقل البضائع والكوليات</p>
                </div>
              </div>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="btn-cancel p-2 rounded-xl"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile Card */}
            <div className="bg-[#1a0f00]/80 p-3.5 rounded-2xl border border-[#D4AF37]/40 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black text-white truncate">{currentUser?.name || 'مستخدم مسجل'}</p>
                <p className="text-[11px] text-[#C8B08A] font-medium mt-0.5 truncate">
                  {currentWorkspace?.name || 'محطة الاتحادية'}
                </p>
                <p className="text-[10px] text-[#E6C37A] font-bold mt-1">
                  {userRole === 'owner' ? '👑 مالك المحطة (المشرف العام)' : '💼 عامل مكتب المحطة'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                {userRole === 'owner' ? <Crown className="w-5 h-5 text-[#D4AF37]" /> : <User className="w-5 h-5 text-[#E6C37A]" />}
              </div>
            </div>

            {/* Quick Feature Launchers (Collaboration Room, Customer Accounts, Public Tracking, Hide Amounts) */}
            <div className="grid grid-cols-2 gap-2">
              {onOpenCollabRoom && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenCollabRoom();
                  }}
                  className="btn-cancel p-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <Radio className="w-4 h-4 text-[#F5C84C]" />
                  <span>غرف الشراكة</span>
                </button>
              )}

              {onOpenCustomerAccounts && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenCustomerAccounts();
                  }}
                  className="btn-cancel p-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <Users className="w-4 h-4 text-[#F5C84C]" />
                  <span>حسابات الزبناء</span>
                </button>
              )}

              {onOpenPublicTracking && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPublicTracking();
                  }}
                  className="btn-cancel p-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                >
                  <Search className="w-4 h-4 text-[#F5C84C]" />
                  <span>تتبع شحنة للزبون</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleHideAmounts}
                className="btn-cancel p-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
              >
                {hideAmounts ? <Eye className="w-4 h-4 text-[#F5C84C]" /> : <EyeOff className="w-4 h-4 text-[#F5C84C]" />}
                <span>{hideAmounts ? 'إظهار المبالغ' : 'إخفاء المبالغ'}</span>
              </button>
            </div>

            {/* Station Selection */}
            <div>
              <span className="text-[11px] font-bold text-[#E6C37A] block mb-2">المحطة الحالية النشطة:</span>
              <div className="grid grid-cols-2 gap-2">
                {stations.map(station => (
                  <button
                    key={station.id}
                    onClick={() => {
                      setSelectedStationId(station.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`p-2.5 rounded-xl border text-right transition ${
                      station.id === selectedStationId
                        ? 'btn-gold'
                        : 'btn-cancel'
                    }`}
                  >
                    <div className="text-xs font-black truncate">{station.name || station.city}</div>
                    <div className="text-[10px] mt-0.5 opacity-85">
                      {station.country === 'MA' ? '🇲🇦 المغرب' : '🇲🇷 موريتانيا'}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Language Switcher */}
            <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/40 space-y-2">
              <span className="text-[10px] font-bold text-[#C8B08A] flex items-center gap-1">
                <Languages className="w-3.5 h-3.5 text-[#F5C84C]" />
                <span>لغة الواجهة:</span>
              </span>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => setLanguage('ar')}
                  className="py-1.5 rounded-lg text-[11px] font-black btn-gold"
                >
                  العربية (اللغة الرسمية المعتمدة)
                </button>
              </div>
            </div>

            {/* Subscription & System Actions */}
            <div className="pt-2 border-t border-[#D4AF37]/25 space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#1a0f00]/80 border border-[#D4AF37]/35 text-xs">
                <span className="text-[#C8B08A]">حالة الاشتراك:</span>
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenPaywall();
                  }}
                  className="px-2.5 py-1 rounded-lg font-bold text-[11px]"
                >
                  {isSubscriptionExpired ? 'منتهٍ (تجديد الآن)' : `${daysUntilExpiry} يوم متبقية`}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <PWAInstallButton />
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenSettings();
                  }}
                  className="flex-1 flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition"
                >
                  <Settings className="w-4 h-4" />
                  <span>الإعدادات</span>
                </button>
              </div>

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  logout();
                }}
                className="btn-delete w-full flex items-center justify-center gap-2 p-2.5 rounded-xl text-xs font-bold transition mt-2"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج من الحساب</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
