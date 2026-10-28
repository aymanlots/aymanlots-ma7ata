import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, PlusSquare, X, Smartphone, CheckCircle2, Monitor } from 'lucide-react';

interface PWAInstallButtonProps {
  variant?: 'card' | 'button';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'card' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  const handleInstallClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  const GuideModal = showGuide && (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fadeIn"
      dir="rtl"
      onClick={() => setShowGuide(false)}
    >
      <div 
        className="w-full max-w-sm rounded-[24px] luxury-card border border-[#F5C84C]/60 p-5 shadow-2xl text-right space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl overflow-hidden shrink-0 border border-[#F5C84C]/40 p-0.5 bg-black/50">
              <img 
                src="/icon-192.png" 
                alt="شعار التطبيق" 
                className="w-full h-full object-cover rounded-lg"
              />
            </div>
            <span>تحميل وتثبيت التطبيق على جهازك</span>
          </h3>
          <button
            onClick={() => setShowGuide(false)}
            className="btn-cancel p-1.5 rounded-xl text-white/70 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs text-white/90">
          {isIOS ? (
            <>
              <p className="text-[#F5C84C] font-bold">خطوات التثبيت على أجهزة iPhone / iPad (متصفح Safari):</p>
              <div className="flex items-start gap-2.5 bg-black/50 p-2.5 rounded-xl border border-white/10">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F5C84C] text-[#111] text-[10px] font-black shrink-0">1</span>
                <p>اضغط على زر المشاركة <Share className="inline w-3.5 h-3.5 text-blue-400 mx-1" /> أسفل شاشة المتصفح.</p>
              </div>
              <div className="flex items-start gap-2.5 bg-black/50 p-2.5 rounded-xl border border-white/10">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F5C84C] text-[#111] text-[10px] font-black shrink-0">2</span>
                <p>مرر لأسفل واضغط على <strong className="text-[#F5C84C]">"إضافة إلى الشاشة الرئيسية"</strong> <PlusSquare className="inline w-3.5 h-3.5 text-emerald-400 mx-1" />.</p>
              </div>
              <div className="flex items-start gap-2.5 bg-black/50 p-2.5 rounded-xl border border-white/10">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F5C84C] text-[#111] text-[10px] font-black shrink-0">3</span>
                <p>اضغط على <strong className="text-white">إضافة (Add)</strong> في أعلى الزاوية ليثبت التطبيق فوراً!</p>
              </div>
            </>
          ) : (
            <>
              <p className="text-[#F5C84C] font-bold">خطوات التثبيت على أجهزة Android أو الحاسوب (Chrome / Edge):</p>
              <div className="flex items-start gap-2.5 bg-black/50 p-2.5 rounded-xl border border-white/10">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F5C84C] text-[#111] text-[10px] font-black shrink-0">1</span>
                <p>اضغط على أيقونة القائمة (⋮) أعلى يمين المتصفح أو أيقونة التثبيت <Download className="inline w-3.5 h-3.5 text-[#F5C84C] mx-1" /> في شريط العنوان.</p>
              </div>
              <div className="flex items-start gap-2.5 bg-black/50 p-2.5 rounded-xl border border-white/10">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F5C84C] text-[#111] text-[10px] font-black shrink-0">2</span>
                <p>اختر <strong className="text-[#F5C84C]">"تثبيت التطبيق"</strong> أو <strong className="text-[#F5C84C]">"إضافة إلى الشاشة الرئيسية"</strong>.</p>
              </div>
              <div className="flex items-start gap-2.5 bg-black/50 p-2.5 rounded-xl border border-white/10">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#F5C84C] text-[#111] text-[10px] font-black shrink-0">3</span>
                <p>سيظهر التطبيق كأيقونة مستقلة سريعة تعمل بدون إنترنت وبكامل طاقتها!</p>
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setShowGuide(false)}
          className="w-full py-2.5 rounded-xl bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-[#111] font-black text-xs transition active:scale-95 cursor-pointer shadow-md"
        >
          حسناً، فهمت
        </button>
      </div>
    </div>
  );

  if (variant === 'button') {
    return (
      <>
        <button
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#F5C84C] hover:bg-[#F5C84C]/90 text-[#111] rounded-xl shadow-md transition active:scale-95 cursor-pointer"
          title="تحميل وتثبيت التطبيق على الهاتف"
        >
          <Download className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{isInstalled ? 'التطبيق مثبت ✓' : 'تحميل التطبيق (PWA)'}</span>
        </button>
        {GuideModal}
      </>
    );
  }

  // Large prominent card for Settings view
  return (
    <>
      <div className="w-full luxury-card rounded-[22px] p-4 border-2 border-[#F5C84C]/65 bg-gradient-to-br from-[#1a0f00] via-[#241400] to-[#120a00] shadow-[0_10px_30px_rgba(245,200,76,0.18)] space-y-3 text-right">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shadow-lg shrink-0">
              <Smartphone className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-black text-white">تحميل وتثبيت التطبيق على هاتفك</h3>
                {isInstalled && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40">
                    مثبت حالياً ✓
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#F5C84C] font-bold mt-0.5">
                يعمل كتطبيق هاتف أصلي وسريع بدون إنترنت (Android & iPhone & Desktop)
              </p>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-white/80 leading-relaxed">
          قم بتنزيل أيقونة التطبيق على شاشة هاتفك الرئيسية لتفتحه بنقرة واحدة كأي تطبيق هاتف مع دعم كامل للعمل بدون شبكة إنترنت واستقبال الإشعارات.
        </p>

        <div className="pt-1">
          <button
            type="button"
            onClick={handleInstallClick}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[#F5D799] via-[#F5C84C] to-[#B68A2E] hover:brightness-110 text-[#111111] font-black text-xs shadow-xl active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>
              {isInstallable 
                ? 'اضغط هنا لتثبيت التطبيق فوراً على الهاتف ➔' 
                : isInstalled
                ? 'التطبيق مثبت مسبقاً — اضغط لعرض إرشادات التثبيت'
                : 'تحميل وتثبيت التطبيق على الشاشة الرئيسية (PWA) ➔'}
            </span>
          </button>
        </div>
      </div>
      {GuideModal}
    </>
  );
};
