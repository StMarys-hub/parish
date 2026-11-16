import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { ReactionSummary, ReactionTargetType } from '../types/parish';

const DEVICE_TOKEN_KEY = 'parish_anon_device_token_v1';
const REACTIONS_CACHE_KEY = 'parish_cache_reactions_v1';

export type ReactionMap = Record<string, ReactionSummary>;

export function reactionKey(targetType: ReactionTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

export function getOrCreateAnonymousDeviceToken(): string {
  try {
    const existing = localStorage.getItem(DEVICE_TOKEN_KEY);
    if (existing && existing.length >= 12) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(DEVICE_TOKEN_KEY, generated);
    return generated;
  } catch {
    return 'parish-anon-session';
  }
}

function readReactionsCache(): ReactionMap {
  try {
    const raw = localStorage.getItem(REACTIONS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as ReactionMap) : {};
  } catch {
    return {};
  }
}

function writeReactionsCache(map: ReactionMap): void {
  try {
    localStorage.setItem(REACTIONS_CACHE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Batch-fetches appreciation counts in one RPC call per feed load (zero N+1 queries).
 */
export async function fetchReactionSummaries(): Promise<ReactionMap> {
  if (!supabase || !isSupabaseConfigured) {
    return readReactionsCache();
  }

  try {
    const deviceToken = getOrCreateAnonymousDeviceToken();
    const { data, error } = await supabase.rpc('get_reaction_summaries', {
      p_device_token: deviceToken,
    });
    if (error) throw error;

    const map: ReactionMap = {};
    for (const row of (data ?? []) as Array<{
      target_type: ReactionTargetType;
      target_id: string;
      reaction_count: number;
      reacted_by_me: boolean;
    }>) {
      map[reactionKey(row.target_type, row.target_id)] = {
        count: Number(row.reaction_count) || 0,
        reactedByMe: Boolean(row.reacted_by_me),
      };
    }
    writeReactionsCache(map);
    return map;
  } catch {
    return readReactionsCache();
  }
}

export async function toggleReactionRemote(
  targetType: ReactionTargetType,
  targetId: string
): Promise<ReactionSummary> {
  const cached = readReactionsCache();
  const key = reactionKey(targetType, targetId);
  const current = cached[key] ?? { count: 0, reactedByMe: false };

  if (!supabase || !isSupabaseConfigured) {
    const next: ReactionSummary = {
      reactedByMe: !current.reactedByMe,
      count: Math.max(0, current.count + (current.reactedByMe ? -1 : 1)),
    };
    writeReactionsCache({ ...cached, [key]: next });
    return next;
  }

  const deviceToken = getOrCreateAnonymousDeviceToken();
  const { data, error } = await supabase.rpc('toggle_announcement_reaction', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_device_token: deviceToken,
    p_reaction_type: 'pray',
  });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  const result: ReactionSummary = {
    count: Number((row as { reaction_count?: number })?.reaction_count ?? 0),
    reactedByMe: Boolean((row as { reacted_by_me?: boolean })?.reacted_by_me),
  };
  writeReactionsCache({ ...cached, [key]: result });
  return result;
}
