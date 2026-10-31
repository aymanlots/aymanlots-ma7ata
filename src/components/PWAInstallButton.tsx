import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

export const PWAInstallButton: React.FC = () => {
  const {
    isInstallable,
    isInstalled,
    promptNativeInstall,
    downloadShortcutLauncher,
  } = usePWAInstall();
  const { showToast } = useApp();

  const handleInstallClick = async () => {
    if (isInstallable) {
      const outcome = await promptNativeInstall();
      if (outcome === 'accepted') {
        showToast('تم تثبيت تطبيق Sahara📦 Express بنجاح ✓', 'success');
      }
      return;
    }

    if (isInstalled) {
      showToast('التطبيق مثبّت ومفعل على جهازك ✓', 'success');
      return;
    }

    downloadShortcutLauncher();
    showToast('تم تحميل التطبيق مباشرة على جهازك ✓', 'success');
  };

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      title="تحميل التطبيق"
      aria-label="تحميل التطبيق"
      className="px-2.5 py-1.5 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#F5C84C] to-[#B68A2E] text-[#111111] flex items-center gap-1.5 shadow-[0_0_15px_rgba(245,200,76,0.35)] hover:brightness-110 active:scale-95 transition shrink-0 cursor-pointer border border-[#FFF3C4]/50 text-[11px] font-black"
    >
      {isInstalled ? (
        <Check className="w-4 h-4 stroke-[2.8]" />
      ) : (
        <Download className="w-4 h-4 stroke-[2.8]" />
      )}
      <span>{isInstalled ? 'مثبّت' : 'تحميل التطبيق'}</span>
    </button>
  );
};
