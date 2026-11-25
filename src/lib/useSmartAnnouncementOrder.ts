import { useMemo } from 'react';

export interface SmartOrderResult<T> {
  unreadItems: T[];
  readItems: T[];
}

/**
 * Deterministic unread-first ordering with strict Anti-Jump Guardrail:
 * - Unread items stay in the top list.
 * - Any card that was unread when opened (`deferredKeys`) remains anchored in its top position
 *   until collapsed, swiped, or refreshed.
 * - Already-read cards stay in the bottom `readItems` section even when expanded, so expanding
 *   a read notice opens it right in place without jumping to the unread list.
 */
export function partitionAnnouncementsSmartOrder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  isUnread: (key: string) => boolean,
  _expandedKeys: ReadonlySet<string>,
  deferredKeys: ReadonlySet<string>
): SmartOrderResult<T> {
  const unreadItems: T[] = [];
  const readItems: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    const keepInTopSection = isUnread(key) || deferredKeys.has(key);

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
