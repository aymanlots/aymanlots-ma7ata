import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  ManagerPartnership,
  PartnershipSettlement,
} from '../types/database';
import { firebaseSyncService } from '../services/firebaseSyncService';
import {
  X,
  ShieldCheck,
  Send,
  Crown,
  RefreshCw,
  Clock,
  MapPin,
  Building2,
  AlertTriangle,
  Printer,
  Plus,
  Wallet,
  Search,
  MessageCircle,
  Star,
  Handshake,
  Package,
  ArrowRight,
} from 'lucide-react';
import { HelpPopover } from './HelpPopover';

interface AdminCollaborationRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type RoomTab = 'directory' | 'partnerships';

export const AdminCollaborationRoomModal: React.FC<AdminCollaborationRoomModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentUser,
    currentWorkspace,
    parcels,
    managerPartnerships,
    registeredManagersNetwork,
    loadRegisteredManagersNetwork,
    sendPartnershipRequest,
    respondToPartnershipRequest,
    recordPartnershipSettlement,
    dispatchParcelToPartner,
    respondToPartnerParcel,
    acceptAllPendingPartnerParcels,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<RoomTab>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyActiveFilter, setOnlyActiveFilter] = useState<boolean>(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Settlement recording modal state
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState<number>(0);
  const [settlementCurrency, setSettlementCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [settlementMethod, setSettlementMethod] = useState<
    'cash' | 'bank_transfer' | 'cash_plus' | 'wafacash' | 'other'
  >('cash_plus');
  const [settlementRef, setSettlementRef] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [isSubmittingSettlement, setIsSubmittingSettlement] = useState(false);

  // Real-time settlement records for selected partnership
  const [partnershipSettlements, setPartnershipSettlements] = useState<PartnershipSettlement[]>([]);

  // Dispatch parcel modal state
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchParcelId, setDispatchParcelId] = useState<string>('');
  const [dispatchStationId, setDispatchStationId] = useState<string>('');
  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  // Mutual parcels sub-filter: 'sent' vs 'received'
  const [parcelFilterDirection, setParcelFilterDirection] = useState<'sent' | 'received'>('sent');

  // Load registered managers directory when modal opens and keep it synced in real-time with Firebase
  useEffect(() => {
    if (!isOpen) return;
    setIsRefreshing(true);
    loadRegisteredManagersNetwork().finally(() => setIsRefreshing(false));

    const unsubWorkspaces = firebaseSyncService.subscribeToAllWorkspaces(() => {
      loadRegisteredManagersNetwork();
    });

    const syncInterval = window.setInterval(() => {
      loadRegisteredManagersNetwork();
    }, 4500);

    return () => {
      unsubWorkspaces();
      window.clearInterval(syncInterval);
    };
  }, [isOpen, loadRegisteredManagersNetwork]);

  // Selected partnership object
  const activePartnership = useMemo(() => {
    if (!selectedPartnerId) return null;
    return managerPartnerships.find((p) => p.id === selectedPartnerId) || null;
  }, [selectedPartnerId, managerPartnerships]);

  // If activePartnership is selected, load its settlements from Firestore in real-time
  useEffect(() => {
    if (!activePartnership?.id) {
      setPartnershipSettlements([]);
      return;
    }
    const unsub = firebaseSyncService.subscribeToPartnershipSettlements(
      activePartnership.id,
      (settlements) => {
        setPartnershipSettlements(settlements);
      }
    );
    return () => unsub();
  }, [activePartnership?.id]);

  const myWsId = currentWorkspace?.id || '';
  const myCleanPhone = (currentUser?.phone || currentWorkspace?.owner_phone || '').replace(/[^0-9]/g, '');
  const myCleanEmail = (currentUser?.email || currentWorkspace?.owner_email || '').trim().toLowerCase();

  // Helper to determine partner info from partnership (merging live stations from network directory)
  const getPartnerInfo = (p: ManagerPartnership) => {
    const isA = p.workspace_a_id === myWsId;
    const partnerWsId = isA ? p.workspace_b_id : p.workspace_a_id;
    const liveEntry = registeredManagersNetwork.find((m) => m.workspaceId === partnerWsId);
    const storedStations = (isA ? p.workspace_b_stations : p.workspace_a_stations) || [];
    const mergedStationsMap = new Map<string, any>();
    for (const st of [...(liveEntry?.stations || []), ...storedStations]) {
      if (st?.id && !mergedStationsMap.has(st.id)) {
        mergedStationsMap.set(st.id, st);
      }
    }
    return {
      workspaceId: partnerWsId,
      workspaceName: liveEntry?.workspaceName || (isA ? p.workspace_b_name : p.workspace_a_name),
      ownerName: liveEntry?.ownerName || (isA ? p.workspace_b_owner_name : p.workspace_a_owner_name),
      phone: liveEntry?.phone || (isA ? p.workspace_b_phone : p.workspace_a_phone),
      whatsapp: liveEntry?.whatsapp || (isA ? p.workspace_b_whatsapp : p.workspace_a_whatsapp),
      email: liveEntry?.email || (isA ? p.workspace_b_email : p.workspace_a_email),
      stations: Array.from(mergedStationsMap.values()),
    };
  };

  // Mutual parcels calculation for activePartnership
  const partnerInfo = activePartnership ? getPartnerInfo(activePartnership) : null;

  // Parcels sent by us to this specific partner (strictly isolated to partnerInfo.workspaceId)
  const sentParcels = useMemo(() => {
    if (!partnerInfo) return [];
    return parcels.filter((p) => {
      const isFromUs =
        !p.is_collaborator_data &&
        (!p.partner_origin_workspace_id || p.partner_origin_workspace_id === myWsId);
      if (!isFromUs) return false;
      return (
        p.partner_workspace_id === partnerInfo.workspaceId ||
        partnerInfo.stations.some(
          (st) => st.id === p.destination_station_id || st.id === p.partner_destination_station_id
        )
      );
    });
  }, [parcels, myWsId, partnerInfo]);

  // Parcels received from this specific partner (strictly isolated to partnerInfo.workspaceId)
  const receivedParcels = useMemo(() => {
    if (!partnerInfo) return [];
    return parcels.filter((p) => {
      if (p.partner_origin_workspace_id) {
        return p.partner_origin_workspace_id === partnerInfo.workspaceId;
      }
      if (p.is_collaborator_data && p.collaborator_workspace_name) {
        return p.collaborator_workspace_name === partnerInfo.workspaceName;
      }
      return false;
    });
  }, [parcels, partnerInfo]);

  // Base list of other managers (strictly excluding current user AND Super Admin / Platform Owner)
  const eligibleManagers = useMemo(() => {
    return registeredManagersNetwork.filter((m) => {
      if (m.workspaceId === myWsId) return false;
      const mPhone = (m.phone || '').replace(/[^0-9]/g, '');
      const mWhatsapp = (m.whatsapp || '').replace(/[^0-9]/g, '');
      const mEmail = (m.email || '').trim().toLowerCase();

      // Exclude current logged-in user's own accounts
      if (myCleanPhone && mPhone && mPhone === myCleanPhone) return false;
      if (myCleanEmail && mEmail && mEmail === myCleanEmail) return false;

      // Strictly exclude Super Admin / Platform Owner account so it never appears to anyone
      if (
        mPhone.includes('618961387') ||
        mWhatsapp.includes('618961387') ||
        mEmail === 'aissaaimanekhlifi@gmail.com' ||
        mPhone === '0000000000' ||
        mPhone === '0600000000'
      ) {
        return false;
      }

      return true;
    });
  }, [registeredManagersNetwork, myWsId, myCleanPhone, myCleanEmail]);

  const activeWorkingManagersCount = useMemo(
    () => eligibleManagers.filter((m) => (m.stars ?? 0) > 0 || m.stations.length > 0).length,
    [eligibleManagers]
  );

  // Filtered managers by search & active toggle
  const filteredManagers = useMemo(() => {
    return eligibleManagers.filter((m) => {
      if (onlyActiveFilter && (m.stars ?? 0) === 0 && m.stations.length === 0) {
        return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const stationMatch = m.stations.some(
        (s) => s.city.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      );
      return (
        m.workspaceName.toLowerCase().includes(q) ||
        m.ownerName.toLowerCase().includes(q) ||
        m.phone.includes(q) ||
        (m.email && m.email.toLowerCase().includes(q)) ||
        stationMatch
      );
    });
  }, [eligibleManagers, onlyActiveFilter, searchQuery]);

  if (!isOpen) return null;

  // Active partnerships list
  const activePartnershipsList = managerPartnerships.filter((p) => p.status === 'active');
  const pendingIncomingRequests = managerPartnerships.filter(
    (p) => p.status === 'pending' && p.initiated_by_workspace_id !== myWsId
  );

  // Helper to check existing partnership status with a given workspace
  const getPartnershipStatusWith = (targetWsId: string) => {
    const p = managerPartnerships.find(
      (item) => item.workspace_a_id === targetWsId || item.workspace_b_id === targetWsId
    );
    return p || null;
  };

  // Financial reconciliation between the 2 partners:
  const totalSentCodDue = sentParcels.reduce(
    (sum, p) => sum + (p.cod_amount || p.amount_due || 0),
    0
  );
  const totalReceivedCodCollected = receivedParcels.reduce(
    (sum, p) => sum + (p.cod_amount || p.amount_due || 0),
    0
  );

  const settlementsWePaid = partnershipSettlements
    .filter((s) => s.payer_workspace_id === myWsId)
    .reduce((sum, s) => sum + s.amount, 0);

  const settlementsPartnerPaid = partnershipSettlements
    .filter((s) => s.payer_workspace_id !== myWsId)
    .reduce((sum, s) => sum + s.amount, 0);

  // Net Balance: (What partner owes us) - (What we owe partner)
  const netSettlementBalance =
    totalSentCodDue - settlementsPartnerPaid - (totalReceivedCodCollected - settlementsWePaid);

  const handleRecordSettlementSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartnership || settlementAmount <= 0) {
      showToast('يرجى إدخال مبلغ تسوية صحيح', 'error');
      return;
    }
    setIsSubmittingSettlement(true);
    try {
      await recordPartnershipSettlement(activePartnership.id, {
        amount: settlementAmount,
        currency: settlementCurrency,
        payment_method: settlementMethod,
        reference_number: settlementRef.trim() || undefined,
        notes: settlementNotes.trim() || undefined,
      });
      setShowSettlementModal(false);
      setSettlementAmount(0);
      setSettlementRef('');
      setSettlementNotes('');
    } finally {
      setIsSubmittingSettlement(false);
    }
  };

  const handleDispatchParcelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerInfo || !dispatchParcelId || !dispatchStationId) {
      showToast('يرجى اختيار الكولي ومحطة الشريك الوجهة', 'error');
      return;
    }
    setIsSubmittingDispatch(true);
    try {
      await dispatchParcelToPartner(dispatchParcelId, partnerInfo.workspaceId, dispatchStationId);
      setShowDispatchModal(false);
      setDispatchParcelId('');
      setDispatchStationId('');
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  const formatPhoneForWhatsApp = (rawPhone?: string) => {
    if (!rawPhone) return '';
    let clean = rawPhone.replace(/[^0-9]/g, '');
    if (clean.startsWith('06') || clean.startsWith('07')) {
      clean = '212' + clean.substring(1);
    }
    return clean;
  };

  const sendReconciliationWhatsApp = () => {
    if (!partnerInfo) return;
    const phone = formatPhoneForWhatsApp(partnerInfo.whatsapp || partnerInfo.phone);
    if (!phone) {
      showToast('رقم هاتف الشريك غير متوفر', 'error');
      return;
    }

    const balanceText =
      netSettlementBalance > 0
        ? `• صافي الحساب: *أنت تسال الشريك ${netSettlementBalance.toLocaleString()} ${settlementCurrency}*`
        : netSettlementBalance < 0
        ? `• صافي الحساب: *الشريك يسالك ${Math.abs(netSettlementBalance).toLocaleString()} ${settlementCurrency}*`
        : `• صافي الحساب: *الحساب متصافي 0.00 (مسوّى تماماً)*`;

    const message =
      `السلام عليكم أخي *${partnerInfo.ownerName}* (${partnerInfo.workspaceName}) 🤝\n` +
      `تحية طيبة من شركة *${currentWorkspace?.name}*.\n\n` +
      `📊 *ملخص وتصفية كشف حساب الشراكة بيننا:*\n` +
      `• كوليات أرسلناها لكم: *${sentParcels.length} كولي* (مجموع COD: ${totalSentCodDue.toLocaleString()} ${settlementCurrency})\n` +
      `• كوليات استلمناها منكم: *${receivedParcels.length} كولي* (مجموع COD: ${totalReceivedCodCollected.toLocaleString()} ${settlementCurrency})\n` +
      `• دفعات التسوية المسجلة: *${partnershipSettlements.length} دفعة*\n` +
      `${balanceText}\n\n` +
      `المرجو مراجعة الحساب وتأكيد التسوية. شكراً لشراكتكم الدائمة! 🚚`;

    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const handlePrintStatement = () => {
    window.print();
  };

  // Helper to render Star Rating Badge next to Manager Name
  const renderManagerStarsBadge = (
    stars: number = 0,
    activityLabel?: string,
    parcelsCount: number = 0
  ) => {
    if (stars <= 0) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-black/50 border border-white/15 text-[10px] font-bold text-[#C8B08A]"
          title="هذا الحساب لم ينشئ محطات أو كوليات بعد"
        >
          <Star className="w-3 h-3 text-white/30" />
          <span>بدون نجوم (غير نشيط)</span>
        </span>
      );
    }

    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#D4AF37]/20 border border-[#F5C84C]/50 shadow-xs">
        <div className="flex items-center gap-0.5" title={`التقييم: ${stars} من 5 نجوم`}>
          {[1, 2, 3, 4, 5].map((idx) => (
            <Star
              key={idx}
              className={`w-3 h-3 ${
                idx <= stars
                  ? 'text-[#F5C84C] fill-[#F5C84C] drop-shadow-[0_0_4px_rgba(245,200,76,0.5)]'
                  : 'text-white/20'
              }`}
            />
          ))}
        </div>
        <span className="text-[10px] font-black text-[#F5D799]">
          ({stars}/5)
        </span>
        {activityLabel && (
          <span className="text-[9px] font-extrabold text-emerald-300 border-r border-white/15 pr-1">
            {activityLabel}
          </span>
        )}
        {parcelsCount > 0 && (
          <span className="text-[9px] font-mono text-[#E6C37A]">
            • {parcelsCount} كولي
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/85 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] luxury-card rounded-[26px] p-4 shadow-2xl text-right overflow-hidden relative my-2 max-h-[93vh] flex flex-col border-2 border-[#D4AF37]/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Luxury Header */}
        <div className="flex items-center justify-between border-b border-[#D4AF37]/30 pb-3 shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F5B05B] to-[#D4882A] text-[#1a0f00] flex items-center justify-center shrink-0 shadow-md">
              <Handshake className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-base sm:text-lg font-black text-[#F5D799] truncate">
                🤝 غرفة الشراكة
              </h2>
              <HelpPopover
                title="غرفة الشراكة وتعاون المدراء"
                text="ربط الشراكة مع مدراء المحطات في المدن الأخرى لتبادل الكوليات وتصفية الحسابات (COD) بدقة."
              />
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsRefreshing(true);
                loadRegisteredManagersNetwork().finally(() => setIsRefreshing(false));
                showToast('تم تحديث قائمة المدراء وتقييماتهم بنجاح', 'success');
              }}
              disabled={isRefreshing}
              className="btn-cancel p-2 rounded-xl text-[#F5C84C] hover:border-[#F5C84C] transition disabled:opacity-50"
              title="تحديث القائمة"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel p-2 rounded-xl transition"
              title="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Incoming Partnership Requests Notification Banner */}
        {pendingIncomingRequests.length > 0 && (
          <div className="mt-3 bg-[#1a0f00] border-2 border-[#F5C84C] rounded-2xl p-3 space-y-2 shrink-0 shadow-lg">
            <div className="flex items-center gap-2 text-xs text-[#F5D799] font-black">
              <AlertTriangle className="w-4 h-4 text-[#F5C84C] shrink-0" />
              <span>
                لديك ({pendingIncomingRequests.length}) طلب شراكة جديد بانتظار موافقتك:
              </span>
            </div>
            <div className="space-y-1.5">
              {pendingIncomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between gap-2 bg-black/50 p-2 rounded-xl border border-[#D4AF37]/40 text-xs"
                >
                  <div className="min-w-0">
                    <span className="text-white font-black block truncate">
                      {req.workspace_a_name}
                    </span>
                    <span className="text-[10px] text-[#E6C37A] block">
                      المدير: {req.workspace_a_owner_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => respondToPartnershipRequest(req.id, true)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 text-black font-black text-[10px] hover:bg-emerald-400 transition"
                    >
                      قبول 🤝
                    </button>
                    <button
                      type="button"
                      onClick={() => respondToPartnershipRequest(req.id, false)}
                      className="px-2 py-1 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[10px] hover:bg-rose-500/30 transition"
                    >
                      رفض
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Main Navigation Tabs (Luxury Gold Style) */}
        <div className="grid grid-cols-2 gap-2 mt-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab('directory');
            }}
            className={`py-2.5 px-2 rounded-xl font-black text-xs border transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'directory'
                ? 'bg-gradient-to-r from-[#F5B05B] to-[#D4882A] border-[#F8C885] text-[#1a0f00] shadow-md'
                : 'bg-[#120a00] border-[#D4AF37]/35 text-[#E6C37A] hover:border-[#D4AF37]/60'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span>المدراء والمحطات ({filteredManagers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('partnerships');
              if (!selectedPartnerId && activePartnershipsList[0]) {
                setSelectedPartnerId(activePartnershipsList[0].id);
              }
            }}
            className={`py-2.5 px-2 rounded-xl font-black text-xs border transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'partnerships'
                ? 'bg-gradient-to-r from-[#F5B05B] to-[#D4882A] border-[#F8C885] text-[#1a0f00] shadow-md'
                : 'bg-[#120a00] border-[#D4AF37]/35 text-[#E6C37A] hover:border-[#D4AF37]/60'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>شركائي والحساب ({activePartnershipsList.length})</span>
          </button>
        </div>

        {/* =================================================================== */}
        {/* TAB 1: DIRECTORY OF MANAGERS WITH STAR RATINGS & STATIONS           */}
        {/* =================================================================== */}
        {activeTab === 'directory' && (
          <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-0.5 text-xs min-h-0">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="ابحث بالمدينة (نواذيبو، الداخلة، كازا، العيون...) أو اسم المدير..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-[#C8B08A]/60 focus:outline-none focus:border-[#F5C84C] pl-9"
              />
              <Search className="w-4 h-4 text-[#E6C37A] absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* Filter Pills: All vs Active Working Managers */}
            <div className="flex items-center justify-between gap-2 bg-[#120a00]/90 p-2 rounded-xl border border-[#D4AF37]/30">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-black text-[#E6C37A]">
                  ⭐ النشاط:
                </span>
                <HelpPopover
                  title="تقييم نجوم النشاط والخدمة"
                  text="تظهر بجانب كل مدير نجوم تعبر عن نشاطه الفعلي وعدد محطاته وإرسالياته في التطبيق (من ⭐ إلى 5 نجوم ⭐⭐⭐⭐⭐) لتميز المدير النشيط عن غير النشيط."
                />
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setOnlyActiveFilter(false)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black transition cursor-pointer ${
                    !onlyActiveFilter
                      ? 'bg-[#F5C84C] text-[#1a0f00]'
                      : 'bg-black/40 text-[#C8B08A] border border-white/10'
                  }`}
                >
                  الكل ({eligibleManagers.length})
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyActiveFilter(true)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition cursor-pointer ${
                    onlyActiveFilter
                      ? 'bg-[#F5C84C] text-[#1a0f00]'
                      : 'bg-black/40 text-[#F5C84C] border border-[#D4AF37]/40'
                  }`}
                >
                  <Star className="w-3 h-3 fill-current" />
                  <span>الخدامين ({activeWorkingManagersCount})</span>
                </button>
              </div>
            </div>

            {/* Managers Cards List */}
            {filteredManagers.length === 0 ? (
              <div className="p-6 text-center bg-[#120a00]/80 rounded-2xl border border-[#D4AF37]/30 space-y-2">
                <Building2 className="w-8 h-8 text-[#F5C84C] mx-auto opacity-60" />
                <p className="font-black text-[#F5D799] text-xs">
                  لا يوجد مدراء يطابقون البحث حالياً.
                </p>
                {onlyActiveFilter && (
                  <button
                    type="button"
                    onClick={() => setOnlyActiveFilter(false)}
                    className="text-[11px] font-bold text-[#F5C84C] underline"
                  >
                    عرض جميع الحسابات المسجلة
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredManagers.map((manager) => {
                  const existingP = getPartnershipStatusWith(manager.workspaceId);
                  const isPendingByMe =
                    existingP?.status === 'pending' &&
                    existingP.initiated_by_workspace_id === myWsId;
                  const isPendingIncoming =
                    existingP?.status === 'pending' &&
                    existingP.initiated_by_workspace_id !== myWsId;
                  const isActive = existingP?.status === 'active';
                  const stars = manager.stars ?? (manager.stations.length > 0 ? 1 : 0);

                  return (
                    <div
                      key={manager.workspaceId}
                      className={`p-3.5 rounded-2xl border transition space-y-2.5 ${
                        stars >= 3
                          ? 'bg-gradient-to-b from-[#1f1302] to-[#120a00] border-[#F5C84C]/60 shadow-md'
                          : 'bg-[#120a00]/95 border-[#D4AF37]/35'
                      }`}
                    >
                      {/* Manager Header + Star Rating Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h3 className="font-black text-[#F5D799] text-sm truncate">
                              {manager.workspaceName}
                            </h3>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-black/60 text-[#E6C37A] font-mono border border-[#D4AF37]/30">
                              {manager.shortId}
                            </span>
                          </div>

                          {/* Owner Name + Star Badge Right Next to Name */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-extrabold text-white flex items-center gap-1">
                              <Crown className="w-3.5 h-3.5 text-[#F5C84C] shrink-0" />
                              <span>المدير: {manager.ownerName}</span>
                            </span>
                            {renderManagerStarsBadge(
                              stars,
                              manager.activityLabel,
                              manager.parcelsCount
                            )}
                          </div>
                        </div>

                        {/* WhatsApp Direct Button */}
                        {manager.phone && (
                          <a
                            href={`https://wa.me/${formatPhoneForWhatsApp(
                              manager.whatsapp || manager.phone
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/35 transition shrink-0"
                            title="تواصل عبر الواتساب"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </a>
                        )}
                      </div>

                      {/* Stations & Cities */}
                      <div className="bg-black/45 p-2.5 rounded-xl border border-white/10 space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-bold text-[#E6C37A]">
                          <span>المحطات والمدن العاملة ({manager.stations.length}):</span>
                          {manager.stations.length > 0 && (
                            <span className="text-emerald-400 font-black">
                              ✓ محطات مفعلة
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {manager.stations.length === 0 ? (
                            <span className="text-[10px] text-[#C8B08A]/70 italic">
                              لا توجد محطات منشورة لدى هذا المدير بعد
                            </span>
                          ) : (
                            manager.stations.map((st) => (
                              <span
                                key={st.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1a0f00] text-[11px] font-black text-[#F5D799] border border-[#D4AF37]/45"
                              >
                                <MapPin className="w-3 h-3 text-[#F5C84C] shrink-0" />
                                <span>
                                  {st.name} ({st.city})
                                </span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Footer: Phone & Partnership Action Button */}
                      <div className="pt-1.5 border-t border-[#D4AF37]/20 flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[10px] text-[#C8B08A] font-mono" dir="ltr">
                          {manager.phone ? `📞 ${manager.phone}` : ''}
                        </span>

                        {isActive ? (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPartnerId(existingP.id);
                              setActiveTab('partnerships');
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-black transition cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>شريك معتمد 🤝 (فتح الحساب)</span>
                          </button>
                        ) : isPendingByMe ? (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 text-[#F5C84C] border border-[#D4AF37]/40 text-[11px] font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>طلب شراكة في الانتظار ⏳</span>
                          </span>
                        ) : isPendingIncoming ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => respondToPartnershipRequest(existingP.id, true)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-500 text-black font-black text-[11px] hover:bg-emerald-400 transition shadow"
                            >
                              قبول الشراكة
                            </button>
                            <button
                              type="button"
                              onClick={() => respondToPartnershipRequest(existingP.id, false)}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/20 text-rose-300 font-bold text-[11px] hover:bg-rose-500/30 transition"
                            >
                              رفض
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => sendPartnershipRequest(manager.workspaceId)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-[11px] transition shadow-md active:scale-95 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>إقامة شراكة وتبادل كوليات</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* TAB 2: ACTIVE PARTNERS & FINANCIAL SETTLEMENT LEDGER                */}
        {/* =================================================================== */}
        {activeTab === 'partnerships' && (
          <div className="flex-1 overflow-y-auto space-y-3 py-3 pr-0.5 text-xs min-h-0">
            {/* Horizontal Partner Selector Pills */}
            {activePartnershipsList.length === 0 ? (
              <div className="p-6 text-center bg-[#120a00]/90 rounded-2xl border border-[#D4AF37]/35 space-y-2.5">
                <Handshake className="w-10 h-10 text-[#F5C84C] mx-auto opacity-60" />
                <p className="font-black text-[#F5D799] text-sm">
                  لا توجد شراكات نشطة حالياً
                </p>
                <p className="text-[11px] text-[#C8B08A] leading-relaxed">
                  يمكنك الشراكة مع عدة مدراء في نفس الوقت (مثلاً 5 مدراء)، وكل شريك يكون له حسابه وكولياته المضبوطة بشكل مستقل.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('directory')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-xs shadow-md"
                >
                  استعراض المدراء وإضافة شريك
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <span className="text-[11px] text-[#E6C37A] font-black block">
                    اختر الشريك لعرض حسابه وكولياته ({activePartnershipsList.length}):
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {activePartnershipsList.map((p) => {
                      const pInfo = getPartnerInfo(p);
                      const isSelected = selectedPartnerId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPartnerId(p.id)}
                          className={`px-3 py-2 rounded-xl border text-right shrink-0 transition cursor-pointer ${
                            isSelected
                              ? 'bg-gradient-to-r from-[#F5B05B] to-[#D4882A] border-[#F8C885] text-[#1a0f00] font-black shadow-md'
                              : 'bg-[#120a00] border-[#D4AF37]/35 text-[#F5D799] hover:border-[#D4AF37]/70'
                          }`}
                        >
                          <span className="text-xs font-black block">{pInfo.workspaceName}</span>
                          <span
                            className={`text-[10px] block ${
                              isSelected ? 'text-[#1a0f00]/80 font-bold' : 'text-[#E6C37A]'
                            }`}
                          >
                            المدير: {pInfo.ownerName} ({pInfo.stations.length} محطات)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activePartnership && partnerInfo && (
                  <div className="space-y-3">
                    {/* Selected Partner Card & Quick Actions */}
                    <div className="bg-[#120a00] p-3.5 rounded-2xl border border-[#D4AF37]/45 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <h3 className="font-black text-[#F5D799] text-sm">
                            {partnerInfo.workspaceName}
                          </h3>
                          <p className="text-[11px] text-[#E6C37A] mt-0.5">
                            المدير: <strong className="text-white">{partnerInfo.ownerName}</strong> •{' '}
                            <span className="font-mono" dir="ltr">
                              {partnerInfo.phone || '—'}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={sendReconciliationWhatsApp}
                            className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30 transition"
                            title="مشاركة كشف الحساب عبر واتساب"
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handlePrintStatement}
                            className="p-2 rounded-xl bg-black/60 text-[#F5C84C] border border-[#D4AF37]/40 hover:border-[#F5C84C] transition"
                            title="طباعة كشف الحساب"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowDispatchModal(true)}
                          className="py-2 px-2.5 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>إرسال كولي للشريك</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSettlementModal(true)}
                          className="py-2 px-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>تسجيل دفعة تصفية</span>
                        </button>
                      </div>
                    </div>

                    {/* Prominent Net Balance Card (الحساب المضبوط) */}
                    <div
                      className={`p-3.5 rounded-2xl border-2 text-center space-y-1 shadow-lg ${
                        netSettlementBalance > 0
                          ? 'bg-emerald-950/50 border-emerald-500/60'
                          : netSettlementBalance < 0
                          ? 'bg-rose-950/50 border-rose-500/60'
                          : 'bg-[#1a0f00] border-[#D4AF37]/50'
                      }`}
                    >
                      <span className="text-[11px] text-[#E6C37A] font-black block">
                        صافي الحساب بينك وبين {partnerInfo.ownerName}:
                      </span>
                      {netSettlementBalance > 0 ? (
                        <div className="text-lg font-black text-emerald-400 font-mono">
                          أنت تسال الشريك: +{netSettlementBalance.toLocaleString()} MAD
                        </div>
                      ) : netSettlementBalance < 0 ? (
                        <div className="text-lg font-black text-rose-400 font-mono">
                          الشريك يسالك: -{Math.abs(netSettlementBalance).toLocaleString()} MAD
                        </div>
                      ) : (
                        <div className="text-base font-black text-[#F5C84C] font-mono">
                          ✓ الحساب متصافي 0.00 MAD (مضبوط)
                        </div>
                      )}
                      <p className="text-[10px] text-[#C8B08A]">
                        يُحتسب تلقائياً من مجموع الكوليات المرسلة والمستلمة ناقص الدفعات المسددة
                      </p>
                    </div>

                    {/* 4-Card Summary Breakdown */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30">
                        <span className="text-[10px] text-[#C8B08A] font-bold block">
                          كوليات مشات للشريك:
                        </span>
                        <strong className="text-sm font-black text-white font-mono block mt-0.5">
                          {sentParcels.length} كولي
                        </strong>
                        <span className="text-[10px] text-[#F5C84C] font-mono block">
                          مجموعها: {totalSentCodDue.toLocaleString()} MAD
                        </span>
                      </div>

                      <div className="bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30">
                        <span className="text-[10px] text-[#C8B08A] font-bold block">
                          كوليات جات من الشريك:
                        </span>
                        <strong className="text-sm font-black text-white font-mono block mt-0.5">
                          {receivedParcels.length} كولي
                        </strong>
                        <span className="text-[10px] text-emerald-400 font-mono block">
                          مجموعها: {totalReceivedCodCollected.toLocaleString()} MAD
                        </span>
                      </div>

                      <div className="bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30">
                        <span className="text-[10px] text-[#C8B08A] font-bold block">
                          دفعات سددناها للشريك:
                        </span>
                        <strong className="text-sm font-black text-emerald-400 font-mono block mt-0.5">
                          {settlementsWePaid.toLocaleString()} MAD
                        </strong>
                      </div>

                      <div className="bg-[#120a00] p-2.5 rounded-xl border border-[#D4AF37]/30">
                        <span className="text-[10px] text-[#C8B08A] font-bold block">
                          دفعات قبضناها من الشريك:
                        </span>
                        <strong className="text-sm font-black text-[#F5C84C] font-mono block mt-0.5">
                          {settlementsPartnerPaid.toLocaleString()} MAD
                        </strong>
                      </div>
                    </div>

                    {/* Mutual Parcels List (Sent vs Received) */}
                    <div className="bg-[#120a00] rounded-2xl border border-[#D4AF37]/35 p-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-1.5 bg-black/50 p-1 rounded-xl border border-white/10">
                        <button
                          type="button"
                          onClick={() => setParcelFilterDirection('sent')}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition cursor-pointer ${
                            parcelFilterDirection === 'sent'
                              ? 'bg-[#F5C84C] text-[#1a0f00]'
                              : 'text-[#C8B08A] hover:text-white'
                          }`}
                        >
                          📦 مشات للشريك ({sentParcels.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setParcelFilterDirection('received')}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-black transition cursor-pointer ${
                            parcelFilterDirection === 'received'
                              ? 'bg-[#F5C84C] text-[#1a0f00]'
                              : 'text-[#C8B08A] hover:text-white'
                          }`}
                        >
                          📥 جات من الشريك ({receivedParcels.length})
                        </button>
                      </div>

                      {parcelFilterDirection === 'received' &&
                        receivedParcels.some((p) => p.partner_acceptance_status === 'pending_approval') && (
                          <div className="bg-amber-950/80 border border-[#F5C84C] rounded-xl p-2.5 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-black text-[#F5C84C]">
                              ⏳ كوليات واردة من هذا الشريك بانتظار قبولك ({receivedParcels.filter((p) => p.partner_acceptance_status === 'pending_approval').length})
                            </span>
                            <button
                              type="button"
                              onClick={() => acceptAllPendingPartnerParcels()}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] shrink-0 cursor-pointer"
                            >
                              ⚡ قبول الكل
                            </button>
                          </div>
                        )}

                      {(parcelFilterDirection === 'sent' ? sentParcels : receivedParcels).length ===
                      0 ? (
                        <div className="p-4 text-center text-[#C8B08A] text-[11px]">
                          لا توجد كوليات مسجلة في هذا الاتجاه بعد.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(parcelFilterDirection === 'sent' ? sentParcels : receivedParcels).map(
                            (p) => {
                              const isPendingApproval = p.partner_acceptance_status === 'pending_approval';
                              const isRejected = p.partner_acceptance_status === 'rejected';
                              return (
                                <div
                                  key={p.id}
                                  className={`bg-black/50 p-2.5 rounded-xl border space-y-2 ${
                                    isPendingApproval
                                      ? 'border-[#F5C84C]'
                                      : isRejected
                                      ? 'border-rose-500/50 opacity-75'
                                      : 'border-[#D4AF37]/25'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-mono text-[#F5C84C] font-black text-xs">
                                          [{p.tracking_code}]
                                        </span>
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[#F5D799] font-bold">
                                          {p.status === 'delivered'
                                            ? '✓ تم التسليم للزبون'
                                            : p.status === 'arrived'
                                            ? '📦 وصلت للمحطة'
                                            : p.status === 'in_transit'
                                            ? '🚚 في الطريق'
                                            : 'مسجلة'}
                                        </span>
                                        {isPendingApproval && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-[#F5C84C] border border-[#F5C84C]/40 font-black">
                                            ⏳ بانتظار القبول
                                          </span>
                                        )}
                                        {p.partner_acceptance_status === 'accepted' && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black">
                                            ✓ مقبولة
                                          </span>
                                        )}
                                        {isRejected && (
                                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-black">
                                            ❌ مرفوضة
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-[#E6C37A] truncate mt-1">
                                        المرسل: {p.sender_name} ⬅ المستلم: {p.receiver_name} ({p.receiver_phone})
                                      </p>
                                      <p className="text-[10px] text-white/80 font-bold mt-0.5">
                                        من محطة: <span className="text-[#F5D799]">{p.origin_station_name || 'الانطلاق'}</span> ⬅ إلى محطة: <span className="text-emerald-300">{p.destination_station_name || 'الوجهة'}</span>
                                      </p>
                                    </div>
                                    <div className="text-left font-mono shrink-0">
                                      <span className="text-emerald-400 font-black text-xs block">
                                        {p.cod_amount || p.amount_due} {p.currency}
                                      </span>
                                      <span className="text-[9px] text-[#C8B08A] block">
                                        {new Date(p.created_at).toLocaleDateString('ar-MA')}
                                      </span>
                                    </div>
                                  </div>

                                  {/* If incoming parcel from partner is pending approval, show Accept / Reject */}
                                  {parcelFilterDirection === 'received' && isPendingApproval && (
                                    <div className="flex items-center gap-2 pt-1.5 border-t border-white/10">
                                      <button
                                        type="button"
                                        onClick={() => respondToPartnerParcel(p.id, 'accepted')}
                                        className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] transition cursor-pointer"
                                      >
                                        ✅ قبول الكولية في محطتنا
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => respondToPartnerParcel(p.id, 'rejected', 'رفض من غرفة الشراكة')}
                                        className="py-1.5 px-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-bold text-[11px] transition cursor-pointer"
                                      >
                                        ❌ رفض
                                      </button>
                                    </div>
                                  )}

                                  {/* Read-only notice for sender */}
                                  {parcelFilterDirection === 'sent' && (
                                    <div className="text-[9px] text-[#C8B08A] border-t border-white/10 pt-1">
                                      🔒 تأكيد الوصول والتسليم للزبون يتحكم فيه الشريك المستقبل وعامل محطته فقط.
                                    </div>
                                  )}
                                </div>
                              );
                            }
                          )}
                        </div>
                      )}
                    </div>

                    {/* Settlements Log */}
                    <div className="bg-[#120a00] rounded-2xl border border-[#D4AF37]/35 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-[#F5D799] flex items-center gap-1.5">
                          <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                          <span>دفعات التصفية المسجلة ({partnershipSettlements.length}):</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowSettlementModal(true)}
                          className="text-[10px] font-black text-[#F5C84C] underline"
                        >
                          + إضافة دفعة
                        </button>
                      </div>

                      {partnershipSettlements.length === 0 ? (
                        <p className="text-[11px] text-[#C8B08A] text-center py-2">
                          لم يتم تسجيل أي دفعة تصفية بعد.
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {partnershipSettlements.map((stl) => {
                            const isWePaid = stl.payer_workspace_id === myWsId;
                            return (
                              <div
                                key={stl.id}
                                className="bg-black/50 p-2.5 rounded-xl border border-[#D4AF37]/25 flex items-center justify-between gap-2 text-xs"
                              >
                                <div>
                                  <strong className="text-white font-bold block text-[11px]">
                                    {isWePaid ? 'سددناها للشريك' : 'قبضناها من الشريك'} (
                                    {stl.payment_method === 'cash_plus'
                                      ? 'كاش بلوس'
                                      : stl.payment_method === 'wafacash'
                                      ? 'وفاكاش'
                                      : stl.payment_method === 'bank_transfer'
                                      ? 'تحويل بنكي'
                                      : 'نقداً كاش'}
                                    )
                                  </strong>
                                  {stl.reference_number && (
                                    <span className="text-[9px] text-[#F5C84C] font-mono block">
                                      رقم الوصل: {stl.reference_number}
                                    </span>
                                  )}
                                </div>
                                <div className="text-left font-mono">
                                  <span
                                    className={`text-xs font-black block ${
                                      isWePaid ? 'text-emerald-400' : 'text-[#F5C84C]'
                                    }`}
                                  >
                                    {stl.amount.toLocaleString()} {stl.currency}
                                  </span>
                                  <span className="text-[9px] text-[#C8B08A] block">
                                    {new Date(stl.created_at).toLocaleDateString('ar-MA')}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* MODAL 1: RECORD SETTLEMENT PAYMENT */}
        {showSettlementModal && activePartnership && partnerInfo && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xs animate-fadeIn">
            <div className="bg-[#140b00] border-2 border-[#D4AF37] rounded-3xl p-4 w-full max-w-[380px] text-right space-y-3.5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/30 pb-2">
                <h3 className="font-black text-[#F5D799] text-xs flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>تسجيل دفعة تصفية مع {partnerInfo.workspaceName}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="btn-cancel p-1.5 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleRecordSettlementSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-[#E6C37A] font-bold block mb-1">
                    المبلغ المسدد:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      required
                      min={1}
                      placeholder="مثلاً: 2500"
                      value={settlementAmount || ''}
                      onChange={(e) => setSettlementAmount(Number(e.target.value))}
                      className="flex-1 bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-[#F5C84C]"
                    />
                    <select
                      value={settlementCurrency}
                      onChange={(e) => setSettlementCurrency(e.target.value as any)}
                      className="bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-2.5 py-2 text-xs text-[#F5D799] font-bold"
                    >
                      <option value="MAD">MAD</option>
                      <option value="MRU">MRU</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[#E6C37A] font-bold block mb-1">
                    طريقة الأداء:
                  </label>
                  <select
                    value={settlementMethod}
                    onChange={(e) => setSettlementMethod(e.target.value as any)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  >
                    <option value="cash_plus">كاش بلوس (Cash Plus)</option>
                    <option value="wafacash">وفاكاش (Wafacash)</option>
                    <option value="bank_transfer">تحويل بنكي (Bankily / Virement)</option>
                    <option value="cash">نقداً كاش (يداً بيد)</option>
                    <option value="other">طريقة أخرى</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-[#E6C37A] font-bold block mb-1">
                    رقم الوصل / الحوالة (اختياري):
                  </label>
                  <input
                    type="text"
                    placeholder="مثلاً: CP-884920"
                    value={settlementRef}
                    onChange={(e) => setSettlementRef(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-[#E6C37A] font-bold block mb-1">
                    ملاحظات (اختياري):
                  </label>
                  <input
                    type="text"
                    placeholder="ملاحظات التسوية..."
                    value={settlementNotes}
                    onChange={(e) => setSettlementNotes(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSettlementModal(false)}
                    className="btn-cancel px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingSettlement || settlementAmount <= 0}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-xs shadow-md disabled:opacity-50"
                  >
                    {isSubmittingSettlement ? 'جارِ الحفظ...' : 'حفظ دفعة التسوية'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: DISPATCH PARCEL TO PARTNER'S STATION */}
        {showDispatchModal && activePartnership && partnerInfo && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xs animate-fadeIn">
            <div className="bg-[#140b00] border-2 border-[#D4AF37] rounded-3xl p-4 w-full max-w-[380px] text-right space-y-3.5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#D4AF37]/30 pb-2">
                <h3 className="font-black text-[#F5D799] text-xs flex items-center gap-1.5">
                  <Send className="w-4 h-4 text-[#F5C84C]" />
                  <span>إرسال كولي إلى محطة {partnerInfo.workspaceName}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowDispatchModal(false)}
                  className="btn-cancel p-1.5 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleDispatchParcelSubmit} className="space-y-3 text-xs">
                <div>
                  <label className="text-[11px] text-[#E6C37A] font-bold block mb-1">
                    اختر الكولي المراد إرساله للشريك:
                  </label>
                  <select
                    required
                    value={dispatchParcelId}
                    onChange={(e) => setDispatchParcelId(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3 py-2.5 text-xs text-white font-mono"
                  >
                    <option value="">-- اختر كولي خاص بمحطتك --</option>
                    {parcels
                      .filter(
                        (p) =>
                          p.workspace_id === myWsId &&
                          !p.is_collaborator_data &&
                          !p.partner_workspace_id &&
                          p.status !== 'delivered'
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          [{p.tracking_code}] - {p.sender_name} ➔ {p.receiver_name} ({p.amount_due}{' '}
                          {p.currency})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] text-[#E6C37A] font-bold block mb-1">
                    اختر محطة الشريك الوجهة:
                  </label>
                  <select
                    required
                    value={dispatchStationId}
                    onChange={(e) => setDispatchStationId(e.target.value)}
                    className="w-full bg-[#120a00] border border-[#D4AF37]/45 rounded-xl px-3 py-2.5 text-xs text-white font-bold"
                  >
                    <option value="">-- اختر محطة الشريك --</option>
                    {partnerInfo.stations.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name} ({st.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDispatchModal(false)}
                    className="btn-cancel px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingDispatch || !dispatchParcelId || !dispatchStationId}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#F5B05B] to-[#D4882A] text-[#1a0f00] font-black text-xs shadow-md disabled:opacity-50"
                  >
                    {isSubmittingDispatch ? 'جارِ الإرسال...' : 'توجيه الكولي للشريك'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Bottom Close Button */}
        <div className="pt-3 border-t border-[#D4AF37]/30 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[10px] text-[#E6C37A] font-semibold">
            🔒 حسابات الشراكة والكوليات مضبوطة ومؤمنة
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel px-5 py-2 rounded-xl text-xs font-black"
          >
            إغلاق الغرفة
          </button>
        </div>
      </div>
    </div>
  );
};
