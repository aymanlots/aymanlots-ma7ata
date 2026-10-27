import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Parcel, ParcelPayer, SavedCustomer, RouteTariff } from '../types/database';
import {
  getSavedRouteTariffs,
  saveRouteTariffs,
  getSavedCustomersList,
  calculateShippingEstimate,
  openWhatsAppParcelNotification,
} from '../utils/logisticsFeatures';
import confetti from 'canvas-confetti';
import {
  X,
  Package,
  MapPin,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  Scale,
  Calculator,
  Star,
  MessageCircle,
  Settings,
} from 'lucide-react';

interface NewParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParcelCreated?: (parcel: Parcel) => void;
}

export const NewParcelModal: React.FC<NewParcelModalProps> = ({
  isOpen,
  onClose,
  onParcelCreated,
}) => {
  const {
    currentWorkspace,
    stations,
    selectedStationId,
    currencies,
    createParcel,
    isSubscriptionExpired,
    showToast,
  } = useApp();

  const [originStationId, setOriginStationId] = useState<string>(
    selectedStationId || stations[0]?.id || ''
  );
  const [destinationStationId, setDestinationStationId] = useState<string>(
    stations.find((s) => s.id !== (selectedStationId || stations[0]?.id))?.id ||
      stations[1]?.id ||
      ''
  );

  const [senderName, setSenderName] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');

  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('طرد بضائع عامة');
  const [itemsCount, setItemsCount] = useState('1');
  const [weightKg, setWeightKg] = useState('');

  // Financial fields
  const [amountDue, setAmountDue] = useState('200');
  const [payer, setPayer] = useState<ParcelPayer>('sender');
  const [amountPaid, setAmountPaid] = useState('200');
  const [currency, setCurrency] = useState(currencies[0]?.code || 'MAD');
  const [notes, setNotes] = useState('');

  // Condition
  const [condition, setCondition] = useState<'normal' | 'abnormal'>('normal');
  const [conditionNotes, setConditionNotes] = useState('');

  // Auto Calculator & VIP Customer state
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>([]);
  const [selectedVipSender, setSelectedVipSender] = useState<SavedCustomer | null>(null);
  const [routeTariffs, setRouteTariffs] = useState<RouteTariff[]>([]);
  const [autoApplyPrice, setAutoApplyPrice] = useState<boolean>(true);
  const [showTariffEditor, setShowTariffEditor] = useState<boolean>(false);
  const [editBaseFee, setEditBaseFee] = useState<string>('100');
  const [editRatePerKg, setEditRatePerKg] = useState<string>('15');
  const [autoSendWhatsApp, setAutoSendWhatsApp] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSavedCustomers(getSavedCustomersList(currentWorkspace?.id));
      setRouteTariffs(getSavedRouteTariffs(currentWorkspace?.id));
      const origId =
        stations.some((s) => s.id === originStationId)
          ? originStationId
          : selectedStationId || stations[0]?.id || '';
      if (origId && origId !== originStationId) {
        setOriginStationId(origId);
      }
      const destId =
        stations.some((s) => s.id === destinationStationId && s.id !== origId)
          ? destinationStationId
          : stations.find((s) => s.id !== origId)?.id || stations[0]?.id || '';
      if (destId && destId !== destinationStationId) {
        setDestinationStationId(destId);
      }
      const st = stations.find((s) => s.id === origId);
      if (st) {
        setCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
      }
    }
  }, [isOpen, currentWorkspace?.id, stations, selectedStationId]);

  useEffect(() => {
    const st = stations.find((s) => s.id === originStationId);
    if (st) {
      setCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    }
  }, [originStationId, stations]);

  const originSt = stations.find((s) => s.id === originStationId);
  const destSt = stations.find((s) => s.id === destinationStationId);

  const shippingEstimate = useMemo(() => {
    return calculateShippingEstimate({
      originCity: originSt?.city || originSt?.name || 'محطة الانطلاق',
      destCity: destSt?.city || destSt?.name || 'محطة الوصول',
      weightKg: parseFloat(weightKg) || 0,
      itemsCount: parseInt(itemsCount, 10) || 1,
      tariffs: routeTariffs,
      vipCustomer: selectedVipSender,
      isFragile: condition === 'abnormal',
    });
  }, [
    originSt?.city,
    destSt?.city,
    weightKg,
    itemsCount,
    routeTariffs,
    selectedVipSender,
    condition,
  ]);

  // Keep amountDue synced when autoApplyPrice is enabled and weight/route changes
  useEffect(() => {
    if (!autoApplyPrice) return;
    if (weightKg || selectedVipSender) {
      const nextVal = String(shippingEstimate.total);
      setAmountDue(nextVal);
      if (payer === 'sender') {
        setAmountPaid(nextVal);
      }
      setCurrency(shippingEstimate.currency);
    }
  }, [shippingEstimate.total, shippingEstimate.currency, autoApplyPrice, weightKg, selectedVipSender]);

  if (!isOpen) return null;

  const categories = [
    'طرد بضائع عامة',
    'ملابس وأقمشة صحراوية',
    'أجهزة إلكترونية وهواتف',
    'قطع غيار سيارات وشاحنات',
    'مواد غذائية وشاي تقليدي',
    'وثائق ومستندات ورقية',
    'بضائع تجارية أخرى',
  ];

  const handleSelectSavedCustomer = (cust: SavedCustomer, target: 'sender' | 'receiver') => {
    if (target === 'sender') {
      setSenderName(cust.name);
      setSenderPhone(cust.phone);
      setSelectedVipSender(cust);
      showToast(
        cust.vip_rate_per_kg
          ? `تم اختيار التاجر [${cust.name}] بتسعيرة VIP (${cust.vip_rate_per_kg} ${cust.vip_currency || 'MAD'}/كغ)`
          : `تم اختيار الزبون [${cust.name}]`,
        'info'
      );
    } else {
      setReceiverName(cust.name);
      setReceiverPhone(cust.phone);
      showToast(`تم اختيار المستلم [${cust.name}]`, 'info');
    }
  };

  const handleSaveCustomRouteTariff = () => {
    const oCity = originSt?.city || 'الداخلة';
    const dCity = destSt?.city || 'نواذيبو';
    const baseNum = Math.max(0, parseFloat(editBaseFee) || 100);
    const rateNum = Math.max(1, parseFloat(editRatePerKg) || 15);

    const updated = [...routeTariffs];
    const idx = updated.findIndex(
      (t) => oCity.includes(t.origin_city) && dCity.includes(t.destination_city)
    );
    if (idx >= 0) {
      updated[idx] = {
        ...updated[idx],
        base_fee: baseNum,
        rate_per_kg: rateNum,
        currency: currency as 'MAD' | 'MRU',
      };
    } else {
      updated.unshift({
        id: `rt-${Date.now()}`,
        origin_city: oCity,
        destination_city: dCity,
        base_fee: baseNum,
        rate_per_kg: rateNum,
        currency: currency as 'MAD' | 'MRU',
      });
    }
    setRouteTariffs(updated);
    saveRouteTariffs(currentWorkspace?.id, updated);
    setShowTariffEditor(false);
    showToast(`تم تحديث تسعيرة الخط (${oCity} ➔ ${dCity}): ${rateNum} ${currency}/كغ`, 'success');
  };

  const handlePayerChange = (newPayer: ParcelPayer) => {
    setPayer(newPayer);
    if (newPayer === 'sender') {
      setAmountPaid(amountDue);
    } else {
      setAmountPaid('0');
    }
  };

  const handleAmountDueChange = (val: string) => {
    setAmountDue(val);
    if (payer === 'sender') {
      setAmountPaid(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (isSubscriptionExpired) {
      setErrorMessage('انتهت صلاحية اشتراك مساحة العمل. يرجى التجديد لتسجيل كوليات جديدة.');
      return;
    }

    if (!senderName.trim()) {
      setErrorMessage('يرجى إدخال اسم المرسل');
      return;
    }
    if (!senderPhone.trim() || senderPhone.trim().length < 6) {
      setErrorMessage('يرجى إدخال رقم هاتف المرسل بشكل صحيح');
      return;
    }
    if (!receiverName.trim()) {
      setErrorMessage('يرجى إدخال اسم المستلم');
      return;
    }
    if (!receiverPhone.trim() || receiverPhone.trim().length < 6) {
      setErrorMessage('يرجى إدخال رقم هاتف المستلم بشكل صحيح');
      return;
    }
    if (!description.trim()) {
      setErrorMessage('يرجى إدخال وصف حر للبضاعة');
      return;
    }
    if (originStationId === destinationStationId) {
      setErrorMessage('لا يمكن أن تكون محطة الانطلاق والوصول هي نفس المحطة');
      return;
    }

    const dueNum = parseFloat(amountDue) || 0;
    const paidNum = parseFloat(amountPaid) || 0;

    if (dueNum < 0) {
      setErrorMessage('المبلغ المستحق لا يمكن أن يكون سالباً');
      return;
    }
    if (paidNum > dueNum) {
      setErrorMessage('المبلغ المدفوع لا يمكن أن يتجاوز المبلغ الإجمالي المستحق');
      return;
    }

    if (condition === 'abnormal' && !conditionNotes.trim()) {
      setErrorMessage('يرجى كتابة ملاحظات وتفاصيل حالة الكولي غير العادية');
      return;
    }

    try {
      setIsSubmitting(true);

      const res = await createParcel({
        origin_station_id: originStationId,
        destination_station_id: destinationStationId,
        sender_name: senderName.trim(),
        sender_phone: senderPhone.trim(),
        receiver_name: receiverName.trim(),
        receiver_phone: receiverPhone.trim(),
        description: description.trim(),
        category,
        items_count: parseInt(itemsCount, 10) || 1,
        weight_kg: weightKg ? parseFloat(weightKg) : undefined,
        amount_due: dueNum,
        payer,
        amount_paid: paidNum,
        currency,
        notes: notes.trim() || undefined,
        condition,
        condition_notes: condition === 'abnormal' ? conditionNotes.trim() : undefined,
        route: `${originSt?.city || 'الداخلة'} ➔ الكركرات ➔ ${destSt?.city || 'نواذيبو'}`,
      });

      setIsSubmitting(false);

      if (res.success && res.parcel) {
        try {
          confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
        } catch {}

        if (autoSendWhatsApp) {
          openWhatsAppParcelNotification(
            res.parcel,
            'registered_sender',
            currentWorkspace?.custom_brand_name || currentWorkspace?.name
          );
        }

        if (onParcelCreated) {
          onParcelCreated(res.parcel);
        }
        onClose();
      } else {
        setErrorMessage(res.error || 'حدث خطأ أثناء حفظ الكولي');
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'حدث خطأ غير متوقع');
    }
  };

  const remaining = Math.max(
    0,
    Math.round(((parseFloat(amountDue) || 0) - (parseFloat(amountPaid) || 0)) * 100) / 100
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 animate-fadeIn overflow-y-auto"
      dir="rtl"
    >
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

      <div
        className="w-full max-w-[410px] rounded-[24px] luxury-card border border-[#D4AF37]/65 p-4 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-3.5 max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4AF37]/25 pb-2.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-[#F5D799]">
                تسجيل كولي جديد (إرسالية بضائع)
              </h2>
              <p className="text-[10px] text-[#E6C37A] font-bold">
                حاسبة وزن ذكية + تذكرة حرارية + إشعار واتساب QR
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="btn-cancel p-1.5 rounded-xl"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="bg-rose-950/60 border border-rose-500/40 p-3 rounded-2xl text-xs text-rose-300 flex items-center gap-2 font-bold shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Warning if fewer than 2 stations */}
        {stations.length < 2 && (
          <div className="bg-amber-950/70 border border-amber-500/50 p-3 rounded-2xl text-xs text-amber-200 flex items-center gap-2 font-bold shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              {stations.length === 0
                ? 'يرجى فتح وتسمية محطة واحدة على الأقل قبل تسجيل الإرساليات'
                : 'تنبيه: يتطلب تسجيل الشحنة محطة انطلاق ومحطة وصول مختلفتين. يرجى إضافة محطة ثانية عبر لوحة التحكم أو جولة الإعداد.'}
            </span>
          </div>
        )}

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto pr-1 text-xs flex-1">
          {/* 1. Stations Selection (From / To) */}
          <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2">
            <span className="font-bold text-[#F5D799] flex items-center gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5 text-[#F3A952]" />
              <span>خط النقل والمحطات:</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#C8B08A] mb-1 font-bold text-[11px]">
                  محطة الانطلاق:
                </label>
                <select
                  value={originStationId}
                  onChange={(e) => setOriginStationId(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-[#FFF8EB] font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                  required
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#C8B08A] mb-1 font-bold text-[11px]">
                  محطة الوصول:
                </label>
                <select
                  value={destinationStationId}
                  onChange={(e) => setDestinationStationId(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-[#FFF8EB] font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                  required
                >
                  {stations.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.city})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Quick VIP / Merchant Picker (Carnet Clients & Tarifs VIP) */}
          {savedCustomers.length > 0 && (
            <div className="bg-black/55 p-3 rounded-2xl border border-[#F5C84C]/40 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-black text-[#F5C84C] text-[11px] flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>اختيار سريع من دفتر التجار الأوفياء (VIP):</span>
                </span>
                {selectedVipSender && (
                  <button
                    type="button"
                    onClick={() => setSelectedVipSender(null)}
                    className="btn-cancel px-2 py-0.5 rounded-lg text-[10px]"
                  >
                    إلغاء VIP
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {savedCustomers.slice(0, 8).map((cust) => {
                  const isSelected = selectedVipSender?.id === cust.id;
                  return (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelectSavedCustomer(cust, 'sender')}
                      className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold shrink-0 transition flex items-center gap-1 ${
                        isSelected ? 'btn-gold font-black' : 'btn-cancel'
                      }`}
                    >
                      <Star className="w-3 h-3 text-[#F5C84C]" />
                      <span>{cust.name}</span>
                      {cust.vip_rate_per_kg ? (
                        <span className="font-mono text-[9px] opacity-90">
                          ({cust.vip_rate_per_kg}/kg)
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Sender and Receiver Information */}
          <div className="grid grid-cols-1 gap-2.5">
            {/* Sender */}
            <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#F5D799] block text-xs">بيانات المرسل:</span>
                {selectedVipSender && (
                  <span className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C] text-[9px] font-black">
                    ⭐ تعريفة تاجر VIP مفعلة
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">الاسم الكامل *</label>
                  <input
                    type="text"
                    placeholder="اسم مرسل البضاعة"
                    required
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">رقم الهاتف / واتساب *</label>
                  <input
                    type="tel"
                    placeholder="0600000000"
                    required
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    dir="ltr"
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
            </div>

            {/* Receiver */}
            <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2">
              <span className="font-bold text-[#E6C37A] block text-xs">بيانات المستلم:</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">الاسم الكامل *</label>
                  <input
                    type="text"
                    placeholder="اسم المستلم في الوجهة"
                    required
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">رقم الهاتف / واتساب *</label>
                  <input
                    type="tel"
                    placeholder="2220000000"
                    required
                    value={receiverPhone}
                    onChange={(e) => setReceiverPhone(e.target.value)}
                    dir="ltr"
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 4. Goods Description, Quantity, Weight & Auto Tariff Calculator */}
          <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
            <span className="font-bold text-[#F5D799] block text-xs">مواصفات البضاعة والوزن:</span>

            <div>
              <label className="block text-[#C8B08A] mb-1 text-[11px]">
                وصف حر لمحتوى الطرد أو البضاعة *
              </label>
              <textarea
                placeholder="اكتب بالتفصيل نوع البضاعة، الماركة، أو أي تفاصيل تميز الكولي..."
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37] leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <label className="block text-[#C8B08A] mb-1 text-[11px]">تصنيف البضاعة:</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[#C8B08A] mb-1 text-[11px]">عدد الطرود *</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={itemsCount}
                  onChange={(e) => setItemsCount(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-[#F5C84C] mb-1 text-[11px] font-black flex items-center gap-1">
                  <Scale className="w-3 h-3" />
                  <span>الوزن بالكيلوغرام (kg):</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="مثال: 15"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#F5C84C]/60 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
            </div>

            {/* Automatic Tariff Calculator Box */}
            <div className="bg-black/60 p-2.5 rounded-xl border border-[#F5C84C]/40 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5 text-[#F5C84C]" />
                  <span className="font-black text-[11px] text-[#F5C84C]">
                    حاسبة التسعيرة التلقائية ({originSt?.city || 'الداخلة'} ➔ {destSt?.city || 'نواذيبو'}):
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTariffEditor(!showTariffEditor)}
                  className="btn-cancel px-2 py-0.5 rounded-lg text-[10px] flex items-center gap-1"
                >
                  <Settings className="w-3 h-3" />
                  <span>تعريفة الخط</span>
                </button>
              </div>

              <div className="flex items-center justify-between bg-black/50 px-2.5 py-2 rounded-xl border border-white/10">
                <div>
                  <span className="text-[10px] text-white/70 block">
                    {shippingEstimate.breakdown}
                  </span>
                  <span className="font-mono font-black text-sm text-emerald-400">
                    السعر المقترح: {shippingEstimate.total} {shippingEstimate.currency}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = String(shippingEstimate.total);
                      setAmountDue(nextVal);
                      if (payer === 'sender') setAmountPaid(nextVal);
                      setCurrency(shippingEstimate.currency);
                      showToast(
                        `تم اعتماد التسعيرة المحسوبة (${shippingEstimate.total} ${shippingEstimate.currency})`,
                        'info'
                      );
                    }}
                    className="btn-gold px-2.5 py-1.5 rounded-xl font-black text-[10px]"
                  >
                    اعتماد السعر ✓
                  </button>
                </div>
              </div>

              {showTariffEditor && (
                <div className="pt-2 border-t border-white/15 space-y-2 animate-fadeIn">
                  <span className="text-[10px] text-[#F5C84C] font-bold block">
                    تعديل تسعيرة الخط ({originSt?.city} ➔ {destSt?.city}):
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-white/70 block mb-0.5">
                        السعر الأساسي الأدنى:
                      </label>
                      <input
                        type="number"
                        value={editBaseFee}
                        onChange={(e) => setEditBaseFee(e.target.value)}
                        className="w-full bg-black/70 border border-white/20 rounded-lg px-2 py-1 text-white font-mono text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] text-white/70 block mb-0.5">
                        ثمن الكيلوغرام الواحد (kg):
                      </label>
                      <input
                        type="number"
                        value={editRatePerKg}
                        onChange={(e) => setEditRatePerKg(e.target.value)}
                        className="w-full bg-black/70 border border-white/20 rounded-lg px-2 py-1 text-white font-mono text-xs"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveCustomRouteTariff}
                    className="btn-gold w-full py-1.5 rounded-lg font-black text-[11px]"
                  >
                    حفظ تعريفة هذا الخط
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 5. Financial Details */}
          <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F5D799] flex items-center gap-1.5 text-xs">
                <DollarSign className="w-3.5 h-3.5 text-[#F3A952]" />
                <span>المستحقات المالية وطريقة الأداء:</span>
              </span>
              <button
                type="button"
                onClick={() => setAutoApplyPrice(!autoApplyPrice)}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                  autoApplyPrice ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                {autoApplyPrice ? '✓ حساب تلقائي مفعل' : 'تحديد يدوي'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#C8B08A] mb-1 text-[11px]">المبلغ الإجمالي *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={amountDue}
                  onChange={(e) => {
                    setAutoApplyPrice(false);
                    handleAmountDueChange(e.target.value);
                  }}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div>
                <label className="block text-[#C8B08A] mb-1 text-[11px]">العملة:</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.label_ar})
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2">
                <label className="block text-[#C8B08A] mb-1 text-[11px]">الطرف الملزم بالأداء *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handlePayerChange('sender')}
                    className={`py-2 rounded-xl text-xs font-black transition ${
                      payer === 'sender' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    المرسل
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePayerChange('receiver')}
                    className={`py-2 rounded-xl text-xs font-black transition ${
                      payer === 'receiver' ? 'btn-gold' : 'btn-cancel'
                    }`}
                  >
                    المستلم
                  </button>
                </div>
              </div>
            </div>

            {/* Amount Paid Upfront */}
            <div className="grid grid-cols-1 gap-2 pt-1">
              <div>
                <label className="block text-[#C8B08A] mb-1 text-[11px]">
                  المبلغ المدفوع الآن في المحطة:
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={amountDue}
                  required
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                />
              </div>

              <div className="bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30 flex items-center justify-between">
                <span className="text-[11px] text-[#C8B08A]">المبلغ المتبقي للتحصيل:</span>
                <span
                  className={`font-mono font-black text-xs ${
                    remaining > 0 ? 'text-rose-400' : 'text-[#F5D799]'
                  }`}
                >
                  {remaining} {currency} {remaining === 0 ? '(خالص)' : '(متبقي)'}
                </span>
              </div>
            </div>
          </div>

          {/* 6. Parcel Condition */}
          <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F5D799] block text-xs">حالة وسلامة الكولي:</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#120a00] text-[#E6C37A] border border-[#D4AF37]/40">
                {condition === 'normal' ? '✓ سليم وعادي' : '⚠ غير عادي'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setCondition('normal')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-black transition ${
                  condition === 'normal' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>عادي (سليم)</span>
              </button>

              <button
                type="button"
                onClick={() => setCondition('abnormal')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-black transition ${
                  condition === 'abnormal' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                <AlertCircle className="w-3.5 h-3.5" />
                <span>غير عادي (قابل للكسر)</span>
              </button>
            </div>

            {condition === 'abnormal' && (
              <div className="pt-1 space-y-1">
                <label className="block text-[#F5D799] text-[11px] font-bold">
                  وصف حالة الكسر أو العناية الخاصة *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: زجاج قابل للكسر / الكرتون مفتوح..."
                  value={conditionNotes}
                  onChange={(e) => setConditionNotes(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/60 rounded-xl px-3 py-2 text-white text-xs placeholder-[#A68966] focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Auto WhatsApp Toggle */}
          <div className="bg-black/50 p-2.5 rounded-2xl border border-emerald-500/35 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[11px] font-black text-white block">
                  إشعار واتساب تلقائي للمرسل مع رابط QR
                </span>
                <span className="text-[9px] text-white/65 block">
                  فتح محادثة واتساب مع وصل الإيداع ورابط التتبع فور الحفظ
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoSendWhatsApp(!autoSendWhatsApp)}
              className={`px-3 py-1.5 rounded-xl text-[10px] font-black shrink-0 ${
                autoSendWhatsApp ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              {autoSendWhatsApp ? '✓ مفعل' : 'تفعيل'}
            </button>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[#C8B08A] mb-1 text-[11px]">ملاحظات إضافية (اختياري):</label>
            <input
              type="text"
              placeholder="مثال: يرجى الاتصال بالمستلم قبل التوصيل"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37]"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2 shrink-0">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-gold w-full py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 shadow-lg active:scale-95 transition disabled:opacity-50"
            >
              <Package className="w-4 h-4" />
              <span>
                {isSubmitting ? 'جاري تسجيل الكولي...' : 'تأكيد التسجيل وطباعة التذكرة الحرارية'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
