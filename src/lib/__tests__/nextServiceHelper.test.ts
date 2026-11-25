import { describe, expect, it } from 'vitest';
import { DailyScheduleEntry } from '../../types/parish';
import { findNextParishService } from '../nextServiceHelper';

describe('findNextParishService', () => {
  const schedule: DailyScheduleEntry[] = [
    {
      date: '2026-11-24',
      dayLabel: 'Tuesday',
      items: [
        { time: '6:30 PM', title: 'Rosary' },
        { time: '7:00 PM', title: 'Holy Qurbana' },
      ],
    },
    {
      date: '2026-11-25',
      dayLabel: 'Wednesday',
      items: [{ time: '7:00 PM', title: 'Holy Qurbana' }],
    },
  ];

  it('picks the next remaining service today when time has not passed', () => {
    const now = new Date(2026, 10, 24, 18, 50, 0); // 6:50 PM Nov 24
    const next = findNextParishService(schedule, [], now);
    expect(next?.fullText).toBe('Today 7:00 PM — Holy Qurbana');
  });

  it('advances cleanly to Tomorrow when all services today have passed', () => {
    const now = new Date(2026, 10, 24, 20, 0, 0); // 8:00 PM Nov 24
    const next = findNextParishService(schedule, [], now);
    expect(next?.fullText).toBe('Tomorrow 7:00 PM — Holy Qurbana');
  });
});
