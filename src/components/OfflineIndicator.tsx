import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-full bg-amber-500/95 backdrop-blur-xs px-4 py-1.5 text-xs font-bold text-slate-950 shadow-lg border border-amber-400 animate-bounce">
      <WifiOff className="w-3.5 h-3.5 stroke-[2.5]" />
      <span>وضع بدون إنترنت — يتم حفظ البيانات محلياً وسيتم المزامنة تلقائياً</span>
    </div>
  );
};
