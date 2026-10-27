# Engineering Handover Brief — محطة الاتحادية (Al-Ittihadia Station)

---

## 1. Project Purpose & Target Users

### What Problem It Solves
Cross-border overland transport and parcel shipping agencies operating between **Morocco (الداخلة / Dakhla)** and **Mauritania (نواذيبو / Nouadhibou)** via the **Guerguerat International Border Crossing (معبر الكركرات الدولي)** traditionally rely on paper ledgers, manual WhatsApp messages, and unindexed parcel stickers. This leads to:
- Lost or unverified parcels during vehicle loading/unloading across border stations.
- Uncollected Cash-on-Delivery (COD) fees and untracked partial payments.
- Cash drawer discrepancies across two separate physical currencies (**Moroccan Dirham `MAD`** and **Mauritanian Ouguiya `MRU`**).
- Printing bottlenecks when a single merchant ships dozens or hundreds of parcels at once.

### Who It's For
1. **Station Owners / General Supervisors (`owner`)**:
   - Manage multiple stations (Dakhla, Nouadhibou, etc.).
   - Oversee real-time dual-currency cash balances (`MAD` & `MRU`), audit financial ledgers, manage workers, collaborate with partner workspaces, and export CSV/JSON reports.
2. **Station Workers / Clerks (`worker`)**:
   - Assigned to a specific station (`station_workers`).
   - Register incoming/outgoing parcels, print thermal stickers (single or batch 100+ stickers), scan barcodes/QR codes during vehicle loading (dispatch) and unloading (arrival), collect payments, and record daily cash-in/cash-out vouchers in their station.
3. **Platform Super-Owner (`platform_owner`)**:
   - Manages SaaS workspace subscriptions, 15-day free trials, subscription renewals (via Cash Plus / WhatsApp), and password reset requests without accessing private financial or parcel data of individual workspaces.

### Why We're Building It
To provide a mobile-first (`390px` viewport, desert/gold RTL Arabic aesthetic), offline-capable Progressive Web App (PWA) that works immediately in local/demo mode (`localStorage`) and seamlessly upgrades to cloud multi-device sync via **Supabase (PostgreSQL + Auth + RLS)**.

---

## 2. Main Features (Done / In Progress / Planned)

### Done (Production-Ready in Current Codebase)
- **Mobile-First `390px` Desert/Gold UI & Live Shipment Tracking Showcase:**
  - Dedicated `390px` mobile app layout (`App.tsx`, `Header.tsx`, `BottomNav.tsx`) with dark desert background (`#060300`), translucent brown cards (`#1a0f00/80`), and metallic gold borders (`#D4AF37`).
  - Desert route map (`Dakhla → Guerguerat → Nouadhibou`) with white transport van and a 4-stage Golden Timeline displaying the exact 4 statuses:
    1. `فالمحطة`
    2. `فالطريق`
    3. `وصلات`
    4. `تسلمات`
  - Circular 3D official station logo (`/logo.png`) rendered cleanly with `border-radius: 50%` and transparent container across the Header, Station cards, and Thermal Stickers.
- **Parcels & International Shipments Management (`ParcelsView`, `NewParcelModal`, `ParcelDetailModal`):**
  - Sequential tracking code generation (`ITT-YYYY-NNNNN`, e.g., `ITT-2026-00101`).
  - Sender/receiver details, route (`الداخلة ➔ نواذيبو` or reverse), item count, weight, condition (`normal` عادي vs `abnormal` غير عادي with mandatory notes), and financial tracking (`sender` vs `receiver` payer, partial payments, unpaid/COD warnings).
- **Batch & Single Thermal Sticker Printing (`ParcelStickerModal`):**
  - Shop-style split dialog (Options/Selection on the right, live 3-part B&W thermal sticker preview on the left, unified print bar at the bottom).
  - **Selection:** Checkboxes, "تحديد الكل" (Select All), instant search, and "جميع كوليات هذا المرسل" (Select all parcels of the same sender). Also reachable from the parcels list with multiple parcels selected.
  - **Copies & Persistent Options:** Copies per parcel (`+`/`-`), paper size (`100×100 مم`, `A4 (4 ملصقات في الصفحة)`, or custom `mm`), code type (`QR فقط`, `Code128 فقط`, `QR + Code128`), and toggles for date/time, route line, and stamp box.
  - **High-Volume Batch Printing (100+ Stickers):** Chunked async QR generation with caching by `tracking_code`, progress bar, standard CSS `page-break-after: always`, and `localStorage` payload transfer (`alittihadia_batch_sticker_html_v1`) to open in a standalone tab when iframe sandboxing blocks `window.print()`.
- **Trips, Dispatch & Arrival Barcode/QR Scanning (`NewTripModal`, `TripDispatchModal`, `TripArrivalModal`, `BarcodeScannerModal`, `QuickDeliverModal`):**
  - Camera scanning via `html5-qrcode` (supports both `QR_CODE` and `CODE_128`) + USB/Bluetooth HID scanner support + Web Audio API beeps & vibration feedback (`audioFeedback.ts`).
  - Remembered drivers and vehicle license plates (`RememberedDriver`, `RememberedVehicle`).
  - Duplicate scan prevention, wrong-origin station warnings, manifest loading order, destination intake verification, and mandatory administrative reason if closing a trip with missing parcels.
- **Dual-Currency Cash Box & Audit Ledger (`LedgerView`, `NewVoucherModal`, `DailyFinancialReportModal`):**
  - Strict separation of `MAD` (Moroccan Dirham) and `MRU` (Mauritanian Ouguiya) per station, plus live currency converter (`exchangeRate`).
  - Mandatory reason logging for any transaction edit or cancellation (`TransactionEditEntry`, `AuditLogEntry`).
  - Daily opening/closing balance sheet per station (`DailyClosingReport`).
- **SaaS Multi-Tenant Workspaces, RBAC, Paywall & Demo Mode (`AppContext`, `SettingsView`, `PlatformOwnerDashboard`, `PaywallModal`, `SQLModal`):**
  - 15-day free trial, read-only lock upon expiry, Cash Plus renewal instructions (`+212618961387`).
  - Full `DEMO_MODE` auto-seeding (2 stations, 3 workers, 8 parcels, 2 trips, 8 cash transactions) with a one-click "حذف البيانات التجريبية" (Clear Demo Data) button in Settings.

### In Progress
- **Supabase Cloud Sync Wiring:** Connecting all local service mutations (`parcelService`, `tripService`, `cashService`) to write-through to Supabase PostgreSQL tables when `isSupabaseConfigured()` is `true`.

### Planned
- **Public Customer Tracking Page:** Read-only public route (`?track=ITT-2026-00101`) for customers to view live status via WhatsApp link.
- **Automated Password Reset Edge Function:** Moving password resets from admin-generated temporary codes to automated Supabase Auth admin reset functions.

---

## 3. Tech Stack, Libraries & APIs

- **Frontend Framework:** React 19 (`react@^19.0.1`, `react-dom@^19.0.1`), TypeScript (`^7.0.2`), Vite (`^8.3.0`).
- **Styling:** Tailwind CSS v4 (`@tailwindcss/vite@^4.3.3`), Google Fonts (`Cairo`, `Tajawal`, `JetBrains Mono`) & `@fontsource/cairo`.
- **Icons:** `lucide-react@^0.546.0`.
- **Database & Auth:**
  - Offline-First Local Storage: `src/services/storageService.ts`.
  - Cloud Backend: `@supabase/supabase-js@^2.118.0` (PostgreSQL + Row-Level Security + Supabase Auth mapping phone numbers to `<digits>@alittihadia.app`).
- **Barcodes & QR Codes:**
  - Generation: `qrcode@^1.5.4` + custom zero-dependency ISO/IEC 15417 `Code128-B` vector SVG generator in `ParcelStickerModal.tsx`.
  - Scanning: `html5-qrcode@^2.3.8` (`QR_CODE` and `CODE_128`).
- **Audio & Haptics:** Browser `AudioContext` (Web Audio API synthesized tones) + `navigator.vibrate` (`src/utils/audioFeedback.ts`).

---

## 4. Project Structure

```text
/
├── .env.example                        # Environment variable template (Supabase URL/Key, WhatsApp admin number)
├── ASSUMPTIONS.md                      # Detailed Arabic technical & operational assumptions documentation
├── HANDOVER.md                         # Engineering handover brief
├── index.html                          # RTL Arabic HTML entry point, PWA meta tags, Cairo/Tajawal/JetBrains fonts
├── metadata.json                       # AI Studio applet metadata
├── package.json                        # Scripts and dependencies
├── tsconfig.json                       # TypeScript configuration
├── vite.config.ts                      # Vite bundler configuration
├── supabase/
│   └── schema.sql                      # Complete idempotent PostgreSQL + RLS + RPCs + Realtime schema
├── public/
│   ├── logo.png                        # Official high-res circular 3D station logo
│   └── assets/aistudio/
│       └── IIII_3d3dff03.jpeg          # Desert road map & mobile UI reference asset
└── src/
    ├── main.tsx                        # React DOM root mount
    ├── App.tsx                         # Top-level mobile container (390px), tab router, and global modals
    ├── index.css                       # Global Tailwind v4 import, custom scrollbars, and @media print rules
    ├── config/
    │   ├── constants.ts                # DEMO_MODE flag, Cash Plus phone (+212618961387), trial days, default stations
    │   └── schemaSql.ts                # Imports supabase/schema.sql?raw for SQLModal display
    ├── types/
    │   └── database.ts                 # All TypeScript interfaces (Parcel, Trip, Transaction, PendingSyncOperation, etc.)
    ├── services/
    │   ├── index.ts                    # Barrel export for all services
    │   ├── storageService.ts           # Typed localStorage wrapper, UUID helpers, and PENDING_SYNC offline queue
    │   ├── parcelService.ts            # Parcel sequence (DB RPC + local), cloud write-through, and offline retry queue
    │   ├── tripService.ts              # Trip CRUD, trip_parcels & driver/vehicle cloud sync, and offline retry queue
    │   ├── cashService.ts              # Dual-currency (MAD/MRU) ledger, transactions/audit_logs/station_balances cloud sync
    │   ├── subscriptionService.ts      # 15-day trial creation, expiry calculation, extension/suspension logic
    │   └── exportService.ts            # UTF-8 BOM CSV exports (Parcels & Transactions) and full JSON workspace backup
    ├── context/
    │   └── AppContext.tsx              # Central React state provider, initial cloud hydration, Realtime channel, online retry
    ├── hooks/
    │   ├── useOnlineStatus.ts          # Browser online/offline status listener used for automatic queue flushing
    │   └── usePWAInstall.ts            # PWA beforeinstallprompt and iOS standalone detection hook
    ├── lib/
    │   ├── arabicTafqeet.ts            # Converts numeric amounts into formal Arabic words (التفقيط المالي)
    │   ├── i18n.ts                     # Arabic UI dictionary constants
    │   ├── imageCompressor.ts          # Client-side HTML5 Canvas image compression for receipt photos
    │   └── supabase.ts                 # Supabase client singleton, phoneToEmail helper, runtime credential storage
    ├── utils/
    │   ├── audioFeedback.ts            # Web Audio API success/error beeps + device vibration
    │   └── demoData.ts                 # Workspace demo data generator (is_demo: true)
    └── components/
        ├── Header.tsx                  # Sticky mobile header with circular 3D logo, station switcher & slide-up drawer
        ├── BottomNav.tsx               # Fixed 390px bottom navigation bar + quick action (+) modal
        ├── OwnerDashboard.tsx          # Owner view: desert map, 4-stage timeline, QR card, global cash & station management
        ├── WorkerStationView.tsx       # Worker view: desert map, 4-stage timeline, station cash & pending deliveries
        ├── ParcelsView.tsx             # Full parcels & trips management, filters, batch selection, incoming trips, overview
        ├── ParcelStickerModal.tsx      # Single & Batch (100+) thermal sticker preview and printing engine (QR + Code128)
        ├── ParcelDetailModal.tsx       # Parcel info, status updater, status history, and payment collection modal
        ├── NewParcelModal.tsx          # New parcel intake form with automatic cash transaction creation
        ├── NewTripModal.tsx            # Create trip modal with quick-select remembered drivers and vehicle plates
        ├── TripDispatchModal.tsx       # Origin station barcode/QR loading manifest modal
        ├── TripArrivalModal.tsx        # Destination station barcode/QR unloading & missing parcel verification modal
        ├── QuickDeliverModal.tsx       # Fast parcel lookup/scan, COD collection, and delivery confirmation
        ├── BarcodeScannerModal.tsx     # Camera QR/Code128 scanner modal using html5-qrcode
        ├── LedgerView.tsx              # Financial cashbox ledger, currency converter, edit/cancel with mandatory reason
        ├── NewVoucherModal.tsx         # Cash-in / Cash-out / Goods payment voucher creation modal with photo compression
        ├── TransactionDetailModal.tsx  # Detailed view of a cash transaction and its edit audit trail
        ├── DailyFinancialReportModal.tsx # Daily opening/closing cash reconciliation report per station
        ├── SettingsView.tsx            # Workspace settings, exchange rate, backup/restore, clear demo data, collaborations
        ├── AuthModal.tsx               # Phone + password login/signup, workspace invite code join flow & LegalTermsModal link
        ├── ForgotPasswordModal.tsx     # Password recovery request modal for workers and owners
        ├── OnboardingModal.tsx         # Initial workspace creation or join-by-invite-code modal
        ├── PaywallModal.tsx            # Subscription renewal instructions (Cash Plus + WhatsApp)
        ├── PlatformOwnerDashboard.tsx  # SaaS super-admin panel for managing workspace subscriptions
        ├── DataPrivacyModal.tsx        # Data isolation & collaboration permissions explainer modal
        ├── LegalTermsModal.tsx         # Arabic Terms of Use & Privacy Policy modal (linked from AuthModal)
        ├── SQLModal.tsx                # Copyable Supabase SQL schema modal for one-click database setup
        ├── OfflineIndicator.tsx        # Top banner shown when browser loses internet connectivity
        ├── PWAInstallButton.tsx        # Install-to-homescreen button for Android/iOS
        └── Toast.tsx                   # Floating notification toast
```

---

## 5. Main Flows & Key Logic

1. **Authentication & Workspace Initialization (`AppContext.tsx`):**
   - Users log in with phone + password (`AuthModal.tsx`). Phone numbers are converted to `<digits>@alittihadia.app` via `phoneToEmail()` for Supabase Auth (zero SMS cost).
   - When Supabase is configured (`isSupabaseConfigured() === true`), registering as an Owner calls `rpc_create_workspace(p_name)` which atomically creates the workspace, owner `workspace_members` row (`role = 'admin'`), 15-day trial `subscriptions` row, default `stations` (Dakhla & Nouadhibou), and default `currencies` (`MAD` & `MRU`), returning authoritative database UUIDs.
   - When a new workspace is created in offline/demo mode (`DEMO_MODE && !isSupabaseConfigured()`), `generateWorkspaceDemoData()` seeds 2 stations (Dakhla & Nouadhibou), 3 workers, 8 parcels, 2 trips, and 8 cash transactions marked with `is_demo: true`.
2. **Parcel Lifecycle & Automatic Cash Accounting:**
   - **`registered` (`فالمحطة`):** Created via `NewParcelModal`. When Supabase is live, `parcelService.getNextParcelNumberAsync()` calls `rpc_next_parcel_number(p_workspace_id)` to atomically increment `workspaces.last_parcel_number` in PostgreSQL so `ITT-YYYY-NNNNN` tracking codes never collide across devices. If `amountPaid > 0` at intake, `AppContext.createParcel()` automatically creates a `parcel_shipping_fee` cash transaction in the origin station's cash box (`MAD` or `MRU`).
   - **`in_transit` (`فالطريق`):** Loaded onto a `Trip` via `TripDispatchModal` by scanning the sticker's QR or Code128 barcode (`tripService.loadParcelToTrip()`), syncing `trips`, `parcels`, and `trip_parcels`, then departed via `departTrip()`.
   - **`arrived` (`وصلات`):** Scanned off the vehicle at the destination station via `TripArrivalModal` (`tripService.receiveParcelAtDestination()`), recording whether its condition is `normal` or `abnormal` and updating `trip_parcels.received_at`.
   - **`delivered` (`تسلمات`):** Handed over to the recipient via `QuickDeliverModal` or `ParcelDetailModal`. Any remaining balance (`amount_due - amount_paid`) is collected and automatically logged as a `parcel_cod_collection` transaction in the destination station's cash box.
3. **Batch Thermal Sticker Printing Engine (`ParcelStickerModal.tsx`):**
   - Renders a 3-part black-and-white thermal layout (`Part 1`: Circular logo + parcel number/date/time on right, QR/Code128 on left; `Part 2`: Sender/Receiver boxes + route + payment status; `Part 3`: Stamp box).
   - Generates QR DataURLs in non-blocking chunks of 8 with caching by `tracking_code` so printing 100+ stickers never freezes the browser.
   - Saves the complete batch HTML document to `localStorage` (`alittihadia_batch_sticker_html_v1`) to support one-click opening in a standalone tab (`?standalone_sticker_batch=1`) when running inside a sandboxed preview iframe.

---

## 6. Important Decisions & Why

1. **Strict `390px` Mobile Frame & Desert/Gold Visual Identity:**
   - Station clerks and drivers operate on smartphones. The app shell (`App.tsx`, `Header.tsx`, `BottomNav.tsx`) is constrained to a `max-w-[390px]` mobile viewport with a dark desert theme (`#060300` / `#1a0f00` / `#D4AF37` gold) matching the reference design 100%.
2. **4-Stage Tracking Timeline (`فالمحطة`, `فالطريق`, `وصلات`, `تسلمات`):**
   - Standardized the visual tracking timeline card in `OwnerDashboard.tsx`, `ParcelsView.tsx`, and `WorkerStationView.tsx` to display exclusively those 4 statuses in order.
3. **Circular 3D Logo Without White Box:**
   - Placed the official PNG logo at `/public/logo.png` and enforced `border-radius: 50% !important; object-fit: cover; background: transparent !important; padding: 0 !important; overflow: hidden;` on both the `<img>` and its wrapper.
4. **Separate `MAD` and `MRU` Cash Ledgers:**
   - Physical cash drawers in Dakhla (`MAD`) and Nouadhibou (`MRU`) are never mixed or auto-converted in ledger calculations; each station tracks exact `MAD` and `MRU` balances independently.

---

## 7. Known Bugs, Limitations & Unfinished Parts

1. **Static Showcase Card vs. Dynamic Parcel Selection:**
   - The Hero Live Tracking Showcase card (`حالة الشحنة • In Transit`) at the top of `OwnerDashboard.tsx`, `ParcelsView.tsx`, and `WorkerStationView.tsx` displays the 4-step golden timeline showcase (`فالمحطة`, `فالطريق`, `وصلات`, `تسلمات`) as a visual hero header, while actual per-parcel dynamic history is viewed and updated inside `ParcelDetailModal.tsx`.

---

## 8. Supabase Status & Cloud Sync Architecture (Complete)

- **Current Status:** **100% Complete (Full Cloud Sync + Offline Queue + Realtime + Idempotent RLS/RPC Schema).**
- **Offline / Demo Mode Preservation:**
  - When `isSupabaseConfigured()` is `false`, `DEMO_MODE && !isSupabaseConfigured()` works 100% locally in `localStorage` with zero network calls.
  - Records flagged with `is_demo: true` are never uploaded to Supabase.
- **Database Schema & RPC Functions (`supabase/schema.sql` & `src/config/schemaSql.ts`):**
  - All `CREATE TABLE`, `CREATE INDEX`, `DROP POLICY IF EXISTS` + `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`, and `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` statements are completely idempotent and safe to re-run.
  - All RPC functions use `SECURITY DEFINER SET search_path = public`, explicitly verify `auth.uid()` and the caller's workspace membership/role (`is_workspace_admin` / `is_workspace_member`), and grant `EXECUTE` to `authenticated`:
    1. `rpc_create_workspace(p_name TEXT)` — Creates workspace (`short_id`, `invite_code`, `last_parcel_number = 100`), upserts caller's `profiles` row, creates `workspace_members` (`role = 'admin', status = 'active'`), creates 15-day trial `subscriptions` row, seeds default `stations` (Dakhla & Nouadhibou) + `station_balances` (`MAD`/`MRU` = 0), and seeds default `currencies` (`MAD` & `MRU`). Returns `{ success, workspace, member, subscription, stations, currencies }`.
    2. `rpc_submit_join_request(p_invite_code TEXT)` — Validates invite code, checks existing membership/request, inserts `join_requests` row, and returns `{ success, request_id, workspace_id }`.
    3. `rpc_approve_join_request(p_request_id UUID)` — Verifies caller is admin of the request's workspace, updates request to `'approved'`, upserts worker into `workspace_members` (`role = 'worker', status = 'active'`), and returns `{ success, member }`.
    4. `rpc_reject_join_request(p_request_id UUID)` — Verifies caller is admin of the request's workspace, updates request to `'rejected'`, and returns `{ success }`.
    5. `rpc_renew_invite_code(p_workspace_id UUID)` — Verifies caller is admin of `p_workspace_id`, generates a new unique 8-character `invite_code`, updates `workspaces`, and returns `{ success, invite_code }`.
    6. `rpc_send_collaboration_request(p_target_short_id TEXT)` — Finds caller's admin workspace and target workspace by `short_id`, creates a `pending` `workspace_collaborations` row, and returns `{ success, collaboration }`.
    7. `rpc_respond_to_collaboration(p_collab_id UUID, p_accept BOOLEAN)` — Verifies caller is admin of `target_workspace_id` (or `requester_workspace_id`), sets status to `'accepted'` or `'rejected'`, and returns `{ success, status }`.
    8. `rpc_update_sharing_settings(p_collab_id UUID, p_share_cash BOOLEAN, p_share_parcels BOOLEAN, p_share_reports BOOLEAN)` — Verifies caller is admin of either `requester_workspace_id` or `target_workspace_id`, updates only that side's `requester_share_*` or `target_share_*` columns, and returns `{ success }`.
    9. `rpc_next_parcel_number(p_workspace_id UUID)` — Verifies caller is an active member of `p_workspace_id`, atomically increments `workspaces.last_parcel_number` in PostgreSQL (`GREATEST(last_parcel_number, max(parcels.parcel_number), 100) + 1`), and returns `{ success, parcel_number, tracking_code }` (`ITT-YYYY-NNNNN`) so parcel numbers never collide across devices.
- **Service Cloud Write-Through, Offline Retry Queue & Realtime:**
  - `parcelService.ts`, `tripService.ts`, and `cashService.ts` write through to Supabase (`parcels`, `trips`, `trip_parcels`, `remembered_drivers`, `remembered_vehicles`, `transactions`, `audit_logs`, `station_balances`) whenever `isSupabaseConfigured()` is `true`.
  - If a Supabase write fails (e.g., offline), the local change is kept in `localStorage`, flagged with `pending_sync: true`, queued in `alittihadia_pending_sync_v1` (`storageService.enqueuePendingSync`), and a Toast notification is shown to the user.
  - When `useOnlineStatus()` detects the browser is back online, `AppContext.tsx` automatically flushes `parcelService.flushPendingSync()`, `tripService.flushPendingSync()`, and `cashService.flushPendingSync()`, clears `pending_sync`, and refreshes workspace state.
  - On login / workspace load, `AppContext.tsx` loads `stations`, `currencies`, `workspace_members`, `station_workers`, `join_requests`, `workspace_collaborations`, `subscriptions`, `parcels`, `trips`, `remembered_drivers`, `remembered_vehicles`, `transactions`, and `audit_logs` from Supabase and subscribes to a Realtime channel (`workspace-sync-${wsId}`) on `parcels`, `trips`, `trip_parcels`, `transactions`, `stations`, `join_requests`, and `workspace_collaborations`, unsubscribing cleanly on `logout()`.
- **TypeScript-to-SQL Column Mapping & Unmapped Fields Report:**
  - **`Parcel` (`public.parcels`):**
    - Mapped columns: `id`, `workspace_id`, `parcel_number`, `tracking_code`, `origin_station_id`, `destination_station_id`, `sender_name`, `sender_phone`, `receiver_name`, `receiver_phone`, `route`, `description`, `category`, `items_count`, `weight_kg`, `declared_value`, `amount_due`, `payer`, `amount_paid`, `currency`, `status`, `condition`, `condition_notes`, `current_trip_id`, `driver_name`, `vehicle_plate`, `status_history`, `payment_history`, `notes`, `delivered_to`, `delivered_at`, `created_by`, `created_at`, `updated_at`.
    - Computed / UI-only fields in TypeScript `Parcel` with no dedicated SQL column (preserved/reconstructed automatically in `mapSupabaseRowToParcel`):
      - `team_id` → alias of `workspace_id`
      - `origin_station_name`, `destination_station_name` → resolved from `stations` by `origin_station_id` / `destination_station_id`
      - `shipping_fee` → alias of `amount_due`
      - `cod_amount` → computed as `payer === 'receiver' ? Math.max(0, amount_due - amount_paid) : 0`
      - `payment_status` → computed from `amount_paid`, `amount_due`, and `payer` (`paid` | `partial` | `cod` | `unpaid`)
      - `creator_name` → resolved from `status_history[0].changed_by_name`
      - `is_collaborator_data`, `is_demo`, `pending_sync` → runtime client flags
  - **`Trip` (`public.trips` & `public.trip_parcels`):**
    - Mapped columns: `id`, `workspace_id`, `trip_number`, `trip_code`, `driver_name`, `driver_phone`, `vehicle_plate`, `origin_station_id`, `destination_station_id`, `status`, `parcels_count`, `loaded_parcel_ids`, `received_parcel_ids`, `departure_time`, `arrival_time`, `closed_at`, `closed_by`, `close_reason`, `notes`, `created_by`, `created_at`, `updated_at`.
    - Computed / UI-only fields in TypeScript `Trip` with no dedicated SQL column:
      - `origin_station_name`, `destination_station_name` → resolved from `stations`
      - `creator_name`, `closed_by_name`, `is_demo`, `pending_sync` → runtime/UI fields
  - **`Transaction` (`public.transactions`) & `AuditLogEntry` (`public.audit_logs`):**
    - Mapped columns (`transactions`): `id`, `workspace_id`, `station_id`, `created_by`, `type`, `amount`, `currency`, `person_name`, `person_phone` (mapped bidirectional with TS `phone_number` / `person_phone`), `reason`, `photo_url`, `status`, `note`, `parcel_id`, `edit_history`, `created_at`, `updated_at`.
    - Computed / UI-only fields in TypeScript `Transaction`:
      - `team_id` → alias of `workspace_id`
      - `station_name` → resolved from `stations`
      - `creator_name` → derived from `person_name` / member profile
      - `cancelled_by_name`, `cancelled_at`, `cancel_reason`, `deleted_at` → reconstructed from the last `CANCEL` entry in `edit_history` JSONB
      - `is_collaborator_data`, `is_demo`, `pending_sync` → runtime client flags
    - Mapped columns (`audit_logs`): `id`, `workspace_id`, `user_id`, `action`, `table_name`, `record_id`, `reason`, `old_data`, `new_data` (stores `_audit_user_name` inside `new_data` JSONB so `user_name` is preserved round-trip), `created_at`.

---

## 9. Environment Setup & How to Apply the Supabase Schema

### Environment Variables (`.env` / `.env.example`)
```env
# Supabase Configuration (Optional - app works offline in localStorage if omitted):
# Get these from your Supabase Project Settings -> API
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-public-key"

# WhatsApp Number for Paywall & Renewals (with country code, e.g. 2126XXXXXXXX for Morocco or 222XXXXXXXX for Mauritania)
VITE_ADMIN_WHATSAPP="212618961387"
```

### Exact Steps to Apply the Schema in Supabase SQL Editor
1. **Open Supabase Dashboard:** Go to your Supabase project → **Authentication → Providers → Email** and **disable "Confirm email"** (so phone+password accounts mapped to `<phone>@alittihadia.app` can sign in immediately without email verification).
2. **Open SQL Editor:** Go to **SQL Editor → New query**.
3. **Run `supabase/schema.sql` in a single execution:** Copy the entire contents of `supabase/schema.sql` (or copy it directly from inside the app via **الإعدادات → كود قاعدة البيانات SQL**) and click **Run**.
   - The script executes in the following order automatically and is 100% idempotent (can be re-run safely on new or existing databases):
     1. **Extensions & Core Tables (Section 1):** Enables `pgcrypto` and creates/updates all 18 tables (`profiles`, `platform_owners`, `workspaces` including `last_parcel_number`, `workspace_members`, `join_requests`, `workspace_collaborations`, `stations`, `station_workers`, `station_balances`, `currencies`, `parcels`, `trips`, `trip_parcels`, `remembered_drivers`, `remembered_vehicles`, `transactions`, `subscriptions`, `audit_logs`, `password_reset_requests`).
     2. **Indexes (Section 2):** Creates all lookup and foreign-key indexes with `IF NOT EXISTS`.
     3. **Security Helper Functions (Section 3):** Creates `is_platform_owner()`, `is_workspace_admin()`, `is_workspace_member()`, `get_worker_station_id()`, `is_workspace_subscription_active()`, and `is_collaboration_shared()`.
     4. **Row-Level Security Policies (Section 4):** Enables RLS on all tables, drops any existing policies idempotently (`DROP POLICY IF EXISTS`), and creates all workspace/station isolation policies and `storage.objects` policies for the `receipts` bucket.
     5. **Triggers (Section 5):** Creates `trg_update_station_balance` (maintaining `station_balances` on transaction insert, amount update, and cancellation) and `on_auth_user_created` (auto-creating `profiles` on signup).
     6. **RPC Functions (Section 6):** Creates `fn_generate_alnum_code`, `rpc_create_workspace`, `rpc_submit_join_request`, `rpc_approve_join_request`, `rpc_reject_join_request`, `rpc_renew_invite_code`, `rpc_send_collaboration_request`, `rpc_respond_to_collaboration`, `rpc_update_sharing_settings`, and `rpc_next_parcel_number`, and grants `EXECUTE` to `authenticated`.
     7. **Realtime Publication (Section 7):** Adds `parcels`, `trips`, `trip_parcels`, `transactions`, `station_balances`, `stations`, `workspace_members`, `join_requests`, and `workspace_collaborations` to the `supabase_realtime` publication.
4. **(Optional) Grant Platform Super-Admin Access:** After registering your owner account in the app, run the following in the Supabase SQL Editor to make your account a Platform Owner:
   ```sql
   INSERT INTO public.platform_owners (user_id, notes)
   VALUES ('<YOUR_AUTH_USER_UUID>', 'المالك الرئيسي للمنصة')
   ON CONFLICT (user_id) DO NOTHING;
   ```

### How to Run Locally
1. **Install dependencies:**
   ```bash
   npm install
   ```
2. **Start development server (Port 3000):**
   ```bash
   npm run dev
   ```
3. **Type-check / Lint:**
   ```bash
   npm run lint
   ```
4. **Build for production:**
   ```bash
   npm run build
   ```

---

## 10. Next Steps

1. **Add Public Customer Tracking Route (Optional Enhancement):** Support `?track=<tracking_code>` in `App.tsx` with a read-only public RPC so external customers can view the 4-stage timeline (`فالمحطة`, `فالطريق`, `وصلات`, `تسلمات`) for their parcel without logging in.
2. **Receipt Image Upload to Supabase Storage Bucket:** Optionally upload compressed receipt images from `NewVoucherModal.tsx` directly to the `receipts` bucket (`storage.from('receipts').upload(...)`) instead of storing base64 data URLs in `transactions.photo_url`.

