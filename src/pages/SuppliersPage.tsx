import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Truck,
  Search,
  Plus,
  CreditCard,
  History,
  Edit,
  Trash2,
  Phone,
  MapPin,
} from 'lucide-react';
import { db, registerSupplierPaymentTransaction } from '../db';
import { Supplier, SupplierPayment } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';

export const SuppliersPage: React.FC = () => {
  const { t, language } = useI18n();
  const { success, error } = useToast();

  const [search, setSearch] = useState('');

  // Add / Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [totalDebt, setTotalDebt] = useState<number>(0);

  // Payment Modal
  const [paymentSupplier, setPaymentSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');

  // History Modal
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null);

  // Delete
  const [deleteSupplierId, setDeleteSupplierId] = useState<number | null>(null);

  // Live queries
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) || [];
  const payments = useLiveQuery(() => db.supplierPayments.toArray(), []) || [];
  const products = useLiveQuery(() => db.products.toArray(), []) || [];

  const handleOpenAdd = () => {
    setEditingSupplier(null);
    setName('');
    setPhone('');
    setAddress('');
    setTotalDebt(0);
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (s: Supplier) => {
    setEditingSupplier(s);
    setName(s.name);
    setPhone(s.phone);
    setAddress(s.address || '');
    setTotalDebt(s.totalDebt);
    setIsEditModalOpen(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      error("Nom et téléphone obligatoires.");
      return;
    }

    try {
      if (editingSupplier?.id) {
        await db.suppliers.update(editingSupplier.id, {
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          totalDebt: Number(totalDebt) || 0,
        });
        success("Fournisseur mis à jour.");
      } else {
        await db.suppliers.add({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          totalDebt: Number(totalDebt) || 0,
          paidAmount: 0,
        });
        success("Nouveau fournisseur ajouté.");
      }
      setIsEditModalOpen(false);
    } catch {
      error("Erreur lors de l'enregistrement du fournisseur.");
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentSupplier?.id || paymentAmount <= 0) return;

    try {
      await registerSupplierPaymentTransaction(
        paymentSupplier.id,
        paymentAmount,
        new Date().toISOString().split('T')[0],
        paymentNote.trim() || 'Versement facture fournisseur'
      );
      success("Versement fournisseur enregistré avec succès.");
      setPaymentSupplier(null);
      setPaymentAmount(0);
      setPaymentNote('');
    } catch (err: any) {
      error(err.message || "Erreur lors du versement.");
    }
  };

  const handleDeleteSupplier = async () => {
    if (!deleteSupplierId) return;
    try {
      const hasProducts = products.some((p) => p.supplierId === deleteSupplierId);
      if (hasProducts) {
        error("Impossible de supprimer ce fournisseur car des produits en stock y sont rattachés.");
        setDeleteSupplierId(null);
        return;
      }
      await db.suppliers.delete(deleteSupplierId);
      success("Fournisseur supprimé.");
      setDeleteSupplierId(null);
    } catch {
      error("Erreur lors de la suppression.");
    }
  };

  // Filter
  const filteredSuppliers = suppliers.filter((s) => {
    const q = search.toLowerCase().trim();
    return !q || s.name.toLowerCase().includes(q) || s.phone.includes(q);
  });

  const totalBalanceOwed = suppliers.reduce(
    (sum, s) => sum + Math.max(0, s.totalDebt - s.paidAmount),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" />
            <span>{t.suppliers.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Total solde dû aux fournisseurs :{' '}
            <span className="font-mono font-bold text-amber-400">
              {formatMAD(totalBalanceOwed, language)}
            </span>
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.suppliers.addSupplier}</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="p-4 rounded-xl bg-neutral-900/70 border border-neutral-800">
        <div className="relative w-full max-w-md">
          <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un fournisseur..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Suppliers Grid */}
      {filteredSuppliers.length === 0 ? (
        <div className="py-16 text-center text-xs text-neutral-500 bg-neutral-900/40 rounded-xl border border-neutral-800">
          {t.noData}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSuppliers.map((sup) => {
            const balanceOwed = Math.max(0, sup.totalDebt - sup.paidAmount);
            return (
              <div
                key={sup.id}
                className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between space-y-4 hover:border-neutral-700 transition"
              >
                <div>
                  <h3 className="text-sm font-bold text-neutral-100">{sup.name}</h3>
                  <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5 font-mono">
                    <Phone className="w-3.5 h-3.5 text-neutral-500" />
                    <span>{sup.phone}</span>
                  </div>
                  {sup.address && (
                    <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                      <span className="truncate">{sup.address}</span>
                    </div>
                  )}

                  {/* Balances Box */}
                  <div className="mt-4 p-3 rounded-lg bg-neutral-950 border border-neutral-800/80 space-y-1.5 text-xs">
                    <div className="flex justify-between text-neutral-400">
                      <span>Total facturé :</span>
                      <span className="font-mono">{formatMAD(sup.totalDebt, language)}</span>
                    </div>
                    <div className="flex justify-between text-neutral-400">
                      <span>Total réglé :</span>
                      <span className="font-mono text-emerald-400">
                        {formatMAD(sup.paidAmount, language)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-neutral-800 font-bold">
                      <span className="text-neutral-300">{t.suppliers.balanceOwed} :</span>
                      <span
                        className={`font-mono ${
                          balanceOwed > 0 ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatMAD(balanceOwed, language)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {balanceOwed > 0 && (
                      <button
                        onClick={() => {
                          setPaymentSupplier(sup);
                          setPaymentAmount(balanceOwed);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded-lg transition flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Verser</span>
                      </button>
                    )}
                    <button
                      onClick={() => setHistorySupplier(sup)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 transition"
                      title={t.suppliers.paymentHistory}
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(sup)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition"
                      title={t.edit}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteSupplierId(sup.id!)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
                      title={t.delete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editingSupplier?.id ? "Modifier le Fournisseur" : t.suppliers.addSupplier}
        maxWidth="md"
      >
        <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Nom / Société *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Téléphone *</label>
            <input
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+212 5..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Adresse</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: Derb Ghallef, Casablanca"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Total Facturé (DH)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={totalDebt}
              onChange={(e) => setTotalDebt(parseFloat(e.target.value) || 0)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              {t.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Register Payment Modal */}
      {paymentSupplier && (
        <Modal
          isOpen={true}
          onClose={() => setPaymentSupplier(null)}
          title={`Enregistrer Versement Fournisseur - ${paymentSupplier.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">Solde restant dû :</span>
              <span className="font-bold text-amber-400 text-sm">
                {formatMAD(Math.max(0, paymentSupplier.totalDebt - paymentSupplier.paidAmount), language)}
              </span>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Montant à verser (DH) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-amber-400"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Mode / Référence règlement</label>
              <input
                type="text"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="ex: Virement bancaire, chèque N°..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPaymentSupplier(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg shadow-sm"
              >
                Valider le versement
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Supplier Payment History Modal */}
      {historySupplier && (
        <Modal
          isOpen={true}
          onClose={() => setHistorySupplier(null)}
          title={`Historique des Versements : ${historySupplier.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">Total Réglé : </span>
              <span className="font-bold text-emerald-400">
                {formatMAD(historySupplier.paidAmount, language)}
              </span>
            </div>

            {payments.filter((p) => p.supplierId === historySupplier.id).length === 0 ? (
              <p className="text-center py-6 text-neutral-500 italic">
                Aucun versement enregistré pour ce fournisseur.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {payments
                  .filter((p) => p.supplierId === historySupplier.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between font-mono"
                    >
                      <div>
                        <div className="font-bold text-emerald-400">
                          {formatMAD(p.amount, language)}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                          {p.note || 'Règlement fournisseur'}
                        </div>
                      </div>
                      <span className="text-neutral-500 text-xs">{p.date}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deleteSupplierId}
        onClose={() => setDeleteSupplierId(null)}
        onConfirm={handleDeleteSupplier}
        title="Supprimer le fournisseur"
        message="Êtes-vous sûr de vouloir supprimer ce fournisseur ?"
        isDestructive={true}
      />
    </div>
  );
};
