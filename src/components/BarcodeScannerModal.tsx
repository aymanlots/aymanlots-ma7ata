import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  X,
  Scan,
  Keyboard,
  Flashlight,
  RotateCw,
  AlertCircle,
  CheckCircle2,
  Zap,
  Layers,
  MapPin,
  Package,
  User,
  Truck,
  Clock,
} from 'lucide-react';
import { playSuccessBeep, playErrorBeep } from '../utils/audioFeedback';
import { useApp } from '../context/AppContext';
import { Parcel } from '../types/database';
import {
  extractTrackingQueryCode,
  matchesTrackingCode,
  formatTrackingCodeNumeric,
  formatDateTimeStandard,
} from '../utils/logisticsFeatures';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (scannedCode: string) => void;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  defaultBurstMode?: boolean;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'مسح باركود (Code128) أو رمز (QR)',
  subtitle = 'وجه الكاميرا نحو الملصق لعرض جميع معلومات الكولي فوراً',
  placeholder = 'أدخل كود الكولي (مثال: 0000466) أو امسح رمز QR...',
  defaultBurstMode = false,
}) => {
  const { parcels } = useApp();

  const [activeMode, setActiveMode] = useState<'camera' | 'manual'>('camera');
  const [isBurstMode, setIsBurstMode] = useState<boolean>(defaultBurstMode);
  const [scannedHistory, setScannedHistory] = useState<
    { code: string; time: string; parcel?: Parcel }[]
  >([]);
  const [lastScannedFlash, setLastScannedFlash] = useState<string | null>(null);
  const [lastScannedParcel, setLastScannedParcel] = useState<Parcel | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const manualInputRef = useRef<HTMLInputElement>(null);
  const isBurstModeRef = useRef<boolean>(defaultBurstMode);
  const lastScanRef = useRef<{ code: string; timestamp: number }>({ code: '', timestamp: 0 });
  const readerElementId = 'alittihadia-qr-reader';

  useEffect(() => {
    isBurstModeRef.current = isBurstMode;
  }, [isBurstMode]);

  useEffect(() => {
    if (isOpen) {
      setIsBurstMode(defaultBurstMode);
      isBurstModeRef.current = defaultBurstMode;
      setScannedHistory([]);
      setLastScannedFlash(null);
      setLastScannedParcel(null);
      lastScanRef.current = { code: '', timestamp: 0 };
    }
  }, [isOpen, defaultBurstMode]);

  const extractCleanCode = (raw: string): string => {
    return extractTrackingQueryCode(raw);
  };

  const handleSuccessfulScan = (rawText: string) => {
    const code = extractCleanCode(rawText);
    if (!code) {
      playErrorBeep();
      return;
    }

    const now = Date.now();
    // منع تكرار نفس الكود خلال 2.2 ثانية أثناء وضع المسح الجماعي السريع
    if (
      lastScanRef.current.code === code &&
      now - lastScanRef.current.timestamp < 2200
    ) {
      return;
    }
    lastScanRef.current = { code, timestamp: now };

    const matched = parcels.find((p) => matchesTrackingCode(p, code));
    const effectiveCode = matched
      ? formatTrackingCodeNumeric(matched.tracking_code, matched.parcel_number)
      : code;

    playSuccessBeep();
    onScan(matched ? matched.tracking_code : code);

    const timeStr = formatDateTimeStandard(new Date());

    setLastScannedParcel(matched || null);
    setScannedHistory((prev) => [
      { code: effectiveCode, time: timeStr, parcel: matched },
      ...prev.slice(0, 49),
    ]);
    setLastScannedFlash(effectiveCode);
    setTimeout(() => {
      setLastScannedFlash((curr) => (curr === effectiveCode ? null : curr));
    }, 1500);

    if (!isBurstModeRef.current) {
      stopCamera();
      onClose();
    }
  };

  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode(readerElementId, {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
          ],
          verbose: false,
        });
      }

      const qr = html5QrCodeRef.current;
      if (qr.isScanning) {
        return;
      }

      await qr.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: { width: 250, height: 210 },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleSuccessfulScan(decodedText);
        },
        () => {}
      );

      setIsCameraActive(true);

      try {
        const track = (qr as any).getRunningTrackCameraCapabilities?.();
        if (track && track.torch) {
          setHasTorch(true);
        }
      } catch {}
    } catch (err: any) {
      console.warn('Camera start error:', err);
      setIsCameraActive(false);
      const msg = String(err?.message || err).toLowerCase();
      if (msg.includes('permission') || msg.includes('notallowed')) {
        setCameraError(
          'لم يتم منح إذن استخدام الكاميرا. يرجى السماح للتطبيق بالوصول للكاميرا أو استخدام الإدخال اليدوي.'
        );
      } else if (msg.includes('notfound') || msg.includes('device')) {
        setCameraError(
          'لم يتم العثور على كاميرا في هذا الجهاز. يمكنك استخدام الإدخال اليدوي أو قارئ الباركود الخارجي.'
        );
      } else {
        setCameraError('تعذر فتح الكاميرا حالياً. يرجى استخدام حقل الإدخال اليدوي أو قارئ الباركود.');
      }
      setActiveMode('manual');
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (e) {
        console.warn('Camera stop error:', e);
      }
    }
    setIsCameraActive(false);
    setTorchOn(false);
  };

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !isCameraActive) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Failed to toggle torch:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setManualCode('');
      setCameraError(null);

      if (activeMode === 'camera') {
        const timer = setTimeout(() => {
          startCamera();
        }, 150);
        return () => clearTimeout(timer);
      } else {
        setTimeout(() => {
          manualInputRef.current?.focus();
        }, 100);
      }
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, activeMode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      playErrorBeep();
      return;
    }
    handleSuccessfulScan(manualCode);
    setManualCode('');
    if (isBurstMode) {
      setTimeout(() => manualInputRef.current?.focus(), 50);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/90 backdrop-blur-md animate-fadeIn overflow-y-auto"
      dir="rtl"
      onClick={() => {
        stopCamera();
        onClose();
      }}
    >
      <div
        className="w-full max-w-[420px] luxury-card rounded-[24px] overflow-hidden flex flex-col text-right relative max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-white/15 bg-black/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#F5D799] via-[#D4AF37] to-[#9A711C] text-[#140b00] flex items-center justify-center shadow-md shrink-0">
              <Scan className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-xs font-black text-white">{title}</h3>
              <p className="text-[10px] text-white/70">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="btn-cancel p-1.5 rounded-xl text-white/75 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Burst Mode (Mode Scan Rapide en Rafale) Banner Switch */}
        <div className="px-3.5 py-2.5 bg-black/60 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${isBurstMode ? 'text-[#F5C84C] animate-pulse' : 'text-white/50'}`} />
            <div>
              <span className="text-[11px] font-black text-white block">
                وضع المسح الجماعي السريع (En Rafale)
              </span>
              <span className="text-[9px] text-white/65 block">
                مسح متتالي لعشرات الكوليات مع عرض معلومات كل كولي
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setIsBurstMode(true)}
              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black transition ${
                isBurstMode ? 'btn-gold shadow-sm' : 'btn-cancel'
              }`}
            >
              ⚡ مستمر (Rafale)
            </button>
            <button
              type="button"
              onClick={() => setIsBurstMode(false)}
              className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition ${
                !isBurstMode ? 'btn-gold shadow-sm' : 'btn-cancel'
              }`}
            >
              مسح فردي (1)
            </button>
          </div>
        </div>

        {/* Mode Toggle Switcher (Camera vs Manual/Bluetooth Scanner) */}
        <div className="p-2.5 bg-black/40 border-b border-white/10 grid grid-cols-2 gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveMode('camera')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition ${
              activeMode === 'camera' ? 'btn-gold font-black' : 'btn-cancel'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>كاميرا الهاتف</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopCamera();
              setActiveMode('manual');
            }}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition ${
              activeMode === 'manual' ? 'btn-gold font-black' : 'btn-cancel'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>إدخال الكود (مثال: 0000466)</span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3 min-h-0">
          {/* Instant Scan Success Banner */}
          {lastScannedFlash && (
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200 flex items-center justify-between gap-2 animate-fadeIn">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-black">تم المسح بنجاح:</span>
              </div>
              <span className="font-mono font-black text-xs text-white bg-black/40 px-2.5 py-0.5 rounded-lg" dir="ltr">
                {lastScannedFlash}
              </span>
            </div>
          )}

          {/* Full Scanned Parcel Summary Card */}
          {lastScannedParcel && (
            <div className="p-3 rounded-2xl bg-[#1a0f00]/90 border-2 border-[#F5C84C]/65 space-y-2 text-xs animate-fadeIn">
              <div className="flex items-center justify-between border-b border-white/15 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-[#F5C84C]" />
                  <span className="font-black text-[#F5C84C]">
                    كولي #{lastScannedParcel.parcel_number}
                  </span>
                  <span className="font-mono font-black text-white bg-black/60 px-2 py-0.5 rounded-lg border border-[#F5C84C]/40" dir="ltr">
                    {formatTrackingCodeNumeric(lastScannedParcel.tracking_code, lastScannedParcel.parcel_number)}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-white/75" dir="ltr">
                  {formatDateTimeStandard(lastScannedParcel.created_at)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                  <span className="text-[9px] text-white/60 block">📍 منين جاية (الانطلاق):</span>
                  <span className="font-black text-white">{lastScannedParcel.origin_station_name}</span>
                </div>
                <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                  <span className="text-[9px] text-white/60 block">🏁 فين غادية (الوجهة):</span>
                  <span className="font-black text-[#F5C84C]">{lastScannedParcel.destination_station_name}</span>
                </div>
                <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                  <span className="text-[9px] text-white/60 block">👤 شكون مولاها (المرسل):</span>
                  <span className="font-bold text-white block">{lastScannedParcel.sender_name}</span>
                  <span className="font-mono text-[10px] text-white/70" dir="ltr">{lastScannedParcel.sender_phone}</span>
                </div>
                <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                  <span className="text-[9px] text-white/60 block">🎯 المستلم:</span>
                  <span className="font-bold text-white block">{lastScannedParcel.receiver_name}</span>
                  <span className="font-mono text-[10px] text-white/70" dir="ltr">{lastScannedParcel.receiver_phone}</span>
                </div>
              </div>

              <div className="bg-black/50 p-2 rounded-xl border border-white/10 flex items-center justify-between text-[11px]">
                <div>
                  <span className="text-[9px] text-white/60 block">📦 المحتوى والعدد:</span>
                  <span className="font-bold text-white">
                    {lastScannedParcel.description} ({lastScannedParcel.items_count} طرد)
                  </span>
                </div>
                <div className="text-left font-mono">
                  <span className="text-[9px] text-white/60 block">💳 الأداء:</span>
                  <span className="font-black text-[#F5C84C]">
                    {Math.max(0, lastScannedParcel.amount_due - lastScannedParcel.amount_paid) <= 0
                      ? `خالص (${lastScannedParcel.amount_due} ${lastScannedParcel.currency})`
                      : `باقي: ${Math.max(0, lastScannedParcel.amount_due - lastScannedParcel.amount_paid)} ${lastScannedParcel.currency}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Camera Scanner View */}
          {activeMode === 'camera' && (
            <div className="flex flex-col items-center justify-center space-y-2.5">
              {cameraError ? (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2 text-center w-full">
                  <AlertCircle className="w-6 h-6 text-rose-400 mx-auto" />
                  <p className="font-bold">{cameraError}</p>
                  <button
                    type="button"
                    onClick={() => setActiveMode('manual')}
                    className="btn-gold px-4 py-2 rounded-xl font-black text-xs"
                  >
                    الانتقال إلى الإدخال اليدوي
                  </button>
                </div>
              ) : (
                <div
                  className={`relative w-full aspect-square max-w-[250px] bg-black rounded-3xl overflow-hidden border-2 transition-all shadow-inner flex items-center justify-center ${
                    lastScannedFlash
                      ? 'border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.5)]'
                      : 'border-[#F5C84C]/60'
                  }`}
                >
                  <div id={readerElementId} className="w-full h-full" />

                  <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-[#F5C84C]/70 rounded-2xl m-4 flex items-center justify-center">
                    <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-[#F5C84C] to-transparent shadow-[0_0_8px_#F5C84C] animate-pulse" />
                  </div>
                </div>
              )}

              {isCameraActive && (
                <div className="flex items-center justify-center gap-2 w-full">
                  {hasTorch && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${
                        torchOn ? 'btn-gold font-black' : 'btn-cancel'
                      }`}
                    >
                      <Flashlight className="w-3.5 h-3.5" />
                      <span>{torchOn ? 'إطفاء الفلاش' : 'تشغيل الفلاش'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      stopCamera();
                      setTimeout(startCamera, 200);
                    }}
                    className="btn-cancel flex items-center gap-1 px-3 py-1.5 rounded-xl text-[11px] font-bold transition"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>تحديث الكاميرا</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Manual Input View & Hardware Barcode Listener */}
          {activeMode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-[#F5C84C] block">
                  كود الكولي الرقمي (مثال: 0000466) أو رقم الكولي:
                </label>
                <div className="flex gap-1.5">
                  <input
                    ref={manualInputRef}
                    type="text"
                    autoFocus
                    dir="ltr"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-black/60 border border-white/25 focus:border-[#F5C84C] rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-white/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="btn-gold px-4 py-2.5 rounded-xl font-black text-xs shrink-0"
                  >
                    {isBurstMode ? '+ مسح وتالي' : 'عرض الكولي ➔'}
                  </button>
                </div>
                <p className="text-[10px] text-white/65">
                  💡 يمكنك كتابة الكود الرقمي (مثل 0000466) أو مسحه مباشرة لعرض كافة معلومات الكولي.
                </p>
              </div>
            </form>
          )}

          {/* Burst Session Scanned List */}
          {scannedHistory.length > 0 && (
            <div className="bg-black/55 border border-[#F5C84C]/35 rounded-2xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-[#F5C84C] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />
                  <span>الكوليات الممسوحة في هذه الدفعة:</span>
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono font-black text-[11px]">
                  {scannedHistory.length} كولي
                </span>
              </div>
              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-0.5">
                {scannedHistory.map((item, idx) => (
                  <div
                    key={`${item.code}-${idx}`}
                    className="bg-black/50 px-2.5 py-2 rounded-xl border border-white/10 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-[#F5C84C]" dir="ltr">
                        #{scannedHistory.length - idx} — {item.code}
                      </span>
                      <span className="text-[10px] font-mono text-emerald-300" dir="ltr">
                        {item.time} ✓
                      </span>
                    </div>
                    {item.parcel && (
                      <div className="text-[10px] text-white/85 flex items-center justify-between">
                        <span>
                          {item.parcel.origin_station_name} ➔ {item.parcel.destination_station_name}
                        </span>
                        <span>
                          المرسل: {item.parcel.sender_name} | المستلم: {item.parcel.receiver_name}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/15 bg-black/50 shrink-0 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className={`w-full py-2.5 rounded-xl font-black text-xs transition ${
              scannedHistory.length > 0 ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            {scannedHistory.length > 0
              ? `إنهاء المسح الجماعي (تم مسح ${scannedHistory.length} كولي) ✓`
              : 'إغلاق نافذة المسح'}
          </button>
        </div>
      </div>
    </div>
  );
};
