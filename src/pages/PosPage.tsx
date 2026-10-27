import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Receipt,
  Search,
  Plus,
  Trash2,
  Printer,
  UserCheck,
  UserPlus,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  FileText,
  ShieldCheck,
  Percent,
  Calendar,
  AlertTriangle,
  Clock,
  Split,
  PlusCircle,
} from 'lucide-react';
import { db, createSaleTransaction, getStoreSettings, getNextBonNumber } from '../db';
import { Product, SaleItem, Customer, PaymentType, PriceType, Sale, Installment, CustomerType } from '../types';
import { Modal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { generateBonPDF, generateWarrantyPDF } from '../lib/pdfGenerator';

interface PosPageProps {
  onNavigateToBons?: () => void;
}

export const PosPage: React.FC<PosPageProps> = ({ onNavigateToBons }) => {
  const { t, language } = useI18n();
  const { success, error } = useToast();

  // Search & Catalog
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Cart
  const [cart, setCart] = useState<SaleItem[]>([]);

  // Customer Section
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(undefined);
  const [customerName, setCustomerName] = useState('Client Comptoir');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCIN, setCustomerCIN] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('retail');
  const [customerCreditLimit, setCustomerCreditLimit] = useState<number | undefined>(undefined);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);

  // Credit Limit Warning Override state
  const [confirmedCreditLimitOverride, setConfirmedCreditLimitOverride] = useState(false);

  // Payment & Terms
  const [paymentType, setPaymentType] = useState<PaymentType>('cash');
  const [paidAmount, setPaidAmount] = useState<number>(0);

  // Due Date (Échéance) for Credit / Remaining Balance
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });

  // Optional Installments Schedule (Échéancier)
  const [showInstallments, setShowInstallments] = useState(false);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [splitCount, setSplitCount] = useState<number>(3);
  const [splitFreq, setSplitFreq] = useState<'monthly' | 'biweekly' | 'weekly'>('monthly');

  // 1. Warranty is optional per sale (OFF by default)
  const [warrantyEnabled, setWarrantyEnabled] = useState<boolean>(false);
  // 2. Free warranty duration (number of months, min 1)
  const [warrantyMonths, setWarrantyMonths] = useState<number>(12);

  // 4. Discount per sale (DH or %)
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [discountValue, setDiscountValue] = useState<number>(0);

  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Post-sale success modal
  const [lastCreatedSale, setLastCreatedSale] = useState<Sale | null>(null);

  // Live queries from Dexie
  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];

  // Initialize default warranty duration setting if configured
  useEffect(() => {
    async function loadSettings() {
      const s = await getStoreSettings();
      if (s.defaultWarrantyMonths !== undefined && s.defaultWarrantyMonths > 0) {
        setWarrantyMonths(s.defaultWarrantyMonths);
      }
    }
    loadSettings();
  }, []);

  // Calculate Subtotal (sum of all cart lines)
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  // Calculate Discount amount in DH
  const rawDiscountAmount = discountType === 'percent'
    ? Math.round(((subtotal * (discountValue || 0)) / 100) * 100) / 100
    : Math.max(0, discountValue || 0);

  const discountAmount = Math.min(subtotal, Math.max(0, rawDiscountAmount));
  const finalTotal = Math.max(0, subtotal - discountAmount);

  // Sync paidAmount default when finalTotal changes and payment is cash
  useEffect(() => {
    if (paymentType === 'cash') {
      setPaidAmount(finalTotal);
    }
  }, [finalTotal, paymentType]);

  const remainingAmount = Math.max(0, finalTotal - paidAmount);

  // Automatically calculated warranty end date
  const calculatedWarrantyEndDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + (warrantyMonths || 1));
    return d.toLocaleDateString(language === 'ar' ? 'ar-MA' : 'fr-MA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, [warrantyMonths, language]);

  // Add Product to Cart
  const handleAddToCart = (product: Product) => {
    if (product.quantity <= 0) {
      error(`${product.name} est en rupture de stock.`);
      return;
    }

    if (product.category === 'phone') {
      // Find available IMEI
      const availableImei = product.imeiList?.find(
        (i) => i.status === 'in_stock' && !cart.some((c) => c.imei === i.imei)
      );

      if (!availableImei) {
        error(`Tous les numéros IMEI de ${product.name} sont déjà dans le panier ou vendus.`);
        return;
      }

      const newItem: SaleItem = {
        productId: product.id!,
        name: product.name,
        category: 'phone',
        imei: availableImei.imei,
        quantity: 1,
        price: product.retailPrice,
        originalPrice: product.retailPrice,
        costPrice: product.purchasePrice,
        type: 'retail',
      };
      setCart((prev) => [...prev, newItem]);
      success(`${product.name} ajouté (IMEI: ${availableImei.imei})`);
    } else {
      // Non-phone item
      const existingIndex = cart.findIndex((item) => item.productId === product.id);
      if (existingIndex >= 0) {
        const existing = cart[existingIndex];
        if (existing.quantity + 1 > product.quantity) {
          error(`Stock maximal atteint (${product.quantity}) pour ${product.name}.`);
          return;
        }
        const updated = [...cart];
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + 1,
        };
        setCart(updated);
      } else {
        const newItem: SaleItem = {
          productId: product.id!,
          name: product.name,
          category: product.category,
          quantity: 1,
          price: product.retailPrice,
          originalPrice: product.retailPrice,
          costPrice: product.purchasePrice,
          type: 'retail',
        };
        setCart((prev) => [...prev, newItem]);
      }
      success(`${product.name} ajouté au panier.`);
    }
  };

  // Change IMEI for phone item in cart
  const handleChangeItemImei = (cartIndex: number, newImei: string) => {
    const updated = [...cart];
    updated[cartIndex].imei = newImei;
    setCart(updated);
  };

  // 4. Update Item Price manually per sale line (does NOT alter catalog product price)
  const handleUpdatePrice = (cartIndex: number, newPrice: number) => {
    const updated = [...cart];
    updated[cartIndex] = {
      ...updated[cartIndex],
      price: Math.max(0, newPrice),
    };
    setCart(updated);
  };

  // Toggle Retail / Wholesale Price for item
  const handleTogglePriceType = (cartIndex: number) => {
    const item = cart[cartIndex];
    const product = products.find((p) => p.id === item.productId);
    if (!product) return;

    const newType: PriceType = item.type === 'retail' ? 'wholesale' : 'retail';
    const newPrice = newType === 'retail' ? product.retailPrice : product.wholesalePrice;

    const updated = [...cart];
    updated[cartIndex] = {
      ...item,
      type: newType,
      price: newPrice,
    };
    setCart(updated);
  };

  // Update Item Quantity
  const handleUpdateQuantity = (cartIndex: number, qty: number) => {
    const item = cart[cartIndex];
    const product = products.find((p) => p.id === item.productId);
    if (!product) return;

    if (qty > product.quantity) {
      error(`Stock insuffisant (${product.quantity} disponibles).`);
      return;
    }

    if (qty <= 0) {
      handleRemoveItem(cartIndex);
      return;
    }

    const updated = [...cart];
    updated[cartIndex] = { ...item, quantity: qty };
    setCart(updated);
  };

  // Remove Item from Cart
  const handleRemoveItem = (cartIndex: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== cartIndex));
  };

  // Select Customer from existing list
  const handleSelectCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.phone);
    setCustomerCIN(cust.CIN || '');
    setConfirmedCreditLimitOverride(false);
  };

  // Create New Customer Inline
  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) return;

    try {
      const newId = await db.customers.add({
        name: customerName.trim(),
        phone: customerPhone.trim(),
        CIN: customerCIN.trim() || undefined,
        customerType: customerType || 'retail',
        creditLimit: customerCreditLimit && customerCreditLimit > 0 ? customerCreditLimit : undefined,
        totalCredit: 0,
      });
      setSelectedCustomerId(newId);
      setShowNewCustomerModal(false);
      success("Nouveau client enregistré.");
    } catch {
      error("Erreur lors de l'enregistrement du client.");
    }
  };

  // Helper: Shortcut to set Due Date (+15j, +30j, +60j)
  const handleSetDueDateOffset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setDueDate(d.toISOString().split('T')[0]);
  };

  // Helper: Auto-split Installment Schedule
  const handleGenerateAutoInstallments = () => {
    if (remainingAmount <= 0) {
      error("Le reste à payer est de 0 DH. Aucun échéancier requis.");
      return;
    }
    const count = Math.max(1, splitCount);
    const baseAmount = Math.floor(remainingAmount / count);
    const remainder = remainingAmount - (baseAmount * count);
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
    setInstallments(generated);
    success(`Échéancier de ${count} tranches généré.`);
  };

  // Helper: Add custom blank installment
  const handleAddSingleInstallment = () => {
    const currentSum = installments.reduce((sum, i) => sum + i.amount, 0);
    const remainingToAllocate = Math.max(0, remainingAmount - currentSum);
    const d = new Date();
    d.setDate(d.getDate() + 30 * (installments.length + 1));
    setInstallments([
      ...installments,
      {
        id: `inst_${Date.now()}_${installments.length}`,
        amount: remainingToAllocate > 0 ? remainingToAllocate : 100,
        dueDate: d.toISOString().split('T')[0],
        paid: false,
        note: `Échéance ${installments.length + 1}`,
      },
    ]);
  };

  const handleUpdateInstallment = (idx: number, field: keyof Installment, val: any) => {
    const copy = [...installments];
    copy[idx] = { ...copy[idx], [field]: val };
    setInstallments(copy);
  };

  const handleRemoveInstallment = (idx: number) => {
    setInstallments(installments.filter((_, i) => i !== idx));
  };

  // Process & Validate Sale (Atomic Dexie transaction)
  const handleCheckout = async (printImmediate: boolean = true) => {
    if (cart.length === 0) {
      error(t.pos.emptyCart);
      return;
    }

    // 4. Validate unit prices >= 0
    for (const item of cart) {
      if (item.price < 0 || isNaN(item.price)) {
        error(t.pos.invalidPriceError);
        return;
      }
      if (item.category === 'phone' && !item.imei) {
        error(t.pos.selectImeiError);
        return;
      }
    }

    // 4. Validate discount cannot exceed total
    if (discountAmount > subtotal) {
      error(t.pos.discountExceedsError);
      return;
    }

    // 4. Validate paid amount cannot exceed final total
    if (paidAmount > finalTotal) {
      error(t.pos.paidExceedsError);
      return;
    }

    // 2. Validate installments total cannot exceed remaining amount
    if (installments.length > 0 && remainingAmount > 0) {
      const sumInst = installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      if (sumInst > remainingAmount + 0.01) {
        error(`Le total de l'échéancier (${sumInst} DH) ne peut pas dépasser le reste à payer (${remainingAmount} DH).`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const sale = await createSaleTransaction({
        customerId: selectedCustomerId,
        customerName: customerName.trim() || 'Client Comptoir',
        customerPhone: customerPhone.trim() || undefined,
        items: cart,
        subtotal,
        discountAmount: discountAmount > 0 ? discountAmount : undefined,
        discountType: discountAmount > 0 ? discountType : undefined,
        discountValue: discountAmount > 0 ? discountValue : undefined,
        totalAmount: finalTotal,
        paidAmount,
        remainingAmount,
        paymentType,
        dueDate: remainingAmount > 0 && dueDate ? dueDate : undefined,
        installments: remainingAmount > 0 && installments.length > 0 ? installments : undefined,
        hasWarranty: warrantyEnabled,
        warrantyMonths: warrantyEnabled ? Math.max(1, warrantyMonths) : 0,
        date: new Date().toISOString().split('T')[0],
        notes: notes.trim() || undefined,
        status: 'active',
      });

      setLastCreatedSale(sale);
      success(`${t.pos.saleSuccess} (N° ${sale.bonNumber})`);

      if (printImmediate) {
        const settings = await getStoreSettings();
        await generateBonPDF(sale, settings, 'save');
        if (warrantyEnabled) {
          await generateWarrantyPDF(sale, settings, 'save');
        }
      }

      // Reset cart and fields
      setCart([]);
      setDiscountValue(0);
      setWarrantyEnabled(false);
      setPaidAmount(0);
      setNotes('');
      setSelectedCustomerId(undefined);
      setCustomerName('Client Comptoir');
      setCustomerPhone('');
      setCustomerCIN('');
      setInstallments([]);
      setShowInstallments(false);
      setConfirmedCreditLimitOverride(false);
    } catch (err: any) {
      error(err.message || "Erreur lors de la validation du bon.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Catalog
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    const q = productSearch.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.imeiList && p.imeiList.some((i) => i.imei.includes(q) && i.status === 'in_stock'));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex items-center justify-between p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-400" />
            <span>{t.pos.title}</span>
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Création de bon de vente avec gestion des IMEIs et mise à jour automatique des stocks
          </p>
        </div>
        <div className="text-end">
          <span className="text-xs text-neutral-400">Date du jour : </span>
          <span className="font-mono font-bold text-amber-400">
            {new Date().toLocaleDateString(language === 'ar' ? 'ar-MA' : 'fr-MA')}
          </span>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Catalog Search + Cart */}
        <div className="lg:col-span-7 space-y-4">
          {/* Catalog Search & Category Filters */}
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-neutral-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Scanner code-barres ou rechercher par nom, IMEI..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg ps-9 pe-3 py-2 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-amber-500/50"
              />
            </div>

            {/* Quick category filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 text-xs">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-md transition ${
                  selectedCategory === 'all'
                    ? 'bg-amber-500 text-neutral-950 font-bold'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {t.all}
              </button>
              {(['phone', 'accessory', 'tv', 'trotinette', 'other'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md transition whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-amber-500 text-neutral-950 font-bold'
                      : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  {t.stock.categories[cat]}
                </button>
              ))}
            </div>

            {/* Compact Catalog Grid */}
            <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              {filteredProducts.slice(0, 8).map((p) => {
                const isOutOfStock = p.quantity <= 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => !isOutOfStock && handleAddToCart(p)}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition ${
                      isOutOfStock
                        ? 'opacity-40 bg-neutral-950 border-neutral-800 cursor-not-allowed'
                        : 'bg-neutral-950 hover:bg-neutral-800/80 border-neutral-800/80 hover:border-amber-500/40 cursor-pointer'
                    }`}
                  >
                    <div className="truncate me-2">
                      <div className="font-semibold text-neutral-200 truncate">{p.name}</div>
                      <div className="text-[10px] text-neutral-500 flex items-center gap-2 mt-0.5">
                        <span>Stock: {p.quantity}</span>
                        {p.category === 'phone' && <span className="text-amber-400 font-mono">IMEI</span>}
                      </div>
                    </div>
                    <div className="text-end shrink-0">
                      <div className="font-mono font-bold text-amber-400">
                        {formatMAD(p.retailPrice, language)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart Table */}
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-neutral-100 flex items-center gap-2">
                <span>{t.pos.cart}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono bg-amber-500/20 text-amber-400">
                  {cart.length}
                </span>
              </h2>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="text-xs text-rose-400 hover:text-rose-300"
                >
                  Vider le panier
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="py-12 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
                {t.pos.emptyCart}
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {cart.map((item, idx) => {
                  const product = products.find((p) => p.id === item.productId);
                  const availableImeis =
                    product?.imeiList?.filter(
                      (i) => i.status === 'in_stock' && (!cart.some((c, cIdx) => cIdx !== idx && c.imei === i.imei))
                    ) || [];

                  return (
                    <div
                      key={idx}
                      className="p-3 rounded-lg bg-neutral-950 border border-neutral-800/80 flex flex-col gap-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-semibold text-neutral-100">{item.name}</div>
                          {/* Price type toggle pill & Editable unit price */}
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            <button
                              type="button"
                              onClick={() => handleTogglePriceType(idx)}
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                item.type === 'retail'
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                              }`}
                            >
                              {item.type === 'retail' ? 'Détail' : 'Gros'}
                            </button>

                            {/* 4. Editable Unit Price Input */}
                            <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5" title="Prix unitaire personnalisable pour cette vente">
                              <span className="text-[10px] text-neutral-400">P.U:</span>
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={item.price}
                                onChange={(e) => handleUpdatePrice(idx, parseFloat(e.target.value) || 0)}
                                className="w-16 bg-transparent font-mono text-amber-300 text-[11px] font-bold text-end focus:outline-hidden"
                              />
                              <span className="text-[10px] text-neutral-400">DH</span>
                            </div>
                          </div>
                        </div>

                        {/* Quantity controls (disabled if phone) */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.category === 'phone' ? (
                            <span className="font-mono px-2 py-1 bg-neutral-800 rounded text-neutral-300 text-[11px]">
                              Qté: 1
                            </span>
                          ) : (
                            <div className="flex items-center bg-neutral-800 rounded border border-neutral-700">
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                                className="px-2 py-1 text-neutral-400 hover:text-neutral-100"
                              >
                                -
                              </button>
                              <span className="font-mono px-2 text-neutral-200">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                                className="px-2 py-1 text-neutral-400 hover:text-neutral-100"
                              >
                                +
                              </button>
                            </div>
                          )}

                          <div className="font-mono font-bold text-amber-400 w-24 text-end">
                            {formatMAD(item.price * item.quantity, language)}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-neutral-500 hover:text-rose-400 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Phone IMEI Selection Dropdown */}
                      {item.category === 'phone' && (
                        <div className="pt-2 border-t border-neutral-800/60 flex items-center gap-2">
                          <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <label className="text-[11px] text-neutral-400 shrink-0">IMEI :</label>
                          <select
                            value={item.imei || ''}
                            onChange={(e) => handleChangeItemImei(idx, e.target.value)}
                            className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px] text-amber-300 font-mono focus:outline-hidden"
                          >
                            <option value="">Sélectionner un IMEI en stock...</option>
                            {availableImeis.map((im) => (
                              <option key={im.imei} value={im.imei}>
                                {im.imei}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Customer, Payment, Total & Print */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4 text-xs">
            {/* Customer Header */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-bold text-neutral-200 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-amber-400" />
                  <span>{t.pos.customerInfo}</span>
                </label>
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(true)}
                  className="text-amber-400 hover:text-amber-300 text-[11px] font-semibold flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>Nouveau</span>
                </button>
              </div>

              {/* Customer Selector */}
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  setSelectedCustomerId(val);
                  if (val) {
                    const cust = customers.find((c) => c.id === val);
                    if (cust) handleSelectCustomer(cust);
                  } else {
                    setCustomerName('Client Comptoir');
                    setCustomerPhone('');
                    setCustomerCIN('');
                  }
                }}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 focus:outline-hidden focus:border-amber-500/50 mb-2"
              >
                <option value="">Client Comptoir (Passager)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''} {c.totalCredit > 0 ? `· Crédit: ${c.totalCredit} DH` : ''}
                  </option>
                ))}
              </select>

              {/* Inline Customer details */}
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nom du client"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 text-xs"
                />
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Téléphone"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 text-xs font-mono"
                />
              </div>

              {/* Selected Customer Credit Info & Limit Warning */}
              {selectedCustomerId && (() => {
                const selCust = customers.find((c) => c.id === selectedCustomerId);
                if (!selCust) return null;
                const projectedDebt = (selCust.totalCredit || 0) + remainingAmount;
                const isLimitExceeded = Boolean(
                  selCust.creditLimit && selCust.creditLimit > 0 && projectedDebt > selCust.creditLimit && remainingAmount > 0
                );

                return (
                  <div className="mt-2 space-y-2">
                    <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-[11px] flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            selCust.customerType === 'wholesale'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : 'bg-neutral-800 text-neutral-300'
                          }`}
                        >
                          {selCust.customerType === 'wholesale' ? t.customers.wholesale : t.customers.retail}
                        </span>
                        <span className="text-neutral-400">Crédit actuel :</span>
                        <span className="font-mono font-bold text-amber-400">
                          {formatMAD(selCust.totalCredit, language)}
                        </span>
                      </div>
                      {selCust.creditLimit && selCust.creditLimit > 0 && (
                        <span className="text-neutral-400 text-[10px]">
                          Plafond : <strong className="text-neutral-200">{formatMAD(selCust.creditLimit, language)}</strong>
                        </span>
                      )}
                    </div>

                    {/* Credit Limit Exceeded Warning */}
                    {isLimitExceeded && (
                      <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-xs space-y-2">
                        <div className="flex items-start gap-2 text-amber-400">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <div className="font-bold">{t.pos.creditLimitExceededWarning}</div>
                            <div className="text-[11px] text-amber-300/90 mt-0.5">
                              {t.pos.creditLimitExceededDesc}{' '}
                              <strong className="font-mono text-white">{formatMAD(projectedDebt, language)}</strong>{' '}
                              ({t.pos.creditLimitMax} : {formatMAD(selCust.creditLimit!, language)}).
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end pt-1">
                          <button
                            type="button"
                            onClick={() => setConfirmedCreditLimitOverride(!confirmedCreditLimitOverride)}
                            className={`px-2.5 py-1 rounded text-[11px] font-semibold transition flex items-center gap-1.5 ${
                              confirmedCreditLimitOverride
                                ? 'bg-amber-500 text-neutral-950 font-bold'
                                : 'bg-neutral-900 border border-amber-500/50 text-amber-300 hover:bg-neutral-800'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>
                              {confirmedCreditLimitOverride ? 'Dépassement autorisé' : t.pos.continueAnyway}
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Payment Mode */}
            <div className="pt-3 border-t border-neutral-800">
              <label className="block font-semibold text-neutral-300 mb-1.5">
                {t.pos.paymentType}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['cash', 'credit', 'installment'] as PaymentType[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setPaymentType(mode);
                      if (mode === 'cash') setPaidAmount(finalTotal);
                      if (mode === 'credit') setPaidAmount(0);
                    }}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition ${
                      paymentType === mode
                        ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    {mode === 'cash' ? 'Cash' : mode === 'credit' ? 'Crédit' : 'Facilité'}
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Discount Section (DH or %) */}
            <div className="pt-3 border-t border-neutral-800">
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-neutral-300 flex items-center gap-1.5">
                  <Percent className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.pos.discount}</span>
                </label>
                <div className="flex items-center bg-neutral-950 rounded-md border border-neutral-800 p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2 py-0.5 rounded transition ${
                      discountType === 'fixed'
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    DH
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2 py-0.5 rounded transition ${
                      discountType === 'percent'
                        ? 'bg-amber-500 text-neutral-950 font-bold'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? 100 : subtotal}
                  step="any"
                  value={discountValue || ''}
                  onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder={discountType === 'percent' ? 'ex: 10%' : 'ex: 100 DH'}
                  className="flex-1 bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 font-mono text-xs focus:outline-hidden focus:border-amber-500/50"
                />
                {discountAmount > 0 && (
                  <span className="text-xs font-mono font-bold text-rose-400 shrink-0">
                    - {formatMAD(discountAmount, language)}
                  </span>
                )}
              </div>
            </div>

            {/* 1 & 2. Warranty Section: Optional Toggle & Free Duration */}
            <div className="pt-3 border-t border-neutral-800 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  onClick={() => setWarrantyEnabled(!warrantyEnabled)}
                  className="font-semibold text-neutral-300 flex items-center gap-2 cursor-pointer select-none"
                >
                  <ShieldCheck className={`w-4 h-4 ${warrantyEnabled ? 'text-amber-400' : 'text-neutral-500'}`} />
                  <span>{t.pos.warrantyToggle} (ضمان)</span>
                </label>
                <button
                  type="button"
                  onClick={() => setWarrantyEnabled(!warrantyEnabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    warrantyEnabled ? 'bg-amber-500' : 'bg-neutral-800'
                  }`}
                  aria-pressed={warrantyEnabled}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-neutral-950 shadow-md ring-0 transition duration-200 ease-in-out ${
                      warrantyEnabled ? (language === 'ar' ? '-translate-x-4' : 'translate-x-4') : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {warrantyEnabled ? (
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-neutral-400">
                      {t.pos.warrantyDurationMonths} :
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={warrantyMonths}
                        onChange={(e) => setWarrantyMonths(Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-center font-mono font-bold text-amber-400 text-xs focus:outline-hidden focus:border-amber-500"
                      />
                      <span className="text-[11px] text-neutral-400 font-semibold">{t.pos.months}</span>
                    </div>
                  </div>

                  {/* Quick duration shortcuts: 1, 3, 6, 12, 24 */}
                  <div className="flex items-center gap-1.5">
                    {[1, 3, 6, 12, 24].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWarrantyMonths(m)}
                        className={`flex-1 py-1 rounded text-[11px] font-mono font-semibold border text-center transition ${
                          warrantyMonths === m
                            ? 'bg-amber-500 text-neutral-950 font-bold border-amber-500'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                        }`}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>

                  {/* Calculated end date */}
                  <div className="text-[11px] text-neutral-400 flex items-center justify-between pt-1 border-t border-neutral-800/80">
                    <span>{t.pos.warrantyValidUntil} :</span>
                    <span className="font-semibold text-emerald-400 font-mono">
                      {calculatedWarrantyEndDate}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-neutral-500 italic">
                  {t.pos.warrantyDisabled} — Aucun certificat de garantie ne sera généré.
                </p>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block font-semibold text-neutral-300 mb-1">
                {t.notes}
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ex: Acompte espèces, reste fin du mois..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 text-xs"
              />
            </div>

            {/* Total / Paid / Remaining Calculation Box */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <span>{t.pos.subtotal} :</span>
                <span className="font-mono font-bold text-sm text-neutral-200">
                  {formatMAD(subtotal, language)}
                </span>
              </div>

              {discountAmount > 0 && (
                <div className="flex items-center justify-between text-xs text-rose-400">
                  <span>
                    {t.pos.discount} {discountType === 'percent' && discountValue ? `(${discountValue}%)` : ''} :
                  </span>
                  <span className="font-mono font-bold text-sm">
                    - {formatMAD(discountAmount, language)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-800">
                <span className="text-neutral-100 font-bold">{t.total} Net :</span>
                <span className="font-mono font-bold text-base text-amber-400">
                  {formatMAD(finalTotal, language)}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-800">
                <span className="text-emerald-400 font-semibold">{t.pos.paidAmount} (DH) :</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max={finalTotal}
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                  className="w-32 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-end font-mono font-bold text-emerald-400 text-xs focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1 border-t border-neutral-800">
                <span className="text-neutral-400">{t.pos.remainingCredit} :</span>
                <span
                  className={`font-mono font-bold ${
                    remainingAmount > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {formatMAD(remainingAmount, language)}
                </span>
              </div>
            </div>

            {/* 1 & 2. Due Date & Installment Schedule (When there is a remaining balance) */}
            {remainingAmount > 0 && (
              <div className="pt-3 border-t border-neutral-800 space-y-3">
                {/* Due Date (Date d'échéance) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-semibold text-neutral-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.pos.dueDate}</span>
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => handleSetDueDateOffset(15)}
                        className="px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
                      >
                        {t.pos.dueDateShortcut15}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetDueDateOffset(30)}
                        className="px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
                      >
                        {t.pos.dueDateShortcut30}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetDueDateOffset(60)}
                        className="px-2 py-0.5 rounded bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
                      >
                        {t.pos.dueDateShortcut60}
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-2.5 py-1.5 text-neutral-200 font-mono text-xs focus:outline-hidden focus:border-amber-500/50"
                  />
                </div>

                {/* Optional Installment Schedule (Échéancier) */}
                <div className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label
                      onClick={() => setShowInstallments(!showInstallments)}
                      className="font-semibold text-neutral-300 flex items-center gap-2 cursor-pointer select-none text-xs"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>{t.pos.scheduleInstallments}</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInstallments(!showInstallments)}
                      className="text-amber-400 text-[11px] font-semibold hover:underline"
                    >
                      {showInstallments ? 'Masquer' : 'Configurer'}
                    </button>
                  </div>

                  {showInstallments && (
                    <div className="space-y-3 pt-2 border-t border-neutral-800/80">
                      {/* Automatic Split Controls */}
                      <div className="p-2.5 rounded bg-neutral-900 border border-neutral-800 space-y-2">
                        <span className="text-[11px] font-semibold text-neutral-300 flex items-center gap-1">
                          <Split className="w-3 h-3 text-amber-400" />
                          <span>{t.pos.autoSplit}</span>
                        </span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <label className="text-[10px] text-neutral-400 block mb-0.5">{t.pos.splitCount}</label>
                            <div className="flex gap-1">
                              {[2, 3, 4, 6].map((n) => (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => setSplitCount(n)}
                                  className={`flex-1 py-1 rounded text-center font-mono text-xs ${
                                    splitCount === n
                                      ? 'bg-amber-500 text-neutral-950 font-bold'
                                      : 'bg-neutral-950 text-neutral-400'
                                  }`}
                                >
                                  {n}x
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-neutral-400 block mb-0.5">{t.pos.splitFrequency}</label>
                            <select
                              value={splitFreq}
                              onChange={(e) => setSplitFreq(e.target.value as any)}
                              className="w-full bg-neutral-950 border border-neutral-800 rounded px-1.5 py-1 text-neutral-200 text-[11px]"
                            >
                              <option value="monthly">{t.pos.freqMonthly}</option>
                              <option value="biweekly">{t.pos.freqBiWeekly}</option>
                              <option value="weekly">{t.pos.freqWeekly}</option>
                            </select>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateAutoInstallments}
                          className="w-full py-1 text-[11px] font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition"
                        >
                          Calculer les tranches
                        </button>
                      </div>

                      {/* Installments Rows */}
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {installments.map((inst, idx) => (
                          <div
                            key={inst.id || idx}
                            className="flex items-center gap-1.5 bg-neutral-900/90 p-1.5 rounded border border-neutral-800 text-[11px]"
                          >
                            <span className="font-mono text-neutral-400 w-5 text-center">#{idx + 1}</span>
                            <input
                              type="number"
                              min="1"
                              step="any"
                              value={inst.amount}
                              onChange={(e) =>
                                handleUpdateInstallment(idx, 'amount', parseFloat(e.target.value) || 0)
                              }
                              className="w-20 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-end font-mono text-amber-300 text-xs"
                            />
                            <span className="text-[10px] text-neutral-400">DH</span>
                            <input
                              type="date"
                              value={inst.dueDate}
                              onChange={(e) => handleUpdateInstallment(idx, 'dueDate', e.target.value)}
                              className="flex-1 bg-neutral-950 border border-neutral-800 rounded px-1.5 py-0.5 text-neutral-200 font-mono text-[10px]"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveInstallment(idx)}
                              className="text-neutral-500 hover:text-rose-400 p-0.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={handleAddSingleInstallment}
                          className="text-[11px] text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1"
                        >
                          <PlusCircle className="w-3.5 h-3.5" />
                          <span>{t.pos.addInstallment}</span>
                        </button>
                        <span className="text-[10px] font-mono text-neutral-400">
                          Total :{' '}
                          <strong
                            className={
                              installments.reduce((s, i) => s + (Number(i.amount) || 0), 0) > remainingAmount
                                ? 'text-rose-400'
                                : 'text-emerald-400'
                            }
                          >
                            {formatMAD(installments.reduce((s, i) => s + (Number(i.amount) || 0), 0), language)}
                          </strong>{' '}
                          / {formatMAD(remainingAmount, language)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                disabled={isSubmitting || cart.length === 0}
                onClick={() => handleCheckout(true)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-bold text-sm transition shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>{t.pos.saveAndPrint}</span>
              </button>

              <button
                type="button"
                disabled={isSubmitting || cart.length === 0}
                onClick={() => handleCheckout(false)}
                className="w-full py-2 px-4 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 font-semibold text-xs transition"
              >
                {t.pos.saveOnly}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Add Customer Modal */}
      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        title="Ajouter un Client Rapide"
        maxWidth="md"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-3 text-xs">
          <div>
            <label className="block text-neutral-300 font-medium mb-1">Nom Complet *</label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Téléphone *</label>
              <input
                type="text"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+212 6..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-300 font-medium mb-1">Type de client</label>
              <select
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value as CustomerType)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100"
              >
                <option value="retail">Détaillant (Détail)</option>
                <option value="wholesale">Grossiste (Gros)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-neutral-300 font-medium mb-1">CIN (Optionnel)</label>
              <input
                type="text"
                value={customerCIN}
                onChange={(e) => setCustomerCIN(e.target.value)}
                placeholder="ex: BE123456"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
            <div>
              <label className="block text-neutral-300 font-medium mb-1">{t.customers.creditLimit}</label>
              <input
                type="number"
                min="0"
                step="any"
                value={customerCreditLimit || ''}
                onChange={(e) => setCustomerCreditLimit(parseFloat(e.target.value) || undefined)}
                placeholder="ex: 10000 DH"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-neutral-100 font-mono"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={() => setShowNewCustomerModal(false)}
              className="px-3 py-1.5 bg-neutral-800 text-neutral-300 rounded-lg"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-amber-500 text-neutral-950 font-bold rounded-lg"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      {/* Post-Sale Success Dialog */}
      {lastCreatedSale && (
        <Modal
          isOpen={!!lastCreatedSale}
          onClose={() => setLastCreatedSale(null)}
          title="Bon de Vente Validé !"
          maxWidth="md"
        >
          <div className="text-center py-4 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="font-mono text-xl font-bold text-amber-400">
              {lastCreatedSale.bonNumber}
            </div>
            <p className="text-xs text-neutral-300">
              Vente enregistrée pour <strong>{lastCreatedSale.customerName}</strong> d'un montant de{' '}
              <strong>{formatMAD(lastCreatedSale.totalAmount, language)}</strong>.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-3">
              <button
                type="button"
                onClick={async () => {
                  const settings = await getStoreSettings();
                  await generateBonPDF(lastCreatedSale, settings, 'save');
                }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shadow"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimer Facture (A4)</span>
              </button>

              {lastCreatedSale.hasWarranty && lastCreatedSale.warrantyMonths > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    const settings = await getStoreSettings();
                    await generateWarrantyPDF(lastCreatedSale, settings, 'save');
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>Imprimer Garantie (A4)</span>
                </button>
              )}

              {onNavigateToBons && (
                <button
                  type="button"
                  onClick={() => {
                    setLastCreatedSale(null);
                    onNavigateToBons();
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs"
                >
                  Voir dans l'historique
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
