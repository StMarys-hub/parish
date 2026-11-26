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

  it('orders unread and read sections by 3-tier priority (urgent -> important -> normal) while preserving in-place read behavior', () => {
    const prioritized = [
      { id: 'n1', priority: 'normal' as const },
      { id: 'i1', priority: 'important' as const },
      { id: 'u1', priority: 'urgent' as const },
      { id: 'r-normal', priority: 'normal' as const },
      { id: 'r-urgent', priority: 'urgent' as const },
    ];
    const isUnread = (key: string) => !key.startsWith('bulletin:r-');
    const expanded = new Set<string>(['bulletin:r-urgent']);
    const deferred = new Set<string>();

    const { unreadItems, readItems } = partitionAnnouncementsSmartOrder(
      prioritized,
      (i) => `bulletin:${i.id}`,
      isUnread,
      expanded,
      deferred,
      (i) => i.priority
    );

    expect(unreadItems.map((i) => i.id)).toEqual(['u1', 'i1', 'n1']);
    expect(readItems.map((i) => i.id)).toEqual(['r-urgent', 'r-normal']);
  });
});
