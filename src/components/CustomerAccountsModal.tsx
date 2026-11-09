import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { SavedCustomer, Parcel } from '../types/database';
import { resolveOfficialPrintBranding } from '../utils/logisticsFeatures';
import {
  X,
  Users,
  Search,
  Plus,
  MessageCircle,
  Star,
  Trash2,
  ChevronDown,
  Printer,
  Scale,
} from 'lucide-react';

interface CustomerAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AggregatedCustomer {
  key: string;
  name: string;
  phone: string;
  city: string;
  type: 'merchant' | 'vip' | 'regular';
  vipRatePerKg?: number;
  vipCurrency?: 'MAD' | 'MRU';
  discountPercent?: number;
  isSaved: boolean;
  savedId?: string;
  sentCount: number;
  receivedCount: number;
  totalVolumeMad: number;
  totalVolumeMru: number;
  unpaidMad: number;
  unpaidMru: number;
  unpaidParcels: Parcel[];
  allParcels: Parcel[];
}

export const CustomerAccountsModal: React.FC<CustomerAccountsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    currentWorkspace,
    parcels,
    hideAmounts,
    recordParcelPayment,
    showToast,
  } = useApp();

  const storageKey = `alittihadia_saved_customers_${currentWorkspace?.id || 'default'}`;

  const [savedCustomers, setSavedCustomers] = useState<SavedCustomer[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setSavedCustomers(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  const saveCustomersToStorage = (list: SavedCustomer[]) => {
    setSavedCustomers(list);
    try {
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch {}
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'debt' | 'vip'>('all');
  const [isCustomersLogOpen, setIsCustomersLogOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCity, setNewCity] = useState('الداخلة');
  const [newType, setNewType] = useState<'merchant' | 'vip' | 'regular'>('merchant');
  const [newVipRatePerKg, setNewVipRatePerKg] = useState('');
  const [newVipCurrency, setNewVipCurrency] = useState<'MAD' | 'MRU'>('MAD');
  const [newDiscountPercent, setNewDiscountPercent] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [payingParcelId, setPayingParcelId] = useState<string | null>(null);

  // Aggregate all customers from saved list + parcels
  const customersList = useMemo<AggregatedCustomer[]>(() => {
    const map = new Map<string, AggregatedCustomer>();

    const normalizeKey = (name: string, phone: string) => {
      const cleanP = (phone || '').replace(/[^0-9]/g, '');
      if (cleanP.length >= 6) return `p:${cleanP.slice(-8)}`;
      return `n:${(name || '').trim().toLowerCase()}`;
    };

    // 1. Seed with saved VIP / merchant customers
    savedCustomers.forEach((sc) => {
      const k = normalizeKey(sc.name, sc.phone);
      map.set(k, {
        key: k,
        name: sc.name,
        phone: sc.phone,
        city: sc.city || 'الداخلة',
        type: sc.type,
        vipRatePerKg: sc.vip_rate_per_kg,
        vipCurrency: sc.vip_currency || 'MAD',
        discountPercent: sc.discount_percent,
        isSaved: true,
        savedId: sc.id,
        sentCount: 0,
        receivedCount: 0,
        totalVolumeMad: 0,
        totalVolumeMru: 0,
        unpaidMad: 0,
        unpaidMru: 0,
        unpaidParcels: [],
        allParcels: [],
      });
    });

    // 2. Aggregate from all workspace parcels
    parcels.forEach((p) => {
      if (p.status === 'cancelled') return;
      const remaining = Math.max(
        0,
        Math.round(((Number(p.amount_due) || 0) - (Number(p.amount_paid) || 0)) * 100) / 100
      );

      // Sender
      if (p.sender_name && p.sender_name !== '(من طرف المدير)') {
        const sKey = normalizeKey(p.sender_name, p.sender_phone);
        const existing = map.get(sKey) || {
          key: sKey,
          name: p.sender_name,
          phone: p.sender_phone || '',
          city: p.origin_station_name || 'الداخلة',
          type: 'regular' as const,
          isSaved: false,
          sentCount: 0,
          receivedCount: 0,
          totalVolumeMad: 0,
          totalVolumeMru: 0,
          unpaidMad: 0,
          unpaidMru: 0,
          unpaidParcels: [],
          allParcels: [],
        };

        existing.sentCount += 1;
        if (!existing.allParcels.some((item) => item.id === p.id)) {
          existing.allParcels.push(p);
        }
        if (p.currency === 'MRU') {
          existing.totalVolumeMru += Number(p.amount_due) || 0;
        } else {
          existing.totalVolumeMad += Number(p.amount_due) || 0;
        }

        if (remaining > 0 && p.payer === 'sender') {
          if (p.currency === 'MRU') existing.unpaidMru += remaining;
          else existing.unpaidMad += remaining;
          if (!existing.unpaidParcels.some((item) => item.id === p.id)) {
            existing.unpaidParcels.push(p);
          }
        }
        map.set(sKey, existing);
      }

      // Receiver
      if (p.receiver_name && p.receiver_name !== '(من طرف المدير)') {
        const rKey = normalizeKey(p.receiver_name, p.receiver_phone);
        const existing = map.get(rKey) || {
          key: rKey,
          name: p.receiver_name,
          phone: p.receiver_phone || '',
          city: p.destination_station_name || 'نواذيبو',
          type: 'regular' as const,
          isSaved: false,
          sentCount: 0,
          receivedCount: 0,
          totalVolumeMad: 0,
          totalVolumeMru: 0,
          unpaidMad: 0,
          unpaidMru: 0,
          unpaidParcels: [],
          allParcels: [],
        };

        existing.receivedCount += 1;
        if (!existing.allParcels.some((item) => item.id === p.id)) {
          existing.allParcels.push(p);
        }

        if (remaining > 0 && p.payer === 'receiver') {
          if (p.currency === 'MRU') existing.unpaidMru += remaining;
          else existing.unpaidMad += remaining;
          if (!existing.unpaidParcels.some((item) => item.id === p.id)) {
            existing.unpaidParcels.push(p);
          }
        }
        map.set(rKey, existing);
      }
    });

    return Array.from(map.values()).sort((a, b) => {
      const debtA = a.unpaidMad + a.unpaidMru;
      const debtB = b.unpaidMad + b.unpaidMru;
      if (debtB !== debtA) return debtB - debtA;
      return b.sentCount + b.receivedCount - (a.sentCount + a.receivedCount);
    });
  }, [savedCustomers, parcels]);

  const filteredCustomers = useMemo(() => {
    return customersList.filter((c) => {
      if (filterMode === 'debt' && c.unpaidMad <= 0 && c.unpaidMru <= 0) return false;
      if (filterMode === 'vip' && !c.isSaved && c.sentCount + c.receivedCount < 2) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (
          !c.name.toLowerCase().includes(q) &&
          !c.phone.toLowerCase().includes(q) &&
          !c.city.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [customersList, filterMode, searchQuery]);

  const totalDebtMad = useMemo(
    () => Math.round(customersList.reduce((acc, c) => acc + c.unpaidMad, 0) * 100) / 100,
    [customersList]
  );
  const totalDebtMru = useMemo(
    () => Math.round(customersList.reduce((acc, c) => acc + c.unpaidMru, 0) * 100) / 100,
    [customersList]
  );

  if (!isOpen) return null;

  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) {
      showToast('يرجى إدخال اسم الزبون ورقم هاتفه', 'error');
      return;
    }

    const rateNum = parseFloat(newVipRatePerKg);
    const discNum = parseFloat(newDiscountPercent);

    const created: SavedCustomer = {
      id: `cust-${Date.now()}`,
      workspace_id: currentWorkspace?.id || 'default',
      name: newName.trim(),
      phone: newPhone.trim(),
      city: newCity.trim() || 'الداخلة',
      type: newType,
      vip_rate_per_kg: rateNum > 0 ? rateNum : undefined,
      vip_currency: newVipCurrency,
      discount_percent: discNum > 0 && discNum <= 90 ? discNum : undefined,
      created_at: new Date().toISOString(),
    };

    const withoutDuplicate = savedCustomers.filter(
      (c) => c.phone.replace(/[^0-9]/g, '') !== created.phone.replace(/[^0-9]/g, '')
    );

    saveCustomersToStorage([created, ...withoutDuplicate]);
    setNewName('');
    setNewPhone('');
    setNewVipRatePerKg('');
    setNewDiscountPercent('');
    setShowAddForm(false);
    showToast(
      `تم حفظ التاجر/الزبون [${created.name}] ${
        created.vip_rate_per_kg ? `بتسعيرة VIP (${created.vip_rate_per_kg} ${created.vip_currency}/كغ)` : ''
      }`,
      'success'
    );
  };

  const handleDeleteSavedCustomer = (id?: string) => {
    if (!id) return;
    saveCustomersToStorage(savedCustomers.filter((c) => c.id !== id));
    showToast('تم حذف الزبون من القائمة المحفوظة', 'info');
  };

  const handleSettleParcelDebt = async (parcel: Parcel, customerName: string) => {
    const rem = Math.max(
      0,
      Math.round(((Number(parcel.amount_due) || 0) - (Number(parcel.amount_paid) || 0)) * 100) / 100
    );
    if (rem <= 0) return;

    setPayingParcelId(parcel.id);
    try {
      const res = await recordParcelPayment(
        parcel.id,
        rem,
        customerName,
        'تصفية حساب كريدي من دفتر الزبائن والتجار'
      );
      if (res.success) {
        showToast(
          `تم استخلاص وتصفية مبلغ ${rem} ${parcel.currency} للكولي #${parcel.parcel_number} بنجاح`,
          'success'
        );
      } else if (res.error) {
        showToast(res.error, 'error');
      }
    } finally {
      setPayingParcelId(null);
    }
  };

  const handlePrintCustomerStatementPDF = (c: AggregatedCustomer) => {
    const resolvedBrand = resolveOfficialPrintBranding({
      name: currentWorkspace?.custom_brand_name || currentWorkspace?.name,
      subtitle: currentWorkspace?.custom_brand_subtitle,
      phone: currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone,
      logoUrl: currentWorkspace?.custom_brand_logo_url,
    });
    const wsName = resolvedBrand.agencyName;
    const logoSrc = resolvedBrand.logoSrc;
    const rows = c.allParcels
      .map((p, idx) => {
        const rem = Math.max(0, Math.round((p.amount_due - p.amount_paid) * 100) / 100);
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td style="font-family:monospace;font-weight:800;">#${p.parcel_number} (${p.tracking_code})</td>
            <td>${new Date(p.created_at).toLocaleDateString('ar-MA')}</td>
            <td>${p.origin_station_name || ''} ➔ ${p.destination_station_name || ''}</td>
            <td>${p.description}</td>
            <td style="font-family:monospace;">${p.amount_due} ${p.currency}</td>
            <td style="font-family:monospace;">${p.amount_paid} ${p.currency}</td>
            <td style="font-family:monospace;font-weight:900;color:${rem > 0 ? '#b91c1c' : '#15803d'};">
              ${rem > 0 ? `${rem} ${p.currency}` : '✓ خالص'}
            </td>
          </tr>
        `;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>كشف حساب تاجر - ${c.name}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; font-family: 'Cairo', 'Tajawal', sans-serif; }
    body { margin: 0; padding: 14px; color: #000; background: #fff; font-size: 12px; }
    .hdr { border: 2px solid #000; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .brand-logo { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; border: 2px solid #000; flex-shrink: 0; background: #fff; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1.5px solid #000; padding: 6px 8px; font-size: 11px; }
    th { background: #111; color: #fff; text-align: right; }
    @media print { .no-print { display: none !important; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:12px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#000;color:#F5C84C;border:none;border-radius:8px;font-weight:900;cursor:pointer;">🖨️ طباعة كشف الحساب (PDF)</button>
  </div>
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:14px;">
      ${logoSrc ? `<img src="${logoSrc}" alt="${wsName}" class="brand-logo" onerror="this.style.display='none'" />` : ''}
      <div>
        <h2 style="margin:0;">${wsName} — كشف حساب تاجر / زبون وفي</h2>
        <p style="margin:4px 0 0;">الاسم: <strong>${c.name}</strong> | الهاتف: <span dir="ltr">${c.phone}</span> | المدينة: ${c.city}</p>
        ${c.vipRatePerKg ? `<p style="margin:2px 0 0;font-weight:800;">⭐ تسعيرة VIP المعتمدة: ${c.vipRatePerKg} ${c.vipCurrency || 'MAD'}/كغ</p>` : ''}
      </div>
    </div>
    <div style="text-align:left;font-family:monospace;">
      <div>كريدي MAD: <strong>${c.unpaidMad} MAD</strong></div>
      <div>كريدي MRU: <strong>${c.unpaidMru} MRU</strong></div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>رقم الكولي</th>
        <th>التاريخ</th>
        <th>المسار</th>
        <th>البيان</th>
        <th>الإجمالي</th>
        <th>المدفوع</th>
        <th>المتبقي (الكريدي)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
    }
  };

  const handleSendWhatsAppStatement = (c: AggregatedCustomer) => {
    const cleanPhone = (c.phone || '').replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      showToast('لا يوجد رقم هاتف مسجل لهذا الزبون', 'error');
      return;
    }

    const wsName =
      currentWorkspace?.custom_brand_name || currentWorkspace?.name || 'إكسبريس لوجستيك';
    const unpaidLines = c.unpaidParcels
      .map((p) => {
        const rem = Math.max(0, Math.round((p.amount_due - p.amount_paid) * 100) / 100);
        return `• كولي #${p.parcel_number} (${p.tracking_code}): متبقي ${rem} ${p.currency}`;
      })
      .join('\n');

    const msg =
      `السلام عليكم السيد(ة) *${c.name}*،\n` +
      `كشف حسابكم لدى *${wsName}*:\n` +
      `📦 إجمالي الكوليات المرسلة: ${c.sentCount} | المستلمة: ${c.receivedCount}\n` +
      (c.vipRatePerKg
        ? `⭐ *تعريفة VIP الخاصة بكم:* ${c.vipRatePerKg} ${c.vipCurrency || 'MAD'}/كغ\n`
        : '') +
      (c.unpaidMad > 0 || c.unpaidMru > 0
        ? `💳 *المبالغ المتبقية للأداء (الكريدي):*\n` +
          (c.unpaidMad > 0 ? `- بالدرهم: *${c.unpaidMad} MAD*\n` : '') +
          (c.unpaidMru > 0 ? `- بالأوقية: *${c.unpaidMru} MRU*\n` : '') +
          (unpaidLines ? `\nتفاصيل الكوليات غير الخالصة:\n${unpaidLines}\n` : '')
        : `✅ *حالة الحساب: خالص بالكامل (0 متبقي)*\n`) +
      `\nشكراً لثقتكم وتعاملاتكم معنا.`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2 bg-black/85 backdrop-blur-md overflow-y-auto overflow-x-hidden animate-fadeIn"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="w-[calc(100%-8px)] max-w-[420px] luxury-card rounded-[22px] border-2 border-[#D4AF37]/65 p-3 shadow-2xl text-right overflow-hidden relative my-auto max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Compact Header */}
        <div className="flex items-center justify-between border-b border-white/15 pb-2 mb-2.5 shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-base">📒</span>
            <h3 className="text-xs sm:text-sm font-black text-white truncate">
              دفتر الزبناء والتجار ⭐ VIP ({customersList.length})
            </h3>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowAddForm((prev) => !prev)}
              className="btn-gold px-2.5 py-1.5 rounded-xl font-black text-[11px] flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showAddForm ? 'إغلاق' : '➕ تاجر VIP'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-cancel p-1.5 rounded-xl transition shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-2.5 text-xs min-h-0">
          {/* Compact 2-Column Add VIP Customer Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddCustomer}
              className="bg-black/55 p-2.5 rounded-2xl border border-[#F5C84C]/50 space-y-2 animate-fadeIn"
            >
              <div className="grid grid-cols-2 gap-1.5 min-w-0">
                {/* Right Column: Name + Phone */}
                <div className="space-y-1.5 min-w-0">
                  <input
                    type="text"
                    required
                    placeholder="👤 اسم التاجر / الزبون *"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full min-w-0 bg-black/70 border border-white/20 rounded-xl px-2.5 py-2 text-white font-black text-xs"
                  />
                  <input
                    type="tel"
                    required
                    placeholder="📞 الهاتف / واتساب *"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    dir="ltr"
                    className="w-full min-w-0 bg-black/70 border border-white/20 rounded-xl px-2.5 py-2 text-white font-mono font-black text-xs"
                  />
                </div>

                {/* Left Column: City + VIP Rate/Kg */}
                <div className="space-y-1.5 min-w-0">
                  <input
                    type="text"
                    placeholder="📍 المدينة (الداخلة...)"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="w-full min-w-0 bg-black/70 border border-white/20 rounded-xl px-2.5 py-2 text-white font-black text-xs"
                  />
                  <div className="flex items-center gap-1 min-w-0">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      placeholder="⚖️ ثمن/kg"
                      value={newVipRatePerKg}
                      onChange={(e) => setNewVipRatePerKg(e.target.value)}
                      className="w-full min-w-0 bg-black/70 border border-[#F5C84C]/60 rounded-xl px-2 py-2 text-white font-mono font-black text-xs text-center"
                    />
                    <select
                      value={newVipCurrency}
                      onChange={(e) => setNewVipCurrency(e.target.value as 'MAD' | 'MRU')}
                      className="bg-black/70 border border-white/20 rounded-xl px-1.5 py-2 text-white font-mono text-[11px] font-black shrink-0"
                    >
                      <option value="MAD">MAD</option>
                      <option value="MRU">MRU</option>
                    </select>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="btn-gold w-full py-2.5 rounded-xl font-black text-xs shadow-md"
              >
                ✅ حفظ التاجر وتفعيل تسعيرة VIP
              </button>
            </form>
          )}

          {/* Summary Metrics + Search & Filter in 1 Compact Block */}
          <div className="bg-black/45 p-2.5 rounded-2xl border border-white/15 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <div className="bg-black/50 p-1.5 rounded-xl border border-white/15 text-center">
                <span className="text-[10px] text-white/70 block">👥 الزبناء</span>
                <span className="text-xs sm:text-sm font-black text-[#F5C84C]">
                  {customersList.length}
                </span>
              </div>
              <div className="bg-black/50 p-1.5 rounded-xl border border-rose-500/30 text-center">
                <span className="text-[10px] text-rose-300 block">⏳ كريدي MAD</span>
                <span className="text-xs sm:text-sm font-black font-mono text-rose-400" dir="ltr">
                  {hideAmounts ? '••••' : totalDebtMad}
                </span>
              </div>
              <div className="bg-black/50 p-1.5 rounded-xl border border-amber-500/30 text-center">
                <span className="text-[10px] text-amber-300 block">⏳ كريدي MRU</span>
                <span className="text-xs sm:text-sm font-black font-mono text-amber-300" dir="ltr">
                  {hideAmounts ? '••••' : totalDebtMru}
                </span>
              </div>
            </div>

            {/* Search + Filter Tabs on 1 Compact Row */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="🔍 بحث بالاسم أو الهاتف..."
                  className="w-full bg-black/60 border border-white/20 rounded-xl px-2.5 py-2 text-xs text-white font-black placeholder-white/50 focus:outline-none focus:border-[#F5C84C]"
                />
              </div>
              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'debt' ? 'all' : 'debt')}
                className={`px-2.5 py-2 rounded-xl text-[11px] font-black border transition shrink-0 ${
                  filterMode === 'debt' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                ⏳ كريدي ({customersList.filter((c) => c.unpaidMad > 0 || c.unpaidMru > 0).length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode(filterMode === 'vip' ? 'all' : 'vip')}
                className={`px-2 py-2 rounded-xl text-[11px] font-black border transition shrink-0 ${
                  filterMode === 'vip' ? 'btn-gold' : 'btn-cancel'
                }`}
              >
                ⭐ VIP
              </button>
            </div>
          </div>

          {/* Standalone Toggle Button for Customers Operations Log */}
          <button
            type="button"
            data-btn-role="info"
            data-btn-role-fixed="true"
            data-btn-active={isCustomersLogOpen ? 'true' : 'false'}
            data-btn-active-fixed="true"
            onClick={() => setIsCustomersLogOpen(prev => !prev)}
            className="w-full py-2.5 px-3.5 rounded-2xl font-black text-xs flex items-center justify-between gap-2 cursor-pointer transition shadow-md"
          >
            <span>📋 سجل عمليات وحسابات الزبناء ({filteredCustomers.length})</span>
            <span className="text-[11px] font-black">
              {isCustomersLogOpen ? 'إخفاء السجل ▲' : 'عرض السجل ▼'}
            </span>
          </button>

          {/* Customers List (Hidden until toggle button is clicked) */}
          {isCustomersLogOpen && (
            filteredCustomers.length === 0 ? (
              <div className="bg-black/45 p-5 rounded-2xl border border-white/15 text-center animate-fadeIn">
                <p className="font-black text-white text-xs">لا توجد حسابات مطابقة للبحث</p>
              </div>
            ) : (
              <div className="space-y-2 animate-fadeIn">
                {filteredCustomers.map((c) => {
                const hasDebt = c.unpaidMad > 0 || c.unpaidMru > 0;
                const isExpanded = expandedKey === c.key;

                return (
                  <div
                    key={c.key}
                    className={`rounded-2xl border p-2.5 transition space-y-2 ${
                      hasDebt
                        ? 'bg-black/60 border-rose-500/45'
                        : 'bg-black/50 border-white/15'
                    }`}
                  >
                    {/* Row 1: Customer Name, Phone, VIP Badge & Debt */}
                    <div
                      onClick={() => setExpandedKey(isExpanded ? null : c.key)}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-black text-xs sm:text-sm text-white truncate">
                            👤 {c.name}
                          </span>
                          {c.vipRatePerKg && (
                            <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-[10px] font-black">
                              ⭐ {c.vipRatePerKg} {c.vipCurrency || 'MAD'}/kg
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-white/75 mt-0.5">
                          <span className="font-mono" dir="ltr">
                            📞 {c.phone || 'بدون رقم'}
                          </span>
                          <span>• 📦 {c.sentCount + c.receivedCount}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="text-left">
                          {hasDebt ? (
                            <div className="space-y-0.5">
                              {c.unpaidMad > 0 && (
                                <span
                                  className="block font-mono font-black text-xs text-rose-400"
                                  dir="ltr"
                                >
                                  {hideAmounts ? '••••' : c.unpaidMad} MAD
                                </span>
                              )}
                              {c.unpaidMru > 0 && (
                                <span
                                  className="block font-mono font-black text-xs text-amber-300"
                                  dir="ltr"
                                >
                                  {hideAmounts ? '••••' : c.unpaidMru} MRU
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-[#006233]/35 border border-[#2ECC71]/40 text-[#2ECC71] font-black text-[10px]">
                              ✅ خالص
                            </span>
                          )}
                        </div>
                        <ChevronDown
                          className={`w-4 h-4 text-[#F5C84C] transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </div>

                    {/* Row 2: Quick Action Shortcuts */}
                    <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => handleSendWhatsAppStatement(c)}
                        className="btn-gold flex-1 py-1.5 px-2 rounded-xl font-black text-[10px] flex items-center justify-center gap-1"
                      >
                        <span>💬 واتساب</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrintCustomerStatementPDF(c)}
                        className="btn-cancel py-1.5 px-2 rounded-xl font-black text-[10px] flex items-center gap-1"
                      >
                        <span>🖨️ PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setNewName(c.name);
                          setNewPhone(c.phone);
                          setNewCity(c.city);
                          setNewVipRatePerKg(c.vipRatePerKg ? String(c.vipRatePerKg) : '12');
                          setShowAddForm(true);
                        }}
                        className="btn-cancel py-1.5 px-2 rounded-xl font-black text-[10px]"
                      >
                        ⭐ VIP
                      </button>

                      {c.isSaved && c.savedId && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSavedCustomer(c.savedId)}
                          className="btn-delete p-1.5 rounded-xl"
                          title="حذف من القائمة المحفوظة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Expanded Parcels & Debt Settlement */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-white/15 space-y-2 animate-fadeIn">
                        {c.unpaidParcels.length > 0 && (
                          <div className="bg-rose-950/40 border border-rose-500/40 rounded-xl p-2 space-y-1.5">
                            <span className="font-black text-rose-300 block text-[11px]">
                              ⏳ كوليات كريدي ({c.unpaidParcels.length}):
                            </span>
                            {c.unpaidParcels.map((up) => {
                              const rem = Math.max(
                                0,
                                Math.round((up.amount_due - up.amount_paid) * 100) / 100
                              );
                              return (
                                <div
                                  key={up.id}
                                  className="bg-black/50 p-2 rounded-xl border border-white/10 flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0">
                                    <span className="font-mono font-bold text-[#F5C84C] text-[11px]">
                                      #{up.parcel_number} • {up.description}
                                    </span>
                                    <span className="block text-[10px] text-rose-300 font-mono">
                                      المتبقي: {hideAmounts ? '••••' : rem} {up.currency}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    disabled={payingParcelId === up.id}
                                    onClick={() => handleSettleParcelDebt(up, c.name)}
                                    className="btn-gold px-2.5 py-1.5 rounded-xl font-black text-[10px] shrink-0"
                                  >
                                    {payingParcelId === up.id ? '...' : `✅ تصفية`}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="space-y-1 max-h-36 overflow-y-auto">
                          {c.allParcels.slice(0, 10).map((p) => {
                            const rem = Math.max(
                              0,
                              Math.round((p.amount_due - p.amount_paid) * 100) / 100
                            );
                            return (
                              <div
                                key={p.id}
                                className="p-1.5 rounded-xl bg-black/40 border border-white/10 flex items-center justify-between text-[11px]"
                              >
                                <div className="truncate">
                                  <span className="font-mono font-bold text-white">
                                    #{p.parcel_number}
                                  </span>{' '}
                                  <span className="text-white/80">— {p.description}</span>
                                </div>
                                <span
                                  className={`font-mono font-bold shrink-0 ${
                                    rem > 0 ? 'text-rose-400' : 'text-[#2ECC71]'
                                  }`}
                                  dir="ltr"
                                >
                                  {rem > 0 ? `${rem} ${p.currency}` : '✅ خالص'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
};
