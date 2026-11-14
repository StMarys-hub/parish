import {
  SAMPLE_BULLETINS,
  SAMPLE_PARISH_INFO,
  SAMPLE_REGULAR_SCHEDULES,
} from '../data/sampleData';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { sanitizeStorageFileName } from '../lib/sanitize';
import {
  AdminUserProfile,
  AuditLogEntry,
  ParishInfo,
  RegularScheduleItem,
  WeeklyBulletin,
} from '../types/parish';

const CACHE_KEYS = {
  bulletins: 'parish_cache_bulletins_v1',
  schedules: 'parish_cache_schedules_v1',
  parishInfo: 'parish_cache_info_v1',
} as const;

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
    // Ignore quota errors on private browsing
  }
}

export async function fetchPublishedBulletins(limit = 4): Promise<{
  bulletins: WeeklyBulletin[];
  source: 'live' | 'cache' | 'sample';
}> {
  if (!supabase || !isSupabaseConfigured) {
    return { bulletins: SAMPLE_BULLETINS.slice(0, limit), source: 'sample' };
  }

  try {
    const { data, error } = await supabase
      .from('weekly_bulletins')
      .select('*')
      .eq('status', 'published')
      .order('week_start', { ascending: false })
      .limit(limit);

    if (error) throw error;
    const rows = (data ?? []) as WeeklyBulletin[];
    if (rows.length > 0) {
      writeCache(CACHE_KEYS.bulletins, rows);
      return { bulletins: rows, source: 'live' };
    }
    return { bulletins: SAMPLE_BULLETINS.slice(0, limit), source: 'sample' };
  } catch {
    const cached = readCache<WeeklyBulletin[]>(CACHE_KEYS.bulletins, []);
    if (cached.length > 0) return { bulletins: cached, source: 'cache' };
    return { bulletins: SAMPLE_BULLETINS.slice(0, limit), source: 'sample' };
  }
}

export async function fetchRegularSchedules(): Promise<RegularScheduleItem[]> {
  if (!supabase || !isSupabaseConfigured) {
    return SAMPLE_REGULAR_SCHEDULES;
  }

  try {
    const { data, error } = await supabase
      .from('regular_schedules')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    const rows = (data ?? []) as RegularScheduleItem[];
    if (rows.length > 0) {
      writeCache(CACHE_KEYS.schedules, rows);
      return rows;
    }
    return SAMPLE_REGULAR_SCHEDULES;
  } catch {
    return readCache<RegularScheduleItem[]>(CACHE_KEYS.schedules, SAMPLE_REGULAR_SCHEDULES);
  }
}

export async function fetchParishInfo(): Promise<ParishInfo> {
  if (!supabase || !isSupabaseConfigured) {
    return SAMPLE_PARISH_INFO;
  }

  try {
    const { data, error } = await supabase
      .from('parish_info')
      .select('*')
      .eq('id', 1)
      .maybeSingle();

    if (error) throw error;
    if (data) {
      writeCache(CACHE_KEYS.parishInfo, data as ParishInfo);
      return data as ParishInfo;
    }
    return SAMPLE_PARISH_INFO;
  } catch {
    return readCache<ParishInfo>(CACHE_KEYS.parishInfo, SAMPLE_PARISH_INFO);
  }
}

// ============================================================================
// ADMIN AUTH & MUTATIONS
// ============================================================================

export async function getActiveAdminProfile(): Promise<AdminUserProfile | null> {
  if (!supabase || !isSupabaseConfigured) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id, email, full_name, role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  return data as AdminUserProfile;
}

function toError(err: unknown, fallback: string): Error {
  if (err instanceof Error) return err;
  if (err && typeof err === 'object' && 'message' in err) {
    const obj = err as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [obj.message, obj.details, obj.hint].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );
    if (parts.length > 0) return new Error(parts.join(' — '));
  }
  return new Error(fallback);
}

export async function fetchAllBulletinsForAdmin(): Promise<WeeklyBulletin[]> {
  if (!supabase || !isSupabaseConfigured) return SAMPLE_BULLETINS;

  const { data, error } = await supabase
    .from('weekly_bulletins')
    .select('*')
    .order('week_start', { ascending: false })
    .limit(12);

  if (error) throw toError(error, 'Failed to fetch bulletins.');
  return (data ?? []) as WeeklyBulletin[];
}

export async function upsertWeeklyBulletin(
  bulletin: Omit<WeeklyBulletin, 'id' | 'updated_at'> & { id?: string }
): Promise<WeeklyBulletin> {
  if (!supabase) throw new Error('Supabase is not configured');

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Omit id so onConflict: 'week_start' safely updates existing weeks or creates a new UUID for new weeks
  const { id: _omitId, ...rest } = bulletin;
  const payload = {
    ...rest,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('weekly_bulletins')
    .upsert(payload, { onConflict: 'week_start' })
    .select('*')
    .single();

  if (error) throw toError(error, 'Failed to save bulletin.');
  return data as WeeklyBulletin;
}

export async function uploadFlyerFile(file: File): Promise<{
  publicUrl: string;
  storagePath: string;
  mimeType: string;
}> {
  if (!supabase) throw new Error('Supabase is not configured');

  const allowedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
  if (!allowedTypes.has(file.type)) {
    throw new Error('Only PDF, PNG, JPG, or WebP flyers are allowed.');
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Flyer file must be 5 MB or smaller.');
  }

  const today = new Date().toISOString().slice(0, 10);
  const safeName = sanitizeStorageFileName(file.name);
  const storagePath = `${today}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage.from('flyers').upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) throw toError(error, 'Flyer upload failed.');

  const { data } = supabase.storage.from('flyers').getPublicUrl(storagePath);
  return {
    publicUrl: data.publicUrl,
    storagePath,
    mimeType: file.type,
  };
}

export async function getActivePushSubscriberCount(): Promise<number> {
  if (!supabase || !isSupabaseConfigured) return 0;
  const { data, error } = await supabase.rpc('get_active_subscriber_count');
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
}

export async function publishBulletinAndNotify(params: {
  bulletinId: string;
  sendPush: boolean;
  pushTitle?: string;
  pushBody?: string;
}): Promise<{ published: boolean; sent: number; deactivated: number }> {
  if (!supabase) throw new Error('Supabase is not configured');

  const { data, error } = await supabase.functions.invoke('publish-and-notify', {
    body: params,
  });

  if (error) throw toError(error, 'Failed to publish bulletin.');
  return data as { published: boolean; sent: number; deactivated: number };
}

export async function saveRegularScheduleItem(
  item: Omit<RegularScheduleItem, 'id'> & { id?: string }
): Promise<RegularScheduleItem> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('regular_schedules')
    .upsert({ ...item, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw toError(error, 'Failed to save schedule item.');
  return data as RegularScheduleItem;
}

export async function deleteRegularScheduleItem(id: string): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { error } = await supabase.from('regular_schedules').delete().eq('id', id);
  if (error) throw toError(error, 'Failed to delete schedule item.');
}

export async function updateParishInfo(info: ParishInfo): Promise<ParishInfo> {
  if (!supabase) throw new Error('Supabase is not configured');
  const { data, error } = await supabase
    .from('parish_info')
    .upsert({ ...info, id: 1, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw toError(error, 'Failed to update parish info.');
  return data as ParishInfo;
}

export async function fetchAuditLogs(limit = 50): Promise<AuditLogEntry[]> {
  if (!supabase || !isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, actor_email, actor_role, action, table_name, record_id, change_summary, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toError(error, 'Failed to load audit logs.');
  return (data ?? []) as AuditLogEntry[];
}
