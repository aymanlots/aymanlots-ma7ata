import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Boxes,
  TrendingUp,
  CreditCard,
  AlertTriangle,
  Receipt,
  Plus,
  Eye,
  Search,
  Truck,
} from 'lucide-react';
import { db } from '../db';
import { StatCard } from '../components/StatCard';
import { Modal } from '../components/Modal';
import { useI18n } from '../i18n';
import { formatMAD } from '../lib/currency';
import { AppTab, Product, Sale } from '../types';
import { generateBonPDF } from '../lib/pdfGenerator';
import { getStoreSettings } from '../db';

interface DashboardPageProps {
  onNavigate: (tab: AppTab, params?: any) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { t, language } = useI18n();
  const [showLowStockModal, setShowLowStockModal] = useState(false);

  // Live queries from Dexie
  const products = useLiveQuery(() => db.products.toArray(), []) || [];
  const sales = useLiveQuery(() => db.sales.orderBy('id').reverse().toArray(), []) || [];
  const customers = useLiveQuery(() => db.customers.toArray(), []) || [];
  const suppliers = useLiveQuery(() => db.suppliers.toArray(), []) || [];

  // 1. KPI: Total stock value (purchase price * quantity)
  const totalStockValue = products.reduce((acc, p) => acc + (p.purchasePrice * p.quantity), 0);

  // 2. KPI: Today's sales
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales
    .filter((s) => s.date === todayStr && s.status !== 'returned')
    .reduce((acc, s) => acc + s.totalAmount, 0);

  // 3. KPI: Customer total credit
  const totalCustomerCredit = customers.reduce((acc, c) => acc + (c.totalCredit || 0), 0);

  // 4. KPI: Low stock items (qty < 5)
  const lowStockProducts = products.filter((p) => p.quantity < 5);

  // 5. KPI: Supplier total debt balance
  const totalSupplierDebt = suppliers.reduce((acc, s) => acc + Math.max(0, s.totalDebt - s.paidAmount), 0);

  // Last 7 days sales aggregation for mini chart
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dateStr = d.toISOString().split('T')[0];
    const daySales = sales
      .filter((s) => s.date === dateStr && s.status !== 'returned')
      .reduce((sum, s) => sum + s.totalAmount, 0);
    const dayLabel = d.toLocaleDateString(language === 'ar' ? 'ar-MA' : 'fr-MA', {
      weekday: 'short',
    });
    return { date: dateStr, label: dayLabel, total: daySales };
  });

  const maxDaySales = Math.max(...last7Days.map((d) => d.total), 1000);

  // Quick Bon PDF Preview
  const handleViewPdf = async (sale: Sale) => {
    const settings = await getStoreSettings();
    await generateBonPDF(sale, settings, 'save');
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div>
          <h1 className="text-xl font-bold text-neutral-100 tracking-tight">
            {t.dashboard.title}
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            {t.appSubtitle}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('pos')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-bold transition shadow-sm"
          >
            <Receipt className="w-4 h-4" />
            <span>{t.nav.pos}</span>
          </button>
          <button
            onClick={() => onNavigate('stock', { action: 'add' })}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-semibold border border-neutral-700 transition"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>{t.stock.addProduct}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t.dashboard.kpiStockValue}
          value={formatMAD(totalStockValue, language)}
          subtitle={`${products.length} références`}
          icon={Boxes}
          onClick={() => onNavigate('stock')}
        />
        <StatCard
          title={t.dashboard.kpiTodaySales}
          value={formatMAD(todaySales, language)}
          subtitle={`${sales.filter((s) => s.date === todayStr).length} bons aujourd'hui`}
          icon={TrendingUp}
          onClick={() => onNavigate('bons')}
        />
        <StatCard
          title={t.dashboard.kpiCustomerCredit}
          value={formatMAD(totalCustomerCredit, language)}
          subtitle={`${customers.filter((c) => c.totalCredit > 0).length} clients avec solde`}
          icon={CreditCard}
          badge={totalCustomerCredit > 0 ? "À Recouvrer" : "Soldé"}
          alert={totalCustomerCredit > 5000}
          onClick={() => onNavigate('customers')}
        />
        <StatCard
          title={t.dashboard.kpiLowStock}
          value={lowStockProducts.length}
          subtitle={lowStockProducts.length > 0 ? "Moins de 5 pièces" : t.dashboard.noLowStock}
          icon={AlertTriangle}
          alert={lowStockProducts.length > 0}
          badge={lowStockProducts.length > 0 ? "Alerte Stock" : undefined}
          onClick={() => setShowLowStockModal(true)}
        />
      </div>

      {/* 2-Column Split: Sales Chart + Supplier Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 7-Day Sales Trend Bar Chart (2 columns) */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-neutral-100">
                {t.dashboard.salesTrend7Days}
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Total 7 jours :{' '}
                <span className="font-mono font-bold text-amber-400">
                  {formatMAD(last7Days.reduce((a, b) => a + b.total, 0), language)}
                </span>
              </p>
            </div>
            <button
              onClick={() => onNavigate('bons')}
              className="text-xs text-amber-400 hover:text-amber-300 font-medium"
            >
              {t.dashboard.viewAllBons} →
            </button>
          </div>

          {/* Bar Chart Container */}
          <div className="h-44 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-neutral-800">
            {last7Days.map((d, idx) => {
              const heightPercent = Math.max(8, Math.round((d.total / maxDaySales) * 100));
              const isToday = idx === 6;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
                  <div className="opacity-0 group-hover:opacity-100 transition text-[10px] font-mono text-amber-300 bg-neutral-800 px-1.5 py-0.5 rounded -mb-1 pointer-events-none whitespace-nowrap">
                    {formatMAD(d.total, language)}
                  </div>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full max-w-[42px] rounded-t-md transition-all duration-300 ${
                      isToday
                        ? 'bg-gradient-to-t from-amber-600 to-amber-400 shadow-md shadow-amber-500/10'
                        : d.total > 0
                        ? 'bg-neutral-700 hover:bg-neutral-600'
                        : 'bg-neutral-800/40'
                    }`}
                  />
                  <span className={`text-[11px] font-medium ${isToday ? 'text-amber-400 font-bold' : 'text-neutral-400'}`}>
                    {d.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Suppliers Quick Debt Card */}
        <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-neutral-100 flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>{t.dashboard.kpiDebtSuppliers}</span>
              </h2>
              <button
                onClick={() => onNavigate('suppliers')}
                className="text-xs text-amber-400 hover:text-amber-300"
              >
                Gérer →
              </button>
            </div>
            <div className="p-4 rounded-lg bg-neutral-950/60 border border-neutral-800 mb-4">
              <div className="text-xs text-neutral-400">Total à régler aux fournisseurs</div>
              <div className="text-xl font-bold font-mono text-neutral-100 mt-1">
                {formatMAD(totalSupplierDebt, language)}
              </div>
            </div>

            <div className="space-y-2 text-xs">
              {suppliers.slice(0, 3).map((sup) => {
                const bal = Math.max(0, sup.totalDebt - sup.paidAmount);
                return (
                  <div key={sup.id} className="flex items-center justify-between py-1.5 border-b border-neutral-800/60">
                    <span className="text-neutral-300 truncate max-w-[140px]">{sup.name}</span>
                    <span className={`font-mono font-semibold ${bal > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {formatMAD(bal, language)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => onNavigate('suppliers')}
            className="w-full mt-4 py-2 px-3 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-200 transition text-center"
          >
            {t.suppliers.title}
          </button>
        </div>
      </div>

      {/* Recent Sales Table */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-neutral-100">
            {t.dashboard.recentSales}
          </h2>
          <button
            onClick={() => onNavigate('bons')}
            className="text-xs text-amber-400 hover:text-amber-300 font-medium"
          >
            {t.dashboard.viewAllBons} →
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-start text-xs">
            <thead className="bg-neutral-950/60 text-neutral-400 uppercase text-[10px] tracking-wider border-b border-neutral-800">
              <tr>
                <th className="py-2.5 px-3 text-start">{t.bons.bonNumber}</th>
                <th className="py-2.5 px-3 text-start">{t.date}</th>
                <th className="py-2.5 px-3 text-start">{t.bons.client}</th>
                <th className="py-2.5 px-3 text-end">{t.total}</th>
                <th className="py-2.5 px-3 text-end">{t.paid}</th>
                <th className="py-2.5 px-3 text-end">{t.remaining}</th>
                <th className="py-2.5 px-3 text-center">{t.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {sales.slice(0, 10).map((sale) => (
                <tr key={sale.id} className="hover:bg-neutral-800/40 transition">
                  <td className="py-3 px-3 font-mono font-bold text-amber-400 whitespace-nowrap">
                    {sale.bonNumber}
                  </td>
                  <td className="py-3 px-3 text-neutral-400 whitespace-nowrap">
                    {sale.date}
                  </td>
                  <td className="py-3 px-3 font-medium text-neutral-200 truncate max-w-[160px]">
                    {sale.customerName}
                  </td>
                  <td className="py-3 px-3 text-end font-mono font-bold text-neutral-100 whitespace-nowrap">
                    {formatMAD(sale.totalAmount, language)}
                  </td>
                  <td className="py-3 px-3 text-end font-mono text-emerald-400 whitespace-nowrap">
                    {formatMAD(sale.paidAmount, language)}
                  </td>
                  <td className="py-3 px-3 text-end font-mono whitespace-nowrap">
                    {sale.remainingAmount > 0 ? (
                      <span className="text-rose-400 font-bold">
                        {formatMAD(sale.remainingAmount, language)}
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-medium">0 DH</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <button
                      onClick={() => handleViewPdf(sale)}
                      className="p-1 rounded text-neutral-400 hover:text-amber-400 transition"
                      title={t.bons.viewPdf}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Low Stock Alert Modal */}
      <Modal
        isOpen={showLowStockModal}
        onClose={() => setShowLowStockModal(false)}
        title={t.dashboard.lowStockTitle}
        maxWidth="lg"
      >
        <div className="space-y-3">
          {lowStockProducts.length === 0 ? (
            <p className="text-xs text-neutral-400 text-center py-4">{t.dashboard.noLowStock}</p>
          ) : (
            lowStockProducts.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setShowLowStockModal(false);
                  onNavigate('stock', { search: p.name });
                }}
                className="flex items-center justify-between p-3 rounded-lg bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 cursor-pointer transition text-xs"
              >
                <div>
                  <div className="font-semibold text-neutral-100">{p.name}</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">
                    Catégorie: {t.stock.categories[p.category] || p.category}
                  </div>
                </div>
                <div className="text-end">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                    {p.quantity} en stock
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
};
