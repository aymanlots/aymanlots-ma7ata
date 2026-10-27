import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  History,
  Search,
  Filter,
  Eye,
  RotateCcw,
  CreditCard,
  Printer,
  Calendar,
  AlertCircle,
  CheckCircle,
  ShieldCheck,
  Edit,
  Clock,
  Split,
  PlusCircle,
  Trash2,
} from 'lucide-react';
import {
  db,
  returnSaleItemTransaction,
  registerCustomerPaymentTransaction,
  updateSaleDueDateTransaction,
  updateSaleInstallmentsTransaction,
  getStoreSettings,
} from '../db';
import { Sale, SaleItem, Installment } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { generateBonPDF, generateWarrantyPDF } from '../lib/pdfGenerator';

interface BonsHistoryPageProps {
  initialSearch?: string;
}

export const BonsHistoryPage: React.FC<BonsHistoryPageProps> = ({ initialSearch }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();

  const [search, setSearch] = useState(initialSearch || '');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Selected Sale for Detailed View
  const [viewSale, setViewSale] = useState<Sale | null>(null);

  // Return Item Modal
  const [returnSale, setReturnSale] = useState<Sale | null>(null);
  const [returnItemIndex, setReturnItemIndex] = useState<number | null>(null);
  const [returnNotes, setReturnNotes] = useState('');

  // Register Payment Modal
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');

  // Edit Due Date Modal
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [editDueDateVal, setEditDueDateVal] = useState('');
  const [editDueDateReason, setEditDueDateReason] = useState('');

  // Edit Installments Modal
  const [isEditingInstallments, setIsEditingInstallments] = useState(false);
  const [tempInstallments, setTempInstallments] = useState<Installment[]>([]);
  const [editInstallmentsReason, setEditInstallmentsReason] = useState('');
  const [splitCount, setSplitCount] = useState<number>(3);
  const [splitFreq, setSplitFreq] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');

  // Live queries
  const sales = useLiveQuery(() => db.sales.orderBy('id').reverse().toArray(), []) || [];

  // Print PDF helper
  const handlePrintPdf = async (sale: Sale) => {
    try {
      const settings = await getStoreSettings();
      await generateBonPDF(sale, settings, 'save');
      success(`Facture PDF générée pour le bon ${sale.bonNumber}`);
    } catch {
      error("Erreur lors de la génération de la facture PDF.");
    }
  };

  // Print Warranty Certificate helper
  const handlePrintWarrantyPdf = async (sale: Sale) => {
    try {
      const settings = await getStoreSettings();
      await generateWarrantyPDF(sale, settings, 'save');
      success(`Certificat de garantie généré pour le bon ${sale.bonNumber}`);
    } catch {
      error("Erreur lors de la génération du certificat de garantie.");
    }
  };

  // Confirm Return Item
  const handleConfirmReturn = async () => {
    if (!returnSale || returnItemIndex === null || !returnSale.id) return;
    try {
      await returnSaleItemTransaction(returnSale.id, returnItemIndex, returnNotes);
      success("Article retourné. Le stock et le crédit client ont été ajustés.");
      setReturnSale(null);
      setReturnItemIndex(null);
      setReturnNotes('');
      // update viewSale if currently viewing
      if (viewSale && viewSale.id === returnSale.id) {
        const updated = await db.sales.get(returnSale.id);
        if (updated) setViewSale(updated);
      }
    } catch (err: any) {
      error(err.message || "Erreur lors du retour de l'article.");
    }
  };

  // Submit Payment for Sale with remaining balance
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSale || !paymentSale.customerId || paymentAmount <= 0) return;
    try {
      await registerCustomerPaymentTransaction(
        paymentSale.customerId,
        paymentAmount,
        new Date().toISOString().split('T')[0],
        paymentNote || `Versement pour Bon ${paymentSale.bonNumber}`,
        paymentSale.id
      );
      success(t.bons.paymentSuccess);
      setPaymentSale(null);
      setPaymentAmount(0);
      setPaymentNote('');
    } catch (err: any) {
      error(err.message || "Erreur lors du versement.");
    }
  };

  // 1. Save Edited Due Date (with Audit Log)
  const handleSaveDueDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewSale || !viewSale.id || !editDueDateVal) return;
    if (!editDueDateReason.trim()) {
      error("Un motif est obligatoire pour modifier la date d'échéance.");
      return;
    }
    try {
      await updateSaleDueDateTransaction(viewSale.id, editDueDateVal, editDueDateReason);
      const updated = await db.sales.get(viewSale.id);
      if (updated) setViewSale(updated);
      success("Date d'échéance mise à jour et enregistrée dans l'historique.");
      setIsEditingDueDate(false);
      setEditDueDateReason('');
    } catch (err: any) {
      error(err.message || "Erreur lors de la mise à jour de l'échéance.");
    }
  };

  // 2. Save Edited Installments Schedule (with Audit Log)
  const handleSaveInstallments = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewSale || !viewSale.id) return;
    if (!editInstallmentsReason.trim()) {
      error("Un motif est obligatoire pour enregistrer l'échéancier.");
      return;
    }
    const sum = tempInstallments.reduce((s, i) => s + (Number(i.amount) || 0), 0);
    if (sum > viewSale.remainingAmount + 0.01) {
      error(`Le total (${sum} DH) ne peut pas dépasser le reste à payer (${viewSale.remainingAmount} DH).`);
      return;
    }
    for (const inst of tempInstallments) {
      if ((Number(inst.amount) || 0) <= 0) {
        error("Chaque tranche doit avoir un montant supérieur à 0.");
        return;
      }
    }
    try {
      await updateSaleInstallmentsTransaction(viewSale.id, tempInstallments, editInstallmentsReason);
      const updated = await db.sales.get(viewSale.id);
      if (updated) setViewSale(updated);
      success("Échéancier enregistré et consigné dans l'historique.");
      setIsEditingInstallments(false);
      setEditInstallmentsReason('');
    } catch (err: any) {
      error(err.message || "Erreur lors de la mise à jour de l'échéancier.");
    }
  };

  // Helper: Open Installments editor with current sale's installments
  const handleOpenInstallmentsEditor = () => {
    if (!viewSale) return;
    setTempInstallments(viewSale.installments ? JSON.parse(JSON.stringify(viewSale.installments)) : []);
    setEditInstallmentsReason('');
    setIsEditingInstallments(true);
  };

  // Helper: Auto-split inside editor
  const handleTempAutoSplit = () => {
    if (!viewSale || viewSale.remainingAmount <= 0) return;
    const count = Math.max(1, splitCount);
    const baseAmount = Math.floor(viewSale.remainingAmount / count);
    const remainder = viewSale.remainingAmount - (baseAmount * count);
    const intervalDays = splitFreq === 'weekly' ? 7 : splitFreq === 'biweekly' ? 15 : 30;

    const generated: Installment[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date();
      d.setDate(d.getDate() + intervalDays * (i + 1));
      const trancheAmount = i === count - 1 ? baseAmount + remainder : baseAmount;
      generated.push({
        id: `inst_${Date.now()}_${i}`,
        amount: trancheAmount,
        dueDate: d.toISOString().split('T')[0],
        paid: false,
        note: `Tranche ${i + 1}/${count}`,
      });
    }
    setTempInstallments(generated);
  };

  // Filter Sales
  const filteredSales = sales.filter((s) => {
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.bonNumber.toLowerCase().includes(q) ||
      s.customerName.toLowerCase().includes(q) ||
      (s.customerPhone && s.customerPhone.includes(q)) ||
      s.items.some((i) => i.name.toLowerCase().includes(q) || (i.imei && i.imei.includes(q)));

    const matchesDate = !dateFilter || s.date === dateFilter;

    let matchesStatus = true;
    if (statusFilter === 'paid') {
      matchesStatus = s.remainingAmount === 0 && s.status !== 'returned';
    } else if (statusFilter === 'credit') {
      matchesStatus = s.remainingAmount > 0;
    } else if (statusFilter === 'returned') {
      matchesStatus = s.status === 'returned' || s.status === 'partially_returned';
    }

    return matchesSearch && matchesDate && matchesStatus;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-amber-400" />
            <span>{t.bons.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Recherchez, réimprimez et gérez les retours ou versements pour chaque bon de vente
          </p>
        </div>
      </div>

      {/* Filter Strip */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-neutral-900/70 border border-neutral-800">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="N° Bon, Client, IMEI, Produit..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
          />
        </div>

        {/* Date & Status Filters */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 focus:outline-hidden"
            />
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="text-[10px] text-amber-400 ps-1 hover:underline"
              >
                Effacer
              </button>
            )}
          </div>

          {/* Status buttons */}
          <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-lg border border-neutral-800 text-xs">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded transition ${
                statusFilter === 'all'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t.all}
            </button>
            <button
              onClick={() => setStatusFilter('paid')}
              className={`px-2.5 py-1 rounded transition ${
                statusFilter === 'paid'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t.bons.allPaid}
            </button>
            <button
              onClick={() => setStatusFilter('credit')}
              className={`px-2.5 py-1 rounded transition ${
                statusFilter === 'credit'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t.bons.hasCredit}
            </button>
            <button
              onClick={() => setStatusFilter('returned')}
              className={`px-2.5 py-1 rounded transition ${
                statusFilter === 'returned'
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t.bons.returnedStatus}
            </button>
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden">
        {filteredSales.length === 0 ? (
          <div className="py-16 text-center text-xs text-neutral-400">
            {t.noData}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead className="bg-neutral-950/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="py-3 px-4 text-start">{t.bons.bonNumber}</th>
                  <th className="py-3 px-4 text-start">{t.date}</th>
                  <th className="py-3 px-4 text-start">{t.bons.client}</th>
                  <th className="py-3 px-4 text-center">{t.bons.itemsCount}</th>
                  <th className="py-3 px-4 text-end">{t.total}</th>
                  <th className="py-3 px-4 text-end">{t.paid}</th>
                  <th className="py-3 px-4 text-end">{t.remaining}</th>
                  <th className="py-3 px-4 text-center">{t.status}</th>
                  <th className="py-3 px-4 text-center">{t.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-neutral-800/40 transition">
                    <td className="py-3 px-4 font-mono font-bold text-amber-400 whitespace-nowrap">
                      {sale.bonNumber}
                    </td>
                    <td className="py-3 px-4 text-neutral-400 whitespace-nowrap">
                      <div>{sale.date}</div>
                      {sale.remainingAmount > 0 && sale.dueDate && (() => {
                        const todayStr = new Date().toISOString().split('T')[0];
                        const in7Days = new Date();
                        in7Days.setDate(in7Days.getDate() + 7);
                        const in7DaysStr = in7Days.toISOString().split('T')[0];
                        const isLate = sale.dueDate < todayStr;
                        const isSoon = !isLate && sale.dueDate <= in7DaysStr;
                        return (
                          <div className="mt-1">
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                                isLate
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold'
                                  : isSoon
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium'
                                  : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                              }`}
                            >
                              <Clock className="w-2.5 h-2.5" />
                              <span>{sale.dueDate}</span>
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 font-semibold text-neutral-200">
                      <div>{sale.customerName}</div>
                      {sale.customerPhone && (
                        <div className="text-[10px] text-neutral-500 font-mono">
                          {sale.customerPhone}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-neutral-300">
                      {sale.items.length}
                    </td>
                    <td className="py-3 px-4 text-end font-mono font-bold text-neutral-100 whitespace-nowrap">
                      {formatMAD(sale.totalAmount, language)}
                    </td>
                    <td className="py-3 px-4 text-end font-mono text-emerald-400 whitespace-nowrap">
                      {formatMAD(sale.paidAmount, language)}
                    </td>
                    <td className="py-3 px-4 text-end font-mono whitespace-nowrap">
                      {sale.remainingAmount > 0 ? (
                        <span className="font-bold text-rose-400">
                          {formatMAD(sale.remainingAmount, language)}
                        </span>
                      ) : (
                        <span className="text-emerald-400 font-medium">0 DH</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {sale.status === 'returned' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                          Retourné
                        </span>
                      ) : sale.status === 'partially_returned' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          Partiel Retour
                        </span>
                      ) : sale.remainingAmount > 0 ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          Crédit
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Soldé
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewSale(sale)}
                          className="p-1 rounded text-neutral-400 hover:text-amber-400 transition"
                          title="Détails du bon"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePrintPdf(sale)}
                          className="p-1 rounded text-neutral-400 hover:text-neutral-200 transition"
                          title="Imprimer Facture A4"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        {(sale.hasWarranty || (sale.warrantyMonths && sale.warrantyMonths > 0)) && (
                          <button
                            onClick={() => handlePrintWarrantyPdf(sale)}
                            className="p-1 rounded text-neutral-400 hover:text-emerald-400 transition"
                            title="Imprimer Certificat de Garantie A4"
                          >
                            <ShieldCheck className="w-4 h-4" />
                          </button>
                        )}
                        {sale.remainingAmount > 0 && sale.customerId && (
                          <button
                            onClick={() => {
                              setPaymentSale(sale);
                              setPaymentAmount(sale.remainingAmount);
                            }}
                            className="p-1 rounded text-neutral-400 hover:text-emerald-400 transition"
                            title={t.bons.registerPayment}
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detailed Bon View Modal */}
      {viewSale && (
        <Modal
          isOpen={!!viewSale}
          onClose={() => setViewSale(null)}
          title={`Détail Bon : ${viewSale.bonNumber}`}
          maxWidth="2xl"
        >
          <div className="space-y-4 text-xs">
            {/* Header info */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <div>
                <span className="text-neutral-500 block">Date</span>
                <span className="font-semibold text-neutral-200">{viewSale.date}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Client</span>
                <span className="font-semibold text-neutral-200">{viewSale.customerName}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Règlement</span>
                <span className="font-semibold text-neutral-200 capitalize">{viewSale.paymentType}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Garantie Magasin</span>
                <span className={`font-semibold ${(viewSale.hasWarranty || (viewSale.warrantyMonths && viewSale.warrantyMonths > 0)) ? 'text-amber-400' : 'text-neutral-500'}`}>
                  {(viewSale.hasWarranty || (viewSale.warrantyMonths && viewSale.warrantyMonths > 0))
                    ? `${viewSale.warrantyMonths} mois`
                    : 'Sans garantie'}
                </span>
              </div>
            </div>

            {/* Items list with individual Return action */}
            <div>
              <h4 className="font-bold text-neutral-200 mb-2">Articles vendus</h4>
              <div className="space-y-2">
                {viewSale.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-semibold text-neutral-100 flex items-center gap-2">
                        <span>{item.name}</span>
                        {item.isReturned && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400">
                            RETOURNÉ
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-neutral-400 mt-0.5 flex items-center gap-3">
                        {item.imei && <span className="font-mono text-amber-300">IMEI: {item.imei}</span>}
                        <span>Qté: {item.quantity}</span>
                        <span>@ {formatMAD(item.price, language)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-neutral-100">
                        {formatMAD(item.price * item.quantity, language)}
                      </span>
                      {!item.isReturned && viewSale.status !== 'returned' && (
                        <button
                          type="button"
                          onClick={() => {
                            setReturnSale(viewSale);
                            setReturnItemIndex(idx);
                          }}
                          className="px-2 py-1 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded border border-rose-500/30 transition flex items-center gap-1"
                          title="Retourner cet article"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retour</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary with Discount Support */}
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-1.5 text-xs font-mono">
              {viewSale.discountAmount && viewSale.discountAmount > 0 ? (
                <div className="flex justify-between items-center text-neutral-400 pb-1 border-b border-neutral-800/80">
                  <span>Sous-total : {formatMAD(viewSale.subtotal ?? (viewSale.totalAmount + viewSale.discountAmount), language)}</span>
                  <span className="text-rose-400 font-semibold">
                    Remise {viewSale.discountType === 'percent' && viewSale.discountValue ? `(${viewSale.discountValue}%)` : ''} : - {formatMAD(viewSale.discountAmount, language)}
                  </span>
                </div>
              ) : null}

              <div className="flex justify-between items-center pt-0.5">
                <span className="text-neutral-300 font-bold">Total Net : <strong className="text-amber-400">{formatMAD(viewSale.totalAmount, language)}</strong></span>
                <span className="text-emerald-400">Payé : <strong>{formatMAD(viewSale.paidAmount, language)}</strong></span>
                <span className={viewSale.remainingAmount > 0 ? 'text-rose-400 font-bold' : 'text-neutral-400'}>
                  Reste : <strong>{formatMAD(viewSale.remainingAmount, language)}</strong>
                </span>
              </div>
            </div>

            {viewSale.notes && (
              <div className="p-2.5 rounded bg-neutral-950 text-neutral-400 text-xs italic">
                Notes : {viewSale.notes}
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => handlePrintPdf(viewSale)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Facture (A4)</span>
              </button>

              {(viewSale.hasWarranty || (viewSale.warrantyMonths && viewSale.warrantyMonths > 0)) && (
                <button
                  type="button"
                  onClick={() => handlePrintWarrantyPdf(viewSale)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Imprimer Garantie (A4)</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Return Item Confirm Modal */}
      {returnSale && returnItemIndex !== null && (
        <Modal
          isOpen={true}
          onClose={() => {
            setReturnSale(null);
            setReturnItemIndex(null);
          }}
          title={t.bons.returnItems}
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">Confirmation de retour article</p>
                <p className="mt-1 text-neutral-300 text-[11px] leading-relaxed">
                  {t.bons.returnConfirm}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800">
              <span className="text-neutral-400">Article concerné : </span>
              <span className="font-bold text-neutral-100">
                {returnSale.items[returnItemIndex]?.name}
              </span>
              {returnSale.items[returnItemIndex]?.imei && (
                <div className="font-mono text-amber-400 mt-1">
                  IMEI: {returnSale.items[returnItemIndex]?.imei}
                </div>
              )}
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Motif du retour</label>
              <input
                type="text"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="ex: Changement d'avis client, défaut appareil..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReturnSale(null);
                  setReturnItemIndex(null);
                }}
                className="px-3 py-2 rounded-lg bg-neutral-800 text-neutral-300"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmReturn}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 font-bold text-white shadow-sm"
              >
                Confirmer le retour
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Register Payment Modal */}
      {paymentSale && (
        <Modal
          isOpen={true}
          onClose={() => setPaymentSale(null)}
          title={`Encaisser un Paiement - Bon ${paymentSale.bonNumber}`}
          maxWidth="md"
        >
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">Solde restant sur ce bon :</span>
              <span className="font-bold text-rose-400 text-sm">
                {formatMAD(paymentSale.remainingAmount, language)}
              </span>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                {t.bons.paymentAmount} (DH) *
              </label>
              <input
                type="number"
                min="1"
                step="0.01"
                max={paymentSale.remainingAmount}
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-emerald-400"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">
                Note / Référence versement
              </label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="ex: Espèces reçu au comptoir..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentSale(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
              >
                Enregistrer le versement
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
