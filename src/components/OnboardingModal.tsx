import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { PlusCircle, KeyRound, ShieldCheck, ArrowRight, Sparkles, Building2 } from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose }) => {
  const { createTeam, joinTeam } = useApp();
  const [mode, setMode] = useState<'choose' | 'create' | 'join'>('choose');
  const [teamName, setTeamName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setIsLoading(true);
    setError(null);
    const res = await createTeam(teamName);
    setIsLoading(false);
    if (res.success && onClose) {
      onClose();
    } else if (res.error) {
      setError(res.error);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setIsLoading(true);
    setError(null);
    const res = await joinTeam(inviteCode);
    setIsLoading(false);
    if (res.success && onClose) {
      onClose();
    } else if (res.error) {
      setError(res.error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black animate-fadeIn overflow-y-auto" dir="rtl">
      <div 
        className="w-full max-w-[380px] rounded-[24px] bg-[#1a0f00]/90 border border-[#D4AF37]/65 p-5 shadow-2xl text-right overflow-hidden relative z-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Subtle Gold Accent Stripe */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#D4882A] via-[#F5B05B] to-[#D4882A]" />

        {/* Step 1: Choose mode */}
        {mode === 'choose' && (
          <div>
            <div 
              className="relative w-20 h-20 rounded-full border-2 border-[#D4AF37] shadow-xl shadow-black/80 mx-auto mb-3 overflow-hidden flex items-center justify-center p-0"
              style={{ background: 'transparent', borderRadius: '50%', padding: 0, overflow: 'hidden' }}
            >
              <img 
                src="/assets/aistudio/image_9c11f636.png" 
                alt="Sahara📦 Express" 
                style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover', background: 'transparent', display: 'block' }}
              />
            </div>

            <h2 className="text-lg font-black text-[#F5D799] text-center mb-1">
              مرحباً بك في Sahara📦 Express
            </h2>
            <p className="text-xs text-[#C8B08A] text-center mb-5">
              لكل فريق عمل خصوصية تامة بنسبة 100% ومحطات منفصلة. كيف ترغب في البدء؟
            </p>

            <div className="space-y-3">
              {/* Option A: Create New Team */}
              <button
                onClick={() => setMode('create')}
                className="w-full p-3.5 rounded-2xl bg-[#120a00] hover:bg-[#241500] border border-[#D4AF37]/60 text-right transition active:scale-98 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] flex items-center justify-center font-bold shrink-0">
                    <PlusCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#F5D799]">
                      إنشاء فريق عمل جديد (مالك الصندوق)
                    </h3>
                    <p className="text-[11px] text-[#C8B08A] mt-0.5">
                      إنشاء فريق عمل خاص بك، مع فترة تجريبية مجانية لمدة 7 أيام، وتجهيز محطتي الداخلة ونواذيبو فوراً.
                    </p>
                  </div>
                </div>
              </button>

              {/* Option B: Join with Invite Code */}
              <button
                onClick={() => setMode('join')}
                className="w-full p-3.5 rounded-2xl bg-[#120a00] hover:bg-[#241500] border border-[#D4AF37]/40 text-right transition active:scale-98 group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1a0f00] border border-[#D4AF37]/40 text-[#F3A952] flex items-center justify-center font-bold shrink-0">
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-[#FFF8EB]">
                      الانضمام بواسطة رمز الدعوة (موظف بالمحطة)
                    </h3>
                    <p className="text-[11px] text-[#C8B08A] mt-0.5">
                      إذا زوّدك مدير المحطة برمز دعوة (8 خانات) لتسجيل الإيصالات في محطتك المحددة.
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Step 2A: Create Team Form */}
        {mode === 'create' && (
          <form onSubmit={handleCreate}>
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="text-xs text-[#E6C37A] hover:text-white flex items-center gap-1 mb-3"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للاختيار</span>
            </button>

            <h3 className="text-sm font-bold text-[#F5D799] mb-1">إنشاء فريق عمل جديد</h3>
            <p className="text-xs text-[#C8B08A] mb-4">
              ستحصل على صلاحيات مالك الصندوق (المشرف) مع تجربة مجانية لمدة 7 أيام ومحطتي الداخلة ونواذيبو.
            </p>

            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs rounded-xl mb-3">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-bold text-[#E6C37A] mb-1.5">اسم فريق العمل</label>
              <input
                type="text"
                placeholder="مثال: فريق Sahara📦 Express"
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !teamName.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-xs shadow-lg disabled:opacity-50 transition"
            >
              {isLoading ? 'جاري الإنشاء والتهيئة...' : 'إنشاء فريق العمل والبدء فوراً'}
            </button>
          </form>
        )}

        {/* Step 2B: Join with Code Form */}
        {mode === 'join' && (
          <form onSubmit={handleJoin}>
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="text-xs text-[#E6C37A] hover:text-white flex items-center gap-1 mb-3"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>العودة للاختيار</span>
            </button>

            <h3 className="text-sm font-bold text-[#F5D799] mb-1">الانضمام بواسطة رمز الدعوة</h3>
            <p className="text-xs text-[#C8B08A] mb-4">
              أدخل رمز الدعوة المكون من 8 خانات الذي زوّدك به مدير المحطة (المشرف).
            </p>

            {error && (
              <div className="p-3 bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs rounded-xl mb-3">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-bold text-[#E6C37A] mb-1.5">رمز الدعوة (8 خانات)</label>
              <input
                type="text"
                placeholder="20261015"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value.toUpperCase())}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 focus:border-[#D4AF37] rounded-xl px-3.5 py-3 text-lg font-bold font-mono tracking-widest text-center text-[#F5D799] uppercase focus:outline-none"
                maxLength={10}
                required
              />
              <span className="block text-[10px] text-[#C8B08A] mt-1 text-center">
                الرمز التجريبي الافتراضي: <strong>20261015</strong>
              </span>
            </div>

            <button
              type="submit"
              disabled={isLoading || !inviteCode.trim()}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-xs shadow-lg disabled:opacity-50 transition"
            >
              {isLoading ? 'جاري التحقق والانضمام...' : 'تأكيد الانضمام إلى فريق العمل'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
