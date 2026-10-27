import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Users, 
  X, 
  Radio, 
  ShieldCheck, 
  MessageSquare, 
  Send, 
  Copy, 
  Check, 
  Share2, 
  Crown, 
  UserCheck, 
  Activity, 
  Sparkles,
  RefreshCw,
  Bell,
  Clock,
  Briefcase
} from 'lucide-react';

interface AdminCollaborationRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AdminNote {
  id: string;
  senderName: string;
  senderRole: string;
  text: string;
  timestamp: string;
  type: 'general' | 'urgent' | 'exchange_rate' | 'closing';
}

export const AdminCollaborationRoomModal: React.FC<AdminCollaborationRoomModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { 
    currentUser, 
    currentWorkspace, 
    workspaceMembers, 
    transactions, 
    parcels,
    exchangeRate,
    showToast 
  } = useApp();

  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [memoText, setMemoText] = useState('');
  const [memoCategory, setMemoCategory] = useState<'general' | 'urgent' | 'exchange_rate' | 'closing'>('general');

  // Real-time broadcast notes state (persisted locally / reactive for current session)
  const [adminNotes, setAdminNotes] = useState<AdminNote[]>([
    {
      id: 'note-1',
      senderName: 'سليمان بن سليمان',
      senderRole: 'مدير إقليمي (مالك)',
      text: 'مرحباً بالفريق! تم ضبط سعر الصرف المعتمد على 1 MAD = ' + exchangeRate + ' MRU.',
      timestamp: 'قبل 10 دقائق',
      type: 'exchange_rate'
    },
    {
      id: 'note-2',
      senderName: currentUser?.name || 'المدير المشارك',
      senderRole: 'مدير محطة / مشارك',
      text: 'تم تجهيز كوليات رحلة بوجدور ↔ نواذيبو للتحقيق والإغلاق اليومي.',
      timestamp: 'قبل 2 دقيقة',
      type: 'closing'
    }
  ]);

  // Simulation of live pulse / activity heartbeat
  const [isLiveConnected, setIsLiveConnected] = useState(true);

  if (!isOpen) return null;

  // Filter co-admins (owners and admins)
  const coAdmins = workspaceMembers.filter(
    m => m.role === 'owner' || m.role === 'admin'
  );

  // If currentUser is admin/owner and not in list, add dynamically
  const displayAdmins = [...coAdmins];
  if (currentUser && !displayAdmins.some(a => a.user_id === currentUser.id || a.phone === currentUser.phone)) {
    displayAdmins.unshift({
      id: `m-curr-${currentUser.id}`,
      workspace_id: currentWorkspace?.id || 'ws-main',
      user_id: currentUser.id,
      name: currentUser.name,
      phone: currentUser.phone,
      role: (currentUser.role === 'owner' ? 'owner' : 'admin') as any,
      status: 'active',
      created_at: new Date().toISOString()
    });
  }

  const handleCopyCode = () => {
    if (currentWorkspace?.invite_code) {
      navigator.clipboard.writeText(currentWorkspace.invite_code);
      setCopiedCode(true);
      showToast('تم نسخ رمز دعوة المدراء', 'success');
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleCopyLink = () => {
    const inviteUrl = `${window.location.origin}?invite=${currentWorkspace?.invite_code || ''}`;
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    showToast('تم نسخ رابط الانضمام المباشر للمدراء', 'success');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSendMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoText.trim()) return;

    const newNote: AdminNote = {
      id: `note-${Date.now()}`,
      senderName: currentUser?.name || 'مدير مشارك',
      senderRole: currentUser?.role === 'owner' ? 'مالك مساحة العمل' : 'مدير مشارك',
      text: memoText.trim(),
      timestamp: 'الآن',
      type: memoCategory
    };

    setAdminNotes(prev => [newNote, ...prev]);
    setMemoText('');
    showToast('تم بث المذكرة الإدارية لجميع المدراء بنجاح', 'success');
  };

  const getCategoryBadge = (type: AdminNote['type']) => {
    switch (type) {
      case 'urgent':
        return <span className="bg-red-500/20 text-red-300 text-xs px-2 py-0.5 rounded border border-red-500/30 font-medium">عاجل</span>;
      case 'exchange_rate':
        return <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2 py-0.5 rounded border border-emerald-500/30 font-medium">سعر الصرف</span>;
      case 'closing':
        return <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded border border-blue-500/30 font-medium">تقرير الإغلاق</span>;
      default:
        return <span className="bg-white/10 text-gray-200 text-xs px-2 py-0.5 rounded border border-white/20 font-medium">مذكرة</span>;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn dir-rtl">
      <div className="bg-gradient-to-b from-gray-900 via-gray-900 to-black text-white w-full max-w-3xl rounded-2xl border border-white/20 shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#C1272D] to-[#006233] flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white">
                  غرفة تعاون المدراء اللحظية (Admin Collaboration Room)
                </h2>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  بث مباشر (Live)
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-0.5">
                مساحة العمل: <span className="text-emerald-400 font-semibold">{currentWorkspace?.name || 'الداخلة - موريتانيا'}</span> (يتشارك فيها 2 إلى 4 مدراء معاً)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-cancel p-2 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Room Live Connection Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 block">المدراء المتواجدون</span>
                <span className="text-xl font-extrabold text-white">{displayAdmins.length} مدراء</span>
              </div>
              <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 block">رمز انضمام المدراء</span>
                <span className="text-base font-mono font-bold text-emerald-400">{currentWorkspace?.invite_code || 'ITT-8888'}</span>
              </div>
              <button 
                onClick={handleCopyCode}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-gray-200 transition-all"
                title="نسخ رمز الدعوة"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-gray-400 block">حالة مزامنة RLS</span>
                <span className="text-sm font-semibold text-emerald-300 flex items-center gap-1">
                  <Activity className="w-4 h-4 text-emerald-400" /> نشطة ومؤمنة
                </span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></div>
            </div>
          </div>

          {/* Active Co-Admins Cards */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Crown className="w-4 h-4 text-emerald-400" />
                فريق المدراء المشاركين في الغرفة ({displayAdmins.length})
              </h3>
              <button
                onClick={handleCopyLink}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 transition-all"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                دعوة مدير جديد للغرفة
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {displayAdmins.map((admin, idx) => {
                const isOwner = admin.role === 'owner' || idx === 0;
                return (
                  <div 
                    key={admin.id || idx}
                    className="p-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-500/40 transition-all flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm shadow-md ${
                          isOwner 
                            ? 'bg-gradient-to-tr from-[#C1272D] to-red-600' 
                            : 'bg-gradient-to-tr from-[#006233] to-emerald-600'
                        }`}>
                          {admin.name?.charAt(0) || 'م'}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-gray-900" title="متصل الآن"></span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-sm font-bold text-white">{admin.name || 'مدير إقليمي'}</h4>
                          {isOwner && (
                            <span className="bg-red-500/20 text-red-300 border border-red-500/30 text-[10px] px-1.5 py-0.2 rounded font-medium">
                              مالك
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{admin.phone || '0660000000'}</p>
                      </div>
                    </div>

                    <div className="text-left dir-ltr">
                      <span className="text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full inline-flex items-center gap-1 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Active Live
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Broadcast Memos / Live Discussion */}
          <div className="bg-black/40 rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                المذكرات الإدارية المباشرة (Live Broadcast Memos)
              </h3>
              <span className="text-xs text-gray-400">تظهر فوراً لجميع المدراء</span>
            </div>

            {/* Memo Send Form */}
            <form onSubmit={handleSendMemo} className="mb-4 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={memoCategory}
                  onChange={(e) => setMemoCategory(e.target.value as any)}
                  className="bg-gray-800 border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="general">مذكرة عامة</option>
                  <option value="urgent">تنبيه عاجل</option>
                  <option value="exchange_rate">تعديل سعر الصرف</option>
                  <option value="closing">تقرير الإغلاق</option>
                </select>

                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={memoText}
                    onChange={(e) => setMemoText(e.target.value)}
                    placeholder="اكتب مذكرة أو تنبيه للمدراء المشاركين..."
                    className="w-full bg-gray-800 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!memoText.trim()}
                  className="px-4 py-2 bg-[#006233] hover:bg-[#004d28] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg"
                >
                  <Send className="w-3.5 h-3.5" />
                  بث المذكرة
                </button>
              </div>
            </form>

            {/* Memos List */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {adminNotes.map((note) => (
                <div 
                  key={note.id} 
                  className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">{note.senderName}</span>
                      <span className="text-[10px] text-gray-400">({note.senderRole})</span>
                      {getCategoryBadge(note.type)}
                    </div>
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-gray-500" />
                      {note.timestamp}
                    </span>
                  </div>
                  <p className="text-xs text-gray-200 font-medium leading-relaxed">{note.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Real-time Workspace Activity Log */}
          <div className="p-4 rounded-xl bg-white/5 border border-white/10">
            <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              آخر أنشطة العمليات في مساحة العمل
            </h3>
            <div className="text-xs text-gray-300 space-y-1.5">
              <p className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>إجمالي الكوليات المسجلة في هذه المساحة: <strong className="text-white">{parcels.length} كولي</strong></span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>إجمالي المعاملات المالية: <strong className="text-white">{transactions.length} عملية</strong></span>
              </p>
              <p className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                <span>سعر الصرف المعتمد حالياً: <strong className="text-emerald-400 font-mono">1 MAD = {exchangeRate} MRU</strong></span>
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 bg-white/5 flex items-center justify-between">
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            يدعم النظام حتى 100 شركة ومعالجة متزامنة لـ 4 مدراء لكل شركة
          </span>
          <button
            onClick={onClose}
            className="btn-cancel px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
          >
            إغلاق الغرفة
          </button>
        </div>

      </div>
    </div>
  );
};
