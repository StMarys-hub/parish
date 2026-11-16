import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllReadCards,
  isAnnouncementRead,
  loadReadCardsMap,
  markAnnouncementKeysRead,
} from '../readReceipts';
import { partitionAnnouncementsSmartOrder } from '../useSmartAnnouncementOrder';

describe('readReceipts lifecycle (parish_read_cards)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores read card IDs under parish_read_cards and prunes entries older than 30 days', () => {
    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    const fortyDaysAgo = now - 40 * 86_400_000;
    localStorage.setItem(
      'parish_read_cards',
      JSON.stringify([
        { id: 'bulletin:old', readAt: fortyDaysAgo },
        { id: 'bulletin:recent', readAt: now - 5 * 86_400_000 },
      ])
    );

    const map = loadReadCardsMap(now);
    expect(map.has('bulletin:old')).toBe(false);
    expect(map.has('bulletin:recent')).toBe(true);

    markAnnouncementKeysRead(['bulletin:ann-1'], now);
    expect(isAnnouncementRead('bulletin:ann-1', now)).toBe(true);

    clearAllReadCards();
    expect(isAnnouncementRead('bulletin:ann-1', now)).toBe(false);
  });
});

describe('partitionAnnouncementsSmartOrder anti-jump guardrails', () => {
  it('keeps an open or deferred newly-read card anchored at top until collapsed/swiped', () => {
    const cards = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const readSet = new Set<string>(['b', 'c']);
    const isUnread = (k: string) => !readSet.has(k);

    // Card 'b' was just read while expanded -> stays in top unreadItems until collapsed
    const whileOpen = partitionAnnouncementsSmartOrder(
      cards,
      (x) => x.id,
      isUnread,
      new Set(['b']),
      new Set(['b'])
    );
    expect(whileOpen.unreadItems.map((x) => x.id)).toEqual(['a', 'b']);
    expect(whileOpen.readItems.map((x) => x.id)).toEqual(['c']);

    // Once collapsed and removed from deferredKeys -> moves cleanly to readItems
    const afterCollapse = partitionAnnouncementsSmartOrder(
      cards,
      (x) => x.id,
      isUnread,
      new Set(),
      new Set()
    );
    expect(afterCollapse.unreadItems.map((x) => x.id)).toEqual(['a']);
    expect(afterCollapse.readItems.map((x) => x.id)).toEqual(['b', 'c']);
  });
});
