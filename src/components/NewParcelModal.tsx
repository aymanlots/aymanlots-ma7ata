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
import { HelpPopover } from './HelpPopover';

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

  // Financial fields - ديما 0 والمدير أو العامل يعمرها مانويل
  const [amountDue, setAmountDue] = useState('0');
  const [payer, setPayer] = useState<ParcelPayer>('sender');
  const [amountPaid, setAmountPaid] = useState('0');
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
    amountDue: '0',
    payer: 'sender',
    amountPaid: '0',
    condition: 'normal',
    conditionNotes: '',
  });

  const [multiItems, setMultiItems] = useState<MultiParcelItemDraft[]>([]);

  // Auto Calculator & VIP Customer state
  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>([]);
  const [selectedVipSender, setSelectedVipSender] = useState<SavedCustomer | null>(null);
  const [routeTariffs, setRouteTariffs] = useState<RouteTariff[]>([]);
  const [autoApplyPrice, setAutoApplyPrice] = useState<boolean>(false);
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

      // Reset all sender/receiver/parcel fields cleanly - ديما 0
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
      setAmountDue('0');
      setPayer('sender');
      setAmountPaid('0');
      setAutoApplyPrice(false);
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
      className="fixed inset-0 z-50 flex justify-center items-center p-2.5 sm:p-4 m-0 bg-black/85 backdrop-blur-md animate-fadeIn overflow-hidden"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-[96%] max-w-[420px] max-h-[94dvh] rounded-2xl luxury-card border-2 border-[#D4AF37]/65 p-3.5 shadow-2xl text-right overflow-hidden relative z-10 m-0 flex flex-col justify-between gap-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header: Title + Mode Switcher + Close on ONE Row */}
        <div className="flex items-center justify-between gap-2 border-b border-[#D4AF37]/30 pb-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-lg leading-none">📦</span>
            <h2 className="text-sm sm:text-base font-black text-[#F5D799] truncate">
              تسجيل كولي جديد
            </h2>
            <HelpPopover
              title="تسجيل الكوليات"
              text="السطر الأول: محطة الانطلاق حدا محطة الوصول. السطر الثاني: المرسل تحت الانطلاق والمستلم تحت الوصول. السطر الثالث: وصف البضاعة حدا الثمن."
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setRegistrationMode('single')}
              className={`py-1.5 px-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
                registrationMode === 'single' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              📦 1
            </button>
            <button
              type="button"
              onClick={() => setRegistrationMode('multi')}
              className={`py-1.5 px-2.5 rounded-xl text-xs sm:text-sm font-black transition cursor-pointer ${
                registrationMode === 'multi' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              📚 متعدد
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="btn-delete p-1.5 rounded-xl"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {registrationMode === 'multi' && (
          <div className="grid grid-cols-2 gap-2 shrink-0 animate-fadeIn">
            <button
              type="button"
              onClick={() => setMultiSubMode('one_receiver')}
              className={`py-2 px-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition ${
                multiSubMode === 'one_receiver' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              <span>👤 مستلم واحد</span>
            </button>
            <button
              type="button"
              onClick={() => setMultiSubMode('multi_receivers')}
              className={`py-2 px-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 transition ${
                multiSubMode === 'multi_receivers' ? 'btn-gold' : 'btn-cancel'
              }`}
            >
              <span>👥 عدة مستلمين</span>
            </button>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="bg-rose-950/60 border border-rose-500/40 p-2 rounded-xl text-xs sm:text-sm text-rose-300 flex items-center gap-1.5 font-black shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="truncate">{errorMessage}</span>
          </div>
        )}

        {/* Form Body — Organized 2-Column Grid with Clear, Comfortable Boxes & Text */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 flex flex-col justify-between gap-2.5 min-h-0 overflow-hidden text-xs sm:text-sm"
        >
          {/* السطر الفوقاني: [ محطة الانطلاق ] حدا [ محطة الوصول ] */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            {/* محطة الانطلاق (اليمين) */}
            <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col justify-between gap-1.5">
              <label className="block text-[#F5D799] font-black text-xs sm:text-sm truncate">
                📍 محطة الانطلاق
              </label>
              <select
                value={originStationId}
                disabled={userRole === 'worker'}
                onChange={(e) => setOriginStationId(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-[#FFF8EB] font-black text-xs sm:text-sm focus:outline-none disabled:opacity-70 truncate"
                required
              >
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.city})
                  </option>
                ))}
              </select>
            </div>

            {/* محطة الوصول (اليسار - حدا محطة الانطلاق) */}
            <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col justify-between gap-1.5">
              <div className="flex items-center justify-between gap-1">
                <label className="block text-[#F5D799] font-black text-xs sm:text-sm truncate">
                  📍 محطة الوصول
                </label>
                {selectedPartnerDest && (
                  <span className="px-1.5 py-0.5 rounded bg-purple-950/80 border border-purple-400/50 text-purple-200 text-[10px] font-black truncate shrink-0">
                    🤝 شريك
                  </span>
                )}
              </div>
              <select
                value={destinationStationId}
                onChange={(e) => {
                  const newDest = e.target.value;
                  setDestinationStationId(newDest);
                  setMultiItems((prev) =>
                    prev.map((it) => ({ ...it, destinationStationId: newDest }))
                  );
                }}
                className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-[#FFF8EB] font-black text-xs sm:text-sm focus:outline-none truncate"
                required
              >
                {stations.length > 0 && (
                  <optgroup label="🏠 محطاتنا">
                    {stations.map((st) => (
                      <option key={st.id} value={st.id}>
                        🏠 {st.name} ({st.city})
                      </option>
                    ))}
                  </optgroup>
                )}
                {partnerDestinationStations.length > 0 && (
                  <optgroup label="🤝 محطات الشركاء">
                    {partnerDestinationStations.map((pst) => (
                      <option key={pst.id} value={pst.id}>
                        🤝 {pst.name} ({pst.city})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
          </div>

          {/* السطر اللي تحت منو نيشان: [ اسم المرسل ] تحت محطة الانطلاق | [ اسم المستلم ] تحت محطة الوصول */}
          <div className="grid grid-cols-2 gap-2.5 shrink-0">
            {/* اسم المرسل (تحت محطة الانطلاق نيشان) */}
            <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col justify-between gap-2">
              <span className="font-black text-[#F5D799] block text-xs sm:text-sm truncate">
                👤 اسم المرسل
              </span>
              <input
                type="text"
                placeholder="👤 اسم المرسل *"
                required
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none"
              />
              <input
                type="tel"
                placeholder="📞 هاتف المرسل *"
                required
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                dir="ltr"
                className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-white font-mono font-black text-xs sm:text-sm focus:outline-none"
              />
            </div>

            {/* اسم المستلم (تحت محطة الوصول نيشان) */}
            {registrationMode === 'single' || multiSubMode === 'one_receiver' ? (
              <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col justify-between gap-2">
                <span className="font-black text-[#E6C37A] block text-xs sm:text-sm truncate">
                  👤 اسم المستلم
                </span>
                <input
                  type="text"
                  placeholder="👤 اسم المستلم *"
                  required
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none"
                />
                <input
                  type="tel"
                  placeholder="📞 هاتف المستلم *"
                  required
                  value={receiverPhone}
                  onChange={(e) => setReceiverPhone(e.target.value)}
                  dir="ltr"
                  className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-white font-mono font-black text-xs sm:text-sm focus:outline-none"
                />
              </div>
            ) : (
              <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col items-center justify-center text-center">
                <span className="font-black text-[#E6C37A] text-xs sm:text-sm">👥 عدة مستلمين</span>
                <span className="text-xs opacity-80 mt-1">يتم تحديد المستلم لكل كولي بالأسفل</span>
              </div>
            )}
          </div>

          {registrationMode === 'single' ? (
            <>
              {/* السطر اللي تحت كاع: [ وصف البضاعة ] حدا [ الثمن ] */}
              <div className="grid grid-cols-2 gap-2.5 shrink-0">
                {/* وصف البضاعة (اليمين) */}
                <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col justify-between gap-2">
                  <div className="flex items-center justify-between text-xs sm:text-sm font-black text-[#F5D799]">
                    <span className="truncate">📦 وصف البضاعة</span>
                    {(parseInt(itemsCount, 10) || 1) > 1 && (
                      <span className="text-xs font-black shrink-0">🖨️ {itemsCount}</span>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="📦 وصف البضاعة *"
                    required
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2.5 py-2.5 text-white font-black text-xs sm:text-sm focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[#F5D799] shrink-0">🔢 العدد:</span>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      required
                      title="شحال من كولية (العدد)"
                      placeholder="1"
                      value={itemsCount}
                      onChange={(e) => setItemsCount(e.target.value)}
                      className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2 py-2 text-center text-[#F5C84C] font-mono font-black text-xs sm:text-sm focus:outline-none"
                    />
                  </div>
                </div>

                {/* الثمن (اليسار - حدا وصف البضاعة) */}
                <div className="bg-[#1a0f00]/80 p-2.5 rounded-xl border border-[#D4AF37]/50 flex flex-col justify-between gap-2">
                  <span className="font-black text-[#F5D799] block text-xs sm:text-sm truncate">
                    💰 الثمن
                  </span>
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <input
                      type="text"
                      inputMode="decimal"
                      required
                      placeholder="💰 الثمن"
                      value={amountDue}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9.]/g, '');
                        setAutoApplyPrice(false);
                        handleAmountDueChange(val);
                      }}
                      className="col-span-7 w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2 py-2.5 text-center text-white font-mono font-black text-xs sm:text-sm focus:outline-none"
                    />
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="col-span-5 w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-1.5 py-2.5 text-white font-mono font-black text-xs sm:text-sm focus:outline-none"
                    >
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    data-btn-role={payer === 'sender' ? 'add' : 'remove'}
                    data-btn-role-fixed="true"
                    onClick={() => handlePayerChange(payer === 'sender' ? 'receiver' : 'sender')}
                    title="اضغط للتبديل بين خالص وكريدي"
                    className={`w-full py-2 px-2.5 rounded-xl text-xs sm:text-sm font-black truncate cursor-pointer ${
                      payer === 'sender' ? 'btn-add' : 'btn-delete'
                    }`}
                  >
                    {payer === 'sender' ? '✅ خالص' : '⏳ كريدي'}
                  </button>
                </div>
              </div>

              {/* زر التسجيل والطباعة الكبير فالتحت */}
              <button
                type="submit"
                disabled={isSubmitting}
                data-btn-role="add"
                data-btn-role-fixed="true"
                className="btn-add w-full py-3.5 px-4 rounded-xl font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow disabled:opacity-50 cursor-pointer shrink-0"
              >
                <span>{isSubmitting ? '⏳ جاري التسجيل...' : '✅ تسجيل الكولية وطباعة الملصق 🖨️'}</span>
              </button>
            </>
          ) : (
            /* MULTI-PARCEL STACKED LIST */
            <div className="flex-1 flex flex-col justify-between gap-2 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
                {multiItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="bg-[#1a0f00]/95 p-2 rounded-xl border border-[#D4AF37]/60 space-y-1.5"
                  >
                    {multiSubMode === 'multi_receivers' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        <input
                          type="text"
                          required
                          placeholder={`👤 مستلم #${idx + 1} *`}
                          value={item.receiverName}
                          onChange={(e) => updateMultiItem(item.id, { receiverName: e.target.value })}
                          className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2 py-2 text-white font-black text-xs sm:text-sm"
                        />
                        <input
                          type="tel"
                          required
                          dir="ltr"
                          placeholder="📞 الهاتف *"
                          value={item.receiverPhone}
                          onChange={(e) => updateMultiItem(item.id, { receiverPhone: e.target.value })}
                          className="w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2 py-2 text-white font-mono font-black text-xs sm:text-sm"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-12 gap-1.5 items-center">
                      <span className="col-span-1 text-xs font-black text-[#F5D799] text-center">
                        #{idx + 1}
                      </span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        placeholder="🔢"
                        value={item.itemsCount}
                        onChange={(e) => updateMultiItem(item.id, { itemsCount: e.target.value })}
                        className="col-span-2 w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-1.5 py-2 text-white font-mono font-black text-xs sm:text-sm text-center"
                      />
                      <input
                        type="text"
                        required
                        placeholder="📦 الوصف *"
                        value={item.description}
                        onChange={(e) => updateMultiItem(item.id, { description: e.target.value })}
                        className="col-span-4 w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-2 py-2 text-white font-black text-xs sm:text-sm"
                      />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="💰 الثمن"
                        value={item.amountDue}
                        onChange={(e) => updateMultiItem(item.id, { amountDue: e.target.value })}
                        className="col-span-2 w-full bg-[#120a00] border border-[#D4AF37]/50 rounded-xl px-1.5 py-2 text-white font-mono font-black text-xs sm:text-sm text-center"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateMultiItem(item.id, {
                            payer: item.payer === 'sender' ? 'receiver' : 'sender',
                          })
                        }
                        className={`col-span-2 py-2 px-1.5 rounded-xl text-xs font-black truncate cursor-pointer ${
                          item.payer === 'sender' ? 'btn-add' : 'btn-delete'
                        }`}
                      >
                        {item.payer === 'sender' ? '✅خالص' : '⏳كريدي'}
                      </button>
                      {multiItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveMultiItem(item.id)}
                          className="col-span-1 btn-delete p-2 rounded-xl text-xs font-bold flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Bar for Multi Mode */}
              <div className="bg-black/55 p-2 rounded-xl border border-[#F5C84C]/40 space-y-2 shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={multiItems.length}
                      onChange={(e) => handleSetBulkCount(parseInt(e.target.value, 10) || 1)}
                      title="عدد الكوليات"
                      className="w-12 bg-[#120a00] border border-[#F5C84C] rounded-xl px-1.5 py-1.5 text-center text-[#F5C84C] font-mono font-black text-xs sm:text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddMultiItem}
                      className="btn-add px-2.5 py-1.5 rounded-xl font-black text-xs sm:text-sm shrink-0"
                    >
                      + زيد كولية
                    </button>
                  </div>

                  <span className="text-xs sm:text-sm font-black text-[#F5C84C] font-mono truncate">
                    💰 المجموع: {multiTotalDue} {currency}
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  data-btn-role="add"
                  data-btn-role-fixed="true"
                  className="btn-add w-full py-3 px-4 rounded-xl font-black text-sm sm:text-base flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>
                    {isSubmitting ? '⏳ جاري التسجيل...' : `✅ تأكيد وتسجيل (${multiItems.length}) كوليات وطباعة 🖨️`}
                  </span>
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

