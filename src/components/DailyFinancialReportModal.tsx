import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { ShiftClosingRecord } from '../types/database';
import {
  X,
  Download,
  Calendar,
  Inbox,
  Store,
  FileText,
  Lock,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  UserCheck,
} from 'lucide-react';

interface DailyFinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'report' | 'closing';
}

export const DailyFinancialReportModal: React.FC<DailyFinancialReportModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'report',
}) => {
  const {
    transactions,
    stations,
    selectedStationId,
    stationBalances,
    exchangeRate,
    hideAmounts,
    currentUser,
    currentWorkspace,
    workspaceMembers,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'report' | 'closing'>(initialTab);
  const [selectedStation, setSelectedStation] = useState<string>(() =>
    selectedStationId && stations.some((s) => s.id === selectedStationId)
      ? selectedStationId
      : stations[0]?.id || 'all'
  );
  const [reportDate, setReportDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Shift Closing (Clôture de Caisse) states
  const [physicalMadInput, setPhysicalMadInput] = useState<string>('');
  const [physicalMruInput, setPhysicalMruInput] = useState<string>('');
  const [handedOverToName, setHandedOverToName] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [closingHistory, setClosingHistory] = useState<ShiftClosingRecord[]>([]);

  const storageKey = `alittihadia_shift_closings_${currentWorkspace?.id || 'default'}`;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      if (selectedStationId && stations.some((s) => s.id === selectedStationId)) {
        setSelectedStation(selectedStationId);
      }
      try {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          setClosingHistory(JSON.parse(saved));
        }
      } catch {}
    }
  }, [isOpen, initialTab, selectedStationId, stations, storageKey]);

  // System balance for selected station (or sum of all stations if 'all')
  const systemBalances = useMemo(() => {
    if (selectedStation !== 'all') {
      const stBals = stationBalances[selectedStation] || { MAD: 0, MRU: 0 };
      return {
        MAD: Math.round((stBals.MAD || 0) * 100) / 100,
        MRU: Math.round((stBals.MRU || 0) * 100) / 100,
      };
    }
    let totalMad = 0;
    let totalMru = 0;
    Object.values(stationBalances).forEach((b) => {
      totalMad += b.MAD || 0;
      totalMru += b.MRU || 0;
    });
    return {
      MAD: Math.round(totalMad * 100) / 100,
      MRU: Math.round(totalMru * 100) / 100,
    };
  }, [stationBalances, selectedStation]);

  // Pre-fill physical cash inputs when switching station
  useEffect(() => {
    setPhysicalMadInput(String(systemBalances.MAD));
    setPhysicalMruInput(String(systemBalances.MRU));
  }, [systemBalances.MAD, systemBalances.MRU, selectedStation]);

  // Filter transactions for report date & station (MUST run before any early return)
  const filteredTxs = useMemo(() => {
    return (transactions || []).filter((tx) => {
      if (!tx || tx.status !== 'confirmed' || tx.deleted_at) return false;
      if (selectedStation !== 'all' && tx.station_id !== selectedStation) return false;

      const txDate = (tx.created_at || '').split('T')[0];
      return txDate === reportDate;
    });
  }, [transactions, selectedStation, reportDate]);

  // Aggregate by currency (MAD & MRU)
  const summary = useMemo(() => {
    const res: Record<string, { in: number; out: number; net: number; count: number }> = {
      MAD: { in: 0, out: 0, net: 0, count: 0 },
      MRU: { in: 0, out: 0, net: 0, count: 0 },
    };

    filteredTxs.forEach((tx) => {
      const curr = tx.currency || 'MAD';
      if (!res[curr]) {
        res[curr] = { in: 0, out: 0, net: 0, count: 0 };
      }

      const amt = Number(tx.amount) || 0;
      res[curr].count++;

      const isInflow =
        tx.type === 'cash_in' ||
        tx.type === 'parcel_shipping_fee' ||
        tx.type === 'parcel_cod_collection';
      const isOutflow =
        tx.type === 'cash_out' ||
        tx.type === 'goods_payment' ||
        tx.type === 'parcel_cod_payout';

      if (isInflow) {
        res[curr].in += amt;
      } else if (isOutflow) {
        res[curr].out += amt;
      }
    });

    Object.keys(res).forEach((c) => {
      res[c].net = Math.round((res[c].in - res[c].out) * 100) / 100;
      res[c].in = Math.round(res[c].in * 100) / 100;
      res[c].out = Math.round(res[c].out * 100) / 100;
    });

    return res;
  }, [filteredTxs]);

  if (!isOpen) return null;

  const handleExportCSV = () => {
    const headers = [
      'المعرف',
      'التاريخ',
      'المحطة',
      'النوع',
      'المبلغ',
      'العملة',
      'الهاتف',
      'السبب',
      'ملاحظات',
    ];
    const rows = filteredTxs.map((t) => [
      t.id,
      new Date(t.created_at).toLocaleString('ar-MA'),
      t.station_name || t.station_id,
      t.type,
      t.amount,
      t.currency,
      t.phone_number || '',
      `"${(t.reason || '').replace(/"/g, '""')}"`,
      `"${(t.note || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `تقرير_مالي_محطة_الاتحادية_${reportDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentStationObj = stations.find((s) => s.id === selectedStation);
  const stationTitle = currentStationObj ? currentStationObj.name : 'كافة المحطات';

  const physicalMad = parseFloat(physicalMadInput) || 0;
  const physicalMru = parseFloat(physicalMruInput) || 0;
  const diffMad = Math.round((physicalMad - systemBalances.MAD) * 100) / 100;
  const diffMru = Math.round((physicalMru - systemBalances.MRU) * 100) / 100;

  // Find Manager WhatsApp number for sending shift closing report
  const ownerMember = workspaceMembers.find((m) => m.role === 'owner' || m.role === 'admin');
  const managerPhone =
    ownerMember?.profile?.whatsapp_number ||
    ownerMember?.profile?.phone ||
    currentUser?.whatsapp_number ||
    currentUser?.phone ||
    '';

  const buildClosingWhatsAppMessage = (record?: ShiftClosingRecord) => {
    const recStation = record ? record.station_name : stationTitle;
    const recWorker = record ? record.closed_by_name : currentUser?.name || 'موظف المحطة';
    const recReceiver = record ? record.handed_over_to_name : handedOverToName.trim();
    const sMad = record ? (record.system_balance_mad ?? 0) : systemBalances.MAD;
    const pMad = record ? (record.physical_cash_mad ?? 0) : physicalMad;
    const dMad = record ? (record.difference_mad ?? 0) : diffMad;
    const sMru = record ? (record.system_balance_mru ?? 0) : systemBalances.MRU;
    const pMru = record ? (record.physical_cash_mru ?? 0) : physicalMru;
    const dMru = record ? (record.difference_mru ?? 0) : diffMru;
    const recNotes = record ? record.notes : closingNotes.trim();

    const madStatus = dMad === 0 ? 'مطابق ✅' : dMad > 0 ? `فائض (+${dMad})` : `عجز (${dMad}) ⚠️`;
    const mruStatus = dMru === 0 ? 'مطابق ✅' : dMru > 0 ? `فائض (+${dMru})` : `عجز (${dMru}) ⚠️`;

    return (
      `📋 *محضر إقفال الصندوق اليومي (Clôture de Caisse)*\n` +
      `🏢 المحطة: ${recStation}\n` +
      `📅 التاريخ: ${reportDate}\n` +
      `👤 المسلِّم: ${recWorker}` +
      (recReceiver ? `\n🤝 المستلِم للنوبة: ${recReceiver}` : '') +
      `\n------------------\n` +
      `🇲🇦 *صندوق الدرهم (MAD):*\n` +
      `• رصيد النظام: ${sMad} MAD\n` +
      `• المعدود فعلياً: ${pMad} MAD\n` +
      `• المطابقة: ${madStatus}\n` +
      `------------------\n` +
      `🇲🇷 *صندوق الأوقية (MRU):*\n` +
      `• رصيد النظام: ${sMru} MRU\n` +
      `• المعدود فعلياً: ${pMru} MRU\n` +
      `• المطابقة: ${mruStatus}` +
      (recNotes ? `\n------------------\n📝 ملاحظات: ${recNotes}` : '')
    );
  };

  const handleSaveShiftClosing = (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord: ShiftClosingRecord = {
      id: `close-${Date.now()}`,
      workspace_id: currentWorkspace?.id || 'ws-default',
      station_id: selectedStation,
      station_name: stationTitle,
      closed_by_user_id: currentUser?.id || 'u-unknown',
      closed_by_name: currentUser?.name || 'موظف المحطة',
      handed_over_to_name: handedOverToName.trim() || undefined,
      system_balance_mad: systemBalances.MAD,
      physical_cash_mad: physicalMad,
      difference_mad: diffMad,
      system_balance_mru: systemBalances.MRU,
      physical_cash_mru: physicalMru,
      difference_mru: diffMru,
      notes: closingNotes.trim() || undefined,
      created_at: new Date().toISOString(),
    };

    const updated = [newRecord, ...closingHistory].slice(0, 50);
    setClosingHistory(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch {}

    showToast('تم اعتماد وحفظ محضر إقفال الصندوق اليومي بنجاح', 'success');
    setClosingNotes('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[rgba(0,0,0,0.55)] backdrop-blur-sm overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[24px] p-4 sm:p-5 shadow-2xl text-right overflow-hidden relative my-4 max-h-[92vh] flex flex-col"
        style={{
          background: 'rgba(0, 0, 0, 0.55)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.85)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed Top Header with Arabic Title & Always-Visible Close Button (X) */}
        <div className="print:hidden flex items-center justify-between border-b border-white/15 pb-3 shrink-0 gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#F5C84C]/20 text-[#F5C84C] border border-[#F5C84C]/40 flex items-center justify-center shrink-0">
              {activeTab === 'closing' ? <Lock className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-white">
                {activeTab === 'closing'
                  ? 'إقفال الصندوق اليومي وتسليم النوبة'
                  : 'تقرير الإغلاق المالي اليومي'}
              </h3>
              <p className="text-[11px] text-white/80">
                {stationTitle} • بالدرهم (MAD) والأوقية (MRU)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeTab === 'report' && (
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 cursor-pointer"
                title="تصدير إلى Excel / CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="btn-cancel p-2 rounded-xl transition shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs: Daily Report vs Shift Closing (Clôture de Caisse) */}
        <div className="print:hidden grid grid-cols-2 gap-1.5 bg-black/55 p-1 rounded-2xl border border-white/15 mt-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('report')}
            className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              activeTab === 'report'
                ? 'bg-[#F5C84C] text-[#111111]'
                : 'btn-cancel bg-transparent border-0 text-white/75'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>ملخص عمليات اليوم</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('closing')}
            className={`py-2 px-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition ${
              activeTab === 'closing'
                ? 'bg-[#F5C84C] text-[#111111]'
                : 'btn-cancel bg-transparent border-0 text-white/75'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>إقفال الصندوق (Clôture)</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-3.5 py-3.5 pr-0.5 pl-0.5 text-xs min-h-0">
          {/* Date & Station Filters */}
          <div className="print:hidden grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-black/45 p-3 rounded-2xl border border-white/15">
            <div>
              <label className="text-[11px] font-bold text-white/80 block mb-1">
                تاريخ التقرير / الإقفال:
              </label>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                dir="ltr"
                style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'right' }}
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F5C84C] font-mono text-xs"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-white/80 block mb-1">
                المحطة المحددة:
              </label>
              <select
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-[#F5C84C] font-bold text-xs"
              >
                <option value="all">جميع المحطات مجتمعة</option>
                {stations.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} ({st.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {activeTab === 'report' ? (
            <>
              {/* Summary Header Info */}
              <div className="bg-black/45 p-3 rounded-2xl border border-white/15 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-white font-bold">
                  <Store className="w-4 h-4 text-[#F5C84C] shrink-0" />
                  <span>المحطة: {stationTitle}</span>
                </div>
                <div className="flex items-center gap-2 text-white/85 font-bold">
                  <span>التاريخ:</span>
                  <span
                    className="font-mono text-[#F5C84C]"
                    dir="ltr"
                    style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                  >
                    {reportDate}
                  </span>
                  <span>•</span>
                  <span>العمليات: {filteredTxs.length}</span>
                </div>
              </div>

              {/* Dual Currency Balance Summary Boxes (MAD & MRU) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* MAD Summary */}
                <div className="bg-black/45 p-3.5 rounded-2xl border border-white/15 space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-white/15">
                    <span className="font-black text-xs text-[#F5C84C]">
                      صندوق الدرهم المغربي (MAD)
                    </span>
                    <span className="text-[10px] font-bold text-white/75">
                      {summary.MAD.count} عملية
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-white/80">إجمالي المقبوضات:</span>
                      <span
                        className="font-bold font-mono text-emerald-400"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        <span className="print:hidden">
                          +{hideAmounts ? '••••' : summary.MAD.in} MAD
                        </span>
                        <span className="hidden print:inline">+{summary.MAD.in} MAD</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/80">إجمالي المصروفات:</span>
                      <span
                        className="font-bold font-mono text-rose-400"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        <span className="print:hidden">
                          −{hideAmounts ? '••••' : summary.MAD.out} MAD
                        </span>
                        <span className="hidden print:inline">−{summary.MAD.out} MAD</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/15 font-black text-xs">
                      <span className="text-white">الصافي اليومي:</span>
                      <span
                        className={`font-mono ${
                          summary.MAD.net >= 0 ? 'text-[#F5C84C]' : 'text-rose-400'
                        }`}
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        <span className="print:hidden">
                          {summary.MAD.net >= 0 ? '+' : '−'}
                          {hideAmounts ? '••••' : Math.abs(summary.MAD.net)} MAD
                        </span>
                        <span className="hidden print:inline">{summary.MAD.net} MAD</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* MRU Summary */}
                <div className="bg-black/45 p-3.5 rounded-2xl border border-white/15 space-y-2">
                  <div className="flex justify-between items-center pb-2 border-b border-white/15">
                    <span className="font-black text-xs text-[#F5C84C]">
                      صندوق الأوقية الموريتانية (MRU)
                    </span>
                    <span className="text-[10px] font-bold text-white/75">
                      {summary.MRU.count} عملية
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-white/80">إجمالي المقبوضات:</span>
                      <span
                        className="font-bold font-mono text-emerald-400"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        <span className="print:hidden">
                          +{hideAmounts ? '••••' : summary.MRU.in} MRU
                        </span>
                        <span className="hidden print:inline">+{summary.MRU.in} MRU</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white/80">إجمالي المصروفات:</span>
                      <span
                        className="font-bold font-mono text-rose-400"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        <span className="print:hidden">
                          −{hideAmounts ? '••••' : summary.MRU.out} MRU
                        </span>
                        <span className="hidden print:inline">−{summary.MRU.out} MRU</span>
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-white/15 font-black text-xs">
                      <span className="text-white">الصافي اليومي:</span>
                      <span
                        className={`font-mono ${
                          summary.MRU.net >= 0 ? 'text-[#F5C84C]' : 'text-rose-400'
                        }`}
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        <span className="print:hidden">
                          {summary.MRU.net >= 0 ? '+' : '−'}
                          {hideAmounts ? '••••' : Math.abs(summary.MRU.net)} MRU
                        </span>
                        <span className="hidden print:inline">{summary.MRU.net} MRU</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Exchange rate note */}
              <div className="bg-black/45 px-3 py-2 rounded-xl border border-white/15 text-[11px] text-white/85 flex items-center justify-between">
                <span>سعر الصرف المعتمد:</span>
                <span
                  className="font-mono font-bold text-[#F5C84C]"
                  dir="ltr"
                  style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                >
                  1 MAD ≈ {exchangeRate} MRU
                </span>
              </div>

              {/* Operations List or Empty State */}
              <div className="bg-black/45 p-3.5 rounded-2xl border border-white/15 space-y-2.5">
                <h4 className="font-black text-xs text-[#F5C84C] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>تفاصيل عمليات اليوم ({filteredTxs.length})</span>
                </h4>

                {filteredTxs.length === 0 ? (
                  <div className="py-8 px-4 text-center space-y-2.5 bg-black/40 rounded-xl border border-white/10">
                    <div className="w-11 h-11 rounded-2xl bg-[#F5C84C]/15 border border-[#F5C84C]/35 text-[#F5C84C] flex items-center justify-center mx-auto">
                      <Inbox className="w-5 h-5" />
                    </div>
                    <p className="text-sm font-black text-white">لا توجد عمليات اليوم</p>
                    <p className="text-[11px] text-white/70">
                      لم يتم تسجيل أي حركات مالية في هذا التاريخ للمحطة المحددة.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTxs.map((t) => {
                      const isInflow =
                        t.type === 'cash_in' ||
                        t.type === 'parcel_shipping_fee' ||
                        t.type === 'parcel_cod_collection';
                      return (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-xl bg-black/45 border border-white/15 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span
                                className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  isInflow
                                    ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                {isInflow ? 'قبض' : 'صرف'}
                              </span>
                              <span className="text-xs font-bold text-white line-clamp-2 break-words">
                                {t.reason || t.note || 'عملية صندوق'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-white/70">
                              <span>{t.station_name || 'المحطة'}</span>
                              <span>•</span>
                              <span>{t.creator_name || 'موظف'}</span>
                            </div>
                          </div>

                          <div className="text-left shrink-0">
                            <span
                              className={`font-mono font-black text-xs block ${
                                isInflow ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                              dir="ltr"
                              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                            >
                              <span className="print:hidden">
                                {isInflow ? '+' : '−'}
                                {hideAmounts ? '••••' : t.amount} {t.currency}
                              </span>
                              <span className="hidden print:inline">
                                {isInflow ? `+${t.amount}` : `−${t.amount}`} {t.currency}
                              </span>
                            </span>
                            <span
                              className="font-mono text-[10px] text-white/65 block mt-0.5"
                              dir="ltr"
                              style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                            >
                              {new Date(t.created_at).toLocaleTimeString('ar-MA', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ===================================================================== */
            /* TAB 2: CLÔTURE DE CAISSE (إقفال الصندوق اليومي وتسليم النوبة بين العمال) */
            /* ===================================================================== */
            <div className="space-y-3.5">
              <form
                onSubmit={handleSaveShiftClosing}
                className="bg-black/45 p-3.5 rounded-2xl border border-[#F5C84C]/35 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-white/15 pb-2">
                  <span className="font-black text-[#F5C84C] text-xs flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>جرد ومطابقة النقد الفعلي في الدرج ({stationTitle})</span>
                  </span>
                  <span className="text-[10px] text-white/75 font-bold">
                    الموظف: {currentUser?.name || 'عامل المحطة'}
                  </span>
                </div>

                {/* MAD Reconciliation Card */}
                <div className="p-3 rounded-xl bg-black/55 border border-white/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white text-xs">🇲🇦 صندوق الدرهم المغربي (MAD)</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                        diffMad === 0
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                          : diffMad < 0
                          ? 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                          : 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {diffMad === 0
                        ? '✓ مطابق تماماً'
                        : diffMad < 0
                        ? `⚠ عجز: ${diffMad} MAD`
                        : `+ فائض: +${diffMad} MAD`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                      <span className="block text-[10px] text-white/70">رصيد النظام المحسوب:</span>
                      <span
                        className="font-mono font-black text-sm text-[#F5C84C]"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        {hideAmounts ? '••••' : systemBalances.MAD} MAD
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] text-white/80 font-bold mb-1">
                        المبلغ الفعلي في الدرج (MAD):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={physicalMadInput}
                        onChange={(e) => setPhysicalMadInput(e.target.value)}
                        className="w-full bg-black/70 border border-white/25 focus:border-[#F5C84C] rounded-xl px-2.5 py-1.5 text-white font-mono font-black text-xs"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                {/* MRU Reconciliation Card */}
                <div className="p-3 rounded-xl bg-black/55 border border-white/15 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-black text-white text-xs">🇲🇷 صندوق الأوقية الموريتانية (MRU)</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-black border ${
                        diffMru === 0
                          ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
                          : diffMru < 0
                          ? 'bg-rose-950/70 text-rose-300 border-rose-500/40'
                          : 'bg-amber-950/70 text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {diffMru === 0
                        ? '✓ مطابق تماماً'
                        : diffMru < 0
                        ? `⚠ عجز: ${diffMru} MRU`
                        : `+ فائض: +${diffMru} MRU`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 items-center">
                    <div className="bg-black/50 p-2 rounded-xl border border-white/10">
                      <span className="block text-[10px] text-white/70">رصيد النظام المحسوب:</span>
                      <span
                        className="font-mono font-black text-sm text-[#2ECC71]"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate' }}
                      >
                        {hideAmounts ? '••••' : systemBalances.MRU} MRU
                      </span>
                    </div>

                    <div>
                      <label className="block text-[10px] text-white/80 font-bold mb-1">
                        المبلغ الفعلي في الدرج (MRU):
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={physicalMruInput}
                        onChange={(e) => setPhysicalMruInput(e.target.value)}
                        className="w-full bg-black/70 border border-white/25 focus:border-[#F5C84C] rounded-xl px-2.5 py-1.5 text-white font-mono font-black text-xs"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>

                {/* Handover Worker & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] text-white/80 font-bold mb-1">
                      تسليم الصندوق للعامل القادم (اختياري):
                    </label>
                    <input
                      type="text"
                      list="workspace-workers-list"
                      placeholder="اسم الموظف المستلم للنوبة..."
                      value={handedOverToName}
                      onChange={(e) => setHandedOverToName(e.target.value)}
                      className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white text-xs"
                    />
                    <datalist id="workspace-workers-list">
                      {workspaceMembers.map((m) => (
                        <option key={m.user_id} value={m.profile?.name || ''} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-[10px] text-white/80 font-bold mb-1">
                      ملاحظات الإقفال / تبرير الفرق:
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: تم تسليم الصندوق بالكامل..."
                      value={closingNotes}
                      onChange={(e) => setClosingNotes(e.target.value)}
                      className="w-full bg-black/60 border border-white/20 rounded-xl px-3 py-2 text-white text-xs"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 shadow-md"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>اعتماد وحفظ محضر إقفال الصندوق</span>
                  </button>

                  <a
                    href={`https://wa.me/${managerPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                      buildClosingWhatsAppMessage()
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 py-2.5 px-4 rounded-xl bg-[#006233] hover:bg-[#004d28] text-white font-black text-xs flex items-center justify-center gap-1.5 border border-[#2ECC71]/40 transition"
                  >
                    <MessageCircle className="w-4 h-4 text-[#2ECC71]" />
                    <span>إرسال محضر الإقفال للمدير (واتساب)</span>
                  </a>
                </div>
              </form>

              {/* Previous Shift Closings Log */}
              <div className="bg-black/45 p-3.5 rounded-2xl border border-white/15 space-y-2.5">
                <h4 className="font-black text-xs text-[#F5C84C] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" />
                  <span>سجل إقفالات الصندوق وتسليم النوبات ({closingHistory.length})</span>
                </h4>

                {closingHistory.length === 0 ? (
                  <p className="text-[11px] text-white/65 text-center py-4">
                    لم يتم تسجيل أي محضر إقفال صندوق بعد.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {closingHistory.slice(0, 10).map((rec) => (
                      <div
                        key={rec.id}
                        className="p-2.5 rounded-xl bg-black/55 border border-white/15 space-y-1.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-black text-white">
                            {rec.station_name} • المسلِّم: {rec.closed_by_name}
                            {rec.handed_over_to_name ? ` ⬅ ${rec.handed_over_to_name}` : ''}
                          </span>
                          <span className="font-mono text-[10px] text-white/65" dir="ltr">
                            {new Date(rec.created_at).toLocaleString('ar-MA', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                          <div className="bg-black/40 p-1.5 rounded-lg border border-white/10">
                            <span className="text-white/70 block">درهم (MAD):</span>
                            <span className="text-[#F5C84C] font-bold">
                              الفعلي: {rec.physical_cash_mad} | الفرق: {rec.difference_mad}
                            </span>
                          </div>
                          <div className="bg-black/40 p-1.5 rounded-lg border border-white/10">
                            <span className="text-white/70 block">أوقية (MRU):</span>
                            <span className="text-[#2ECC71] font-bold">
                              الفعلي: {rec.physical_cash_mru} | الفرق: {rec.difference_mru}
                            </span>
                          </div>
                        </div>

                        {rec.notes && (
                          <p className="text-[10px] text-white/80 italic">ملاحظة: {rec.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Fixed Bottom Modal Actions */}
        <div className="print:hidden border-t border-white/15 pt-3 flex items-center justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel w-full sm:w-auto px-6 py-2.5 rounded-xl font-black text-xs transition active:scale-95 cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
