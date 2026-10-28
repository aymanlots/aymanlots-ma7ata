import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
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
  FileSpreadsheet,
  FileJson,
  Wifi,
  WifiOff,
  Trash2,
  AlertTriangle,
  Smartphone,
  ChevronDown,
  ImagePlus,
  Pencil,
  Plus,
  X,
  Clock,
  CheckCircle2
} from 'lucide-react';
import { exportService } from '../services/exportService';
import { PWAInstallButton } from './PWAInstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface SettingsViewProps {
  onOpenSQLModal: () => void;
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
    addStation,
    updateStation,
    deleteStation,
    renewInviteCode, 
    logout,
    exchangeRate,
    setExchangeRate,
    updateUnclaimedDaysThreshold,
    updateUserContactNumbers,
    updateWorkspaceBranding,
    switchWorkspacePlan,
    joinRequests,
    deleteDemoData,
    daysUntilExpiry,
    subscriptionRemainingLabel,
    isSubscriptionExpired,
    extendSubscription,
    startFiveMinuteSubscriptionTest,
    showToast
  } = useApp();

  const isInFree30Days = daysUntilExpiry > 0 && !isSubscriptionExpired;
  const isPlan2TwoStations =
    !isInFree30Days &&
    (currentWorkspace?.plan_tier === 'plan_2_two_stations' ||
      currentWorkspace?.max_stations === 2 ||
      currentWorkspace?.max_workers_per_station === 1);
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

  // Station management state in Settings
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
  const [stationToDeleteId, setStationToDeleteId] = useState<string | null>(null);
  const [isSavingStation, setIsSavingStation] = useState(false);

  // Custom thermal sticker branding state
  const [brandNameInput, setBrandNameInput] = useState(
    currentWorkspace?.custom_brand_name ||
      (!currentWorkspace?.name || currentWorkspace.name === 'محطة الاتحادية'
        ? 'Sahara📦 Express'
        : currentWorkspace.name)
  );
  const [brandPhoneInput, setBrandPhoneInput] = useState(
    currentWorkspace?.custom_brand_phone || currentUser?.phone || ''
  );
  const [brandLogoUrlInput, setBrandLogoUrlInput] = useState(
    currentWorkspace?.custom_brand_logo_url || ''
  );
  const [isSavingBranding, setIsSavingBranding] = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      const defaultName =
        !currentWorkspace.name || currentWorkspace.name === 'محطة الاتحادية'
          ? 'Sahara📦 Express'
          : currentWorkspace.name;
      setBrandNameInput(currentWorkspace.custom_brand_name || defaultName);
      setBrandPhoneInput(currentWorkspace.custom_brand_phone || currentUser?.phone || '');
      setBrandLogoUrlInput(currentWorkspace.custom_brand_logo_url || '');
    }
  }, [
    currentWorkspace?.custom_brand_name,
    currentWorkspace?.custom_brand_phone,
    currentWorkspace?.custom_brand_logo_url,
    currentWorkspace?.name,
  ]);

  // Contact numbers update state
  const [contactPhoneInput, setContactPhoneInput] = useState(currentUser?.phone || '');
  const [contactWhatsappInput, setContactWhatsappInput] = useState(
    currentUser?.whatsapp_number || currentUser?.phone || ''
  );
  const [isUpdatingContact, setIsUpdatingContact] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setContactPhoneInput(currentUser.phone || '');
      setContactWhatsappInput(currentUser.whatsapp_number || currentUser.phone || '');
    }
  }, [currentUser?.phone, currentUser?.whatsapp_number]);

  useEffect(() => {
    if (initialOpenTeam) {
      setOpenTeamSection(true);
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
                  {assignedStation ? `المحطة المعين بها: ${assignedStation.name} (${assignedStation.city})` : (currentWorkspace?.name || 'محطة الاتحادية')}
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
          <div className="flex items-center gap-2.5 border-b border-white/15 pb-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0">
              <Pencil className="w-4 h-4 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">تعديل بياناتي الشخصية (الاسم ورقم الهاتف)</h3>
              <p className="text-[10px] text-white/70">
                تحديث اسمك ورقم هاتفك وسيظهران فوراً للمدير في قائمة فريق المحطة
              </p>
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

            <div className="bg-[#F5C84C]/10 border border-[#F5C84C]/30 rounded-xl p-2.5 text-[10px] text-[#F5C84C] font-bold flex items-center gap-1.5">
              <span>💡 ملاحظة: عند حفظ الاسم ورقم الهاتف، يتم تحديث بياناتك فوراً وتظهر في شاشة المدير تحت قائمة أعضاء المحطة.</span>
            </div>

            <button
              type="submit"
              disabled={isSavingWorkerProfile}
              className="w-full py-2.5 rounded-xl bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-[#111111] font-black text-xs transition active:scale-95 disabled:opacity-50 cursor-pointer shadow-md"
            >
              {isSavingWorkerProfile ? 'جاري حفظ البيانات...' : 'حفظ بياناتي الشخصية ✓'}
            </button>
          </form>
        </div>

        {/* 4. Language */}
        <div className="luxury-card rounded-[22px] p-4">
          <div className="flex items-center gap-2">
            <Languages className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3 className="text-xs font-black text-white">لغة واجهة التطبيق</h3>
          </div>
          <div className="mt-2.5 pt-2.5 border-t border-white/15">
            <div className="flex items-center gap-2 p-2 rounded-xl bg-black/60 border border-white/15 text-xs font-bold text-white">
              <span className="w-2 h-2 rounded-full bg-[#2ECC71] shrink-0"></span>
              <span>العربية الفصحى (اللغة الرسمية المعتمدة)</span>
            </div>
          </div>
        </div>

        {/* 5. Logout */}
        <div className="text-center pt-1">
          <button
            onClick={logout}
            className="btn-cancel w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>تسجيل الخروج من الحساب</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 pb-36 text-right animate-fadeIn" dir="rtl">
      
      {/* 1. Header Card */}
      <div className="luxury-card rounded-[22px] p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white">إعدادات النظام ومساحة العمل</h2>
              <p className="text-[11px] text-white/80 font-medium">
                {!currentWorkspace?.name || currentWorkspace.name === 'محطة الاتحادية'
                  ? 'Sahara📦 Express'
                  : currentWorkspace.name}
              </p>
            </div>
          </div>
          <PWAInstallButton />
        </div>

        {/* Connection status badge */}
        <div className="flex flex-wrap items-center gap-1.5">
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
            <span>قاعدة بيانات Firebase السحابية: متصلة ونشطة ⚡</span>
          </div>
        </div>

        {/* Live 30-Day Subscription Timer & Status Bar */}
        <div className="pt-2 border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-black flex-wrap">
            <Clock className={`w-4 h-4 ${isSubscriptionExpired ? 'text-rose-400' : 'text-[#F5C84C]'}`} />
            <span className="text-white/85">مدة الاشتراك (30 يوماً):</span>
            <span className={`px-2 py-0.5 rounded-lg font-mono text-[11px] border ${
              isSubscriptionExpired
                ? 'bg-rose-950/80 text-rose-300 border-rose-500/40'
                : daysUntilExpiry <= 3
                ? 'bg-amber-950/80 text-[#F5C84C] border-[#F5C84C]/50'
                : 'bg-[#F5C84C]/20 text-[#F5C84C] border-[#F5C84C]/40'
            }`}>
              {isSubscriptionExpired ? 'منتهي (متوقف عن الإضافة والإرسال)' : `متبقي ${subscriptionRemainingLabel}`}
            </span>
          </div>

          <button
            type="button"
            onClick={onOpenPaywall}
            className="px-3 py-1 rounded-xl bg-[#F5C84C] text-[#111111] text-[11px] font-black transition active:scale-95 cursor-pointer flex items-center gap-1"
          >
            <Crown className="w-3.5 h-3.5" />
            <span>تفاصيل الباقات والتجديد</span>
          </button>
        </div>
      </div>

      {/* 1.2 باقات الاشتراك والفترة التجريبية (ظاهرة بوضوح في الإعدادات) */}
      {(userRole === 'owner' || userRole === 'platform_owner') && (
        <div className="luxury-card rounded-[22px] p-4 space-y-3 border-2 border-[#F5C84C]/55 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] flex items-center justify-center shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-white">
                  باقات الاشتراك المعتمدة والفترة التجريبية
                </h3>
                <p className="text-[10px] text-[#E6C37A] font-bold">
                  الفترة التجريبية 30 يوماً مفتوحة بجميع الخصائص مع تذكير قبل 3 أيام
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-black shrink-0">
              {isPlan2TwoStations ? 'مفعل: الباك الأول (99 DH)' : 'مفعل: الباك الثاني / التجريبي (199 DH)'}
            </span>
          </div>

          {/* شريط الفترة التجريبية 30 يوماً */}
          <div className="p-3 rounded-xl bg-gradient-to-l from-emerald-950/70 via-black/70 to-amber-950/50 border border-[#F5C84C]/40 space-y-1">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-black text-[#F5C84C]">
                🎁 الفترة التجريبية: 30 يوماً مجاناً (مفتوحة بجميع الخصائص)
              </span>
              <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/30">
                🔔 تذكير تلقائي قبل 3 أيام
              </span>
            </div>
            <p className="text-[10px] text-white/85 leading-relaxed">
              تستفيد خلال الـ 30 يوماً من جميع الخصائص كاملة. وعند انتهاء الـ 30 يوماً يتوقف حساب الأدمين والعامل عن إضافة أو إرسال أو استقبال أي كولي أو سند مالي حتى التجديد.
            </p>
          </div>

          {/* بطاقتا الباك الأول (99 درهم) والباك الثاني (199 درهم) */}
          <div className="grid grid-cols-1 gap-2.5">
            {/* الباك الأول: 99 درهم */}
            <div
              onClick={() => switchWorkspacePlan('plan_2_two_stations')}
              className={`rounded-2xl p-3.5 border-2 transition cursor-pointer space-y-2 ${
                isPlan2TwoStations
                  ? 'bg-gradient-to-b from-[#2b1d05]/90 to-black/90 border-[#F5C84C] shadow-lg'
                  : 'bg-black/55 border-white/15 hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-white/15 text-white text-[10px] font-black">
                    الباك الأول
                  </span>
                  <h4 className="text-xs font-black text-white">
                    جوج محطات فقط + عامل في كل محطة
                  </h4>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-black/80 border border-[#F5C84C]/45 text-[#F5C84C] font-mono font-black text-xs shrink-0">
                  99 درهم <span className="text-[9px] font-sans text-white/70">/ شهر</span>
                </div>
              </div>
              <ul className="text-[11px] text-white/90 space-y-1 pr-1">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>فتح <strong>جوج محطات (2) فقط</strong>، وفي كل محطة <strong>عامل واحد (1) فقط</strong>.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>الملصقات والبونات تخرج باسم التطبيق (<span dir="ltr">Sahara📦 Express</span>) ولوغو التطبيق الرسمي</strong> ولا يمكن تغييرهما.</span>
                </li>
              </ul>
              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-white/70 font-bold">
                  الحد الأقصى: 2 محطات | 2 عمال
                </span>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                  isPlan2TwoStations
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-white/10 text-white/80'
                }`}>
                  {isPlan2TwoStations ? '✓ الباك المفعل حالياً' : 'اضغط لتجربة نظام الباك الأول (99 درهم)'}
                </span>
              </div>
            </div>

            {/* الباك الثاني: 199 درهم */}
            <div
              onClick={() => switchWorkspacePlan('plan_1_full')}
              className={`rounded-2xl p-3.5 border-2 transition cursor-pointer space-y-2 ${
                !isPlan2TwoStations
                  ? 'bg-gradient-to-b from-[#2b1d05]/90 to-black/90 border-[#F5C84C] shadow-lg'
                  : 'bg-black/55 border-white/15 hover:border-white/30'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full bg-[#F5C84C] text-[#111111] text-[10px] font-black">
                    👑 الباك الثاني
                  </span>
                  <h4 className="text-xs font-black text-white">
                    محطات وعمال غير محدودين + لوغو خاص بك
                  </h4>
                </div>
                <div className="px-2.5 py-1 rounded-xl bg-black/80 border border-[#F5C84C]/45 text-[#F5C84C] font-mono font-black text-xs shrink-0">
                  199 درهم <span className="text-[9px] font-sans text-white/70">/ شهر</span>
                </div>
              </div>
              <ul className="text-[11px] text-white/90 space-y-1 pr-1">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>فتح <strong>بزاف ديال المحطات (غير محدود)</strong> و<strong>بزاف ديال العمال (غير محدود)</strong> مرتبطين بأدمين واحد.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#F5C84C] shrink-0 mt-0.5" />
                  <span><strong>وضع اللوغو (الشعار) الخاص بك واسم وكالتك</strong> في جميع الملصقات الحرارية وبونات الـ PDF.</span>
                </li>
              </ul>
              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-[10px] text-[#E6C37A] font-bold">
                  مفتوح بجميع الخصائص بدون قيود
                </span>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                  !isPlan2TwoStations
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-[#F5C84C]/20 text-[#F5C84C]'
                }`}>
                  {!isPlan2TwoStations ? '✓ الباك المفعل حالياً' : 'اضغط لتفعيل نظام الباك الثاني (199 درهم)'}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenPaywall}
            className="btn-gold w-full py-2.5 rounded-xl font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
          >
            <Crown className="w-4 h-4" />
            <span>فتح نافذة الاشتراك وطلب التفعيل عبر واتساب</span>
          </button>
        </div>
      )}

      {/* 1.5 إدارة المحطات وتعديل الأسماء (الوكالة والمحطات في مكان واحد منظم) */}
      {(userRole === 'owner' || userRole === 'platform_owner') && (
        <div className="luxury-card rounded-[22px] p-4 space-y-3 border border-[#D4AF37]/40">
          <button
            type="button"
            onClick={() => setOpenStationsSection(!openStationsSection)}
            className="w-full flex items-center justify-between gap-2 text-right cursor-pointer"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-xs font-black text-white">إدارة المحطات وتعديل الأسماء ({stations.length})</h3>
                <p className="text-[10px] text-white/75">
                  تعديل اسم الوكالة أو أسماء المحطات، العملات، وإضافة أو حذف محطة
                </p>
              </div>
            </div>
            <ChevronDown
              className={`w-4 h-4 text-[#F5C84C] transition-transform duration-200 shrink-0 ${
                openStationsSection ? 'rotate-180' : ''
              }`}
            />
          </button>

          {openStationsSection && (
            <div className="space-y-3 pt-3 border-t border-white/15 animate-fadeIn">
              {/* تعديل الاسم العام للوكالة / مساحة العمل */}
              <div className="bg-black/40 border border-white/15 rounded-xl p-3 space-y-2">
                <label className="block text-[11px] font-black text-[#F5C84C]">
                  اسم الوكالة / المحطة الرئيسي (في الملصقات والبونات):
                </label>
                {isPlan2TwoStations ? (
                  <div className="p-2.5 rounded-xl bg-amber-950/50 border border-[#F5C84C]/40 text-[11px] text-[#F5C84C] font-bold flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <img
                        src="/assets/aistudio/image_9c11f636.png"
                        alt="Sahara📦 Express"
                        className="w-9 h-9 rounded-full object-cover border border-[#F5C84C] shrink-0"
                      />
                      <span>🔒 في الباك الأول (99 درهم) تخرج الملصقات والبونات باسم ولوغو التطبيق الرسمي (<strong dir="ltr">Sahara📦 Express</strong>).</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => switchWorkspacePlan('plan_1_full')}
                      className="px-2.5 py-1 rounded-lg bg-[#F5C84C] text-[#111111] text-[10px] font-black shrink-0 cursor-pointer"
                    >
                      تفعيل الباك الثاني (199 درهم)
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={brandNameInput}
                      onChange={e => setBrandNameInput(e.target.value)}
                      placeholder="مثال: محطة الاتحادية"
                      className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-black/60 border border-white/20 text-white focus:border-[#F5C84C] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={isSavingBranding || !brandNameInput.trim()}
                      onClick={async () => {
                        setIsSavingBranding(true);
                        try {
                          await updateWorkspaceBranding({
                            custom_brand_name: brandNameInput.trim(),
                            custom_brand_phone: brandPhoneInput.trim(),
                            custom_brand_logo_url: brandLogoUrlInput.trim(),
                          });
                        } finally {
                          setIsSavingBranding(false);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#F5C84C] text-[#111111] font-black text-xs shrink-0 cursor-pointer"
                    >
                      {isSavingBranding ? 'حفظ...' : 'حفظ الاسم'}
                    </button>
                  </div>
                )}
              </div>

              {/* قائمة المحطات مع تعديل الاسم أو الحذف */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-white">المحطات المسجلة ({stations.length}):</span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddStationForm(!showAddStationForm);
                      setEditingStationId(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#F5C84C] text-[#111111] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إضافة محطة</span>
                  </button>
                </div>

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
                        if (res.success) {
                          setShowAddStationForm(false);
                          setNewStName('');
                          setNewStCity('');
                          setNewStPhone('');
                        }
                      } finally {
                        setIsSavingStation(false);
                      }
                    }}
                    className="bg-black/60 border border-[#F5C84C]/50 rounded-xl p-3 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-[#F5C84C]">إضافة محطة جديدة</span>
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
                        placeholder="اسم المحطة *"
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-black/70 border border-white/20 text-white"
                      />
                      <input
                        type="text"
                        required
                        value={newStCity}
                        onChange={e => setNewStCity(e.target.value)}
                        placeholder="المدينة *"
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
                    <button
                      type="submit"
                      disabled={isSavingStation}
                      className="w-full py-2 rounded-xl bg-[#F5C84C] text-[#111111] font-black text-xs cursor-pointer"
                    >
                      {isSavingStation ? 'جاري الإضافة...' : 'تأكيد إضافة المحطة'}
                    </button>
                  </form>
                )}

                {stations.map(st => {
                  const isEditingThis = editingStationId === st.id;
                  const isConfirmingDelete = stationToDeleteId === st.id;
                  return (
                    <div
                      key={st.id}
                      className="bg-black/45 border border-white/15 rounded-xl p-3 space-y-2"
                    >
                      {!isEditingThis ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-white truncate">
                              {st.country === 'MA' ? '🇲🇦' : '🇲🇷'} {st.name}
                            </p>
                            <p className="text-[10px] text-white/70">
                              المدينة: {st.city} • العملة: {st.default_currency || (st.country === 'MR' ? 'MRU' : 'MAD')}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
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
                              className="px-2.5 py-1.5 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5C84C] text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>تعديل الاسم</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setStationToDeleteId(isConfirmingDelete ? null : st.id)}
                              className="btn-danger px-2.5 py-1.5 rounded-lg text-[11px] font-black flex items-center gap-1 cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
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
                          className="space-y-2"
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
                              حفظ التعديلات
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

                      {isConfirmingDelete && (
                        <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-rose-200">
                            تأكيد حذف محطة &quot;{st.name}&quot;؟
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteStation(st.id);
                                setStationToDeleteId(null);
                              }}
                              className="btn-danger px-2.5 py-1 rounded-lg text-[11px] font-black cursor-pointer"
                            >
                              نعم، احذف
                            </button>
                            <button
                              type="button"
                              onClick={() => setStationToDeleteId(null)}
                              className="btn-cancel px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer"
                            >
                              تراجع
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="text-xs font-black text-white">
                  من يمكنه رؤية بياناتي؟ (التحكم بالخصوصية)
                </h3>
                {pendingJoinRequestsCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-black rounded-full bg-rose-600 text-white animate-pulse">
                    {pendingJoinRequestsCount} طلب معلق
                  </span>
                )}
              </div>
              <p className="text-[10px] text-white/75 mt-0.5">
                إدارة المعرف القصير، طلبات انضمام العمال، والخصوصية
              </p>
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
          <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <span>رقم الهاتف والواتساب المعتمد للحساب</span>
          </h3>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openContactSection ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openContactSection && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setIsUpdatingContact(true);
              try {
                await updateUserContactNumbers(contactPhoneInput, contactWhatsappInput);
              } finally {
                setIsUpdatingContact(false);
              }
            }}
            className="mt-3.5 pt-3 border-t border-white/15 space-y-3 text-xs"
          >
            <p className="text-[11px] text-white/80 leading-relaxed">
              هذا الرقم هو المعتمد لتسجيل الدخول واستعادة كلمة المرور تلقائياً عبر الواتساب. في حال غيرت شريحتك أو رقم الواتساب الخاص بك، قم بتحديثه هنا حتى لا تفقد حسابك أبداً.
            </p>

            <div>
              <label className="block text-white/90 font-bold mb-1">
                رقم الهاتف المعتمد لتسجيل الدخول *
              </label>
              <input
                type="tel"
                required
                value={contactPhoneInput}
                onChange={e => setContactPhoneInput(e.target.value)}
                placeholder="مثال: 0612345678 أو 222..."
                className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2.5 text-white font-mono text-xs"
                dir="ltr"
              />
            </div>

            <div>
              <label className="block text-white/90 font-bold mb-1">
                رقم الواتساب المعتمد لاستقبال كلمة المرور عند النسيان *
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

            <button
              type="submit"
              disabled={isUpdatingContact}
              className="w-full py-2.5 rounded-xl font-black text-xs shadow-md active:scale-95 transition disabled:opacity-50"
            >
              {isUpdatingContact ? 'جاري التحديث والحفظ...' : 'حفظ وتحديث رقم الهاتف والواتساب'}
            </button>
          </form>
        )}
      </div>

      {/* 4. Collapsible: فـريق العمل المعتمد */}
      <div ref={teamSectionRef} className="luxury-card rounded-[22px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenTeamSection(prev => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenTeamSection(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
            <User className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <span>فريق العمل المعتمد ({workspaceMembers.length})</span>
          </h3>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openTeamSection ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openTeamSection && (
          <div className="mt-3.5 pt-3 border-t border-white/15 space-y-3">
            {/* Package Quota & Station/Worker Limit Banner */}
            <div className="p-3 rounded-2xl bg-black/55 border border-[#F5C84C]/35 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Crown className="w-4 h-4 text-[#F5C84C] shrink-0" />
                  <span className="font-black text-white text-[11px]">
                    {isPlan2TwoStations
                      ? 'الباك الأول (99 درهم): جوج محطات فقط + عامل في كل محطة'
                      : 'الباك الثاني (199 درهم) / التجريبي: محطات وعمال غير محدودين'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onOpenPaywall}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-black cursor-pointer"
                >
                  عرض الباقات
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
                  <span className="text-white/75">العمال بالمحطات:</span>
                  <span className="font-mono font-black text-emerald-400">
                    {activeWorkersList.length} / {isPlan2TwoStations ? '2 (عامل/محطة)' : 'غير محدود'}
                  </span>
                </div>
              </div>

              {(userRole === 'owner' || userRole === 'platform_owner') && (
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => switchWorkspacePlan('plan_2_two_stations')}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-black transition cursor-pointer ${
                      isPlan2TwoStations ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    🏪 الباك الأول (99 DH — محطتين)
                  </button>
                  <button
                    type="button"
                    onClick={() => switchWorkspacePlan('plan_1_full')}
                    className={`py-1.5 px-2 rounded-xl text-[10px] font-black transition cursor-pointer ${
                      !isPlan2TwoStations ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    👑 الباك الثاني (199 DH — مفتوح)
                  </button>
                </div>
              )}
            </div>

            {(userRole === 'owner' || userRole === 'platform_owner') && (
              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setShowPasswordResetAdmin(true)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-black flex items-center gap-1 cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>طلبات الاستعادة</span>
                  {(passwordResetRequests || []).filter(r => r.status === 'pending').length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[9px] font-black">
                      {(passwordResetRequests || []).filter(r => r.status === 'pending').length}
                    </span>
                  )}
                </button>
                {userRole === 'owner' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!showAddWorkerForm && isPlan2TwoStations) {
                        const freeStation = stations.find(
                          st => !activeWorkersList.some(w => !w.is_demo && w.station_id === st.id)
                        );
                        if (freeStation) setNewWorkerStationId(freeStation.id);
                      }
                      setShowAddWorkerForm(!showAddWorkerForm);
                    }}
                    className={`${showAddWorkerForm ? 'btn-cancel ' : ''}px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer`}
                  >
                    {showAddWorkerForm ? 'إغلاق' : '+ إضافة عامل'}
                  </button>
                )}
              </div>
            )}

            {/* One-time Temporary Password Display Box */}
            {oneTimeCredential && (
              <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/50 space-y-2 text-xs animate-fadeIn">
                <div className="flex items-center justify-between">
                  <span className="font-black text-emerald-300">
                    كلمة المرور المؤقتة لـ {oneTimeCredential.name} (تُعرض لمرة واحدة فقط):
                  </span>
                  <button
                    type="button"
                    onClick={() => setOneTimeCredential(null)}
                    className="btn-cancel px-2.5 py-1 text-[10px]"
                  >
                    إخفاء
                  </button>
                </div>
                <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-emerald-500/40">
                  <span className="font-mono text-sm font-black text-white tracking-wider" dir="ltr">
                    {oneTimeCredential.temporaryPassword}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(oneTimeCredential.temporaryPassword);
                        setCopiedTempPass(true);
                        showToast('تم نسخ كلمة المرور المؤقتة', 'success');
                        setTimeout(() => setCopiedTempPass(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded-lg font-black text-[11px] flex items-center gap-1"
                    >
                      {copiedTempPass ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedTempPass ? 'تم النسخ' : 'نسخ'}</span>
                    </button>
                    <a
                      href={`https://wa.me/${oneTimeCredential.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                        `مرحباً ${oneTimeCredential.name}، بيانات الدخول المؤقتة الخاصة بك في محطة الاتحادية:\nرقم الهاتف: ${oneTimeCredential.phone}\nكلمة المرور المؤقتة (لمرة واحدة): ${oneTimeCredential.temporaryPassword}\nسيُطلب منك تغييرها فور أول تسجيل دخول.`
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
                <p className="text-[10px] text-emerald-200">
                  * هذه الكلمة صالحة لأول تسجيل دخول فقط، وسيُلزم العامل بتعيين كلمة مرور جديدة من 8 خانات على الأقل.
                </p>
              </div>
            )}

            {/* Add Worker Form */}
            {showAddWorkerForm && userRole === 'owner' && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newWorkerName.trim() || !newWorkerPhone.trim()) {
                    showToast('يرجى إدخال اسم العامل ورقم هاتفه', 'error');
                    return;
                  }
                  setIsAddingWorker(true);
                  try {
                    const res = await addWorkerByOwner(newWorkerName.trim(), newWorkerPhone.trim(), newWorkerStationId);
                    if (res.success && res.temporaryPassword) {
                      setOneTimeCredential({
                        name: newWorkerName.trim(),
                        phone: newWorkerPhone.trim(),
                        temporaryPassword: res.temporaryPassword,
                      });
                      setNewWorkerName('');
                      setNewWorkerPhone('');
                      setShowAddWorkerForm(false);
                    } else if (res.error) {
                      showToast(res.error, 'error');
                    }
                  } finally {
                    setIsAddingWorker(false);
                  }
                }}
                className="p-3 rounded-xl bg-black/50 border border-white/15 space-y-2.5 text-xs"
              >
                <span className="font-bold text-white block">
                  إضافة حساب عامل جديد وتوليد كلمة مرور مؤقتة لمرة واحدة:
                </span>
                {isPlan2TwoStations && (
                  <p className="text-[10px] text-[#E6C37A] bg-black/50 p-2 rounded-lg border border-[#F5C84C]/30">
                    تنبيه الباك الثاني: يُسمح بعامل واحد (1) فقط في كل محطة من المحطتين المفتوحتين.
                  </p>
                )}
                <input
                  type="text"
                  required
                  placeholder="الاسم الكامل للعامل"
                  value={newWorkerName}
                  onChange={e => setNewWorkerName(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white text-xs"
                />
                <input
                  type="tel"
                  required
                  placeholder="رقم هاتف العامل (مثال: 0612345678 أو 222...)"
                  value={newWorkerPhone}
                  onChange={e => setNewWorkerPhone(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white font-mono text-xs"
                  dir="ltr"
                />
                <select
                  value={newWorkerStationId}
                  onChange={e => setNewWorkerStationId(e.target.value)}
                  className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white text-xs"
                >
                  {stations.map(st => {
                    const occupant = activeWorkersList.find(w => !w.is_demo && w.station_id === st.id);
                    return (
                      <option key={st.id} value={st.id}>
                        {st.name}
                        {isPlan2TwoStations
                          ? occupant
                            ? ` (مشغولة: ${occupant.profile?.name || 'عامل'})`
                            : ' (متاحة — 0/1 عامل)'
                          : ''}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="submit"
                  disabled={isAddingWorker}
                  className="w-full py-2 rounded-xl font-black text-xs disabled:opacity-50 shadow-md"
                >
                  {isAddingWorker ? 'جاري الإنشاء...' : 'إنشاء الحساب وتوليد كلمة المرور المؤقتة'}
                </button>
              </form>
            )}

            {workspaceMembers.length === 0 ? (
              <div className="text-center py-5 text-white/75 text-xs bg-black/50 rounded-xl border border-white/15">
                لا يوجد أعضاء آخرين في مساحة العمل حالياً.
              </div>
            ) : (
              <div className="space-y-2">
                {workspaceMembers.map(member => {
                  const assignedSt = stations.find(s => s.id === member.station_id) || stations[0];
                  return (
                    <div 
                      key={member.user_id}
                      className="bg-black/50 p-3 rounded-xl border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-black/60 border border-white/15 flex items-center justify-center font-bold text-white shrink-0">
                          {member.role === 'admin' || member.role === 'owner' ? <Crown className="w-4 h-4 text-[#F5C84C]" /> : <User className="w-4 h-4 text-[#2ECC71]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white break-words">{member.profile?.name || 'عضو الفريق'}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-black/60 text-[#F5C84C] border border-white/15">
                              {member.role === 'admin' || member.role === 'owner' ? 'مدير' : 'عامل'}
                            </span>
                            {member.role === 'worker' && assignedSt && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950/70 text-emerald-300 border border-emerald-500/35">
                                📍 {assignedSt.city || assignedSt.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-white/80 font-mono mt-0.5">
                            <span dir="ltr">{member.profile?.phone}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {userRole === 'owner' && member.role === 'worker' && (
                          <select
                            value={member.station_id || stations[0]?.id || ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                assignWorkerToStation(e.target.value, member.user_id);
                              }
                            }}
                            className="bg-black/60 border border-white/15 text-white text-[11px] font-bold rounded-xl px-2.5 py-1.5 focus:outline-none"
                          >
                            {stations.map((st) => {
                              const otherWorker = activeWorkersList.find(
                                w => w.user_id !== member.user_id && w.station_id === st.id && (!member.is_demo ? !w.is_demo : true)
                              );
                              return (
                                <option key={st.id} value={st.id}>
                                  {st.name}
                                  {isPlan2TwoStations && otherWorker ? ' (مشغولة بعامل آخر)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        )}

                        {userRole === 'owner' && member.user_id !== currentUser?.id && (
                          <>
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
                                  showToast('تم توليد كلمة مرور مؤقتة جديدة للعامل', 'success');
                                } else if (res.error) {
                                  showToast(res.error, 'error');
                                }
                              }}
                              className="p-1.5 rounded-lg transition cursor-pointer"
                              title="إعادة تعيين كلمة مرور مؤقتة لمرة واحدة"
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setWorkerToDelete({ id: member.user_id, name: member.profile?.name || 'الموظف' })}
                              className="btn-delete p-1.5 rounded-lg transition cursor-pointer"
                              title="حذف من مساحة العمل"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Collapsible: معلومات وهوية مساحة العمل */}
      <div className="luxury-card rounded-[22px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenWorkspaceInfo(prev => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenWorkspaceInfo(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <div className="flex items-center gap-1.5">
            <Store className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <h3 className="text-xs sm:text-sm font-black text-white">معلومات وهوية مساحة العمل (2)</h3>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openWorkspaceInfo ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openWorkspaceInfo && (
          <div className="mt-3.5 pt-3 border-t border-white/15 space-y-2.5">
            {/* Unique 6-character Short ID */}
            <div className="bg-black/50 p-3 rounded-xl border border-white/15 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white">المعرف القصير لمساحة العمل:</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white font-bold border border-white/15">
                  للربط مع المدراء
                </span>
              </div>
              <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-white/15">
                <span className="font-mono text-sm font-black text-white tracking-wider" dir="ltr">
                  {currentWorkspace?.short_id || '------'}
                </span>
                <button
                  onClick={handleCopyShortId}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black transition active:scale-95"
                >
                  {copiedWsId ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedWsId ? 'تم النسخ' : 'نسخ'}</span>
                </button>
              </div>
            </div>

            {/* Renewable Invite Code for Workers */}
            <div className="bg-black/50 p-3 rounded-xl border border-white/15 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-white">رمز دعوة العمال:</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 text-white font-bold border border-white/15">
                  يتطلب موافقتك
                </span>
              </div>
              <div className="flex items-center justify-between bg-black/60 p-2.5 rounded-xl border border-white/15">
                <span className="font-mono text-sm font-black text-white tracking-wider" dir="ltr">
                  {currentWorkspace?.invite_code || '--------'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopyInviteCode}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition active:scale-95"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'تم' : 'نسخ'}</span>
                  </button>
                  {userRole === 'owner' && (
                    <button
                      onClick={handleRegenerateCode}
                      disabled={isRegenerating}
                      title="تجديد الرمز عشوائياً"
                      className="p-1.5 rounded-lg transition active:scale-95 disabled:opacity-50"
                    >
                      <RotateCw className={`w-3.5 h-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
            <h3 className="text-xs sm:text-sm font-black text-white">
              تخصيص صورة الشعار والاسم في الملصقات وبونات الـ PDF
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] text-[9px] font-black">
              👑 الملصقات + PDF
            </span>
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
              if (isPlan2TwoStations) return;
              setIsSavingBranding(true);
              try {
                await updateWorkspaceBranding({
                  customBrandName: brandNameInput.trim(),
                  customBrandPhone: brandPhoneInput.trim(),
                  customBrandLogoUrl: brandLogoUrlInput.trim(),
                });
              } finally {
                setIsSavingBranding(false);
              }
            }}
            className="mt-3.5 pt-3 border-t border-white/15 space-y-3 text-xs"
          >
            {isPlan2TwoStations ? (
              <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-[#F5C84C]/50 space-y-2.5 text-xs">
                <div className="flex items-center gap-2.5 text-[#F5C84C] font-black">
                  <img
                    src="/assets/aistudio/image_9c11f636.png"
                    alt="Sahara📦 Express"
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#F5C84C] shrink-0"
                  />
                  <div>
                    <div className="text-xs font-black text-white" dir="ltr">Sahara📦 Express</div>
                    <div className="text-[11px] text-[#F5C84C]">الباك الأول (99 درهم): الملصقات والبونات تخرج باسم ولوغو التطبيق الرسمي</div>
                  </div>
                </div>
                <p className="text-[11px] text-white/85 leading-relaxed">
                  في <strong>الباك الأول (99 درهم)</strong> تخرج جميع الملصقات الحرارية وبونات الـ PDF باسم التطبيق الرسمي <strong dir="ltr">Sahara📦 Express</strong> ولوغو التطبيق الرسمي المعتمد أعلاه ولا يمكن تغييرهما. لوضع اللوغو والاسم الخاص بك في الملصقات والبونات، قم بتفعيل <strong>الباك الثاني (199 درهم)</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => switchWorkspacePlan('plan_1_full')}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs cursor-pointer"
                >
                  👑 تفعيل الباك الثاني (199 درهم) لفتح تخصيص اللوغو والاسم
                </button>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-white/80 leading-relaxed">
                  تظهر هذه البيانات (الاسم، الهاتف، وصورة الشعار المخصص) مباشرة على <strong>الملصقات الحرارية (10×10)</strong> وفي <strong>جميع بونات الـ PDF</strong> (بون الكولي، بون الصندوق، المانيفست، والحوالة).
                </p>
                {onOpenGuidedTour && (
                  <button
                    type="button"
                    onClick={onOpenGuidedTour}
                    className="btn-cancel w-full py-2 rounded-xl text-[11px] font-black text-[#F5C84C] border border-[#F5C84C]/40"
                  >
                    🧭 فتح جولة الإعداد التلقائي (المحطات ➔ الفلوس ➔ الكوليات ➔ الشعار)
                  </button>
                )}

                <div>
                  <label className="block text-white/90 font-bold mb-1">
                    اسم الوكالة / المحطة على الملصق الحراري والبونات:
                  </label>
                  <input
                    type="text"
                    value={brandNameInput}
                    onChange={e => setBrandNameInput(e.target.value)}
                    placeholder="مثال: وكالة الاتحادية السريعة"
                    className="w-full bg-black/60 border border-white/15 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>

                <div>
                  <label className="block text-white/90 font-bold mb-1">
                    رقم هاتف المحطة على الملصق (للتواصل والاستعلام):
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
                    شعار خاص لملصقات QR Code وبونات الـ PDF والمانيفست فقط (ميزة الباك الثاني 199 درهم):
                  </label>

                  {/* معاينة الشعار المخصص للمطبوعات فقط بدون المساس بصورة التطبيق الرسمية */}
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/60 border border-white/15">
                    {brandLogoUrlInput ? (
                      <div className="w-14 h-14 rounded-xl bg-white p-1 flex items-center justify-center shrink-0 overflow-hidden border border-[#F5C84C]/50">
                        <img
                          src={brandLogoUrlInput}
                          alt="شعار الملصق والبونات"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-black/70 border border-dashed border-[#F5C84C]/50 flex items-center justify-center shrink-0 text-[#F5C84C]">
                        <ImagePlus className="w-6 h-6" />
                      </div>
                    )}

                    <div className="flex-1 space-y-1.5">
                      <label className="w-full py-2 px-3 rounded-xl bg-[#F5C84C] text-[#111111] font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition">
                        <ImagePlus className="w-4 h-4 shrink-0" />
                        <span>اختر شعاراً خاصاً للملصقات والبونات</span>
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
                                  showToast('تم تحميل شعار الملصقات والبونات بنجاح — اضغط حفظ لتثبيته', 'success');
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
                          onClick={() => setBrandLogoUrlInput('')}
                          className="btn-delete w-full py-1.5 px-2.5 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف الشعار المخصص للمطبوعات</span>
                        </button>
                      ) : (
                        <span className="block text-[10px] text-white/70 text-center">
                          يظهر في ملصقات QR Code والبونات والمانيفست (صورة التطبيق الرسمية ثابتة)
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
                  {isSavingBranding ? 'جاري حفظ الهوية...' : 'حفظ هوية وشعار الملصق الحراري والبونات'}
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
          <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
            <Download className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <span>تصدير ونسخ بيانات مساحة العمل (3)</span>
          </h3>
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
                exportService.exportTransactionsToPDF(transactions, currentWorkspace?.name || 'محطة الاتحادية');
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
                exportService.exportParcelsToPDF(parcels, currentWorkspace?.name || 'محطة الاتحادية');
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

      {/* 7. Collapsible: لغة واجهة التطبيق */}
      <div className="luxury-card rounded-[22px] p-4">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpenLangSection(prev => !prev)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenLangSection(prev => !prev);
            }
          }}
          className="flex items-center justify-between gap-2 cursor-pointer select-none"
        >
          <h3 className="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
            <Languages className="w-4 h-4 text-[#F5C84C] shrink-0" />
            <span>لغة واجهة التطبيق</span>
          </h3>
          <ChevronDown
            className={`w-5 h-5 text-[#F5C84C] shrink-0 transition-transform duration-200 ${
              openLangSection ? 'rotate-180' : ''
            }`}
          />
        </div>

        {openLangSection && (
          <div className="mt-3.5 pt-3 border-t border-white/15 space-y-2.5">
            <div className="bg-black/50 p-3 rounded-xl border border-white/15 space-y-1.5">
              <span className="text-[11px] font-bold text-white/75 block">
                لغة واجهة التطبيق:
              </span>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-black/60 border border-white/15 text-xs font-bold text-white">
                <span className="w-2 h-2 rounded-full bg-[#2ECC71] shrink-0"></span>
                <span>العربية الفصحى (اللغة الرسمية المعتمدة)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Password Reset Requests Admin Modal */}
      <ForgotPasswordModal
        isOpen={showPasswordResetAdmin}
        onClose={() => setShowPasswordResetAdmin(false)}
        isAdminView={true}
      />

      {/* 9. مسح البيانات وإرجاع التطبيق جديد (Admin Only) */}
      {(userRole === 'owner' || userRole === 'platform_owner') && (
        <div className="luxury-card rounded-[22px] p-4 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">مسح البيانات (إرجاع التطبيق جديداً)</h3>
              <p className="text-[10px] text-white/75 mt-0.5">
                مسح كافة البيانات والتجارب وإرجاع التطبيق فارغاً من الصفر (مع خيار تحميل نسخة احتياطية أولاً إذا أردت)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteDemoConfirm(true)}
            className="btn-delete w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs shadow-md active:scale-95 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>مسح البيانات</span>
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
                      exportService.exportTransactionsToPDF(transactions, currentWorkspace?.name || 'محطة الاتحادية');
                    }
                    if (parcels.length > 0) {
                      exportService.exportParcelsToPDF(parcels, currentWorkspace?.name || 'محطة الاتحادية');
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
