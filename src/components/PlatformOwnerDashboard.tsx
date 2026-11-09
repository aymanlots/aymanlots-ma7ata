import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Workspace,
  Subscription,
  PlatformActivityLog,
  Station,
} from '../types/database';
import { firebaseSyncService } from '../services/firebaseSyncService';
import { hashPassword } from '../utils/security';
import {
  Crown,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Phone,
  MessageCircle,
  ShieldAlert,
  Save,
  Search,
  RefreshCw,
  Ban,
  Play,
  Send,
  Building2,
  Trash2,
  Activity,
  Mail,
  Database,
  MapPin,
  ArrowRight,
  Calendar,
  Key,
  Lock,
  Plus,
  Minus,
  Layers,
  Hash,
  ChevronLeft,
  ShieldCheck,
  LogOut,
  Edit3,
  LogIn,
} from 'lucide-react';

interface PlatformOwnerDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isEmbeddedPage?: boolean;
}

type FilterTab = 'all' | 'active' | 'expiring_soon' | 'stopped';
type MainViewTab = 'companies' | 'live_activity';
type CompanyDetailTab =
  | 'subscription'
  | 'stations_activity'
  | 'owner_security'
  | 'admin_notes'
  | 'danger_zone';
type ActivityCategoryFilter = 'all' | 'login' | 'station_open' | 'delete' | 'rename';

interface InspectedSafeWorkspaceData {
  loading: boolean;
  stations: Station[];
  activityLogs: PlatformActivityLog[];
}

export const PlatformOwnerDashboard: React.FC<PlatformOwnerDashboardProps> = ({
  isOpen,
  onClose,
  isEmbeddedPage = false,
}) => {
  const {
    userRole,
    allWorkspaces,
    allSubscriptions,
    updateWorkspaceSubscription,
    updateWorkspaceNotes,
    switchWorkspacePlan,
    deleteWorkspaceFromPlatform,
    refreshPlatformWorkspaces,
    logout,
    showToast,
  } = useApp();

  const [mainTab, setMainTab] = useState<MainViewTab>('companies');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [activityCategory, setActivityCategory] = useState<ActivityCategoryFilter>('all');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [companyDetailTab, setCompanyDetailTab] = useState<CompanyDetailTab>('subscription');

  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(null);

  // Exact date & custom days adjustment state
  const [customDaysInput, setCustomDaysInput] = useState<number>(30);
  const [customDateInput, setCustomDateInput] = useState<string>('');

  // Password reset state for manager
  const [newOwnerPassword, setNewOwnerPassword] = useState<string>('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Live Activity Feed across all workspaces in Firebase (Strictly Login, Open Station, Delete, Rename)
  const [globalActivityLogs, setGlobalActivityLogs] = useState<PlatformActivityLog[]>([]);
  const [activityFilterWsId, setActivityFilterWsId] = useState<string>('all');

  // Per-workspace safe inspection state (Only stations & allowed activity logs — NO parcels, NO workers, NO money)
  const [inspectedDataMap, setInspectedDataMap] = useState<
    Record<string, InspectedSafeWorkspaceData>
  >({});

  useEffect(() => {
    if ((!isOpen && !isEmbeddedPage) || userRole !== 'platform_owner') return;
    setIsRefreshing(true);
    Promise.all([
      refreshPlatformWorkspaces(),
      firebaseSyncService.listPlatformActivityLogs().then((logs) => {
        setGlobalActivityLogs(logs);
      }),
    ]).finally(() => {
      setIsRefreshing(false);
    });

    const unsubActivity = firebaseSyncService.subscribeToPlatformActivityLogs((logs) => {
      setGlobalActivityLogs(logs);
    });

    const syncInterval = window.setInterval(() => {
      refreshPlatformWorkspaces();
    }, 4000);

    return () => {
      unsubActivity();
      window.clearInterval(syncInterval);
    };
  }, [isOpen, isEmbeddedPage, userRole, refreshPlatformWorkspaces]);

  // Strictly separate Platform Owner account (0618961387) from Manager workspaces
  const mergedWorkspaces: Workspace[] = useMemo(() => {
    const list = Array.isArray(allWorkspaces)
      ? allWorkspaces.filter((w) => !firebaseSyncService.isMasterPlatformWorkspace(w))
      : [];
    return list.sort((a, b) => {
      const tA = new Date(a.last_active_at || a.created_at || 0).getTime();
      const tB = new Date(b.last_active_at || b.created_at || 0).getTime();
      return tB - tA;
    });
  }, [allWorkspaces]);

  const getWorkspaceStatusInfo = (ws: Workspace) => {
    const sub = allSubscriptions?.find((s: Subscription) => s.workspace_id === ws.id);
    const endDateStr =
      ws.subscription_end_date ||
      sub?.end_date ||
      (ws.created_at
        ? new Date(new Date(ws.created_at).getTime() + 30 * 86400000).toISOString()
        : new Date(Date.now() + 30 * 86400000).toISOString());

    const endMs = new Date(endDateStr).getTime();
    const diffMs = endMs - Date.now();
    const daysLeft = Math.max(0, Math.ceil(diffMs / 86400000));
    const rawStatus = ws.subscription_status || sub?.status || 'active';
    const isSuspended = rawStatus === 'suspended';
    const isExpired = !isSuspended && diffMs <= 0;
    const isExpiringSoon = !isSuspended && !isExpired && daysLeft <= 3;

    return {
      endDateStr,
      daysLeft,
      isSuspended,
      isExpired,
      isExpiringSoon,
      isActive: !isSuspended && !isExpired,
    };
  };

  const stats = useMemo(() => {
    let activeCount = 0;
    let expiringSoonCount = 0;
    let stoppedCount = 0;
    mergedWorkspaces.forEach((ws) => {
      const info = getWorkspaceStatusInfo(ws);
      if (info.isSuspended || info.isExpired) {
        stoppedCount++;
      } else {
        activeCount++;
        if (info.isExpiringSoon) expiringSoonCount++;
      }
    });
    return {
      total: mergedWorkspaces.length,
      activeCount,
      expiringSoonCount,
      stoppedCount,
    };
  }, [mergedWorkspaces, allSubscriptions]);

  const selectedWorkspace = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    return mergedWorkspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [selectedWorkspaceId, mergedWorkspaces]);

  useEffect(() => {
    if (selectedWorkspaceId && !inspectedDataMap[selectedWorkspaceId]) {
      loadSafeInspectorForWorkspace(selectedWorkspaceId);
    }
    if (selectedWorkspace) {
      const info = getWorkspaceStatusInfo(selectedWorkspace);
      try {
        const d = new Date(info.endDateStr);
        setCustomDateInput(d.toISOString().split('T')[0]);
      } catch {}
    }
  }, [selectedWorkspaceId]);

  if ((!isOpen && !isEmbeddedPage) || userRole !== 'platform_owner') return null;

  const formatRelativeTime = (isoDate?: string) => {
    if (!isoDate) return 'لا يوجد نشاط مسجل بعد';
    const diffMs = Date.now() - new Date(isoDate).getTime();
    if (isNaN(diffMs)) return '—';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'الآن (نشط حالياً 🟢)';
    if (mins < 60) return `منذ ${mins} دقيقة`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم (${new Date(isoDate).toLocaleDateString('ar-MA')})`;
  };

  const matchesActivityCategory = (log: PlatformActivityLog, cat: ActivityCategoryFilter): boolean => {
    if (!firebaseSyncService.isAllowedPlatformActivityType(log.action_type)) return false;
    if (cat === 'all') return true;
    if (cat === 'login') {
      return log.action_type === 'LOGIN' || log.action_type === 'REGISTER' || log.action_type === 'LOGOUT';
    }
    if (cat === 'station_open') {
      return log.action_type === 'STATION_CREATE';
    }
    if (cat === 'delete') {
      return log.action_type === 'STATION_DELETE';
    }
    if (cat === 'rename') {
      return (
        log.action_type === 'STATION_RENAME' ||
        log.action_type === 'BRAND_RENAME' ||
        log.action_type === 'PLAN_CHANGE' ||
        log.action_type === 'SUBSCRIPTION_UPDATE'
      );
    }
    return true;
  };

  const filteredWorkspaces = mergedWorkspaces.filter((ws: Workspace, index: number) => {
    const info = getWorkspaceStatusInfo(ws);
    if (filterTab === 'active' && !info.isActive) return false;
    if (filterTab === 'expiring_soon' && !info.isExpiringSoon) return false;
    if (filterTab === 'stopped' && !info.isSuspended && !info.isExpired) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const companyNumber = `#${index + 1}`;
    return (
      companyNumber.includes(q) ||
      (ws.name || '').toLowerCase().includes(q) ||
      (ws.owner_name || '').toLowerCase().includes(q) ||
      (ws.owner_email || '').toLowerCase().includes(q) ||
      (ws.short_id || '').toLowerCase().includes(q) ||
      (ws.owner_phone && ws.owner_phone.includes(q)) ||
      (ws.owner_whatsapp && ws.owner_whatsapp.includes(q)) ||
      (ws.admin_notes && ws.admin_notes.toLowerCase().includes(q))
    );
  });

  const filteredGlobalLogs = globalActivityLogs.filter((log) => {
    if (!matchesActivityCategory(log, activityCategory)) return false;
    if (activityFilterWsId !== 'all' && log.workspace_id !== activityFilterWsId) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (log.actor_name || '').toLowerCase().includes(q) ||
      (log.workspace_name || '').toLowerCase().includes(q) ||
      (log.action_title || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q)
    );
  });

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refreshPlatformWorkspaces(),
        firebaseSyncService.listPlatformActivityLogs().then((logs) => {
          setGlobalActivityLogs(logs);
        }),
      ]);
      if (selectedWorkspaceId) {
        await loadSafeInspectorForWorkspace(selectedWorkspaceId);
      }
      showToast('تم تحديث الاشتراكات وسجل النشاط من Firebase بنجاح', 'success');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadSafeInspectorForWorkspace = async (wsId: string) => {
    setInspectedDataMap((prev) => ({
      ...prev,
      [wsId]: {
        loading: true,
        stations: prev[wsId]?.stations || [],
        activityLogs: prev[wsId]?.activityLogs || [],
      },
    }));

    const details = await firebaseSyncService.inspectWorkspaceDetailsFromCloud(wsId);
    setInspectedDataMap((prev) => ({
      ...prev,
      [wsId]: {
        loading: false,
        stations: details.stations,
        activityLogs: details.activityLogs,
      },
    }));
  };

  // Subscription Actions
  const handleExtendMonths = async (ws: Workspace, months: number, label: string) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'extend', months);
      showToast(`✅ تم تمديد اشتراك "${ws.name}" لمدة ${label}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تمديد الاشتراك', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleExtendDays = async (ws: Workspace, days: number, label: string) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'extend', 0, { days });
      showToast(`✅ تم تمديد اشتراك "${ws.name}" لمدة ${label}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تمديد الاشتراك', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleDecreaseDays = async (ws: Workspace, days: number, label: string) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'decrease', 0, { days });
      showToast(`🔻 تم تقليص اشتراك "${ws.name}" بمقدار ${label}`, 'info');
    } catch (err: any) {
      showToast(err.message || 'تعذر تقليص الاشتراك', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleSetExactDate = async (ws: Workspace) => {
    if (!customDateInput) {
      showToast('يرجى اختيار تاريخ صالح', 'error');
      return;
    }
    setBusyWorkspaceId(ws.id);
    try {
      const isoDate = new Date(customDateInput + 'T23:59:59.000Z').toISOString();
      await updateWorkspaceSubscription(ws.id, 'set_date', 0, { exactEndDate: isoDate });
      showToast(`✅ تم تعيين تاريخ انتهاء الاشتراك إلى: ${customDateInput}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تعيين التاريخ', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleActivate = async (ws: Workspace) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'activate', 1);
      showToast(`✅ تم تفعيل اشتراك "${ws.name}" بنجاح`, 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تفعيل الحساب', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleSuspend = async (ws: Workspace) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'suspend');
      showToast(`⛔ تم توقيف حساب "${ws.name}" (وضع المشاهدة فقط)`, 'info');
    } catch (err: any) {
      showToast(err.message || 'تعذر توقيف الحساب', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleDeleteWorkspacePermanently = async (ws: Workspace) => {
    setBusyWorkspaceId(ws.id);
    try {
      const res = await deleteWorkspaceFromPlatform(ws.id);
      if (!res.success) {
        showToast(res.error || 'تعذر حذف الشركة من Firebase', 'error');
      } else {
        setConfirmDeleteWsId(null);
        setSelectedWorkspaceId(null);
        showToast(`تم حذف حساب المدير "${ws.name}" نهائياً`, 'info');
      }
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleSaveNotes = async (wsId: string) => {
    const noteText = editingNotes[wsId];
    if (noteText === undefined) return;
    setBusyWorkspaceId(wsId);
    try {
      await updateWorkspaceNotes(wsId, noteText);
      showToast('تم حفظ الملاحظات الإدارية بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleResetOwnerPassword = async (ws: Workspace) => {
    const cleanPwd = newOwnerPassword.trim();
    if (!cleanPwd || cleanPwd.length < 6) {
      showToast('كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام', 'error');
      return;
    }
    const ownerPhone = ws.owner_phone ? ws.owner_phone.replace(/[^0-9]/g, '') : '';
    if (!ownerPhone) {
      showToast('رقم هاتف المدير غير متوفر في بيانات الشركة', 'error');
      return;
    }

    setIsResettingPassword(true);
    try {
      const hashedPassword = await hashPassword(cleanPwd);
      const existing = await firebaseSyncService.getUserAccount(ownerPhone);
      await firebaseSyncService.saveUserAccount(ownerPhone, {
        ...(existing || {}),
        id: existing?.id || ws.created_by || `usr-${ownerPhone}`,
        name: existing?.name || ws.owner_name || 'مدير الشركة',
        phone: ownerPhone,
        whatsapp_number: ws.owner_whatsapp || ownerPhone,
        email: ws.owner_email || existing?.email,
        password: hashedPassword,
        role: 'owner',
        workspace_id: ws.id,
        status: 'active',
        deleted: false,
        created_at: existing?.created_at || ws.created_at || new Date().toISOString(),
      });
      setNewOwnerPassword('');
      showToast(`🔒 تم تشفير وحفظ كلمة المرور الجديدة لمدير "${ws.name}" بأمان (bcrypt)`, 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث كلمة المرور', 'error');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const formatPhoneForWhatsApp = (rawPhone?: string) => {
    if (!rawPhone) return '';
    let clean = rawPhone.replace(/[^0-9]/g, '');
    if (clean.startsWith('06') || clean.startsWith('07')) {
      clean = '212' + clean.substring(1);
    }
    return clean;
  };

  const sendWhatsAppNotification = (
    ws: Workspace,
    type: 'activated' | 'expiring' | 'suspended'
  ) => {
    const phone = formatPhoneForWhatsApp(ws.owner_whatsapp || ws.owner_phone);
    if (!phone) {
      showToast('رقم هاتف أو واتساب مدير هذه الشركة غير مسجل', 'error');
      return;
    }
    const info = getWorkspaceStatusInfo(ws);
    const endFormatted = new Date(info.endDateStr).toLocaleDateString('ar-MA');
    const isPlan2 = ws.plan_tier === 'plan_2_two_stations';
    const planLabel = isPlan2
      ? 'الباك الأول (149 درهم: 2 محطات + 2 عمال + التيكيت بسمية التطبيق)'
      : 'الباك الثاني (299 درهم: بزاف ديال المحطات والعمال + التيكيت بسميتو)';

    let message = '';
    if (type === 'activated') {
      message =
        `السلام عليكم، مرحباً بكم في *Sahara📦 Express* 🚚\n\n` +
        `✅ *تم تفعيل وتجديد اشتراككم بنجاح!*\n` +
        `• اسم الوكالة: *${ws.name}* (${ws.short_id})\n` +
        `• الباقة المفعلة: *${planLabel}*\n` +
        `• صالح إلى غاية: *${endFormatted}* (${info.daysLeft} يوم متبقي)\n\n` +
        `بالتوفيق!`;
    } else if (type === 'expiring') {
      message =
        `السلام عليكم، تحية طيبة من إدارة *Sahara📦 Express* 🚚\n\n` +
        `⏳ *تذكير بقرب انتهاء الاشتراك (متبقي ${info.daysLeft} أيام):*\n` +
        `• اسم الوكالة: *${ws.name}* (${ws.short_id})\n` +
        `• تاريخ الانتهاء: *${endFormatted}*\n\n` +
        `لتفادي تحول الحساب إلى وضع المشاهدة فقط، المرجو تجديد الاشتراك:\n` +
        `- الباك الأول: 149 درهم (2 محطات + 2 عمال + التيكيت بسمية التطبيق)\n` +
        `- الباك الثاني: 299 درهم (بزاف ديال المحطات والعمال + التيكيت بسميتك)`;
    } else {
      message =
        `السلام عليكم، إشعار من إدارة *Sahara📦 Express* 🚚\n\n` +
        `🔒 انتهت مدة اشتراك حساب *${ws.name}* (${ws.short_id}) وأصبح الحساب في *وضع المشاهدة فقط* (بياناتكم القديمة محفوظة للمشاهدة).\n` +
        `لإعادة تفعيل الإضافة والتعديل، المرجو تجديد الاشتراك (149 درهم للباك الأول أو 299 درهم للباك الثاني).`;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getCompanyIndex = (wsId: string) => {
    const idx = mergedWorkspaces.findIndex((w) => w.id === wsId);
    return idx >= 0 ? idx + 1 : 1;
  };

  const contentCard = (
    <div
      className={`w-full rounded-3xl bg-[#0F172A] border border-amber-500/40 p-3 sm:p-5 shadow-2xl text-right relative z-10 space-y-3.5 flex flex-col ${
        isEmbeddedPage ? 'min-h-[calc(100vh-76px)]' : 'max-w-5xl my-2 max-h-[95vh] overflow-hidden'
      }`}
      onClick={(e) => e.stopPropagation()}
      dir="rtl"
    >
      {/* Top Identity Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0 gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20 shrink-0">
            <Crown className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm sm:text-base font-black text-white">
                لوحة صاحب التطبيق (06 18 96 13 87)
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black">
                👑 صاحب التطبيق فقط
              </span>
            </div>
            <p className="text-[11px] text-slate-300 mt-0.5">
              الاشتراكات + سجل النشاط (شكون دخل، شكون فتح محطة، شكون مسح، شكون بدل سمية)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold transition disabled:opacity-50"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>تحديث</span>
          </button>
          {isEmbeddedPage ? (
            <button
              type="button"
              onClick={logout}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Strict Privacy & Separation Guarantee Banner */}
      <div className="p-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-2 text-[11px] text-emerald-200 shrink-0">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-emerald-300">خصوصية تامة وفصل كامل عن حسابات المدراء:</strong>{' '}
          حسابك خاص بالاشتراكات وسجل النشاط العام فقط — لا يعرض أرقام الكوليات، ولا أرقام هواتف العمال، ولا الصناديق المالية للزبناء.
        </div>
      </div>

      {/* Global Navigation: Subscriptions vs Activity Log */}
      {!selectedWorkspace && (
        <div className="flex items-center gap-2 bg-[#0B1220] p-1.5 rounded-2xl border border-slate-800 shrink-0">
          <button
            type="button"
            onClick={() => setMainTab('companies')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs transition ${
              mainTab === 'companies'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" />
            <span>💳 الاشتراكات وحسابات المدراء ({stats.total})</span>
          </button>
          <button
            type="button"
            onClick={() => setMainTab('live_activity')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs transition ${
              mainTab === 'live_activity'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-4 h-4 shrink-0" />
            <span>📡 سجل النشاط ({globalActivityLogs.length})</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 1: SUBSCRIPTIONS & MANAGERS LIST */}
      {/* ========================================================================= */}
      {!selectedWorkspace && mainTab === 'companies' && (
        <>
          {/* Summary Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`p-2.5 rounded-2xl border text-right transition ${
                filterTab === 'all'
                  ? 'bg-amber-500/15 border-amber-500 text-white'
                  : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-bold">كل المدراء</span>
                <Building2 className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-lg font-black text-white mt-0.5 font-mono">{stats.total}</p>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('active')}
              className={`p-2.5 rounded-2xl border text-right transition ${
                filterTab === 'active'
                  ? 'bg-emerald-500/15 border-emerald-500 text-white'
                  : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emerald-300 font-bold">اشتراكات نشطة</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-lg font-black text-emerald-400 mt-0.5 font-mono">
                {stats.activeCount}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('expiring_soon')}
              className={`p-2.5 rounded-2xl border text-right transition ${
                filterTab === 'expiring_soon'
                  ? 'bg-amber-500/15 border-amber-500 text-white'
                  : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-amber-300 font-bold">قريبة الانتهاء (≤ 3 أيام)</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-lg font-black text-amber-400 mt-0.5 font-mono">
                {stats.expiringSoonCount}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setFilterTab('stopped')}
              className={`p-2.5 rounded-2xl border text-right transition ${
                filterTab === 'stopped'
                  ? 'bg-rose-500/15 border-rose-500 text-white'
                  : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-rose-300 font-bold">متوقفة (مشاهدة فقط)</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-lg font-black text-rose-400 mt-0.5 font-mono">
                {stats.stoppedCount}
              </p>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative shrink-0">
            <input
              type="text"
              placeholder="ابحث باسم المدير، اسم الوكالة، رقم الهاتف، أو البريد..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B1220] border border-slate-700 rounded-2xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 pl-10"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* Numbered Managers / Subscriptions List */}
          <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
            {filteredWorkspaces.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs">
                لا توجد حسابات مدراء مسجلة مطابقة للبحث حالياً.
              </div>
            ) : (
              filteredWorkspaces.map((ws: Workspace) => {
                const num = getCompanyIndex(ws.id);
                const info = getWorkspaceStatusInfo(ws);
                const isPlan2 = ws.plan_tier === 'plan_2_two_stations';

                return (
                  <div
                    key={ws.id}
                    className={`p-3.5 rounded-2xl border transition flex flex-col gap-3 ${
                      info.isSuspended || info.isExpired
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : info.isExpiringSoon
                        ? 'bg-amber-950/20 border-amber-500/40'
                        : 'bg-[#0B1220] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center font-black shadow-md shrink-0 border ${
                            info.isSuspended || info.isExpired
                              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                              : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          }`}
                        >
                          <span className="text-[9px] text-slate-400 font-bold leading-none">نمرة</span>
                          <span className="text-sm font-black leading-tight">#{num}</span>
                        </div>

                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-black text-white text-sm truncate">
                              {ws.name}
                            </h3>
                            {ws.short_id && (
                              <span className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 font-mono border border-slate-700">
                                {ws.short_id}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-300 flex-wrap">
                            <span className="flex items-center gap-1 font-bold">
                              <Crown className="w-3.5 h-3.5 text-amber-400" />
                              <span>المدير: {ws.owner_name || 'غير مسجل'}</span>
                            </span>
                            {ws.owner_phone && (
                              <span className="flex items-center gap-1 font-mono text-emerald-400">
                                <Phone className="w-3 h-3" />
                                <span>{ws.owner_phone}</span>
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                                isPlan2
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              {isPlan2
                                ? 'الباك الأول: 149 درهم (2 محطات + 2 عمال + التيكيت بسمية التطبيق)'
                                : 'الباك الثاني: 299 درهم (بزاف ديال المحطات والعمال + التيكيت بسميتو)'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                              🏢 المحطات المفتوحة: {ws.stations_count ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status Badge */}
                      <div className="text-left shrink-0">
                        <div
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                            info.isSuspended
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : info.isExpired
                              ? 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                              : info.isExpiringSoon
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {info.isSuspended ? (
                            <span>⛔ متوقف</span>
                          ) : info.isExpired ? (
                            <span>🔒 انتهت 30 يوم (مشاهدة فقط)</span>
                          ) : (
                            <span>✅ نشط ({info.daysLeft} يوم)</span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">
                          ينتهي: {new Date(info.endDateStr).toLocaleDateString('ar-MA')}
                        </p>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-slate-400">
                        آخر نشاط: {formatRelativeTime(ws.last_active_at || ws.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedWorkspaceId(ws.id);
                          setCompanyDetailTab('subscription');
                        }}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition"
                      >
                        <span>إدارة الاشتراك والنشاط</span>
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW 2: SELECTED MANAGER SUBSCRIPTION & SAFE ACTIVITY DETAILS */}
      {/* ========================================================================= */}
      {selectedWorkspace && (
        <div className="flex-1 overflow-y-auto space-y-3.5 pr-1">
          {/* Top Navigation Bar */}
          <div className="bg-[#0B1220] p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedWorkspaceId(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 transition"
              >
                <ArrowRight className="w-4 h-4" />
                <span>رجوع للاشتراكات</span>
              </button>

              <div>
                <h3 className="font-black text-white text-sm flex items-center gap-1.5">
                  <span>#{getCompanyIndex(selectedWorkspace.id)} — {selectedWorkspace.name}</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  المدير: {selectedWorkspace.owner_name || 'غير مسجل'} • الهاتف: {selectedWorkspace.owner_phone || '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Inner Tabs for Selected Manager */}
          <div className="flex items-center gap-1.5 bg-[#0B1220] p-1.5 rounded-2xl border border-slate-800 overflow-x-auto shrink-0">
            <button
              type="button"
              onClick={() => setCompanyDetailTab('subscription')}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition shrink-0 ${
                companyDetailTab === 'subscription'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>الاشتراك والباك (149 / 299 درهم)</span>
            </button>

            <button
              type="button"
              onClick={() => setCompanyDetailTab('stations_activity')}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition shrink-0 ${
                companyDetailTab === 'stations_activity'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>المحطات المفتوحة وسجل النشاط</span>
            </button>

            <button
              type="button"
              onClick={() => setCompanyDetailTab('owner_security')}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition shrink-0 ${
                companyDetailTab === 'owner_security'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Key className="w-3.5 h-3.5" />
              <span>بيانات المدير والواتساب</span>
            </button>

            <button
              type="button"
              onClick={() => setCompanyDetailTab('admin_notes')}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition shrink-0 ${
                companyDetailTab === 'admin_notes'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Save className="w-3.5 h-3.5" />
              <span>ملاحظات الاشتراك</span>
            </button>

            <button
              type="button"
              onClick={() => setCompanyDetailTab('danger_zone')}
              className={`flex items-center gap-1.5 py-2 px-3 rounded-xl font-bold text-xs transition shrink-0 ${
                companyDetailTab === 'danger_zone'
                  ? 'bg-rose-500 text-white'
                  : 'text-rose-400 hover:text-rose-300'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف الحساب</span>
            </button>
          </div>

          {/* TAB 1: SUBSCRIPTION & PACKAGES (149 DH / 299 DH) */}
          {companyDetailTab === 'subscription' && (
            <div className="space-y-3.5">
              {(() => {
                const info = getWorkspaceStatusInfo(selectedWorkspace);
                return (
                  <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold">حالة الاشتراك:</span>
                        <span
                          className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${
                            info.isSuspended || info.isExpired
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}
                        >
                          {info.isSuspended
                            ? '⛔ متوقف (وضع المشاهدة فقط)'
                            : info.isExpired
                            ? '🔒 انتهت الـ 30 يوم (وضع المشاهدة فقط)'
                            : `✅ نشط (${info.daysLeft} يوم متبقي)`}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400">
                        تاريخ الانتهاء:{' '}
                        <strong className="text-amber-400 font-mono">
                          {new Date(info.endDateStr).toLocaleDateString('ar-MA')}
                        </strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <span className="text-[11px] text-slate-400">
                        عند انتهاء 30 يوم بدون تجديد، يتحول الحساب تلقائياً إلى وضع المشاهدة فقط بدون حذف البيانات.
                      </span>
                      {info.isSuspended || info.isExpired ? (
                        <button
                          type="button"
                          onClick={() => handleActivate(selectedWorkspace)}
                          disabled={busyWorkspaceId === selectedWorkspace.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>تفعيل الاشتراك الآن (+30 يوم)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSuspend(selectedWorkspace)}
                          disabled={busyWorkspaceId === selectedWorkspace.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-black text-xs transition"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>توقيف الحساب (وضع المشاهدة فقط)</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Package Switcher: Pack 1 (149 DH) vs Pack 2 (299 DH) */}
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                  <Layers className="w-4 h-4" />
                  <span>اختيار وتفعيل الباك لهذا المدير:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => switchWorkspacePlan('plan_2_two_stations', selectedWorkspace.id)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                      selectedWorkspace.plan_tier === 'plan_2_two_stations'
                        ? 'bg-sky-500/15 border-sky-500 text-white'
                        : 'bg-[#0F172A] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <h4 className="font-black text-xs text-white">
                        الباك الأول: 149 درهم
                      </h4>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        2 محطات + 2 عمال + التيكيت بسمية التطبيق
                      </p>
                    </div>
                    {selectedWorkspace.plan_tier === 'plan_2_two_stations' && (
                      <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                    )}
                  </div>

                  <div
                    onClick={() => switchWorkspacePlan('plan_1_full', selectedWorkspace.id)}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                      selectedWorkspace.plan_tier !== 'plan_2_two_stations'
                        ? 'bg-emerald-500/15 border-emerald-500 text-white'
                        : 'bg-[#0F172A] border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <h4 className="font-black text-xs text-white">
                        الباك الثاني: 299 درهم
                      </h4>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        بزاف ديال المحطات والعمال + التيكيت بسميتو
                      </p>
                    </div>
                    {selectedWorkspace.plan_tier !== 'plan_2_two_stations' && (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    )}
                  </div>
                </div>
              </div>

              {/* Extend & Decrease Duration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-400 font-black text-xs">
                    <Plus className="w-4 h-4" />
                    <span>تمديد وزيادة مدة الاشتراك:</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleExtendDays(selectedWorkspace, 7, '7 أيام')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      + 7 أيام
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendDays(selectedWorkspace, 15, '15 يوماً')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      + 15 يوماً
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendMonths(selectedWorkspace, 1, '30 يوماً (شهر)')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 text-xs font-black border border-emerald-500/30 transition"
                    >
                      + 30 يوم
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendMonths(selectedWorkspace, 3, '3 أشهر')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      + 3 أشهر
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendMonths(selectedWorkspace, 6, '6 أشهر')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      + 6 أشهر
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExtendMonths(selectedWorkspace, 12, 'سنة كاملة')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-amber-300 text-xs font-black border border-amber-500/30 transition"
                    >
                      + سنة كاملة
                    </button>
                  </div>
                </div>

                <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-2.5">
                  <div className="flex items-center gap-2 text-rose-400 font-black text-xs">
                    <Minus className="w-4 h-4" />
                    <span>تقليص مدة الاشتراك أو تحديد تاريخ:</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDecreaseDays(selectedWorkspace, 7, '7 أيام')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      - 7 أيام
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecreaseDays(selectedWorkspace, 15, '15 يوماً')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-200 text-xs font-bold border border-slate-700 transition"
                    >
                      - 15 يوماً
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecreaseDays(selectedWorkspace, 30, '30 يوماً')}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 hover:text-white text-rose-300 text-xs font-black border border-rose-500/30 transition"
                    >
                      - 30 يوم
                    </button>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="date"
                      value={customDateInput}
                      onChange={(e) => setCustomDateInput(e.target.value)}
                      className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white flex-1 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => handleSetExactDate(selectedWorkspace)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shrink-0"
                    >
                      تطبيق التاريخ
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OPENED STATIONS & SAFE ACTIVITY LOG (NO PARCELS, NO WORKERS, NO MONEY) */}
          {companyDetailTab === 'stations_activity' && (
            <div className="space-y-3">
              {inspectedDataMap[selectedWorkspace.id]?.loading ? (
                <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>جارِ تحميل المحطات وسجل النشاط...</span>
                </div>
              ) : (
                <>
                  {/* Stations Names & Cities Only (No cash balances) */}
                  <div className="bg-[#0B1220] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4" />
                      <span>
                        المحطات المفتوحة لدى هذا المدير (
                        {inspectedDataMap[selectedWorkspace.id]?.stations?.length || 0})
                      </span>
                    </h4>
                    {(!inspectedDataMap[selectedWorkspace.id]?.stations ||
                      inspectedDataMap[selectedWorkspace.id].stations.length === 0) ? (
                      <p className="text-xs text-slate-500 py-2">
                        لم يقم هذا المدير بفتح أي محطة بعد.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {inspectedDataMap[selectedWorkspace.id].stations.map((st) => (
                          <div
                            key={st.id}
                            className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <strong className="text-white">{st.name}</strong>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                              {st.city} ({st.country === 'MR' ? 'موريتانيا' : 'المغرب'})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Safe Activity Log for this Manager */}
                  <div className="bg-[#0B1220] p-3.5 rounded-2xl border border-slate-800 space-y-2">
                    <h4 className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                      <Activity className="w-4 h-4" />
                      <span>
                        سجل نشاط المدير (شكون دخل، شكون فتح محطة، شكون مسح، شكون بدل سمية)
                      </span>
                    </h4>
                    {(!inspectedDataMap[selectedWorkspace.id]?.activityLogs ||
                      inspectedDataMap[selectedWorkspace.id].activityLogs.length === 0) ? (
                      <p className="text-xs text-slate-500 py-2">
                        لا توجد حركات مسجلة بعد.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {inspectedDataMap[selectedWorkspace.id].activityLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-2.5 rounded-xl bg-[#0F172A] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                          >
                            <div>
                              <strong className="text-white block">{log.action_title}</strong>
                              <span className="text-[11px] text-slate-400">
                                الفاعل: {log.actor_name} ({log.actor_role === 'worker' ? 'عامل' : 'مدير'})
                              </span>
                            </div>
                            <span className="text-[10px] text-amber-400 font-mono shrink-0">
                              {formatRelativeTime(log.created_at)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: MANAGER IDENTITY, WHATSAPP & PASSWORD RESET */}
          {companyDetailTab === 'owner_security' && (
            <div className="space-y-3.5">
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                <h4 className="text-xs font-black text-white flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>بيانات المدير والتنبيه عبر واتساب:</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">اسم المدير:</span>
                    <strong className="text-white font-bold">
                      {selectedWorkspace.owner_name || 'غير مسجل'}
                    </strong>
                  </div>
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">هاتف المدير:</span>
                    <strong className="text-emerald-400 font-mono">
                      {selectedWorkspace.owner_phone || selectedWorkspace.owner_whatsapp || '—'}
                    </strong>
                  </div>
                  <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">البريد الإلكتروني:</span>
                    <strong className="text-sky-400 font-mono truncate block">
                      {selectedWorkspace.owner_email || '—'}
                    </strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => sendWhatsAppNotification(selectedWorkspace, 'activated')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>إشعار تفعيل الاشتراك</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sendWhatsAppNotification(selectedWorkspace, 'expiring')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>تذكير انتهاء 30 يوم</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => sendWhatsAppNotification(selectedWorkspace, 'suspended')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-bold transition"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>إشعار توقف الحساب</span>
                  </button>
                </div>
              </div>

              <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                  <Lock className="w-4 h-4" />
                  <span>تعيين كلمة مرور جديدة للمدير (مشفرة بـ bcrypt):</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="كلمة المرور الجديدة للمدير (6 أحرف أو أرقام على الأقل)..."
                    value={newOwnerPassword}
                    onChange={(e) => setNewOwnerPassword(e.target.value)}
                    className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white flex-1 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleResetOwnerPassword(selectedWorkspace)}
                    disabled={isResettingPassword || !newOwnerPassword.trim()}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shrink-0 disabled:opacity-50"
                  >
                    {isResettingPassword ? 'جارِ الحفظ...' : 'حفظ الكلمة'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ADMIN NOTES */}
          {companyDetailTab === 'admin_notes' && (
            <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                <Save className="w-4 h-4" />
                <span>ملاحظات خاصة بالاشتراك (لا يراها المدير):</span>
              </div>
              <textarea
                rows={4}
                placeholder="مثال: خلص الباك الأول 149 درهم أو الباك الثاني 299 درهم..."
                value={
                  editingNotes[selectedWorkspace.id] !== undefined
                    ? editingNotes[selectedWorkspace.id]
                    : selectedWorkspace.admin_notes || ''
                }
                onChange={(e) =>
                  setEditingNotes({
                    ...editingNotes,
                    [selectedWorkspace.id]: e.target.value,
                  })
                }
                className="w-full bg-[#0F172A] border border-slate-700 rounded-xl p-3 text-xs text-white"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleSaveNotes(selectedWorkspace.id)}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>حفظ الملاحظات</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 5: DELETE WORKSPACE */}
          {companyDetailTab === 'danger_zone' && (
            <div className="bg-rose-950/20 border border-rose-500/40 p-4 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-rose-400 font-black text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>حذف حساب المدير نهائياً من التطبيق:</span>
              </div>
              {confirmDeleteWsId === selectedWorkspace.id ? (
                <div className="p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-rose-300">
                    هل أنت متأكد من حذف حساب "{selectedWorkspace.name}" نهائياً؟
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkspacePermanently(selectedWorkspace)}
                      className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition"
                    >
                      نعم، احذف نهائياً
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteWsId(null)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold transition"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteWsId(selectedWorkspace.id)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف حساب "{selectedWorkspace.name}" نهائياً</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* VIEW 3: GLOBAL ACTIVITY LOG (شكون دخل، شكون فتح محطة، شكون مسح، شكون بدل سمية) */}
      {/* ========================================================================= */}
      {!selectedWorkspace && mainTab === 'live_activity' && (
        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
          {/* 4 Activity Category Filter Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setActivityCategory('all')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition ${
                activityCategory === 'all'
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-[#0B1220] text-slate-300 border-slate-800'
              }`}
            >
              الكل ({globalActivityLogs.length})
            </button>
            <button
              type="button"
              onClick={() => setActivityCategory('login')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition flex items-center justify-center gap-1 ${
                activityCategory === 'login'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-[#0B1220] text-emerald-300 border-slate-800'
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>شكون دخل</span>
            </button>
            <button
              type="button"
              onClick={() => setActivityCategory('station_open')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition flex items-center justify-center gap-1 ${
                activityCategory === 'station_open'
                  ? 'bg-sky-500 text-slate-950 border-sky-400'
                  : 'bg-[#0B1220] text-sky-300 border-slate-800'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>شكون فتح محطة</span>
            </button>
            <button
              type="button"
              onClick={() => setActivityCategory('delete')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition flex items-center justify-center gap-1 ${
                activityCategory === 'delete'
                  ? 'bg-rose-500 text-white border-rose-400'
                  : 'bg-[#0B1220] text-rose-300 border-slate-800'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>شكون مسح</span>
            </button>
            <button
              type="button"
              onClick={() => setActivityCategory('rename')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black border transition flex items-center justify-center gap-1 ${
                activityCategory === 'rename'
                  ? 'bg-amber-400 text-slate-950 border-amber-300'
                  : 'bg-[#0B1220] text-amber-300 border-slate-800'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>شكون بدل سمية</span>
            </button>
          </div>

          {/* Filter by Manager Workspace */}
          <div className="flex items-center gap-2 shrink-0 bg-[#0B1220] p-2 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 font-bold shrink-0">المدير / الوكالة:</span>
            <select
              value={activityFilterWsId}
              onChange={(e) => setActivityFilterWsId(e.target.value)}
              className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500 flex-1"
            >
              <option value="all">جميع المدراء ({mergedWorkspaces.length})</option>
              {mergedWorkspaces.map((w, idx) => (
                <option key={w.id} value={w.id}>
                  #{idx + 1} - {w.name}
                </option>
              ))}
            </select>
          </div>

          {filteredGlobalLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs space-y-1.5">
              <Activity className="w-7 h-7 text-amber-400 mx-auto opacity-75" />
              <p className="font-bold text-slate-300">
                لا توجد حركات مسجلة في هذا التصنيف حالياً.
              </p>
              <p className="text-[11px] text-slate-500">
                يعرض هذا السجل حصرياً: شكون دخل، شكون فتح محطة، شكون مسح، وشكون بدل سمية.
              </p>
            </div>
          ) : (
            filteredGlobalLogs.map((log) => (
              <div
                key={log.id}
                className="bg-[#0B1220] p-3 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black border ${
                        log.action_type === 'LOGIN' || log.action_type === 'REGISTER' || log.action_type === 'LOGOUT'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : log.action_type === 'STATION_DELETE'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : log.action_type === 'STATION_RENAME' || log.action_type === 'BRAND_RENAME'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                      }`}
                    >
                      {log.actor_role === 'worker' ? '💼 عامل' : '👑 مدير'} • {log.actor_name}
                    </span>
                    <span className="font-bold text-white">{log.action_title}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-mono">
                      {log.workspace_name}
                    </span>
                  </div>
                  {log.details && (
                    <p className="text-[11px] text-slate-400">{log.details}</p>
                  )}
                </div>
                <div className="text-left shrink-0 font-mono text-[11px] text-slate-400">
                  <div className="text-amber-300 font-bold">
                    {formatRelativeTime(log.created_at)}
                  </div>
                  <div>
                    {new Date(log.created_at).toLocaleString('ar-MA', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  if (isEmbeddedPage) {
    return <div className="w-full py-1">{contentCard}</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-[#060A14]/90 backdrop-blur-xs" onClick={onClose} />
      {contentCard}
    </div>
  );
};
