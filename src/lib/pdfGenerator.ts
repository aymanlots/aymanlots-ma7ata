import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, StoreSettings, Customer, CustomerPayment } from '../types';

/**
 * Check if text contains Arabic characters
 */
function containsArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Render any text containing Arabic into high-resolution canvas image
 * to guarantee 100% offline correct cursive ligature shaping and RTL without font loading issues.
 */
function renderArabicTextToDataUrl(
  text: string,
  fontSize: number = 24,
  color: string = '#1E1E24',
  bold: boolean = false
): { dataUrl: string; widthMm: number; heightMm: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { dataUrl: '', widthMm: 0, heightMm: 0 };
  }

  const fontStyle = bold ? 'bold' : 'normal';
  ctx.font = `${fontStyle} ${fontSize}px "Cairo", system-ui, sans-serif`;
  ctx.direction = 'rtl';

  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width) + 20;
  const textHeight = Math.ceil(fontSize * 1.5) + 10;

  canvas.width = textWidth * 2; // retina scaling
  canvas.height = textHeight * 2;

  ctx.scale(2, 2);
  ctx.font = `${fontStyle} ${fontSize}px "Cairo", system-ui, sans-serif`;
  ctx.direction = 'rtl';
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, textWidth - 10, textHeight / 2);

  // Conversion: 1 px ≈ 0.264583 mm
  const widthMm = (textWidth * 0.264583);
  const heightMm = (textHeight * 0.264583);

  return {
    dataUrl: canvas.toDataURL('image/png'),
    widthMm,
    heightMm,
  };
}

/**
 * Generate a luxury A4 Bon de Vente PDF
 */
export async function generateBonPDF(sale: Sale, settings: StoreSettings, action: 'save' | 'print' = 'save'): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // 1. Double Gold Border
  // Outer gold border
  doc.setDrawColor(212, 175, 55); // #D4AF37
  doc.setLineWidth(1.2);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8);

  // Inner subtle border
  doc.setDrawColor(226, 186, 84); // #E2BA54
  doc.setLineWidth(0.4);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4);

  // 2. Header Top Bar
  doc.setFillColor(30, 30, 36); // #1E1E24
  doc.roundedRect(margin, margin, contentWidth, 28, 2, 2, 'F');

  // Gold accent line under header
  doc.setFillColor(212, 175, 55);
  doc.rect(margin, margin + 28, contentWidth, 1.5, 'F');

  // Store Brand / Name
  const fallbackStoreName = settings.language === 'ar' ? 'متجري' : 'Mon Magasin';
  const storeName = settings.storeName?.trim() || fallbackStoreName;
  if (containsArabic(storeName)) {
    const rendered = renderArabicTextToDataUrl(storeName, 26, '#D4AF37', true);
    doc.addImage(rendered.dataUrl, 'PNG', margin + 6, margin + 4, rendered.widthMm * 0.7, rendered.heightMm * 0.7);
  } else {
    doc.setTextColor(212, 175, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(storeName.toUpperCase(), margin + 6, margin + 11);
  }

  // Store Subtitle & Details
  doc.setTextColor(200, 200, 205);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const sub = settings.storeSubtitle?.trim();
  if (sub) {
    if (containsArabic(sub)) {
      const renderedSub = renderArabicTextToDataUrl(sub, 18, '#C8C8CD', false);
      doc.addImage(renderedSub.dataUrl, 'PNG', margin + 6, margin + 13, renderedSub.widthMm * 0.45, renderedSub.heightMm * 0.45);
    } else {
      doc.text(sub, margin + 6, margin + 17);
    }
  }

  const contactParts: string[] = [];
  if (settings.address?.trim()) contactParts.push(settings.address.trim());
  if (settings.phone?.trim()) contactParts.push(`Tél: ${settings.phone.trim()}`);
  const contactText = contactParts.join('  |  ');
  if (contactText) {
    if (containsArabic(contactText)) {
      const renderedContact = renderArabicTextToDataUrl(contactText, 16, '#C8C8CD', false);
      doc.addImage(renderedContact.dataUrl, 'PNG', margin + 6, margin + 19, renderedContact.widthMm * 0.4, renderedContact.heightMm * 0.4);
    } else {
      doc.text(contactText, margin + 6, margin + 22);
    }
  }

  if (settings.ice || settings.rc) {
    const legalText = `ICE: ${settings.ice || 'N/A'}  -  RC: ${settings.rc || 'N/A'}`;
    doc.text(legalText, margin + 6, margin + 26);
  }

  // Right side of Header: Logo or Store Initial Emblem
  const emblemLetter = storeName.charAt(0).toUpperCase() || 'M';
  if (settings.logo) {
    try {
      doc.addImage(settings.logo, 'JPEG', pageWidth - margin - 28, margin + 2, 24, 24);
    } catch {
      // fallback emblem
      drawEmblem(doc, pageWidth - margin - 26, margin + 4, emblemLetter);
    }
  } else {
    drawEmblem(doc, pageWidth - margin - 26, margin + 4, emblemLetter);
  }

  // 3. Document Details Strip (Bon Number, Date, Mode)
  let currentY = margin + 35;

  doc.setFillColor(250, 247, 237); // Light gold tint
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'F');
  doc.setDrawColor(220, 200, 150);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'S');

  // Bon Number
  doc.setTextColor(170, 124, 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`BON DE VENTE N° :  ${sale.bonNumber}`, margin + 5, currentY + 7);

  // Date
  doc.setTextColor(60, 60, 65);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Date d'émission : ${sale.date}`, margin + 5, currentY + 14);

  // Mode de règlement
  const paymentLabels: Record<string, string> = {
    cash: 'Espèces (Comptant)',
    credit: 'À Crédit',
    installment: 'Facilité (Échéances)',
  };
  const modeLabel = paymentLabels[sale.paymentType] || 'Espèces';
  doc.text(`Règlement : ${modeLabel}`, margin + 95, currentY + 7);

  // Statut
  const statusLabel = sale.status === 'returned' ? 'RETOURNÉ' : sale.status === 'partially_returned' ? 'PARTIELLEMENT RETOURNÉ' : 'VALIDÉ';
  doc.text(`Statut : ${statusLabel}`, margin + 95, currentY + 14);

  // 4. Client Information Box
  currentY += 23;
  doc.setFillColor(245, 245, 248);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.setFontSize(9);
  doc.text('CLIENT :', margin + 5, currentY + 6);

  // Customer name
  const custName = sale.customerName || 'Client Comptoir';
  if (containsArabic(custName)) {
    const rendered = renderArabicTextToDataUrl(custName, 20, '#1E1E24', true);
    doc.addImage(rendered.dataUrl, 'PNG', margin + 25, currentY + 1, rendered.widthMm * 0.6, rendered.heightMm * 0.6);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text(custName, margin + 25, currentY + 6);
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 95);
  doc.setFontSize(8.5);
  if (sale.customerPhone) {
    doc.text(`Téléphone : ${sale.customerPhone}`, margin + 5, currentY + 13);
  } else {
    doc.text(`Vente directe au comptoir`, margin + 5, currentY + 13);
  }

  // 5. Items Table with jsPDF AutoTable
  currentY += 24;

  const tableRows = sale.items.map((item, idx) => {
    const imeiDisplay = item.imei ? `IMEI: ${item.imei}` : item.category === 'phone' ? 'IMEI standard' : '-';
    const typeTag = item.type === 'wholesale' ? ' (Gros)' : '';
    const lineTotal = item.quantity * item.price;
    return [
      `${idx + 1}`,
      `${item.name}${typeTag}${item.isReturned ? ' [RETOURNÉ]' : ''}`,
      imeiDisplay,
      `${item.quantity}`,
      `${item.price.toFixed(2)} DH`,
      `${lineTotal.toFixed(2)} DH`,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['#', 'Désignation Produit', 'IMEI / Réf', 'Qté', 'Prix Unit.', 'Total']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 30, 36],
      textColor: [212, 175, 55],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 46, font: 'courier' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [40, 40, 45],
      lineColor: [225, 225, 230],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
  });

  // Get final Y from autoTable
  const autoTableDoc = doc as unknown as { lastAutoTable: { finalY: number } };
  currentY = autoTableDoc.lastAutoTable.finalY + 6;

  // 6. Totals Box & Order Terms (Warranty moved to dedicated certificate)
  const totalsBoxWidth = 84;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;
  const hasDiscount = Boolean(sale.discountAmount && sale.discountAmount > 0);
  const totalsBoxHeight = hasDiscount ? 42 : 32;

  // Totals Summary Box
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, totalsBoxHeight, 1.5, 1.5, 'F');
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.5);
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, totalsBoxHeight, 1.5, 1.5, 'S');

  let boxY = currentY + 6;

  // If discount, show Subtotal first
  if (hasDiscount) {
    const rawSubtotal = sale.subtotal ?? (sale.totalAmount + (sale.discountAmount || 0));
    doc.setTextColor(90, 90, 95);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('SOUS-TOTAL :', totalsBoxX + 5, boxY);
    doc.setFont('helvetica', 'bold');
    doc.text(`${rawSubtotal.toFixed(2)} DH`, totalsBoxX + totalsBoxWidth - 5, boxY, { align: 'right' });
    boxY += 6;

    // Remise
    const discountTag = sale.discountType === 'percent' && sale.discountValue ? ` (${sale.discountValue}%)` : '';
    doc.setTextColor(200, 30, 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`REMISE ACCORDÉE${discountTag} :`, totalsBoxX + 5, boxY);
    doc.setFont('helvetica', 'bold');
    doc.text(`- ${(sale.discountAmount || 0).toFixed(2)} DH`, totalsBoxX + totalsBoxWidth - 5, boxY, { align: 'right' });
    boxY += 7;

    // Divider
    doc.setDrawColor(220, 220, 225);
    doc.line(totalsBoxX + 4, boxY - 2, totalsBoxX + totalsBoxWidth - 4, boxY - 2);
  }

  // Total Net / Global
  doc.setTextColor(30, 30, 35);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(hasDiscount ? 'TOTAL NET :' : 'TOTAL GLOBAL :', totalsBoxX + 5, boxY + 1);
  doc.setFont('helvetica', 'bold');
  doc.text(`${sale.totalAmount.toFixed(2)} DH`, totalsBoxX + totalsBoxWidth - 5, boxY + 1, { align: 'right' });
  boxY += 8;

  // Montant Versé
  doc.setFont('helvetica', 'normal');
  doc.text('MONTANT VERSÉ :', totalsBoxX + 5, boxY);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 130, 60);
  doc.text(`${sale.paidAmount.toFixed(2)} DH`, totalsBoxX + totalsBoxWidth - 5, boxY, { align: 'right' });
  boxY += 5;

  // Divider inside totals
  doc.setDrawColor(220, 220, 225);
  doc.line(totalsBoxX + 4, boxY, totalsBoxX + totalsBoxWidth - 4, boxY);
  boxY += 5;

  // Reste Dû / Solde
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  if (sale.remainingAmount > 0) {
    doc.setTextColor(200, 30, 30);
    doc.text('RESTE DÛ (CRÉDIT) :', totalsBoxX + 5, boxY);
    doc.text(`${sale.remainingAmount.toFixed(2)} DH`, totalsBoxX + totalsBoxWidth - 5, boxY, { align: 'right' });
  } else {
    doc.setTextColor(22, 130, 60);
    doc.text('SOLDE :', totalsBoxX + 5, boxY);
    doc.text('RÉGLÉ 100% (0.00 DH)', totalsBoxX + totalsBoxWidth - 5, boxY, { align: 'right' });
  }

  // Left Box: Règlement & Conditions Commerciales (replaces old embedded warranty box)
  const leftBoxWidth = contentWidth - totalsBoxWidth - 6;
  doc.setFillColor(250, 250, 252);
  doc.roundedRect(margin, currentY, leftBoxWidth, totalsBoxHeight, 1.5, 1.5, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, leftBoxWidth, totalsBoxHeight, 1.5, 1.5, 'S');

  doc.setTextColor(30, 30, 35);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('RÈGLEMENT & CONDITIONS DE VENTE :', margin + 5, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(70, 70, 75);
  doc.setFontSize(7.5);
  const paymentModeLabels: Record<string, string> = {
    cash: 'Au comptant (Espèces)',
    credit: 'À crédit (Compte client)',
    installment: 'Facilité de paiement',
  };
  const paymentStr = paymentModeLabels[sale.paymentType] || sale.paymentType;
  doc.text(`• Mode de règlement : ${paymentStr}`, margin + 5, currentY + 12);
  if (sale.notes) {
    doc.text(`• Note de vente : ${sale.notes.substring(0, 70)}`, margin + 5, currentY + 17);
  } else {
    doc.text(`• Marchandises vérifiées et délivrées en bon état de fonctionnement.`, margin + 5, currentY + 17);
  }
  doc.text(`• Les retours d'articles ne sont autorisés que sur présentation du bon original.`, margin + 5, currentY + 22);
  if (hasDiscount) {
    doc.text(`• Remise spéciale accordée sur la présente transaction commerciale.`, margin + 5, currentY + 27);
  }

  // 7. Signatures Area
  currentY += totalsBoxHeight + 8;
  const sigBoxWidth = (contentWidth - 10) / 2;

  // Signature Client
  doc.setDrawColor(210, 210, 215);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, sigBoxWidth, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 85);
  doc.text('Signature du Client (Mention "Bon pour accord")', margin + 4, currentY + 5);

  // Cachet Magasin
  doc.rect(margin + sigBoxWidth + 10, currentY, sigBoxWidth, 22);
  doc.text('Cachet & Signature du Magasin', margin + sigBoxWidth + 14, currentY + 5);

  // 8. Footer Band
  doc.setFillColor(30, 30, 36);
  doc.rect(margin, pageHeight - margin - 8, contentWidth, 8, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const footerBrand = (settings.storeName?.trim() || (settings.language === 'ar' ? 'متجري' : 'MON MAGASIN')).toUpperCase();
  doc.text(
    `MERCI POUR VOTRE CONFIANCE  •  ${footerBrand}  •  شكراً لثقتكم بنا`,
    pageWidth / 2,
    pageHeight - margin - 3,
    { align: 'center' }
  );

  // Output
  if (action === 'print') {
    doc.autoPrint();
    const blobUrl = String(doc.output('bloburl'));
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.src = blobUrl;
    document.body.appendChild(printFrame);
    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch {
        doc.save(`Bon_${sale.bonNumber}_${sale.date}.pdf`);
      }
    }, 600);
  } else {
    doc.save(`Bon_${sale.bonNumber}_${sale.date}.pdf`);
  }
}

/**
 * Generate a separate Luxury A4 Warranty Certificate PDF
 */
export async function generateWarrantyPDF(
  sale: Sale,
  settings: StoreSettings,
  action: 'save' | 'print' = 'save'
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // 1. Double Gold Border
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.2);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8);

  doc.setDrawColor(226, 186, 84);
  doc.setLineWidth(0.4);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4);

  // 2. Header Top Bar
  doc.setFillColor(30, 30, 36);
  doc.roundedRect(margin, margin, contentWidth, 28, 2, 2, 'F');

  // Gold accent line under header
  doc.setFillColor(212, 175, 55);
  doc.rect(margin, margin + 28, contentWidth, 1.5, 'F');

  // Store Brand / Name
  const fallbackStoreName = settings.language === 'ar' ? 'متجري' : 'Mon Magasin';
  const storeName = settings.storeName?.trim() || fallbackStoreName;
  if (containsArabic(storeName)) {
    const rendered = renderArabicTextToDataUrl(storeName, 26, '#D4AF37', true);
    doc.addImage(rendered.dataUrl, 'PNG', margin + 6, margin + 4, rendered.widthMm * 0.7, rendered.heightMm * 0.7);
  } else {
    doc.setTextColor(212, 175, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(storeName.toUpperCase(), margin + 6, margin + 11);
  }

  // Store Subtitle & Details
  doc.setTextColor(200, 200, 205);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const contactParts: string[] = [];
  if (settings.address?.trim()) contactParts.push(settings.address.trim());
  if (settings.phone?.trim()) contactParts.push(`Tél: ${settings.phone.trim()}`);
  const contactText = contactParts.join('  |  ');
  if (contactText) {
    if (containsArabic(contactText)) {
      const renderedContact = renderArabicTextToDataUrl(contactText, 16, '#C8C8CD', false);
      doc.addImage(renderedContact.dataUrl, 'PNG', margin + 6, margin + 17, renderedContact.widthMm * 0.4, renderedContact.heightMm * 0.4);
    } else {
      doc.text(contactText, margin + 6, margin + 19);
    }
  }

  if (settings.ice || settings.rc) {
    const legalText = `ICE: ${settings.ice || 'N/A'}  -  RC: ${settings.rc || 'N/A'}`;
    doc.text(legalText, margin + 6, margin + 24);
  }

  // Right side of Header: Logo or Store Emblem
  const emblemLetter = storeName.charAt(0).toUpperCase() || 'M';
  if (settings.logo) {
    try {
      doc.addImage(settings.logo, 'JPEG', pageWidth - margin - 28, margin + 2, 24, 24);
    } catch {
      drawEmblem(doc, pageWidth - margin - 26, margin + 3, emblemLetter);
    }
  } else {
    drawEmblem(doc, pageWidth - margin - 26, margin + 3, emblemLetter);
  }

  // 3. Document Title Banner
  let currentY = margin + 34;
  doc.setFillColor(252, 250, 242);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'F');
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'S');

  doc.setTextColor(30, 30, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CERTIFICAT DE GARANTIE COMMERCIALE', margin + 6, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 105);
  doc.text('DOCUMENT OFFICIEL DE SERVICE APRÈS-VENTE (SAV)', margin + 6, currentY + 14);

  // Right side of Banner: Bon Number & Date
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(212, 175, 55);
  doc.text(`Réf Bon : ${sale.bonNumber}`, pageWidth - margin - 6, currentY + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 75);
  doc.text(`Date d'émission : ${sale.date}`, pageWidth - margin - 6, currentY + 14, { align: 'right' });

  // 4. Client & Dates Information Box
  currentY += 22;
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, currentY, contentWidth, 22, 1.5, 1.5, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 22, 1.5, 1.5, 'S');

  // Customer block
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.setFontSize(9);
  doc.text('BÉNÉFICIAIRE DE LA GARANTIE :', margin + 6, currentY + 6);

  const custName = sale.customerName || 'Client Comptoir';
  if (containsArabic(custName)) {
    const rendered = renderArabicTextToDataUrl(custName, 20, '#1E1E24', true);
    doc.addImage(rendered.dataUrl, 'PNG', margin + 6, currentY + 8, rendered.widthMm * 0.5, rendered.heightMm * 0.5);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(212, 175, 55);
    doc.text(custName, margin + 6, currentY + 13);
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 95);
  doc.setFontSize(8);
  doc.text(`Tél : ${sale.customerPhone || 'Non renseigné'}`, margin + 6, currentY + 18);

  // Warranty duration & validity dates on the right
  const months = Math.max(1, sale.warrantyMonths || 12);
  const startDate = new Date(sale.date);
  const endDate = new Date(sale.date);
  endDate.setMonth(endDate.getMonth() + months);
  const endStr = endDate.toISOString().split('T')[0];

  const colRightX = pageWidth - margin - 75;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.setFontSize(9);
  doc.text('DURÉE & PÉRIODE DE VALIDITÉ :', colRightX, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 130, 60);
  doc.text(`Durée accordée : ${months} MOIS`, colRightX, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 75);
  doc.text(`Du ${sale.date} au ${endStr} inclus`, colRightX, currentY + 18);

  // 5. Covered Items Table
  currentY += 26;
  const warrantyItems = sale.items.filter((it) => !it.isReturned);
  const tableRows = warrantyItems.map((item, idx) => {
    const imeiDisplay = item.imei ? item.imei : (item.category === 'phone' ? 'IMEI standard' : 'N/A');
    return [
      `${idx + 1}`,
      item.name,
      imeiDisplay,
      `${months} mois`,
      sale.date,
      endStr,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['#', 'Appareil / Désignation Produit', 'Numéro IMEI / Série', 'Garantie', 'Prise d\'effet', 'Date Expiration']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 30, 36],
      textColor: [212, 175, 55],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 70 },
      2: { cellWidth: 46, font: 'courier' },
      3: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 21, halign: 'center' },
      5: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [40, 40, 45],
      lineColor: [225, 225, 230],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
  });

  const autoTableDoc = doc as unknown as { lastAutoTable: { finalY: number } };
  currentY = autoTableDoc.lastAutoTable.finalY + 6;

  // 6. Warranty Terms & Conditions Box
  doc.setFillColor(252, 250, 242);
  doc.roundedRect(margin, currentY, contentWidth, 58, 1.5, 1.5, 'F');
  doc.setDrawColor(226, 186, 84);
  doc.setLineWidth(0.4);
  doc.roundedRect(margin, currentY, contentWidth, 58, 1.5, 1.5, 'S');

  doc.setTextColor(170, 124, 17);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('CONDITIONS GÉNÉRALES DE GARANTIE COMMERCIALE :', margin + 6, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 55);
  doc.setFontSize(7.3);

  let condY = currentY + 12;
  doc.text(
    `1. Portée de la garantie : Cette garantie couvre la réparation gratuite (pièces détachées et main-d'œuvre) en cas de défaillance`,
    margin + 6,
    condY
  );
  condY += 4.5;
  doc.text(
    `   ou panne matérielle des composants internes résultant d'une utilisation normale et conforme de l'appareil.`,
    margin + 6,
    condY
  );
  condY += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(190, 30, 30);
  doc.text(`2. Exclusions formelles et irrévocables : Ne sont JAMAIS couverts par cette garantie :`, margin + 6, condY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 55);
  condY += 4.5;
  doc.text(
    `   • Chute, écrasement, pression anormale, écran brisé, tactile fissuré, dos en verre cassé ou châssis déformé.`,
    margin + 6,
    condY
  );
  condY += 4;
  doc.text(
    `   • Toute trace d'oxydation, infiltration de liquide, d'eau, de café ou d'humidité excessive constatée par nos techniciens.`,
    margin + 6,
    condY
  );
  condY += 4;
  doc.text(
    `   • Blocage par compte utilisateur (iCloud, compte Google FRP, mot de passe) ou altération logicielle non officielle (root, jailbreak).`,
    margin + 6,
    condY
  );
  condY += 4;
  doc.text(
    `   • Toute ouverture, démontage ou tentative de réparation effectuée hors des ateliers agréés par notre magasin.`,
    margin + 6,
    condY
  );
  condY += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.text(`3. Modalités d'application du SAV :`, margin + 6, condY);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 55);
  condY += 4.5;
  doc.text(
    `   • La présentation conjointe de ce certificat original et du bon d'achat correspondant (${sale.bonNumber}) est OBLIGATOIRE.`,
    margin + 6,
    condY
  );
  condY += 4;
  doc.text(
    `   • Le magasin s'engage à effectuer le diagnostic et la réparation dans les meilleurs délais techniques possibles.`,
    margin + 6,
    condY
  );

  // 7. Signature & Cachet Box
  currentY += 64;
  const sigBoxWidth = (contentWidth - 10) / 2;

  // Signature Client
  doc.setDrawColor(210, 210, 215);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, sigBoxWidth, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 85);
  doc.text('Signature du Client (Mention "Lu et approuvé")', margin + 4, currentY + 5);

  // Cachet & Signature Magasin
  doc.rect(margin + sigBoxWidth + 10, currentY, sigBoxWidth, 24);
  doc.text('Cachet Officiel & Signature du Magasin', margin + sigBoxWidth + 14, currentY + 5);

  // 8. Footer Band
  doc.setFillColor(30, 30, 36);
  doc.rect(margin, pageHeight - margin - 8, contentWidth, 8, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
    const footerBrand = (settings.storeName?.trim() || (settings.language === 'ar' ? 'متجري' : 'MON MAGASIN')).toUpperCase();
    doc.text(
      `CERTIFICAT DE GARANTIE  •  ${footerBrand}  •  وثيقة الضمان الرسمي`,
      pageWidth / 2,
      pageHeight - margin - 3,
      { align: 'center' }
    );

  // Output
  if (action === 'print') {
    doc.autoPrint();
    const blobUrl = String(doc.output('bloburl'));
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.src = blobUrl;
    document.body.appendChild(printFrame);
    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch {
        doc.save(`Garantie_${sale.bonNumber}_${sale.date}.pdf`);
      }
    }, 600);
  } else {
    doc.save(`Garantie_${sale.bonNumber}_${sale.date}.pdf`);
  }
}

/**
 * Helper to draw a decorative Gold Emblem with the store's initial letter if no custom logo is uploaded
 */
function drawEmblem(doc: jsPDF, x: number, y: number, letter: string = 'M'): void {
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.8);
  doc.circle(x + 10, y + 10, 9);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(212, 175, 55);
  doc.text(letter, x + 8.5, y + 13.5);
}

/**
 * Generate Customer Statement (Relevé de Compte Client) PDF
 * Displays chronological ledger of Bons (Debit), Payments (Credit) and running balance.
 */
export async function generateCustomerStatementPDF(
  customer: Customer,
  sales: Sale[],
  payments: CustomerPayment[],
  settings: StoreSettings,
  action: 'save' | 'print' = 'save'
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  // 1. Double Gold Border
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1.2);
  doc.rect(margin - 4, margin - 4, contentWidth + 8, pageHeight - margin * 2 + 8);

  doc.setDrawColor(226, 186, 84);
  doc.setLineWidth(0.4);
  doc.rect(margin - 2, margin - 2, contentWidth + 4, pageHeight - margin * 2 + 4);

  // 2. Header Top Bar
  doc.setFillColor(30, 30, 36);
  doc.roundedRect(margin, margin, contentWidth, 28, 2, 2, 'F');

  // Gold accent line under header
  doc.setFillColor(212, 175, 55);
  doc.rect(margin, margin + 28, contentWidth, 1.5, 'F');

  // Store Brand / Name
  const fallbackStoreName = settings.language === 'ar' ? 'متجري' : 'Mon Magasin';
  const storeName = settings.storeName?.trim() || fallbackStoreName;
  if (containsArabic(storeName)) {
    const rendered = renderArabicTextToDataUrl(storeName, 26, '#D4AF37', true);
    doc.addImage(rendered.dataUrl, 'PNG', margin + 6, margin + 4, rendered.widthMm * 0.7, rendered.heightMm * 0.7);
  } else {
    doc.setTextColor(212, 175, 55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(storeName.toUpperCase(), margin + 6, margin + 11);
  }

  // Store Subtitle & Details
  doc.setTextColor(200, 200, 205);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const contactParts: string[] = [];
  if (settings.address?.trim()) contactParts.push(settings.address.trim());
  if (settings.phone?.trim()) contactParts.push(`Tél: ${settings.phone.trim()}`);
  const contactText = contactParts.join('  |  ');
  if (contactText) {
    if (containsArabic(contactText)) {
      const renderedContact = renderArabicTextToDataUrl(contactText, 16, '#C8C8CD', false);
      doc.addImage(renderedContact.dataUrl, 'PNG', margin + 6, margin + 17, renderedContact.widthMm * 0.4, renderedContact.heightMm * 0.4);
    } else {
      doc.text(contactText, margin + 6, margin + 19);
    }
  }

  if (settings.ice || settings.rc) {
    const legalText = `ICE: ${settings.ice || 'N/A'}  -  RC: ${settings.rc || 'N/A'}`;
    doc.text(legalText, margin + 6, margin + 24);
  }

  // Right side of Header: Logo or Store Emblem
  const emblemLetter = storeName.charAt(0).toUpperCase() || 'M';
  if (settings.logo) {
    try {
      doc.addImage(settings.logo, 'JPEG', pageWidth - margin - 28, margin + 2, 24, 24);
    } catch {
      drawEmblem(doc, pageWidth - margin - 26, margin + 3, emblemLetter);
    }
  } else {
    drawEmblem(doc, pageWidth - margin - 26, margin + 3, emblemLetter);
  }

  // 3. Document Title Banner
  let currentY = margin + 34;
  doc.setFillColor(252, 250, 242);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'F');
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.6);
  doc.roundedRect(margin, currentY, contentWidth, 18, 1.5, 1.5, 'S');

  doc.setTextColor(30, 30, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RELEVÉ DE COMPTE CLIENT & ÉCHÉANCES', margin + 6, currentY + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 105);
  doc.text('HISTORIQUE DES ACHATS, RÈGLEMENTS ET SITUATION DU SOLDE', margin + 6, currentY + 14);

  // Right side of Title Banner: Today's date
  const todayStr = new Date().toISOString().split('T')[0];
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(212, 175, 55);
  doc.text(`Date d'édition : ${todayStr}`, pageWidth - margin - 6, currentY + 8, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(70, 70, 75);
  doc.text('Document officiel certifié', pageWidth - margin - 6, currentY + 14, { align: 'right' });

  // 4. Customer Information & Account Status Box
  currentY += 22;
  doc.setFillColor(248, 248, 250);
  doc.roundedRect(margin, currentY, contentWidth, 24, 1.5, 1.5, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, currentY, contentWidth, 24, 1.5, 1.5, 'S');

  // Customer Details (Left)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.setFontSize(9);
  doc.text('IDENTIFICATION DU CLIENT :', margin + 6, currentY + 6);

  const customerName = customer.name || 'Client Comptoir';
  if (containsArabic(customerName)) {
    const rendered = renderArabicTextToDataUrl(customerName, 20, '#1E1E24', true);
    doc.addImage(rendered.dataUrl, 'PNG', margin + 6, currentY + 8, rendered.widthMm * 0.45, rendered.heightMm * 0.45);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(212, 175, 55);
    doc.text(customerName.toUpperCase(), margin + 6, currentY + 12);
  }

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(90, 90, 95);
  doc.setFontSize(8);
  const typeLabel = customer.customerType === 'wholesale' ? 'Client Grossiste' : 'Client Détaillant';
  doc.text(`Type : ${typeLabel}   |   Tél : ${customer.phone || 'N/A'}${customer.CIN ? `   |   CIN : ${customer.CIN}` : ''}`, margin + 6, currentY + 19);

  // Credit Balance & Ceiling (Right)
  const colRightX = pageWidth - margin - 80;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 35);
  doc.setFontSize(9);
  doc.text('SOLDE DU COMPTE :', colRightX, currentY + 6);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  const hasDebt = (customer.totalCredit || 0) > 0;
  doc.setTextColor(hasDebt ? 200 : 22, hasDebt ? 40 : 130, hasDebt ? 40 : 60);
  doc.text(`Reste dû : ${(customer.totalCredit || 0).toLocaleString('fr-FR')} DH`, colRightX, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 95);
  const ceilingText = customer.creditLimit ? `Plafond : ${customer.creditLimit.toLocaleString('fr-FR')} DH` : 'Plafond : Non limité';
  doc.text(ceilingText, colRightX, currentY + 19);

  // 5. Build Chronological Ledger Entries
  interface LedgerEvent {
    date: string;
    ref: string;
    description: string;
    dueDate: string;
    debit: number;
    credit: number;
  }

  const events: LedgerEvent[] = [];

  // Add Sales (Debit)
  for (const s of sales) {
    if (s.status === 'returned') continue;
    events.push({
      date: s.date,
      ref: s.bonNumber,
      description: `Facture de vente (${s.items.length} art.)`,
      dueDate: s.dueDate || (s.remainingAmount > 0 ? 'À convenir' : 'Soldé'),
      debit: s.totalAmount,
      credit: 0,
    });
  }

  // Add Payments (Credit)
  for (const p of payments) {
    if (p.status === 'cancelled') continue;
    events.push({
      date: p.date,
      ref: `RÈGLEMENT`,
      description: p.note || `Versement (${p.paymentMethod || 'Espèces'})`,
      dueDate: '-',
      debit: 0,
      credit: p.amount,
    });
  }

  // Sort chronological
  events.sort((a, b) => a.date.localeCompare(b.date));

  let runningBalance = 0;
  const tableRows = events.map((ev) => {
    runningBalance += ev.debit - ev.credit;
    return [
      ev.date,
      ev.ref,
      ev.description,
      ev.dueDate,
      ev.debit > 0 ? `${ev.debit.toLocaleString('fr-FR')} DH` : '-',
      ev.credit > 0 ? `${ev.credit.toLocaleString('fr-FR')} DH` : '-',
      `${runningBalance.toLocaleString('fr-FR')} DH`,
    ];
  });

  currentY += 28;

  autoTable(doc, {
    startY: currentY,
    margin: { left: margin, right: margin },
    head: [['Date', 'Réf', 'Opération', 'Échéance', 'Débit (+)', 'Crédit (-)', 'Solde Dû']],
    body: tableRows.length > 0 ? tableRows : [['-', 'Aucune opération', 'Aucun mouvement enregistré', '-', '-', '-', '0 DH']],
    theme: 'grid',
    headStyles: {
      fillColor: [30, 30, 36],
      textColor: [212, 175, 55],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 25, font: 'courier', fontStyle: 'bold' },
      2: { cellWidth: 50 },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 23, halign: 'right', textColor: [180, 40, 40] },
      5: { cellWidth: 23, halign: 'right', textColor: [20, 130, 50] },
      6: { cellWidth: 23, halign: 'right', fontStyle: 'bold' },
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [40, 40, 45],
      lineColor: [225, 225, 230],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 252],
    },
  });

  const autoTableDoc = doc as unknown as { lastAutoTable: { finalY: number } };
  currentY = autoTableDoc.lastAutoTable.finalY + 6;

  // 6. Totals Summary Box
  const totalDebit = events.reduce((s, e) => s + e.debit, 0);
  const totalCredit = events.reduce((s, e) => s + e.credit, 0);
  const netDue = customer.totalCredit;

  const totalsBoxWidth = 85;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;

  doc.setFillColor(248, 248, 250);
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, 26, 1.5, 1.5, 'F');
  doc.setDrawColor(220, 220, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, 26, 1.5, 1.5, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 85);
  doc.text('Total Facturé (Débit) :', totalsBoxX + 4, currentY + 6);
  doc.setFont('helvetica', 'bold');
  doc.text(`${totalDebit.toLocaleString('fr-FR')} DH`, totalsBoxX + totalsBoxWidth - 4, currentY + 6, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.text('Total Encaissé (Crédit) :', totalsBoxX + 4, currentY + 12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 130, 60);
  doc.text(`${totalCredit.toLocaleString('fr-FR')} DH`, totalsBoxX + totalsBoxWidth - 4, currentY + 12, { align: 'right' });

  doc.setDrawColor(210, 210, 215);
  doc.line(totalsBoxX + 4, currentY + 15, totalsBoxX + totalsBoxWidth - 4, currentY + 15);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(netDue > 0 ? 200 : 30, netDue > 0 ? 30 : 130, netDue > 0 ? 30 : 60);
  doc.text('NET RESTANT DÛ :', totalsBoxX + 4, currentY + 22);
  doc.text(`${netDue.toLocaleString('fr-FR')} DH`, totalsBoxX + totalsBoxWidth - 4, currentY + 22, { align: 'right' });

  // 7. Signatures Area
  currentY += 32;
  const sigBoxWidth = (contentWidth - 10) / 2;

  doc.setDrawColor(210, 210, 215);
  doc.setLineWidth(0.3);
  doc.rect(margin, currentY, sigBoxWidth, 22);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 85);
  doc.text('Signature du Client (Accusé de réception)', margin + 4, currentY + 5);

  doc.rect(margin + sigBoxWidth + 10, currentY, sigBoxWidth, 22);
  doc.text('Cachet & Signature du Magasin', margin + sigBoxWidth + 14, currentY + 5);

  // 8. Footer Band
  doc.setFillColor(30, 30, 36);
  doc.rect(margin, pageHeight - margin - 8, contentWidth, 8, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  const footerBrand = (settings.storeName?.trim() || (settings.language === 'ar' ? 'متجري' : 'MON MAGASIN')).toUpperCase();
  doc.text(
    `RELEVÉ DE COMPTE OFFICIEL  •  ${footerBrand}  •  كشف الحساب المالي للعميل`,
    pageWidth / 2,
    pageHeight - margin - 3,
    { align: 'center' }
  );

  // Output
  if (action === 'print') {
    doc.autoPrint();
    const blobUrl = String(doc.output('bloburl'));
    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    printFrame.src = blobUrl;
    document.body.appendChild(printFrame);
    setTimeout(() => {
      try {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
      } catch {
        doc.save(`Releve_${customer.name}_${todayStr}.pdf`);
      }
    }, 600);
  } else {
    doc.save(`Releve_${customer.name}_${todayStr}.pdf`);
  }
}

