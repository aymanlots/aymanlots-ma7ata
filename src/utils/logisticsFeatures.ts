import { Parcel, Trip, RouteTariff, SavedCustomer } from '../types/database';
import QRCode from 'qrcode';

export type WhatsAppTemplateType =
  | 'registered_sender'
  | 'registered_receiver'
  | 'in_transit_receiver'
  | 'arrived_receiver'
  | 'delivered_sender'
  | 'dormant_reminder';

export function formatDateTimeStandard(iso?: string | Date | null): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} . ${hours}:${minutes}`;
}

export function formatDateStandard(iso?: string | Date | null): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatTimeStandard(iso?: string | Date | null): string {
  if (!iso) return '—';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatTrackingCodeNumeric(code?: string | null, parcelNumber?: number): string {
  const raw = String(code || '').trim();
  if (/^\d+$/.test(raw)) {
    return raw.padStart(7, '0');
  }
  const ittMatch = raw.match(/ITT-\d{4}-(\d+)/i);
  if (ittMatch && ittMatch[1]) {
    return ittMatch[1].padStart(7, '0');
  }
  const trailingDigits = raw.match(/(\d+)$/);
  if (trailingDigits && trailingDigits[1]) {
    return trailingDigits[1].padStart(7, '0');
  }
  if (parcelNumber !== undefined && parcelNumber !== null && !isNaN(Number(parcelNumber))) {
    return String(parcelNumber).padStart(7, '0');
  }
  return raw || '0000101';
}

export function extractTrackingQueryCode(rawInput: string): string {
  const raw = String(rawInput || '').trim();
  if (!raw) return '';
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.code) return extractTrackingQueryCode(String(parsed.code));
      if (parsed.num) return extractTrackingQueryCode(String(parsed.num));
    } catch {}
  }
  if (raw.includes('track=')) {
    try {
      const match = raw.match(/[?&]track=([^&#\s]+)/i);
      if (match && match[1]) {
        return decodeURIComponent(match[1]).trim();
      }
    } catch {}
  }
  return raw.replace(/^#/, '').trim();
}

export function matchesTrackingCode(parcel: Parcel, rawQuery: string): boolean {
  const q = extractTrackingQueryCode(rawQuery).toUpperCase();
  if (!q) return false;
  const pCode = (parcel.tracking_code || '').toUpperCase().trim();
  const numericCode = formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number);
  const pNumStr = String(parcel.parcel_number || '');

  if (pCode === q || numericCode === q || pNumStr === q) return true;

  // Compare numeric values if query is purely digits or ITT-YYYY-XXXX
  const qDigits = q.replace(/^ITT-\d{4}-/i, '').replace(/^0+/, '');
  const pDigits = numericCode.replace(/^0+/, '');
  if (qDigits && pDigits && /^\d+$/.test(qDigits) && qDigits === pDigits) {
    return true;
  }
  return false;
}

export function getPublicTrackingLink(trackingCode: string, parcelNumber?: number): string {
  const numericCode = formatTrackingCodeNumeric(trackingCode, parcelNumber);
  if (typeof window === 'undefined') return numericCode;
  return `${window.location.origin}${window.location.pathname}?track=${encodeURIComponent(numericCode)}`;
}

export function buildWhatsAppParcelMessage(
  parcel: Parcel,
  templateType: WhatsAppTemplateType,
  workspaceName: string = 'Sahara📦 Express',
  daysWaiting?: number
): { phone: string; message: string; recipientLabel: string } {
  const numericCode = formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number);
  const trackUrl = getPublicTrackingLink(numericCode, parcel.parcel_number);
  const remaining = Math.max(0, Math.round(((parcel.amount_due || 0) - (parcel.amount_paid || 0)) * 100) / 100);
  const paymentLine =
    remaining > 0
      ? `💳 *المبلغ المتبقي عند الاستلام:* ${remaining} ${parcel.currency}`
      : `✅ *الأداء:* خالص بالكامل (${parcel.amount_due} ${parcel.currency})`;

  const weightText = parcel.weight_kg ? ` | الوزن: ${parcel.weight_kg} kg` : '';
  const dateText = formatDateTimeStandard(parcel.created_at);

  switch (templateType) {
    case 'registered_sender':
      return {
        phone: parcel.sender_phone,
        recipientLabel: `المرسل (${parcel.sender_name})`,
        message:
          `📦 *${workspaceName} — وصل إيداع رسمي*\n` +
          `مرحباً السيد(ة) *${parcel.sender_name}*، تم تسجيل إرساليتكم بنجاح:\n` +
          `• *كود التتبع:* ${numericCode}\n` +
          `• *التاريخ:* ${dateText}\n` +
          `• *المسار:* ${parcel.origin_station_name || 'الانطلاق'} ➔ ${parcel.destination_station_name || 'الوصول'}\n` +
          `• *المستلم:* ${parcel.receiver_name} (${parcel.receiver_phone})\n` +
          `• *البضاعة:* ${parcel.description} (${parcel.items_count} طرد${weightText})\n` +
          `• ${paymentLine}\n\n` +
          `🔢 *كود تتبع الكولي (للبحث في التطبيق):* ${numericCode}\n` +
          `🔍 *رابط التتبع المباشر والـ QR:*\n${trackUrl}\n` +
          `شكراً لثقتكم بنا!`,
      };

    case 'registered_receiver':
      return {
        phone: parcel.receiver_phone,
        recipientLabel: `المستلم (${parcel.receiver_name})`,
        message:
          `📦 *${workspaceName} — إشعار إرسالية جديدة*\n` +
          `مرحباً السيد(ة) *${parcel.receiver_name}*، أرسل إليكم السيد(ة) *${parcel.sender_name}* كولي جديد:\n` +
          `• *كود التتبع:* ${numericCode}\n` +
          `• *التاريخ:* ${dateText}\n` +
          `• *من محطة:* ${parcel.origin_station_name || 'الانطلاق'} ➔ *إلى:* ${parcel.destination_station_name || 'الوصول'}\n` +
          `• *المحتوى:* ${parcel.description} (${parcel.items_count} طرد${weightText})\n` +
          `• ${paymentLine}\n\n` +
          `🔢 *كود تتبع الكولي:* ${numericCode}\n` +
          `🔍 *تتبع الكولي مباشرة عبر الرابط:*\n${trackUrl}`,
      };

    case 'in_transit_receiver':
      return {
        phone: parcel.receiver_phone,
        recipientLabel: `المستلم (${parcel.receiver_name})`,
        message:
          `🚚 *${workspaceName} — الكولي في الطريق إليكم*\n` +
          `مرحباً السيد(ة) *${parcel.receiver_name}*، نعلمكم أن الكولي كود *${numericCode}* انطلق في الرحلة نحو محطة *${parcel.destination_station_name}*.\n` +
          (parcel.driver_name ? `• *السائق:* ${parcel.driver_name} (${parcel.vehicle_plate || ''})\n` : '') +
          `• ${paymentLine}\n\n` +
          `🔢 *كود التتبع:* ${numericCode}\n` +
          `🔍 *تتبع مسار الكولي بالـ QR:*\n${trackUrl}`,
      };

    case 'arrived_receiver':
      return {
        phone: parcel.receiver_phone,
        recipientLabel: `المستلم (${parcel.receiver_name})`,
        message:
          `🎉 *${workspaceName} — إشعار وصول الكولي للمحطة*\n` +
          `مرحباً السيد(ة) *${parcel.receiver_name}*، وصل الكولي الخاص بكم إلى محطة *${parcel.destination_station_name}* وهو جاهز للاستلام الآن!\n` +
          `• *كود التتبع:* ${numericCode}\n` +
          `• *المرسل:* ${parcel.sender_name}\n` +
          `• ${paymentLine}\n\n` +
          `📌 يرجى الإدلاء بكود الكولي (${numericCode}) أو رمز QR في الرابط التالي عند الحضور للمحطة:\n${trackUrl}`,
      };

    case 'delivered_sender':
      return {
        phone: parcel.sender_phone,
        recipientLabel: `المرسل (${parcel.sender_name})`,
        message:
          `✅ *${workspaceName} — تأكيد تسليم الأمانة*\n` +
          `مرحباً السيد(ة) *${parcel.sender_name}*، نحيطكم علماً أنه تم تسليم الكولي كود *${numericCode}* بنجاح إلى المستلم *${parcel.delivered_to || parcel.receiver_name}* في محطة *${parcel.destination_station_name}*.\n` +
          `شكراً لتعاملكم مع ${workspaceName}!`,
      };

    case 'dormant_reminder':
      return {
        phone: parcel.receiver_phone,
        recipientLabel: `المستلم (${parcel.receiver_name})`,
        message:
          `⚠️ *${workspaceName} — تذكير هام باستلام كولي متأخر*\n` +
          `مرحباً السيد(ة) *${parcel.receiver_name}*، نذكركم بأن الكولي كود *${numericCode}* المرسل من طرف *${parcel.sender_name}* متواجد في محطة *${parcel.destination_station_name}* منذ *${daysWaiting || 5} أيام*.\n` +
          `• ${paymentLine}\n` +
          `يرجى الحضور لاستلامه في أقرب وقت تفادياً لإرجاعه تلقائياً للمرسل.\n` +
          `🔢 *كود الكولي:* ${numericCode}\n` +
          `🔍 *بطاقة الكولي والـ QR:*\n${trackUrl}`,
      };
  }
}

export function openWhatsAppParcelNotification(
  parcel: Parcel,
  templateType: WhatsAppTemplateType,
  workspaceName?: string,
  daysWaiting?: number
): boolean {
  const { phone, message } = buildWhatsAppParcelMessage(parcel, templateType, workspaceName, daysWaiting);
  const cleanPhone = (phone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return false;
  const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank', 'noopener,noreferrer');
  return true;
}

// Default Route Tariffs (Calculateur Automatique)
export const DEFAULT_ROUTE_TARIFFS: RouteTariff[] = [
  { id: 'rt-1', origin_city: 'الداخلة', destination_city: 'نواذيبو', base_fee: 100, rate_per_kg: 15, currency: 'MAD' },
  { id: 'rt-2', origin_city: 'الداخلة', destination_city: 'نواكشوط', base_fee: 150, rate_per_kg: 20, currency: 'MAD' },
  { id: 'rt-3', origin_city: 'العيون', destination_city: 'نواذيبو', base_fee: 130, rate_per_kg: 18, currency: 'MAD' },
  { id: 'rt-4', origin_city: 'العيون', destination_city: 'نواكشوط', base_fee: 180, rate_per_kg: 25, currency: 'MAD' },
  { id: 'rt-5', origin_city: 'الدار البيضاء', destination_city: 'نواكشوط', base_fee: 250, rate_per_kg: 30, currency: 'MAD' },
  { id: 'rt-6', origin_city: 'نواذيبو', destination_city: 'الداخلة', base_fee: 400, rate_per_kg: 60, currency: 'MRU' },
  { id: 'rt-7', origin_city: 'نواكشوط', destination_city: 'الداخلة', base_fee: 600, rate_per_kg: 80, currency: 'MRU' },
];

export function getSavedRouteTariffs(workspaceId?: string): RouteTariff[] {
  try {
    const raw = localStorage.getItem(`alittihadia_tariffs_${workspaceId || 'default'}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_ROUTE_TARIFFS;
}

export function saveRouteTariffs(workspaceId: string | undefined, tariffs: RouteTariff[]): void {
  try {
    localStorage.setItem(`alittihadia_tariffs_${workspaceId || 'default'}`, JSON.stringify(tariffs));
  } catch {}
}

export function getSavedCustomersList(workspaceId?: string): SavedCustomer[] {
  try {
    const raw = localStorage.getItem(`alittihadia_saved_customers_${workspaceId || 'default'}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function calculateShippingEstimate(params: {
  originCity: string;
  destCity: string;
  weightKg: number;
  itemsCount: number;
  tariffs: RouteTariff[];
  vipCustomer?: SavedCustomer | null;
  isFragile?: boolean;
}): {
  total: number;
  currency: 'MAD' | 'MRU';
  breakdown: string;
  appliedVip: boolean;
} {
  const { originCity, destCity, weightKg, itemsCount, tariffs, vipCustomer, isFragile } = params;

  const matched =
    tariffs.find(
      (t) =>
        originCity.includes(t.origin_city) && destCity.includes(t.destination_city)
    ) ||
    tariffs.find((t) => destCity.includes(t.destination_city)) ||
    DEFAULT_ROUTE_TARIFFS[0];

  const currency = vipCustomer?.vip_currency || matched.currency || 'MAD';
  const ratePerKg =
    vipCustomer?.vip_rate_per_kg && vipCustomer.vip_rate_per_kg > 0
      ? vipCustomer.vip_rate_per_kg
      : matched.rate_per_kg;
  const baseFee = matched.base_fee;

  const w = Math.max(0, weightKg || 0);
  const qty = Math.max(1, itemsCount || 1);

  let rawTotal = w > 0 ? baseFee + w * ratePerKg : baseFee * qty;
  if (isFragile) {
    rawTotal = rawTotal * 1.15; // +15% عناية خاصة بالكسر
  }

  let appliedVip = Boolean(vipCustomer?.vip_rate_per_kg);
  if (vipCustomer?.discount_percent && vipCustomer.discount_percent > 0) {
    rawTotal = rawTotal * (1 - vipCustomer.discount_percent / 100);
    appliedVip = true;
  }

  const total = Math.round(rawTotal / 5) * 5 || Math.round(rawTotal);
  const breakdown =
    w > 0
      ? `أساسي ${baseFee} + (${w} كغ × ${ratePerKg} ${currency})` +
        (vipCustomer?.discount_percent ? ` - تخفيض VIP ${vipCustomer.discount_percent}%` : '')
      : `${qty} طرد × تعريفة أساسية ${baseFee} ${currency}`;

  return {
    total: Math.max(10, total),
    currency,
    breakdown,
    appliedVip,
  };
}

// Dormant / Delayed Stock Helper (Alerte Stock Dormant)
export interface DormantParcelItem {
  parcel: Parcel;
  daysWaiting: number;
  sinceDate: string;
}

export function getDormantParcels(parcels: Parcel[], minDays: number = 3): DormantParcelItem[] {
  const now = Date.now();
  const list: DormantParcelItem[] = [];

  parcels.forEach((p) => {
    if (p.status !== 'arrived' && p.status !== 'registered') return;
    if (p.is_collaborator_data) return;

    const refIso = p.arrived_at || p.updated_at || p.created_at;
    const refTime = new Date(refIso).getTime();
    if (isNaN(refTime)) return;

    const diffDays = Math.floor((now - refTime) / (1000 * 60 * 60 * 24));
    if (diffDays >= minDays) {
      list.push({
        parcel: p,
        daysWaiting: diffDays,
        sinceDate: refIso,
      });
    }
  });

  return list.sort((a, b) => b.daysWaiting - a.daysWaiting);
}

export function resolveOfficialPrintBranding(input?: {
  name?: string;
  subtitle?: string;
  phone?: string;
  logoUrl?: string;
}): {
  agencyName: string;
  agencySubtitle: string;
  agencyPhone: string;
  logoSrc: string;
  isPack1Basic99: boolean;
} {
  const defaultAppLogo = `${typeof window !== 'undefined' ? window.location.origin : ''}/assets/aistudio/image_9c11f636.png`;
  const officialAppName = 'Sahara📦 Express';
  const officialAppSubtitle = 'للسفر ونقل البضائع والكوليات';
  let isPack1Basic99 = false;
  try {
    const ws = JSON.parse(localStorage.getItem('aman_workspace') || 'null');
    if (
      ws &&
      (ws.plan_tier === 'plan_2_two_stations' ||
        ws.max_stations === 2 ||
        ws.max_workers_per_station === 1)
    ) {
      isPack1Basic99 = true;
    }
  } catch {}

  if (isPack1Basic99) {
    return {
      agencyName: officialAppName,
      agencySubtitle: officialAppSubtitle,
      agencyPhone: input?.phone?.trim() || '',
      logoSrc: defaultAppLogo,
      isPack1Basic99: true,
    };
  }

  const rawCustomName = input?.name?.trim() || '';
  const finalAgencyName =
    !rawCustomName || rawCustomName === 'محطة الاتحادية'
      ? officialAppName
      : rawCustomName;

  return {
    agencyName: finalAgencyName,
    agencySubtitle: input?.subtitle?.trim() || officialAppSubtitle,
    agencyPhone: input?.phone?.trim() || '',
    logoSrc: input?.logoUrl?.trim() || defaultAppLogo,
    isPack1Basic99: false,
  };
}

// Official Trip & Customs Manifest PDF (Manifeste de Voyage PDF)
export async function printOfficialTripManifestPDF(
  trip: Trip,
  loadedParcels: Parcel[],
  workspaceName: string = 'Sahara📦 Express',
  brandPhone: string = '',
  brandLogoUrl?: string,
  brandSubtitle?: string
): Promise<void> {
  let tripQrDataUrl = '';
  try {
    tripQrDataUrl = await QRCode.toDataURL(trip.trip_code || trip.id, {
      width: 140,
      margin: 1,
    });
  } catch {}

  const resolvedBrand = resolveOfficialPrintBranding({
    name: workspaceName,
    subtitle: brandSubtitle || 'النقل الدولي للبضائع والأمانات (المغرب ➔ الكركرات ➔ موريتانيا)',
    phone: brandPhone,
    logoUrl: brandLogoUrl,
  });
  const effectiveWorkspaceName = resolvedBrand.agencyName;
  const logoSrc = resolvedBrand.logoSrc;
  const subtitleText = resolvedBrand.agencySubtitle;

  const totalWeightKg = loadedParcels.reduce((acc, p) => acc + (Number(p.weight_kg) || 0), 0);
  const totalItemsQty = loadedParcels.reduce((acc, p) => acc + (Number(p.items_count) || 1), 0);
  const totalMadDue = loadedParcels
    .filter((p) => p.currency !== 'MRU')
    .reduce((acc, p) => acc + Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0)), 0);
  const totalMruDue = loadedParcels
    .filter((p) => p.currency === 'MRU')
    .reduce((acc, p) => acc + Math.max(0, (p.amount_due || 0) - (p.amount_paid || 0)), 0);

  const roadExpenses =
    (trip.fuel_expense || 0) +
    (trip.toll_expense || 0) +
    (trip.driver_commission || 0) +
    (trip.other_expense || 0);

  const rowsHtml = loadedParcels
    .map((p, idx) => {
      const rem = Math.max(0, Math.round(((p.amount_due || 0) - (p.amount_paid || 0)) * 100) / 100);
      const numCode = formatTrackingCodeNumeric(p.tracking_code, p.parcel_number);
      return `
        <tr>
          <td style="text-align:center;font-weight:900;">${idx + 1}</td>
          <td style="font-family:monospace;font-weight:900;">#${p.parcel_number}<br/><span style="font-size:10px;color:#444;">${numCode}</span></td>
          <td><strong>${p.sender_name}</strong><br/><span style="font-family:monospace;font-size:10px;">${p.sender_phone}</span></td>
          <td><strong>${p.receiver_name}</strong><br/><span style="font-family:monospace;font-size:10px;">${p.receiver_phone}</span></td>
          <td>${p.description}${p.condition === 'abnormal' ? ' <strong style="color:#b91c1c;">[حذر/كسر]</strong>' : ''}</td>
          <td style="text-align:center;font-weight:800;">${p.items_count || 1}</td>
          <td style="text-align:center;font-family:monospace;">${p.weight_kg ? `${p.weight_kg} kg` : '—'}</td>
          <td style="text-align:center;font-family:monospace;font-weight:900;">
            ${rem > 0 ? `<span style="color:#b91c1c;">تحصيل: ${rem} ${p.currency}</span>` : `<span style="color:#15803d;">خالص (${p.amount_due} ${p.currency})</span>`}
          </td>
          <td style="text-align:center;">⬜</td>
        </tr>
      `;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>مانيفست الرحلة والجمارك - ${trip.trip_code}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, sans-serif; }
    body { margin: 0; padding: 12px; color: #000; background: #fff; font-size: 12px; }
    .header { display: flex; justify-content: space-between; align-items: center; border: 2px solid #000; padding: 12px 16px; border-radius: 8px; margin-bottom: 12px; gap: 12px; }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .brand-logo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #000; flex-shrink: 0; background: #fff; }
    .brand h1 { margin: 0; font-size: 19px; font-weight: 900; }
    .brand p { margin: 3px 0 0; font-size: 11px; color: #333; font-weight: 700; }
    .doc-title { text-align: center; }
    .doc-title h2 { margin: 0; font-size: 15px; font-weight: 900; background: #000; color: #fff; padding: 4px 14px; border-radius: 6px; }
    .doc-title span { display: block; margin-top: 4px; font-size: 11px; font-weight: 800; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
    .meta-box { border: 1.5px solid #000; padding: 8px; border-radius: 6px; background: #f9fafb; }
    .meta-box .lbl { font-size: 10px; color: #444; font-weight: 700; display: block; }
    .meta-box .val { font-size: 13px; font-weight: 900; margin-top: 2px; display: block; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border: 1.5px solid #000; padding: 6px 8px; font-size: 11px; vertical-align: middle; }
    th { background: #111; color: #fff; font-weight: 900; text-align: right; }
    .summary-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
    .sum-card { border: 2px solid #000; padding: 8px; border-radius: 6px; text-align: center; }
    .signatures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; }
    .sig-box { border: 1.5px dashed #000; height: 85px; padding: 8px; border-radius: 6px; text-align: center; font-weight: 800; font-size: 11px; }
    .no-print { margin-bottom: 12px; display: flex; gap: 10px; justify-content: center; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:#000;color:#F5C84C;border:none;border-radius:8px;font-weight:900;cursor:pointer;font-size:14px;">🖨️ طباعة مانيفست الطريق والجمارك (A4 / PDF)</button>
    <button onclick="window.close()" style="padding:10px 18px;background:#eee;color:#111;border:1px solid #999;border-radius:8px;font-weight:800;cursor:pointer;">إغلاق</button>
  </div>

  <div class="header">
    <div class="brand-wrap">
      ${logoSrc ? `<img src="${logoSrc}" alt="${effectiveWorkspaceName}" class="brand-logo" onerror="this.style.display='none'" />` : ''}
      <div class="brand">
        <h1>${effectiveWorkspaceName}</h1>
        <p>${subtitleText}</p>
        ${resolvedBrand.agencyPhone ? `<p dir="ltr" style="font-family:monospace;">Tel: ${resolvedBrand.agencyPhone}</p>` : ''}
      </div>
    </div>
    <div class="doc-title">
      <h2>ورقة الطريق الرسمية وبيان الحمولة (MANIFESTE DE VOYAGE & DOUANE)</h2>
      <span dir="ltr">كود الرحلة: <strong>${trip.trip_code}</strong> | التاريخ: ${formatDateTimeStandard(trip.created_at)}</span>
    </div>
    <div>
      ${tripQrDataUrl ? `<img src="${tripQrDataUrl}" style="width:70px;height:70px;border:1px solid #000;padding:2px;border-radius:4px;" />` : ''}
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-box">
      <span class="lbl">خط السير والعبور:</span>
      <span class="val">${trip.origin_station_name || 'محطة الانطلاق'} ➔ ${trip.destination_station_name || 'محطة الوصول'}</span>
    </div>
    <div class="meta-box">
      <span class="lbl">اسم السائق (الشيفور):</span>
      <span class="val">${trip.driver_name} ${trip.driver_phone ? `(${trip.driver_phone})` : ''}</span>
    </div>
    <div class="meta-box">
      <span class="lbl">رقم تسجيل العربة (Matricule):</span>
      <span class="val" style="font-family:monospace;">${trip.vehicle_plate}</span>
    </div>
    <div class="meta-box">
      <span class="lbl">إجمالي الحمولة:</span>
      <span class="val">${loadedParcels.length} كولي (${totalItemsQty} طرد / ${totalWeightKg} كغ)</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:32px;text-align:center;">#</th>
        <th style="width:110px;">رقم الكولي</th>
        <th>المرسل</th>
        <th>المستلم</th>
        <th>بيان البضاعة والمحتوى</th>
        <th style="width:45px;text-align:center;">العدد</th>
        <th style="width:65px;text-align:center;">الوزن</th>
        <th style="width:120px;text-align:center;">الأداء / التحصيل</th>
        <th style="width:45px;text-align:center;">فحص</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml || '<tr><td colspan="9" style="text-align:center;padding:20px;">لا توجد كوليات مسجلة في هذه الرحلة</td></tr>'}
    </tbody>
  </table>

  <div class="summary-row">
    <div class="sum-card">
      <div style="font-size:10px;color:#444;font-weight:700;">مجموع الكوليات / الطرود</div>
      <div style="font-size:14px;font-weight:900;margin-top:3px;">${loadedParcels.length} كولي (${totalItemsQty} طرد)</div>
    </div>
    <div class="sum-card">
      <div style="font-size:10px;color:#444;font-weight:700;">الوزن الإجمالي المصرح به</div>
      <div style="font-size:14px;font-weight:900;margin-top:3px;font-family:monospace;">${totalWeightKg} KG</div>
    </div>
    <div class="sum-card">
      <div style="font-size:10px;color:#444;font-weight:700;">الباقي للتحصيل عند التسليم</div>
      <div style="font-size:13px;font-weight:900;margin-top:3px;font-family:monospace;">${totalMadDue} MAD | ${totalMruDue} MRU</div>
    </div>
    <div class="sum-card">
      <div style="font-size:10px;color:#444;font-weight:700;">مصاريف الطريق المسجلة</div>
      <div style="font-size:14px;font-weight:900;margin-top:3px;font-family:monospace;">${roadExpenses} ${trip.expense_currency || 'MAD'}</div>
    </div>
  </div>

  <div class="signatures">
    <div class="sig-box">توقيع وخاتم محطة الانطلاق<br/>(${trip.origin_station_name || ''})</div>
    <div class="sig-box">توقيع السائق بالاستلام<br/>(${trip.driver_name})</div>
    <div class="sig-box">تأشيرة المراقبة / المعبر الحدودي<br/>(الكركرات / PK55)</div>
    <div class="sig-box">توقيع محطة الوصول والتفريغ<br/>(${trip.destination_station_name || ''})</div>
  </div>

  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 350); };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}

// Official Parcel Receipt / Bon PDF (بون إيداع واستلام الكولي PDF مع الشعار المخصص)
export async function printOfficialParcelBonPDF(
  parcel: Parcel,
  branding?: {
    name?: string;
    subtitle?: string;
    phone?: string;
    logoUrl?: string;
  }
): Promise<void> {
  const numericCode = formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number);
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(numericCode, {
      width: 150,
      margin: 1,
    });
  } catch {}

  const resolvedBrand = resolveOfficialPrintBranding({
    name: branding?.name,
    subtitle: branding?.subtitle || 'خدمات الشحن السريع ونقل البضائع والأمانات بين المحطات',
    phone: branding?.phone,
    logoUrl: branding?.logoUrl,
  });
  const agencyName = resolvedBrand.agencyName;
  const agencySubtitle = resolvedBrand.agencySubtitle;
  const agencyPhone = resolvedBrand.agencyPhone;
  const logoSrc = resolvedBrand.logoSrc;

  const remaining = Math.max(0, Math.round(((parcel.amount_due || 0) - (parcel.amount_paid || 0)) * 100) / 100);
  const isSettled = remaining <= 0 || parcel.payment_status === 'paid';
  const payerText = parcel.payer === 'sender' ? 'المرسل' : 'المستلم';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>بون إرسالية كولي #${parcel.parcel_number} - ${parcel.tracking_code}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, sans-serif; }
    body { margin: 0; padding: 14px; color: #000; background: #fff; font-size: 12px; }
    .bon-card { border: 2.5px solid #000; border-radius: 12px; padding: 16px; max-width: 780px; margin: 0 auto; background: #fff; }
    .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 14px; gap: 12px; }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .brand-logo { width: 68px; height: 68px; border-radius: 50%; object-fit: cover; border: 2px solid #000; background: #fff; flex-shrink: 0; }
    .brand-title { font-size: 20px; font-weight: 900; margin: 0; }
    .brand-sub { font-size: 11px; font-weight: 700; color: #333; margin: 3px 0 0; }
    .bon-badge { background: #000; color: #fff; padding: 6px 16px; border-radius: 8px; text-align: center; }
    .bon-badge h2 { margin: 0; font-size: 15px; font-weight: 900; }
    .bon-badge span { font-family: monospace; font-size: 12px; font-weight: 900; color: #F5C84C; display: block; margin-top: 2px; }
    .route-banner { border: 2px solid #000; background: #f8fafc; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-weight: 900; font-size: 14px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
    .box { border: 1.5px solid #000; border-radius: 8px; padding: 10px 12px; }
    .box-title { font-size: 11px; font-weight: 900; text-decoration: underline; margin-bottom: 6px; color: #111; }
    .row { display: flex; justify-content: space-between; margin: 4px 0; font-size: 12px; }
    .pay-banner { border: 2px solid #000; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: ${isSettled ? '#f0fdf4' : '#fef2f2'}; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 14px; }
    .sig { border: 1.5px dashed #000; border-radius: 8px; height: 78px; padding: 8px; text-align: center; font-weight: 800; font-size: 11px; }
    .no-print { margin-bottom: 12px; display: flex; justify-content: center; gap: 10px; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:#000;color:#F5C84C;border:none;border-radius:8px;font-weight:900;cursor:pointer;font-size:14px;">🖨️ طباعة / حفظ بون الكولي (PDF)</button>
    <button onclick="window.close()" style="padding:10px 18px;background:#eee;color:#111;border:1px solid #999;border-radius:8px;font-weight:800;cursor:pointer;">إغلاق</button>
  </div>

  <div class="bon-card">
    <div class="hdr">
      <div class="brand-wrap">
        ${logoSrc ? `<img src="${logoSrc}" alt="${agencyName}" class="brand-logo" onerror="this.style.display='none'" />` : ''}
        <div>
          <h1 class="brand-title">${agencyName}</h1>
          <p class="brand-sub">${agencySubtitle}</p>
          ${agencyPhone ? `<p dir="ltr" style="margin:3px 0 0;font-family:monospace;font-weight:900;font-size:12px;">Tel: ${agencyPhone}</p>` : ''}
        </div>
      </div>

      <div class="bon-badge">
        <h2>بون إيداع وشحن كولي (BON D'EXPÉDITION)</h2>
        <span dir="ltr">#${parcel.parcel_number} — ${numericCode}</span>
        <div dir="ltr" style="font-size:10px;color:#ddd;margin-top:2px;">التاريخ: ${formatDateTimeStandard(parcel.created_at)}</div>
      </div>

      <div>
        ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:74px;height:74px;border:1.5px solid #000;padding:2px;border-radius:6px;display:block;" />` : ''}
      </div>
    </div>

    <div class="route-banner">
      <div>📍 من محطة الانطلاق: <span style="text-decoration:underline;">${parcel.origin_station_name || '—'}</span></div>
      <div style="font-size:18px;">⬅️ 🚚 ⬅️</div>
      <div>🏁 إلى محطة الوجهة: <span style="text-decoration:underline;">${parcel.destination_station_name || '—'}</span></div>
    </div>

    <div class="grid-2">
      <div class="box">
        <div class="box-title">👤 بيانات المرسل (Expéditeur)</div>
        <div class="row"><span>الاسم الكامل:</span><strong>${parcel.sender_name}</strong></div>
        <div class="row"><span>رقم الهاتف:</span><strong dir="ltr" style="font-family:monospace;">${parcel.sender_phone}</strong></div>
      </div>

      <div class="box">
        <div class="box-title">🎯 بيانات المستلم (Destinataire)</div>
        <div class="row"><span>الاسم الكامل:</span><strong>${parcel.receiver_name}</strong></div>
        <div class="row"><span>رقم الهاتف:</span><strong dir="ltr" style="font-family:monospace;">${parcel.receiver_phone}</strong></div>
      </div>
    </div>

    <div class="box" style="margin-bottom:12px;">
      <div class="box-title">📦 تفاصيل البضاعة والطرد المشحون</div>
      <div class="row"><span>وصف المحتوى:</span><strong>${parcel.description} ${parcel.category ? `(${parcel.category})` : ''}</strong></div>
      <div class="row">
        <span>عدد الطرود: <strong>${parcel.items_count || 1} طرد</strong></span>
        <span>الوزن: <strong dir="ltr" style="font-family:monospace;">${parcel.weight_kg ? `${parcel.weight_kg} KG` : 'غير محدد'}</strong></span>
        <span>الحالة: <strong>${parcel.condition === 'abnormal' ? `⚠️ عناية خاصة (${parcel.condition_notes || 'قابل للكسر'})` : '✅ سليم وعادي'}</strong></span>
      </div>
    </div>

    <div class="pay-banner">
      <div>
        <div style="font-size:11px;font-weight:800;color:#333;">حالة الأداء والفوترة (الدافع: ${payerText})</div>
        <div style="font-size:16px;font-weight:900;margin-top:2px;">
          ${isSettled ? '✅ الأداء خالص بالكامل (PAYÉ)' : `⏳ غير خالص — الباقي للتحصيل: ${remaining} ${parcel.currency}`}
        </div>
      </div>
      <div style="text-align:left;font-family:monospace;">
        <div style="font-size:12px;">الواجب الإجمالي: <strong>${parcel.amount_due} ${parcel.currency}</strong></div>
        <div style="font-size:12px;">المؤدى: <strong>${parcel.amount_paid} ${parcel.currency}</strong></div>
      </div>
    </div>

    <div class="sigs">
      <div class="sig">توقيع المرسل<br/>(${parcel.sender_name})</div>
      <div class="sig">خاتم وتوقيع الوكالة / المحطة<br/>(${agencyName})</div>
      <div class="sig">توقيع المستلم عند التسليم<br/>(${parcel.receiver_name})</div>
    </div>
  </div>

  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 350); };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}

// Official Cash Voucher Bon PDF (بون سند الصندوق قبض/صرف PDF مع الشعار المخصص)
export async function printOfficialCashVoucherBonPDF(
  tx: {
    id: string;
    type: string;
    amount: number;
    currency: string;
    station_name?: string;
    creator_name?: string;
    person_name?: string;
    phone_number?: string | null;
    reason?: string | null;
    note?: string | null;
    created_at: string;
    status?: string;
  },
  branding?: {
    name?: string;
    subtitle?: string;
    phone?: string;
    logoUrl?: string;
  }
): Promise<void> {
  let qrDataUrl = '';
  try {
    qrDataUrl = await QRCode.toDataURL(`VOUCHER:${tx.id}|AMT:${tx.amount}${tx.currency}`, {
      width: 130,
      margin: 1,
    });
  } catch {}

  const resolvedBrand = resolveOfficialPrintBranding({
    name: branding?.name,
    subtitle: branding?.subtitle || 'الإدارة المالية وصندوق المحطات النقدية (LA CAISSE)',
    phone: branding?.phone,
    logoUrl: branding?.logoUrl,
  });
  const agencyName = resolvedBrand.agencyName;
  const agencySubtitle = resolvedBrand.agencySubtitle;
  const agencyPhone = resolvedBrand.agencyPhone;
  const logoSrc = resolvedBrand.logoSrc;

  const isInflow = ['cash_in', 'parcel_shipping_fee', 'parcel_cod_collection'].includes(tx.type);
  const typeTitle = isInflow
    ? 'سند قبض وإيداع نقدي (BON D\'ENTRÉE CAISSE)'
    : 'سند صرف وأداء نقدي (BON DE SORTIE CAISSE)';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>بون سند الصندوق - ${tx.id}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; font-family: 'Cairo', 'Tajawal', sans-serif; }
    body { margin: 0; padding: 14px; color: #000; background: #fff; font-size: 12px; }
    .bon-card { border: 2.5px solid #000; border-radius: 12px; padding: 16px; max-width: 720px; margin: 0 auto; }
    .hdr { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 14px; gap: 12px; }
    .brand-wrap { display: flex; align-items: center; gap: 12px; }
    .brand-logo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #000; background: #fff; }
    .amt-box { border: 2px solid #000; border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #f8fafc; }
    .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ccc; font-size: 12px; }
    .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .sig { border: 1.5px dashed #000; border-radius: 8px; height: 80px; padding: 8px; text-align: center; font-weight: 800; font-size: 11px; }
    .no-print { margin-bottom: 12px; display: flex; justify-content: center; gap: 10px; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:10px 24px;background:#000;color:#F5C84C;border:none;border-radius:8px;font-weight:900;cursor:pointer;font-size:14px;">🖨️ طباعة / حفظ بون السند المالي (PDF)</button>
    <button onclick="window.close()" style="padding:10px 18px;background:#eee;color:#111;border:1px solid #999;border-radius:8px;font-weight:800;cursor:pointer;">إغلاق</button>
  </div>

  <div class="bon-card">
    <div class="hdr">
      <div class="brand-wrap">
        ${logoSrc ? `<img src="${logoSrc}" alt="${agencyName}" class="brand-logo" onerror="this.style.display='none'" />` : ''}
        <div>
          <h1 style="margin:0;font-size:19px;font-weight:900;">${agencyName}</h1>
          <p style="margin:3px 0 0;font-size:11px;font-weight:700;color:#333;">${agencySubtitle}</p>
          ${agencyPhone ? `<p dir="ltr" style="margin:3px 0 0;font-family:monospace;font-weight:900;font-size:12px;">Tel: ${agencyPhone}</p>` : ''}
        </div>
      </div>

      <div style="text-align:center;background:#000;color:#fff;padding:6px 14px;border-radius:8px;">
        <div style="font-size:13px;font-weight:900;">${typeTitle}</div>
        <div dir="ltr" style="font-family:monospace;font-size:11px;color:#F5C84C;margin-top:2px;">${tx.id}</div>
      </div>

      <div>
        ${qrDataUrl ? `<img src="${qrDataUrl}" style="width:66px;height:66px;border:1.5px solid #000;padding:2px;border-radius:6px;" />` : ''}
      </div>
    </div>

    <div class="amt-box">
      <div>
        <div style="font-size:11px;font-weight:800;color:#444;">المبلغ الصافي المعتمد:</div>
        <div style="font-size:13px;font-weight:900;margin-top:2px;">المحطة: ${tx.station_name || 'المحطة'}</div>
      </div>
      <div dir="ltr" style="font-family:monospace;font-size:24px;font-weight:900;">
        ${isInflow ? '+' : '-'}${tx.amount.toLocaleString('en-US')} ${tx.currency}
      </div>
    </div>

    <div class="row"><span>التاريخ والتوقيت:</span><strong dir="ltr" style="font-family:monospace;">${formatDateTimeStandard(tx.created_at)}</strong></div>
    <div class="row"><span>البيان والسبب:</span><strong>${tx.reason || 'سند صندوق نقدي'}</strong></div>
    ${tx.phone_number ? `<div class="row"><span>رقم الهاتف:</span><strong dir="ltr" style="font-family:monospace;">${tx.phone_number}</strong></div>` : ''}
    ${tx.note ? `<div class="row"><span>ملاحظات إضافية:</span><strong>${tx.note}</strong></div>` : ''}
    <div class="row"><span>المسؤول عن التسجيل:</span><strong>${tx.creator_name || 'مسؤول الصندوق'}</strong></div>

    <div class="sigs">
      <div class="sig">توقيع المستفيد / المسلم</div>
      <div class="sig">خاتم وتوقيع أمين الصندوق (${agencyName})</div>
    </div>
  </div>

  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 350); };
  </script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}

