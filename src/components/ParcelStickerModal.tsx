import React, { useRef, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { Parcel } from '../types/database';
import { useApp } from '../context/AppContext';
import { formatTrackingCodeNumeric } from '../utils/logisticsFeatures';
import {
  Printer,
  ExternalLink,
  AlertTriangle,
  X,
  Search,
  CheckSquare,
  Square,
  Users,
  Plus,
  Minus,
  Settings2,
  Layers,
  QrCode,
  Barcode,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export type StickerPaperFormat = '100x100' | 'a4_4up' | 'custom';
export type StickerCodeType = 'qr' | 'code128' | 'both';

export interface StickerPrintOptions {
  paperFormat: StickerPaperFormat;
  customWidthMm: number;
  customHeightMm: number;
  codeType: StickerCodeType;
  showStationBranding: boolean;
  showSenderInfo: boolean;
  showReceiverInfo: boolean;
  showPaymentStatus: boolean;
  showDateTime: boolean;
  showRouteLine: boolean;
  showStampBox: boolean;
}

export interface StickerBrandingConfig {
  agencyName: string;
  agencyPhone: string;
  logoUrl: string;
}

const STICKER_OPTIONS_STORAGE_KEY = 'alittihadia_sticker_print_options_v1';
const BATCH_PRINT_STORAGE_KEY = 'alittihadia_batch_sticker_html_v1';

const DEFAULT_STICKER_OPTIONS: StickerPrintOptions = {
  paperFormat: '100x100',
  customWidthMm: 100,
  customHeightMm: 100,
  codeType: 'qr',
  showStationBranding: true,
  showSenderInfo: true,
  showReceiverInfo: true,
  showPaymentStatus: true,
  showDateTime: true,
  showRouteLine: true,
  showStampBox: true,
};

function loadSavedStickerOptions(): StickerPrintOptions {
  if (typeof window === 'undefined') return DEFAULT_STICKER_OPTIONS;
  try {
    const raw = localStorage.getItem(STICKER_OPTIONS_STORAGE_KEY);
    if (!raw) return DEFAULT_STICKER_OPTIONS;
    const parsed = JSON.parse(raw);
    return {
      paperFormat:
        parsed.paperFormat === 'a4_4up' || parsed.paperFormat === 'custom'
          ? parsed.paperFormat
          : '100x100',
      customWidthMm: Math.max(50, Math.min(210, Number(parsed.customWidthMm) || 100)),
      customHeightMm: Math.max(50, Math.min(297, Number(parsed.customHeightMm) || 100)),
      codeType:
        parsed.codeType === 'code128' || parsed.codeType === 'both' ? parsed.codeType : 'qr',
      showStationBranding: typeof parsed.showStationBranding === 'boolean' ? parsed.showStationBranding : true,
      showSenderInfo: typeof parsed.showSenderInfo === 'boolean' ? parsed.showSenderInfo : true,
      showReceiverInfo: typeof parsed.showReceiverInfo === 'boolean' ? parsed.showReceiverInfo : true,
      showPaymentStatus: typeof parsed.showPaymentStatus === 'boolean' ? parsed.showPaymentStatus : true,
      showDateTime: typeof parsed.showDateTime === 'boolean' ? parsed.showDateTime : true,
      showRouteLine: typeof parsed.showRouteLine === 'boolean' ? parsed.showRouteLine : true,
      showStampBox: typeof parsed.showStampBox === 'boolean' ? parsed.showStampBox : true,
    };
  } catch {
    return DEFAULT_STICKER_OPTIONS;
  }
}

interface ParcelStickerModalProps {
  parcel: Parcel | null;
  initialSelectedParcels?: Parcel[];
  isOpen: boolean;
  onClose: () => void;
  autoPrint?: boolean;
}

/**
 * جدول أنماط Code 128 القياسي (ISO/IEC 15417) للقيم 0..106
 */
const CODE128_PATTERNS: string[] = [
  '11011001100', '11001101100', '11001100110', '10010011000', '10010001100',
  '10001001100', '10011001000', '10011000100', '10001100100', '11001001000',
  '11001000100', '11000100100', '10110011100', '10011011100', '10011001110',
  '10111001100', '10011101100', '10011100110', '11001110010', '11001011100',
  '11001001110', '11011100100', '11001110100', '11101101110', '11101001100',
  '11100101100', '11100100110', '11101100100', '11100110100', '11100110010',
  '11011011000', '11011000110', '11000110110', '10100011000', '10001011000',
  '10001000110', '10110001000', '10001101000', '10001100010', '11010001000',
  '11000101000', '11000100010', '10110111000', '10110001110', '10001101110',
  '10111011000', '10111000110', '10001110110', '11101110110', '11010001110',
  '11000101110', '11011101000', '11011100010', '11011101110', '11101011000',
  '11101000110', '11100010110', '11101101000', '11101100010', '11100011010',
  '11101111010', '11001000010', '11110001010', '10100110000', '10100001100',
  '10010110000', '10010000110', '10000101100', '10000100110', '10110010000',
  '10110000100', '10011010000', '10011000010', '10000110100', '10000110010',
  '11000010010', '11001010000', '11110111010', '11000010100', '10001111010',
  '10100111100', '10010111100', '10010011110', '10111100100', '10011110100',
  '10011110010', '11110100100', '11110010100', '11110010010', '11011011110',
  '11011110110', '11110110110', '10101111000', '10100011110', '10001011110',
  '10111101000', '10111100010', '11110101000', '11110100010', '10111011110',
  '10111101110', '11101011110', '11110101110', '11010000100', '11010010000',
  '11010011100', '1100011101011',
];

/**
 * توليد باركود Code128-B بصيغة SVG متجهة عالية التباين (أبيض وأسود فقط)
 */
function generateCode128SvgMarkup(text: string, widthMm: string, heightMm: string): string {
  const clean = (text || 'ITT').replace(/[^\x20-\x7E]/g, '');
  let checksum = 104; // Start Code B
  let bits = CODE128_PATTERNS[104];

  for (let i = 0; i < clean.length; i++) {
    const val = clean.charCodeAt(i) - 32;
    const safeVal = val >= 0 && val <= 94 ? val : 0;
    checksum += safeVal * (i + 1);
    bits += CODE128_PATTERNS[safeVal];
  }

  const checkIndex = checksum % 103;
  bits += CODE128_PATTERNS[checkIndex];
  bits += CODE128_PATTERNS[106]; // Stop pattern (13 modules)

  const quietZone = 10;
  const totalModules = bits.length + quietZone * 2;
  let rects = '';
  let i = 0;
  while (i < bits.length) {
    if (bits[i] === '1') {
      let run = 1;
      while (i + run < bits.length && bits[i + run] === '1') {
        run++;
      }
      rects += `<rect x="${quietZone + i}" y="0" width="${run}" height="100" fill="#000000" />`;
      i += run;
    } else {
      i++;
    }
  }

  return `<svg viewBox="0 0 ${totalModules} 100" preserveAspectRatio="none" style="width:${widthMm};height:${heightMm};display:block;background:#ffffff;" aria-label="Code128 ${escapeHtml(clean)}">${rects}</svg>`;
}

/**
 * تنسيق التاريخ بصيغة dd/mm/yyyy
 */
function formatDateDDMMYYYY(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '--/--/----';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '--/--/----';
  }
}

/**
 * تنسيق الوقت بصيغة HH:MM
 */
function formatTimeHHMM(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return '--:--';
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return '--:--';
  }
}

/**
 * اختصار اسم المحطة لعرض مسار واضح ومقروء في سطر المسار
 */
function formatStationLabel(name?: string): string {
  if (!name) return '—';
  return (
    name
      .replace(/^محطة\s+/, '')
      .replace(/\s+(الرئيسية|الدولية|المركزية).*$/, '')
      .trim() || name
  );
}

/**
 * الهروب الآمن للنصوص داخل HTML المستقل
 */
function escapeHtml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * حساب حجم الخط المناسب للاسم الطويل (يلتف حتى سطرين كحد أقصى ولا يقل عن 9pt أبداً)
 */
function getNameFontSizePt(name: string): string {
  const len = (name || '').trim().length;
  if (len > 32) return '9pt';
  if (len > 20) return '9.5pt';
  return '10.5pt';
}

/**
 * تطبيع مفتاح المرسل لمقارنة وتحديد جميع كوليات نفس المرسل بدقة
 */
export function getSenderKey(parcel: Pick<Parcel, 'sender_phone' | 'sender_name'>): string {
  const cleanPhone = (parcel.sender_phone || '').replace(/\s+/g, '').trim();
  const cleanName = (parcel.sender_name || '').trim().toLowerCase();
  return cleanPhone || cleanName;
}

/**
 * بناء كود HTML الداخلي للملصق الحراري المقسوم إلى 3 أجزاء باللونين الأسود والأبيض فقط
 */
function buildSingleStickerHtml(
  parcel: Parcel,
  qrCodeDataUrl: string,
  options: StickerPrintOptions,
  dimensionsMm: { widthMm: number; heightMm: number },
  branding: StickerBrandingConfig
): string {
  const remaining = Math.max(0, Math.round((parcel.amount_due - parcel.amount_paid) * 100) / 100);
  const isSettled = remaining <= 0 || parcel.payment_status === 'paid';
  const paymentStatusText = isSettled ? 'الأداء: خالص' : 'الأداء: غير خالص';

  const dateFormatted = formatDateDDMMYYYY(parcel.created_at);
  const timeFormatted = formatTimeHHMM(parcel.created_at);
  const numericCode = formatTrackingCodeNumeric(parcel.tracking_code, parcel.parcel_number);

  const originStationText = formatStationLabel(parcel.origin_station_name);
  const destStationText = formatStationLabel(parcel.destination_station_name);
  const routeLineText = `من ${originStationText} إلى ${destStationText}`;

  const senderFontSize = getNameFontSizePt(parcel.sender_name);
  const receiverFontSize = getNameFontSizePt(parcel.receiver_name);

  // بناء منطقة الكود في النصف الأيسر العلوي حسب الاختيار (QR فقط / Code128 فقط / QR + Code128)
  let codeAreaHtml = '';
  if (options.codeType === 'qr') {
    const qrImg = qrCodeDataUrl
      ? `<img src="${qrCodeDataUrl}" alt="${escapeHtml(numericCode)}" style="width:31mm;height:31mm;min-width:31mm;min-height:31mm;object-fit:contain;image-rendering:pixelated;display:block;" />`
      : `<div style="width:31mm;height:31mm;border:1px solid #000000;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;">QR</div>`;
    codeAreaHtml = `
      ${qrImg}
      <div dir="ltr" style="font-size:9.5pt;line-height:1.1;font-family:monospace;font-weight:900;color:#000000;margin-top:0.8mm;text-align:center;white-space:nowrap;">
        ${escapeHtml(numericCode)}
      </div>
    `;
  } else if (options.codeType === 'code128') {
    const barcodeSvg = generateCode128SvgMarkup(numericCode, '43mm', '20mm');
    codeAreaHtml = `
      <div style="padding:1mm 0;display:flex;flex-direction:column;align-items:center;justify-content:center;">
        ${barcodeSvg}
      </div>
      <div dir="ltr" style="font-size:9pt;line-height:1.15;font-family:monospace;font-weight:900;color:#000000;margin-top:1mm;text-align:center;white-space:nowrap;">
        ${escapeHtml(numericCode)}
      </div>
    `;
  } else {
    // QR + Code128 معاً
    const qrImg = qrCodeDataUrl
      ? `<img src="${qrCodeDataUrl}" alt="${escapeHtml(numericCode)}" style="width:20mm;height:20mm;object-fit:contain;image-rendering:pixelated;display:block;" />`
      : `<div style="width:20mm;height:20mm;border:1px solid #000000;display:flex;align-items:center;justify-content:center;font-size:9pt;font-weight:700;">QR</div>`;
    const barcodeSvg = generateCode128SvgMarkup(numericCode, '42mm', '8.5mm');
    codeAreaHtml = `
      <div style="display:flex;flex-direction:column;align-items:center;gap:1mm;">
        ${qrImg}
        ${barcodeSvg}
      </div>
      <div dir="ltr" style="font-size:9pt;line-height:1.05;font-family:monospace;font-weight:900;color:#000000;margin-top:0.6mm;text-align:center;white-space:nowrap;">
        ${escapeHtml(numericCode)}
      </div>
    `;
  }

  const showMiddlePart =
    options.showSenderInfo !== false ||
    options.showReceiverInfo !== false ||
    options.showPaymentStatus !== false ||
    options.showRouteLine !== false;

  const part1Height = !showMiddlePart && !options.showStampBox
    ? '100%'
    : options.showStampBox
    ? '44%'
    : '50%';
  const part2Height = options.showStampBox ? '40%' : '50%';

  const logoSrc = branding.logoUrl?.trim() || '/assets/aistudio/image_9c11f636.png';
  const agencyName = branding.agencyName?.trim() || 'Sahara📦 Express';
  const agencyPhone = branding.agencyPhone?.trim() || '';

  return `
    <div class="parcel-sticker-box" dir="rtl" style="width:${dimensionsMm.widthMm}mm;height:${dimensionsMm.heightMm}mm;min-width:${dimensionsMm.widthMm}mm;min-height:${dimensionsMm.heightMm}mm;max-width:${dimensionsMm.widthMm}mm;max-height:${dimensionsMm.heightMm}mm;padding:2.5mm;box-sizing:border-box;background-color:#ffffff;color:#000000;font-family:'Cairo','Tajawal','Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;text-align:right;display:flex;flex-direction:column;justify-content:space-between;border:1px solid #000000;overflow:hidden;page-break-inside:avoid;break-inside:avoid;">
      
      <!-- PART 1 (Top): Split in two halves by a thin vertical line -->
      <div style="height:${part1Height};width:100%;display:flex;flex-direction:row;${showMiddlePart ? 'border-bottom:1px solid #000000;padding-bottom:1.5mm;' : ''}box-sizing:border-box;">
        
        <!-- Top-Right Half: Circular Logo + Agency Name & Phone + 3 short lines (Parcel #, Date, Time) -->
        <div style="width:50%;height:100%;padding-left:2mm;border-left:1px solid #000000;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;">
          ${
            options.showStationBranding !== false
              ? `<div style="width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4mm;">
                  ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(agencyName)}" style="width:42px;height:42px;border-radius:50% !important;object-fit:cover;background:transparent !important;display:block;" />` : ''}
                  <div style="font-size:8.5pt;font-weight:900;line-height:1.1;text-align:center;color:#000000;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    ${escapeHtml(agencyName)}
                  </div>
                  ${
                    agencyPhone
                      ? `<div dir="ltr" style="font-size:7pt;font-weight:800;font-family:monospace;line-height:1.1;text-align:center;color:#000000;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          ${escapeHtml(agencyPhone)}
                        </div>`
                      : ''
                  }
                </div>`
              : `<div></div>`
          }

          <div style="display:flex;flex-direction:column;gap:0.6mm;font-size:8.5pt;line-height:1.15;font-weight:700;color:#000000;">
            <div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              <span>الكود: </span>
              <span dir="ltr" style="font-family:monospace;font-weight:900;">${escapeHtml(numericCode)} (#${escapeHtml(String(parcel.parcel_number))})</span>
            </div>
            ${
              options.showDateTime
                ? `
            <div style="white-space:nowrap;">
              <span dir="ltr" style="font-family:monospace;font-weight:800;">${escapeHtml(dateFormatted)} . ${escapeHtml(timeFormatted)}</span>
            </div>`
                : ''
            }
          </div>
        </div>

        <!-- Top-Left Half: Code (QR / Code128 / Both) centered + parcel number under it -->
        <div style="width:50%;height:100%;padding-right:2mm;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;">
          ${codeAreaHtml}
        </div>
      </div>

      ${
        showMiddlePart
          ? `<!-- PART 2 (Middle): Two columns (Right: Sender, Left: Receiver) -->
      <div style="height:${part2Height};width:100%;display:flex;flex-direction:row;padding-top:1.5mm;padding-bottom:1.5mm;box-sizing:border-box;">
        
        <!-- Right Column (RTL): المرسل + Sender Name + Sender Phone + Payment Status -->
        <div style="width:50%;height:100%;padding-left:2mm;border-left:1px solid #000000;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;">
          ${
            options.showSenderInfo !== false
              ? `<div style="display:flex;flex-direction:column;gap:0.8mm;">
                  <div style="font-size:10pt;font-weight:900;line-height:1.15;text-decoration:underline;">المرسل</div>
                  <div style="font-size:${senderFontSize};font-weight:800;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;">
                    ${escapeHtml(parcel.sender_name)}
                  </div>
                  <div dir="ltr" style="font-size:9.5pt;font-weight:800;font-family:monospace;line-height:1.15;text-align:right;">
                    ${escapeHtml(parcel.sender_phone)}
                  </div>
                </div>`
              : `<div></div>`
          }

          ${
            options.showPaymentStatus !== false
              ? `<div style="width:100%;border:1.5px solid #000000;padding:1mm 1.5mm;text-align:center;font-size:10.5pt;font-weight:900;line-height:1.15;background-color:#ffffff;color:#000000;box-sizing:border-box;white-space:nowrap;">
                  ${escapeHtml(paymentStatusText)}
                </div>`
              : `<div></div>`
          }
        </div>

        <!-- Left Column (RTL): المستلم + Receiver Name + Receiver Phone + Route Line at bottom -->
        <div style="width:50%;height:100%;padding-right:2mm;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;">
          ${
            options.showReceiverInfo !== false
              ? `<div style="display:flex;flex-direction:column;gap:0.8mm;">
                  <div style="font-size:10pt;font-weight:900;line-height:1.15;text-decoration:underline;">المستلم</div>
                  <div style="font-size:${receiverFontSize};font-weight:800;line-height:1.2;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;">
                    ${escapeHtml(parcel.receiver_name)}
                  </div>
                  <div dir="ltr" style="font-size:9.5pt;font-weight:800;font-family:monospace;line-height:1.15;text-align:right;">
                    ${escapeHtml(parcel.receiver_phone)}
                  </div>
                </div>`
              : `<div></div>`
          }

          ${
            options.showRouteLine
              ? `<div style="width:100%;border-top:1px solid #000000;padding-top:1mm;font-size:9pt;font-weight:800;line-height:1.15;color:#000000;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                  ${escapeHtml(routeLineText)}
                </div>`
              : `<div></div>`
          }
        </div>
      </div>`
          : ''
      }

      ${
        options.showStampBox
          ? `<!-- PART 3 (Bottom, ~15-18% of height): Empty rectangular box for stamp or handwritten note -->
      <div style="height:16%;width:100%;padding-top:0.5mm;box-sizing:border-box;">
        <div style="width:100%;height:100%;border:1px solid #000000;background-color:#ffffff;box-sizing:border-box;"></div>
      </div>`
          : ''
      }

    </div>
  `;
}

/**
 * بناء وثيقة HTML كاملة لدفعة الملصقات (ملصق واحد أو 100+ ملصق في مهمة طباعة واحدة)
 * تدعم:
 * - 100×100 مم (كل ملصق في صفحة مستقلة مع page-break-after: always)
 * - A4 (4 ملصقات في كل صفحة A4 بتخطيط 2×2)
 * - مقاس مخصص بالمليمتر (كل ملصق في صفحة مستقلة)
 */
function buildBatchStickersDocument(
  expandedStickers: Parcel[],
  qrMap: Record<string, string>,
  options: StickerPrintOptions,
  docConfig: { showNewTabToolbar: boolean; autoPrintOnLoad: boolean },
  branding: StickerBrandingConfig
): string {
  const totalCount = expandedStickers.length;
  const isA4 = options.paperFormat === 'a4_4up';
  const stickerWidthMm =
    options.paperFormat === 'custom' ? options.customWidthMm : 100;
  const stickerHeightMm =
    options.paperFormat === 'custom' ? options.customHeightMm : 100;

  const pageSizeCss = isA4
    ? `size: A4 portrait; margin: 0;`
    : `size: ${stickerWidthMm}mm ${stickerHeightMm}mm; margin: 0;`;

  let pagesHtml = '';

  if (isA4) {
    // تجميع كل 4 ملصقات في صفحة A4 واحدة (2×2)
    for (let i = 0; i < expandedStickers.length; i += 4) {
      const chunk = expandedStickers.slice(i, i + 4);
      const isLastSheet = i + 4 >= expandedStickers.length;
      const itemsHtml = chunk
        .map(p =>
          buildSingleStickerHtml(
            p,
            qrMap[p.tracking_code] || '',
            options,
            {
              widthMm: 98,
              heightMm: 138,
            },
            branding
          )
        )
        .join('');
      pagesHtml += `
        <div class="a4-sheet${isLastSheet ? ' last-page' : ''}">
          ${itemsHtml}
        </div>
      `;
    }
  } else {
    // كل ملصق في صفحة مستقلة (100×100 مم أو مقاس مخصص)
    pagesHtml = expandedStickers
      .map((p, idx) => {
        const isLast = idx === expandedStickers.length - 1;
        const inner = buildSingleStickerHtml(
          p,
          qrMap[p.tracking_code] || '',
          options,
          {
            widthMm: stickerWidthMm,
            heightMm: stickerHeightMm,
          },
          branding
        );
        return `<div class="sticker-page${isLast ? ' last-page' : ''}">${inner}</div>`;
      })
      .join('');
  }

  const toolbarHtml = docConfig.showNewTabToolbar
    ? `
      <div class="no-print" style="position:sticky;top:0;z-index:100;width:100%;max-width:680px;margin:12px auto;padding:12px 18px;background:#0f172a;color:#f8fafc;border-radius:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:'Cairo','Tajawal',sans-serif;box-sizing:border-box;box-shadow:0 10px 25px rgba(0,0,0,0.3);border:1px solid rgba(245,158,11,0.35);">
        <div>
          <div style="font-size:14px;font-weight:900;">جاهز للطباعة: ${totalCount} ملصق</div>
          <div style="font-size:11px;color:#94a3b8;">اضغط على زر الطباعة أو اختصار Ctrl+P (اختر Save as PDF للحفظ كملف)</div>
        </div>
        <button onclick="window.print()" style="background:#f59e0b;color:#0f172a;border:none;border-radius:12px;padding:9px 20px;font-family:inherit;font-size:13px;font-weight:900;cursor:pointer;white-space:nowrap;">
          طباعة الكل الآن (${totalCount})
        </button>
      </div>
    `
    : '';

  const autoPrintScript = docConfig.autoPrintOnLoad
    ? `
      <script>
        window.addEventListener('load', function() {
          setTimeout(function() {
            try { window.focus(); window.print(); } catch (e) {}
          }, 220);
        });
      </script>
    `
    : '';

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>طباعة الملصقات (${totalCount} ملصق)</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    @page {
      ${pageSizeCss}
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: ${docConfig.showNewTabToolbar ? '#e2e8f0' : '#ffffff'};
      color: #000000;
      font-family: 'Cairo', 'Tajawal', 'Segoe UI', Tahoma, Arial, sans-serif;
      direction: rtl;
    }
    .batch-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: ${docConfig.showNewTabToolbar ? '14px' : '0'};
      padding: ${docConfig.showNewTabToolbar ? '8px 0 32px 0' : '0'};
    }
    .sticker-page {
      width: ${stickerWidthMm}mm;
      height: ${stickerHeightMm}mm;
      margin: 0;
      padding: 0;
      background: #ffffff;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      overflow: hidden;
    }
    .sticker-page.last-page {
      page-break-after: auto;
      break-after: auto;
    }
    .a4-sheet {
      width: 210mm;
      height: 297mm;
      padding: 6mm;
      background: #ffffff;
      display: grid;
      grid-template-columns: repeat(2, 98mm);
      grid-template-rows: repeat(2, 138mm);
      gap: 2mm;
      justify-content: center;
      align-content: center;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
      box-sizing: border-box;
    }
    .a4-sheet.last-page {
      page-break-after: auto;
      break-after: auto;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
      }
      .no-print {
        display: none !important;
      }
      .batch-container {
        display: block !important;
        padding: 0 !important;
        margin: 0 !important;
      }
    }
  </style>
</head>
<body>
  ${toolbarHtml}
  <div class="batch-container">
    ${pagesHtml}
  </div>
  ${autoPrintScript}
</body>
</html>`;
}

/**
 * في حال تم فتح التطبيق في تبويب جديد لطباعة دفعة الملصقات (?standalone_sticker_batch=1)،
 * نقرأ وثيقة الدفعة الجاهزة من localStorage ونعرضها فوراً للطباعة بضغطة واحدة أو Ctrl+P.
 */
if (typeof window !== 'undefined') {
  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.get('standalone_sticker_batch') === '1') {
    const savedBatchHtml = localStorage.getItem(BATCH_PRINT_STORAGE_KEY);
    if (savedBatchHtml) {
      document.open();
      document.write(savedBatchHtml);
      document.close();
    }
  }
}

export const ParcelStickerModal: React.FC<ParcelStickerModalProps> = ({
  parcel,
  initialSelectedParcels,
  isOpen,
  onClose,
}) => {
  const { parcels: allWorkspaceParcels, currentWorkspace, currentUser } = useApp();

  const isPack1Basic99 = Boolean(
    currentWorkspace?.plan_tier === 'plan_2_two_stations' ||
      currentWorkspace?.max_stations === 2 ||
      currentWorkspace?.max_workers_per_station === 1
  );

  // خيارات الطباعة المحفوظة بين الجلسات
  const [options, setOptions] = useState<StickerPrintOptions>(() => loadSavedStickerOptions());

  // هوية الملصق المخصصة (الاسم، الهاتف، الشعار)
  const [branding, setBranding] = useState<StickerBrandingConfig>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('alittihadia_sticker_branding_v1') || '{}');
      const fallbackName =
        !currentWorkspace?.name || currentWorkspace.name === 'محطة الاتحادية'
          ? 'Sahara📦 Express'
          : currentWorkspace.name;
      return {
        agencyName: raw.agencyName || fallbackName,
        agencyPhone: raw.agencyPhone || currentUser?.phone || '',
        logoUrl: raw.logoUrl || '',
      };
    } catch {
      return {
        agencyName: 'Sahara📦 Express',
        agencyPhone: currentUser?.phone || '',
        logoUrl: '',
      };
    }
  });

  const effectiveBranding: StickerBrandingConfig = useMemo(
    () =>
      isPack1Basic99
        ? {
            agencyName: 'Sahara📦 Express',
            agencyPhone: branding.agencyPhone || currentUser?.phone || '',
            logoUrl: '/assets/aistudio/image_9c11f636.png',
          }
        : {
            agencyName:
              !branding.agencyName || branding.agencyName === 'محطة الاتحادية'
                ? 'Sahara📦 Express'
                : branding.agencyName,
            agencyPhone: branding.agencyPhone || currentUser?.phone || '',
            logoUrl: branding.logoUrl || '/assets/aistudio/image_9c11f636.png',
          },
    [isPack1Basic99, branding, currentWorkspace?.name, currentUser?.phone]
  );

  useEffect(() => {
    const syncBranding = () => {
      try {
        const raw = JSON.parse(localStorage.getItem('alittihadia_sticker_branding_v1') || '{}');
        const fallbackName =
          !currentWorkspace?.name || currentWorkspace.name === 'محطة الاتحادية'
            ? 'Sahara📦 Express'
            : currentWorkspace.name;
        setBranding({
          agencyName: raw.agencyName || fallbackName,
          agencyPhone: raw.agencyPhone || currentUser?.phone || '',
          logoUrl: raw.logoUrl || '',
        });
      } catch {}
    };
    syncBranding();
    window.addEventListener('sticker-branding-updated', syncBranding);
    return () => window.removeEventListener('sticker-branding-updated', syncBranding);
  }, [isOpen, currentWorkspace?.name, currentUser?.phone]);

  // حفظ الخيارات تلقائياً في localStorage عند أي تغيير
  useEffect(() => {
    try {
      localStorage.setItem(STICKER_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    } catch {}
  }, [options]);

  // حفظ هوية المحطة المخصصة تلقائياً عند التعديل من داخل نافذة الطابعة
  const updateBrandingField = (field: keyof StickerBrandingConfig, value: string) => {
    if (isPack1Basic99 && (field === 'agencyName' || field === 'logoUrl')) {
      return;
    }
    const next = { ...branding, [field]: value };
    setBranding(next);
    try {
      localStorage.setItem('alittihadia_sticker_branding_v1', JSON.stringify(next));
      setTimeout(() => {
        window.dispatchEvent(new Event('sticker-branding-updated'));
      }, 0);
    } catch {}
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isPack1Basic99) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        updateBrandingField('logoUrl', reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // قائمة الكوليات المتاحة للاختيار (مرتبة بالأحدث)
  const availableParcels = useMemo(() => {
    const list = [...allWorkspaceParcels];
    if (parcel && !list.some(p => p.id === parcel.id)) {
      list.unshift(parcel);
    }
    return list;
  }, [allWorkspaceParcels, parcel]);

  // حالة البحث، التحديد، وعدد النسخ لكل كولي
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copiesPerParcel, setCopiesPerParcel] = useState<number>(1);
  const [referenceSenderParcel, setReferenceSenderParcel] = useState<Parcel | null>(null);
  const [showBrandingEditor, setShowBrandingEditor] = useState<boolean>(false);

  // خريطة رموز QR المولّدة لكل كود تتبع فريد
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  // حالات تجهيز الطباعة، التأكيد، التقدم، وتنبيه الـ Sandbox
  const [showConfirmBanner, setShowConfirmBanner] = useState<boolean>(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState<boolean>(false);
  const [prepareProgress, setPrepareProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [printBlockedNotice, setPrintBlockedNotice] = useState<boolean>(false);
  const [batchPrintReadyUrl, setBatchPrintReadyUrl] = useState<string>('');

  const hiddenIframeRef = useRef<HTMLIFrameElement | null>(null);

  // تهيئة الاختيار عند فتح النافذة
  useEffect(() => {
    if (!isOpen) {
      setShowConfirmBanner(false);
      setIsPreparingPrint(false);
      setPrintBlockedNotice(false);
      return;
    }

    setSearchQuery('');
    setCopiesPerParcel(1);
    setShowConfirmBanner(false);
    setIsPreparingPrint(false);
    setPrintBlockedNotice(false);

    if (initialSelectedParcels && initialSelectedParcels.length > 0) {
      setSelectedIds(new Set(initialSelectedParcels.map(p => p.id)));
      setReferenceSenderParcel(initialSelectedParcels[0]);
    } else if (parcel) {
      setSelectedIds(new Set([parcel.id]));
      setReferenceSenderParcel(parcel);
    } else if (availableParcels.length > 0) {
      setSelectedIds(new Set([availableParcels[0].id]));
      setReferenceSenderParcel(availableParcels[0]);
    } else {
      setSelectedIds(new Set());
      setReferenceSenderParcel(null);
    }
  }, [isOpen, parcel?.id, initialSelectedParcels]);

  // الكوليات المطابقة للبحث في لوحة الاختيار
  const filteredParcels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase().replace(/^#/, '');
    if (!q) return availableParcels;
    return availableParcels.filter(
      p =>
        String(p.parcel_number).includes(q) ||
        p.tracking_code.toLowerCase().includes(q) ||
        (p.sender_name || '').toLowerCase().includes(q) ||
        (p.sender_phone || '').toLowerCase().includes(q) ||
        (p.receiver_name || '').toLowerCase().includes(q) ||
        (p.receiver_phone || '').toLowerCase().includes(q)
    );
  }, [availableParcels, searchQuery]);

  // الكوليات المحددة حالياً
  const selectedParcels = useMemo(() => {
    return availableParcels.filter(p => selectedIds.has(p.id));
  }, [availableParcels, selectedIds]);

  // المرسل المرجعي لزر "جميع كوليات هذا المرسل"
  const activeSenderSource = useMemo(() => {
    if (referenceSenderParcel) return referenceSenderParcel;
    if (selectedParcels.length > 0) return selectedParcels[0];
    if (parcel) return parcel;
    return availableParcels[0] || null;
  }, [referenceSenderParcel, selectedParcels, parcel, availableParcels]);

  // جميع كوليات نفس المرسل المرجعي
  const sameSenderParcels = useMemo(() => {
    if (!activeSenderSource) return [];
    const targetKey = getSenderKey(activeSenderSource);
    const targetName = (activeSenderSource.sender_name || '').trim().toLowerCase();
    return availableParcels.filter(
      p =>
        getSenderKey(p) === targetKey ||
        (targetName && (p.sender_name || '').trim().toLowerCase() === targetName)
    );
  }, [availableParcels, activeSenderSource]);

  // توليد رموز QR للكوليات المحددة لأغراض المعاينة الحية
  useEffect(() => {
    if (!isOpen || selectedParcels.length === 0) return;
    let cancelled = false;

    const missingParcels = selectedParcels.filter(p => !qrMap[p.tracking_code]);
    if (missingParcels.length === 0) return;

    (async () => {
      const newEntries: Record<string, string> = {};
      for (const p of missingParcels) {
        if (cancelled) return;
        try {
          const numCode = formatTrackingCodeNumeric(p.tracking_code, p.parcel_number);
          const url = await QRCode.toDataURL(numCode, {
            width: 260,
            margin: 0,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
          newEntries[p.tracking_code] = url;
        } catch {}
      }
      if (!cancelled && Object.keys(newEntries).length > 0) {
        setQrMap(prev => ({ ...prev, ...newEntries }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedParcels]);

  // قائمة الملصقات النهائية الموسعة بعد ضرب كل كولي محدد في عدد النسخ (copiesPerParcel)
  const expandedStickers = useMemo(() => {
    const result: Parcel[] = [];
    const copies = Math.max(1, Math.min(200, copiesPerParcel));
    for (const p of selectedParcels) {
      for (let c = 0; c < copies; c++) {
        result.push(p);
      }
    }
    return result;
  }, [selectedParcels, copiesPerParcel]);

  const totalStickersCount = expandedStickers.length;

  // تحديث وثيقة التبويب المستقل في localStorage كلما تغيرت الاختيارات أو الإعدادات
  useEffect(() => {
    if (!isOpen || expandedStickers.length === 0) {
      setBatchPrintReadyUrl('');
      return;
    }
    try {
      const fullHtml = buildBatchStickersDocument(
        expandedStickers,
        qrMap,
        options,
        {
          showNewTabToolbar: true,
          autoPrintOnLoad: true,
        },
        effectiveBranding
      );
      localStorage.setItem(BATCH_PRINT_STORAGE_KEY, fullHtml);
      setBatchPrintReadyUrl(
        `${window.location.origin}${window.location.pathname}?standalone_sticker_batch=1&t=${Date.now()}`
      );
    } catch {}
  }, [isOpen, expandedStickers, qrMap, options, effectiveBranding]);

  if (!isOpen) return null;

  // تبديل تحديد كولي واحد
  const toggleParcelSelection = (p: Parcel) => {
    setReferenceSenderParcel(p);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
      } else {
        next.add(p.id);
      }
      return next;
    });
  };

  // تحديد / إلغاء تحديد الكل (للكوليات المعروضة في البحث)
  const allFilteredSelected =
    filteredParcels.length > 0 && filteredParcels.every(p => selectedIds.has(p.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredParcels.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredParcels.forEach(p => next.add(p.id));
        return next;
      });
    }
  };

  // زر "جميع كوليات هذا المرسل"
  const handleSelectAllOfSender = (targetParcel?: Parcel) => {
    const base = targetParcel || activeSenderSource;
    if (!base) return;
    setReferenceSenderParcel(base);
    const targetKey = getSenderKey(base);
    const targetName = (base.sender_name || '').trim().toLowerCase();

    const matching = availableParcels.filter(
      p =>
        getSenderKey(p) === targetKey ||
        (targetName && (p.sender_name || '').trim().toLowerCase() === targetName)
    );

    setSelectedIds(new Set(matching.map(p => p.id)));
  };

  /**
   * تجهيز وطباعة جميع الملصقات دفعة واحدة (يدعم 100+ ملصق بدون تجميد الواجهة)
   */
  const executeBatchPrintJob = async () => {
    if (expandedStickers.length === 0) return;

    setShowConfirmBanner(false);
    setPrintBlockedNotice(false);
    setIsPreparingPrint(true);
    const total = expandedStickers.length;
    setPrepareProgress({ current: 0, total });

    try {
      const nextQrMap: Record<string, string> = { ...qrMap };
      for (let i = 0; i < expandedStickers.length; i++) {
        const p = expandedStickers[i];
        if (!nextQrMap[p.tracking_code]) {
          const numCode = formatTrackingCodeNumeric(p.tracking_code, p.parcel_number);
          nextQrMap[p.tracking_code] = await QRCode.toDataURL(numCode, {
            width: 260,
            margin: 0,
            color: { dark: '#000000', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
        }
        if ((i + 1) % 8 === 0 || i === expandedStickers.length - 1) {
          setPrepareProgress({ current: i + 1, total });
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      setQrMap(nextQrMap);

      const printDocHtml = buildBatchStickersDocument(
        expandedStickers,
        nextQrMap,
        options,
        {
          showNewTabToolbar: false,
          autoPrintOnLoad: false,
        },
        effectiveBranding
      );

      const newTabHtml = buildBatchStickersDocument(
        expandedStickers,
        nextQrMap,
        options,
        {
          showNewTabToolbar: true,
          autoPrintOnLoad: true,
        },
        effectiveBranding
      );
      try {
        localStorage.setItem(BATCH_PRINT_STORAGE_KEY, newTabHtml);
        setBatchPrintReadyUrl(
          `${window.location.origin}${window.location.pathname}?standalone_sticker_batch=1&t=${Date.now()}`
        );
      } catch {}

      const iframe = hiddenIframeRef.current;
      if (iframe) {
        await new Promise<void>(resolve => {
          const onLoad = () => {
            iframe.removeEventListener('load', onLoad);
            resolve();
          };
          iframe.addEventListener('load', onLoad);
          iframe.srcdoc = printDocHtml;
        });
      }

      setIsPreparingPrint(false);

      let dialogOpened = false;
      const markDialogOpened = () => {
        dialogOpened = true;
      };
      window.addEventListener('beforeprint', markDialogOpened, { once: true });

      try {
        const iframeWin = hiddenIframeRef.current?.contentWindow;
        if (iframeWin) {
          iframeWin.addEventListener('beforeprint', markDialogOpened, { once: true });
          iframeWin.focus();
          iframeWin.print();
        } else {
          window.print();
        }
      } catch {
        setPrintBlockedNotice(true);
      }

      setTimeout(() => {
        window.removeEventListener('beforeprint', markDialogOpened);
        if (!dialogOpened) {
          setPrintBlockedNotice(true);
        }
      }, 260);
    } catch {
      setIsPreparingPrint(false);
      setPrintBlockedNotice(true);
    }
  };

  const handlePrintButtonClick = () => {
    if (totalStickersCount === 0) return;
    if (totalStickersCount > 1 && !showConfirmBanner) {
      setShowConfirmBanner(true);
      return;
    }
    executeBatchPrintJob();
  };

  const previewDimensions = {
    widthMm: options.paperFormat === 'custom' ? options.customWidthMm : 100,
    heightMm: options.paperFormat === 'custom' ? options.customHeightMm : 100,
  };

  const isMinimalMode =
    !options.showStationBranding &&
    !options.showSenderInfo &&
    !options.showReceiverInfo &&
    !options.showPaymentStatus &&
    !options.showDateTime &&
    !options.showRouteLine &&
    !options.showStampBox;

  const isFullMode =
    options.showStationBranding &&
    options.showSenderInfo &&
    options.showReceiverInfo &&
    options.showPaymentStatus &&
    options.showDateTime &&
    options.showRouteLine &&
    options.showStampBox;

  const modalContent = (
    <div
      id="parcel-sticker-portal-root"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-2.5 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-fadeIn"
      dir="rtl"
    >
      {/* الإطار المخفي المخصص لطباعة دفعة الملصقات بالكامل */}
      <iframe
        ref={hiddenIframeRef}
        title="إطار طباعة الملصقات"
        style={{
          position: 'fixed',
          right: 0,
          bottom: 0,
          width: '0px',
          height: '0px',
          border: 'none',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      />

      {/* خلفية الإغلاق */}
      <div className="fixed inset-0 sticker-screen-only print:hidden" onClick={onClose} />

      {/* نافذة الطابعة الحرارية بتصميم التطبيق الفاخر (.luxury-card) ومتوافقة 100% مع شاشة الهاتف */}
      <div
        id="parcel-sticker-dialog-card"
        className="relative z-10 w-full max-w-[435px] max-h-[93vh] luxury-card rounded-[28px] shadow-2xl text-right flex flex-col overflow-hidden border border-[#F5C84C]/45"
        onClick={e => e.stopPropagation()}
      >
        {/* الرأس العلوي */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/15 bg-black/55 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#F5C84C]/20 text-[#F5C84C] flex items-center justify-center font-bold border border-[#F5C84C]/40 shrink-0">
              <Printer className="w-5 h-5 text-[#F5C84C]" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-black text-white truncate">طباعة الملصقات الحرارية</h3>
              <p className="text-[10px] text-white/75 truncate">
                معاينة حية وتحكم كامل في المقاس والباركود والمحتوى
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="gold-pill px-2.5 py-1 text-[11px] font-black">
              {totalStickersCount} ملصق
            </span>
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel p-2 rounded-xl transition"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* الجسم الرئيسي القابل للتمرير بنسق التطبيق المحمول */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
          {/* ================================================================= */}
          {/* 1. المعاينة الحية للملصق الحراري (أسود على أبيض واضح 100%)        */}
          {/* ================================================================= */}
          <div className="bg-black/60 border border-[#F5C84C]/35 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
              <div className="flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-[#F5C84C]" />
                <span className="text-xs font-black text-white">
                  المعاينة الحية ({totalStickersCount} ملصق)
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#F5C84C] bg-[#F5C84C]/15 px-2 py-0.5 rounded-lg border border-[#F5C84C]/30">
                {options.paperFormat === '100x100'
                  ? '100×100 مم'
                  : options.paperFormat === 'a4_4up'
                  ? 'A4 (4 ملصقات)'
                  : `${options.customWidthMm}×${options.customHeightMm} مم`}
              </span>
            </div>

            {expandedStickers.length === 0 ? (
              <div className="py-8 text-center space-y-1.5 text-white/70">
                <Printer className="w-8 h-8 text-[#F5C84C]/60 mx-auto" />
                <p className="text-xs font-black text-white">لم يتم تحديد أي كولي للطباعة</p>
                <p className="text-[10px] text-white/70">
                  اختر كولياً واحداً أو أكثر من قسم التحديد بالأسفل
                </p>
              </div>
            ) : (
              <div className="max-h-[340px] overflow-y-auto space-y-3 py-1">
                {expandedStickers.slice(0, 20).map((item, idx) => (
                  <div key={`${item.id}-copy-${idx}`} className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-mono text-[#F5C84C] font-bold">
                      ملصق {idx + 1} من {totalStickersCount} — كولي #{item.parcel_number}
                    </span>
                    <div
                      className="shadow-2xl max-w-full overflow-x-auto flex justify-center"
                      dangerouslySetInnerHTML={{
                        __html: buildSingleStickerHtml(
                          item,
                          qrMap[item.tracking_code] || '',
                          options,
                          previewDimensions,
                          effectiveBranding
                        ),
                      }}
                    />
                  </div>
                ))}
                {expandedStickers.length > 20 && (
                  <div className="text-center py-2 px-3 text-[11px] text-[#F5C84C] bg-[#F5C84C]/15 rounded-xl border border-[#F5C84C]/30 font-bold">
                    يتم عرض أول 20 ملصقاً في المعاينة — عند الضغط على «طباعة الآن» سيتم طباعة جميع الـ {totalStickersCount} ملصق بالكامل.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ================================================================= */}
          {/* 2. قسم تحديد الكوليات + جميع كوليات هذا المرسل                    */}
          {/* ================================================================= */}
          <div className="bg-black/55 border border-white/15 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-black text-[#F5C84C] flex items-center gap-1.5">
                <CheckSquare className="w-4 h-4" />
                <span>
                  1. تحديد الكوليات ({selectedParcels.length} من {availableParcels.length})
                </span>
              </span>

              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="btn-cancel text-[11px] font-black px-2.5 py-1 rounded-xl transition"
              >
                {allFilteredSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
              </button>
            </div>

            {/* زر سريع: جميع كوليات هذا المرسل */}
            {activeSenderSource && (
              <button
                type="button"
                onClick={() => handleSelectAllOfSender(activeSenderSource)}
                className="btn-gold w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-black transition"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Users className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    جميع كوليات هذا المرسل ({activeSenderSource.sender_name})
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-lg bg-black/20 text-[#111111] font-black text-[11px] shrink-0">
                  {sameSenderParcels.length} كوليات
                </span>
              </button>
            )}

            {/* مربع البحث */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث برقم الكولي، اسم المرسل/المستلم، أو الهاتف..."
                className="w-full bg-black/60 border border-white/20 focus:border-[#F5C84C] rounded-xl px-3 py-2 pr-3 pl-8 text-xs text-white placeholder-white/60 focus:outline-none"
              />
              <Search className="w-3.5 h-3.5 text-white/70 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>

            {/* قائمة الكوليات */}
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
              {filteredParcels.length === 0 ? (
                <p className="text-[11px] text-white/60 text-center py-3">
                  لا توجد كوليات مطابقة للبحث
                </p>
              ) : (
                filteredParcels.map(p => {
                  const isChecked = selectedIds.has(p.id);
                  const senderKey = getSenderKey(p);
                  const senderCount = availableParcels.filter(
                    item => getSenderKey(item) === senderKey
                  ).length;

                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleParcelSelection(p)}
                      className={`flex items-center justify-between gap-2 p-2 rounded-xl border cursor-pointer transition text-xs ${
                        isChecked
                          ? 'bg-[#F5C84C]/20 border-[#F5C84C] text-white'
                          : 'bg-black/45 border-white/15 text-white/80 hover:border-white/30'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[#F5C84C] shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-white/50 shrink-0" />
                        )}
                        <span className="font-mono font-black text-[#F5C84C] shrink-0">
                          #{p.parcel_number}
                        </span>
                        <div className="truncate">
                          <span className="font-bold block truncate">
                            {p.sender_name} ⬅ {p.receiver_name}
                          </span>
                          <span className="text-[10px] text-white/70 font-mono" dir="ltr">
                            {p.sender_phone}
                          </span>
                        </div>
                      </div>

                      {senderCount > 1 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            handleSelectAllOfSender(p);
                          }}
                          className="btn-cancel px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition"
                        >
                          كوليات المرسل ({senderCount})
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ================================================================= */}
          {/* 3. عدد النسخ لكل كولي (COPIES)                                   */}
          {/* ================================================================= */}
          <div className="bg-black/55 border border-white/15 rounded-2xl p-3 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black text-[#F5C84C] block">
                2. عدد النسخ لكل كولي
              </span>
              <span className="text-[10px] text-white/75">
                يُطبع هذا العدد من الملصقات لكل كولي محدد
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCopiesPerParcel(c => Math.max(1, c - 1))}
                className="btn-cancel w-9 h-9 rounded-xl flex items-center justify-center transition active:scale-95"
                aria-label="إنقاص عدد النسخ"
              >
                <Minus className="w-4 h-4" />
              </button>

              <input
                type="number"
                min={1}
                max={200}
                value={copiesPerParcel}
                onChange={e =>
                  setCopiesPerParcel(Math.max(1, Math.min(200, Number(e.target.value) || 1)))
                }
                className="w-14 text-center bg-black/70 border border-[#F5C84C]/50 rounded-xl py-1.5 text-sm font-mono font-black text-[#F5C84C] focus:outline-none"
              />

              <button
                type="button"
                onClick={() => setCopiesPerParcel(c => Math.min(200, c + 1))}
                className="btn-gold w-9 h-9 rounded-xl flex items-center justify-center font-bold transition active:scale-95"
                aria-label="زيادة عدد النسخ"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* 4. مقاس الورق، نوع الكود، والتحكم الكامل في محتوى الملصق           */}
          {/* ================================================================= */}
          <div className="bg-black/55 border border-white/15 rounded-2xl p-3 space-y-3 text-xs">
            <div className="flex items-center gap-1.5 text-[#F5C84C] font-black">
              <Settings2 className="w-4 h-4" />
              <span>3. خيارات المقاس والباركود والمحتوى (تُحفظ تلقائياً)</span>
            </div>

            {/* حجم الورق */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/90 block">مقاس الورق:</label>
              <div className="grid grid-cols-1 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, paperFormat: '100x100' }))}
                  className={`px-3 py-2 rounded-xl font-black transition flex items-center justify-between ${
                    options.paperFormat === '100x100' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  <span>100×100 مم (ملصق حراري لكل صفحة)</span>
                  {options.paperFormat === '100x100' && <CheckCircle2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, paperFormat: 'a4_4up' }))}
                  className={`px-3 py-2 rounded-xl font-black transition flex items-center justify-between ${
                    options.paperFormat === 'a4_4up' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  <span>A4 (4 ملصقات في الصفحة الواحدة)</span>
                  {options.paperFormat === 'a4_4up' && <CheckCircle2 className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, paperFormat: 'custom' }))}
                  className={`px-3 py-2 rounded-xl font-black transition flex items-center justify-between ${
                    options.paperFormat === 'custom' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  <span>مقاس مخصص (مم)</span>
                  {options.paperFormat === 'custom' && <CheckCircle2 className="w-4 h-4" />}
                </button>
              </div>

              {options.paperFormat === 'custom' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-white/80 block mb-1">العرض (مم):</span>
                    <input
                      type="number"
                      min={50}
                      max={210}
                      value={options.customWidthMm}
                      onChange={e =>
                        setOptions(o => ({
                          ...o,
                          customWidthMm: Math.max(50, Math.min(210, Number(e.target.value) || 100)),
                        }))
                      }
                      className="w-full bg-black/70 border border-white/25 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-white/80 block mb-1">الارتفاع (مم):</span>
                    <input
                      type="number"
                      min={50}
                      max={297}
                      value={options.customHeightMm}
                      onChange={e =>
                        setOptions(o => ({
                          ...o,
                          customHeightMm: Math.max(50, Math.min(297, Number(e.target.value) || 100)),
                        }))
                      }
                      className="w-full bg-black/70 border border-white/25 rounded-xl px-2.5 py-1.5 text-white font-mono text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* نوع الكود */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-white/90 block">
                نوع الكود على الملصق:
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, codeType: 'qr' }))}
                  className={`py-2 px-2 rounded-xl font-black text-center transition flex flex-col items-center gap-1 ${
                    options.codeType === 'qr' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>QR فقط</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, codeType: 'code128' }))}
                  className={`py-2 px-2 rounded-xl font-black text-center transition flex flex-col items-center gap-1 ${
                    options.codeType === 'code128' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  <Barcode className="w-4 h-4" />
                  <span>Code128 فقط</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOptions(o => ({ ...o, codeType: 'both' }))}
                  className={`py-2 px-2 rounded-xl font-black text-center transition flex flex-col items-center gap-1 ${
                    options.codeType === 'both' ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span>QR + Code128</span>
                </button>
              </div>
            </div>

            {/* تحكم كامل في محتوى الملصق */}
            <div className="space-y-2 pt-2 border-t border-white/15">
              <label className="text-[11px] font-bold text-white/90 block">
                تحكم كامل في محتوى الملصق:
              </label>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setOptions(o => ({
                      ...o,
                      showStationBranding: false,
                      showSenderInfo: false,
                      showReceiverInfo: false,
                      showPaymentStatus: false,
                      showDateTime: false,
                      showRouteLine: false,
                      showStampBox: false,
                    }))
                  }
                  className={`py-2 px-2 rounded-xl text-xs font-black transition ${
                    isMinimalMode ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  فقط QR + رقم الكولي
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setOptions(o => ({
                      ...o,
                      showStationBranding: true,
                      showSenderInfo: true,
                      showReceiverInfo: true,
                      showPaymentStatus: true,
                      showDateTime: true,
                      showRouteLine: true,
                      showStampBox: true,
                    }))
                  }
                  className={`py-2 px-2 rounded-xl text-xs font-black transition ${
                    isFullMode ? 'btn-gold' : 'btn-cancel'
                  }`}
                >
                  إظهار كل المعلومات
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار شعار واسم وهاتف المحطة</span>
                  <input
                    type="checkbox"
                    checked={options.showStationBranding !== false}
                    onChange={e =>
                      setOptions(o => ({ ...o, showStationBranding: e.target.checked }))
                    }
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار بيانات المرسل</span>
                  <input
                    type="checkbox"
                    checked={options.showSenderInfo !== false}
                    onChange={e => setOptions(o => ({ ...o, showSenderInfo: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار بيانات المستلم</span>
                  <input
                    type="checkbox"
                    checked={options.showReceiverInfo !== false}
                    onChange={e => setOptions(o => ({ ...o, showReceiverInfo: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار حالة الأداء والمبلغ</span>
                  <input
                    type="checkbox"
                    checked={options.showPaymentStatus !== false}
                    onChange={e => setOptions(o => ({ ...o, showPaymentStatus: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار التاريخ والوقت</span>
                  <input
                    type="checkbox"
                    checked={options.showDateTime}
                    onChange={e => setOptions(o => ({ ...o, showDateTime: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار سطر المسار (من ... إلى ...)</span>
                  <input
                    type="checkbox"
                    checked={options.showRouteLine}
                    onChange={e => setOptions(o => ({ ...o, showRouteLine: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-black/50 border border-white/15 cursor-pointer">
                  <span className="text-white font-bold">إظهار خانة الختم الفارغة بالأسفل</span>
                  <input
                    type="checkbox"
                    checked={options.showStampBox}
                    onChange={e => setOptions(o => ({ ...o, showStampBox: e.target.checked }))}
                    className="w-4 h-4 accent-[#F5C84C] rounded"
                  />
                </label>
              </div>
            </div>

            {/* تخصيص اسم وهاتف وشعار المحطة مباشرة داخل نافذة الطابعة */}
            <div className="pt-2 border-t border-white/15 space-y-2">
              <button
                type="button"
                onClick={() => setShowBrandingEditor(prev => !prev)}
                className="btn-cancel w-full py-2 px-3 rounded-xl text-xs font-black flex items-center justify-between"
              >
                <span>تخصيص اسم وهاتف وشعار المحطة على الملصق</span>
                <span>{showBrandingEditor ? '▲' : '▼'}</span>
              </button>

              {showBrandingEditor && (
                <div className="bg-black/60 border border-[#F5C84C]/35 rounded-xl p-3 space-y-2.5">
                  {isPack1Basic99 ? (
                    <div className="p-2.5 rounded-xl bg-amber-950/60 border border-[#F5C84C]/45 text-[11px] text-[#F5C84C] font-bold leading-relaxed">
                      🔒 أنت حالياً على <strong>الباك الأول (99 درهم)</strong>: تخرج جميع الملصقات والبونات باسم التطبيق الرسمي (<strong>Sahara📦 Express</strong>) ولوغو التطبيق الرسمي. لتخصيص اللوغو والاسم الخاص بك، انتقل إلى <strong>الباك الثاني (199 درهم)</strong> من صفحة الإعدادات.
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="text-[10px] text-white/80 font-bold block mb-1">
                          اسم المحطة / الوكالة على الملصق:
                        </label>
                        <input
                          type="text"
                          value={branding.agencyName}
                          onChange={e => updateBrandingField('agencyName', e.target.value)}
                          placeholder="Sahara📦 Express"
                          className="w-full bg-black/70 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white font-bold"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-white/80 font-bold block mb-1">
                          رقم هاتف المحطة على الملصق:
                        </label>
                        <input
                          type="text"
                          dir="ltr"
                          value={branding.agencyPhone}
                          onChange={e => updateBrandingField('agencyPhone', e.target.value)}
                          placeholder="+212 600 000 000"
                          className="w-full bg-black/70 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white font-mono text-right"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-white/80 font-bold block">
                          شعار المحطة (صورة من الجهاز أو رابط):
                        </label>
                        <div className="flex items-center gap-2">
                          <label className="btn-cancel px-3 py-1.5 rounded-xl text-[11px] font-bold cursor-pointer shrink-0">
                            <span>رفع شعار</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleLogoFileUpload}
                              className="hidden"
                            />
                          </label>
                          {branding.logoUrl && (
                            <button
                              type="button"
                              onClick={() => updateBrandingField('logoUrl', '')}
                              className="btn-delete px-2.5 py-1.5 rounded-xl text-[11px] font-bold"
                            >
                              حذف الشعار
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* شريط التقدم أو التأكيد أو تنبيه الـ Sandbox + زر الطباعة السفلي   */}
        {/* ================================================================= */}
        <div className="px-4 py-3 border-t border-white/15 bg-black/75 space-y-2.5 shrink-0">
          {isPreparingPrint && (
            <div className="bg-[#F5C84C]/15 border border-[#F5C84C]/40 rounded-2xl p-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#F5C84C] text-xs font-black">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>
                  جاري تجهيز الملصقات... ({prepareProgress.current}/{prepareProgress.total})
                </span>
              </div>
            </div>
          )}

          {showConfirmBanner && !isPreparingPrint && (
            <div className="bg-[#F5C84C]/15 border border-[#F5C84C]/50 rounded-2xl p-2.5 space-y-2">
              <div className="text-xs font-black text-white">
                سيتم طباعة {totalStickersCount} ملصق ({selectedParcels.length} كولي ×{' '}
                {copiesPerParcel} نسخة) — هل تود المتابعة؟
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmBanner(false)}
                  className="btn-cancel px-3 py-1.5 rounded-xl text-xs font-bold"
                >
                  تراجع
                </button>
                <button
                  type="button"
                  onClick={executeBatchPrintJob}
                  className="btn-gold px-4 py-1.5 rounded-xl text-xs font-black"
                >
                  تأكيد وطباعة ({totalStickersCount})
                </button>
              </div>
            </div>
          )}

          {printBlockedNotice && (
            <div className="bg-[#F5C84C]/15 border border-[#F5C84C]/40 rounded-2xl p-2.5 text-right space-y-1">
              <div className="flex items-center gap-1.5 text-[#F5C84C] font-black text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>إطار المعاينة يمنع نافذة الطباعة المباشرة</span>
              </div>
              <p className="text-[10px] text-white/85 leading-relaxed">
                اضغط على <strong>«فتح الملصقات في تبويب جديد»</strong> بالأسفل لطباعتها فوراً.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2">
            {batchPrintReadyUrl && (
              <a
                href={batchPrintReadyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-cancel w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl font-black text-xs transition"
              >
                <ExternalLink className="w-4 h-4 text-[#F5C84C]" />
                <span>فتح الملصقات في تبويب جديد ({totalStickersCount})</span>
              </a>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-cancel px-4 py-2.5 rounded-xl font-bold text-xs transition"
              >
                إغلاق
              </button>

              <button
                type="button"
                disabled={totalStickersCount === 0 || isPreparingPrint}
                onClick={handlePrintButtonClick}
                className="btn-gold flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl disabled:opacity-50 font-black text-xs transition active:scale-95"
              >
                <Printer className="w-4 h-4 stroke-[2.5]" />
                <span>طباعة الآن ({totalStickersCount} ملصق)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined'
    ? createPortal(modalContent, document.body)
    : modalContent;
};

