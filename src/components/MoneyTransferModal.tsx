import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { MoneyTransfer } from '../types/database';
import QRCode from 'qrcode';
import {
  X,
  ArrowRightLeft,
  Plus,
  CheckCircle2,
  KeyRound,
  Printer,
  MessageCircle,
  Search,
  MapPin,
  Lock,
} from 'lucide-react';

interface MoneyTransferModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoneyTransferModal: React.FC<MoneyTransferModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentWorkspace,
    currentUser,
    stations,
    selectedStationId,
    exchangeRate,
    setExchangeRate,
    hideAmounts,
    createTransaction,
    showToast,
  } = useApp();

  const storageKey = `alittihadia_hawala_transfers_${currentWorkspace?.id || 'default'}`;

  const [transfers, setTransfers] = useState<MoneyTransfer[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setTransfers(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  const saveTransfers = (list: MoneyTransfer[]) => {
    setTransfers(list);
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch {}
  };

  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid_out'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // New Transfer Form State
  const [originStationId, setOriginStationId] = useState(
    selectedStationId || stations[0]?.id || ''
  );
  const [destinationStationId, setDestinationStationId] = useState(
    stations.find((s) => s.id !== (selectedStationId || stations[0]?.id))?.id ||
      stations[1]?.id ||
      ''
  );
  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const [sendAmount, setSendAmount] = useState('1000');
  const [sendCurrency, setSendCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [commissionAmount, setCommissionAmount] = useState('30');
  const [payoutCurrency, setPayoutCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Payout PIN verification state
  const [payoutTarget, setPayoutTarget] = useState<MoneyTransfer | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [isPayingOut, setIsPayingOut] = useState(false);

  // Calculated payout amount
  const calculatedPayout = useMemo(() => {
    const amt = Math.max(0, parseFloat(sendAmount) || 0);
    if (sendCurrency === payoutCurrency) return amt;
    if (sendCurrency === 'MAD' && payoutCurrency === 'MRU') {
      return Math.round(amt * (exchangeRate || 3.8));
    }
    if (sendCurrency === 'MRU' && payoutCurrency === 'MAD') {
      return Math.round((amt / (exchangeRate || 3.8)) * 100) / 100;
    }
    return amt;
  }, [sendAmount, sendCurrency, payoutCurrency, exchangeRate]);

  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          t.transfer_code.toLowerCase().includes(q) ||
          t.sender_name.toLowerCase().includes(q) ||
          t.receiver_name.toLowerCase().includes(q) ||
          t.sender_phone.includes(q) ||
          t.receiver_phone.includes(q)
        );
      }
      return true;
    });
  }, [transfers, statusFilter, searchQuery]);

  if (!isOpen) return null;

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(sendAmount) || 0;
    const comm = parseFloat(commissionAmount) || 0;

    if (!senderName.trim() || !receiverName.trim()) {
      showToast('يرجى إدخال اسم المرسل والمستلم', 'error');
      return;
    }
    if (amt <= 0) {
      showToast('يرجى إدخال مبلغ صحيح للحوالة', 'error');
      return;
    }
    if (originStationId === destinationStationId) {
      showToast('يرجى اختيار محطة وصول مختلفة عن محطة الإرسال', 'error');
      return;
    }

    const originSt = stations.find((s) => s.id === originStationId);
    const destSt = stations.find((s) => s.id === destinationStationId);
    const randomPin = String(Math.floor(1000 + Math.random() * 9000));
    const code = `HWL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    setIsSubmitting(true);
    try {
      const totalCollected = Math.round((amt + comm) * 100) / 100;

      // Record Cash In at Origin Station Cashbox
      await createTransaction({
        station_id: originStationId,
        type: 'cash_in',
        amount: totalCollected,
        currency: sendCurrency,
        phone_number: senderPhone.trim(),
        note: senderName.trim(),
        reason: `إرسال حوالة أمانة [${code}] من ${senderName.trim()} إلى ${receiverName.trim()} (${destSt?.name || ''}) — المبلغ: ${amt} + العمولة: ${comm}`,
      });

      const created: MoneyTransfer = {
        id: `hwl-${Date.now()}`,
        workspace_id: currentWorkspace?.id || 'default',
        transfer_code: code,
        secret_pin: randomPin,
        origin_station_id: originStationId,
        origin_station_name: originSt?.name || 'الداخلة',
        destination_station_id: destinationStationId,
        destination_station_name: destSt?.name || 'نواذيبو',
        sender_name: senderName.trim(),
        sender_phone: senderPhone.trim(),
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        send_amount: amt,
        send_currency: sendCurrency,
        commission_amount: comm,
        payout_amount: calculatedPayout,
        payout_currency: payoutCurrency,
        status: 'pending',
        created_by_name: currentUser?.name || 'المدير',
        created_at: new Date().toISOString(),
        notes: notes.trim() || undefined,
      };

      saveTransfers([created, ...transfers]);
      showToast(
        `تم تسجيل الحوالة [${code}] وإيداع ${totalCollected} ${sendCurrency} في الصندوق! الكود السري: ${randomPin}`,
        'success'
      );
      setSenderName('');
      setSenderPhone('');
      setReceiverName('');
      setReceiverPhone('');
      setNotes('');
      setActiveTab('list');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutTarget) return;

    if (pinInput.trim() !== payoutTarget.secret_pin) {
      showToast('الكود السري (PIN) غير صحيح! يرجى التحقق من الكود مع المرسل أو المستلم', 'error');
      return;
    }

    setIsPayingOut(true);
    try {
      await createTransaction({
        station_id: payoutTarget.destination_station_id,
        type: 'cash_out',
        amount: payoutTarget.payout_amount,
        currency: payoutTarget.payout_currency,
        phone_number: payoutTarget.receiver_phone,
        note: payoutTarget.receiver_name,
        reason: `صرف وتسليم حوالة أمانة [${payoutTarget.transfer_code}] للمستفيد ${payoutTarget.receiver_name}`,
      });

      const updated = transfers.map((t) =>
        t.id === payoutTarget.id
          ? {
              ...t,
              status: 'paid_out' as const,
              paid_out_at: new Date().toISOString(),
              paid_out_by_name: currentUser?.name || 'المسؤول',
            }
          : t
      );

      saveTransfers(updated);
      showToast(
        `تم صرف وتسليم الحوالة [${payoutTarget.transfer_code}] بقيمة ${payoutTarget.payout_amount} ${payoutTarget.payout_currency} بنجاح!`,
        'success'
      );
      setPayoutTarget(null);
      setPinInput('');
    } finally {
      setIsPayingOut(false);
    }
  };

  const handleSendWhatsAppHawala = (t: MoneyTransfer, target: 'sender' | 'receiver') => {
    const rawPhone = target === 'sender' ? t.sender_phone : t.receiver_phone;
    const cleanPhone = (rawPhone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      showToast('رقم الهاتف غير متوفر', 'error');
      return;
    }

    const wsName =
      currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'إكسبريس الصحراء لوجستيك';
    const msg =
      `💸 *${wsName} — سند حوالة وأمانة مالية*\n` +
      `• *رقم الحوالة:* ${t.transfer_code}\n` +
      `• *الكود السري للاستلام (PIN):* *${t.secret_pin}*\n` +
      `• *من محطة:* ${t.origin_station_name} ➔ *إلى محطة:* ${t.destination_station_name}\n` +
      `• *المرسل:* ${t.sender_name}\n` +
      `• *المستفيد:* ${t.receiver_name}\n` +
      `• *المبلغ الصافي للتسليم:* *${t.payout_amount} ${t.payout_currency}*\n` +
      `• *الحالة:* ${t.status === 'paid_out' ? '✅ تم التسليم' : '⏳ جاهزة للاستلام بالكود السري'}`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePrintHawalaReceipt = async (t: MoneyTransfer) => {
    let qrUrl = '';
    try {
      qrUrl = await QRCode.toDataURL(`${t.transfer_code}|PIN:${t.secret_pin}`, {
        width: 140,
        margin: 1,
      });
    } catch {}

    const wsName =
      currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'إكسبريس الصحراء لوجستيك';
    const wsPhone = currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || '';
    const logoSrc = currentWorkspace?.custom_brand_logo_url?.trim()
      ? currentWorkspace.custom_brand_logo_url.trim()
      : `${window.location.origin}/logo.png`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>وصل حوالة مالية - ${t.transfer_code}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; font-family: 'Cairo', 'Tajawal', sans-serif; }
    body { width: 76mm; margin: 0 auto; padding: 6px; color: #000; background: #fff; font-size: 12px; }
    .box { border: 2px solid #000; border-radius: 8px; padding: 8px; }
    .hdr { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px; }
    .logo { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; border: 1.5px solid #000; margin: 0 auto 4px; display: block; background: #fff; }
    .pin { background: #000; color: #fff; text-align: center; padding: 6px; border-radius: 6px; font-size: 16px; font-weight: 900; font-family: monospace; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 11px; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:8px;text-align:center;">
    <button onclick="window.print()" style="padding:6px 16px;background:#000;color:#F5C84C;border:none;border-radius:6px;font-weight:900;cursor:pointer;">🖨️ طباعة وصل الحوالة (PDF)</button>
  </div>
  <div class="box">
    <div class="hdr">
      <img src="${logoSrc}" alt="${wsName}" class="logo" onerror="this.style.display='none'" />
      <div style="font-size:15px;font-weight:900;">${wsName}</div>
      ${wsPhone ? `<div dir="ltr" style="font-size:10px;font-family:monospace;font-weight:800;">${wsPhone}</div>` : ''}
      <div style="font-size:11px;font-weight:800;">سند أمانة وتحويل مالي (HAWALA)</div>
      <div style="font-family:monospace;font-weight:900;margin-top:2px;">${t.transfer_code}</div>
    </div>
    <div class="pin">الكود السري PIN: ${t.secret_pin}</div>
    <div class="row"><span>من محطة:</span><strong>${t.origin_station_name}</strong></div>
    <div class="row"><span>إلى محطة:</span><strong>${t.destination_station_name}</strong></div>
    <div class="row"><span>المرسل:</span><strong>${t.sender_name}</strong></div>
    <div class="row"><span>المستفيد:</span><strong>${t.receiver_name}</strong></div>
    <hr style="border:1px dashed #000;" />
    <div class="row"><span>المبلغ المرسل:</span><strong style="font-family:monospace;">${t.send_amount} ${t.send_currency}</strong></div>
    <div class="row"><span>العمولة:</span><strong style="font-family:monospace;">${t.commission_amount} ${t.send_currency}</strong></div>
    <div class="row" style="font-size:13px;"><span>الصافي للتسليم:</span><strong style="font-family:monospace;">${t.payout_amount} ${t.payout_currency}</strong></div>
    ${qrUrl ? `<div style="text-align:center;margin-top:8px;"><img src="${qrUrl}" style="width:95px;height:95px;" /></div>` : ''}
  </div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/85 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] luxury-card rounded-[24px] p-4 shadow-2xl text-right overflow-hidden relative my-4 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0 gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#F5C84C]/20 border border-[#F5C84C]/50 text-[#F5C84C] flex items-center justify-center shrink-0">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white">
                نظام الأمانة والتحويلات المالية (الحوالة)
              </h3>
              <p className="text-[10px] text-white/75">
                تحويل الأموال بين المحطات بكود سري (PIN) وربط مباشر بالصندوق
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn-cancel p-2 rounded-xl transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-1.5 my-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('list')}
            className={`py-2 rounded-xl text-xs font-black transition ${
              activeTab === 'list' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            سجل الحوالات ({transfers.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1 transition ${
              activeTab === 'new' ? 'btn-gold' : 'btn-cancel'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إرسال حوالة جديدة</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 text-xs min-h-0">
          {activeTab === 'new' ? (
            <form onSubmit={handleCreateTransfer} className="space-y-3">
              <div className="bg-black/50 p-3 rounded-2xl border border-white/15 space-y-2">
                <span className="font-black text-[#F5C84C] block">1. مسار الحوالة بين المحطات:</span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-white/70 block mb-1">محطة الإيداع:</label>
                    <select
                      value={originStationId}
                      onChange={(e) => setOriginStationId(e.target.value)}
                      className="w-full bg-black/70 border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold"
                    >
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.city})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/70 block mb-1">محطة التسليم:</label>
                    <select
                      value={destinationStationId}
                      onChange={(e) => setDestinationStationId(e.target.value)}
                      className="w-full bg-black/70 border border-white/20 rounded-xl px-2.5 py-2 text-white text-xs font-bold"
                    >
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.city})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-white/15 space-y-2">
                <span className="font-black text-[#F5C84C] block">2. المرسل والمستفيد:</span>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="اسم المرسل *"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="bg-black/70 border border-white/20 rounded-xl px-3 py-2 text-white text-xs"
                  />
                  <input
                    type="tel"
                    placeholder="هاتف المرسل"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    dir="ltr"
                    className="bg-black/70 border border-white/20 rounded-xl px-3 py-2 text-white font-mono text-xs"
                  />
                  <input
                    type="text"
                    required
                    placeholder="اسم المستفيد (المستلم) *"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="bg-black/70 border border-white/20 rounded-xl px-3 py-2 text-white text-xs"
                  />
                  <input
                    type="tel"
                    placeholder="هاتف المستفيد"
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(e.target.value)}
                    dir="ltr"
                    className="bg-black/70 border border-white/20 rounded-xl px-3 py-2 text-white font-mono text-xs"
                  />
                </div>
              </div>

              <div className="bg-black/50 p-3 rounded-2xl border border-[#F5C84C]/40 space-y-2.5">
                <span className="font-black text-[#F5C84C] block">
                  3. المبلغ، العمولة، وعملة التسليم:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-white/70 block mb-1">المبلغ المرسل *</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      className="w-full bg-black/70 border border-white/25 rounded-xl px-2.5 py-2 text-white font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/70 block mb-1">عملة الإيداع</label>
                    <select
                      value={sendCurrency}
                      onChange={(e) => setSendCurrency(e.target.value as 'MAD' | 'MRU')}
                      className="w-full bg-black/70 border border-white/25 rounded-xl px-2 py-2 text-white font-mono font-bold text-xs"
                    >
                      <option value="MAD">MAD</option>
                      <option value="MRU">MRU</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-white/70 block mb-1">عمولة التحويل</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={commissionAmount}
                      onChange={(e) => setCommissionAmount(e.target.value)}
                      className="w-full bg-black/70 border border-white/25 rounded-xl px-2.5 py-2 text-[#F5C84C] font-mono font-bold text-xs"
                    />
                  </div>
                </div>

                <div className="bg-black/65 p-2.5 rounded-xl border border-emerald-500/35 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-white/70 block">عملة التسليم في الوجهة:</span>
                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={() => setPayoutCurrency('MAD')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                            payoutCurrency === 'MAD' ? 'btn-gold' : 'btn-cancel'
                          }`}
                        >
                          درهم MAD
                        </button>
                        <button
                          type="button"
                          onClick={() => setPayoutCurrency('MRU')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${
                            payoutCurrency === 'MRU' ? 'btn-gold' : 'btn-cancel'
                          }`}
                        >
                          أوقية MRU
                        </button>
                      </div>
                    </div>
                    <div className="text-left">
                      <span className="text-[10px] text-emerald-300 block">الصافي للتسليم:</span>
                      <span className="text-base font-black font-mono text-emerald-400" dir="ltr">
                        {calculatedPayout} {payoutCurrency}
                      </span>
                    </div>
                  </div>

                  {sendCurrency !== payoutCurrency && (
                    <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-[#F5C84C] font-bold">
                        سعر الصرف اليدوي (1 درهم = أوقية):
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        dir="ltr"
                        value={exchangeRate}
                        onChange={(e) => {
                          const num = parseFloat(e.target.value);
                          if (!isNaN(num) && num > 0) {
                            setExchangeRate(num);
                          }
                        }}
                        className="w-24 bg-black/80 border border-[#F5C84C]/60 rounded-lg px-2 py-1 text-center font-mono font-black text-white text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-gold w-full py-3 rounded-2xl font-black text-xs shadow-lg"
              >
                {isSubmitting
                  ? 'جاري تسجيل الحوالة...'
                  : 'تأكيد الحوالة وتوليد الكود السري (PIN) ➔'}
              </button>
            </form>
          ) : (
            <>
              {/* Search & Status Filter */}
              <div className="bg-black/45 p-2.5 rounded-2xl border border-white/15 space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث برقم الحوالة أو اسم المرسل / المستفيد..."
                    className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-xs text-white pl-8"
                  />
                  <Search className="w-3.5 h-3.5 text-[#F5C84C] absolute left-2.5 top-1/2 -translate-y-1/2" />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
                    className={`py-1.5 rounded-xl text-[10px] font-black ${
                      statusFilter === 'all' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    الكل ({transfers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('pending')}
                    className={`py-1.5 rounded-xl text-[10px] font-black ${
                      statusFilter === 'pending' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    قيد الانتظار ({transfers.filter((t) => t.status === 'pending').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('paid_out')}
                    className={`py-1.5 rounded-xl text-[10px] font-black ${
                      statusFilter === 'paid_out' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    تم تسليمها ({transfers.filter((t) => t.status === 'paid_out').length})
                  </button>
                </div>
              </div>

              {filteredTransfers.length === 0 ? (
                <div className="bg-black/45 p-6 rounded-2xl border border-white/15 text-center space-y-2">
                  <ArrowRightLeft className="w-8 h-8 text-[#F5C84C] mx-auto" />
                  <p className="font-bold text-white">لا توجد حوالات مالية مسجلة</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('new')}
                    className="btn-gold px-4 py-2 rounded-xl font-black text-xs"
                  >
                    + إرسال أول حوالة مالية
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredTransfers.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-2xl border space-y-2 ${
                        t.status === 'pending'
                          ? 'bg-black/60 border-[#F5C84C]/50'
                          : 'bg-black/45 border-emerald-500/35'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-xs text-[#F5C84C]">
                              {t.transfer_code}
                            </span>
                            <span className="px-2 py-0.5 rounded-lg bg-black/70 border border-white/15 font-mono text-[10px] text-white flex items-center gap-1">
                              <KeyRound className="w-3 h-3 text-[#F5C84C]" />
                              <span>PIN: {hideAmounts ? '••••' : t.secret_pin}</span>
                            </span>
                          </div>
                          <span className="text-[10px] text-white/70 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-[#F5C84C]" />
                            <span>
                              {t.origin_station_name} ➔ {t.destination_station_name}
                            </span>
                          </span>
                        </div>

                        <div className="text-left">
                          <span className="font-mono font-black text-sm text-emerald-400 block" dir="ltr">
                            {hideAmounts ? '••••' : t.payout_amount} {t.payout_currency}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-black ${
                              t.status === 'paid_out'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {t.status === 'paid_out' ? '✓ تم التسليم' : '⏳ جاهزة للصرف'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 bg-black/40 p-2 rounded-xl border border-white/10 text-[11px]">
                        <div>
                          <span className="text-white/60 text-[9px] block">المرسل:</span>
                          <span className="font-bold text-white">{t.sender_name}</span>
                        </div>
                        <div>
                          <span className="text-white/60 text-[9px] block">المستفيد:</span>
                          <span className="font-bold text-[#F5C84C]">{t.receiver_name}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 pt-1">
                        {t.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => {
                              setPayoutTarget(t);
                              setPinInput('');
                            }}
                            className="btn-gold flex-1 py-1.5 px-2.5 rounded-xl font-black text-[10px] flex items-center justify-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>صرف وتسليم للمستفيد</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleSendWhatsAppHawala(t, 'receiver')}
                          className="btn-cancel py-1.5 px-2.5 rounded-xl font-bold text-[10px] flex items-center gap-1"
                        >
                          <MessageCircle className="w-3 h-3 text-emerald-400" />
                          <span>واتساب</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePrintHawalaReceipt(t)}
                          className="btn-cancel py-1.5 px-2.5 rounded-xl font-bold text-[10px] flex items-center gap-1"
                        >
                          <Printer className="w-3 h-3 text-[#F5C84C]" />
                          <span>وصل</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* PIN Verification Modal for Payout */}
        {payoutTarget && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/90 backdrop-blur-md animate-fadeIn"
            dir="rtl"
          >
            <form
              onSubmit={handleConfirmPayout}
              className="w-full max-w-[360px] luxury-card rounded-[24px] p-4 space-y-3 text-right"
            >
              <div className="flex items-center gap-2 text-[#F5C84C]">
                <Lock className="w-5 h-5" />
                <h4 className="font-black text-xs text-white">
                  تأكيد الكود السري لصرف الحوالة [{payoutTarget.transfer_code}]
                </h4>
              </div>
              <p className="text-[11px] text-white/80">
                المستفيد: <strong>{payoutTarget.receiver_name}</strong> — المبلغ للتسليم:{' '}
                <strong className="font-mono text-emerald-400">
                  {payoutTarget.payout_amount} {payoutTarget.payout_currency}
                </strong>
              </p>
              <div>
                <label className="text-[10px] font-bold text-[#F5C84C] block mb-1">
                  أدخل الكود السري المكون من 4 أرقام (PIN) *:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثال: 4829"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  className="w-full bg-black/70 border border-[#F5C84C] rounded-xl px-3 py-2.5 text-center font-mono font-black text-base text-white tracking-widest"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutTarget(null)}
                  className="btn-cancel flex-1 py-2 rounded-xl font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPayingOut}
                  className="btn-gold flex-[2] py-2 rounded-xl font-black text-xs"
                >
                  {isPayingOut ? 'جاري الصرف...' : 'تأكيد الصرف والخصم من الصندوق ✓'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
