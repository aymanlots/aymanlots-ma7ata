import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  Workspace,
  Subscription,
  PlatformActivityLog,
  Station,
  Parcel,
  Transaction,
  Trip,
} from '../types/database';
import {
  firebaseSyncService,
  CloudUserAccount,
} from '../services/firebaseSyncService';
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
  Users,
  Package,
  Truck,
  Wallet,
  Eye,
  Mail,
  UserCheck,
  Database,
  MapPin,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Key,
  Lock,
  Plus,
  Minus,
  Layers,
  Hash,
  ChevronLeft,
  ExternalLink,
} from 'lucide-react';

interface PlatformOwnerDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = 'all' | 'active' | 'expiring_soon' | 'stopped';
type MainViewTab = 'companies' | 'live_activity';
type CompanyDetailTab = 'subscription' | 'owner_security' | 'cloud_inspector' | 'admin_notes' | 'danger_zone';
type InspectorSubTab = 'stations' | 'workers' | 'parcels' | 'activity';

interface InspectedWorkspaceData {
  loading: boolean;
  stations: Station[];
  parcels: Parcel[];
  transactions: Transaction[];
  trips: Trip[];
  users: CloudUserAccount[];
  activityLogs: PlatformActivityLog[];
}

export const PlatformOwnerDashboard: React.FC<PlatformOwnerDashboardProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    userRole,
    allWorkspaces,
    allSubscriptions,
    currentWorkspace,
    updateWorkspaceSubscription,
    updateWorkspaceNotes,
    switchWorkspacePlan,
    deleteWorkspaceFromPlatform,
    refreshPlatformWorkspaces,
    showToast,
  } = useApp();

  const [mainTab, setMainTab] = useState<MainViewTab>('companies');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [companyDetailTab, setCompanyDetailTab] = useState<CompanyDetailTab>('subscription');
  const [inspectorSubTab, setInspectorSubTab] = useState<InspectorSubTab>('stations');

  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(null);

  // Exact date & custom days adjustment state
  const [customDaysInput, setCustomDaysInput] = useState<number>(30);
  const [customDateInput, setCustomDateInput] = useState<string>('');

  // Password reset state for owner
  const [newOwnerPassword, setNewOwnerPassword] = useState<string>('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Live Activity Feed across all workspaces in Firebase
  const [globalActivityLogs, setGlobalActivityLogs] = useState<PlatformActivityLog[]>([]);
  const [activityFilterWsId, setActivityFilterWsId] = useState<string>('all');

  // Per-workspace Firebase Inspector state
  const [inspectedDataMap, setInspectedDataMap] = useState<
    Record<string, InspectedWorkspaceData>
  >({});

  useEffect(() => {
    if (!isOpen || userRole !== 'platform_owner') return;
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

    // Live sync every 4 seconds while Control Panel is open so direct deletions in Firebase /users or /workspaces immediately disappear
    const syncInterval = window.setInterval(() => {
      refreshPlatformWorkspaces();
    }, 4000);

    return () => {
      unsubActivity();
      window.clearInterval(syncInterval);
    };
  }, [isOpen, userRole, refreshPlatformWorkspaces]);

  // Merge currentWorkspace if allWorkspaces is empty so the owner always sees at least their own workspace
  const mergedWorkspaces: Workspace[] = useMemo(() => {
    const list = Array.isArray(allWorkspaces) ? [...allWorkspaces] : [];
    if (currentWorkspace && !list.some((w) => w.id === currentWorkspace.id)) {
      list.unshift(currentWorkspace);
    }
    return list.sort((a, b) => {
      const tA = new Date(a.last_active_at || a.created_at || 0).getTime();
      const tB = new Date(b.last_active_at || b.created_at || 0).getTime();
      return tB - tA;
    });
  }, [allWorkspaces, currentWorkspace]);

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
    const isExpiringSoon = !isSuspended && !isExpired && daysLeft <= 7;

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

  // Selected workspace object
  const selectedWorkspace = useMemo(() => {
    if (!selectedWorkspaceId) return null;
    return mergedWorkspaces.find((w) => w.id === selectedWorkspaceId) || null;
  }, [selectedWorkspaceId, mergedWorkspaces]);

  // Load cloud inspection data when a company is selected
  useEffect(() => {
    if (selectedWorkspaceId && !inspectedDataMap[selectedWorkspaceId]) {
      loadInspectorForWorkspace(selectedWorkspaceId);
    }
    if (selectedWorkspace) {
      const info = getWorkspaceStatusInfo(selectedWorkspace);
      try {
        const d = new Date(info.endDateStr);
        setCustomDateInput(d.toISOString().split('T')[0]);
      } catch {}
    }
  }, [selectedWorkspaceId]);

  if (!isOpen || userRole !== 'platform_owner') return null;

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
    if (activityFilterWsId !== 'all' && log.workspace_id !== activityFilterWsId) {
      return false;
    }
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (log.actor_name || '').toLowerCase().includes(q) ||
      (log.workspace_name || '').toLowerCase().includes(q) ||
      (log.action_title || '').toLowerCase().includes(q) ||
      (log.details || '').toLowerCase().includes(q) ||
      (log.actor_phone || '').includes(q) ||
      (log.actor_email || '').toLowerCase().includes(q)
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
        await loadInspectorForWorkspace(selectedWorkspaceId, true);
      }
      showToast('تم تحديث جميع بيانات الشركات والنشاط من Firebase بنجاح', 'success');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadInspectorForWorkspace = async (wsId: string, forceReload = false) => {
    setInspectedDataMap((prev) => ({
      ...prev,
      [wsId]: {
        loading: true,
        stations: prev[wsId]?.stations || [],
        parcels: prev[wsId]?.parcels || [],
        transactions: prev[wsId]?.transactions || [],
        trips: prev[wsId]?.trips || [],
        users: prev[wsId]?.users || [],
        activityLogs: prev[wsId]?.activityLogs || [],
      },
    }));

    const details = await firebaseSyncService.inspectWorkspaceDetailsFromCloud(wsId);
    setInspectedDataMap((prev) => ({
      ...prev,
      [wsId]: {
        loading: false,
        ...details,
      },
    }));
  };

  // Subscription Actions: Extend by months
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

  // Subscription Actions: Extend by exact days
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

  // Subscription Actions: Decrease duration
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

  // Subscription Actions: Set exact date
  const handleSetExactDate = async (ws: Workspace) => {
    if (!customDateInput) {
      showToast('يرجى اختيار تاريخ صالح', 'error');
      return;
    }
    setBusyWorkspaceId(ws.id);
    try {
      const isoDate = new Date(customDateInput + 'T23:59:59.000Z').toISOString();
      await updateWorkspaceSubscription(ws.id, 'set_date', 0, { exactEndDate: isoDate });
      showToast(`✅ تم تعيين تاريخ انتهاء الاشتراك بدقة إلى: ${customDateInput}`, 'success');
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
      showToast(`✅ تم تفعيل حساب شركة "${ws.name}" بنجاح`, 'success');
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
      showToast(`⛔ تم تجميد وتوقيف حساب شركة "${ws.name}" في Firebase`, 'info');
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
        showToast(`تم حذف شركة "${ws.name}" وجميع بياناتها من Firebase نهائياً`, 'info');
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
      showToast('تم حفظ الملاحظات الإدارية في Firebase بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  // Securely reset owner password with bcrypt
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
      // 1. Hash password with bcrypt
      const hashedPassword = await hashPassword(cleanPwd);

      // 2. Fetch existing owner account if any
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

      // 3. Clear plain password input
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
      ? 'الباك الأول (99 درهم - محطتين)'
      : 'الباك الثاني (199 درهم - الشامل المفتوح)';

    let message = '';
    if (type === 'activated') {
      message =
        `السلام عليكم، مرحباً بكم في *Sahara Express* 🚚\n\n` +
        `✅ *تم تفعيل وتجديد اشتراك شركتكم بنجاح!*\n` +
        `• اسم الشركة: *${ws.name}* (${ws.short_id})\n` +
        `• الباقة المفعلة: *${planLabel}*\n` +
        `• صالح إلى غاية: *${endFormatted}* (${info.daysLeft} يوم متبقي)\n\n` +
        `يمكنكم الآن ولجميع عمال المحطات استخدام النظام بكامل الصلاحيات. بالتوفيق!`;
    } else if (type === 'expiring') {
      message =
        `السلام عليكم، تحية طيبة من إدارة *Sahara Express* 🚚\n\n` +
        `⏳ *تذكير بقرب انتهاء اشتراك شركتكم:*\n` +
        `• اسم الشركة: *${ws.name}* (${ws.short_id})\n` +
        `• الأيام المتبقية: *${info.daysLeft} أيام* (ينتهي يوم ${endFormatted})\n\n` +
        `لتفادي توقف الإرسال والاستقبال في المحطات، المرجو تجديد الاشتراك (99 درهم للباك الأول أو 199 درهم للباك الشامل).`;
    } else {
      message =
        `السلام عليكم، إشعار من إدارة *Sahara Express* 🚚\n\n` +
        `⛔ تم توقيف الإرسال والاستقبال مؤقتاً في حساب شركة *${ws.name}* (${ws.short_id}) بسبب انتهاء صلاحية الاشتراك.\n` +
        `بياناتكم وكولياتكم وصناديقكم محفوظة بالكامل. لإعادة التفعيل الفوري، المرجو التواصل معنا لتجديد الاشتراك.`;
    }

    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getCompanyIndex = (wsId: string) => {
    const idx = mergedWorkspaces.findIndex((w) => w.id === wsId);
    return idx >= 0 ? idx + 1 : 1;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-[#060A14]/90 backdrop-blur-xs" onClick={onClose} />

      <div
        className="w-full max-w-6xl rounded-3xl bg-[#0F172A] border border-amber-500/40 p-3.5 sm:p-6 shadow-2xl text-right overflow-hidden relative z-10 my-2 space-y-3.5 max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0 gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20 shrink-0">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-lg font-black text-white">
                  لوحة تحكم وإدارة الشركات والاشتراكات
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  <span>Firebase Firestore</span>
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black">
                  👑 Super Admin
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                كل شركة بنمرتها المستقلة — تمديد وتقليص المدة، ضبط التاريخ باليوم، تجميد الحساب، وتشفير كلمات المرور بـ bcrypt
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold transition disabled:opacity-50"
              title="تحديث البيانات من Firebase"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث السحابة</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Navigation: Companies List vs Live Activity Feed */}
        {!selectedWorkspace && (
          <div className="flex items-center gap-2 bg-[#0B1220] p-1.5 rounded-2xl border border-slate-800 shrink-0">
            <button
              type="button"
              onClick={() => setMainTab('companies')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-black text-xs transition ${
                mainTab === 'companies'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>قائمة الشركات المرتبة بالأرقام ({stats.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setMainTab('live_activity')}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-black text-xs transition ${
                mainTab === 'live_activity'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>📡 سجل النشاط المباشر العام ({globalActivityLogs.length})</span>
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 1: MASTER NUMBERED COMPANIES LIST (If NO company is currently selected) */}
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
                  <span className="text-[11px] text-slate-400 font-bold">إجمالي الشركات</span>
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
                  <span className="text-[11px] text-emerald-300 font-bold">حسابات نشطة</span>
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
                  <span className="text-[11px] text-amber-300 font-bold">قريبة الانتهاء (≤ 7 أيام)</span>
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
                  <span className="text-[11px] text-rose-300 font-bold">موقوفة ومجمدة</span>
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                </div>
                <p className="text-lg font-black text-rose-400 mt-0.5 font-mono">
                  {stats.stoppedCount}
                </p>
              </button>
            </div>

            {/* Quick Number Selector Strip */}
            {mergedWorkspaces.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 bg-[#0B1220] rounded-2xl border border-slate-800 shrink-0">
                <span className="text-[10px] text-amber-400 font-bold px-2 shrink-0">
                  ⚡ اختيار سريع بالنمرة:
                </span>
                {mergedWorkspaces.map((w, idx) => {
                  const num = idx + 1;
                  const info = getWorkspaceStatusInfo(w);
                  return (
                    <button
                      key={w.id}
                      onClick={() => setSelectedWorkspaceId(w.id)}
                      className={`px-2.5 py-1 rounded-xl text-xs font-black transition shrink-0 flex items-center gap-1 ${
                        info.isSuspended
                          ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                          : info.isExpiringSoon
                          ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30'
                          : 'bg-slate-800 text-slate-200 hover:bg-amber-500 hover:text-slate-950 border border-slate-700'
                      }`}
                      title={`${w.name} (#${num})`}
                    >
                      <Hash className="w-3 h-3 opacity-60" />
                      <span>{num}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Search Bar */}
            <div className="relative shrink-0">
              <input
                type="text"
                placeholder="ابحث بالنمرة (مثال: #1 أو #2) أو اسم الشركة، المدير، رقم الهاتف، أو البريد..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#0B1220] border border-slate-700 rounded-2xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 pl-10"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* Numbered Companies Grid */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
              {filteredWorkspaces.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs">
                  لا توجد شركات مطابقة للبحث أو الفلتر المحدد.
                </div>
              ) : (
                filteredWorkspaces.map((ws: Workspace) => {
                  const num = getCompanyIndex(ws.id);
                  const info = getWorkspaceStatusInfo(ws);
                  const isPlan2 = ws.plan_tier === 'plan_2_two_stations';
                  const isThisBusy = busyWorkspaceId === ws.id;

                  return (
                    <div
                      key={ws.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border transition flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                        info.isSuspended
                          ? 'bg-rose-950/20 border-rose-500/40 hover:border-rose-500/60'
                          : info.isExpiringSoon
                          ? 'bg-amber-950/20 border-amber-500/40 hover:border-amber-500/60'
                          : 'bg-[#0B1220] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {/* Left Side: Number Badge + Identity + Owner Contacts */}
                      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                        {/* Distinctive Number Badge */}
                        <div
                          className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-black shadow-md shrink-0 border ${
                            info.isSuspended
                              ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                              : info.isExpiringSoon
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                              : 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                          }`}
                        >
                          <span className="text-[10px] text-slate-400 font-bold leading-none">نمرة</span>
                          <span className="text-base font-black leading-tight">#{num}</span>
                        </div>

                        {/* Company Details */}
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-black text-white text-sm sm:text-base truncate">
                              {ws.name}
                            </h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 font-mono border border-slate-700">
                              {ws.short_id || 'ID'}
                            </span>
                            <span
                              className={`text-[10px] px-2.5 py-0.5 rounded-full font-black border flex items-center gap-1 ${
                                isPlan2
                                  ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              }`}
                            >
                              <Layers className="w-3 h-3" />
                              <span>{isPlan2 ? 'الباك الأول (99 درهم)' : 'الباك الثاني (199 درهم)'}</span>
                            </span>
                          </div>

                          {/* Owner details pill */}
                          <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                            <span className="flex items-center gap-1 text-slate-300 font-bold">
                              <Crown className="w-3.5 h-3.5 text-amber-400" />
                              <span>{ws.owner_name || 'المدير'}</span>
                            </span>
                            {ws.owner_phone && (
                              <span className="flex items-center gap-1 font-mono text-emerald-400">
                                <Phone className="w-3.5 h-3.5" />
                                <span>{ws.owner_phone}</span>
                              </span>
                            )}
                            {ws.owner_email && (
                              <span className="flex items-center gap-1 font-mono text-sky-400">
                                <Mail className="w-3.5 h-3.5" />
                                <span>{ws.owner_email}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Subscription status badge + Prominent Action Button */}
                      <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                        {/* Status Badge */}
                        <div className="text-right">
                          <div
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black border ${
                              info.isSuspended
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : info.isExpired
                                ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                : info.isExpiringSoon
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            }`}
                          >
                            {info.isSuspended ? (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>متوقف ومجمد</span>
                              </>
                            ) : info.isExpired ? (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>منتهي الصلاحية</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>نشط ({info.daysLeft} يوماً)</span>
                              </>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                            ينتهي: {new Date(info.endDateStr).toLocaleDateString('ar-MA')}
                          </p>
                        </div>

                        {/* ENTER COMPANY DEDICATED CONTROL BUTTON */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWorkspaceId(ws.id);
                            setCompanyDetailTab('subscription');
                          }}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition transform active:scale-95 shrink-0"
                        >
                          <span>إدارة وتحكم الشركة</span>
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
        {/* VIEW 2: DEDICATED COMPANY MANAGEMENT SUB-PAGE (When a company is selected) */}
        {/* ========================================================================= */}
        {selectedWorkspace && (
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {/* Top Navigation Bar: Back Button + Number Badge + Name + Quick Jumper */}
            <div className="bg-[#0B1220] p-3 rounded-2xl border border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedWorkspaceId(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs border border-slate-700 transition"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>الرجوع إلى قائمة الشركات</span>
                </button>

                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs shadow-md">
                    #{getCompanyIndex(selectedWorkspace.id)}
                  </div>
                  <div>
                    <h3 className="font-black text-white text-sm sm:text-base flex items-center gap-2">
                      <span>{selectedWorkspace.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-mono border border-slate-700">
                        {selectedWorkspace.short_id}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      المدير: {selectedWorkspace.owner_name || 'غير مسجل'} • الهاتف: {selectedWorkspace.owner_phone || '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Switcher between other companies */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 hidden sm:inline">تبديل الشركة:</span>
                <select
                  value={selectedWorkspace.id}
                  onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                  className="bg-[#0F172A] border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                >
                  {mergedWorkspaces.map((w, idx) => (
                    <option key={w.id} value={w.id}>
                      #{idx + 1} - {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Inner Tabs for the Selected Company */}
            <div className="flex items-center gap-1.5 bg-[#0B1220] p-1.5 rounded-2xl border border-slate-800 overflow-x-auto shrink-0">
              <button
                type="button"
                onClick={() => setCompanyDetailTab('subscription')}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition shrink-0 ${
                  companyDetailTab === 'subscription'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>الاشتراك والمدة</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanyDetailTab('owner_security')}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition shrink-0 ${
                  companyDetailTab === 'owner_security'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>المدير وأمان الدخول (bcrypt)</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanyDetailTab('cloud_inspector')}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition shrink-0 ${
                  companyDetailTab === 'cloud_inspector'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Database className="w-3.5 h-3.5" />
                <span>فحص السحابة (المحطات، العمال، الكوليات)</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanyDetailTab('admin_notes')}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition shrink-0 ${
                  companyDetailTab === 'admin_notes'
                    ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Save className="w-3.5 h-3.5" />
                <span>ملاحظات إدارية خاصة</span>
              </button>

              <button
                type="button"
                onClick={() => setCompanyDetailTab('danger_zone')}
                className={`flex items-center gap-2 py-2 px-3.5 rounded-xl font-bold text-xs transition shrink-0 ${
                  companyDetailTab === 'danger_zone'
                    ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                    : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>منطقة الخطر والحذف</span>
              </button>
            </div>

            {/* TAB CONTENT 1: SUBSCRIPTION & DURATION CONTROLS */}
            {companyDetailTab === 'subscription' && (
              <div className="space-y-4">
                {/* Status overview card */}
                {(() => {
                  const info = getWorkspaceStatusInfo(selectedWorkspace);
                  const isPlan2 = selectedWorkspace.plan_tier === 'plan_2_two_stations';
                  return (
                    <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 font-bold">الحالة الراهنة:</span>
                          <span
                            className={`px-3 py-1 rounded-xl text-xs font-black border flex items-center gap-1.5 ${
                              info.isSuspended
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : info.isExpired
                                ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                : info.isExpiringSoon
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            }`}
                          >
                            {info.isSuspended ? (
                              <>
                                <Ban className="w-3.5 h-3.5" />
                                <span>متوقف ومجمد من طرف الإدارة</span>
                              </>
                            ) : info.isExpired ? (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5" />
                                <span>منتهي الصلاحية</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>نشط ويعمل بكامل الصلاحيات</span>
                              </>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-400">
                            الأيام المتبقية: <strong className="text-white font-mono text-sm">{info.daysLeft}</strong> يوماً
                          </span>
                          <span className="text-slate-400">
                            تاريخ الانتهاء: <strong className="text-amber-400 font-mono text-sm">{new Date(info.endDateStr).toLocaleDateString('ar-MA')}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Fast Action: Suspend / Activate Toggle */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
                        <div className="text-xs text-slate-400">
                          {info.isSuspended
                            ? 'الحساب حالياً في وضع القراءة فقط. العمال لا يستطيعون تسجيل الكوليات.'
                            : 'يمكنك تجميد الحساب فوراً في أي وقت.'}
                        </div>
                        {info.isSuspended ? (
                          <button
                            type="button"
                            onClick={() => handleActivate(selectedWorkspace)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-md"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>تفعيل وإلغاء تجميد الحساب الآن (شهر كامل)</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSuspend(selectedWorkspace)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-black text-xs transition"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>تجميد وتوقيف مساحة العمل فوراً</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Subscriptions Duration Controls: Quick Extend and Quick Decrease */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Extend Duration */}
                  <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
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
                        onClick={() => handleExtendMonths(selectedWorkspace, 1, 'شهر كامل (30 يوم)')}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-emerald-300 text-xs font-black border border-emerald-500/30 transition"
                      >
                        + شهر (30 يوم)
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

                  {/* Decrease Duration */}
                  <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center gap-2 text-rose-400 font-black text-xs">
                      <Minus className="w-4 h-4" />
                      <span>تقليص وإنقاص مدة الاشتراك:</span>
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
                        onClick={() => handleDecreaseDays(selectedWorkspace, 30, 'شهر (-30 يوم)')}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-500 hover:text-white text-rose-300 text-xs font-black border border-rose-500/30 transition"
                      >
                        - شهر (-30 يوم)
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      يتم خصم الأيام مباشرة من تاريخ الانتهاء الحالي وتحديث العداد في حساب المدير فوراً.
                    </p>
                  </div>
                </div>

                {/* Exact Expiration Date Picker & Custom Days Input */}
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                    <Calendar className="w-4 h-4" />
                    <span>تحديد تاريخ الانتهاء باليوم أو عدد أيام مخصص:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Method 1: Choose Exact Date */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-bold block">
                        اختيار تاريخ الانتهاء بالتقويم:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="date"
                          value={customDateInput}
                          onChange={(e) => setCustomDateInput(e.target.value)}
                          className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 flex-1 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleSetExactDate(selectedWorkspace)}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shrink-0"
                        >
                          تطبيق التاريخ
                        </button>
                      </div>
                    </div>

                    {/* Method 2: Custom Days Number */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] text-slate-400 font-bold block">
                        إضافة عدد أيام يدوي مخصص:
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          placeholder="مثلاً: 45"
                          value={customDaysInput || ''}
                          onChange={(e) => setCustomDaysInput(Number(e.target.value))}
                          className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 flex-1 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleExtendDays(selectedWorkspace, customDaysInput, `${customDaysInput} يوماً`)}
                          disabled={!customDaysInput || customDaysInput <= 0}
                          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 font-bold text-xs border border-slate-700 transition shrink-0 disabled:opacity-50"
                        >
                          + إضافة الأيام
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Plan Tier Switcher */}
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-sky-400 font-black text-xs">
                    <Layers className="w-4 h-4" />
                    <span>تغيير باقة الشركة (الباك):</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                        selectedWorkspace.plan_tier === 'plan_2_two_stations'
                          ? 'bg-sky-500/15 border-sky-500 text-white'
                          : 'bg-[#0F172A] border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                      onClick={() => switchWorkspacePlan('plan_2_two_stations', selectedWorkspace.id)}
                    >
                      <div>
                        <h4 className="font-black text-xs text-white">الباك الأول (99 درهم)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          محطتان فقط وعامل واحد لكل محطة
                        </p>
                      </div>
                      {selectedWorkspace.plan_tier === 'plan_2_two_stations' && (
                        <CheckCircle2 className="w-5 h-5 text-sky-400 shrink-0" />
                      )}
                    </div>

                    <div
                      className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-2 ${
                        selectedWorkspace.plan_tier !== 'plan_2_two_stations'
                          ? 'bg-emerald-500/15 border-emerald-500 text-white'
                          : 'bg-[#0F172A] border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                      onClick={() => switchWorkspacePlan('plan_1_full', selectedWorkspace.id)}
                    >
                      <div>
                        <h4 className="font-black text-xs text-white">الباك الثاني (199 درهم)</h4>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          الباقة الشاملة — محطات وعمال غير محدودين
                        </p>
                      </div>
                      {selectedWorkspace.plan_tier !== 'plan_2_two_stations' && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: OWNER PROFILE & SECURITY (BCRYPT RESET) */}
            {companyDetailTab === 'owner_security' && (
              <div className="space-y-4">
                {/* Owner Identity Summary */}
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                  <h4 className="text-xs font-black text-white flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-400" />
                    <span>بيانات مدير مساحة العمل المعتمدة:</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">اسم المدير:</span>
                      <strong className="text-white font-bold text-sm">
                        {selectedWorkspace.owner_name || 'غير مسجل'}
                      </strong>
                    </div>

                    <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">رقم الهاتف / الواتساب:</span>
                      <strong className="text-emerald-400 font-mono text-sm">
                        {selectedWorkspace.owner_phone || selectedWorkspace.owner_whatsapp || '—'}
                      </strong>
                    </div>

                    <div className="bg-[#0F172A] p-3 rounded-xl border border-slate-800">
                      <span className="text-[10px] text-slate-400 block">بريد Gmail المعتمد:</span>
                      <strong className="text-sky-400 font-mono text-sm truncate block">
                        {selectedWorkspace.owner_email || '—'}
                      </strong>
                    </div>
                  </div>

                  {/* Direct WhatsApp Notifications */}
                  <div className="pt-2 border-t border-slate-800 space-y-2">
                    <span className="text-[11px] text-slate-400 font-bold block">
                      إرسال إشعار واتساب رسمي للزبون:
                    </span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => sendWhatsAppNotification(selectedWorkspace, 'activated')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-bold transition"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>رسالة تم تفعيل الاشتراك</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => sendWhatsAppNotification(selectedWorkspace, 'expiring')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>تنبيه بقرب انتهاء المدة</span>
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
                </div>

                {/* Secure Password Reset with Bcrypt */}
                <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                    <Lock className="w-4 h-4" />
                    <span>إعادة تعيين كلمة مرور المدير بأمان مشفر بـ (bcrypt):</span>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-[11px] text-amber-200/90 leading-relaxed">
                    🔒 <strong>حماية أمنية مشددة:</strong> يتم تشفير كلمة المرور فوراً عبر دالة <code>bcrypt</code> (10 Rounds) قبل إرسالها إلى قاعدة بيانات Firestore. لن يتم عرض كلمة المرور كنص صريح، ولا يمكن لأي متطفل أو مستعلم قراءتها.
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] text-slate-400 font-bold block">
                      أدخل كلمة المرور الجديدة لمدير هذه الشركة:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="أدخل كلمة المرور الجديدة (6 أحرف أو أرقام على الأقل)..."
                        value={newOwnerPassword}
                        onChange={(e) => setNewOwnerPassword(e.target.value)}
                        className="bg-[#0F172A] border border-slate-700 rounded-xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 flex-1 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleResetOwnerPassword(selectedWorkspace)}
                        disabled={isResettingPassword || !newOwnerPassword.trim()}
                        className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shrink-0 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>{isResettingPassword ? 'جارِ التشفير والحفظ...' : 'تشفير وحفظ الكلمة'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: CLOUD INSPECTOR */}
            {companyDetailTab === 'cloud_inspector' && (
              <div className="space-y-3">
                {/* Sub-tabs for inspector */}
                <div className="flex items-center gap-1.5 bg-[#0B1220] p-1 rounded-xl border border-slate-800 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setInspectorSubTab('stations')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition shrink-0 ${
                      inspectorSubTab === 'stations'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🏢 المحطات ({inspectedDataMap[selectedWorkspace.id]?.stations?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorSubTab('workers')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition shrink-0 ${
                      inspectorSubTab === 'workers'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    👥 العمال وأكواد الدخول ({inspectedDataMap[selectedWorkspace.id]?.users?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorSubTab('parcels')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition shrink-0 ${
                      inspectorSubTab === 'parcels'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    📦 الكوليات ({inspectedDataMap[selectedWorkspace.id]?.parcels?.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setInspectorSubTab('activity')}
                    className={`py-1.5 px-3 rounded-lg text-xs font-bold transition shrink-0 ${
                      inspectorSubTab === 'activity'
                        ? 'bg-slate-700 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    📡 سجل النشاط ({inspectedDataMap[selectedWorkspace.id]?.activityLogs?.length || 0})
                  </button>
                </div>

                {/* Loading state */}
                {inspectedDataMap[selectedWorkspace.id]?.loading ? (
                  <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    <span>جارِ فحص بيانات الشركة من Firebase Firestore...</span>
                  </div>
                ) : (
                  <>
                    {/* Stations */}
                    {inspectorSubTab === 'stations' && (
                      <div className="space-y-2">
                        {(!inspectedDataMap[selectedWorkspace.id]?.stations ||
                          inspectedDataMap[selectedWorkspace.id].stations.length === 0) ? (
                          <div className="p-4 text-center text-slate-500 bg-[#0B1220] rounded-xl text-xs">
                            لا توجد محطات مسجلة لهذه الشركة بعد.
                          </div>
                        ) : (
                          inspectedDataMap[selectedWorkspace.id].stations.map((st) => (
                            <div
                              key={st.id}
                              className="bg-[#0B1220] p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <h5 className="font-bold text-white flex items-center gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-amber-400" />
                                  <span>{st.name}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                                    {st.city} ({st.country})
                                  </span>
                                </h5>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                  الهاتف: {st.phone || '—'} • العنوان: {st.address || '—'}
                                </p>
                              </div>
                              <div className="text-left font-mono">
                                <span className="text-emerald-400 font-bold block">
                                  {st.balances?.MAD ?? 0} MAD
                                </span>
                                <span className="text-sky-400 text-[11px] block">
                                  {st.balances?.MRU ?? 0} MRU
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Workers & Access Codes */}
                    {inspectorSubTab === 'workers' && (
                      <div className="space-y-2">
                        {(!inspectedDataMap[selectedWorkspace.id]?.users ||
                          inspectedDataMap[selectedWorkspace.id].users.length === 0) ? (
                          <div className="p-4 text-center text-slate-500 bg-[#0B1220] rounded-xl text-xs">
                            لا يوجد عمال مسجلون لهذه الشركة.
                          </div>
                        ) : (
                          inspectedDataMap[selectedWorkspace.id].users.map((u) => (
                            <div
                              key={u.id}
                              className="bg-[#0B1220] p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                      u.role === 'owner'
                                        ? 'bg-amber-500/20 text-amber-300'
                                        : 'bg-sky-500/20 text-sky-300'
                                    }`}
                                  >
                                    {u.role === 'owner' ? '👑 مدير' : '💼 عامل محطة'}
                                  </span>
                                  <strong className="text-white font-bold">{u.name}</strong>
                                </div>
                                <p className="text-[11px] text-slate-400 font-mono">
                                  الهاتف: {u.phone || '—'} {u.email ? `• البريد: ${u.email}` : ''}
                                </p>
                              </div>

                              <div className="text-left font-mono">
                                {u.worker_code && (
                                  <span className="text-amber-300 font-bold bg-slate-800 px-2 py-0.5 rounded text-[11px] block">
                                    كود العامل: {u.worker_code}
                                  </span>
                                )}
                                <span className="text-slate-500 text-[10px] block mt-0.5">
                                  🔒 كلمة المرور مشفرة ومحمية (bcrypt)
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Parcels */}
                    {inspectorSubTab === 'parcels' && (
                      <div className="space-y-2">
                        {(!inspectedDataMap[selectedWorkspace.id]?.parcels ||
                          inspectedDataMap[selectedWorkspace.id].parcels.length === 0) ? (
                          <div className="p-4 text-center text-slate-500 bg-[#0B1220] rounded-xl text-xs">
                            لا توجد كوليات مسجلة لهذه الشركة.
                          </div>
                        ) : (
                          inspectedDataMap[selectedWorkspace.id].parcels.slice(0, 30).map((p) => (
                            <div
                              key={p.id}
                              className="bg-[#0B1220] p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <span className="font-mono text-amber-300 font-bold block">
                                  [{p.tracking_code}]
                                </span>
                                <span className="text-slate-300 text-[11px]">
                                  من: {p.sender_name} إلى: {p.receiver_name} ({p.receiver_phone})
                                </span>
                              </div>
                              <div className="text-left">
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 block">
                                  {p.status === 'delivered' ? '✅ تم التسليم' : p.status}
                                </span>
                                <span className="text-emerald-400 font-mono text-[11px] font-bold block mt-0.5">
                                  {p.amount_due} {p.currency}
                                </span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Activity Logs */}
                    {inspectorSubTab === 'activity' && (
                      <div className="space-y-2">
                        {(!inspectedDataMap[selectedWorkspace.id]?.activityLogs ||
                          inspectedDataMap[selectedWorkspace.id].activityLogs.length === 0) ? (
                          <div className="p-4 text-center text-slate-500 bg-[#0B1220] rounded-xl text-xs">
                            لا توجد أنشطة مسجلة لهذه الشركة.
                          </div>
                        ) : (
                          inspectedDataMap[selectedWorkspace.id].activityLogs.map((log) => (
                            <div
                              key={log.id}
                              className="bg-[#0B1220] p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2 text-xs"
                            >
                              <div>
                                <strong className="text-white block">{log.action_title}</strong>
                                <span className="text-[11px] text-slate-400">
                                  بواسطة: {log.actor_name} ({log.actor_role})
                                </span>
                              </div>
                              <span className="text-[10px] text-amber-400 font-mono shrink-0">
                                {formatRelativeTime(log.created_at)}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB CONTENT 4: PRIVATE ADMIN NOTES */}
            {companyDetailTab === 'admin_notes' && (
              <div className="bg-[#0B1220] p-4 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-amber-400 font-black text-xs">
                  <Save className="w-4 h-4" />
                  <span>الملاحظات والاتفاقات الإدارية الخاصة بهذه الشركة:</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  سجل هنا أي تفاصيل خاصة (مثلاً: تم استلام 199 درهم كاش بلوس، أو اتفقنا على التجديد يوم كذا...). هذه الملاحظات خاصة بـ Super Admin فقط ولا يراها الزبون.
                </p>

                <textarea
                  rows={4}
                  placeholder="اكتب ملاحظاتك الإدارية هنا..."
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
                  className="w-full bg-[#0F172A] border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleSaveNotes(selectedWorkspace.id)}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>حفظ الملاحظات في Firebase</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB CONTENT 5: DANGER ZONE (DELETE) */}
            {companyDetailTab === 'danger_zone' && (
              <div className="bg-rose-950/20 border border-rose-500/40 p-4 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-rose-400 font-black text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  <span>منطقة الخطر — الحذف النهائي من السحابة:</span>
                </div>
                <p className="text-[11px] text-rose-200/80 leading-relaxed">
                  ⚠️ <strong>تحذير لا رجعة فيه:</strong> حذف شركة <strong>"{selectedWorkspace.name}"</strong> سيقوم بمسح كافة محطاتها، كولياتها، حسابات عمالها، وسجل نشاطها بشكل نهائي من Firebase Firestore.
                </p>

                {confirmDeleteWsId === selectedWorkspace.id ? (
                  <div className="p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl space-y-2">
                    <p className="text-xs font-bold text-rose-300">
                      هل أنت متأكد تماماً من حذف هذه الشركة نهائياً من Firebase؟
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteWorkspacePermanently(selectedWorkspace)}
                        className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black text-xs transition shadow-md"
                      >
                        نعم، احذف الشركة نهائياً الآن
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWsId(null)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-xs font-bold transition"
                      >
                        إلغاء التراجع
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteWsId(selectedWorkspace.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs transition shadow-md shadow-rose-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف شركة "{selectedWorkspace.name}" نهائياً من Firebase</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: GLOBAL LIVE ACTIVITY FEED */}
        {/* ========================================================================= */}
        {!selectedWorkspace && mainTab === 'live_activity' && (
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {/* Filter by workspace */}
            <div className="flex items-center gap-2 shrink-0 bg-[#0B1220] p-2 rounded-xl border border-slate-800">
              <span className="text-[11px] text-slate-400 font-bold shrink-0">فلترة النشاط:</span>
              <select
                value={activityFilterWsId}
                onChange={(e) => setActivityFilterWsId(e.target.value)}
                className="bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500 flex-1"
              >
                <option value="all">جميع الشركات والمدراء ({mergedWorkspaces.length})</option>
                {mergedWorkspaces.map((w, idx) => (
                  <option key={w.id} value={w.id}>
                    #{idx + 1} - {w.name} ({w.short_id})
                  </option>
                ))}
              </select>
            </div>

            {filteredGlobalLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs space-y-2">
                <Activity className="w-8 h-8 text-amber-400 mx-auto opacity-75" />
                <p className="font-bold text-slate-300">
                  لا توجد حركات مسجلة في السجل المباشر حالياً.
                </p>
                <p className="text-[11px] text-slate-500">
                  بمجرد أن يقوم أي مدير أو عامل بتسجيل الدخول أو إضافة كولي أو محطة أو عامل، ستظهر عمليته هنا فوراً بالتفصيل.
                </p>
              </div>
            ) : (
              filteredGlobalLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-[#0B1220] p-3 rounded-2xl border border-slate-800 hover:border-slate-700 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                          log.action_type === 'LOGIN' || log.action_type === 'REGISTER'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : log.action_type.startsWith('PARCEL')
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        }`}
                      >
                        {log.actor_role === 'worker' ? '💼 عامل' : '👑 مدير'} • {log.actor_name}
                      </span>
                      <span className="font-bold text-white">{log.action_title}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-mono">
                        {log.workspace_name} {log.workspace_short_id ? `(${log.workspace_short_id})` : ''}
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

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between shrink-0 flex-wrap gap-2">
          <p className="text-[11px] text-slate-400">
            🔒 جميع العمليات تطبق فوراً ومباشرة في Firebase Firestore ومشفرة بنظام bcrypt.
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
          >
            إغلاق النافذة
          </button>
        </div>
      </div>
    </div>
  );
};
