import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Workspace, Subscription } from '../types/database';
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
} from 'lucide-react';

interface PlatformOwnerDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

type FilterTab = 'all' | 'active' | 'expiring_soon' | 'stopped';

export const PlatformOwnerDashboard: React.FC<PlatformOwnerDashboardProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    allWorkspaces,
    allSubscriptions,
    currentWorkspace,
    updateWorkspaceSubscription,
    updateWorkspaceNotes,
    switchWorkspacePlan,
    refreshPlatformWorkspaces,
    showToast,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busyWorkspaceId, setBusyWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsRefreshing(true);
      Promise.resolve(refreshPlatformWorkspaces()).finally(() => {
        setIsRefreshing(false);
      });
    }
  }, [isOpen, refreshPlatformWorkspaces]);

  // Merge currentWorkspace if allWorkspaces is empty so the owner always sees at least their own/current workspace
  const mergedWorkspaces: Workspace[] = useMemo(() => {
    const list = Array.isArray(allWorkspaces) ? [...allWorkspaces] : [];
    if (currentWorkspace && !list.some(w => w.id === currentWorkspace.id)) {
      list.unshift(currentWorkspace);
    }
    return list.sort((a, b) => {
      const tA = new Date(a.created_at || 0).getTime();
      const tB = new Date(b.created_at || 0).getTime();
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
    mergedWorkspaces.forEach(ws => {
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

  if (!isOpen) return null;

  const filteredWorkspaces = mergedWorkspaces.filter((ws: Workspace) => {
    const info = getWorkspaceStatusInfo(ws);
    if (filterTab === 'active' && !info.isActive) return false;
    if (filterTab === 'expiring_soon' && !info.isExpiringSoon) return false;
    if (filterTab === 'stopped' && !info.isSuspended && !info.isExpired) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      (ws.name || '').toLowerCase().includes(q) ||
      (ws.short_id || '').toLowerCase().includes(q) ||
      (ws.owner_phone && ws.owner_phone.includes(q)) ||
      (ws.owner_whatsapp && ws.owner_whatsapp.includes(q)) ||
      (ws.admin_notes && ws.admin_notes.toLowerCase().includes(q))
    );
  });

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshPlatformWorkspaces();
      showToast('تم تحديث قائمة الشركات والاشتراكات من السحابة بنجاح', 'success');
    } finally {
      setIsRefreshing(false);
    }
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
      showToast(`⛔ تم توقيف حساب شركة "${ws.name}" فوراً (القراءة فقط)`, 'info');
    } catch (err: any) {
      showToast(err.message || 'تعذر توقيف الحساب', 'error');
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
      showToast('تم حفظ الملاحظات الإدارية في السحابة بنجاح', 'success');
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

  const sendWhatsAppNotification = (ws: Workspace, type: 'activated' | 'expiring' | 'suspended') => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-5 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-[#060A14]/90 backdrop-blur-xs" onClick={onClose} />

      <div
        className="w-full max-w-5xl rounded-3xl bg-[#0F172A] border border-amber-500/40 p-4 sm:p-6 shadow-2xl text-right overflow-hidden relative z-10 my-3 space-y-4 max-h-[94vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0 gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20 shrink-0">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  إدارة اشتراكات الشركات (تفعيل / توقيف الحسابات)
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black">
                  لوحة تحكم مالك التطبيق
                </span>
              </div>
              <p className="text-xs text-slate-400">
                تفعيل وتمديد أو توقيف حسابات شركات الشحن المشتركة معك وتحديد باقاتهم (99 درهم / 199 درهم) بنقرة واحدة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 text-xs font-bold transition disabled:opacity-50"
              title="تحديث قائمة الشركات من السحابة"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">تحديث من السحابة</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Summary Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`p-3 rounded-2xl border text-right transition ${
              filterTab === 'all'
                ? 'bg-amber-500/15 border-amber-500 text-white'
                : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-bold">إجمالي الشركات</span>
              <Building2 className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xl font-black text-white mt-1 font-mono">{stats.total}</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('active')}
            className={`p-3 rounded-2xl border text-right transition ${
              filterTab === 'active'
                ? 'bg-emerald-500/15 border-emerald-500 text-white'
                : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-emerald-300 font-bold">حسابات مفعلة ونشطة</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-xl font-black text-emerald-400 mt-1 font-mono">{stats.activeCount}</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('expiring_soon')}
            className={`p-3 rounded-2xl border text-right transition ${
              filterTab === 'expiring_soon'
                ? 'bg-amber-500/15 border-amber-500 text-white'
                : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-amber-300 font-bold">قريبة الانتهاء (≤ 7 أيام)</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <p className="text-xl font-black text-amber-400 mt-1 font-mono">{stats.expiringSoonCount}</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterTab('stopped')}
            className={`p-3 rounded-2xl border text-right transition ${
              filterTab === 'stopped'
                ? 'bg-rose-500/15 border-rose-500 text-white'
                : 'bg-[#0B1220] border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-rose-300 font-bold">موقوفة / منتهية</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-xl font-black text-rose-400 mt-1 font-mono">{stats.stoppedCount}</p>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative shrink-0">
          <input
            type="text"
            placeholder="ابحث باسم الشركة، المعرف القصير (Short ID)، رقم هاتف المدير، أو الملاحظات..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B1220] border border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 pl-10"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Workspaces List */}
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

              return (
                <div
                  key={ws.id}
                  className={`bg-[#0B1220] p-4 rounded-3xl border space-y-3 text-xs transition ${
                    info.isSuspended
                      ? 'border-rose-500/40'
                      : info.isExpired
                      ? 'border-amber-500/40'
                      : 'border-slate-800'
                  }`}
                >
                  {/* Top line: Name, Short ID, Status */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-white text-sm sm:text-base">{ws.name}</span>
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        {ws.short_id}
                      </span>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-amber-500/30 font-bold">
                        {isWsPlan2
                          ? '🏪 الباك الأول (99 درهم — محطتين)'
                          : '👑 الباك الثاني (199 درهم — شامل مفتوح)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
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

                  {/* Admin Contacts & Quick WhatsApp Receipts */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>هاتف المدير:</span>
                      </span>
                      <span className="font-mono text-white font-bold" dir="ltr">
                        {ws.owner_phone || ws.owner_whatsapp || 'غير مسجل'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                      <span>بداية التسجيل:</span>
                      <span className="font-mono text-slate-300" dir="ltr">
                        {ws.created_at ? new Date(ws.created_at).toLocaleDateString('ar-MA') : '—'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between bg-[#0F172A] px-3 py-2 rounded-xl border border-slate-800/80">
                      <span>نهاية الاشتراك:</span>
                      <span className="font-mono text-amber-300 font-black" dir="ltr">
                        {new Date(info.endDateStr).toLocaleDateString('ar-MA')}
                      </span>
                    </div>
                  </div>

                  {/* Package Tier Selection (الباك الأول 99 درهم vs الباك الثاني 199 درهم) */}
                  <div className="bg-[#0F172A] p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-300">
                      تحديد باقة الشركة (تطبق فوراً في السحابة):
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

                  {/* Action Buttons: Extend / Activate / Suspend / WhatsApp */}
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

                      {/* Activate / Suspend Toggle */}
                      <div className="flex items-center gap-2">
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
                      </div>
                    </div>

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
                        onChange={e =>
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

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-400">
            🔒 بيانات الكوليات والصناديق الخاصة بكل شركة مشفرة ومستقلة تماماً.
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
