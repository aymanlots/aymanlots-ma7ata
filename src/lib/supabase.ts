import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * توحيد صيغة أرقام الهواتف للمغرب وموريتانيا لمنع تكرار الحسابات لنفس الشخص:
 * - المغرب: 0612345678 أو +212612345678 أو 00212612345678 ➔ 212612345678
 * - موريتانيا: +22245740000 أو 0022245740000 أو 45740000 (8 أرقام محلية) ➔ 22245740000
 */
export const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  let digits = phone.trim().replace(/[^0-9]/g, '');
  if (!digits) return '';

  // إزالة البادئة الدولية 00
  if (digits.startsWith('00212')) {
    digits = '212' + digits.slice(5);
  } else if (digits.startsWith('00222')) {
    digits = '222' + digits.slice(5);
  }

  // معالجة الرقم المغربي مع صفر زائد بعد رمز الدولة مثل 2120612345678
  if (digits.startsWith('2120') && digits.length === 13) {
    digits = '212' + digits.slice(4);
  }

  // معالجة الرقم المغربي المحلي المكون من 10 أرقام ويبدأ بـ 05 أو 06 أو 07
  if (digits.length === 10 && /^0[567]\d{8}$/.test(digits)) {
    return '212' + digits.slice(1);
  }

  // معالجة الرقم المغربي المكون من 9 أرقام ويبدأ بـ 5 أو 6 أو 7
  if (digits.length === 9 && /^[567]\d{8}$/.test(digits)) {
    return '212' + digits;
  }

  // معالجة الرقم الموريتاني مع صفر زائد بعد رمز الدولة مثل 2220...
  if (digits.startsWith('2220') && digits.length === 12) {
    digits = '222' + digits.slice(4);
  }

  // معالجة الرقم الموريتاني المحلي المكون من 8 أرقام (يبدأ عادة بـ 2 أو 3 أو 4)
  if (digits.length === 8 && /^[234]\d{7}$/.test(digits)) {
    return '222' + digits;
  }

  return digits;
};

// Clean & normalize phone format to canonical representation
export const cleanPhoneNumber = (phone: string): string => {
  return normalizePhoneNumber(phone);
};

// Convert phone number to standard domain-specific email for Supabase Auth (no SMS required)
export const phoneToEmail = (phone: string): string => {
  const canonical = normalizePhoneNumber(phone);
  return `${canonical}@alittihadia.app`;
};

// Generate a random temporary password (min 10 chars, alphanumeric, no default '123456')
export const generateTemporaryPassword = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  let randomPart = '';
  for (let i = 0; i < 8; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Itt-${randomPart}`;
};

// Get Supabase credentials from environment or localStorage (only anon public key)
export const getStoredCredentials = () => {
  const envUrl = import.meta.env.VITE_SUPABASE_URL;
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const localUrl = localStorage.getItem('aman_supabase_url');
  const localKey = localStorage.getItem('aman_supabase_anon_key');

  const url = localUrl || (envUrl && !envUrl.includes('your-project-id') ? envUrl : '');
  const key = localKey || (envKey && !envKey.includes('your-anon-public-key') ? envKey : '');

  return { url, key, isConfigured: Boolean(url && key) };
};

let clientInstance: SupabaseClient | null = null;

export const isSupabaseConfigured = (): boolean => {
  return getStoredCredentials().isConfigured;
};

export const getSupabaseClient = (): SupabaseClient | null => {
  const { url, key, isConfigured } = getStoredCredentials();
  if (!isConfigured) return null;

  if (!clientInstance) {
    try {
      clientInstance = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        },
      });
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
      return null;
    }
  }
  return clientInstance;
};

export const saveSupabaseConfig = (url: string, key: string) => {
  if (url && key) {
    localStorage.setItem('aman_supabase_url', url.trim());
    localStorage.setItem('aman_supabase_anon_key', key.trim());
    clientInstance = null; // Reset to force re-instantiation
  } else {
    localStorage.removeItem('aman_supabase_url');
    localStorage.removeItem('aman_supabase_anon_key');
    clientInstance = null;
  }
};

export const clearSupabaseConfig = () => {
  localStorage.removeItem('aman_supabase_url');
  localStorage.removeItem('aman_supabase_anon_key');
  clientInstance = null;
};
