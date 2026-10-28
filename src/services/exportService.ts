import { Parcel, Station, Transaction, Workspace } from '../types/database';
import {
  formatDateTimeStandard,
  formatTrackingCodeNumeric,
  resolveOfficialPrintBranding,
} from '../utils/logisticsFeatures';

const STATUS_AR: Record<string, string> = {
  pending: 'مسجل في المحطة',
  registered: 'تم التسجيل',
  ready_for_dispatch: 'جاهز للشحن',
  in_transit: 'في الطريق',
  arrived: 'وصلت المحطة',
  delivered: 'تم التسليم',
  return_in_transit: 'في طريق الإرجاع',
  returned: 'تم الإرجاع للمرسل',
  cancelled: 'ملغى',
};

const TX_TYPE_AR: Record<string, string> = {
  cash_in: '+ إيداع نقدي فلاكيس',
  cash_out: '- سحب / صرف نقدي',
  parcel_shipping_fee: '+ تحصيل أجرة شحن كولي',
  parcel_cod_collection: '+ تحصيل قيمة بضاعة (COD)',
  parcel_cod_payout: '- تسليم قيمة بضاعة للمرسل',
  goods_payment: '- سداد بضاعة',
  safe_drop: 'إيداع للخزنة',
};

function escapeHtml(str: unknown): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openPrintablePDFWindow(title: string, bodyHtml: string): void {
  const printWin = window.open('', '_blank', 'width=960,height=800');
  if (!printWin) return;

  const nowFormatted = formatDateTimeStandard(new Date().toISOString());
  let savedBranding: { agencyName?: string; logoUrl?: string; agencyPhone?: string } = {};
  try {
    savedBranding = JSON.parse(localStorage.getItem('alittihadia_sticker_branding_v1') || '{}');
  } catch {}
  const resolved = resolveOfficialPrintBranding({
    name: savedBranding.agencyName,
    phone: savedBranding.agencyPhone,
    logoUrl: savedBranding.logoUrl,
  });

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap');
    * { box-sizing: border-box; }
    body {
      font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 20px;
      background: #ffffff;
      color: #111827;
      direction: rtl;
    }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #111827;
      color: #F5C84C;
      padding: 12px 18px;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .toolbar button {
      background: #F5C84C;
      color: #111827;
      border: none;
      padding: 8px 18px;
      border-radius: 8px;
      font-family: inherit;
      font-weight: 800;
      font-size: 13px;
      cursor: pointer;
    }
    .header-box {
      border: 2px solid #111827;
      border-radius: 14px;
      padding: 16px 20px;
      margin-bottom: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #f9fafb;
      gap: 14px;
    }
    .header-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .header-logo {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid #111827;
      background: #fff;
      flex-shrink: 0;
    }
    .header-title {
      font-size: 20px;
      font-weight: 900;
      margin: 0 0 4px 0;
      color: #111827;
    }
    .header-sub {
      font-size: 12px;
      font-weight: 700;
      color: #4b5563;
      margin: 0;
    }
    .section-title {
      font-size: 15px;
      font-weight: 900;
      margin: 18px 0 8px 0;
      padding-bottom: 6px;
      border-bottom: 2px solid #111827;
      color: #111827;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 18px;
      font-size: 11.5px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 7px 8px;
      text-align: right;
      vertical-align: middle;
    }
    th {
      background: #111827;
      color: #F5C84C;
      font-weight: 800;
      font-size: 11.5px;
    }
    tr:nth-child(even) td {
      background: #f9fafb;
    }
    .ltr {
      direction: ltr;
      unicode-bidi: isolate;
      font-family: monospace;
      font-weight: 700;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .stat-card {
      border: 1.5px solid #d1d5db;
      border-radius: 10px;
      padding: 10px 14px;
      background: #f9fafb;
    }
    .stat-card h4 {
      margin: 0 0 4px 0;
      font-size: 13px;
      font-weight: 800;
      color: #111827;
    }
    .stat-card p {
      margin: 2px 0;
      font-size: 12px;
      font-weight: 700;
      color: #374151;
    }
    @media print {
      .toolbar { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span>📄 ${escapeHtml(title)} — جاهز للحفظ أو الطباعة بصيغة PDF</span>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()">⬇ حفظ / طباعة PDF</button>
      <button onclick="window.close()" style="background:#374151;color:#fff;">إغلاق</button>
    </div>
  </div>
  <div class="header-box">
    <div class="header-brand">
      ${resolved.logoSrc ? `<img src="${escapeHtml(resolved.logoSrc)}" alt="${escapeHtml(resolved.agencyName)}" class="header-logo" onerror="this.style.display='none'" />` : ''}
      <div>
        <h1 class="header-title">${escapeHtml(title)}</h1>
        <p class="header-sub">${escapeHtml(resolved.agencyName)} — ${escapeHtml(resolved.agencySubtitle)}</p>
      </div>
    </div>
    <div style="text-align:left;">
      <p class="header-sub">تاريخ استخراج التقرير:</p>
      <p class="ltr" style="font-size:13px;margin:2px 0 0 0;color:#111827;">${escapeHtml(nowFormatted)}</p>
    </div>
  </div>
  ${bodyHtml}
  <script>
    window.onload = function() {
      setTimeout(function() { window.print(); }, 350);
    };
  </script>
</body>
</html>`;

  printWin.document.open();
  printWin.document.write(html);
  printWin.document.close();
}

export const exportService = {
  /**
   * Export Transactions / Cash Ledger to Official PDF
   */
  exportTransactionsToPDF(transactions: Transaction[], workspaceName: string): void {
    const rowsHtml = transactions
      .map(
        (tx, idx) => `
      <tr>
        <td class="ltr">${idx + 1}</td>
        <td class="ltr">${escapeHtml(formatDateTimeStandard(tx.created_at))}</td>
        <td>${escapeHtml(tx.station_name || tx.station_id)}</td>
        <td>${escapeHtml(TX_TYPE_AR[tx.type] || tx.type)}</td>
        <td class="ltr">${escapeHtml(tx.amount)} ${escapeHtml(tx.currency)}</td>
        <td>${escapeHtml(tx.reason || tx.person_name || '—')}</td>
        <td class="ltr">${escapeHtml(tx.phone_number || '—')}</td>
        <td>${escapeHtml(tx.creator_name || '—')}</td>
        <td>${tx.status === 'confirmed' ? 'مؤكد' : tx.status === 'cancelled' ? 'ملغى' : 'معلق'}</td>
      </tr>`
      )
      .join('');

    const bodyHtml = `
      <h2 class="section-title">سجل عمليات الصندوق (اللاگيس) — إجمالي السندات: ${transactions.length}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>التاريخ والوقت</th>
            <th>المحطة</th>
            <th>نوع العملية</th>
            <th>المبلغ والعملة</th>
            <th>البيان / السبب</th>
            <th>الهاتف</th>
            <th>المسؤول</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:16px;">لا توجد عمليات مسجلة</td></tr>'}
        </tbody>
      </table>
    `;

    openPrintablePDFWindow(`تقرير سجل الصندوق PDF - ${workspaceName}`, bodyHtml);
  },

  /**
   * Export Parcels to Official PDF
   */
  exportParcelsToPDF(parcels: Parcel[], workspaceName: string): void {
    const rowsHtml = parcels
      .map((p, idx) => {
        const fee = p.shipping_fee ?? p.amount_due ?? 0;
        const paid = p.amount_paid ?? 0;
        const rem = Math.max(0, Math.round((fee - paid) * 100) / 100);
        const codeNum = formatTrackingCodeNumeric(p.tracking_code, p.parcel_number);
        return `
      <tr>
        <td class="ltr">${idx + 1}</td>
        <td class="ltr">${escapeHtml(codeNum)}</td>
        <td class="ltr">${escapeHtml(formatDateTimeStandard(p.created_at))}</td>
        <td>${escapeHtml(p.origin_station_name)} ➔ ${escapeHtml(p.destination_station_name)}</td>
        <td>${escapeHtml(p.sender_name)}<br/><span class="ltr" style="font-size:10px;color:#4b5563;">${escapeHtml(p.sender_phone)}</span></td>
        <td>${escapeHtml(p.receiver_name)}<br/><span class="ltr" style="font-size:10px;color:#4b5563;">${escapeHtml(p.receiver_phone)}</span></td>
        <td>${escapeHtml(p.description)} (${p.items_count || 1})</td>
        <td class="ltr">${escapeHtml(fee)} ${escapeHtml(p.currency)}</td>
        <td class="ltr">${rem > 0 ? `متبقي: ${rem} ${escapeHtml(p.currency)}` : 'خالص ✓'}</td>
        <td>${escapeHtml(STATUS_AR[p.status] || p.status)}</td>
      </tr>`;
      })
      .join('');

    const bodyHtml = `
      <h2 class="section-title">سجل الكوليات والإرساليات — إجمالي الكوليات: ${parcels.length}</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>كود التتبع</th>
            <th>التاريخ والوقت</th>
            <th>المسار (من ➔ إلى)</th>
            <th>المرسل</th>
            <th>المستلم</th>
            <th>الوصف والعدد</th>
            <th>واجب الإرسال</th>
            <th>حالة الأداء</th>
            <th>حالة الكولي</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="10" style="text-align:center;padding:16px;">لا توجد كوليات مسجلة</td></tr>'}
        </tbody>
      </table>
    `;

    openPrintablePDFWindow(`تقرير سجل الكوليات PDF - ${workspaceName}`, bodyHtml);
  },

  /**
   * Export Full Workspace Backup Report as Official PDF
   */
  exportFullWorkspacePDF(
    workspace: Workspace | null,
    stationsOrTransactions: Station[] | Transaction[] = [],
    stationBalancesOrParcels: Record<string, Record<string, number>> | Parcel[] = {},
    maybeTransactions?: Transaction[],
    maybeParcels?: Parcel[]
  ): void {
    let stations: Station[] = [];
    let stationBalances: Record<string, Record<string, number>> = {};
    let transactions: Transaction[] = [];
    let parcels: Parcel[] = [];

    if (maybeTransactions && maybeParcels) {
      stations = (stationsOrTransactions as Station[]) || [];
      stationBalances = (stationBalancesOrParcels as Record<string, Record<string, number>>) || {};
      transactions = maybeTransactions || [];
      parcels = maybeParcels || [];
    } else {
      transactions = (stationsOrTransactions as Transaction[]) || [];
      parcels = (stationBalancesOrParcels as Parcel[]) || [];
    }

    const wsName = workspace?.custom_brand_name || workspace?.name || 'محطة الاتحادية';

    const stationsHtml = stations
      .map(st => {
        const bals = stationBalances[st.id] || {};
        const mad = Math.round((bals['MAD'] || 0) * 100) / 100;
        const mru = Math.round((bals['MRU'] || 0) * 100) / 100;
        return `
        <div class="stat-card">
          <h4>📍 ${escapeHtml(st.name)} (${escapeHtml(st.city)})</h4>
          <p>صندوق الدرهم (MAD): <span class="ltr">${mad.toLocaleString('en-US')} MAD</span></p>
          <p>صندوق الأوقية (MRU): <span class="ltr">${mru.toLocaleString('en-US')} MRU</span></p>
        </div>`;
      })
      .join('');

    const parcelsRows = parcels
      .map((p, idx) => {
        const fee = p.shipping_fee ?? p.amount_due ?? 0;
        const codeNum = formatTrackingCodeNumeric(p.tracking_code, p.parcel_number);
        return `
      <tr>
        <td class="ltr">${idx + 1}</td>
        <td class="ltr">${escapeHtml(codeNum)}</td>
        <td class="ltr">${escapeHtml(formatDateTimeStandard(p.created_at))}</td>
        <td>${escapeHtml(p.origin_station_name)} ➔ ${escapeHtml(p.destination_station_name)}</td>
        <td>${escapeHtml(p.sender_name)} (${escapeHtml(p.sender_phone)})</td>
        <td>${escapeHtml(p.receiver_name)} (${escapeHtml(p.receiver_phone)})</td>
        <td>${escapeHtml(p.description)}</td>
        <td class="ltr">${escapeHtml(fee)} ${escapeHtml(p.currency)}</td>
        <td>${escapeHtml(STATUS_AR[p.status] || p.status)}</td>
      </tr>`;
      })
      .join('');

    const txRows = transactions
      .map(
        (tx, idx) => `
      <tr>
        <td class="ltr">${idx + 1}</td>
        <td class="ltr">${escapeHtml(formatDateTimeStandard(tx.created_at))}</td>
        <td>${escapeHtml(tx.station_name || tx.station_id)}</td>
        <td>${escapeHtml(TX_TYPE_AR[tx.type] || tx.type)}</td>
        <td class="ltr">${escapeHtml(tx.amount)} ${escapeHtml(tx.currency)}</td>
        <td>${escapeHtml(tx.reason || tx.person_name || '—')}</td>
        <td>${escapeHtml(tx.creator_name || '—')}</td>
      </tr>`
      )
      .join('');

    const bodyHtml = `
      <h2 class="section-title">1. ملخص المحطات وأرصدة الصناديق (${stations.length} محطات)</h2>
      <div class="cards-grid">
        ${stationsHtml || '<p>لا توجد محطات مسجلة</p>'}
      </div>

      <h2 class="section-title">2. سجل الكوليات والإرساليات (${parcels.length} كولي)</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>كود التتبع</th>
            <th>التاريخ والوقت</th>
            <th>المسار</th>
            <th>المرسل</th>
            <th>المستلم</th>
            <th>الوصف</th>
            <th>المبلغ</th>
            <th>الحالة</th>
          </tr>
        </thead>
        <tbody>
          ${parcelsRows || '<tr><td colspan="9" style="text-align:center;padding:12px;">لا توجد كوليات</td></tr>'}
        </tbody>
      </table>

      <h2 class="section-title">3. سجل عمليات الصندوق المالي (${transactions.length} سند)</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>التاريخ والوقت</th>
            <th>المحطة</th>
            <th>نوع العملية</th>
            <th>المبلغ</th>
            <th>البيان</th>
            <th>المسؤول</th>
          </tr>
        </thead>
        <tbody>
          ${txRows || '<tr><td colspan="7" style="text-align:center;padding:12px;">لا توجد عمليات مالية</td></tr>'}
        </tbody>
      </table>
    `;

    openPrintablePDFWindow(`النسخة الاحتياطية الشاملة PDF - ${wsName}`, bodyHtml);
  },

  // Backward-compatible aliases that now export as PDF
  exportTransactionsToCSV(transactions: Transaction[], workspaceName: string): void {
    this.exportTransactionsToPDF(transactions, workspaceName);
  },

  exportParcelsToCSV(parcels: Parcel[], workspaceName: string): void {
    this.exportParcelsToPDF(parcels, workspaceName);
  },

  exportFullWorkspaceJSON(
    workspace: Workspace | null,
    stations: Station[],
    stationBalances: Record<string, Record<string, number>>,
    transactions: Transaction[],
    parcels: Parcel[]
  ): void {
    this.exportFullWorkspacePDF(workspace, stations, stationBalances, transactions, parcels);
  },
};
