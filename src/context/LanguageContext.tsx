import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { 
  LanguageCode, 
  LanguageOption, 
  SUPPORTED_LANGUAGES, 
  translations 
} from '../i18n/translations';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  currentOption: LanguageOption;
  languages: LanguageOption[];
  t: (key: string, fallback?: string) => string;
  dir: 'rtl' | 'ltr';
  isRTL: boolean;
}

const STORAGE_KEY = 'sahara_app_lang';

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as LanguageCode | null;
      if (saved && (saved === 'ar' || saved === 'hass' || saved === 'fr' || saved === 'es')) {
        return saved;
      }
    } catch {}
    // Default is Modern Standard Arabic (العربية الفصحى) as requested
    return 'ar';
  });

  const currentOption = useMemo(() => {
    return SUPPORTED_LANGUAGES.find(l => l.code === language) || SUPPORTED_LANGUAGES[0];
  }, [language]);

  const dir = currentOption.dir;
  const isRTL = dir === 'rtl';

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
      document.documentElement.setAttribute('dir', dir);
      document.documentElement.setAttribute('lang', language === 'hass' ? 'ar-MR' : language);
    } catch {}
  }, [language, dir]);

  const setLanguage = (newLang: LanguageCode) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      const opt = SUPPORTED_LANGUAGES.find(l => l.code === newLang) || SUPPORTED_LANGUAGES[0];
      document.documentElement.setAttribute('dir', opt.dir);
      document.documentElement.setAttribute('lang', newLang === 'hass' ? 'ar-MR' : newLang);
    } catch {}
  };

  const t = (key: string, fallback?: string): string => {
    const allTrans = translations as Record<string, Record<string, string>>;
    const langDict = allTrans[language];
    if (langDict && langDict[key]) {
      return langDict[key];
    }
    // Fallback to Standard Arabic
    if (allTrans.ar && allTrans.ar[key]) {
      return allTrans.ar[key];
    }
    return fallback !== undefined ? fallback : key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        currentOption,
        languages: SUPPORTED_LANGUAGES,
        t,
        dir,
        isRTL,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
