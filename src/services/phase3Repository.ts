import { prepareReceiptUploadFile } from '../lib/imageCompression';
import { sanitizeActionUrl, sanitizePlainText, sanitizeStorageFileName } from '../lib/sanitize';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import {
  MinistryUpdate,
  PayoutMethod,
  ReimbursementAccessStatus,
  ReimbursementClaim,
  ReimbursementGateMode,
  ReimbursementSecurityConfig,
  ReimbursementStatus,
  ReimbursementSubmitter,
  SpecialAnnouncement,
} from '../types/parish';

const SPECIAL_CACHE_KEY = 'parish_cache_special_announcements_v1';
const MINISTRY_CACHE_KEY = 'parish_cache_ministry_updates_v1';

function readCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeCache<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function getEdgeFunctionEndpoint(name: string): { url: string; anonKey: string } {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
  if (!baseUrl || !anonKey) {
    throw new Error('Supabase configuration is missing.');
  }
  return { url: `${baseUrl.replace(/\/+$/, '')}/functions/v1/${name}`, anonKey };
}

async function readAuthHeader(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ? `Bearer ${data.session.access_token}` : null;
}

// ============================================================================
// 1. STANDALONE VICAR / SPECIAL ANNOUNCEMENTS
// ============================================================================
export async function fetchPublishedSpecialAnnouncements(): Promise<SpecialAnnouncement[]> {
  if (!supabase || !isSupabaseConfigured) {
    return [];
  }
  try {
    const { data, error } = await supabase
      .from('special_announcements')
      .select('*')
      .eq('status', 'published')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(10);
    if (error) throw error;
    const rows = (data ?? []) as SpecialAnnouncement[];
    writeCache(SPECIAL_CACHE_KEY, rows);
    return rows;
  } catch {
    return readCache<SpecialAnnouncement[]>(SPECIAL_CACHE_KEY, []);
  }
}

export async function fetchAllSpecialAnnouncementsForAdmin(): Promise<SpecialAnnouncement[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('special_announcements')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data ?? []) as SpecialAnnouncement[];
}

export async function upsertSpecialAnnouncement(
  payload: Partial<SpecialAnnouncement> & { title: string; description: string }
): Promise<SpecialAnnouncement> {
  if (!supabase) throw new Error('Supabase is not configured');

  const { data: authData } = await supabase.auth.getUser();
  const row = {
    ...(payload.id ? { id: payload.id } : {}),
    title: sanitizePlainText(payload.title),
    description: sanitizePlainText(payload.description),
    event_date_label: payload.event_date_label ? sanitizePlainText(payload.event_date_label) : null,
    location_label: payload.location_label ? sanitizePlainText(payload.location_label) : null,
    maps_url: payload.maps_url ? sanitizeActionUrl(payload.maps_url) : null,
    web_url: payload.web_url ? sanitizeActionUrl(payload.web_url) : null,
    web_link_label: payload.web_link_label ? sanitizePlainText(payload.web_link_label) : null,
    flyer_url: payload.flyer_url ? sanitizeActionUrl(payload.flyer_url) : null,
    flyer_storage_path: payload.flyer_storage_path ?? null,
    flyer_mime_type: payload.flyer_mime_type ?? null,
    is_pinned: payload.is_pinned ?? true,
    status: payload.status ?? 'published',
    published_at: payload.published_at ?? new Date().toISOString(),
    updated_by: authData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('special_announcements')
    .upsert(row)
    .select()
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save Special Announcement');
  }
  return data as SpecialAnnouncement;
}

export async function setSpecialAnnouncementStatus(
  id: string,
  status: 'published' | 'archived'
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase
    .from('special_announcements')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSpecialAnnouncement(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('special_announcements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function uploadSpecialFlyer(
  file: File
): Promise<{ publicUrl: string; storagePath: string; mimeType: string }> {
  if (!supabase) throw new Error('Supabase is not configured');
  const safeName = sanitizeStorageFileName(file.name);
  const path = `special/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('flyers').upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('flyers').getPublicUrl(path);
  return {
    publicUrl: data.publicUrl,
    storagePath: path,
    mimeType: file.type,
  };
}

// ============================================================================
// 2. MINISTRY WEEKLY UPDATES
// ============================================================================
export async function fetchPublishedMinistryUpdates(): Promise<MinistryUpdate[]> {
  if (!supabase || !isSupabaseConfigured) {
    return [];
  }
  try {
    const { data, error } = await supabase
      .from('ministry_updates')
      .select('*')
      .eq('status', 'published')
      .order('sort_order', { ascending: true })
      .order('updated_at', { ascending: false })
      .limit(40);
    if (error) throw error;
    const rows = (data ?? []) as MinistryUpdate[];
    writeCache(MINISTRY_CACHE_KEY, rows);
    return rows;
  } catch {
    return readCache<MinistryUpdate[]>(MINISTRY_CACHE_KEY, []);
  }
}

export async function fetchAllMinistryUpdatesForAdmin(): Promise<MinistryUpdate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('ministry_updates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('updated_at', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return (data ?? []) as MinistryUpdate[];
}

export async function upsertMinistryUpdate(
  payload: Partial<MinistryUpdate> & {
    ministry_name: string;
    title: string;
    body: string;
  }
): Promise<MinistryUpdate> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data: authData } = await supabase.auth.getUser();

  const row = {
    ...(payload.id ? { id: payload.id } : {}),
    ministry_name: sanitizePlainText(payload.ministry_name),
    title: sanitizePlainText(payload.title),
    body: sanitizePlainText(payload.body),
    week_label: payload.week_label ? sanitizePlainText(payload.week_label) : null,
    event_date_label: payload.event_date_label ? sanitizePlainText(payload.event_date_label) : null,
    location_label: payload.location_label ? sanitizePlainText(payload.location_label) : null,
    action_url: payload.action_url ? sanitizeActionUrl(payload.action_url) : null,
    action_label: payload.action_label ? sanitizePlainText(payload.action_label) : null,
    status: payload.status ?? 'published',
    sort_order: payload.sort_order ?? 0,
    updated_by: authData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('ministry_updates')
    .upsert(row)
    .select()
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to save Ministry Update');
  }
  return data as MinistryUpdate;
}

export async function setMinistryUpdateStatus(
  id: string,
  status: 'published' | 'archived'
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase
    .from('ministry_updates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMinistryUpdate(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('ministry_updates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ============================================================================
// 3. EXPENSE REIMBURSEMENTS (AUTHENTICATED DEVICE LOGIN + ANTI-SPAM + PRIVATE RECEIPTS)
// ============================================================================
async function invokeReimbursementsJson<T>(body: Record<string, unknown>): Promise<T> {
  const auth = await readAuthHeader();
  if (!auth) throw new Error('Device login required.');

  const { url, anonKey } = getEdgeFunctionEndpoint('reimbursements');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: auth,
    },
    body: JSON.stringify(body),
  });

  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload.error || 'Reimbursement request failed.');
  }
  return payload;
}

export async function fetchReimbursementAccessStatus(): Promise<ReimbursementAccessStatus> {
  return invokeReimbursementsJson<ReimbursementAccessStatus>({ action: 'my_access_status' });
}

export async function verifyReimbursementParishPin(parishPin: string): Promise<void> {
  await invokeReimbursementsJson<{ verified: boolean }>({
    action: 'verify_pin',
    parishPin,
  });
}

export async function submitReimbursementRequest(input: {
  fullName: string;
  contactInfo: string;
  ministry: string;
  expenseDate: string;
  amountDollars: string;
  description: string;
  payoutMethod: PayoutMethod;
  receiptFile: File;
  parishPin?: string;
  companyWebsite?: string;
}): Promise<{
  claim: ReimbursementClaim;
  compressionNote: string | null;
}> {
  if (!isSupabaseConfigured) {
    throw new Error('Connect Supabase first to submit reimbursement receipts.');
  }
  const auth = await readAuthHeader();
  if (!auth) {
    throw new Error('Please sign in on this device before submitting a receipt.');
  }

  const parsedDollars = Number(input.amountDollars.replace(/[^0-9.]/g, ''));
  const amountCents = Math.round(parsedDollars * 100);
  if (!Number.isFinite(parsedDollars) || amountCents <= 0) {
    throw new Error('Please enter a valid expense amount greater than $0.00.');
  }

  const prepared = await prepareReceiptUploadFile(input.receiptFile);
  const compressionNote = prepared.wasCompressed
    ? `Image compressed cleanly (${Math.round(prepared.originalBytes / 1024)} KB → ${Math.round(prepared.finalBytes / 1024)} KB)`
    : null;

  const form = new FormData();
  form.append('action', 'submit');
  form.append('fullName', sanitizePlainText(input.fullName));
  form.append('contactInfo', sanitizePlainText(input.contactInfo));
  form.append('ministry', sanitizePlainText(input.ministry));
  form.append('expenseDate', input.expenseDate);
  form.append('amountCents', String(amountCents));
  form.append('description', sanitizePlainText(input.description));
  form.append('payoutMethod', input.payoutMethod);
  if (input.parishPin) form.append('parishPin', input.parishPin.trim());
  if (input.companyWebsite) form.append('companyWebsite', input.companyWebsite);
  form.append('receipt', prepared.file);

  const { url, anonKey } = getEdgeFunctionEndpoint('reimbursements');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: auth,
    },
    body: form,
  });

  const payload = (await res.json()) as {
    claim?: ReimbursementClaim;
    error?: string;
  };
  if (!res.ok || !payload.claim) {
    throw new Error(payload.error || 'Failed to submit reimbursement request.');
  }

  return { claim: payload.claim, compressionNote };
}

export async function fetchTrackedReimbursements(): Promise<ReimbursementClaim[]> {
  if (!isSupabaseConfigured) return [];
  const auth = await readAuthHeader();
  if (!auth) return [];
  const data = await invokeReimbursementsJson<{ claims?: ReimbursementClaim[] }>({
    action: 'track',
  });
  return data.claims ?? [];
}

export async function fetchAdminReimbursements(
  status: ReimbursementStatus | 'all' = 'all'
): Promise<ReimbursementClaim[]> {
  const data = await invokeReimbursementsJson<{ claims?: ReimbursementClaim[] }>({
    action: 'admin_list',
    status,
  });
  return data.claims ?? [];
}

export async function reviewAdminReimbursement(params: {
  id: string;
  status: 'approved' | 'paid' | 'declined';
  trusteeNotes?: string;
}): Promise<ReimbursementClaim> {
  const data = await invokeReimbursementsJson<{ claim?: ReimbursementClaim }>({
    action: 'admin_review',
    ...params,
  });
  if (!data.claim) throw new Error('Unable to update reimbursement status.');
  return data.claim;
}

export async function fetchReimbursementSecurity(): Promise<{
  config: ReimbursementSecurityConfig;
  submitters: ReimbursementSubmitter[];
}> {
  return invokeReimbursementsJson<{
    config: ReimbursementSecurityConfig;
    submitters: ReimbursementSubmitter[];
  }>({ action: 'admin_get_security' });
}

export async function updateReimbursementSecurity(params: {
  gateMode: ReimbursementGateMode;
  maxSubmissionsPer24h: number;
  newPin?: string;
}): Promise<void> {
  await invokeReimbursementsJson<{ ok: boolean }>({
    action: 'admin_update_security',
    ...params,
  });
}

export async function upsertReimbursementSubmitter(params: {
  email: string;
  fullName?: string;
  ministry?: string;
  isApproved: boolean;
  isBlocked: boolean;
}): Promise<ReimbursementSubmitter> {
  const data = await invokeReimbursementsJson<{ submitter: ReimbursementSubmitter }>({
    action: 'admin_upsert_submitter',
    ...params,
  });
  return data.submitter;
}

export async function deleteReimbursementSubmitter(email: string): Promise<void> {
  await invokeReimbursementsJson<{ ok: boolean }>({
    action: 'admin_delete_submitter',
    email,
  });
}
