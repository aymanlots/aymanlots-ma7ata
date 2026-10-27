import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  Receipt,
  History,
  ShieldCheck,
  Users,
  Truck,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AppTab } from '../types';
import { useI18n } from '../i18n';

interface SidebarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  isOpen: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  lowStockCount?: number;
  openSavCount?: number;
  storeName?: string;
  storeLogo?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isOpen,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
  lowStockCount = 0,
  openSavCount = 0,
  storeName,
  storeLogo,
}) => {
  const { t, isRTL } = useI18n();

  const navItems: { id: AppTab; label: string; icon: React.FC<{ className?: string }>; badge?: number; badgeAlert?: boolean }[] = [
    { id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard },
    { id: 'pos', label: t.nav.pos, icon: Receipt },
    { id: 'stock', label: t.nav.stock, icon: Boxes, badge: lowStockCount, badgeAlert: true },
    { id: 'bons', label: t.nav.bons, icon: History },
    { id: 'warranty', label: t.nav.warranty, icon: ShieldCheck, badge: openSavCount },
    { id: 'customers', label: t.nav.customers, icon: Users },
    { id: 'suppliers', label: t.nav.suppliers, icon: Truck },
    { id: 'settings', label: t.nav.settings, icon: Settings },
  ];

  const collapseIcon = isRTL
    ? isCollapsed
      ? <ChevronLeft className="w-4 h-4" />
      : <ChevronRight className="w-4 h-4" />
    : isCollapsed
      ? <ChevronRight className="w-4 h-4" />
      : <ChevronLeft className="w-4 h-4" />;

  const fallbackName = isRTL ? 'متجري' : 'Mon Magasin';
  const displayName = storeName?.trim() || fallbackName;
  const initial = displayName.charAt(0).toUpperCase() || 'M';

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed md:sticky top-0 start-0 z-40 h-screen bg-neutral-900 border-e border-neutral-800 transition-all duration-200 flex flex-col justify-between ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 rtl:translate-x-full md:rtl:translate-x-0'
        } ${isCollapsed ? 'w-20' : 'w-64'}`}
      >
        {/* Brand & collapse trigger */}
        <div>
          <div className="flex items-center justify-between px-4 py-4 border-b border-neutral-800/80">
            <div className={`flex items-center gap-3 overflow-hidden ${isCollapsed ? 'justify-center w-full' : ''}`}>
              {storeLogo ? (
                <img
                  src={storeLogo}
                  alt=""
                  className="w-9 h-9 rounded-xl object-cover border border-amber-500/40 shrink-0 shadow-md"
                />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center font-bold text-neutral-950 text-base shadow-md shrink-0 uppercase">
                  {initial}
                </div>
              )}
              {!isCollapsed && (
                <div className="truncate">
                  <div className="text-sm font-bold text-neutral-100 tracking-tight truncate">
                    {displayName}
                  </div>
                </div>
              )}
            </div>

            {!isCollapsed && (
              <button
                onClick={onToggleCollapse}
                className="hidden md:flex p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition"
                title={isCollapsed ? 'Agrandir' : 'Réduire'}
              >
                {collapseIcon}
              </button>
            )}
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isCollapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30 shadow-xs'
                      : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60'
                  }`}
                  title={item.label}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-amber-400' : 'text-neutral-400'
                    }`}
                  />
                  {!isCollapsed && <span className="truncate flex-1 text-start">{item.label}</span>}

                  {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                        item.badgeAlert
                          ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer Collapse Button (Collapsed Mode) */}
        {isCollapsed && (
          <div className="p-3 border-t border-neutral-800 hidden md:flex justify-center">
            <button
              onClick={onToggleCollapse}
              className="p-2 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition"
              title="Agrandir"
            >
              {collapseIcon}
            </button>
          </div>
        )}

        {/* Offline Badge status in sidebar */}
        {!isCollapsed && (
          <div className="p-4 border-t border-neutral-800/80">
            <div className="px-3 py-2 rounded-lg bg-neutral-950/60 border border-neutral-800 flex items-center justify-between text-[11px] text-neutral-400">
              <span className="font-mono">100% Hors-Ligne</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            </div>
          </div>
        )}
      </aside>
    </>
  );
};
