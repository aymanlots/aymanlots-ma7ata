import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Check } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface PWAInstallButtonProps {
  variant?: 'card' | 'button' | 'icon';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = () => {
  const { isInstalled, install } = usePWAInstall();
  const { showToast } = useApp();

  const handleDirectDownload = async () => {
    const ok = await install();
    if (ok) {
      showToast('تم بدء تحميل وتثبيت التطبيق بنجاح ✓', 'success');
    }
  };

  return (
    <button
      type="button"
      onClick={handleDirectDownload}
      title="تحميل التطبيق"
      aria-label="تحميل التطبيق"
      className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#F5C84C] to-[#B68A2E] text-[#111111] flex items-center justify-center shadow-[0_0_15px_rgba(245,200,76,0.35)] hover:brightness-110 active:scale-90 transition shrink-0 cursor-pointer border border-[#FFF3C4]/50"
    >
      {isInstalled ? (
        <Check className="w-5 h-5 stroke-[2.8]" />
      ) : (
        <Download className="w-5 h-5 stroke-[2.8]" />
      )}
    </button>
  );
};

