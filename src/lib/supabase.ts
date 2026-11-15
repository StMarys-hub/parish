import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface InitialAuthCallbackState {
  openAdmin: boolean;
  isRecovery: boolean;
  errorDescription: string | null;
}

function captureAndNormalizeAuthRedirect(): InitialAuthCallbackState {
  if (typeof window === 'undefined') {
    return { openAdmin: false, isRecovery: false, errorDescription: null };
  }

  let hash = window.location.hash || '';
  const searchParams = new URLSearchParams(window.location.search);

  // Repair double-hash redirects (e.g. #/admin#access_token=...&type=recovery)
  // generated when redirect_to already contained a hash fragment.
  const nestedHashIndex = hash.indexOf('#', 1);
  if (nestedHashIndex !== -1) {
    const innerHash = hash.slice(nestedHashIndex + 1);
    searchParams.set('auth', 'admin');
    const nextSearch = searchParams.toString();
    const repairedUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}#${innerHash}`;
    window.history.replaceState(null, '', repairedUrl);
    hash = `#${innerHash}`;
  }

  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const hashParams = new URLSearchParams(rawHash);
  const typeParam = hashParams.get('type') || searchParams.get('type');
  const hasTokenOrCode =
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    searchParams.has('code') ||
    searchParams.has('token_hash');
  const rawError =
    hashParams.get('error_description') ||
    searchParams.get('error_description') ||
    hashParams.get('error') ||
    searchParams.get('error');

  const isRecovery = typeParam === 'recovery' && (hasTokenOrCode || !rawError);
  const openAdmin =
    hash.startsWith('#/admin') ||
    searchParams.get('auth') === 'admin' ||
    hasTokenOrCode ||
    Boolean(rawError);

  return {
    openAdmin,
    isRecovery,
    errorDescription: rawError ? rawError.replace(/\+/g, ' ') : null,
  };
}

export const initialAuthCallbackState = captureAndNormalizeAuthRedirect();

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';

export const isSupabaseConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  !supabaseUrl.includes('your-project-ref');

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getPublicFlyerUrl(storagePath: string): string | null {
  if (!supabase || !storagePath) return null;
  const { data } = supabase.storage.from('flyers').getPublicUrl(storagePath);
  return data.publicUrl ?? null;
}
