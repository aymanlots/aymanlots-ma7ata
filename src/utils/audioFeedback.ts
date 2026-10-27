/**
 * وحدة التغذية الصوتية والاهتزازية للمسح الضوئي
 * تعمل دون أي ملفات خارجية عبر Web Audio API واهتزاز الهاتف
 */

// سياق الصوت (AudioContext) يتم إنشاؤه عند الحاجة لتجنب قيود التشغيل التلقائي في المتصفح
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * إصدار رنة نجاح لطيفة وعالية النبرة (800 هرتز) مع اهتزاز خفيف
 */
export function playSuccessBeep(): void {
  // 1. الاهتزاز
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(100);
    }
  } catch {}

  // 2. النغمة الصوتية
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch {}
}

/**
 * إصدار رنة خطأ تحذيرية منخفضة النبرة (250 هرتز) متبوعة باهتزاز تحذيري مزدوج
 */
export function playErrorBeep(): void {
  // 1. الاهتزاز المزدوج للخطأ
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 60, 120]);
    }
  } catch {}

  // 2. النغمة الصوتية المزدوجة
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + start);

      gain.gain.setValueAtTime(0.35, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + duration);
    };

    playTone(280, 0, 0.1);
    playTone(220, 0.12, 0.15);
  } catch {}
}
