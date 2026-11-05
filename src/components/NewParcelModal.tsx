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
  Layers,
  Users,
  UserCheck,
  Plus,
  Trash2,
} from 'lucide-react';

interface NewParcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onParcelCreated?: (parcel: Parcel, allCreatedParcels?: Parcel[]) => void;
}

interface MultiParcelItemDraft {
  id: string;
  destinationStationId: string;
  receiverName: string;
  receiverPhone: string;
  description: string;
  category: string;
  itemsCount: string;
  weightKg: string;
  amountDue: string;
  payer: ParcelPayer;
  amountPaid: string;
  condition: 'normal' | 'abnormal';
  conditionNotes: string;
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
    userRole,
    userAssignedStationId,
    managerPartnerships,
    registeredManagersNetwork,
    loadRegisteredManagersNetwork,
    showToast,
  } = useApp();

  // Collect all stations belonging to active partners in غرفة الشراكة
  const partnerDestinationStations = React.useMemo(() => {
    const myWsId = currentWorkspace?.id || '';
    const list: {
      id: string;
      name: string;
      city: string;
      country?: string;
      partnerWorkspaceId: string;
      partnerWorkspaceName: string;
    }[] = [];
    const seenIds = new Set<string>();

    for (const p of managerPartnerships) {
      if (p.status !== 'active') continue;
      const isA = p.workspace_a_id === myWsId;
      const partnerWsId = isA ? p.workspace_b_id : p.workspace_a_id;
      const partnerWsName = isA ? p.workspace_b_name : p.workspace_a_name;
      const liveNet = registeredManagersNetwork.find((m) => m.workspaceId === partnerWsId);
      const mergedStations = [
        ...(liveNet?.stations || []),
        ...((isA ? p.workspace_b_stations : p.workspace_a_stations) || []),
      ];
      for (const st of mergedStations) {
        if (!st?.id || seenIds.has(st.id)) continue;
        seenIds.add(st.id);
        list.push({
          id: st.id,
          name: st.name,
          city: st.city || st.name,
          country: st.country,
          partnerWorkspaceId: partnerWsId,
          partnerWorkspaceName: liveNet?.workspaceName || partnerWsName || 'شريك معتمد',
        });
      }
    }
    return list;
  }, [currentWorkspace?.id, managerPartnerships, registeredManagersNetwork]);

  // Registration Mode:
  // 'single': مرسل واحد -> كولي واحد -> مستلم واحد
  // 'multi': مرسل واحد -> بزاف ديال الكوليات (إما لمستلم واحد أو لبزاف ديال المستلمين)
  const [registrationMode, setRegistrationMode] = useState<'single' | 'multi'>('single');
  const [multiSubMode, setMultiSubMode] = useState<'one_receiver' | 'multi_receivers'>('one_receiver');

  const initialOriginId =
    userRole === 'worker' && userAssignedStationId
      ? userAssignedStationId
      : selectedStationId || stations[0]?.id || '';

  const [originStationId, setOriginStationId] = useState<string>(initialOriginId);
  const [destinationStationId, setDestinationStationId] = useState<string>(
    stations.find((s) => s.id !== initialOriginId)?.id ||
      partnerDestinationStations[0]?.id ||
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

  // Multi-parcel items state
  const createEmptyDraftItem = (defaultDestId: string): MultiParcelItemDraft => ({
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    destinationStationId: defaultDestId,
    receiverName: '',
    receiverPhone: '',
    description: '',
    category: 'طرد بضائع عامة',
    itemsCount: '1',
    weightKg: '',
    amountDue: '200',
    payer: 'sender',
    amountPaid: '200',
    condition: 'normal',
    conditionNotes: '',
  });

  const [multiItems, setMultiItems] = useState<MultiParcelItemDraft[]>([]);

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

  // تصفير جميع الحقول عند فتح النافذة من جديد حتى لا تبقى أسماء المرسل والمستلم السابقة
  useEffect(() => {
    if (isOpen) {
      loadRegisteredManagersNetwork().catch(() => {});
      setSavedCustomers(getSavedCustomersList(currentWorkspace?.id));
      setRouteTariffs(getSavedRouteTariffs(currentWorkspace?.id));

      const origId =
        userRole === 'worker' && userAssignedStationId
          ? userAssignedStationId
          : selectedStationId && stations.some((s) => s.id === selectedStationId)
          ? selectedStationId
          : stations[0]?.id || '';
      const destId =
        stations.find((s) => s.id !== origId)?.id ||
        partnerDestinationStations[0]?.id ||
        stations[0]?.id ||
        '';

      setOriginStationId(origId);
      setDestinationStationId(destId);

      const st = stations.find((s) => s.id === origId);
      const defaultCurr = st ? st.currency || (st.country === 'MR' ? 'MRU' : 'MAD') : currencies[0]?.code || 'MAD';
      setCurrency(defaultCurr);

      // Reset all sender/receiver/parcel fields cleanly
      setRegistrationMode('single');
      setMultiSubMode('one_receiver');
      setSenderName('');
      setSenderPhone('');
      setReceiverName('');
      setReceiverPhone('');
      setDescription('');
      setCategory('طرد بضائع عامة');
      setItemsCount('1');
      setWeightKg('');
      setAmountDue('200');
      setPayer('sender');
      setAmountPaid('200');
      setNotes('');
      setCondition('normal');
      setConditionNotes('');
      setSelectedVipSender(null);
      setErrorMessage(null);
      setIsSubmitting(false);

      setMultiItems([
        createEmptyDraftItem(destId),
        createEmptyDraftItem(destId),
      ]);
    }
  }, [isOpen, currentWorkspace?.id, selectedStationId]);

  // If user has 1 station and partnerDestinationStations loads asynchronously, auto-select first partner station
  useEffect(() => {
    if (
      isOpen &&
      stations.length === 1 &&
      partnerDestinationStations.length > 0 &&
      (!destinationStationId || destinationStationId === originStationId)
    ) {
      const firstPartnerStId = partnerDestinationStations[0].id;
      setDestinationStationId(firstPartnerStId);
      setMultiItems((prev) =>
        prev.map((it) =>
          !it.destinationStationId || it.destinationStationId === originStationId
            ? { ...it, destinationStationId: firstPartnerStId }
            : it
        )
      );
    }
  }, [isOpen, stations.length, partnerDestinationStations, destinationStationId, originStationId]);

  useEffect(() => {
    const st = stations.find((s) => s.id === originStationId);
    if (st) {
      setCurrency(st.currency || (st.country === 'MR' ? 'MRU' : 'MAD'));
    }
  }, [originStationId, stations]);

  const originSt = stations.find((s) => s.id === originStationId);
  const selectedPartnerDest = partnerDestinationStations.find((s) => s.id === destinationStationId);
  const destSt =
    stations.find((s) => s.id === destinationStationId) ||
    (selectedPartnerDest
      ? ({
          id: selectedPartnerDest.id,
          name: selectedPartnerDest.name,
          city: selectedPartnerDest.city,
        } as any)
      : undefined);

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

  const updateMultiItem = (id: string, patch: Partial<MultiParcelItemDraft>) => {
    setMultiItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.amountDue !== undefined && next.payer === 'sender' && patch.amountPaid === undefined) {
          next.amountPaid = patch.amountDue;
        }
        if (patch.payer !== undefined) {
          next.amountPaid = patch.payer === 'sender' ? next.amountDue : '0';
        }
        return next;
      })
    );
  };

  const handleAddMultiItem = () => {
    setMultiItems((prev) => [...prev, createEmptyDraftItem(destinationStationId)]);
  };

  const handleSetBulkCount = (rawCount: number) => {
    const targetCount = Math.max(1, Math.min(50, Math.floor(rawCount) || 1));
    setMultiItems((prev) => {
      if (prev.length === targetCount) return prev;
      if (prev.length > targetCount) {
        return prev.slice(0, targetCount);
      }
      const added: MultiParcelItemDraft[] = [];
      for (let i = prev.length; i < targetCount; i++) {
        added.push(createEmptyDraftItem(destinationStationId));
      }
      return [...prev, ...added];
    });
  };

  const handleRemoveMultiItem = (id: string) => {
    if (multiItems.length <= 1) return;
    setMultiItems((prev) => prev.filter((item) => item.id !== id));
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

    // =========================================================================
    // MODE A: كولي واحد (مرسل واحد -> كولي واحد -> مستلم واحد)
    // =========================================================================
    if (registrationMode === 'single') {
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
          route: `${originSt?.city || 'الانطلاق'} ➔ ${destSt?.city || 'الوصول'}`,
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
            onParcelCreated(res.parcel, [res.parcel]);
          }
          onClose();
        } else {
          setErrorMessage(res.error || 'حدث خطأ أثناء حفظ الكولي');
        }
      } catch (err: any) {
        setIsSubmitting(false);
        setErrorMessage(err.message || 'حدث خطأ غير متوقع');
      }
      return;
    }

    // =========================================================================
    // MODE B: إرسالية متعددة (مرسل واحد -> بزاف ديال الكوليات)
    // =========================================================================
    if (multiSubMode === 'one_receiver') {
      if (!receiverName.trim()) {
        setErrorMessage('يرجى إدخال اسم المستلم');
        return;
      }
      if (!receiverPhone.trim() || receiverPhone.trim().length < 6) {
        setErrorMessage('يرجى إدخال رقم هاتف المستلم بشكل صحيح');
        return;
      }
      if (originStationId === destinationStationId) {
        setErrorMessage('لا يمكن أن تكون محطة الانطلاق والوصول هي نفس المحطة');
        return;
      }
    }

    for (let i = 0; i < multiItems.length; i++) {
      const item = multiItems[i];
      const idxLabel = `الكولي #${i + 1}`;
      if (multiSubMode === 'multi_receivers') {
        if (!item.receiverName.trim()) {
          setErrorMessage(`يرجى إدخال اسم المستلم في ${idxLabel}`);
          return;
        }
        if (!item.receiverPhone.trim() || item.receiverPhone.trim().length < 6) {
          setErrorMessage(`يرجى إدخال رقم هاتف المستلم في ${idxLabel}`);
          return;
        }
        if (originStationId === item.destinationStationId) {
          setErrorMessage(`محطة الوصول في ${idxLabel} لا يمكن أن تكون نفس محطة الانطلاق`);
          return;
        }
      }
      if (!item.description.trim()) {
        setErrorMessage(`يرجى إدخال وصف البضاعة في ${idxLabel}`);
        return;
      }
      const d = parseFloat(item.amountDue) || 0;
      const p = parseFloat(item.amountPaid) || 0;
      if (d < 0 || p > d) {
        setErrorMessage(`يرجى التحقق من المبلغ المستحق والمدفوع في ${idxLabel}`);
        return;
      }
      if (item.condition === 'abnormal' && !item.conditionNotes.trim()) {
        setErrorMessage(`يرجى كتابة ملاحظة حالة الكسر في ${idxLabel}`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const createdList: Parcel[] = [];

      for (let i = 0; i < multiItems.length; i++) {
        const item = multiItems[i];
        const targetDestId =
          multiSubMode === 'one_receiver' ? destinationStationId : item.destinationStationId;
        const targetDestSt = stations.find((s) => s.id === targetDestId);
        const targetReceiverName =
          multiSubMode === 'one_receiver' ? receiverName.trim() : item.receiverName.trim();
        const targetReceiverPhone =
          multiSubMode === 'one_receiver' ? receiverPhone.trim() : item.receiverPhone.trim();

        const dueNum = parseFloat(item.amountDue) || 0;
        const paidNum = parseFloat(item.amountPaid) || 0;

        const res = await createParcel({
          origin_station_id: originStationId,
          destination_station_id: targetDestId,
          sender_name: senderName.trim(),
          sender_phone: senderPhone.trim(),
          receiver_name: targetReceiverName,
          receiver_phone: targetReceiverPhone,
          description: item.description.trim(),
          category: item.category || 'طرد بضائع عامة',
          items_count: parseInt(item.itemsCount, 10) || 1,
          weight_kg: item.weightKg ? parseFloat(item.weightKg) : undefined,
          amount_due: dueNum,
          payer: item.payer,
          amount_paid: paidNum,
          currency,
          notes: notes.trim()
            ? `${notes.trim()} (دفعة متعددة ${i + 1}/${multiItems.length})`
            : `دفعة متعددة (${i + 1}/${multiItems.length})`,
          condition: item.condition,
          condition_notes: item.condition === 'abnormal' ? item.conditionNotes.trim() : undefined,
          route: `${originSt?.city || 'الانطلاق'} ➔ ${targetDestSt?.city || 'الوصول'}`,
        });

        if (res.success && res.parcel) {
          createdList.push(res.parcel);
        } else {
          setIsSubmitting(false);
          setErrorMessage(res.error || `حدث خطأ أثناء تسجيل الكولي #${i + 1}`);
          return;
        }
      }

      setIsSubmitting(false);

      if (createdList.length > 0) {
        try {
          confetti({ particleCount: 65, spread: 70, origin: { y: 0.7 } });
        } catch {}

        showToast(
          `تم تسجيل ${createdList.length} كوليات بنجاح للزبون ${senderName.trim()}`,
          'success'
        );

        if (autoSendWhatsApp) {
          openWhatsAppParcelNotification(
            createdList[0],
            'registered_sender',
            currentWorkspace?.custom_brand_name || currentWorkspace?.name
          );
        }

        if (onParcelCreated) {
          onParcelCreated(createdList[0], createdList);
        }
        onClose();
      }
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || 'حدث خطأ غير متوقع أثناء التسجيل المتعدد');
    }
  };

  const remaining = Math.max(
    0,
    Math.round(((parseFloat(amountDue) || 0) - (parseFloat(amountPaid) || 0)) * 100) / 100
  );

  const multiTotalDue = multiItems.reduce((sum, item) => sum + (parseFloat(item.amountDue) || 0), 0);
  const multiTotalPaid = multiItems.reduce((sum, item) => sum + (parseFloat(item.amountPaid) || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 animate-fadeIn overflow-y-auto"
      dir="rtl"
    >
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />

      <div
        className="w-full max-w-[440px] rounded-[24px] luxury-card border border-[#D4AF37]/65 p-4 shadow-2xl text-right overflow-hidden relative z-10 my-4 space-y-3 max-h-[92vh] flex flex-col"
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
                كولي فردي أو عدة كوليات لنفس الزبون + تذكرة حرارية QR
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

        {/* Mode Selector: Single Parcel vs Multi-Parcel from 1 Sender */}
        <div className="bg-black/60 p-2 rounded-2xl border border-[#D4AF37]/45 space-y-2 shrink-0">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setRegistrationMode('single')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition ${
                registrationMode === 'single' ? 'btn-gold shadow-md' : 'btn-cancel'
              }`}
            >
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span>كولي واحد (مرسل ➔ مستلم)</span>
            </button>
            <button
              type="button"
              onClick={() => setRegistrationMode('multi')}
              className={`py-2 px-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 transition ${
                registrationMode === 'multi' ? 'btn-gold shadow-md' : 'btn-cancel'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span>بزاف ديال الكوليات (مرسل واحد)</span>
            </button>
          </div>

          {registrationMode === 'multi' && (
            <div className="pt-1.5 border-t border-white/10 space-y-1.5 animate-fadeIn">
              <span className="text-[10px] font-black text-[#F5C84C] block">
                اختر نوع الإرسال المتعدد لهذا الزبون:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMultiSubMode('one_receiver')}
                  className={`py-1.5 px-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition ${
                    multiSubMode === 'one_receiver'
                      ? 'bg-[#F5C84C]/25 border border-[#F5C84C] text-[#F5C84C]'
                      : 'bg-black/40 border border-white/15 text-white/75'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span>بزاف ديال الكوليات لمستلم واحد</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMultiSubMode('multi_receivers')}
                  className={`py-1.5 px-2 rounded-xl text-[10px] font-black flex items-center justify-center gap-1 transition ${
                    multiSubMode === 'multi_receivers'
                      ? 'bg-[#F5C84C]/25 border border-[#F5C84C] text-[#F5C84C]'
                      : 'bg-black/40 border border-white/15 text-white/75'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span>بزاف ديال الكوليات لعدة مستلمين</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="bg-rose-950/60 border border-rose-500/40 p-3 rounded-2xl text-xs text-rose-300 flex items-center gap-2 font-bold shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Warning if fewer than 2 total available stations (own + partner stations) */}
        {stations.length + partnerDestinationStations.length < 2 && (
          <div className="bg-amber-950/70 border border-amber-500/50 p-3 rounded-2xl text-xs text-amber-200 flex items-center gap-2 font-bold shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>
              {stations.length === 0
                ? 'يرجى فتح وتسمية محطة واحدة على الأقل قبل تسجيل الإرساليات'
                : 'تنبيه: لديك محطة واحدة فقط حالياً. لإرسال الكوليات يمكنك إما إضافة محطة ثانية لشركتك، أو عقد شراكة مع مدير آخر في "غرفة الشراكة" لتظهر محطاته هنا كوجهة وصول.'}
            </span>
          </div>
        )}

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="space-y-3 overflow-y-auto pr-1 text-xs flex-1">
          {/* 1. Stations Selection (From / To) */}
          <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
            <span className="font-bold text-[#F5D799] flex items-center gap-1.5 text-xs">
              <MapPin className="w-3.5 h-3.5 text-[#F3A952]" />
              <span>1. تحديد المسار (من محطة ⬅ إلى محطة):</span>
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#F5C84C] mb-1 font-black text-[11px]">
                  من محطة (الانطلاق):
                </label>
                <select
                  value={originStationId}
                  disabled={userRole === 'worker'}
                  onChange={(e) => setOriginStationId(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-[#FFF8EB] font-bold text-xs focus:outline-none focus:border-[#D4AF37] disabled:opacity-70"
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
                <label className="block text-emerald-400 mb-1 font-black text-[11px]">
                  إلى محطة (الوجهة):
                </label>
                <select
                  value={destinationStationId}
                  onChange={(e) => {
                    const newDest = e.target.value;
                    setDestinationStationId(newDest);
                    setMultiItems((prev) =>
                      prev.map((it) => ({ ...it, destinationStationId: newDest }))
                    );
                  }}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-2.5 py-2 text-[#FFF8EB] font-bold text-xs focus:outline-none focus:border-[#D4AF37]"
                  required
                >
                  {stations.length > 0 && (
                    <optgroup label="🏠 محطات شركتنا الداخلية">
                      {stations.map((st) => (
                        <option key={st.id} value={st.id}>
                          🏠 {st.name} ({st.city})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {partnerDestinationStations.length > 0 && (
                    <optgroup label="🤝 محطات الشركاء (غرفة الشراكة)">
                      {partnerDestinationStations.map((pst) => (
                        <option key={pst.id} value={pst.id}>
                          🤝 {pst.name} ({pst.city}) — [{pst.partnerWorkspaceName}]
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            {/* Clear Explicit Route Banner */}
            <div className="bg-black/60 border border-[#D4AF37]/35 rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-bold text-white/90">
                من محطة:{' '}
                <strong className="text-[#F5C84C]">
                  {originSt ? `${originSt.name} (${originSt.city})` : 'الانطلاق'}
                </strong>
              </span>
              <span className="text-[#F5C84C] font-black">⬅</span>
              <span className="font-bold text-white/90">
                إلى محطة:{' '}
                <strong className="text-emerald-400">
                  {destSt ? `${destSt.name} (${destSt.city})` : 'الوجهة'}
                </strong>
              </span>
            </div>

            {selectedPartnerDest && (
              <div className="p-2.5 rounded-xl bg-purple-950/75 border border-purple-400/50 text-purple-100 text-[11px] font-bold flex items-start gap-2 animate-fadeIn">
                <span className="text-sm shrink-0">🤝</span>
                <span>
                  وجهة غرفة الشراكة: سيتم إرسال طلب قبول هذا الكولي إلى محطة{' '}
                  <strong className="text-[#F5C84C]">
                    "{selectedPartnerDest.name} ({selectedPartnerDest.city})"
                  </strong>{' '}
                  التابعة للشريك <strong className="text-purple-200">"{selectedPartnerDest.partnerWorkspaceName}"</strong>.
                  (يظهر الكولي لعامل تلك المحطة المستقبلة وللمدير للقبول والتسليم).
                </span>
              </div>
            )}
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

          {/* 3. Sender Information (Shared for both Single & Multi modes) */}
          <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[#F5D799] block text-xs">
                {registrationMode === 'multi'
                  ? '2. بيانات المرسل وعدد الكوليات اللي عندو:'
                  : '2. بيانات المرسل:'}
              </span>
              {selectedVipSender && (
                <span className="px-2 py-0.5 rounded-full bg-[#F5C84C]/20 border border-[#F5C84C]/40 text-[#F5C84C] text-[9px] font-black">
                  ⭐ تعريفة تاجر VIP مفعلة
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[#C8B08A] mb-1 text-[11px]">اسم المرسل *</label>
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
                <label className="block text-[#C8B08A] mb-1 text-[11px]">رقم هاتف المرسل *</label>
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

            {/* When in Multi mode: Prominent "شحال عندو من كولية" selector right inside Sender card */}
            {registrationMode === 'multi' && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <label className="block text-[#F5C84C] font-black text-xs">
                      📦 شحال عندو من كولية؟ (عدد الكوليات):
                    </label>
                    <span className="text-[10px] text-[#C8B08A]">
                      اكتب العدد أو اختره وسيفتح لك الخانات مرتبة مرقمة (#1، #2، #3...)
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={multiItems.length}
                    onChange={(e) => handleSetBulkCount(parseInt(e.target.value, 10) || 1)}
                    className="w-20 bg-[#120a00] border-2 border-[#F5C84C] rounded-xl px-2.5 py-1.5 text-center text-[#F5C84C] font-mono font-black text-sm focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-white/70 font-bold">اختيار سريع للعدد:</span>
                  {[2, 3, 4, 5, 6, 8, 10].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleSetBulkCount(num)}
                      className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs transition cursor-pointer ${
                        multiItems.length === num
                          ? 'bg-[#F5C84C] text-[#1a0f00] shadow'
                          : 'bg-black/50 text-[#F5D799] border border-[#D4AF37]/35 hover:border-[#F5C84C]'
                      }`}
                    >
                      {num} كوليات
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Receiver Info (Shown at top if Single Mode OR Multi-Parcel to One Receiver) */}
          {(registrationMode === 'single' || multiSubMode === 'one_receiver') && (
            <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2">
              <span className="font-bold text-[#E6C37A] block text-xs">
                {registrationMode === 'multi'
                  ? '3. بيانات المستلم الموحد (يتسلم جميع الكوليات أسفله):'
                  : '3. بيانات المستلم:'}
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">اسم المستلم *</label>
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
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">رقم هاتف المستلم *</label>
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
          )}

          {/* =================================================================== */}
          {/* SINGLE PARCEL BODY */}
          {/* =================================================================== */}
          {registrationMode === 'single' ? (
            <>
              {/* 4. Goods Description, Quantity, Weight & Auto Tariff Calculator */}
              <div className="bg-[#1a0f00]/80 p-3 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
                <span className="font-bold text-[#F5D799] block text-xs">
                  4. شنو فالكولية وعدد الطرود:
                </span>

                <div>
                  <label className="block text-[#C8B08A] mb-1 text-[11px]">
                    شنو فالكولية؟ (وصف البضاعة) *
                  </label>
                  <textarea
                    placeholder="اكتب نوع البضاعة أو المحتوى (مثلاً: كرتونة ملابس، قطع غيار، أمانة...)"
                    rows={2}
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-[#D4AF37] leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[#F5C84C] mb-1 text-[11px] font-black">
                      شحال من كولية/طرد لنفس المستلم؟ *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      value={itemsCount}
                      onChange={(e) => setItemsCount(e.target.value)}
                      className="w-full bg-[#120a00] border-2 border-[#F5C84C]/70 rounded-xl px-3 py-1.5 text-[#F5C84C] font-mono font-black text-sm focus:outline-none focus:border-[#F5C84C]"
                    />
                  </div>

                  <div>
                    <label className="block text-[#C8B08A] mb-1 text-[11px] font-bold flex items-center gap-1">
                      <Scale className="w-3 h-3 text-[#F5C84C]" />
                      <span>الوزن (kg) اختياري:</span>
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="مثال: 15"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/40 rounded-xl px-3 py-1.5 text-white font-mono font-bold text-xs focus:outline-none focus:border-[#F5C84C]"
                    />
                  </div>

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
                </div>

                {/* Notice when itemsCount > 1: Auto-print multiple stickers! */}
                {(parseInt(itemsCount, 10) || 1) > 1 && (
                  <div className="p-2.5 rounded-xl bg-[#F5C84C]/15 border border-[#F5C84C] text-[#F5D799] text-[11px] font-bold leading-relaxed animate-fadeIn">
                    🖨️ <strong className="text-[#F5C84C] font-black">تعدد التيكيتات التلقائي:</strong>{' '}
                    بما أن عدد الطرود هو <strong className="text-white font-mono">({itemsCount})</strong>، سيقوم التطبيق تلقائياً باستخراج{' '}
                    <strong className="text-[#F5C84C] font-black">{itemsCount} ديال التيكيتات (ملصقات)</strong>{' '}
                    مرقمة (<span className="font-mono">طرد 1 من {itemsCount}</span> ... إلى{' '}
                    <span className="font-mono">طرد {itemsCount} من {itemsCount}</span>) بنفس المعلومات والباركود باش تلصق كل تيكيتة على كولية!
                  </div>
                )}

                {/* Automatic Tariff Calculator Box */}
                <div className="bg-black/60 p-2.5 rounded-xl border border-[#F5C84C]/40 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-[#F5C84C]" />
                      <span className="font-black text-[11px] text-[#F5C84C]">
                        حاسبة التسعيرة التلقائية (من {originSt?.city || 'الانطلاق'} ⬅ إلى {destSt?.city || 'الوصول'}):
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
                        تعديل تسعيرة الخط (من {originSt?.city} ⬅ إلى {destSt?.city}):
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
                    <span>5. الثمن وخالص ولا ماشي خالص:</span>
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
                    <label className="block text-[#C8B08A] mb-1 text-[11px]">الثمن الإجمالي *</label>
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
                    <label className="block text-[#C8B08A] mb-1 text-[11px]">واش خالص ولا يخلص المستلم؟ *</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePayerChange('sender')}
                        className={`py-2 rounded-xl text-xs font-black transition ${
                          payer === 'sender' ? 'btn-gold' : 'btn-cancel'
                        }`}
                      >
                        ✓ خالص (أدى المرسل)
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePayerChange('receiver')}
                        className={`py-2 rounded-xl text-xs font-black transition ${
                          payer === 'receiver' ? 'btn-gold' : 'btn-cancel'
                        }`}
                      >
                        ⏳ غير خالص (يؤدي المستلم)
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
                      {remaining} {currency} {remaining === 0 ? '(خالص ✓)' : '(متبقي على المستلم)'}
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
            </>
          ) : (
            /* =================================================================== */
            /* MULTI-PARCEL BODY (بزاف ديال الكوليات من نفس المرسل - منظم وواضح) */
            /* =================================================================== */
            <div className="space-y-2.5">
              <div className="flex items-center justify-between bg-black/65 px-3 py-2.5 rounded-2xl border border-[#F5C84C]/50">
                <div>
                  <span className="font-black text-[#F5C84C] text-xs block">
                    📋 خانات الكوليات المرقمة ({multiItems.length} كوليات)
                  </span>
                  <span className="text-[10px] text-white/80">
                    {multiSubMode === 'one_receiver'
                      ? 'عمر غير شنو فالكولية والثمن لكل كولية (نفس المستلم أعلاه)'
                      : 'عمر لكل كولية: اسم المستلم + هاتفه + شنو فالكولية + الثمن'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAddMultiItem}
                  className="btn-gold px-3 py-1.5 rounded-xl font-black text-[11px] flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ زيد كولية</span>
                </button>
              </div>

              {multiItems.map((item, idx) => {
                const itemRem = Math.max(
                  0,
                  Math.round(((parseFloat(item.amountDue) || 0) - (parseFloat(item.amountPaid) || 0)) * 100) / 100
                );
                return (
                  <div
                    key={item.id}
                    className="bg-[#1a0f00]/95 p-3 rounded-2xl border-2 border-[#D4AF37]/60 space-y-2.5 relative shadow-md"
                  >
                    {/* Clean Numbered Header */}
                    <div className="flex items-center justify-between border-b border-[#D4AF37]/30 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#F5C84C] text-[#1a0f00] font-mono font-black text-xs flex items-center justify-center">
                          #{idx + 1}
                        </span>
                        <span className="font-black text-[#F5D799] text-xs">
                          الكولية رقم {idx + 1} من {multiItems.length}
                        </span>
                      </div>
                      {multiItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMultiItem(item.id)}
                          className="px-2 py-1 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold flex items-center gap-1 hover:bg-rose-500/30"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>حذف</span>
                        </button>
                      )}
                    </div>

                    {/* Receiver Name & Phone (Only if multi_receivers) */}
                    {multiSubMode === 'multi_receivers' && (
                      <div className="grid grid-cols-2 gap-2 bg-black/45 p-2.5 rounded-xl border border-[#D4AF37]/30">
                        <div>
                          <label className="block text-[#F5C84C] mb-1 text-[10px] font-black">
                            👤 اسم المستلم #{idx + 1} *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="اسم المستلم"
                            value={item.receiverName}
                            onChange={(e) =>
                              updateMultiItem(item.id, { receiverName: e.target.value })
                            }
                            className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-2.5 py-1.5 text-white text-xs focus:border-[#F5C84C] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[#F5C84C] mb-1 text-[10px] font-black">
                            📞 رقم هاتف المستلم #{idx + 1} *
                          </label>
                          <input
                            type="tel"
                            required
                            dir="ltr"
                            placeholder="0600000000"
                            value={item.receiverPhone}
                            onChange={(e) =>
                              updateMultiItem(item.id, { receiverPhone: e.target.value })
                            }
                            className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs focus:border-[#F5C84C] focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* What's inside the parcel (Description) + Packages Count */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-[#E6C37A] mb-1 text-[10px] font-bold">
                          📦 شنو فالكولية #{idx + 1} (الوصف) *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="مثلاً: كرتونة سلعة، ملابس، أمانة..."
                          value={item.description}
                          onChange={(e) =>
                            updateMultiItem(item.id, { description: e.target.value })
                          }
                          className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-2.5 py-1.5 text-white text-xs focus:border-[#F5C84C] focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[#C8B08A] mb-1 text-[10px] font-bold">
                          عدد الطرود
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={item.itemsCount}
                          onChange={(e) =>
                            updateMultiItem(item.id, { itemsCount: e.target.value })
                          }
                          className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-2.5 py-1.5 text-white font-mono font-bold text-xs text-center"
                        />
                      </div>
                    </div>

                    {/* Price & Paid / Unpaid toggle in one clean row */}
                    <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-white/10">
                      <div>
                        <label className="block text-[#E6C37A] mb-1 text-[10px] font-bold">
                          💰 الثمن ({currency}) *
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="مثلاً: 100"
                          value={item.amountDue}
                          onChange={(e) =>
                            updateMultiItem(item.id, { amountDue: e.target.value })
                          }
                          className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-2.5 py-1.5 text-white font-mono font-black text-xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[#E6C37A] mb-1 text-[10px] font-bold">
                          حالة الخلاص:
                        </label>
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => updateMultiItem(item.id, { payer: 'sender' })}
                            className={`py-1.5 px-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                              item.payer === 'sender'
                                ? 'bg-emerald-500 text-black'
                                : 'bg-black/50 text-white/70 border border-white/15'
                            }`}
                          >
                            ✓ خالص
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMultiItem(item.id, { payer: 'receiver' })}
                            className={`py-1.5 px-1.5 rounded-lg text-[10px] font-black transition cursor-pointer ${
                              item.payer === 'receiver'
                                ? 'bg-amber-500 text-black'
                                : 'bg-black/50 text-white/70 border border-white/15'
                            }`}
                          >
                            ⏳ المستلم يخلص
                          </button>
                        </div>
                      </div>
                    </div>

                    {(parseInt(item.itemsCount, 10) || 1) > 1 && (
                      <div className="text-[10px] text-[#F5C84C] bg-[#F5C84C]/10 border border-[#F5C84C]/30 rounded-lg px-2 py-1 font-bold">
                        🖨️ غادي يخرجو {item.itemsCount} ديال التيكيتات مرقمة (1/{item.itemsCount} إلى {item.itemsCount}/{item.itemsCount}) لهاد الكولية.
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={handleAddMultiItem}
                className="w-full py-2.5 rounded-2xl border-2 border-dashed border-[#F5C84C]/55 text-[#F5C84C] font-black text-xs flex items-center justify-center gap-1.5 hover:bg-[#F5C84C]/10 transition"
              >
                <Plus className="w-4 h-4" />
                <span>
                  {multiSubMode === 'one_receiver'
                    ? '+ إضافة كولية أخرى لنفس المستلم'
                    : '+ إضافة كولية أخرى لمستلم جديد'}
                </span>
              </button>

              {/* Multi Summary Box */}
              <div className="bg-black/65 p-3 rounded-2xl border border-[#F5C84C]/40 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-black text-[#F5C84C] block">
                    ملخص الإرسالية المتعددة ({multiItems.length} كوليات):
                  </span>
                  <span className="text-[10px] text-white/75 font-mono">
                    المدفوع الآن: {multiTotalPaid} {currency} | الباقي على المستلمين:{' '}
                    {Math.max(0, multiTotalDue - multiTotalPaid)} {currency}
                  </span>
                </div>
                <div className="text-left font-mono font-black text-sm text-white">
                  {multiTotalDue} {currency}
                </div>
              </div>
            </div>
          )}

          {/* Auto WhatsApp Toggle */}
          <div className="bg-black/50 p-2.5 rounded-2xl border border-emerald-500/35 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <span className="text-[11px] font-black text-white block">
                  إشعار واتساب تلقائي للمرسل مع كود التتبع
                </span>
                <span className="text-[9px] text-white/65 block">
                  فتح محادثة واتساب مع وصل الإيداع وكود التتبع فور الحفظ
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
                {isSubmitting
                  ? 'جاري تسجيل الكوليات...'
                  : registrationMode === 'multi'
                  ? `تأكيد تسجيل (${multiItems.length}) كوليات وطباعة الملصقات`
                  : 'تأكيد التسجيل وطباعة التذكرة الحرارية'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
