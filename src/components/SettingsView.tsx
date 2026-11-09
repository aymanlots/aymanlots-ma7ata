import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { SUPPORTED_LANGUAGES, LanguageOption } from '../lib/i18n';
import { 
  Settings, 
  Key, 
  RotateCw, 
  Copy, 
  Check, 
  LogOut, 
  Crown, 
  User, 
  ShieldCheck, 
  Languages,
  Store,
  MessageCircle,
  Download,
  Wifi,
  WifiOff,
  Trash2,
  AlertTriangle,
  ChevronDown,
  ImagePlus,
  Pencil,
  Plus,
  X,
  Clock,
  CheckCircle2,
  Mail
} from 'lucide-react';
import { exportService } from '../services/exportService';
import {
  isPack2CustomBrandingAllowed,
  sanitizeOfficialBrandLogo,
  OFFICIAL_APP_LOGO_PATH,
  OFFICIAL_APP_BRAND_NAME,
} from '../utils/logisticsFeatures';
import { PWAInstallButton } from './PWAInstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { ForgotPasswordModal } from './ForgotPasswordModal';
import { HelpPopover } from './HelpPopover';

interface SettingsViewProps {
  onOpenPaywall: () => void;
  onOpenPrivacyModal?: () => void;
  onOpenPlatformOwner?: () => void;
  onOpenCollabRoom?: () => void;
  onOpenCustomerAccounts?: () => void;
  onOpenGuidedTour?: () => void;
  initialOpenTeam?: boolean;
  onTeamOpened?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  onOpenPaywall,
  onOpenPrivacyModal,
  onOpenPlatformOwner,
  onOpenGuidedTour,
  initialOpenTeam = false,
  onTeamOpened
}) => {
  const { 
    currentUser, 
    userRole, 
    userAssignedStationId,
    currentWorkspace,
    workspaceMembers,
    addWorkerByOwner,
    assignWorkerToStation,
    resetMemberPassword,
    passwordResetRequests,
    removeWorkerFromTeam,
    transactions,
    parcels,
    stations,
    selectedStationId,
    setSelectedStationId,
    addStation,
    updateStation,
    deleteStation,
    renewInviteCode, 
    logout,
    exchangeRate,
    setExchangeRate,
    updateUnclaimedDaysThreshold,
    updateUserContactNumbers,
    sendRegistrationEmailOtp,
    verifyRegistrationEmailOtp,
    updateWorkspaceBranding,
    switchWorkspacePlan,
    joinRequests,
    deleteDemoData,
    daysUntilExpiry,
    subscriptionRemainingLabel,
    isSubscriptionExpired,
    extendSubscription,
    startFiveMinuteSubscriptionTest,
    showToast,
    themeMode,
    setThemeMode,
    language,
    setLanguage,
    t
  } = useApp();

  const dir = (language === 'ar' || language === 'hassaniya') ? 'rtl' : 'ltr';

  const isInFree30Days = daysUntilExpiry > 0 && !isSubscriptionExpired;
  const isPlan2TwoStations =
    !isInFree30Days &&
    (currentWorkspace?.plan_tier === 'plan_2_two_stations' ||
      currentWorkspace?.max_stations === 2 ||
      currentWorkspace?.max_workers_per_station === 1);
  const isBrandingLockedToApp = !isPack2CustomBrandingAllowed(currentWorkspace);
  const activeWorkersList = workspaceMembers.filter(m => m.role === 'worker');

  const isOnline = useOnlineStatus();
  const teamSectionRef = useRef<HTMLDivElement | null>(null);

  // Collapsible sections state (collapsed by default)
  const [openStationsSection, setOpenStationsSection] = useState(true);
  const [openWorkspaceInfo, setOpenWorkspaceInfo] = useState(false);
  const [openBrandingSection, setOpenBrandingSection] = useState(false);
  const [openExportSection, setOpenExportSection] = useState(false);
  const [openLangSection, setOpenLangSection] = useState(false);
  const [openTeamSection, setOpenTeamSection] = useState<boolean>(Boolean(initialOpenTeam));
  const [openContactSection, setOpenContactSection] = useState(false);

  // Unified Station + Workers creation state in Settings
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editStName, setEditStName] = useState('');
  const [editStCity, setEditStCity] = useState('');
  const [editStCountry, setEditStCountry] = useState<'MA' | 'MR'>('MA');
  const [editStCurrency, setEditStCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [editStPhone, setEditStPhone] = useState('');
  const [showAddStationForm, setShowAddStationForm] = useState(false);
  const [newStName, setNewStName] = useState('');
  const [newStCity, setNewStCity] = useState('');
  const [newStCountry, setNewStCountry] = useState<'MA' | 'MR'>('MA');
  const [newStCurrency, setNewStCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [newStPhone, setNewStPhone] = useState('');
  const [newStWorker1Name, setNewStWorker1Name] = useState('');
  const [newStWorker1Phone, setNewStWorker1Phone] = useState('');
  const [newStWorker2Name, setNewStWorker2Name] = useState('');
  const [newStWorker2Phone, setNewStWorker2Phone] = useState('');
  const [stationForQuickWorkerId, setStationForQuickWorkerId] = useState<string | null>(null);
  const [stationToDeleteId, setStationToDeleteId] = useState<string | null>(null);
  const [isSavingStation, setIsSavingStation] = useState(false);

  // Custom thermal sticker branding state
  const [brandNameInput, setBrandNameInput] = useState(
    currentWorkspace?.custom_brand_name ||
      (!currentWorkspace?.name || currentWorkspace.name === 'محطة الاتحادية'
        ? OFFICIAL_APP_BRAND_NAME
        : currentWorkspace.name)
  );
  const [brandPhoneInput, setBrandPhoneInput] = useState(
    currentWorkspace?.custom_brand_phone || currentUser?.phone || ''
  );
  const [brandLogoUrlInput, setBrandLogoUrlInput] = useState(
    sanitizeOfficialBrandLogo(currentWorkspace?.custom_brand_logo_url)
  );
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      const defaultName =
        !currentWorkspace.name || currentWorkspace.name === 'محطة الاتحادية'
          ? OFFICIAL_APP_BRAND_NAME
          : currentWorkspace.name;
      setBrandNameInput(currentWorkspace.custom_brand_name || defaultName);
      setBrandPhoneInput(currentWorkspace.custom_brand_phone || currentUser?.phone || '');
      setBrandLogoUrlInput(sanitizeOfficialBrandLogo(currentWorkspace.custom_brand_logo_url));
    }
  }, [
    currentWorkspace?.custom_brand_name,
    currentWorkspace?.custom_brand_phone,
    currentWorkspace?.custom_brand_logo_url,
    currentWorkspace?.name,
  ]);

  // Contact numbers & Gmail update state
  const [contactPhoneInput, setContactPhoneInput] = useState(currentUser?.phone || '');
  const [contactWhatsappInput, setContactWhatsappInput] = useState(
    currentUser?.whatsapp_number || currentUser?.phone || ''
  );
  const [contactEmailInput, setContactEmailInput] = useState(
    currentUser?.email || currentWorkspace?.owner_email || ''
  );
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);
  const [contactOtpStep, setContactOtpStep] = useState<'form' | 'verify'>('form');
  const [contactOtpInput, setContactOtpInput] = useState('');
  const [contactPreviewCode, setContactPreviewCode] = useState<string | undefined>(undefined);
  const [contactSuccessSummary, setContactSuccessSummary] = useState<string | null>(null);

  useEffect(() => {
    if (currentUser) {
      setContactPhoneInput(currentUser.phone || '');
      setContactWhatsappInput(currentUser.whatsapp_number || currentUser.phone || '');
      setContactEmailInput(currentUser.email || currentWorkspace?.owner_email || '');
    }
  }, [currentUser?.phone, currentUser?.whatsapp_number, currentUser?.email, currentWorkspace?.owner_email]);

  useEffect(() => {
    if (initialOpenTeam) {
      setOpenStationsSection(true);
      setTimeout(() => {
        teamSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      if (onTeamOpened) onTeamOpened();
    }
  }, [initialOpenTeam, onTeamOpened]);

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedWsId, setCopiedWsId] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPasswordResetAdmin, setShowPasswordResetAdmin] = useState(false);

  // Add Worker form state
  const [showAddWorkerForm, setShowAddWorkerForm] = useState(false);
  const [newWorkerName, setNewWorkerName] = useState('');
  const [newWorkerPhone, setNewWorkerPhone] = useState('');
  const [newWorkerStationId, setNewWorkerStationId] = useState(stations[0]?.id || 'st-dakhla');
  const [isAddingWorker, setIsAddingWorker] = useState(false);

  // One-time temporary password alert box
  const [oneTimeCredential, setOneTimeCredential] = useState<{
    name: string;
    phone: string;
    temporaryPassword: string;
  } | null>(null);
  const [copiedTempPass, setCopiedTempPass] = useState(false);

  // Unclaimed days form state
  const [unclaimedDaysInput, setUnclaimedDaysInput] = useState(
    String(currentWorkspace?.unclaimed_days_threshold ?? 7)
  );

  // Worker removal confirmation modal state
  const [workerToDelete, setWorkerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeletingWorker, setIsDeletingWorker] = useState(false);

  // Demo data deletion confirmation modal state
  const [showDeleteDemoConfirm, setShowDeleteDemoConfirm] = useState(false);

  const handleCopyInviteCode = () => {
    if (!currentWorkspace?.invite_code) return;
    navigator.clipboard.writeText(currentWorkspace.invite_code);
    setCopiedCode(true);
    showToast('تم نسخ رمز دعوة مساحة العمل بنجاح', 'success');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyShortId = () => {
    if (!currentWorkspace?.short_id) return;
    navigator.clipboard.writeText(currentWorkspace.short_id);
    setCopiedWsId(true);
    showToast(`تم نسخ المعرف القصير [${currentWorkspace.short_id}] بنجاح`, 'success');
    setTimeout(() => setCopiedWsId(false), 2500);
  };

  const handleRegenerateCode = async () => {
    setIsRegenerating(true);
    try {
      const newCode = await renewInviteCode();
      showToast(`تم تجديد رمز الدعوة بنجاح: ${newCode}`, 'success');
    } catch {
      showToast('تعذر تجديد رمز الدعوة', 'error');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleConfirmDeleteWorker = async () => {
    if (!workerToDelete) return;
    setIsDeletingWorker(true);
    try {
      await removeWorkerFromTeam(workerToDelete.id);
      showToast(`تم حذف الموظف [${workerToDelete.name}] من مساحة العمل بنجاح`, 'success');
      setWorkerToDelete(null);
    } catch {
      showToast('تعذر حذف الموظف', 'error');
    } finally {
      setIsDeletingWorker(false);
    }
  };

  const pendingJoinRequestsCount = (joinRequests || []).filter(r => r.status === 'pending').length;

  // Dedicated worker profile editor state
  const [workerNameInput, setWorkerNameInput] = useState(currentUser?.name || '');
  const [workerPhoneInput, setWorkerPhoneInput] = useState(currentUser?.phone || '');
  const [workerWhatsappInput, setWorkerWhatsappInput] = useState(currentUser?.whatsapp_number || currentUser?.phone || '');
  const [isSavingWorkerProfile, setIsSavingWorkerProfile] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setWorkerNameInput(currentUser.name || '');
      setWorkerPhoneInput(currentUser.phone || '');
      setWorkerWhatsappInput(currentUser.whatsapp_number || currentUser.phone || '');
    }
  }, [currentUser?.name, currentUser?.phone, currentUser?.whatsapp_number]);

  const handleSaveWorkerProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerNameInput.trim()) {
      showToast('يرجى كتابة اسمك الكامل', 'error');
      return;
    }
    if (!workerPhoneInput.trim()) {
      showToast('يرجى كتابة رقم الهاتف', 'error');
      return;
    }
    setIsSavingWorkerProfile(true);
    try {
      await updateUserContactNumbers(
        workerPhoneInput.trim(),
        workerWhatsappInput.trim() || workerPhoneInput.trim(),
        workerNameInput.trim()
      );
      showToast('تم حفظ وتحديث بياناتك بنجاح، وستظهر فوراً للمدير ✓', 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث البيانات', 'error');
    } finally {
      setIsSavingWorkerProfile(false);
    }
  };

  // If user is a worker, render dedicated clean worker settings view (no station/quota/system admin settings)
  if (userRole === 'worker') {
    const assignedStation = stations.find(s => s.id === (userAssignedStationId || ''));
    return (
      <div className="space-y-3.5 pb-36 text-right animate-fadeIn" dir="rtl">
        {/* 1. Worker Header Card */}
        <div className="luxury-card rounded-[22px] p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-11 h-11 rounded-2xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
                <User className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-black text-white">{currentUser?.name || 'موظف المحطة'}</h2>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F5C84C]/20 text-[#F5C84C] border border-[#F5C84C]/40 font-black">
                    موظف محطة معتمد
                  </span>
                </div>
                <p className="text-[11px] text-white/80 font-bold mt-0.5">
                  {assignedStation ? `المحطة المعين بها: ${assignedStation.name} (${assignedStation.city})` : (currentWorkspace?.name || 'Sahara📦 Express')}
                </p>
              </div>
            </div>
            <PWAInstallButton />
          </div>

          {/* Connection status badge */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
              isOnline 
                ? 'bg-[#006233]/30 text-[#2ECC71] border-[#006233]/50' 
                : 'bg-rose-950/60 text-rose-300 border-rose-500/40 animate-pulse'
            }`}>
              {isOnline ? <Wifi className="w-3 h-3 text-[#2ECC71]" /> : <WifiOff className="w-3 h-3" />}
              <span>{isOnline ? 'متصل بالإنترنت' : 'وضع غير متصل (أوفلاين)'}</span>
            </div>

            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border bg-[#D4AF37]/20 text-[#F5C84C] border-[#D4AF37]/50 shadow-sm">
              <ShieldCheck className="w-3 h-3 text-[#F5C84C]" />
              <span>مزامنة سحابية نشطة ⚡</span>
            </div>

            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border shadow-sm ${
              isSubscriptionExpired
                ? 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                : daysUntilExpiry <= 3
                ? 'bg-amber-950/70 text-[#F5C84C] border-[#F5C84C]/50'
                : 'bg-black/60 text-white/90 border-white/20'
            }`}>
              <Clock className="w-3 h-3 text-[#F5C84C]" />
              <span>
                {isSubscriptionExpired
                  ? 'اشتراك المحطة (المدير): منتهٍ'
                  : `صلاحية اشتراك المحطة (المدير): ${subscriptionRemainingLabel}`}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Worker Personal Profile Editor (Name and Phone only - visible to manager) */}
        <div className="luxury-card rounded-[22px] p-4 space-y-3 border-2 border-[#F5C84C]/40">
          <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0">
                <Pencil className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-white">✏️ بياناتي الشخصية</h3>
                <HelpPopover text="تحديث اسمك ورقم هاتفك وسيظهران فوراً للمدير في قائمة فريق المحطة." />
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveWorkerProfile} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#F5C84C] block">
                اسم العامل الكامل *:
              </label>
              <input
                type="text"
                required
                value={workerNameInput}
                onChange={e => setWorkerNameInput(e.target.value)}
                placeholder="اسمك الكامل..."
                className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#F5C84C] block">
                رقم هاتفك الشخصي والاتصال *:
              </label>
              <input
                type="tel"
                required
                value={workerPhoneInput}
                onChange={e => setWorkerPhoneInput(e.target.value)}
                placeholder="+212... أو +222..."
                dir="ltr"
                className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-[#F5C84C] block">
                رقم الواتساب الخاص بك:
              </label>
              <input
                type="tel"
                value={workerWhatsappInput}
                onChange={e => setWorkerWhatsappInput(e.target.value)}
                placeholder="+212... أو +222..."
                dir="ltr"
                className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingWorkerProfile}
              className="w-full py-2.5 rounded-xl bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-[#111111] font-black text-xs transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSavingWorkerProfile ? '⏳ ...' : t('saveMyData', 'حفظ بياناتي')}
            </button>
          </form>
        </div>

        {/* 4. Theme Mode (وضع النهار / وضع الليل) — اللغة من أيقونة الكرة الأرضية 🌐 بالأعلى */}
        <div className="luxury-card rounded-[22px] p-4 space-y-2.5">
          <span className="text-xs font-black text-white block">{t('appAppearance', 'مظهر التطبيق')}</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              data-btn-role="info"
              data-btn-role-fixed="true"
              data-btn-active={themeMode === 'light' ? 'true' : 'false'}
              data-btn-active-fixed="true"
              onClick={() => setThemeMode('light')}
              className={`py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
                themeMode === 'light' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              {t('dayMode', 'وضع النهار')}
            </button>
            <button
              type="button"
              data-btn-role="info"
              data-btn-role-fixed="true"
              data-btn-active={themeMode === 'dark' ? 'true' : 'false'}
              data-btn-active-fixed="true"
              onClick={() => setThemeMode('dark')}
              className={`py-2.5 rounded-xl text-xs font-black transition cursor-pointer ${
                themeMode === 'dark' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              {t('nightMode', 'وضع الليل')}
            </button>
          </div>
        </div>

        {/* 5. Logout */}
        <div className="text-center pt-1">
          <button
            onClick={logout}
            className="btn-cancel w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t('logoutAccount', 'تسجيل الخروج من الحساب')}</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3.5 pb-36 ${dir === 'rtl' ? 'text-right' : 'text-left'} animate-fadeIn`} dir={dir}>
      
      {/* 1. Header Card */}
      <div className="luxury-card rounded-[22px] p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white">⚙️ {t('settingsTitle', 'الإعدادات')}</h2>
              <p className="text-[11px] text-white/80 font-bold">
                {!currentWorkspace?.name || currentWorkspace.name === 'محطة الاتحادية'
                  ? 'Sahara📦 Express'
                  : currentWorkspace.name}
              </p>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        {/* Quick Light / Dark Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={themeMode === 'light' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setThemeMode('light')}
            className={`py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              themeMode === 'light' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            ☀️ {t('dayMode', 'وضع النهار')}
          </button>
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={themeMode === 'dark' ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setThemeMode('dark')}
            className={`py-2 rounded-xl text-xs font-black transition cursor-pointer ${
              themeMode === 'dark' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            🌙 {t('nightMode', 'وضع الليل')}
          </button>
        </div>

        {/* Connection status badge */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
            isOnline 
              ? 'bg-[#006233]/30 text-[#2ECC71] border-[#006233]/50' 
              : 'bg-rose-950/60 text-rose-300 border-rose-500/40 animate-pulse'
          }`}>
            {isOnline ? <Wifi className="w-3 h-3 text-[#2ECC71]" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'متصل' : 'أوفلاين'}</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black border bg-[#D4AF37]/20 text-[#F5C84C] border-[#D4AF37]/50 shadow-sm">
            <ShieldCheck className="w-3 h-3 text-[#F5C84C]" />
            <span>☁️ سحابة نشطة ⚡</span>
          </div>
        </div>

        {/* Live 30-Day Subscription Timer & Status Bar */}
        <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black flex-wrap">
            <Clock className={`w-4 h-4 ${isSubscriptionExpired ? 'text-rose-400' : 'text-[#F5C84C]'}`} />
            <span className="text-white/85">⏳ الاشتراك:</span>
            <span className={`px-2 py-0.5 rounded-lg font-mono text-[11px] border ${
              isSubscriptionExpired
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                : daysUntilExpiry <= 3
                ? 'bg-amber-950/80 text-[#F5C84C] border-[#F5C84C]/50'
                : 'bg-[#F5C84C]/20 text-[#F5C84C] border-[#F5C84C]/40'
            }`}>
              {isSubscriptionExpired ? 'منتهي' : subscriptionRemainingLabel}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenPaywall}
              className="px-3 py-1.5 rounded-xl bg-[#F5C84C] text-[#111111] text-[11px] font-black transition active:scale-95 cursor-pointer flex items-center gap-1"
            >
              <Crown className="w-3.5 h-3.5" />
              <span>الباقات</span>
            </button>
          </div>
        </div>
      </div>

      {/* 1.5 قسم موحد ومنظم للـ Admin لإدارة المحطات والعمال في مكان واحد (بطونة واحدة واضحة: + إضافة محطة + عمالها) */}
      <div ref={teamSectionRef} className="luxury-card rounded-[22px] p-4 space-y-3 border-2 border-[#D4AF37]/55 shadow-lg">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setOpenStationsSection(!openStationsSection)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpenStationsSection(!openStationsSection);
              }
            }}
            className="w-full flex items-center justify-between gap-2 text-right cursor-pointer select-none"
          >
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
                <Store className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm sm:text-base font-black text-white truncate">
                    🏪👥 المحطات والعمال ({stations.length} محطات • {activeWorkersList.length} عمال)
                  </h3>
                  <HelpPopover text="قسم موحد ومنظم لإضافة المحطة مع عاملها أو عامليها، تعديل السمية، إعطاء الصلاحية وكود الدخول للعامل، أو مسح المحطة نهائياً من كل مكان." />
                </div>
                <p className="text-[10px] text-[#E6C37A] font-bold mt-0.5 truncate">
                  زيد المحطة + العامل ديالها، مسح، وبدل السمية من بلاصة وحدة
                </p>
              </div>
            </div>

            <ChevronDown
              className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
                openStationsSection ? 'rotate-180' : ''
              }`}
            />
          </div>

          {openStationsSection && (
            <div className="space-y-3.5 pt-3 border-t border-white/15 animate-fadeIn">
              {/* شريط الحصة الحالية وطلبات استعادة كلمة المرور */}
              <div className="p-3 rounded-2xl bg-black/55 border border-[#F5C84C]/35 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-black text-white text-[11px]">
                    📊 حصة المحطات والعمال الحالية:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPasswordResetAdmin(true)}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer bg-white/10 text-white"
                  >
                    <Key className="w-3 h-3 text-[#F5C84C]" />
                    <span>طلبات الاستعادة</span>
                    {(passwordResetRequests || []).filter(r => r.status === 'pending').length > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[9px] font-black">
                        {(passwordResetRequests || []).filter(r => r.status === 'pending').length}
                      </span>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div className="bg-black/60 p-2 rounded-xl border border-white/15 flex items-center justify-between">
                    <span className="text-white/75">المحطات المفتوحة:</span>
                    <span className="font-mono font-black text-[#F5C84C]">
                      {stations.length} / {isPlan2TwoStations ? '2 محطات' : 'غير محدود'}
                    </span>
                  </div>
                  <div className="bg-black/60 p-2 rounded-xl border border-white/15 flex items-center justify-between">
                    <span className="text-white/75">
                      {selectedStationId && selectedStationId !== 'all' ? 'عمال هاد المحطة:' : 'العمال بالمحطات:'}
                    </span>
                    <span className="font-mono font-black text-emerald-400">
                      {selectedStationId && selectedStationId !== 'all'
                        ? activeWorkersList.filter(w => w.station_id === selectedStationId).length
                        : `${activeWorkersList.length} / ${isPlan2TwoStations ? '2 عمال' : 'غير محدود'}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* كود الدخول المباشر للعامل المضاف حديثاً */}
              {oneTimeCredential && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/60 border-2 border-emerald-500/60 space-y-2 text-xs animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-emerald-300">
                      🔑 كود الدخول المباشر للعامل ({oneTimeCredential.name}):
                    </span>
                    <button
                      type="button"
                      onClick={() => setOneTimeCredential(null)}
                      className="btn-cancel px-2.5 py-1 text-[10px]"
                    >
                      إخفاء
                    </button>
                  </div>
                  <div className="flex items-center justify-between bg-black/70 p-2.5 rounded-xl border border-emerald-500/40">
                    <span className="font-mono text-base font-black text-[#F5C84C] tracking-wider" dir="ltr">
                      {oneTimeCredential.temporaryPassword}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(oneTimeCredential.temporaryPassword);
                          setCopiedTempPass(true);
                          showToast('تم نسخ كود دخول العامل', 'success');
                          setTimeout(() => setCopiedTempPass(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded-lg font-black text-[11px] flex items-center gap-1"
                      >
                        {copiedTempPass ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedTempPass ? 'تم النسخ' : 'نسخ الكود'}</span>
                      </button>
                      <a
                        href={`https://wa.me/${oneTimeCredential.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                          `مرحباً ${oneTimeCredential.name}، هذا هو كود الدخول المباشر الخاص بك كعامل في Sahara📦 Express:\n\n🔑 كود الدخول: ${oneTimeCredential.temporaryPassword}\n\nطريقة الدخول: افتح التطبيق ← اختر "💼 عامل (موظف محطة)" ← الصق هذا الكود فقط واضغط دخول مباشر.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-[#F5C84C] text-[#111111] font-extrabold text-[11px] flex items-center gap-1"
                      >
                        <MessageCircle className="w-3 h-3" />
                        <span>واتساب</span>
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* البطونة الوحيدة والواضحة فالإعدادات لإضافة محطة جديدة + عمالها */}
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-[#F5C84C]">
                  قائمة المحطات وعمالها ({stations.length}):
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddStationForm(!showAddStationForm);
                    setEditingStationId(null);
                  }}
                  className="btn-add px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus className="w-4 h-4" />
                  <span>{showAddStationForm ? 'إغلاق النموذج' : '+ إضافة محطة + عمالها'}</span>
                </button>
              </div>

              {/* استمارة موحدة: إضافة محطة + العامل الأول + العامل الثاني في خطوة واحدة */}
              {showAddStationForm && (
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    if (!newStName.trim() || !newStCity.trim()) return;
                    setIsSavingStation(true);
                    try {
                      const res = await addStation({
                        name: newStName.trim(),
                        city: newStCity.trim(),
                        country: newStCountry,
                        default_currency: newStCurrency,
                        phone: newStPhone.trim(),
                      });
                      if (res.success && res.station) {
                        const createdStationId = res.station.id;
                        if (newStWorker1Name.trim() && newStWorker1Phone.trim()) {
                          const w1 = await addWorkerByOwner(
                            newStWorker1Name.trim(),
                            newStWorker1Phone.trim(),
                            createdStationId
                          );
                          if (w1.success && w1.temporaryPassword) {
                            setOneTimeCredential({
                              name: newStWorker1Name.trim(),
                              phone: newStWorker1Phone.trim(),
                              temporaryPassword: w1.temporaryPassword,
                            });
                          }
                        }
                        if (newStWorker2Name.trim() && newStWorker2Phone.trim()) {
                          const w2 = await addWorkerByOwner(
                            newStWorker2Name.trim(),
                            newStWorker2Phone.trim(),
                            createdStationId
                          );
                          if (w2.success && w2.temporaryPassword) {
                            setOneTimeCredential({
                              name: newStWorker2Name.trim(),
                              phone: newStWorker2Phone.trim(),
                              temporaryPassword: w2.temporaryPassword,
                            });
                          }
                        }
                        setShowAddStationForm(false);
                        setNewStName('');
                        setNewStCity('');
                        setNewStPhone('');
                        setNewStWorker1Name('');
                        setNewStWorker1Phone('');
                        setNewStWorker2Name('');
                        setNewStWorker2Phone('');
                      }
                    } finally {
                      setIsSavingStation(false);
                    }
                  }}
                  className="bg-black/70 border-2 border-[#F5C84C]/60 rounded-2xl p-3.5 space-y-3 animate-fadeIn"
                >
                  <div className="flex items-center justify-between border-b border-white/15 pb-2">
                    <span className="text-xs font-black text-[#F5C84C]">
                      🏪 إضافة محطة جديدة + تعيين عمالها (اختياري: عامل أو عاملين)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddStationForm(false)}
                      className="btn-cancel p-1 rounded-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      value={newStName}
                      onChange={e => setNewStName(e.target.value)}
                      placeholder="اسم المحطة (مثال: محطة الداخلة) *"
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-black/70 border border-white/20 text-white"
                    />
                    <input
                      type="text"
                      required
                      value={newStCity}
                      onChange={e => setNewStCity(e.target.value)}
                      placeholder="المدينة (الداخلة / نواذيبو) *"
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-black/70 border border-white/20 text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newStCountry}
                      onChange={e => {
                        const c = e.target.value as 'MA' | 'MR';
                        setNewStCountry(c);
                        setNewStCurrency(c === 'MR' ? 'MRU' : 'MAD');
                      }}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-black/70 border border-white/20 text-white"
                    >
                      <option value="MA">🇲🇦 المغرب (MA)</option>
                      <option value="MR">🇲🇷 موريتانيا (MR)</option>
                    </select>
                    <select
                      value={newStCurrency}
                      onChange={e => setNewStCurrency(e.target.value as 'MAD' | 'MRU')}
                      className="px-3 py-2 rounded-xl text-xs font-bold bg-black/70 border border-white/20 text-[#F5C84C]"
                    >
                      <option value="MAD">درهم (MAD)</option>
                      <option value="MRU">أوقية (MRU)</option>
                    </select>
                  </div>

                  {/* العامل الأول للمحطة (اختياري) */}
                  <div className="p-2.5 rounded-xl bg-black/50 border border-white/15 space-y-2">
                    <span className="text-[11px] font-black text-emerald-300 block">
                      👤 العامل الأول في هذه المحطة (اختياري):
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newStWorker1Name}
                        onChange={e => setNewStWorker1Name(e.target.value)}
                        placeholder="اسم العامل 1"
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-black/70 border border-white/20 text-white"
                      />
                      <input
                        type="tel"
                        dir="ltr"
                        value={newStWorker1Phone}
                        onChange={e => setNewStWorker1Phone(e.target.value)}
                        placeholder="هاتف العامل 1"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-black/70 border border-white/20 text-white"
                      />
                    </div>
                  </div>

                  {/* العامل الثاني للمحطة (اختياري) */}
                  {!isPlan2TwoStations && (
                    <div className="p-2.5 rounded-xl bg-black/50 border border-white/15 space-y-2">
                      <span className="text-[11px] font-black text-[#F5C84C] block">
                        👤 العامل الثاني في هذه المحطة (اختياري):
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={newStWorker2Name}
                          onChange={e => setNewStWorker2Name(e.target.value)}
                          placeholder="اسم العامل 2"
                          className="px-2.5 py-1.5 rounded-lg text-xs bg-black/70 border border-white/20 text-white"
                        />
                        <input
                          type="tel"
                          dir="ltr"
                          value={newStWorker2Phone}
                          onChange={e => setNewStWorker2Phone(e.target.value)}
                          placeholder="هاتف العامل 2"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-black/70 border border-white/20 text-white"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={isSavingStation}
                    className="btn-add w-full py-2.5 rounded-xl font-black text-xs cursor-pointer shadow-md"
                  >
                    {isSavingStation ? 'جاري الحفظ والإنشاء...' : '✅ حفظ المحطة والعمال الآن'}
                  </button>
                </form>
              )}

              {/* بطاقات المحطات وعمال كل محطة مدمجة في مكان واحد (مفلترة حسب المحطة المختارة فالفوق أو الكل) */}
              <div className="space-y-2.5">
                {(selectedStationId && selectedStationId !== 'all'
                  ? stations.filter(s => s.id === selectedStationId)
                  : stations
                ).map(st => {
                  const isEditingThis = editingStationId === st.id;
                  const isConfirmingDelete = stationToDeleteId === st.id;
                  const stationWorkersList = activeWorkersList.filter(w => w.station_id === st.id);
                  const isAddingWorkerHere = stationForQuickWorkerId === st.id;
                  const isCurrentlySelected = selectedStationId === st.id;

                  return (
                    <div
                      key={st.id}
                      className={`bg-black/55 border rounded-2xl p-3 space-y-2.5 ${
                        isCurrentlySelected ? 'border-emerald-500/70' : 'border-[#D4AF37]/35'
                      }`}
                    >
                      {!isEditingThis ? (
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs sm:text-sm font-black text-white truncate">
                                {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name}
                              </p>
                              {isCurrentlySelected && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black">
                                  📍 مفتوحة دابا
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/75 font-bold">
                              المدينة: {st.city} • العملة: {st.default_currency || (st.country === 'MR' ? 'MRU' : 'MAD')} • العمال: {stationWorkersList.length}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setStationForQuickWorkerId(isAddingWorkerHere ? null : st.id);
                                setNewWorkerStationId(st.id);
                                setNewWorkerName('');
                                setNewWorkerPhone('');
                              }}
                              className="btn-add px-2.5 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer"
                              title="إضافة عامل لهذه المحطة"
                            >
                              <Plus className="w-3 h-3" />
                              <span>+ عامل</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingStationId(st.id);
                                setEditStName(st.name);
                                setEditStCity(st.city);
                                setEditStCountry(st.country);
                                setEditStCurrency((st.currency === 'MRU' || st.default_currency === 'MRU' || st.country === 'MR') ? 'MRU' : 'MAD');
                                setEditStPhone(st.phone || '');
                                setStationToDeleteId(null);
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5C84C] text-[10px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تبديل السمية</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setStationToDeleteId(isConfirmingDelete ? null : st.id)}
                              className="btn-delete px-2 py-1.5 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer"
                              title="حذف المحطة نهائياً من كل مكان"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>مسح</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <form
                          onSubmit={async e => {
                            e.preventDefault();
                            if (!editStName.trim() || !editStCity.trim()) return;
                            setIsSavingStation(true);
                            try {
                              const res = await updateStation(st.id, {
                                name: editStName.trim(),
                                city: editStCity.trim(),
                                country: editStCountry,
                                default_currency: editStCurrency,
                                phone: editStPhone.trim(),
                              });
                              if (res.success) {
                                setEditingStationId(null);
                              }
                            } finally {
                              setIsSavingStation(false);
                            }
                          }}
                          className="space-y-2 bg-black/60 p-2.5 rounded-xl border border-[#F5C84C]/40"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[10px] font-bold text-white/75 mb-1">اسم المحطة *</label>
                              <input
                                type="text"
                                required
                                value={editStName}
                                onChange={e => setEditStName(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-black/70 border border-white/25 text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-white/75 mb-1">المدينة *</label>
                              <input
                                type="text"
                                required
                                value={editStCity}
                                onChange={e => setEditStCity(e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg text-xs font-bold bg-black/70 border border-white/25 text-white"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select
                              value={editStCountry}
                              onChange={e => {
                                const c = e.target.value as 'MA' | 'MR';
                                setEditStCountry(c);
                                setEditStCurrency(c === 'MR' ? 'MRU' : 'MAD');
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-black/70 border border-white/25 text-white"
                            >
                              <option value="MA">🇲🇦 المغرب (MA)</option>
                              <option value="MR">🇲🇷 موريتانيا (MR)</option>
                            </select>
                            <select
                              value={editStCurrency}
                              onChange={e => setEditStCurrency(e.target.value as 'MAD' | 'MRU')}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-black/70 border border-white/25 text-[#F5C84C]"
                            >
                              <option value="MAD">درهم (MAD)</option>
                              <option value="MRU">أوقية (MRU)</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="submit"
                              disabled={isSavingStation}
                              className="flex-1 py-1.5 rounded-lg bg-[#F5C84C] text-[#111111] font-black text-xs cursor-pointer"
                            >
                              حفظ التعديلات (ومزامنتها في الشراكة)
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingStationId(null)}
                              className="btn-cancel px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer"
                            >
                              إلغاء
                            </button>
                          </div>
                        </form>
                      )}

                      {/* تأكيد حذف المحطة من كل مكان وإخراج العامل ديالها */}
                      {isConfirmingDelete && (
                        <div className="p-2.5 rounded-xl bg-rose-950/75 border border-rose-500/50 space-y-2">
                          <p className="text-[11px] font-bold text-rose-200 leading-snug">
                            ⚠️ تأكيد مسح محطة &quot;{st.name}&quot; نهائياً؟ غادي تمسح من كلشي (عندك، عند الشركاء، ومن غرفة الشراكة) والعامل ديالها غادي يخرج فوراً.
                          </p>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteStation(st.id);
                                setStationToDeleteId(null);
                              }}
                              className="btn-delete px-3 py-1.5 rounded-lg text-[11px] font-black cursor-pointer"
                            >
                              نعم، امسح المحطة وأخرج العامل
                            </button>
                            <button
                              type="button"
                              onClick={() => setStationToDeleteId(null)}
                              className="btn-cancel px-2.5 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer"
                            >
                              تراجع
                            </button>
                          </div>
                        </div>
                      )}

                      {/* نموذج سريع لإضافة عامل داخل هذه المحطة */}
                      {isAddingWorkerHere && (
                        <form
                          onSubmit={async e => {
                            e.preventDefault();
                            if (!newWorkerName.trim() || !newWorkerPhone.trim()) {
                              showToast('يرجى إدخال اسم العامل ورقم هاتفه', 'error');
                              return;
                            }
                            setIsAddingWorker(true);
                            try {
                              const res = await addWorkerByOwner(newWorkerName.trim(), newWorkerPhone.trim(), st.id);
                              if (res.success && res.temporaryPassword) {
                                setOneTimeCredential({
                                  name: newWorkerName.trim(),
                                  phone: newWorkerPhone.trim(),
                                  temporaryPassword: res.temporaryPassword,
                                });
                                setNewWorkerName('');
                                setNewWorkerPhone('');
                                setStationForQuickWorkerId(null);
                              } else if (res.error) {
                                showToast(res.error, 'error');
                              }
                            } finally {
                              setIsAddingWorker(false);
                            }
                          }}
                          className="p-2.5 rounded-xl bg-black/65 border border-emerald-500/40 space-y-2 text-xs animate-fadeIn"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-black text-emerald-300 text-[11px]">
                              + إضافة عامل جديد في ({st.name}):
                            </span>
                            <button
                              type="button"
                              onClick={() => setStationForQuickWorkerId(null)}
                              className="btn-cancel px-2 py-0.5 rounded text-[10px]"
                            >
                              إلغاء
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              type="text"
                              required
                              placeholder="اسم العامل الكامل *"
                              value={newWorkerName}
                              onChange={e => setNewWorkerName(e.target.value)}
                              className="bg-black/70 border border-white/20 rounded-lg px-2.5 py-1.5 text-white text-xs"
                            />
                            <input
                              type="tel"
                              required
                              dir="ltr"
                              placeholder="رقم هاتف العامل *"
                              value={newWorkerPhone}
                              onChange={e => setNewWorkerPhone(e.target.value)}
                              className="bg-black/70 border border-white/20 rounded-lg px-2.5 py-1.5 text-white font-mono text-xs"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={isAddingWorker}
                            className="btn-add w-full py-1.5 rounded-lg font-black text-[11px] cursor-pointer"
                          >
                            {isAddingWorker ? 'جاري الإنشاء...' : 'تأكيد إضافة العامل وتوليد الكود'}
                          </button>
                        </form>
                      )}

                      {/* قائمة العمال المعينين في هذه المحطة */}
                      <div className="pt-1.5 border-t border-white/10 space-y-1.5">
                        {stationWorkersList.length === 0 ? (
                          <div className="text-[10px] text-white/60 flex items-center justify-between">
                            <span>لا يوجد عامل معين في هذه المحطة بعد</span>
                          </div>
                        ) : (
                          stationWorkersList.map(member => {
                            const activeWorkerCode = member.worker_code || member.profile?.worker_code || '';
                            return (
                              <div
                                key={member.user_id}
                                className="bg-black/45 p-2 rounded-xl border border-white/10 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span className="font-bold text-white text-[11px]">{member.profile?.name || 'عامل المحطة'}</span>
                                    <span className="text-[10px] font-mono text-white/75" dir="ltr">
                                      {member.profile?.phone}
                                    </span>
                                  </div>
                                  {activeWorkerCode && (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(activeWorkerCode);
                                          showToast(`تم نسخ كود العامل: ${activeWorkerCode}`, 'success');
                                        }}
                                        className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-[#F5C84C] font-mono text-[10px] font-black flex items-center gap-1 cursor-pointer"
                                        dir="ltr"
                                      >
                                        <Key className="w-2.5 h-2.5 text-emerald-400" />
                                        <span>{activeWorkerCode}</span>
                                        <Copy className="w-2.5 h-2.5 text-white/70" />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  {stations.length > 1 && (
                                    <select
                                      value={member.station_id || st.id}
                                      onChange={async (e) => {
                                        await assignWorkerToStation(e.target.value, member.user_id);
                                      }}
                                      className="px-1.5 py-1 rounded-lg bg-black/70 border border-[#F5C84C]/40 text-[#F5C84C] text-[10px] font-bold"
                                      title="تعيين المحطة / صلاحية العامل"
                                    >
                                      {stations.map(optSt => (
                                        <option key={optSt.id} value={optSt.id}>
                                          📍 {optSt.name}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const res = await resetMemberPassword(member.user_id);
                                      if (res.success && res.temporaryPassword) {
                                        setOneTimeCredential({
                                          name: member.profile?.name || 'العامل',
                                          phone: member.profile?.phone || '',
                                          temporaryPassword: res.temporaryPassword,
                                        });
                                        showToast('تم توليد كود دخول جديد للعامل', 'success');
                                      }
                                    }}
                                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition cursor-pointer"
                                    title="توليد كود دخول جديد"
                                  >
                                    <Key className="w-3.5 h-3.5 text-[#F5C84C]" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setWorkerToDelete({ id: member.user_id, name: member.profile?.name || 'العامل' })}
                                    className="btn-delete p-1.5 rounded-lg transition cursor-pointer"
                                    title="حذف العامل"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

      {/* 2. Platform Owner Panel Launcher */}
      {userRole === 'platform_owner' && onOpenPlatformOwner && (
        <div className="luxury-card rounded-[22px] p-4 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#006233] text-white flex items-center justify-center font-black shrink-0">
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">
                لوحة تحكم مالك المنصة
              </h3>
              <p className="text-[10px] text-white/75">
                إدارة وتفعيل اشتراكات جميع مدراء مساحات العمل
              </p>
            </div>
          </div>

          <button
            onClick={onOpenPlatformOwner}
            className="w-full py-2 rounded-xl font-black text-xs shadow-md active:scale-95 transition"
          >
            فتح لوحة المشرف
          </button>
        </div>
      )}

      {/* 3. Who Can See My Data - Privacy and Collaboration Button Card */}
      <div 
        onClick={onOpenPrivacyModal}
        className="luxury-card rounded-[22px] hover:border-white/30 p-4 transition cursor-pointer group active:scale-[0.99]"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#006233]/30 border border-[#006233]/50 text-[#2ECC71] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-white">
                🛡️ الخصوصية والأمان
              </h3>
              <HelpPopover text="إدارة المعرف القصير، طلبات انضمام العمال، وحماية بيانات محطتك من التسريب." />
              {pendingJoinRequestsCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-600 text-white animate-pulse">
                  {pendingJoinRequestsCount} طلب
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3.b Collapsible: رقم الهاتف والواتساب المعتمد للحساب (تغيير الرقم لحماية الحساب) */}
      <div className="luxury-card rounded-[22px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenContactSection(prev => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenContactSection(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3 className="text-sm sm:text-base font-black text-white">📞 الهاتف و Gmail</h3>
            <HelpPopover text="رقم الهاتف، الواتساب، وبريد Gmail المعتمدة لتسجيل الدخول واستعادة كلمة المرور." />
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openContactSection ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openContactSection && (
          <div className="mt-3.5 pt-3 border-t border-white/15 space-y-3 text-xs">

            {contactSuccessSummary && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div>{contactSuccessSummary}</div>
                </div>
              </div>
            )}

            {contactOtpStep === 'form' ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setContactSuccessSummary(null);
                  const cleanMail = contactEmailInput.trim().toLowerCase();
                  if (!cleanMail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanMail)) {
                    showToast('يرجى إدخال عنوان بريد إلكتروني (Gmail) صحيح', 'error');
                    return;
                  }
                  if (!contactPhoneInput.trim() || contactPhoneInput.trim().length < 8) {
                    showToast('يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)', 'error');
                    return;
                  }

                  setIsUpdatingContact(true);
                  try {
                    const otpRes = await sendRegistrationEmailOtp(cleanMail, currentUser?.name || 'مدير المحطة');
                    if (otpRes.success) {
                      setContactPreviewCode(otpRes.previewCode);
                      setContactOtpInput('');
                      setContactOtpStep('verify');
                      showToast(`تم إرسال رسالة التأكيد (كود من 6 أرقام) إلى بريدك ${cleanMail}`, 'info');
                    } else {
                      // If email server is not reachable, still allow direct update if valid
                      const res = await updateUserContactNumbers(
                        contactPhoneInput,
                        contactWhatsappInput,
                        undefined,
                        cleanMail
                      );
                      if (res.success) {
                        setContactSuccessSummary(
                          `تم تأكيد وتحديث بيانات الحساب بنجاح ✓ — الهاتف: ${contactPhoneInput.trim()} | Gmail: ${cleanMail}`
                        );
                      }
                    }
                  } finally {
                    setIsUpdatingContact(false);
                  }
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-white/90 font-bold mb-1">
                    رقم الهاتف المعتمد لتسجيل الدخول *
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactPhoneInput}
                    onChange={e => setContactPhoneInput(e.target.value)}
                    placeholder="مثال: 0612345678 أو 212612345678"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-white/90 font-bold mb-1">
                    رقم الواتساب المعتمد للحساب *
                  </label>
                  <input
                    type="tel"
                    required
                    value={contactWhatsappInput}
                    onChange={e => setContactWhatsappInput(e.target.value)}
                    placeholder="مثال: 212612345678"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="block text-white/90 font-bold mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-[#F5C84C]" />
                    <span>البريد الإلكتروني (Gmail) المعتمد للحساب *</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={contactEmailInput}
                    onChange={e => setContactEmailInput(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2.5 text-white font-mono text-xs text-left"
                    dir="ltr"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUpdatingContact}
                  className="w-full py-2.5 rounded-xl font-black text-xs shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer"
                >
                  {isUpdatingContact
                    ? 'جاري إرسال رسالة التأكيد...'
                    : 'حفظ وتحديث رقم الهاتف وبريد Gmail (مع رسالة التأكيد)'}
                </button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const cleanCode = contactOtpInput.trim();
                  if (cleanCode.length !== 6) {
                    showToast('يرجى إدخال رمز التأكيد المكون من 6 أرقام', 'error');
                    return;
                  }
                  setIsUpdatingContact(true);
                  try {
                    const cleanMail = contactEmailInput.trim().toLowerCase();
                    const verifyRes = await verifyRegistrationEmailOtp(cleanMail, cleanCode);
                    if (!verifyRes.success) {
                      showToast(verifyRes.error || 'رمز التأكيد غير صحيح', 'error');
                      return;
                    }
                    const res = await updateUserContactNumbers(
                      contactPhoneInput,
                      contactWhatsappInput,
                      undefined,
                      cleanMail
                    );
                    if (res.success) {
                      setContactOtpStep('form');
                      setContactSuccessSummary(
                        `تم تأكيد وتحديث بيانات حسابك بنجاح ✓ — رقم الهاتف: ${contactPhoneInput.trim()} | الواتساب: ${contactWhatsappInput.trim()} | بريد Gmail: ${cleanMail}`
                      );
                    }
                  } finally {
                    setIsUpdatingContact(false);
                  }
                }}
                className="p-3.5 rounded-2xl bg-black/60 border border-[#F5C84C]/40 space-y-3"
              >
                <div className="text-center space-y-1.5">
                  <div className="w-9 h-9 mx-auto rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/40 flex items-center justify-center text-[#F5C84C]">
                    <Mail className="w-4 h-4" />
                  </div>
                  <p className="font-black text-white text-xs">
                    تم إرسال رسالة التأكيد إلى بريدك الإلكتروني:
                  </p>
                  <p className="font-mono text-[#F5C84C] text-xs font-bold" dir="ltr">
                    {contactEmailInput.trim().toLowerCase()}
                  </p>
                  <p className="text-[11px] text-white/75">
                    أدخل رمز التأكيد المكون من 6 أرقام لتأكيد تغيير رقم الهاتف أو بريد Gmail المعتمد للحساب:
                  </p>
                  {contactPreviewCode && (
                    <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-[11px] font-bold">
                      رمز التأكيد الفوري: <span className="font-mono text-sm text-white">{contactPreviewCode}</span>
                    </div>
                  )}
                </div>

                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={contactOtpInput}
                    onChange={e => setContactOtpInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="• • • • • •"
                    className="w-full bg-black/80 border-2 border-[#F5C84C] rounded-xl px-3 py-2.5 text-white font-mono text-base font-black tracking-widest text-center"
                    dir="ltr"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isUpdatingContact}
                    className="flex-1 py-2.5 rounded-xl font-black text-xs shadow-md active:scale-95 transition disabled:opacity-50 cursor-pointer"
                  >
                    {isUpdatingContact ? 'جاري التأكيد والحفظ...' : 'تأكيد الرمز وحفظ التعديلات ✓'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactOtpStep('form')}
                    className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition cursor-pointer"
                  >
                    رجوع
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>

      {/* 4 & 5. تم دمج إدارة المحطات والعمال في القسم (1.5) ومعلومات وهوية مساحة العمل في قسم الخصوصية والأمان (3) لمنع التكرار */}

      {/* 5.b Collapsible: تخصيص اسم وشعار المحطة في الملصق الحراري وبونات الـ PDF (Custom Branding) */}
      <div className="luxury-card rounded-[22px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenBrandingSection(prev => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenBrandingSection(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <Store className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3 className="text-sm sm:text-base font-black text-white">
              🏷️ شعار التيكيت والـ PDF
            </h3>
            <HelpPopover text="تخصيص اسم وشعار وكالتك ليظهرا في الملصقات الحرارية (10×10) وجميع بونات الـ PDF." />
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openBrandingSection ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openBrandingSection && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (isBrandingLockedToApp) return;
              setIsSavingBranding(true);
              try {
                await updateWorkspaceBranding({
                  customBrandName: brandNameInput.trim(),
                  customBrandPhone: brandPhoneInput.trim(),
                  customBrandLogoUrl: sanitizeOfficialBrandLogo(brandLogoUrlInput),
                });
              } finally {
                setIsSavingBranding(false);
              }
            }}
            className="mt-3.5 pt-3 border-t border-white/15 space-y-3 text-xs"
          >
            {isBrandingLockedToApp ? (
              <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-[#F5C84C]/50 space-y-2.5 text-xs">
                <div className="flex items-center gap-2.5 text-[#F5C84C] font-black">
                  <img
                    src={OFFICIAL_APP_LOGO_PATH}
                    alt={OFFICIAL_APP_BRAND_NAME}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#F5C84C] shrink-0"
                  />
                  <div>
                    <div className="text-xs font-black text-white" dir="ltr">{OFFICIAL_APP_BRAND_NAME}</div>
                    <div className="text-[11px] text-[#F5C84C]">الفترة التجريبية والباك الأول (149 درهم): لوغو واسم التطبيق الرسمي ثابت في كل المطبوعات</div>
                  </div>
                </div>
                <p className="text-[11px] text-white/85 leading-relaxed">
                  في <strong>الفترة التجريبية (30 يوم)</strong> وفي <strong>الباك الأول (149 درهم)</strong> تخرج جميع الملصقات الحرارية والتقارير وجميع الـ PDF باسم التطبيق الرسمي <strong dir="ltr">{OFFICIAL_APP_BRAND_NAME}</strong> ولوغو التطبيق الرسمي المعتمد أعلاه ولا يمكن تغييرهما. لتغيير السمية والتصويرة ديال الشركة ديالك وتعميمها فالبلاصة على كلشي، قم بتفعيل <strong>الباك الثاني (299 درهم)</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (userRole === 'platform_owner') {
                      switchWorkspacePlan('plan_1_full');
                    } else {
                      onOpenPaywall();
                    }
                  }}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs cursor-pointer"
                >
                  {userRole === 'platform_owner'
                    ? '👑 تفعيل الباك الثاني (299 درهم) لفتح تخصيص اللوغو والاسم'
                    : '👑 طلب تفعيل الباك الثاني (299 درهم) لفتح تخصيص اللوغو والاسم'}
                </button>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-white/80 leading-relaxed">
                  أنت على <strong>الباك الثاني (299 درهم)</strong>: أي تغيير في اسم شركتك أو صورتها يتعمم فوراً في البلاصة على <strong>الملصقات الحرارية، التقارير، وجميع ملفات الـ PDF</strong>.
                </p>

                <div>
                  <label className="block text-white/90 font-bold mb-1">
                    اسم الشركة / الوكالة على الملصقات والتقارير والـ PDF:
                  </label>
                  <input
                    type="text"
                    value={brandNameInput}
                    onChange={e => setBrandNameInput(e.target.value)}
                    placeholder="مثال: Sahara📦 Express"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-white/90 font-bold mb-1">
                    رقم هاتف الشركة على الملصقات والتقارير:
                  </label>
                  <input
                    type="tel"
                    dir="ltr"
                    value={brandPhoneInput}
                    onChange={e => setBrandPhoneInput(e.target.value)}
                    placeholder="مثال: +212600000000"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white font-mono text-xs text-right"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-white/90 font-bold">
                    شعار (لوغو) الشركة للملصقات والتقارير وجميع الـ PDF:
                  </label>

                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/60 border border-white/15">
                    <div className="w-14 h-14 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden border border-[#F5C84C]/50">
                      <img
                        src={brandLogoUrlInput || OFFICIAL_APP_LOGO_PATH}
                        alt="شعار الشركة"
                        className="max-w-full max-h-full object-contain rounded-lg"
                      />
                    </div>

                    <div className="flex-1 space-y-1.5">
                      <label className="w-full py-2 px-3 rounded-xl bg-[#F5C84C] text-[#111111] font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition">
                        <ImagePlus className="w-4 h-4 shrink-0" />
                        <span>اختر تصويرة / شعار الشركة</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const dataUrl = ev.target?.result as string;
                              if (!dataUrl) return;
                              const img = new Image();
                              img.onload = () => {
                                const canvas = document.createElement('canvas');
                                const maxSize = 220;
                                let w = img.width;
                                let h = img.height;
                                if (w > h && w > maxSize) {
                                  h = Math.round((h * maxSize) / w);
                                  w = maxSize;
                                } else if (h >= w && h > maxSize) {
                                  w = Math.round((w * maxSize) / h);
                                  h = maxSize;
                                }
                                canvas.width = w;
                                canvas.height = h;
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                  ctx.drawImage(img, 0, 0, w, h);
                                  const compressedDataUrl = canvas.toDataURL('image/png', 0.9);
                                  setBrandLogoUrlInput(compressedDataUrl);
                                  updateWorkspaceBranding({
                                    customBrandName: brandNameInput.trim(),
                                    customBrandPhone: brandPhoneInput.trim(),
                                    customBrandLogoUrl: compressedDataUrl,
                                  }).catch(() => {});
                                }
                              };
                              img.src = dataUrl;
                            };
                            reader.readAsDataURL(file);
                            e.target.value = '';
                          }}
                        />
                      </label>

                      {brandLogoUrlInput ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBrandLogoUrlInput('');
                            updateWorkspaceBranding({
                              customBrandName: brandNameInput.trim(),
                              customBrandPhone: brandPhoneInput.trim(),
                              customBrandLogoUrl: '',
                            }).catch(() => {});
                          }}
                          className="btn-delete w-full py-1.5 px-2.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>إرجاع لوغو التطبيق الافتراضي</span>
                        </button>
                      ) : (
                        <span className="block text-[10px] text-white/70 text-center">
                          اللغو الافتراضي المعتمد هو لوغو التطبيق الرسمي حتى ترفع شعار شركتك
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSavingBranding}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs shadow-md active:scale-95 transition disabled:opacity-50"
                >
                  {isSavingBranding ? 'جاري التعميم والحفظ...' : 'حفظ وتعميم الاسم واللوغو في كل الملصقات والتقارير والـ PDF'}
                </button>
              </>
            )}
          </form>
        )}
      </div>

      {/* 6. Collapsible: تصدير ونسخ بيانات مساحة العمل */}
      <div className="luxury-card rounded-[22px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenExportSection(prev => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenExportSection(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-1.5">
            <Download className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3 className="text-sm sm:text-base font-black text-white">📥 التصدير والنسخ (PDF)</h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openExportSection ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openExportSection && (
          <div className="mt-3.5 pt-3 border-t border-white/15 grid grid-cols-1 gap-2">

            {/* Export Cash Transactions PDF */}
            <button
              onClick={() => {
                if (transactions.length === 0) {
                  showToast('لا توجد معاملات نقدية لتصديرها حالياً', 'info');
                  return;
                }
                exportService.exportTransactionsToPDF(transactions, currentWorkspace?.name || 'Sahara📦 Express');
                showToast('تم فتح وتحميل تقرير سجل الصندوق بصيغة PDF', 'success');
              }}
              className="flex items-center gap-3 p-3 rounded-xl transition text-right active:scale-95"
            >
              <Download className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold text-xs block">تقرير سجلات الصندوق والمعاملات (PDF)</span>
              </div>
            </button>

            {/* Export Parcels PDF */}
            <button
              onClick={() => {
                if (parcels.length === 0) {
                  showToast('لا توجد سجلات كوليات لتصديرها حالياً', 'info');
                  return;
                }
                exportService.exportParcelsToPDF(parcels, currentWorkspace?.name || 'Sahara📦 Express');
                showToast('تم فتح وتحميل تقرير سجلات الكوليات بصيغة PDF', 'success');
              }}
              className="flex items-center gap-3 p-3 rounded-xl transition text-right active:scale-95"
            >
              <Download className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold text-xs block">تقرير سجلات الكوليات والشحنات (PDF)</span>
              </div>
            </button>

            {/* Export Full Workspace Backup PDF */}
            <button
              onClick={() => {
                if (!currentWorkspace) {
                  showToast('تعذر تصدير النسخة الاحتياطية', 'error');
                  return;
                }
                exportService.exportFullWorkspacePDF(currentWorkspace, transactions, parcels);
                showToast('تم فتح وتحميل النسخة الاحتياطية الشاملة لبيانات مساحة العمل (PDF)', 'success');
              }}
              className="flex items-center gap-3 p-3 rounded-xl transition text-right active:scale-95"
            >
              <Download className="w-4 h-4 shrink-0" />
              <div>
                <span className="font-bold text-xs block">نسخة احتياطية شاملة لبيانات مساحة العمل (PDF)</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* 7. تغيير اللغة متاح مباشرة عبر أيقونة الكرة الأرضية 🌐 في الشريط العلوي */}

      {/* Password Reset Requests Admin Modal */}
      <ForgotPasswordModal
        isOpen={showPasswordResetAdmin}
        onClose={() => setShowPasswordResetAdmin(false)}
        isAdminView={true}
      />

      {/* 9. مسح البيانات وإرجاع التطبيق جديد (Admin Only) */}
      {(userRole === 'owner' || userRole === 'platform_owner') && (
        <div className="luxury-card rounded-[22px] p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <h3 className="text-sm font-black text-white truncate">🗑️ مسح البيانات</h3>
              <HelpPopover text="مسح كافة البيانات والتجارب وإرجاع التطبيق فارغاً من الصفر (مع خيار تحميل نسخة احتياطية PDF أولاً)." />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteDemoConfirm(true)}
            className="btn-delete px-4 py-2 rounded-xl font-black text-xs shadow-md active:scale-95 transition shrink-0 cursor-pointer"
          >
            مسح الكل
          </button>
        </div>
      )}

      {/* 10. Logout */}
      <div className="text-center pt-1">
        <button
          onClick={logout}
          className="btn-cancel w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج من الحساب</span>
        </button>
      </div>

      {/* Confirmation Dialog: مسح البيانات مع خيار النسخ الاحتياطي الاختياري */}
      {showDeleteDemoConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 animate-fadeIn">
          <div className="w-full max-w-[380px] rounded-[24px] luxury-card p-5 shadow-2xl text-right space-y-3.5 border border-rose-500/40">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">مسح البيانات وإرجاع التطبيق جديداً</h3>
                <p className="text-[10px] text-rose-300 font-bold">إعادة ضبط شاملة (صفر بيانات)</p>
              </div>
            </div>

            <p className="text-xs text-white/85 leading-relaxed">
              عند التأكيد سيتم مسح <strong className="text-white">جميع المحطات، الكوليات، الرحلات، السندات المالية، وسجل العمليات</strong> وإرجاع التطبيق جديداً فارغاً تماماً.
            </p>

            {/* Optional Backup Section before wiping */}
            <div className="bg-black/60 border border-[#F5C84C]/35 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-[#F5C84C]">
                  💾 النسخ الاحتياطي قبل المسح (اختياري):
                </span>
                <span className="text-[9px] text-white/60">إن كنت قد سجلت شيئاً مهماً</span>
              </div>
              <p className="text-[10px] text-white/75 leading-relaxed">
                إذا وضعت بيانات مهمة وتريد حفظها قبل المسح اضغط على أحد الزرين بالأسفل، وإذا كنت فقط تجرّب التطبيق ولا تريد نسخة احتياطية اضغط مباشرة على زر المسح الأحمر:
              </p>
              <div className="grid grid-cols-1 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (currentWorkspace) {
                      exportService.exportFullWorkspacePDF(currentWorkspace, transactions, parcels);
                      showToast('تم فتح وتحميل النسخة الاحتياطية الكاملة (PDF) بنجاح', 'success');
                    }
                  }}
                  className="btn-cancel w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[11px] font-black text-[#F5C84C] border border-[#F5C84C]/40"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>تحميل نسخة احتياطية شاملة (PDF) أولاً</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (transactions.length > 0) {
                      exportService.exportTransactionsToPDF(transactions, currentWorkspace?.name || 'Sahara📦 Express');
                    }
                    if (parcels.length > 0) {
                      exportService.exportParcelsToPDF(parcels, currentWorkspace?.name || 'Sahara📦 Express');
                    }
                    showToast('تم فتح وتحميل تقارير الصندوق والكوليات (PDF) بنجاح', 'success');
                  }}
                  className="btn-cancel w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-[11px] font-bold text-white/90"
                >
                  <Download className="w-3.5 h-3.5 shrink-0" />
                  <span>تحميل تقارير PDF (الصندوق + الكوليات)</span>
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setShowDeleteDemoConfirm(false)}
                className="btn-cancel px-4 py-2.5 rounded-xl text-xs font-bold"
              >
                إلغاء والرجوع
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteDemoData();
                  setShowDeleteDemoConfirm(false);
                }}
                className="btn-delete flex-1 px-4 py-2.5 rounded-xl text-xs font-black shadow-md flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>مسح جميع البيانات الآن (إرجاع التطبيق جديداً)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog: Delete Worker */}
      {workerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 animate-fadeIn">
          <div className="w-full max-w-[360px] rounded-[24px] luxury-card p-5 shadow-2xl text-right space-y-3.5">
            <div className="flex items-center gap-2.5 text-rose-400">
              <div className="w-9 h-9 rounded-xl bg-rose-950/60 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">تأكيد حذف الموظف</h3>
            </div>

            <p className="text-xs text-white/80 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف الموظف <strong className="text-white">[{workerToDelete.name}]</strong> من مساحة العمل؟
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/15">
              <button
                type="button"
                onClick={() => setWorkerToDelete(null)}
                disabled={isDeletingWorker}
                className="btn-cancel px-4 py-2 rounded-xl text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteWorker}
                disabled={isDeletingWorker}
                className="btn-delete px-5 py-2 rounded-xl text-xs font-bold shadow-md disabled:opacity-50"
              >
                {isDeletingWorker ? 'جاري الحذف...' : 'تأكيد الحذف'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
