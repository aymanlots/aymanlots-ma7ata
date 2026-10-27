import React from 'react';
import { Transaction } from '../types/database';
import { useApp } from '../context/AppContext';
import { 
  X, 
  Coins, 
  Calendar, 
  Clock, 
  User, 
  Phone, 
  Building2, 
  FileText, 
  AlertTriangle, 
  Edit3, 
  CheckCircle2,
  Printer 
} from 'lucide-react';
import { printOfficialCashVoucherBonPDF } from '../utils/logisticsFeatures';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  isOpen,
  onClose
}) => {
  const { hideAmounts, currentWorkspace } = useApp();

  if (!isOpen || !transaction) return null;

  const isCancelled = transaction.status === 'cancelled';
  const isInflow = transaction.type === 'cash_in' || 
                   transaction.type === 'parcel_shipping_fee' || 
                   transaction.type === 'parcel_cod_collection';

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'cash_in':
        return { label: '📥 إيداع نقدي في الصندوق', color: 'bg-[#006233]/30 text-[#2ECC71] border-[#006233]/50' };
      case 'parcel_shipping_fee':
        return { label: '📦 قبض أجرة شحن كولي', color: 'bg-[#006233]/30 text-[#2ECC71] border-[#006233]/50' };
      case 'parcel_cod_collection':
        return { label: '💰 قبض تحصيل كولي عند التسليم (COD)', color: 'bg-[#006233]/30 text-[#2ECC71] border-[#006233]/50' };
      case 'cash_out':
        return { label: '📤 صرف نقدي / مصاريف تشغيلية', color: 'bg-[#C1272D]/25 text-[#FF5A5F] border-[#C1272D]/50' };
      case 'goods_payment':
        return { label: '🤝 سداد بضاعة للتاجر / المرسل', color: 'bg-[#C1272D]/25 text-[#FF5A5F] border-[#C1272D]/50' };
      case 'parcel_cod_payout':
        return { label: '📤 تسليم مبلغ COD محصل للتاجر', color: 'bg-[#C1272D]/25 text-[#FF5A5F] border-[#C1272D]/50' };
      default:
        return { label: type, color: 'bg-black/45 text-white/80 border-white/20' };
    }
  };

  const badge = getTypeLabel(transaction.type);

  const formatExactDateTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      return `${year}/${month}/${day} - ${hours}:${minutes}:${seconds}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[rgba(0,0,0,0.55)] overflow-y-auto animate-fadeIn"
      dir="rtl"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg rounded-[24px] p-4 sm:p-5 shadow-2xl text-right overflow-hidden relative my-4 max-h-[90vh] flex flex-col"
        style={{
          background: 'rgba(0, 0, 0, 0.55)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          boxShadow: '0 12px 35px rgba(0, 0, 0, 0.85)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-white/15 pb-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-[#006233]/35 text-[#2ECC71] border border-[#006233]/60 flex items-center justify-center font-bold shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-white">تفاصيل القيد المالي (لاكيس)</h3>
              <p className="text-[11px] text-white/80 flex items-center gap-1 flex-wrap">
                <span>المعرف:</span>
                <span
                  className="font-mono font-bold text-white/95"
                  dir="ltr"
                  style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}
                >
                  {transaction.id}
                </span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="btn-cancel p-2 rounded-xl bg-black/50 border border-white/15 text-white/80 hover:text-white transition shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto space-y-3.5 py-3.5 pr-0.5 pl-0.5 text-xs min-h-0">
          
          {/* Main Status & Amount Card */}
          <div className={`p-4 rounded-2xl border ${
            isCancelled 
              ? 'bg-[#C1272D]/15 border-[#C1272D]/40' 
              : 'bg-black/45 border-white/15'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badge.color}`}>
                {badge.label}
              </span>
              <span className="text-white/90 font-bold flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-[#2ECC71]" />
                <span>{transaction.station_name || 'المحطة'}</span>
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-2.5 border-t border-white/15 gap-2">
              <span className="text-white/80 font-bold">قيمة القيد الصافي:</span>
              <span
                dir="ltr"
                style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}
                className={`text-2xl font-black font-mono whitespace-nowrap ${
                  isCancelled
                    ? 'line-through text-white/50'
                    : isInflow
                    ? 'text-[#2ECC71]'
                    : 'text-[#FF5A5F]'
                }`}
              >
                {`${isInflow ? '+' : '−'}${hideAmounts ? '••••' : transaction.amount} ${transaction.currency}`}
              </span>
            </div>
          </div>

          {/* Creation Metadata - Who & Exact Date/Time */}
          <div className="bg-black/45 p-4 rounded-2xl border border-white/15 space-y-2.5">
            <h4 className="text-[11px] font-bold text-[#2ECC71] flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>توثيق التسجيل المالي (من ومتى)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1.5 border-t border-white/15">
              <div className="bg-black/40 p-2.5 rounded-xl border border-white/15">
                <span className="text-[10px] text-white/75 block mb-0.5">سجّله الموظف / المسؤول:</span>
                <span className="font-bold text-white text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2ECC71] shrink-0" />
                  <span>{transaction.creator_name || 'موظف المحطة'}</span>
                </span>
              </div>

              <div className="bg-black/40 p-2.5 rounded-xl border border-white/15">
                <span className="text-[10px] text-white/75 block mb-0.5">التاريخ والوقت بالثانية:</span>
                <div
                  dir="ltr"
                  style={{
                    direction: 'ltr',
                    unicodeBidi: 'isolate',
                    textAlign: 'right',
                    display: 'block',
                  }}
                  className="font-mono font-bold text-white text-xs whitespace-nowrap"
                >
                  {formatExactDateTime(transaction.created_at)}
                </div>
              </div>
            </div>
          </div>

          {/* Cancellation Info (If Cancelled) */}
          {isCancelled && (
            <div className="bg-[#C1272D]/15 border border-[#C1272D]/45 p-3.5 rounded-2xl space-y-2">
              <div className="flex items-center gap-1.5 text-[#FF5A5F] font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-[#FF5A5F] shrink-0" />
                <span>بيانات إلغاء هذا السند المالي:</span>
              </div>
              <div className="text-xs text-white/90 space-y-1.5 bg-black/45 p-2.5 rounded-xl border border-[#C1272D]/35">
                <p>
                  <strong className="text-white">أُلغي بواسطة:</strong> {transaction.cancelled_by_name || 'المدير العام'}
                </p>
                {transaction.cancelled_at && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <strong className="text-white">تاريخ وتوقيت الإلغاء:</strong>
                    <span
                      className="font-mono text-[#FF5A5F] font-bold"
                      dir="ltr"
                      style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'right', display: 'inline-block' }}
                    >
                      {formatExactDateTime(transaction.cancelled_at)}
                    </span>
                  </div>
                )}
                <p>
                  <strong className="text-white">السبب المكتوب للإلغاء:</strong> {transaction.cancel_reason || 'تم إرجاع المبلغ للصندوق'}
                </p>
              </div>
            </div>
          )}

          {/* Edit History (If Edited) */}
          {transaction.edit_history && transaction.edit_history.length > 0 && (
            <div className="bg-black/45 p-4 rounded-2xl border border-white/15 space-y-2.5">
              <h4 className="text-[11px] font-bold text-[#2ECC71] flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" />
                <span>سجل التعديلات السابقة ({transaction.edit_history.length})</span>
              </h4>

              <div className="space-y-2">
                {transaction.edit_history.map((entry, idx) => (
                  <div key={idx} className="bg-black/40 p-2.5 rounded-xl border border-white/15 text-[11px] space-y-1">
                    <div className="flex items-center justify-between gap-2 text-white font-bold flex-wrap">
                      <span>عدّله: {entry.edited_by_name}</span>
                      <span
                        className="font-mono text-[10px] text-white/80"
                        dir="ltr"
                        style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'right', display: 'inline-block' }}
                      >
                        {formatExactDateTime(entry.edited_at)}
                      </span>
                    </div>
                    <p className="text-white/90">
                      <strong className="text-white/70">السبب المكتوب:</strong> {entry.reason}
                    </p>
                    {entry.previous_data?.amount && (
                      <p className="text-white/80 text-[10px] flex items-center gap-1">
                        <span>المبلغ السابق:</span>
                        <span
                          className="font-mono font-bold text-white"
                          dir="ltr"
                          style={{ direction: 'ltr', unicodeBidi: 'isolate', display: 'inline-block' }}
                        >
                          {`${hideAmounts ? '••••' : entry.previous_data.amount} ${transaction.currency}`}
                        </span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Party & Reason Details */}
          <div className="bg-black/45 p-4 rounded-2xl border border-white/15 space-y-2.5 text-xs">
            <h4 className="text-[11px] font-bold text-white/85 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#2ECC71]" />
              <span>البيان وتفاصيل المستفيد</span>
            </h4>

            <div className="pt-1 space-y-2">
              <div>
                <span className="text-white/75 text-[10px] block mb-1">البيان / السبب:</span>
                <p className="text-white font-bold bg-black/40 p-2.5 rounded-xl border border-white/15">
                  {transaction.reason || 'بدون بيان محدد'}
                </p>
              </div>

              {transaction.phone_number && (
                <div>
                  <span className="text-white/75 text-[10px] block mb-1">رقم الهاتف:</span>
                  <div className="text-white font-mono font-bold bg-black/40 p-2.5 rounded-xl border border-white/15 flex items-center justify-between gap-2">
                    <span
                      dir="ltr"
                      style={{ direction: 'ltr', unicodeBidi: 'isolate', textAlign: 'right', display: 'inline-block' }}
                    >
                      {transaction.phone_number}
                    </span>
                    <Phone className="w-3.5 h-3.5 text-[#2ECC71] shrink-0" />
                  </div>
                </div>
              )}

              {transaction.note && (
                <div>
                  <span className="text-white/75 text-[10px] block mb-1">ملاحظات إضافية:</span>
                  <p className="text-white/90 italic bg-black/40 p-2.5 rounded-xl border border-white/15">
                    "{transaction.note}"
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Photo Preview if attached */}
          {transaction.photo_url && (
            <div className="bg-black/45 p-3 rounded-2xl border border-white/15 text-center">
              <span className="text-[10px] text-white/80 block mb-1.5 font-bold">صورة الوصل المرفقة:</span>
              <img 
                src={transaction.photo_url} 
                alt="وصل السند" 
                className="max-h-56 mx-auto rounded-xl object-contain border border-white/20" 
              />
            </div>
          )}

        </div>

        {/* Fixed Bottom Modal Actions */}
        <div className="border-t border-white/15 pt-3 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              printOfficialCashVoucherBonPDF(transaction, {
                name: currentWorkspace?.custom_brand_name || currentWorkspace?.name,
                subtitle: currentWorkspace?.custom_brand_subtitle,
                phone: currentWorkspace?.custom_brand_phone || currentWorkspace?.owner_phone,
                logoUrl: currentWorkspace?.custom_brand_logo_url,
              })
            }
            className="btn-gold flex-1 py-2.5 px-4 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة بون السند المالي (PDF)</span>
          </button>
          <button
            onClick={onClose}
            className="btn-cancel px-6 py-2.5 rounded-xl font-black text-xs transition active:scale-95"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
