import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Boxes,
  Plus,
  Search,
  LayoutGrid,
  List,
  Edit,
  Trash2,
  History,
  Smartphone,
  Upload,
  AlertTriangle,
  X,
  Check,
} from 'lucide-react';
import { db, checkImeiUnique, deleteProductTransaction } from '../db';
import { Product, ProductCategory, IMEIItem, Supplier } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { compressImage } from '../lib/image';

interface StockPageProps {
  initialSearch?: string;
  initialAction?: 'add';
}

export const StockPage: React.FC<StockPageProps> = ({ initialSearch, initialAction }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();

  const [search, setSearch] = useState(initialSearch || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(initialAction === 'add');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [deleteProductId, setDeleteProductId] = useState<number | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<ProductCategory>('phone');
  const [formPurchasePrice, setFormPurchasePrice] = useState<number>(0);
  const [formRetailPrice, setFormRetailPrice] = useState<number>(0);
  const [formWholesalePrice, setFormWholesalePrice] = useState<number>(0);
  const [formQuantity, setFormQuantity] = useState<number>(1);
  const [formSupplierId, setFormSupplierId] = useState<number | undefined>(undefined);
  const [formBarcode, setFormBarcode] = useState('');
  const [formImage, setFormImage] = useState<string | undefined>(undefined);
  const [formNotes, setFormNotes] = useState('');

  // IMEI state for phones
  const [formImeiList, setFormImeiList] = useState<IMEIItem[]>([]);
  const [singleImeiInput, setSingleImeiInput] = useState('');
  const [multiImeiInput, setMultiImeiInput] = useState('');
  const [showMultiImeiModal, setShowMultiImeiModal] = useState(false);

  // Live queries from Dexie
  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) || [];
  const sales = useLiveQuery(() => db.sales.toArray(), []) || [];

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);

  const resetForm = () => {
    setEditingProduct(null);
    setFormName('');
    setFormCategory('phone');
    setFormPurchasePrice(0);
    setFormRetailPrice(0);
    setFormWholesalePrice(0);
    setFormQuantity(1);
    setFormSupplierId(undefined);
    setFormBarcode('');
    setFormImage(undefined);
    setFormNotes('');
    setFormImeiList([]);
    setSingleImeiInput('');
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsEditModalOpen(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setFormName(p.name);
    setFormCategory(p.category);
    setFormPurchasePrice(p.purchasePrice);
    setFormRetailPrice(p.retailPrice);
    setFormWholesalePrice(p.wholesalePrice);
    setFormQuantity(p.quantity);
    setFormSupplierId(p.supplierId);
    setFormBarcode(p.barcode || '');
    setFormImage(p.image);
    setFormNotes(p.notes || '');
    setFormImeiList(p.imeiList ? [...p.imeiList] : []);
    setIsEditModalOpen(true);
  };

  // Handle single IMEI add
  const handleAddSingleImei = async () => {
    const imei = singleImeiInput.trim();
    if (!imei) return;

    if (imei.length !== 15 || !/^\d{15}$/.test(imei)) {
      error(t.stock.invalidImeiLength);
      return;
    }

    // Check duplicate in current form
    if (formImeiList.some((i) => i.imei === imei)) {
      error(t.stock.duplicateImeiError);
      return;
    }

    // Check duplicate across DB
    const isUnique = await checkImeiUnique(imei, editingProduct?.id);
    if (!isUnique) {
      error(t.stock.duplicateImeiError);
      return;
    }

    const updated = [...formImeiList, { imei, status: 'in_stock' as const }];
    setFormImeiList(updated);
    setSingleImeiInput('');
  };

  // Handle multi IMEI paste
  const handleAddMultiImei = async () => {
    const lines = multiImeiInput
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let addedCount = 0;
    const newItems = [...formImeiList];

    for (const imei of lines) {
      if (imei.length === 15 && /^\d{15}$/.test(imei)) {
        if (!newItems.some((i) => i.imei === imei)) {
          const isUnique = await checkImeiUnique(imei, editingProduct?.id);
          if (isUnique) {
            newItems.push({ imei, status: 'in_stock' });
            addedCount++;
          }
        }
      }
    }

    setFormImeiList(newItems);
    setMultiImeiInput('');
    setShowMultiImeiModal(false);
    success(`${addedCount} IMEIs ajoutés avec succès.`);
  };

  const handleRemoveImei = (index: number) => {
    const updated = formImeiList.filter((_, idx) => idx !== index);
    setFormImeiList(updated);
  };

  // Handle Image Upload & Compression
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 400, 0.85);
      setFormImage(compressed);
      success("Photo compressée avec succès.");
    } catch {
      error("Erreur lors de la compression de la photo.");
    }
  };

  // Save product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      error("Veuillez saisir un nom de produit.");
      return;
    }

    // Derived quantity for phones
    const derivedQuantity =
      formCategory === 'phone'
        ? formImeiList.filter((i) => i.status === 'in_stock').length
        : Math.max(0, formQuantity);

    const productPayload: Product = {
      name: formName.trim(),
      category: formCategory,
      purchasePrice: Number(formPurchasePrice) || 0,
      retailPrice: Number(formRetailPrice) || 0,
      wholesalePrice: Number(formWholesalePrice) || 0,
      quantity: derivedQuantity,
      supplierId: formSupplierId ? Number(formSupplierId) : undefined,
      barcode: formBarcode.trim() || undefined,
      image: formImage,
      notes: formNotes.trim() || undefined,
      imeiList: formCategory === 'phone' ? formImeiList : [],
      createdAt: editingProduct?.createdAt || new Date().toISOString().split('T')[0],
    };

    try {
      if (editingProduct?.id) {
        await db.products.put({ ...productPayload, id: editingProduct.id });
        success("Produit mis à jour avec succès.");
      } else {
        await db.products.add(productPayload);
        success("Nouveau produit ajouté au stock.");
      }
      setIsEditModalOpen(false);
      resetForm();
    } catch (err: any) {
      error(err.message || "Erreur lors de l'enregistrement.");
    }
  };

  // Delete product
  const handleConfirmDelete = async () => {
    if (!deleteProductId) return;
    try {
      await deleteProductTransaction(deleteProductId);
      success("Produit supprimé du stock.");
      setDeleteProductId(null);
    } catch (err: any) {
      error(err.message || t.stock.cantDeleteLinked);
    }
  };

  // Filtering
  const filteredProducts = products.filter((p) => {
    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
    const q = search.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.imeiList && p.imeiList.some((i) => i.imei.includes(q)));
    return matchesCategory && matchesSearch;
  });

  // Quantity Badge styling
  const getQuantityBadge = (qty: number) => {
    if (qty < 5) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          {qty} en stock
        </span>
      );
    }
    if (qty < 10) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
          {qty} en stock
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        {qty} en stock
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Boxes className="w-5 h-5 text-amber-400" />
            <span>{t.stock.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {filteredProducts.length} articles disponibles
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* View mode toggle */}
          <div className="flex items-center bg-neutral-800 p-1 rounded-lg border border-neutral-700">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded transition ${
                viewMode === 'grid' ? 'bg-amber-500 text-neutral-950 font-bold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Vue Grille"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded transition ${
                viewMode === 'table' ? 'bg-amber-500 text-neutral-950 font-bold' : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="Vue Tableau"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>{t.stock.addProduct}</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-neutral-900/70 border border-neutral-800">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nom, IMEI, code-barres..."
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
          />
        </div>

        {/* Category Pills (Functional filter tabs) */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-neutral-950 font-bold'
                : 'bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
            }`}
          >
            {t.all}
          </button>
          {(['phone', 'accessory', 'tv', 'trotinette', 'other'] as ProductCategory[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-neutral-950 font-bold'
                  : 'bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'
              }`}
            >
              {t.stock.categories[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Product Content: Grid View or Table View */}
      {filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-neutral-900/40 rounded-xl border border-neutral-800 text-neutral-400 text-xs">
          {t.noData}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden flex flex-col justify-between hover:border-neutral-700 transition group"
            >
              <div>
                {/* Product Image / Fallback Container */}
                <div className="h-44 bg-neutral-950 relative overflow-hidden flex items-center justify-center border-b border-neutral-800">
                  {p.image ? (
                    <img
                      src={p.image}
                      alt={p.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-neutral-600 gap-1.5">
                      <Smartphone className="w-10 h-10 text-neutral-700" />
                      <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-500">
                        {p.category}
                      </span>
                    </div>
                  )}
                  <div className="absolute top-2 end-2">
                    {getQuantityBadge(p.quantity)}
                  </div>
                </div>

                {/* Details */}
                <div className="p-4 space-y-2">
                  <div className="text-xs text-neutral-500 uppercase tracking-wider font-semibold">
                    {t.stock.categories[p.category]}
                  </div>
                  <h3 className="text-sm font-bold text-neutral-100 line-clamp-1" title={p.name}>
                    {p.name}
                  </h3>

                  {p.barcode && (
                    <div className="text-[11px] font-mono text-neutral-400">
                      Réf: {p.barcode}
                    </div>
                  )}

                  {/* Pricing strip */}
                  <div className="pt-2 border-t border-neutral-800/80 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-neutral-500">Détail</div>
                      <div className="font-mono font-bold text-amber-400">
                        {formatMAD(p.retailPrice, language)}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="text-[10px] text-neutral-500">Gros</div>
                      <div className="font-mono font-semibold text-neutral-300">
                        {formatMAD(p.wholesalePrice, language)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons Strip */}
              <div className="px-4 py-3 bg-neutral-950/60 border-t border-neutral-800 flex items-center justify-between">
                <button
                  onClick={() => setHistoryProduct(p)}
                  className="flex items-center gap-1 text-[11px] text-neutral-400 hover:text-amber-400 transition"
                  title={t.stock.viewHistory}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Historique</span>
                </button>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(p)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition"
                    title={t.edit}
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteProductId(p.id!)}
                    className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-400 hover:bg-neutral-800 transition"
                    title={t.delete}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-xl bg-neutral-900 border border-neutral-800 overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-neutral-950/80 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-3 px-4 text-start">{t.stock.productName}</th>
                <th className="py-3 px-4 text-start">{t.stock.category}</th>
                <th className="py-3 px-4 text-center">{t.stock.quantity}</th>
                <th className="py-3 px-4 text-end">{t.stock.purchasePrice}</th>
                <th className="py-3 px-4 text-end">{t.stock.retailPrice}</th>
                <th className="py-3 px-4 text-end">{t.stock.wholesalePrice}</th>
                <th className="py-3 px-4 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-neutral-800/40 transition">
                  <td className="py-3 px-4 font-semibold text-neutral-100 flex items-center gap-3">
                    {p.image ? (
                      <img
                        src={p.image}
                        alt=""
                        className="w-8 h-8 rounded object-cover border border-neutral-700 shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-neutral-800 flex items-center justify-center shrink-0 text-neutral-500">
                        <Smartphone className="w-4 h-4" />
                      </div>
                    )}
                    <div>
                      <div>{p.name}</div>
                      {p.barcode && <div className="text-[10px] text-neutral-500 font-mono">{p.barcode}</div>}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-neutral-400">
                    {t.stock.categories[p.category]}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    {getQuantityBadge(p.quantity)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono text-neutral-400 whitespace-nowrap">
                    {formatMAD(p.purchasePrice, language)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono font-bold text-amber-400 whitespace-nowrap">
                    {formatMAD(p.retailPrice, language)}
                  </td>
                  <td className="py-3 px-4 text-end font-mono text-neutral-300 whitespace-nowrap">
                    {formatMAD(p.wholesalePrice, language)}
                  </td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => setHistoryProduct(p)}
                        className="p-1 rounded text-neutral-400 hover:text-amber-400 transition"
                        title={t.stock.viewHistory}
                      >
                        <History className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1 rounded text-neutral-400 hover:text-neutral-200 transition"
                        title={t.edit}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteProductId(p.id!)}
                        className="p-1 rounded text-neutral-400 hover:text-rose-400 transition"
                        title={t.delete}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editingProduct?.id ? t.stock.editProduct : t.stock.addProduct}
        maxWidth="2xl"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Designation */}
            <div className="md:col-span-2">
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.productName} *
              </label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="ex: iPhone 15 Pro Max 256GB"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.category}
              </label>
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value as ProductCategory)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              >
                <option value="phone">{t.stock.categories.phone}</option>
                <option value="accessory">{t.stock.categories.accessory}</option>
                <option value="tv">{t.stock.categories.tv}</option>
                <option value="trotinette">{t.stock.categories.trotinette}</option>
                <option value="other">{t.stock.categories.other}</option>
              </select>
            </div>

            {/* Supplier */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.supplier}
              </label>
              <select
                value={formSupplierId || ''}
                onChange={(e) => setFormSupplierId(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50"
              >
                <option value="">Aucun fournisseur sélectionné</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Purchase Price */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.purchasePrice} (DH) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formPurchasePrice || ''}
                onChange={(e) => setFormPurchasePrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Retail Price */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.retailPrice} (DH) *
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={formRetailPrice || ''}
                onChange={(e) => setFormRetailPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono font-bold text-amber-400 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Wholesale Price */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.wholesalePrice} (DH)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formWholesalePrice || ''}
                onChange={(e) => setFormWholesalePrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Quantity (disabled if category = phone) */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.quantity} {formCategory === 'phone' && '(Calculée des IMEI)'}
              </label>
              <input
                type="number"
                min="0"
                disabled={formCategory === 'phone'}
                value={
                  formCategory === 'phone'
                    ? formImeiList.filter((i) => i.status === 'in_stock').length
                    : formQuantity
                }
                onChange={(e) => setFormQuantity(parseInt(e.target.value, 10) || 0)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono disabled:opacity-60 disabled:cursor-not-allowed focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Barcode */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.barcode}
              </label>
              <input
                type="text"
                value={formBarcode}
                onChange={(e) => setFormBarcode(e.target.value)}
                placeholder="ex: 195949012831"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Image Upload with Compression */}
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                {t.stock.image}
              </label>
              <div className="flex items-center gap-3">
                {formImage ? (
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-neutral-700 shrink-0">
                    <img src={formImage} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormImage(undefined)}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 text-rose-400 transition"
                      title={t.stock.removeImage}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-neutral-950 border border-dashed border-neutral-800 flex items-center justify-center text-neutral-600 shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                )}
                <label className="flex-1 cursor-pointer">
                  <span className="block px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-center text-neutral-300 font-medium transition">
                    {formImage ? t.stock.changeImage : t.stock.uploadImage}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Special IMEI Management Section for Phones */}
          {formCategory === 'phone' && (
            <div className="p-4 rounded-xl bg-neutral-950/70 border border-neutral-800 space-y-3 mt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-amber-400 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4" />
                    <span>{t.stock.imeiManagement}</span>
                  </h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {t.stock.imeiHelper}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMultiImeiModal(true)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-amber-400 rounded-md border border-neutral-700"
                >
                  {t.stock.pasteMultipleImei}
                </button>
              </div>

              {/* Single IMEI input row */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={15}
                  value={singleImeiInput}
                  onChange={(e) => setSingleImeiInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="359876543210123 (15 chiffres)"
                  className="flex-1 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono tracking-wider focus:outline-hidden focus:border-amber-500/50"
                />
                <button
                  type="button"
                  onClick={handleAddSingleImei}
                  disabled={singleImeiInput.trim().length !== 15}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold rounded-lg transition"
                >
                  {t.stock.addImei}
                </button>
              </div>

              {/* List of current IMEIs */}
              <div className="max-h-36 overflow-y-auto space-y-1.5 pt-2">
                {formImeiList.length === 0 ? (
                  <p className="text-[11px] text-neutral-500 italic">
                    Aucun IMEI enregistré pour le moment.
                  </p>
                ) : (
                  formImeiList.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 font-mono text-[11px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-neutral-500">#{idx + 1}</span>
                        <span className="text-neutral-200">{item.imei}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            item.status === 'in_stock'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {item.status === 'in_stock' ? t.stock.inStock : t.stock.sold}
                        </span>
                        {item.status === 'in_stock' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveImei(idx)}
                            className="text-neutral-500 hover:text-rose-400 transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-neutral-300 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold text-neutral-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition shadow-sm"
            >
              {t.save}
            </button>
          </div>
        </form>
      </Modal>

      {/* Paste Multi-IMEI Modal */}
      <Modal
        isOpen={showMultiImeiModal}
        onClose={() => setShowMultiImeiModal(false)}
        title={t.stock.pasteMultipleImei}
        maxWidth="md"
      >
        <div className="space-y-3 text-xs">
          <p className="text-neutral-400">
            Collez un numéro IMEI de 15 chiffres par ligne. Les doublons et numéros invalides seront ignorés.
          </p>
          <textarea
            rows={8}
            value={multiImeiInput}
            onChange={(e) => setMultiImeiInput(e.target.value)}
            placeholder="359871234567891&#10;359871234567892&#10;359871234567893"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-neutral-100 font-mono text-xs focus:outline-hidden focus:border-amber-500/50"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowMultiImeiModal(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="button"
              onClick={handleAddMultiImei}
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              Ajouter les IMEIs
            </button>
          </div>
        </div>
      </Modal>

      {/* Product History Timeline Modal */}
      {historyProduct && (
        <Modal
          isOpen={!!historyProduct}
          onClose={() => setHistoryProduct(null)}
          title={`${t.stock.productHistory} : ${historyProduct.name}`}
          maxWidth="lg"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center justify-between">
              <div>
                <span className="text-neutral-400">Stock actuel : </span>
                <span className="font-bold font-mono text-amber-400">{historyProduct.quantity}</span>
              </div>
              <div>
                <span className="text-neutral-400">Date d'ajout : </span>
                <span className="font-mono text-neutral-200">{historyProduct.createdAt}</span>
              </div>
            </div>

            {/* Sales linking to this product */}
            <div>
              <h4 className="font-bold text-neutral-200 mb-2">Ventes enregistrées</h4>
              {sales.filter((s) => s.items.some((it) => it.productId === historyProduct.id)).length === 0 ? (
                <p className="text-neutral-500 italic">Aucune vente enregistrée pour ce produit.</p>
              ) : (
                <div className="space-y-2">
                  {sales
                    .filter((s) => s.items.some((it) => it.productId === historyProduct.id))
                    .map((s) => {
                      const item = s.items.find((it) => it.productId === historyProduct.id);
                      return (
                        <div
                          key={s.id}
                          className="p-3 rounded-lg bg-neutral-800/60 border border-neutral-800 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-amber-400 font-mono">{s.bonNumber}</div>
                            <div className="text-neutral-300 text-[11px] mt-0.5">
                              {s.customerName} · {s.date}
                            </div>
                            {item?.imei && (
                              <div className="font-mono text-[10px] text-neutral-400">
                                IMEI: {item.imei}
                              </div>
                            )}
                          </div>
                          <div className="text-end">
                            <span className="font-mono font-bold text-neutral-100">
                              {formatMAD(item ? item.price * item.quantity : 0, language)}
                            </span>
                            {item?.isReturned && (
                              <div className="text-[10px] text-rose-400 font-semibold mt-0.5">
                                RETOURNÉ
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* If phone, show full IMEI inventory statuses */}
            {historyProduct.category === 'phone' && historyProduct.imeiList && (
              <div>
                <h4 className="font-bold text-neutral-200 mb-2">Statut des Numéros IMEI</h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {historyProduct.imeiList.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-neutral-950 border border-neutral-800 flex items-center justify-between font-mono text-[11px]"
                    >
                      <span className="text-neutral-300">{item.imei}</span>
                      <div className="flex items-center gap-2">
                        {item.bonNumber && (
                          <span className="text-neutral-500">Bon {item.bonNumber}</span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] ${
                            item.status === 'in_stock'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-neutral-800 text-neutral-400'
                          }`}
                        >
                          {item.status === 'in_stock' ? t.stock.inStock : t.stock.sold}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!deleteProductId}
        onClose={() => setDeleteProductId(null)}
        onConfirm={handleConfirmDelete}
        title="Supprimer le Produit"
        message={t.stock.deleteConfirm}
        isDestructive={true}
      />
    </div>
  );
};
