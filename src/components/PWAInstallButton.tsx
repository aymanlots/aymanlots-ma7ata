import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { forceCheckUpdateAndRefresh } from '../services/pwaAutoUpdate';

export const PWAInstallButton: React.FC = () => {
  const {
    isInstallable,
    isInstalled,
    promptNativeInstall,
    downloadShortcutLauncher,
  } = usePWAInstall();
  const { showToast } = useApp();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleActionClick = async () => {
    // 1. If running inside installed PWA, click acts as instant force-updater
    if (isInstalled) {
      setIsUpdating(true);
      showToast('جاري التحقق من وجود نسخة جديدة وتحديث الكاش تلقائياً...', 'info');
      await forceCheckUpdateAndRefresh();
      return;
    }

    // 2. If browser supports native install prompt
    if (isInstallable) {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') {
        showToast('تم تثبيت تطبيق Sahara📦 Express بنجاح ✓', 'success');
      }
      return;
    }

    // 3. Fallback: download shortcut launcher
    downloadShortcutLauncher();
    showToast('تم تحميل التطبيق مباشرة على جهازك ✓', 'success');
  };

  return (
    <button
      type="button"
      onClick={handleActionClick}
      title={isInstalled ? 'التحقق من التحديثات وتحديث التطبيق للنسخة الأخيرة' : 'تحميل التطبيق'}
      aria-label={isInstalled ? 'تحديث التطبيق' : 'تحميل التطبيق'}
      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#F5C84C] to-[#B68A2E] text-[#111111] flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,200,76,0.35)] hover:brightness-110 active:scale-95 transition shrink-0 cursor-pointer border border-[#FFF3C4]/50 text-[11px] font-black"
    >
      {isInstalled ? (
        <RefreshCw className={`w-3.5 h-3.5 stroke-[2.8] ${isUpdating ? 'animate-spin' : ''}`} />
      ) : (
        <Download className="w-4 h-4 stroke-[2.8]" />
      )}
      <span>{isInstalled ? (isUpdating ? 'جاري التحديث...' : 'تحديث التطبيق') : 'تحميل التطبيق'}</span>
    </button>
  );
};
