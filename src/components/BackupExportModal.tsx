import React, { useRef, useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Database,
  Upload,
  CheckCircle2,
  Printer,
  Calendar,
} from 'lucide-react';

interface BackupExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ARABIC_MONTHS: Record<string, string> = {
  '01': 'يناير',
  '02': 'فبراير',
  '03': 'مارس',
  '04': 'أبريل',
  '05': 'ماي',
  '06': 'يونيو',
  '07': 'يوليوز',
  '08': 'غشت',
  '09': 'شتنبر',
  '10': 'أكتوبر',
  '11': 'نونبر',
  '12': 'دجنبر',
};

export const BackupExportModal: React.FC<BackupExportModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentWorkspace,
    stations,
    parcels,
    trips,
    transactions,
    stationBalances,
    showToast,
  } = useApp();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentYearMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const prevYearMonth = useMemo(() => {
    const now = new Date();
    now.setMonth(now.getMonth() - 1);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentYearMonth);

  const formatMonthLabel = (ym: string) => {
    if (ym === 'all') return 'جميع الأشهر (كامل السجل)';
    const [y, m] = ym.split('-');
    return `${ARABIC_MONTHS[m] || m} ${y}`;
  };

  // Filter records by selectedMonth ('YYYY-MM' or 'all')
  const filteredData = useMemo(() => {
    const matchMonth = (isoStr?: string) => {
      if (!isoStr) return false;
      if (selectedMonth === 'all') return true;
      return isoStr.startsWith(selectedMonth);
    };

    const mParcels = parcels.filter(p => matchMonth(p.created_at));
    const mTransactions = transactions.filter(t => matchMonth(t.created_at));
    const mTrips = trips.filter(tr => matchMonth(tr.created_at));

    let totalDueMAD = 0;
    let totalPaidMAD = 0;
    let totalDueMRU = 0;
    let totalPaidMRU = 0;

    mParcels.forEach(p => {
      if (p.status === 'cancelled') return;
      if (p.currency === 'MRU') {
        totalDueMRU += p.amount_due || 0;
        totalPaidMRU += p.amount_paid || 0;
      } else {
        totalDueMAD += p.amount_due || 0;
        totalPaidMAD += p.amount_paid || 0;
      }
    });

    return {
      parcels: mParcels,
      transactions: mTransactions,
      trips: mTrips,
      totalDueMAD,
      totalPaidMAD,
      remMAD: Math.max(0, totalDueMAD - totalPaidMAD),
      totalDueMRU,
      totalPaidMRU,
      remMRU: Math.max(0, totalDueMRU - totalPaidMRU),
    };
  }, [parcels, transactions, trips, selectedMonth]);

  if (!isOpen) return null;

  const wsName =
    currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'Sahara Express';
  const todayStr = new Date().toISOString().slice(0, 10);
  const periodSlug = selectedMonth === 'all' ? `All_${todayStr}` : selectedMonth;

  // Helper to download UTF-8 BOM CSV for Excel
  const downloadExcelCSV = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const escapeCell = (val: string | number) => {
      const str = String(val ?? '').replace(/"/g, '""');
      return `"${str}"`;
    };
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCell).join(','), ...rows.map(r => r.map(escapeCell).join(','))].join(
        '\r\n'
      );

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ONE-CLICK MONTHLY COMPREHENSIVE EXCEL/CSV BACKUP
  const handleOneClickMonthlyExcelBackup = () => {
    const label = formatMonthLabel(selectedMonth);
    const headers = [
      'القسم',
      'المرجع / الرقم',
      'التاريخ',
      'من محطة',
      'إلى محطة',
      'الطرف الأول (المرسل / المسؤول)',
      'هاتف 1',
      'الطرف الثاني (المستلم / الزبون)',
      'هاتف 2',
      'البيان / وصف البضاعة',
      'الإجمالي / المبلغ',
      'المدفوع',
      'المتبقي (الكريدي)',
      'العملة',
      'الحالة',
    ];

    const rows: (string | number)[][] = [];

    // 1. Summary Header Rows
    rows.push([
      'ملخص الشهر',
      wsName,
      label,
      `الكوليات: ${filteredData.parcels.length}`,
      `الرحلات: ${filteredData.trips.length}`,
      `سندات الصندوق: ${filteredData.transactions.length}`,
      '',
      '',
      '',
      'إجمالي مداخيل الدرهم (MAD)',
      filteredData.totalDueMAD,
      filteredData.totalPaidMAD,
      filteredData.remMAD,
      'MAD',
      'مكتمل',
    ]);

    if (filteredData.totalDueMRU > 0 || filteredData.totalPaidMRU > 0) {
      rows.push([
        'ملخص الشهر',
        wsName,
        label,
        '',
        '',
        '',
        '',
        '',
        '',
        'إجمالي مداخيل الأوقية (MRU)',
        filteredData.totalDueMRU,
        filteredData.totalPaidMRU,
        filteredData.remMRU,
        'MRU',
        'مكتمل',
      ]);
    }

    // 2. Parcels Rows
    filteredData.parcels.forEach(p => {
      const rem = Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0));
      rows.push([
        'كولي / إرسالية',
        `#${p.parcel_number} (${p.tracking_code})`,
        new Date(p.created_at).toLocaleString('ar-MA'),
        p.origin_station_name || '',
        p.destination_station_name || '',
        p.sender_name || '',
        p.sender_phone || '',
        p.receiver_name || '',
        p.receiver_phone || '',
        `${p.description || ''} (${p.items_count || 1} طرد)`,
        p.amount_due || 0,
        p.amount_paid || 0,
        rem,
        p.currency || 'MAD',
        p.status,
      ]);
    });

    // 3. Cashbox Transactions Rows
    filteredData.transactions.forEach(t => {
      const stName = t.station_name || stations.find(s => s.id === t.station_id)?.name || '';
      rows.push([
        'عملية صندوق',
        t.id.slice(0, 8),
        new Date(t.created_at).toLocaleString('ar-MA'),
        stName,
        '',
        t.creator_name || '',
        '',
        t.person_name || '',
        t.person_phone || '',
        `${t.type} — ${t.reason || t.note || ''}`,
        t.amount || 0,
        t.amount || 0,
        0,
        t.currency || 'MAD',
        t.status || 'approved',
      ]);
    });

    // 4. Trips Rows
    filteredData.trips.forEach(tr => {
      const totalExp =
        (tr.fuel_expense || 0) +
        (tr.toll_expense || 0) +
        (tr.driver_commission || 0) +
        (tr.other_expense || 0);
      rows.push([
        'رحلة شاحنة',
        tr.trip_code,
        new Date(tr.created_at).toLocaleString('ar-MA'),
        tr.origin_station_name || '',
        tr.destination_station_name || '',
        tr.driver_name || '',
        tr.driver_phone || '',
        tr.vehicle_plate || '',
        '',
        `حمولة ${tr.loaded_parcel_ids.length} كولي — مصاريف الطريق والوقود`,
        totalExp,
        totalExp,
        0,
        'MAD',
        tr.status,
      ]);
    });

    downloadExcelCSV(`SaharaExpress_Monthly_Backup_${periodSlug}.csv`, headers, rows);
    showToast(
      `✅ تم تحميل النسخة الاحتياطية الشهرية لـ Excel (${label}) بنجاح!`,
      'success'
    );
  };

  const handleExportParcelsExcel = () => {
    const headers = [
      'رقم الكولي',
      'كود التتبع',
      'التاريخ',
      'محطة الانطلاق',
      'محطة الوصول',
      'المرسل',
      'هاتف المرسل',
      'المستلم',
      'هاتف المستلم',
      'وصف البضاعة',
      'عدد الطرود',
      'الوزن (kg)',
      'الإجمالي',
      'المدفوع',
      'المتبقي',
      'العملة',
      'الحالة',
    ];

    const rows = filteredData.parcels.map(p => [
      p.parcel_number,
      p.tracking_code,
      new Date(p.created_at).toLocaleDateString('ar-MA'),
      p.origin_station_name || '',
      p.destination_station_name || '',
      p.sender_name,
      p.sender_phone,
      p.receiver_name,
      p.receiver_phone,
      p.description,
      p.items_count || 1,
      p.weight_kg || '',
      p.amount_due || 0,
      p.amount_paid || 0,
      Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0)),
      p.currency,
      p.status,
    ]);

    downloadExcelCSV(`Parcels_${periodSlug}.csv`, headers, rows);
    showToast(`تم تصدير ${filteredData.parcels.length} كولي إلى ملف Excel بنجاح`, 'success');
  };

  const handleExportCashboxExcel = () => {
    const headers = [
      'التاريخ',
      'المحطة',
      'نوع العملية',
      'المبلغ',
      'العملة',
      'المستفيد / الزبون',
      'الهاتف',
      'البيان / السبب',
      'الحالة',
      'المسؤول',
    ];

    const rows = filteredData.transactions.map(t => [
      new Date(t.created_at).toLocaleString('ar-MA'),
      t.station_name || stations.find(s => s.id === t.station_id)?.name || '',
      t.type,
      t.amount,
      t.currency,
      t.person_name || '',
      t.person_phone || '',
      t.reason || t.note || '',
      t.status,
      t.creator_name || '',
    ]);

    downloadExcelCSV(`Cashbox_Transactions_${periodSlug}.csv`, headers, rows);
    showToast(
      `تم تصدير ${filteredData.transactions.length} عملية صندوق إلى ملف Excel بنجاح`,
      'success'
    );
  };

  const handleExportTripsExcel = () => {
    const headers = [
      'كود الرحلة',
      'التاريخ',
      'من محطة',
      'إلى محطة',
      'السائق',
      'رقم العربة (Matricule)',
      'عدد الكوليات',
      'مصاريف الوقود',
      'مصاريف الطريق',
      'عمولة السائق',
      'مصاريف أخرى',
      'الحالة',
    ];

    const rows = filteredData.trips.map(tr => [
      tr.trip_code,
      new Date(tr.created_at).toLocaleDateString('ar-MA'),
      tr.origin_station_name || '',
      tr.destination_station_name || '',
      tr.driver_name,
      tr.vehicle_plate,
      tr.loaded_parcel_ids.length,
      tr.fuel_expense || 0,
      tr.toll_expense || 0,
      tr.driver_commission || 0,
      tr.other_expense || 0,
      tr.status,
    ]);

    downloadExcelCSV(`Trips_Manifests_${periodSlug}.csv`, headers, rows);
    showToast(`تم تصدير ${filteredData.trips.length} رحلة إلى ملف Excel بنجاح`, 'success');
  };

  const handlePrintComprehensivePDF = () => {
    const stationRows = stations
      .map(st => {
        const bals = stationBalances[st.id] || {};
        const mad = bals['MAD'] || 0;
        const mru = bals['MRU'] || 0;
        const stParcels = filteredData.parcels.filter(
          p =>
            (p.origin_station_id === st.id || p.destination_station_id === st.id) &&
            p.status !== 'cancelled'
        ).length;
        return `
          <tr>
            <td><strong>${st.name}</strong> (${st.city})</td>
            <td style="font-family:monospace;font-weight:900;">${mad.toLocaleString('en-US')} MAD</td>
            <td style="font-family:monospace;font-weight:900;">${mru.toLocaleString('en-US')} MRU</td>
            <td style="text-align:center;font-weight:800;">${stParcels} كولي</td>
          </tr>
        `;
      })
      .join('');

    const recentParcelsRows = filteredData.parcels
      .slice(0, 60)
      .map((p, idx) => {
        const rem = Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0));
        return `
          <tr>
            <td>${idx + 1}</td>
            <td style="font-family:monospace;font-weight:800;">#${p.parcel_number} (${p.tracking_code})</td>
            <td>${p.origin_station_name || ''} ➔ ${p.destination_station_name || ''}</td>
            <td>${p.sender_name}</td>
            <td>${p.receiver_name}</td>
            <td>${p.description}</td>
            <td style="font-family:monospace;font-weight:800;">${p.amount_due} ${p.currency}</td>
            <td style="font-family:monospace;color:${rem > 0 ? '#b91c1c' : '#15803d'};font-weight:900;">
              ${rem > 0 ? `متبقي ${rem}` : 'خالص'}
            </td>
          </tr>
        `;
      })
      .join('');

    const wsPhone = currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone || '';
    const logoSrc = currentWorkspace?.custom_brand_logo_url?.trim()
      ? currentWorkspace.custom_brand_logo_url.trim()
      : `${window.location.origin}/logo.png`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>التقرير المحاسبي الشهري - ${wsName} (${formatMonthLabel(selectedMonth)})</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Cairo', 'Tajawal', sans-serif; }
    body { margin: 0; padding: 12px; color: #000; background: #fff; font-size: 12px; }
    .hdr { border: 2px solid #000; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; gap: 12px; }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .brand-logo { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid #000; background: #fff; }
    h3 { margin: 14px 0 6px; font-size: 14px; border-right: 4px solid #000; padding-right: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1.5px solid #000; padding: 6px 8px; font-size: 11px; }
    th { background: #111; color: #fff; text-align: right; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;">
    <button onclick="window.print()" style="padding:10px 24px;background:#000;color:#F5C84C;border:none;border-radius:8px;font-weight:900;cursor:pointer;">🖨️ طباعة / حفظ التقرير الشامل كـ PDF</button>
  </div>
  <div class="hdr">
    <div class="brand-wrap">
      <img src="${logoSrc}" alt="${wsName}" class="brand-logo" onerror="this.style.display='none'" />
      <div>
        <h1 style="margin:0;font-size:18px;">${wsName} — التقرير المحاسبي (${formatMonthLabel(selectedMonth)})</h1>
        <p style="margin:4px 0 0;">تاريخ استخراج التقرير: ${new Date().toLocaleString('ar-MA')} ${wsPhone ? `| Tel: ${wsPhone}` : ''}</p>
      </div>
    </div>
    <div style="text-align:left;font-family:monospace;">
      <div>الكوليات: <strong>${filteredData.parcels.length}</strong> | الرحلات: <strong>${filteredData.trips.length}</strong></div>
      <div>المداخيل: <strong>${filteredData.totalDueMAD} MAD</strong> (المدفوع: ${filteredData.totalPaidMAD} MAD)</div>
    </div>
  </div>

  <h3>1. جرد أرصدة وسيولة المحطات</h3>
  <table>
    <thead>
      <tr>
        <th>المحطة</th>
        <th>رصيد الدرهم (MAD)</th>
        <th>رصيد الأوقية (MRU)</th>
        <th>الكوليات في الفترة</th>
      </tr>
    </thead>
    <tbody>${stationRows}</tbody>
  </table>

  <h3>2. سجل الكوليات والإرساليات (${filteredData.parcels.length})</h3>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>رقم الكولي</th>
        <th>المسار</th>
        <th>المرسل</th>
        <th>المستلم</th>
        <th>البضاعة</th>
        <th>الإجمالي</th>
        <th>الأداء</th>
      </tr>
    </thead>
    <tbody>${recentParcelsRows}</tbody>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 350); };</script>
</body>
</html>`;

    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  const handleDownloadJSONBackup = () => {
    const backupPayload: Record<string, any> = {
      exported_at: new Date().toISOString(),
      workspace_name: wsName,
      localStorage_snapshot: {},
    };

    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) {
        try {
          backupPayload.localStorage_snapshot[k] = JSON.parse(localStorage.getItem(k) || 'null');
        } catch {
          backupPayload.localStorage_snapshot[k] = localStorage.getItem(k);
        }
      }
    }

    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_SaharaExpress_${todayStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('تم تحميل النسخة الاحتياطية الشاملة للنظام بنجاح', 'success');
  };

  const handleRestoreJSONBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || '{}'));
        if (parsed && parsed.localStorage_snapshot) {
          Object.entries(parsed.localStorage_snapshot).forEach(([k, val]) => {
            localStorage.setItem(k, typeof val === 'string' ? val : JSON.stringify(val));
          });
          showToast('تم استرجاع النسخة الاحتياطية بنجاح! جاري تحديث البيانات...', 'success');
          setTimeout(() => window.location.reload(), 900);
        } else {
          showToast('ملف النسخة الاحتياطية غير صالح', 'error');
        }
      } catch {
        showToast('تعذر قراءة ملف النسخة الاحتياطية', 'error');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2.5 bg-black/85 backdrop-blur-sm overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] luxury-card rounded-[24px] p-4 sm:p-5 shadow-2xl text-right overflow-hidden relative my-4 space-y-3.5 max-h-[93vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                نسخة احتياطية Excel / CSV شهرية بنقرة واحدة
              </h3>
              <p className="text-[11px] text-white/75">
                جرد المحاسبة الشهري الشامل (كوليات + صناديق + رحلات) وحفظ نسخة احتياطية
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn-cancel p-2 rounded-xl transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Month Selector & 1-Click Monthly Excel Backup */}
        <div className="bg-gradient-to-br from-emerald-950/60 to-black/70 p-3.5 rounded-2xl border-2 border-emerald-500/50 space-y-3 shadow-lg">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-black text-xs text-emerald-300 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>اختر الشهر لاستخراج النسخة الاحتياطية (Excel):</span>
            </span>
            <input
              type="month"
              value={selectedMonth === 'all' ? currentYearMonth : selectedMonth}
              onChange={e => setSelectedMonth(e.target.value || currentYearMonth)}
              className="bg-black/60 border border-emerald-500/40 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-400"
            />
          </div>

          {/* Quick Month Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedMonth(currentYearMonth)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition ${
                selectedMonth === currentYearMonth
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-black/50 text-white/75 border border-white/15 hover:text-white'
              }`}
            >
              📅 هذا الشهر ({formatMonthLabel(currentYearMonth)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedMonth(prevYearMonth)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition ${
                selectedMonth === prevYearMonth
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-black/50 text-white/75 border border-white/15 hover:text-white'
              }`}
            >
              ⏮️ الشهر الماضي ({formatMonthLabel(prevYearMonth)})
            </button>
            <button
              type="button"
              onClick={() => setSelectedMonth('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition ${
                selectedMonth === 'all'
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-black/50 text-white/75 border border-white/15 hover:text-white'
              }`}
            >
              🗂️ جميع الأشهر
            </button>
          </div>

          {/* Live Summary Stats for Selected Month */}
          <div className="grid grid-cols-3 gap-2 bg-black/50 p-2.5 rounded-xl border border-white/10 text-center">
            <div>
              <span className="text-[10px] text-white/60 block">الكوليات</span>
              <span className="font-mono font-black text-sm text-white">
                {filteredData.parcels.length}
              </span>
            </div>
            <div className="border-x border-white/10">
              <span className="text-[10px] text-emerald-300 block">المداخيل (MAD)</span>
              <span className="font-mono font-black text-sm text-emerald-400">
                {filteredData.totalDueMAD.toLocaleString('en-US')}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-amber-300 block">الكريدي المتبقي</span>
              <span className="font-mono font-black text-sm text-amber-400">
                {filteredData.remMAD.toLocaleString('en-US')}
              </span>
            </div>
          </div>

          {/* Giant 1-Click Monthly Excel Download Button */}
          <button
            type="button"
            onClick={handleOneClickMonthlyExcelBackup}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 hover:from-emerald-400 hover:to-emerald-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition active:scale-[0.99]"
          >
            <FileSpreadsheet className="w-5 h-5 shrink-0" />
            <span>
              تحميل النسخة الاحتياطية الشهرية لـ Excel ({formatMonthLabel(selectedMonth)}) بنقرة واحدة
            </span>
          </button>
        </div>

        {/* 1. Separate Excel Tables */}
        <div className="bg-black/50 p-3.5 rounded-2xl border border-white/15 space-y-2">
          <span className="font-black text-xs text-white/90 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-[#F5C84C]" />
            <span>تصدير جداول منفصلة لـ Excel ({formatMonthLabel(selectedMonth)}):</span>
          </span>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={handleExportParcelsExcel}
              className="btn-gold w-full py-2 px-3 rounded-xl font-black text-xs flex items-center justify-between"
            >
              <span>📦 جدول الكوليات فقط (Excel / CSV)</span>
              <span className="font-mono text-[10px] bg-black/25 px-2 py-0.5 rounded-lg">
                {filteredData.parcels.length} كولي
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportCashboxExcel}
              className="btn-cancel w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between border border-emerald-500/35 text-emerald-200 hover:text-white"
            >
              <span>💰 جدول الصندوق والمصاريف (Excel / CSV)</span>
              <span className="font-mono text-[10px] bg-black/40 px-2 py-0.5 rounded-lg">
                {filteredData.transactions.length} سند
              </span>
            </button>

            <button
              type="button"
              onClick={handleExportTripsExcel}
              className="btn-cancel w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-between border border-emerald-500/35 text-emerald-200 hover:text-white"
            >
              <span>🚚 جدول الرحلات ومصاريف الطريق (Excel / CSV)</span>
              <span className="font-mono text-[10px] bg-black/40 px-2 py-0.5 rounded-lg">
                {filteredData.trips.length} رحلة
              </span>
            </button>
          </div>
        </div>

        {/* 2. PDF Report */}
        <div className="bg-black/50 p-3.5 rounded-2xl border border-[#F5C84C]/40 space-y-2">
          <span className="font-black text-xs text-[#F5C84C] flex items-center gap-1.5">
            <FileText className="w-4 h-4" />
            <span>التقرير المحاسبي المطبوع (PDF / A4):</span>
          </span>
          <button
            type="button"
            onClick={handlePrintComprehensivePDF}
            className="btn-gold w-full py-2.5 px-3 rounded-xl font-black text-xs flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة / حفظ تقرير ({formatMonthLabel(selectedMonth)}) كـ PDF</span>
          </button>
        </div>

        {/* 3. Full System Backup & Restore */}
        <div className="bg-black/50 p-3.5 rounded-2xl border border-white/15 space-y-2.5">
          <span className="font-black text-xs text-white flex items-center gap-1.5">
            <Database className="w-4 h-4 text-[#F5C84C]" />
            <span>نسخة استرجاع النظام الكاملة (JSON Backup & Restore):</span>
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownloadJSONBackup}
              className="btn-cancel py-2.5 px-3 rounded-xl font-black text-[11px] flex items-center justify-center gap-1.5 border border-[#F5C84C]/40 text-[#F5C84C]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>حفظ نسخة النظام</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-cancel py-2.5 px-3 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>استرجاع نسخة</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleRestoreJSONBackup}
              className="hidden"
            />
          </div>
          <p className="text-[10px] text-white/60 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>تفتح ملفات Excel مباشرة على الهاتف أو الكمبيوتر باللغة العربية الواضحة.</span>
          </p>
        </div>
      </div>
    </div>
  );
};
