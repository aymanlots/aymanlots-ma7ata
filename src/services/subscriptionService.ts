import { Subscription, SubscriptionStatus, Workspace } from '../types/database';
import { PLATFORM_CONFIG } from '../config/constants';
import { storageService } from './storageService';

export const subscriptionService = {
  // إنشاء اشتراك تجريبي جديد لمساحة العمل (15 يوماً افتراضياً)
  createTrialSubscription(workspaceId: string): Subscription {
    const now = new Date();
    const trialDays = PLATFORM_CONFIG.DEFAULT_FREE_TRIAL_DAYS;
    const endDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const sub: Subscription = {
      id: `sub-${workspaceId}`,
      workspace_id: workspaceId,
      team_id: workspaceId,
      status: 'active',
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      is_trial: true,
      created_at: now.toISOString(),
    };

    return sub;
  },

  // فحص هل الاشتراك منتهي الصلاحية ويجب قفل الإدخال
  checkSubscriptionStatus(sub: Subscription | null): {
    isExpired: boolean;
    daysLeft: number;
    showWarningBanner: boolean;
    isReadOnly: boolean;
  } {
    if (!sub) {
      return { isExpired: false, daysLeft: 15, showWarningBanner: false, isReadOnly: false };
    }

    if (sub.status === 'suspended') {
      return { isExpired: true, daysLeft: 0, showWarningBanner: true, isReadOnly: true };
    }

    const end = new Date(sub.end_date).getTime();
    const now = Date.now();
    const diff = end - now;
    const daysLeft = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
    const isExpired = diff <= 0;
    const showWarningBanner = !isExpired && daysLeft <= PLATFORM_CONFIG.WARNING_EXPIRY_DAYS;
    const isReadOnly = isExpired;

    return {
      isExpired,
      daysLeft,
      showWarningBanner,
      isReadOnly
    };
  },

  // تمديد أو تفعيل الاشتراك لعدد محدد من الأشهر (خاص بمالك المنصة)
  extendSubscriptionMonths(sub: Subscription, months: number): Subscription {
    const baseDate = new Date(sub.end_date).getTime() < Date.now() ? new Date() : new Date(sub.end_date);
    const newEnd = new Date(baseDate);
    newEnd.setMonth(newEnd.getMonth() + months);

    return {
      ...sub,
      status: 'active',
      end_date: newEnd.toISOString(),
      is_trial: false
    };
  },

  // تعليق الاشتراك (خاص بمالك المنصة)
  suspendSubscription(sub: Subscription): Subscription {
    return {
      ...sub,
      status: 'suspended'
    };
  },

  // تنشيط الاشتراك (خاص بمالك المنصة)
  activateSubscription(sub: Subscription, days: number = 30): Subscription {
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    return {
      ...sub,
      status: 'active',
      end_date: end.toISOString(),
      is_trial: false
    };
  }
};
