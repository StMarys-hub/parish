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
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isRunningStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
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

function keysMatch(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a || a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== b[i]) return false;
  }
  return true;
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

  if (Notification.permission === 'denied') {
    throw new Error(
      isIosDevice()
        ? 'Notifications are blocked. On iPhone/iPad, open Settings → Notifications → St. Mary’s and turn on Allow Notifications.'
        : 'Notifications are blocked in your browser settings. Please allow notifications for this site and try again.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      isIosDevice()
        ? 'Notification permission was not granted. Open iPhone/iPad Settings → Notifications → St. Mary’s to allow alerts.'
        : 'Notification permission was not granted.'
    );
  }

  const reg = await navigator.serviceWorker.ready;
  const expectedKey = urlBase64ToUint8Array(vapidPublicKey);

  let subscription = await reg.pushManager.getSubscription();
  // Re-subscribe cleanly if an older subscription used a stale VAPID key or lacked keys
  if (subscription) {
    const existingJson = subscription.toJSON();
    const keyMatches = keysMatch(subscription.options?.applicationServerKey, expectedKey);
    if (!keyMatches || !existingJson.keys?.p256dh || !existingJson.keys?.auth) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
  }

  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: expectedKey,
    });
  }

  const json = subscription.toJSON();
  const endpoint = subscription.endpoint;
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  const platform = detectPlatform();

  if (!endpoint || !p256dh || !auth) {
    throw new Error('Browser returned an incomplete push subscription.');
  }

  // Upsert via SECURITY DEFINER RPC so re-enabling on the same iOS/iPad endpoint reactivates is_active=true
  const { error: rpcErr } = await supabase.rpc('upsert_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_platform: platform,
  });

  if (rpcErr) {
    // Fallback if RPC isn't present on an un-migrated environment
    const { error } = await supabase.from('push_subscriptions').insert({
      endpoint,
      p256dh,
      auth,
      platform,
      is_active: true,
    });
    if (error && !error.message.toLowerCase().includes('duplicate')) {
      throw error;
    }
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
