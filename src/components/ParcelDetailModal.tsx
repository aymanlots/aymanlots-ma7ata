import React, { useState, useEffect } from 'react';
import { 
  Parcel, 
  ParcelStatus, 
} from '../types/database';
import { useApp } from '../context/AppContext';
import { openWhatsAppParcelNotification, printOfficialParcelBonPDF } from '../utils/logisticsFeatures';
import { 
  X, 
  Printer, 
  FileText,
  Clock, 
  AlertTriangle, 
  Package, 
  DollarSign, 
  MessageCircle, 
  PlusCircle,
  RotateCcw,
  Share2,
  Check,
  CheckCircle2
} from 'lucide-react';

interface ParcelDetailModalProps {
  parcel: Parcel | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenTicket: (parcel: Parcel) => void;
}

const RETURN_REASONS = [
  'لم يحضر المستلم لاستلام الطرد (تجاوز المدة)',
  'هاتف المستلم مغلق أو خارج التغطية',
  'رفض المستلم استلام الطرد أو دفع المبلغ',
  'طلب المرسل استرجاع الطرد وإلغاء التسليم',
  'عنوان أو محطة وجهة خاطئة',
];

export const ParcelDetailModal: React.FC<ParcelDetailModalProps> = ({
  parcel: parcelProp,
  isOpen,
  onClose,
  onOpenTicket
}) => {
  const { 
    currentWorkspace,
    parcels,
    hideAmounts,
    updateParcelStatus, 
    recordParcelPayment,
    initiateParcelReturn,
    handoverReturnedParcelToSender,
    showToast 
  } = useApp();

  const parcel = parcels.find(p => p.id === parcelProp?.id) || parcelProp;

  const [activeTab, setActiveTab] = useState<'info' | 'status' | 'payments' | 'return'>('info');

  // Status update state
  const [selectedStatus, setSelectedStatus] = useState<ParcelStatus>('registered');
  const [statusNote, setStatusNote] = useState('');
  const [deliveredToInput, setDeliveredToInput] = useState('');
  const [statusCondition, setStatusCondition] = useState<'normal' | 'abnormal'>('normal');
  const [statusConditionNotes, setStatusConditionNotes] = useState('');
  const [showUnpaidWarning, setShowUnpaidWarning] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [copiedTrackingUrl, setCopiedTrackingUrl] = useState(false);

  // Return Parcel state
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [customReturnReason, setCustomReturnReason] = useState('');
  const [returnFeeInput, setReturnFeeInput] = useState('0');
  const [returnNotesInput, setReturnNotesInput] = useState('');
  const [returnedToSenderName, setReturnedToSenderName] = useState('');
  const [returnFeePaidInput, setReturnFeePaidInput] = useState('0');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);

  // Initialize condition when parcel opens
  useEffect(() => {
    if (parcel) {
      setStatusCondition(parcel.condition || 'normal');
      setStatusConditionNotes(parcel.condition_notes || '');
      setReturnedToSenderName(parcel.sender_name || '');
      setReturnFeePaidInput(String(parcel.return_fee || 0));
    }
  }, [parcel]);

  // Payment record state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [payerNameInput, setPayerNameInput] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  if (!isOpen || !parcel) return null;

  const remaining = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
  const isSettled = remaining <= 0;

  const statusNames: Record<ParcelStatus, string> = {
    registered: 'تم التسجيل في المحطة',
    in_transit: 'في الطريق (قيد النقل الدولي)',
    arrived: 'وصلت إلى محطة الوجهة',
    delivered: 'تم التسليم للمستلم',
    return_in_transit: 'في طريق الإرجاع للمرسل',
    returned: 'تم الإرجاع للمرسل',
    cancelled: 'ملغاة',
    pending: 'قيد التسجيل والانتظار'
  };

  const payerTitle = parcel.payer === 'sender' ? 'المرسل' : 'المستلم';

  // Handling Status Change with Warning if Unpaid
  const handleInitiateStatusChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStatus === 'delivered' && remaining > 0 && !showUnpaidWarning) {
      setShowUnpaidWarning(true);
      return;
    }
    executeStatusUpdate();
  };

  const executeStatusUpdate = async () => {
    setIsUpdatingStatus(true);
    try {
      const res = await updateParcelStatus(
        parcel.id,
        selectedStatus,
        {
          delivered_to: deliveredToInput.trim() || parcel.receiver_name,
          notes: statusNote.trim() || undefined,
          condition: statusCondition,
          condition_notes: statusCondition === 'abnormal' ? statusConditionNotes.trim() : undefined
        }
      );

      if (res.success) {
        showToast(`تم تحديث حالة الكولي إلى "${statusNames[selectedStatus]}" بنجاح`, 'success');
        setStatusNote('');
        setShowUnpaidWarning(false);
      } else {
        showToast(res.error || 'تعذر تحديث الحالة', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handling Partial Payment Record
  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (!amt || amt <= 0) {
      showToast('يرجى إدخال مبلغ صحيح', 'error');
      return;
    }

    setIsRecordingPayment(true);
    try {
      const res = await recordParcelPayment(
        parcel.id,
        amt,
        payerNameInput.trim() || (parcel.payer === 'sender' ? parcel.sender_name : parcel.receiver_name),
        paymentNote.trim() || undefined
      );

      if (res.success) {
        showToast(`تم تسجيل دفعة بقيمة ${amt} ${parcel.currency} بنجاح`, 'success');
        setPaymentAmount('');
        setPaymentNote('');
      } else {
        showToast(res.error || 'تعذر تسجيل الدفعة', 'error');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleCopyPublicTrackUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(parcel.tracking_code)}`;
    navigator.clipboard.writeText(url);
    setCopiedTrackingUrl(true);
    showToast('تم نسخ رابط التتبع المباشر للعميل', 'success');
    setTimeout(() => setCopiedTrackingUrl(false), 2500);
  };

  // WhatsApp Link Helper
  const getWhatsAppLink = (rawPhone: string) => {
    const clean = rawPhone.replace(/[^0-9]/g, '');
    return `https://wa.me/${clean}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 animate-fadeIn overflow-y-auto">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

      <div 
        className="w-full max-w-[400px] rounded-[24px] luxury-card border border-[#D4AF37]/65 p-4 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-3.5"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4AF37]/25 pb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-[#F5D799]">
                  كولي #{parcel.parcel_number}
                </h2>
                <span className="font-mono text-[11px] text-[#E6C37A] bg-[#1a0f00] px-2 py-0.5 rounded-lg border border-[#D4AF37]/40">
                  {parcel.tracking_code}
                </span>
              </div>
              <p className="text-[11px] text-[#C8B08A]">
                {parcel.origin_station_name} ➔ {parcel.destination_station_name}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCopyPublicTrackUrl}
              title="نسخ رابط التتبع العام للعميل"
              className="btn-cancel p-1.5 rounded-xl flex items-center gap-1 text-[10px] font-bold px-2"
            >
              {copiedTrackingUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{copiedTrackingUrl ? 'تم النسخ' : 'رابط التتبع'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="btn-cancel p-1.5 rounded-xl"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 bg-black/50 border border-[#D4AF37]/30 rounded-2xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`py-2 text-[10px] font-black rounded-xl transition ${
              activeTab === 'info' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            التفاصيل
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-2 text-[10px] font-black rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'status' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>التتبع ({parcel.status_history?.length || 1})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('payments')}
            className={`py-2 text-[10px] font-black rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'payments' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <DollarSign className="w-3 h-3" />
            <span>الأداء ({isSettled ? 'خالص' : hideAmounts ? '••' : `${remaining}`})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('return')}
            className={`py-2 text-[10px] font-black rounded-xl transition flex items-center justify-center gap-1 ${
              activeTab === 'return' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <RotateCcw className="w-3 h-3" />
            <span>الإرجاع</span>
          </button>
        </div>

        {/* TAB 1: INFO */}
        {activeTab === 'info' && (
          <div className="space-y-3 text-xs">
            {/* Sender & Receiver Card */}
            <div className="grid grid-cols-1 gap-2.5">
              {/* Sender */}
              <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/40 space-y-1">
                <span className="font-bold text-[11px] text-[#E6C37A] block">بيانات المرسل:</span>
                <span className="font-black text-[#FFF8EB] text-sm block">{parcel.sender_name}</span>
                <div className="flex items-center justify-between text-[#C8B08A] font-mono text-[11px] pt-1">
                  <span dir="ltr">{parcel.sender_phone}</span>
                  <a
                    href={getWhatsAppLink(parcel.sender_phone)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[#F5D799] font-bold bg-[#120a00] px-2.5 py-0.5 rounded-lg border border-[#D4AF37]/40"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#F3A952]" />
                    <span>واتساب</span>
                  </a>
                </div>
              </div>

              {/* Receiver */}
              <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/40 space-y-1">
                <span className="font-bold text-[11px] text-[#E6C37A] block">بيانات المستلم:</span>
                <span className="font-black text-[#FFF8EB] text-sm block">{parcel.receiver_name}</span>
                <div className="flex items-center justify-between text-[#C8B08A] font-mono text-[11px] pt-1">
                  <span dir="ltr">{parcel.receiver_phone}</span>
                  <a
                    href={getWhatsAppLink(parcel.receiver_phone)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-[#F5D799] font-bold bg-[#120a00] px-2.5 py-0.5 rounded-lg border border-[#D4AF37]/40"
                  >
                    <MessageCircle className="w-3.5 h-3.5 text-[#F3A952]" />
                    <span>واتساب</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Auto WhatsApp Templates with QR & Direct Tracking Link */}
            <div className="bg-black/55 p-3 rounded-2xl border border-emerald-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-[11px] text-emerald-300 flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                  <span>إشعارات واتساب تلقائية بالـ QR والرابط:</span>
                </span>
                <span className="text-[9px] text-white/65">بنقرة واحدة</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    openWhatsAppParcelNotification(
                      parcel,
                      'registered_sender',
                      currentWorkspace?.custom_brand_name || currentWorkspace?.name
                    )
                  }
                  className="btn-cancel py-2 px-2 rounded-xl text-[10px] font-bold text-right border border-emerald-500/35 text-emerald-200 hover:text-white flex items-center justify-between gap-1"
                >
                  <span>1. وصل الإيداع للمرسل</span>
                  <MessageCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openWhatsAppParcelNotification(
                      parcel,
                      'in_transit_receiver',
                      currentWorkspace?.custom_brand_name || currentWorkspace?.name
                    )
                  }
                  className="btn-cancel py-2 px-2 rounded-xl text-[10px] font-bold text-right border border-emerald-500/35 text-emerald-200 hover:text-white flex items-center justify-between gap-1"
                >
                  <span>2. إشعار الطريق للمستلم</span>
                  <MessageCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openWhatsAppParcelNotification(
                      parcel,
                      'arrived_receiver',
                      currentWorkspace?.custom_brand_name || currentWorkspace?.name
                    )
                  }
                  className="btn-gold py-2 px-2 rounded-xl text-[10px] font-black text-right flex items-center justify-between gap-1"
                >
                  <span>3. إشعار الوصول للمستلم</span>
                  <MessageCircle className="w-3 h-3 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    openWhatsAppParcelNotification(
                      parcel,
                      'delivered_sender',
                      currentWorkspace?.custom_brand_name || currentWorkspace?.name
                    )
                  }
                  className="btn-cancel py-2 px-2 rounded-xl text-[10px] font-bold text-right border border-emerald-500/35 text-emerald-200 hover:text-white flex items-center justify-between gap-1"
                >
                  <span>4. تأكيد التسليم للمرسل</span>
                  <MessageCircle className="w-3 h-3 text-emerald-400 shrink-0" />
                </button>
              </div>
            </div>

            {/* Goods Details */}
            <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#C8B08A] block">بيان ووصف البضاعة:</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#120a00] text-[#F5D799] border border-[#D4AF37]/40">
                  {(parcel.condition || 'normal') === 'normal' ? '✓ عادي (سليم)' : '⚠ غير عادي'}
                </span>
              </div>

              <p className="text-[#FFF8EB] text-xs leading-relaxed bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30">
                {parcel.description}
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25 text-center">
                  <span className="text-[#C8B08A] block">العدد / الكمية</span>
                  <span className="font-bold text-[#FFF8EB]">{parcel.items_count} طرد</span>
                </div>
                <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25 text-center">
                  <span className="text-[#C8B08A] block">الوزن</span>
                  <span className="font-bold text-[#FFF8EB]">{parcel.weight_kg ? `${parcel.weight_kg} كغ` : 'غير محدد'}</span>
                </div>
                <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25 text-center">
                  <span className="text-[#C8B08A] block">محطة الانطلاق</span>
                  <span className="font-bold text-[#FFF8EB]">{parcel.origin_station_name}</span>
                </div>
                <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25 text-center">
                  <span className="text-[#C8B08A] block">محطة الوصول</span>
                  <span className="font-bold text-[#FFF8EB]">{parcel.destination_station_name}</span>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="bg-gradient-to-r from-[#6E4720]/40 to-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/50 flex items-center justify-between">
              <div>
                <span className="text-[#C8B08A] block text-[10px]">المبلغ الإجمالي ({payerTitle}):</span>
                <span className="text-base font-black text-[#FFF8EB]">
                  {hideAmounts ? '••••' : parcel.amount_due} {parcel.currency}
                </span>
              </div>
              <div className="text-left">
                <span className="text-[#C8B08A] block text-[10px]">المتبقي للتحصيل:</span>
                <span className={`text-base font-black font-mono ${remaining > 0 ? 'text-rose-400' : 'text-[#F5D799]'}`}>
                  {hideAmounts ? '••••' : remaining} {parcel.currency}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: STATUS & TRACKING TIMELINE */}
        {activeTab === 'status' && (
          <div className="space-y-3.5 text-xs">
            <form onSubmit={handleInitiateStatusChange} className="bg-[#1a0f00]/80 p-3.5 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
              <span className="font-bold text-[#F5D799] block">تحديث حالة التتبع الآن:</span>
              
              <div className="grid grid-cols-2 gap-2">
                {(['registered', 'in_transit', 'arrived', 'delivered'] as ParcelStatus[]).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => {
                      setSelectedStatus(st);
                      setShowUnpaidWarning(false);
                    }}
                    className={`p-2 rounded-xl text-center font-black text-[11px] transition ${
                      selectedStatus === st ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    {statusNames[st]}
                  </button>
                ))}
              </div>

              {selectedStatus === 'delivered' && (
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">اسم الشخص المستلم فعلياً:</label>
                  <input
                    type="text"
                    placeholder={parcel.receiver_name}
                    value={deliveredToInput}
                    onChange={e => setDeliveredToInput(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              )}

              <div>
                <label className="block text-[#C8B08A] mb-1 text-[11px]">ملاحظة أو بيان مرحلة النقل (اختياري):</label>
                <input
                  type="text"
                  placeholder="مثال: تم العبور من معبر الكركرات الدولي بنجاح"
                  value={statusNote}
                  onChange={e => setStatusNote(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              {showUnpaidWarning && (
                <div className="bg-rose-950/60 border border-rose-500/40 p-3 rounded-xl space-y-2 animate-fadeIn">
                  <div className="flex items-center gap-2 text-rose-300 font-bold">
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <span>تنبيه هام: يوجد رصيد غير مدفوع على هذا الكولي!</span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={executeStatusUpdate}
                      disabled={isUpdatingStatus}
                      className="btn-delete px-3 py-1.5 rounded-xl font-bold text-xs"
                    >
                      تأكيد التسليم
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowUnpaidWarning(false)}
                      className="btn-cancel px-3 py-1.5 rounded-xl text-xs font-bold"
                    >
                      إلغاء
                    </button>
                  </div>
                </div>
              )}

              {!showUnpaidWarning && (
                <button
                  type="submit"
                  disabled={isUpdatingStatus}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs transition"
                >
                  {isUpdatingStatus ? 'جاري التحديث...' : 'حفظ ونشر الحالة الجديدة'}
                </button>
              )}
            </form>

            {/* Golden Timeline List */}
            <div className="bg-[#1a0f00]/80 p-3.5 rounded-2xl border border-[#D4AF37]/45 space-y-3">
              <span className="font-bold text-[#F5D799] block text-[11px]">سجل التتبع والمراحل:</span>
              
              <div className="space-y-3 relative before:absolute before:right-2.5 before:top-2 before:bottom-2 before:w-[1.5px] before:bg-[#D4AF37]/60">
                {(parcel.status_history || []).map((entry, idx) => (
                  <div key={idx} className="relative pr-7 space-y-1">
                    <div className="absolute right-0.5 top-0.5 w-4 h-4 rounded-full bg-[#F39C3D] text-[#1a0f00] flex items-center justify-center text-[9px] font-black">
                      ✓
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#FFF8EB]">{statusNames[entry.status] || entry.status}</span>
                      <span className="text-[10px] text-[#C8B08A] font-mono" dir="ltr">
                        {new Date(entry.timestamp).toLocaleString('ar-MA')}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="text-[11px] text-[#F5D799] bg-[#120a00] p-2 rounded-lg mt-1 border border-[#D4AF37]/30">
                        {entry.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PAYMENTS & BALANCE */}
        {activeTab === 'payments' && (
          <div className="space-y-3.5 text-xs">
            <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 grid grid-cols-3 gap-2 text-center">
              <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25">
                <span className="text-[#C8B08A] block text-[10px]">الإجمالي</span>
                <span className="font-black text-[#FFF8EB] text-xs">{hideAmounts ? '••••' : parcel.amount_due} {parcel.currency}</span>
              </div>
              <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25">
                <span className="text-[#C8B08A] block text-[10px]">المدفوع</span>
                <span className="font-black text-[#F5D799] text-xs">{hideAmounts ? '••••' : parcel.amount_paid} {parcel.currency}</span>
              </div>
              <div className="bg-[#120a00] p-2 rounded-xl border border-[#D4AF37]/25">
                <span className="text-[#C8B08A] block text-[10px]">المتبقي</span>
                <span className={`font-black text-xs ${remaining > 0 ? 'text-rose-400' : 'text-[#F5D799]'}`}>
                  {hideAmounts ? '••••' : remaining} {parcel.currency}
                </span>
              </div>
            </div>

            {remaining > 0 && (
              <form onSubmit={handleAddPayment} className="bg-[#1a0f00]/80 p-3.5 rounded-2xl border border-[#D4AF37]/50 space-y-2.5">
                <span className="font-bold text-[#F5D799] flex items-center gap-1.5 text-xs">
                  <PlusCircle className="w-4 h-4 text-[#F3A952]" />
                  <span>تسجيل دفعة نقدية جديدة ({payerTitle}):</span>
                </span>

                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={remaining}
                  placeholder={`المبلغ المستلم (أقصى حد: ${remaining})`}
                  required
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#D4AF37]"
                />

                <button
                  type="submit"
                  disabled={isRecordingPayment}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs transition"
                >
                  {isRecordingPayment ? 'جاري التسجيل...' : 'تأكيد استلام الدفعة وتحديث الرصيد'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 4: RETURN PARCEL TO SENDER (Phase 3) */}
        {activeTab === 'return' && (
          <div className="space-y-3 text-xs">
            {parcel.status === 'returned' ? (
              <div className="bg-emerald-950/50 border border-emerald-500/40 p-4 rounded-2xl text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="font-black text-emerald-300 text-sm">تم إرجاع هذا الكولي وتسليمه للمرسل</h4>
                <p className="text-[11px] text-white/80">
                  المستلم (المرسل): <strong>{parcel.returned_to_sender_name || parcel.sender_name}</strong>
                </p>
                {parcel.return_reason && (
                  <p className="text-[11px] text-amber-300">سبب الإرجاع: {parcel.return_reason}</p>
                )}
              </div>
            ) : parcel.status === 'return_in_transit' || parcel.is_returning ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setIsProcessingReturn(true);
                  try {
                    await handoverReturnedParcelToSender(parcel.id, {
                      senderReceivedByName: returnedToSenderName.trim() || parcel.sender_name,
                      returnFeePaid: parseFloat(returnFeePaidInput) || 0,
                      notes: returnNotesInput.trim() || undefined,
                    });
                  } finally {
                    setIsProcessingReturn(false);
                  }
                }}
                className="bg-[#1a0f00]/90 p-3.5 rounded-2xl border border-amber-500/50 space-y-2.5"
              >
                <div className="flex items-center gap-2 text-amber-300 font-black">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>الطرد في مسار الإرجاع — تأكيد التسليم للمرسل</span>
                </div>
                {parcel.return_reason && (
                  <p className="text-[11px] text-white/80 bg-black/50 p-2 rounded-xl">
                    سبب الإرجاع المسجل: {parcel.return_reason}
                  </p>
                )}
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">اسم المرسل المستلم للطرد المرتجع:</label>
                  <input
                    type="text"
                    required
                    value={returnedToSenderName}
                    onChange={e => setReturnedToSenderName(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">
                    رسوم الإرجاع المحصلة نقداً ({parcel.currency}) (اختياري):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={returnFeePaidInput}
                    onChange={e => setReturnFeePaidInput(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isProcessingReturn}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs"
                >
                  {isProcessingReturn ? 'جاري التأكيد...' : 'تأكيد تسليم الطرد المرتجع للمرسل'}
                </button>
              </form>
            ) : (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const finalReason = customReturnReason.trim() || returnReason;
                  setIsProcessingReturn(true);
                  try {
                    await initiateParcelReturn(parcel.id, {
                      returnReason: finalReason,
                      returnNotes: returnNotesInput.trim() || undefined,
                      returnFee: parseFloat(returnFeeInput) || 0,
                    });
                  } finally {
                    setIsProcessingReturn(false);
                  }
                }}
                className="bg-[#1a0f00]/80 p-3.5 rounded-2xl border border-[#D4AF37]/45 space-y-2.5"
              >
                <div className="flex items-center gap-2 text-[#F5D799] font-black">
                  <RotateCcw className="w-4 h-4 text-[#F3A952]" />
                  <span>إرجاع الطرد غير المستلم إلى المرسل ({parcel.origin_station_name})</span>
                </div>
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">سبب الإرجاع الإجباري *:</label>
                  <select
                    value={returnReason}
                    onChange={e => setReturnReason(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs"
                  >
                    {RETURN_REASONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">أو كتابة سبب مخصص / ملاحظات:</label>
                  <input
                    type="text"
                    placeholder="تفاصيل إضافية حول سبب الإرجاع..."
                    value={customReturnReason}
                    onChange={e => setCustomReturnReason(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">رسوم الإرجاع المقررة ({parcel.currency}) (اختياري):</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={returnFeeInput}
                    onChange={e => setReturnFeeInput(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono text-xs"
                    dir="ltr"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isProcessingReturn}
                  className="btn-gold w-full py-2.5 rounded-xl font-black text-xs"
                >
                  {isProcessingReturn ? 'جاري التحويل...' : 'بدء إرجاع الكولي إلى المرسل'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-[#D4AF37]/25 flex flex-wrap justify-between items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenTicket(parcel)}
            className="btn-gold flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs transition active:scale-95 shadow-sm"
          >
            <Printer className="w-4 h-4 stroke-[2.5]" />
            <span>ملصق 10×10</span>
          </button>

          <button
            type="button"
            onClick={() =>
              printOfficialParcelBonPDF(parcel, {
                name: currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'محطة الاتحادية',
                subtitle: currentWorkspace?.custom_brand_subtitle || 'اللوجيستيك والنقل الدولي',
                phone: currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || '',
                logoUrl: currentWorkspace?.custom_brand_logo_url || '',
              })
            }
            className="btn-cancel flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl font-black text-xs border border-[#F5C84C]/50 text-[#F5C84C] hover:text-white transition"
          >
            <FileText className="w-4 h-4" />
            <span>بون الكولي PDF</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="btn-cancel px-4 py-2.5 rounded-xl font-bold text-xs"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
