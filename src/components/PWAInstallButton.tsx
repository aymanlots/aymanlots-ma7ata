import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, PlusSquare, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running standalone, hide
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-lg shadow-sm transition active:scale-95"
        title="تثبيت التطبيق على هاتفك"
      >
        <Download className="w-3.5 h-3.5 stroke-[2.5]" />
        <span>تثبيت التطبيق</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition active:scale-95"
        >
          <Download className="w-3.5 h-3.5 text-emerald-400" />
          <span>تثبيت على الهاتف</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fadeIn">
            <div className="w-full max-w-sm rounded-2xl bg-[#131C2E] border border-slate-700 p-5 shadow-2xl text-right">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded-full ring-1 ring-amber-500/40 overflow-hidden shrink-0 flex items-center justify-center p-0"
                    style={{ background: 'transparent', borderRadius: '50%', padding: 0, overflow: 'hidden' }}
                  >
                    <img 
                      src="/logo.png" 
                      alt="شعار محطة الاتحادية" 
                      style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover', background: 'transparent', display: 'block' }}
                    />
                  </div>
                  <span>تثبيت "محطة الاتحادية" على الهاتف</span>
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="flex items-start gap-3 bg-[#0B1220] p-3 rounded-xl border border-slate-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">1</span>
                  <p>
                    اضغط على زر المشاركة <Share className="inline w-4 h-4 text-blue-400 mx-1" /> أسفل شاشة المتصفح.
                  </p>
                </div>

                <div className="flex items-start gap-3 bg-[#0B1220] p-3 rounded-xl border border-slate-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">2</span>
                  <p>
                    مرر لأسفل واضغط على <strong className="text-white">"إضافة إلى الشاشة الرئيسية"</strong> <PlusSquare className="inline w-4 h-4 text-emerald-400 mx-1" />.
                  </p>
                </div>

                <div className="flex items-start gap-3 bg-[#0B1220] p-3 rounded-xl border border-slate-800">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold shrink-0">3</span>
                  <p>
                    اضغط على <strong className="text-white">إضافة</strong> في الزاوية العلوية. وسيظهر التطبيق مباشرة على شاشة هاتفك الرئيسية!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-sm font-bold text-white transition"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
