import { prepareReceiptUploadFile } from '../lib/imageCompression';
import { sanitizeActionUrl, sanitizePlainText, sanitizeStorageFileName } from '../lib/sanitize';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { parseVicarMessage } from '../lib/vicarMessageParser';
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
  SpecialNoticeCategory,
  SpecialNoticeStructuredBlocks,
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

async function requireFreshUserId(): Promise<string> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data: sessionRes } = await supabase.auth.getSession();
  const session = sessionRes.session;
  const nowSec = Math.floor(Date.now() / 1000);
  if (!session || (session.expires_at && session.expires_at - nowSec < 60)) {
    const { data: refreshed, error: refErr } = await supabase.auth.refreshSession();
    if (refErr || !refreshed.session?.user) {
      throw new Error('Your admin session expired. Please sign out and sign in again.');
    }
    return refreshed.session.user.id;
  }
  return session.user.id;
}

async function readAuthHeader(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return null;
  const nowSec = Math.floor(Date.now() / 1000);
  if (session.expires_at && session.expires_at - nowSec < 60) {
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token
      ? `Bearer ${refreshed.session.access_token}`
      : `Bearer ${session.access_token}`;
  }
  return `Bearer ${session.access_token}`;
}

// ============================================================================
// 1. STANDALONE VICAR / SPECIAL NOTICES (special_notices + graceful fallback)
// ============================================================================
function isMissingSpecialNoticesTable(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const msg = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase();
  return msg.includes('special_notices') && (msg.includes('does not exist') || msg.includes('pgrst205') || msg.includes('42p01'));
}

function mapNoticeRow(raw: Record<string, unknown>): SpecialAnnouncement {
  const isNewSchema = 'structured_blocks' in raw || 'category_badge' in raw;
  const rawMessage = String(raw.raw_message ?? raw.description ?? '');
  const parsed = parseVicarMessage(rawMessage);

  const structuredBlocks = (
    isNewSchema && raw.structured_blocks && typeof raw.structured_blocks === 'object'
      ? raw.structured_blocks
      : parsed.structuredBlocks
  ) as SpecialNoticeStructuredBlocks;

  const firstLoc = structuredBlocks.locations?.[0];
  const firstLink = structuredBlocks.externalLinks?.[0] ?? structuredBlocks.mediaLinks?.[0];
  const title = String(raw.title ?? parsed.title ?? 'Special Notice');
  const summaryPreview = String(raw.summary_preview ?? parsed.summaryPreview ?? '');

  return {
    id: String(raw.id),
    title,
    category_badge: (raw.category_badge as SpecialNoticeCategory) ?? parsed.categoryBadge,
    summary_preview: summaryPreview,
    raw_message: rawMessage,
    structured_blocks: structuredBlocks,
    sign_off: String(raw.sign_off ?? parsed.signOff ?? 'Rajeev Achan'),
    description: String(raw.description ?? parsed.description ?? summaryPreview),
    event_date_label:
      (raw.event_date_label as string | null | undefined) ??
      structuredBlocks.eventDateLabel ??
      (parsed.eventDateLabel || null),
    location_label:
      (raw.location_label as string | null | undefined) ??
      structuredBlocks.locationLabel ??
      firstLoc?.label ??
      (parsed.locationLabel || null),
    maps_url:
      (raw.maps_url as string | null | undefined) ??
      firstLoc?.mapsUrl ??
      (parsed.mapsUrl || null),
    web_url:
      (raw.web_url as string | null | undefined) ??
      firstLink?.url ??
      (parsed.webUrl || null),
    web_link_label:
      (raw.web_link_label as string | null | undefined) ??
      firstLink?.label ??
      (parsed.webLinkLabel || null),
    flyer_url: (raw.flyer_url as string | null | undefined) ?? null,
    flyer_storage_path: (raw.flyer_storage_path as string | null | undefined) ?? null,
    flyer_mime_type: (raw.flyer_mime_type as string | null | undefined) ?? null,
    is_pinned: Boolean(raw.is_pinned),
    status: (raw.status as 'published' | 'archived') ?? 'published',
    published_at: String(raw.published_at ?? raw.created_at ?? new Date().toISOString()),
    created_at: String(raw.created_at ?? raw.published_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? raw.created_at ?? new Date().toISOString()),
  };
}

export async function fetchPublishedSpecialAnnouncements(): Promise<SpecialAnnouncement[]> {
  if (!supabase || !isSupabaseConfigured) {
    return [];
  }
  try {
    const primary = await supabase
      .from('special_notices')
      .select('*')
      .eq('status', 'published')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (!primary.error) {
      const rows = (primary.data ?? []).map((r) => mapNoticeRow(r as Record<string, unknown>));
      writeCache(SPECIAL_CACHE_KEY, rows);
      return rows;
    }

    if (!isMissingSpecialNoticesTable(primary.error)) {
      throw primary.error;
    }

    const legacy = await supabase
      .from('special_announcements')
      .select('*')
      .eq('status', 'published')
      .order('is_pinned', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(15);
    if (legacy.error) throw legacy.error;
    const rows = (legacy.data ?? []).map((r) => mapNoticeRow(r as Record<string, unknown>));
    writeCache(SPECIAL_CACHE_KEY, rows);
    return rows;
  } catch {
    return readCache<SpecialAnnouncement[]>(SPECIAL_CACHE_KEY, []);
  }
}

export async function fetchAllSpecialAnnouncementsForAdmin(): Promise<SpecialAnnouncement[]> {
  if (!supabase) return [];
  const primary = await supabase
    .from('special_notices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!primary.error) {
    return (primary.data ?? []).map((r) => mapNoticeRow(r as Record<string, unknown>));
  }

  if (isMissingSpecialNoticesTable(primary.error)) {
    const legacy = await supabase
      .from('special_announcements')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50);
    if (legacy.error) throw new Error(legacy.error.message);
    return (legacy.data ?? []).map((r) => mapNoticeRow(r as Record<string, unknown>));
  }

  throw new Error(primary.error.message);
}

export async function upsertSpecialAnnouncement(
  payload: Partial<SpecialAnnouncement> & { title: string; description: string }
): Promise<SpecialAnnouncement> {
  if (!supabase) throw new Error('Supabase is not configured');

  const userId = await requireFreshUserId();
  const nowIso = new Date().toISOString();

  const modernRow = {
    title: sanitizePlainText(payload.title),
    category_badge: payload.category_badge ?? 'Vicar Note',
    summary_preview: sanitizePlainText(payload.summary_preview ?? payload.description.slice(0, 140)),
    raw_message: sanitizePlainText(payload.raw_message ?? payload.description),
    structured_blocks: payload.structured_blocks ?? {},
    flyer_url: payload.flyer_url ? sanitizeActionUrl(payload.flyer_url) : null,
    flyer_storage_path: payload.flyer_storage_path ?? null,
    flyer_mime_type: payload.flyer_mime_type ?? null,
    sign_off: sanitizePlainText(payload.sign_off ?? 'Rajeev Achan') || 'Rajeev Achan',
    is_pinned: payload.is_pinned ?? false,
    status: payload.status ?? 'published',
    published_at: payload.published_at ?? nowIso,
    updated_by: userId,
    updated_at: nowIso,
  };

  const primaryQuery = payload.id
    ? supabase.from('special_notices').update(modernRow).eq('id', payload.id)
    : supabase.from('special_notices').insert(modernRow);

  const primaryRes = await primaryQuery.select().single();
  if (!primaryRes.error && primaryRes.data) {
    return mapNoticeRow(primaryRes.data as Record<string, unknown>);
  }

  if (!isMissingSpecialNoticesTable(primaryRes.error)) {
    throw new Error(primaryRes.error?.message ?? 'Failed to save Special Notice');
  }

  // Fallback to legacy table only when migration 007 hasn't run yet
  const legacyRow = {
    title: modernRow.title,
    description: sanitizePlainText(payload.description),
    event_date_label: payload.event_date_label ? sanitizePlainText(payload.event_date_label) : null,
    location_label: payload.location_label ? sanitizePlainText(payload.location_label) : null,
    maps_url: payload.maps_url ? sanitizeActionUrl(payload.maps_url) : null,
    web_url: payload.web_url ? sanitizeActionUrl(payload.web_url) : null,
    web_link_label: payload.web_link_label ? sanitizePlainText(payload.web_link_label) : null,
    flyer_url: modernRow.flyer_url,
    flyer_storage_path: modernRow.flyer_storage_path,
    flyer_mime_type: modernRow.flyer_mime_type,
    is_pinned: modernRow.is_pinned,
    status: modernRow.status,
    published_at: modernRow.published_at,
    updated_by: userId,
    updated_at: nowIso,
  };

  const legacyQuery = payload.id
    ? supabase.from('special_announcements').update(legacyRow).eq('id', payload.id)
    : supabase.from('special_announcements').insert(legacyRow);

  const legacyRes = await legacyQuery.select().single();
  if (legacyRes.error || !legacyRes.data) {
    throw new Error(legacyRes.error?.message ?? 'Failed to save Special Notice');
  }
  return mapNoticeRow(legacyRes.data as Record<string, unknown>);
}

export async function setSpecialAnnouncementStatus(
  id: string,
  status: 'published' | 'archived'
): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  await requireFreshUserId();
  const primary = await supabase
    .from('special_notices')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (!primary.error) return;
  if (!isMissingSpecialNoticesTable(primary.error)) {
    throw new Error(primary.error.message);
  }
  const legacy = await supabase
    .from('special_announcements')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (legacy.error) throw new Error(legacy.error.message);
}

export async function deleteSpecialAnnouncement(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  await requireFreshUserId();
  const primary = await supabase.from('special_notices').delete().eq('id', id);
  if (!primary.error) return;
  if (!isMissingSpecialNoticesTable(primary.error)) {
    throw new Error(primary.error.message);
  }
  const legacy = await supabase.from('special_announcements').delete().eq('id', id);
  if (legacy.error) throw new Error(legacy.error.message);
}

export async function uploadSpecialFlyer(
  file: File
): Promise<{ publicUrl: string; storagePath: string; mimeType: string; compressionNote: string | null }> {
  if (!supabase) throw new Error('Supabase is not configured');
  await requireFreshUserId();
  const prepared = await prepareReceiptUploadFile(file);
  const uploadFile = prepared.file;
  const safeName = sanitizeStorageFileName(uploadFile.name);
  const path = `special/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from('flyers').upload(path, uploadFile, {
    contentType: uploadFile.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('flyers').getPublicUrl(path);
  return {
    publicUrl: data.publicUrl,
    storagePath: path,
    mimeType: uploadFile.type,
    compressionNote: prepared.wasCompressed
      ? `Compressed (${Math.round(prepared.originalBytes / 1024)} KB → ${Math.round(prepared.finalBytes / 1024)} KB)`
      : null,
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
  const userId = await requireFreshUserId();

  const row = {
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
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };

  const query = payload.id
    ? supabase.from('ministry_updates').update(row).eq('id', payload.id)
    : supabase.from('ministry_updates').insert(row);

  const { data, error } = await query.select().single();
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
  await requireFreshUserId();
  const { error } = await supabase
    .from('ministry_updates')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteMinistryUpdate(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  await requireFreshUserId();
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
