-- ============================================================================
-- محطة الاتحادية - AL-ITTIHADIYA
-- سكريبت قاعدة البيانات الرئيسي المتكامل لـ Supabase (PostgreSQL + RLS + Functions + Triggers)
-- الإصدار الشامل (Phases 1-8)
-- ============================================================================
-- ميزات وهندسة الأمان:
-- 1. عزل مطلق بين مساحات العمل (Multi-Admin Isolation) عبر workspace_id في كل جدول
-- 2. معرف فريد قصير من 6 أحرف لكل مساحة عمل (Short ID)
-- 3. عزل العمال حسب المحطة (Worker Station Isolation): العامل يرى فقط محطته المعين بها
-- 4. أمان مالك المنصة (Platform Owner): الصلاحية محصورة بجدول platform_owners ولا تُمنح بالهاتف إطلاقاً
-- 5. تفعيل RLS على كل الجداول (100% RLS Coverage) دون أي سياسة تستخدم true أو وصول مجهول anon
-- 6. دوال SECURITY DEFINER مزودة بفحص auth.uid() ومسار بحث محكم: SET search_path = public, pg_temp
-- 7. وحدة كوليات مستقلة مع سجل تاريخ الحالات والدفعات والتذاكر الحرارية
-- 8. تقارير إغلاق اليومية وسجلات الرقابة المحاسبية مع أسباب التعديل والإلغاء
-- ============================================================================

-- 0. الملحقات الضرورية
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. الجداول الأساسية (TABLES)
-- ============================================================================

-- 1.1 جدول مالكي المنصة (Platform Owners)
-- جدول محمي تماماً: لا يمكن لأي واجهة برمجية أو مستخدم عادي الإدراج فيه
-- يتم التعيين حصراً بأمر SQL يدوي من قِبل المشرف العام
CREATE TABLE IF NOT EXISTS public.platform_owners (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.2 جدول ملفات المستخدمين (مرتبط بـ auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    whatsapp_number TEXT NOT NULL,
    avatar_url TEXT,
    must_change_password BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE NOT NULL;

-- 1.3 جدول مساحات العمل المستقلة (Workspaces)
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id VARCHAR(6) UNIQUE NOT NULL,      -- كود فريد من 6 أحرف مثل WK7A9X
    name TEXT NOT NULL,
    invite_code VARCHAR(12) UNIQUE NOT NULL,  -- رمز دعوة عشوائي متجدد للعمال
    parcels_module_enabled BOOLEAN DEFAULT TRUE NOT NULL,
    printer_width VARCHAR(5) DEFAULT '80mm' NOT NULL CHECK (printer_width IN ('58mm', '80mm')),
    owner_phone TEXT,
    owner_whatsapp TEXT,
    admin_notes TEXT,
    plan_name TEXT NOT NULL DEFAULT 'الباقة الأساسية',
    max_workers INT NOT NULL DEFAULT 5 CHECK (max_workers >= 1),
    max_stations INT NOT NULL DEFAULT 3 CHECK (max_stations >= 1),
    max_collaborations INT NOT NULL DEFAULT 3 CHECK (max_collaborations >= 0),
    unclaimed_days_threshold INT NOT NULL DEFAULT 7 CHECK (unclaimed_days_threshold >= 1),
    last_parcel_number BIGINT DEFAULT 100 NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS last_parcel_number BIGINT DEFAULT 100 NOT NULL;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS plan_name TEXT NOT NULL DEFAULT 'الباقة الأساسية';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS max_workers INT NOT NULL DEFAULT 5;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS max_stations INT NOT NULL DEFAULT 3;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS max_collaborations INT NOT NULL DEFAULT 3;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS unclaimed_days_threshold INT NOT NULL DEFAULT 7;

-- 1.4 جدول أعضاء مساحة العمل (Workspace Members)
CREATE TABLE IF NOT EXISTS public.workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'worker')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'rejected', 'removed')),
    joined_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (workspace_id, user_id)
);

-- 1.5 جدول طلبات الانضمام لمساحة العمل (Join Requests)
CREATE TABLE IF NOT EXISTS public.join_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invite_code_used TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    user_whatsapp TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (workspace_id, user_id)
);

-- 1.6 جدول طلبات استعادة كلمة المرور (Password Reset Requests)
CREATE TABLE IF NOT EXISTS public.password_reset_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_name TEXT NOT NULL,
    user_phone TEXT NOT NULL,
    user_whatsapp TEXT NOT NULL,
    workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
    target_role TEXT NOT NULL CHECK (target_role IN ('worker', 'admin')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'rejected')),
    temporary_password TEXT,
    requested_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 1.7 جدول التعاون والمشاركة بين المدراء (Workspace Collaborations)
CREATE TABLE IF NOT EXISTS public.workspace_collaborations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    target_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
    
    -- إعدادات الطرف الطالب (ما يشاركه مع الطرف الآخر)
    requester_share_cash BOOLEAN DEFAULT FALSE NOT NULL,
    requester_share_parcels BOOLEAN DEFAULT FALSE NOT NULL,
    requester_share_reports BOOLEAN DEFAULT FALSE NOT NULL,
    
    -- إعدادات الطرف المستهدف (ما يشاركه مع الطرف الطالب)
    target_share_cash BOOLEAN DEFAULT FALSE NOT NULL,
    target_share_parcels BOOLEAN DEFAULT FALSE NOT NULL,
    target_share_reports BOOLEAN DEFAULT FALSE NOT NULL,
    
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    CHECK (requester_workspace_id <> target_workspace_id),
    UNIQUE (requester_workspace_id, target_workspace_id)
);

-- 1.8 جدول المحطات الدولية (Stations)
CREATE TABLE IF NOT EXISTS public.stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    country VARCHAR(2) NOT NULL CHECK (country IN ('MA', 'MR')),
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    phone TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.stations ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1.9 جدول تعيين العمال في المحطات (Station Workers)
CREATE TABLE IF NOT EXISTS public.station_workers (
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (station_id, user_id)
);

-- 1.10 جدول أرصدة المحطات والصناديق (Station Balances)
CREATE TABLE IF NOT EXISTS public.station_balances (
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    currency VARCHAR(4) NOT NULL CHECK (currency IN ('MAD', 'MRU')),
    balance NUMERIC(14,2) DEFAULT 0.00 NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (station_id, currency)
);

-- 1.11 جدول المعاملات النقدية والتحويلات (Transactions)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN (
        'cash_in', 
        'cash_out', 
        'goods_payment', 
        'parcel_shipping_fee', 
        'parcel_cod_collection', 
        'parcel_cod_payout'
    )),
    amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(4) NOT NULL CHECK (currency IN ('MAD', 'MRU')),
    person_name TEXT NOT NULL,
    person_phone TEXT,
    reason TEXT,
    photo_url TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    note TEXT,
    parcel_id UUID,
    edit_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.12 جدول الكوليات والإرساليات المستقل (Parcels)
CREATE TABLE IF NOT EXISTS public.parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    parcel_number BIGINT NOT NULL,
    tracking_code VARCHAR(30) UNIQUE NOT NULL,
    origin_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    destination_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    sender_name TEXT NOT NULL,
    sender_phone TEXT NOT NULL,
    receiver_name TEXT NOT NULL,
    receiver_phone TEXT NOT NULL,
    route TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT DEFAULT 'بضائع عامة',
    items_count INT DEFAULT 1 NOT NULL CHECK (items_count > 0),
    weight_kg NUMERIC(10,2),
    declared_value NUMERIC(12,2),
    amount_due NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
    payer TEXT NOT NULL DEFAULT 'sender' CHECK (payer IN ('sender', 'receiver')),
    amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
    currency VARCHAR(4) NOT NULL DEFAULT 'MAD' CHECK (currency IN ('MAD', 'MRU')),
    status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN (
        'registered', 
        'in_transit', 
        'arrived', 
        'delivered', 
        'return_in_transit',
        'returned',
        'cancelled'
    )),
    condition TEXT NOT NULL DEFAULT 'normal' CHECK (condition IN ('normal', 'abnormal')),
    condition_notes TEXT,
    current_trip_id UUID,
    driver_name TEXT,
    vehicle_plate TEXT,
    is_returning BOOLEAN DEFAULT FALSE NOT NULL,
    return_reason TEXT,
    return_notes TEXT,
    return_fee NUMERIC(12,2) DEFAULT 0 NOT NULL,
    return_initiated_at TIMESTAMPTZ,
    return_initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    returned_to_sender_at TIMESTAMPTZ,
    returned_to_sender_name TEXT,
    status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    payment_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    delivered_to TEXT,
    delivered_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.parcels DROP CONSTRAINT IF EXISTS parcels_status_check;
ALTER TABLE public.parcels ADD CONSTRAINT parcels_status_check CHECK (status IN ('registered', 'in_transit', 'arrived', 'delivered', 'return_in_transit', 'returned', 'cancelled', 'pending'));
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS is_returning BOOLEAN DEFAULT FALSE NOT NULL;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS return_reason TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS return_notes TEXT;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS return_fee NUMERIC(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS return_initiated_at TIMESTAMPTZ;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS return_initiated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS returned_to_sender_at TIMESTAMPTZ;
ALTER TABLE public.parcels ADD COLUMN IF NOT EXISTS returned_to_sender_name TEXT;

-- 1.13 جدول الاشتراكات ومتابعة المدراء (Subscriptions)
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID UNIQUE NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'active', 'expired', 'suspended')),
    start_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_trial BOOLEAN DEFAULT TRUE NOT NULL,
    plan_name TEXT DEFAULT 'الباقة الأساسية',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_name TEXT DEFAULT 'الباقة الأساسية';

-- 1.14 جدول العملات وأسعار الصرف (Currencies)
CREATE TABLE IF NOT EXISTS public.currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL,
    label_ar TEXT NOT NULL,
    label_fr TEXT,
    symbol TEXT DEFAULT '',
    rate_to_mad NUMERIC NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (workspace_id, code)
);

ALTER TABLE public.currencies ADD COLUMN IF NOT EXISTS label_fr TEXT;

-- 1.15 سجل التدقيق والرقابة الشامل (Audit Logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    reason TEXT,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1.16 جدول رحلات الشحن والديسباتش (Trips)
CREATE TABLE IF NOT EXISTS public.trips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    trip_number INT NOT NULL,
    trip_code VARCHAR(40) NOT NULL,
    driver_name TEXT NOT NULL,
    driver_phone TEXT,
    vehicle_plate TEXT NOT NULL,
    origin_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    destination_station_id UUID NOT NULL REFERENCES public.stations(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'loading' CHECK (status IN ('loading', 'departed', 'arrived', 'closed')),
    parcels_count INT NOT NULL DEFAULT 0,
    loaded_parcel_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    received_parcel_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    departure_time TIMESTAMPTZ,
    arrival_time TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    close_reason TEXT,
    notes TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (workspace_id, trip_code)
);

-- 1.17 جدول طرود الرحلات والربط المباشر (Trip Parcels)
CREATE TABLE IF NOT EXISTS public.trip_parcels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
    parcel_id UUID NOT NULL REFERENCES public.parcels(id) ON DELETE CASCADE,
    loaded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    received_at TIMESTAMPTZ,
    condition TEXT NOT NULL DEFAULT 'normal' CHECK (condition IN ('normal', 'abnormal')),
    condition_notes TEXT,
    scanned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    UNIQUE (trip_id, parcel_id)
);

-- 1.18 جدول السائقين المحفوظين للاختيار السريع (Remembered Drivers)
CREATE TABLE IF NOT EXISTS public.remembered_drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    last_used TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (workspace_id, name)
);

-- 1.19 جدول ماتريكيلات العربات المحفوظة (Remembered Vehicles)
CREATE TABLE IF NOT EXISTS public.remembered_vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    plate TEXT NOT NULL,
    last_used TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (workspace_id, plate)
);

-- ============================================================================
-- 2. الفهارس (INDEXES)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_workspaces_short_id ON public.workspaces(short_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_invite_code ON public.workspaces(invite_code);
CREATE INDEX IF NOT EXISTS idx_members_user_ws ON public.workspace_members(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_ws_status ON public.join_requests(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_collab_req ON public.workspace_collaborations(requester_workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_collab_target ON public.workspace_collaborations(target_workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_stations_ws ON public.stations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_station_workers_user ON public.station_workers(user_id, station_id);
CREATE INDEX IF NOT EXISTS idx_tx_ws_station ON public.transactions(workspace_id, station_id, status);
CREATE INDEX IF NOT EXISTS idx_parcels_ws_tracking ON public.parcels(workspace_id, tracking_code);
CREATE INDEX IF NOT EXISTS idx_parcels_status ON public.parcels(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_ws_status ON public.trips(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_trips_route ON public.trips(origin_station_id, destination_station_id);
CREATE INDEX IF NOT EXISTS idx_trip_parcels_trip ON public.trip_parcels(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_parcels_parcel ON public.trip_parcels(parcel_id);
CREATE INDEX IF NOT EXISTS idx_rem_drivers_ws ON public.remembered_drivers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_rem_vehicles_ws ON public.remembered_vehicles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_user ON public.password_reset_requests(user_id, status);

-- ============================================================================
-- 3. الدوال الأمنية المساعدة (SECURITY DEFINER FUNCTIONS)
-- ============================================================================

-- هل المستخدم هو مالك المنصة؟ (فحص وجود المعرف في جدول platform_owners)
CREATE OR REPLACE FUNCTION public.is_platform_owner(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE 
        WHEN p_user_id IS NULL THEN FALSE
        ELSE EXISTS (SELECT 1 FROM public.platform_owners WHERE user_id = p_user_id)
    END;
$$;

-- معرف مساحة العمل النشطة للمستخدم
CREATE OR REPLACE FUNCTION public.get_user_workspace_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT workspace_id 
    FROM public.workspace_members 
    WHERE user_id = p_user_id AND status = 'active'
    LIMIT 1;
$$;

-- هل المستخدم مدير لمساحة العمل المحددة؟
CREATE OR REPLACE FUNCTION public.is_workspace_admin(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE 
        WHEN p_user_id IS NULL THEN FALSE
        ELSE EXISTS (
            SELECT 1 
            FROM public.workspace_members 
            WHERE workspace_id = p_workspace_id 
              AND user_id = p_user_id 
              AND role = 'admin' 
              AND status = 'active'
        )
    END;
$$;

-- هل المستخدم عضو نشط في مساحة العمل؟
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE 
        WHEN p_user_id IS NULL THEN FALSE
        ELSE EXISTS (
            SELECT 1 
            FROM public.workspace_members 
            WHERE workspace_id = p_workspace_id 
              AND user_id = p_user_id 
              AND status = 'active'
        )
    END;
$$;

-- هل العامل مخصص لمحطة معينة؟
CREATE OR REPLACE FUNCTION public.is_worker_assigned_to_station(p_station_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE 
        WHEN p_user_id IS NULL THEN FALSE
        ELSE EXISTS (
            SELECT 1 
            FROM public.station_workers 
            WHERE station_id = p_station_id 
              AND user_id = p_user_id
        )
    END;
$$;

-- هل يحق للمستخدم رؤية حركة الأموال (اللاگيس) في مساحة العمل؟
-- (مدير مساحة العمل نفسها فقط — يُمنع منعاً باتاً كشف اللاگيس لأي مدير متعاون آخر)
CREATE OR REPLACE FUNCTION public.can_view_workspace_cash(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
BEGIN
    IF p_user_id IS NULL THEN 
        RETURN FALSE; 
    END IF;

    RETURN public.is_workspace_admin(p_workspace_id, p_user_id);
END;
$$;

-- هل يحق للمستخدم رؤية طرود مساحة العمل؟
CREATE OR REPLACE FUNCTION public.can_view_workspace_parcels(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_user_ws UUID;
    v_is_admin BOOLEAN;
BEGIN
    IF p_user_id IS NULL THEN 
        RETURN FALSE; 
    END IF;

    -- إذا كان مديراً في مساحة العمل
    IF public.is_workspace_admin(p_workspace_id, p_user_id) THEN
        RETURN TRUE;
    END IF;

    -- التحقق إن كان مديراً في مساحة عمل شريكة فُعلت له مشاركة الطرود
    v_user_ws := public.get_user_workspace_id(p_user_id);
    IF v_user_ws IS NULL THEN
        RETURN FALSE;
    END IF;

    v_is_admin := public.is_workspace_admin(v_user_ws, p_user_id);
    IF NOT v_is_admin THEN
        RETURN FALSE;
    END IF;

    RETURN EXISTS (
        SELECT 1 
        FROM public.workspace_collaborations
        WHERE status = 'accepted'
          AND (
            (requester_workspace_id = p_workspace_id AND target_workspace_id = v_user_ws AND requester_share_parcels = TRUE)
            OR
            (target_workspace_id = p_workspace_id AND requester_workspace_id = v_user_ws AND target_share_parcels = TRUE)
          )
    );
END;
$$;

-- هل يحق للمستخدم رؤية الملف الشخصي ورقم واتساب المستخدم المستهدف؟
-- (فقط لنفسه أو لأعضاء نفس مساحة العمل حصراً — لا يمكن لأي مدير آخر رؤية معلومات عمال أو مدراء مساحة أخرى)
CREATE OR REPLACE FUNCTION public.can_view_user_whatsapp(p_target_user_id UUID, p_viewer_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
    v_target_ws UUID;
    v_viewer_ws UUID;
BEGIN
    IF p_viewer_user_id IS NULL THEN 
        RETURN FALSE; 
    END IF;

    IF p_target_user_id = p_viewer_user_id THEN
        RETURN TRUE;
    END IF;

    v_target_ws := public.get_user_workspace_id(p_target_user_id);
    v_viewer_ws := public.get_user_workspace_id(p_viewer_user_id);

    IF v_target_ws IS NULL OR v_viewer_ws IS NULL THEN
        RETURN FALSE;
    END IF;

    -- أعضاء نفس مساحة العمل فقط
    RETURN (v_target_ws = v_viewer_ws);
END;
$$;

-- هل اشتراك مساحة العمل نشط وصالح حالياً؟ (للحماية على مستوى الخادم ومنع الكتابة عند الانتهاء أو التعليق)
CREATE OR REPLACE FUNCTION public.is_workspace_subscription_active(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT CASE
        WHEN p_workspace_id IS NULL THEN FALSE
        ELSE EXISTS (
            SELECT 1
            FROM public.subscriptions s
            WHERE s.workspace_id = p_workspace_id
              AND s.status IN ('trial', 'active')
              AND s.end_date > timezone('utc'::text, now())
        )
    END;
$$;

-- ============================================================================
-- 4. سياسات الأمان على مستوى الصفوف (ROW LEVEL SECURITY - RLS)
-- ============================================================================

-- تفعيل RLS على كل الجداول دون استثناء
ALTER TABLE public.platform_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.station_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remembered_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remembered_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- إزالة السياسات السابقة إن وجدت لضمان إمكانية إعادة تشغيل السكريبت بأمان (Idempotent)
DROP POLICY IF EXISTS "platform_owners_select_self" ON public.platform_owners;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "workspaces_select_policy" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_insert_policy" ON public.workspaces;
DROP POLICY IF EXISTS "workspaces_update_admin" ON public.workspaces;
DROP POLICY IF EXISTS "members_select_policy" ON public.workspace_members;
DROP POLICY IF EXISTS "members_manage_admin" ON public.workspace_members;
DROP POLICY IF EXISTS "join_requests_select_policy" ON public.join_requests;
DROP POLICY IF EXISTS "join_requests_insert_self" ON public.join_requests;
DROP POLICY IF EXISTS "join_requests_update_admin" ON public.join_requests;
DROP POLICY IF EXISTS "pw_reset_select_policy" ON public.password_reset_requests;
DROP POLICY IF EXISTS "pw_reset_insert_self" ON public.password_reset_requests;
DROP POLICY IF EXISTS "pw_reset_update_resolvers" ON public.password_reset_requests;
DROP POLICY IF EXISTS "collab_select_policy" ON public.workspace_collaborations;
DROP POLICY IF EXISTS "collab_insert_policy" ON public.workspace_collaborations;
DROP POLICY IF EXISTS "collab_update_policy" ON public.workspace_collaborations;
DROP POLICY IF EXISTS "stations_select_policy" ON public.stations;
DROP POLICY IF EXISTS "stations_modify_admin" ON public.stations;
DROP POLICY IF EXISTS "station_workers_select" ON public.station_workers;
DROP POLICY IF EXISTS "station_workers_modify_admin" ON public.station_workers;
DROP POLICY IF EXISTS "station_balances_select" ON public.station_balances;
DROP POLICY IF EXISTS "station_balances_modify_admin" ON public.station_balances;
DROP POLICY IF EXISTS "transactions_select_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_admin" ON public.transactions;
DROP POLICY IF EXISTS "parcels_select_policy" ON public.parcels;
DROP POLICY IF EXISTS "parcels_insert_policy" ON public.parcels;
DROP POLICY IF EXISTS "parcels_update_policy" ON public.parcels;
DROP POLICY IF EXISTS "subscriptions_select_policy" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_platform_owner" ON public.subscriptions;
DROP POLICY IF EXISTS "currencies_select_policy" ON public.currencies;
DROP POLICY IF EXISTS "currencies_modify_admin" ON public.currencies;
DROP POLICY IF EXISTS "audit_logs_select_admin" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_members" ON public.audit_logs;
DROP POLICY IF EXISTS "trips_select_policy" ON public.trips;
DROP POLICY IF EXISTS "trips_insert_policy" ON public.trips;
DROP POLICY IF EXISTS "trips_update_policy" ON public.trips;
DROP POLICY IF EXISTS "trips_delete_policy" ON public.trips;
DROP POLICY IF EXISTS "trip_parcels_select_policy" ON public.trip_parcels;
DROP POLICY IF EXISTS "trip_parcels_insert_policy" ON public.trip_parcels;
DROP POLICY IF EXISTS "trip_parcels_update_policy" ON public.trip_parcels;
DROP POLICY IF EXISTS "trip_parcels_delete_policy" ON public.trip_parcels;
DROP POLICY IF EXISTS "remembered_drivers_select_policy" ON public.remembered_drivers;
DROP POLICY IF EXISTS "remembered_drivers_insert_policy" ON public.remembered_drivers;
DROP POLICY IF EXISTS "remembered_drivers_update_policy" ON public.remembered_drivers;
DROP POLICY IF EXISTS "remembered_vehicles_select_policy" ON public.remembered_vehicles;
DROP POLICY IF EXISTS "remembered_vehicles_insert_policy" ON public.remembered_vehicles;
DROP POLICY IF EXISTS "remembered_vehicles_update_policy" ON public.remembered_vehicles;

-- 4.1 سياسات جدول مالكي المنصة (platform_owners)
-- قراءة فقط للمستخدم نفسه إذا كان مالكاً
CREATE POLICY "platform_owners_select_self"
ON public.platform_owners
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 4.2 سياسات جدول الملفات الشخصية (profiles)
CREATE POLICY "profiles_select_policy"
ON public.profiles
FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR public.can_view_user_whatsapp(id, auth.uid())
    OR public.is_platform_owner(auth.uid())
);

CREATE POLICY "profiles_insert_self"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_self"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4.3 سياسات مساحات العمل (workspaces)
CREATE POLICY "workspaces_select_policy"
ON public.workspaces
FOR SELECT
TO authenticated
USING (
    public.is_workspace_member(id, auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.workspace_collaborations
        WHERE status = 'accepted'
          AND (
            (requester_workspace_id = id AND target_workspace_id = public.get_user_workspace_id(auth.uid()))
            OR
            (target_workspace_id = id AND requester_workspace_id = public.get_user_workspace_id(auth.uid()))
          )
    )
    OR public.is_platform_owner(auth.uid())
);

CREATE POLICY "workspaces_insert_policy"
ON public.workspaces
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());

CREATE POLICY "workspaces_update_admin"
ON public.workspaces
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_admin(id, auth.uid())
    OR public.is_platform_owner(auth.uid())
)
WITH CHECK (
    public.is_workspace_admin(id, auth.uid())
    OR public.is_platform_owner(auth.uid())
);

-- 4.4 سياسات أعضاء مساحة العمل (workspace_members)
CREATE POLICY "members_select_policy"
ON public.workspace_members
FOR SELECT
TO authenticated
USING (
    public.is_workspace_member(workspace_id, auth.uid())
    OR public.is_platform_owner(auth.uid())
);

CREATE POLICY "members_manage_admin"
ON public.workspace_members
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.5 سياسات طلبات الانضمام (join_requests)
CREATE POLICY "join_requests_select_policy"
ON public.join_requests
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
    OR public.is_workspace_admin(workspace_id, auth.uid())
);

CREATE POLICY "join_requests_insert_self"
ON public.join_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "join_requests_update_admin"
ON public.join_requests
FOR UPDATE
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.6 سياسات طلبات استعادة كلمة المرور (password_reset_requests)
CREATE POLICY "pw_reset_select_policy"
ON public.password_reset_requests
FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
    OR (target_role = 'worker' AND workspace_id IS NOT NULL AND public.is_workspace_admin(workspace_id, auth.uid()))
    OR (target_role = 'admin' AND public.is_platform_owner(auth.uid()))
);

CREATE POLICY "pw_reset_insert_self"
ON public.password_reset_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pw_reset_update_resolvers"
ON public.password_reset_requests
FOR UPDATE
TO authenticated
USING (
    (target_role = 'worker' AND workspace_id IS NOT NULL AND public.is_workspace_admin(workspace_id, auth.uid()))
    OR (target_role = 'admin' AND public.is_platform_owner(auth.uid()))
)
WITH CHECK (
    (target_role = 'worker' AND workspace_id IS NOT NULL AND public.is_workspace_admin(workspace_id, auth.uid()))
    OR (target_role = 'admin' AND public.is_platform_owner(auth.uid()))
);

-- 4.7 سياسات التعاون بين المدراء (workspace_collaborations)
CREATE POLICY "collab_select_policy"
ON public.workspace_collaborations
FOR SELECT
TO authenticated
USING (
    public.is_workspace_admin(requester_workspace_id, auth.uid())
    OR public.is_workspace_admin(target_workspace_id, auth.uid())
);

CREATE POLICY "collab_insert_policy"
ON public.workspace_collaborations
FOR INSERT
TO authenticated
WITH CHECK (
    public.is_workspace_admin(requester_workspace_id, auth.uid())
    AND requester_workspace_id <> target_workspace_id
);

CREATE POLICY "collab_update_policy"
ON public.workspace_collaborations
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_admin(requester_workspace_id, auth.uid())
    OR public.is_workspace_admin(target_workspace_id, auth.uid())
)
WITH CHECK (
    public.is_workspace_admin(requester_workspace_id, auth.uid())
    OR public.is_workspace_admin(target_workspace_id, auth.uid())
);

-- 4.8 سياسات المحطات (stations)
CREATE POLICY "stations_select_policy"
ON public.stations
FOR SELECT
TO authenticated
USING (
    public.is_workspace_member(workspace_id, auth.uid())
    OR public.can_view_workspace_cash(workspace_id, auth.uid())
    OR public.can_view_workspace_parcels(workspace_id, auth.uid())
);

CREATE POLICY "stations_modify_admin"
ON public.stations
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.9 سياسات عمال المحطات (station_workers)
CREATE POLICY "station_workers_select"
ON public.station_workers
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "station_workers_modify_admin"
ON public.station_workers
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.10 سياسات أرصدة المحطات (station_balances)
CREATE POLICY "station_balances_select"
ON public.station_balances
FOR SELECT
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (
        public.is_workspace_member(workspace_id, auth.uid())
        AND public.is_worker_assigned_to_station(station_id, auth.uid())
    )
    OR public.can_view_workspace_cash(workspace_id, auth.uid())
);

CREATE POLICY "station_balances_modify_admin"
ON public.station_balances
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.11 سياسات المعاملات النقدية (transactions) - عزل المحطة للعمال
CREATE POLICY "transactions_select_policy"
ON public.transactions
FOR SELECT
TO authenticated
USING (
    -- 1. مدير مساحة العمل يرى جميع محطات مساحته
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- 2. العامل يرى حصراً معاملات المحطة المعين بها
    (
        public.is_workspace_member(workspace_id, auth.uid())
        AND public.is_worker_assigned_to_station(station_id, auth.uid())
    )
    OR
    -- 3. مدير شريك مسموح له برؤية حركة الأموال
    public.can_view_workspace_cash(workspace_id, auth.uid())
);

CREATE POLICY "transactions_insert_policy"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND (
        public.is_workspace_admin(workspace_id, auth.uid())
        OR (
            public.is_workspace_member(workspace_id, auth.uid())
            AND public.is_worker_assigned_to_station(station_id, auth.uid())
        )
    )
);

CREATE POLICY "transactions_update_admin"
ON public.transactions
FOR UPDATE
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.12 سياسات الكوليات (parcels) - عزل المحطات للعمال
CREATE POLICY "parcels_select_policy"
ON public.parcels
FOR SELECT
TO authenticated
USING (
    -- 1. مدير مساحة العمل يرى جميع كوليات مساحته
    public.is_workspace_admin(workspace_id, auth.uid())
    OR
    -- 2. العامل يرى الكوليات المنطلقة من محطته أو الواصلة إليها
    (
        public.is_workspace_member(workspace_id, auth.uid())
        AND (
            public.is_worker_assigned_to_station(origin_station_id, auth.uid())
            OR public.is_worker_assigned_to_station(destination_station_id, auth.uid())
        )
    )
    OR
    -- 3. مدير شريك فُعِّلت له مشاركة الكوليات
    public.can_view_workspace_parcels(workspace_id, auth.uid())
);

CREATE POLICY "parcels_insert_policy"
ON public.parcels
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND (
        public.is_workspace_admin(workspace_id, auth.uid())
        OR (
            public.is_workspace_member(workspace_id, auth.uid())
            AND public.is_worker_assigned_to_station(origin_station_id, auth.uid())
        )
    )
);

CREATE POLICY "parcels_update_policy"
ON public.parcels
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (
        public.is_workspace_member(workspace_id, auth.uid())
        AND (
            public.is_worker_assigned_to_station(origin_station_id, auth.uid())
            OR public.is_worker_assigned_to_station(destination_station_id, auth.uid())
        )
    )
)
WITH CHECK (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (
        public.is_workspace_member(workspace_id, auth.uid())
        AND (
            public.is_worker_assigned_to_station(origin_station_id, auth.uid())
            OR public.is_worker_assigned_to_station(destination_station_id, auth.uid())
        )
    )
);

-- 4.13 سياسات الاشتراكات (subscriptions)
CREATE POLICY "subscriptions_select_policy"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR public.is_platform_owner(auth.uid())
);

CREATE POLICY "subscriptions_update_platform_owner"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (public.is_platform_owner(auth.uid()))
WITH CHECK (public.is_platform_owner(auth.uid()));

-- 4.14 سياسات العملات (currencies)
CREATE POLICY "currencies_select_policy"
ON public.currencies
FOR SELECT
TO authenticated
USING (public.is_workspace_member(workspace_id, auth.uid()));

CREATE POLICY "currencies_modify_admin"
ON public.currencies
FOR ALL
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()))
WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- 4.15 سياسات سجل التدقيق (audit_logs)
CREATE POLICY "audit_logs_select_admin"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (public.is_workspace_admin(workspace_id, auth.uid()));

CREATE POLICY "audit_logs_insert_members"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- 4.16 سياسات جدول رحلات الشحن (trips)
CREATE POLICY "trips_select_policy"
ON public.trips
FOR SELECT
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (
        public.is_workspace_member(workspace_id, auth.uid())
        AND (
            public.is_worker_assigned_to_station(origin_station_id, auth.uid())
            OR public.is_worker_assigned_to_station(destination_station_id, auth.uid())
        )
    )
);

CREATE POLICY "trips_insert_policy"
ON public.trips
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND created_by = auth.uid()
    AND (
        public.is_workspace_admin(workspace_id, auth.uid())
        OR (
            public.is_workspace_member(workspace_id, auth.uid())
            AND public.is_worker_assigned_to_station(origin_station_id, auth.uid())
        )
    )
);

CREATE POLICY "trips_update_policy"
ON public.trips
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (
        public.is_workspace_member(workspace_id, auth.uid())
        AND (
            public.is_worker_assigned_to_station(origin_station_id, auth.uid())
            OR public.is_worker_assigned_to_station(destination_station_id, auth.uid())
        )
    )
)
WITH CHECK (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR (
        public.is_workspace_member(workspace_id, auth.uid())
        AND (
            public.is_worker_assigned_to_station(origin_station_id, auth.uid())
            OR public.is_worker_assigned_to_station(destination_station_id, auth.uid())
        )
    )
);

CREATE POLICY "trips_delete_policy"
ON public.trips
FOR DELETE
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
);

-- 4.17 سياسات جدول طرود الرحلات (trip_parcels)
CREATE POLICY "trip_parcels_select_policy"
ON public.trip_parcels
FOR SELECT
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = trip_parcels.trip_id
          AND (
              public.is_worker_assigned_to_station(t.origin_station_id, auth.uid())
              OR public.is_worker_assigned_to_station(t.destination_station_id, auth.uid())
          )
    )
);

CREATE POLICY "trip_parcels_insert_policy"
ON public.trip_parcels
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
        public.is_workspace_admin(workspace_id, auth.uid())
        OR EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = trip_parcels.trip_id
              AND public.is_worker_assigned_to_station(t.origin_station_id, auth.uid())
        )
    )
);

CREATE POLICY "trip_parcels_update_policy"
ON public.trip_parcels
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = trip_parcels.trip_id
          AND (
              public.is_worker_assigned_to_station(t.origin_station_id, auth.uid())
              OR public.is_worker_assigned_to_station(t.destination_station_id, auth.uid())
          )
    )
)
WITH CHECK (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = trip_parcels.trip_id
          AND (
              public.is_worker_assigned_to_station(t.origin_station_id, auth.uid())
              OR public.is_worker_assigned_to_station(t.destination_station_id, auth.uid())
          )
    )
);

CREATE POLICY "trip_parcels_delete_policy"
ON public.trip_parcels
FOR DELETE
TO authenticated
USING (
    public.is_workspace_admin(workspace_id, auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.trips t
        WHERE t.id = trip_parcels.trip_id
          AND public.is_worker_assigned_to_station(t.origin_station_id, auth.uid())
    )
);

-- 4.18 سياسات السائقين المحفوظين (remembered_drivers)
CREATE POLICY "remembered_drivers_select_policy"
ON public.remembered_drivers
FOR SELECT
TO authenticated
USING (
    public.is_workspace_member(workspace_id, auth.uid())
);

CREATE POLICY "remembered_drivers_insert_policy"
ON public.remembered_drivers
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
);

CREATE POLICY "remembered_drivers_update_policy"
ON public.remembered_drivers
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_member(workspace_id, auth.uid())
)
WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
);

-- 4.19 سياسات ماتريكيلات العربات المحفوظة (remembered_vehicles)
CREATE POLICY "remembered_vehicles_select_policy"
ON public.remembered_vehicles
FOR SELECT
TO authenticated
USING (
    public.is_workspace_member(workspace_id, auth.uid())
);

CREATE POLICY "remembered_vehicles_insert_policy"
ON public.remembered_vehicles
FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
);

CREATE POLICY "remembered_vehicles_update_policy"
ON public.remembered_vehicles
FOR UPDATE
TO authenticated
USING (
    public.is_workspace_member(workspace_id, auth.uid())
)
WITH CHECK (
    public.is_workspace_member(workspace_id, auth.uid())
);

-- ============================================================================
-- 5. التريجرز لتحديث الأرصدة تلقائياً وتوليد البيانات (TRIGGERS)
-- ============================================================================

-- دالة وتريجر لتحديث رصيد المحطة عند كل معاملة مؤكدة أو معدلة أو ملغاة
CREATE OR REPLACE FUNCTION public.fn_update_station_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old_signed NUMERIC(14,2) := 0;
    v_new_signed NUMERIC(14,2) := 0;
    v_diff NUMERIC(14,2) := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'confirmed' THEN
            IF NEW.type IN ('cash_in', 'parcel_shipping_fee', 'parcel_cod_collection') THEN
                v_diff := NEW.amount;
            ELSIF NEW.type IN ('cash_out', 'goods_payment', 'parcel_cod_payout') THEN
                v_diff := -NEW.amount;
            END IF;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status = 'confirmed' THEN
            IF OLD.type IN ('cash_in', 'parcel_shipping_fee', 'parcel_cod_collection') THEN
                v_old_signed := OLD.amount;
            ELSIF OLD.type IN ('cash_out', 'goods_payment', 'parcel_cod_payout') THEN
                v_old_signed := -OLD.amount;
            END IF;
        END IF;

        IF NEW.status = 'confirmed' THEN
            IF NEW.type IN ('cash_in', 'parcel_shipping_fee', 'parcel_cod_collection') THEN
                v_new_signed := NEW.amount;
            ELSIF NEW.type IN ('cash_out', 'goods_payment', 'parcel_cod_payout') THEN
                v_new_signed := -NEW.amount;
            END IF;
        END IF;

        v_diff := v_new_signed - v_old_signed;
    END IF;

    IF v_diff <> 0 THEN
        INSERT INTO public.station_balances (station_id, workspace_id, currency, balance, updated_at)
        VALUES (NEW.station_id, NEW.workspace_id, NEW.currency, v_diff, timezone('utc'::text, now()))
        ON CONFLICT (station_id, currency)
        DO UPDATE SET 
            balance = public.station_balances.balance + v_diff,
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_station_balance ON public.transactions;
CREATE TRIGGER trg_update_station_balance
AFTER INSERT OR UPDATE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.fn_update_station_balance();

-- 5.2 تريجر قفل الاشتراك على مستوى الخادم (Server-Side Paywall Enforcement)
-- يمنع أي INSERT أو UPDATE أو DELETE على الجداول التشغيلية عندما يكون الاشتراك منتهياً أو معلقاً
CREATE OR REPLACE FUNCTION public.fn_enforce_active_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ws_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_ws_id := OLD.workspace_id;
    ELSE
        v_ws_id := NEW.workspace_id;
    END IF;

    -- السماح أثناء الإنشاء الأولي داخل rpc_create_workspace إذا لم يكتمل إدراج الاشتراك بعد
    IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE workspace_id = v_ws_id) THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF NOT public.is_workspace_subscription_active(v_ws_id) THEN
        RAISE EXCEPTION 'انتهت صلاحية اشتراك مساحة العمل أو تم تعليقه. النظام في وضع القراءة فقط — يرجى تجديد الاشتراك للمتابعة.';
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_paywall_parcels ON public.parcels;
CREATE TRIGGER trg_paywall_parcels
BEFORE INSERT OR UPDATE OR DELETE ON public.parcels
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

DROP TRIGGER IF EXISTS trg_paywall_trips ON public.trips;
CREATE TRIGGER trg_paywall_trips
BEFORE INSERT OR UPDATE OR DELETE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

DROP TRIGGER IF EXISTS trg_paywall_trip_parcels ON public.trip_parcels;
CREATE TRIGGER trg_paywall_trip_parcels
BEFORE INSERT OR UPDATE OR DELETE ON public.trip_parcels
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

DROP TRIGGER IF EXISTS trg_paywall_transactions ON public.transactions;
CREATE TRIGGER trg_paywall_transactions
BEFORE INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

DROP TRIGGER IF EXISTS trg_paywall_stations ON public.stations;
CREATE TRIGGER trg_paywall_stations
BEFORE INSERT OR UPDATE OR DELETE ON public.stations
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

DROP TRIGGER IF EXISTS trg_paywall_station_workers ON public.station_workers;
CREATE TRIGGER trg_paywall_station_workers
BEFORE INSERT OR UPDATE OR DELETE ON public.station_workers
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

DROP TRIGGER IF EXISTS trg_paywall_currencies ON public.currencies;
CREATE TRIGGER trg_paywall_currencies
BEFORE INSERT OR UPDATE OR DELETE ON public.currencies
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_active_subscription();

-- 5.3 تريجرز فرض حدود الباقات (Quotas: max_stations, max_workers, max_collaborations)
CREATE OR REPLACE FUNCTION public.fn_enforce_station_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max INT;
    v_cnt INT;
BEGIN
    SELECT COALESCE(max_stations, 3) INTO v_max FROM public.workspaces WHERE id = NEW.workspace_id;
    SELECT COUNT(*) INTO v_cnt FROM public.stations WHERE workspace_id = NEW.workspace_id AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);
    IF v_cnt >= v_max THEN
        RAISE EXCEPTION 'تم بلوغ الحد الأقصى المسموح به لعدد المحطات (%) في باقة اشتراكك الحالية. يرجى التواصل مع إدارة المنصة لترقية الباقة.', v_max;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_station_quota ON public.stations;
CREATE TRIGGER trg_enforce_station_quota
BEFORE INSERT ON public.stations
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_station_quota();

CREATE OR REPLACE FUNCTION public.fn_enforce_worker_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_max INT;
    v_cnt INT;
BEGIN
    IF NEW.role = 'worker' AND NEW.status = 'active' THEN
        SELECT COALESCE(max_workers, 5) INTO v_max FROM public.workspaces WHERE id = NEW.workspace_id;
        SELECT COUNT(*) INTO v_cnt
        FROM public.workspace_members
        WHERE workspace_id = NEW.workspace_id
          AND role = 'worker'
          AND status = 'active'
          AND user_id <> NEW.user_id;
        IF v_cnt >= v_max THEN
            RAISE EXCEPTION 'تم بلوغ الحد الأقصى المسموح به لعدد العمال (%) في باقة اشتراكك الحالية. يرجى التواصل مع إدارة المنصة لترقية الباقة.', v_max;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_worker_quota ON public.workspace_members;
CREATE TRIGGER trg_enforce_worker_quota
BEFORE INSERT OR UPDATE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_worker_quota();

CREATE OR REPLACE FUNCTION public.fn_enforce_collaboration_quota()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req_max INT;
    v_req_cnt INT;
    v_tgt_max INT;
    v_tgt_cnt INT;
BEGIN
    IF NEW.status IN ('pending', 'accepted') THEN
        SELECT COALESCE(max_collaborations, 3) INTO v_req_max FROM public.workspaces WHERE id = NEW.requester_workspace_id;
        SELECT COUNT(*) INTO v_req_cnt
        FROM public.workspace_collaborations
        WHERE status = 'accepted'
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
          AND (requester_workspace_id = NEW.requester_workspace_id OR target_workspace_id = NEW.requester_workspace_id);
        IF v_req_cnt >= v_req_max THEN
            RAISE EXCEPTION 'تم بلوغ الحد الأقصى المسموح به لعدد الشراكات بين المدراء (%) في باقة اشتراكك الحالية.', v_req_max;
        END IF;

        IF NEW.status = 'accepted' THEN
            SELECT COALESCE(max_collaborations, 3) INTO v_tgt_max FROM public.workspaces WHERE id = NEW.target_workspace_id;
            SELECT COUNT(*) INTO v_tgt_cnt
            FROM public.workspace_collaborations
            WHERE status = 'accepted'
              AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
              AND (requester_workspace_id = NEW.target_workspace_id OR target_workspace_id = NEW.target_workspace_id);
            IF v_tgt_cnt >= v_tgt_max THEN
                RAISE EXCEPTION 'مساحة العمل الشريكة بلغت الحد الأقصى المسموح به لعدد الشراكات (%) في باقتها الحالية.', v_tgt_max;
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_collaboration_quota ON public.workspace_collaborations;
CREATE TRIGGER trg_enforce_collaboration_quota
BEFORE INSERT OR UPDATE ON public.workspace_collaborations
FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_collaboration_quota();

-- ============================================================================
-- 6. دوال العمليات عن بُعد (RPC FUNCTIONS - SECURITY DEFINER)
-- ============================================================================

-- دالة مساعدة لتوليد أكواد قصيرة عشوائية آمنة (Short ID / Invite Code)
CREATE OR REPLACE FUNCTION public.fn_generate_alnum_code(p_len INT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_chars CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    v_result TEXT := '';
    v_i INT;
BEGIN
    FOR v_i IN 1..p_len LOOP
        v_result := v_result || substr(v_chars, floor(random() * length(v_chars) + 1)::INT, 1);
    END LOOP;
    RETURN v_result;
END;
$$;

-- 6.1 إنشاء مساحة عمل جديدة مع عضوية المدير، اشتراك تجريبي 15 يوم، المحطات والعملات الافتراضية
CREATE OR REPLACE FUNCTION public.rpc_create_workspace(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_meta JSONB;
    v_user_name TEXT;
    v_user_phone TEXT;
    v_user_whatsapp TEXT;
    v_short_id VARCHAR(6);
    v_invite_code VARCHAR(12);
    v_ws public.workspaces%ROWTYPE;
    v_sub public.subscriptions%ROWTYPE;
    v_st_dakhla UUID;
    v_st_nouadhibou UUID;
    v_clean_name TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى تسجيل الدخول أولاً');
    END IF;

    -- ضمان وجود الملف الشخصي في جدول profiles
    SELECT raw_user_meta_data INTO v_user_meta
    FROM auth.users
    WHERE id = v_user_id;

    v_user_name := COALESCE(NULLIF(TRIM(v_user_meta->>'name'), ''), 'مدير المحطة');
    v_user_phone := COALESCE(NULLIF(TRIM(v_user_meta->>'phone'), ''), v_user_id::TEXT);
    v_user_whatsapp := COALESCE(NULLIF(TRIM(v_user_meta->>'whatsapp_number'), ''), v_user_phone);

    INSERT INTO public.profiles (id, name, phone, whatsapp_number)
    VALUES (v_user_id, v_user_name, v_user_phone, v_user_whatsapp)
    ON CONFLICT (id) DO UPDATE SET
        name = COALESCE(NULLIF(public.profiles.name, ''), EXCLUDED.name),
        updated_at = timezone('utc'::text, now());

    SELECT phone, whatsapp_number, name
    INTO v_user_phone, v_user_whatsapp, v_user_name
    FROM public.profiles
    WHERE id = v_user_id;

    -- توليد short_id فريد من 6 أحرف
    LOOP
        v_short_id := public.fn_generate_alnum_code(6);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workspaces WHERE short_id = v_short_id);
    END LOOP;

    -- توليد invite_code فريد من 8 أحرف
    LOOP
        v_invite_code := public.fn_generate_alnum_code(8);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workspaces WHERE invite_code = v_invite_code);
    END LOOP;

    v_clean_name := COALESCE(NULLIF(TRIM(p_name), ''), 'محطة الاتحادية - ' || v_user_name);

    -- 1. إنشاء مساحة العمل
    INSERT INTO public.workspaces (
        short_id,
        name,
        invite_code,
        owner_phone,
        owner_whatsapp,
        last_parcel_number,
        created_by
    )
    VALUES (
        v_short_id,
        v_clean_name,
        v_invite_code,
        v_user_phone,
        v_user_whatsapp,
        100,
        v_user_id
    )
    RETURNING * INTO v_ws;

    -- 2. إضافة المالك كعضو مدير نشط (admin)
    INSERT INTO public.workspace_members (workspace_id, user_id, role, status)
    VALUES (v_ws.id, v_user_id, 'admin', 'active')
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
        role = 'admin',
        status = 'active';

    -- 3. إنشاء اشتراك تجريبي مجاني لمدة 30 يوماً (شهر كامل)
    INSERT INTO public.subscriptions (
        workspace_id,
        status,
        start_date,
        end_date,
        is_trial,
        notes
    )
    VALUES (
        v_ws.id,
        'trial',
        timezone('utc'::text, now()),
        timezone('utc'::text, now()) + interval '30 days',
        TRUE,
        'فترة تجريبية مجانية لمدة 30 يوماً'
    )
    ON CONFLICT (workspace_id) DO UPDATE SET
        notes = EXCLUDED.notes
    RETURNING * INTO v_sub;

    -- 4. إنشاء المحطتين الافتراضيتين (الداخلة ونواذيبو)
    INSERT INTO public.stations (workspace_id, name, city, country, is_active, phone, address)
    VALUES (
        v_ws.id,
        'محطة الداخلة الرئيسية',
        'الداخلة',
        'MA',
        TRUE,
        '+212 528 890000',
        'شارع الولاء، ميناء الداخلة، المملكة المغربية'
    )
    RETURNING id INTO v_st_dakhla;

    INSERT INTO public.stations (workspace_id, name, city, country, is_active, phone, address)
    VALUES (
        v_ws.id,
        'محطة نواذيبو الدولية',
        'نواذيبو',
        'MR',
        TRUE,
        '+222 4574 0000',
        'حي كانصادو، طريق الميناء المستقل، الجمهورية الإسلامية الموريتانية'
    )
    RETURNING id INTO v_st_nouadhibou;

    -- تهيئة أرصدة المحطتين بـ 0 لكل عملة
    INSERT INTO public.station_balances (station_id, workspace_id, currency, balance)
    VALUES
        (v_st_dakhla, v_ws.id, 'MAD', 0.00),
        (v_st_dakhla, v_ws.id, 'MRU', 0.00),
        (v_st_nouadhibou, v_ws.id, 'MAD', 0.00),
        (v_st_nouadhibou, v_ws.id, 'MRU', 0.00)
    ON CONFLICT (station_id, currency) DO NOTHING;

    -- 5. إنشاء العملتين الافتراضيتين (MAD و MRU)
    INSERT INTO public.currencies (workspace_id, code, label_ar, symbol, rate_to_mad, is_active)
    VALUES
        (v_ws.id, 'MAD', 'درهم مغربي', 'د.م.', 1.0, TRUE),
        (v_ws.id, 'MRU', 'أوقية موريتانية', 'أ.م.', 0.263, TRUE)
    ON CONFLICT (workspace_id, code) DO NOTHING;

    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', v_ws.id,
        'short_id', v_ws.short_id,
        'invite_code', v_ws.invite_code,
        'workspace', to_jsonb(v_ws),
        'subscription', to_jsonb(v_sub),
        'stations', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at) FROM public.stations s WHERE s.workspace_id = v_ws.id), '[]'::jsonb),
        'currencies', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at) FROM public.currencies c WHERE c.workspace_id = v_ws.id), '[]'::jsonb)
    );
END;
$$;

-- 6.2 إرسال طلب انضمام عامل باستخدام رمز الدعوة
CREATE OR REPLACE FUNCTION public.rpc_submit_join_request(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_ws public.workspaces%ROWTYPE;
    v_prof public.profiles%ROWTYPE;
    v_user_meta JSONB;
    v_req public.join_requests%ROWTYPE;
    v_clean_code TEXT := UPPER(TRIM(COALESCE(p_invite_code, '')));
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى تسجيل الدخول أولاً');
    END IF;

    IF v_clean_code = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال رمز الدعوة');
    END IF;

    SELECT * INTO v_ws
    FROM public.workspaces
    WHERE UPPER(invite_code) = v_clean_code
    LIMIT 1;

    IF v_ws.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'رمز الدعوة غير صحيح أو منتهي الصلاحية');
    END IF;

    -- التأكد من وجود ملف شخصي للمستخدم
    SELECT * INTO v_prof FROM public.profiles WHERE id = v_user_id;
    IF v_prof.id IS NULL THEN
        SELECT raw_user_meta_data INTO v_user_meta FROM auth.users WHERE id = v_user_id;
        INSERT INTO public.profiles (id, name, phone, whatsapp_number)
        VALUES (
            v_user_id,
            COALESCE(NULLIF(TRIM(v_user_meta->>'name'), ''), 'موظف محطة'),
            COALESCE(NULLIF(TRIM(v_user_meta->>'phone'), ''), v_user_id::TEXT),
            COALESCE(NULLIF(TRIM(v_user_meta->>'whatsapp_number'), ''), COALESCE(NULLIF(TRIM(v_user_meta->>'phone'), ''), v_user_id::TEXT))
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING * INTO v_prof;
    END IF;

    INSERT INTO public.join_requests (
        workspace_id,
        user_id,
        invite_code_used,
        user_name,
        user_phone,
        user_whatsapp,
        status,
        created_at
    )
    VALUES (
        v_ws.id,
        v_user_id,
        v_clean_code,
        COALESCE(v_prof.name, 'موظف محطة'),
        COALESCE(v_prof.phone, ''),
        COALESCE(v_prof.whatsapp_number, COALESCE(v_prof.phone, '')),
        'pending',
        timezone('utc'::text, now())
    )
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
        invite_code_used = EXCLUDED.invite_code_used,
        status = 'pending',
        created_at = timezone('utc'::text, now()),
        resolved_at = NULL,
        resolved_by = NULL
    RETURNING * INTO v_req;

    RETURN jsonb_build_object(
        'success', true,
        'request_id', v_req.id,
        'workspace_id', v_ws.id,
        'request', to_jsonb(v_req)
    );
END;
$$;

-- 6.3 الموافقة على طلب انضمام عامل (لمدير مساحة العمل فقط)
CREATE OR REPLACE FUNCTION public.rpc_approve_join_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_req public.join_requests%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT * INTO v_req
    FROM public.join_requests
    WHERE id = p_request_id;

    IF v_req.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'طلب الانضمام غير موجود');
    END IF;

    IF NOT public.is_workspace_admin(v_req.workspace_id, v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'صلاحية الموافقة لمدير مساحة العمل فقط');
    END IF;

    UPDATE public.join_requests
    SET status = 'approved',
        resolved_at = timezone('utc'::text, now()),
        resolved_by = v_user_id
    WHERE id = p_request_id;

    INSERT INTO public.workspace_members (workspace_id, user_id, role, status, joined_at)
    VALUES (v_req.workspace_id, v_req.user_id, 'worker', 'active', timezone('utc'::text, now()))
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET
        role = 'worker',
        status = 'active';

    RETURN jsonb_build_object(
        'success', true,
        'workspace_id', v_req.workspace_id,
        'user_id', v_req.user_id
    );
END;
$$;

-- 6.4 رفض طلب انضمام عامل (لمدير مساحة العمل فقط)
CREATE OR REPLACE FUNCTION public.rpc_reject_join_request(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_req public.join_requests%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT * INTO v_req
    FROM public.join_requests
    WHERE id = p_request_id;

    IF v_req.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'طلب الانضمام غير موجود');
    END IF;

    IF NOT public.is_workspace_admin(v_req.workspace_id, v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'صلاحية الرفض لمدير مساحة العمل فقط');
    END IF;

    UPDATE public.join_requests
    SET status = 'rejected',
        resolved_at = timezone('utc'::text, now()),
        resolved_by = v_user_id
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6.5 تجديد رمز الدعوة لمساحة العمل (لمدير مساحة العمل فقط)
CREATE OR REPLACE FUNCTION public.rpc_renew_invite_code(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_new_code VARCHAR(12);
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    IF NOT public.is_workspace_admin(p_workspace_id, v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'صلاحية تجديد الرمز لمدير مساحة العمل فقط');
    END IF;

    LOOP
        v_new_code := public.fn_generate_alnum_code(8);
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.workspaces WHERE invite_code = v_new_code);
    END LOOP;

    UPDATE public.workspaces
    SET invite_code = v_new_code,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_workspace_id;

    RETURN jsonb_build_object(
        'success', true,
        'invite_code', v_new_code
    );
END;
$$;

-- 6.6 إرسال طلب تعاون لمساحة عمل أخرى عبر المعرف القصير (Short ID)
CREATE OR REPLACE FUNCTION public.rpc_send_collaboration_request(p_target_short_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_my_ws_id UUID;
    v_target_ws public.workspaces%ROWTYPE;
    v_collab public.workspace_collaborations%ROWTYPE;
    v_clean_short_id TEXT := UPPER(TRIM(COALESCE(p_target_short_id, '')));
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    v_my_ws_id := public.get_user_workspace_id(v_user_id);
    IF v_my_ws_id IS NULL OR NOT public.is_workspace_admin(v_my_ws_id, v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'صلاحية إرسال طلبات التعاون لمدير مساحة العمل فقط');
    END IF;

    SELECT * INTO v_target_ws
    FROM public.workspaces
    WHERE UPPER(short_id) = v_clean_short_id
    LIMIT 1;

    IF v_target_ws.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على مساحة عمل بهذا المعرف');
    END IF;

    IF v_target_ws.id = v_my_ws_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'لا يمكنك إرسال طلب تعاون لمساحة عملك الخاصة');
    END IF;

    INSERT INTO public.workspace_collaborations (
        requester_workspace_id,
        target_workspace_id,
        status,
        requester_share_cash,
        requester_share_parcels,
        requester_share_reports,
        target_share_cash,
        target_share_parcels,
        target_share_reports,
        updated_at
    )
    VALUES (
        v_my_ws_id,
        v_target_ws.id,
        'pending',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        timezone('utc'::text, now())
    )
    ON CONFLICT (requester_workspace_id, target_workspace_id) DO UPDATE SET
        status = 'pending',
        updated_at = timezone('utc'::text, now())
    RETURNING * INTO v_collab;

    RETURN jsonb_build_object(
        'success', true,
        'collaboration_id', v_collab.id,
        'target_workspace_id', v_target_ws.id,
        'target_workspace_name', v_target_ws.name,
        'target_workspace_short_id', v_target_ws.short_id,
        'collaboration', to_jsonb(v_collab)
    );
END;
$$;

-- 6.7 الرد على طلب التعاون بالقبول أو الرفض
CREATE OR REPLACE FUNCTION public.rpc_respond_to_collaboration(p_collab_id UUID, p_accept BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_collab public.workspace_collaborations%ROWTYPE;
    v_new_status TEXT;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT * INTO v_collab
    FROM public.workspace_collaborations
    WHERE id = p_collab_id;

    IF v_collab.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'طلب التعاون غير موجود');
    END IF;

    IF NOT (
        public.is_workspace_admin(v_collab.target_workspace_id, v_user_id)
        OR (NOT COALESCE(p_accept, FALSE) AND public.is_workspace_admin(v_collab.requester_workspace_id, v_user_id))
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح للرد على طلب التعاون هذا');
    END IF;

    v_new_status := CASE WHEN COALESCE(p_accept, FALSE) THEN 'accepted' ELSE 'rejected' END;

    UPDATE public.workspace_collaborations
    SET status = v_new_status,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_collab_id;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_new_status
    );
END;
$$;

-- 6.8 تحديث إعدادات المشاركة الاختيارية بين مساحتي عمل متعاونتين
CREATE OR REPLACE FUNCTION public.rpc_update_sharing_settings(
    p_collab_id UUID,
    p_share_cash BOOLEAN,
    p_share_parcels BOOLEAN,
    p_share_reports BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_collab public.workspace_collaborations%ROWTYPE;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح');
    END IF;

    SELECT * INTO v_collab
    FROM public.workspace_collaborations
    WHERE id = p_collab_id;

    IF v_collab.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'علاقة التعاون غير موجودة');
    END IF;

    IF public.is_workspace_admin(v_collab.requester_workspace_id, v_user_id) THEN
        UPDATE public.workspace_collaborations
        SET requester_share_cash = FALSE,
            requester_share_parcels = COALESCE(p_share_parcels, FALSE),
            requester_share_reports = FALSE,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_collab_id;
    ELSIF public.is_workspace_admin(v_collab.target_workspace_id, v_user_id) THEN
        UPDATE public.workspace_collaborations
        SET target_share_cash = FALSE,
            target_share_parcels = COALESCE(p_share_parcels, FALSE),
            target_share_reports = FALSE,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_collab_id;
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح لتعديل إعدادات المشاركة');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6.9 توليد رقم تسلسلي ذري للكوليات لكل مساحة عمل لمنع التصادم بين الأجهزة (ITT-YYYY-NNNNN)
CREATE OR REPLACE FUNCTION public.rpc_next_parcel_number(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_next_num BIGINT;
    v_year TEXT;
    v_tracking_code VARCHAR(30);
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى تسجيل الدخول أولاً');
    END IF;

    IF NOT public.is_workspace_member(p_workspace_id, v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح في مساحة العمل هذه');
    END IF;

    -- قفل ذري على مستوى المعاملة لمساحة العمل لمنع أي تصادم متزامن بين جهازين
    PERFORM pg_advisory_xact_lock(hashtext('parcel_seq_' || p_workspace_id::TEXT));

    UPDATE public.workspaces
    SET last_parcel_number = GREATEST(
            COALESCE(last_parcel_number, 100),
            COALESCE((SELECT MAX(parcel_number) FROM public.parcels WHERE workspace_id = p_workspace_id), 100)
        ) + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_workspace_id
    RETURNING last_parcel_number INTO v_next_num;

    IF v_next_num IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'مساحة العمل غير موجودة');
    END IF;

    v_year := EXTRACT(YEAR FROM timezone('utc'::text, now()))::INT::TEXT;
    v_tracking_code := 'ITT-' || v_year || '-' || LPAD(v_next_num::TEXT, 5, '0');

    -- ضمان عدم تكرار tracking_code عالمياً في جدول parcels
    WHILE EXISTS (SELECT 1 FROM public.parcels WHERE tracking_code = v_tracking_code) LOOP
        UPDATE public.workspaces
        SET last_parcel_number = last_parcel_number + 1
        WHERE id = p_workspace_id
        RETURNING last_parcel_number INTO v_next_num;

        v_tracking_code := 'ITT-' || v_year || '-' || LPAD(v_next_num::TEXT, 5, '0');
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'parcel_number', v_next_num,
        'tracking_code', v_tracking_code
    );
END;
$$;

-- 6.10 التحقق الآمن على مستوى الخادم مما إذا كان المستخدم الحالي مالكاً للمنصة (platform_owner)
CREATE OR REPLACE FUNCTION public.rpc_check_is_platform_owner()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'is_platform_owner', false);
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_platform_owner', public.is_platform_owner(v_user_id)
    );
END;
$$;

-- 6.11 جلب قائمة جميع مساحات العمل واشتراكاتها وحدود باقاتها لمالك المنصة (دون كشف أي كوليات أو أموال)
CREATE OR REPLACE FUNCTION public.rpc_platform_list_workspaces()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_workspaces JSONB;
    v_subscriptions JSONB;
BEGIN
    IF v_user_id IS NULL OR NOT public.is_platform_owner(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: هذه العملية مخصصة لمالك المنصة فقط');
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', w.id,
                'short_id', w.short_id,
                'name', w.name,
                'invite_code', w.invite_code,
                'owner_phone', w.owner_phone,
                'owner_whatsapp', w.owner_whatsapp,
                'admin_notes', w.admin_notes,
                'plan_name', COALESCE(w.plan_name, 'الباقة الأساسية'),
                'max_workers', COALESCE(w.max_workers, 5),
                'max_stations', COALESCE(w.max_stations, 3),
                'max_collaborations', COALESCE(w.max_collaborations, 3),
                'unclaimed_days_threshold', COALESCE(w.unclaimed_days_threshold, 7),
                'created_by', w.created_by,
                'created_at', w.created_at,
                'updated_at', w.updated_at,
                'workers_count', (SELECT COUNT(*) FROM public.workspace_members m WHERE m.workspace_id = w.id AND m.role = 'worker' AND m.status = 'active'),
                'stations_count', (SELECT COUNT(*) FROM public.stations s WHERE s.workspace_id = w.id),
                'collaborations_count', (SELECT COUNT(*) FROM public.workspace_collaborations c WHERE c.status = 'accepted' AND (c.requester_workspace_id = w.id OR c.target_workspace_id = w.id))
            )
            ORDER BY w.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_workspaces
    FROM public.workspaces w;

    SELECT COALESCE(
        jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC),
        '[]'::jsonb
    )
    INTO v_subscriptions
    FROM public.subscriptions s;

    RETURN jsonb_build_object(
        'success', true,
        'workspaces', v_workspaces,
        'subscriptions', v_subscriptions
    );
END;
$$;

-- 6.12 تحديث اشتراك مساحة عمل أو حدود الباقة أو الملاحظات الإدارية بواسطة مالك المنصة حصراً
CREATE OR REPLACE FUNCTION public.rpc_platform_update_subscription(
    p_workspace_id UUID,
    p_action TEXT,
    p_months INT DEFAULT 1,
    p_notes TEXT DEFAULT NULL,
    p_plan_name TEXT DEFAULT NULL,
    p_max_workers INT DEFAULT NULL,
    p_max_stations INT DEFAULT NULL,
    p_max_collaborations INT DEFAULT NULL,
    p_admin_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_sub public.subscriptions%ROWTYPE;
    v_ws public.workspaces%ROWTYPE;
    v_base_date TIMESTAMPTZ;
    v_new_end TIMESTAMPTZ;
    v_new_status TEXT;
    v_final_notes TEXT := COALESCE(p_admin_notes, p_notes);
BEGIN
    IF v_user_id IS NULL OR NOT public.is_platform_owner(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مصرح: هذه العملية مخصصة لمالك المنصة فقط');
    END IF;

    SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id;
    IF v_ws.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'مساحة العمل غير موجودة');
    END IF;

    SELECT * INTO v_sub FROM public.subscriptions WHERE workspace_id = p_workspace_id;

    IF p_action IN ('activate', 'extend', 'suspend') THEN
        IF v_sub.id IS NOT NULL AND v_sub.end_date > timezone('utc'::text, now()) THEN
            v_base_date := v_sub.end_date;
        ELSE
            v_base_date := timezone('utc'::text, now());
        END IF;

        IF p_action = 'suspend' THEN
            v_new_status := 'suspended';
            v_new_end := COALESCE(v_sub.end_date, timezone('utc'::text, now()));
        ELSE
            v_new_status := 'active';
            v_new_end := v_base_date + (GREATEST(COALESCE(p_months, 1), 1) || ' months')::INTERVAL;
        END IF;

        INSERT INTO public.subscriptions (
            workspace_id,
            status,
            start_date,
            end_date,
            is_trial,
            plan_name,
            notes
        )
        VALUES (
            p_workspace_id,
            v_new_status,
            COALESCE(v_sub.start_date, timezone('utc'::text, now())),
            v_new_end,
            FALSE,
            COALESCE(p_plan_name, v_ws.plan_name, 'الباقة القياسية'),
            COALESCE(v_final_notes, v_sub.notes)
        )
        ON CONFLICT (workspace_id) DO UPDATE SET
            status = EXCLUDED.status,
            end_date = EXCLUDED.end_date,
            is_trial = FALSE,
            plan_name = COALESCE(p_plan_name, public.subscriptions.plan_name),
            notes = COALESCE(v_final_notes, public.subscriptions.notes)
        RETURNING * INTO v_sub;
    END IF;

    -- تحديث ملاحظات وحدود مساحة العمل إن تم تمريرها
    UPDATE public.workspaces
    SET admin_notes = COALESCE(v_final_notes, admin_notes),
        plan_name = COALESCE(p_plan_name, plan_name),
        max_workers = COALESCE(GREATEST(p_max_workers, 1), max_workers),
        max_stations = COALESCE(GREATEST(p_max_stations, 1), max_stations),
        max_collaborations = COALESCE(GREATEST(p_max_collaborations, 0), max_collaborations),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_workspace_id
    RETURNING * INTO v_ws;

    IF v_sub.id IS NULL THEN
        SELECT * INTO v_sub FROM public.subscriptions WHERE workspace_id = p_workspace_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'workspace', to_jsonb(v_ws),
        'subscription', to_jsonb(v_sub)
    );
END;
$$;

-- 6.13 تأكيد تغيير كلمة المرور المؤقتة عند أول تسجيل دخول
CREATE OR REPLACE FUNCTION public.rpc_clear_must_change_password()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'غير مسجل الدخول');
    END IF;

    UPDATE public.profiles
    SET must_change_password = FALSE,
        updated_at = timezone('utc'::text, now())
    WHERE id = v_user_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 6.13 تحديث رقم الهاتف المعتمد للدخول ورقم الواتساب للاستعادة من صفحة الإعدادات
CREATE OR REPLACE FUNCTION public.rpc_update_my_contact_numbers(
    p_new_phone TEXT,
    p_new_whatsapp TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_clean_phone TEXT;
    v_clean_whatsapp TEXT;
    v_new_email TEXT;
    v_exists BOOLEAN;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'غير مصرح: يرجى تسجيل الدخول أولاً');
    END IF;

    v_clean_phone := regexp_replace(COALESCE(p_new_phone, ''), '[^0-9]', '', 'g');
    IF length(v_clean_phone) < 8 THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)');
    END IF;

    v_clean_whatsapp := regexp_replace(COALESCE(NULLIF(TRIM(p_new_whatsapp), ''), v_clean_phone), '[^0-9]', '', 'g');
    IF length(v_clean_whatsapp) < 8 THEN
        v_clean_whatsapp := v_clean_phone;
    END IF;

    -- التحقق من عدم استخدام الرقم الجديد من طرف مستخدم آخر
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE phone = v_clean_phone AND id <> v_user_id
    ) INTO v_exists;

    IF v_exists THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'رقم الهاتف الجديد مسجل بالفعل لحساب آخر في النظام');
    END IF;

    v_new_email := v_clean_phone || '@alittihadia.app';

    -- تحديث البريد الاصطلاحي والبيانات الوصفية في جدول المصادقة auth.users مباشرةً
    UPDATE auth.users
    SET email = v_new_email,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
            'phone', v_clean_phone,
            'whatsapp_number', v_clean_whatsapp
        ),
        updated_at = NOW()
    WHERE id = v_user_id;

    -- تحديث الملف الشخصي في public.profiles
    UPDATE public.profiles
    SET phone = v_clean_phone,
        whatsapp_number = v_clean_whatsapp,
        updated_at = NOW()
    WHERE id = v_user_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'phone', v_clean_phone,
        'whatsapp_number', v_clean_whatsapp
    );
END;
$$;

-- منح صلاحيات التنفيذ للمستخدمين المصادق عليهم (authenticated) فقط
GRANT EXECUTE ON FUNCTION public.fn_generate_alnum_code(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_workspace(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_submit_join_request(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_join_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_join_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_renew_invite_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_send_collaboration_request(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_respond_to_collaboration(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_sharing_settings(UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_next_parcel_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_check_is_platform_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_platform_list_workspaces() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_platform_update_subscription(UUID, TEXT, INT, TEXT, TEXT, INT, INT, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_clear_must_change_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_my_contact_numbers(TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 7. تفعيل التحديث الفوري (SUPABASE REALTIME PUBLICATION)
-- ============================================================================
DO $$
DECLARE
    v_tbl TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        FOREACH v_tbl IN ARRAY ARRAY[
            'parcels',
            'trips',
            'trip_parcels',
            'transactions',
            'stations',
            'station_balances',
            'join_requests',
            'workspace_collaborations'
        ] LOOP
            BEGIN
                EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_tbl);
            EXCEPTION
                WHEN duplicate_object THEN NULL;
            END;
        END LOOP;
    END IF;
END;
$$;

-- ============================================================================
-- 8. حاوية التخزين الخاصة لإيصالات الصندوق (PRIVATE STORAGE BUCKET: receipts)
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipts',
    'receipts',
    FALSE,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
    public = FALSE,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "receipts_select_workspace" ON storage.objects;
DROP POLICY IF EXISTS "receipts_insert_workspace" ON storage.objects;
DROP POLICY IF EXISTS "receipts_delete_workspace" ON storage.objects;

-- السماح لأعضاء مساحة العمل أو المدير المتعاون المصرح له بقراءة صور الإيصالات ضمن مجلد مساحة العمل (<workspace_id>/...)
CREATE POLICY "receipts_select_workspace"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND (
        public.is_workspace_member(((storage.foldername(name))[1])::UUID, auth.uid())
        OR public.can_view_workspace_cash(((storage.foldername(name))[1])::UUID, auth.uid())
    )
);

-- السماح لأعضاء مساحة العمل برفع صور الإيصالات داخل مجلد مساحة عملهم فقط
CREATE POLICY "receipts_insert_workspace"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_workspace_member(((storage.foldername(name))[1])::UUID, auth.uid())
    AND public.is_workspace_subscription_active(((storage.foldername(name))[1])::UUID)
);

-- السماح لمدير مساحة العمل بحذف صور الإيصالات الخاصة بمساحته
CREATE POLICY "receipts_delete_workspace"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND public.is_workspace_admin(((storage.foldername(name))[1])::UUID, auth.uid())
);

-- ============================================================================
-- 9. أمر إدخال مالك المنصة يدوياً (توجيهات التشغيل)
-- ============================================================================
-- بعد تسجيل حسابك بالهاتف في التطبيق، انسخ معرف المستخدم الخاص بك (User ID) من Supabase Auth،
-- ونفذ السطر التالي في SQL Editor لترقية حسابك إلى مالك المنصة بصلاحيات كاملة:
--
-- INSERT INTO public.platform_owners (user_id) 
-- VALUES ('<ضع_معرف_المستخدم_هنا>');
--
-- مثال:
-- INSERT INTO public.platform_owners (user_id) 
-- VALUES ('b2f51234-5678-4321-8765-abcdef123456');
-- ============================================================================

-- ============================================================================
-- 10. تحديثات الميزات التجارية المتقدمة (Branding, Trip Expenses, Public Tracking)
-- ============================================================================

-- 10.1 أعمدة تخصيص الهوية والشعار على الملصق الحراري في جدول مساحات العمل
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS custom_brand_name TEXT;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS custom_brand_subtitle TEXT;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS custom_brand_phone TEXT;
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS custom_brand_logo_url TEXT;

-- 10.2 أعمدة مصاريف الطريق للسائق (المازوط، الطريق السيار، العمولة) في جدول الرحلات
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS fuel_expense NUMERIC(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS toll_expense NUMERIC(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS driver_commission NUMERIC(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS other_expense NUMERIC(12,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS expense_currency VARCHAR(4) DEFAULT 'MAD' NOT NULL;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS deduct_from_cashbox BOOLEAN DEFAULT FALSE NOT NULL;

-- 10.3 دالة التتبع العام للزبون عبر كود التتبع بدون تسجيل الدخول (Public Tracking Link RPC)
CREATE OR REPLACE FUNCTION public.rpc_get_public_parcel_tracking(p_tracking_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_code TEXT;
    v_parcel RECORD;
    v_origin_name TEXT;
    v_dest_name TEXT;
    v_workspace_name TEXT;
BEGIN
    v_clean_code := UPPER(BTRIM(COALESCE(p_tracking_code, '')));
    IF v_clean_code = '' OR LENGTH(v_clean_code) < 4 THEN
        RETURN jsonb_build_object('success', false, 'error', 'يرجى إدخال رقم تتبع صحيح');
    END IF;

    SELECT p.*
    INTO v_parcel
    FROM public.parcels p
    WHERE UPPER(p.tracking_code) = v_clean_code
    LIMIT 1;

    IF v_parcel.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على أي شحنة بهذا الرقم');
    END IF;

    SELECT s.name INTO v_origin_name FROM public.stations s WHERE s.id = v_parcel.origin_station_id;
    SELECT s.name INTO v_dest_name FROM public.stations s WHERE s.id = v_parcel.destination_station_id;
    SELECT COALESCE(w.custom_brand_name, w.name) INTO v_workspace_name FROM public.workspaces w WHERE w.id = v_parcel.workspace_id;

    RETURN jsonb_build_object(
        'success', true,
        'parcel', jsonb_build_object(
            'id', v_parcel.id,
            'tracking_code', v_parcel.tracking_code,
            'parcel_number', v_parcel.parcel_number,
            'workspace_name', COALESCE(v_workspace_name, 'محطة الاتحادية'),
            'origin_station_name', COALESCE(v_origin_name, 'محطة الانطلاق'),
            'destination_station_name', COALESCE(v_dest_name, 'محطة الوصول'),
            'route', v_parcel.route,
            'sender_name', v_parcel.sender_name,
            'receiver_name', v_parcel.receiver_name,
            'description', v_parcel.description,
            'items_count', v_parcel.items_count,
            'amount_due', v_parcel.amount_due,
            'amount_paid', v_parcel.amount_paid,
            'currency', v_parcel.currency,
            'payer', v_parcel.payer,
            'status', v_parcel.status,
            'condition', v_parcel.condition,
            'status_history', v_parcel.status_history,
            'created_at', v_parcel.created_at,
            'updated_at', v_parcel.updated_at,
            'delivered_at', v_parcel.delivered_at,
            'delivered_to', v_parcel.delivered_to
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_get_public_parcel_tracking(TEXT) TO anon, authenticated;

