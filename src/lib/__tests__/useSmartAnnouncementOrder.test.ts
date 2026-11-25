import { describe, expect, it } from 'vitest';
import { partitionAnnouncementsSmartOrder } from '../useSmartAnnouncementOrder';

describe('partitionAnnouncementsSmartOrder', () => {
  const items = [
    { id: '1', title: 'Unread Notice' },
    { id: '2', title: 'Read Notice' },
  ];

  it('keeps an expanded already-read notice in the read section instead of moving it to unread', () => {
    const isUnread = (key: string) => key === 'special:1';
    const expanded = new Set<string>(['special:2']);
    const deferred = new Set<string>();

    const { unreadItems, readItems } = partitionAnnouncementsSmartOrder(
      items,
      (i) => `special:${i.id}`,
      isUnread,
      expanded,
      deferred
    );

    expect(unreadItems.map((i) => i.id)).toEqual(['1']);
    expect(readItems.map((i) => i.id)).toEqual(['2']);
  });

  it('keeps a freshly read notice anchored in the top list while deferred (still open)', () => {
    const isUnread = () => false;
    const expanded = new Set<string>(['special:1']);
    const deferred = new Set<string>(['special:1']);

    const { unreadItems, readItems } = partitionAnnouncementsSmartOrder(
      items,
      (i) => `special:${i.id}`,
      isUnread,
      expanded,
      deferred
    );

    expect(unreadItems.map((i) => i.id)).toEqual(['1']);
    expect(readItems.map((i) => i.id)).toEqual(['2']);
  });
});
