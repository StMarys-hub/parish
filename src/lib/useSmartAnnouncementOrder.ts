import { useMemo } from 'react';

export interface SmartOrderResult<T> {
  unreadItems: T[];
  readItems: T[];
}

/**
 * Deterministic unread-first ordering with strict Anti-Jump Guardrail:
 * - Unread items stay in the top list.
 * - Any card that is currently open (`expandedKeys`) or was just read while open (`deferredKeys`)
 *   remains anchored in its current top position until collapsed, swiped, or refreshed.
 * - Once collapsed/swiped/reloaded, read cards move cleanly into the bottom `readItems` section.
 */
export function partitionAnnouncementsSmartOrder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  isUnread: (key: string) => boolean,
  expandedKeys: ReadonlySet<string>,
  deferredKeys: ReadonlySet<string>
): SmartOrderResult<T> {
  const unreadItems: T[] = [];
  const readItems: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    const keepInTopSection =
      isUnread(key) || expandedKeys.has(key) || deferredKeys.has(key);

    if (keepInTopSection) {
      unreadItems.push(item);
    } else {
      readItems.push(item);
    }
  }

  return { unreadItems, readItems };
}

export function useSmartAnnouncementOrder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  isUnread: (key: string) => boolean,
  expandedKeys: ReadonlySet<string>,
  deferredKeys: ReadonlySet<string>
): SmartOrderResult<T> {
  return useMemo(
    () =>
      partitionAnnouncementsSmartOrder(
        items,
        getKey,
        isUnread,
        expandedKeys,
        deferredKeys
      ),
    [items, getKey, isUnread, expandedKeys, deferredKeys]
  );
}
