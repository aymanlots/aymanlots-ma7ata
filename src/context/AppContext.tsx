import React, { 
  createContext, 
  useContext, 
  useState, 
  useEffect, 
  ReactNode, 
  useMemo,
  useRef,
  useCallback
} from 'react';
import { 
  Profile, 
  Workspace,
  Team,
  WorkspaceMember,
  TeamMember,
  JoinRequest,
  WorkspaceCollaboration,
  Station, 
  StationWorker, 
  Currency, 
  Transaction, 
  TransactionType,
  Parcel,
  ParcelStatus,
  PaymentStatus,
  ParcelPayer,
  ParcelStatusHistoryEntry,
  ParcelPaymentEntry,
  ParcelCondition,
  Trip,
  TripStatus,
  RememberedDriver,
  RememberedVehicle,
  PasswordResetRequest,
  Subscription, 
  AuditLogEntry, 
  UserRole,
  Language,
  MoneyTransfer
} from '../types/database';
import { translations } from '../lib/i18n';
import { parcelService, mapSupabaseRowToParcel } from '../services/parcelService';
import { tripService, mapSupabaseRowToTrip } from '../services/tripService';
import { cashService, mapSupabaseRowToTransaction } from '../services/cashService';
import { storageService, generateUUID, isValidUUID } from '../services/storageService';
import { firebaseSyncService } from '../services/firebaseSyncService';
import { matchesTrackingCode, extractTrackingQueryCode, formatTrackingCodeNumeric } from '../utils/logisticsFeatures';
import { auth as firebaseAuth, googleProvider } from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { 
  getSupabaseClient, 
  isSupabaseConfigured, 
  phoneToEmail, 
  cleanPhoneNumber,
  generateTemporaryPassword
} from '../lib/supabase';
import { PLATFORM_CONFIG, DEMO_MODE } from '../config/constants';
import { generateWorkspaceDemoData } from '../utils/demoData';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

// Helper to generate 6-character short workspace ID
const generateShortId = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
};

// Helper to generate 8-character random invite code
const generateInviteCode = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let res = '';
  for (let i = 0; i < 8; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
};

// Base cross-border stations (starts with ZERO balance)
const getInitialStations = (workspaceId: string): Station[] => [
  {
    id: `sta-${workspaceId}-dakhla`,
    workspace_id: workspaceId,
    team_id: workspaceId,
    name: 'محطة الداخلة الرئيسية',
    city: 'الداخلة',
    country: 'MA',
    owner_id: null,
    is_active: true,
    phone: '+212 528 890000',
    address: 'شارع الولاء، ميناء الداخلة، المملكة المغربية',
    created_at: new Date().toISOString(),
    balances: { MAD: 0, MRU: 0 },
  },
  {
    id: `sta-${workspaceId}-nouadhibou`,
    workspace_id: workspaceId,
    team_id: workspaceId,
    name: 'محطة نواذيبو الدولية',
    city: 'نواذيبو',
    country: 'MR',
    owner_id: null,
    is_active: true,
    phone: '+222 4574 0000',
    address: 'حي كانصادو، طريق الميناء المستقل، الجمهورية الإسلامية الموريتانية',
    created_at: new Date().toISOString(),
    balances: { MAD: 0, MRU: 0 },
  },
];

const getInitialCurrencies = (workspaceId: string): Currency[] => [
  {
    id: `curr-${workspaceId}-mad`,
    workspace_id: workspaceId,
    team_id: workspaceId,
    code: 'MAD',
    label_ar: 'درهم مغربي',
    label_fr: 'Dirham Marocain',
    symbol: 'د.م.',
    is_active: true,
    rate_to_mad: 1.0,
    created_at: new Date().toISOString(),
  },
  {
    id: `curr-${workspaceId}-mru`,
    workspace_id: workspaceId,
    team_id: workspaceId,
    code: 'MRU',
    label_ar: 'أوقية موريتانية',
    label_fr: 'Ouguiya Mauritanienne',
    symbol: 'أ.م.',
    is_active: true,
    rate_to_mad: 0.263,
    created_at: new Date().toISOString(),
  },
];

interface AppContextType {
  // Authentication & Profile
  currentUser: Profile | null;
  userRole: UserRole;
  isLoggedIn: boolean;
  registerUser: (data: {
    name: string;
    phone: string;
    whatsapp_number: string;
    password?: string;
    isOwner: boolean;
    teamInviteCode?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  loginWithCredentials: (phone: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => void;

  // Workspace (Multi-Admin Isolation)
  currentWorkspace: Workspace | null;
  currentTeam: Workspace | null; // compatibility alias
  workspaceMembers: WorkspaceMember[];
  teamMembers: WorkspaceMember[]; // compatibility alias
  stationWorkers: StationWorker[];
  stations: Station[];
  selectedStationId: string | null;
  setSelectedStationId: (id: string | null) => void;
  userAssignedStationId: string | null;

  // Join Requests (Workers requesting to join)
  joinRequests: JoinRequest[];
  approveJoinRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  rejectJoinRequest: (requestId: string) => Promise<{ success: boolean; error?: string }>;
  renewInviteCode: () => Promise<string>;
  regenerateInviteCode: () => Promise<string>;

  // Admin-to-Admin Collaborations (Optional Sharing)
  collaborations: WorkspaceCollaboration[];
  sendCollaborationRequest: (targetShortId: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  respondToCollaboration: (collabId: string, accept: boolean) => Promise<{ success: boolean; error?: string; message?: string }>;
  updateSharingSettings: (collabId: string, shareCash: boolean, shareParcels: boolean, shareReports: boolean) => Promise<{ success: boolean; error?: string }>;

  // Dual Currency & Exchange Rate
  currencies: Currency[];
  stationBalances: Record<string, Record<string, number>>;
  exchangeRate: number;
  setExchangeRate: (rate: number) => void;
  convertCurrency: (amount: number, from: string, to: string) => number;
  hideAmounts: boolean;
  toggleHideAmounts: () => void;
  formatAmount: (value: number | string, currency?: string, sign?: string) => string;

  // Transactions & Cash Register (Strictly 0 Initial Fake Data)
  transactions: Transaction[];
  auditLogs: AuditLogEntry[];
  createTransaction: (data: {
    station_id: string;
    type: TransactionType;
    amount: number;
    currency: string;
    phone_number?: string;
    reason?: string;
    photo_url?: string;
    note?: string;
    parcel_id?: string;
    hawala_meta?: MoneyTransfer | null;
    hawala_transfer_id?: string | null;
  }) => Promise<{ success: boolean; error?: string; transaction?: Transaction }>;
  updateTransaction: (id: string, updates: Partial<Transaction>, editReason?: string) => Promise<{ success: boolean; error?: string }>;
  cancelTransaction: (id: string, reason: string) => Promise<{ success: boolean; error?: string }>;
  deleteTransaction: (id: string) => Promise<{ success: boolean; error?: string }>;
  deleteAuditLog: (id: string) => void;
  clearAuditLogs: () => void;
  executeCurrencyExchange: (params: {
    stationId: string;
    fromCurrency: 'MAD' | 'MRU';
    toCurrency: 'MAD' | 'MRU';
    fromAmount: number;
    toAmount: number;
    rate: number;
    customerName?: string;
    customerPhone?: string;
    note?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  moneyTransfers: MoneyTransfer[];
  createMoneyTransfer: (params: {
    origin_station_id: string;
    destination_station_id: string;
    sender_name: string;
    sender_phone: string;
    receiver_name: string;
    receiver_phone: string;
    send_amount: number;
    send_currency: 'MAD' | 'MRU';
    payout_amount: number;
    payout_currency: 'MAD' | 'MRU';
    exchange_rate: number;
    commission_amount: number;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string; transfer?: MoneyTransfer }>;
  payoutMoneyTransfer: (transferId: string) => Promise<{ success: boolean; error?: string }>;
  
  // Parcels Module (Strictly 0 Initial Fake Data)
  parcels: Parcel[];
  createParcel: (data: {
    origin_station_id: string;
    destination_station_id: string;
    sender_name: string;
    sender_phone: string;
    receiver_name: string;
    receiver_phone: string;
    route?: string;
    description: string;
    category?: string;
    items_count?: number;
    weight_kg?: number;
    declared_value?: number;
    amount_due?: number;
    shipping_fee?: number;
    payer?: ParcelPayer;
    amount_paid?: number;
    cod_amount?: number;
    currency: string;
    payment_status?: PaymentStatus;
    notes?: string;
    condition?: ParcelCondition;
    condition_notes?: string;
  }) => Promise<{ success: boolean; error?: string; parcel?: Parcel }>;
  updateParcelStatus: (
    id: string, 
    status: ParcelStatus, 
    notesOrMeta?: { delivered_to?: string; notes?: string; condition?: ParcelCondition; condition_notes?: string } | string,
    deliveredTo?: string
  ) => Promise<{ success: boolean; error?: string }>;
  recordParcelPayment: (
    parcelId: string, 
    amount: number, 
    paidBy: string, 
    note?: string
  ) => Promise<{ success: boolean; error?: string }>;
  updateParcel: (id: string, updates: Partial<Parcel>) => Promise<{ success: boolean; error?: string }>;
  deleteParcel: (id: string) => Promise<{ success: boolean; error?: string }>;
  initiateParcelReturn: (
    parcelId: string,
    data: { returnReason: string; returnNotes?: string; returnFee?: number }
  ) => Promise<{ success: boolean; error?: string }>;
  handoverReturnedParcelToSender: (
    parcelId: string,
    data: { senderReceivedByName: string; returnFeePaid?: number; notes?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  updateUnclaimedDaysThreshold: (days: number) => Promise<{ success: boolean; error?: string }>;
  getParcelByTrackingCode: (code: string) => Parcel | undefined;

  // Trips Module (الرحلات والديسباتش)
  trips: Trip[];
  rememberedDrivers: RememberedDriver[];
  rememberedPlates: RememberedVehicle[];
  removeRememberedDriver: (name: string) => void;
  removeRememberedPlate: (plate: string) => void;
  deleteTrip: (tripId: string) => Promise<{ success: boolean; error?: string }>;
  createTrip: (params: {
    driverName: string;
    driverPhone?: string;
    vehiclePlate: string;
    originStationId: string;
    destinationStationId: string;
    notes?: string;
    fuelExpense?: number;
    tollExpense?: number;
    driverCommission?: number;
    otherExpense?: number;
    expenseCurrency?: string;
    deductFromCashbox?: boolean;
  }) => Promise<{ success: boolean; error?: string; trip?: Trip }>;
  updateTripExpenses: (
    tripId: string,
    expenses: {
      fuelExpense: number;
      tollExpense: number;
      driverCommission: number;
      otherExpense: number;
      expenseCurrency: string;
      deductFromCashbox?: boolean;
    }
  ) => Promise<{ success: boolean; error?: string; trip?: Trip }>;
  loadParcelToTrip: (
    tripId: string,
    parcelIdentifier: string
  ) => Promise<{ success: boolean; error?: string; warning?: string; trip?: Trip; parcel?: Parcel }>;
  unloadParcelFromTrip: (
    tripId: string,
    parcelId: string
  ) => Promise<{ success: boolean; error?: string; trip?: Trip }>;
  departTrip: (
    tripId: string
  ) => Promise<{ success: boolean; error?: string; trip?: Trip }>;
  receiveParcelAtDestination: (
    tripId: string,
    parcelIdentifier: string,
    condition: ParcelCondition,
    conditionNotes?: string
  ) => Promise<{ success: boolean; error?: string; trip?: Trip; parcel?: Parcel; allScanned?: boolean }>;
  closeTrip: (
    tripId: string,
    closeReason?: string
  ) => Promise<{ success: boolean; error?: string; trip?: Trip }>;

  // Admin Management & Custom Branding & Public Tracking
  updateWorkspaceBranding: (branding: {
    custom_brand_name?: string;
    custom_brand_subtitle?: string;
    custom_brand_phone?: string;
    custom_brand_logo_url?: string;
    customBrandName?: string;
    customBrandSubtitle?: string;
    customBrandPhone?: string;
    customBrandLogoUrl?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  fetchPublicParcelTracking: (code: string) => Promise<{ success: boolean; error?: string; parcel?: Partial<Parcel> & { workspace_name?: string } }>;
  addBalanceAdjustment: (stationId: string, currency: string, amount: number, note: string) => Promise<{ success: boolean; error?: string }>;
  createTeam: (name: string) => Promise<{ success: boolean; error?: string }>;
  joinTeam: (inviteCode: string) => Promise<{ success: boolean; error?: string }>;
  addStation: (
    nameOrData: string | { name: string; city: string; country?: 'MA' | 'MR'; phone?: string; address?: string; currency?: string; default_currency?: string },
    city?: string,
    country?: 'MA' | 'MR',
    phone?: string,
    address?: string,
    currency?: string
  ) => Promise<{ success: boolean; error?: string; station?: Station }>;
  updateStation: (
    stationId: string, 
    updates: { name?: string; city?: string; country?: 'MA' | 'MR'; phone?: string; address?: string; currency?: string; default_currency?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  deleteStation: (stationId: string) => Promise<{ success: boolean; error?: string }>;
  addWorkerByOwner: (name: string, phone: string, stationId: string, role?: UserRole) => Promise<{ success: boolean; error?: string; temporaryPassword?: string }>;
  assignWorkerToStation: (stationId: string, userId: string) => Promise<{ success: boolean; error?: string }>;
  removeWorkerFromTeam: (userId: string) => Promise<{ success: boolean }>;
  addCurrency: (code: string, label_ar: string, symbol: string, label_fr?: string, rate?: number) => Promise<{ success: boolean }>;

  // Platform Owner & Multi-Workspace Controls
  allWorkspaces: Workspace[];
  allSubscriptions: Subscription[];
  refreshPlatformWorkspaces: () => Promise<void>;
  updateWorkspaceSubscription: (workspaceId: string, action: 'activate' | 'extend' | 'suspend', months?: number) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceNotes: (workspaceId: string, notes: string) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceQuotas: (workspaceId: string, quotas: { max_workers: number; max_stations: number; max_workers_per_station?: number; max_collaborations: number; plan_name?: string; plan_tier?: 'plan_1_full' | 'plan_2_two_stations' }) => Promise<{ success: boolean; error?: string }>;
  switchWorkspacePlan: (planTier: 'plan_1_full' | 'plan_2_two_stations', workspaceId?: string) => Promise<{ success: boolean; error?: string }>;

  // Password Reset System (Worker to Admin, Automatic WhatsApp Recovery for Manager) & Contact Update
  passwordResetRequests: PasswordResetRequest[];
  submitPasswordResetRequest: (data: {
    phone: string;
    whatsapp?: string;
    accountType: 'worker' | 'admin';
    userName?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
    temporaryPassword?: string;
    registeredWhatsapp?: string;
    userName?: string;
    sentViaApi?: boolean;
  }>;
  resolvePasswordResetRequest: (requestId: string, approved: boolean, tempPassword?: string) => Promise<{ success: boolean; error?: string; temporaryPassword?: string }>;
  resetMemberPassword: (targetUserId: string, targetPhone?: string) => Promise<{ success: boolean; error?: string; temporaryPassword?: string }>;
  changeMandatoryPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  updateUserContactNumbers: (newPhone: string, newWhatsapp?: string, newName?: string) => Promise<{ success: boolean; error?: string }>;

  // Language & i18n
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof translations.ar) => string;

  // Subscription / Paywall
  subscription: Subscription | null;
  isSubscriptionExpired: boolean;
  daysUntilExpiry: number;
  secondsUntilExpiry: number;
  subscriptionRemainingLabel: string;
  extendSubscription: (days?: number) => void;
  startFiveMinuteSubscriptionTest: () => void;

  // Feedback & Status
  isSupabaseLive: boolean;
  hasDemoData: boolean;
  deleteDemoData: () => void;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  resetAllDataToZero: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isSupabaseLive = isSupabaseConfigured();
  // عندما يكون اتصال Supabase مفعلاً، يُعامل DEMO_MODE كـ false تلقائياً
  const isEffectiveDemoMode = DEMO_MODE && !isSupabaseLive;

  // Language State - Strictly Modern Standard Arabic (العربية الفصحى)
  const language: Language = 'ar';
  const setLanguage = (_lang: Language) => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  };
  const t = (key: keyof typeof translations.ar) => {
    return translations.ar[key] || (key as string);
  };

  // Official Exchange Rate: 1 MAD = 3.80 MRU (0.263 MAD per MRU)
  const [exchangeRate, setExchangeRateState] = useState<number>(() => {
    const saved = localStorage.getItem('ittihadiya_rate');
    return saved ? parseFloat(saved) : 3.80;
  });

  const setExchangeRate = (rate: number) => {
    setExchangeRateState(rate);
    localStorage.setItem('ittihadiya_rate', rate.toString());
  };

  const convertCurrency = (amount: number, from: string, to: string): number => {
    if (from === to) return amount;
    if (from === 'MAD' && to === 'MRU') {
      return Math.round(amount * exchangeRate * 100) / 100;
    }
    if (from === 'MRU' && to === 'MAD') {
      return Math.round((amount / exchangeRate) * 100) / 100;
    }
    return amount;
  };

  // Hide Financial Amounts State (Persisted in localStorage, default: false / visible)
  const [hideAmounts, setHideAmounts] = useState<boolean>(() => {
    return localStorage.getItem('ittihadiya_hide_amounts') === 'true';
  });

  const toggleHideAmounts = useCallback(() => {
    setHideAmounts((prev) => {
      const next = !prev;
      localStorage.setItem('ittihadiya_hide_amounts', String(next));
      return next;
    });
  }, []);

  const formatAmount = useCallback(
    (value: number | string, currency?: string, sign: string = ''): string => {
      if (hideAmounts) {
        return `••••${currency ? ` ${currency}` : ''}`;
      }
      const numStr =
        typeof value === 'number'
          ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
          : String(value);
      return `${sign}${numStr}${currency ? ` ${currency}` : ''}`;
    },
    [hideAmounts]
  );

  // 1. Current User Profile
  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    const saved = localStorage.getItem('aman_user');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.id?.includes('usr-owner-001')) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  // 2. Current Workspace (Multi-Admin Isolation with 6-char Short ID)
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => {
    const saved = localStorage.getItem('aman_workspace') || localStorage.getItem('aman_team');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      if (parsed?.id?.includes('team-aman-001')) return null;
      // Ensure short_id exists
      if (!parsed.short_id) {
        parsed.short_id = generateShortId();
      }
      return parsed;
    } catch {
      return null;
    }
  });

  // 3. Workspace Members
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>(() => {
    const saved = localStorage.getItem('aman_workspace_members') || localStorage.getItem('aman_members');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // 4. Join Requests (Workers wanting to join workspace)
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>(() => {
    const saved = localStorage.getItem('aman_join_requests');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // 5. Admin Collaborations (Optional Sharing between Workspaces)
  const [collaborations, setCollaborations] = useState<WorkspaceCollaboration[]>(() => {
    const saved = localStorage.getItem('aman_collaborations');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // 6. Stations (Starts empty for new accounts so the manager names their own stations)
  const [stations, setStations] = useState<Station[]>(() => {
    const saved = localStorage.getItem('aman_stations');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  // 7. Station Workers
  const [stationWorkers, setStationWorkers] = useState<StationWorker[]>(() => {
    const saved = localStorage.getItem('aman_station_workers');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  // 8. Currencies
  const [currencies, setCurrencies] = useState<Currency[]>(() => {
    const saved = localStorage.getItem('aman_currencies');
    return saved ? JSON.parse(saved) : getInitialCurrencies(currentWorkspace?.id || 'ws-default');
  });

  // 9. All Transactions (Filtered by workspace + collaborations)
  const [allTransactions, setAllTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('aman_transactions');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(t => t.id?.includes('tx-001-init'))) return [];
      return parsed;
    } catch {
      return [];
    }
  });

  // 10. All Parcels (Filtered by workspace + collaborations)
  const [allParcels, setAllParcels] = useState<Parcel[]>(() => {
    const saved = localStorage.getItem('ittihadiya_parcels');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.some(p => p.id?.includes('pcl-001'))) return [];
      return parsed;
    } catch {
      return [];
    }
  });

  // 10.b All Trips & Dispatch
  const [allTrips, setAllTrips] = useState<Trip[]>(() => {
    return storageService.get<Trip[]>('TRIPS', []);
  });

  const [rememberedDrivers, setRememberedDrivers] = useState<RememberedDriver[]>(() => {
    return tripService.getRememberedDrivers();
  });

  const [rememberedPlates, setRememberedPlates] = useState<RememberedVehicle[]>(() => {
    return tripService.getRememberedPlates();
  });

  // 11. Subscription (Strictly linked to Manager's Workspace)
  const [subscription, setSubscription] = useState<Subscription | null>(() => {
    const wsId = currentWorkspace?.id || 'ws-default';
    const wsEndDate =
      currentWorkspace?.subscription_end_date ||
      (currentWorkspace?.created_at
        ? new Date(new Date(currentWorkspace.created_at).getTime() + 30 * 86400000).toISOString()
        : undefined);
    const saved = localStorage.getItem('aman_subscription');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Subscription;
        if (!currentWorkspace || parsed.workspace_id === wsId || parsed.team_id === wsId) {
          return {
            ...parsed,
            workspace_id: wsId,
            team_id: wsId,
            status: currentWorkspace?.subscription_status || parsed.status || 'active',
            end_date: currentWorkspace?.subscription_end_date || parsed.end_date,
          };
        }
      } catch {}
    }
    return {
      id: `sub-${wsId}`,
      workspace_id: wsId,
      team_id: wsId,
      status: currentWorkspace?.subscription_status || 'active',
      start_date: currentWorkspace?.created_at || new Date().toISOString(),
      end_date: wsEndDate || new Date(Date.now() + 30 * 86400000).toISOString(),
      created_at: currentWorkspace?.created_at || new Date().toISOString(),
    };
  });

  // 12. Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => {
    const saved = localStorage.getItem('aman_audit_logs');
    return saved ? JSON.parse(saved) : [];
  });

  // 13. All Workspaces (Platform Owner View)
  const [allWorkspacesState, setAllWorkspacesState] = useState<Workspace[]>(() => {
    const saved = localStorage.getItem('alittihadia_all_workspaces');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return currentWorkspace ? [currentWorkspace] : [];
  });

  // 14. All Subscriptions (Platform Owner View)
  const [allSubscriptionsState, setAllSubscriptionsState] = useState<Subscription[]>(() => {
    const saved = localStorage.getItem('alittihadia_all_subscriptions');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
    return subscription ? [subscription] : [];
  });

  // 15. Password Reset Requests
  const [passwordResetRequestsState, setPasswordResetRequestsState] = useState<PasswordResetRequest[]>(() => {
    const saved = localStorage.getItem('alittihadia_password_reset_requests');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch {}
    }
    return [];
  });

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [isPlatformOwner, setIsPlatformOwner] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const isOnline = useOnlineStatus();
  const realtimeChannelRef = useRef<any>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load all workspaces for Platform Owner from server-side RPC
  const refreshPlatformWorkspaces = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const { data: rpcRes, error } = await supabase.rpc('rpc_platform_list_workspaces');
      if (!error && rpcRes?.success && Array.isArray(rpcRes.workspaces)) {
        const wsList: Workspace[] = [];
        const subList: Subscription[] = Array.isArray(rpcRes.subscriptions)
          ? rpcRes.subscriptions.map((s: any) => ({ ...s, team_id: s.workspace_id }))
          : [];
        rpcRes.workspaces.forEach((item: any) => {
          wsList.push({
            id: item.id,
            short_id: item.short_id,
            name: item.name,
            invite_code: '',
            created_by: item.created_by,
            created_at: item.created_at,
            owner_phone: item.owner_phone,
            owner_whatsapp: item.owner_whatsapp,
            admin_notes: item.admin_notes,
            plan_name: item.plan_name || 'الباقة القياسية',
            max_workers: item.max_workers ?? 10,
            max_stations: item.max_stations ?? 5,
            max_collaborations: item.max_collaborations ?? 5,
            unclaimed_days_threshold: item.unclaimed_days_threshold ?? 7,
            workers_count: item.workers_count ?? 0,
            stations_count: item.stations_count ?? 0,
            collaborations_count: item.collaborations_count ?? 0,
          });
          if (item.subscription && !subList.some(s => s.workspace_id === item.id)) {
            subList.push({
              id: item.subscription.id || `sub-${item.id}`,
              workspace_id: item.id,
              team_id: item.id,
              status: item.subscription.status || 'active',
              plan_name: item.subscription.plan_name || item.plan_name || 'الباقة القياسية',
              start_date: item.subscription.start_date || item.created_at,
              end_date: item.subscription.end_date || item.created_at,
              is_trial: item.subscription.is_trial ?? false,
              created_at: item.created_at,
            });
          }
        });
        setAllWorkspacesState(wsList);
        setAllSubscriptionsState(subList);
      }
    } catch (err) {
      console.warn('Error refreshing platform workspaces:', err);
    }
  }, []);

  // Load workspace data from Supabase when configured and logged in
  const loadWorkspaceFromCloud = useCallback(async (wsId: string, userId?: string) => {
    if (!isSupabaseConfigured() || !isValidUUID(wsId)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      // 1. Check platform_owners exclusively via server-side RPC (never localStorage)
      localStorage.removeItem('alittihadia_platform_owners');
      if (userId && isValidUUID(userId)) {
        const { data: isOwnerRpc, error: poErr } = await supabase.rpc('rpc_check_is_platform_owner');
        const ownerVerified = typeof isOwnerRpc === 'boolean'
          ? isOwnerRpc
          : Boolean(isOwnerRpc?.is_platform_owner);
        if (!poErr && ownerVerified) {
          setIsPlatformOwner(true);
          await refreshPlatformWorkspaces();
        } else {
          setIsPlatformOwner(false);
        }
      }

      // 1.b Refresh workspace record itself (for quotas & settings) + merge local custom branding
      const { data: wsRow } = await supabase
        .from('workspaces')
        .select('*')
        .eq('id', wsId)
        .maybeSingle();
      let savedBranding: Record<string, any> = {};
      try {
        savedBranding = JSON.parse(localStorage.getItem(`alittihadia_branding_${wsId}`) || '{}');
      } catch {}
      if (wsRow) {
        setCurrentWorkspace(prev => {
          const merged = prev ? { ...prev, ...wsRow } : wsRow;
          return {
            ...merged,
            custom_brand_name: wsRow.custom_brand_name || savedBranding.custom_brand_name || merged.custom_brand_name,
            custom_brand_subtitle: wsRow.custom_brand_subtitle || savedBranding.custom_brand_subtitle || merged.custom_brand_subtitle,
            custom_brand_phone: wsRow.custom_brand_phone || savedBranding.custom_brand_phone || merged.custom_brand_phone,
            custom_brand_logo_url: wsRow.custom_brand_logo_url || savedBranding.custom_brand_logo_url || merged.custom_brand_logo_url,
          };
        });
      }

      // 2. Load stations (and merge saved station currencies)
      let savedStationCurrencies: Record<string, string> = {};
      try {
        savedStationCurrencies = JSON.parse(localStorage.getItem(`alittihadia_station_currencies_${wsId}`) || '{}');
      } catch {}

      const { data: stRows } = await supabase
        .from('stations')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: true });

      let loadedStations: Station[] = stRows
        ? stRows.map((s: any) => ({
            ...s,
            team_id: s.workspace_id,
            currency: s.currency || savedStationCurrencies[s.id] || (s.country === 'MR' ? 'MRU' : 'MAD'),
          }))
        : stations;

      // If this workspace hasn't created user stations yet and only has the 2 RPC-seeded default Dakhla/Nouadhibou stations, clean them up
      const hasUserCreatedStation = localStorage.getItem(`alittihadia_user_created_station_${wsId}`) === 'true';
      const isDefaultSeededPair =
        !hasUserCreatedStation &&
        loadedStations.length === 2 &&
        loadedStations.every(
          s =>
            s.name === 'محطة الداخلة الرئيسية' ||
            s.name === 'محطة نواذيبو الدولية' ||
            (s.city === 'الداخلة' && s.phone === '+212 528 890000') ||
            (s.city === 'نواذيبو' && s.phone === '+222 4574 0000')
        );

      if (isDefaultSeededPair) {
        await supabase.from('stations').delete().eq('workspace_id', wsId);
        loadedStations = [];
        setStations([]);
        setSelectedStationId(null);
        localStorage.setItem(`alittihadia_guided_tour_pending_${wsId}`, 'true');
      } else if (stRows) {
        setStations(loadedStations);
      }

      // 3. Load currencies
      const { data: currRows } = await supabase
        .from('currencies')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: true });
      if (currRows && currRows.length > 0) {
        setCurrencies(currRows.map((c: any) => ({ ...c, team_id: c.workspace_id })));
      }

      // 4. Load workspace members + profiles
      const { data: memRows } = await supabase
        .from('workspace_members')
        .select('*, profile:profiles(*)')
        .eq('workspace_id', wsId);
      const loadedMembers: WorkspaceMember[] = memRows && memRows.length > 0
        ? memRows.map((m: any) => ({
            id: m.id,
            workspace_id: m.workspace_id,
            user_id: m.user_id,
            role: m.role,
            status: m.status,
            joined_at: m.joined_at,
            profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
          }))
        : workspaceMembers;
      if (memRows && memRows.length > 0) {
        setWorkspaceMembers(loadedMembers);
      }

      // 5. Load station_workers
      const { data: swRows } = await supabase
        .from('station_workers')
        .select('*, profile:profiles(*)')
        .eq('workspace_id', wsId);
      if (swRows) {
        setStationWorkers(swRows.map((sw: any) => ({
          id: sw.id,
          station_id: sw.station_id,
          workspace_id: sw.workspace_id,
          user_id: sw.user_id,
          assigned_at: sw.assigned_at,
          profile: Array.isArray(sw.profile) ? sw.profile[0] : sw.profile,
        })));
      }

      // 6. Load join_requests
      const { data: jrRows } = await supabase
        .from('join_requests')
        .select('*')
        .eq('workspace_id', wsId)
        .order('created_at', { ascending: false });
      if (jrRows) {
        setJoinRequests(jrRows as JoinRequest[]);
      }

      // 7. Load workspace_collaborations
      const { data: colRows } = await supabase
        .from('workspace_collaborations')
        .select('*')
        .or(`requester_workspace_id.eq.${wsId},target_workspace_id.eq.${wsId}`)
        .order('created_at', { ascending: false });
      if (colRows) {
        setCollaborations(colRows as WorkspaceCollaboration[]);
      }

      // 8. Load subscription
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('workspace_id', wsId)
        .maybeSingle();
      if (subRow) {
        setSubscription({ ...subRow, team_id: subRow.workspace_id } as Subscription);
      }

      // 9. Build profiles lookup map for creator names
      const profilesMap: Record<string, string> = {};
      loadedMembers.forEach(m => {
        if (m.user_id && m.profile?.name) {
          profilesMap[m.user_id] = m.profile.name;
        }
      });

      // 10. Load parcels (preserving any local unsynced pending_sync items)
      const cloudParcels = await parcelService.fetchFromCloud(wsId, loadedStations);
      if (cloudParcels !== null) {
        setAllParcels(prev => {
          const pendingLocal = prev.filter(p => p.pending_sync && !cloudParcels.some(cp => cp.id === p.id));
          return [...pendingLocal, ...cloudParcels];
        });
      }

      // 11. Load trips + remembered drivers & vehicles
      const cloudTripBundle = await tripService.fetchFromCloud(wsId, loadedStations);
      if (cloudTripBundle !== null) {
        setAllTrips(prev => {
          const pendingLocal = prev.filter(t => t.pending_sync && !cloudTripBundle.trips.some(ct => ct.id === t.id));
          return [...pendingLocal, ...cloudTripBundle.trips];
        });
        setRememberedDrivers(cloudTripBundle.drivers);
        setRememberedPlates(cloudTripBundle.plates);
      }

      // 12. Load transactions & audit logs
      const cloudCashBundle = await cashService.fetchFromCloud(wsId, loadedStations);
      if (cloudCashBundle !== null) {
        setAllTransactions(prev => {
          const pendingLocal = prev.filter(tx => tx.pending_sync && !cloudCashBundle.transactions.some(ct => ct.id === tx.id));
          return [...pendingLocal, ...cloudCashBundle.transactions];
        });
        setAuditLogs(cloudCashBundle.auditLogs);
      }

      try {
        localStorage.setItem('alittihadia_last_sync_at', new Date().toISOString());
      } catch {}
    } catch (err) {
      console.warn('Error loading workspace data from Supabase:', err);
    }
  }, [refreshPlatformWorkspaces]);

  // Flush pending offline operations when browser comes back online
  useEffect(() => {
    if (!isOnline || !isSupabaseConfigured() || !currentUser || !currentWorkspace) return;
    if (!isValidUUID(currentWorkspace.id)) return;

    let cancelled = false;
    (async () => {
      const queue = storageService.getPendingSync();
      if (queue.length === 0) return;

      const pFlushed = await parcelService.flushPendingSync();
      const tFlushed = await tripService.flushPendingSync();
      const cFlushed = await cashService.flushPendingSync();
      const totalFlushed = pFlushed.synced + tFlushed.synced + cFlushed.synced;

      if (!cancelled && totalFlushed > 0) {
        setAllParcels(prev => prev.map(p => ({ ...p, pending_sync: false })));
        setAllTrips(prev => prev.map(t => ({ ...t, pending_sync: false })));
        setAllTransactions(prev => prev.map(tx => ({ ...tx, pending_sync: false })));
        showToast(`تمت مزامنة ${totalFlushed} عملية معلقة مع السحابة بنجاح`, 'success');
        await loadWorkspaceFromCloud(currentWorkspace.id, currentUser.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOnline, currentUser?.id, currentWorkspace?.id, loadWorkspaceFromCloud, showToast]);

  // Initial load + Realtime subscription when logged in & workspace active
  useEffect(() => {
    if (!isSupabaseConfigured() || !currentUser || !currentWorkspace) return;
    if (!isValidUUID(currentWorkspace.id)) return;

    const supabase = getSupabaseClient();
    if (!supabase) return;

    // Load initial cloud state
    loadWorkspaceFromCloud(currentWorkspace.id, currentUser.id);

    // Clean up any existing channel before subscribing
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const wsId = currentWorkspace.id;
    const channel = supabase
      .channel(`workspace-sync-${wsId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'parcels' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trip_parcels' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stations' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'join_requests' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspace_collaborations' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions' },
        () => {
          loadWorkspaceFromCloud(wsId, currentUser.id);
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [currentUser?.id, currentWorkspace?.id, loadWorkspaceFromCloud]);

  // Determine User Role in current workspace
  const userRole: UserRole = useMemo(() => {
    if (!currentUser) return 'worker';
    
    // الأمان المحكم: دور مالك المنصة يأتي حصراً من جدول platform_owners عبر دالة RPC آمنة في السحابة، وليس من localStorage أبداً
    if (isPlatformOwner) {
      return 'platform_owner';
    }
    if (!currentWorkspace) return 'owner';
    const member = workspaceMembers.find(m => m.user_id === currentUser.id && m.status === 'active');
    if (member?.role === 'admin' || member?.role === 'owner') return 'owner';
    return member?.role || (currentWorkspace.created_by === currentUser.id ? 'owner' : 'worker');
  }, [currentUser, currentWorkspace, workspaceMembers, isPlatformOwner]);

  // الفترة التجريبية 30 يوماً مفتوحة بجميع الخصائص (ما لم يقم المدير باختيار الباك الأول 99 درهم يدوياً)
  const isInFree30DayMonth = useMemo(() => {
    if (!currentWorkspace?.created_at) return true;
    const createdMs = new Date(currentWorkspace.created_at).getTime();
    if (isNaN(createdMs)) return true;
    const daysSinceCreation = (Date.now() - createdMs) / (1000 * 60 * 60 * 24);
    return daysSinceCreation <= 30;
  }, [currentWorkspace?.created_at]);

  // الباك الأول (99 درهم): محطتين (2) فقط + عامل واحد (1) لكل محطة + الملصقات والبونات باسم ولوغو التطبيق الرسمي
  const isPlan2TwoStations = useMemo(() => {
    if (!currentWorkspace) return false;
    return currentWorkspace.plan_tier === 'plan_2_two_stations';
  }, [currentWorkspace]);

  // Visible Stations: Filter by currentWorkspace.id
  const visibleStations: Station[] = useMemo(() => {
    const wsId = currentWorkspace?.id;
    const wsStations = wsId
      ? stations.filter(s => !s.workspace_id || s.workspace_id === wsId || s.team_id === wsId)
      : stations;
    if (!isPlan2TwoStations) return wsStations;
    if (wsStations.length <= 2) return wsStations;
    const realSt = wsStations.filter(s => !s.is_demo);
    if (realSt.length >= 2) return realSt.slice(0, 2);
    return wsStations.slice(0, 2);
  }, [stations, isPlan2TwoStations, currentWorkspace?.id]);

  // Determine user's assigned station if worker
  const userAssignedStationId = useMemo(() => {
    if (!currentUser) return null;
    const assignment = stationWorkers.find(sw => sw.user_id === currentUser.id);
    const memberEntry = workspaceMembers.find(m => m.user_id === currentUser.id);
    return assignment?.station_id || memberEntry?.station_id || visibleStations[0]?.id || null;
  }, [currentUser, stationWorkers, workspaceMembers, visibleStations]);

  useEffect(() => {
    if (userRole === 'worker' && userAssignedStationId) {
      setSelectedStationId(userAssignedStationId);
    } else if (visibleStations.length === 0) {
      if (selectedStationId !== null) setSelectedStationId(null);
    } else if (selectedStationId === 'all') {
      // الحفاظ على اختيار "كافة المحطات" للمدير بدون إعادة التعيين التلقائي للمحطة الأولى
      return;
    } else if (!selectedStationId || !visibleStations.some(s => s.id === selectedStationId)) {
      setSelectedStationId(visibleStations[0].id);
    }
  }, [userRole, userAssignedStationId, visibleStations, selectedStationId]);

  // ============================================================================
  // MULTI-ADMIN ISOLATION & OPTIONAL COLLABORATION FILTERING
  // ============================================================================

  // Visible Transactions (اللاگيس / الصندوق المالي):
  // STRICT ISOLATION: Cash box and financial transactions are 100% isolated to the current workspace only.
  // Collaborating admins can NEVER see another admin's cash box (لاكيس) or transactions.
  const transactions: Transaction[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const myWsId = currentWorkspace.id;

    return allTransactions.filter(tx => {
      const txWs = tx.workspace_id || tx.team_id || '';
      if (txWs !== myWsId) return false;

      // If worker: strictly isolate to their assigned station in their own workspace
      if (userRole === 'worker') {
        if (userAssignedStationId && tx.station_id !== userAssignedStationId) return false;
      }

      return true;
    });
  }, [currentWorkspace, allTransactions, userRole, userAssignedStationId]);

  // Strictly isolate visible workspace members to currentWorkspace only so no admin or worker sees members of another workspace
  // And attach station_id from stationWorkers. If on الباك الثاني (عامل واحد لكل محطة), cap workers to 1 per active station.
  const visibleWorkspaceMembers: WorkspaceMember[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const myWsId = currentWorkspace.id;
    const rawMembers = workspaceMembers
      .filter(m => !m.workspace_id || m.workspace_id === myWsId)
      .map(m => {
        const sw = stationWorkers.find(
          w => w.user_id === m.user_id && (!w.workspace_id || w.workspace_id === myWsId)
        );
        return {
          ...m,
          station_id: sw?.station_id || m.station_id,
        };
      });

    if (!isPlan2TwoStations) return rawMembers;

    const activeStationIds = new Set(visibleStations.map(s => s.id));
    const occupiedStations = new Set<string>();
    // Sort so real (non-demo) workers take priority over demo workers
    const sorted = [...rawMembers].sort((a, b) => Number(Boolean(a.is_demo)) - Number(Boolean(b.is_demo)));
    const allowedIds = new Set<string>();

    for (const m of sorted) {
      if (m.role === 'admin' || m.role === 'owner') {
        allowedIds.add(m.user_id);
        continue;
      }
      const stId = m.station_id || visibleStations[0]?.id || '';
      if (!activeStationIds.has(stId)) continue;
      if (occupiedStations.has(stId)) continue;
      if (occupiedStations.size >= 2) continue;
      occupiedStations.add(stId);
      allowedIds.add(m.user_id);
    }

    return rawMembers.filter(m => allowedIds.has(m.user_id));
  }, [workspaceMembers, currentWorkspace, stationWorkers, isPlan2TwoStations, visibleStations]);

  // Visible Parcels:
  // 1. My workspace parcels
  // 2. Plus collaborating workspace parcels IF that partner has share_parcels === true
  // 3. STRICT ISOLATION: If worker, only see parcels originating from or destined to their assigned station!
  const parcels: Parcel[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const myWsId = currentWorkspace.id;

    const sharedWsMap = new Map<string, string>();
    if (userRole !== 'worker') {
      collaborations.forEach(c => {
        if (c.status !== 'accepted') return;
        if (c.requester_workspace_id === myWsId && c.target_share_parcels) {
          sharedWsMap.set(c.target_workspace_id, c.target_workspace_name || 'مساحة عمل شريكة');
        } else if (c.target_workspace_id === myWsId && c.requester_share_parcels) {
          sharedWsMap.set(c.requester_workspace_id, c.requester_workspace_name || 'مساحة عمل شريكة');
        }
      });
    }

    return allParcels
      .filter(p => {
        const pWs = p.workspace_id || p.team_id || '';
        const inScope = pWs === myWsId || (pWs ? sharedWsMap.has(pWs) : false);
        if (!inScope) return false;

        // منع مشاركة البيانات التجريبية مع المدراء المتعاونين نهائياً
        if (pWs !== myWsId && p.is_demo) return false;

        // If worker: strictly isolate to parcels originating or arriving at their assigned station
        if (userRole === 'worker') {
          if (pWs !== myWsId) return false;
          if (userAssignedStationId) {
            const isOrigin = p.origin_station_id === userAssignedStationId;
            const isDest = p.destination_station_id === userAssignedStationId;
            if (!isOrigin && !isDest) return false;
          }
        }

        return true;
      })
      .map(p => {
        const pWs = p.workspace_id || p.team_id || '';
        const isFromPartner = pWs !== myWsId;
        return isFromPartner
          ? {
              ...p,
              is_collaborator_data: true,
              collaborator_workspace_name: p.collaborator_workspace_name || sharedWsMap.get(pWs) || 'شريك متعاون',
            }
          : p;
      });
  }, [currentWorkspace, collaborations, allParcels, userRole, userAssignedStationId]);

  // Visible Trips:
  // Strictly isolated: Workers only see trips originating from or heading to their assigned station!
  const trips: Trip[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const myWsId = currentWorkspace.id;
    return allTrips.filter(t => {
      if (t.workspace_id !== myWsId) return false;
      if (userRole === 'worker' && userAssignedStationId) {
        const isOrigin = t.origin_station_id === userAssignedStationId;
        const isDest = t.destination_station_id === userAssignedStationId;
        if (!isOrigin && !isDest) return false;
      }
      return true;
    });
  }, [currentWorkspace, allTrips, userRole, userAssignedStationId]);

  useEffect(() => {
    storageService.set('TRIPS', allTrips);
  }, [allTrips]);

  // Station Balances Calculation (Strictly Real Transactions Only)
  const stationBalances = useMemo(() => {
    const balances: Record<string, Record<string, number>> = {};

    stations.forEach(s => {
      balances[s.id] = {};
      currencies.forEach(c => {
        balances[s.id][c.code] = 0;
      });
    });

    transactions.forEach(tx => {
      if (tx.status !== 'confirmed' || tx.deleted_at) return;
      if (!balances[tx.station_id]) {
        balances[tx.station_id] = {};
      }
      if (balances[tx.station_id][tx.currency] === undefined) {
        balances[tx.station_id][tx.currency] = 0;
      }

      const amt = Number(tx.amount);
      if (isNaN(amt)) return;

      const isInflow = tx.type === 'cash_in' || tx.type === 'parcel_shipping_fee' || tx.type === 'parcel_cod_collection';
      const isOutflow = tx.type === 'cash_out' || tx.type === 'goods_payment' || tx.type === 'parcel_cod_payout';

      if (isInflow) {
        balances[tx.station_id][tx.currency] += amt;
      } else if (isOutflow) {
        balances[tx.station_id][tx.currency] -= amt;
      }

      balances[tx.station_id][tx.currency] = Math.round((balances[tx.station_id][tx.currency] + Number.EPSILON) * 100) / 100;
    });

    return balances;
  }, [stations, currencies, transactions]);

  // Local Storage Persistence
  useEffect(() => {
    if (currentUser) localStorage.setItem('aman_user', JSON.stringify(currentUser));
    else localStorage.removeItem('aman_user');
  }, [currentUser]);

  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem('aman_workspace', JSON.stringify(currentWorkspace));
      localStorage.setItem('aman_team', JSON.stringify(currentWorkspace));
    } else {
      localStorage.removeItem('aman_workspace');
      localStorage.removeItem('aman_team');
    }
  }, [currentWorkspace]);

  useEffect(() => {
    localStorage.setItem('aman_workspace_members', JSON.stringify(workspaceMembers));
    localStorage.setItem('aman_members', JSON.stringify(workspaceMembers));
  }, [workspaceMembers]);

  useEffect(() => {
    localStorage.setItem('aman_join_requests', JSON.stringify(joinRequests));
  }, [joinRequests]);

  useEffect(() => {
    localStorage.setItem('aman_collaborations', JSON.stringify(collaborations));
  }, [collaborations]);

  useEffect(() => {
    localStorage.setItem('aman_stations', JSON.stringify(stations));
  }, [stations]);

  useEffect(() => {
    localStorage.setItem('aman_station_workers', JSON.stringify(stationWorkers));
  }, [stationWorkers]);

  useEffect(() => {
    localStorage.setItem('aman_currencies', JSON.stringify(currencies));
  }, [currencies]);

  useEffect(() => {
    localStorage.setItem('aman_transactions', JSON.stringify(allTransactions));
  }, [allTransactions]);

  useEffect(() => {
    localStorage.setItem('ittihadiya_parcels', JSON.stringify(allParcels));
  }, [allParcels]);

  useEffect(() => {
    if (subscription) localStorage.setItem('aman_subscription', JSON.stringify(subscription));
  }, [subscription]);

  useEffect(() => {
    localStorage.setItem('aman_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  // Helper to check if a user ID or phone is locally marked as revoked
  const isAccountRevokedLocally = useCallback((userId?: string, phone?: string): boolean => {
    try {
      const revokedMap = JSON.parse(localStorage.getItem('alittihadia_revoked_accounts_v1') || '{}');
      if (userId && revokedMap[userId]) return true;
      const cleanP = phone ? cleanPhoneNumber(phone) : '';
      if (cleanP && revokedMap[cleanP]) return true;
    } catch {}
    return false;
  }, []);

  // Force immediate logout when a worker account is deleted/revoked by manager
  const forceRevokedWorkerLogout = useCallback(() => {
    setIsPlatformOwner(false);
    setCurrentUser(null);
    localStorage.removeItem('aman_user');
    showToast('تم إيقاف أو حذف حسابك من طرف مدير المحطة. لم يعد بإمكانك الوصول إلى النظام.', 'error');
  }, [showToast]);

  // Real-time Authoritative Firebase Sync Listener (Prevents Ghost Data Resurrection Across Devices)
  useEffect(() => {
    if (!currentWorkspace?.id || !firebaseSyncService.isAvailable()) return;
    const wsId = currentWorkspace.id;
    let isCancelled = false;

    // 1. Check authoritative cloud state FIRST before pushing anything so stale localStorage on PC never overwrites Phone wipes/deletions
    firebaseSyncService.loadFullWorkspaceFromCloud(wsId).then((cloudData) => {
      if (isCancelled) return;
      if (cloudData.workspace) {
        if (cloudData.workspace.last_reset_at) {
          localStorage.setItem(`aman_last_reset_${wsId}`, cloudData.workspace.last_reset_at);
        }
        const remoteWs = cloudData.workspace;
        const derivedEndDate =
          remoteWs.subscription_end_date ||
          (subscription?.workspace_id === wsId ? subscription.end_date : undefined) ||
          (remoteWs.created_by ? new Date(new Date(remoteWs.created_at).getTime() + 30 * 86400000).toISOString() : undefined);
        const derivedStatus = remoteWs.subscription_status || subscription?.status || 'active';

        setCurrentWorkspace(prev => {
          const merged = prev ? { ...prev, ...remoteWs } : remoteWs;
          return {
            ...merged,
            subscription_end_date: remoteWs.subscription_end_date || merged.subscription_end_date || derivedEndDate,
            subscription_status: remoteWs.subscription_status || merged.subscription_status || derivedStatus,
          };
        });

        if (derivedEndDate) {
          setSubscription(prev => ({
            id: prev?.id || `sub-${wsId}`,
            workspace_id: wsId,
            team_id: wsId,
            status: remoteWs.subscription_status || prev?.status || 'active',
            start_date: remoteWs.created_at || prev?.start_date || new Date().toISOString(),
            end_date:
              remoteWs.subscription_end_date ||
              (remoteWs.created_by === currentUser?.id && prev?.workspace_id === wsId
                ? prev.end_date
                : new Date(new Date(remoteWs.created_at || Date.now()).getTime() + 30 * 86400000).toISOString()),
            created_at: remoteWs.created_at || prev?.created_at || new Date().toISOString(),
          }));
        }

        // If manager's workspace in Firestore is missing subscription_end_date, push it so workers receive the exact remaining days
        if (!remoteWs.subscription_end_date && remoteWs.created_by === currentUser?.id && derivedEndDate) {
          firebaseSyncService
            .syncWorkspace({
              ...remoteWs,
              subscription_end_date: derivedEndDate,
              subscription_status: derivedStatus,
            })
            .catch(() => {});
        }

        setStations(cloudData.stations.map(s => ({ ...s, workspace_id: wsId, team_id: wsId })));
        setAllParcels(prev => {
          const otherWsParcels = prev.filter(p => p.workspace_id && p.workspace_id !== wsId && p.team_id !== wsId);
          const myCloudParcels = cloudData.parcels.map(p => ({ ...p, workspace_id: wsId, team_id: wsId }));
          return [...myCloudParcels, ...otherWsParcels].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
        setAllTransactions(
          cloudData.transactions
            .map(t => ({ ...t, workspace_id: wsId, team_id: wsId }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
        setAllTrips(
          cloudData.trips
            .map(t => ({ ...t, workspace_id: wsId }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        );
        if (cloudData.members.length > 0) {
          const syncedMembers = cloudData.members.map(m => ({ ...m, workspace_id: wsId }));
          setWorkspaceMembers(syncedMembers);
          setStationWorkers(
            syncedMembers
              .filter(m => m.role === 'worker' && m.station_id && m.status === 'active')
              .map(m => ({
                station_id: m.station_id!,
                workspace_id: wsId,
                user_id: m.user_id,
                assigned_at: m.joined_at || new Date().toISOString(),
                profile: m.profile,
              }))
          );
        }
      } else {
        // Workspace does not exist in Firestore yet -> push initial workspace & local items
        const wsWithSub: Workspace = {
          ...currentWorkspace,
          subscription_end_date:
            currentWorkspace.subscription_end_date ||
            subscription?.end_date ||
            new Date(new Date(currentWorkspace.created_at || Date.now()).getTime() + 30 * 86400000).toISOString(),
          subscription_status: currentWorkspace.subscription_status || subscription?.status || 'active',
        };
        firebaseSyncService.syncWorkspace(wsWithSub).catch(() => {});
        stations
          .filter(s => (!s.workspace_id || s.workspace_id === wsId || s.team_id === wsId) && !s.is_demo)
          .forEach(s => firebaseSyncService.syncStation(wsId, s).catch(() => {}));
        allParcels
          .filter(p => (p.workspace_id === wsId || p.team_id === wsId) && !p.is_demo)
          .forEach(p => firebaseSyncService.syncParcel(wsId, p).catch(() => {}));
        allTransactions
          .filter(tx => (tx.workspace_id === wsId || tx.team_id === wsId) && !tx.is_demo)
          .forEach(tx => firebaseSyncService.syncTransaction(wsId, tx).catch(() => {}));
        allTrips
          .filter(t => t.workspace_id === wsId && !t.is_demo)
          .forEach(t => firebaseSyncService.syncTrip(wsId, t).catch(() => {}));
        workspaceMembers
          .filter(m => (!m.workspace_id || m.workspace_id === wsId) && !m.is_demo)
          .forEach(m => firebaseSyncService.syncWorkspaceMember(wsId, m).catch(() => {}));
      }
    }).catch(() => {});

    // 2. Real-time subscription from Firebase Firestore (reflects additions, edits, AND deletions/wipes immediately)
    const unsubscribe = firebaseSyncService.subscribeToWorkspace(wsId, {
      onWorkspace: (remoteWs) => {
        if (!remoteWs) return;
        const prevReset = localStorage.getItem(`aman_last_reset_${wsId}`);
        if (remoteWs.last_reset_at && remoteWs.last_reset_at !== prevReset) {
          localStorage.setItem(`aman_last_reset_${wsId}`, remoteWs.last_reset_at);
          localStorage.removeItem('aman_stations');
          localStorage.removeItem('aman_transactions');
          localStorage.removeItem('ittihadiya_parcels');
          storageService.remove('TRIPS');
        }
        setCurrentWorkspace(prev => (prev ? { ...prev, ...remoteWs } : remoteWs));
        if (remoteWs.subscription_end_date || remoteWs.created_at) {
          setSubscription(prev => ({
            id: prev?.id || `sub-${wsId}`,
            workspace_id: wsId,
            team_id: wsId,
            status: remoteWs.subscription_status || prev?.status || 'active',
            start_date: remoteWs.created_at || prev?.start_date || new Date().toISOString(),
            end_date:
              remoteWs.subscription_end_date ||
              (remoteWs.created_by === currentUser?.id && prev?.workspace_id === wsId
                ? prev.end_date
                : new Date(new Date(remoteWs.created_at || Date.now()).getTime() + 30 * 86400000).toISOString()),
            created_at: remoteWs.created_at || prev?.created_at || new Date().toISOString(),
          }));
        }
      },
      onStations: (remoteStations) => {
        const cleanList = (remoteStations || []).map(s => ({
          ...s,
          workspace_id: wsId,
          team_id: wsId,
        }));
        if (cleanList.length > 0) {
          localStorage.setItem(`alittihadia_user_created_station_${wsId}`, 'true');
          localStorage.setItem(`alittihadia_guided_tour_completed_${wsId}`, 'true');
        }
        setStations(cleanList);
      },
      onParcels: (remoteParcels) => {
        const cleanParcels = (remoteParcels || []).map(p => ({
          ...p,
          workspace_id: wsId,
          team_id: wsId,
        }));
        setAllParcels(prev => {
          const otherWsParcels = prev.filter(p => p.workspace_id && p.workspace_id !== wsId && p.team_id !== wsId);
          return [...cleanParcels, ...otherWsParcels].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      },
      onTransactions: (remoteTxs) => {
        const cleanTxs = (remoteTxs || [])
          .map(t => ({ ...t, workspace_id: wsId, team_id: wsId }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllTransactions(cleanTxs);
      },
      onTrips: (remoteTrips) => {
        const cleanTrips = (remoteTrips || [])
          .map(t => ({ ...t, workspace_id: wsId }))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllTrips(cleanTrips);
      },
      onMembers: (remoteMembers) => {
        if (remoteMembers && remoteMembers.length > 0) {
          const syncedMembers = remoteMembers.map(m => ({ ...m, workspace_id: wsId }));
          setWorkspaceMembers(syncedMembers);
          setStationWorkers(
            syncedMembers
              .filter(m => m.role === 'worker' && m.station_id && m.status === 'active')
              .map(m => ({
                station_id: m.station_id!,
                workspace_id: wsId,
                user_id: m.user_id,
                assigned_at: m.joined_at || new Date().toISOString(),
                profile: m.profile,
              }))
          );
        }
      },
    });

    return () => {
      isCancelled = true;
      unsubscribe();
    };
  }, [currentWorkspace?.id]);

  // Real-time Worker Revocation & Deletion Enforcement (Cross-Device Firestore + Cross-Tab Storage + Member Check)
  useEffect(() => {
    if (!currentUser) return;
    const isWorkerSession =
      userRole === 'worker' ||
      Boolean(
        currentWorkspace &&
          currentWorkspace.created_by &&
          currentWorkspace.created_by !== currentUser.id &&
          !isPlatformOwner
      );

    if (!isWorkerSession) return;

    // 1. Check local revocation list
    if (isAccountRevokedLocally(currentUser.id, currentUser.phone)) {
      forceRevokedWorkerLogout();
      return;
    }

    // 2. Check if workspaceMembers has loaded the workspace's admin/owner, and this worker is missing or removed
    if (currentWorkspace) {
      const wsId = currentWorkspace.id;
      const wsMembers = workspaceMembers.filter(m => !m.workspace_id || m.workspace_id === wsId);
      const hasAdminLoaded = wsMembers.some(m => m.role === 'admin' || m.role === 'owner');
      if (hasAdminLoaded) {
        const myActiveMember = wsMembers.find(
          m =>
            (m.user_id === currentUser.id ||
              (currentUser.phone &&
                cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhoneNumber(currentUser.phone))) &&
            m.status === 'active'
        );
        if (!myActiveMember) {
          forceRevokedWorkerLogout();
          return;
        }
      }
    }
  }, [
    currentUser,
    userRole,
    currentWorkspace,
    workspaceMembers,
    isPlatformOwner,
    isAccountRevokedLocally,
    forceRevokedWorkerLogout,
  ]);

  // Subscribe in real-time to the worker's user document in Firestore + browser storage events (for instant kick-out)
  useEffect(() => {
    if (!currentUser) return;
    const isWorkerSession =
      userRole === 'worker' ||
      Boolean(
        currentWorkspace &&
          currentWorkspace.created_by &&
          currentWorkspace.created_by !== currentUser.id &&
          !isPlatformOwner
      );

    if (!isWorkerSession) return;

    const cleanPhone = cleanPhoneNumber(currentUser.phone);
    const unsubCloudUser = firebaseSyncService.subscribeToUserAccount(cleanPhone, (acc) => {
      if (acc && (acc.deleted || acc.status === 'revoked')) {
        forceRevokedWorkerLogout();
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'alittihadia_revoked_accounts_v1') {
        if (isAccountRevokedLocally(currentUser.id, currentUser.phone)) {
          forceRevokedWorkerLogout();
        }
      } else if (e.key === 'aman_workspace_members' && e.newValue) {
        try {
          const updatedMembers = JSON.parse(e.newValue) as WorkspaceMember[];
          setWorkspaceMembers(updatedMembers);
          const stillActive = updatedMembers.some(
            m =>
              (m.user_id === currentUser.id ||
                cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhone) &&
              m.status === 'active'
          );
          if (!stillActive) {
            forceRevokedWorkerLogout();
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      unsubCloudUser();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [
    currentUser,
    userRole,
    currentWorkspace?.created_by,
    isPlatformOwner,
    isAccountRevokedLocally,
    forceRevokedWorkerLogout,
  ]);

  // Live 1-second clock ticker so 5-minute subscription tests count down and expire in real time
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Authoritative workspace subscription status & end_date (shared identically between Manager and Worker)
  const effectiveSubscriptionEndDate = useMemo(() => {
    if (currentWorkspace?.subscription_end_date) {
      return currentWorkspace.subscription_end_date;
    }
    if (
      subscription &&
      (!currentWorkspace ||
        subscription.workspace_id === currentWorkspace.id ||
        subscription.team_id === currentWorkspace.id)
    ) {
      return subscription.end_date;
    }
    if (currentWorkspace?.created_at) {
      return new Date(new Date(currentWorkspace.created_at).getTime() + 30 * 86400000).toISOString();
    }
    return subscription?.end_date || new Date(Date.now() + 30 * 86400000).toISOString();
  }, [currentWorkspace?.subscription_end_date, currentWorkspace?.id, currentWorkspace?.created_at, subscription]);

  const effectiveSubscriptionStatus = useMemo(() => {
    return currentWorkspace?.subscription_status || subscription?.status || 'active';
  }, [currentWorkspace?.subscription_status, subscription?.status]);

  // Restore workspace subscription to 30 full days after the 5-minute test
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const wsId = currentWorkspace.id;
    const restoreKey = `alittihadia_30day_restored_v2_${wsId}`;
    if (localStorage.getItem(restoreKey)) return;

    const isManager =
      userRole === 'owner' ||
      userRole === 'platform_owner' ||
      !currentWorkspace.created_by ||
      currentWorkspace.created_by === currentUser?.id;
    if (!isManager) return;

    localStorage.setItem(restoreKey, 'true');
    const thirtyDaysEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    const updatedSub: Subscription = {
      id: subscription?.id || `sub-${wsId}`,
      workspace_id: wsId,
      team_id: wsId,
      status: 'active',
      is_trial: true,
      start_date: new Date().toISOString(),
      end_date: thirtyDaysEnd,
      created_at: subscription?.created_at || new Date().toISOString(),
    };
    setSubscription(updatedSub);
    localStorage.setItem('aman_subscription', JSON.stringify(updatedSub));
    const updatedWs: Workspace = {
      ...currentWorkspace,
      subscription_end_date: thirtyDaysEnd,
      subscription_status: 'active',
    };
    setCurrentWorkspace(updatedWs);
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncWorkspace(updatedWs).catch(() => {});
    }
  }, [currentWorkspace?.id, userRole, currentUser?.id]);

  // Subscription calculation (expired OR suspended blocks all writes)
  const isSubscriptionExpired = useMemo(() => {
    if (effectiveSubscriptionStatus === 'suspended' || effectiveSubscriptionStatus === 'expired') return true;
    const end = new Date(effectiveSubscriptionEndDate).getTime();
    return end <= nowMs;
  }, [effectiveSubscriptionStatus, effectiveSubscriptionEndDate, nowMs]);

  const checkWriteAllowed = useCallback((): { allowed: boolean; error?: string } => {
    // 1. Block deleted/revoked workers immediately before any write action
    if (currentUser) {
      const isWorkerSession =
        userRole === 'worker' ||
        Boolean(
          currentWorkspace &&
            currentWorkspace.created_by &&
            currentWorkspace.created_by !== currentUser.id &&
            !isPlatformOwner
        );
      if (isWorkerSession) {
        const wsId = currentWorkspace?.id;
        const wsMembers = wsId
          ? workspaceMembers.filter(m => !m.workspace_id || m.workspace_id === wsId)
          : workspaceMembers;
        const hasAdminLoaded = wsMembers.some(m => m.role === 'admin' || m.role === 'owner');
        const isStillMember =
          !hasAdminLoaded ||
          wsMembers.some(
            m =>
              (m.user_id === currentUser.id ||
                cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhoneNumber(currentUser.phone)) &&
              m.status === 'active'
          );

        if (isAccountRevokedLocally(currentUser.id, currentUser.phone) || !isStillMember) {
          forceRevokedWorkerLogout();
          return {
            allowed: false,
            error: 'تم إيقاف أو حذف حسابك من طرف مدير المحطة. لم يعد بإمكانك إجراء أي عملية.',
          };
        }
      }
    }

    // 2. Check workspace subscription (blocks BOTH Admin/Manager and Worker from adding, sending, or receiving anything)
    if (isSubscriptionExpired) {
      const msg =
        effectiveSubscriptionStatus === 'suspended'
          ? 'تم تعليق اشتراك مساحة العمل: لا يمكن للمدير أو العامل إضافة أو إرسال أو استقبال أي عملية حتى يتم تفعيل الاشتراك.'
          : 'انتهت فترة الـ 30 يوماً للاشتراك: لا يمكن للمدير أو العامل إضافة أو إرسال أو استقبال أي شيء حتى يتم تجديد الاشتراك.';
      showToast(msg, 'error');
      return { allowed: false, error: msg };
    }
    return { allowed: true };
  }, [
    currentUser,
    userRole,
    currentWorkspace,
    workspaceMembers,
    isPlatformOwner,
    isAccountRevokedLocally,
    forceRevokedWorkerLogout,
    isSubscriptionExpired,
    effectiveSubscriptionStatus,
    showToast,
  ]);

  const secondsUntilExpiry = useMemo(() => {
    if (effectiveSubscriptionStatus === 'suspended' || effectiveSubscriptionStatus === 'expired') return 0;
    const diff = new Date(effectiveSubscriptionEndDate).getTime() - nowMs;
    return Math.max(0, Math.ceil(diff / 1000));
  }, [effectiveSubscriptionStatus, effectiveSubscriptionEndDate, nowMs]);

  const daysUntilExpiry = useMemo(() => {
    if (secondsUntilExpiry <= 0) return 0;
    return Math.max(1, Math.ceil(secondsUntilExpiry / 86400));
  }, [secondsUntilExpiry]);

  const subscriptionRemainingLabel = useMemo(() => {
    if (isSubscriptionExpired || secondsUntilExpiry <= 0) {
      return 'منتهٍ (00:00)';
    }
    if (secondsUntilExpiry <= 3600) {
      const mins = Math.floor(secondsUntilExpiry / 60);
      const secs = secondsUntilExpiry % 60;
      const mm = String(mins).padStart(2, '0');
      const ss = String(secs).padStart(2, '0');
      return `${mm}:${ss} دقيقة متبقية`;
    }
    return `${daysUntilExpiry} يوم متبقية`;
  }, [isSubscriptionExpired, secondsUntilExpiry, daysUntilExpiry]);

  // ============================================================================
  // AUTHENTICATION: PHONE + PASSWORD WITHOUT SMS (GENERATING EMAIL @alittihadia.app)
  // ============================================================================

  const registerUser = async (data: {
    name: string;
    phone: string;
    whatsapp_number: string;
    password?: string;
    isOwner: boolean;
    teamInviteCode?: string;
  }) => {
    try {
      const cleanPhone = cleanPhoneNumber(data.phone);
      const cleanWhatsapp = cleanPhoneNumber(data.whatsapp_number) || cleanPhone;
      const pwd = (data.password || '').trim();

      if (!cleanPhone || cleanPhone.length < 8) {
        return { success: false, error: 'يرجى إدخال رقم هاتف صحيح' };
      }

      if (!pwd || pwd.length < 8) {
        return { success: false, error: 'كلمة المرور يجب أن لا تقل عن 8 أحرف أو أرقام' };
      }

      const syntheticEmail = phoneToEmail(cleanPhone);

      const supabase = getSupabaseClient();
      let userId = `usr-${Date.now()}`;

      // 1. If Supabase is live, register via Supabase Auth
      if (supabase) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: syntheticEmail,
          password: pwd,
          options: {
            data: {
              name: data.name.trim(),
              phone: cleanPhone,
              whatsapp_number: cleanWhatsapp,
              must_change_password: false,
            }
          }
        });

        if (authError) {
          if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
            return {
              success: false,
              error: 'هذا الرقم مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.'
            };
          }
          return { success: false, error: authError.message };
        }

        if (authData.user) {
          userId = authData.user.id;
        }
      } else {
        // Prevent duplicate accounts in local/demo mode for the same normalized phone number
        const duplicateLocal = workspaceMembers.some(
          m => !m.is_demo && cleanPhoneNumber(m.profile?.phone || '') === cleanPhone
        ) || (currentUser && cleanPhoneNumber(currentUser.phone) === cleanPhone);
        if (duplicateLocal) {
          return {
            success: false,
            error: 'هذا الرقم مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.'
          };
        }
      }

      // 2. Create profile
      const newProfile: Profile = {
        id: userId,
        phone: cleanPhone,
        whatsapp_number: cleanWhatsapp,
        name: data.name.trim(),
        must_change_password: false,
        created_at: new Date().toISOString(),
      };
      setCurrentUser(newProfile);
      try {
        localStorage.setItem('ittihadiya_saved_login_phone', cleanPhone);
      } catch {}

      // Persist account credentials in local accounts map for offline/local session recovery
      try {
        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
        localAccounts[cleanPhone] = {
          id: userId,
          name: newProfile.name,
          phone: cleanPhone,
          whatsapp_number: cleanWhatsapp,
          password: pwd,
          isOwner: Boolean(data.isOwner),
        };
        localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
      } catch {}

      // 3. If Owner: Create new independent Workspace with 6-char short ID
      if (data.isOwner) {
        let short_id = generateShortId();
        let invite_code = generateInviteCode();
        let wsId = supabase ? generateUUID() : `ws-${Date.now()}`;
        const initialSubEnd = new Date(Date.now() + 30 * 86400000).toISOString();

        let newWorkspace: Workspace = {
          id: wsId,
          short_id,
          name: `محطة الاتحادية - ${newProfile.name}`,
          invite_code,
          created_by: newProfile.id,
          created_at: new Date().toISOString(),
          owner_phone: cleanPhone,
          owner_whatsapp: cleanWhatsapp,
          subscription_end_date: initialSubEnd,
          subscription_status: 'active',
        };

        // Call RPC first if Supabase is connected so we use the authoritative DB UUIDs
        let rpcCreated = false;
        if (supabase) {
          try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_create_workspace', {
              p_name: newWorkspace.name
            });
            if (rpcErr) {
              showToast(`تنبيه مزامنة مساحة العمل: ${rpcErr.message}`, 'error');
            } else if (rpcData?.success && rpcData.workspace) {
              rpcCreated = true;
              newWorkspace = {
                ...(rpcData.workspace as Workspace),
                subscription_end_date: rpcData.subscription?.end_date || initialSubEnd,
                subscription_status: rpcData.subscription?.status || 'active',
              };
              short_id = newWorkspace.short_id;
              invite_code = newWorkspace.invite_code;
              wsId = newWorkspace.id;
              setCurrentWorkspace(newWorkspace);

              // Never pre-populate default Dakhla/Nouadhibou stations for a new manager account!
              // Delete any auto-seeded stations from rpc_create_workspace so the manager names their own stations.
              if (Array.isArray(rpcData.stations) && rpcData.stations.length > 0) {
                await supabase.from('stations').delete().eq('workspace_id', newWorkspace.id);
              }
              setStations([]);
              setSelectedStationId(null);

              if (Array.isArray(rpcData.currencies) && rpcData.currencies.length > 0) {
                setCurrencies(rpcData.currencies.map((c: any) => ({ ...c, team_id: c.workspace_id })));
              }
              if (rpcData.subscription) {
                setSubscription({ ...rpcData.subscription, team_id: newWorkspace.id });
              }
              const adminMember: WorkspaceMember = {
                workspace_id: newWorkspace.id,
                user_id: newProfile.id,
                role: 'admin',
                status: 'active',
                joined_at: rpcData.member?.joined_at || new Date().toISOString(),
                profile: newProfile,
              };
              setWorkspaceMembers([adminMember]);
              setStationWorkers([]);
            }
          } catch (e: any) {
            console.warn('RPC create_workspace sync error (local workspace active):', e);
            showToast('تعذر الاتصال بالسحابة، تم إنشاء مساحة العمل محلياً', 'error');
          }
        }

        if (!rpcCreated) {
          setCurrentWorkspace(newWorkspace);
          setSubscription({
            id: `sub-${newWorkspace.id}`,
            workspace_id: newWorkspace.id,
            team_id: newWorkspace.id,
            status: 'active',
            start_date: newWorkspace.created_at,
            end_date: initialSubEnd,
            created_at: newWorkspace.created_at,
          });

          const adminMember: WorkspaceMember = {
            workspace_id: newWorkspace.id,
            user_id: newProfile.id,
            role: 'admin',
            status: 'active',
            joined_at: new Date().toISOString(),
            profile: newProfile,
          };
          const initialWsCurrencies = getInitialCurrencies(newWorkspace.id);
          setCurrencies(initialWsCurrencies);
          setWorkspaceMembers([adminMember]);
          setStationWorkers([]);
          setStations([]);
          setSelectedStationId(null);

          // Sync new workspace, admin member, and user account to Firebase Firestore for cross-device login
          if (firebaseSyncService.isAvailable()) {
            firebaseSyncService.syncWorkspace(newWorkspace).catch(() => {});
            firebaseSyncService.syncWorkspaceMember(newWorkspace.id, adminMember).catch(() => {});
            firebaseSyncService.saveUserAccount(cleanPhone, {
              id: newProfile.id,
              name: newProfile.name,
              phone: cleanPhone,
              whatsapp_number: cleanWhatsapp,
              password: pwd,
              role: 'owner',
              workspace_id: newWorkspace.id,
              must_change_password: false,
              status: 'active',
              deleted: false,
              created_at: newProfile.created_at,
            }).catch(() => {});
          }
        }

        localStorage.setItem(`ittihadiya_demo_deleted_${newWorkspace.id}`, 'true');
        localStorage.setItem(`alittihadia_guided_tour_pending_${newWorkspace.id}`, 'true');
        localStorage.removeItem(`alittihadia_guided_tour_completed_${newWorkspace.id}`);
        localStorage.removeItem(`alittihadia_user_created_station_${newWorkspace.id}`);

        showToast(`مرحباً بك يا ${newProfile.name}! لنبدأ الآن بإعداد محطاتك وعملاتها وشعارك خطوة بخطوة`, 'success');
        return { success: true };
      } else {
        // 4. If Worker: Submit Join Request using invite code
        const code = (data.teamInviteCode || '').trim().toUpperCase();

        if (supabase) {
          try {
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_submit_join_request', {
              p_invite_code: code
            });
            if (rpcErr) {
              return { success: false, error: rpcErr.message };
            }
            if (!rpcRes.success) {
              return { success: false, error: rpcRes.error };
            }
          } catch (e) {
            console.warn('RPC submit_join_request fallback to local:', e);
          }
        }

        // Local simulated join request
        const targetWs = currentWorkspace && currentWorkspace.invite_code === code 
          ? currentWorkspace 
          : null;

        const req: JoinRequest = {
          id: `req-${Date.now()}`,
          workspace_id: targetWs ? targetWs.id : 'ws-external',
          user_id: newProfile.id,
          invite_code_used: code,
          user_name: newProfile.name,
          user_phone: newProfile.phone,
          user_whatsapp: newProfile.whatsapp_number,
          status: 'pending',
          created_at: new Date().toISOString(),
        };

        setJoinRequests(prev => [req, ...prev]);

        showToast(`تم إرسال طلب انضمامك يا ${newProfile.name}. بانتظار موافقة مدير المحطة.`, 'info');
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const loginWithCredentials = async (phone: string, password?: string) => {
    try {
      const cleanPhone = cleanPhoneNumber(phone);
      if (!cleanPhone || cleanPhone.length < 8) {
        return { success: false, error: 'يرجى إدخال رقم هاتف صحيح' };
      }
      if (!password || password.trim().length < 8) {
        return { success: false, error: 'كلمة المرور يجب أن لا تقل عن 8 أحرف أو أرقام' };
      }
      try {
        localStorage.setItem('ittihadiya_saved_login_phone', cleanPhone);
      } catch {}

      // Block locally revoked accounts immediately
      if (isAccountRevokedLocally(undefined, cleanPhone)) {
        return {
          success: false,
          error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لم يعد بإمكانك تسجيل الدخول.',
        };
      }

      const syntheticEmail = phoneToEmail(cleanPhone);
      const supabase = getSupabaseClient();

      if (supabase) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password: password.trim(),
        });

        if (error) {
          return { success: false, error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
        }

        if (data.user) {
          // Fetch real profile
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .maybeSingle();

          const mustChange = Boolean(prof?.must_change_password || data.user.user_metadata?.must_change_password);

          // Fetch member workspace
          const { data: mem } = await supabase
            .from('workspace_members')
            .select('*, workspaces(*)')
            .eq('user_id', data.user.id)
            .eq('status', 'active')
            .maybeSingle();

          if (!mem) {
            await supabase.auth.signOut().catch(() => {});
            return {
              success: false,
              error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لم يعد بإمكانك تسجيل الدخول.',
            };
          }

          if (prof) {
            setCurrentUser({ ...prof, must_change_password: mustChange });
          } else {
            setCurrentUser({
              id: data.user.id,
              phone: cleanPhone,
              whatsapp_number: data.user.user_metadata?.whatsapp_number || cleanPhone,
              name: data.user.user_metadata?.name || 'مستخدم محطة الاتحادية',
              must_change_password: mustChange,
              created_at: new Date().toISOString(),
            });
          }

          const wsData = Array.isArray(mem?.workspaces) ? mem?.workspaces[0] : mem?.workspaces;
          if (wsData) {
            setCurrentWorkspace(wsData);
            await loadWorkspaceFromCloud(wsData.id, data.user.id);
          }

          showToast('تم تسجيل الدخول بنجاح عبر السحابة', 'success');
          return { success: true };
        }
      }

      // 2. Check Firebase Firestore Cloud Account for Cross-Device Login (Phone + Password)
      if (firebaseSyncService.isAvailable()) {
        const cloudAcc = await firebaseSyncService.getUserAccount(cleanPhone);
        if (cloudAcc) {
          if (cloudAcc.deleted || cloudAcc.status === 'revoked') {
            return {
              success: false,
              error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لم يعد بإمكانك تسجيل الدخول.',
            };
          }
          if (cloudAcc.password && cloudAcc.password !== password.trim()) {
            return { success: false, error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
          }
          const restoredProfile: Profile = {
            id: cloudAcc.id,
            name: cloudAcc.name,
            phone: cleanPhone,
            whatsapp_number: cloudAcc.whatsapp_number || cleanPhone,
            must_change_password: Boolean(cloudAcc.must_change_password),
            created_at: cloudAcc.created_at || new Date().toISOString(),
          };

          // Restore full workspace & data from Firebase
          if (cloudAcc.workspace_id) {
            const cloudData = await firebaseSyncService.loadFullWorkspaceFromCloud(cloudAcc.workspace_id);

            // If worker: verify they are still an active member of the manager's workspace
            if (cloudAcc.role === 'worker' && cloudData.members.length > 0) {
              const activeWorkerMember = cloudData.members.find(
                m =>
                  (m.user_id === cloudAcc.id ||
                    cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhone) &&
                  m.status === 'active'
              );
              if (!activeWorkerMember) {
                return {
                  success: false,
                  error: 'تم حذف أو إيقاف حسابك من فريق المحطة من طرف المدير. لم يعد بإمكانك تسجيل الدخول.',
                };
              }
            }

            if (cloudData.workspace) {
              const wsEndDate =
                cloudData.workspace.subscription_end_date ||
                new Date(
                  new Date(cloudData.workspace.created_at || Date.now()).getTime() + 30 * 86400000
                ).toISOString();
              const wsStatus = cloudData.workspace.subscription_status || 'active';

              setCurrentWorkspace({
                ...cloudData.workspace,
                subscription_end_date: wsEndDate,
                subscription_status: wsStatus,
              });
              setSubscription({
                id: `sub-${cloudData.workspace.id}`,
                workspace_id: cloudData.workspace.id,
                team_id: cloudData.workspace.id,
                status: wsStatus,
                start_date: cloudData.workspace.created_at || new Date().toISOString(),
                end_date: wsEndDate,
                created_at: cloudData.workspace.created_at || new Date().toISOString(),
              });
              localStorage.setItem(`ittihadiya_demo_deleted_${cloudData.workspace.id}`, 'true');
              localStorage.setItem(`alittihadia_guided_tour_completed_${cloudData.workspace.id}`, 'true');
            }
            setStations(cloudData.stations);
            setAllParcels(cloudData.parcels);
            setAllTransactions(cloudData.transactions);
            setAllTrips(cloudData.trips);
            if (cloudData.members.length > 0) {
              setWorkspaceMembers(cloudData.members);
              const swList: StationWorker[] = cloudData.members
                .filter(m => m.role === 'worker' && m.station_id && m.status === 'active')
                .map(m => ({
                  station_id: m.station_id!,
                  workspace_id: m.workspace_id,
                  user_id: m.user_id,
                  assigned_at: m.joined_at || new Date().toISOString(),
                  profile: m.profile,
                }));
              setStationWorkers(swList);
            } else if (cloudAcc.role === 'owner') {
              const memberEntry: WorkspaceMember = {
                workspace_id: cloudAcc.workspace_id,
                user_id: restoredProfile.id,
                station_id: cloudAcc.station_id || undefined,
                role: 'admin',
                status: 'active',
                joined_at: restoredProfile.created_at,
                profile: restoredProfile,
              };
              setWorkspaceMembers(prev => [...prev.filter(m => m.user_id !== restoredProfile.id), memberEntry]);
            }
          }

          setCurrentUser(restoredProfile);

          // Save locally for offline resilience on this new device
          try {
            const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
            localAccounts[cleanPhone] = {
              id: cloudAcc.id,
              name: cloudAcc.name,
              phone: cleanPhone,
              whatsapp_number: cloudAcc.whatsapp_number || cleanPhone,
              password: password.trim(),
              isOwner: cloudAcc.role === 'owner',
              workspace_id: cloudAcc.workspace_id,
            };
            localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
          } catch {}

          showToast(`مرحباً بعودتك يا ${restoredProfile.name}! تم استرجاع حسابك وبياناتك من السحابة بنجاح`, 'success');
          return { success: true };
        }
      }

      // Check local temporary password table or saved local accounts if offline/demo
      let mustChangeLocal = false;
      try {
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        if (tempMap[cleanPhone]) {
          if (tempMap[cleanPhone] !== password.trim()) {
            return { success: false, error: 'كلمة المرور المؤقتة غير صحيحة' };
          }
          mustChangeLocal = true;
        } else {
          const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
          if (localAccounts[cleanPhone]?.password && localAccounts[cleanPhone].password !== password.trim()) {
            return { success: false, error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
          }
        }
      } catch {}

      // Offline / Local lookup fallback (match canonical phone in active workspaceMembers)
      const member = workspaceMembers.find(
        m => cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhone && m.status === 'active'
      );
      if (member && member.profile) {
        const profileWithFlag = {
          ...member.profile,
          phone: cleanPhone,
          must_change_password: Boolean(member.profile.must_change_password || mustChangeLocal),
        };
        setCurrentUser(profileWithFlag);
        showToast(`مرحباً بعودتك يا ${member.profile.name}`, 'success');
        return { success: true };
      }

      // Check local accounts store if user previously registered and logged out
      try {
        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
        const savedAcc = localAccounts[cleanPhone];
        if (savedAcc) {
          // If this local account was a worker, ensure they haven't been removed from workspaceMembers
          if (!savedAcc.isOwner) {
            const stillInMembers = workspaceMembers.some(
              m => cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhone && m.status === 'active'
            );
            if (!stillInMembers) {
              return {
                success: false,
                error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لم يعد بإمكانك تسجيل الدخول.',
              };
            }
          }
          const restoredProfile: Profile = {
            id: savedAcc.id || `usr-${cleanPhone}`,
            name: savedAcc.name || 'مدير المحطة',
            phone: cleanPhone,
            whatsapp_number: savedAcc.whatsapp_number || cleanPhone,
            must_change_password: mustChangeLocal,
            created_at: new Date().toISOString(),
          };
          setCurrentUser(restoredProfile);
          showToast(`مرحباً بعودتك يا ${restoredProfile.name}`, 'success');
          return { success: true };
        }
      } catch {}

      // Existing local user
      if (currentUser && cleanPhoneNumber(currentUser.phone) === cleanPhone) {
        setCurrentUser({
          ...currentUser,
          phone: cleanPhone,
          must_change_password: Boolean(currentUser.must_change_password || mustChangeLocal),
        });
        showToast(`مرحباً بعودتك يا ${currentUser.name}`, 'success');
        return { success: true };
      }

      return { 
        success: false, 
        error: 'لم يتم العثور على حساب بهذا الهاتف. يرجى الضغط على "إنشاء حساب جديد كمدير" أولاً.' 
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  // Google (Gmail) 1-Click Authentication Across Devices
  const loginWithGoogle = async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await signInWithPopup(firebaseAuth, googleProvider);
      const gUser = result.user;
      if (!gUser) {
        return { success: false, error: 'تعذر الحصول على بيانات حساب Google' };
      }

      const googleDocId = `google_${gUser.uid}`;
      const existingAcc = await firebaseSyncService.getUserAccount(googleDocId);

      if (existingAcc) {
        const restoredProfile: Profile = {
          id: existingAcc.id,
          name: existingAcc.name || gUser.displayName || 'مدير المحطة',
          phone: existingAcc.phone || gUser.phoneNumber || gUser.email || gUser.uid.slice(0, 10),
          whatsapp_number: existingAcc.whatsapp_number || existingAcc.phone || '',
          must_change_password: false,
          created_at: existingAcc.created_at || new Date().toISOString(),
        };
        setCurrentUser(restoredProfile);

        if (existingAcc.workspace_id) {
          const cloudData = await firebaseSyncService.loadFullWorkspaceFromCloud(existingAcc.workspace_id);
          if (cloudData.workspace) {
            setCurrentWorkspace(cloudData.workspace);
            localStorage.setItem(`ittihadiya_demo_deleted_${cloudData.workspace.id}`, 'true');
            localStorage.setItem(`alittihadia_guided_tour_completed_${cloudData.workspace.id}`, 'true');
          }
          setStations(cloudData.stations);
          setAllParcels(cloudData.parcels);
          setAllTransactions(cloudData.transactions);
          setAllTrips(cloudData.trips);
          if (cloudData.members.length > 0) setWorkspaceMembers(cloudData.members);
        }

        showToast(`مرحباً بعودتك يا ${restoredProfile.name}! تم فتح حسابك ومزامنة بياناتك عبر Gmail`, 'success');
        return { success: true };
      }

      // First time logging in with this Google account -> create new Owner Workspace
      const userId = `usr-g-${gUser.uid.slice(0, 12)}`;
      const displayName = gUser.displayName || (gUser.email ? gUser.email.split('@')[0] : 'مدير المحطة');
      const userPhone = gUser.phoneNumber || gUser.email || gUser.uid.slice(0, 10);

      const newProfile: Profile = {
        id: userId,
        name: displayName,
        phone: userPhone,
        whatsapp_number: userPhone,
        must_change_password: false,
        created_at: new Date().toISOString(),
      };
      setCurrentUser(newProfile);

      const wsId = `ws-${Date.now()}`;
      const newWorkspace: Workspace = {
        id: wsId,
        short_id: generateShortId(),
        name: `محطة الاتحادية - ${displayName}`,
        invite_code: generateInviteCode(),
        created_by: newProfile.id,
        created_at: new Date().toISOString(),
        owner_phone: userPhone,
        owner_whatsapp: userPhone,
      };
      setCurrentWorkspace(newWorkspace);

      const adminMember: WorkspaceMember = {
        workspace_id: newWorkspace.id,
        user_id: newProfile.id,
        role: 'admin',
        status: 'active',
        joined_at: new Date().toISOString(),
        profile: newProfile,
      };

      setCurrencies(getInitialCurrencies(newWorkspace.id));
      setWorkspaceMembers([adminMember]);
      setStationWorkers([]);
      setStations([]);
      setSelectedStationId(null);

      await firebaseSyncService.syncWorkspace(newWorkspace);
      await firebaseSyncService.syncWorkspaceMember(newWorkspace.id, adminMember);
      await firebaseSyncService.saveUserAccount(googleDocId, {
        id: newProfile.id,
        name: newProfile.name,
        phone: userPhone,
        whatsapp_number: userPhone,
        email: gUser.email || undefined,
        role: 'owner',
        workspace_id: newWorkspace.id,
        must_change_password: false,
        created_at: newProfile.created_at,
      });

      localStorage.setItem(`ittihadiya_demo_deleted_${newWorkspace.id}`, 'true');
      localStorage.setItem(`alittihadia_guided_tour_pending_${newWorkspace.id}`, 'true');
      localStorage.removeItem(`alittihadia_guided_tour_completed_${newWorkspace.id}`);

      showToast(`مرحباً بك يا ${newProfile.name}! تم ربط حسابك بـ Gmail وإنشاء مساحة عملك بنجاح`, 'success');
      return { success: true };
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        return { success: false, error: 'تم إغلاق نافذة تسجيل الدخول بحساب Google' };
      }
      return { success: false, error: err?.message || 'تعذر تسجيل الدخول عبر حساب Google' };
    }
  };

  const logout = () => {
    if (currentUser?.phone) {
      try {
        localStorage.setItem('ittihadiya_saved_login_phone', currentUser.phone);
      } catch {}
    }
    const supabase = getSupabaseClient();
    if (supabase) {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      supabase.auth.signOut().catch(() => {});
    }
    setIsPlatformOwner(false);
    setCurrentUser(null);
    localStorage.removeItem('aman_user');
    showToast('تم تسجيل الخروج بنجاح (رقم هاتفك محفوظ لتسجيل الدخول السريع)', 'info');
  };

  // ============================================================================
  // WORKSPACE JOIN APPROVAL & CODE RENEWAL
  // ============================================================================

  const approveJoinRequest = async (requestId: string) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const req = joinRequests.find(r => r.id === requestId);
    if (!req) return { success: false, error: 'الطلب غير موجود' };

    const maxWorkers = isPlan2TwoStations ? 2 : (currentWorkspace?.max_workers ?? 99);
    const activeWorkers = visibleWorkspaceMembers.filter(m => m.role === 'worker' && m.status === 'active' && !m.is_demo);
    if (activeWorkers.length >= maxWorkers) {
      const msg = isPlan2TwoStations
        ? 'تم بلوغ الحد الأقصى للعمال في الباك الأول (99 درهم): عاملان فقط (عامل واحد في كل محطة من المحطتين). يرجى الترقية إلى الباك الثاني (199 درهم) لإضافة عمال إضافيين.'
        : `تم بلوغ الحد الأقصى للعمال المسموح به في باقتك الحالية (${maxWorkers} عمال). يرجى ترقية الباقة لإضافة المزيد.`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // Choose a station that doesn't have a real worker yet when on Plan 2
    const targetStationId = (() => {
      if (isPlan2TwoStations) {
        const freeSt = visibleStations.find(
          st => !activeWorkers.some(w => w.station_id === st.id)
        );
        return freeSt?.id || visibleStations[0]?.id || '';
      }
      return visibleStations[0]?.id || '';
    })();

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_approve_join_request', { p_request_id: requestId });
        if (rpcErr || (rpcRes && !rpcRes.success)) {
          const errMsg = rpcErr?.message || rpcRes?.error || 'تعذر مزامنة الموافقة مع السحابة';
          showToast(errMsg, 'error');
          return { success: false, error: errMsg };
        }
      } catch (e) {
        console.warn('RPC approve_join_request fallback:', e);
        showToast('تعذر الاتصال بالسحابة، تم اعتماد الطلب محلياً', 'error');
      }
    }

    setJoinRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'approved' } : r));

    // Add to members
    const newMember: WorkspaceMember = {
      workspace_id: req.workspace_id,
      user_id: req.user_id,
      station_id: targetStationId,
      role: 'worker',
      status: 'active',
      joined_at: new Date().toISOString(),
      profile: {
        id: req.user_id,
        phone: req.user_phone,
        whatsapp_number: req.user_whatsapp,
        name: req.user_name,
        created_at: new Date().toISOString(),
      }
    };

    setWorkspaceMembers(prev => [...prev.filter(m => m.user_id !== req.user_id), newMember]);
    if (targetStationId) {
      setStationWorkers(prev => [
        ...prev.filter(sw => sw.user_id !== req.user_id),
        {
          station_id: targetStationId,
          workspace_id: req.workspace_id,
          user_id: req.user_id,
          assigned_at: new Date().toISOString(),
          profile: newMember.profile,
        },
      ]);
    }
    showToast(`تمت الموافقة على انضمام العامل "${req.user_name}" بنجاح`, 'success');
    return { success: true };
  };

  const rejectJoinRequest = async (requestId: string) => {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_reject_join_request', { p_request_id: requestId });
        if (rpcErr || (rpcRes && !rpcRes.success)) {
          showToast(rpcErr?.message || rpcRes?.error || 'تعذر مزامنة الرفض مع السحابة', 'error');
        }
      } catch (e) {
        console.warn('RPC reject_join_request fallback:', e);
        showToast('تعذر الاتصال بالسحابة، تم الرفض محلياً', 'error');
      }
    }

    setJoinRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: 'rejected' } : r));
    showToast('تم رفض طلب الانضمام', 'info');
    return { success: true };
  };

  const renewInviteCode = async (): Promise<string> => {
    if (!currentWorkspace) return '';
    let newCode = generateInviteCode();

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_renew_invite_code', { p_workspace_id: currentWorkspace.id });
        if (rpcErr || (rpcRes && !rpcRes.success)) {
          showToast(rpcErr?.message || rpcRes?.error || 'تعذر تجديد الرمز في السحابة', 'error');
        } else if (rpcRes?.invite_code) {
          newCode = rpcRes.invite_code;
        }
      } catch (e) {
        console.warn('RPC renew_invite_code fallback:', e);
        showToast('تعذر الاتصال بالسحابة، تم تجديد الرمز محلياً', 'error');
      }
    }

    const updatedWs = { ...currentWorkspace, invite_code: newCode };
    setCurrentWorkspace(updatedWs);
    showToast('تم تجديد رمز الدعوة بنجاح', 'success');
    return newCode;
  };

  // ============================================================================
  // ADMIN-TO-ADMIN COLLABORATIONS & OPTIONAL SHARING
  // ============================================================================

  const sendCollaborationRequest = async (targetShortId: string) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (!currentWorkspace) return { success: false, error: 'لا توجد مساحة عمل نشطة' };
    const cleanId = targetShortId.trim().toUpperCase();

    if (cleanId === currentWorkspace.short_id) {
      return { success: false, error: 'لا يمكنك إرسال طلب تعاون لمساحة عملك الخاصة' };
    }

    const maxCollabs = currentWorkspace.max_collaborations ?? 5;
    const activeCollabs = collaborations.filter(c => c.status === 'accepted' || c.status === 'pending').length;
    if (activeCollabs >= maxCollabs) {
      const msg = `تم بلوغ الحد الأقصى للمدراء المتعاونين المسموح به في باقتك الحالية (${maxCollabs} شراكات). يرجى ترقية الباقة.`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    let cloudCollab: WorkspaceCollaboration | null = null;
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_send_collaboration_request', {
          p_target_short_id: cleanId
        });
        if (error) return { success: false, error: error.message };
        if (!data.success) return { success: false, error: data.error };
        if (data.collaboration) {
          cloudCollab = data.collaboration as WorkspaceCollaboration;
        }
      } catch (e) {
        console.warn('RPC send_collaboration_request fallback:', e);
        showToast('تعذر الاتصال بالسحابة، تم حفظ طلب التعاون محلياً', 'error');
      }
    }

    const newCollab: WorkspaceCollaboration = cloudCollab || {
      id: `collab-${Date.now()}`,
      requester_workspace_id: currentWorkspace.id,
      target_workspace_id: `ws-target-${cleanId}`,
      target_workspace_short_id: cleanId,
      requester_workspace_name: currentWorkspace.name,
      target_workspace_name: `إدارة مساحة العمل [${cleanId}]`,
      status: 'pending',
      requester_share_cash: false,
      requester_share_parcels: false,
      requester_share_reports: false,
      target_share_cash: false,
      target_share_parcels: false,
      target_share_reports: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setCollaborations(prev => [newCollab, ...prev]);
    return { 
      success: true, 
      message: `تم إرسال طلب التعاون إلى مساحة العمل [${cleanId}] بنجاح، بانتظار قبول الطرف الآخر.` 
    };
  };

  const respondToCollaboration = async (collabId: string, accept: boolean) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (accept && currentWorkspace) {
      const maxCollabs = currentWorkspace.max_collaborations ?? 5;
      const acceptedCollabs = collaborations.filter(c => c.status === 'accepted').length;
      if (acceptedCollabs >= maxCollabs) {
        const msg = `تم بلوغ الحد الأقصى للمدراء المتعاونين المسموح به في باقتك الحالية (${maxCollabs} شراكات).`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_respond_to_collaboration', {
          p_collab_id: collabId,
          p_accept: accept
        });
        if (rpcErr || (rpcRes && !rpcRes.success)) {
          showToast(rpcErr?.message || rpcRes?.error || 'تعذر مزامنة قرار الشراكة مع السحابة', 'error');
        }
      } catch (e) {
        console.warn('RPC respond_to_collaboration fallback:', e);
        showToast('تعذر الاتصال بالسحابة، تم تحديث الشراكة محلياً', 'error');
      }
    }

    setCollaborations(prev => prev.map(c => {
      if (c.id === collabId) {
        return {
          ...c,
          status: accept ? 'accepted' : 'rejected',
          updated_at: new Date().toISOString()
        };
      }
      return c;
    }));

    showToast(
      accept 
        ? 'تم قبول الشراكة بنجاح! يمكنك الآن اختيار ما تود مشاركته بشكل اختياري.' 
        : 'تم رفض طلب الشراكة',
      accept ? 'success' : 'info'
    );
    return { success: true };
  };

  const updateSharingSettings = async (
    collabId: string,
    _shareCash: boolean,
    shareParcels: boolean,
    _shareReports: boolean
  ) => {
    // الأمان المحكم: اللاگيس (حركة الأموال) والتقارير المالية معزولة 100% ولا تُشارك أبداً بين المدراء
    const safeShareCash = false;
    const safeShareReports = false;

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_update_sharing_settings', {
          p_collab_id: collabId,
          p_share_cash: safeShareCash,
          p_share_parcels: shareParcels,
          p_share_reports: safeShareReports
        });
        if (rpcErr || (rpcRes && !rpcRes.success)) {
          showToast(rpcErr?.message || rpcRes?.error || 'تعذر مزامنة إعدادات المشاركة مع السحابة', 'error');
        }
      } catch (e) {
        console.warn('RPC update_sharing_settings fallback:', e);
        showToast('تعذر الاتصال بالسحابة، تم تحديث إعدادات المشاركة محلياً', 'error');
      }
    }

    setCollaborations(prev => prev.map(c => {
      if (c.id === collabId) {
        const isRequester = c.requester_workspace_id === currentWorkspace?.id;
        return {
          ...c,
          requester_share_cash: false,
          requester_share_parcels: isRequester ? shareParcels : c.requester_share_parcels,
          requester_share_reports: false,
          target_share_cash: false,
          target_share_parcels: !isRequester ? shareParcels : c.target_share_parcels,
          target_share_reports: false,
          updated_at: new Date().toISOString()
        };
      }
      return c;
    }));

    showToast('تم تحديث إعدادات تتبع الطرود المشتركة بنجاح. اللاگيس والعمال معزولون 100%.', 'success');
    return { success: true };
  };

  // Check if any data records exist in workspace
  const hasDemoData = useMemo(() => {
    return (
      stations.length > 0 ||
      allParcels.length > 0 ||
      allTrips.length > 0 ||
      allTransactions.length > 0 ||
      auditLogs.length > 0 ||
      rememberedDrivers.length > 0 ||
      rememberedPlates.length > 0
    );
  }, [stations, allParcels, allTrips, allTransactions, auditLogs, rememberedDrivers, rememberedPlates]);

  // مسح البيانات بالكامل وإرجاع التطبيق جديداً (صفر بيانات بضغطة واحدة على الهاتف والحاسوب معاً)
  const deleteDemoData = () => {
    const wsId = currentWorkspace?.id;
    const resetAt = new Date().toISOString();

    setStations([]);
    setSelectedStationId(null);
    setWorkspaceMembers(prev => prev.filter(m => !m.is_demo && (m.role === 'admin' || m.role === 'owner')));
    setStationWorkers([]);
    setAllParcels([]);
    setAllTrips([]);
    setAllTransactions([]);
    setAuditLogs([]);
    tripService.clearRememberedDriversAndPlates();
    setRememberedDrivers([]);
    setRememberedPlates([]);

    localStorage.removeItem('aman_stations');
    localStorage.removeItem('aman_transactions');
    localStorage.removeItem('ittihadiya_parcels');
    localStorage.removeItem('aman_audit_logs');
    localStorage.removeItem('alittihadia_hawala_transfers_v1');
    storageService.remove('TRIPS');
    storageService.remove('PARCELS');
    storageService.remove('TRANSACTIONS');

    if (wsId) {
      localStorage.setItem(`aman_last_reset_${wsId}`, resetAt);
      localStorage.setItem(`ittihadiya_demo_deleted_${wsId}`, 'true');
      localStorage.removeItem(`alittihadia_user_created_station_${wsId}`);
      localStorage.removeItem(`alittihadia_station_currencies_${wsId}`);
      setCurrentWorkspace(prev => (prev ? { ...prev, last_reset_at: resetAt } : null));
      if (firebaseSyncService.isAvailable()) {
        firebaseSyncService.clearAllWorkspaceData(wsId, resetAt).catch(err => {
          console.warn('Firebase clear workspace error:', err);
        });
      }
    }

    showToast('تم مسح جميع البيانات والمحطات وإرجاع التطبيق جديداً من الصفر بنجاح', 'success');
  };

  // Reset Data to 0
  const resetAllDataToZero = () => {
    deleteDemoData();
  };

  // Add Worker by Owner (Creates real account via Edge Function when Supabase is connected, or generates one-time temp password locally)
  const addWorkerByOwner = async (name: string, phone: string, stationId: string, role: UserRole = 'worker') => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (!currentWorkspace) return { success: false, error: 'لا توجد مساحة عمل نشطة' };

    const canonicalPhone = cleanPhoneNumber(phone);
    if (!canonicalPhone || canonicalPhone.length < 8) {
      return { success: false, error: 'يرجى إدخال رقم هاتف صحيح للعامل' };
    }

    if (workspaceMembers.some(m => !m.is_demo && cleanPhoneNumber(m.profile?.phone || '') === canonicalPhone)) {
      const msg = 'هذا العامل مسجل بالفعل ضمن فريق مساحة العمل';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    if (role !== 'owner') {
      const maxWorkers = isPlan2TwoStations ? 2 : (currentWorkspace.max_workers ?? 99);
      const realActiveWorkers = visibleWorkspaceMembers.filter(
        m => m.role === 'worker' && m.status === 'active' && !m.is_demo
      );

      if (isPlan2TwoStations) {
        const targetStation = visibleStations.find(s => s.id === stationId);
        if (!targetStation) {
          const msg = 'الباك الأول (99 درهم) يسمح بالعمل على محطتين (2) فقط.';
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
        // Check if this station already has a real worker assigned (1 worker per station rule)
        const existingRealWorkerInStation = realActiveWorkers.find(w => w.station_id === stationId);
        if (existingRealWorkerInStation) {
          const msg = `محطة "${targetStation.name}" فيها عامل مسجل بالفعل (${existingRealWorkerInStation.profile?.name || 'عامل'})! الباك الأول (99 درهم) يسمح بعامل واحد (1) فقط في كل محطة. اختر المحطة الثانية أو قم بالترقية إلى الباك الثاني (199 درهم).`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
      }

      if (realActiveWorkers.length >= maxWorkers) {
        const msg = isPlan2TwoStations
          ? 'تم بلوغ الحد الأقصى للعمال في الباك الأول (99 درهم): عاملان فقط (عامل واحد في كل محطة من المحطتين). يرجى الترقية إلى الباك الثاني (199 درهم) لإضافة عمال أكثر.'
          : `تم بلوغ الحد الأقصى للعمال المسموح به في باقتك الحالية (${maxWorkers} عمال). يرجى ترقية الباقة لإضافة المزيد.`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }

      // If on Plan 2 and the target station had a demo worker placeholder, remove that demo worker so the new real worker takes its slot cleanly
      if (isPlan2TwoStations) {
        const demoWorkerIdsInStation = stationWorkers
          .filter(sw => sw.station_id === stationId && sw.is_demo)
          .map(sw => sw.user_id);
        if (demoWorkerIdsInStation.length > 0) {
          setWorkspaceMembers(prev => prev.filter(m => !demoWorkerIdsInStation.includes(m.user_id)));
          setStationWorkers(prev => prev.filter(sw => !demoWorkerIdsInStation.includes(sw.user_id)));
        }
      }
    }

    const supabase = getSupabaseClient();
    let workerUserId = `usr-worker-${Date.now()}`;
    let tempPassword = generateTemporaryPassword();

    if (supabase && isValidUUID(currentWorkspace.id)) {
      try {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('reset-password', {
          body: {
            action: 'create_worker',
            workspace_id: currentWorkspace.id,
            station_id: stationId,
            name: name.trim(),
            phone: canonicalPhone,
          },
        });
        if (fnErr || (fnData && !fnData.success)) {
          const errMsg = fnData?.error || fnErr?.message || 'تعذر إنشاء حساب العامل عبر الخادم. يمكنك دعوته عبر رمز الدعوة الخاص بمساحة العمل.';
          showToast(errMsg, 'error');
          return { success: false, error: errMsg };
        }
        if (fnData?.user_id) workerUserId = fnData.user_id;
        if (fnData?.temporary_password) tempPassword = fnData.temporary_password;
      } catch (e: any) {
        const errMsg = 'تعذر الاتصال بدالة الخادم لإنشاء حساب العامل. يرجى استخدام رمز الدعوة أو المحاولة لاحقاً.';
        showToast(errMsg, 'error');
        return { success: false, error: errMsg };
      }
    } else {
      // Save local temporary password for offline/demo mode
      try {
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        tempMap[canonicalPhone] = tempPassword;
        localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
      } catch {}
    }

    const newWorkerProfile: Profile = {
      id: workerUserId,
      name: name.trim(),
      phone: canonicalPhone,
      whatsapp_number: canonicalPhone,
      must_change_password: true,
      created_at: new Date().toISOString(),
    };

    const newMember: WorkspaceMember = {
      workspace_id: currentWorkspace.id,
      user_id: newWorkerProfile.id,
      station_id: stationId,
      role: role === 'owner' ? 'admin' : 'worker',
      status: 'active',
      joined_at: new Date().toISOString(),
      profile: newWorkerProfile,
    };

    // Clear any previous revocation entry if manager re-adds a previously deleted phone number
    try {
      const revokedMap = JSON.parse(localStorage.getItem('alittihadia_revoked_accounts_v1') || '{}');
      if (revokedMap[canonicalPhone] || revokedMap[newWorkerProfile.id]) {
        delete revokedMap[canonicalPhone];
        delete revokedMap[newWorkerProfile.id];
        localStorage.setItem('alittihadia_revoked_accounts_v1', JSON.stringify(revokedMap));
      }
    } catch {}

    setWorkspaceMembers(prev => [...prev, newMember]);

    setStationWorkers(prev => [
      ...prev.filter(sw => sw.user_id !== newWorkerProfile.id),
      {
        station_id: stationId,
        workspace_id: currentWorkspace.id,
        user_id: newWorkerProfile.id,
        assigned_at: new Date().toISOString(),
        profile: newWorkerProfile,
      }
    ]);

    // Sync worker account, workspace member, AND manager's current subscription_end_date to Firebase so the worker sees the exact remaining days (e.g. 3 days, not 30 days)
    const managerSubEndDate = effectiveSubscriptionEndDate;
    const managerSubStatus = effectiveSubscriptionStatus;
    setCurrentWorkspace(prev =>
      prev
        ? {
            ...prev,
            subscription_end_date: managerSubEndDate,
            subscription_status: managerSubStatus,
          }
        : null
    );

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService
        .syncWorkspace({
          ...currentWorkspace,
          subscription_end_date: managerSubEndDate,
          subscription_status: managerSubStatus,
        })
        .catch(() => {});
      firebaseSyncService.syncWorkspaceMember(currentWorkspace.id, newMember).catch(() => {});
      firebaseSyncService.saveUserAccount(canonicalPhone, {
        id: newWorkerProfile.id,
        name: newWorkerProfile.name,
        phone: canonicalPhone,
        whatsapp_number: canonicalPhone,
        password: tempPassword,
        role: role === 'owner' ? 'owner' : 'worker',
        workspace_id: currentWorkspace.id,
        station_id: stationId,
        must_change_password: true,
        status: 'active',
        deleted: false,
        created_at: newWorkerProfile.created_at,
      }).catch(() => {});
    }

    showToast(`تم إنشاء حساب الموظف "${newWorkerProfile.name}" بكلمة مرور مؤقتة لمرة واحدة`, 'success');
    return { success: true, temporaryPassword: tempPassword };
  };

  // Create Transaction
  const createTransaction = async (data: {
    station_id: string;
    type: TransactionType;
    amount: number;
    currency: string;
    phone_number?: string;
    reason?: string;
    photo_url?: string;
    note?: string;
    parcel_id?: string;
    hawala_meta?: MoneyTransfer | null;
    hawala_transfer_id?: string | null;
  }) => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    // قيد صلاحية العامل: العامل يتحكم في محطته المخصصة فقط (استثناء: عند تسليم حوالة واردة لمحطته أو استلام طرد في محطته)
    const effectiveStationId =
      userRole === 'worker' && userAssignedStationId ? userAssignedStationId : data.station_id;
    if (userRole === 'worker' && userAssignedStationId && data.station_id !== userAssignedStationId) {
      const msg = 'لا تملك صلاحية التحكم أو تسجيل عمليات مالية في محطة أخرى غير محطتك المخصصة';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const st = stations.find(s => s.id === effectiveStationId);
    const wsId = currentWorkspace?.id || 'ws-default';
    const txId = isSupabaseConfigured()
      ? generateUUID()
      : `tx-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;

    let finalPhotoUrl = data.photo_url || null;
    if (finalPhotoUrl && finalPhotoUrl.startsWith('data:image/') && isSupabaseConfigured() && isValidUUID(wsId)) {
      finalPhotoUrl = await cashService.uploadReceiptPhoto(wsId, finalPhotoUrl);
    }

    const newTx: Transaction = {
      id: txId,
      workspace_id: wsId,
      team_id: wsId,
      station_id: data.station_id,
      created_by: currentUser.id,
      type: data.type,
      amount: Math.round(Number(data.amount) * 100) / 100,
      currency: data.currency,
      phone_number: data.phone_number?.trim() || null,
      reason: data.reason?.trim() || null,
      photo_url: finalPhotoUrl,
      note: data.note?.trim() || null,
      parcel_id: data.parcel_id || null,
      hawala_meta: data.hawala_meta || null,
      hawala_transfer_id: data.hawala_transfer_id || null,
      status: 'confirmed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      station_name: st?.name || 'محطة الاتحادية',
      creator_name: currentUser.name,
    };

    const audit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`,
      workspace_id: wsId,
      team_id: wsId,
      user_id: currentUser.id,
      user_name: currentUser.name,
      action: 'INSERT',
      table_name: 'transactions',
      record_id: newTx.id,
      old_data: null,
      new_data: newTx,
      created_at: new Date().toISOString(),
    };

    setAllTransactions(prev => [newTx, ...prev]);
    setAuditLogs(prev => [audit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await cashService.syncTransactionAndAuditToCloud(
        newTx,
        audit,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllTransactions(prev => prev.map(t => t.id === newTx.id ? { ...t, pending_sync: true } : t));
      } else {
        const nextTxs = [newTx, ...allTransactions];
        const balances = cashService.calculateStationBalances(stations, nextTxs);
        const curr = newTx.currency === 'MRU' ? 'MRU' : 'MAD';
        const bal = balances[newTx.station_id]?.[curr] ?? 0;
        await cashService.syncStationBalanceToCloud(newTx.station_id, wsId, curr, bal);
      }
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncTransaction(newTx.workspace_id, newTx).catch(err => {
        console.warn('Firebase tx sync error:', err);
      });
    }

    showToast(`تم تسجيل السند بنجاح بمبلغ ${newTx.amount} ${newTx.currency}`, 'success');
    return { success: true, transaction: newTx };
  };

  const updateTransaction = async (id: string, updates: Partial<Transaction>, editReason?: string) => {
    if (userRole !== 'owner') return { success: false, error: 'صلاحية التعديل للمدير المشرف فقط' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const currentTx = allTransactions.find(t => t.id === id);
    if (!currentTx) return { success: false, error: 'السند غير موجود' };

    const writtenReason = editReason?.trim() || 'تعديل بيانات السند المالي';
    const editEntry = {
      edited_at: new Date().toISOString(),
      edited_by_id: currentUser?.id || 'owner',
      edited_by_name: currentUser?.name || 'المدير العام',
      reason: writtenReason,
      action: 'UPDATE' as const,
      previous_data: {
        amount: currentTx.amount,
        reason: currentTx.reason,
        phone_number: currentTx.phone_number,
        note: currentTx.note
      }
    };

    const updated: Transaction = { 
      ...currentTx, 
      ...updates, 
      edit_history: [...(currentTx.edit_history || []), editEntry],
      updated_at: new Date().toISOString() 
    };
    const nextTxs = allTransactions.map(t => t.id === id ? updated : t);
    setAllTransactions(nextTxs);

    const audit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`,
      workspace_id: currentTx.workspace_id,
      team_id: currentTx.workspace_id,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المدير العام',
      action: 'UPDATE',
      table_name: 'transactions',
      record_id: updated.id,
      old_data: currentTx,
      new_data: updated,
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [audit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await cashService.syncTransactionAndAuditToCloud(
        updated,
        audit,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllTransactions(prev => prev.map(t => t.id === id ? { ...t, pending_sync: true } : t));
      } else {
        const balances = cashService.calculateStationBalances(stations, nextTxs);
        const curr = updated.currency === 'MRU' ? 'MRU' : 'MAD';
        const bal = balances[updated.station_id]?.[curr] ?? 0;
        await cashService.syncStationBalanceToCloud(updated.station_id, updated.workspace_id, curr, bal);
      }
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncTransaction(updated.workspace_id, updated).catch(() => {});
    }

    showToast('تم تعديل السند وتوثيق سجل المراجعة بنجاح', 'success');
    return { success: true };
  };

  const cancelTransaction = async (id: string, reason: string) => {
    if (userRole !== 'owner') return { success: false, error: 'صلاحية إلغاء السندات للمشرف فقط' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const currentTx = allTransactions.find(t => t.id === id);
    if (!currentTx) return { success: false, error: 'السند غير موجود' };

    const writtenReason = reason.trim() || 'إلغاء السند وإرجاع المبلغ للصندوق';
    const cancelEntry = {
      edited_at: new Date().toISOString(),
      edited_by_id: currentUser?.id || 'owner',
      edited_by_name: currentUser?.name || 'المدير العام',
      reason: writtenReason,
      action: 'CANCEL' as const,
      previous_data: {
        amount: currentTx.amount,
        status: currentTx.status
      }
    };

    const updated: Transaction = { 
      ...currentTx, 
      status: 'cancelled' as const, 
      cancelled_by_name: currentUser?.name || 'المدير العام',
      cancelled_at: new Date().toISOString(),
      cancel_reason: writtenReason,
      edit_history: [...(currentTx.edit_history || []), cancelEntry],
      note: `${currentTx.note ? currentTx.note + ' | ' : ''}[تم الإلغاء: ${writtenReason}]`,
      updated_at: new Date().toISOString() 
    };
    const nextTxs = allTransactions.map(t => t.id === id ? updated : t);
    setAllTransactions(nextTxs);

    const audit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`,
      workspace_id: currentTx.workspace_id,
      team_id: currentTx.workspace_id,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المدير العام',
      action: 'CANCEL',
      table_name: 'transactions',
      record_id: updated.id,
      old_data: currentTx,
      new_data: updated,
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [audit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await cashService.syncTransactionAndAuditToCloud(
        updated,
        audit,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllTransactions(prev => prev.map(t => t.id === id ? { ...t, pending_sync: true } : t));
      } else {
        const balances = cashService.calculateStationBalances(stations, nextTxs);
        const curr = updated.currency === 'MRU' ? 'MRU' : 'MAD';
        const bal = balances[updated.station_id]?.[curr] ?? 0;
        await cashService.syncStationBalanceToCloud(updated.station_id, updated.workspace_id, curr, bal);
      }
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncTransaction(updated.workspace_id, updated).catch(() => {});
    }

    showToast('تم إلغاء السند وتحديث رصيد الصندوق وتوثيق السبب', 'info');
    return { success: true };
  };

  // حذف سند مالي نهائياً (للمدير فقط)
  const deleteTransaction = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      const msg = 'صلاحية حذف السندات المالية للمدير المشرف فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTx = allTransactions.find(t => t.id === id);
    if (!targetTx) return { success: false, error: 'السند غير موجود' };

    const wsId = targetTx.workspace_id || currentWorkspace?.id || 'ws-default';
    setAllTransactions(prev => prev.filter(t => t.id !== id));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(id)) {
      try {
        await supabase.from('transactions').delete().eq('id', id);
      } catch {}
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteTransaction(wsId, id).catch(() => {});
    }

    showToast('تم حذف العملية المالية نهائياً من الصندوق والسجل', 'info');
    return { success: true };
  };

  // حذف عملية من سجل العمليات (للمدير فقط)
  const deleteAuditLog = (id: string) => {
    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      showToast('صلاحية مسح سجل العمليات للمدير فقط', 'error');
      return;
    }
    setAuditLogs(prev => prev.filter(a => a.id !== id));
    showToast('تم مسح العملية من السجل بنجاح', 'info');
  };

  const clearAuditLogs = () => {
    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      showToast('صلاحية مسح سجل العمليات للمدير فقط', 'error');
      return;
    }
    setAuditLogs([]);
    localStorage.removeItem('aman_audit_logs');
    showToast('تم مسح سجل المراجعة بالكامل', 'info');
  };

  // تنفيذ عملية صرف العملة الفعلية في لاكيس المحطة (بين الدرهم MAD والأوقية MRU أو العكس)
  const executeCurrencyExchange = async (params: {
    stationId: string;
    fromCurrency: 'MAD' | 'MRU';
    toCurrency: 'MAD' | 'MRU';
    fromAmount: number;
    toAmount: number;
    rate: number;
    customerName?: string;
    customerPhone?: string;
    note?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetStationId =
      userRole === 'worker' && userAssignedStationId ? userAssignedStationId : params.stationId;
    if (userRole === 'worker' && userAssignedStationId && params.stationId !== userAssignedStationId) {
      const msg = 'لا يمكنك تنفيذ صرف العملة في محطة أخرى غير محطة عملك';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const cleanFrom = Math.round(Number(params.fromAmount) * 100) / 100;
    const cleanTo = Math.round(Number(params.toAmount) * 100) / 100;
    if (!targetStationId || cleanFrom <= 0 || cleanTo <= 0) {
      return { success: false, error: 'يرجى تحديد المحطة وإدخال مبلغ صحيح للصرف' };
    }
    if (params.fromCurrency === params.toCurrency) {
      return { success: false, error: 'يجب اختيار عملتين مختلفتين (درهم ⇄ أوقية)' };
    }

    const custLabel = params.customerName?.trim()
      ? ` — الزبون: ${params.customerName.trim()}`
      : '';
    const extraNote = [
      `سعر الصرف: 1 درهم = ${params.rate} أوقية`,
      params.note?.trim() || '',
    ]
      .filter(Boolean)
      .join(' | ');

    // 1. إدخال المبلغ المستلم من الزبون إلى لاكيس المحطة (+)
    const inRes = await createTransaction({
      station_id: params.stationId,
      type: 'cash_in',
      amount: cleanFrom,
      currency: params.fromCurrency,
      phone_number: params.customerPhone?.trim() || '',
      reason: `صرف عملة (+ إيداع فلاكيس): قبض ${cleanFrom} ${params.fromCurrency} مقابل تسليم ${cleanTo} ${params.toCurrency}${custLabel}`,
      note: extraNote,
    });

    if (!inRes.success) {
      return { success: false, error: inRes.error || 'تعذر تسجيل قبض العملة المستلمة' };
    }

    // 2. إخراج المبلغ المصروف للزبون من لاكيس المحطة (-)
    const outRes = await createTransaction({
      station_id: params.stationId,
      type: 'cash_out',
      amount: cleanTo,
      currency: params.toCurrency,
      phone_number: params.customerPhone?.trim() || '',
      reason: `صرف عملة (- سحب من لاكيس): تسليم ${cleanTo} ${params.toCurrency} مقابل قبض ${cleanFrom} ${params.fromCurrency}${custLabel}`,
      note: extraNote,
    });

    if (!outRes.success) {
      return { success: false, error: outRes.error || 'تعذر تسجيل تسليم العملة للزبون' };
    }

    showToast(
      `تمت عملية الصرف فلاكيس بنجاح: (+${cleanFrom} ${params.fromCurrency}) و (-${cleanTo} ${params.toCurrency})`,
      'success'
    );
    return { success: true };
  };

  // ============================================================================
  // HAWALA / MONEY TRANSFERS BETWEEN STATIONS (حوالات مالية بين المحطات)
  // ============================================================================
  const moneyTransfers: MoneyTransfer[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const myWsId = currentWorkspace.id;

    // 1. Collect all payout transactions to know which transfers were paid out at destination
    const payoutMap = new Map<string, Transaction>();
    for (const tx of allTransactions) {
      const txWs = tx.workspace_id || tx.team_id || '';
      if (txWs === myWsId && tx.status === 'confirmed' && tx.type === 'cash_out' && tx.hawala_transfer_id) {
        payoutMap.set(tx.hawala_transfer_id, tx);
      }
    }

    // 2. Extract transfers from origin transactions (which sync via Firebase Firestore across Phone & PC)
    const mapById = new Map<string, MoneyTransfer>();
    for (const tx of allTransactions) {
      const txWs = tx.workspace_id || tx.team_id || '';
      if (txWs !== myWsId) continue;
      if (tx.status === 'cancelled') continue;
      if (tx.hawala_meta && tx.hawala_meta.id) {
        const meta = tx.hawala_meta;
        const payoutTx = payoutMap.get(meta.id);
        const resolvedStatus = payoutTx ? 'paid_out' : meta.status;
        const originSt = stations.find(s => s.id === meta.origin_station_id);
        const destSt = stations.find(s => s.id === meta.destination_station_id);
        mapById.set(meta.id, {
          ...meta,
          origin_station_name: originSt?.name || meta.origin_station_name,
          destination_station_name: destSt?.name || meta.destination_station_name,
          status: resolvedStatus,
          paid_out_at: payoutTx?.created_at || meta.paid_out_at || null,
          paid_out_by: payoutTx?.creator_name || meta.paid_out_by || null,
        });
      }
    }

    // 3. Also merge any legacy local transfers in localStorage for backward compatibility
    try {
      const raw = localStorage.getItem('alittihadia_hawala_transfers_v1');
      if (raw) {
        const parsed = JSON.parse(raw) as MoneyTransfer[];
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.id && item.workspace_id === myWsId && !mapById.has(item.id)) {
              const payoutTx = payoutMap.get(item.id);
              mapById.set(item.id, {
                ...item,
                status: payoutTx ? 'paid_out' : item.status,
                paid_out_at: payoutTx?.created_at || item.paid_out_at || null,
                paid_out_by: payoutTx?.creator_name || item.paid_out_by || null,
              });
            }
          }
        }
      }
    } catch {}

    const list = Array.from(mapById.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (userRole === 'worker' && userAssignedStationId) {
      return list.filter(
        t => t.origin_station_id === userAssignedStationId || t.destination_station_id === userAssignedStationId
      );
    }

    return list;
  }, [currentWorkspace, allTransactions, stations, userRole, userAssignedStationId]);

  const createMoneyTransfer = async (params: {
    origin_station_id: string;
    destination_station_id: string;
    sender_name: string;
    sender_phone: string;
    receiver_name: string;
    receiver_phone: string;
    send_amount: number;
    send_currency: 'MAD' | 'MRU';
    payout_amount: number;
    payout_currency: 'MAD' | 'MRU';
    exchange_rate: number;
    commission_amount: number;
    notes?: string;
  }): Promise<{ success: boolean; error?: string; transfer?: MoneyTransfer }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const sendAmt = Math.round(Number(params.send_amount) * 100) / 100;
    const payoutAmt = Math.round(Number(params.payout_amount) * 100) / 100;
    const commAmt = Math.max(0, Math.round((Number(params.commission_amount) || 0) * 100) / 100);

    if (userRole === 'worker' && userAssignedStationId && params.origin_station_id !== userAssignedStationId) {
      const msg = 'لا يمكنك إرسال حوالة مالية باسم محطة أخرى؛ يمكنك الإرسال من محطتك فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    if (!params.origin_station_id || !params.destination_station_id) {
      return { success: false, error: 'يرجى تحديد محطة الإرسال ومحطة الاستلام' };
    }
    if (params.origin_station_id === params.destination_station_id) {
      return { success: false, error: 'يرجى اختيار محطة استلام مختلفة عن محطة الإرسال' };
    }
    if (!params.sender_name.trim() || !params.receiver_name.trim() || sendAmt <= 0 || payoutAmt <= 0) {
      return { success: false, error: 'يرجى إدخال اسم المرسل والمستلم والمبلغ بشكل صحيح' };
    }

    const originSt = stations.find(s => s.id === params.origin_station_id);
    const destSt = stations.find(s => s.id === params.destination_station_id);
    const wsId = currentWorkspace?.id || 'ws-default';
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const secretPin = String(Math.floor(1000 + Math.random() * 9000));
    const transferCode = `HWL-${new Date().getFullYear()}-${randomNum}`;
    const transferId = `hwl-${Date.now()}-${randomNum}`;

    const newTransfer: MoneyTransfer = {
      id: transferId,
      transfer_code: transferCode,
      secret_pin: secretPin,
      workspace_id: wsId,
      origin_station_id: params.origin_station_id,
      destination_station_id: params.destination_station_id,
      origin_station_name: originSt?.name || 'محطة الإرسال',
      destination_station_name: destSt?.name || 'محطة الاستلام',
      sender_name: params.sender_name.trim(),
      sender_phone: params.sender_phone.trim(),
      receiver_name: params.receiver_name.trim(),
      receiver_phone: params.receiver_phone.trim(),
      send_amount: sendAmt,
      send_currency: params.send_currency,
      payout_amount: payoutAmt,
      payout_currency: params.payout_currency,
      exchange_rate: params.exchange_rate,
      commission_amount: commAmt,
      status: 'pending',
      created_by: currentUser.id,
      creator_name: currentUser.name,
      created_at: new Date().toISOString(),
      notes: params.notes?.trim() || undefined,
    };

    const totalCashIn = Math.round((sendAmt + commAmt) * 100) / 100;
    const commLabel = commAmt > 0 ? ` (شامل عمولة ${commAmt} ${params.send_currency})` : '';

    // 1. زيادة المبلغ فلاكيس محطة الإرسال (+) مع حفظ بيانات الحوالة للمزامنة الفورية مع محطة الاستلام
    const txRes = await createTransaction({
      station_id: params.origin_station_id,
      type: 'cash_in',
      amount: totalCashIn,
      currency: params.send_currency,
      phone_number: params.sender_phone.trim(),
      reason: `حوالة صادرة [${transferCode}] من ${originSt?.name || 'المحطة'} إلى ${destSt?.name || 'المحطة'} — المرسل: ${params.sender_name.trim()} للمستلم: ${params.receiver_name.trim()}${commLabel}`,
      note: `يسلم في محطة الوصول (${destSt?.name || ''}): ${payoutAmt} ${params.payout_currency} | كود التسليم: ${secretPin}`,
      hawala_meta: newTransfer,
      hawala_transfer_id: transferId,
    });

    if (!txRes.success) {
      return { success: false, error: txRes.error || 'تعذر تسجيل إيداع الحوالة في صندوق المحطة' };
    }

    try {
      const existing = JSON.parse(localStorage.getItem('alittihadia_hawala_transfers_v1') || '[]');
      localStorage.setItem('alittihadia_hawala_transfers_v1', JSON.stringify([newTransfer, ...existing]));
    } catch {}

    showToast(
      `تم تسجيل الحوالة [${transferCode}] وإضافة +${totalCashIn} ${params.send_currency} في لاكيس ${originSt?.name || 'المحطة'}`,
      'success'
    );
    return { success: true, transfer: newTransfer };
  };

  const payoutMoneyTransfer = async (transferId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const target = moneyTransfers.find(t => t.id === transferId);
    if (!target) return { success: false, error: 'الحوالة غير موجودة' };
    if (target.status === 'paid_out') return { success: false, error: 'تم تسليم وصرف هذه الحوالة مسبقاً' };

    if (userRole === 'worker' && userAssignedStationId && target.destination_station_id !== userAssignedStationId) {
      const msg = `لا تملك صلاحية تسليم هذه الحوالة لأنها موجهة إلى محطة "${target.destination_station_name}" فقط`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const paidAt = new Date().toISOString();
    const updatedTransfer: MoneyTransfer = {
      ...target,
      status: 'paid_out',
      paid_out_at: paidAt,
      paid_out_by: currentUser.name,
    };

    // 1. خصم المبلغ من لاكيس محطة الاستلام (-)
    const outRes = await createTransaction({
      station_id: target.destination_station_id,
      type: 'cash_out',
      amount: target.payout_amount,
      currency: target.payout_currency,
      phone_number: target.receiver_phone || target.sender_phone,
      reason: `تسليم حوالة واردة [${target.transfer_code}] للمستلم: ${target.receiver_name} (مرسلة من ${target.origin_station_name})`,
      note: `تم التسليم بواسطة ${currentUser.name} — المرسل: ${target.sender_name}`,
      hawala_transfer_id: target.id,
    });

    if (!outRes.success) {
      return { success: false, error: outRes.error || 'تعذر تسجيل صرف الحوالة من صندوق المحطة' };
    }

    // 2. تحديث حالة الحوالة في سند الإرسال الأصلي ومزامنته عبر Firebase
    setAllTransactions(prev =>
      prev.map(tx => {
        if (tx.hawala_meta && tx.hawala_meta.id === transferId) {
          const updatedOriginTx: Transaction = {
            ...tx,
            hawala_meta: updatedTransfer,
            updated_at: paidAt,
          };
          if (firebaseSyncService.isAvailable()) {
            firebaseSyncService.syncTransaction(updatedOriginTx.workspace_id, updatedOriginTx).catch(() => {});
          }
          return updatedOriginTx;
        }
        return tx;
      })
    );

    try {
      const existing = JSON.parse(localStorage.getItem('alittihadia_hawala_transfers_v1') || '[]') as MoneyTransfer[];
      if (Array.isArray(existing)) {
        const next = existing.map(item => (item.id === transferId ? updatedTransfer : item));
        localStorage.setItem('alittihadia_hawala_transfers_v1', JSON.stringify(next));
      }
    } catch {}

    showToast(
      `تم تسليم الحوالة [${target.transfer_code}] وخصم -${target.payout_amount} ${target.payout_currency} من لاكيس ${target.destination_station_name}`,
      'success'
    );
    return { success: true };
  };

  // Create Parcel
  const createParcel = async (data: {
    origin_station_id: string;
    destination_station_id: string;
    sender_name: string;
    sender_phone: string;
    receiver_name: string;
    receiver_phone: string;
    route?: string;
    description: string;
    category?: string;
    items_count?: number;
    weight_kg?: number;
    declared_value?: number;
    amount_due?: number;
    shipping_fee?: number;
    payer?: ParcelPayer;
    amount_paid?: number;
    cod_amount?: number;
    currency: string;
    payment_status?: PaymentStatus;
    notes?: string;
    condition?: ParcelCondition;
    condition_notes?: string;
  }) => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (userRole === 'worker' && userAssignedStationId && data.origin_station_id !== userAssignedStationId) {
      const msg = 'لا يمكنك تسجيل إرسالية من محطة أخرى؛ يمكنك الإرسال من محطة عملك فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const originSt = stations.find(s => s.id === data.origin_station_id);
    const destSt = stations.find(s => s.id === data.destination_station_id);
    const wsId = currentWorkspace?.id || 'ws-default';

    let parcelNumber: number;
    let tracking_code: string;
    const codeNumber = Math.floor(100 + Math.random() * 9900);

    if (isSupabaseConfigured()) {
      const seq = await parcelService.getNextParcelNumberAsync(wsId, allParcels);
      parcelNumber = seq.parcelNumber;
      tracking_code = formatTrackingCodeNumeric(seq.trackingCode, seq.parcelNumber);
    } else {
      const seq = parcelService.getNextParcelNumber(wsId, allParcels);
      parcelNumber = seq.parcelNumber;
      tracking_code = formatTrackingCodeNumeric(seq.trackingCode, seq.parcelNumber);
    }

    const amountDue = Math.round(Number(data.amount_due ?? data.shipping_fee ?? 0) * 100) / 100;
    const amountPaid = Math.round(Number(data.amount_paid ?? (data.payment_status === 'paid' ? amountDue : 0)) * 100) / 100;
    const payer: ParcelPayer = data.payer || (data.payment_status === 'cod' ? 'receiver' : 'sender');
    const parcelStatus: ParcelStatus = 'registered';
    const condition: ParcelCondition = data.condition || 'normal';
    const conditionNotes = condition === 'abnormal' ? (data.condition_notes?.trim() || null) : null;

    const newParcel: Parcel = {
      id: isSupabaseConfigured() ? generateUUID() : `pcl-${Date.now()}-${codeNumber}`,
      tracking_code,
      parcel_number: parcelNumber,
      workspace_id: wsId,
      team_id: wsId,
      origin_station_id: data.origin_station_id,
      destination_station_id: data.destination_station_id,
      origin_station_name: originSt?.name || 'محطة الانطلاق',
      destination_station_name: destSt?.name || 'محطة الوصول',
      sender_name: data.sender_name.trim(),
      sender_phone: data.sender_phone.trim(),
      receiver_name: data.receiver_name.trim(),
      receiver_phone: data.receiver_phone.trim(),
      route: (data.route || '').trim() || `${originSt?.city} ➔ الكركرات ➔ ${destSt?.city}`,
      description: data.description.trim(),
      category: data.category || 'طرد بضائع',
      items_count: Number(data.items_count) || 1,
      weight_kg: data.weight_kg ? Number(data.weight_kg) : undefined,
      declared_value: data.declared_value ? Number(data.declared_value) : undefined,
      amount_due: amountDue,
      shipping_fee: amountDue,
      payer,
      amount_paid: amountPaid,
      cod_amount: data.cod_amount ? Math.round(Number(data.cod_amount) * 100) / 100 : 0,
      currency: data.currency || 'MAD',
      status: parcelStatus,
      condition,
      condition_notes: conditionNotes,
      payment_status: amountPaid >= amountDue ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid'),
      status_history: [
        {
          status: parcelStatus,
          timestamp: new Date().toISOString(),
          changed_by_id: currentUser.id,
          changed_by_name: currentUser.name,
          notes: 'تسجيل الكولي في المحطة',
          condition,
          condition_notes: conditionNotes || undefined
        }
      ],
      payment_history: amountPaid > 0 ? [
        {
          id: `pay-${Date.now()}`,
          amount: amountPaid,
          currency: data.currency || 'MAD',
          paid_by: payer === 'sender' ? data.sender_name.trim() : data.receiver_name.trim(),
          recorded_by_id: currentUser.id,
          recorded_by_name: currentUser.name,
          recorded_at: new Date().toISOString(),
          note: 'الدفعة الأولى عند التسجيل'
        }
      ] : [],
      created_by: currentUser.id,
      creator_name: currentUser.name,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      notes: data.notes?.trim() || null,
    };

    setAllParcels(prev => [newParcel, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        newParcel,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => p.id === newParcel.id ? { ...p, pending_sync: true } : p));
      }
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(newParcel.workspace_id, newParcel).catch(err => {
        console.warn('Firebase parcel sync error:', err);
      });
    }

    if (amountPaid > 0) {
      await createTransaction({
        station_id: newParcel.origin_station_id,
        type: 'parcel_shipping_fee',
        amount: amountPaid,
        currency: newParcel.currency,
        phone_number: newParcel.sender_phone,
        reason: `أجرة شحن الكولي [${newParcel.tracking_code}] إلى ${destSt?.city}`,
        note: `شحن ${newParcel.items_count} طرد - ${newParcel.description}`,
        parcel_id: newParcel.id,
      });
    }

    showToast(`تم تسجيل الإرسالية [${tracking_code}] بنجاح`, 'success');
    return { success: true, parcel: newParcel };
  };

  const updateParcelStatus = async (
    id: string, 
    status: ParcelStatus, 
    notesOrMeta?: { delivered_to?: string; notes?: string; condition?: ParcelCondition; condition_notes?: string } | string,
    deliveredTo?: string
  ) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const parcel = allParcels.find(p => p.id === id);
    if (!parcel) return { success: false, error: 'الكولي غير موجود' };
    if (currentWorkspace && parcel.workspace_id && parcel.workspace_id !== currentWorkspace.id) {
      const msg = 'لا يمكن تعديل حالة طرد تابع لمساحة عمل أخرى (صلاحية قراءة وتتبع فقط)';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // قيد صلاحية العامل حسب محطته فقط
    if (userRole === 'worker' && userAssignedStationId) {
      if ((status === 'arrived' || status === 'delivered') && parcel.destination_station_id !== userAssignedStationId) {
        const msg = `لا يمكنك استلام أو تسليم هذا الكولي لأنه موجه إلى محطة "${parcel.destination_station_name}"`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (status === 'in_transit' && parcel.origin_station_id !== userAssignedStationId) {
        const msg = `لا يمكنك إطلاق هذا الكولي لأنه صادر من محطة "${parcel.origin_station_name}"`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    const noteText = typeof notesOrMeta === 'string' ? notesOrMeta : notesOrMeta?.notes;
    const deliveredPerson = typeof notesOrMeta === 'object' ? notesOrMeta?.delivered_to : deliveredTo;
    const metaCondition = typeof notesOrMeta === 'object' ? notesOrMeta?.condition : undefined;
    const metaConditionNotes = typeof notesOrMeta === 'object' ? notesOrMeta?.condition_notes : undefined;

    const finalCondition: ParcelCondition = metaCondition || parcel.condition || 'normal';
    const finalConditionNotes = metaCondition === 'abnormal' 
      ? (metaConditionNotes || parcel.condition_notes) 
      : (metaCondition === 'normal' ? null : parcel.condition_notes);

    const newHistoryEntry: ParcelStatusHistoryEntry = {
      status,
      timestamp: new Date().toISOString(),
      changed_by_id: currentUser?.id || 'sys',
      changed_by_name: currentUser?.name || 'المستخدم',
      notes: noteText || undefined,
      condition: finalCondition,
      condition_notes: finalCondition === 'abnormal' ? (finalConditionNotes || undefined) : undefined,
    };

    const updated: Parcel = {
      ...parcel,
      status,
      condition: finalCondition,
      condition_notes: finalConditionNotes,
      updated_at: new Date().toISOString(),
      notes: noteText ? `${parcel.notes || ''} [${noteText}]` : parcel.notes,
      status_history: [...(parcel.status_history || []), newHistoryEntry],
    };

    if (status === 'delivered') {
      updated.delivered_at = new Date().toISOString();
      updated.delivered_to = deliveredPerson || parcel.receiver_name;

      const codAmount = parcel.cod_amount ?? 0;
      if (codAmount > 0) {
        await createTransaction({
          station_id: parcel.destination_station_id,
          type: 'parcel_cod_collection',
          amount: codAmount,
          currency: parcel.currency,
          phone_number: parcel.receiver_phone,
          reason: `تحصيل مبلغ COD للكولي [${parcel.tracking_code}] من المستلم`,
          note: `المستلم: ${updated.delivered_to}`,
          parcel_id: parcel.id,
        });
      }
    }

    setAllParcels(prev => prev.map(p => p.id === id ? updated : p));

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updated,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => p.id === id ? { ...p, pending_sync: true } : p));
      }
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updated.workspace_id, updated).catch(err => {
        console.warn('Firebase parcel sync error:', err);
      });
    }

    showToast(`تم تحديث حالة الكولي [${parcel.tracking_code}] إلى "${status}"`, 'success');
    return { success: true };
  };

  const recordParcelPayment = async (
    parcelId: string, 
    amount: number, 
    paidBy: string, 
    note?: string
  ) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return { success: false, error: 'الكولي غير موجود' };
    if (currentWorkspace && parcel.workspace_id && parcel.workspace_id !== currentWorkspace.id) {
      const msg = 'لا يمكن تسجيل دفعة لطرد تابع لمساحة عمل أخرى';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const paymentAmount = Math.round(Number(amount) * 100) / 100;
    const newAmountPaid = Math.round(((parcel.amount_paid || 0) + paymentAmount) * 100) / 100;
    const newPaymentEntry: ParcelPaymentEntry = {
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      amount: paymentAmount,
      currency: parcel.currency,
      paid_by: paidBy.trim() || 'العميل',
      recorded_by_id: currentUser?.id || 'sys',
      recorded_by_name: currentUser?.name || 'المستخدم',
      recorded_at: new Date().toISOString(),
      note: note?.trim(),
    };

    const newPaymentStatus: PaymentStatus = newAmountPaid >= parcel.amount_due ? 'paid' : (newAmountPaid > 0 ? 'partial' : 'unpaid');

    const updated: Parcel = {
      ...parcel,
      amount_paid: newAmountPaid,
      payment_status: newPaymentStatus,
      payment_history: [...(parcel.payment_history || []), newPaymentEntry],
      updated_at: new Date().toISOString(),
    };

    setAllParcels(prev => prev.map(p => p.id === parcelId ? updated : p));

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updated,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => p.id === parcelId ? { ...p, pending_sync: true } : p));
      }
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updated.workspace_id, updated).catch(() => {});
    }

    const paymentStationId =
      userRole === 'worker' && userAssignedStationId
        ? userAssignedStationId
        : parcel.status === 'arrived' || parcel.status === 'delivered'
        ? parcel.destination_station_id
        : parcel.origin_station_id;

    await createTransaction({
      station_id: paymentStationId,
      type: 'parcel_shipping_fee',
      amount: paymentAmount,
      currency: parcel.currency,
      phone_number: parcel.payer === 'sender' ? parcel.sender_phone : parcel.receiver_phone,
      reason: `دفعة شحن للكولي [${parcel.tracking_code}] من ${paidBy}`,
      note: note || `سداد جزئي/كلي للكولي`,
      parcel_id: parcel.id,
    });

    return { success: true };
  };

  const updateParcel = async (id: string, updates: Partial<Parcel>) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const parcel = allParcels.find(p => p.id === id);
    if (!parcel) return { success: false, error: 'الكولي غير موجود' };
    if (currentWorkspace && parcel.workspace_id && parcel.workspace_id !== currentWorkspace.id) {
      const msg = 'لا يمكن تعديل بيانات طرد تابع لمساحة عمل أخرى';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const now = new Date().toISOString();
    const updated = { ...parcel, ...updates, updated_at: now };
    setAllParcels(prev => prev.map(p => p.id === id ? updated : p));

    // Phase 4: Record an audit-log entry showing old and new values when editing parcel data
    const audit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`,
      workspace_id: parcel.workspace_id,
      team_id: parcel.workspace_id,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المستخدم',
      action: 'UPDATE',
      table_name: 'parcels',
      record_id: parcel.id,
      reason: 'تعديل البيانات الأساسية للكولي',
      old_data: {
        sender_name: parcel.sender_name,
        sender_phone: parcel.sender_phone,
        receiver_name: parcel.receiver_name,
        receiver_phone: parcel.receiver_phone,
        description: parcel.description,
        items_count: parcel.items_count,
        weight_kg: parcel.weight_kg,
        notes: parcel.notes,
      },
      new_data: {
        sender_name: updated.sender_name,
        sender_phone: updated.sender_phone,
        receiver_name: updated.receiver_name,
        receiver_phone: updated.receiver_phone,
        description: updated.description,
        items_count: updated.items_count,
        weight_kg: updated.weight_kg,
        notes: updated.notes,
      },
      created_at: now,
    };
    setAuditLogs(prev => [audit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updated,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => p.id === id ? { ...p, pending_sync: true } : p));
      }
      await cashService.syncAuditToCloud(audit);
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updated.workspace_id, updated).catch(() => {});
    }

    showToast('تم تعديل بيانات الإرسالية وتوثيق التعديل في سجل المراجعة', 'success');
    return { success: true };
  };

  // Phase 3: Initiate return of an arrived, uncollected parcel to sender
  const initiateParcelReturn = async (
    parcelId: string,
    data: { returnReason: string; returnNotes?: string; returnFee?: number }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (!data.returnReason || !data.returnReason.trim()) {
      return { success: false, error: 'يرجى اختيار سبب إرجاع الطرد إلى المرسل (حقل إلزامي)' };
    }

    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return { success: false, error: 'الطرد غير موجود' };

    if (parcel.status === 'delivered' || parcel.status === 'returned') {
      return { success: false, error: 'لا يمكن إرجاع طرد تم تسليمه مسبقاً' };
    }

    // Check role / station authorization: admin or worker assigned to destination station
    if (userRole === 'worker' && userAssignedStationId && userAssignedStationId !== parcel.destination_station_id) {
      return { success: false, error: 'يمكن فقط لعامل محطة الوجهة أو مدير مساحة العمل بدء إرجاع هذا الطرد' };
    }

    const now = new Date().toISOString();
    const fee = Math.max(0, Math.round((Number(data.returnFee) || 0) * 100) / 100);
    const reasonText = data.returnReason.trim();
    const notesText = data.returnNotes?.trim() || null;

    const historyEntry: ParcelStatusHistoryEntry = {
      status: 'return_in_transit',
      timestamp: now,
      changed_by_id: currentUser.id,
      changed_by_name: currentUser.name,
      return_reason: reasonText,
      condition: parcel.condition,
      condition_notes: parcel.condition_notes || undefined,
      notes: `إرجاع: بدء إرجاع الطرد إلى المرسل من [${parcel.destination_station_name}] إلى [${parcel.origin_station_name}] — السبب: ${reasonText}${notesText ? ' (' + notesText + ')' : ''}${fee > 0 ? ` — رسوم الإرجاع: ${fee} ${parcel.currency}` : ''}`,
    };

    const updatedParcel: Parcel = {
      ...parcel,
      status: 'return_in_transit',
      is_returning: true,
      return_reason: reasonText,
      return_notes: notesText,
      return_fee: fee,
      return_initiated_at: now,
      return_initiated_by: currentUser.id,
      current_trip_id: null,
      status_history: [...(parcel.status_history || []), historyEntry],
      updated_at: now,
    };

    setAllParcels(prev => prev.map(p => (p.id === parcelId ? updatedParcel : p)));

    const audit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`,
      workspace_id: parcel.workspace_id,
      team_id: parcel.workspace_id,
      user_id: currentUser.id,
      user_name: currentUser.name,
      action: 'STATUS_CHANGE',
      table_name: 'parcels',
      record_id: parcel.id,
      reason: `إرجاع إلى المرسل: ${reasonText}`,
      old_data: { status: parcel.status },
      new_data: { status: 'return_in_transit', return_reason: reasonText, return_notes: notesText, return_fee: fee },
      created_at: now,
    };
    setAuditLogs(prev => [audit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updatedParcel,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => (p.id === parcelId ? { ...p, pending_sync: true } : p)));
      }
      await cashService.syncAuditToCloud(audit);
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updatedParcel.workspace_id, updatedParcel).catch(() => {});
    }

    showToast(`تم تحويل الطرد [${parcel.tracking_code}] إلى مسار الإرجاع للمرسل`, 'info');
    return { success: true };
  };

  // Phase 3: Handover a returning parcel back to the original sender
  const handoverReturnedParcelToSender = async (
    parcelId: string,
    data: { senderReceivedByName: string; returnFeePaid?: number; notes?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const parcel = allParcels.find(p => p.id === parcelId);
    if (!parcel) return { success: false, error: 'الطرد غير موجود' };

    if (userRole === 'worker' && userAssignedStationId && parcel.origin_station_id !== userAssignedStationId) {
      const msg = `يمكن فقط لعامل محطة الانطلاق الأصلية (${parcel.origin_station_name}) أو المدير تسليم الطرد المرتجع للمرسل`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const recipientSenderName = data.senderReceivedByName.trim() || parcel.sender_name;
    const feePaid = Math.max(0, Math.round((Number(data.returnFeePaid) || 0) * 100) / 100);
    const now = new Date().toISOString();

    const historyEntry: ParcelStatusHistoryEntry = {
      status: 'returned',
      timestamp: now,
      changed_by_id: currentUser.id,
      changed_by_name: currentUser.name,
      return_reason: parcel.return_reason || undefined,
      condition: parcel.condition,
      condition_notes: parcel.condition_notes || undefined,
      notes: `تم إرجاع وتسليم الطرد إلى المرسل (${recipientSenderName})${feePaid > 0 ? ` وتحصيل رسوم إرجاع بقيمة ${feePaid} ${parcel.currency}` : ''}${data.notes?.trim() ? ' — ' + data.notes.trim() : ''}`,
    };

    const nextPayments = [...(parcel.payment_history || [])];
    if (feePaid > 0) {
      nextPayments.push({
        id: `pay-ret-${Date.now()}`,
        amount: feePaid,
        currency: parcel.currency,
        paid_by: recipientSenderName,
        recorded_by_id: currentUser.id,
        recorded_by_name: currentUser.name,
        recorded_at: now,
        note: 'رسوم إرجاع الطرد المحصلة من المرسل عند التسليم',
      });
    }

    const updatedParcel: Parcel = {
      ...parcel,
      status: 'returned',
      is_returning: true,
      returned_to_sender_at: now,
      returned_to_sender_name: recipientSenderName,
      status_history: [...(parcel.status_history || []), historyEntry],
      payment_history: nextPayments,
      updated_at: now,
    };

    setAllParcels(prev => prev.map(p => (p.id === parcelId ? updatedParcel : p)));

    const audit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-${Date.now()}`,
      workspace_id: parcel.workspace_id,
      team_id: parcel.workspace_id,
      user_id: currentUser.id,
      user_name: currentUser.name,
      action: 'STATUS_CHANGE',
      table_name: 'parcels',
      record_id: parcel.id,
      reason: `تسليم الطرد المرتجع للمرسل: ${recipientSenderName}`,
      old_data: { status: parcel.status },
      new_data: { status: 'returned', returned_to_sender_name: recipientSenderName, return_fee_paid: feePaid },
      created_at: now,
    };
    setAuditLogs(prev => [audit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updatedParcel,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => (p.id === parcelId ? { ...p, pending_sync: true } : p)));
      }
      await cashService.syncAuditToCloud(audit);
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updatedParcel.workspace_id, updatedParcel).catch(() => {});
    }

    // If a return fee was paid by the sender at handover, record a normal cash_in/parcel_shipping_fee voucher (no automatic refund of original payment)
    if (feePaid > 0) {
      await createTransaction({
        station_id: parcel.origin_station_id,
        type: 'parcel_shipping_fee',
        amount: feePaid,
        currency: parcel.currency,
        phone_number: parcel.sender_phone,
        reason: `تحصيل رسوم إرجاع الطرد [${parcel.tracking_code}] من المرسل (${recipientSenderName})`,
        note: `إرجاع بسبب: ${parcel.return_reason || 'عدم الاستلام'}`,
        parcel_id: parcel.id,
      });
    }

    showToast(`تم تسليم الطرد المرتجع [${parcel.tracking_code}] إلى المرسل (${recipientSenderName}) بنجاح`, 'success');
    return { success: true };
  };

  // Phase 3: Update workspace setting "عدد أيام الانتظار قبل الإرجاع"
  const updateUnclaimedDaysThreshold = async (days: number): Promise<{ success: boolean; error?: string }> => {
    const cleanDays = Math.max(1, Math.min(90, Math.round(Number(days) || 7)));
    if (!currentWorkspace) return { success: false, error: 'لا توجد مساحة عمل نشطة' };

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(currentWorkspace.id)) {
      const { error } = await supabase
        .from('workspaces')
        .update({ unclaimed_days_threshold: cleanDays, updated_at: new Date().toISOString() })
        .eq('id', currentWorkspace.id);
      if (error) {
        showToast(`تعذر حفظ إعداد أيام الانتظار في السحابة: ${error.message}`, 'error');
        return { success: false, error: error.message };
      }
    }

    setCurrentWorkspace(prev => (prev ? { ...prev, unclaimed_days_threshold: cleanDays } : null));
    showToast(`تم تحديث عدد أيام الانتظار قبل تنبيه الإرجاع إلى ${cleanDays} يوم`, 'success');
    return { success: true };
  };

  const getParcelByTrackingCode = (code: string): Parcel | undefined => {
    if (!code) return undefined;
    return parcels.find(p => matchesTrackingCode(p, code));
  };

  const fetchPublicParcelTracking = async (
    code: string
  ): Promise<{ success: boolean; error?: string; parcel?: Partial<Parcel> & { workspace_name?: string } }> => {
    const clean = extractTrackingQueryCode(code).toUpperCase();
    if (!clean || clean.length < 1) {
      return { success: false, error: 'يرجى إدخال كود التتبع (مثال: 0000466) بشكل صحيح' };
    }

    // 1. Check all local parcels first
    const localFound = allParcels.find(p => matchesTrackingCode(p, clean));
    if (localFound) {
      return {
        success: true,
        parcel: {
          ...localFound,
          tracking_code: formatTrackingCodeNumeric(localFound.tracking_code, localFound.parcel_number),
          workspace_name:
            currentWorkspace?.custom_brand_name ||
            currentWorkspace?.name ||
            'محطة الاتحادية',
        },
      };
    }

    // 2. Query Supabase public RPC if configured
    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase.rpc('rpc_get_public_parcel_tracking', {
          p_tracking_code: clean,
        });
        if (!error && data && data.success && data.parcel) {
          return {
            success: true,
            parcel: data.parcel,
          };
        }
        if (data && data.error) {
          return { success: false, error: data.error };
        }
      } catch (err) {
        console.warn('Public tracking RPC error:', err);
      }
    }

    return {
      success: false,
      error: `لم يتم العثور على أي شحنة برقم التتبع [${clean}]`,
    };
  };

  const updateWorkspaceBranding = async (branding: {
    custom_brand_name?: string;
    custom_brand_subtitle?: string;
    custom_brand_phone?: string;
    custom_brand_logo_url?: string;
    customBrandName?: string;
    customBrandSubtitle?: string;
    customBrandPhone?: string;
    customBrandLogoUrl?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace) return { success: false, error: 'لا توجد مساحة عمل نشطة' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (isPlan2TwoStations) {
      const msg = 'في الباك الأول (99 درهم) تخرج الملصقات والبونات باسم التطبيق الرسمي ولوغو التطبيق فقط ولا يمكن تغييرهم. لتخصيص اللوغو والاسم يرجى تفعيل الباك الثاني (199 درهم).';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const cleanName = (branding.custom_brand_name ?? branding.customBrandName)?.trim() || '';
    const cleanSub = (branding.custom_brand_subtitle ?? branding.customBrandSubtitle)?.trim() || '';
    const cleanPhone = (branding.custom_brand_phone ?? branding.customBrandPhone)?.trim() || '';
    const cleanLogo = (branding.custom_brand_logo_url ?? branding.customBrandLogoUrl)?.trim() || '';

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(currentWorkspace.id)) {
      await supabase
        .from('workspaces')
        .update({
          custom_brand_name: cleanName || null,
          custom_brand_subtitle: cleanSub || null,
          custom_brand_phone: cleanPhone || null,
          custom_brand_logo_url: cleanLogo || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentWorkspace.id);
    }

    setCurrentWorkspace(prev =>
      prev
        ? {
            ...prev,
            name: cleanName || prev.name,
            custom_brand_name: cleanName,
            custom_brand_subtitle: cleanSub,
            custom_brand_phone: cleanPhone,
            custom_brand_logo_url: cleanLogo,
          }
        : null
    );

    try {
      localStorage.setItem(
        `alittihadia_branding_${currentWorkspace.id}`,
        JSON.stringify({
          custom_brand_name: cleanName,
          custom_brand_subtitle: cleanSub,
          custom_brand_phone: cleanPhone,
          custom_brand_logo_url: cleanLogo,
        })
      );
    } catch {}

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncWorkspace({
        ...currentWorkspace,
        name: cleanName || currentWorkspace.name,
        custom_brand_name: cleanName,
        custom_brand_subtitle: cleanSub,
        custom_brand_phone: cleanPhone,
        custom_brand_logo_url: cleanLogo,
      }).catch(err => {
        console.warn('Firebase workspace sync error:', err);
      });
    }

    showToast('تم حفظ اسم وهوية وشعار المحطة بنجاح', 'success');
    return { success: true };
  };

  // ============================================================================
  // TRIPS & DISPATCH MODULE (إدارة رحلات الشحن والتفريغ بين المحطات)
  // ============================================================================

  const createTrip = async (params: {
    driverName: string;
    driverPhone?: string;
    vehiclePlate: string;
    originStationId: string;
    destinationStationId: string;
    notes?: string;
    fuelExpense?: number;
    tollExpense?: number;
    driverCommission?: number;
    otherExpense?: number;
    expenseCurrency?: string;
    deductFromCashbox?: boolean;
  }): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentWorkspace || !currentUser) {
      return { success: false, error: 'غير مسجل الدخول' };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (userRole === 'worker' && userAssignedStationId && params.originStationId !== userAssignedStationId) {
      const msg = 'لا يمكنك إنشاء رحلة شحن من محطة أخرى؛ يمكنك الإنشاء من محطة عملك فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const originSt = stations.find(s => s.id === params.originStationId);
    const destSt = stations.find(s => s.id === params.destinationStationId);

    const res = tripService.createTrip(
      {
        workspaceId: currentWorkspace.id,
        driverName: params.driverName,
        driverPhone: params.driverPhone,
        vehiclePlate: params.vehiclePlate,
        originStationId: params.originStationId,
        destinationStationId: params.destinationStationId,
        originStationName: originSt?.name,
        destinationStationName: destSt?.name,
        notes: params.notes,
        fuelExpense: params.fuelExpense,
        tollExpense: params.tollExpense,
        driverCommission: params.driverCommission,
        otherExpense: params.otherExpense,
        expenseCurrency: params.expenseCurrency,
        deductFromCashbox: params.deductFromCashbox,
        userId: currentUser.id,
        userName: currentUser.name,
        onErrorToast: (msg: string) => showToast(msg, 'error')
      },
      allTrips
    );

    setAllTrips(res.updatedList);
    setRememberedDrivers(tripService.getRememberedDrivers());
    setRememberedPlates(tripService.getRememberedPlates());

    // خصم مصاريف الطريق للسائق تلقائياً كسند صرف من صندوق محطة الانطلاق إذا طُلب ذلك
    const totalExpenses =
      (Number(params.fuelExpense) || 0) +
      (Number(params.tollExpense) || 0) +
      (Number(params.driverCommission) || 0) +
      (Number(params.otherExpense) || 0);

    if (params.deductFromCashbox && totalExpenses > 0) {
      const parts: string[] = [];
      if (Number(params.fuelExpense) > 0) parts.push(`مازوط: ${params.fuelExpense}`);
      if (Number(params.tollExpense) > 0) parts.push(`طريق سيار/معبر: ${params.tollExpense}`);
      if (Number(params.driverCommission) > 0) parts.push(`عمولة السائق: ${params.driverCommission}`);
      if (Number(params.otherExpense) > 0) parts.push(`أخرى: ${params.otherExpense}`);

      await createTransaction({
        station_id: params.originStationId,
        type: 'cash_out',
        amount: Math.round(totalExpenses * 100) / 100,
        currency: params.expenseCurrency || 'MAD',
        phone_number: params.driverPhone || '',
        reason: `مصاريف الطريق للرحلة [${res.trip.trip_code}] — السائق: ${params.driverName}`,
        note: parts.join(' | '),
      });
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable() && res.trip) {
      firebaseSyncService.syncTrip(currentWorkspace.id, res.trip).catch(err => {
        console.warn('Firebase trip sync error:', err);
      });
    }

    showToast(`تم إنشاء الرحلة [${res.trip.trip_code}] بنجاح`, 'success');
    return { success: true, trip: res.trip };
  };

  const updateTripExpenses = async (
    tripId: string,
    expenses: {
      fuelExpense: number;
      tollExpense: number;
      driverCommission: number;
      otherExpense: number;
      expenseCurrency: string;
      deductFromCashbox?: boolean;
    }
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const existingTrip = allTrips.find(t => t.id === tripId);
    if (!existingTrip) return { success: false, error: 'الرحلة غير موجودة' };

    const wasAlreadyDeducted = Boolean(existingTrip.deduct_from_cashbox);
    const res = tripService.updateTripExpenses(
      tripId,
      expenses,
      allTrips,
      (msg: string) => showToast(msg, 'error')
    );

    if (res.success && res.trip) {
      setAllTrips(res.updatedTrips);

      const totalExpenses =
        (Number(expenses.fuelExpense) || 0) +
        (Number(expenses.tollExpense) || 0) +
        (Number(expenses.driverCommission) || 0) +
        (Number(expenses.otherExpense) || 0);

      if (expenses.deductFromCashbox && !wasAlreadyDeducted && totalExpenses > 0) {
        const parts: string[] = [];
        if (Number(expenses.fuelExpense) > 0) parts.push(`مازوط: ${expenses.fuelExpense}`);
        if (Number(expenses.tollExpense) > 0) parts.push(`طريق سيار/معبر: ${expenses.tollExpense}`);
        if (Number(expenses.driverCommission) > 0) parts.push(`عمولة السائق: ${expenses.driverCommission}`);
        if (Number(expenses.otherExpense) > 0) parts.push(`أخرى: ${expenses.otherExpense}`);

        await createTransaction({
          station_id: existingTrip.origin_station_id,
          type: 'cash_out',
          amount: Math.round(totalExpenses * 100) / 100,
          currency: expenses.expenseCurrency || 'MAD',
          phone_number: existingTrip.driver_phone || '',
          reason: `مصاريف الطريق للرحلة [${existingTrip.trip_code}] — السائق: ${existingTrip.driver_name}`,
          note: parts.join(' | '),
        });
      }
      if (firebaseSyncService.isAvailable() && res.trip) {
        firebaseSyncService.syncTrip(res.trip.workspace_id, res.trip).catch(() => {});
      }

      showToast(`تم حفظ وتحديث مصاريف الرحلة [${existingTrip.trip_code}] بنجاح`, 'success');
    }

    return { success: res.success, error: res.error, trip: res.trip };
  };

  const loadParcelToTrip = async (
    tripId: string,
    parcelIdentifier: string
  ): Promise<{ success: boolean; error?: string; warning?: string; trip?: Trip; parcel?: Parcel }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForLoad = allTrips.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForLoad && targetTripForLoad.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك شحن الكوليات في هذه الرحلة لأنها تنطلق من محطة "${targetTripForLoad.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.loadParcelToTrip(
      tripId,
      parcelIdentifier,
      { id: currentUser.id, name: currentUser.name },
      allTrips,
      allParcels,
      userAssignedStationId || undefined,
      (msg: string) => showToast(msg, 'error')
    );

    if (res.success) {
      setAllTrips(res.updatedTrips);
      setAllParcels(res.updatedParcels);
      if (firebaseSyncService.isAvailable()) {
        if (res.trip) firebaseSyncService.syncTrip(res.trip.workspace_id, res.trip).catch(() => {});
        if (res.parcel) firebaseSyncService.syncParcel(res.parcel.workspace_id, res.parcel).catch(() => {});
      }
    }
    return {
      success: res.success,
      error: res.error,
      warning: res.warning,
      trip: res.trip,
      parcel: res.parcel
    };
  };

  const unloadParcelFromTrip = async (
    tripId: string,
    parcelId: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForUnload = allTrips.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForUnload && targetTripForUnload.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك تعديل شحن هذه الرحلة لأنها تنطلق من محطة "${targetTripForUnload.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.unloadParcelFromTrip(
      tripId,
      parcelId,
      { id: currentUser.id, name: currentUser.name },
      allTrips,
      allParcels,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      setAllTrips(res.updatedTrips);
      setAllParcels(res.updatedParcels);
      if (firebaseSyncService.isAvailable()) {
        if (res.trip) firebaseSyncService.syncTrip(res.trip.workspace_id, res.trip).catch(() => {});
        const updatedP = res.updatedParcels.find(p => p.id === parcelId);
        if (updatedP) firebaseSyncService.syncParcel(updatedP.workspace_id, updatedP).catch(() => {});
      }
    }
    return { success: res.success, error: res.error, trip: res.trip };
  };

  const departTrip = async (
    tripId: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForDepart = allTrips.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForDepart && targetTripForDepart.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك إطلاق هذه الرحلة لأنها تابعة لمحطة "${targetTripForDepart.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.departTrip(
      tripId,
      { id: currentUser.id, name: currentUser.name },
      allTrips,
      allParcels,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      setAllTrips(res.updatedTrips);
      if (firebaseSyncService.isAvailable() && res.trip) {
        firebaseSyncService.syncTrip(res.trip.workspace_id, res.trip).catch(() => {});
      }
    }
    return { success: res.success, error: res.error, trip: res.trip };
  };

  const receiveParcelAtDestination = async (
    tripId: string,
    parcelIdentifier: string,
    condition: ParcelCondition,
    conditionNotes?: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip; parcel?: Parcel; allScanned?: boolean }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForReceive = allTrips.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForReceive && targetTripForReceive.destination_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك استقبال وتفريغ هذه الرحلة لأنها متجهة إلى محطة "${targetTripForReceive.destination_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.receiveParcelAtDestination(
      tripId,
      parcelIdentifier,
      condition,
      conditionNotes,
      { id: currentUser.id, name: currentUser.name },
      allTrips,
      allParcels,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      setAllTrips(res.updatedTrips);
      setAllParcels(res.updatedParcels);
      if (firebaseSyncService.isAvailable()) {
        if (res.trip) firebaseSyncService.syncTrip(res.trip.workspace_id, res.trip).catch(() => {});
        if (res.parcel) firebaseSyncService.syncParcel(res.parcel.workspace_id, res.parcel).catch(() => {});
      }
    }
    return {
      success: res.success,
      error: res.error,
      trip: res.trip,
      parcel: res.parcel,
      allScanned: res.allScanned
    };
  };

  const closeTrip = async (
    tripId: string,
    closeReason?: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForClose = allTrips.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForClose && targetTripForClose.destination_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك إغلاق هذه الرحلة لأنها متجهة إلى محطة "${targetTripForClose.destination_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.closeTrip(
      tripId,
      { id: currentUser.id, name: currentUser.name },
      closeReason,
      allTrips,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      setAllTrips(res.updatedTrips);
      if (firebaseSyncService.isAvailable() && res.trip) {
        firebaseSyncService.syncTrip(res.trip.workspace_id, res.trip).catch(() => {});
      }
    }
    return { success: res.success, error: res.error, trip: res.trip };
  };

  // حذف كولي نهائياً (للمدير فقط)
  const deleteParcel = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      const msg = 'صلاحية حذف الكوليات للمدير المشرف فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetParcel = allParcels.find(p => p.id === id);
    if (!targetParcel) return { success: false, error: 'الكولي غير موجود' };

    const wsId = targetParcel.workspace_id || currentWorkspace?.id || 'ws-default';
    setAllParcels(prev => prev.filter(p => p.id !== id));

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(id)) {
      try {
        await supabase.from('parcels').delete().eq('id', id);
      } catch {}
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteParcel(wsId, id).catch(() => {});
    }

    showToast(`تم حذف الكولي [${targetParcel.tracking_code}] نهائياً`, 'info');
    return { success: true };
  };

  // حذف رحلة نهائياً (للمدير فقط)
  const deleteTrip = async (tripId: string): Promise<{ success: boolean; error?: string }> => {
    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      const msg = 'صلاحية حذف الرحلات للمدير المشرف فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTrip = allTrips.find(t => t.id === tripId);
    if (!targetTrip) return { success: false, error: 'الرحلة غير موجودة' };

    const wsId = targetTrip.workspace_id || currentWorkspace?.id || 'ws-default';
    setAllTrips(prev => {
      const next = prev.filter(t => t.id !== tripId);
      storageService.set('TRIPS', next);
      return next;
    });

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(tripId)) {
      try {
        await supabase.from('trips').delete().eq('id', tripId);
      } catch {}
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteTrip(wsId, tripId).catch(() => {});
    }

    showToast(`تم حذف الرحلة [${targetTrip.trip_code}] نهائياً`, 'info');
    return { success: true };
  };

  const removeRememberedDriver = (name: string) => {
    const next = tripService.removeRememberedDriver(name);
    setRememberedDrivers(next);
  };

  const removeRememberedPlate = (plate: string) => {
    const next = tripService.removeRememberedPlate(plate);
    setRememberedPlates(next);
  };

  const addBalanceAdjustment = async (stationId: string, currency: string, amount: number, note: string) => {
    if (userRole !== 'owner') return { success: false, error: 'غير مصرح' };
    const st = stations.find(s => s.id === stationId);
    
    return await createTransaction({
      station_id: stationId,
      type: amount >= 0 ? 'cash_in' : 'cash_out',
      amount: Math.abs(amount),
      currency,
      reason: `تسوية رصيد الصندوق من المشرف (${st?.city})`,
      note: note || 'تسوية محاسبية',
    });
  };

  const createTeam = async (name: string) => {
    if (!currentUser) return { success: false, error: 'غير مسجل' };
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_create_workspace', {
          p_name: name.trim()
        });
        if (!rpcErr && rpcData?.success && rpcData.workspace) {
          const newWs = rpcData.workspace as Workspace;
          setCurrentWorkspace(newWs);
          if (Array.isArray(rpcData.stations) && rpcData.stations.length > 0) {
            await supabase.from('stations').delete().eq('workspace_id', newWs.id);
          }
          setStations([]);
          setSelectedStationId(null);
          if (Array.isArray(rpcData.currencies) && rpcData.currencies.length > 0) {
            setCurrencies(rpcData.currencies.map((c: any) => ({ ...c, team_id: c.workspace_id })));
          }
          if (rpcData.subscription) {
            setSubscription({ ...rpcData.subscription, team_id: newWs.id });
          }
          setWorkspaceMembers([{
            workspace_id: newWs.id,
            user_id: currentUser.id,
            role: 'admin',
            status: 'active',
            joined_at: rpcData.member?.joined_at || new Date().toISOString(),
            profile: currentUser,
          }]);
          setStationWorkers([]);
          localStorage.setItem(`ittihadiya_demo_deleted_${newWs.id}`, 'true');
          localStorage.setItem(`alittihadia_guided_tour_pending_${newWs.id}`, 'true');
          return { success: true };
        }
      } catch (e) {
        console.warn('createTeam RPC error, falling back to local:', e);
      }
    }

    const ws: Workspace = {
      id: `ws-${Date.now()}`,
      short_id: generateShortId(),
      name: name.trim(),
      invite_code: generateInviteCode(),
      created_by: currentUser.id,
      created_at: new Date().toISOString(),
    };
    setCurrentWorkspace(ws);

    const adminMember: WorkspaceMember = {
      workspace_id: ws.id,
      user_id: currentUser.id,
      role: 'admin',
      status: 'active',
      joined_at: new Date().toISOString(),
      profile: currentUser,
    };

    const initialWsCurrencies = getInitialCurrencies(ws.id);
    setCurrencies(initialWsCurrencies);
    setWorkspaceMembers([adminMember]);
    setStationWorkers([]);
    setStations([]);
    setSelectedStationId(null);
    localStorage.setItem(`ittihadiya_demo_deleted_${ws.id}`, 'true');
    localStorage.setItem(`alittihadia_guided_tour_pending_${ws.id}`, 'true');

    return { success: true };
  };

  const joinTeam = async (inviteCode: string) => {
    if (!currentUser) return { success: false, error: 'غير مسجل' };
    if (currentWorkspace && currentWorkspace.invite_code === inviteCode.trim().toUpperCase()) {
      return { success: true };
    }
    return { success: false, error: 'رمز الدعوة غير صحيح' };
  };

  const addStation = async (
    nameOrData: string | { name: string; city: string; country?: 'MA' | 'MR'; phone?: string; address?: string; currency?: string; default_currency?: string },
    city?: string,
    country: 'MA' | 'MR' = 'MA',
    phone?: string,
    address?: string,
    currency?: string
  ): Promise<{ success: boolean; error?: string; station?: Station }> => {
    let finalName = '';
    let finalCity = '';
    let finalCountry: 'MA' | 'MR' = 'MA';
    let finalPhone: string | undefined;
    let finalAddress: string | undefined;
    let finalCurrency: string | undefined;

    if (typeof nameOrData === 'object' && nameOrData !== null) {
      finalName = nameOrData.name || '';
      finalCity = nameOrData.city || nameOrData.name || '';
      finalCountry = nameOrData.country || 'MA';
      finalPhone = nameOrData.phone;
      finalAddress = nameOrData.address;
      finalCurrency = nameOrData.currency || nameOrData.default_currency;
    } else {
      finalName = nameOrData || '';
      finalCity = city || nameOrData || '';
      finalCountry = country;
      finalPhone = phone;
      finalAddress = address;
      finalCurrency = currency;
    }

    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const maxStations = isPlan2TwoStations
      ? 2
      : Math.max(99, currentWorkspace?.max_stations ?? 99);
    const activeStationsCount = isPlan2TwoStations
      ? visibleStations.length
      : stations.filter(s => !s.is_demo).length;

    if (activeStationsCount >= maxStations) {
      const msg = isPlan2TwoStations
        ? 'باقتك الحالية (الباك الأول — 99 درهم) تسمح بفتح محطتين (2) فقط كحد أقصى! لفتح محطات غير محدودة وتخصيص اللوغو في الملصقات والبونات يرجى الترقية إلى الباك الثاني (199 درهم).'
        : `تم بلوغ الحد الأقصى للمحطات المسموح به في باقتك الحالية (${maxStations} محطات). يرجى ترقية الباقة لإضافة محطة جديدة.`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const wsId = currentWorkspace?.id || 'ws-default';
    const chosenCurrency = finalCurrency?.trim().toUpperCase() || (finalCountry === 'MR' ? 'MRU' : 'MAD');
    const newSt: Station = {
      id: isSupabaseConfigured() ? generateUUID() : `sta-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      workspace_id: wsId,
      team_id: wsId,
      name: finalName.trim(),
      city: finalCity.trim() || finalName.trim(),
      country: finalCountry,
      currency: chosenCurrency,
      default_currency: chosenCurrency,
      owner_id: currentUser?.id || null,
      phone: finalPhone?.trim(),
      address: finalAddress?.trim(),
      is_active: true,
      created_at: new Date().toISOString(),
    };

    localStorage.setItem(`alittihadia_user_created_station_${wsId}`, 'true');
    try {
      const currMap = JSON.parse(localStorage.getItem(`alittihadia_station_currencies_${wsId}`) || '{}');
      currMap[newSt.id] = chosenCurrency;
      localStorage.setItem(`alittihadia_station_currencies_${wsId}`, JSON.stringify(currMap));
    } catch {}

    setStations(prev => [...prev, newSt]);
    setSelectedStationId(prev => prev || newSt.id);

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId)) {
      try {
        const { error } = await supabase.from('stations').upsert({
          id: newSt.id,
          workspace_id: wsId,
          name: newSt.name,
          city: newSt.city,
          country: newSt.country,
          phone: newSt.phone || null,
          address: newSt.address || null,
          is_active: true,
        });
        if (error) showToast(`تعذر حفظ المحطة في السحابة: ${error.message}`, 'error');
      } catch (e: any) {
        showToast('تعذر الاتصال بالسحابة، تم حفظ المحطة محلياً', 'error');
      }
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncStation(wsId, newSt).catch(err => {
        console.warn('Firebase station sync error:', err);
      });
    }

    showToast(`تمت إضافة محطة "${newSt.name}" (${chosenCurrency}) بنجاح`, 'success');
    return { success: true, station: newSt };
  };

  const updateStation = async (
    stationId: string,
    updates: {
      name?: string;
      city?: string;
      country?: 'MA' | 'MR';
      phone?: string;
      address?: string;
      currency?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const wsId = currentWorkspace?.id || 'ws-default';
    const existing = stations.find(s => s.id === stationId);
    if (!existing) return { success: false, error: 'المحطة غير موجودة' };

    const nextCurrency = updates.currency?.trim().toUpperCase() || existing.currency || (existing.country === 'MR' ? 'MRU' : 'MAD');
    if (updates.currency) {
      try {
        const currMap = JSON.parse(localStorage.getItem(`alittihadia_station_currencies_${wsId}`) || '{}');
        currMap[stationId] = nextCurrency;
        localStorage.setItem(`alittihadia_station_currencies_${wsId}`, JSON.stringify(currMap));
      } catch {}
    }

    const updatedStation: Station = {
      ...existing,
      name: updates.name !== undefined ? updates.name.trim() : existing.name,
      city: updates.city !== undefined ? updates.city.trim() : existing.city,
      country: updates.country !== undefined ? updates.country : existing.country,
      phone: updates.phone !== undefined ? updates.phone.trim() : existing.phone,
      address: updates.address !== undefined ? updates.address.trim() : existing.address,
      currency: nextCurrency,
    };

    setStations(prev => prev.map(s => (s.id === stationId ? updatedStation : s)));

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId) && isValidUUID(stationId)) {
      try {
        await supabase
          .from('stations')
          .update({
            name: updatedStation.name,
            city: updatedStation.city,
            country: updatedStation.country,
            phone: updatedStation.phone || null,
            address: updatedStation.address || null,
          })
          .eq('id', stationId)
          .eq('workspace_id', wsId);
      } catch {}
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncStation(wsId, updatedStation).catch(err => {
        console.warn('Firebase station sync error:', err);
      });
    }

    showToast(`تم تحديث بيانات محطة "${updatedStation.name}" بنجاح`, 'success');
    return { success: true };
  };

  const deleteStation = async (stationId: string): Promise<{ success: boolean; error?: string }> => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const wsId = currentWorkspace?.id || 'ws-default';
    setStations(prev => {
      const next = prev.filter(s => s.id !== stationId);
      if (selectedStationId === stationId) {
        setSelectedStationId(next[0]?.id || null);
      }
      return next;
    });

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId) && isValidUUID(stationId)) {
      try {
        await supabase.from('stations').delete().eq('id', stationId).eq('workspace_id', wsId);
      } catch {}
    }

    // Sync deletion to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteStation(wsId, stationId).catch(err => {
        console.warn('Firebase station delete error:', err);
      });
    }

    showToast('تم حذف المحطة بنجاح', 'info');
    return { success: true };
  };

  const assignWorkerToStation = async (stationId: string, userId: string): Promise<{ success: boolean; error?: string }> => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      const msg = 'صلاحية تعيين العمال للمدير فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const wsId = currentWorkspace?.id || 'ws-default';
    const targetStation = visibleStations.find(s => s.id === stationId && (!s.workspace_id || s.workspace_id === wsId));
    const workerBelongsToMe = workspaceMembers.some(m => m.user_id === userId && (!m.workspace_id || m.workspace_id === wsId));
    if (!targetStation || !workerBelongsToMe) {
      const msg = 'لا يمكن تعيين عامل أو محطة خارج المحطات المفعلة في مساحة عملك';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // Enforce 1 worker per station when on الباك الأول (99 درهم)
    if (isPlan2TwoStations) {
      const targetWorker = workspaceMembers.find(m => m.user_id === userId);
      const isTargetReal = !targetWorker?.is_demo;
      const otherOccupant = visibleWorkspaceMembers.find(
        m =>
          m.role === 'worker' &&
          m.user_id !== userId &&
          m.station_id === stationId &&
          (isTargetReal ? !m.is_demo : true)
      );
      if (otherOccupant) {
        const msg = `لا يمكن وضع أكثر من عامل واحد في "${targetStation.name}" ضمن الباك الأول (99 درهم — عامل واحد لكل محطة)! يشغلها حالياً: ${otherOccupant.profile?.name || 'عامل آخر'}.`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    setStationWorkers(prev => {
      const filtered = prev.filter(w => !(w.user_id === userId && (!w.workspace_id || w.workspace_id === wsId)));
      return [...filtered, { station_id: stationId, workspace_id: wsId, user_id: userId, assigned_at: new Date().toISOString() }];
    });

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId) && isValidUUID(stationId) && isValidUUID(userId)) {
      try {
        await supabase.from('station_workers').delete().eq('workspace_id', wsId).eq('user_id', userId);
        const { error } = await supabase.from('station_workers').insert({
          station_id: stationId,
          workspace_id: wsId,
          user_id: userId,
        });
        if (error) showToast(`تعذر مزامنة تعيين الموظف مع السحابة: ${error.message}`, 'error');
      } catch {
        showToast('تعذر الاتصال بالسحابة، تم تعيين الموظف محلياً', 'error');
      }
    }

    showToast(`تم تعيين العامل في "${targetStation.name}" بنجاح`, 'success');
    return { success: true };
  };

  const removeWorkerFromTeam = async (userId: string) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false };

    if (userRole !== 'owner' && userRole !== 'platform_owner') {
      showToast('صلاحية حذف العمال للمدير فقط', 'error');
      return { success: false };
    }

    const wsId = currentWorkspace?.id || '';
    const targetMember = workspaceMembers.find(
      m => m.user_id === userId && (!m.workspace_id || m.workspace_id === wsId)
    );
    if (!targetMember) {
      showToast('لا يمكنك حذف عامل لا يشتغل معك في محطات مساحة عملك', 'error');
      return { success: false };
    }
    if (targetMember.user_id === currentUser?.id) {
      showToast('لا يمكنك حذف حسابك الشخصي كمدير لمساحة العمل', 'error');
      return { success: false };
    }

    const targetPhone = cleanPhoneNumber(targetMember.profile?.phone || targetMember.phone || '');

    // 1. Immediately record revocation locally and purge worker's local credentials so any open tab or re-login is blocked
    try {
      const revokedMap = JSON.parse(localStorage.getItem('alittihadia_revoked_accounts_v1') || '{}');
      revokedMap[userId] = true;
      if (targetPhone) revokedMap[targetPhone] = true;
      localStorage.setItem('alittihadia_revoked_accounts_v1', JSON.stringify(revokedMap));

      if (targetPhone) {
        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
        delete localAccounts[targetPhone];
        localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));

        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        delete tempMap[targetPhone];
        localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
      }
    } catch {}

    // 2. Remove from state (also triggers storage event for other tabs)
    setWorkspaceMembers(prev => prev.filter(m => !(m.user_id === userId && (!m.workspace_id || m.workspace_id === wsId))));
    setStationWorkers(prev => prev.filter(sw => !(sw.user_id === userId && (!sw.workspace_id || sw.workspace_id === wsId))));

    // 3. Delete member & revoke worker account in Firebase Firestore so worker's device immediately logs out
    if (firebaseSyncService.isAvailable()) {
      if (wsId) {
        firebaseSyncService.deleteWorkspaceMember(wsId, userId).catch(err => {
          console.warn('Firebase deleteWorkspaceMember error:', err);
        });
      }
      firebaseSyncService.revokeUserAccount(targetPhone, userId).catch(err => {
        console.warn('Firebase revokeUserAccount error:', err);
      });
    }

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId) && isValidUUID(userId)) {
      try {
        await supabase.from('station_workers').delete().eq('workspace_id', wsId).eq('user_id', userId);
        await supabase.from('workspace_members').delete().eq('workspace_id', wsId).eq('user_id', userId);
      } catch {
        showToast('تعذر الاتصال بالسحابة، تم الحذف محلياً', 'error');
      }
    }
    showToast('تم إيقاف وحذف حساب العامل فوراً من جميع الأجهزة والمحطات', 'info');
    return { success: true };
  };

  const addCurrency = async (code: string, label_ar: string, symbol: string, label_fr?: string, rate: number = 1.0) => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false };

    const wsId = currentWorkspace?.id || 'ws-default';
    const newCurr: Currency = {
      id: isSupabaseConfigured() ? generateUUID() : `curr-${Date.now()}`,
      workspace_id: wsId,
      team_id: wsId,
      code: code.trim().toUpperCase(),
      label_ar: label_ar.trim(),
      label_fr: label_fr?.trim() || code,
      symbol: symbol.trim(),
      is_active: true,
      rate_to_mad: rate,
      created_at: new Date().toISOString(),
    };
    setCurrencies(prev => [...prev, newCurr]);

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId)) {
      try {
        const { error } = await supabase.from('currencies').upsert({
          id: newCurr.id,
          workspace_id: wsId,
          code: newCurr.code,
          label_ar: newCurr.label_ar,
          symbol: newCurr.symbol,
          rate_to_mad: newCurr.rate_to_mad,
          is_active: true,
        }, { onConflict: 'workspace_id,code' });
        if (error) showToast(`تعذر حفظ العملة في السحابة: ${error.message}`, 'error');
      } catch {
        showToast('تعذر الاتصال بالسحابة، تم حفظ العملة محلياً', 'error');
      }
    }

    showToast(`تمت إضافة عملة ${newCurr.code} (${newCurr.label_ar})`, 'success');
    return { success: true };
  };

  const extendSubscription = (days: number = 30) => {
    const wsId = currentWorkspace?.id || subscription?.workspace_id || 'ws-default';
    const newEnd = new Date(Date.now() + days * 86400000).toISOString();
    const updatedSub: Subscription = {
      id: subscription?.id || `sub-${wsId}`,
      workspace_id: wsId,
      team_id: wsId,
      status: 'active',
      start_date: subscription?.start_date || new Date().toISOString(),
      end_date: newEnd,
      created_at: subscription?.created_at || new Date().toISOString(),
    };
    setSubscription(updatedSub);
    if (currentWorkspace) {
      const updatedWs: Workspace = {
        ...currentWorkspace,
        subscription_end_date: newEnd,
        subscription_status: 'active',
      };
      setCurrentWorkspace(updatedWs);
      if (firebaseSyncService.isAvailable()) {
        firebaseSyncService.syncWorkspace(updatedWs).catch(() => {});
      }
    }
    showToast(`تم تفعيل الاشتراك لمدة ${days} يوماً بنجاح!`, 'success');
  };

  const startFiveMinuteSubscriptionTest = () => {
    const wsId = currentWorkspace?.id || subscription?.workspace_id || 'ws-default';
    const fiveMinEnd = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const updatedSub: Subscription = {
      id: subscription?.id || `sub-${wsId}`,
      workspace_id: wsId,
      team_id: wsId,
      status: 'active',
      start_date: new Date().toISOString(),
      end_date: fiveMinEnd,
      created_at: subscription?.created_at || new Date().toISOString(),
    };
    setSubscription(updatedSub);
    if (currentWorkspace) {
      const updatedWs: Workspace = {
        ...currentWorkspace,
        subscription_end_date: fiveMinEnd,
        subscription_status: 'active',
      };
      setCurrentWorkspace(updatedWs);
      if (firebaseSyncService.isAvailable()) {
        firebaseSyncService.syncWorkspace(updatedWs).catch(() => {});
      }
    }
    showToast('تم ضبط توقيت الاشتراك على 5 دقائق للتجربة! سيظهر العد التنازلي الآن.', 'info');
  };

  // Platform Owner Controls: Update Subscription via server-side RPC
  const updateWorkspaceSubscription = async (
    workspaceId: string, 
    action: 'activate' | 'extend' | 'suspend', 
    months: number = 1
  ) => {
    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(workspaceId)) {
      const { data: rpcRes, error } = await supabase.rpc('rpc_platform_update_subscription', {
        p_workspace_id: workspaceId,
        p_action: action,
        p_months: months
      });
      if (error || (rpcRes && !rpcRes.success)) {
        const msg = error?.message || rpcRes?.error || 'تعذر تحديث الاشتراك في السحابة';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      await refreshPlatformWorkspaces();
      if (currentWorkspace?.id === workspaceId && rpcRes?.subscription) {
        setSubscription({ ...rpcRes.subscription, team_id: workspaceId });
      }
      return { success: true };
    }

    setAllSubscriptionsState(prev => {
      const existing = prev.find(s => s.workspace_id === workspaceId);
      const now = new Date();
      let newEndDate = existing && new Date(existing.end_date).getTime() > now.getTime()
        ? new Date(existing.end_date)
        : new Date();
      
      if (action === 'extend' || action === 'activate') {
        newEndDate.setMonth(newEndDate.getMonth() + months);
      }

      const updatedSub: Subscription = {
        id: existing?.id || `sub-${workspaceId}`,
        workspace_id: workspaceId,
        team_id: workspaceId,
        status: action === 'suspend' ? 'suspended' : 'active',
        start_date: existing?.start_date || now.toISOString(),
        end_date: newEndDate.toISOString(),
        is_trial: false,
        created_at: existing?.created_at || now.toISOString(),
      };

      const next = prev.filter(s => s.workspace_id !== workspaceId).concat(updatedSub);
      localStorage.setItem('alittihadia_all_subscriptions', JSON.stringify(next));

      if (currentWorkspace?.id === workspaceId) {
        setSubscription(updatedSub);
        localStorage.setItem('aman_subscription', JSON.stringify(updatedSub));
        const updatedWs: Workspace = {
          ...currentWorkspace,
          subscription_end_date: updatedSub.end_date,
          subscription_status: updatedSub.status,
        };
        setCurrentWorkspace(updatedWs);
        if (firebaseSyncService.isAvailable()) {
          firebaseSyncService.syncWorkspace(updatedWs).catch(() => {});
        }
      }

      return next;
    });
    return { success: true };
  };

  // Platform Owner Controls: Update Workspace Notes via server-side RPC
  const updateWorkspaceNotes = async (workspaceId: string, notes: string) => {
    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(workspaceId)) {
      const { data: rpcRes, error } = await supabase.rpc('rpc_platform_update_subscription', {
        p_workspace_id: workspaceId,
        p_action: 'update_meta',
        p_admin_notes: notes
      });
      if (error || (rpcRes && !rpcRes.success)) {
        const msg = error?.message || rpcRes?.error || 'تعذر حفظ الملاحظات في السحابة';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      await refreshPlatformWorkspaces();
    }

    setAllWorkspacesState(prev => {
      const next = prev.map(ws => ws.id === workspaceId ? { ...ws, admin_notes: notes } : ws);
      localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
      return next;
    });
    if (currentWorkspace?.id === workspaceId) {
      setCurrentWorkspace(prev => prev ? { ...prev, admin_notes: notes } : null);
    }
    return { success: true };
  };

  // Platform Owner Controls: Update Workspace Quotas & Plan via server-side RPC
  const updateWorkspaceQuotas = async (
    workspaceId: string,
    quotas: {
      max_workers: number;
      max_stations: number;
      max_workers_per_station?: number;
      max_collaborations: number;
      plan_name?: string;
      plan_tier?: 'plan_1_full' | 'plan_2_two_stations';
    }
  ) => {
    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(workspaceId)) {
      const { data: rpcRes, error } = await supabase.rpc('rpc_platform_update_subscription', {
        p_workspace_id: workspaceId,
        p_action: 'update_meta',
        p_max_workers: quotas.max_workers,
        p_max_stations: quotas.max_stations,
        p_max_collaborations: quotas.max_collaborations,
        p_plan_name: quotas.plan_name || 'الباك الأول (الشامل المفتوح)'
      });
      if (error || (rpcRes && !rpcRes.success)) {
        const msg = error?.message || rpcRes?.error || 'تعذر تحديث حصص الباقة في السحابة';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      await refreshPlatformWorkspaces();
    }

    setAllWorkspacesState(prev => {
      const next = prev.map(ws => ws.id === workspaceId ? {
        ...ws,
        plan_tier: quotas.plan_tier || (quotas.max_stations === 2 ? 'plan_2_two_stations' : 'plan_1_full'),
        max_workers: quotas.max_workers,
        max_stations: quotas.max_stations,
        max_workers_per_station: quotas.max_workers_per_station ?? (quotas.max_stations === 2 ? 1 : 99),
        max_collaborations: quotas.max_collaborations,
        plan_name: quotas.plan_name || ws.plan_name || 'الباك الأول (الشامل المفتوح)'
      } : ws);
      localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
      return next;
    });

    if (currentWorkspace?.id === workspaceId) {
      setCurrentWorkspace(prev => prev ? {
        ...prev,
        plan_tier: quotas.plan_tier || (quotas.max_stations === 2 ? 'plan_2_two_stations' : 'plan_1_full'),
        max_workers: quotas.max_workers,
        max_stations: quotas.max_stations,
        max_workers_per_station: quotas.max_workers_per_station ?? (quotas.max_stations === 2 ? 1 : 99),
        max_collaborations: quotas.max_collaborations,
        plan_name: quotas.plan_name || prev.plan_name || 'الباك الأول (الشامل المفتوح)'
      } : null);
    }
    // Sync plan_tier change to Firebase Firestore so workers and all devices see the updated plan immediately
    if (currentWorkspace?.id === workspaceId && firebaseSyncService.isAvailable()) {
      const nextTier = quotas.plan_tier || (quotas.max_stations === 2 ? 'plan_2_two_stations' : 'plan_1_full');
      firebaseSyncService
        .syncWorkspace({
          ...currentWorkspace,
          plan_tier: nextTier,
          max_workers: quotas.max_workers,
          max_stations: quotas.max_stations,
          max_workers_per_station: quotas.max_workers_per_station ?? (quotas.max_stations === 2 ? 1 : 99),
          max_collaborations: quotas.max_collaborations,
          plan_name: quotas.plan_name || currentWorkspace.plan_name || 'الباك الثاني (199 درهم — الباقة الشاملة)',
        })
        .catch(() => {});
    }
    return { success: true };
  };

  // Switch between الباك الأول (99 درهم: محطتين + عامل لكل محطة + لوغو التطبيق) and الباك الثاني (199 درهم: محطات وعمال غير محدودين + لوغو خاص)
  const switchWorkspacePlan = async (
    planTier: 'plan_1_full' | 'plan_2_two_stations',
    targetWorkspaceId?: string
  ) => {
    const wsId = targetWorkspaceId || currentWorkspace?.id;
    if (!wsId) return { success: false, error: 'لا توجد مساحة عمل نشطة' };

    const isBasic99 = planTier === 'plan_2_two_stations';
    const res = await updateWorkspaceQuotas(wsId, {
      plan_tier: planTier,
      plan_name: isBasic99
        ? 'الباك الأول (99 درهم): محطتين فقط + عامل لكل محطة'
        : 'الباك الثاني (199 درهم): محطات وعمال غير محدودين + شعار خاص',
      max_stations: isBasic99 ? 2 : 99,
      max_workers: isBasic99 ? 2 : 99,
      max_workers_per_station: isBasic99 ? 1 : 99,
      max_collaborations: isBasic99 ? 5 : 99,
    });

    if (res.success) {
      showToast(
        isBasic99
          ? 'تم تفعيل الباك الأول (99 درهم): جوج محطات فقط، عامل واحد في كل محطة، والملصقات والبونات باسم ولوغو التطبيق الرسمي'
          : 'تم تفعيل الباك الثاني (199 درهم): فتح محطات وعمال بدون حدود + إمكانية وضع اللوغو الخاص بك في الملصقات والبونات',
        'success'
      );
    }
    return res;
  };

  // Password Reset Request (Worker to Workspace Admin, Automatic WhatsApp Recovery for Manager)
  const submitPasswordResetRequest = async (data: {
    phone: string;
    whatsapp?: string;
    accountType: 'worker' | 'admin';
    userName?: string;
  }) => {
    const canonicalPhone = cleanPhoneNumber(data.phone);
    if (!canonicalPhone || canonicalPhone.length < 8) {
      return { success: false, error: 'يرجى إدخال رقم الهاتف المسجل به بشكل صحيح' };
    }

    // 1. إذا كان الحساب مدير محطة (admin): توليد كلمة مرور مؤقتة وإرسالها تلقائياً لرقم الواتساب المسجل به في الحساب
    if (data.accountType === 'admin') {
      const supabase = getSupabaseClient();
      if (supabase && isSupabaseConfigured()) {
        try {
          const { data: fnData, error: fnErr } = await supabase.functions.invoke('reset-password', {
            body: {
              action: 'auto_recover_manager',
              target_phone: canonicalPhone,
            },
          });
          if (!fnErr && fnData?.success && fnData?.temporary_password) {
            return {
              success: true,
              temporaryPassword: fnData.temporary_password,
              registeredWhatsapp: fnData.registered_whatsapp || canonicalPhone,
              userName: fnData.user_name || 'مدير المحطة',
              sentViaApi: Boolean(fnData.sent_via_api),
            };
          }
          if (fnData && !fnData.success && fnData.error) {
            return { success: false, error: fnData.error };
          }
        } catch (err) {
          console.warn('Edge function auto_recover_manager fallback to local:', err);
        }
      }

      // البحث في الحسابات المحلية / مساحة العمل عن المدير المسجل بهذا الرقم
      const adminMember = workspaceMembers.find(
        m => m.role === 'admin' && cleanPhoneNumber(m.profile?.phone || '') === canonicalPhone
      );
      const matchedWorkspace = allWorkspacesState.find(
        ws => cleanPhoneNumber(ws.owner_phone || '') === canonicalPhone
      );
      let savedLocalAcc: any = null;
      try {
        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
        if (localAccounts[canonicalPhone]?.isOwner) {
          savedLocalAcc = localAccounts[canonicalPhone];
        }
      } catch {}

      const isCurrentOwnerMatch =
        currentUser &&
        cleanPhoneNumber(currentUser.phone) === canonicalPhone &&
        (userRole === 'owner' || userRole === 'platform_owner');

      if (!adminMember && !matchedWorkspace && !savedLocalAcc && !isCurrentOwnerMatch) {
        return {
          success: false,
          error: 'لم يتم العثور على حساب مدير مسجل بهذا الرقم. تأكد من إدخال نفس رقم الهاتف الذي فتحت به الحساب.',
        };
      }

      const registeredWhatsapp = cleanPhoneNumber(
        adminMember?.profile?.whatsapp_number ||
        matchedWorkspace?.owner_whatsapp ||
        savedLocalAcc?.whatsapp_number ||
        (isCurrentOwnerMatch ? currentUser?.whatsapp_number : '') ||
        canonicalPhone
      ) || canonicalPhone;

      const managerName =
        adminMember?.profile?.name ||
        savedLocalAcc?.name ||
        (isCurrentOwnerMatch ? currentUser?.name : '') ||
        'مدير المحطة';

      const generatedPassword = generateTemporaryPassword();

      try {
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        tempMap[canonicalPhone] = generatedPassword;
        localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
      } catch {}

      setWorkspaceMembers(prev =>
        prev.map(m => {
          if (cleanPhoneNumber(m.profile?.phone || '') === canonicalPhone) {
            return {
              ...m,
              profile: m.profile ? { ...m.profile, must_change_password: true } : m.profile,
            };
          }
          return m;
        })
      );

      return {
        success: true,
        temporaryPassword: generatedPassword,
        registeredWhatsapp,
        userName: managerName,
        sentViaApi: false,
      };
    }

    // 2. إذا كان الحساب عامل محطة (worker): إرسال طلب استعادة لمدير مساحة العمل باستخدام رقم الواتساب المسجل للعامل
    const matchedMember = workspaceMembers.find(m => cleanPhoneNumber(m.profile?.phone || '') === canonicalPhone);
    const canonicalWhatsapp =
      cleanPhoneNumber(matchedMember?.profile?.whatsapp_number || data.whatsapp || '') || canonicalPhone;

    const newReq: PasswordResetRequest = {
      id: `req-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: matchedMember?.user_id || `usr-${canonicalPhone}`,
      user_name: data.userName || matchedMember?.profile?.name || `العامل (${canonicalPhone})`,
      user_phone: canonicalPhone,
      user_whatsapp: canonicalWhatsapp,
      workspace_id: currentWorkspace?.id,
      workspace_name: currentWorkspace?.name,
      target_role: 'worker',
      status: 'pending',
      requested_at: new Date().toISOString(),
    };

    setPasswordResetRequestsState(prev => {
      const next = [newReq, ...prev];
      localStorage.setItem('alittihadia_password_reset_requests', JSON.stringify(next));
      return next;
    });
    return { success: true, registeredWhatsapp: canonicalWhatsapp };
  };

  // Direct Reset of a Member's Password via Edge Function (or local fallback in offline/demo)
  const resetMemberPassword = async (targetUserId: string, targetPhone?: string) => {
    const fallbackPhone =
      targetPhone ||
      workspaceMembers.find(m => m.user_id === targetUserId)?.profile?.phone ||
      allWorkspacesState.find(w => w.created_by === targetUserId || w.id === targetUserId)?.owner_phone ||
      '';
    const canonicalPhone = cleanPhoneNumber(fallbackPhone);
    let generatedPassword = generateTemporaryPassword();

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      try {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('reset-password', {
          body: {
            action: 'reset_password',
            target_user_id: isValidUUID(targetUserId) ? targetUserId : undefined,
            target_phone: canonicalPhone,
            workspace_id: currentWorkspace?.id,
          },
        });
        if (fnErr || (fnData && !fnData.success)) {
          const errMsg = fnData?.error || fnErr?.message || 'تعذر استدعاء دالة الخادم لإعادة تعيين كلمة المرور';
          showToast(errMsg, 'error');
          return { success: false, error: errMsg };
        }
        if (fnData?.temporary_password) {
          generatedPassword = fnData.temporary_password;
        }
      } catch (e: any) {
        const errMsg = 'تعذر الاتصال بدالة الخادم (reset-password). تأكد من نشر الدالة في Supabase.';
        showToast(errMsg, 'error');
        return { success: false, error: errMsg };
      }
    } else {
      // Offline / Demo mode: store temporary password and flag must_change_password
      try {
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        if (canonicalPhone) {
          tempMap[canonicalPhone] = generatedPassword;
          localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
        }
      } catch {}

      setWorkspaceMembers(prev => prev.map(m => {
        if (m.user_id === targetUserId || (canonicalPhone && cleanPhoneNumber(m.profile?.phone || '') === canonicalPhone)) {
          return {
            ...m,
            profile: m.profile ? { ...m.profile, must_change_password: true } : m.profile,
          };
        }
        return m;
      }));
    }

    return { success: true, temporaryPassword: generatedPassword };
  };

  // Resolve Password Reset Request (generates one-time random temporary password and forces change at first login)
  const resolvePasswordResetRequest = async (
    requestId: string, 
    approved: boolean, 
    _tempPassword?: string
  ) => {
    const req = passwordResetRequestsState.find(r => r.id === requestId);
    if (!req) return { success: false, error: 'الطلب غير موجود' };

    let generatedTempPassword: string | undefined;
    if (approved) {
      const resetRes = await resetMemberPassword(req.user_id, req.user_phone);
      if (!resetRes.success) {
        return { success: false, error: resetRes.error };
      }
      generatedTempPassword = resetRes.temporaryPassword;
    }

    setPasswordResetRequestsState(prev => {
      const next = prev.map(r => r.id === requestId ? {
        ...r,
        status: approved ? ('resolved' as const) : ('rejected' as const),
        resolved_at: new Date().toISOString(),
        resolved_by: currentUser?.id,
        // Never persist plaintext temporary password in localStorage after resolution
        temporary_password: null,
      } : r);
      localStorage.setItem('alittihadia_password_reset_requests', JSON.stringify(next));
      return next;
    });
    return { success: true, temporaryPassword: generatedTempPassword };
  };

  // Force Password Change on First Login
  const changeMandatoryPassword = async (newPassword: string) => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const cleanPwd = newPassword.trim();
    if (cleanPwd.length < 8) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن لا تقل عن 8 أحرف أو أرقام' };
    }

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      const { error: authErr } = await supabase.auth.updateUser({
        password: cleanPwd,
        data: { must_change_password: false },
      });
      if (authErr) {
        return { success: false, error: `تعذر تحديث كلمة المرور: ${authErr.message}` };
      }
      await supabase.rpc('rpc_clear_must_change_password');
    }

    // Clear local temp password entry & update saved local password
    const canonicalPhone = cleanPhoneNumber(currentUser.phone);
    try {
      const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
      delete tempMap[canonicalPhone];
      localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));

      const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
      if (localAccounts[canonicalPhone]) {
        localAccounts[canonicalPhone].password = cleanPwd;
        localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
      }
    } catch {}

    const updatedUser: Profile = { ...currentUser, must_change_password: false };
    setCurrentUser(updatedUser);
    setWorkspaceMembers(prev => prev.map(m =>
      m.user_id === currentUser.id && m.profile
        ? { ...m, profile: { ...m.profile, must_change_password: false } }
        : m
    ));

    // Also update password in Firebase Firestore for cross-device login
    if (firebaseSyncService.isAvailable() && canonicalPhone) {
      firebaseSyncService.getUserAccount(canonicalPhone).then(existing => {
        if (existing) {
          firebaseSyncService.saveUserAccount(canonicalPhone, {
            ...existing,
            password: cleanPwd,
            must_change_password: false,
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    showToast('تم تعيين كلمة المرور الجديدة الخاصة بك بنجاح', 'success');
    return { success: true };
  };

  // Update Registered Phone & WhatsApp Number in Settings (Protects Account if WhatsApp/SIM changes)
  const updateUserContactNumbers = async (newPhone: string, newWhatsapp?: string, newName?: string) => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };

    const cleanNewPhone = cleanPhoneNumber(newPhone);
    if (!cleanNewPhone || cleanNewPhone.length < 8) {
      return { success: false, error: 'يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)' };
    }
    const cleanNewWhatsapp = cleanPhoneNumber(newWhatsapp || '') || cleanNewPhone;
    const finalName = newName?.trim() || currentUser.name;
    const oldCanonicalPhone = cleanPhoneNumber(currentUser.phone);

    // Check if another user already has this phone number
    const duplicateMember = workspaceMembers.find(
      m => m.user_id !== currentUser.id && cleanPhoneNumber(m.profile?.phone || '') === cleanNewPhone
    );
    if (duplicateMember) {
      return { success: false, error: 'رقم الهاتف الجديد مسجل بالفعل لعضو آخر في مساحة العمل' };
    }

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured()) {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_update_my_contact_numbers', {
        p_new_phone: cleanNewPhone,
        p_new_whatsapp: cleanNewWhatsapp,
      });
      if (rpcErr || (rpcRes && !rpcRes.success)) {
        const msg = rpcErr?.message || rpcRes?.error || 'تعذر تحديث رقم الهاتف والواتساب في السحابة';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    // Update local accounts store
    try {
      const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
      const existingAcc = localAccounts[oldCanonicalPhone] || {
        id: currentUser.id,
        name: finalName,
        isOwner: userRole === 'owner' || userRole === 'platform_owner',
      };
      if (oldCanonicalPhone && oldCanonicalPhone !== cleanNewPhone) {
        delete localAccounts[oldCanonicalPhone];
      }
      localAccounts[cleanNewPhone] = {
        ...existingAcc,
        name: finalName,
        phone: cleanNewPhone,
        whatsapp_number: cleanNewWhatsapp,
      };
      localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));

      const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
      if (oldCanonicalPhone && oldCanonicalPhone !== cleanNewPhone && tempMap[oldCanonicalPhone]) {
        tempMap[cleanNewPhone] = tempMap[oldCanonicalPhone];
        delete tempMap[oldCanonicalPhone];
        localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
      }
    } catch {}

    const updatedProfile: Profile = {
      ...currentUser,
      name: finalName,
      phone: cleanNewPhone,
      whatsapp_number: cleanNewWhatsapp,
    };
    setCurrentUser(updatedProfile);
    try {
      localStorage.setItem('ittihadiya_saved_login_phone', cleanNewPhone);
    } catch {}

    // Update workspaceMembers so the manager sees updated worker name and phone
    setWorkspaceMembers(prev =>
      prev.map(m =>
        m.user_id === currentUser.id && m.profile
          ? { ...m, profile: { ...m.profile, name: finalName, phone: cleanNewPhone, whatsapp_number: cleanNewWhatsapp } }
          : m
      )
    );

    // Update stationWorkers so assigned station worker record also reflects new name
    setStationWorkers(prev =>
      prev.map(sw =>
        sw.user_id === currentUser.id && sw.profile
          ? { ...sw, profile: { ...sw.profile, name: finalName, phone: cleanNewPhone, whatsapp_number: cleanNewWhatsapp } }
          : sw
      )
    );

    // Sync to Firebase if available
    if (firebaseSyncService.isAvailable() && currentWorkspace) {
      const memberToSync = workspaceMembers.find(m => m.user_id === currentUser.id);
      if (memberToSync) {
        firebaseSyncService.syncWorkspaceMember(currentWorkspace.id, {
          ...memberToSync,
          profile: updatedProfile,
        }).catch(() => {});
      }
      firebaseSyncService.getUserAccount(oldCanonicalPhone).then(existing => {
        if (existing) {
          firebaseSyncService.saveUserAccount(cleanNewPhone, {
            ...existing,
            name: finalName,
            phone: cleanNewPhone,
            whatsapp_number: cleanNewWhatsapp,
          }).catch(() => {});
        }
      }).catch(() => {});
    }

    if (currentWorkspace && currentWorkspace.created_by === currentUser.id) {
      setCurrentWorkspace(prev =>
        prev ? { ...prev, owner_phone: cleanNewPhone, owner_whatsapp: cleanNewWhatsapp } : null
      );
      setAllWorkspacesState(prev => {
        const next = prev.map(ws =>
          ws.id === currentWorkspace.id
            ? { ...ws, owner_phone: cleanNewPhone, owner_whatsapp: cleanNewWhatsapp }
            : ws
        );
        localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
        return next;
      });
    }

    showToast('تم تحديث الاسم ورقم الهاتف والواتساب بنجاح', 'success');
    return { success: true };
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userRole,
        isLoggedIn: Boolean(currentUser),
        registerUser,
        loginWithCredentials,
        loginWithGoogle,
        logout,
        currentWorkspace,
        currentTeam: currentWorkspace,
        workspaceMembers: visibleWorkspaceMembers,
        teamMembers: visibleWorkspaceMembers,
        stationWorkers,
        joinRequests,
        approveJoinRequest,
        rejectJoinRequest,
        renewInviteCode,
        collaborations,
        sendCollaborationRequest,
        respondToCollaboration,
        updateSharingSettings,
        stations: visibleStations,
        selectedStationId,
        setSelectedStationId,
        userAssignedStationId,
        currencies,
        stationBalances,
        exchangeRate,
        setExchangeRate,
        convertCurrency,
        hideAmounts,
        toggleHideAmounts,
        formatAmount,
        transactions,
        auditLogs,
        createTransaction,
        updateTransaction,
        cancelTransaction,
        deleteTransaction,
        deleteAuditLog,
        clearAuditLogs,
        executeCurrencyExchange,
        moneyTransfers,
        createMoneyTransfer,
        payoutMoneyTransfer,
        parcels,
        createParcel,
        updateParcelStatus,
        recordParcelPayment,
        updateParcel,
        deleteParcel,
        initiateParcelReturn,
        handoverReturnedParcelToSender,
        updateUnclaimedDaysThreshold,
        getParcelByTrackingCode,
        trips,
        rememberedDrivers,
        rememberedPlates,
        removeRememberedDriver,
        removeRememberedPlate,
        deleteTrip,
        createTrip,
        updateTripExpenses,
        loadParcelToTrip,
        unloadParcelFromTrip,
        departTrip,
        receiveParcelAtDestination,
        closeTrip,
        updateWorkspaceBranding,
        fetchPublicParcelTracking,
        addBalanceAdjustment,
        createTeam,
        joinTeam,
        regenerateInviteCode: renewInviteCode,
        addStation,
        updateStation,
        deleteStation,
        addWorkerByOwner,
        assignWorkerToStation,
        removeWorkerFromTeam,
        addCurrency,
        language,
        setLanguage,
        t,
        subscription,
        isSubscriptionExpired,
        daysUntilExpiry,
        secondsUntilExpiry,
        subscriptionRemainingLabel,
        extendSubscription,
        startFiveMinuteSubscriptionTest,
        allWorkspaces: allWorkspacesState,
        allSubscriptions: allSubscriptionsState,
        refreshPlatformWorkspaces,
        updateWorkspaceSubscription,
        updateWorkspaceNotes,
        updateWorkspaceQuotas,
        switchWorkspacePlan,
        passwordResetRequests: passwordResetRequestsState,
        submitPasswordResetRequest,
        resolvePasswordResetRequest,
        resetMemberPassword,
        changeMandatoryPassword,
        updateUserContactNumbers,
        isSupabaseLive,
        hasDemoData,
        deleteDemoData,
        toast,
        showToast,
        resetAllDataToZero,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
