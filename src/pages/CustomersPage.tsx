import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Users,
  Search,
  Plus,
  CreditCard,
  History,
  Edit,
  Trash2,
  Phone,
  FileText,
  MapPin,
  CheckCircle,
} from 'lucide-react';
import { db, registerCustomerPaymentTransaction } from '../db';
import { Customer, CustomerPayment } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';

interface CustomersPageProps {
  initialSearch?: string;
}

export const CustomersPage: React.FC<CustomersPageProps> = ({ initialSearch }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();

  const [search, setSearch] = useState(initialSearch || '');

  // Add / Edit Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [cin, setCin] = useState('');
  const [address, setAddress] = useState('');

  // Payment Modal
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentNote, setPaymentNote] = useState('');

  // Payment History Modal
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  // Delete Customer
  const [deleteCustomerId, setDeleteCustomerId] = useState<number | null>(null);

  // Live queries
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const payments = useLiveQuery(() => db.customerPayments.toArray(), []) || [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) || [];

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setCin('');
    setAddress('');
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setName(c.name);
    setPhone(c.phone);
    setCin(c.CIN || '');
    setAddress(c.address || '');
    setIsEditModalOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      error("Nom et numéro de téléphone obligatoires.");
      return;
    }

    try {
      if (editingCustomer?.id) {
        await db.customers.update(editingCustomer.id, {
          name: name.trim(),
          phone: phone.trim(),
          CIN: cin.trim() || undefined,
          address: address.trim() || undefined,
        });
        success("Fiche client mise à jour.");
      } else {
        await db.customers.add({
          name: name.trim(),
          phone: phone.trim(),
          CIN: cin.trim() || undefined,
          address: address.trim() || undefined,
          totalCredit: 0,
        });
        success("Nouveau client ajouté.");
      }
      setIsEditModalOpen(false);
    } catch {
      error("Erreur lors de l'enregistrement du client.");
    }
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer?.id || paymentAmount <= 0) return;

    try {
      await registerCustomerPaymentTransaction(
        paymentCustomer.id,
        paymentAmount,
        new Date().toISOString().split('T')[0],
        paymentNote.trim() || 'Règlement crédit au magasin'
      );
      success("Versement client enregistré avec succès.");
      setPaymentCustomer(null);
      setPaymentAmount(0);
      setPaymentNote('');
    } catch (err: any) {
      error(err.message || "Erreur lors de l'enregistrement du versement.");
    }
  };

  const handleDeleteCustomer = async () => {
    if (!deleteCustomerId) return;
    try {
      // Check if linked to sales
      const hasSales = sales.some((s) => s.customerId === deleteCustomerId);
      if (hasSales) {
        error("Impossible de supprimer ce client car des bons de vente y sont associés.");
        setDeleteCustomerId(null);
        return;
      }
      await db.customers.delete(deleteCustomerId);
      success("Client supprimé avec succès.");
      setDeleteCustomerId(null);
    } catch {
      error("Erreur lors de la suppression.");
    }
  };

  // Filter customers
  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.CIN && c.CIN.toLowerCase().includes(q))
    );
  });

  const totalOwedOverall = customers.reduce((sum, c) => sum + (c.totalCredit || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <span>{t.customers.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Total crédit en cours :{' '}
            <span className="font-mono font-bold text-amber-400">
              {formatMAD(totalOwedOverall, language)}
            </span>
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition shadow-sm shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t.customers.addCustomer}</span>
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
            placeholder="Rechercher par nom, téléphone, CIN..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Customers Cards Grid */}
      {filteredCustomers.length === 0 ? (
        <div className="py-16 text-center text-xs text-neutral-500 bg-neutral-900/40 rounded-xl border border-neutral-800">
          {t.noData}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCustomers.map((cust) => {
            const hasCredit = cust.totalCredit > 0;
            return (
              <div
                key={cust.id}
                className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between space-y-4 hover:border-neutral-700 transition"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-neutral-100">{cust.name}</h3>
                      <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1.5 font-mono">
                        <Phone className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{cust.phone}</span>
                      </div>
                    </div>
                    {cust.CIN && (
                      <span className="font-mono text-[10px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded border border-neutral-700">
                        {cust.CIN}
                      </span>
                    )}
                  </div>

                  {cust.address && (
                    <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-neutral-600 shrink-0" />
                      <span className="truncate">{cust.address}</span>
                    </div>
                  )}

                  {/* Credit Balance Box */}
                  <div className="mt-4 p-3 rounded-lg bg-neutral-950 border border-neutral-800/80 flex items-center justify-between text-xs">
                    <span className="text-neutral-400">{t.customers.totalCreditOwed} :</span>
                    <span
                      className={`font-mono font-bold text-sm ${
                        hasCredit ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatMAD(cust.totalCredit, language)}
                    </span>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {hasCredit && (
                      <button
                        onClick={() => {
                          setPaymentCustomer(cust);
                          setPaymentAmount(cust.totalCredit);
                        }}
                        className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition flex items-center gap-1"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>Régler</span>
                      </button>
                    )}
                    <button
                      onClick={() => setHistoryCustomer(cust)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-amber-400 hover:bg-neutral-800 transition"
                      title={t.customers.paymentHistory}
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(cust)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition"
                      title={t.edit}
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteCustomerId(cust.id!)}
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

      {/* Add / Edit Customer Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editingCustomer?.id ? "Modifier le Client" : t.customers.addCustomer}
        maxWidth="md"
      >
        <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Nom Complet *</label>
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
              placeholder="+212 6..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Numéro CIN</label>
            <input
              type="text"
              value={cin}
              onChange={(e) => setCin(e.target.value)}
              placeholder="ex: BE458921"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
            />
          </div>
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Adresse</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: Quartier Maârif, Casablanca"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
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
      {paymentCustomer && (
        <Modal
          isOpen={true}
          onClose={() => setPaymentCustomer(null)}
          title={`Encaisser Versement - ${paymentCustomer.name}`}
          maxWidth="md"
        >
          <form onSubmit={handleSavePayment} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center font-mono">
              <span className="text-neutral-400">Total crédit actuel :</span>
              <span className="font-bold text-rose-400 text-sm">
                {formatMAD(paymentCustomer.totalCredit, language)}
              </span>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Montant versé (DH) *</label>
              <input
                type="number"
                min="1"
                step="0.01"
                max={paymentCustomer.totalCredit}
                required
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-emerald-400"
              />
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1">Note de versement</label>
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
                onClick={() => setPaymentCustomer(null)}
                className="px-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-sm"
              >
                Valider le versement
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Customer Payment History Modal */}
      {historyCustomer && (
        <Modal
          isOpen={true}
          onClose={() => setHistoryCustomer(null)}
          title={`Historique des Règlements : ${historyCustomer.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex justify-between items-center">
              <div>
                <span className="text-neutral-400">Total Crédit Restant : </span>
                <span className="font-mono font-bold text-rose-400">
                  {formatMAD(historyCustomer.totalCredit, language)}
                </span>
              </div>
            </div>

            {/* List payments */}
            {payments.filter((p) => p.customerId === historyCustomer.id).length === 0 ? (
              <p className="text-center py-6 text-neutral-500 italic">
                Aucun versement enregistré pour ce client.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {payments
                  .filter((p) => p.customerId === historyCustomer.id)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between font-mono"
                    >
                      <div>
                        <div className="font-bold text-emerald-400">
                          +{formatMAD(p.amount, language)}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-sans mt-0.5">
                          {p.note || 'Versement'}
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
        isOpen={!!deleteCustomerId}
        onClose={() => setDeleteCustomerId(null)}
        onConfirm={handleDeleteCustomer}
        title="Supprimer la fiche client"
        message="Êtes-vous sûr de vouloir supprimer ce client ? Cette action est irréversible."
        isDestructive={true}
      />
    </div>
  );
};
