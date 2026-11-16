import { useCallback, useEffect, useState } from 'react';

const READ_STORAGE_KEY = 'parish_read_announcements_v1';
const MAX_STORED_IDS = 400;

function loadReadSet(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

function persistReadSet(set: Set<string>): void {
  try {
    const arr = Array.from(set).slice(-MAX_STORED_IDS);
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(arr));
  } catch {
    // Ignore storage quota / private mode failures
  }
}

export function isAnnouncementRead(key: string): boolean {
  return loadReadSet().has(key);
}

export function markAnnouncementKeysRead(keys: string[]): Set<string> {
  const current = loadReadSet();
  let changed = false;
  for (const key of keys) {
    if (key && !current.has(key)) {
      current.add(key);
      changed = true;
    }
  }
  if (changed) {
    persistReadSet(current);
  }
  return current;
}

/**
 * Local-storage backed read tracker with zero network calls.
 * Supports tap-to-mark-read and batch "Mark all read" actions across announcement feeds.
 */
export function useReadAnnouncements() {
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadSet());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === READ_STORAGE_KEY) {
        setReadIds(loadReadSet());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const markRead = useCallback((key: string) => {
    setReadIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      persistReadSet(next);
      return next;
    });
  }, []);

  const markManyRead = useCallback((keys: string[]) => {
    setReadIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const k of keys) {
        if (k && !next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      if (!changed) return prev;
      persistReadSet(next);
      return next;
    });
  }, []);

  const isUnread = useCallback((key: string) => !readIds.has(key), [readIds]);

  return { readIds, isUnread, markRead, markManyRead };
}
