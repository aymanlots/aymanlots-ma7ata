import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { MoneyTransfer } from '../types/database';
import {
  X,
  Banknote,
  Send,
  CheckCircle2,
  MessageCircle,
  Search,
  KeyRound,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface MoneyTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'send' | 'list';
}

export const MoneyTransferModal: React.FC<MoneyTransferModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'send',
}) => {
  const {
    stations,
    selectedStationId,
    userRole,
    userAssignedStationId,
    stationBalances,
    exchangeRate,
    moneyTransfers,
    createMoneyTransfer,
    payoutMoneyTransfer,
  } = useApp();

  const workerStationId = userRole === 'worker' ? (userAssignedStationId || selectedStationId || stations[0]?.id || null) : null;
  const activeStationId =
    workerStationId || (selectedStationId && selectedStationId !== 'all' ? selectedStationId : null);

  const [activeTab, setActiveTab] = useState<'send' | 'list'>(initialTab);
  const [originStationId, setOriginStationId] = useState<string>(
    activeStationId || stations[0]?.id || ''
  );
  const [destStationId, setDestStationId] = useState<string>(
    stations.find(s => s.id !== (activeStationId || stations[0]?.id))?.id || stations[1]?.id || ''
  );
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendCurrency, setSendCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [payoutCurrency, setPayoutCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [commissionAmount, setCommissionAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // تنبيه عندما تكون لاكيس محطة الاستلام فارغة أو ستصبح بالسالب عند الضغط على "تم الاستلام"
  const [pendingPayoutWarningTransfer, setPendingPayoutWarningTransfer] =
    useState<MoneyTransfer | null>(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const defaultOrigin = activeStationId || stations[0]?.id || '';
    setOriginStationId(defaultOrigin);
    const otherStation = stations.find(s => s.id !== defaultOrigin);
    if (otherStation) {
      setDestStationId(otherStation.id);
    }
    const origSt = stations.find(s => s.id === defaultOrigin);
    if (origSt) {
      const c: 'MAD' | 'MRU' = (origSt.currency === 'MRU' || origSt.default_currency === 'MRU' || origSt.country === 'MR') ? 'MRU' : 'MAD';
      setSendCurrency(c);
      setPayoutCurrency(c);
    }
  }, [isOpen, activeStationId, stations]);

  const originStation = stations.find(s => s.id === originStationId);
  const destStation = stations.find(s => s.id === destStationId);

  const numericSend = Number(sendAmount) || 0;
  const numericCommission = Math.max(0, Number(commissionAmount) || 0);

  const payoutAmount = useMemo(() => {
    if (numericSend <= 0) return 0;
    if (sendCurrency === payoutCurrency) return numericSend;
    if (sendCurrency === 'MAD' && payoutCurrency === 'MRU') {
      return Math.round(numericSend * exchangeRate * 100) / 100;
    }
    if (sendCurrency === 'MRU' && payoutCurrency === 'MAD') {
      return exchangeRate > 0 ? Math.round((numericSend / exchangeRate) * 100) / 100 : 0;
    }
    return numericSend;
  }, [numericSend, sendCurrency, payoutCurrency, exchangeRate]);

  // فلترة الحوالات حسب المحطة المختارة (أو عرض الكل إذا كان المختار 'all')
  const scopedTransfers = useMemo(() => {
    let list = moneyTransfers;
    if (activeStationId) {
      list = list.filter(
        t =>
          t.origin_station_id === activeStationId ||
          t.destination_station_id === activeStationId
      );
    }
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      t =>
        t.transfer_code.toLowerCase().includes(q) ||
        t.sender_name.toLowerCase().includes(q) ||
        t.receiver_name.toLowerCase().includes(q) ||
        t.sender_phone.includes(q) ||
        t.receiver_phone.includes(q)
    );
  }, [moneyTransfers, activeStationId, searchQuery]);

  if (!isOpen) return null;

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!originStationId || !destStationId) {
      setFormError('يرجى إضافة محطتين على الأقل لإرسال حوالة بينهما');
      return;
    }
    if (originStationId === destStationId) {
      setFormError('يرجى اختيار محطة استلام مختلفة عن محطة الإرسال');
      return;
    }
    if (!senderName.trim() || !receiverName.trim() || numericSend <= 0) {
      setFormError('يرجى إدخال اسم المرسل والمستلم والمبلغ بشكل صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createMoneyTransfer({
        origin_station_id: originStationId,
        destination_station_id: destStationId,
        sender_name: senderName.trim(),
        sender_phone: senderPhone.trim(),
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        send_amount: numericSend,
        send_currency: sendCurrency,
        payout_amount: payoutAmount,
        payout_currency: payoutCurrency,
        exchange_rate: exchangeRate,
        commission_amount: numericCommission,
        notes: notes.trim() || undefined,
      });

      if (!res.success) {
        setFormError(res.error || 'تعذر تسجيل الحوالة');
        return;
      }

      setSenderName('');
      setSenderPhone('');
      setReceiverName('');
      setReceiverPhone('');
      setSendAmount('');
      setCommissionAmount('0');
      setNotes('');
      setActiveTab('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestPayout = async (transfer: MoneyTransfer) => {
    const destBal =
      stationBalances[transfer.destination_station_id]?.[transfer.payout_currency] || 0;
    const resultingBal = destBal - transfer.payout_amount;

    if (destBal <= 0 || resultingBal < 0) {
      setPendingPayoutWarningTransfer(transfer);
      return;
    }

    await payoutMoneyTransfer(transfer.id);
  };

  const handleConfirmNegativePayout = async () => {
    if (!pendingPayoutWarningTransfer) return;
    const id = pendingPayoutWarningTransfer.id;
    setPendingPayoutWarningTransfer(null);
    await payoutMoneyTransfer(id);
  };

  const sendWhatsAppNotification = (t: MoneyTransfer) => {
    const cleanPhone = t.receiver_phone.replace(/[^0-9]/g, '');
    const msg =
      `💸 *إشعار حوالة مالية - Sahara📦 Express*\n` +
      `رقم الحوالة: *${t.transfer_code}*\n` +
      `من المحطة: ${t.origin_station_name}\n` +
      `إلى المحطة: ${t.destination_station_name}\n` +
      `المرسل: ${t.sender_name}\n` +
      `المستلم: ${t.receiver_name}\n` +
      `المبلغ الجاهز للتسليم: *${t.payout_amount.toLocaleString('en-US')} ${t.payout_currency}*\n` +
      `🔐 كود التسليم: *${t.secret_pin}*`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const pendingCountForScope = scopedTransfers.filter(t => t.status === 'pending').length;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="luxury-card border border-[#F5C84C]/45 rounded-[28px] w-full max-w-[425px] p-4 sm:p-5 shadow-2xl space-y-4 my-4 max-h-[92vh] overflow-y-auto text-right"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#F5C84C] text-[#111111] flex items-center justify-center font-black shrink-0 shadow-md">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                إرسال واستلام الحوالات المالية بين المحطات
              </h3>
              <p className="text-[10px] text-white/75 leading-relaxed">
                عند الإرسال يُضاف المبلغ (+) لصندوق محطة الإرسال، وعند الاستلام يُخصم (−) من صندوق محطة الوصول
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel p-2 rounded-xl shrink-0 cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 bg-black/55 p-1.5 rounded-2xl border border-white/15">
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`py-2.5 px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'send' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>إرسال حوالة جديدة (+)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`py-2.5 px-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'list' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>سجل الحوالات ({scopedTransfers.length})</span>
            {pendingCountForScope > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                {pendingCountForScope}
              </span>
            )}
          </button>
        </div>

        {activeTab === 'send' ? (
          <form onSubmit={handleCreateTransfer} className="space-y-3.5">
            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-500/40 text-xs font-bold text-rose-200">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">
                  من محطة الإرسال (تُزاد فلاكيس +)
                </label>
                <select
                  value={originStationId}
                  disabled={userRole === 'worker'}
                  onChange={e => {
                    if (userRole === 'worker') return;
                    const nextOrigin = e.target.value;
                    setOriginStationId(nextOrigin);
                    if (nextOrigin === destStationId) {
                      const other = stations.find(s => s.id !== nextOrigin);
                      if (other) setDestStationId(other.id);
                    }
                    const st = stations.find(s => s.id === nextOrigin);
                    if (st) {
                      const c: 'MAD' | 'MRU' = (st.currency === 'MRU' || st.default_currency === 'MRU' || st.country === 'MR') ? 'MRU' : 'MAD';
                      setSendCurrency(c);
                    }
                  }}
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#F5C84C] disabled:opacity-75"
                >
                  {(userRole === 'worker' && workerStationId
                    ? stations.filter(s => s.id === workerStationId)
                    : stations
                  ).map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">
                  إلى محطة الاستلام (تُنقص عند الاستلام −)
                </label>
                <select
                  value={destStationId}
                  onChange={e => {
                    const nextDest = e.target.value;
                    setDestStationId(nextDest);
                    const st = stations.find(s => s.id === nextDest);
                    if (st) {
                      const c: 'MAD' | 'MRU' = (st.currency === 'MRU' || st.default_currency === 'MRU' || st.country === 'MR') ? 'MRU' : 'MAD';
                      setPayoutCurrency(c);
                    }
                  }}
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white font-bold focus:outline-none focus:border-[#F5C84C]"
                >
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">اسم المرسل *</label>
                <input
                  type="text"
                  required
                  value={senderName}
                  onChange={e => setSenderName(e.target.value)}
                  placeholder="الاسم الكامل للمرسل"
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">هاتف المرسل</label>
                <input
                  type="text"
                  dir="ltr"
                  value={senderPhone}
                  onChange={e => setSenderPhone(e.target.value)}
                  placeholder="+212..."
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">اسم المستلم *</label>
                <input
                  type="text"
                  required
                  value={receiverName}
                  onChange={e => setReceiverName(e.target.value)}
                  placeholder="الاسم الكامل للمستلم"
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">هاتف المستلم (واتساب)</label>
                <input
                  type="text"
                  dir="ltr"
                  value={receiverPhone}
                  onChange={e => setReceiverPhone(e.target.value)}
                  placeholder="+222..."
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
            </div>

            {/* المبلغ وعملات الإرسال والاستلام */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">
                  المبلغ المودع فلاكيس *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  dir="ltr"
                  value={sendAmount}
                  onChange={e => setSendAmount(e.target.value)}
                  placeholder="200"
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2.5 text-sm font-mono font-black text-[#F5C84C] focus:outline-none focus:border-[#F5C84C]"
                />
              </div>

              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">عملة الإيداع (+)</label>
                <select
                  value={sendCurrency}
                  onChange={e => setSendCurrency(e.target.value as 'MAD' | 'MRU')}
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs font-black text-emerald-400 focus:outline-none focus:border-[#F5C84C]"
                >
                  <option value="MAD">درهم مغربي (MAD)</option>
                  <option value="MRU">أوقية موريتانية (MRU)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">عملة التسليم (−)</label>
                <select
                  value={payoutCurrency}
                  onChange={e => setPayoutCurrency(e.target.value as 'MAD' | 'MRU')}
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3 py-2.5 text-xs font-black text-[#F5C84C] focus:outline-none focus:border-[#F5C84C]"
                >
                  <option value="MAD">درهم مغربي (MAD)</option>
                  <option value="MRU">أوقية موريتانية (MRU)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">
                  عمولة التحويل الإضافية (اختياري)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  dir="ltr"
                  value={commissionAmount}
                  onChange={e => setCommissionAmount(e.target.value)}
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
              <div>
                <label className="block text-xs text-white/90 font-bold mb-1">ملاحظة إضافية (اختياري)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="ملاحظة حول الحوالة..."
                  className="w-full bg-black/65 border border-white/20 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
            </div>

            {/* ملخص الأثر المحاسبي على المحطتين */}
            <div className="bg-black/65 border border-[#D4AF37]/40 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-white/90 font-bold flex items-center gap-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                  يُضاف الآن فلاكيس ({originStation?.name || 'محطة الإرسال'}):
                </span>
                <span dir="ltr" className="text-sm font-black font-mono text-emerald-400">
                  +{(numericSend + numericCommission).toLocaleString('en-US')} {sendCurrency}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs border-t border-white/15 pt-2">
                <span className="text-white/90 font-bold flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" />
                  يُخصم عند &quot;تم الاستلام&quot; من ({destStation?.name || 'محطة الوصول'}):
                </span>
                <span dir="ltr" className="text-sm font-black font-mono text-[#F5C84C]">
                  -{payoutAmount.toLocaleString('en-US')} {payoutCurrency}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-gold w-full py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'جاري تسجيل الحوالة...'
                  : `تأكيد إرسال الحوالة (+${(numericSend + numericCommission).toLocaleString('en-US')} ${sendCurrency})`}
              </span>
            </button>
          </form>
        ) : (
          <div className="space-y-3.5">
            <div className="relative">
              <Search className="w-4 h-4 text-[#F5C84C] absolute right-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم الحوالة (HWL-)، اسم المرسل أو المستلم..."
                className="w-full bg-black/65 border border-white/20 rounded-xl pr-10 pl-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#F5C84C]"
              />
            </div>

            {scopedTransfers.length === 0 ? (
              <div className="text-center py-8 text-xs text-white/75 bg-black/50 rounded-2xl border border-white/15">
                لا توجد حوالات مسجلة لهذه المحطة حالياً
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-0.5">
                {scopedTransfers.map(t => {
                  const isIncomingToActive =
                    activeStationId && t.destination_station_id === activeStationId;
                  const isOutgoingFromActive =
                    activeStationId && t.origin_station_id === activeStationId;
                  const destBal =
                    stationBalances[t.destination_station_id]?.[t.payout_currency] || 0;

                  return (
                    <div
                      key={t.id}
                      className={`bg-black/65 border rounded-2xl p-3.5 space-y-3 ${
                        t.status === 'pending'
                          ? 'border-[#F5C84C]/45'
                          : 'border-emerald-500/40 opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            dir="ltr"
                            className="px-2 py-0.5 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#F5C84C] font-mono text-xs font-black"
                          >
                            {t.transfer_code}
                          </span>
                          {isIncomingToActive && (
                            <span className="px-2 py-0.5 rounded-full bg-black/70 text-[#F5C84C] border border-[#D4AF37]/40 text-[10px] font-black">
                              📥 حوالة واردة لهذه المحطة
                            </span>
                          )}
                          {isOutgoingFromActive && (
                            <span className="px-2 py-0.5 rounded-full bg-black/70 text-[#F5C84C] border border-[#D4AF37]/40 text-[10px] font-black">
                              📤 حوالة صادرة من هذه المحطة
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              t.status === 'paid_out'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {t.status === 'paid_out' ? '✓ تم الاستلام والصرف' : '⏳ بانتظار الاستلام'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => sendWhatsAppNotification(t)}
                          className="btn-cancel px-2.5 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <MessageCircle className="w-3 h-3" />
                          <span>واتساب</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-black/50 p-2.5 rounded-xl border border-white/15">
                        <div>
                          <span className="text-[10px] text-white/75 block">المرسل ({t.origin_station_name})</span>
                          <span className="font-bold text-white">{t.sender_name}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/75 block">المستلم ({t.destination_station_name})</span>
                          <span className="font-bold text-white">{t.receiver_name}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/75 block">أودع في {t.origin_station_name} (+)</span>
                          <span dir="ltr" className="font-mono font-black text-emerald-400">
                            +{(t.send_amount + (t.commission_amount || 0)).toLocaleString('en-US')} {t.send_currency}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-white/75 block">يُسلم في {t.destination_station_name} (−)</span>
                          <span dir="ltr" className="font-mono font-black text-[#F5C84C]">
                            -{t.payout_amount.toLocaleString('en-US')} {t.payout_currency}
                          </span>
                        </div>
                      </div>

                      {t.status === 'pending' ? (
                        <div className="flex flex-col gap-2 pt-1">
                          {userRole !== 'worker' || t.destination_station_id === workerStationId ? (
                            <>
                              <div className="text-[11px] text-white/80 font-bold">
                                رصيد لاكيس {t.destination_station_name} الحالي:{' '}
                                <span
                                  dir="ltr"
                                  className={`font-mono font-black ${
                                    destBal <= 0 ? 'text-rose-400' : 'text-emerald-400'
                                  }`}
                                >
                                  {destBal.toLocaleString('en-US')} {t.payout_currency}
                                </span>
                                {' • '}كود الحوالة: <span className="font-mono text-[#F5C84C]">{t.secret_pin}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRequestPayout(t)}
                                className="btn-gold w-full py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>
                                  تم الاستلام (خصم -{t.payout_amount.toLocaleString('en-US')} {t.payout_currency} من{' '}
                                  {t.destination_station_name})
                                </span>
                              </button>
                            </>
                          ) : (
                            <div className="p-2.5 rounded-xl bg-black/50 border border-amber-500/35 text-[11px] text-amber-300 font-bold flex items-center justify-between gap-2">
                              <span>⏳ مرسلة إلى محطة {t.destination_station_name} (يتم الاستلام والصرف في محطة الوصول فقط)</span>
                              <span className="font-mono text-[#F5C84C]" dir="ltr">PIN: {t.secret_pin}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] text-emerald-400 font-bold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            تم تسليم المبلغ للمستلم وخصمه من لاكيس {t.destination_station_name} بواسطة{' '}
                            {t.paid_out_by || 'المحطة'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* نافذة التنبيه عندما تكون لاكيس محطة الاستلام خاوية أو غير كافية */}
      {pendingPayoutWarningTransfer && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 animate-fadeIn"
          onClick={() => setPendingPayoutWarningTransfer(null)}
        >
          <div
            className="luxury-card border-2 border-rose-500/60 rounded-[26px] p-5 max-w-[410px] w-full shadow-2xl space-y-4 text-right"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle className="w-7 h-7 shrink-0" />
              <div>
                <h4 className="text-sm font-black text-white">
                  تنبيه: لاكيس محطة الاستلام خاوية أو غير كافية!
                </h4>
                <p className="text-xs text-white/80 font-bold">
                  المحطة: {pendingPayoutWarningTransfer.destination_station_name}
                </p>
              </div>
            </div>

            {(() => {
              const curr = pendingPayoutWarningTransfer.payout_currency;
              const currentBal =
                stationBalances[pendingPayoutWarningTransfer.destination_station_id]?.[curr] || 0;
              const afterBal = currentBal - pendingPayoutWarningTransfer.payout_amount;
              return (
                <div className="bg-black/65 border border-rose-500/40 rounded-2xl p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-white/80 font-bold">الرصيد الحالي في الصندوق:</span>
                    <span dir="ltr" className="font-mono font-black text-[#F5C84C]">
                      {currentBal.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/80 font-bold">مبلغ الحوالة المسلم للمستلم:</span>
                    <span dir="ltr" className="font-mono font-black text-rose-400">
                      -{pendingPayoutWarningTransfer.payout_amount.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/15 pt-2">
                    <span className="text-white font-black">رصيد الصندوق بعد التسليم:</span>
                    <span dir="ltr" className="font-mono font-black text-sm text-rose-400">
                      {afterBal.toLocaleString('en-US')} {curr}
                    </span>
                  </div>
                </div>
              );
            })()}

            <p className="text-xs text-white/90 font-bold leading-relaxed">
              هل تريد تأكيد تسليم الحوالة للمستلم وتسجيل رصيد لاكيس المحطة بالسالب؟
            </p>

            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleConfirmNegativePayout}
                className="btn-delete flex-1 py-2.5 rounded-xl font-black text-xs cursor-pointer"
              >
                نعم، تم الاستلام (رصيد سالب)
              </button>
              <button
                type="button"
                onClick={() => setPendingPayoutWarningTransfer(null)}
                className="btn-cancel px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
