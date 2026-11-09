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
  MoneyTransfer,
  ManagerPartnership,
  PartnershipSettlement,
  PartnershipStationInfo,
  AppNotification
} from '../types/database';
import { SUPPORTED_LANGUAGES, getTranslation, getSavedLanguage, saveLanguage } from '../lib/i18n';
import { parcelService } from '../services/parcelService';
import { tripService } from '../services/tripService';
import { cashService } from '../services/cashService';
import { storageService, generateUUID, isValidUUID } from '../services/storageService';
import { firebaseSyncService } from '../services/firebaseSyncService';
import {
  matchesTrackingCode,
  extractTrackingQueryCode,
  formatTrackingCodeNumeric,
  canControlParcelOrigin,
  canControlParcelDestination,
  canAcceptOrRejectPartnerParcel,
  validateParcelScanOwnership,
  isPack2CustomBrandingAllowed,
  sanitizeOfficialBrandLogo,
  OFFICIAL_APP_LOGO_PATH,
  OFFICIAL_APP_BRAND_NAME,
} from '../utils/logisticsFeatures';
import { auth as firebaseAuth, googleProvider } from '../lib/firebase';
import { signInWithPopup } from 'firebase/auth';
import { 
  getSupabaseClient, 
  isSupabaseConfigured, 
  phoneToEmail, 
  cleanPhoneNumber,
  generateTemporaryPassword
} from '../lib/supabase';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { hashPassword, verifyPassword, isBcryptHash } from '../utils/security';

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
  {
    id: `curr-${workspaceId}-eur`,
    workspace_id: workspaceId,
    team_id: workspaceId,
    code: 'EUR',
    label_ar: 'يورو أوروبي',
    label_fr: 'Euro',
    symbol: '€',
    is_active: true,
    rate_to_mad: 10.8,
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
    email: string;
    password?: string;
    isOwner: boolean;
    teamInviteCode?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  sendRegistrationEmailOtp: (
    email: string,
    userName?: string
  ) => Promise<{
    success: boolean;
    error?: string;
    expiresAtMs?: number;
    cooldownSeconds?: number;
    previewCode?: string;
    deliveredViaGmail?: boolean;
  }>;
  verifyRegistrationEmailOtp: (
    email: string,
    otpCode: string
  ) => Promise<{
    success: boolean;
    error?: string;
    remainingAttempts?: number;
  }>;
  loginWithCredentials: (phone: string, password?: string, workerName?: string) => Promise<{ success: boolean; error?: string }>;
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
  isWorkerStationDeleted: boolean;

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

  // Manager Cross-Partnership Network (غرفة الشراكة بين المدراء)
  managerPartnerships: ManagerPartnership[];
  registeredManagersNetwork: {
    workspaceId: string;
    workspaceName: string;
    shortId: string;
    ownerName: string;
    phone: string;
    whatsapp?: string;
    email?: string;
    stations: PartnershipStationInfo[];
    planTier?: string;
    stars?: number;
    parcelsCount?: number;
    deliveredCount?: number;
    activityLabel?: string;
  }[];
  loadRegisteredManagersNetwork: () => Promise<void>;
  sendPartnershipRequest: (targetWorkspaceId: string) => Promise<{ success: boolean; error?: string }>;
  respondToPartnershipRequest: (partnershipId: string, accept: boolean) => Promise<{ success: boolean; error?: string }>;
  recordPartnershipSettlement: (partnershipId: string, data: {
    amount: number;
    currency: 'MAD' | 'MRU';
    payment_method: 'cash' | 'bank_transfer' | 'cash_plus' | 'wafacash' | 'other';
    reference_number?: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  dispatchParcelToPartner: (parcelId: string, partnerWorkspaceId: string, partnerStationId: string) => Promise<{ success: boolean; error?: string }>;
  respondToPartnerParcel: (
    parcelId: string,
    decision: 'accepted' | 'rejected',
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  acceptAllPendingPartnerParcels: (
    parcelIds?: string[]
  ) => Promise<{ success: boolean; acceptedCount: number; error?: string }>;
  confirmParcelTripArrived: (parcelId: string) => Promise<{ success: boolean; error?: string }>;
  confirmTripArrivedAtDestination: (tripId: string) => Promise<{ success: boolean; error?: string; trip?: Trip }>;

  // Real-time Notifications (للمدير وللعامل المعني)
  notifications: AppNotification[];
  unreadNotificationsCount: number;
  markAllNotificationsRead: () => void;
  clearNotifications: () => void;

  // Account Terminated Real-time Watchdog Notice
  accountTerminatedNotice: { isOpen: boolean; reason: 'deleted' | 'suspended'; message: string };
  dismissAccountTerminatedNotice: () => void;

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
    fromCurrency: 'MAD' | 'MRU' | 'EUR';
    toCurrency: 'MAD' | 'MRU' | 'EUR';
    fromAmount: number;
    toAmount: number;
    rate: number;
    transferFee?: number;
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
    send_currency: 'MAD' | 'MRU' | 'EUR';
    payout_amount: number;
    payout_currency: 'MAD' | 'MRU' | 'EUR';
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
  loadAllMatchingParcelsToTrip: (
    tripId: string,
    parcelIds?: string[]
  ) => Promise<{ success: boolean; loadedCount: number; error?: string; trip?: Trip }>;
  receiveAllParcelsInTrip: (
    tripId: string
  ) => Promise<{ success: boolean; receivedCount: number; error?: string; trip?: Trip }>;

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
  updateWorkspaceSubscription: (
    workspaceId: string,
    action: 'activate' | 'extend' | 'suspend' | 'decrease' | 'set_date',
    months?: number,
    options?: { days?: number; exactEndDate?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceNotes: (workspaceId: string, notes: string) => Promise<{ success: boolean; error?: string }>;
  updateWorkspaceQuotas: (workspaceId: string, quotas: { max_workers: number; max_stations: number; max_workers_per_station?: number; max_collaborations: number; plan_name?: string; plan_tier?: 'plan_1_full' | 'plan_2_two_stations' }) => Promise<{ success: boolean; error?: string }>;
  switchWorkspacePlan: (planTier: 'plan_1_full' | 'plan_2_two_stations', workspaceId?: string) => Promise<{ success: boolean; error?: string }>;
  deleteWorkspaceFromPlatform: (workspaceId: string) => Promise<{ success: boolean; error?: string }>;

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
  updateUserContactNumbers: (newPhone: string, newWhatsapp?: string, newName?: string, newEmail?: string) => Promise<{ success: boolean; error?: string }>;
  requestWhatsAppOtp: (whatsappOrPhone: string) => Promise<{
    success: boolean;
    error?: string;
    rateLimited?: boolean;
    retryAfterSeconds?: number;
    cooldownSeconds?: number;
    remainingSends?: number;
    maxSendsPerWindow?: number;
    expiresAtMs?: number;
    targetPhone?: string;
    targetWhatsapp?: string;
    targetEmail?: string;
    userName?: string;
    userRoleLabel?: string;
    deliveredViaMetaApi?: boolean;
    deliveredViaGmail?: boolean;
    metaMessageId?: string | null;
    otpCodeForPreview?: string;
  }>;
  verifyWhatsAppOtpCode: (
    whatsappOrPhone: string,
    otpCode: string
  ) => Promise<{
    success: boolean;
    error?: string;
    expired?: boolean;
    locked?: boolean;
    remainingAttempts?: number;
  }>;
  resetPasswordWithWhatsAppOtp: (
    whatsappOrPhone: string,
    otpCode: string,
    newPassword: string
  ) => Promise<{
    success: boolean;
    error?: string;
    targetPhone?: string;
  }>;

  // Language & i18n & Theme Mode (Light Mode is default)
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
  themeMode: 'light' | 'dark';
  setThemeMode: (mode: 'light' | 'dark') => void;
  toggleThemeMode: () => void;

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

  // Language State - Supporting 5 Languages: ar, hassaniya, fr, en, es
  const [language, setLanguageState] = useState<Language>(() => {
    return getSavedLanguage();
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    saveLanguage(lang);
  };

  useEffect(() => {
    saveLanguage(language);
  }, [language]);

  const t = (key: string, fallback?: string): string => {
    return getTranslation(language, key, fallback);
  };

  // Theme Mode: Dark Mode ('dark') is the default on first visit
  const [themeMode, setThemeModeState] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('sahara_theme_mode_v3');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return 'dark';
  });

  const setThemeMode = useCallback((mode: 'light' | 'dark') => {
    setThemeModeState(mode);
    try {
      localStorage.setItem('sahara_theme_mode_v3', mode);
    } catch {}
  }, []);

  const toggleThemeMode = useCallback(() => {
    setThemeModeState((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('sahara_theme_mode_v3', next);
      } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    if (themeMode === 'light') {
      root.classList.add('theme-light');
      root.classList.remove('theme-dark');
      body.classList.add('theme-light');
      body.classList.remove('theme-dark');
    } else {
      root.classList.add('theme-dark');
      root.classList.remove('theme-light');
      body.classList.add('theme-dark');
      body.classList.remove('theme-light');
    }
  }, [themeMode]);

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
      if (typeof parsed.name === 'string' && parsed.name.includes('الاتحادية')) {
        parsed.name = parsed.name.replace(/محطة الاتحادية|الاتحادية/g, 'Sahara📦 Express');
      }
      if (typeof parsed.custom_brand_name === 'string' && parsed.custom_brand_name.includes('الاتحادية')) {
        parsed.custom_brand_name = parsed.custom_brand_name.replace(/محطة الاتحادية|الاتحادية/g, 'Sahara📦 Express');
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

  // 6.b Persistent tracking of manager-deleted stations (to instantly freeze and block any worker or operation)
  const [deletedStationIds, setDeletedStationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('aman_deleted_station_ids');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('aman_deleted_station_ids', JSON.stringify(deletedStationIds));
    } catch {}
  }, [deletedStationIds]);

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

  // 8. Currencies (MAD, MRU, EUR and any custom currencies)
  const [currencies, setCurrencies] = useState<Currency[]>(() => {
    const wsId = currentWorkspace?.id || 'ws-default';
    const initial = getInitialCurrencies(wsId);
    const saved = localStorage.getItem('aman_currencies');
    if (!saved) return initial;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        if (!parsed.some((c: any) => c.code === 'EUR')) {
          const eur = initial.find(c => c.code === 'EUR');
          if (eur) return [...parsed, eur];
        }
        return parsed;
      }
      return initial;
    } catch {
      return initial;
    }
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
  const allParcelsRef = useRef<Parcel[]>(allParcels);
  allParcelsRef.current = allParcels;

  // 10.b All Trips & Dispatch
  const [allTrips, setAllTrips] = useState<Trip[]>(() => {
    return storageService.get<Trip[]>('TRIPS', []);
  });
  const allTripsRef = useRef<Trip[]>(allTrips);
  allTripsRef.current = allTrips;

  const [rememberedDrivers, setRememberedDrivers] = useState<RememberedDriver[]>(() => {
    return tripService.getRememberedDrivers();
  });

  const [rememberedPlates, setRememberedPlates] = useState<RememberedVehicle[]>(() => {
    return tripService.getRememberedPlates();
  });

  // 11. Subscription (Strictly linked to Manager's Workspace - Single 30-Day Trial Once Only)
  const [subscription, setSubscription] = useState<Subscription | null>(() => {
    const wsId = currentWorkspace?.id || 'ws-default';
    let fixedCreatedAt = currentWorkspace?.created_at;
    if (!fixedCreatedAt) {
      const savedAnchor = localStorage.getItem(`alittihadia_trial_anchor_${wsId}`);
      if (savedAnchor) {
        fixedCreatedAt = savedAnchor;
      } else {
        fixedCreatedAt = new Date().toISOString();
        try {
          localStorage.setItem(`alittihadia_trial_anchor_${wsId}`, fixedCreatedAt);
        } catch {}
      }
    }
    const wsEndDate =
      currentWorkspace?.subscription_end_date ||
      new Date(new Date(fixedCreatedAt).getTime() + 30 * 86400000).toISOString();
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
            end_date: currentWorkspace?.subscription_end_date || parsed.end_date || wsEndDate,
          };
        }
      } catch {}
    }
    return {
      id: `sub-${wsId}`,
      workspace_id: wsId,
      team_id: wsId,
      status: currentWorkspace?.subscription_status || 'active',
      start_date: fixedCreatedAt,
      end_date: wsEndDate,
      created_at: fixedCreatedAt,
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

  // 16. Manager Cross-Partnership Network (غرفة الشراكة بين المدراء)
  const [managerPartnerships, setManagerPartnerships] = useState<ManagerPartnership[]>(() => {
    try {
      const saved = localStorage.getItem('alittihadia_manager_partnerships_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [registeredManagersNetwork, setRegisteredManagersNetwork] = useState<{
    workspaceId: string;
    workspaceName: string;
    shortId: string;
    ownerName: string;
    phone: string;
    whatsapp?: string;
    email?: string;
    stations: PartnershipStationInfo[];
    planTier?: string;
    stars?: number;
    parcelsCount?: number;
    deliveredCount?: number;
    activityLabel?: string;
  }[]>([]);

  const [selectedStationIdState, setSelectedStationIdState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('alittihadia_selected_station_id') || null;
    } catch {
      return null;
    }
  });
  const setSelectedStationId = useCallback((id: string | null) => {
    setSelectedStationIdState(id);
    try {
      if (id) {
        localStorage.setItem('alittihadia_selected_station_id', id);
      } else {
        localStorage.removeItem('alittihadia_selected_station_id');
      }
    } catch {}
  }, []);
  const selectedStationId = selectedStationIdState;
  const [isPlatformOwner, setIsPlatformOwner] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const isOnline = useOnlineStatus();
  const realtimeChannelRef = useRef<any>(null);

  // 17. Real-time In-App Notifications State (للمدير وللعامل المعني)
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('alittihadia_notifications_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const pushNotification = useCallback(
    (params: {
      workspace_id?: string;
      target_station_id?: string | null;
      target_role?: 'owner' | 'worker' | 'all';
      title: string;
      message: string;
      type?: AppNotification['type'];
      parcel_id?: string;
      trip_id?: string;
      partnership_id?: string;
    }) => {
      const wsId = params.workspace_id || currentWorkspace?.id || 'ws-default';
      const newNotif: AppNotification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        workspace_id: wsId,
        target_station_id: params.target_station_id || null,
        target_role: params.target_role || 'all',
        title: params.title,
        message: params.message,
        type: params.type || 'partnership',
        is_read: false,
        created_at: new Date().toISOString(),
        parcel_id: params.parcel_id,
        trip_id: params.trip_id,
        partnership_id: params.partnership_id,
      };
      setAllNotifications((prev) => {
        const next = [newNotif, ...prev].slice(0, 120);
        try {
          localStorage.setItem('alittihadia_notifications_v1', JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [currentWorkspace?.id]
  );

  // Cross-tab synchronization for notifications
  useEffect(() => {
    const handleStorageNotif = (e: StorageEvent) => {
      if (e.key === 'alittihadia_notifications_v1' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) setAllNotifications(parsed);
        } catch {}
      }
    };
    window.addEventListener('storage', handleStorageNotif);
    return () => window.removeEventListener('storage', handleStorageNotif);
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load all workspaces for Platform Owner from Firebase Firestore & server-side RPC
  const refreshPlatformWorkspaces = useCallback(async () => {
    // 1. Load from Firebase Firestore when available
    if (firebaseSyncService.isAvailable()) {
      try {
        const cloudWorkspaces = await firebaseSyncService.listAllWorkspacesFromCloud();
        const wsList: Workspace[] = [];
        const subList: Subscription[] = [];
        cloudWorkspaces.forEach((item: Workspace) => {
          const defaultEnd = item.created_at
            ? new Date(new Date(item.created_at).getTime() + 30 * 86400000).toISOString()
            : new Date(Date.now() + 30 * 86400000).toISOString();
          const endDate = item.subscription_end_date || defaultEnd;
          const rawStatus = item.subscription_status || 'active';
          const effectiveStatus: 'active' | 'expired' | 'suspended' =
            rawStatus === 'suspended'
              ? 'suspended'
              : new Date(endDate).getTime() <= Date.now()
              ? 'expired'
              : 'active';

          wsList.push({
            ...item,
            plan_name:
              item.plan_name ||
              (item.plan_tier === 'plan_2_two_stations'
                ? 'الباك الأول (149 درهم — محطتين)'
                : 'الباك الثاني (299 درهم — الباقة الشاملة)'),
            max_workers: item.max_workers ?? (item.plan_tier === 'plan_2_two_stations' ? 2 : 999),
            max_stations: item.max_stations ?? (item.plan_tier === 'plan_2_two_stations' ? 2 : 999),
            max_collaborations: item.max_collaborations ?? 99,
            subscription_status: effectiveStatus,
            subscription_end_date: endDate,
          });

          subList.push({
            id: `sub-${item.id}`,
            workspace_id: item.id,
            team_id: item.id,
            status: effectiveStatus,
            plan_name:
              item.plan_name ||
              (item.plan_tier === 'plan_2_two_stations'
                ? 'الباك الأول (149 درهم — محطتين)'
                : 'الباك الثاني (299 درهم — الباقة الشاملة)'),
            start_date: item.created_at || new Date().toISOString(),
            end_date: endDate,
            is_trial: false,
            created_at: item.created_at || new Date().toISOString(),
          });
        });
        setAllWorkspacesState(wsList);
        setAllSubscriptionsState(subList);
        localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(wsList));
        localStorage.setItem('alittihadia_all_subscriptions', JSON.stringify(subList));
        return;
      } catch (err) {
        console.warn('Error loading workspaces from Firestore:', err);
      }
    }

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

  const checkIsMasterAccount = useCallback(
    (user?: Profile | null, ws?: Workspace | null): boolean => {
      if (!user) return false;
      const emailNorm = (user.email || '').trim().toLowerCase();
      const phoneNorm = cleanPhoneNumber(user.phone || '');
      const whatsappNorm = cleanPhoneNumber(user.whatsapp_number || '');
      const wsPhoneNorm = cleanPhoneNumber(ws?.owner_phone || '');
      const wsWhatsappNorm = cleanPhoneNumber(ws?.owner_whatsapp || '');
      const masterPhones = new Set([
        '212618961387',
        '0618961387',
      ]);
      return (
        emailNorm === 'aissaaimanekhlifi@gmail.com' ||
        masterPhones.has(phoneNorm) ||
        masterPhones.has(whatsappNorm) ||
        masterPhones.has(wsPhoneNorm) ||
        masterPhones.has(wsWhatsappNorm)
      );
    },
    []
  );

  // Automatically detect Platform Owner account & keep workspaces list synced in real time
  useEffect(() => {
    if (!currentUser) {
      setIsPlatformOwner(false);
      return;
    }
    if (checkIsMasterAccount(currentUser, currentWorkspace)) {
      setIsPlatformOwner(true);
      refreshPlatformWorkspaces();
    } else {
      setIsPlatformOwner(false);
      setAllWorkspacesState(currentWorkspace ? [currentWorkspace] : []);
      setAllSubscriptionsState(subscription ? [subscription] : []);
      localStorage.removeItem('alittihadia_all_workspaces');
      localStorage.removeItem('alittihadia_all_subscriptions');
    }
  }, [currentUser, currentWorkspace?.id, currentWorkspace?.owner_phone, checkIsMasterAccount, refreshPlatformWorkspaces]);

  useEffect(() => {
    if (!isPlatformOwner || !firebaseSyncService.isAvailable() || !currentUser) return;
    const unsub = firebaseSyncService.subscribeToAllWorkspaces((cloudWorkspaces) => {
      if (!cloudWorkspaces) return;
      const wsList: Workspace[] = [];
      const subList: Subscription[] = [];
      cloudWorkspaces.forEach((item: Workspace) => {
        const defaultEnd = item.created_at
          ? new Date(new Date(item.created_at).getTime() + 30 * 86400000).toISOString()
          : new Date(Date.now() + 30 * 86400000).toISOString();
        const endDate = item.subscription_end_date || defaultEnd;
        const rawStatus = item.subscription_status || 'active';
        const effectiveStatus: 'active' | 'expired' | 'suspended' =
          rawStatus === 'suspended'
            ? 'suspended'
            : new Date(endDate).getTime() <= Date.now()
            ? 'expired'
            : 'active';

        wsList.push({
          ...item,
          subscription_status: effectiveStatus,
          subscription_end_date: endDate,
        });
        subList.push({
          id: `sub-${item.id}`,
          workspace_id: item.id,
          team_id: item.id,
          status: effectiveStatus,
          plan_name:
            item.plan_name ||
            (item.plan_tier === 'plan_2_two_stations'
              ? 'الباك الأول (149 درهم — محطتين)'
              : 'الباك الثاني (299 درهم — الباقة الشاملة)'),
          start_date: item.created_at || new Date().toISOString(),
          end_date: endDate,
          is_trial: false,
          created_at: item.created_at || new Date().toISOString(),
        });
      });
      setAllWorkspacesState(wsList);
      setAllSubscriptionsState(subList);
      localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(wsList));
      localStorage.setItem('alittihadia_all_subscriptions', JSON.stringify(subList));
    });
    return () => unsub();
  }, [isPlatformOwner, currentUser?.id]);

  // Load workspace data from Supabase when configured and logged in
  const loadWorkspaceFromCloud = useCallback(async (wsId: string, userId?: string) => {
    if (!isSupabaseConfigured() || !isValidUUID(wsId)) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;

    try {
      // 1. Check platform_owners exclusively via server-side RPC or master account check
      localStorage.removeItem('alittihadia_platform_owners');
      if (userId && isValidUUID(userId)) {
        const { data: isOwnerRpc, error: poErr } = await supabase.rpc('rpc_check_is_platform_owner');
        const ownerVerified = typeof isOwnerRpc === 'boolean'
          ? isOwnerRpc
          : Boolean(isOwnerRpc?.is_platform_owner);
        if ((!poErr && ownerVerified) || checkIsMasterAccount(currentUser, currentWorkspace)) {
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

  // Determine User Role in current workspace (3 Strict Roles):
  // 1. platform_owner: Super Admin (صاحب التطبيق 0618961387)
  // 2. owner: Admin (مول الشركة، اللي كيدير الاشتراك وكيتحكم فالمحطات والعمال ديالو)
  // 3. worker: User (العامل، كيخدم غير فالمحطة ديالو اللي عطاه ليها الـ Admin)
  const userRole: UserRole = useMemo<UserRole>(() => {
    if (!currentUser) return 'worker';
    
    // الأمان المحكم: دور مالك المنصة يأتي حصراً من جدول platform_owners عبر دالة RPC آمنة في السحابة، وليس من localStorage أبداً
    if (isPlatformOwner) {
      return 'platform_owner';
    }
    if (!currentWorkspace) return 'owner';
    if (currentWorkspace.created_by === currentUser.id) return 'owner';
    const member = workspaceMembers.find(m => m.user_id === currentUser.id && m.status === 'active');
    if (member?.role === 'owner' || member?.role === 'admin') return 'owner';
    if (member?.role === 'worker') return 'worker';
    return 'owner';
  }, [currentUser, currentWorkspace, workspaceMembers, isPlatformOwner]);

  // الباك الأول (149 درهم): محطتين (2) فقط + 2 عمال + الملصقات والبونات باسم ولوغو التطبيق الرسمي
  const isPlan2TwoStations = useMemo(() => {
    if (!currentWorkspace) return false;
    const pName = (currentWorkspace.plan_name || '').trim();
    if (pName.includes('تجريبي') || pName.includes('30 يوم') || pName.includes('مجاناً')) {
      return false;
    }
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

  // Determine user's assigned station if worker (User = العامل)
  const rawAssignedWorkerStationId = useMemo(() => {
    if (!currentUser) return null;
    const assignment = stationWorkers.find(sw => sw.user_id === currentUser.id);
    const memberEntry = workspaceMembers.find(m => m.user_id === currentUser.id);
    return (
      assignment?.station_id ||
      memberEntry?.station_id ||
      (currentUser as any)?.station_id ||
      null
    );
  }, [currentUser, stationWorkers, workspaceMembers]);

  // فحص صارم للعامل فقط: هل تم حذف أو إيقاف المحطة المخصصة للعامل من طرف الـ Admin؟
  const isWorkerStationDeleted = useMemo(() => {
    if (!currentUser) return false;
    if (userRole !== 'worker') return false;
    if (!rawAssignedWorkerStationId) return true;
    if (deletedStationIds.includes(rawAssignedWorkerStationId)) return true;
    if (visibleStations.length > 0 && !visibleStations.some(s => s.id === rawAssignedWorkerStationId)) {
      return true;
    }
    if (visibleStations.length === 0) return true;
    return false;
  }, [currentUser, userRole, rawAssignedWorkerStationId, deletedStationIds, visibleStations]);

  const userAssignedStationId = useMemo(() => {
    if (!currentUser) return null;
    if (userRole === 'worker') {
      if (isWorkerStationDeleted) return null;
      return rawAssignedWorkerStationId;
    }
    return rawAssignedWorkerStationId || visibleStations[0]?.id || null;
  }, [currentUser, userRole, isWorkerStationDeleted, rawAssignedWorkerStationId, visibleStations]);

  useEffect(() => {
    if (userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId) {
        setSelectedStationIdState(null);
      } else {
        setSelectedStationIdState(userAssignedStationId);
      }
    } else if (visibleStations.length === 0) {
      if (selectedStationId !== null) setSelectedStationIdState(null);
    } else if (selectedStationId === 'all') {
      // الحفاظ على اختيار "كل المحطات" للمدير بدون إعادة التعيين التلقائي للمحطة الأولى
      return;
    } else if (selectedStationId && visibleStations.some(s => s.id === selectedStationId)) {
      // المحطة المختارة موجودة وصحيحة — تبقى مفتوحة الفوق كما هي
      return;
    } else {
      let savedId: string | null = null;
      try {
        savedId = localStorage.getItem('alittihadia_selected_station_id');
      } catch {}
      if (savedId === 'all' || (savedId && visibleStations.some(s => s.id === savedId))) {
        setSelectedStationIdState(savedId);
      } else {
        setSelectedStationId(visibleStations[0]?.id || null);
      }
    }
  }, [userRole, userAssignedStationId, isWorkerStationDeleted, visibleStations, selectedStationId, setSelectedStationId]);

  // Filtered Notifications for Current User (Manager sees workspace notifications scoped to selected station; Worker sees notifications for their assigned station)
  const notifications: AppNotification[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const wsId = currentWorkspace.id;
    return allNotifications.filter((n) => {
      if (n.workspace_id !== wsId) return false;
      if (userRole === 'worker') {
        if (n.target_role === 'owner') return false;
        if (n.target_station_id && userAssignedStationId && n.target_station_id !== userAssignedStationId) {
          return false;
        }
      } else if (selectedStationId && selectedStationId !== 'all') {
        if (n.target_station_id && n.target_station_id !== selectedStationId) {
          return false;
        }
      }
      return true;
    });
  }, [allNotifications, currentWorkspace, userRole, userAssignedStationId, selectedStationId]);

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => !n.is_read).length;
  }, [notifications]);

  const markAllNotificationsRead = useCallback(() => {
    if (!currentWorkspace) return;
    const wsId = currentWorkspace.id;
    setAllNotifications((prev) => {
      const next = prev.map((n) => (n.workspace_id === wsId ? { ...n, is_read: true } : n));
      try {
        localStorage.setItem('alittihadia_notifications_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [currentWorkspace]);

  const clearNotifications = useCallback(() => {
    if (!currentWorkspace) return;
    const wsId = currentWorkspace.id;
    setAllNotifications((prev) => {
      const next = prev.filter((n) => n.workspace_id !== wsId);
      try {
        localStorage.setItem('alittihadia_notifications_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, [currentWorkspace]);

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
        if (!userAssignedStationId || tx.station_id !== userAssignedStationId) return false;
      } else if (selectedStationId && selectedStationId !== 'all') {
        // When Admin switches to a specific station in the top bar, show only that station's transactions
        if (tx.station_id !== selectedStationId) return false;
      }

      return true;
    });
  }, [currentWorkspace, allTransactions, userRole, userAssignedStationId, selectedStationId]);

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
    // Sort so real (non-demo) workers take priority over demo workers
    const sorted = [...rawMembers].sort((a, b) => Number(Boolean(a.is_demo)) - Number(Boolean(b.is_demo)));
    const allowedIds = new Set<string>();
    let activeWorkersCount = 0;

    for (const m of sorted) {
      if (m.role === 'admin' || m.role === 'owner') {
        allowedIds.add(m.user_id);
        continue;
      }
      const stId = m.station_id || visibleStations[0]?.id || '';
      if (!activeStationIds.has(stId)) continue;
      if (activeWorkersCount >= 2) continue;
      activeWorkersCount++;
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

        // If worker: strictly isolate to parcels originating at their station, or shipped parcels arriving at their station
        if (userRole === 'worker') {
          if (pWs !== myWsId) return false;
          if (!userAssignedStationId) return false;
          const isOrigin = p.origin_station_id === userAssignedStationId;
          const isShippedToDest =
            (p.destination_station_id === userAssignedStationId ||
              p.partner_destination_station_id === userAssignedStationId) &&
            p.status !== 'registered' &&
            p.status !== 'pending';
          if (!isOrigin && !isShippedToDest) return false;
        } else if (selectedStationId && selectedStationId !== 'all') {
          // When Admin switches to a specific station in the top bar, show strictly that station's own parcels (plus shipped incoming parcels)
          const isOrigin = p.origin_station_id === selectedStationId;
          const isShippedToDest =
            (p.destination_station_id === selectedStationId ||
              p.partner_destination_station_id === selectedStationId) &&
            p.status !== 'registered' &&
            p.status !== 'pending';
          if (!isOrigin && !isShippedToDest) return false;
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
  }, [currentWorkspace, collaborations, allParcels, userRole, userAssignedStationId, selectedStationId]);

  // Visible Trips:
  // Strictly isolated: Workers only see trips originating from or heading to their assigned station; Admin sees selected station's trips when switched!
  const trips: Trip[] = useMemo(() => {
    if (!currentWorkspace) return [];
    const myWsId = currentWorkspace.id;
    return allTrips.filter(t => {
      if (t.workspace_id !== myWsId) return false;
      if (userRole === 'worker') {
        if (!userAssignedStationId) return false;
        const isOrigin = t.origin_station_id === userAssignedStationId;
        const isDest =
          (t.destination_station_id === userAssignedStationId ||
            t.partner_destination_station_id === userAssignedStationId) &&
          t.status !== 'loading';
        if (!isOrigin && !isDest) return false;
      } else if (selectedStationId && selectedStationId !== 'all') {
        const isOrigin = t.origin_station_id === selectedStationId;
        const isDest =
          (t.destination_station_id === selectedStationId ||
            t.partner_destination_station_id === selectedStationId) &&
          t.status !== 'loading';
        if (!isOrigin && !isDest) return false;
      }
      return true;
    });
  }, [currentWorkspace, allTrips, userRole, userAssignedStationId, selectedStationId]);

  useEffect(() => {
    storageService.set('TRIPS', allTrips);
  }, [allTrips]);

  // Station Balances Calculation (Strictly Real Transactions Only, Isolated per station_id)
  const stationBalances = useMemo(() => {
    const balances: Record<string, Record<string, number>> = {};
    const myWsId = currentWorkspace?.id;

    stations.forEach(s => {
      balances[s.id] = {};
      currencies.forEach(c => {
        balances[s.id][c.code] = 0;
      });
    });

    allTransactions.forEach(tx => {
      if (tx.status !== 'confirmed' || tx.deleted_at) return;
      const txWs = tx.workspace_id || tx.team_id || '';
      if (myWsId && txWs && txWs !== myWsId) return;
      if (!tx.station_id) return;
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
  }, [stations, currencies, allTransactions, currentWorkspace]);

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

  // Grace period timestamp ref for brand-new registrations so initial snapshot race conditions never kick out a new sign-up
  const registrationGraceUntilRef = useRef<number>(0);

  // Account Termination & Revocation State
  const [accountTerminatedNotice, setAccountTerminatedNotice] = useState<{
    isOpen: boolean;
    reason: 'deleted' | 'suspended';
    message: string;
  }>({ isOpen: false, reason: 'deleted', message: '' });

  const dismissAccountTerminatedNotice = useCallback(() => {
    setAccountTerminatedNotice({ isOpen: false, reason: 'deleted', message: '' });
  }, []);

  // Force immediate logout and session cleanup when account or workspace is deleted/revoked
  const handleAccountTerminated = useCallback((reason: 'deleted' | 'suspended', customMsg?: string) => {
    const terminatedPhone = cleanPhoneNumber(currentUser?.phone || '');
    setIsPlatformOwner(false);
    setCurrentUser(null);
    setCurrentWorkspace(null);
    try {
      localStorage.removeItem('aman_user');
      localStorage.removeItem('aman_workspace');
      localStorage.removeItem('aman_team');
      localStorage.removeItem('ittihadiya_saved_login_phone');
      if (reason === 'deleted' && terminatedPhone) {
        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
        if (localAccounts[terminatedPhone]) {
          delete localAccounts[terminatedPhone];
          localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
        }
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        if (tempMap[terminatedPhone]) {
          delete tempMap[terminatedPhone];
          localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
        }
      }
    } catch {}

    const msg = customMsg || (reason === 'deleted'
      ? '⚠️ تم حذف أو إنهاء هذا الحساب من قاعدة البيانات. يرجى إدخال رقم هاتف وبريد Gmail جديدين للتسجيل أو استخدام حساب نشط.'
      : '⛔ تم تجميد وتوقيف هذا الحساب ومساحة العمل من قِبل إدارة النظام.');

    setAccountTerminatedNotice({
      isOpen: true,
      reason,
      message: msg,
    });
    showToast(msg, 'error');
  }, [currentUser?.phone, showToast]);

  // Force immediate logout when a worker account is deleted/revoked by manager
  const forceRevokedWorkerLogout = useCallback(() => {
    handleAccountTerminated('deleted', 'تم إيقاف أو حذف حسابك من طرف مدير المحطة. لم يعد بإمكانك الوصول إلى النظام.');
  }, [handleAccountTerminated]);

  // REAL-TIME ACCOUNT & WORKSPACE DELETION/SUSPENSION WATCHDOG
  useEffect(() => {
    if (!currentUser || !firebaseSyncService.isAvailable()) return;
    // Never terminate the Platform Owner / Super Admin master account
    if (checkIsMasterAccount(currentUser, currentWorkspace)) return;
    const phone = currentUser.phone || '';
    const wsId = currentWorkspace?.id || '';

    const unsub = firebaseSyncService.subscribeToAccountStatus(
      phone,
      wsId,
      (status) => {
        const isInNewRegGrace = Date.now() < registrationGraceUntilRef.current;

        // 1. If user doc was deleted from Firebase /users directly or marked deleted/revoked
        if (status.userDeleted || status.userRevoked) {
          if (!status.userExists && isInNewRegGrace) return;
          // Also delete the orphaned workspace & partnerships from Firebase so it vanishes from لوحة التحكم and غرفة الشراكة!
          if (wsId) {
            firebaseSyncService.deleteWorkspaceCompletelyFromCloud(wsId, phone).catch(() => {});
          }
          handleAccountTerminated('deleted');
          return;
        }

        // 2. If workspace was deleted from Firebase /workspaces directly or marked deleted
        if (status.workspaceDeleted) {
          if (!status.workspaceExists && isInNewRegGrace) return;
          // Also delete the user doc & partnerships from Firebase so everything is 100% linked!
          if (wsId || phone) {
            firebaseSyncService.deleteWorkspaceCompletelyFromCloud(wsId, phone).catch(() => {});
          }
          handleAccountTerminated('deleted', '⚠️ تم حذف مساحة العمل هذه نهائياً من قِبل الإدارة أو Firebase. يرجى التسجيل برقم هاتف وجيمايل جديدين.');
          return;
        }

        // 3. If workspace was suspended in real-time by the Platform Owner -> immediately block and log out!
        if (status.workspaceSuspended) {
          handleAccountTerminated('suspended', '⛔ تم توقيف وتجميد هذا الحساب من قِبل إدارة التطبيق.');
          return;
        } else if (status.subscriptionEndDate || status.subscriptionStatus) {
          if (status.subscriptionStatus && status.subscriptionStatus !== 'suspended') {
            setCurrentWorkspace(prev => prev ? {
              ...prev,
              subscription_status: status.subscriptionStatus as any,
              subscription_end_date: status.subscriptionEndDate || prev.subscription_end_date
            } : null);
          }
        }
      }
    );

    return () => {
      unsub();
    };
  }, [currentUser?.id, currentUser?.phone, currentWorkspace?.id, handleAccountTerminated]);

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

        if (cloudData.stations.length > 0 || cloudData.workspace.last_reset_at) {
          setStations(cloudData.stations.map(s => ({ ...s, workspace_id: wsId, team_id: wsId })));
        } else {
          // Push any local non-demo stations that weren't in Firestore yet
          stations
            .filter(s => (!s.workspace_id || s.workspace_id === wsId || s.team_id === wsId) && !s.is_demo)
            .forEach(s => firebaseSyncService.syncStation(wsId, s).catch(() => {}));
        }
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
          // Attach any locally stored temp passwords / worker codes so they are preserved and synced to Firestore
          let tempMap: Record<string, string> = {};
          let localAccounts: Record<string, any> = {};
          try {
            tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
            localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
          } catch {}

          const syncedMembers = cloudData.members.map(m => {
            const mPhone = cleanPhoneNumber(m.profile?.phone || m.phone || '');
            const localCode =
              (mPhone && (tempMap[mPhone] || localAccounts[mPhone]?.password)) ||
              m.worker_code ||
              m.profile?.worker_code ||
              undefined;
            const enrichedMember: WorkspaceMember = {
              ...m,
              workspace_id: wsId,
              worker_code: localCode || m.worker_code,
              profile: m.profile
                ? {
                    ...m.profile,
                    worker_code: localCode || m.profile.worker_code,
                    must_change_password: false,
                  }
                : m.profile,
            };

            // If this is an active worker and we have their code locally on the Admin's device, ensure Firestore users/{phone} & users/code_{CODE} have it
            if (m.role === 'worker' && m.status === 'active' && mPhone && localCode) {
              firebaseSyncService
                .saveUserAccount(mPhone, {
                  id: m.user_id,
                  name: m.profile?.name || m.name || 'عامل المحطة',
                  phone: mPhone,
                  whatsapp_number: m.profile?.whatsapp_number || mPhone,
                  password: localCode,
                  worker_code: localCode,
                  role: 'worker',
                  workspace_id: wsId,
                  station_id: m.station_id || null,
                  must_change_password: false,
                  status: 'active',
                  deleted: false,
                  created_at: m.profile?.created_at || m.joined_at || new Date().toISOString(),
                })
                .catch(() => {});
              if (localCode !== m.worker_code) {
                firebaseSyncService.syncWorkspaceMember(wsId, enrichedMember).catch(() => {});
              }
            }
            return enrichedMember;
          });
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
        // Workspace does NOT exist in Firestore!
        // ONLY upload if this is the Super Admin Master Account OR a brand-new registration in progress.
        // Otherwise, this workspace was deleted from Firebase -> NEVER re-upload it, and terminate the session immediately!
        if (
          checkIsMasterAccount(currentUser, currentWorkspace) ||
          Date.now() < registrationGraceUntilRef.current
        ) {
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
        } else {
          if (currentUser?.phone) {
            firebaseSyncService.deleteWorkspaceCompletelyFromCloud(wsId, currentUser.phone).catch(() => {});
          }
          handleAccountTerminated('deleted');
        }
      }
    }).catch(() => {});

    // 2. Real-time subscription from Firebase Firestore (reflects additions, edits, AND deletions/wipes immediately across all users in the room)
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
        try {
          if (remoteWs.custom_brand_name !== undefined || remoteWs.custom_brand_logo_url !== undefined) {
            const cleanLogo = sanitizeOfficialBrandLogo(remoteWs.custom_brand_logo_url);
            localStorage.setItem(
              `alittihadia_branding_${wsId}`,
              JSON.stringify({
                custom_brand_name: remoteWs.custom_brand_name || '',
                custom_brand_subtitle: remoteWs.custom_brand_subtitle || '',
                custom_brand_phone: remoteWs.custom_brand_phone || '',
                custom_brand_logo_url: cleanLogo,
              })
            );
            localStorage.setItem(
              'alittihadia_sticker_branding_v1',
              JSON.stringify({
                agencyName: remoteWs.custom_brand_name || remoteWs.name || OFFICIAL_APP_BRAND_NAME,
                agencyPhone: remoteWs.custom_brand_phone || remoteWs.owner_phone || '',
                logoUrl: cleanLogo,
              })
            );
            window.dispatchEvent(new Event('sticker-branding-updated'));
          }
        } catch {}
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
        setSelectedStationIdState(prevSelected => {
          if (prevSelected && prevSelected !== 'all' && !cleanList.some(s => s.id === prevSelected)) {
            return cleanList.length > 0 ? 'all' : null;
          }
          return prevSelected;
        });

        // Cascade any renamed station names into parcels, transactions, and hawalas immediately
        if (cleanList.length > 0) {
          const stNameMap = new Map<string, string>(cleanList.map(s => [s.id, s.name]));
          setAllParcels(prev => {
            let changedAny = false;
            const next = prev.map(p => {
              let changed = false;
              const np = { ...p };
              const newOrig = stNameMap.get(p.origin_station_id);
              if (newOrig && np.origin_station_name !== newOrig) {
                np.origin_station_name = newOrig;
                changed = true;
              }
              const newDest = stNameMap.get(p.destination_station_id);
              if (newDest && np.destination_station_name !== newDest) {
                np.destination_station_name = newDest;
                changed = true;
              }
              if (changed) changedAny = true;
              return changed ? np : p;
            });
            if (changedAny) {
              allParcelsRef.current = next;
              return next;
            }
            return prev;
          });
          setAllTransactions(prev => {
            let changedAny = false;
            const next = prev.map(tx => {
              let changed = false;
              const ntx = { ...tx };
              const newStName = stNameMap.get(tx.station_id);
              if (newStName && ntx.station_name !== newStName) {
                ntx.station_name = newStName;
                changed = true;
              }
              if (ntx.hawala_meta) {
                const newHOrig = stNameMap.get(ntx.hawala_meta.origin_station_id);
                const newHDest = stNameMap.get(ntx.hawala_meta.destination_station_id);
                if (
                  (newHOrig && ntx.hawala_meta.origin_station_name !== newHOrig) ||
                  (newHDest && ntx.hawala_meta.destination_station_name !== newHDest)
                ) {
                  ntx.hawala_meta = {
                    ...ntx.hawala_meta,
                    origin_station_name: newHOrig || ntx.hawala_meta.origin_station_name,
                    destination_station_name: newHDest || ntx.hawala_meta.destination_station_name,
                  };
                  changed = true;
                }
              }
              if (changed) changedAny = true;
              return changed ? ntx : tx;
            });
            return changedAny ? next : prev;
          });
        }
      },
      onParcels: (remoteParcels) => {
        const cleanParcels = (remoteParcels || []).map(p => ({
          ...p,
          workspace_id: wsId,
          team_id: wsId,
        }));
        setAllParcels(prev => {
          const prevById = new Map<string, Parcel>(prev.map(item => [item.id, item]));
          for (const rp of cleanParcels) {
            const oldP = prevById.get(rp.id);
            const targetStId = rp.partner_destination_station_id || rp.destination_station_id || rp.origin_station_id;
            if (!oldP && (rp.is_partnership_parcel || rp.partner_origin_workspace_id)) {
              pushNotification({
                workspace_id: wsId,
                target_station_id: targetStId,
                target_role: 'all',
                title: `📦 طلب كولية شراكة جديد [${rp.tracking_code}]`,
                message: `كولية واردة من "${rp.partner_origin_workspace_name || rp.origin_station_name}" نحو محطة "${rp.destination_station_name}" (المستلم: ${rp.receiver_name})`,
                type: 'parcel',
                parcel_id: rp.id,
              });
            } else if (oldP) {
              if (oldP.partner_acceptance_status !== rp.partner_acceptance_status) {
                if (rp.partner_acceptance_status === 'accepted') {
                  pushNotification({
                    workspace_id: wsId,
                    target_station_id: targetStId,
                    target_role: 'all',
                    title: `✅ تم قبول الكولية [${rp.tracking_code}] في الشراكة`,
                    message: `وافق المدير في محطة "${rp.destination_station_name}" على استقبال الكولية — جاهزة للرحلة والشحن`,
                    type: 'parcel',
                    parcel_id: rp.id,
                  });
                } else if (rp.partner_acceptance_status === 'rejected') {
                  pushNotification({
                    workspace_id: wsId,
                    target_station_id: targetStId,
                    target_role: 'all',
                    title: `❌ تم رفض الكولية [${rp.tracking_code}]`,
                    message: `تم رفض الكولية من طرف محطة "${rp.destination_station_name}"${rp.partner_rejection_reason ? ` — السبب: ${rp.partner_rejection_reason}` : ''}`,
                    type: 'parcel',
                    parcel_id: rp.id,
                  });
                }
              } else if (!oldP.trip_arrived_at && rp.trip_arrived_at) {
                pushNotification({
                  workspace_id: wsId,
                  target_station_id: targetStId,
                  target_role: 'all',
                  title: `🏁 وصلات الكولية [${rp.tracking_code}] للمحطة`,
                  message: `وصلت رحلة الكولية إلى محطة "${rp.destination_station_name}" — بانتظار التفريغ في الستوك`,
                  type: 'parcel',
                  parcel_id: rp.id,
                });
              } else if (oldP.status !== rp.status) {
                const statusMapAr: Record<string, string> = {
                  in_transit: '🚚 انطلقت في الرحلة (في الطريق)',
                  arrived: '📥 تم تفريغها في ستوك المحطة',
                  delivered: '✅ تم تسليمها النهائي للمستلم',
                };
                if (statusMapAr[rp.status]) {
                  pushNotification({
                    workspace_id: wsId,
                    target_station_id: targetStId,
                    target_role: 'all',
                    title: `${statusMapAr[rp.status]} — [${rp.tracking_code}]`,
                    message: `الكولية (${rp.origin_station_name} ➔ ${rp.destination_station_name}) للمستلم: ${rp.receiver_name}`,
                    type: 'parcel',
                    parcel_id: rp.id,
                  });
                }
              }
            }
          }
          const otherWsParcels = prev.filter(p => p.workspace_id && p.workspace_id !== wsId && p.team_id !== wsId);
          const mergedList = [...cleanParcels, ...otherWsParcels].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
          allParcelsRef.current = mergedList;
          return mergedList;
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
        allTripsRef.current = cleanTrips;
        setAllTrips(prev => {
          const prevMap = new Map<string, Trip>(prev.map(item => [item.id, item]));
          for (const rt of cleanTrips) {
            const oldT = prevMap.get(rt.id);
            const targetSt = rt.partner_destination_station_id || rt.destination_station_id;
            if (!oldT && rt.status === 'departed') {
              pushNotification({
                workspace_id: wsId,
                target_station_id: targetSt,
                target_role: 'all',
                title: `🚚 رحلة شحن قادمة [${rt.trip_code}]`,
                message: `انطلقت رحلة السائق ${rt.driver_name} من "${rt.origin_station_name}" نحو "${rt.destination_station_name}" (${rt.loaded_parcel_ids?.length || 0} كوليات)`,
                type: 'trip',
                trip_id: rt.id,
              });
            } else if (oldT && oldT.status !== rt.status && rt.status === 'arrived') {
              pushNotification({
                workspace_id: wsId,
                target_station_id: targetSt,
                target_role: 'all',
                title: `🏁 وصلات الرحلة [${rt.trip_code}]`,
                message: `وصلت رحلة السائق ${rt.driver_name} إلى محطة "${rt.destination_station_name}"`,
                type: 'trip',
                trip_id: rt.id,
              });
            }
          }
          return cleanTrips;
        });
      },
      onMembers: (remoteMembers) => {
        if (Array.isArray(remoteMembers)) {
          const syncedMembers = remoteMembers
            .filter(m => !(m as any).deleted && m.status === 'active')
            .map(m => ({ ...m, workspace_id: wsId }));
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

    // 3. Universal Cross-Tab Instant Sync (for all users/tabs on the same browser without refresh)
    const handleUniversalTabStorageSync = (e: StorageEvent) => {
      if (!e.newValue) return;
      try {
        if (e.key === 'aman_stations') {
          const updatedStations = JSON.parse(e.newValue) as Station[];
          setStations(updatedStations);
        } else if (e.key === 'aman_deleted_station_ids') {
          const updatedDeleted = JSON.parse(e.newValue) as string[];
          setDeletedStationIds(updatedDeleted);
        } else if (e.key === 'aman_workspace_members') {
          const updatedMembers = JSON.parse(e.newValue) as WorkspaceMember[];
          setWorkspaceMembers(updatedMembers);
        } else if (e.key === 'aman_station_workers') {
          const updatedSw = JSON.parse(e.newValue) as StationWorker[];
          setStationWorkers(updatedSw);
        } else if (e.key === 'ittihadiya_parcels') {
          const updatedParcels = JSON.parse(e.newValue) as Parcel[];
          allParcelsRef.current = updatedParcels;
          setAllParcels(updatedParcels);
        } else if (e.key === 'aman_transactions') {
          const updatedTxs = JSON.parse(e.newValue) as Transaction[];
          setAllTransactions(updatedTxs);
        } else if (e.key === 'aman_workspace') {
          const updatedWs = JSON.parse(e.newValue) as Workspace;
          if (updatedWs && updatedWs.id === wsId) {
            setCurrentWorkspace(updatedWs);
          }
        }
      } catch {}
    };
    window.addEventListener('storage', handleUniversalTabStorageSync);

    return () => {
      isCancelled = true;
      unsubscribe();
      window.removeEventListener('storage', handleUniversalTabStorageSync);
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

    // 1. Check local revocation list or if assigned station was deleted (إلا مسح محطة، تمسح من كلشي، والعامل ديالها يخرج)
    if (
      isAccountRevokedLocally(currentUser.id, currentUser.phone) ||
      (rawAssignedWorkerStationId &&
        (deletedStationIds.includes(rawAssignedWorkerStationId) ||
          (stations.length > 0 && !stations.some(s => s.id === rawAssignedWorkerStationId))))
    ) {
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
    rawAssignedWorkerStationId,
    deletedStationIds,
    stations,
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

  // Subscription calculation (expired OR suspended blocks all writes)
  const isSubscriptionExpired = useMemo(() => {
    if (effectiveSubscriptionStatus === 'suspended' || effectiveSubscriptionStatus === 'expired') return true;
    const end = new Date(effectiveSubscriptionEndDate).getTime();
    return end <= nowMs;
  }, [effectiveSubscriptionStatus, effectiveSubscriptionEndDate, nowMs]);

  const checkWriteAllowed = useCallback((): { allowed: boolean; error?: string } => {
    // 0. Block terminated or deleted accounts immediately
    if (accountTerminatedNotice.isOpen || !currentUser) {
      return {
        allowed: false,
        error: 'الحساب غير متاح أو تم حذفه من قاعدة البيانات. يرجى إدخال رقم هاتف وبريد Gmail جديدين.',
      };
    }

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

    // 2. Block worker completely if their assigned station was deleted or missing from the manager's stations
    if (currentUser && userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId) {
        return {
          allowed: false,
          error: '⛔ تم حذف أو إيقاف هذه المحطة من طرف المدير. لقد تم إيقاف وتجميد جميع العمليات (إرسال، استلام، تحويل، صرف) نهائياً.',
        };
      }
    }

        // 3. Check workspace subscription (Post-Expiry Read-Only Mode: blocks adding/editing/deleting while keeping 100% of data visible for viewing)
    if (isSubscriptionExpired) {
      const msg =
        effectiveSubscriptionStatus === 'suspended'
          ? '⛔ تم تعليق اشتراك مساحة العمل: الحساب في وضع المشاهدة فقط ولا يمكن إضافة أو تعديل أو حذف أي عملية حتى تفعيل الاشتراك.'
          : '🔒 انتهت الفترة التجريبية (30 يوماً) — حسابك الآن في وضع المشاهدة فقط (بياناتك وسجلاتك محفوظة بالكامل 100%). يرجى تجديد الاشتراك (الباك الأول 149 درهم أو الباك الثاني 299 درهم) لإضافة أو تعديل العمليات.';
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
    isWorkerStationDeleted,
    userAssignedStationId,
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

  // Automatic 3-Day Pre-Expiry Notification Alert (Requirement 5)
  useEffect(() => {
    if (!currentWorkspace || !currentUser) return;
    if (!isSubscriptionExpired && daysUntilExpiry > 0 && daysUntilExpiry <= 3) {
      const warnKey = `alittihadia_3day_warn_${currentWorkspace.id}_${daysUntilExpiry}`;
      if (!localStorage.getItem(warnKey)) {
        try {
          localStorage.setItem(warnKey, 'true');
        } catch {}
        pushNotification({
          workspace_id: currentWorkspace.id,
          target_role: 'all',
          title: `⏳ تنبيه: متبقي ${daysUntilExpiry} أيام على انتهاء الفترة التجريبية`,
          message: `يرجى تجديد الاشتراك (الباك الأول 149 درهم أو الباك الثاني 299 درهم) لتفادي تحول الحساب إلى وضع المشاهدة فقط.`,
          type: 'subscription',
        });
      }
    }
  }, [currentWorkspace?.id, currentUser?.id, isSubscriptionExpired, daysUntilExpiry, pushNotification]);

  const subscriptionRemainingLabel = useMemo(() => {
    if (isSubscriptionExpired || secondsUntilExpiry <= 0) {
      return 'منتهٍ (وضع المشاهدة فقط)';
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
    email: string;
    password?: string;
    isOwner: boolean;
    teamInviteCode?: string;
  }) => {
    try {
      const cleanPhone = cleanPhoneNumber(data.phone);
      const cleanWhatsapp = cleanPhoneNumber(data.whatsapp_number) || cleanPhone;
      const cleanEmail = (data.email || '').trim().toLowerCase();
      const pwd = (data.password || '').trim();

      if (!cleanPhone || cleanPhone.length < 8) {
        return { success: false, error: 'يرجى إدخال رقم هاتف صحيح' };
      }

      if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return { success: false, error: 'بريد Gmail إجباري للتسجيل. يرجى إدخال عنوان بريد إلكتروني صحيح.' };
      }

      if (!pwd || pwd.length < 6) {
        return { success: false, error: 'كلمة المرور يجب أن لا تقل عن 6 أحرف أو أرقام' };
      }

      // Check Firestore duplicates for both phone and email
      if (firebaseSyncService.isAvailable()) {
        try {
          const existingPhone = (await firebaseSyncService.getUserAccount(cleanPhone)) || (await firebaseSyncService.findUserAccountByIdentifier(cleanPhone));
          if (existingPhone && !existingPhone.deleted && existingPhone.status !== 'revoked') {
            return {
              success: false,
              error: 'رقم الهاتف هذا مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.',
            };
          }
          const existingEmail = await firebaseSyncService.findUserAccountByIdentifier(cleanEmail);
          if (existingEmail && !existingEmail.deleted && existingEmail.status !== 'revoked') {
            return {
              success: false,
              error: 'عنوان البريد الإلكتروني (Gmail) مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.',
            };
          }
        } catch (e) {
          console.warn('Firestore duplicate check warning in registerUser:', e);
        }
      }

      // Prevent duplicate accounts in local/active workspace members
      const duplicateLocalCheck = workspaceMembers.some(
        m => !m.is_demo && (cleanPhoneNumber(m.profile?.phone || '') === cleanPhone || (m.profile?.email && m.profile.email.toLowerCase() === cleanEmail))
      ) || (currentUser && (cleanPhoneNumber(currentUser.phone) === cleanPhone || (currentUser.email && currentUser.email.toLowerCase() === cleanEmail)));
      if (duplicateLocalCheck) {
        return {
          success: false,
          error: 'هذا الرقم أو البريد الإلكتروني مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.'
        };
      }

      const syntheticEmail = cleanEmail || phoneToEmail(cleanPhone);

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
              email: cleanEmail,
              must_change_password: false,
            }
          }
        });

        if (authError) {
          if (authError.message.toLowerCase().includes('already registered') || authError.message.toLowerCase().includes('already exists')) {
            return {
              success: false,
              error: 'هذا الرقم أو البريد مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.'
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
          m => !m.is_demo && (cleanPhoneNumber(m.profile?.phone || '') === cleanPhone || (m.profile?.email && m.profile.email.toLowerCase() === cleanEmail))
        ) || (currentUser && (cleanPhoneNumber(currentUser.phone) === cleanPhone || (currentUser.email && currentUser.email.toLowerCase() === cleanEmail)));
        if (duplicateLocal) {
          return {
            success: false,
            error: 'هذا الرقم أو البريد مسجل بالفعل في النظام. يرجى التبديل إلى تسجيل الدخول بدلاً من إنشاء حساب جديد.'
          };
        }
      }

      // Clear any previous termination notice, set new registration grace window, and clear local revocation entry
      registrationGraceUntilRef.current = Date.now() + 25000;
      setAccountTerminatedNotice({ isOpen: false, reason: 'deleted', message: '' });
      try {
        const revokedMap = JSON.parse(localStorage.getItem('alittihadia_revoked_accounts_v1') || '{}');
        if (revokedMap[cleanPhone]) {
          delete revokedMap[cleanPhone];
          localStorage.setItem('alittihadia_revoked_accounts_v1', JSON.stringify(revokedMap));
        }
      } catch {}

      // 2. Create profile object (we set state AFTER cloud persistence to avoid race condition with listeners)
      const newProfile: Profile = {
        id: userId,
        phone: cleanPhone,
        whatsapp_number: cleanWhatsapp,
        email: cleanEmail,
        email_verified: true,
        name: data.name.trim(),
        must_change_password: false,
        created_at: new Date().toISOString(),
      };
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
          email: cleanEmail,
          email_verified: true,
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
          name: `Sahara📦 Express - ${newProfile.name}`,
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

              // Never pre-populate default Dakhla/Nouadhibou stations for a new manager account!
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

        const adminMember: WorkspaceMember = {
          workspace_id: newWorkspace.id,
          user_id: newProfile.id,
          role: 'admin',
          status: 'active',
          joined_at: new Date().toISOString(),
          profile: newProfile,
        };

        // Always sync new workspace, admin member, and user account to Firebase Firestore BEFORE mounting currentUser/currentWorkspace
        if (firebaseSyncService.isAvailable()) {
          const enrichedNewWs: Workspace = {
            ...newWorkspace,
            owner_name: newProfile.name,
            owner_email: cleanEmail,
            owner_phone: cleanPhone,
            owner_whatsapp: cleanWhatsapp,
            subscription_status: 'active',
          };
          await Promise.all([
            firebaseSyncService.syncWorkspace(enrichedNewWs),
            firebaseSyncService.syncWorkspaceMember(newWorkspace.id, adminMember),
            firebaseSyncService.saveUserAccount(cleanPhone, {
              id: newProfile.id,
              name: newProfile.name,
              phone: cleanPhone,
              whatsapp_number: cleanWhatsapp,
              email: cleanEmail,
              email_verified: true,
              password: pwd,
              role: 'owner',
              workspace_id: newWorkspace.id,
              must_change_password: false,
              status: 'active',
              deleted: false,
              created_at: newProfile.created_at,
            }),
            firebaseSyncService.logPlatformActivity({
              workspace_id: newWorkspace.id,
              workspace_name: newWorkspace.name,
              workspace_short_id: newWorkspace.short_id,
              actor_id: newProfile.id,
              actor_name: newProfile.name,
              actor_phone: cleanPhone,
              actor_email: cleanEmail,
              actor_role: 'owner',
              action_type: 'REGISTER',
              action_title: `فتح حساب شركة جديد في النظام (${newWorkspace.name})`,
              details: `المدير: ${newProfile.name} | الهاتف: ${cleanPhone} | البريد: ${cleanEmail}`,
            }),
          ]).catch(() => {});
        }

        if (!rpcCreated) {
          setSubscription({
            id: `sub-${newWorkspace.id}`,
            workspace_id: newWorkspace.id,
            team_id: newWorkspace.id,
            status: 'active',
            start_date: newWorkspace.created_at,
            end_date: initialSubEnd,
            created_at: newWorkspace.created_at,
          });

          const initialWsCurrencies = getInitialCurrencies(newWorkspace.id);
          setCurrencies(initialWsCurrencies);
          setWorkspaceMembers([adminMember]);
          setStationWorkers([]);
          setStations([]);
          setSelectedStationId(null);
        }

        registrationGraceUntilRef.current = Date.now() + 15000;
        setCurrentWorkspace(newWorkspace);
        setCurrentUser(newProfile);

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

        if (firebaseSyncService.isAvailable()) {
          await firebaseSyncService.saveUserAccount(cleanPhone, {
            id: newProfile.id,
            name: newProfile.name,
            phone: cleanPhone,
            whatsapp_number: cleanWhatsapp,
            email: cleanEmail,
            email_verified: true,
            password: pwd,
            role: 'worker',
            workspace_id: targetWs ? targetWs.id : 'ws-external',
            must_change_password: false,
            status: 'active',
            deleted: false,
            created_at: newProfile.created_at,
          }).catch(() => {});
        }

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
        setCurrentUser(newProfile);

        showToast(`تم إرسال طلب انضمامك يا ${newProfile.name}. بانتظار موافقة مدير المحطة.`, 'info');
        return { success: true };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const loginWithCredentials = async (phone: string, password?: string, workerName?: string) => {
    try {
      const rawPhone = (phone || '').trim();
      const rawPassword = (password || '').trim();
      const trimmedWorkerName = (workerName || '').trim();

      // Allow Worker to enter the code in either the password field or the phone field
      const looksLikeWorkerCode = (val: string) => /^Itt-[A-Za-z0-9_-]{4,16}$/i.test(val.trim());
      const effectiveCode = looksLikeWorkerCode(rawPassword)
        ? rawPassword
        : looksLikeWorkerCode(rawPhone)
        ? rawPhone
        : rawPassword;

      const isEmailInput = rawPhone.includes('@');
      const cleanEmailInput = isEmailInput ? rawPhone.toLowerCase().trim() : '';
      let cleanPhone = (looksLikeWorkerCode(rawPhone) || isEmailInput) ? '' : cleanPhoneNumber(rawPhone);

      // Explicit Super Admin bypass check:
      // Phone: +212618961387, Email: aissaaimanekhlifi@gmail.com, Password: 45454554
      const isSuperAdminMatch =
        ((cleanPhone === '212618961387' || cleanPhone === '0618961387') ||
          (cleanEmailInput === 'aissaaimanekhlifi@gmail.com') ||
          rawPhone.toLowerCase().trim() === 'aissaaimanekhlifi@gmail.com') &&
        (rawPassword === '45454554' || effectiveCode === '45454554');

      if (isSuperAdminMatch) {
        let cloudAcc = null;
        if (firebaseSyncService.isAvailable()) {
          cloudAcc =
            (await firebaseSyncService.getUserAccount('212618961387')) ||
            (await firebaseSyncService.findUserAccountByIdentifier('aissaaimanekhlifi@gmail.com'));
        }
        const superProfile: Profile = {
          id: cloudAcc?.id || 'usr-master-001',
          name: cloudAcc?.name || 'عيسى أيمن خليفي (Super Admin)',
          phone: '212618961387',
          whatsapp_number: '212618961387',
          email: 'aissaaimanekhlifi@gmail.com',
          email_verified: true,
          must_change_password: false,
          created_at: cloudAcc?.created_at || new Date().toISOString(),
        };

        const wsId = cloudAcc?.workspace_id || 'ws-1793423385735';
        if (firebaseSyncService.isAvailable()) {
          const cloudData = await firebaseSyncService.loadFullWorkspaceFromCloud(wsId);
          if (cloudData.workspace) {
            setCurrentWorkspace({
              ...cloudData.workspace,
              owner_phone: '212618961387',
              owner_email: 'aissaaimanekhlifi@gmail.com',
            });
          }
          if (cloudData.stations.length > 0) setStations(cloudData.stations);
          if (cloudData.parcels.length > 0) setAllParcels(cloudData.parcels);
          if (cloudData.transactions.length > 0) setAllTransactions(cloudData.transactions);
          if (cloudData.trips.length > 0) setAllTrips(cloudData.trips);
          if (cloudData.members.length > 0) setWorkspaceMembers(cloudData.members);
        }

        setCurrentUser(superProfile);
        setIsPlatformOwner(true);
        refreshPlatformWorkspaces();

        try {
          localStorage.setItem('ittihadiya_saved_login_phone', '212618961387');
          const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
          localAccounts['212618961387'] = {
            id: superProfile.id,
            name: superProfile.name,
            phone: '212618961387',
            whatsapp_number: '212618961387',
            email: 'aissaaimanekhlifi@gmail.com',
            password: '45454554',
            isOwner: true,
            workspace_id: wsId,
          };
          localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
        } catch {}

        showToast('مرحباً بك يا Super Admin! تم فتح لوحة التحكم الشاملة لجميع مساحات العمل بنجاح 👑', 'success');
        return { success: true };
      }

      if (!cleanPhone && !cleanEmailInput && !effectiveCode) {
        return { success: false, error: 'يرجى إدخال كود الدخول الخاص بالعامل أو رقم الهاتف/البريد الإلكتروني وكلمة المرور' };
      }
      if (!effectiveCode || effectiveCode.length < 4) {
        return { success: false, error: 'يرجى إدخال كود الدخول (مثل Itt-...) أو كلمة المرور بشكل صحيح' };
      }

      if (cleanPhone || cleanEmailInput) {
        try {
          localStorage.setItem('ittihadiya_saved_login_phone', cleanPhone || cleanEmailInput);
        } catch {}
      }

      // Block locally revoked accounts immediately
      if (cleanPhone && isAccountRevokedLocally(undefined, cleanPhone)) {
        return {
          success: false,
          error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لم يعد بإمكانك تسجيل الدخول.',
        };
      }

      // 1. Check Firebase Firestore Cloud Account FIRST (Supports Direct Worker Code Login OR Phone/Email + Password)
      if (firebaseSyncService.isAvailable()) {
        let cloudAcc = null;
        let matchedByWorkerCode = false;

        // 1a. If user entered a Worker Code (or did not enter a phone number), look up directly by Worker Code!
        if ((!cleanPhone && !cleanEmailInput) || looksLikeWorkerCode(effectiveCode)) {
          cloudAcc = await firebaseSyncService.findUserAccountByWorkerCode(effectiveCode);
          if (cloudAcc) {
            matchedByWorkerCode = true;
            cleanPhone = cleanPhoneNumber(cloudAcc.phone) || cloudAcc.phone || cleanPhone;
          }
        }

        // 1b. If email was provided, look up by email
        if (!cloudAcc && cleanEmailInput) {
          cloudAcc = await firebaseSyncService.findUserAccountByIdentifier(cleanEmailInput);
          if (cloudAcc && cloudAcc.phone) {
            cleanPhone = cleanPhoneNumber(cloudAcc.phone) || cloudAcc.phone;
          }
        }

        // 1c. If phone was provided, look up by phone/identifier
        if (!cloudAcc && cleanPhone) {
          cloudAcc = await firebaseSyncService.getUserAccount(cleanPhone);
          if (!cloudAcc) {
            cloudAcc = await firebaseSyncService.findUserAccountByIdentifier(rawPhone);
          }
        }

        // 1d. If still not found and user entered a code without phone, try findUserAccountByWorkerCode for any code format
        if (!cloudAcc && effectiveCode) {
          cloudAcc = await firebaseSyncService.findUserAccountByWorkerCode(effectiveCode);
          if (cloudAcc) {
            matchedByWorkerCode = true;
            cleanPhone = cleanPhoneNumber(cloudAcc.phone) || cloudAcc.phone || cleanPhone;
          }
        }

        if (cloudAcc) {
          if (cloudAcc.deleted || cloudAcc.status === 'revoked') {
            handleAccountTerminated('deleted');
            return {
              success: false,
              error: 'تم توقيف أو حذف هذا الحساب من قِبل الإدارة أو Firebase. لم يعد بإمكانك تسجيل الدخول.',
            };
          }

          const storedPass = (cloudAcc.password || '').trim();
          const storedWorkerCode = (cloudAcc.worker_code || '').trim();
          
          let passMatches = false;
          if (storedPass) {
            passMatches = await verifyPassword(effectiveCode, storedPass);
          }
          if (!passMatches && storedWorkerCode) {
            passMatches = await verifyPassword(effectiveCode, storedWorkerCode);
          }
          if (!passMatches && storedPass) {
            passMatches = (storedPass.toUpperCase() === effectiveCode.toUpperCase());
          }
          if (!passMatches && storedWorkerCode) {
            passMatches = (storedWorkerCode.toUpperCase() === effectiveCode.toUpperCase());
          }

          // If this is an active worker account and the Admin generated a fresh Itt-... code (even if generated before cloud indexing), accept & bind it
          const isWorkerWithValidIttCode =
            cloudAcc.role === 'worker' && looksLikeWorkerCode(effectiveCode);

          if (!matchedByWorkerCode && storedPass && !passMatches && !isWorkerWithValidIttCode) {
            return { success: false, error: 'كود الدخول أو كلمة المرور غير صحيحة. تأكد من الكود الذي أعطاك إياه الأدمين.' };
          }

          // If matched a legacy unhashed password, upgrade to bcrypt in the background
          if (storedPass && !isBcryptHash(storedPass) && passMatches) {
            hashPassword(effectiveCode).then(hashed => {
              const canon = cleanPhoneNumber(cloudAcc.phone) || cloudAcc.phone;
              if (canon) {
                firebaseSyncService.saveUserAccount(canon, {
                  ...cloudAcc,
                  password: hashed,
                }).catch(() => {});
              }
            }).catch(() => {});
          }

          const resolvedPhone = cleanPhoneNumber(cloudAcc.phone) || cleanPhone || cloudAcc.phone || '0600000000';
          const finalName = trimmedWorkerName || cloudAcc.name || 'موظف المحطة';
          const restoredProfile: Profile = {
            id: cloudAcc.id,
            name: finalName,
            phone: resolvedPhone,
            whatsapp_number: cloudAcc.whatsapp_number || resolvedPhone,
            email: cloudAcc.email || (cleanEmailInput || undefined),
            worker_code: cloudAcc.role === 'worker' ? effectiveCode : undefined,
            must_change_password: false,
            created_at: cloudAcc.created_at || new Date().toISOString(),
          };

          // Heal/sync worker code in Firestore if needed
          if (
            (trimmedWorkerName && trimmedWorkerName !== cloudAcc.name) ||
            (isWorkerWithValidIttCode && (cloudAcc.password !== effectiveCode || cloudAcc.worker_code !== effectiveCode))
          ) {
            firebaseSyncService
              .saveUserAccount(resolvedPhone, {
                ...cloudAcc,
                name: finalName,
                phone: resolvedPhone,
                password: effectiveCode,
                worker_code: cloudAcc.role === 'worker' ? effectiveCode : cloudAcc.worker_code,
                must_change_password: false,
              })
              .catch(() => {});
          }

          // Restore full workspace & data from Firebase
          if (cloudAcc.workspace_id) {
            const cloudData = await firebaseSyncService.loadFullWorkspaceFromCloud(cloudAcc.workspace_id);

            // Check if workspace was deleted or suspended by the Platform Owner (unless master account)
            if (cloudData.workspace && !checkIsMasterAccount(restoredProfile, cloudData.workspace)) {
              if ((cloudData.workspace as any).deleted === true) {
                handleAccountTerminated('deleted');
                return {
                  success: false,
                  error: 'تم حذف مساحة العمل هذه نهائياً من قِبل الإدارة.',
                };
              }
              if (cloudData.workspace.subscription_status === 'suspended') {
                handleAccountTerminated('suspended', '⛔ تم توقيف وتجميد هذا الحساب من قِبل إدارة التطبيق.');
                return {
                  success: false,
                  error: '⛔ تم توقيف وتجميد هذا الحساب من قِبل إدارة التطبيق.',
                };
              }
            }

            // If worker: verify they are still an active member of the manager's workspace
            let activeWorkerStationId: string | undefined = cloudAcc.station_id || undefined;
            if (cloudAcc.role === 'worker' && cloudData.members.length > 0) {
              const activeWorkerMember = cloudData.members.find(
                m =>
                  (m.user_id === cloudAcc!.id ||
                    cleanPhoneNumber(m.profile?.phone || m.phone || '') === resolvedPhone) &&
                  m.status === 'active'
              );
              if (!activeWorkerMember) {
                handleAccountTerminated('deleted', 'تم حذف أو إيقاف حسابك من فريق المحطة من طرف المدير.');
                return {
                  success: false,
                  error: 'تم حذف أو إيقاف حسابك من فريق المحطة من طرف المدير. لم يعد بإمكانك تسجيل الدخول.',
                };
              }
              if (activeWorkerMember.station_id) {
                activeWorkerStationId = activeWorkerMember.station_id;
              }

              // منع العامل تماماً إذا كانت محطته محذوفة أو متوقفة أو مساحة العمل بدون محطات
              const deletedInWs = (cloudData.workspace as any)?.deleted_station_ids || [];
              const isStDeleted =
                !activeWorkerStationId ||
                deletedInWs.includes(activeWorkerStationId) ||
                (cloudData.stations.length > 0 && !cloudData.stations.some(s => s.id === activeWorkerStationId)) ||
                cloudData.stations.length === 0;

              if (isStDeleted) {
                return {
                  success: false,
                  error: '⛔ تم حذف أو إيقاف المحطة المخصصة لهذا العامل من طرف المدير. لا يمكن للعامل تسجيل الدخول أو العمل بدون محطة نشطة.',
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

              const normalizedCloudName =
                typeof cloudData.workspace.name === 'string' && cloudData.workspace.name.includes('الاتحادية')
                  ? cloudData.workspace.name.replace(/محطة الاتحادية|الاتحادية/g, 'Sahara📦 Express')
                  : cloudData.workspace.name;

              setCurrentWorkspace({
                ...cloudData.workspace,
                name: normalizedCloudName,
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
            setAccountTerminatedNotice({ isOpen: false, reason: 'deleted', message: '' });
            setStations(cloudData.stations);
            setAllParcels(cloudData.parcels);
            setAllTransactions(cloudData.transactions);
            setAllTrips(cloudData.trips);
            if (cloudData.members.length > 0) {
              const updatedMembers = cloudData.members.map(m =>
                (m.user_id === cloudAcc!.id ||
                  cleanPhoneNumber(m.profile?.phone || m.phone || '') === resolvedPhone) &&
                m.profile
                  ? {
                      ...m,
                      worker_code: cloudAcc!.role === 'worker' ? effectiveCode : m.worker_code,
                      profile: {
                        ...m.profile,
                        name: finalName,
                        worker_code: cloudAcc!.role === 'worker' ? effectiveCode : m.profile.worker_code,
                        must_change_password: false,
                      },
                    }
                  : m
              );
              setWorkspaceMembers(updatedMembers);
              const swList: StationWorker[] = updatedMembers
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
            } else if (cloudAcc.role === 'worker') {
              const workerMemberEntry: WorkspaceMember = {
                workspace_id: cloudAcc.workspace_id,
                user_id: restoredProfile.id,
                station_id: activeWorkerStationId || cloudData.stations[0]?.id,
                worker_code: effectiveCode,
                role: 'worker',
                status: 'active',
                joined_at: restoredProfile.created_at,
                profile: restoredProfile,
              };
              setWorkspaceMembers(prev => [...prev.filter(m => m.user_id !== restoredProfile.id), workerMemberEntry]);
              if (workerMemberEntry.station_id) {
                setStationWorkers(prev => [
                  ...prev.filter(sw => sw.user_id !== restoredProfile.id),
                  {
                    station_id: workerMemberEntry.station_id!,
                    workspace_id: cloudAcc!.workspace_id,
                    user_id: restoredProfile.id,
                    assigned_at: restoredProfile.created_at,
                    profile: restoredProfile,
                  },
                ]);
              }
            }

            if (cloudAcc.role === 'worker' && (activeWorkerStationId || cloudData.stations[0]?.id)) {
              setSelectedStationId(activeWorkerStationId || cloudData.stations[0]?.id || null);
            }
          }

          setCurrentUser(restoredProfile);

          // Save locally for offline resilience on this device
          try {
            localStorage.setItem('ittihadiya_saved_login_phone', resolvedPhone);
            const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
            localAccounts[resolvedPhone] = {
              id: cloudAcc.id,
              name: finalName,
              phone: resolvedPhone,
              whatsapp_number: cloudAcc.whatsapp_number || resolvedPhone,
              password: effectiveCode,
              worker_code: cloudAcc.role === 'worker' ? effectiveCode : undefined,
              isOwner: cloudAcc.role === 'owner',
              workspace_id: cloudAcc.workspace_id,
              station_id: cloudAcc.station_id,
            };
            localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
          } catch {}

          if (cloudAcc.workspace_id) {
            firebaseSyncService
              .logPlatformActivity({
                workspace_id: cloudAcc.workspace_id,
                workspace_name: `Sahara📦 Express - ${finalName}`,
                actor_id: restoredProfile.id,
                actor_name: restoredProfile.name,
                actor_phone: resolvedPhone,
                actor_email: cloudAcc.email,
                actor_role: cloudAcc.role === 'worker' ? 'worker' : 'owner',
                action_type: 'LOGIN',
                action_title:
                  cloudAcc.role === 'worker'
                    ? `دخول عامل للمحطة (${restoredProfile.name})`
                    : `تسجيل دخول المدير (${restoredProfile.name})`,
                details: `الهاتف: ${resolvedPhone}${cloudAcc.email ? ' | البريد: ' + cloudAcc.email : ''}`,
              })
              .catch(() => {});
          }

          showToast(`مرحباً بك يا ${restoredProfile.name}! تم الدخول لحسابك مباشرة بنجاح`, 'success');
          return { success: true };
        }
      }

      // 2. Fallback to Supabase Auth if phone was provided
      if (cleanPhone) {
        const syntheticEmail = phoneToEmail(cleanPhone);
        const supabase = getSupabaseClient();

        if (supabase) {
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: syntheticEmail,
              password: effectiveCode,
            });

            if (!error && data?.user) {
              const { data: prof } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .maybeSingle();

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

              const finalName =
                trimmedWorkerName ||
                prof?.name ||
                data.user.user_metadata?.name ||
                'مستخدم Sahara📦 Express';

              if (prof) {
                setCurrentUser({ ...prof, name: finalName, must_change_password: false });
              } else {
                setCurrentUser({
                  id: data.user.id,
                  phone: cleanPhone,
                  whatsapp_number: data.user.user_metadata?.whatsapp_number || cleanPhone,
                  name: finalName,
                  must_change_password: false,
                  created_at: new Date().toISOString(),
                });
              }

              const wsData = Array.isArray(mem?.workspaces) ? mem?.workspaces[0] : mem?.workspaces;
              if (wsData) {
                setCurrentWorkspace(wsData);
                await loadWorkspaceFromCloud(wsData.id, data.user.id);
              }

              showToast(`مرحباً بك يا ${finalName}! تم تسجيل الدخول بنجاح`, 'success');
              return { success: true };
            }
          } catch {}
        }
      }

      // 3. Offline / Local lookup by Worker Code alone OR by Phone + Code
      try {
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');

        // If cleanPhone was not entered, try to find matching phone from tempMap, localAccounts, or workspaceMembers by code
        if (!cleanPhone) {
          const codeUpper = effectiveCode.toUpperCase();
          for (const [pKey, savedCode] of Object.entries<string>(tempMap)) {
            if (String(savedCode || '').trim().toUpperCase() === codeUpper) {
              cleanPhone = cleanPhoneNumber(pKey);
              break;
            }
          }
          if (!cleanPhone) {
            for (const [pKey, acc] of Object.entries<any>(localAccounts)) {
              if (
                String(acc?.password || '').trim().toUpperCase() === codeUpper ||
                String(acc?.worker_code || '').trim().toUpperCase() === codeUpper
              ) {
                cleanPhone = cleanPhoneNumber(pKey);
                break;
              }
            }
          }
          if (!cleanPhone) {
            const matchedMemByCode = workspaceMembers.find(
              m =>
                m.status === 'active' &&
                (String(m.worker_code || '').trim().toUpperCase() === codeUpper ||
                  String(m.profile?.worker_code || '').trim().toUpperCase() === codeUpper)
            );
            if (matchedMemByCode) {
              cleanPhone = cleanPhoneNumber(matchedMemByCode.profile?.phone || matchedMemByCode.phone || '');
            }
          }
        }

        if (cleanPhone && tempMap[cleanPhone]) {
          const matchesTemp = String(tempMap[cleanPhone]).trim().toUpperCase() === effectiveCode.toUpperCase();
          const matchesSaved =
            String(localAccounts[cleanPhone]?.password || '').trim().toUpperCase() === effectiveCode.toUpperCase();
          if (!matchesTemp && !matchesSaved) {
            return { success: false, error: 'كود الدخول المؤقت غير صحيح. تأكد من الكود الذي أعطاك إياه الأدمين.' };
          }
        } else if (
          cleanPhone &&
          localAccounts[cleanPhone]?.password &&
          String(localAccounts[cleanPhone].password).trim().toUpperCase() !== effectiveCode.toUpperCase()
        ) {
          return { success: false, error: 'رقم الهاتف أو كود الدخول غير صحيح' };
        }
      } catch {}

      // Offline / Local lookup fallback (match canonical phone in active workspaceMembers)
      if (cleanPhone) {
        const member = workspaceMembers.find(
          m => cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhone && m.status === 'active'
        );
        if (member && member.profile) {
          // منع العامل إذا كانت محطته محذوفة أو مساحة العمل بدون محطات
          if (member.role === 'worker') {
            const stId = member.station_id;
            const isStDeleted =
              !stId ||
              deletedStationIds.includes(stId) ||
              (stations.length > 0 && !stations.some(s => s.id === stId)) ||
              stations.length === 0;

            if (isStDeleted) {
              return {
                success: false,
                error: '⛔ تم حذف أو إيقاف محطة هذا العامل من طرف المدير. لا يمكن الدخول أو العمل بدون محطة نشطة.',
              };
            }
          }

          const finalName = trimmedWorkerName || member.profile.name || 'موظف المحطة';
          const profileWithFlag: Profile = {
            ...member.profile,
            name: finalName,
            phone: cleanPhone,
            worker_code: effectiveCode,
            must_change_password: false,
          };
          if (trimmedWorkerName && trimmedWorkerName !== member.profile.name) {
            setWorkspaceMembers(prev =>
              prev.map(m => (m.user_id === member.user_id ? { ...m, profile: profileWithFlag } : m))
            );
          }
          if (member.station_id) {
            setSelectedStationId(member.station_id);
          }
          setCurrentUser(profileWithFlag);
          showToast(`مرحباً بك يا ${finalName}! تم الدخول للمحطة بنجاح`, 'success');
          return { success: true };
        }

        // Check local accounts store if user previously registered and logged out
        try {
          const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
          const savedAcc = localAccounts[cleanPhone];
          if (savedAcc) {
            if (!savedAcc.isOwner) {
              // لا يمكن للعامل العمل بمفرده إذا تم مسح البيانات أو لا توجد محطات نشطة
              if (stations.length === 0 || !currentWorkspace) {
                return {
                  success: false,
                  error: '⛔ تم مسح أو إعادة ضبط البيانات. لا يمكن للعامل العمل بمفرده بدون مدير ومحطة نشطة.',
                };
              }
              const stId = savedAcc.station_id;
              if (!stId || deletedStationIds.includes(stId) || !stations.some(s => s.id === stId)) {
                return {
                  success: false,
                  error: '⛔ المحطة المخصصة لهذا العامل تم حذفها من طرف المدير. لا يمكن الدخول أو العمل.',
                };
              }
              const stillInMembers = workspaceMembers.some(
                m => cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhone && m.status === 'active'
              );
              if (!stillInMembers && workspaceMembers.length > 0) {
                return {
                  success: false,
                  error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لم يعد بإمكانك تسجيل الدخول.',
                };
              }
            }
            const finalName = trimmedWorkerName || savedAcc.name || 'موظف المحطة';
            const restoredProfile: Profile = {
              id: savedAcc.id || `usr-${cleanPhone}`,
              name: finalName,
              phone: cleanPhone,
              whatsapp_number: savedAcc.whatsapp_number || cleanPhone,
              must_change_password: false,
              created_at: new Date().toISOString(),
            };
            setCurrentUser(restoredProfile);
            showToast(`مرحباً بك يا ${restoredProfile.name}`, 'success');
            return { success: true };
          }
        } catch {}
      }

      return {
        success: false,
        error: 'لم يتم العثور على حساب بهذا الكود. تأكد من نسخ كود العامل (Itt-...) الصحيح من عند الأدمين.',
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
          firebaseSyncService
            .logPlatformActivity({
              workspace_id: existingAcc.workspace_id,
              workspace_name: cloudData.workspace?.name || `Sahara📦 Express - ${restoredProfile.name}`,
              workspace_short_id: cloudData.workspace?.short_id,
              actor_id: restoredProfile.id,
              actor_name: restoredProfile.name,
              actor_phone: restoredProfile.phone,
              actor_email: gUser.email || existingAcc.email,
              actor_role: 'owner',
              action_type: 'LOGIN',
              action_title: `تسجيل دخول عبر Gmail (${restoredProfile.name})`,
              details: `البريد: ${gUser.email || existingAcc.email || '—'}`,
            })
            .catch(() => {});
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
        name: `Sahara📦 Express - ${displayName}`,
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
        ? 'تم بلوغ الحد الأقصى للعمال في الباك الأول (149 درهم = 2 محطات + 2 عمال). يرجى الترقية إلى الباك الثاني (299 درهم = بزاف ديال المحطات والعمال) لإضافة عمال إضافيين.'
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
    if (userRole === 'worker') {
      const msg = '⛔ العامل ليس لديه صلاحية القبول أو الرفض في الشراكة. المدير وحده هو الذي يقبل أو يرفض.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
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

  // ============================================================================
  // MANAGER CROSS-PARTNERSHIP NETWORK (غرفة الشراكة بين المدراء)
  // ============================================================================

  // Real-time listener for partnerships involving currentWorkspace
  useEffect(() => {
    if (!currentWorkspace?.id || !firebaseSyncService.isAvailable()) return;
    const wsId = currentWorkspace.id;
    const unsub = firebaseSyncService.subscribeToManagerPartnerships(
      wsId,
      (partnerships) => {
        setManagerPartnerships((prev) => {
          const prevMap = new Map<string, ManagerPartnership>(prev.map(item => [item.id, item]));
          for (const p of partnerships) {
            const oldP = prevMap.get(p.id);
            const isA = p.workspace_a_id === wsId;
            const partnerName = isA ? p.workspace_b_name : p.workspace_a_name;
            if (!oldP && p.status === 'pending' && p.initiated_by_workspace_id !== wsId) {
              pushNotification({
                workspace_id: wsId,
                target_role: 'owner',
                title: `🤝 طلب شراكة جديد من "${partnerName}"`,
                message: `أرسل المدير في "${partnerName}" طلب شراكة رسمي — افتح غرفة الشراكة للقبول`,
                type: 'partnership',
                partnership_id: p.id,
              });
            } else if (oldP && oldP.status === 'pending' && p.status === 'active') {
              pushNotification({
                workspace_id: wsId,
                target_role: 'all',
                title: `✅ تم تفعيل الشراكة مع "${partnerName}"`,
                message: `أصبحت محطات "${partnerName}" متاحة الآن للإرسال والاستقبال المباشر`,
                type: 'partnership',
                partnership_id: p.id,
              });
            }
          }
          try {
            localStorage.setItem('alittihadia_manager_partnerships_v1', JSON.stringify(partnerships));
          } catch {}
          return partnerships;
        });
      }
    );
    return () => unsub();
  }, [currentWorkspace?.id, pushNotification]);

  const loadRegisteredManagersNetwork = useCallback(async () => {
    if (!firebaseSyncService.isAvailable()) return;
    try {
      const list = await firebaseSyncService.listAllRegisteredManagersAndStations();
      setRegisteredManagersNetwork(list);
    } catch (err) {
      console.warn('Error loading registered managers network:', err);
    }
  }, []);

  const sendPartnershipRequest = async (targetWorkspaceId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace || !currentUser) return { success: false, error: 'غير مسجل الدخول' };
    if (userRole === 'worker') {
      const msg = '⛔ العامل ليس لديه صلاحية إرسال أو قبول طلبات الشراكة. المدير وحده يملك الصلاحية الكاملة.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };
    if (targetWorkspaceId === currentWorkspace.id) return { success: false, error: 'لا يمكنك إقامة شراكة مع مساحة عملك الخاصة' };

    const myStations: PartnershipStationInfo[] = stations
      .filter(s => (!s.workspace_id || s.workspace_id === currentWorkspace.id) && !s.is_demo && !deletedStationIds.includes(s.id))
      .map(s => ({
        id: s.id,
        name: s.name,
        city: s.city,
        country: s.country,
        phone: s.phone,
      }));

    const targetInfo = registeredManagersNetwork.find(w => w.workspaceId === targetWorkspaceId);
    const targetWsDoc = allWorkspacesState.find(w => w.id === targetWorkspaceId);

    const partnershipId = `partner_${[currentWorkspace.id, targetWorkspaceId].sort().join('_')}`;

    const newPartnership: ManagerPartnership = {
      id: partnershipId,
      workspace_a_id: currentWorkspace.id,
      workspace_a_name: currentWorkspace.name,
      workspace_a_owner_name: currentUser.name || currentWorkspace.owner_name || 'مدير المحطة',
      workspace_a_phone: currentUser.phone || currentWorkspace.owner_phone || '',
      workspace_a_whatsapp: currentUser.whatsapp_number || currentWorkspace.owner_whatsapp || '',
      workspace_a_email: currentUser.email || currentWorkspace.owner_email || '',
      workspace_a_stations: myStations,

      workspace_b_id: targetWorkspaceId,
      workspace_b_name: targetInfo?.workspaceName || targetWsDoc?.name || 'شركة شريكة',
      workspace_b_owner_name: targetInfo?.ownerName || targetWsDoc?.owner_name || 'المدير الشريك',
      workspace_b_phone: targetInfo?.phone || targetWsDoc?.owner_phone || '',
      workspace_b_whatsapp: targetInfo?.whatsapp || targetWsDoc?.owner_whatsapp || '',
      workspace_b_email: targetInfo?.email || targetWsDoc?.owner_email || '',
      workspace_b_stations: targetInfo?.stations || [],

      status: 'pending',
      initiated_by_workspace_id: currentWorkspace.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setManagerPartnerships(prev => {
      const next = prev.filter(p => p.id !== partnershipId).concat(newPartnership);
      try {
        localStorage.setItem('alittihadia_manager_partnerships_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.savePartnership(newPartnership);
    }

    pushNotification({
      workspace_id: currentWorkspace.id,
      target_role: 'owner',
      title: `📤 تم إرسال طلب شراكة إلى "${newPartnership.workspace_b_name}"`,
      message: `بانتظار موافقة وقبول المدير في شركة "${newPartnership.workspace_b_name}"`,
      type: 'partnership',
      partnership_id: partnershipId,
    });

    showToast(`تم إرسال طلب الشراكة بنجاح إلى شركة "${newPartnership.workspace_b_name}"`, 'success');
    return { success: true };
  };

  const respondToPartnershipRequest = async (partnershipId: string, accept: boolean): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace) return { success: false, error: 'غير مسجل الدخول' };
    if (userRole === 'worker') {
      const msg = '⛔ العامل ليس لديه صلاحية القبول أو الرفض في الشراكة. المدير وحده هو الذي يقبل أو يرفض.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const p = managerPartnerships.find(item => item.id === partnershipId);
    if (!p) return { success: false, error: 'الشراكة غير موجودة' };

    const myStations: PartnershipStationInfo[] = stations
      .filter(s => (!s.workspace_id || s.workspace_id === currentWorkspace.id) && !s.is_demo && !deletedStationIds.includes(s.id))
      .map(s => ({
        id: s.id,
        name: s.name,
        city: s.city,
        country: s.country,
        phone: s.phone,
      }));

    const isA = p.workspace_a_id === currentWorkspace.id;
    const updated: ManagerPartnership = {
      ...p,
      status: accept ? 'active' : 'rejected',
      workspace_a_stations: isA ? myStations : p.workspace_a_stations,
      workspace_b_stations: !isA ? myStations : p.workspace_b_stations,
      updated_at: new Date().toISOString(),
    };

    setManagerPartnerships(prev => {
      const next = prev.map(item => item.id === partnershipId ? updated : item);
      try {
        localStorage.setItem('alittihadia_manager_partnerships_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.savePartnership(updated);
    }

    const partnerName = isA ? p.workspace_b_name : p.workspace_a_name;
    pushNotification({
      workspace_id: currentWorkspace.id,
      target_role: 'all',
      title: accept ? `🤝 تم قبول وتفعيل الشراكة مع "${partnerName}"` : `❌ تم رفض طلب الشراكة مع "${partnerName}"`,
      message: accept
        ? `قام المدير بتفعيل الشراكة الرسمية مع "${partnerName}" — يمكن الآن إرسال واستقبال الكوليات والرحلات`
        : `قام المدير برفض طلب الشراكة`,
      type: 'partnership',
      partnership_id: partnershipId,
    });

    showToast(accept ? `🤝 تم تفعيل الشراكة الرسمية بنجاح مع "${partnerName}"!` : `تم رفض طلب الشراكة`, accept ? 'success' : 'info');
    return { success: true };
  };

  const recordPartnershipSettlement = async (
    partnershipId: string,
    data: {
      amount: number;
      currency: 'MAD' | 'MRU';
      payment_method: 'cash' | 'bank_transfer' | 'cash_plus' | 'wafacash' | 'other';
      reference_number?: string;
      notes?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentWorkspace || !currentUser) return { success: false, error: 'غير مسجل الدخول' };
    if (userRole === 'worker') {
      const msg = '⛔ التسويات المالية في غرفة الشراكة من صلاحية المدير فقط.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const p = managerPartnerships.find(item => item.id === partnershipId);
    if (!p) return { success: false, error: 'الشراكة غير موجودة' };

    const isA = p.workspace_a_id === currentWorkspace.id;
    const partnerWsId = isA ? p.workspace_b_id : p.workspace_a_id;
    const partnerWsName = isA ? p.workspace_b_name : p.workspace_a_name;

    const settlementId = `stl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newSettlement: PartnershipSettlement = {
      id: settlementId,
      partnership_id: partnershipId,
      payer_workspace_id: currentWorkspace.id,
      payer_workspace_name: currentWorkspace.name,
      receiver_workspace_id: partnerWsId,
      receiver_workspace_name: partnerWsName,
      amount: Number(data.amount),
      currency: data.currency,
      payment_method: data.payment_method,
      reference_number: data.reference_number,
      notes: data.notes,
      recorded_by_name: currentUser.name || 'المدير',
      created_at: new Date().toISOString(),
    };

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.recordPartnershipSettlement(partnershipId, newSettlement);
    }

    pushNotification({
      workspace_id: currentWorkspace.id,
      target_role: 'owner',
      title: `💳 تسوية مالية مع "${partnerWsName}"`,
      message: `تم تسجيل دفعة تسوية بمبلغ ${data.amount} ${data.currency} لصالح "${partnerWsName}"`,
      type: 'partnership',
      partnership_id: partnershipId,
    });

    showToast(`✅ تم تسجيل دفعة تسوية مالية بمبلغ ${data.amount} ${data.currency} لصالح "${partnerWsName}" بنجاح`, 'success');
    return { success: true };
  };

  const dispatchParcelToPartner = async (
    parcelId: string,
    partnerWorkspaceId: string,
    partnerStationId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const p = allParcelsRef.current.find(item => item.id === parcelId);
    if (!p) return { success: false, error: 'الكولي غير موجود' };

    const partnerNetworkWs = registeredManagersNetwork.find(w => w.workspaceId === partnerWorkspaceId);
    const partnerStation = partnerNetworkWs?.stations?.find((s: PartnershipStationInfo) => s.id === partnerStationId) ||
      stations.find((s: Station) => s.id === partnerStationId);

    const partnerWsName = partnerNetworkWs?.workspaceName ||
      allWorkspacesState.find(w => w.id === partnerWorkspaceId)?.name ||
      'الشركة الشريكة';

    const updatedParcel: Parcel = {
      ...p,
      is_partnership_parcel: true,
      partner_origin_workspace_id: currentWorkspace?.id || p.workspace_id,
      partner_origin_workspace_name: currentWorkspace?.name || 'محطتنا',
      partner_workspace_id: partnerWorkspaceId,
      partner_workspace_name: partnerWsName,
      partner_destination_station_id: partnerStationId,
      partner_destination_station_name: partnerStation?.name || 'محطة الشريك',
      destination_station_name: partnerStation?.name || p.destination_station_name,
      partner_acceptance_status: 'pending_approval',
      partner_rejection_reason: null,
      updated_at: new Date().toISOString(),
    };

    setAllParcels(prev => prev.map(item => item.id === parcelId ? updatedParcel : item));
    allParcelsRef.current = allParcelsRef.current.map(item => item.id === parcelId ? updatedParcel : item);

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.syncParcel(updatedParcel.workspace_id, updatedParcel);
      await firebaseSyncService.syncPartnerParcel(partnerWorkspaceId, updatedParcel);
    }

    pushNotification({
      workspace_id: currentWorkspace?.id,
      target_station_id: p.origin_station_id,
      target_role: 'all',
      title: `📤 المرحلة 1 (طلب): كولية [${p.tracking_code}]`,
      message: `تم إرسال طلب الكولية إلى "${updatedParcel.partner_destination_station_name}" (${partnerWsName}) — بانتظار قبول المدير الشريك`,
      type: 'parcel',
      parcel_id: p.id,
    });

    showToast(`تم إرسال طلب قبول الكولي [${p.tracking_code}] إلى محطة الشريك "${updatedParcel.partner_destination_station_name}"`, 'success');
    return { success: true };
  };

  const respondToPartnerParcel = async (
    parcelId: string,
    decision: 'accepted' | 'rejected',
    reason?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser || !currentWorkspace) {
      return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    }
    // القاعدة 1: العامل ما عندو ما يقبل. اللي كيقبل هو المدير بوحدو.
    if (userRole === 'worker') {
      const msg = '⛔ العامل ليس لديه صلاحية القبول أو الرفض في الشراكة. المدير وحده هو الذي يقبل أو يرفض طلبات الكوليات.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const parcel = allParcelsRef.current.find(p => p.id === parcelId);
    if (!parcel) return { success: false, error: 'الكولية غير موجودة' };

    if (!canAcceptOrRejectPartnerParcel(parcel, currentWorkspace.id, userRole, userAssignedStationId)) {
      const msg = 'لا تملك صلاحية البت في طلب هذه الكولية (القبول والرفض للمدير المستقبل فقط)';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const nowIso = new Date().toISOString();
    const rejectionNote =
      decision === 'rejected'
        ? reason?.trim() || 'تم رفض استلام الكولية من طرف المدير المستقبل'
        : null;

    const historyEntry: ParcelStatusHistoryEntry = {
      status: parcel.status,
      timestamp: nowIso,
      changed_by_id: currentUser.id,
      changed_by_name: currentUser.name,
      notes:
        decision === 'accepted'
          ? `✅ المرحلة 2 (قبول): وافق المدير ${currentUser.name} على الكولية الواردة من (${parcel.partner_origin_workspace_name || parcel.origin_station_name}) نحو محطة "${parcel.destination_station_name}"`
          : `❌ تم رفض الكولية الواردة من الشريك في محطة "${parcel.destination_station_name}" — السبب: ${rejectionNote}`,
    };

    const updated: Parcel = {
      ...parcel,
      partner_acceptance_status: decision,
      partner_rejection_reason: rejectionNote,
      status_history: [...(parcel.status_history || []), historyEntry],
      updated_at: nowIso,
    };

    const nextList = allParcelsRef.current.map(p => (p.id === parcelId ? updated : p));
    allParcelsRef.current = nextList;
    setAllParcels(nextList);

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.syncParcel(currentWorkspace.id, updated).catch(() => {});
      const originWsId = updated.partner_origin_workspace_id;
      if (originWsId && originWsId !== currentWorkspace.id) {
        await firebaseSyncService
          .syncPartnerParcelStatusBack(originWsId, updated.id, updated)
          .catch(() => {});
      }
    }

    const targetStId = updated.partner_destination_station_id || updated.destination_station_id;
    pushNotification({
      workspace_id: currentWorkspace.id,
      target_station_id: targetStId,
      target_role: 'all',
      title:
        decision === 'accepted'
          ? `✅ المرحلة 2 (قبول): كولية [${parcel.tracking_code}]`
          : `❌ تم رفض الكولية [${parcel.tracking_code}]`,
      message:
        decision === 'accepted'
          ? `وافق المدير ${currentUser.name} على كولية محطة "${parcel.destination_station_name}" — بانتظار انطلاق الرحلة`
          : `رفض المدير الكولية الموجهة إلى "${parcel.destination_station_name}"`,
      type: 'parcel',
      parcel_id: parcel.id,
    });

    showToast(
      decision === 'accepted'
        ? `✅ تم قبول الكولية [${parcel.tracking_code}] بنجاح في محطة "${parcel.destination_station_name}" وإشعار العامل والمرسل`
        : `❌ تم رفض الكولية [${parcel.tracking_code}] وإشعار المدير المرسل`,
      decision === 'accepted' ? 'success' : 'info'
    );
    return { success: true };
  };

  const acceptAllPendingPartnerParcels = async (
    parcelIds?: string[]
  ): Promise<{ success: boolean; acceptedCount: number; error?: string }> => {
    if (!currentUser || !currentWorkspace) {
      return { success: false, acceptedCount: 0, error: 'يرجى تسجيل الدخول أولاً' };
    }
    if (userRole === 'worker') {
      const msg = '⛔ العامل ليس لديه صلاحية القبول أو الرفض في الشراكة. المدير وحده هو الذي يقبل أو يرفض.';
      showToast(msg, 'error');
      return { success: false, acceptedCount: 0, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, acceptedCount: 0, error: writeCheck.error };

    const pendingTargets = allParcelsRef.current.filter(p => {
      if (parcelIds && parcelIds.length > 0 && !parcelIds.includes(p.id)) return false;
      return canAcceptOrRejectPartnerParcel(p, currentWorkspace.id, userRole, userAssignedStationId);
    });

    if (pendingTargets.length === 0) {
      return { success: false, acceptedCount: 0, error: 'لا توجد كوليات معلقة بانتظار القبول حالياً' };
    }

    const nowIso = new Date().toISOString();
    const targetIds = new Set(pendingTargets.map(p => p.id));
    const updatedItems: Parcel[] = [];

    const nextList = allParcelsRef.current.map(p => {
      if (!targetIds.has(p.id)) return p;
      const historyEntry: ParcelStatusHistoryEntry = {
        status: p.status,
        timestamp: nowIso,
        changed_by_id: currentUser.id,
        changed_by_name: currentUser.name,
        notes: `✅ المرحلة 2 (قبول): وافق المدير ${currentUser.name} على الكولية الواردة من (${p.partner_origin_workspace_name || 'الشريك'}) نحو محطة "${p.destination_station_name}"`,
      };
      const updated: Parcel = {
        ...p,
        partner_acceptance_status: 'accepted',
        partner_rejection_reason: null,
        status_history: [...(p.status_history || []), historyEntry],
        updated_at: nowIso,
      };
      updatedItems.push(updated);
      return updated;
    });

    allParcelsRef.current = nextList;
    setAllParcels(nextList);

    if (firebaseSyncService.isAvailable()) {
      await Promise.all(
        updatedItems.map(async u => {
          await firebaseSyncService.syncParcel(currentWorkspace.id, u).catch(() => {});
          if (u.partner_origin_workspace_id && u.partner_origin_workspace_id !== currentWorkspace.id) {
            await firebaseSyncService
              .syncPartnerParcelStatusBack(u.partner_origin_workspace_id, u.id, u)
              .catch(() => {});
          }
        })
      );
    }

    pushNotification({
      workspace_id: currentWorkspace.id,
      target_role: 'all',
      title: `✅ قبول جماعي (${updatedItems.length} كوليات)`,
      message: `قام المدير ${currentUser.name} بقبول ${updatedItems.length} كولية في غرفة الشراكة — جاهزة للرحلة والشحن`,
      type: 'parcel',
    });

    showToast(`✅ تم قبول (${updatedItems.length}) كولية واردة من غرفة الشراكة بنجاح`, 'success');
    return { success: true, acceptedCount: updatedItems.length };
  };

  // المرحلة 4 من ترتيب الشراكة الصارم (طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم)
  const confirmParcelTripArrived = async (parcelId: string): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser || !currentWorkspace) {
      return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const parcel = allParcelsRef.current.find(p => p.id === parcelId);
    if (!parcel) return { success: false, error: 'الكولية غير موجودة' };

    if (!canControlParcelDestination(parcel, currentWorkspace.id, userRole, userAssignedStationId)) {
      const msg = `⛔ لا يمكنك تأكيد وصول الرحلة (وصلات) لأنها متجهة إلى محطة "${parcel.destination_station_name}" فقط`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    if (parcel.status !== 'in_transit') {
      const msg = `⛔ الترتيب الصارم للشراكة (طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم): لا يمكن تأكيد "وصلات" قبل انطلاق "رحلة" الكولية!`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const nowIso = new Date().toISOString();
    const historyEntry: ParcelStatusHistoryEntry = {
      status: parcel.status,
      timestamp: nowIso,
      changed_by_id: currentUser.id,
      changed_by_name: currentUser.name,
      notes: `🏁 المرحلة 4 (وصلات): وصلت الرحلة الحاملة للكولية إلى محطة "${parcel.destination_station_name}" — جاهزة للتفريغ في الستوك`,
    };

    const updated: Parcel = {
      ...parcel,
      trip_arrived_at: nowIso,
      last_scanned_by_name: currentUser.name,
      last_scanned_at_station: parcel.destination_station_name,
      status_history: [...(parcel.status_history || []), historyEntry],
      updated_at: nowIso,
    };

    const nextParcels = allParcelsRef.current.map(p => (p.id === parcelId ? updated : p));
    allParcelsRef.current = nextParcels;
    setAllParcels(nextParcels);

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.syncParcel(updated.workspace_id, updated).catch(() => {});
      const counterpartWsId =
        updated.partner_origin_workspace_id && updated.partner_origin_workspace_id !== updated.workspace_id
          ? updated.partner_origin_workspace_id
          : updated.partner_workspace_id && updated.partner_workspace_id !== updated.workspace_id
          ? updated.partner_workspace_id
          : null;
      if (counterpartWsId) {
        await firebaseSyncService.syncPartnerParcelStatusBack(counterpartWsId, updated.id, updated).catch(() => {});
      }
    }

    pushNotification({
      workspace_id: currentWorkspace.id,
      target_station_id: parcel.partner_destination_station_id || parcel.destination_station_id,
      target_role: 'all',
      title: `🏁 المرحلة 4 (وصلات): كولية [${parcel.tracking_code}]`,
      message: `وصلت الكولية إلى محطة "${parcel.destination_station_name}" — اضغط على «📥 تفريغ» لإدخالها للستوك`,
      type: 'parcel',
      parcel_id: parcel.id,
    });

    showToast(`🏁 تم تأكيد مرحلة «وصلات» للكولية [${parcel.tracking_code}] — يمكنك الآن الضغط على «📥 تفريغ»`, 'success');
    return { success: true };
  };

  const confirmTripArrivedAtDestination = async (
    tripId: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser || !currentWorkspace) {
      return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTrip = allTripsRef.current.find(t => t.id === tripId);
    if (!targetTrip) return { success: false, error: 'الرحلة غير موجودة' };

    const nowIso = new Date().toISOString();
    const updatedTrip: Trip = {
      ...targetTrip,
      status: 'arrived',
      arrived_at: nowIso,
      updated_at: nowIso,
    };

    const nextTrips = allTripsRef.current.map(t => (t.id === tripId ? updatedTrip : t));
    allTripsRef.current = nextTrips;
    setAllTrips(nextTrips);

    const loadedSet = new Set(targetTrip.loaded_parcel_ids || []);
    const modifiedParcels: Parcel[] = [];
    const nextParcels = allParcelsRef.current.map(p => {
      if (!loadedSet.has(p.id) || p.status !== 'in_transit') return p;
      const up: Parcel = {
        ...p,
        trip_arrived_at: nowIso,
        updated_at: nowIso,
      };
      modifiedParcels.push(up);
      return up;
    });
    allParcelsRef.current = nextParcels;
    setAllParcels(nextParcels);

    syncTripAndParcelsAcrossWorkspaces(updatedTrip, modifiedParcels);

    pushNotification({
      workspace_id: currentWorkspace.id,
      target_station_id: targetTrip.partner_destination_station_id || targetTrip.destination_station_id,
      target_role: 'all',
      title: `🏁 المرحلة 4 (وصلات): الرحلة [${targetTrip.trip_code}]`,
      message: `وصلت رحلة السائق ${targetTrip.driver_name} إلى محطة "${targetTrip.destination_station_name}" — جاهزة للتفريغ`,
      type: 'trip',
      trip_id: targetTrip.id,
    });

    showToast(`🏁 تم تأكيد وصول الرحلة [${targetTrip.trip_code}] إلى محطة "${targetTrip.destination_station_name}" — جاهزة للتفريغ`, 'success');
    return { success: true, trip: updatedTrip };
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

    // الحفاظ التام على سجلات ووثائق غرفة الشراكة كدليل دائم لا يمسح أبداً
    const preservedParcels = allParcels.filter(p => p.is_partnership_parcel || p.partner_workspace_id || p.partner_origin_workspace_id || p.is_collaborator_data);
    const preservedTxs = allTransactions.filter(t => t.is_partnership || t.partner_workspace_id || t.room_id || t.svr_id || t.hawala_meta?.is_partnership);
    const preservedAudit = auditLogs.filter(a => a.is_partnership || a.action?.includes('PARTNERSHIP') || a.reason?.includes('شراكة') || a.details?.includes('شراكة'));
    const preservedTrips = allTrips.filter(t => t.partner_workspace_id || t.partner_destination_station_id || t.is_collaborator_data);

    setStations([]);
    setSelectedStationId(null);
    setWorkspaceMembers(prev => prev.filter(m => !m.is_demo && (m.role === 'admin' || m.role === 'owner')));
    setStationWorkers([]);
    setAllParcels(preservedParcels);
    allParcelsRef.current = preservedParcels;
    setAllTrips(preservedTrips);
    allTripsRef.current = preservedTrips;
    setAllTransactions(preservedTxs);
    setAuditLogs(preservedAudit);
    tripService.clearRememberedDriversAndPlates();
    setRememberedDrivers([]);
    setRememberedPlates([]);

    localStorage.removeItem('aman_stations');
    localStorage.setItem('aman_transactions', JSON.stringify(preservedTxs));
    localStorage.setItem('ittihadiya_parcels', JSON.stringify(preservedParcels));
    localStorage.setItem('aman_audit_logs', JSON.stringify(preservedAudit));
    localStorage.removeItem('alittihadia_hawala_transfers_v1');
    storageService.set('TRIPS', preservedTrips);
    storageService.set('PARCELS', preservedParcels);
    storageService.set('TRANSACTIONS', preservedTxs);

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

    // فحص الصلاحيات الصارم:
    // - الـ Admin (owner / admin) يملك إضافة العمال وتعيينهم في محطاته
    // - العامل (worker) ممنوع نهائياً من إضافة أي عضو
    if (userRole === 'worker') {
      const msg = 'غير مصرح: العمال لا يملكون صلاحية إضافة العمال أو المدراء.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

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
          const msg = 'الباك الأول (149 درهم) يسمح بفتح محطتين (2) فقط.';
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
      }

      if (realActiveWorkers.length >= maxWorkers) {
        const msg = isPlan2TwoStations
          ? 'تم بلوغ الحد الأقصى للعمال في الباك الأول (149 درهم = 2 محطات + 2 عمال). يرجى الترقية إلى الباك الثاني (299 درهم = بزاف ديال المحطات والعمال) لإضافة عمال أكثر.'
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
        if (!fnErr && fnData?.success) {
          if (fnData?.user_id) workerUserId = fnData.user_id;
          if (fnData?.temporary_password) tempPassword = fnData.temporary_password;
        }
      } catch {}
    }

    // Always save temporary password & local account entry so worker can log in directly with Name + Phone + Temp Password
    try {
      const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
      tempMap[canonicalPhone] = tempPassword;
      localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));

      const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
      localAccounts[canonicalPhone] = {
        id: workerUserId,
        name: name.trim(),
        phone: canonicalPhone,
        whatsapp_number: canonicalPhone,
        password: tempPassword,
        isOwner: false,
        workspace_id: currentWorkspace.id,
        station_id: stationId,
      };
      localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
    } catch {}

    const newWorkerProfile: Profile = {
      id: workerUserId,
      name: name.trim(),
      phone: canonicalPhone,
      whatsapp_number: canonicalPhone,
      worker_code: tempPassword,
      must_change_password: false,
      created_at: new Date().toISOString(),
    };

    const newMember: WorkspaceMember = {
      workspace_id: currentWorkspace.id,
      user_id: newWorkerProfile.id,
      station_id: stationId,
      worker_code: tempPassword,
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

    // Sync worker account, workspace member, stations, AND manager's current subscription_end_date to Firebase so the worker can log in immediately by Code on any device
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
      const wsId = currentWorkspace.id;
      const myStations = stations.filter(
        s => (!s.workspace_id || s.workspace_id === wsId || s.team_id === wsId) && !s.is_demo
      );
      await Promise.all([
        firebaseSyncService.syncWorkspace({
          ...currentWorkspace,
          subscription_end_date: managerSubEndDate,
          subscription_status: managerSubStatus,
        }),
        ...myStations.map(s => firebaseSyncService.syncStation(wsId, s)),
        firebaseSyncService.syncWorkspaceMember(wsId, newMember),
        firebaseSyncService.saveUserAccount(canonicalPhone, {
          id: newWorkerProfile.id,
          name: newWorkerProfile.name,
          phone: canonicalPhone,
          whatsapp_number: canonicalPhone,
          password: tempPassword,
          worker_code: tempPassword,
          role: role === 'owner' ? 'owner' : 'worker',
          workspace_id: wsId,
          station_id: stationId,
          must_change_password: false,
          status: 'active',
          deleted: false,
          created_at: newWorkerProfile.created_at,
        }),
        firebaseSyncService.logPlatformActivity({
          workspace_id: wsId,
          workspace_name: currentWorkspace.name,
          workspace_short_id: currentWorkspace.short_id,
          actor_id: currentUser?.id || 'owner',
          actor_name: currentUser?.name || 'المدير',
          actor_phone: currentUser?.phone,
          actor_email: currentUser?.email,
          actor_role: userRole,
          action_type: 'WORKER_ADD',
          action_title: `إضافة عامل جديد: ${newWorkerProfile.name}`,
          details: `هاتف العامل: ${canonicalPhone} | كود الدخول: ${tempPassword}`,
        }),
      ]).catch(err => {
        console.warn('Firebase addWorkerByOwner sync warning:', err);
      });
    }

    showToast(`تم إنشاء حساب العامل "${newWorkerProfile.name}" بكود دخول مباشر: ${tempPassword}`, 'success');
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

    const effectiveStationId =
      userRole === 'worker' && userAssignedStationId
        ? userAssignedStationId
        : data.station_id && data.station_id !== 'all'
        ? data.station_id
        : selectedStationId && selectedStationId !== 'all'
        ? selectedStationId
        : stations[0]?.id || data.station_id;

    if (userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId || effectiveStationId !== userAssignedStationId) {
        const msg = '⛔ لا تملك صلاحية تسجيل عمليات مالية: محطتك تم حذفها أو إيقافها من طرف المدير.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    const st = stations.find(s => s.id === effectiveStationId && !deletedStationIds.includes(s.id));
    if (!st) {
      const msg = '⛔ هذه المحطة تم حذفها من طرف المدير. لقد تم إيقاف وتجميد العمليات المالية في صندوقها نهائياً.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
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
      station_id: effectiveStationId,
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
      station_name: st?.name || 'Sahara📦 Express',
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
      firebaseSyncService
        .logPlatformActivity({
          workspace_id: newTx.workspace_id,
          workspace_name: currentWorkspace?.name || 'الشركة',
          workspace_short_id: currentWorkspace?.short_id,
          actor_id: currentUser.id,
          actor_name: currentUser.name,
          actor_phone: currentUser.phone,
          actor_email: currentUser.email,
          actor_role: userRole,
          action_type: newTx.type === 'cash_out' || newTx.type === 'parcel_cod_payout' ? 'CASH_OUT' : 'CASH_IN',
          action_title: `عملية صندوق (${newTx.amount} ${newTx.currency}) — ${st?.name || 'المحطة'}`,
          details: newTx.reason || newTx.note || newTx.type,
        })
        .catch(() => {});
    }

    if (!data.parcel_id && !data.hawala_transfer_id) {
      const isOut = newTx.type === 'cash_out' || newTx.type === 'goods_payment';
      pushNotification({
        workspace_id: wsId,
        target_station_id: effectiveStationId,
        target_role: 'all',
        title: `${isOut ? '📤 سحب من الصندوق' : '📥 إيداع في الصندوق'} — ${st?.name || 'المحطة'}`,
        message: `${currentUser.name}: ${isOut ? '-' : '+'}${newTx.amount} ${newTx.currency}${newTx.reason ? ` (${newTx.reason})` : ''}`,
        type: 'cashbox',
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

  const cancelTransaction = async (_id: string, _reason: string) => {
    const msg = '🔒 سجل العمليات دائم ولا يمكن إلغاؤه أو مسحه. الصندوق يتزاد وينقص فقط من بطونة الإيداع والسحب.';
    showToast(msg, 'info');
    return { success: false, error: msg };
  };

  // سجل العمليات والصندوق دائم ولا يمكن مسحه نهائياً (الصندوق يتغير فقط من بطونة الإيداع والسحب)
  const deleteTransaction = async (_id: string): Promise<{ success: boolean; error?: string }> => {
    const msg = '🔒 سجل العمليات دائم ولا يمكن مسحه نهائياً. الصندوق يتزاد وينقص فقط من بطونة الإيداع والسحب.';
    showToast(msg, 'info');
    return { success: false, error: msg };
  };

  const deleteAuditLog = (_id: string) => {
    showToast('🔒 سجل العمليات دائم ولا يمكن مسحه نهائياً، كل حركة تبقى مسجلة فيه.', 'info');
  };

  const clearAuditLogs = () => {
    showToast('🔒 سجل العمليات دائم ولا يمكن مسحه نهائياً، كل حركة تبقى مسجلة فيه.', 'info');
  };

  // تنفيذ عملية صرف العملة الفعلية في لاكيس المحطة (بين الدرهم MAD والأوقية MRU أو العكس)
  const executeCurrencyExchange = async (params: {
    stationId: string;
    fromCurrency: 'MAD' | 'MRU' | 'EUR';
    toCurrency: 'MAD' | 'MRU' | 'EUR';
    fromAmount: number;
    toAmount: number;
    rate: number;
    transferFee?: number;
    customerName?: string;
    customerPhone?: string;
    note?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetStationId =
      userRole === 'worker' && userAssignedStationId ? userAssignedStationId : params.stationId;

    if (userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId || params.stationId !== userAssignedStationId) {
        const msg = '⛔ لا تملك صلاحية صرف العملة: محطتك تم حذفها أو إيقافها من طرف المدير.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    const stExists = stations.some(s => s.id === targetStationId && !deletedStationIds.includes(s.id));
    if (!stExists) {
      const msg = '⛔ هذه المحطة تم حذفها من طرف المدير. لقد تم إيقاف وتجميد عمليات صرف العملة عليها نهائياً.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const cleanFrom = Math.round(Number(params.fromAmount) * 100) / 100;
    const cleanTo = Math.round(Number(params.toAmount) * 100) / 100;
    const cleanFee = Math.max(0, Math.round((Number(params.transferFee) || 0) * 100) / 100);
    const totalCashIn = Math.round((cleanFrom + cleanFee) * 100) / 100;

    if (!targetStationId || cleanFrom <= 0 || cleanTo <= 0) {
      return { success: false, error: 'يرجى تحديد المحطة وإدخال مبلغ صحيح للصرف' };
    }
    if (params.fromCurrency === params.toCurrency) {
      return { success: false, error: 'يجب اختيار عملتين مختلفتين' };
    }

    const custLabel = params.customerName?.trim()
      ? ` — الزبون: ${params.customerName.trim()}`
      : '';
    const feeLabel = cleanFee > 0 ? ` (شامل مصاريف التحويلة: ${cleanFee} ${params.fromCurrency})` : '';
    const extraNote = [
      `سعر الصرف: 1 ${params.fromCurrency} = ${params.rate} ${params.toCurrency}`,
      cleanFee > 0 ? `مصاريف التحويلة: ${cleanFee} ${params.fromCurrency}` : '',
      params.note?.trim() || '',
    ]
      .filter(Boolean)
      .join(' | ');

    // 1. إدخال المبلغ المستلم من الزبون إلى لاكيس المحطة (+)
    const inRes = await createTransaction({
      station_id: params.stationId,
      type: 'cash_in',
      amount: totalCashIn,
      currency: params.fromCurrency,
      phone_number: params.customerPhone?.trim() || '',
      reason: `صرف عملة (+ إيداع فلاكيس): قبض ${cleanFrom} ${params.fromCurrency}${feeLabel} مقابل تسليم ${cleanTo} ${params.toCurrency}${custLabel}`,
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

    if (selectedStationId && selectedStationId !== 'all') {
      return list.filter(
        t => t.origin_station_id === selectedStationId || t.destination_station_id === selectedStationId
      );
    }

    return list;
  }, [currentWorkspace, allTransactions, stations, userRole, userAssignedStationId, selectedStationId]);

  const createMoneyTransfer = async (params: {
    origin_station_id: string;
    destination_station_id: string;
    sender_name: string;
    sender_phone: string;
    receiver_name: string;
    receiver_phone: string;
    send_amount: number;
    send_currency: 'MAD' | 'MRU' | 'EUR';
    payout_amount: number;
    payout_currency: 'MAD' | 'MRU' | 'EUR';
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

    const effectiveOriginStationId =
      userRole === 'worker' && userAssignedStationId
        ? userAssignedStationId
        : params.origin_station_id && params.origin_station_id !== 'all'
        ? params.origin_station_id
        : selectedStationId && selectedStationId !== 'all'
        ? selectedStationId
        : params.origin_station_id;

    if (userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId || effectiveOriginStationId !== userAssignedStationId) {
        const msg = '⛔ لا تملك صلاحية إرسال حوالة: محطتك تم حذفها أو إيقافها من طرف المدير.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    if (!effectiveOriginStationId || !params.destination_station_id) {
      return { success: false, error: 'يرجى تحديد محطة الإرسال ومحطة الاستلام' };
    }
    if (effectiveOriginStationId === params.destination_station_id) {
      return { success: false, error: 'يرجى اختيار محطة استلام مختلفة عن محطة الإرسال' };
    }
    if (!params.sender_name.trim() || !params.receiver_name.trim() || sendAmt <= 0 || payoutAmt <= 0) {
      return { success: false, error: 'يرجى إدخال اسم المرسل والمستلم والمبلغ بشكل صحيح' };
    }

    const originSt = stations.find(s => s.id === effectiveOriginStationId && !deletedStationIds.includes(s.id));
    if (!originSt) {
      const msg = '⛔ محطة إرسال الحوالة تم حذفها أو غير موجودة من طرف المدير. تم إيقاف العملية.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const destSt = stations.find(s => s.id === params.destination_station_id && !deletedStationIds.includes(s.id));
    if (!destSt) {
      const msg = '⛔ محطة استلام الحوالة تم حذفها أو غير موجودة من طرف المدير. تم إيقاف العملية.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
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
      origin_station_id: effectiveOriginStationId,
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

    pushNotification({
      workspace_id: wsId,
      target_station_id: params.destination_station_id,
      target_role: 'all',
      title: `💸 حوالة مالية جديدة [${transferCode}]`,
      message: `${currentUser.name} سجل حوالة من "${originSt?.name || ''}" إلى "${destSt?.name || ''}" بمبلغ ${payoutAmt} ${params.payout_currency} للمستلم: ${params.receiver_name.trim()}`,
      type: 'cashbox',
    });

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

    if (userRole === 'worker') {
      if (userAssignedStationId === target.origin_station_id && target.destination_station_id !== userAssignedStationId) {
        const msg = `⛔ لا يمكن لمحطة الإرسال ("${target.origin_station_name}") استلام أو صرف الحوالة. التسليم يتم حصرياً في محطة الاستلام ("${target.destination_station_name}").`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (isWorkerStationDeleted || !userAssignedStationId || target.destination_station_id !== userAssignedStationId) {
        const msg = `⛔ لا تملك صلاحية تسليم هذه الحوالة: التسليم يتم فقط من طرف عامل محطة الاستلام ("${target.destination_station_name}").`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    if (selectedStationId && selectedStationId !== 'all' && selectedStationId === target.origin_station_id && selectedStationId !== target.destination_station_id) {
      const msg = `⛔ محطة الإرسال ("${target.origin_station_name}") لا تسلّم الحوالة. لصرفها يرجى التبديل لمحطة الاستلام ("${target.destination_station_name}") أو عرض كافة المحطات.`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const destStExists = stations.some(s => s.id === target.destination_station_id && !deletedStationIds.includes(s.id));
    if (!destStExists) {
      const msg = `⛔ محطة استلام وصرف هذه الحوالة "${target.destination_station_name}" تم حذفها من طرف المدير. تم إيقاف الصرف نهائياً.`;
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

    // 2. توثيق العملية بالسبب في سجل العمليات
    const hawalaAudit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-hawala-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: target.workspace_id || currentWorkspace?.id || 'ws-default',
      team_id: target.workspace_id || currentWorkspace?.id || 'ws-default',
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'مستخدم',
      actor_role: userRole,
      station_id: target.destination_station_id,
      station_name: target.destination_station_name,
      origin_station_name: target.origin_station_name,
      destination_station_name: target.destination_station_name,
      action: 'PAYMENT',
      table_name: 'hawala_transfers',
      record_id: target.id,
      reason: `[${currentUser?.name || 'المستخدم'}] (${userRole === 'worker' ? 'عامل' : 'مدير'}): صرف وتسليم حوالة واردة [${target.transfer_code}] للمستلم: ${target.receiver_name} في محطة [${target.destination_station_name}] وخصم المبلغ من لاكيس المحطة`,
      details: `مرسلة من: ${target.sender_name} (${target.origin_station_name}) بمبلغ ${target.send_amount} ${target.send_currency} ➔ المبلغ المسلم: ${target.payout_amount} ${target.payout_currency}`,
      is_partnership: Boolean(target.is_partnership || target.partner_workspace_id),
      old_data: { status: 'pending' },
      new_data: { status: 'paid_out', paid_out_by: currentUser.name, paid_out_at: paidAt },
      created_at: paidAt,
    };
    setAuditLogs(prev => [hawalaAudit, ...prev]);

    // 3. تحديث حالة الحوالة في سند الإرسال الأصلي ومزامنته عبر Firebase
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

    pushNotification({
      workspace_id: target.workspace_id || currentWorkspace?.id || 'ws-default',
      target_station_id: target.origin_station_id,
      target_role: 'all',
      title: `✅ تم تسليم الحوالة [${target.transfer_code}]`,
      message: `تم صرف وتسليم ${target.payout_amount} ${target.payout_currency} للمستلم "${target.receiver_name}" في محطة "${target.destination_station_name}" بواسطة ${currentUser.name}`,
      type: 'cashbox',
    });

    showToast(
      `تم تسليم الحوالة [${target.transfer_code}] وخصم -${target.payout_amount} ${target.payout_currency} من لاكيس ${target.destination_station_name} مع توثيق العملية بالسبب في السجل`,
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

    const effectiveOriginStationId =
      userRole === 'worker' && userAssignedStationId
        ? userAssignedStationId
        : data.origin_station_id && data.origin_station_id !== 'all'
        ? data.origin_station_id
        : selectedStationId && selectedStationId !== 'all'
        ? selectedStationId
        : data.origin_station_id;

    if (userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId || effectiveOriginStationId !== userAssignedStationId) {
        const msg = '⛔ لا تملك صلاحية الإرسال: المحطة تم حذفها أو إيقافها من طرف المدير، أو أنك تحاول الإرسال من محطة غير مخصصة لك.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    const originSt = stations.find(s => s.id === effectiveOriginStationId && !deletedStationIds.includes(s.id));
    if (!originSt) {
      const msg = '⛔ محطة الانطلاق محذوفة أو غير موجودة من طرف المدير. تم إيقاف وحظر إرسال الكولي.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const ownDestSt = stations.find(s => s.id === data.destination_station_id && !deletedStationIds.includes(s.id));
    const wsId = currentWorkspace?.id || 'ws-default';

    // Check if the selected destination station belongs to an active partner in غرفة الشراكة
    let partnerDestMeta: {
      partnerWorkspaceId: string;
      partnerWorkspaceName: string;
      stationId: string;
      stationName: string;
      stationCity: string;
    } | null = null;

    if (!ownDestSt) {
      for (const p of managerPartnerships) {
        if (p.status !== 'active') continue;
        const isA = p.workspace_a_id === wsId;
        const pWsId = isA ? p.workspace_b_id : p.workspace_a_id;
        const pWsName = isA ? p.workspace_b_name : p.workspace_a_name;
        const netEntry = registeredManagersNetwork.find(m => m.workspaceId === pWsId);
        const combinedStations = [
          ...(netEntry?.stations || []),
          ...((isA ? p.workspace_b_stations : p.workspace_a_stations) || []),
        ];
        const matchedSt = combinedStations.find(st => st.id === data.destination_station_id);
        if (matchedSt) {
          partnerDestMeta = {
            partnerWorkspaceId: pWsId,
            partnerWorkspaceName: netEntry?.workspaceName || pWsName || 'شركة شريكة',
            stationId: matchedSt.id,
            stationName: matchedSt.name,
            stationCity: matchedSt.city || matchedSt.name,
          };
          break;
        }
      }
    }

    if (!ownDestSt && !partnerDestMeta) {
      const msg = '⛔ محطة الوصول محذوفة أو غير موجودة في سجلات المدير أو الشركاء. لا يمكن إرسال الكولي.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const destStationName = ownDestSt?.name || partnerDestMeta?.stationName || 'محطة الوصول';
    const destStationCity = ownDestSt?.city || partnerDestMeta?.stationCity || destStationName;

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
      origin_station_id: effectiveOriginStationId,
      destination_station_id: data.destination_station_id,
      origin_station_name: originSt?.name || 'محطة الانطلاق',
      destination_station_name: destStationName,
      sender_name: data.sender_name.trim(),
      sender_phone: data.sender_phone.trim(),
      receiver_name: data.receiver_name.trim(),
      receiver_phone: data.receiver_phone.trim(),
      route: (data.route || '').trim() || `${originSt?.city || originSt?.name || ''} ➔ الكركرات ➔ ${destStationCity}`,
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
      partner_acceptance_status:
        effectiveOriginStationId !== data.destination_station_id
          ? ('pending_approval' as const)
          : ('accepted' as const),
      partner_rejection_reason: null,
      ...(partnerDestMeta
        ? {
            is_partnership_parcel: true,
            partner_origin_workspace_id: wsId,
            partner_origin_workspace_name: currentWorkspace?.name || 'شركتنا',
            partner_workspace_id: partnerDestMeta.partnerWorkspaceId,
            partner_workspace_name: partnerDestMeta.partnerWorkspaceName,
            partner_destination_station_id: partnerDestMeta.stationId,
            partner_destination_station_name: partnerDestMeta.stationName,
          }
        : {}),
      status_history: [
        {
          status: parcelStatus,
          timestamp: new Date().toISOString(),
          changed_by_id: currentUser.id,
          changed_by_name: currentUser.name,
          notes: partnerDestMeta
            ? `تسجيل الكولي وإرساله عبر غرفة الشراكة إلى محطة "${partnerDestMeta.stationName}" (${partnerDestMeta.partnerWorkspaceName})`
            : 'تسجيل الكولي في المحطة',
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
    allParcelsRef.current = [newParcel, ...allParcelsRef.current];

    // توثيق عملية تسجيل الكولي بالسبب في سجل العمليات
    const parcelCreateAudit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-pcreate-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: newParcel.workspace_id,
      team_id: newParcel.workspace_id,
      user_id: currentUser.id,
      user_name: currentUser.name,
      actor_role: userRole,
      station_id: newParcel.origin_station_id,
      station_name: newParcel.origin_station_name,
      origin_station_name: newParcel.origin_station_name,
      destination_station_name: newParcel.destination_station_name,
      action: 'INSERT',
      table_name: 'parcels',
      record_id: newParcel.id,
      reason: `[${currentUser.name}] (${userRole === 'worker' ? 'عامل' : 'مدير'}): تسجيل كولي جديد [${newParcel.tracking_code}] من محطة [${newParcel.origin_station_name}] إلى محطة [${newParcel.destination_station_name}] — ثمن الشحن: ${newParcel.amount_due} ${newParcel.currency}`,
      details: `المرسل: ${newParcel.sender_name} (${newParcel.sender_phone}) ➔ المستلم: ${newParcel.receiver_name} (${newParcel.receiver_phone}) | الوصف: ${newParcel.item_description || 'بضاعة'}`,
      is_partnership: Boolean(newParcel.is_partnership_parcel || partnerDestMeta),
      old_data: null,
      new_data: {
        tracking_code: newParcel.tracking_code,
        parcel_number: newParcel.parcel_number,
        origin: newParcel.origin_station_name,
        destination: newParcel.destination_station_name,
        amount_due: newParcel.amount_due,
      },
      created_at: newParcel.created_at,
    };
    setAuditLogs(prev => [parcelCreateAudit, ...prev]);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        newParcel,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        setAllParcels(prev => prev.map(p => p.id === newParcel.id ? { ...p, pending_sync: true } : p));
      }
    }

    // Sync to Firebase Firestore (and to partner's specific receiving station if partnership parcel)
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(newParcel.workspace_id, newParcel).catch(err => {
        console.warn('Firebase parcel sync error:', err);
      });
      if (partnerDestMeta) {
        firebaseSyncService
          .syncPartnerParcel(partnerDestMeta.partnerWorkspaceId, newParcel)
          .catch(err => {
            console.warn('Firebase partner parcel sync error:', err);
          });
      }
      firebaseSyncService
        .logPlatformActivity({
          workspace_id: newParcel.workspace_id,
          workspace_name: currentWorkspace?.name || 'الشركة',
          workspace_short_id: currentWorkspace?.short_id,
          actor_id: currentUser.id,
          actor_name: currentUser.name,
          actor_phone: currentUser.phone,
          actor_email: currentUser.email,
          actor_role: userRole,
          action_type: 'PARCEL_CREATE',
          action_title: `تسجيل كولي جديد [${newParcel.tracking_code}] (${newParcel.origin_station_name} ➔ ${newParcel.destination_station_name})`,
          details: `المرسل: ${newParcel.sender_name} | المستلم: ${newParcel.receiver_name} | المبلغ: ${newParcel.amount_due} ${newParcel.currency}`,
        })
        .catch(() => {});
    }

    if (amountPaid > 0) {
      await createTransaction({
        station_id: newParcel.origin_station_id,
        type: 'parcel_shipping_fee',
        amount: amountPaid,
        currency: newParcel.currency,
        phone_number: newParcel.sender_phone,
        reason: `أجرة شحن الكولي [${newParcel.tracking_code}] إلى ${destStationCity}`,
        note: `شحن ${newParcel.items_count} طرد - ${newParcel.description}`,
        parcel_id: newParcel.id,
      });
    }

    pushNotification({
      workspace_id: newParcel.workspace_id,
      target_station_id: newParcel.origin_station_id,
      target_role: 'all',
      title: `📦 كولي جديد [${newParcel.tracking_code}] — ${newParcel.origin_station_name}`,
      message: `${currentUser.name} سجل كولي من "${newParcel.origin_station_name}" إلى "${newParcel.destination_station_name}" للمستلم: ${newParcel.receiver_name} (${newParcel.amount_due} ${newParcel.currency})`,
      type: 'parcel',
      parcel_id: newParcel.id,
    });

    showToast(
      partnerDestMeta
        ? `🤝 تم تسجيل الإرسالية [${tracking_code}] وتوجيهها إلى محطة "${partnerDestMeta.stationName}" (${partnerDestMeta.partnerWorkspaceName})`
        : `تم تسجيل الإرسالية [${tracking_code}] بنجاح`,
      'success'
    );
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

    if (userRole === 'worker' && (isWorkerStationDeleted || !userAssignedStationId)) {
      const msg = '⛔ تم حذف أو إيقاف هذه المحطة من طرف المدير. لا يمكنك استلام أو تسليم أو تعديل أي كولي.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const parcel = allParcelsRef.current.find(p => p.id === id);
    if (!parcel) return { success: false, error: 'الكولي غير موجود' };
    if (currentWorkspace && parcel.workspace_id && parcel.workspace_id !== currentWorkspace.id) {
      const msg = 'لا يمكن تعديل حالة طرد تابع لمساحة عمل أخرى (صلاحية قراءة وتتبع فقط)';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // منع استلام أو تسليم كولي موجه لمحطة ممسوحة
    if (status === 'arrived' || status === 'delivered') {
      if (!parcel.partner_workspace_id) {
        const destDeleted =
          deletedStationIds.includes(parcel.destination_station_id) ||
          !stations.some(s => s.id === parcel.destination_station_id);
        if (destDeleted) {
          const msg = `⛔ محطة استلام هذا الكولي "${parcel.destination_station_name}" تم حذفها من طرف المدير. لا يمكن استقبال أو تسليم الكولي.`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
      }
    }

    // قيد منطق مراحل الكولي (State Machine): منع تسليم الكولي مباشرة وهو لا يزال في الطريق أو لم يدخل للستوك بعد
    if (status === 'delivered') {
      if (parcel.status === 'delivered') {
        const msg = `الكولي #${parcel.parcel_number} تم تسليمه للمستلم مسبقاً!`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (parcel.status === 'in_transit') {
        const msg = `تنبيه: لا يمكن تسليم الكولي #${parcel.parcel_number} لأنه لا يزال في الطريق على متن الشاحنة (${parcel.driver_name || 'الرحلة'}) ولم يدخل بعد إلى ستوك محطة "${parcel.destination_station_name}"! يجب استقبال وتفريغ الكولي في المحطة أولاً.`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (parcel.status === 'registered' || parcel.status === 'pending') {
        const msg = `تنبيه: لا يمكن تسليم الكولي #${parcel.parcel_number} لأنه لا يزال مسجلاً في محطة الانطلاق "${parcel.origin_station_name}" ولم يصل بعد إلى ستوك محطة "${parcel.destination_station_name}"!`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (parcel.status === 'return_in_transit' || parcel.status === 'returned') {
        const msg = `الكولي #${parcel.parcel_number} في مسار الإرجاع للمرسل ولا يمكن تسليمه كطرد عادي (استخدم تسليم المرتجع للمرسل).`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (parcel.status !== 'arrived') {
        const msg = `لا يمكن تسليم الكولي #${parcel.parcel_number} إلا بعد وصوله وتأكيد دخوله لستوك المحطة (الحالة الحالية: ${parcel.status}).`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    if (status === 'in_transit' && (parcel.status === 'delivered' || parcel.status === 'returned')) {
      const msg = `لا يمكن تحويل الكولي #${parcel.parcel_number} إلى "في الطريق" لأنه تم تسليمه مسبقاً.`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // قيد صارم لصلاحية التحكم في الوصول والتسليم والشحن في غرفة الشراكة والمحطات:
    // 1. عندما يسجل المرسل الكولية (registered)، تبقى في ستوك المرسل فقط.
    // 2. بعد قبول المدير الشريك للكولية، لا يمكن للمدير الشريك تأكيد الوصول (arrived) أو التسليم (delivered) إلا بعد أن يقوم الأدمين المرسل بشحنها (in_transit).
    // 3. المرسل لا يملك الحق في تأكيد وصولها أو تسليمها نهائياً.
    if (status === 'arrived' || status === 'delivered') {
      if (parcel.partner_acceptance_status === 'rejected') {
        const msg = `هذه الكولية مرفوضة في غرفة الشراكة ولا يمكن إدخالها للستوك أو تسليمها.`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (parcel.partner_acceptance_status === 'pending_approval') {
        const isOutgoingToPartner = Boolean(
          parcel.partner_workspace_id &&
            parcel.partner_workspace_id !== currentWorkspace?.id &&
            !parcel.is_collaborator_data
        );
        const msg = isOutgoingToPartner
          ? `هذه الكولية بانتظار موافقة وقبول المدير الشريك (${parcel.partner_workspace_name || 'الشريك'}) في محطة "${parcel.destination_station_name}". الشريك المستقبل هو الوحيد المخول بتأكيد الوصول والتسليم.`
          : `يرجى أولاً الضغط على «قبول الكولية» في طلبات غرفة الشراكة قبل إدخالها للستوك أو تسليمها!`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }

      if (!canControlParcelDestination(parcel, currentWorkspace?.id, userRole, userAssignedStationId)) {
        const isOutgoingToPartner = Boolean(
          parcel.partner_workspace_id &&
            parcel.partner_workspace_id !== currentWorkspace?.id &&
            !parcel.is_collaborator_data
        );
        const msg = isOutgoingToPartner
          ? `لا يمكنك تأكيد الوصول أو التسليم لهذه الكولية لأنك أرسلتها عبر غرفة الشراكة إلى "${parcel.destination_station_name}" (${parcel.partner_workspace_name || 'الشريك'}). المدير والعامل في محطة الاستلام هما الوحيدان المخولان بتأكيد الوصول والتسليم!`
          : `لا يمكنك استلام أو تسليم هذا الكولي لأنه موجه إلى محطة "${parcel.destination_station_name}" فقط`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }

      // منع تأكيد التفريغ (للستوك) إذا لم يقم المرسل بشحن الكولية بعد أو لم يتم تأكيد مرحلة "وصلات"
      if (status === 'arrived') {
        if (parcel.status === 'registered' || parcel.status === 'pending') {
          const msg = `⛔ الترتيب الصارم للشراكة (طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم): لا يمكن تفريغ الكولية #${parcel.parcel_number} لأنها لا تزال في محطة الانطلاق "${parcel.origin_station_name}" ولم تنطلق في الرحلة بعد!`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
        const isPartnerOrInterStation = Boolean(
          parcel.is_partnership_parcel ||
            parcel.partner_workspace_id ||
            parcel.partner_origin_workspace_id ||
            parcel.origin_station_id !== parcel.destination_station_id
        );
        const parentTrip = parcel.current_trip_id
          ? allTripsRef.current.find(t => t.id === parcel.current_trip_id)
          : undefined;
        const hasReachedDestination = Boolean(
          parcel.trip_arrived_at || (parentTrip && (parentTrip.status === 'arrived' || parentTrip.status === 'closed'))
        );
        if (isPartnerOrInterStation && parcel.status === 'in_transit' && !hasReachedDestination) {
          const msg = `⛔ الترتيب الصارم (طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم): يجب أولاً الضغط على زر «🏁 وصلات» لتأكيد وصول الرحلة لمحطة "${parcel.destination_station_name}" قبل الضغط على «📥 تفريغ»!`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
      }
    }

    if (status === 'in_transit') {
      if (parcel.partner_acceptance_status === 'rejected') {
        const msg = `لا يمكن شحن هذه الكولية لأن المدير في محطة "${parcel.destination_station_name}" رفض استلامها.`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (parcel.partner_acceptance_status === 'pending_approval') {
        const msg = `⛔ الترتيب الصارم للشراكة (طلب -> قبول -> رحلة -> وصلات -> تفريغ -> تسليم): لا يمكن بدء الرحلة أو شحن هذا الكولي قبل أن يقبله المدير في محطة الوصول ("${parcel.destination_station_name}").`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (!canControlParcelOrigin(parcel, currentWorkspace?.id, userRole, userAssignedStationId)) {
        const msg = `لا يمكنك شحن هذا الكولي لأنه صادر من محطة "${parcel.origin_station_name}" فقط`;
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

    const nowIso = new Date().toISOString();
    const newHistoryEntry: ParcelStatusHistoryEntry = {
      status,
      timestamp: nowIso,
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
      last_scanned_by_name: currentUser?.name || 'المستخدم',
      last_scanned_at_station:
        status === 'in_transit' ? parcel.origin_station_name : parcel.destination_station_name,
      updated_at: nowIso,
      notes: noteText ? `${parcel.notes || ''} [${noteText}]` : parcel.notes,
      status_history: [...(parcel.status_history || []), newHistoryEntry],
    };

    if (status === 'arrived' && !updated.arrived_at) {
      updated.arrived_at = nowIso;
      if (!updated.trip_arrived_at) updated.trip_arrived_at = nowIso;
    }

    if (status === 'delivered') {
      updated.delivered_at = nowIso;
      updated.delivered_to = deliveredPerson || parcel.receiver_name;

      // Only record explicit separate COD if cod_amount > 0 and not merely computed from shipping fee
      const codAmount = parcel.cod_amount ?? 0;
      const isComputedFromShipping = codAmount > 0 && codAmount === Math.max(0, (parcel.amount_due || 0) - (parcel.amount_paid || 0));
      if (codAmount > 0 && !isComputedFromShipping) {
        const destStIdForCod =
          userRole === 'worker' && userAssignedStationId
            ? userAssignedStationId
            : parcel.partner_destination_station_id || parcel.destination_station_id;
        await createTransaction({
          station_id: destStIdForCod,
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

    const nextParcels = allParcelsRef.current.map(p => p.id === id ? updated : p);
    allParcelsRef.current = nextParcels;
    setAllParcels(nextParcels);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updated,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        const fallbackParcels = allParcelsRef.current.map(p => p.id === id ? { ...p, pending_sync: true } : p);
        allParcelsRef.current = fallbackParcels;
        setAllParcels(fallbackParcels);
      }
    }

    // Sync to Firebase Firestore
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updated.workspace_id, updated).catch(err => {
        console.warn('Firebase parcel sync error:', err);
      });
      // If this is a Partnership Room parcel, mirror the status update to the counterpart partner workspace
      const counterpartWsId =
        updated.partner_origin_workspace_id && updated.partner_origin_workspace_id !== updated.workspace_id
          ? updated.partner_origin_workspace_id
          : updated.partner_workspace_id && updated.partner_workspace_id !== updated.workspace_id
          ? updated.partner_workspace_id
          : null;
      if (counterpartWsId) {
        firebaseSyncService.syncPartnerParcelStatusBack(counterpartWsId, updated.id, updated).catch(() => {});
      }
      if (currentUser) {
        firebaseSyncService
          .logPlatformActivity({
            workspace_id: parcel.workspace_id,
            workspace_name: currentWorkspace?.name || 'الشركة',
            workspace_short_id: currentWorkspace?.short_id,
            actor_id: currentUser.id,
            actor_name: currentUser.name,
            actor_phone: currentUser.phone,
            actor_email: currentUser.email,
            actor_role: userRole,
            action_type: 'PARCEL_STATUS',
            action_title: `تحديث حالة كولي [${parcel.tracking_code}] إلى: ${
              status === 'delivered'
                ? 'تم التسليم للمستلم'
                : status === 'arrived'
                ? 'وصل للمحطة (فـ الستوك)'
                : status === 'in_transit'
                ? 'في الطريق'
                : status
            }`,
            details: `المستلم: ${parcel.receiver_name}`,
          })
          .catch(() => {});
      }
    }

    const statusTextAr =
      status === 'delivered'
        ? 'تم التسليم النهائي للمستلم'
        : status === 'arrived'
        ? 'وصل للمحطة وتفريغه في الستوك'
        : status === 'in_transit'
        ? 'شحن الكولي وانطلاقه في الطريق'
        : status;

    const opReason =
      status === 'delivered'
        ? `تسليم الكولي للمستلم (${updated.delivered_to || parcel.receiver_name}) في محطة الوصول [${parcel.destination_station_name}]`
        : status === 'arrived'
        ? `استقبال وتفريغ الكولي في ستوك محطة الوصول [${parcel.destination_station_name}]`
        : status === 'in_transit'
        ? `شحن الكولي وانطلاقه في الشاحنة من محطة [${parcel.origin_station_name}] نحو [${parcel.destination_station_name}]`
        : `تحديث حالة الكولي إلى ${statusTextAr}`;

    const parcelStatusAudit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-pstatus-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: parcel.workspace_id,
      team_id: parcel.workspace_id,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'مستخدم',
      actor_role: userRole,
      station_id: status === 'in_transit' ? parcel.origin_station_id : parcel.destination_station_id,
      station_name: status === 'in_transit' ? parcel.origin_station_name : parcel.destination_station_name,
      origin_station_name: parcel.origin_station_name,
      destination_station_name: parcel.destination_station_name,
      action: 'STATUS_CHANGE',
      table_name: 'parcels',
      record_id: parcel.id,
      reason: `[${currentUser?.name || 'المستخدم'}] (${userRole === 'worker' ? 'عامل' : 'مدير'}): ${opReason}`,
      details: `المرسل: ${parcel.sender_name} (${parcel.origin_station_name}) ➔ المستلم: ${parcel.receiver_name} (${parcel.destination_station_name})`,
      is_partnership: Boolean(parcel.is_partnership_parcel || parcel.partner_workspace_id || parcel.partner_origin_workspace_id || parcel.is_collaborator_data),
      old_data: { status: parcel.status },
      new_data: { status, delivered_to: updated.delivered_to, notes: noteText },
      created_at: nowIso,
    };
    setAuditLogs(prev => [parcelStatusAudit, ...prev]);

    pushNotification({
      workspace_id: parcel.workspace_id,
      target_station_id: status === 'in_transit' ? parcel.origin_station_id : parcel.destination_station_id,
      target_role: 'all',
      title: `📦 ${statusTextAr} [${parcel.tracking_code}]`,
      message: `${currentUser?.name || 'المستخدم'}: ${opReason}`,
      type: 'parcel',
      parcel_id: parcel.id,
    });

    showToast(`تم تحديث حالة الكولي [${parcel.tracking_code}] بنجاح مع توثيق العملية بالسبب في السجل`, 'success');
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

    const parcel = allParcelsRef.current.find(p => p.id === parcelId);
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

    const nextParcels = allParcelsRef.current.map(p => p.id === parcelId ? updated : p);
    allParcelsRef.current = nextParcels;
    setAllParcels(nextParcels);

    if (isSupabaseConfigured()) {
      const synced = await parcelService.syncParcelToCloud(
        updated,
        (msg: string) => showToast(msg, 'error')
      );
      if (!synced) {
        const fallbackParcels = allParcelsRef.current.map(p => p.id === parcelId ? { ...p, pending_sync: true } : p);
        allParcelsRef.current = fallbackParcels;
        setAllParcels(fallbackParcels);
      }
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.syncParcel(updated.workspace_id, updated).catch(() => {});
      const counterpartWsId =
        updated.partner_origin_workspace_id && updated.partner_origin_workspace_id !== updated.workspace_id
          ? updated.partner_origin_workspace_id
          : updated.partner_workspace_id && updated.partner_workspace_id !== updated.workspace_id
          ? updated.partner_workspace_id
          : null;
      if (counterpartWsId) {
        firebaseSyncService.syncPartnerParcelStatusBack(counterpartWsId, updated.id, updated).catch(() => {});
      }
    }

    const paymentStationId =
      userRole === 'worker' && userAssignedStationId
        ? userAssignedStationId
        : selectedStationId && selectedStationId !== 'all'
        ? selectedStationId
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

    // Partnership security: sender workspace cannot edit the parcel once sent to partner
    const isSenderWorkspace = parcel.is_partnership_parcel && (
      parcel.partner_origin_workspace_id === currentWorkspace?.id ||
      (!parcel.partner_origin_workspace_id && parcel.workspace_id === currentWorkspace?.id)
    );
    if (isSenderWorkspace) {
      const msg = '🔒 لا يمكنك تعديل بيانات هذه الكولية: بمجرد إرسالها لغرفة الشراكة، يتم قفل التعديل عن المرسل حفاظاً على أمان المعاملات.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    if (currentWorkspace && parcel.workspace_id && parcel.workspace_id !== currentWorkspace.id && !parcel.is_partnership_parcel) {
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

    const parcel = allParcelsRef.current.find(p => p.id === parcelId);
    if (!parcel) return { success: false, error: 'الطرد غير موجود' };

    if (parcel.status === 'delivered' || parcel.status === 'returned') {
      return { success: false, error: 'لا يمكن إرجاع طرد تم تسليمه مسبقاً' };
    }
    if (parcel.status === 'in_transit') {
      return {
        success: false,
        error: `لا يمكن إرجاع الطرد #${parcel.parcel_number} وهو لا يزال في الطريق على متن الشاحنة؛ يجب استقباله وتفريغه في ستوك المحطة أولاً.`
      };
    }

    // Check role / station authorization: admin or worker assigned to destination station
    if (
      userRole === 'worker' &&
      userAssignedStationId &&
      userAssignedStationId !== parcel.destination_station_id &&
      userAssignedStationId !== parcel.partner_destination_station_id
    ) {
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
      const counterpartWsId =
        updatedParcel.partner_origin_workspace_id && updatedParcel.partner_origin_workspace_id !== updatedParcel.workspace_id
          ? updatedParcel.partner_origin_workspace_id
          : updatedParcel.partner_workspace_id && updatedParcel.partner_workspace_id !== updatedParcel.workspace_id
          ? updatedParcel.partner_workspace_id
          : null;
      if (counterpartWsId) {
        firebaseSyncService.syncPartnerParcelStatusBack(counterpartWsId, updatedParcel.id, updatedParcel).catch(() => {});
      }
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
      const counterpartWsId =
        updatedParcel.partner_origin_workspace_id && updatedParcel.partner_origin_workspace_id !== updatedParcel.workspace_id
          ? updatedParcel.partner_origin_workspace_id
          : updatedParcel.partner_workspace_id && updatedParcel.partner_workspace_id !== updatedParcel.workspace_id
          ? updatedParcel.partner_workspace_id
          : null;
      if (counterpartWsId) {
        firebaseSyncService.syncPartnerParcelStatusBack(counterpartWsId, updatedParcel.id, updatedParcel).catch(() => {});
      }
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
            'Sahara📦 Express',
        },
      };
    }

    // 2. Query Firebase Firestore across workspaces so customers on any device can track their parcel
    if (firebaseSyncService.isAvailable()) {
      try {
        const cloudFound = await firebaseSyncService.findParcelByTrackingCodeFromCloud(clean);
        if (cloudFound) {
          return {
            success: true,
            parcel: {
              ...cloudFound,
              tracking_code: formatTrackingCodeNumeric(
                cloudFound.tracking_code || clean,
                cloudFound.parcel_number
              ),
              workspace_name: cloudFound.workspace_name || 'Sahara📦 Express',
            },
          };
        }
      } catch (err) {
        console.warn('Firebase public tracking lookup error:', err);
      }
    }

    // 3. Query Supabase public RPC if configured
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

    if (userRole !== 'owner' && userRole !== 'admin') {
      const msg = 'المدير فقط هو المخول بتعديل اسم وشعار الوكالة من الإعدادات';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    if (!isPack2CustomBrandingAllowed(currentWorkspace)) {
      const msg = 'في الفترة التجريبية (30 يوم) والباك الأول (149 درهم) يخرج لوغو واسم التطبيق الرسمي الثابت في كل المطبوعات. لتغيير سمية وتصويرة شركتك يرجى تفعيل الباك الثاني (299 درهم).';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const oldBrandName = currentWorkspace.custom_brand_name || currentWorkspace.name || '';
    const cleanName = (branding.custom_brand_name ?? branding.customBrandName)?.trim() || '';
    const cleanSub = (branding.custom_brand_subtitle ?? branding.customBrandSubtitle)?.trim() || '';
    const cleanPhone = (branding.custom_brand_phone ?? branding.customBrandPhone)?.trim() || '';
    const cleanLogo = sanitizeOfficialBrandLogo(
      branding.custom_brand_logo_url ?? branding.customBrandLogoUrl
    );

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
      localStorage.setItem(
        'alittihadia_sticker_branding_v1',
        JSON.stringify({
          agencyName: cleanName || currentWorkspace.name || OFFICIAL_APP_BRAND_NAME,
          agencyPhone: cleanPhone || currentWorkspace.owner_phone || '',
          logoUrl: cleanLogo,
        })
      );
      window.dispatchEvent(new Event('sticker-branding-updated'));
    } catch {}

    // Sync to Firebase Firestore + Log rename activity for Platform Owner
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

      if (cleanName && cleanName !== oldBrandName && currentUser) {
        firebaseSyncService
          .logPlatformActivity({
            workspace_id: currentWorkspace.id,
            workspace_name: cleanName || currentWorkspace.name,
            workspace_short_id: currentWorkspace.short_id,
            actor_id: currentUser.id,
            actor_name: currentUser.name,
            actor_phone: currentUser.phone,
            actor_email: currentUser.email,
            actor_role: userRole,
            action_type: 'BRAND_RENAME',
            action_title: `✏️ تبديل سمية الوكالة/الشركة: من «${oldBrandName}» إلى «${cleanName}»`,
            details: `قام المدير بتغيير اسم الوكالة من الإعدادات`,
          })
          .catch(() => {});
      }
    }

    showToast('تم حفظ وتعميم اسم ولوغو الشركة في الملصقات والتقارير وجميع الـ PDF بنجاح', 'success');
    return { success: true };
  };

  // ============================================================================
  // TRIPS & DISPATCH MODULE (إدارة رحلات الشحن والتفريغ بين المحطات)
  // ============================================================================

  // Helper to sync trip and parcels across both own workspace and counterpart partner workspace in Firestore
  const syncTripAndParcelsAcrossWorkspaces = (trip?: Trip, parcelsToSync: Parcel[] = []) => {
    if (!firebaseSyncService.isAvailable()) return;
    const myWsId = currentWorkspace?.id || '';

    if (trip) {
      firebaseSyncService.syncTrip(trip.workspace_id || myWsId, trip).catch(() => {});
      const partnerTripWsId =
        trip.partner_origin_workspace_id && trip.partner_origin_workspace_id !== (trip.workspace_id || myWsId)
          ? trip.partner_origin_workspace_id
          : trip.partner_workspace_id && trip.partner_workspace_id !== (trip.workspace_id || myWsId)
          ? trip.partner_workspace_id
          : null;
      if (partnerTripWsId) {
        firebaseSyncService.syncPartnerTrip(partnerTripWsId, trip).catch(() => {});
      }
    }

    for (const p of parcelsToSync) {
      firebaseSyncService.syncParcel(p.workspace_id || myWsId, p).catch(() => {});
      const counterpartWsId =
        p.partner_origin_workspace_id && p.partner_origin_workspace_id !== (p.workspace_id || myWsId)
          ? p.partner_origin_workspace_id
          : p.partner_workspace_id && p.partner_workspace_id !== (p.workspace_id || myWsId)
          ? p.partner_workspace_id
          : trip?.partner_workspace_id && trip.partner_workspace_id !== (p.workspace_id || myWsId)
          ? trip.partner_workspace_id
          : null;
      if (counterpartWsId) {
        if (p.partner_origin_workspace_id === (p.workspace_id || myWsId) || !p.is_collaborator_data) {
          firebaseSyncService.syncPartnerParcel(counterpartWsId, p).catch(() => {});
        } else {
          firebaseSyncService.syncPartnerParcelStatusBack(counterpartWsId, p.id, p).catch(() => {});
        }
      }
    }
  };

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

    if (userRole === 'worker') {
      if (isWorkerStationDeleted || !userAssignedStationId || params.originStationId !== userAssignedStationId) {
        const msg = '⛔ لا تملك صلاحية إنشاء رحلة شحن: محطتك تم حذفها أو إيقافها من طرف المدير.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    const wsId = currentWorkspace.id;
    const originSt = stations.find(s => s.id === params.originStationId && !deletedStationIds.includes(s.id));
    if (!originSt) {
      const msg = '⛔ محطة انطلاق الرحلة محذوفة أو غير موجودة من طرف المدير. تم إيقاف إنشاء الرحلة.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const ownDestSt = stations.find(s => s.id === params.destinationStationId && !deletedStationIds.includes(s.id));

    // Check if the selected destination station belongs to an active partner in غرفة الشراكة
    let partnerDestMeta: {
      partnerWorkspaceId: string;
      partnerWorkspaceName: string;
      stationId: string;
      stationName: string;
      stationCity: string;
    } | null = null;

    if (!ownDestSt) {
      for (const p of managerPartnerships) {
        if (p.status !== 'active') continue;
        const isA = p.workspace_a_id === wsId;
        const pWsId = isA ? p.workspace_b_id : p.workspace_a_id;
        const pWsName = isA ? p.workspace_b_name : p.workspace_a_name;
        const netEntry = registeredManagersNetwork.find(m => m.workspaceId === pWsId);
        const combinedStations = [
          ...(netEntry?.stations || []),
          ...((isA ? p.workspace_b_stations : p.workspace_a_stations) || []),
        ];
        const matchedSt = combinedStations.find(st => st.id === params.destinationStationId);
        if (matchedSt) {
          partnerDestMeta = {
            partnerWorkspaceId: pWsId,
            partnerWorkspaceName: netEntry?.workspaceName || pWsName || 'شركة شريكة',
            stationId: matchedSt.id,
            stationName: matchedSt.name,
            stationCity: matchedSt.city || matchedSt.name,
          };
          break;
        }
      }
    }

    if (!ownDestSt && !partnerDestMeta) {
      const msg = '⛔ محطة وصول الرحلة محذوفة أو غير موجودة في سجلات المدير أو الشركاء. تم إيقاف إنشاء الرحلة.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const destStationName = ownDestSt?.name || partnerDestMeta?.stationName || 'محطة الوصول';

    const res = tripService.createTrip(
      {
        workspaceId: currentWorkspace.id,
        driverName: params.driverName,
        driverPhone: params.driverPhone,
        vehiclePlate: params.vehiclePlate,
        originStationId: params.originStationId,
        destinationStationId: params.destinationStationId,
        originStationName: originSt?.name,
        destinationStationName: destStationName,
        notes: params.notes,
        fuelExpense: params.fuelExpense,
        tollExpense: params.tollExpense,
        driverCommission: params.driverCommission,
        otherExpense: params.otherExpense,
        expenseCurrency: params.expenseCurrency,
        deductFromCashbox: params.deductFromCashbox,
        userId: currentUser.id,
        userName: currentUser.name,
        isPartnershipTrip: Boolean(partnerDestMeta),
        partnerOriginWorkspaceId: partnerDestMeta ? currentWorkspace.id : undefined,
        partnerOriginWorkspaceName: partnerDestMeta ? currentWorkspace.name : undefined,
        partnerWorkspaceId: partnerDestMeta?.partnerWorkspaceId,
        partnerWorkspaceName: partnerDestMeta?.partnerWorkspaceName,
        partnerDestinationStationId: partnerDestMeta?.stationId,
        partnerDestinationStationName: partnerDestMeta?.stationName,
        onErrorToast: (msg: string) => showToast(msg, 'error')
      },
      allTrips
    );

    allTripsRef.current = res.updatedList;
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

    // Sync to Firebase Firestore (including partner's workspace if partnership trip)
    if (res.trip) {
      syncTripAndParcelsAcrossWorkspaces(res.trip, []);
    }

    showToast(
      partnerDestMeta
        ? `🤝 تم إنشاء رحلة الشراكة [${res.trip.trip_code}] نحو محطة "${partnerDestMeta.stationName}" (${partnerDestMeta.partnerWorkspaceName})`
        : `تم إنشاء الرحلة [${res.trip.trip_code}] بنجاح`,
      'success'
    );
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
      allTripsRef.current = res.updatedTrips;
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

    const targetTripForLoad = allTripsRef.current.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForLoad && targetTripForLoad.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك شحن الكوليات في هذه الرحلة لأنها تنطلق من محطة "${targetTripForLoad.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.loadParcelToTrip(
      tripId,
      parcelIdentifier,
      { id: currentUser.id, name: currentUser.name },
      allTripsRef.current,
      allParcelsRef.current,
      userAssignedStationId || undefined,
      (msg: string) => showToast(msg, 'error')
    );

    if (res.success) {
      allTripsRef.current = res.updatedTrips;
      allParcelsRef.current = res.updatedParcels;
      setAllTrips(res.updatedTrips);
      setAllParcels(res.updatedParcels);
      syncTripAndParcelsAcrossWorkspaces(res.trip, res.parcel ? [res.parcel] : []);
    }
    return {
      success: res.success,
      error: res.error,
      warning: res.warning,
      trip: res.trip,
      parcel: res.parcel
    };
  };

  // Batch load multiple or all matching ready parcels onto a trip in 1 click (handles hundreds/thousands of parcels smoothly)
  const loadAllMatchingParcelsToTrip = async (
    tripId: string,
    parcelIds?: string[]
  ): Promise<{ success: boolean; loadedCount: number; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, loadedCount: 0, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, loadedCount: 0, error: writeCheck.error };

    const targetTrip = allTripsRef.current.find(t => t.id === tripId);
    if (!targetTrip) return { success: false, loadedCount: 0, error: 'الرحلة غير موجودة' };
    if (targetTrip.status !== 'loading') {
      return { success: false, loadedCount: 0, error: 'لا يمكن شحن الكوليات بعد انطلاق الرحلة' };
    }
    if (userRole === 'worker' && userAssignedStationId && targetTrip.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك شحن الكوليات في هذه الرحلة لأنها تنطلق من محطة "${targetTrip.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, loadedCount: 0, error: msg };
    }

    const destId = targetTrip.partner_destination_station_id || targetTrip.destination_station_id;
    const candidateParcels = allParcelsRef.current.filter(p => {
      if (targetTrip.loaded_parcel_ids.includes(p.id)) return false;
      if (parcelIds && parcelIds.length > 0) {
        return parcelIds.includes(p.id);
      }
      if (p.status !== 'registered' && p.status !== 'return_in_transit') return false;
      if (p.origin_station_id !== targetTrip.origin_station_id && !p.is_returning) return false;
      const pDest = p.partner_destination_station_id || p.destination_station_id;
      return pDest === destId || p.destination_station_id === targetTrip.destination_station_id;
    });

    if (candidateParcels.length === 0) {
      const msg = 'لا توجد كوليات جاهزة ومطابقة لهذه الوجهة لشحنها حالياً';
      showToast(msg, 'info');
      return { success: false, loadedCount: 0, error: msg };
    }

    let currentTrips = allTripsRef.current;
    let currentParcels = allParcelsRef.current;
    const modifiedParcels: Parcel[] = [];
    let latestTrip: Trip | undefined = targetTrip;

    for (const p of candidateParcels) {
      const step = tripService.loadParcelToTrip(
        tripId,
        p.id,
        { id: currentUser.id, name: currentUser.name },
        currentTrips,
        currentParcels,
        userAssignedStationId || undefined
      );
      if (step.success && step.trip && step.parcel) {
        currentTrips = step.updatedTrips;
        currentParcels = step.updatedParcels;
        latestTrip = step.trip;
        modifiedParcels.push(step.parcel);
      }
    }

    allTripsRef.current = currentTrips;
    allParcelsRef.current = currentParcels;
    setAllTrips(currentTrips);
    setAllParcels(currentParcels);

    if (modifiedParcels.length > 0) {
      syncTripAndParcelsAcrossWorkspaces(latestTrip, modifiedParcels);
      showToast(`⚡ تم شحن (${modifiedParcels.length}) كولي دفعة واحدة في الرحلة [${targetTrip.trip_code}] بنجاح`, 'success');
    }

    return {
      success: modifiedParcels.length > 0,
      loadedCount: modifiedParcels.length,
      trip: latestTrip,
    };
  };

  const unloadParcelFromTrip = async (
    tripId: string,
    parcelId: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForUnload = allTripsRef.current.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForUnload && targetTripForUnload.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك تعديل شحن هذه الرحلة لأنها تنطلق من محطة "${targetTripForUnload.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.unloadParcelFromTrip(
      tripId,
      parcelId,
      { id: currentUser.id, name: currentUser.name },
      allTripsRef.current,
      allParcelsRef.current,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      allTripsRef.current = res.updatedTrips;
      allParcelsRef.current = res.updatedParcels;
      setAllTrips(res.updatedTrips);
      setAllParcels(res.updatedParcels);
      const updatedP = res.updatedParcels.find(p => p.id === parcelId);
      syncTripAndParcelsAcrossWorkspaces(res.trip, updatedP ? [updatedP] : []);
    }
    return { success: res.success, error: res.error, trip: res.trip };
  };

  const departTrip = async (
    tripId: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForDepart = allTripsRef.current.find(t => t.id === tripId);
    if (userRole === 'worker' && userAssignedStationId && targetTripForDepart && targetTripForDepart.origin_station_id !== userAssignedStationId) {
      const msg = `لا يمكنك إطلاق هذه الرحلة لأنها تابعة لمحطة "${targetTripForDepart.origin_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.departTrip(
      tripId,
      { id: currentUser.id, name: currentUser.name },
      allTripsRef.current,
      allParcelsRef.current,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      allTripsRef.current = res.updatedTrips;
      allParcelsRef.current = res.updatedParcels;
      setAllTrips(res.updatedTrips);
      setAllParcels(res.updatedParcels);
      if (res.trip) {
        const departedParcels = res.trip.loaded_parcel_ids
          .map(pid => res.updatedParcels.find(p => p.id === pid))
          .filter((p): p is Parcel => Boolean(p));
        syncTripAndParcelsAcrossWorkspaces(res.trip, departedParcels);
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

    const targetTripForReceive = allTripsRef.current.find(t => t.id === tripId);
    if (targetTripForReceive) {
      const isSenderOfPartnerTrip = Boolean(
        targetTripForReceive.partner_workspace_id &&
          targetTripForReceive.partner_workspace_id !== currentWorkspace?.id &&
          !targetTripForReceive.is_collaborator_data
      );
      if (isSenderOfPartnerTrip) {
        const msg = `⛔ لا يمكنك استقبال أو تفريغ هذه الرحلة لأنك الطرف المرسل! المدير أو العامل في محطة الوصول "${targetTripForReceive.destination_station_name}" هما الوحيدان المخولان بتفريغها وتأكيد وصولها.`;
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
      if (userRole === 'worker') {
        if (userAssignedStationId === targetTripForReceive.origin_station_id && targetTripForReceive.destination_station_id !== userAssignedStationId) {
          const msg = `⛔ لا يمكن لمحطة الإرسال ("${targetTripForReceive.origin_station_name}") تفريغ أو استقبال الرحلة. التفريغ يتم حصرياً في محطة الوصول ("${targetTripForReceive.destination_station_name}").`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
        if (
          userAssignedStationId &&
          targetTripForReceive.destination_station_id !== userAssignedStationId &&
          targetTripForReceive.partner_destination_station_id !== userAssignedStationId
        ) {
          const msg = `⛔ لا يمكنك استقبال وتفريغ هذه الرحلة لأنها متجهة إلى محطة "${targetTripForReceive.destination_station_name}" فقط`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
      }
      if (selectedStationId && selectedStationId !== 'all') {
        if (selectedStationId === targetTripForReceive.origin_station_id && selectedStationId !== targetTripForReceive.destination_station_id) {
          const msg = `⛔ محطة الإرسال ("${targetTripForReceive.origin_station_name}") لا تستقبل الرحلة. لتفريغها يرجى التبديل لمحطة الاستلام ("${targetTripForReceive.destination_station_name}") أو عرض كافة المحطات.`;
          showToast(msg, 'error');
          return { success: false, error: msg };
        }
      }
    }

    const res = tripService.receiveParcelAtDestination(
      tripId,
      parcelIdentifier,
      condition,
      conditionNotes,
      { id: currentUser.id, name: currentUser.name },
      allTripsRef.current,
      allParcelsRef.current,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      const updatedParcelsWithAccept = res.updatedParcels.map(p =>
        res.parcel && p.id === res.parcel.id && p.partner_acceptance_status === 'pending_approval'
          ? { ...p, partner_acceptance_status: 'accepted' as const }
          : p
      );
      const syncedParcel =
        res.parcel && res.parcel.partner_acceptance_status === 'pending_approval'
          ? { ...res.parcel, partner_acceptance_status: 'accepted' as const }
          : res.parcel;
      allTripsRef.current = res.updatedTrips;
      allParcelsRef.current = updatedParcelsWithAccept;
      setAllTrips(res.updatedTrips);
      setAllParcels(updatedParcelsWithAccept);
      syncTripAndParcelsAcrossWorkspaces(res.trip, syncedParcel ? [syncedParcel] : []);
    }
    return {
      success: res.success,
      error: res.error,
      trip: res.trip,
      parcel: res.parcel,
      allScanned: res.allScanned
    };
  };

  // Batch receive/unload all remaining loaded parcels of a trip into destination station stock ('arrived') in 1 click
  const receiveAllParcelsInTrip = async (
    tripId: string
  ): Promise<{ success: boolean; receivedCount: number; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, receivedCount: 0, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, receivedCount: 0, error: writeCheck.error };

    const targetTrip = allTripsRef.current.find(t => t.id === tripId);
    if (!targetTrip) return { success: false, receivedCount: 0, error: 'الرحلة غير موجودة' };
    const isSenderOfPartnerTrip = Boolean(
      targetTrip.partner_workspace_id &&
        targetTrip.partner_workspace_id !== currentWorkspace?.id &&
        !targetTrip.is_collaborator_data
    );
    if (isSenderOfPartnerTrip) {
      const msg = `⛔ لا يمكنك استقبال أو تفريغ هذه الرحلة لأنك الطرف المرسل! المدير أو العامل في محطة الوصول "${targetTrip.destination_station_name}" هما الوحيدان المخولان بتفريغها وتأكيد وصولها.`;
      showToast(msg, 'error');
      return { success: false, receivedCount: 0, error: msg };
    }
    if (userRole === 'worker') {
      if (userAssignedStationId === targetTrip.origin_station_id && targetTrip.destination_station_id !== userAssignedStationId) {
        const msg = `⛔ لا يمكن لمحطة الإرسال ("${targetTrip.origin_station_name}") تفريغ أو استقبال الرحلة. التفريغ يتم حصرياً في محطة الوصول ("${targetTrip.destination_station_name}").`;
        showToast(msg, 'error');
        return { success: false, receivedCount: 0, error: msg };
      }
      if (
        userAssignedStationId &&
        targetTrip.destination_station_id !== userAssignedStationId &&
        targetTrip.partner_destination_station_id !== userAssignedStationId
      ) {
        const msg = `⛔ لا يمكنك استقبال وتفريغ هذه الرحلة لأنها متجهة إلى محطة "${targetTrip.destination_station_name}" فقط`;
        showToast(msg, 'error');
        return { success: false, receivedCount: 0, error: msg };
      }
    }
    if (selectedStationId && selectedStationId !== 'all') {
      if (selectedStationId === targetTrip.origin_station_id && selectedStationId !== targetTrip.destination_station_id) {
        const msg = `⛔ محطة الإرسال ("${targetTrip.origin_station_name}") لا تستقبل الرحلة. لتفريغها يرجى التبديل لمحطة الاستلام ("${targetTrip.destination_station_name}") أو عرض كافة المحطات.`;
        showToast(msg, 'error');
        return { success: false, receivedCount: 0, error: msg };
      }
    }

    const unreceivedIds = targetTrip.loaded_parcel_ids.filter(
      pid => !targetTrip.received_parcel_ids.includes(pid)
    );

    let currentTrips = allTripsRef.current;
    let currentParcels = allParcelsRef.current;
    const receivedParcels: Parcel[] = [];
    let latestTrip: Trip | undefined = targetTrip;

    for (const pid of unreceivedIds) {
      const step = tripService.receiveParcelAtDestination(
        tripId,
        pid,
        'normal',
        undefined,
        { id: currentUser.id, name: currentUser.name },
        currentTrips,
        currentParcels
      );
      if (step.success && step.trip && step.parcel) {
        const finalParcel: Parcel =
          step.parcel.partner_acceptance_status === 'pending_approval'
            ? { ...step.parcel, partner_acceptance_status: 'accepted' }
            : step.parcel;
        currentTrips = step.updatedTrips;
        currentParcels = step.updatedParcels.map(item => (item.id === finalParcel.id ? finalParcel : item));
        latestTrip = step.trip;
        receivedParcels.push(finalParcel);
      }
    }

    // Automatically close the trip if all parcels are now received
    if (latestTrip && latestTrip.received_parcel_ids.length >= latestTrip.loaded_parcel_ids.length) {
      const closeRes = tripService.closeTrip(
        tripId,
        { id: currentUser.id, name: currentUser.name },
        'تم تفريغ وإدخال جميع الكوليات للستوك بنجاح',
        currentTrips
      );
      if (closeRes.success && closeRes.trip) {
        currentTrips = closeRes.updatedTrips;
        latestTrip = closeRes.trip;
      }
    }

    allTripsRef.current = currentTrips;
    allParcelsRef.current = currentParcels;
    setAllTrips(currentTrips);
    setAllParcels(currentParcels);

    if (receivedParcels.length > 0 || latestTrip) {
      syncTripAndParcelsAcrossWorkspaces(latestTrip, receivedParcels);
      showToast(
        `✅ تم تفريغ وإدخال (${receivedParcels.length}) كولي إلى ستوك المحطة وإغلاق الرحلة بنجاح!`,
        'success'
      );
    }

    return {
      success: true,
      receivedCount: receivedParcels.length,
      trip: latestTrip,
    };
  };

  const closeTrip = async (
    tripId: string,
    closeReason?: string
  ): Promise<{ success: boolean; error?: string; trip?: Trip }> => {
    if (!currentUser) return { success: false, error: 'غير مسجل الدخول' };
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTripForClose = allTripsRef.current.find(t => t.id === tripId);
    if (
      userRole === 'worker' &&
      userAssignedStationId &&
      targetTripForClose &&
      targetTripForClose.destination_station_id !== userAssignedStationId &&
      targetTripForClose.partner_destination_station_id !== userAssignedStationId
    ) {
      const msg = `لا يمكنك إغلاق هذه الرحلة لأنها متجهة إلى محطة "${targetTripForClose.destination_station_name}"`;
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const res = tripService.closeTrip(
      tripId,
      { id: currentUser.id, name: currentUser.name },
      closeReason,
      allTripsRef.current,
      (msg: string) => showToast(msg, 'error')
    );
    if (res.success) {
      allTripsRef.current = res.updatedTrips;
      setAllTrips(res.updatedTrips);
      if (res.trip) {
        syncTripAndParcelsAcrossWorkspaces(res.trip, []);
      }
    }
    return { success: res.success, error: res.error, trip: res.trip };
  };

  // حذف كولي نهائياً (للمدير فقط)
  // حذف كولي نهائياً (للمدير فقط مع حماية غرفة الشراكة)
  const deleteParcel = async (id: string): Promise<{ success: boolean; error?: string }> => {
    if (userRole === 'worker') {
      const msg = '⛔ غير مصرح للعامل بمسح الكوليات أو السجلات نهائياً. زر الحذف محجوب.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetParcel = allParcels.find(p => p.id === id);
    if (!targetParcel) return { success: false, error: 'الكولي غير موجود' };

    if (userRole === 'admin') {
      // مدير المحطة يحذف فقط كوليات محطته المعين بها
      if (
        targetParcel.origin_station_id !== userAssignedStationId &&
        targetParcel.destination_station_id !== userAssignedStationId
      ) {
        const msg = 'غير مصرح: مدير المحطة يمكنه فقط حذف كوليات محطته المعين بها.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    } else if (userRole !== 'owner' && userRole !== 'platform_owner') {
      const msg = 'صلاحية حذف الكوليات للمدير فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // حماية سجلات غرفة الشراكة: لا يمكن لأي أحد مسحها (لا المدير ولا العامل)
    const isPartnershipParcel = Boolean(
      targetParcel.is_partnership_parcel ||
      targetParcel.partner_workspace_id ||
      targetParcel.partner_origin_workspace_id ||
      targetParcel.is_collaborator_data
    );
    if (isPartnershipParcel) {
      const msg = '🔒 سجلات غرفة الشراكة محمية ومقفلة نهائياً ولا يمكن مسحها لا من طرف المدير ولا العامل لضمان بقاء الأدلة والوثائق.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const wsId = targetParcel.workspace_id || currentWorkspace?.id || 'ws-default';
    setAllParcels(prev => prev.filter(p => p.id !== id));
    allParcelsRef.current = allParcelsRef.current.filter(p => p.id !== id);

    // توثيق عملية الحذف بالسبب
    const auditEntry: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-del-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: wsId,
      team_id: wsId,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المدير',
      actor_role: userRole,
      station_id: targetParcel.origin_station_id,
      station_name: targetParcel.origin_station_name,
      origin_station_name: targetParcel.origin_station_name,
      destination_station_name: targetParcel.destination_station_name,
      action: 'DELETE',
      table_name: 'parcels',
      record_id: targetParcel.id,
      reason: `🗑️ قام المدير [${currentUser?.name || 'المدير'}] بحذف الكولي [${targetParcel.tracking_code || targetParcel.parcel_number}] (المرسل: ${targetParcel.sender_name} ➔ المستلم: ${targetParcel.receiver_name}) — سبب الحذف: إلغاء ومسح الكولي نهائياً من محطة ${targetParcel.origin_station_name}`,
      details: `محطة الانطلاق: ${targetParcel.origin_station_name} | محطة الوجهة: ${targetParcel.destination_station_name} | ثمن الشحن: ${targetParcel.shipping_fee || targetParcel.amount_due}`,
      old_data: {
        tracking_code: targetParcel.tracking_code,
        parcel_number: targetParcel.parcel_number,
        sender: targetParcel.sender_name,
        receiver: targetParcel.receiver_name,
        shipping_fee: targetParcel.shipping_fee,
        deleted_by: currentUser?.name || 'المدير',
      },
      new_data: null,
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [auditEntry, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(id)) {
      try {
        await supabase.from('parcels').delete().eq('id', id);
      } catch {}
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteParcel(wsId, id).catch(() => {});
      if (targetParcel.partner_workspace_id && targetParcel.partner_workspace_id !== wsId) {
        firebaseSyncService.deleteParcel(targetParcel.partner_workspace_id, id).catch(() => {});
      }
      firebaseSyncService.logPlatformActivity({
        workspace_id: wsId,
        workspace_name: currentWorkspace?.name || 'Sahara Express',
        actor_id: currentUser?.id || 'sys',
        action_type: 'PARCEL_DELETE',
        action_title: `🗑️ تم حذف كولي: [${targetParcel.tracking_code || targetParcel.parcel_number}] بواسطة المدير ${currentUser?.name || ''}`,
        actor_name: currentUser?.name || 'المدير',
        actor_role: userRole,
        details: `حذف الكولي نهائياً: من ${targetParcel.origin_station_name} إلى ${targetParcel.destination_station_name}`,
      }).catch(() => {});
    }

    showToast(`تم حذف الكولي [${targetParcel.tracking_code}] نهائياً مع توثيق العملية بالسبب في سجل المراجعة`, 'info');
    return { success: true };
  };

  // حذف رحلة نهائياً (للمدير فقط مع حماية رحلات غرفة الشراكة)
  const deleteTrip = async (tripId: string): Promise<{ success: boolean; error?: string }> => {
    if (userRole === 'worker') {
      const msg = '⛔ غير مصرح للعامل بمسح الرحلات نهائياً. زر الحذف محجوب.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const targetTrip = allTrips.find(t => t.id === tripId);
    if (!targetTrip) return { success: false, error: 'الرحلة غير موجودة' };

    if (userRole === 'admin') {
      // مدير المحطة يحذف فقط رحلات محطته المعين بها
      if (
        targetTrip.origin_station_id !== userAssignedStationId &&
        targetTrip.destination_station_id !== userAssignedStationId
      ) {
        const msg = 'غير مصرح: مدير المحطة يمكنه فقط حذف رحلات محطته المعين بها.';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    } else if (userRole !== 'owner' && userRole !== 'platform_owner') {
      const msg = 'صلاحية حذف الرحلات للمدير فقط';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // حماية رحلات غرفة الشراكة
    const isPartnershipTrip = Boolean(
      targetTrip.partner_workspace_id ||
      targetTrip.partner_destination_station_id ||
      targetTrip.partner_workspace_name ||
      targetTrip.is_collaborator_data
    );
    if (isPartnershipTrip) {
      const msg = '🔒 رحلات وسجلات غرفة الشراكة محمية ومقفلة نهائياً ولا يمكن مسحها لضمان الأدلة والوثائق.';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const wsId = targetTrip.workspace_id || currentWorkspace?.id || 'ws-default';
    setAllTrips(prev => {
      const next = prev.filter(t => t.id !== tripId);
      storageService.set('TRIPS', next);
      return next;
    });

    // توثيق حذف الرحلة بالسبب
    const auditEntry: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-deltrip-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: wsId,
      team_id: wsId,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المدير',
      actor_role: userRole,
      station_id: targetTrip.origin_station_id,
      station_name: targetTrip.origin_station_name,
      origin_station_name: targetTrip.origin_station_name,
      destination_station_name: targetTrip.destination_station_name,
      action: 'DELETE',
      table_name: 'trips',
      record_id: targetTrip.id,
      reason: `🗑️ قام المدير [${currentUser?.name || 'المدير'}] بحذف الرحلة [${targetTrip.trip_code}] من [${targetTrip.origin_station_name}] إلى [${targetTrip.destination_station_name}] (السائق: ${targetTrip.driver_name})`,
      details: `عدد الكوليات المحملة: ${targetTrip.loaded_parcel_ids.length}`,
      is_partnership: false,
      old_data: targetTrip,
      new_data: null,
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [auditEntry, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && isValidUUID(tripId)) {
      try {
        await supabase.from('trips').delete().eq('id', tripId);
      } catch {}
    }

    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteTrip(wsId, tripId).catch(() => {});
    }

    showToast(`تم حذف الرحلة [${targetTrip.trip_code}] نهائياً مع توثيق العملية بالسبب في السجل`, 'info');
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

    if (userRole !== 'owner' && userRole !== 'admin') {
      const msg = 'المدير فقط هو مول محطاتو وهو المخول بفتح محطة جديدة من الإعدادات';
      showToast(msg, 'error');
      return { success: false, error: msg };
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
        ? 'باقتك الحالية (الباك الأول — 149 درهم) تسمح بفتح محطتين (2) فقط كحد أقصى! لفتح محطات غير محدودة وتخصيص اللوغو في الملصقات والبونات يرجى الترقية إلى الباك الثاني (299 درهم).'
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
    setSelectedStationId(newSt.id);

    // Update partnerships with newly created station
    setManagerPartnerships(prev => prev.map(p => {
      const stInfo: PartnershipStationInfo = {
        id: newSt.id,
        name: newSt.name,
        city: newSt.city,
        country: newSt.country,
        phone: newSt.phone,
      };
      if (p.workspace_a_id === wsId) {
        return { ...p, workspace_a_stations: [...(p.workspace_a_stations || []).filter(s => s.id !== newSt.id), stInfo] };
      }
      if (p.workspace_b_id === wsId) {
        return { ...p, workspace_b_stations: [...(p.workspace_b_stations || []).filter(s => s.id !== newSt.id), stInfo] };
      }
      return p;
    }));

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
      firebaseSyncService.updateStationInPartnerships(wsId, newSt.id, {
        id: newSt.id,
        name: newSt.name,
        city: newSt.city,
        country: newSt.country,
        phone: newSt.phone,
      }).catch(() => {});
      if (currentUser) {
        firebaseSyncService
          .logPlatformActivity({
            workspace_id: wsId,
            workspace_name: currentWorkspace?.name || 'الشركة',
            workspace_short_id: currentWorkspace?.short_id,
            actor_id: currentUser.id,
            actor_name: currentUser.name,
            actor_phone: currentUser.phone,
            actor_email: currentUser.email,
            actor_role: userRole,
            action_type: 'STATION_CREATE',
            action_title: `إنشاء محطة جديدة: ${newSt.name} (${newSt.city})`,
            details: `العملة: ${chosenCurrency} | الدولة: ${finalCountry === 'MR' ? 'موريتانيا' : 'المغرب'}`,
          })
          .catch(() => {});
      }
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
    if (userRole !== 'owner' && userRole !== 'admin') {
      const msg = 'المدير فقط هو المخول بتعديل سمية أو بيانات المحطة من الإعدادات';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

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

    // 1. Update stations state
    setStations(prev => prev.map(s => (s.id === stationId ? updatedStation : s)));

    // 2. Cascade new station name across allParcels, allTrips, allTransactions, registeredManagersNetwork, and managerPartnerships (Requirement 6)
    const modifiedParcelsForSync: Parcel[] = [];
    const nextParcels = allParcelsRef.current.map(p => {
      let changed = false;
      const nextP: Parcel = { ...p };
      if (p.origin_station_id === stationId && p.origin_station_name !== updatedStation.name) {
        nextP.origin_station_name = updatedStation.name;
        changed = true;
      }
      if (p.destination_station_id === stationId && p.destination_station_name !== updatedStation.name) {
        nextP.destination_station_name = updatedStation.name;
        changed = true;
      }
      if (p.partner_destination_station_id === stationId && p.partner_destination_station_name !== updatedStation.name) {
        nextP.partner_destination_station_name = updatedStation.name;
        nextP.destination_station_name = updatedStation.name;
        changed = true;
      }
      if (changed) modifiedParcelsForSync.push(nextP);
      return changed ? nextP : p;
    });
    if (modifiedParcelsForSync.length > 0) {
      allParcelsRef.current = nextParcels;
      setAllParcels(nextParcels);
    }

    const nextTrips = allTripsRef.current.map(t => {
      let changed = false;
      const nextT: Trip = { ...t };
      if (t.origin_station_id === stationId && t.origin_station_name !== updatedStation.name) {
        nextT.origin_station_name = updatedStation.name;
        changed = true;
      }
      if (
        (t.destination_station_id === stationId || t.partner_destination_station_id === stationId) &&
        t.destination_station_name !== updatedStation.name
      ) {
        nextT.destination_station_name = updatedStation.name;
        if (t.partner_destination_station_id === stationId) {
          nextT.partner_destination_station_name = updatedStation.name;
        }
        changed = true;
      }
      return changed ? nextT : t;
    });
    allTripsRef.current = nextTrips;
    setAllTrips(nextTrips);

    const modifiedTxsForSync: Transaction[] = [];
    setAllTransactions(prev =>
      prev.map(tx => {
        let changed = false;
        const nextTx: Transaction = { ...tx };
        if (tx.station_id === stationId && tx.station_name !== updatedStation.name) {
          nextTx.station_name = updatedStation.name;
          changed = true;
        }
        if (tx.hawala_meta) {
          const isOrig = tx.hawala_meta.origin_station_id === stationId;
          const isDest = tx.hawala_meta.destination_station_id === stationId;
          if (isOrig || isDest) {
            nextTx.hawala_meta = {
              ...tx.hawala_meta,
              origin_station_name: isOrig ? updatedStation.name : tx.hawala_meta.origin_station_name,
              destination_station_name: isDest ? updatedStation.name : tx.hawala_meta.destination_station_name,
            };
            changed = true;
          }
        }
        if (changed) modifiedTxsForSync.push(nextTx);
        return changed ? nextTx : tx;
      })
    );

    setRegisteredManagersNetwork(prev =>
      prev.map(net =>
        net.workspaceId === wsId
          ? {
              ...net,
              stations: (net.stations || []).map(st =>
                st.id === stationId
                  ? { ...st, name: updatedStation.name, city: updatedStation.city, phone: updatedStation.phone }
                  : st
              ),
            }
          : net
      )
    );

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
      // Propagate updated station name, phone, and city to partner managers across all partnerships in real-time
      firebaseSyncService.updateStationInPartnerships(wsId, stationId, {
        id: updatedStation.id,
        name: updatedStation.name,
        city: updatedStation.city,
        country: updatedStation.country,
        phone: updatedStation.phone,
      }).catch(() => {});
      for (const mp of modifiedParcelsForSync) {
        firebaseSyncService.syncParcel(wsId, mp).catch(() => {});
        const cWs =
          mp.partner_origin_workspace_id && mp.partner_origin_workspace_id !== wsId
            ? mp.partner_origin_workspace_id
            : mp.partner_workspace_id && mp.partner_workspace_id !== wsId
            ? mp.partner_workspace_id
            : null;
        if (cWs) {
          firebaseSyncService.syncPartnerParcelStatusBack(cWs, mp.id, mp).catch(() => {});
        }
      }
      for (const mtx of modifiedTxsForSync) {
        firebaseSyncService.syncTransaction(wsId, mtx).catch(() => {});
      }
      if (currentUser && (existing.name !== updatedStation.name || existing.city !== updatedStation.city)) {
        firebaseSyncService
          .logPlatformActivity({
            workspace_id: wsId,
            workspace_name: currentWorkspace?.name || 'الشركة',
            workspace_short_id: currentWorkspace?.short_id,
            actor_id: currentUser.id,
            actor_name: currentUser.name,
            actor_phone: currentUser.phone,
            actor_email: currentUser.email,
            actor_role: userRole,
            action_type: 'STATION_RENAME',
            action_title: `✏️ تبديل سمية محطة: من «${existing.name}» إلى «${updatedStation.name}» (${updatedStation.city})`,
            details: `الاسم السابق: ${existing.name} (${existing.city}) ⬅ الاسم الجديد: ${updatedStation.name} (${updatedStation.city})`,
          })
          .catch(() => {});
      }
    }

    // Update local partnerships cache
    setManagerPartnerships(prev => {
      const next = prev.map(p => {
        let isChanged = false;
        let newA = p.workspace_a_stations || [];
        let newB = p.workspace_b_stations || [];
        if (p.workspace_a_id === wsId) {
          newA = newA.map(s => s.id === stationId ? { ...s, name: updatedStation.name, city: updatedStation.city, phone: updatedStation.phone } : s);
          isChanged = true;
        }
        if (p.workspace_b_id === wsId) {
          newB = newB.map(s => s.id === stationId ? { ...s, name: updatedStation.name, city: updatedStation.city, phone: updatedStation.phone } : s);
          isChanged = true;
        }
        return isChanged ? { ...p, workspace_a_stations: newA, workspace_b_stations: newB } : p;
      });
      try {
        localStorage.setItem('alittihadia_manager_partnerships_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    // Record permanent operation audit log
    const stationAudit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-st-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: wsId,
      team_id: wsId,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المدير',
      action: 'UPDATE',
      table_name: 'stations',
      record_id: stationId,
      reason: `✏️ قام المدير [${currentUser?.name || 'المدير'}] بتعديل بيانات محطة [${updatedStation.name}] (${updatedStation.city}) - الهاتف: ${updatedStation.phone || 'غير محدد'}`,
      old_data: { name: existing.name, city: existing.city, phone: existing.phone },
      new_data: { name: updatedStation.name, city: updatedStation.city, phone: updatedStation.phone },
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [stationAudit, ...prev]);

    pushNotification({
      workspace_id: wsId,
      target_station_id: stationId,
      target_role: 'all',
      title: `✏️ تم تحديث اسم/بيانات محطة "${updatedStation.name}"`,
      message: `تم تعميم الاسم الجديد "${updatedStation.name}" في جميع صفحات التطبيق وغرفة الشراكة`,
      type: 'station',
    });

    showToast(`تم تحديث بيانات محطة "${updatedStation.name}" وتعميمها على جميع الصفحات والشركاء بنجاح`, 'success');
    return { success: true };
  };

  const deleteStation = async (stationId: string): Promise<{ success: boolean; error?: string }> => {
    if (userRole !== 'owner' && userRole !== 'admin') {
      const msg = 'المدير فقط هو مول محطاتو وهو المخول بمسح المحطة من الإعدادات';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    const wsId = currentWorkspace?.id || 'ws-default';
    const targetStation = stations.find(s => s.id === stationId);

    // 1. تسجيل المحطة في قائمة المحطات المحذوفة رسمياً لتجميد وإيقاف أي عملية عليها فوراً
    setDeletedStationIds(prev => {
      const next = Array.from(new Set([...prev, stationId]));
      try {
        localStorage.setItem('aman_deleted_station_ids', JSON.stringify(next));
      } catch {}
      return next;
    });

    // 2. إزالة المحطة من قائمة المحطات النشطة وتصفير التحديد إذا كانت هي المحددة
    setStations(prev => {
      const next = prev.filter(s => s.id !== stationId);
      if (selectedStationId === stationId) {
        setSelectedStationId(next[0]?.id || null);
      }
      return next;
    });

    // 3. فك ارتباط وإزالة جميع العمال المعينين في هذه المحطة فوراً وإخراجهم (والعامل ديالها يخرج)
    const workersAtThisStation = stationWorkers.filter(sw => sw.station_id === stationId);
    const membersAtThisStation = workspaceMembers.filter(m => m.station_id === stationId && m.role === 'worker');
    setStationWorkers(prev => prev.filter(sw => sw.station_id !== stationId));

    setWorkspaceMembers(prev =>
      prev.filter(m => !(m.station_id === stationId && m.role === 'worker'))
    );

    // تسجيل العمال المحذوفين أو المعطلين محلياً ومسح بيانات دخولهم لطردهم فوراً في جميع التبويبات والأجهزة
    try {
      const revokedMap = JSON.parse(localStorage.getItem('alittihadia_revoked_accounts_v1') || '{}');
      const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
      const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');

      for (const sw of workersAtThisStation) {
        if (sw.user_id) revokedMap[sw.user_id] = true;
      }
      for (const wm of membersAtThisStation) {
        if (wm.user_id) revokedMap[wm.user_id] = true;
        const p = cleanPhoneNumber(wm.profile?.phone || wm.phone || '');
        if (p) {
          revokedMap[p] = true;
          delete localAccounts[p];
          delete tempMap[p];
        }
      }
      localStorage.setItem('alittihadia_revoked_accounts_v1', JSON.stringify(revokedMap));
      localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
      localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
    } catch {}

    // 4. Remove deleted station from local partnerships cache & registeredManagersNetwork so it vanishes from Collaboration Room everywhere
    setManagerPartnerships(prev => {
      const next = prev.map(p => {
        let isChanged = false;
        let newA = p.workspace_a_stations || [];
        let newB = p.workspace_b_stations || [];
        if (p.workspace_a_id === wsId) {
          newA = newA.filter(s => s.id !== stationId);
          isChanged = true;
        }
        if (p.workspace_b_id === wsId) {
          newB = newB.filter(s => s.id !== stationId);
          isChanged = true;
        }
        return isChanged ? { ...p, workspace_a_stations: newA, workspace_b_stations: newB } : p;
      });
      try {
        localStorage.setItem('alittihadia_manager_partnerships_v1', JSON.stringify(next));
      } catch {}
      return next;
    });

    setRegisteredManagersNetwork(prev =>
      prev.map(net =>
        net.workspaceId === wsId
          ? { ...net, stations: (net.stations || []).filter(st => st.id !== stationId) }
          : net
      )
    );

    // Record permanent operation audit log
    const delStationAudit: AuditLogEntry = {
      id: isSupabaseConfigured() ? generateUUID() : `audit-del-st-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      workspace_id: wsId,
      team_id: wsId,
      user_id: currentUser?.id || null,
      user_name: currentUser?.name || 'المدير',
      action: 'DELETE',
      table_name: 'stations',
      record_id: stationId,
      reason: `🗑️ قام المدير [${currentUser?.name || 'المدير'}] بحذف محطة [${targetStation?.name || stationId}] (${targetStation?.city || ''}) وإيقاف كافة عملياتها وعمالها وإزالتها من غرفة الشراكة نهائياً`,
      old_data: { name: targetStation?.name, city: targetStation?.city, phone: targetStation?.phone },
      new_data: null,
      created_at: new Date().toISOString(),
    };
    setAuditLogs(prev => [delStationAudit, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(wsId) && isValidUUID(stationId)) {
      try {
        await supabase.from('stations').delete().eq('id', stationId).eq('workspace_id', wsId);
      } catch {}
    }

    // Sync deletion to Firebase Firestore and remove from all partnerships & worker accounts in real-time
    if (firebaseSyncService.isAvailable()) {
      firebaseSyncService.deleteStation(wsId, stationId).catch(err => {
        console.warn('Firebase station delete error:', err);
      });
      firebaseSyncService.updateStationInPartnerships(wsId, stationId, null).catch(() => {});
      for (const wm of membersAtThisStation) {
        firebaseSyncService.deleteWorkspaceMember(wsId, wm.user_id).catch(() => {});
        const p = cleanPhoneNumber(wm.profile?.phone || wm.phone || '');
        if (p) firebaseSyncService.revokeUserAccount(p, wm.user_id).catch(() => {});
      }
      firebaseSyncService.logPlatformActivity({
        workspace_id: wsId,
        workspace_name: currentWorkspace?.name || 'Sahara Express',
        actor_id: currentUser?.id || 'sys',
        action_type: 'STATION_DELETE',
        action_title: `🗑️ تم مسح محطة: [${targetStation?.name || stationId}] وتجميد جميع عملياتها وعمالها بواسطة المدير ${currentUser?.name || ''}`,
        actor_name: currentUser?.name || 'المدير',
        actor_role: userRole,
        details: `حذف المحطة نهائياً وتجميد أي عامل مرتبط بها: ${targetStation?.name || ''} (${targetStation?.city || ''})`,
      }).catch(() => {});
    }

    pushNotification({
      workspace_id: wsId,
      target_role: 'all',
      title: `🗑️ تم حذف محطة "${targetStation?.name || ''}" نهائياً`,
      message: `تم مسح المحطة من عند المدير، العمال، وجميع الشركاء في غرفة الشراكة`,
      type: 'station',
    });

    showToast(`تم حذف محطة "${targetStation?.name || ''}" من جميع الصفحات والعمال وغرفة الشراكة نهائياً`, 'info');
    return { success: true };
  };

  const assignWorkerToStation = async (stationId: string, userId: string): Promise<{ success: boolean; error?: string }> => {
    const writeCheck = checkWriteAllowed();
    if (!writeCheck.allowed) return { success: false, error: writeCheck.error };

    if (userRole !== 'owner' && userRole !== 'admin') {
      const msg = 'المدير فقط هو المخول بتعيين العمال من الإعدادات';
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

    // Enforce max 2 workers in الباك الأول (149 درهم: 2 محطات + 2 عمال)
    if (isPlan2TwoStations) {
      const targetWorker = workspaceMembers.find(m => m.user_id === userId);
      const isTargetReal = !targetWorker?.is_demo;
      const otherWorkers = visibleWorkspaceMembers.filter(
        m =>
          m.role === 'worker' &&
          m.user_id !== userId &&
          (isTargetReal ? !m.is_demo : true)
      );
      if (otherWorkers.length >= 2) {
        const msg = 'تم بلوغ الحد الأقصى للعمال في الباك الأول (149 درهم = 2 محطات + 2 عمال).';
        showToast(msg, 'error');
        return { success: false, error: msg };
      }
    }

    setStationWorkers(prev => {
      const filtered = prev.filter(w => !(w.user_id === userId && (!w.workspace_id || w.workspace_id === wsId)));
      return [...filtered, { station_id: stationId, workspace_id: wsId, user_id: userId, assigned_at: new Date().toISOString() }];
    });

    const existingMember = workspaceMembers.find(m => m.user_id === userId && (!m.workspace_id || m.workspace_id === wsId));
    setWorkspaceMembers(prev =>
      prev.map(m =>
        m.user_id === userId && (!m.workspace_id || m.workspace_id === wsId)
          ? { ...m, station_id: stationId }
          : m
      )
    );

    if (firebaseSyncService.isAvailable() && existingMember) {
      const updatedMember: WorkspaceMember = { ...existingMember, station_id: stationId };
      firebaseSyncService.syncWorkspaceMember(wsId, updatedMember).catch(() => {});
      const workerPhone = cleanPhoneNumber(existingMember.profile?.phone || existingMember.phone || '');
      if (workerPhone) {
        firebaseSyncService
          .getUserAccount(workerPhone)
          .then(existingAcc => {
            if (existingAcc) {
              firebaseSyncService
                .saveUserAccount(workerPhone, {
                  ...existingAcc,
                  station_id: stationId,
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      }
    }

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

    if (userRole !== 'owner' && userRole !== 'admin' && userRole !== 'platform_owner') {
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

  // Platform Owner Controls: Update Subscription via Firestore & server-side RPC
  const updateWorkspaceSubscription = async (
    workspaceId: string, 
    action: 'activate' | 'extend' | 'suspend' | 'decrease' | 'set_date', 
    months: number = 1,
    options?: { days?: number; exactEndDate?: string }
  ) => {
    if (!isPlatformOwner && !checkIsMasterAccount(currentUser, currentWorkspace)) {
      return { success: false, error: 'هذه الصلاحية خاصة بمالك التطبيق فقط' };
    }
    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(workspaceId) && (action === 'activate' || action === 'extend' || action === 'suspend')) {
      const { data: rpcRes, error } = await supabase.rpc('rpc_platform_update_subscription', {
        p_workspace_id: workspaceId,
        p_action: action,
        p_months: months
      });
      if (!error && rpcRes?.success) {
        await refreshPlatformWorkspaces();
        if (currentWorkspace?.id === workspaceId && rpcRes?.subscription) {
          setSubscription({ ...rpcRes.subscription, team_id: workspaceId });
        }
      }
    }

    const existingSub = allSubscriptionsState.find((s: Subscription) => s.workspace_id === workspaceId);
    const existingWs = allWorkspacesState.find((w: Workspace) => w.id === workspaceId);
    const now = new Date();
    const baseEndStr = existingWs?.subscription_end_date || existingSub?.end_date;
    let newEndDate = baseEndStr && new Date(baseEndStr).getTime() > now.getTime()
      ? new Date(baseEndStr)
      : new Date();

    if (action === 'set_date' && options?.exactEndDate) {
      newEndDate = new Date(options.exactEndDate);
    } else if (action === 'extend' || action === 'activate') {
      if (options?.days && options.days > 0) {
        newEndDate = new Date(newEndDate.getTime() + options.days * 86400000);
      } else if (months < 1) {
        // Fractional months e.g. 0.25 = 7 days
        const daysToAdd = Math.max(1, Math.round(months * 30));
        newEndDate = new Date(newEndDate.getTime() + daysToAdd * 86400000);
      } else {
        newEndDate.setMonth(newEndDate.getMonth() + Math.round(months));
      }
    } else if (action === 'decrease') {
      if (options?.days && options.days > 0) {
        newEndDate = new Date(newEndDate.getTime() - options.days * 86400000);
      } else {
        const monthsToSub = months || 1;
        newEndDate.setMonth(newEndDate.getMonth() - Math.round(monthsToSub));
      }
    }

    const newStatus: 'active' | 'suspended' = action === 'suspend' ? 'suspended' : 'active';
    const newEndIso = newEndDate.toISOString();

    const updatedSub: Subscription = {
      id: existingSub?.id || `sub-${workspaceId}`,
      workspace_id: workspaceId,
      team_id: workspaceId,
      status: newStatus,
      start_date: existingSub?.start_date || now.toISOString(),
      end_date: newEndIso,
      is_trial: false,
      created_at: existingSub?.created_at || now.toISOString(),
    };

    setAllSubscriptionsState(prev => {
      const next = prev.filter(s => s.workspace_id !== workspaceId).concat(updatedSub);
      localStorage.setItem('alittihadia_all_subscriptions', JSON.stringify(next));
      return next;
    });

    setAllWorkspacesState(prev => {
      const next = prev.map(ws =>
        ws.id === workspaceId
          ? { ...ws, subscription_status: newStatus, subscription_end_date: newEndIso }
          : ws
      );
      localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
      return next;
    });

    if (currentWorkspace?.id === workspaceId) {
      setSubscription(updatedSub);
      localStorage.setItem('aman_subscription', JSON.stringify(updatedSub));
      const updatedWs: Workspace = {
        ...currentWorkspace,
        subscription_end_date: newEndIso,
        subscription_status: newStatus,
      };
      setCurrentWorkspace(updatedWs);
    }

    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.updateWorkspaceFieldsInCloud(workspaceId, {
        subscription_status: newStatus,
        subscription_end_date: newEndIso,
      });
    }

    return { success: true };
  };

  // Platform Owner Controls: Update Workspace Notes via Firestore & server-side RPC
  const updateWorkspaceNotes = async (workspaceId: string, notes: string) => {
    if (!isPlatformOwner && !checkIsMasterAccount(currentUser, currentWorkspace)) {
      return { success: false, error: 'هذه الصلاحية خاصة بمالك التطبيق فقط' };
    }
    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(workspaceId)) {
      await supabase.rpc('rpc_platform_update_subscription', {
        p_workspace_id: workspaceId,
        p_action: 'update_meta',
        p_admin_notes: notes
      });
    }

    setAllWorkspacesState(prev => {
      const next = prev.map(ws => ws.id === workspaceId ? { ...ws, admin_notes: notes } : ws);
      localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
      return next;
    });
    if (currentWorkspace?.id === workspaceId) {
      setCurrentWorkspace(prev => prev ? { ...prev, admin_notes: notes } : null);
    }
    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.updateWorkspaceFieldsInCloud(workspaceId, {
        admin_notes: notes,
      });
    }
    return { success: true };
  };

  // Platform Owner Controls: Update Workspace Quotas & Plan via Firestore & server-side RPC
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
    if (!isPlatformOwner && !checkIsMasterAccount(currentUser, currentWorkspace)) {
      return { success: false, error: 'هذه الصلاحية خاصة بمالك التطبيق فقط' };
    }
    const supabase = getSupabaseClient();
    if (supabase && isValidUUID(workspaceId)) {
      await supabase.rpc('rpc_platform_update_subscription', {
        p_workspace_id: workspaceId,
        p_action: 'update_meta',
        p_max_workers: quotas.max_workers,
        p_max_stations: quotas.max_stations,
        p_max_collaborations: quotas.max_collaborations,
        p_plan_name: quotas.plan_name || 'الباك الثاني (299 درهم — الباقة الشاملة)'
      });
    }

    const nextTier = quotas.plan_tier || (quotas.max_stations === 2 ? 'plan_2_two_stations' : 'plan_1_full');
    const nextPlanName =
      quotas.plan_name ||
      (nextTier === 'plan_2_two_stations'
        ? 'الباك الأول (149 درهم — محطتين وعامل لكل محطة)'
        : 'الباك الثاني (299 درهم — محطات وعمال غير محدودين)');

    setAllWorkspacesState(prev => {
      const next = prev.map(ws => ws.id === workspaceId ? {
        ...ws,
        plan_tier: nextTier,
        max_workers: quotas.max_workers,
        max_stations: quotas.max_stations,
        max_workers_per_station: quotas.max_workers_per_station ?? (quotas.max_stations === 2 ? 1 : 99),
        max_collaborations: quotas.max_collaborations,
        plan_name: nextPlanName
      } : ws);
      localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
      return next;
    });

    if (currentWorkspace?.id === workspaceId) {
      setCurrentWorkspace(prev => prev ? {
        ...prev,
        plan_tier: nextTier,
        max_workers: quotas.max_workers,
        max_stations: quotas.max_stations,
        max_workers_per_station: quotas.max_workers_per_station ?? (quotas.max_stations === 2 ? 1 : 99),
        max_collaborations: quotas.max_collaborations,
        plan_name: nextPlanName
      } : null);
    }

    // Sync plan_tier change to Firebase Firestore for ANY workspaceId
    if (firebaseSyncService.isAvailable()) {
      await firebaseSyncService.updateWorkspaceFieldsInCloud(workspaceId, {
        plan_tier: nextTier,
        max_workers: quotas.max_workers,
        max_stations: quotas.max_stations,
        max_workers_per_station: quotas.max_workers_per_station ?? (quotas.max_stations === 2 ? 1 : 99),
        max_collaborations: quotas.max_collaborations,
        plan_name: nextPlanName,
      });
    }
    return { success: true };
  };

  // Switch between الباك الأول (149 درهم: محطتين + عامل لكل محطة + لوغو التطبيق) and الباك الثاني (299 درهم: محطات وعمال غير محدودين + لوغو خاص)
  const switchWorkspacePlan = async (
    planTier: 'plan_1_full' | 'plan_2_two_stations',
    targetWorkspaceId?: string
  ) => {
    if (!isPlatformOwner && !checkIsMasterAccount(currentUser, currentWorkspace)) {
      showToast('لتغيير أو ترقية باقتك، يرجى التواصل مع إدارة التطبيق عبر واتساب لتفعيل الباقة.', 'info');
      return { success: false, error: 'هذه الصلاحية خاصة بمالك التطبيق فقط' };
    }
    const wsId = targetWorkspaceId || currentWorkspace?.id;
    if (!wsId) return { success: false, error: 'لا توجد مساحة عمل نشطة' };

    const isBasic149 = planTier === 'plan_2_two_stations';
    const res = await updateWorkspaceQuotas(wsId, {
      plan_tier: planTier,
      plan_name: isBasic149
        ? 'الباك الأول (149 درهم): 2 محطات + 2 عمال + التيكيت بسمية التطبيق'
        : 'الباك الثاني (299 درهم): بزاف ديال المحطات والعمال + التيكيت بسميتو',
      max_stations: isBasic149 ? 2 : 99,
      max_workers: isBasic149 ? 2 : 99,
      max_workers_per_station: isBasic149 ? 2 : 99,
      max_collaborations: isBasic149 ? 5 : 99,
    });

    if (res.success) {
      showToast(
        isBasic149
          ? 'تم تفعيل الباك الأول (149 درهم): 2 محطات + 2 عمال + التيكيت يخرج بسمية التطبيق الرسمي'
          : 'تم تفعيل الباك الثاني (299 درهم): بزاف ديال المحطات والعمال + التيكيت يخرج بسميتك ولوغو وكالتك',
        'success'
      );
    }
    return res;
  };

  // Permanently delete a workspace, its subcollections (stations, parcels, trips, transactions, members, activity_logs) and its users from Firebase Firestore
  const deleteWorkspaceFromPlatform = async (
    workspaceId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isPlatformOwner && !checkIsMasterAccount(currentUser, currentWorkspace)) {
      return { success: false, error: 'هذه الصلاحية خاصة بمالك التطبيق فقط' };
    }
    if (!workspaceId) {
      return { success: false, error: 'معرف الشركة غير صالح' };
    }
    if (currentWorkspace?.id === workspaceId) {
      return {
        success: false,
        error: 'لا يمكنك حذف مساحة العمل الرئيسية الخاصة بك التي أنت مسجل الدخول إليها حالياً',
      };
    }

    const targetWs = allWorkspacesState.find((w) => w.id === workspaceId);

    try {
      if (firebaseSyncService.isAvailable()) {
        await firebaseSyncService.deleteWorkspaceCompletelyFromCloud(
          workspaceId,
          targetWs?.owner_phone
        );
      }

      setAllWorkspacesState((prev) => {
        const next = prev.filter((w) => w.id !== workspaceId);
        localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
        return next;
      });

      setAllSubscriptionsState((prev) => {
        const next = prev.filter((s) => s.workspace_id !== workspaceId);
        localStorage.setItem('alittihadia_all_subscriptions', JSON.stringify(next));
        return next;
      });

      showToast(
        `🗑️ تم حذف شركة "${targetWs?.name || workspaceId}" وحساب مديرها وجميع بياناتها من Firebase نهائياً`,
        'info'
      );
      return { success: true };
    } catch (err: any) {
      console.error('deleteWorkspaceFromPlatform error:', err);
      return {
        success: false,
        error: err?.message || 'تعذر حذف الشركة من Firebase Firestore',
      };
    }
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

  // ============================================================================
  // REGISTRATION EMAIL OTP (6 Digits + 10-Min Expiry + Resend API)
  // ============================================================================
  const getLocalRegOtpRecord = (emailKey: string) => {
    try {
      const map = JSON.parse(localStorage.getItem('alittihadia_reg_otps_v1') || '{}');
      return map[emailKey] || null;
    } catch {
      return null;
    }
  };

  const saveLocalRegOtpRecord = (emailKey: string, record: any) => {
    try {
      const map = JSON.parse(localStorage.getItem('alittihadia_reg_otps_v1') || '{}');
      map[emailKey] = record;
      localStorage.setItem('alittihadia_reg_otps_v1', JSON.stringify(map));
    } catch {}
  };

  const sendRegistrationEmailOtp = async (email: string, userName?: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'يرجى إدخال عنوان بريد إلكتروني صحيح' };
    }
    try {
      const endpoints = ['/api/register', '/api/send-otp', '/api/auth/register/send-email-otp'];
      let res: Response | null = null;
      let rawText = '';
      let data: any = null;

      for (const endpoint of endpoints) {
        try {
          const candidateRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: cleanEmail, userName }),
          });
          const candidateText = await candidateRes.text();
          res = candidateRes;
          rawText = candidateText;
          try {
            const parsed = candidateText ? JSON.parse(candidateText) : null;
            if (parsed && typeof parsed === 'object') {
              data = parsed;
              break;
            }
          } catch {}
        } catch {}
      }

      if (!data) {
        console.error('[Registration OTP Non-JSON Response]:', res?.status, rawText);
        return {
          success: false,
          error: `تعذر الاتصال بخادم البريد (HTTP ${res?.status || 500} - استجابة غير صالحة). تأكد من عمل git push / Redeploy لآخر تحديث في Vercel وإضافة RESEND_API_KEY.`,
        };
      }

      if (!res?.ok || !data.success) {
        return {
          success: false,
          error: data?.error || 'تعذر إرسال كود التحقق إلى البريد الإلكتروني',
          cooldownSeconds: data?.cooldownSeconds,
        };
      }

      if (data.otpRecord) {
        saveLocalRegOtpRecord(cleanEmail, data.otpRecord);
      }

      return {
        success: true,
        expiresAtMs: data.expiresAtMs,
        cooldownSeconds: data.cooldownSeconds,
        previewCode: data.previewCode,
        deliveredViaGmail: Boolean(data.deliveredViaGmail),
      };
    } catch (err: any) {
      console.error('[Registration Send Email OTP Client Error]:', err);
      return { success: false, error: err?.message || 'حدث خطأ في الاتصال بالخادم' };
    }
  };

  const verifyRegistrationEmailOtp = async (email: string, otpCode: string) => {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanCode = String(otpCode || '').trim().replace(/\s+/g, '');
    if (!cleanEmail || !/^\d{6}$/.test(cleanCode)) {
      return { success: false, error: 'يرجى إدخال كود التحقق المكون من 6 أرقام كاملاً' };
    }
    try {
      const savedOtpRecord = getLocalRegOtpRecord(cleanEmail);
      const endpoints = ['/api/register', '/api/auth/register/verify-email-otp', '/api/index'];
      let res: Response | null = null;
      let rawText = '';
      let data: any = null;

      for (const endpoint of endpoints) {
        try {
          const candidateRes = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: cleanEmail,
              otpCode: cleanCode,
              otpRecord: savedOtpRecord || undefined,
            }),
          });
          const candidateText = await candidateRes.text();
          res = candidateRes;
          rawText = candidateText;
          try {
            const parsed = candidateText ? JSON.parse(candidateText) : null;
            if (parsed && typeof parsed === 'object') {
              data = parsed;
              break;
            }
          } catch {}
        } catch {}
      }

      if (!data) {
        console.error('[Registration Verify Non-JSON Response]:', res?.status, rawText);
        return { success: false, error: 'تعذر التحقق من الكود حالياً (استجابة غير صالحة من السيرفر)' };
      }

      if (!res?.ok || !data.success) {
        if (savedOtpRecord && typeof data?.attempts === 'number') {
          saveLocalRegOtpRecord(cleanEmail, {
            ...savedOtpRecord,
            attempts: data.attempts,
          });
        }
        return {
          success: false,
          error: data?.error || 'كود التحقق غير صحيح أو منتهي الصلاحية',
          remainingAttempts: data?.remainingAttempts,
        };
      }
      return { success: true };
    } catch (err: any) {
      console.error('[Registration Verify Email OTP Client Error]:', err);
      return { success: false, error: err?.message || 'حدث خطأ أثناء التحقق من الكود' };
    }
  };

  // ============================================================================
  // MULTI-USER EMAIL 6-DIGIT HASHED OTP PASSWORD RECOVERY (10-MIN EXPIRY)
  // ============================================================================
  const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes expiration
  const OTP_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown between sends
  const OTP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes rate limit window
  const OTP_MAX_SENDS = 3; // Max 3 sends per 10 minutes
  const OTP_MAX_ATTEMPTS = 5; // Max 5 verification attempts per code

  const resolveMultiUserAccountByWhatsapp = async (inputWhatsappOrPhoneOrEmail: string) => {
    const rawInput = String(inputWhatsappOrPhoneOrEmail || '').trim();
    const isEmail = rawInput.includes('@');
    const lowerEmail = isEmail ? rawInput.toLowerCase() : '';
    const canonicalInput = isEmail ? '' : cleanPhoneNumber(rawInput);

    if (!isEmail && (!canonicalInput || canonicalInput.length < 8)) {
      return null;
    }

    // 1. Check Firebase Firestore Cloud Accounts (works across all devices & users)
    if (firebaseSyncService.isAvailable()) {
      const cloudAcc = await firebaseSyncService.findUserAccountByIdentifier(rawInput);
      if (cloudAcc) {
        const acctPhone = cleanPhoneNumber(cloudAcc.phone) || cloudAcc.phone || '00000000';
        const acctWhatsapp = cleanPhoneNumber(cloudAcc.whatsapp_number || cloudAcc.phone) || acctPhone;
        return {
          phone: acctPhone,
          whatsapp: acctWhatsapp,
          email: cloudAcc.email,
          name: cloudAcc.name || 'مستخدم Sahara Express',
          role: cloudAcc.role || 'owner',
          revoked: Boolean(cloudAcc.deleted || cloudAcc.status === 'revoked'),
          cloudAccount: cloudAcc,
        };
      }
    }

    // 2. Check Local Accounts Map (alittihadia_local_accounts_v1)
    try {
      const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
      for (const [phoneKey, acc] of Object.entries<any>(localAccounts)) {
        const cleanKey = cleanPhoneNumber(phoneKey);
        const cleanAccPhone = cleanPhoneNumber(acc?.phone || phoneKey);
        const cleanAccWa = cleanPhoneNumber(acc?.whatsapp_number || acc?.phone || phoneKey);
        const cleanAccEmail = (acc?.email || '').toLowerCase().trim();

        const match =
          (isEmail && cleanAccEmail === lowerEmail) ||
          (!isEmail && (cleanKey === canonicalInput || cleanAccPhone === canonicalInput || cleanAccWa === canonicalInput));

        if (match) {
          return {
            phone: cleanAccPhone || phoneKey,
            whatsapp: cleanAccWa || cleanAccPhone || phoneKey,
            email: acc?.email,
            name: acc?.name || 'مستخدم Sahara Express',
            role: acc?.isOwner ? ('owner' as const) : ('worker' as const),
            revoked: isAccountRevokedLocally(acc?.id, cleanAccPhone),
            cloudAccount: null,
          };
        }
      }
    } catch {}

    // 3. Check Workspace Members (Managers & Workers)
    const matchedMember = workspaceMembers.find(m => {
      const mEmail = (m.profile?.email || '').toLowerCase().trim();
      const mPhone = cleanPhoneNumber(m.profile?.phone || m.phone || '');
      const mWa = cleanPhoneNumber(m.profile?.whatsapp_number || '');
      if (isEmail) return mEmail === lowerEmail;
      return mPhone === canonicalInput || mWa === canonicalInput;
    });
    if (matchedMember) {
      const mPhone = cleanPhoneNumber(matchedMember.profile?.phone || matchedMember.phone || '') || matchedMember.user_id;
      const mWa = cleanPhoneNumber(matchedMember.profile?.whatsapp_number || '') || mPhone;
      return {
        phone: mPhone,
        whatsapp: mWa,
        email: matchedMember.profile?.email,
        name: matchedMember.profile?.name || 'مستخدم Sahara Express',
        role: matchedMember.role === 'worker' ? ('worker' as const) : ('owner' as const),
        revoked: matchedMember.status !== 'active' || isAccountRevokedLocally(matchedMember.user_id, mPhone),
        cloudAccount: null,
      };
    }

    // 4. Check All Workspaces Owner Phone / WhatsApp / Name
    const matchedWs = allWorkspacesState.find(ws => {
      const oPhone = cleanPhoneNumber(ws.owner_phone || '');
      const oWa = cleanPhoneNumber(ws.owner_whatsapp || '');
      if (isEmail) return false;
      return oPhone === canonicalInput || oWa === canonicalInput;
    });
    if (matchedWs) {
      const oPhone = cleanPhoneNumber(matchedWs.owner_phone || '') || canonicalInput;
      const oWa = cleanPhoneNumber(matchedWs.owner_whatsapp || '') || oPhone;
      return {
        phone: oPhone,
        whatsapp: oWa,
        email: undefined,
        name: matchedWs.name || 'مدير المحطة',
        role: 'owner' as const,
        revoked: false,
        cloudAccount: null,
      };
    }

    return null;
  };

  const getLocalOtpRecord = (phoneKey: string) => {
    try {
      const map = JSON.parse(localStorage.getItem('alittihadia_password_reset_otps_v1') || '{}');
      return map[phoneKey] || null;
    } catch {
      return null;
    }
  };

  const saveLocalOtpRecord = (phoneKey: string, record: any) => {
    try {
      const map = JSON.parse(localStorage.getItem('alittihadia_password_reset_otps_v1') || '{}');
      map[phoneKey] = record;
      localStorage.setItem('alittihadia_password_reset_otps_v1', JSON.stringify(map));
    } catch {}
  };

  const requestWhatsAppOtp = async (whatsappOrPhone: string) => {
    const rawInput = String(whatsappOrPhone || '').trim();
    if (!rawInput || (rawInput.length < 5 && !rawInput.includes('@'))) {
      return {
        success: false,
        error: 'يرجى إدخال رقم الهاتف المسجل بالحساب أو البريد الإلكتروني',
      };
    }

    // 1. Find the multi-user account registered with this phone number or email
    const resolvedAccount = await resolveMultiUserAccountByWhatsapp(rawInput);
    if (!resolvedAccount) {
      return {
        success: false,
        error: 'لم يتم العثور على أي حساب مسجل بهذا الرقم أو البريد الإلكتروني. تأكد من صحة البيانات.',
      };
    }

    if (resolvedAccount.revoked) {
      return {
        success: false,
        error: 'تم إيقاف أو حذف هذا الحساب من طرف مدير المحطة. لا يمكن استعادة كلمة المرور.',
      };
    }

    const targetPhone = resolvedAccount.phone;
    const targetWhatsapp = resolvedAccount.whatsapp || resolvedAccount.phone;
    const targetEmail = (resolvedAccount.email || (rawInput.includes('@') ? rawInput : '')).trim().toLowerCase();

    if (!targetEmail || !targetEmail.includes('@')) {
      return {
        success: false,
        error: 'هذا الحساب لا يتوفر على بريد إلكتروني مسجل لاستلام رمز التحقق.',
      };
    }

    const nowMs = Date.now();

    // 2. Load existing OTP & Rate Limit state from Database (Firestore + Local)
    let existingRecord: any = getLocalOtpRecord(targetPhone);
    if (firebaseSyncService.isAvailable()) {
      const cloudOtp = await firebaseSyncService.getPasswordResetOtp(targetPhone);
      if (cloudOtp) {
        if (!existingRecord || (cloudOtp.last_sent_ms || 0) >= (existingRecord.last_sent_ms || 0)) {
          existingRecord = cloudOtp;
        }
      }
    }

    // 3. Enforce Rate Limit locally/DB before sending (3 sends per 10 minutes)
    if (existingRecord) {
      const lastSentMs = Number(existingRecord.last_sent_ms || 0);
      const windowStartMs = Number(existingRecord.window_start_ms || 0);
      const windowExpired = !windowStartMs || nowMs - windowStartMs >= OTP_WINDOW_MS;
      const sendCount = windowExpired ? 0 : Number(existingRecord.send_count || 0);

      // Cooldown check (60 seconds between sends)
      if (lastSentMs && nowMs - lastSentMs < OTP_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_COOLDOWN_MS - (nowMs - lastSentMs)) / 1000);
        return {
          success: false,
          rateLimited: true,
          cooldownSeconds: waitSec,
          retryAfterSeconds: waitSec,
          remainingSends: Math.max(0, OTP_MAX_SENDS - sendCount),
          maxSendsPerWindow: OTP_MAX_SENDS,
          error: `يرجى الانتظار ${waitSec} ثانية قبل طلب إرسال رمز تحقق جديد.`,
        };
      }

      // Window quota check (max 3 OTP requests per 10 minutes)
      if (sendCount >= OTP_MAX_SENDS) {
        const retryAfterSec = Math.max(1, Math.ceil((OTP_WINDOW_MS - (nowMs - windowStartMs)) / 1000));
        const mins = Math.ceil(retryAfterSec / 60);
        return {
          success: false,
          rateLimited: true,
          retryAfterSeconds: retryAfterSec,
          remainingSends: 0,
          maxSendsPerWindow: OTP_MAX_SENDS,
          error: `تم تجاوز الحد المسموح (${OTP_MAX_SENDS} رسائل كل 10 دقائق لحماية الحساب). يرجى المحاولة بعد ${mins} دقيقة.`,
        };
      }
    }

    // 4. Call Server Endpoint (generates 6-digit OTP, stores hash, sends via Resend/Brevo API)
    try {
      const response = await fetch('/api/auth/forgot-password/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhone,
          targetEmail,
          userName: resolvedAccount.name,
          existingRateState: existingRecord || null,
        }),
      });

      const rawText = await response.text();
      let data: any = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = null;
      }

      if (!response.ok || !data?.success) {
        return {
          success: false,
          rateLimited: Boolean(data?.rateLimited),
          retryAfterSeconds: data?.retryAfterSeconds,
          cooldownSeconds: data?.cooldownSeconds,
          error: data?.error || 'تعذر إرسال رمز التحقق إلى البريد الإلكتروني',
        };
      }

      const otpRecord = data.otpRecord;
      const deliveredViaGmail = Boolean(data.deliveredViaGmail);
      const cooldownSeconds = Number(data.cooldownSeconds || 60);
      const remainingSends = Number(data.remainingSends ?? 2);

      // 5. Persist hashed OTP record & 10-minute expiration in Database (Firestore + Local)
      if (otpRecord) {
        saveLocalOtpRecord(targetPhone, otpRecord);
        if (firebaseSyncService.isAvailable()) {
          await firebaseSyncService.savePasswordResetOtp(targetPhone, otpRecord);
        }
      }

      return {
        success: true,
        expiresAtMs: Number(otpRecord?.expires_at_ms || Date.now() + OTP_TTL_MS),
        cooldownSeconds,
        remainingSends,
        maxSendsPerWindow: OTP_MAX_SENDS,
        targetPhone,
        targetWhatsapp,
        targetEmail,
        userName: resolvedAccount.name,
        userRoleLabel: resolvedAccount.role === 'worker' ? 'موظف محطة' : 'مدير / مالك المحطة',
        deliveredViaGmail,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'تعذر الاتصال بخادم البريد لإرسال رمز التحقق',
      };
    }
  };

  const verifyWhatsAppOtpCode = async (whatsappOrPhone: string, otpCode: string) => {
    const cleanCode = String(otpCode || '').trim().replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanCode)) {
      return {
        success: false,
        error: 'يرجى إدخال رمز التحقق المكون من 6 أرقام كاملاً',
      };
    }

    const resolvedAccount = await resolveMultiUserAccountByWhatsapp(whatsappOrPhone);
    const targetPhone = resolvedAccount?.phone || cleanPhoneNumber(whatsappOrPhone);
    const targetEmail = (resolvedAccount?.email || (whatsappOrPhone.includes('@') ? whatsappOrPhone : '')).trim().toLowerCase();
    if (!targetPhone && !targetEmail) {
      return { success: false, error: 'بيانات الحساب غير صالحة' };
    }

    // 1. Load hashed OTP record from Firestore Database + Local
    let record: any = null;
    if (firebaseSyncService.isAvailable() && targetPhone) {
      record = await firebaseSyncService.getPasswordResetOtp(targetPhone);
    }
    const localRec = targetPhone ? getLocalOtpRecord(targetPhone) : null;
    if (!record || (localRec && (localRec.last_sent_ms || 0) > (record.last_sent_ms || 0))) {
      record = localRec;
    }

    // 2. Verify OTP on the server against the HMAC-SHA256 hash
    try {
      const verifyResponse = await fetch('/api/auth/forgot-password/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhone,
          email: targetEmail,
          otpCode: cleanCode,
          otpRecord: record || undefined,
        }),
      });

      const verifyData: any = await verifyResponse.json().catch(() => null);

      if (!verifyResponse.ok || !verifyData?.success) {
        const nextAttempts = Number(verifyData?.attempts || (Number(record?.attempts || 0) + 1));
        const remaining =
          typeof verifyData?.remainingAttempts === 'number'
            ? verifyData.remainingAttempts
            : Math.max(0, OTP_MAX_ATTEMPTS - nextAttempts);

        if (record && targetPhone) {
          const updatedRecord = {
            ...record,
            attempts: nextAttempts,
            updated_at: new Date().toISOString(),
          };
          saveLocalOtpRecord(targetPhone, updatedRecord);
          if (firebaseSyncService.isAvailable()) {
            await firebaseSyncService.savePasswordResetOtp(targetPhone, updatedRecord);
          }
        }

        return {
          success: false,
          expired: Boolean(verifyData?.expired),
          locked: Boolean(verifyData?.locked || remaining === 0),
          remainingAttempts: remaining,
          error: verifyData?.error || 'رمز التحقق غير صحيح أو منتهي الصلاحية',
        };
      }

      if (record && targetPhone) {
        const verifiedRecord = {
          ...record,
          verified: true,
          updated_at: new Date().toISOString(),
        };
        saveLocalOtpRecord(targetPhone, verifiedRecord);
        if (firebaseSyncService.isAvailable()) {
          await firebaseSyncService.savePasswordResetOtp(targetPhone, verifiedRecord);
        }
      }

      return {
        success: true,
        remainingAttempts: verifyData?.remainingAttempts ?? OTP_MAX_ATTEMPTS,
      };
    } catch {
      return {
        success: false,
        error: 'تعذر الاتصال بالخادم للتحقق من الرمز',
      };
    }
  };

  const resetPasswordWithWhatsAppOtp = async (
    whatsappOrPhone: string,
    otpCode: string,
    newPassword: string
  ) => {
    const cleanPwd = String(newPassword || '').trim();
    if (cleanPwd.length < 8) {
      return {
        success: false,
        error: 'كلمة المرور الجديدة يجب أن تتكون من 8 أحرف أو أرقام على الأقل',
      };
    }

    // 1. Verify OTP first (checks 6 digits, 5-min expiry, max attempts, not used)
    const verifyRes = await verifyWhatsAppOtpCode(whatsappOrPhone, otpCode);
    if (!verifyRes.success) {
      return {
        success: false,
        error: verifyRes.error || 'كود التحقق غير صالح أو منتهي الصلاحية',
      };
    }

    const resolvedAccount = await resolveMultiUserAccountByWhatsapp(whatsappOrPhone);
    if (!resolvedAccount) {
      return {
        success: false,
        error: 'لم يتم العثور على الحساب المرتبط بهذا الرقم',
      };
    }

    const targetPhone = resolvedAccount.phone;
    const nowIso = new Date().toISOString();

    // 2. Mark OTP as used in Database (Firestore + Server + Local) so it cannot be replayed
    const existingOtp = getLocalOtpRecord(targetPhone) || (firebaseSyncService.isAvailable() ? await firebaseSyncService.getPasswordResetOtp(targetPhone) : null);
    if (existingOtp) {
      const consumedRecord = {
        ...existingOtp,
        verified: true,
        used: true,
        updated_at: nowIso,
      };
      saveLocalOtpRecord(targetPhone, consumedRecord);
      if (firebaseSyncService.isAvailable()) {
        await firebaseSyncService.savePasswordResetOtp(targetPhone, consumedRecord);
      }
    }
    fetch('/api/auth/forgot-password/consume-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: targetPhone }),
    }).catch(() => {});

    // 3. Update User Password in Firestore Cloud Database (works across all devices)
    if (firebaseSyncService.isAvailable()) {
      const cloudAcc =
        resolvedAccount.cloudAccount || (await firebaseSyncService.findUserAccountByPhoneOrWhatsapp(targetPhone));
      if (cloudAcc) {
        await firebaseSyncService.saveUserAccount(targetPhone, {
          ...cloudAcc,
          phone: targetPhone,
          whatsapp_number: resolvedAccount.whatsapp,
          password: cleanPwd,
          must_change_password: false,
          updated_at: nowIso,
        });
      } else {
        // Create/sync cloud user record if it was only local previously
        await firebaseSyncService.saveUserAccount(targetPhone, {
          id: `usr-${targetPhone}`,
          name: resolvedAccount.name,
          phone: targetPhone,
          whatsapp_number: resolvedAccount.whatsapp,
          password: cleanPwd,
          role: resolvedAccount.role,
          workspace_id: currentWorkspace?.id || 'ws-default',
          must_change_password: false,
          status: 'active',
          deleted: false,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }
    }

    // 4. Update Local Accounts Store & Clear any Temporary Passwords
    try {
      const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
      const existingLocal = localAccounts[targetPhone] || {
        id: resolvedAccount.cloudAccount?.id || `usr-${targetPhone}`,
        name: resolvedAccount.name,
        phone: targetPhone,
        whatsapp_number: resolvedAccount.whatsapp,
        isOwner: resolvedAccount.role === 'owner',
        workspace_id: resolvedAccount.cloudAccount?.workspace_id || currentWorkspace?.id,
      };
      localAccounts[targetPhone] = {
        ...existingLocal,
        password: cleanPwd,
      };
      localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));

      const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
      if (tempMap[targetPhone]) {
        delete tempMap[targetPhone];
        localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));
      }
    } catch {}

    // 5. Update workspaceMembers state if matched
    setWorkspaceMembers(prev =>
      prev.map(m => {
        const mPhone = cleanPhoneNumber(m.profile?.phone || m.phone || '');
        if (mPhone === targetPhone && m.profile) {
          return {
            ...m,
            profile: { ...m.profile, must_change_password: false },
          };
        }
        return m;
      })
    );

    try {
      localStorage.setItem('ittihadiya_saved_login_phone', targetPhone);
    } catch {}

    showToast('تم التحقق من الكود وتغيير كلمة المرور بنجاح! يمكنك تسجيل الدخول الآن', 'success');
    return {
      success: true,
      targetPhone,
    };
  };

  // Direct Reset / Generation of a Worker's Access Code (Syncs to Firebase Firestore + Local so Worker can log in immediately on any device)
  const resetMemberPassword = async (
    targetUserId: string,
    targetPhone?: string
  ): Promise<{ success: boolean; temporaryPassword?: string; error?: string }> => {
    const matchedMember = workspaceMembers.find(
      m => m.user_id === targetUserId || (targetPhone && cleanPhoneNumber(m.profile?.phone || m.phone || '') === cleanPhoneNumber(targetPhone))
    );
    const fallbackPhone =
      targetPhone ||
      matchedMember?.profile?.phone ||
      matchedMember?.phone ||
      allWorkspacesState.find(w => w.created_by === targetUserId || w.id === targetUserId)?.owner_phone ||
      '';
    const canonicalPhone = cleanPhoneNumber(fallbackPhone);
    let generatedPassword = generateTemporaryPassword();

    const supabase = getSupabaseClient();
    if (supabase && isSupabaseConfigured() && currentWorkspace && isValidUUID(currentWorkspace.id)) {
      try {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke('reset-password', {
          body: {
            action: 'reset_password',
            target_user_id: isValidUUID(targetUserId) ? targetUserId : undefined,
            target_phone: canonicalPhone,
            workspace_id: currentWorkspace?.id,
          },
        });
        if (!fnErr && fnData?.success && fnData?.temporary_password) {
          generatedPassword = fnData.temporary_password;
        }
      } catch {}
    }

    // 1. Always save temporary password & local account entry
    try {
      if (canonicalPhone) {
        const tempMap = JSON.parse(localStorage.getItem('alittihadia_temp_passwords') || '{}');
        tempMap[canonicalPhone] = generatedPassword;
        localStorage.setItem('alittihadia_temp_passwords', JSON.stringify(tempMap));

        const localAccounts = JSON.parse(localStorage.getItem('alittihadia_local_accounts_v1') || '{}');
        localAccounts[canonicalPhone] = {
          ...(localAccounts[canonicalPhone] || {}),
          id: matchedMember?.user_id || targetUserId,
          name: matchedMember?.profile?.name || matchedMember?.name || 'عامل المحطة',
          phone: canonicalPhone,
          whatsapp_number: matchedMember?.profile?.whatsapp_number || canonicalPhone,
          password: generatedPassword,
          worker_code: generatedPassword,
          isOwner: matchedMember?.role === 'admin' || matchedMember?.role === 'owner',
          workspace_id: currentWorkspace?.id,
          station_id: matchedMember?.station_id,
        };
        localStorage.setItem('alittihadia_local_accounts_v1', JSON.stringify(localAccounts));
      }
    } catch {}

    // 2. Update workspaceMembers in state with the new worker_code and must_change_password: false
    let updatedMemberForCloud: WorkspaceMember | null = null;
    setWorkspaceMembers(prev =>
      prev.map(m => {
        if (m.user_id === targetUserId || (canonicalPhone && cleanPhoneNumber(m.profile?.phone || m.phone || '') === canonicalPhone)) {
          const updated: WorkspaceMember = {
            ...m,
            worker_code: generatedPassword,
            profile: m.profile
              ? { ...m.profile, worker_code: generatedPassword, must_change_password: false }
              : m.profile,
          };
          updatedMemberForCloud = updated;
          return updated;
        }
        return m;
      })
    );

    // 3. Await syncing the new worker code to Firebase Firestore (users/{phone} + users/code_{CODE} + workspaces/{wsId}/members)
    if (firebaseSyncService.isAvailable() && currentWorkspace) {
      const wsId = currentWorkspace.id;
      const memberToSync: WorkspaceMember = updatedMemberForCloud ||
        matchedMember || {
          workspace_id: wsId,
          user_id: targetUserId,
          station_id: stations[0]?.id,
          worker_code: generatedPassword,
          role: 'worker',
          status: 'active',
          joined_at: new Date().toISOString(),
          profile: {
            id: targetUserId,
            name: 'عامل المحطة',
            phone: canonicalPhone,
            whatsapp_number: canonicalPhone,
            worker_code: generatedPassword,
            must_change_password: false,
            created_at: new Date().toISOString(),
          },
        };

      const myStations = stations.filter(
        s => (!s.workspace_id || s.workspace_id === wsId || s.team_id === wsId) && !s.is_demo
      );

      await Promise.all([
        firebaseSyncService.syncWorkspace(currentWorkspace),
        ...myStations.map(s => firebaseSyncService.syncStation(wsId, s)),
        firebaseSyncService.syncWorkspaceMember(wsId, {
          ...memberToSync,
          worker_code: generatedPassword,
          profile: memberToSync.profile
            ? { ...memberToSync.profile, worker_code: generatedPassword, must_change_password: false }
            : undefined,
        }),
        canonicalPhone
          ? firebaseSyncService.saveUserAccount(canonicalPhone, {
              id: memberToSync.user_id || targetUserId,
              name: memberToSync.profile?.name || memberToSync.name || 'عامل المحطة',
              phone: canonicalPhone,
              whatsapp_number: memberToSync.profile?.whatsapp_number || canonicalPhone,
              password: generatedPassword,
              worker_code: generatedPassword,
              role: memberToSync.role === 'admin' || memberToSync.role === 'owner' ? 'owner' : 'worker',
              workspace_id: wsId,
              station_id: memberToSync.station_id || stations[0]?.id || null,
              must_change_password: false,
              status: 'active',
              deleted: false,
              created_at: memberToSync.profile?.created_at || memberToSync.joined_at || new Date().toISOString(),
            })
          : Promise.resolve(),
      ]).catch(err => {
        console.warn('Firebase resetMemberPassword sync warning:', err);
      });
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

  // Update Registered Phone, WhatsApp Number & Gmail in Settings (Protects Account if WhatsApp/SIM/Email changes)
  const updateUserContactNumbers = async (
    newPhone: string,
    newWhatsapp?: string,
    newName?: string,
    newEmail?: string
  ) => {
    if (!currentUser) return { success: false, error: 'يرجى تسجيل الدخول أولاً' };

    const cleanNewPhone = cleanPhoneNumber(newPhone);
    if (!cleanNewPhone || cleanNewPhone.length < 8) {
      const msg = 'يرجى إدخال رقم هاتف صحيح (8 أرقام على الأقل)';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }
    const cleanNewWhatsapp = cleanPhoneNumber(newWhatsapp || '') || cleanNewPhone;
    const finalName = newName?.trim() || currentUser.name;
    const oldCanonicalPhone = cleanPhoneNumber(currentUser.phone);
    const oldEmail = (currentUser.email || '').trim().toLowerCase();
    const cleanNewEmail = newEmail !== undefined ? newEmail.trim().toLowerCase() : oldEmail;

    if (cleanNewEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanNewEmail)) {
      const msg = 'يرجى إدخال عنوان بريد إلكتروني (Gmail) صحيح';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // Check if another user in workspaceMembers already has this phone number or email
    const duplicateMember = workspaceMembers.find(
      m =>
        m.user_id !== currentUser.id &&
        (cleanPhoneNumber(m.profile?.phone || '') === cleanNewPhone ||
          (cleanNewEmail && m.profile?.email && m.profile.email.toLowerCase() === cleanNewEmail))
    );
    if (duplicateMember) {
      const msg = 'رقم الهاتف أو البريد الإلكتروني الجديد مسجل بالفعل لعضو آخر في النظام';
      showToast(msg, 'error');
      return { success: false, error: msg };
    }

    // Check Firestore if phone or email is already registered to another user
    if (firebaseSyncService.isAvailable()) {
      try {
        if (cleanNewPhone !== oldCanonicalPhone) {
          const existingPhoneAcc =
            (await firebaseSyncService.getUserAccount(cleanNewPhone)) ||
            (await firebaseSyncService.findUserAccountByIdentifier(cleanNewPhone));
          if (
            existingPhoneAcc &&
            existingPhoneAcc.id !== currentUser.id &&
            !existingPhoneAcc.deleted &&
            existingPhoneAcc.status !== 'revoked'
          ) {
            const msg = 'رقم الهاتف الجديد مسجل بالفعل لحساب آخر في النظام. لا يمكن تكرار نفس الرقم.';
            showToast(msg, 'error');
            return { success: false, error: msg };
          }
        }
        if (cleanNewEmail && cleanNewEmail !== oldEmail) {
          const existingEmailAcc = await firebaseSyncService.findUserAccountByIdentifier(cleanNewEmail);
          if (
            existingEmailAcc &&
            existingEmailAcc.id !== currentUser.id &&
            cleanPhoneNumber(existingEmailAcc.phone || '') !== oldCanonicalPhone &&
            !existingEmailAcc.deleted &&
            existingEmailAcc.status !== 'revoked'
          ) {
            const msg = 'عنوان البريد الإلكتروني (Gmail) الجديد مسجل بالفعل لحساب آخر في النظام.';
            showToast(msg, 'error');
            return { success: false, error: msg };
          }
        }
      } catch (e) {
        console.warn('Firestore duplicate check warning in updateUserContactNumbers:', e);
      }
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
        email: cleanNewEmail || existingAcc.email,
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
      email: cleanNewEmail || currentUser.email,
      email_verified: true,
    };
    setCurrentUser(updatedProfile);
    try {
      localStorage.setItem('ittihadiya_saved_login_phone', cleanNewPhone);
    } catch {}

    // Update workspaceMembers so the manager sees updated worker name, phone, and email
    setWorkspaceMembers(prev =>
      prev.map(m =>
        m.user_id === currentUser.id && m.profile
          ? {
              ...m,
              profile: {
                ...m.profile,
                name: finalName,
                phone: cleanNewPhone,
                whatsapp_number: cleanNewWhatsapp,
                email: cleanNewEmail || m.profile.email,
              },
            }
          : m
      )
    );

    // Update stationWorkers so assigned station worker record also reflects new name/phone/email
    setStationWorkers(prev =>
      prev.map(sw =>
        sw.user_id === currentUser.id && sw.profile
          ? {
              ...sw,
              profile: {
                ...sw.profile,
                name: finalName,
                phone: cleanNewPhone,
                whatsapp_number: cleanNewWhatsapp,
                email: cleanNewEmail || sw.profile.email,
              },
            }
          : sw
      )
    );

    // Sync to Firebase if available
    if (firebaseSyncService.isAvailable()) {
      if (currentWorkspace) {
        const memberToSync = workspaceMembers.find(m => m.user_id === currentUser.id);
        if (memberToSync) {
          firebaseSyncService
            .syncWorkspaceMember(currentWorkspace.id, {
              ...memberToSync,
              profile: updatedProfile,
            })
            .catch(() => {});
        }
      }
      firebaseSyncService
        .getUserAccount(oldCanonicalPhone)
        .then(existing => {
          const baseAcc = existing || {
            id: currentUser.id,
            name: finalName,
            phone: cleanNewPhone,
            whatsapp_number: cleanNewWhatsapp,
            email: cleanNewEmail || currentUser.email,
            role: userRole === 'worker' ? ('worker' as const) : ('owner' as const),
            workspace_id: currentWorkspace?.id || 'ws-default',
            status: 'active' as const,
            deleted: false,
            created_at: currentUser.created_at || new Date().toISOString(),
          };
          firebaseSyncService
            .saveUserAccount(cleanNewPhone, {
              ...baseAcc,
              name: finalName,
              phone: cleanNewPhone,
              whatsapp_number: cleanNewWhatsapp,
              email: cleanNewEmail || baseAcc.email,
              email_verified: true,
            })
            .catch(() => {});
        })
        .catch(() => {});
    }

    if (currentWorkspace && currentWorkspace.created_by === currentUser.id) {
      const updatedWs: Workspace = {
        ...currentWorkspace,
        owner_phone: cleanNewPhone,
        owner_whatsapp: cleanNewWhatsapp,
        owner_email: cleanNewEmail || currentWorkspace.owner_email,
      };
      setCurrentWorkspace(updatedWs);
      if (firebaseSyncService.isAvailable()) {
        firebaseSyncService.syncWorkspace(updatedWs).catch(() => {});
      }
      setAllWorkspacesState(prev => {
        const next = prev.map(ws =>
          ws.id === currentWorkspace.id
            ? {
                ...ws,
                owner_phone: cleanNewPhone,
                owner_whatsapp: cleanNewWhatsapp,
                owner_email: cleanNewEmail || ws.owner_email,
              }
            : ws
        );
        localStorage.setItem('alittihadia_all_workspaces', JSON.stringify(next));
        return next;
      });
    }

    showToast('تم تحديث وحفظ رقم الهاتف والواتساب وبريد Gmail المعتمد بنجاح ✓', 'success');
    return { success: true };
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        userRole,
        isLoggedIn: Boolean(currentUser),
        registerUser,
        sendRegistrationEmailOtp,
        verifyRegistrationEmailOtp,
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
        isWorkerStationDeleted,
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
        loadAllMatchingParcelsToTrip,
        receiveAllParcelsInTrip,
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
        themeMode,
        setThemeMode,
        toggleThemeMode,
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
        deleteWorkspaceFromPlatform,
        passwordResetRequests: passwordResetRequestsState,
        submitPasswordResetRequest,
        resolvePasswordResetRequest,
        resetMemberPassword,
        changeMandatoryPassword,
        updateUserContactNumbers,
        requestWhatsAppOtp,
        verifyWhatsAppOtpCode,
        resetPasswordWithWhatsAppOtp,
        isSupabaseLive,
        hasDemoData,
        deleteDemoData,
        toast,
        showToast,
        resetAllDataToZero,
        managerPartnerships,
        registeredManagersNetwork,
        loadRegisteredManagersNetwork,
        sendPartnershipRequest,
        respondToPartnershipRequest,
        recordPartnershipSettlement,
        dispatchParcelToPartner,
        respondToPartnerParcel,
        acceptAllPendingPartnerParcels,
        confirmParcelTripArrived,
        confirmTripArrivedAtDestination,
        notifications,
        unreadNotificationsCount,
        markAllNotificationsRead,
        clearNotifications,
        accountTerminatedNotice,
        dismissAccountTerminatedNotice,
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
