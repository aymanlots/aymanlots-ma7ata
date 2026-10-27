import React, { useState } from 'react';
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
  Calendar, 
  Search,
  Store,
  Layers,
  ArrowRight
} from 'lucide-react';

interface PlatformOwnerDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlatformOwnerDashboard: React.FC<PlatformOwnerDashboardProps> = ({
  isOpen,
  onClose
}) => {
  const { 
    allWorkspaces, 
    allSubscriptions, 
    updateWorkspaceSubscription, 
    updateWorkspaceNotes,
    switchWorkspacePlan,
    showToast 
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const filteredWorkspaces = (allWorkspaces || []).filter((ws: Workspace) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      ws.name.toLowerCase().includes(q) ||
      ws.short_id.toLowerCase().includes(q) ||
      (ws.owner_phone && ws.owner_phone.includes(q))
    );
  });

  const handleExtend = async (wsId: string, months: number) => {
    try {
      await updateWorkspaceSubscription(wsId, 'extend', months);
      showToast(`تم تمديد اشتراك مساحة العمل بنجاح لمدة ${months} شهر`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleActivate = async (wsId: string) => {
    try {
      await updateWorkspaceSubscription(wsId, 'activate', 1);
      showToast('تم تفعيل اشتراك مساحة العمل بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSuspend = async (wsId: string) => {
    try {
      await updateWorkspaceSubscription(wsId, 'suspend');
      showToast('تم تعليق اشتراك مساحة العمل', 'info');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSaveNotes = async (wsId: string) => {
    const noteText = editingNotes[wsId];
    if (noteText === undefined) return;
    try {
      await updateWorkspaceNotes(wsId, noteText);
      showToast('تم حفظ الملاحظات الإدارية بنجاح', 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const getWhatsAppLink = (rawPhone: string) => {
    const clean = rawPhone.replace(/[^0-9]/g, '');
    return `https://wa.me/${clean}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-[#060A14]/90 backdrop-blur-xs" onClick={onClose} />

      <div 
        className="w-full max-w-4xl rounded-3xl bg-[#0F172A] border border-amber-500/40 p-5 sm:p-6 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-4 max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-lg shadow-amber-500/20">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white">
                  لوحة تحكم مالك المنصة (Platform Owner)
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  إدارة التراخيص والاشتراكات
                </span>
              </div>
              <p className="text-xs text-slate-400">
                متابعة وتفعيل وتمديد اشتراكات مدراء المحطات المستقلة وتحديد الباقة
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Privacy Boundary Reassurance Banner */}
        <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-300 shrink-0">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            <strong>ضمان الخصوصية التامة:</strong> هذه اللوحة مخصصة لإدارة حالة الاشتراكات والتواصل مع المدراء فقط. المعاملات المالية، الصناديق النقدية، والكوليات الخاصة بكل مساحة عمل محجوبة ومشفرة بالكامل ولا تظهر لمالك المنصة.
          </p>
        </div>

        {/* Search */}
        <div className="relative shrink-0">
          <input
            type="text"
            placeholder="البحث باسم مساحة العمل، المعرف القصير، أو هاتف المدير..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B1220] border border-slate-700 rounded-2xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 pl-10"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* Workspaces List */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
          {filteredWorkspaces.length === 0 ? (
            <div className="p-8 text-center text-slate-500 bg-[#0B1220] rounded-2xl border border-slate-800 text-xs">
              لا توجد مساحات عمل مسجلة حتى الآن أو لا توجد نتائج مطابقة للبحث.
            </div>
          ) : (
            (filteredWorkspaces || []).map((ws: Workspace) => {
              const sub = allSubscriptions?.find((s: Subscription) => s.workspace_id === ws.id);
              const isExpired = sub ? new Date(sub.end_date).getTime() < Date.now() : false;
              const isSuspended = sub?.status === 'suspended';

              const diff = sub ? new Date(sub.end_date).getTime() - Date.now() : 0;
              const daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
              const isWsPlan2 =
                ws.plan_tier === 'plan_2_two_stations' ||
                ws.max_stations === 2 ||
                ws.max_workers_per_station === 1;

              return (
                <div 
                  key={ws.id}
                  className="bg-[#0B1220] p-4 rounded-3xl border border-slate-800 space-y-3 text-xs"
                >
                  {/* Top line: Name, Short ID, Status */}
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-white text-sm">{ws.name}</span>
                      <span className="font-mono text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                        {ws.short_id}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-amber-500/30 font-bold">
                        {isWsPlan2
                          ? 'الباك الثاني (محطتين + عامل/محطة)'
                          : 'الباك الأول (شامل كل شيء)'}
                      </span>
                    </div>

                    <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                      isSuspended
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : isExpired
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}>
                      {isSuspended ? 'معلق' : isExpired ? 'منتهي الصلاحية' : `نشط (${daysLeft} يوم)`}
                    </span>
                  </div>

                  {/* Admin Contacts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center justify-between bg-[#0F172A] p-2 rounded-xl">
                      <span>رقم هاتف المدير:</span>
                      <span className="font-mono text-white" dir="ltr">{ws.owner_phone || 'غير مسجل'}</span>
                    </div>

                    <div className="flex items-center justify-between bg-[#0F172A] p-2 rounded-xl">
                      <span>واتساب المدير:</span>
                      {ws.owner_whatsapp ? (
                        <a
                          href={getWhatsAppLink(ws.owner_whatsapp)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-bold font-mono"
                          dir="ltr"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>{ws.owner_whatsapp}</span>
                        </a>
                      ) : (
                        <span className="text-slate-500">لا يوجد</span>
                      )}
                    </div>
                  </div>

                  {/* Package Tier Selection (الباك الأول vs الباك الثاني) */}
                  <div className="bg-[#0F172A] p-2.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-300">
                      نوع الباقة المفعلة لهذه المساحة:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => switchWorkspacePlan('plan_1_full', ws.id)}
                        className={`px-2.5 py-1 rounded-lg font-black text-[10px] transition ${
                          !isWsPlan2
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        👑 الباك الأول (شامل كل شيء)
                      </button>
                      <button
                        type="button"
                        onClick={() => switchWorkspacePlan('plan_2_two_stations', ws.id)}
                        className={`px-2.5 py-1 rounded-lg font-black text-[10px] transition ${
                          isWsPlan2
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        🏪 الباك الثاني (محطتين + عامل/محطة)
                      </button>
                    </div>
                  </div>

                  {/* Dates & Subscription info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 bg-[#0F172A] px-3 py-1.5 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span>تاريخ الإنشاء:</span>
                      <span className="font-mono text-slate-300" dir="ltr">
                        {new Date(ws.created_at).toLocaleDateString('ar-MA')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span>تاريخ انتهاء الاشتراك:</span>
                      <span className="font-mono text-amber-300 font-bold" dir="ltr">
                        {sub ? new Date(sub.end_date).toLocaleDateString('ar-MA') : 'غير محدد'}
                      </span>
                    </div>
                  </div>

                  {/* Extension Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-400 font-bold">تمديد الاشتراك:</span>
                    <button
                      onClick={() => handleExtend(ws.id, 1)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] border border-emerald-500/30 transition"
                    >
                      +1 شهر
                    </button>
                    <button
                      onClick={() => handleExtend(ws.id, 3)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] border border-emerald-500/30 transition"
                    >
                      +3 أشهر
                    </button>
                    <button
                      onClick={() => handleExtend(ws.id, 6)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-[11px] border border-emerald-500/30 transition"
                    >
                      +6 أشهر
                    </button>
                    <button
                      onClick={() => handleExtend(ws.id, 12)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold text-[11px] border border-amber-500/30 transition"
                    >
                      +12 شهراً (سنة)
                    </button>

                    <div className="mr-auto flex gap-1.5">
                      <button
                        onClick={() => handleActivate(ws.id)}
                        className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-[11px] transition"
                      >
                        تفعيل فوري
                      </button>
                      <button
                        onClick={() => handleSuspend(ws.id)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-[11px] border border-rose-500/30 transition"
                      >
                        تعليق
                      </button>
                    </div>
                  </div>

                  {/* Notes per workspace */}
                  <div className="pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="ملاحظات إدارية (مثال: تم التحويل عبر كاش بلوس في تاريخ...)"
                        value={editingNotes[ws.id] !== undefined ? editingNotes[ws.id] : (ws.admin_notes || '')}
                        onChange={e => setEditingNotes({ ...editingNotes, [ws.id]: e.target.value })}
                        className="flex-1 bg-[#0F172A] border border-slate-700 rounded-xl px-3 py-1 text-[11px] text-white focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => handleSaveNotes(ws.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="حفظ الملاحظة"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-2 border-t border-slate-800 text-center shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs transition"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
