import { describe, expect, it } from 'vitest';
import {
  computeAttentionBadges,
  inferDefaultScheduleGroupKey,
} from '../announcementSignals';

describe('announcementSignals', () => {
  it('detects NEW within 48 hours, TOMORROW within 24 hours, ACTION REQUIRED, FLYER, and LINK', () => {
    const now = new Date(2026, 10, 15, 10, 0, 0); // Sun Nov 15, 2026
    const res = computeAttentionBadges({
      postedAtIso: new Date(2026, 10, 14, 15, 0, 0).toISOString(),
      dateTimeLabel: 'Mon, Nov 16 at 7:00 PM',
      title: 'Diocesan Family Retreat Registration',
      body: 'Please register before the deadline.',
      actions: [
        { label: 'Register', kind: 'form', url: 'https://forms.gle/abc' },
        { label: 'Flyer', kind: 'flyer', url: 'https://example.com/flyer.jpg' },
      ],
      now,
    });

    expect(res.isNew48h).toBe(true);
    expect(res.urgencyLabel).toBe('TOMORROW');
    expect(res.actionRequired).toBe(true);
    expect(res.hasFlyer).toBe(true);
  });

  it('infers THIS WEEK for events 2-3 days away and omits NEW after 48h', () => {
    const now = new Date(2026, 10, 15, 10, 0, 0); // Sun Nov 15
    const res = computeAttentionBadges({
      postedAtIso: new Date(2026, 10, 10, 10, 0, 0).toISOString(),
      dateTimeLabel: 'Wed, Nov 18 at 6:30 PM',
      title: 'St. Joseph Novena',
      body: 'Join us for evening prayer.',
      now,
    });

    expect(res.isNew48h).toBe(false);
    expect(res.urgencyLabel).toBe('THIS WEEK');
    expect(res.actionRequired).toBe(false);
  });

  it('selects Sunday Holy Qurbana on Sat/Sun and Weekday Holy Qurbana on Tue-Fri', () => {
    const groups = [
      'Sunday Holy Qurbana',
      'Weekday Holy Qurbana (Tue – Fri)',
      'Outreach Missions',
    ];
    const sunday = new Date(2026, 10, 15, 9, 0, 0);
    const wednesday = new Date(2026, 10, 18, 9, 0, 0);

    expect(inferDefaultScheduleGroupKey(groups, sunday)).toBe('Sunday Holy Qurbana');
    expect(inferDefaultScheduleGroupKey(groups, wednesday)).toBe(
      'Weekday Holy Qurbana (Tue – Fri)'
    );
  });
});
