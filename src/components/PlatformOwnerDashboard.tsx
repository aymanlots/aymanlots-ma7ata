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
  ChevronDown,
  ChevronUp,
  Mail,
  UserCheck,
  Database,
  MapPin,
} from 'lucide-react';

interface PlatformOwnerDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = 'all' | 'active' | 'expiring_soon' | 'stopped';
type MainViewTab = 'companies' | 'live_activity';
type InspectorTab = 'activity' | 'users' | 'parcels' | 'stations';

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
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);
  const [confirmDeleteWsId, setConfirmDeleteWsId] = useState<string | null>(null);

  // Live Activity Feed across all workspaces in Firebase
  const [globalActivityLogs, setGlobalActivityLogs] = useState<PlatformActivityLog[]>([]);
  const [activityFilterWsId, setActivityFilterWsId] = useState<string>('all');

  // Per-workspace Firebase Inspector state
  const [expandedWsId, setExpandedWsId] = useState<string | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('activity');
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

    return () => {
      unsubActivity();
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

  const filteredWorkspaces = mergedWorkspaces.filter((ws: Workspace) => {
    const info = getWorkspaceStatusInfo(ws);
    if (filterTab === 'active' && !info.isActive) return false;
    if (filterTab === 'expiring_soon' && !info.isExpiringSoon) return false;
    if (filterTab === 'stopped' && !info.isSuspended && !info.isExpired) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
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
      if (expandedWsId) {
        await loadInspectorForWorkspace(expandedWsId, true);
      }
      showToast('تم تحديث جميع الشركات وسجل النشاط من Firebase Firestore بنجاح', 'success');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadInspectorForWorkspace = async (wsId: string, forceReload = false) => {
    if (!forceReload && expandedWsId === wsId) {
      setExpandedWsId(null);
      return;
    }
    setExpandedWsId(wsId);
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

  const handleExtend = async (ws: Workspace, months: number, label: string) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'extend', months);
      showToast(`✅ تم تفعيل وتمديد حساب "${ws.name}" لمدة ${label}`, 'success');
    } catch (err: any) {
      showToast(err.message || 'تعذر تحديث الاشتراك', 'error');
    } finally {
      setBusyWorkspaceId(null);
    }
  };

  const handleActivate = async (ws: Workspace) => {
    setBusyWorkspaceId(ws.id);
    try {
      await updateWorkspaceSubscription(ws.id, 'activate', 1);
      showToast(`✅ تم تفعيل حساب شركة "${ws.name}" لمدة شهر كامل`, 'success');
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
      showToast(`⛔ تم توقيف حساب شركة "${ws.name}" فوراً في Firebase (القراءة فقط)`, 'info');
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
        if (expandedWsId === ws.id) setExpandedWsId(null);
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
        `• صالح إلى غاية: *${endFormatted}* (${info.daysLeft} يوم)\n\n` +
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
                  لوحة تحكم Firebase وإدارة اشتراكات الشركات
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black flex items-center gap-1">
                  <Database className="w-3 h-3" />
                  <span>مربوطة مباشرة مع Firebase Firestore</span>
                </span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black">
                  🔒 خاصة بحسابك فقط
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                مراقبة من دخل للتطبيق، اسم ورقم وإيميل كل مدير، تتبع العمليات المباشرة، تفعيل/توقيف الاشتراكات، أو مسح أي شركة نهائياً من Firebase
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
              <span className="hidden sm:inline">تحديث من Firebase</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Navigation Tabs: Companies vs Global Live Activity */}
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
            <span>الشركات والمدراء في Firebase ({stats.total})</span>
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
            <span>📡 سجل النشاط المباشر — شكون دخل وشنو دار ({globalActivityLogs.length})</span>
          </button>
        </div>

        {/* Summary Counters (when on Companies tab) */}
        {mainTab === 'companies' && (
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
                <span className="text-[11px] text-emerald-300 font-bold">حسابات مفعلة ونشطة</span>
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
                <span className="text-[11px] text-rose-300 font-bold">موقوفة / منتهية</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <p className="text-lg font-black text-rose-400 mt-0.5 font-mono">
                {stats.stoppedCount}
              </p>
            </button>
          </div>
        )}

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="ابحث باسم المدير، اسم الشركة، البريد Gmail، رقم الهاتف، أو الكود..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#0B1220] border border-slate-700 rounded-2xl px-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 pl-10"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          {mainTab === 'live_activity' && (
            <select
              value={activityFilterWsId}
              onChange={(e) => setActivityFilterWsId(e.target.value)}
              className="bg-[#0B1220] border border-slate-700 rounded-2xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="all">جميع الشركات والمدراء ({mergedWorkspaces.length})</option>
              {mergedWorkspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.short_id})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* CONTENT AREA */}
        {mainTab === 'live_activity' ? (
          /* TAB 2: GLOBAL LIVE ACTIVITY STREAM */
          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
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
        ) : (
          /* TAB 1: COMPANIES & ADMINS IN FIREBASE */
          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {filteredWorkspaces.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs">
                لا توجد شركات مطابقة للفلتر أو البحث الحالي.
              </div>
            ) : (
              filteredWorkspaces.map((ws: Workspace) => {
                const info = getWorkspaceStatusInfo(ws);
                const isWsPlan2 =
                  ws.plan_tier === 'plan_2_two_stations' ||
                  ws.max_stations === 2 ||
                  ws.max_workers_per_station === 1;
                const isBusy = busyWorkspaceId === ws.id;
                const isMyCurrentWs = currentWorkspace?.id === ws.id;
                const isExpanded = expandedWsId === ws.id;
                const inspected = inspectedDataMap[ws.id];

                return (
                  <div
                    key={ws.id}
                    className={`bg-[#0B1220] p-4 rounded-3xl border space-y-3 text-xs transition ${
                      info.isSuspended
                        ? 'border-rose-500/40'
                        : info.isExpired
                        ? 'border-amber-500/40'
                        : isExpanded
                        ? 'border-amber-500/60'
                        : 'border-slate-800'
                    }`}
                  >
                    {/* Top line: Name, Short ID, Status */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-white text-sm sm:text-base">
                          {ws.name}
                        </span>
                        <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                          {ws.short_id}
                        </span>
                        {isMyCurrentWs && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 font-black">
                            حسابك الرئيسي
                          </span>
                        )}
                        <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-amber-500/30 font-bold">
                          {isWsPlan2
                            ? '🏪 الباك الأول (99 درهم — محطتين)'
                            : '👑 الباك الثاني (199 درهم — شامل مفتوح)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[11px] px-3 py-1 rounded-full font-black flex items-center gap-1.5 ${
                            info.isSuspended
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : info.isExpired
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          }`}
                        >
                          {info.isSuspended ? (
                            <>
                              <Ban className="w-3.5 h-3.5" />
                              <span>حساب موقوف</span>
                            </>
                          ) : info.isExpired ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>منتهي الصلاحية</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>مفعل ونشط ({info.daysLeft} يوم متبقي)</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Manager Identity & Live Last Activity Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                        <span className="flex items-center gap-1">
                          <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                          <span>اسم المدير:</span>
                        </span>
                        <span className="text-white font-black truncate max-w-[150px]">
                          {ws.owner_name || ws.name.replace('Sahara📦 Express - ', '') || 'مدير المحطة'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-emerald-400" />
                          <span>هاتف المدير:</span>
                        </span>
                        <span className="font-mono text-white font-bold" dir="ltr">
                          {ws.owner_phone || ws.owner_whatsapp || 'غير مسجل'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                        <span className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-sky-400" />
                          <span>البريد:</span>
                        </span>
                        <span
                          className="font-mono text-slate-200 truncate max-w-[160px]"
                          dir="ltr"
                          title={ws.owner_email || ''}
                        >
                          {ws.owner_email || '—'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                        <span>نهاية الاشتراك:</span>
                        <span className="font-mono text-amber-300 font-black" dir="ltr">
                          {new Date(info.endDateStr).toLocaleDateString('ar-MA')}
                        </span>
                      </div>
                    </div>

                    {/* Live Firebase Stats & Last Action Bar */}
                    <div className="bg-[#0F172A] p-2.5 rounded-2xl border border-slate-800/90 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-black text-slate-300 flex items-center gap-1">
                          <Database className="w-3.5 h-3.5 text-amber-400" />
                          <span>بيانات الشركة في Firebase:</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 font-bold text-[11px] flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400" />
                          <span>المحطات: {ws.stations_count ?? 0}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 font-bold text-[11px] flex items-center gap-1">
                          <Users className="w-3 h-3 text-sky-400" />
                          <span>العمال: {ws.workers_count ?? 0}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 font-bold text-[11px] flex items-center gap-1">
                          <Package className="w-3 h-3 text-emerald-400" />
                          <span>الكوليات: {ws.parcels_count ?? 0}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 font-bold text-[11px] flex items-center gap-1">
                          <Truck className="w-3 h-3 text-purple-400" />
                          <span>الرحلات: {ws.trips_count ?? 0}</span>
                        </span>
                        <span className="px-2.5 py-1 rounded-lg bg-slate-800/90 text-slate-200 font-bold text-[11px] flex items-center gap-1">
                          <Wallet className="w-3 h-3 text-amber-300" />
                          <span>الصندوق: {ws.transactions_count ?? 0}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-[11px] text-slate-400">
                          <span>آخر نشاط: </span>
                          <span className="text-emerald-300 font-bold">
                            {ws.last_active_at
                              ? `${formatRelativeTime(ws.last_active_at)}${
                                  ws.last_action_summary ? ` — ${ws.last_action_summary}` : ''
                                }`
                              : ws.created_at
                              ? `سجل يوم ${new Date(ws.created_at).toLocaleDateString('ar-MA')}`
                              : '—'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => loadInspectorForWorkspace(ws.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-black text-[11px] border transition ${
                            isExpanded
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30'
                          }`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>
                            {isExpanded ? 'إخفاء تفاصيل وسجل الشركة' : '🔍 فحص الشركة وسجل عملياتها'}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* EXPANDABLE FIREBASE INSPECTOR PANEL FOR THIS WORKSPACE */}
                    {isExpanded && (
                      <div className="bg-[#090E1A] p-3.5 rounded-2xl border border-amber-500/40 space-y-3 animate-fadeIn">
                        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setInspectorTab('activity')}
                              className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                                inspectorTab === 'activity'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              📡 سجل تحركات المدير والعمال ({inspected?.activityLogs?.length || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => setInspectorTab('users')}
                              className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                                inspectorTab === 'users'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              👥 الحسابات في Firebase ({inspected?.users?.length || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => setInspectorTab('parcels')}
                              className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                                inspectorTab === 'parcels'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              📦 الكوليات ({inspected?.parcels?.length || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => setInspectorTab('stations')}
                              className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                                inspectorTab === 'stations'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'bg-slate-800 text-slate-300 hover:text-white'
                              }`}
                            >
                              🏪 المحطات ({inspected?.stations?.length || 0})
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => loadInspectorForWorkspace(ws.id, true)}
                            className="text-[11px] text-amber-300 hover:underline flex items-center gap-1 font-bold"
                          >
                            <RefreshCw
                              className={`w-3 h-3 ${inspected?.loading ? 'animate-spin' : ''}`}
                            />
                            <span>تحديث بيانات الفحص</span>
                          </button>
                        </div>

                        {inspected?.loading ? (
                          <div className="p-4 text-center text-amber-300 text-xs font-bold">
                            جاري جلب بيانات وسجل نشاط الشركة من Firebase Firestore...
                          </div>
                        ) : inspectorTab === 'activity' ? (
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {!inspected?.activityLogs || inspected.activityLogs.length === 0 ? (
                              <p className="text-slate-400 text-center py-4 text-[11px]">
                                لا توجد عمليات مسجلة بعد في سجل هذه الشركة. ستظهر هنا كل عملية دخول أو إضافة كولي أو محطة.
                              </p>
                            ) : (
                              inspected.activityLogs.map((act) => (
                                <div
                                  key={act.id}
                                  className="bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between gap-2"
                                >
                                  <div>
                                    <span className="text-amber-300 font-black ml-1.5">
                                      [{act.actor_role === 'worker' ? 'عامل' : 'مدير'}: {act.actor_name}]
                                    </span>
                                    <span className="text-white font-bold">{act.action_title}</span>
                                    {act.details && (
                                      <p className="text-[10px] text-slate-400 mt-0.5">
                                        {act.details}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                                    {formatRelativeTime(act.created_at)}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        ) : inspectorTab === 'users' ? (
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {!inspected?.users || inspected.users.length === 0 ? (
                              <p className="text-slate-400 text-center py-4 text-[11px]">
                                لا توجد حسابات مسجلة في Firebase لهذه الشركة.
                              </p>
                            ) : (
                              inspected.users.map((u) => (
                                <div
                                  key={u.id}
                                  className="bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-2"
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span
                                      className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                                        u.role === 'owner'
                                          ? 'bg-amber-500/20 text-amber-300'
                                          : 'bg-sky-500/20 text-sky-300'
                                      }`}
                                    >
                                      {u.role === 'owner' ? '👑 مدير الشركة' : '💼 عامل محطة'}
                                    </span>
                                    <span className="text-white font-black">{u.name}</span>
                                    <span className="font-mono text-slate-300" dir="ltr">
                                      {u.phone}
                                    </span>
                                    {u.email && (
                                      <span className="font-mono text-sky-300 text-[10px]" dir="ltr">
                                        {u.email}
                                      </span>
                                    )}
                                  </div>
                                  {u.role === 'worker' && (u.worker_code || u.password) && (
                                    <span className="font-mono text-[11px] bg-slate-800 px-2.5 py-0.5 rounded-lg text-emerald-300 border border-emerald-500/30">
                                      كود الدخول: {u.worker_code || u.password}
                                    </span>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        ) : inspectorTab === 'parcels' ? (
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {!inspected?.parcels || inspected.parcels.length === 0 ? (
                              <p className="text-slate-400 text-center py-4 text-[11px]">
                                لا توجد كوليات مسجلة في هذه الشركة حتى الآن.
                              </p>
                            ) : (
                              inspected.parcels.slice(0, 30).map((p) => (
                                <div
                                  key={p.id}
                                  className="bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-2"
                                >
                                  <div>
                                    <span className="font-mono text-amber-300 font-black ml-2">
                                      {p.tracking_code}
                                    </span>
                                    <span className="text-white font-bold">
                                      {p.sender_name} ➔ {p.receiver_name}
                                    </span>
                                    <span className="text-slate-400 text-[10px] mr-2">
                                      ({p.origin_station_name} ➔ {p.destination_station_name})
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-emerald-300 font-bold">
                                      {p.amount_due} {p.currency}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[10px] font-bold">
                                      {p.status === 'delivered'
                                        ? 'تم التسليم'
                                        : p.status === 'arrived'
                                        ? 'في الستوك'
                                        : p.status === 'in_transit'
                                        ? 'في الطريق'
                                        : 'مسجل'}
                                    </span>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : (
                          <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                            {!inspected?.stations || inspected.stations.length === 0 ? (
                              <p className="text-slate-400 text-center py-4 text-[11px]">
                                لم يقم المدير بإنشاء أي محطة بعد.
                              </p>
                            ) : (
                              inspected.stations.map((st) => (
                                <div
                                  key={st.id}
                                  className="bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800 flex items-center justify-between"
                                >
                                  <div>
                                    <span className="text-white font-black">{st.name}</span>
                                    <span className="text-slate-400 text-[11px] mr-2">
                                      ({st.city} — {st.country === 'MR' ? 'موريتانيا' : 'المغرب'})
                                    </span>
                                  </div>
                                  <span className="font-mono text-amber-300 font-bold">
                                    العملة: {st.currency || st.default_currency || 'MAD'}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Package Tier Selection (الباك الأول 99 درهم vs الباك الثاني 199 درهم) */}
                    <div className="bg-[#0F172A] p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold text-slate-300">
                        تحديد باقة الشركة (تطبق فوراً في Firebase):
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => switchWorkspacePlan('plan_2_two_stations', ws.id)}
                          className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                            isWsPlan2
                              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          🏪 الباك الأول (99 درهم — محطتين + عامل/محطة)
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => switchWorkspacePlan('plan_1_full', ws.id)}
                          className={`px-3 py-1.5 rounded-xl font-black text-[11px] transition ${
                            !isWsPlan2
                              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          👑 الباك الثاني (199 درهم — محطات وعمال غير محدودين)
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons: Extend / Activate / Suspend / Delete from Firebase */}
                    <div className="bg-[#0F172A] p-3 rounded-2xl border border-slate-800/90 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-300 font-black ml-1">
                            تمديد وتفعيل الاشتراك:
                          </span>
                          <button
                            disabled={isBusy}
                            onClick={() => handleExtend(ws, 0.25, '7 أيام')}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-black text-[11px] border border-emerald-500/30 transition"
                          >
                            +7 أيام
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => handleExtend(ws, 1, 'شهر واحد')}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-black text-[11px] border border-emerald-500/40 transition"
                          >
                            +1 شهر
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => handleExtend(ws, 3, '3 أشهر')}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-black text-[11px] border border-emerald-500/40 transition"
                          >
                            +3 أشهر
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => handleExtend(ws, 6, '6 أشهر')}
                            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-black text-[11px] border border-emerald-500/40 transition"
                          >
                            +6 أشهر
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => handleExtend(ws, 12, 'سنة كاملة (12 شهراً)')}
                            className="px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-black text-[11px] border border-amber-500/40 transition"
                          >
                            +1 سنة (12 شهراً)
                          </button>
                        </div>

                        {/* Activate / Suspend / Delete Controls */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {info.isSuspended || info.isExpired ? (
                            <button
                              disabled={isBusy}
                              onClick={() => handleActivate(ws)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>إعادة تفعيل الحساب (+1 شهر)</span>
                            </button>
                          ) : (
                            <button
                              disabled={isBusy}
                              onClick={() => handleSuspend(ws)}
                              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white font-black text-xs border border-rose-500/40 transition"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>توقيف الحساب فوراً</span>
                            </button>
                          )}

                          {!isMyCurrentWs && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                setConfirmDeleteWsId(confirmDeleteWsId === ws.id ? null : ws.id)
                              }
                              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-600 text-rose-300 hover:text-white font-black text-[11px] border border-rose-500/40 transition"
                              title="حذف الشركة والمدير وجميع بياناته من Firebase نهائياً"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>حذف من Firebase</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Confirmation Banner for Permanent Firebase Deletion */}
                      {confirmDeleteWsId === ws.id && (
                        <div className="bg-rose-950/60 border border-rose-500/60 rounded-2xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 animate-fadeIn">
                          <div className="text-[11px] text-rose-200 space-y-0.5">
                            <p className="font-black text-rose-300">
                              ⚠️ تأكيد الحذف النهائي من قاعدة بيانات Firebase Firestore:
                            </p>
                            <p>
                              سيتم مسح شركة <b>"{ws.name}"</b> وحساب مديرها وعمالها وكولياتها وصناديقها نهائياً من Firebase ولن يتمكن من الدخول مجدداً.
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleDeleteWorkspacePermanently(ws)}
                              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs shadow-lg transition"
                            >
                              {isBusy ? 'جاري المسح من Firebase...' : 'نعم، امسح نهائياً من Firebase'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteWsId(null)}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
                            >
                              إلغاء
                            </button>
                          </div>
                        </div>
                      )}

                      {/* WhatsApp Notification Shortcuts */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] text-slate-400 font-bold">
                          إرسال إشعار واتساب لمدير الشركة:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => sendWhatsAppNotification(ws, 'activated')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>وصل تفعيل الاشتراك</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => sendWhatsAppNotification(ws, 'expiring')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold transition"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>تذكير بالتجديد</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => sendWhatsAppNotification(ws, 'suspended')}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-[11px] font-bold transition"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            <span>إشعار توقف الحساب</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Notes per workspace */}
                    <div className="pt-0.5">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="ملاحظاتك الخاصة حول هذه الشركة (مثال: دفع 199 درهم عبر كاش بلوس يوم...)"
                          value={
                            editingNotes[ws.id] !== undefined
                              ? editingNotes[ws.id]
                              : ws.admin_notes || ''
                          }
                          onChange={(e) =>
                            setEditingNotes({ ...editingNotes, [ws.id]: e.target.value })
                          }
                          className="flex-1 bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1.5 text-[11px] text-white focus:outline-none focus:border-amber-500"
                        />
                        <button
                          onClick={() => handleSaveNotes(ws.id)}
                          disabled={isBusy}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-500 text-slate-200 hover:text-slate-950 font-bold text-[11px] transition"
                          title="حفظ الملاحظة"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>حفظ</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between shrink-0 flex-wrap gap-2">
          <p className="text-[11px] text-slate-400">
            🔒 جميع التعديلات (تفعيل، توقيف، تغيير الباقة، أو الحذف النهائي) تطبق مباشرة في Firebase Firestore.
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
