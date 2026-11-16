import { beforeEach, describe, expect, it } from 'vitest';
import { isAnnouncementRead, markAnnouncementKeysRead } from '../readReceipts';

describe('readReceipts tracker', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('marks announcement keys read and persists them in localStorage', () => {
    expect(isAnnouncementRead('bulletin:ann-1')).toBe(false);
    markAnnouncementKeysRead(['bulletin:ann-1', 'special:sp-1']);
    expect(isAnnouncementRead('bulletin:ann-1')).toBe(true);
    expect(isAnnouncementRead('special:sp-1')).toBe(true);
    expect(isAnnouncementRead('ministry:m-1')).toBe(false);
  });
});
