import React from 'react';
import { useApp } from '../context/AppContext';
import { Store, Globe, ArrowLeftRight, Check, ChevronDown } from 'lucide-react';

interface StationScopeBarProps {
  compact?: boolean;
  onOpenNewStation?: () => void;
}

export const StationScopeBar: React.FC<StationScopeBarProps> = ({
  compact = false,
  onOpenNewStation
}) => {
  const {
    stations,
    selectedStationId,
    setSelectedStationId,
    stationBalances,
    userRole,
    hideAmounts
  } = useApp();

  // If there are no stations yet, do not render
  if (stations.length === 0) return null;

  // If worker is restricted to one station, show an informative locked badge
  if (userRole === 'worker' && stations.length <= 1) {
    const current = stations[0];
    const curr = current.currency || (current.country === 'MR' ? 'MRU' : 'MAD');
    const bal = Math.round(((stationBalances[current.id] || {})[curr] || 0) * 100) / 100;
    return (
      <div className="mb-2.5 p-2 rounded-2xl bg-black/60 border border-[#F5C84C]/40 flex items-center justify-between text-xs" dir="rtl">
        <div className="flex items-center gap-2">
          <span className="text-base">{current.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
          <div>
            <div className="font-black text-white">{current.name || current.city}</div>
            <div className="text-[10px] text-white/70">محطتك المعتمدة للعمل</div>
          </div>
        </div>
        <div className="text-left font-mono font-bold text-[#F5C84C] text-xs">
          {hideAmounts ? '••••' : `${bal.toLocaleString()} ${curr}`}
        </div>
      </div>
    );
  }

  const activeStation = stations.find((s) => s.id === selectedStationId);
  const isAllSelected = selectedStationId === null || selectedStationId === 'all';

  return (
    <div
      className="mb-2.5 rounded-2xl p-2.5 bg-[#120b02]/90 border border-[#D4AF37]/50 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md animate-fadeIn"
      dir="rtl"
    >
      {/* Top Status Line: Clearly informs the user where they are */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/60 flex items-center justify-center shrink-0 text-[#F5C84C]">
            {isAllSelected ? <Globe className="w-3.5 h-3.5" /> : <Store className="w-3.5 h-3.5" />}
          </div>
          <div className="min-w-0">
            <div className="text-[10px] text-[#C8B08A] font-bold">المعطيات والصناديق المعروضة:</div>
            <div className="text-xs font-black text-white truncate">
              {isAllSelected ? (
                <span className="text-[#F5C84C]">🌐 نظرة شاملة (كافة المحطات معاً)</span>
              ) : (
                <span className="text-white">
                  📍 {activeStation?.name || activeStation?.city}{' '}
                  <span className="text-[10px] text-white/70 font-mono">
                    ({activeStation?.country === 'MA' ? '🇲🇦 المغرب' : '🇲🇷 موريتانيا'})
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Current Active Station Box Balance */}
        {!isAllSelected && activeStation && (
          <div className="text-left shrink-0 font-mono">
            <span className="text-[9px] text-[#C8B08A] block">صندوق المحطة:</span>
            <span className="text-xs font-black text-[#F5C84C]">
              {hideAmounts
                ? '••••'
                : `${(
                    (stationBalances[activeStation.id] || {})[
                      activeStation.currency || (activeStation.country === 'MR' ? 'MRU' : 'MAD')
                    ] || 0
                  ).toLocaleString()} ${
                    activeStation.currency || (activeStation.country === 'MR' ? 'MRU' : 'MAD')
                  }`}
            </span>
          </div>
        )}
      </div>

      {/* Station Selector Buttons (Horizontal Scrollable Chips) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        {stations.map((st) => {
          const isSelected = selectedStationId === st.id;
          const curr = st.currency || (st.country === 'MR' ? 'MRU' : 'MAD');
          const bal = Math.round(((stationBalances[st.id] || {})[curr] || 0) * 100) / 100;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => setSelectedStationId(st.id)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-black shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                isSelected
                  ? 'bg-gradient-to-r from-[#F7D674] to-[#D4A238] text-[#111111] border-[#F5C84C] shadow-md ring-2 ring-[#F5C84C]/50'
                  : 'bg-black/60 text-white/85 border-white/20 hover:border-[#D4AF37]/60 hover:bg-black/80'
              }`}
            >
              <span>{st.country === 'MA' ? '🇲🇦' : '🇲🇷'}</span>
              <span className="truncate max-w-[110px]">{st.city || st.name}</span>
              <span
                className={`text-[9px] font-mono px-1 py-0.2 rounded-md ${
                  isSelected ? 'bg-black/25 text-[#111111]' : 'bg-[#D4AF37]/20 text-[#F5C84C]'
                }`}
                dir="ltr"
              >
                {hideAmounts ? '••' : `${bal.toLocaleString()}`}
              </span>
            </button>
          );
        })}

        {/* Dedicated "All Stations" Button */}
        <button
          type="button"
          onClick={() => setSelectedStationId(null)}
          className={`px-2.5 py-1.5 rounded-xl border text-xs font-black shrink-0 transition flex items-center gap-1.5 cursor-pointer active:scale-95 ${
            isAllSelected
              ? 'bg-gradient-to-r from-[#F7D674] to-[#D4A238] text-[#111111] border-[#F5C84C] shadow-md ring-2 ring-[#F5C84C]/50'
              : 'bg-black/60 text-white/85 border-white/20 hover:border-[#D4AF37]/60 hover:bg-black/80'
          }`}
          title="عرض جميع المحطات والصناديق معاً (نظرة شاملة)"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>كافة المحطات معاً</span>
        </button>
      </div>
    </div>
  );
};
