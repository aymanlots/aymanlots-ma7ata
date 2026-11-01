import React from 'react';
import { useApp } from '../context/AppContext';
import { SUPPORTED_LANGUAGES, Language } from '../lib/i18n';

interface LanguageSwitcherProps {
  className?: string;
  showToastOnSelect?: boolean;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ 
  className = '',
  showToastOnSelect = true 
}) => {
  const { language, setLanguage, t, showToast } = useApp();

  const handleSelect = (code: Language) => {
    if (code === language) return;
    setLanguage(code);
    if (showToastOnSelect) {
      showToast(t('languageChangedToast', 'تم تغيير لغة التطبيق'), 'info');
    }
  };

  return (
    <div 
      className={`inline-flex items-center justify-center gap-1.5 p-1 rounded-2xl bg-black/50 border border-[#D4AF37]/40 shadow-inner ${className}`}
      role="group"
      aria-label="اختيار لغة التطبيق"
    >
      {SUPPORTED_LANGUAGES.map((item) => {
        const isActive = language === item.code;
        return (
          <button
            key={item.code}
            type="button"
            onClick={() => handleSelect(item.code)}
            title={item.name}
            aria-pressed={isActive}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer flex items-center justify-center gap-1 select-none active:scale-95 ${
              isActive
                ? 'bg-gradient-to-r from-[#F5C84C] to-[#E6B022] text-[#111111] shadow-[0_2px_12px_rgba(245,200,76,0.45)] ring-1 ring-white/60 font-black scale-105'
                : 'text-white/80 hover:text-[#F5C84C] hover:bg-white/10 border border-transparent'
            }`}
          >
            <span className="font-mono tracking-tight font-black">{item.badge}</span>
          </button>
        );
      })}
    </div>
  );
};
