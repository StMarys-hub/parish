import { useMemo } from 'react';
import { AnnouncementPriority, getPriorityWeight } from '../types/parish';

export interface SmartOrderResult<T> {
  unreadItems: T[];
  readItems: T[];
}

/**
 * Deterministic unread-first + priority-aware ordering with strict Anti-Jump Guardrail:
 * - Unread items stay in the top list, ordered by priority (urgent -> important -> normal)
 *   while preserving each tier's relative order (stable sort).
 * - Any card that was unread when opened (`deferredKeys`) remains anchored in its top position
 *   until collapsed, swiped, or refreshed.
 * - Already-read cards stay in the bottom `readItems` section (also ordered by priority) even
 *   when expanded, so expanding a read notice opens it right in place without jumping.
 */
export function partitionAnnouncementsSmartOrder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  isUnread: (key: string) => boolean,
  _expandedKeys: ReadonlySet<string>,
  deferredKeys: ReadonlySet<string>,
  getPriority?: (item: T) => AnnouncementPriority | null | undefined
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

  if (getPriority) {
    const byPriorityDesc = (a: T, b: T) =>
      getPriorityWeight(getPriority(b)) - getPriorityWeight(getPriority(a));
    unreadItems.sort(byPriorityDesc);
    readItems.sort(byPriorityDesc);
  }

  return { unreadItems, readItems };
}

export function useSmartAnnouncementOrder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  isUnread: (key: string) => boolean,
  expandedKeys: ReadonlySet<string>,
  deferredKeys: ReadonlySet<string>,
  getPriority?: (item: T) => AnnouncementPriority | null | undefined
): SmartOrderResult<T> {
  return useMemo(
    () =>
      partitionAnnouncementsSmartOrder(
        items,
        getKey,
        isUnread,
        expandedKeys,
        deferredKeys,
        getPriority
      ),
    [items, getKey, isUnread, expandedKeys, deferredKeys, getPriority]
  );
}
