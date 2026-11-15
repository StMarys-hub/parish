import { describe, expect, it } from 'vitest';
import {
  getDenahaStartUtcMs,
  getEasterSundayUtcMs,
  getSubaraStartUtcMs,
  resolveLiturgicalSeason,
} from '../liturgicalCalendar';

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

describe('Syro-Malabar Liturgical Calendar Math', () => {
  it('computes accurate Gregorian Easter Sundays (Computus)', () => {
    expect(iso(getEasterSundayUtcMs(2008))).toBe('2008-03-23'); // Very early Easter
    expect(iso(getEasterSundayUtcMs(2019))).toBe('2019-04-21'); // Late Easter
    expect(iso(getEasterSundayUtcMs(2024))).toBe('2024-03-31');
    expect(iso(getEasterSundayUtcMs(2025))).toBe('2025-04-20');
    expect(iso(getEasterSundayUtcMs(2026))).toBe('2026-04-05');
    expect(iso(getEasterSundayUtcMs(2027))).toBe('2027-03-28');
    expect(iso(getEasterSundayUtcMs(2038))).toBe('2038-04-25'); // Latest possible Easter
  });

  it('anchors Subara strictly to Sunday in Nov 27 – Dec 3', () => {
    expect(iso(getSubaraStartUtcMs(2025))).toBe('2025-11-30');
    expect(iso(getSubaraStartUtcMs(2026))).toBe('2026-11-29');
    expect(iso(getSubaraStartUtcMs(2027))).toBe('2027-11-28');
    expect(iso(getSubaraStartUtcMs(2028))).toBe('2028-12-03');
    expect(iso(getSubaraStartUtcMs(2029))).toBe('2029-12-02');
    for (let y = 2020; y <= 2040; y++) {
      const ms = getSubaraStartUtcMs(y);
      const d = new Date(ms);
      expect(d.getUTCDay()).toBe(0);
      expect(ms).toBeGreaterThanOrEqual(Date.UTC(y, 10, 27));
      expect(ms).toBeLessThanOrEqual(Date.UTC(y, 11, 3));
    }
  });

  it('handles Denaha when Jan 1 is Sunday (e.g. 2023 -> Jan 6)', () => {
    expect(iso(getDenahaStartUtcMs(2023))).toBe('2023-01-06');
    expect(iso(getDenahaStartUtcMs(2026))).toBe('2026-01-04'); // Sunday Jan 4
    expect(iso(getDenahaStartUtcMs(2027))).toBe('2027-01-03'); // Sunday Jan 3
  });

  it('resolves every season correctly across 2025-2026 liturgical year', () => {
    expect(resolveLiturgicalSeason('2025-11-29').seasonId).toBe('qudash-edta');
    expect(resolveLiturgicalSeason('2025-11-30').seasonId).toBe('subara');
    expect(resolveLiturgicalSeason('2025-12-25')).toMatchObject({
      seasonId: 'subara',
      isNativityWindow: true,
    });
    expect(resolveLiturgicalSeason('2026-01-04').seasonId).toBe('denaha');
    // 2026 Easter = 2026-04-05 -> 49 days prior = 2026-02-15
    expect(resolveLiturgicalSeason('2026-02-14').seasonId).toBe('denaha');
    expect(resolveLiturgicalSeason('2026-02-15').seasonId).toBe('sauma-ramba');
    expect(resolveLiturgicalSeason('2026-04-04').seasonId).toBe('sauma-ramba');
    expect(resolveLiturgicalSeason('2026-04-05')).toMatchObject({
      seasonId: 'qyamta',
      weekOfSeason: 1,
    });
    // 49 days after Easter = 2026-05-24 (Pentecost / Sliha)
    expect(resolveLiturgicalSeason('2026-05-24').seasonId).toBe('sliha');
    // +49 = 2026-07-12 (Qaita)
    expect(resolveLiturgicalSeason('2026-07-12').seasonId).toBe('qaita');
    // +49 = 2026-08-30 (Elijah-Sliba-Moses)
    expect(resolveLiturgicalSeason('2026-08-30').seasonId).toBe('elijah-sliba-moses');
    // 2026 Subara = 2026-11-29 -> -49 days = 2026-10-11 (Mushah)
    expect(resolveLiturgicalSeason('2026-10-11').seasonId).toBe('mushah');
    // -28 days = 2026-11-01 (Qudash Edta)
    expect(resolveLiturgicalSeason('2026-11-01').seasonId).toBe('qudash-edta');
    expect(resolveLiturgicalSeason('2026-11-14')).toMatchObject({
      seasonId: 'qudash-edta',
      weekOfSeason: 2,
    });
    expect(resolveLiturgicalSeason('2026-11-29').seasonId).toBe('subara');
  });

  it('covers early (2008) and very late (2038) Easter years with zero gaps across all days', () => {
    for (const year of [2008, 2026, 2038]) {
      const start = Date.UTC(year, 0, 1);
      const end = Date.UTC(year + 1, 0, 1);
      for (let ms = start; ms < end; ms += 86_400_000) {
        const res = resolveLiturgicalSeason(new Date(ms).toISOString().slice(0, 10));
        expect(res.seasonId).toBeTruthy();
        expect(res.weekOfSeason).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
