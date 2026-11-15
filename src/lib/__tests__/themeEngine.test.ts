import { describe, expect, it } from 'vitest';
import { PARISH_THEMES } from '../../config/themes';
import { formatRoleLabel, isSuperAdminRole } from '../../types/parish';
import { isValidThemeMode, resolveActiveTheme } from '../themeEngine';

describe('Dynamic Liturgical Theme Engine & RBAC Helpers', () => {
  it('contains all 9 liturgical seasons plus Classic Parish Default (10 total)', () => {
    expect(PARISH_THEMES).toHaveLength(10);
    const ids = PARISH_THEMES.map((t) => t.id);
    expect(ids).toEqual([
      'subara',
      'denaha',
      'sauma-ramba',
      'qyamta',
      'sliha',
      'qaita',
      'elijah-sliba-moses',
      'mushah',
      'qudash-edta',
      'classic',
    ]);
  });

  it('resolves auto mode to Qudash Edta in mid-Nov 2026 and Qyamta on Easter 2026', () => {
    // Device local calendar noon avoids any DST/UTC edge
    const qudash = resolveActiveTheme('auto', new Date(2026, 10, 14, 12, 0, 0));
    expect(qudash.effectiveThemeId).toBe('qudash-edta');
    expect(qudash.displayLabel).toContain('Qudash Edta');

    const easter = resolveActiveTheme('auto', new Date(2026, 3, 5, 12, 0, 0));
    expect(easter.effectiveThemeId).toBe('qyamta');
    expect(easter.displayLabel).toContain('Qyamta');
  });

  it('supports pinning classic or any seasonal theme and falls back safely on invalid mode', () => {
    expect(resolveActiveTheme('classic').effectiveThemeId).toBe('classic');
    expect(resolveActiveTheme('sliha').effectiveThemeId).toBe('sliha');
    expect(isValidThemeMode('auto')).toBe(true);
    expect(isValidThemeMode('classic')).toBe(true);
    expect(isValidThemeMode('invalid-theme' as never)).toBe(false);
    expect(resolveActiveTheme('invalid-theme' as never).effectiveThemeId).toBe('classic');
  });

  it('enforces Super Admin / Vicar vs Trustee RBAC role helpers', () => {
    expect(isSuperAdminRole('super_admin')).toBe(true);
    expect(isSuperAdminRole('vicar')).toBe(true);
    expect(isSuperAdminRole('trustee')).toBe(false);
    expect(isSuperAdminRole('secretary')).toBe(false);
    expect(formatRoleLabel('super_admin')).toBe('Super Admin / Vicar');
    expect(formatRoleLabel('vicar')).toBe('Super Admin / Vicar');
    expect(formatRoleLabel('trustee')).toBe('Trustee');
  });
});
