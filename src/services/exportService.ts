import { Transaction, Parcel, Workspace } from '../types/database';

export const exportService = {
  // تصدير المعاملات إلى ملف CSV متوافق مع Excel واللغة العربية
  exportTransactionsToCSV(transactions: Transaction[], workspaceName: string): void {
    const headers = [
      'المعرف',
      'التاريخ والوقت',
      'المحطة',
      'نوع المعاملة',
      'المبلغ',
      'العملة',
      'اسم العميل',
      'هاتف العميل',
      'السبب والبيان',
      'الملاحظات',
      'المسؤول عن التسجيل',
      'الحالة'
    ];

    const typeNames: Record<string, string> = {
      cash_in: 'قبض نقدي',
      cash_out: 'صرف نقدي',
      goods_payment: 'سداد بضاعة',
      parcel_shipping_fee: 'أجرة شحن كولي',
      parcel_cod_collection: 'تحصيل كولي عند الاستلام',
      parcel_cod_payout: 'تسليم تحصيل للمرسل'
    };

    const rows = transactions.map(t => [
      t.id,
      new Date(t.created_at).toLocaleString('ar-MA'),
      `"${(t.station_name || '').replace(/"/g, '""')}"`,
      `"${typeNames[t.type] || t.type}"`,
      t.amount,
      t.currency,
      `"${(t.person_name || '').replace(/"/g, '""')}"`,
      `"${(t.person_phone || '').replace(/"/g, '""')}"`,
      `"${(t.reason || '').replace(/"/g, '""')}"`,
      `"${(t.note || '').replace(/"/g, '""')}"`,
      `"${(t.creator_name || '').replace(/"/g, '""')}"`,
      t.status === 'confirmed' ? 'معتمدة' : 'ملغاة'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    this.downloadFile(csvContent, `سجلات_الصندوق_${workspaceName}_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  },

  // تصدير الكوليات إلى ملف CSV
  exportParcelsToCSV(parcels: Parcel[], workspaceName: string): void {
    const headers = [
      'رقم الكولي',
      'كود التتبع',
      'تاريخ التسجيل',
      'محطة الانطلاق',
      'محطة الوصول',
      'المرسل',
      'هاتف المرسل',
      'المستلم',
      'هاتف المستلم',
      'وصف البضاعة',
      'العدد',
      'الوزن (كغ)',
      'المبلغ المستحق',
      'المبلغ المدفوع',
      'الطرف الدافع',
      'العملة',
      'الحالة',
      'المسؤول'
    ];

    const statusNames: Record<string, string> = {
      registered: 'تم التسجيل',
      in_transit: 'في الطريق',
      arrived: 'وصلت المحطة',
      delivered: 'تم التسليم',
      cancelled: 'ملغاة'
    };

    const rows = parcels.map(p => [
      p.parcel_number,
      p.tracking_code,
      new Date(p.created_at).toLocaleString('ar-MA'),
      `"${(p.origin_station_name || '').replace(/"/g, '""')}"`,
      `"${(p.destination_station_name || '').replace(/"/g, '""')}"`,
      `"${(p.sender_name || '').replace(/"/g, '""')}"`,
      `"${(p.sender_phone || '').replace(/"/g, '""')}"`,
      `"${(p.receiver_name || '').replace(/"/g, '""')}"`,
      `"${(p.receiver_phone || '').replace(/"/g, '""')}"`,
      `"${(p.description || '').replace(/"/g, '""')}"`,
      p.items_count,
      p.weight_kg || '',
      p.amount_due,
      p.amount_paid,
      p.payer === 'sender' ? 'المرسل' : 'المستلم',
      p.currency,
      statusNames[p.status] || p.status,
      `"${(p.creator_name || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    this.downloadFile(csvContent, `سجلات_الكوليات_${workspaceName}_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  },

  // تصدير نسخة احتياطية كاملة لمساحة العمل إلى JSON
  exportWorkspaceBackupJSON(
    workspace: Workspace,
    transactions: Transaction[],
    parcels: Parcel[]
  ): void {
    const backupData = {
      workspace,
      exported_at: new Date().toISOString(),
      transactions_count: transactions.length,
      parcels_count: parcels.length,
      data: {
        transactions,
        parcels
      }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    this.downloadFile(jsonString, `نسخة_احتياطية_${workspace.short_id}_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  },

  // دالة تحميل الملف في المتصفح
  downloadFile(content: string, fileName: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
