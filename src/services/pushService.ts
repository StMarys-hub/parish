import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type PushSupportState =
  | 'supported'
  | 'ios-needs-homescreen'
  | 'unsupported'
  | 'unconfigured';

const SUBSCRIBED_FLAG_KEY = 'parish_push_subscribed_v1';

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

export function getPushSupportState(): PushSupportState {
  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() ?? '';
  if (!isSupabaseConfigured || !vapidPublicKey || vapidPublicKey.includes('your-vapid')) {
    return 'unconfigured';
  }
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }
  if (isIosDevice() && !isRunningStandalone()) {
    return 'ios-needs-homescreen';
  }
  if (!('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return 'supported';
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function detectPlatform(): 'ios_pwa' | 'android' | 'desktop' | 'other' {
  if (isIosDevice() && isRunningStandalone()) return 'ios_pwa';
  if (/Android/i.test(navigator.userAgent)) return 'android';
  if (/Win|Mac|Linux/i.test(navigator.platform)) return 'desktop';
  return 'other';
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export function hasLocalPushPreference(): boolean {
  try {
    return localStorage.getItem(SUBSCRIBED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export async function subscribeToParishPush(): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim();
  if (!vapidPublicKey) throw new Error('Missing VITE_VAPID_PUBLIC_KEY');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.');
  }

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
  }

  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete push subscription.');
  }

  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint,
    p256dh,
    auth,
    platform: detectPlatform(),
    is_active: true,
  });

  // Ignore duplicate unique constraint error if device was already registered
  if (error && !error.message.toLowerCase().includes('duplicate')) {
    throw error;
  }

  try {
    localStorage.setItem(SUBSCRIBED_FLAG_KEY, '1');
  } catch {
    // Ignore storage error
  }
}

export async function unsubscribeFromParishPush(): Promise<void> {
  const existing = await getCurrentPushSubscription();
  if (existing) {
    if (supabase && isSupabaseConfigured) {
      await supabase.rpc('unsubscribe_push', { p_endpoint: existing.endpoint });
    }
    await existing.unsubscribe();
  }
  try {
    localStorage.removeItem(SUBSCRIBED_FLAG_KEY);
  } catch {
    // Ignore
  }
}
