import { useCallback, useEffect, useState } from 'react';

const READ_CARDS_STORAGE_KEY = 'parish_read_cards';
const LEGACY_KEYS = ['viewed_cards', 'parish_read_announcements_v1'] as const;
const THIRTY_DAYS_MS = 30 * 86_400_000;
const MAX_STORED_ENTRIES = 400;

interface ReadCardEntry {
  id: string;
  readAt: number;
}

function pruneAndParseEntries(nowMs: number): ReadCardEntry[] {
  const map = new Map<string, number>();

  // Migrate legacy keys seamlessly if present
  for (const legacyKey of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(legacyKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item) {
            map.set(item, nowMs);
          }
        }
      }
      localStorage.removeItem(legacyKey);
    } catch {
      // Ignore legacy parse issues
    }
  }

  try {
    const rawPrimary = localStorage.getItem(READ_CARDS_STORAGE_KEY);
    if (rawPrimary) {
      const parsed = JSON.parse(rawPrimary);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'string' && item) {
            map.set(item, nowMs);
          } else if (
            item &&
            typeof item === 'object' &&
            typeof (item as ReadCardEntry).id === 'string' &&
            typeof (item as ReadCardEntry).readAt === 'number'
          ) {
            const entry = item as ReadCardEntry;
            if (nowMs - entry.readAt <= THIRTY_DAYS_MS) {
              map.set(entry.id, entry.readAt);
            }
          }
        }
      }
    }
  } catch {
    // Ignore storage issues
  }

  const pruned = Array.from(map.entries())
    .map(([id, readAt]) => ({ id, readAt }))
    .sort((a, b) => a.readAt - b.readAt)
    .slice(-MAX_STORED_ENTRIES);

  return pruned;
}

function persistEntries(entries: ReadCardEntry[]): void {
  try {
    localStorage.setItem(READ_CARDS_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota / private browsing errors
  }
}

export function loadReadCardsMap(nowMs: number = Date.now()): Map<string, number> {
  const entries = pruneAndParseEntries(nowMs);
  persistEntries(entries);
  return new Map(entries.map((e) => [e.id, e.readAt]));
}

export function isAnnouncementRead(key: string, nowMs: number = Date.now()): boolean {
  return loadReadCardsMap(nowMs).has(key);
}

export function markAnnouncementKeysRead(
  keys: string[],
  nowMs: number = Date.now()
): Set<string> {
  const entries = pruneAndParseEntries(nowMs);
  const byId = new Map(entries.map((e) => [e.id, e.readAt]));
  let changed = false;

  for (const key of keys) {
    if (key && !byId.has(key)) {
      byId.set(key, nowMs);
      changed = true;
    }
  }

  const nextEntries = Array.from(byId.entries())
    .map(([id, readAt]) => ({ id, readAt }))
    .sort((a, b) => a.readAt - b.readAt)
    .slice(-MAX_STORED_ENTRIES);

  if (changed) {
    persistEntries(nextEntries);
  }
  return new Set(nextEntries.map((e) => e.id));
}

export function clearAllReadCards(): void {
  try {
    localStorage.removeItem(READ_CARDS_STORAGE_KEY);
    for (const k of LEGACY_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore
  }
}

/**
 * 100% client-side (`parish_read_cards` in localStorage, pruned at 30 days).
 * Zero Supabase writes, 0ms instant state transitions.
 */
export function useReadAnnouncements() {
  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(loadReadCardsMap().keys())
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === READ_CARDS_STORAGE_KEY) {
        setReadIds(new Set(loadReadCardsMap().keys()));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markRead = useCallback((key: string) => {
    const updated = markAnnouncementKeysRead([key]);
    setReadIds(updated);
  }, []);

  const markManyRead = useCallback((keys: string[]) => {
    const updated = markAnnouncementKeysRead(keys);
    setReadIds(updated);
  }, []);

  const resetAllRead = useCallback(() => {
    clearAllReadCards();
    setReadIds(new Set());
  }, []);

  const isUnread = useCallback((key: string) => !readIds.has(key), [readIds]);

  return { readIds, isUnread, markRead, markManyRead, resetAllRead };
}
