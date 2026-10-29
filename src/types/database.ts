export type UserRole = 'owner' | 'admin' | 'worker' | 'platform_owner';
export type MemberStatus = 'active' | 'pending' | 'rejected' | 'removed';
export type CollaborationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';

export type TransactionType = 
  | 'cash_in'               // قبض نقدي عام / إيراد صندوق
  | 'cash_out'              // صرف نقدي / مصاريف تشغيلية
  | 'goods_payment'         // سداد مستحقات بضائع للمرسل
  | 'parcel_shipping_fee'   // قبض أجرة شحن كولي
  | 'parcel_cod_collection' // قبض تحصيل كولي عند الاستلام (COD)
  | 'parcel_cod_payout';    // تسليم مبلغ التحصيل للتاجر/المرسل

export type TransactionStatus = 'confirmed' | 'cancelled';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

// حالات تتبع الكوليات
export type ParcelStatus = 
  | 'registered'        // تم التسجيل
  | 'in_transit'        // في الطريق / قيد النقل
  | 'arrived'           // وصلت المحطة
  | 'delivered'         // تم التسليم
  | 'return_in_transit' // في طريق الإرجاع
  | 'returned'          // تم الإرجاع للمرسل
  | 'cancelled'         // ملغاة
  | 'pending';          // قيد الانتظار

// حالة سلامة الكولي
export type ParcelCondition = 'normal' | 'abnormal'; // عادي | غير عادي

// حالات الرحلات (الديسباتش والنقل)
export type TripStatus = 'loading' | 'departed' | 'arrived' | 'closed'; // قيد التحميل | انطلقت | وصلت | مغلقة

// حالة الدفع للكولي
export type PaymentStatus = 'paid' | 'unpaid' | 'partial' | 'cod';

// من يدفع ثمن الشحن / الكولي
export type ParcelPayer = 'sender' | 'receiver';

export type Language = 'ar';

export interface Profile {
  id: string;
  phone: string;
  whatsapp_number: string;
  email?: string;
  email_verified?: boolean;
  name: string;
  avatar_url?: string;
  role?: UserRole;
  must_change_password?: boolean;
  created_at: string;
  updated_at?: string;
  is_demo?: boolean;
}

export interface Workspace {
  id: string;
  short_id: string; // كود فريد من 6 أحرف مثل 'A7K9X2'
  name: string;
  invite_code: string; // رمز دعوة عشوائي متجدد للعمال
  created_by: string | null;
  created_at: string;
  updated_at?: string;
  parcels_module_enabled?: boolean; // تشغيل/إيقاف موديول الكوليات (افتراضياً مفعل)
  printer_width?: '58mm' | '80mm';  // حجم الطابعة الحرارية الافتراضي (58 أو 80 مم)
  owner_phone?: string;
  owner_whatsapp?: string;
  admin_notes?: string; // ملاحظات خاصة بمالك المنصة
  plan_tier?: 'plan_1_full' | 'plan_2_two_stations'; // الباك الأول (شامل) أو الباك الثاني (محطتين وعامل لكل محطة)
  plan_name?: string; // اسم باقة الاشتراك
  max_workers?: number; // الحد الأقصى للعمال في مساحة العمل
  max_stations?: number; // الحد الأقصى للمحطات في مساحة العمل
  max_workers_per_station?: number; // الحد الأقصى للعمال في كل محطة (1 في الباك الثاني)
  max_collaborations?: number; // الحد الأقصى للشراكات بين المدراء
  unclaimed_days_threshold?: number; // عدد أيام الانتظار قبل تنبيه الإرجاع (افتراضياً 7)
  custom_brand_name?: string;        // اسم المحطة/الشركة المخصص على الملصق الحراري
  custom_brand_subtitle?: string;    // شعار نصي فرعي على الملصق الحراري
  custom_brand_phone?: string;       // رقم هاتف التواصل على الملصق الحراري
  custom_brand_logo_url?: string;    // رابط أو صورة شعار مخصص على الملصق الحراري
  workers_count?: number;
  stations_count?: number;
  collaborations_count?: number;
  last_reset_at?: string;
  subscription_end_date?: string;
  subscription_status?: SubscriptionStatus;
}

// التوافق مع الكود السابق
export type Team = Workspace;

export interface WorkspaceMember {
  id?: string;
  workspace_id: string;
  user_id: string;
  station_id?: string;
  name?: string;
  phone?: string;
  role: UserRole;
  status: MemberStatus;
  joined_at?: string;
  created_at?: string;
  profile?: Profile;
  is_demo?: boolean;
}

export type TeamMember = WorkspaceMember;

export interface JoinRequest {
  id: string;
  workspace_id: string;
  user_id: string;
  invite_code_used: string;
  user_name: string;
  user_phone: string;
  user_whatsapp: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export interface PasswordResetRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_phone: string;
  user_whatsapp: string;
  workspace_id?: string;
  workspace_name?: string;
  target_role: 'worker' | 'admin';
  status: 'pending' | 'resolved' | 'rejected';
  requested_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  temporary_password?: string | null;
}

export interface WorkspaceCollaboration {
  id: string;
  requester_workspace_id: string;
  target_workspace_id: string;
  target_workspace_short_id?: string;
  requester_workspace_name?: string;
  target_workspace_name?: string;
  status: CollaborationStatus;
  
  // خيارات الطرف الطالب
  requester_share_cash: boolean;
  requester_share_parcels: boolean;
  requester_share_reports: boolean;

  // خيارات الطرف المستهدف
  target_share_cash: boolean;
  target_share_parcels: boolean;
  target_share_reports: boolean;

  created_at: string;
  updated_at: string;
}

export interface Station {
  id: string;
  workspace_id?: string;
  team_id?: string; // compatibility alias
  name: string;
  city: string; // 'الداخلة', 'نواذيبو', 'الدار البيضاء', 'العيون', 'نواكشوط', 'الكركرات'
  country: 'MA' | 'MR';
  currency?: string; // العملة الأساسية للمحطة مثلاً 'MAD' أو 'MRU'
  default_currency?: string; // compatibility alias
  owner_id: string | null;
  is_active: boolean;
  phone?: string;
  address?: string;
  created_at: string;
  balances?: Record<string, number>; // currency -> balance
  is_demo?: boolean;
}

export interface StationWorker {
  station_id: string;
  workspace_id?: string;
  user_id: string;
  assigned_at: string;
  profile?: Profile;
  is_demo?: boolean;
}

export interface StationBalance {
  station_id: string;
  workspace_id?: string;
  currency: string;
  balance: number;
  updated_at: string;
  is_demo?: boolean;
}

export interface Currency {
  id: string;
  workspace_id?: string;
  team_id?: string;
  code: string; // 'MAD', 'MRU'
  label_ar: string; // 'درهم مغربي', 'أوقية موريتانية'
  label_fr?: string;
  symbol: string; // 'د.م.', 'أ.م.'
  is_active: boolean;
  rate_to_mad: number; // مثلاً 1 MAD = 3.8 MRU -> 0.263
  created_at: string;
}

// سجل تعديل المعاملة مع كتابة سبب إلزامي
export interface TransactionEditEntry {
  edited_at: string;
  edited_by_id: string;
  edited_by_name: string;
  reason: string; // سبب التعديل أو الإلغاء الإلزامي
  action: 'UPDATE' | 'CANCEL';
  previous_data: Record<string, any>;
}

export interface Transaction {
  id: string;
  workspace_id: string;
  team_id?: string;
  station_id: string;
  created_by: string;
  creator_name?: string;
  
  // بيانات المستفيد/العميل الواضحة
  person_name?: string;
  person_phone?: string | null;
  phone_number?: string | null; // compatibility alias

  type: TransactionType;
  amount: number;
  currency: string; // 'MAD' أو 'MRU'
  reason?: string | null;
  photo_url?: string | null;
  status: TransactionStatus;
  note?: string | null;
  parcel_id?: string | null;

  // سجل التاريخ والتعديلات مع الأسباب
  edit_history?: TransactionEditEntry[];
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  cancel_reason?: string | null;

  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  station_name?: string;
  is_collaborator_data?: boolean;
  collaborator_workspace_name?: string;
  collaborator_workspace_short_id?: string;
  is_demo?: boolean;
  pending_sync?: boolean;
  hawala_meta?: MoneyTransfer | null;
  hawala_transfer_id?: string | null;
}

// سجل حركة وتغيرات حالة الكولي
export interface ParcelStatusHistoryEntry {
  status: ParcelStatus;
  timestamp: string;
  changed_by_id: string;
  changed_by_name: string;
  notes?: string;
  trip_id?: string | null;
  trip_code?: string | null;
  driver_name?: string | null;
  vehicle_plate?: string | null;
  condition?: ParcelCondition;
  condition_notes?: string;
  return_reason?: string;
}

// سجل الدفعات النقدية للكولي
export interface ParcelPaymentEntry {
  id: string;
  amount: number;
  currency: string;
  paid_by: string; // اسم الدافع
  recorded_by_id: string;
  recorded_by_name: string;
  recorded_at: string;
  note?: string;
}

export interface Parcel {
  id: string;
  tracking_code: string;    // كود فريد مثل ITT-2026-00101
  parcel_number: number;    // الرقم التسلسلي للكولي في مساحة العمل
  workspace_id: string;
  team_id?: string;

  origin_station_id: string;
  destination_station_id: string;

  sender_name: string;
  sender_phone: string;
  receiver_name: string;
  receiver_phone: string;

  route: string;            // خط السير مثلاً: الداخلة ➔ نواذيبو
  description: string;      // وصف حر للبضاعة (أي نوع)
  category?: string;
  items_count: number;      // الكمية أو عدد الطرود
  weight_kg?: number;       // الوزن بالكيلوغرام (اختياري)
  declared_value?: number;

  // الإدارة المالية الدقيقة للكولي
  amount_due: number;       // المبلغ الإجمالي المستحق
  shipping_fee?: number;    // compatibility alias
  cod_amount?: number;      // compatibility alias
  payer: ParcelPayer;       // من يدفع: 'sender' (المرسل) أم 'receiver' (المستلم)
  amount_paid: number;      // المبلغ المدفوع بالفعل
  currency: string;         // 'MAD' أو 'MRU'
  payment_status?: PaymentStatus; // 'paid' | 'unpaid' | 'partial' | 'cod'

  // حالة الكولي وسجل التتبع
  status: ParcelStatus;
  condition: ParcelCondition;         // 'normal' (عادي) أو 'abnormal' (غير عادي)
  condition_notes?: string | null;    // ملاحظة إجبارية في حال كان الطرد غير عادي
  current_trip_id?: string | null;    // الرحلة المرتبط بها حالياً
  driver_name?: string | null;        // اسم الشيفور
  vehicle_plate?: string | null;      // ماتريكيل العربة

  // حقول إرجاع الكولي غير المستلم إلى المرسل (Phase 3)
  is_returning?: boolean;
  return_reason?: string | null;
  return_notes?: string | null;
  return_fee?: number;
  return_initiated_at?: string | null;
  return_initiated_by?: string | null;
  returned_to_sender_at?: string | null;
  returned_to_sender_name?: string | null;

  status_history: ParcelStatusHistoryEntry[];
  payment_history: ParcelPaymentEntry[];

  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
  arrived_at?: string | null;
  delivered_at?: string | null;
  delivered_to?: string | null;
  notes?: string | null;

  origin_station_name?: string;
  destination_station_name?: string;
  is_collaborator_data?: boolean;
  collaborator_workspace_name?: string;
  collaborator_workspace_short_id?: string;
  is_demo?: boolean;
  pending_sync?: boolean;
}

// واجهة بيانات الرحلة (الديسباتش والشحن بين المحطات)
export interface Trip {
  id: string;
  workspace_id: string;
  trip_number: number;                 // رقم الرحلة التسلسلي
  trip_code: string;                   // كود الرحلة مثل TRIP-2026-0001
  driver_name: string;                 // اسم الشيفور
  driver_phone?: string;               // هاتف الشيفور (اختياري للاتصال عبر الواتساب)
  vehicle_plate: string;               // ماتريكيل العربة (لوحة الترقيم)
  origin_station_id: string;          // محطة الانطلاق (مثلاً الداخلة)
  destination_station_id: string;     // محطة الوصول (مثلاً نواذيبو)
  origin_station_name?: string;
  destination_station_name?: string;
  status: TripStatus;                  // 'loading' | 'departed' | 'arrived' | 'closed'
  parcels_count: number;               // إجمالي الكوليات المشحونة
  loaded_parcel_ids: string[];         // ترتيب شحن الكوليات (Loading Order)
  received_parcel_ids: string[];       // الكوليات التي تم مسحها عند الوصول
  departure_time?: string | null;      // وقت انطلاق الرحلة الفعلي
  arrival_time?: string | null;        // وقت وصول الرحلة للمحطة
  closed_at?: string | null;           // وقت إغلاق الرحلة
  closed_by?: string | null;
  closed_by_name?: string | null;
  close_reason?: string | null;        // سبب الإغلاق اليدوي في حال وجود كوليات مفقودة
  notes?: string | null;
  is_return_trip?: boolean;
  // مصاريف الطريق للسائق (المازوط، الطريق السيار، العمولة، مصاريف أخرى)
  fuel_expense?: number;
  toll_expense?: number;
  driver_commission?: number;
  other_expense?: number;
  expense_currency?: string;
  deduct_from_cashbox?: boolean;
  created_by: string;
  creator_name?: string;
  created_at: string;
  updated_at: string;
  is_collaborator_data?: boolean;
  collaborator_workspace_name?: string;
  collaborator_workspace_short_id?: string;
  is_demo?: boolean;
  pending_sync?: boolean;
}

// السائقون وماتريكيلات العربات المحفوظة للاختيار السريع
export interface RememberedDriver {
  id?: string;
  workspace_id?: string;
  name: string;
  phone?: string;
  last_used: string;
}

export interface RememberedVehicle {
  id?: string;
  workspace_id?: string;
  plate: string;
  last_used: string;
}

export interface Subscription {
  id: string;
  workspace_id: string;
  team_id?: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  is_trial?: boolean;
  plan_name?: string;
  notes?: string;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  workspace_id: string;
  team_id?: string;
  user_id: string | null;
  user_name?: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'CANCEL' | 'STATUS_CHANGE' | 'PAYMENT';
  table_name: string;
  record_id: string;
  reason?: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
  is_demo?: boolean;
  pending_sync?: boolean;
}

export interface PendingSyncOperation {
  id: string;
  service: 'parcel' | 'trip' | 'cash';
  table:
    | 'parcels'
    | 'trips'
    | 'trip_parcels'
    | 'transactions'
    | 'audit_logs'
    | 'station_balances'
    | 'remembered_drivers'
    | 'remembered_vehicles';
  operation: 'upsert' | 'delete';
  payload: Record<string, any>;
  onConflict?: string;
  match?: Record<string, any>;
  recordId: string;
  createdAt: string;
}

// تقرير إغلاق اليومية للمحطة والصندوق
export interface DailyClosingReport {
  station_id: string;
  station_name: string;
  date: string;
  currencies: {
    currency: string;
    opening_balance: number;
    total_in: number;
    total_out: number;
    closing_balance: number;
    transactions_count: number;
  }[];
  generated_at: string;
  generated_by: string;
}

// سجل إقفال الصندوق اليومي وتسليم النوبة بين العمال (Clôture de Caisse)
export interface ShiftClosingRecord {
  id: string;
  workspace_id: string;
  station_id: string;
  station_name: string;
  date?: string;
  closed_by_user_id?: string;
  closed_by_name?: string;
  handed_over_to_name?: string;
  system_balance_mad?: number;
  physical_cash_mad?: number;
  difference_mad?: number;
  system_balance_mru?: number;
  physical_cash_mru?: number;
  difference_mru?: number;
  system_mad?: number;
  counted_mad?: number;
  diff_mad?: number;
  system_mru?: number;
  counted_mru?: number;
  diff_mru?: number;
  handed_over_by?: string;
  received_by?: string;
  notes?: string;
  created_at: string;
}

// سجل الزبون / التاجر في دفتر الزبائن الأوفياء وحسابات الكريدي
export interface SavedCustomer {
  id: string;
  workspace_id: string;
  name: string;
  phone: string;
  city?: string;
  type: 'merchant' | 'vip' | 'regular';
  vip_rate_per_kg?: number; // تسعيرة خاصة للكيلوغرام لهذا التاجر
  vip_currency?: 'MAD' | 'MRU';
  discount_percent?: number; // نسبة تخفيض خاصة %
  notes?: string;
  created_at: string;
}

// جدول التسعيرة التلقائية حسب الخط والوزن (Calculateur Automatique)
export interface RouteTariff {
  id: string;
  origin_city: string;
  destination_city: string;
  base_fee: number;        // سعر أدنى / أساسي للطرد
  rate_per_kg: number;     // سعر الكيلوغرام الواحد
  currency: 'MAD' | 'MRU';
}

// نظام الأمانة والتحويلات المالية المستقلة (Transfert d'Argent / Hawala)
export interface MoneyTransfer {
  id: string;
  workspace_id: string;
  transfer_code: string;     // كود الحوالة مثل HWL-2026-8419
  secret_pin: string;        // الكود السري للاستلام (4 أرقام)
  origin_station_id: string;
  origin_station_name: string;
  destination_station_id: string;
  destination_station_name: string;
  sender_name: string;
  sender_phone: string;
  receiver_name: string;
  receiver_phone: string;
  send_amount: number;
  send_currency: 'MAD' | 'MRU';
  commission_amount: number;
  payout_amount: number;
  payout_currency: 'MAD' | 'MRU';
  exchange_rate?: number;
  status: 'pending' | 'paid_out' | 'cancelled';
  created_by?: string;
  created_by_name?: string;
  creator_name?: string;
  created_at: string;
  paid_out_at?: string | null;
  paid_out_by?: string | null;
  paid_out_by_name?: string | null;
  notes?: string;
}


