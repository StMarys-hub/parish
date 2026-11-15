import { PARISH_THEMES, THEME_BY_ID } from '../config/themes';
import { ThemeId, ThemeMode } from '../types/parish';
import { resolveLiturgicalSeason, LiturgicalSeasonResolution } from './liturgicalCalendar';

export interface ActiveThemeState {
  mode: ThemeMode;
  effectiveThemeId: ThemeId;
  seasonResolution: LiturgicalSeasonResolution | null;
  displayLabel: string;
}

const VALID_THEME_IDS = new Set<string>(PARISH_THEMES.map((t) => t.id));

export function isValidThemeMode(value: unknown): value is ThemeMode {
  return value === 'auto' || (typeof value === 'string' && VALID_THEME_IDS.has(value));
}

/**
 * Resolves the active theme from a configured ThemeMode ('auto' or pinned themeId),
 * falling back safely to 'classic' if date math or config resolution ever throws.
 */
export function resolveActiveTheme(mode: ThemeMode = 'auto', now?: Date): ActiveThemeState {
  try {
    if (mode === 'auto') {
      const seasonResolution = resolveLiturgicalSeason(now);
      const def = THEME_BY_ID.get(seasonResolution.seasonId);
      const displayLabel = seasonResolution.isNativityWindow
        ? `Subara / Yelda (Nativity) • Week ${seasonResolution.weekOfSeason}`
        : `${def?.name ?? 'Liturgical Season'} • Week ${seasonResolution.weekOfSeason}`;

      return {
        mode: 'auto',
        effectiveThemeId: def?.id ?? 'classic',
        seasonResolution,
        displayLabel,
      };
    }

    if (VALID_THEME_IDS.has(mode)) {
      const def = THEME_BY_ID.get(mode)!;
      return {
        mode,
        effectiveThemeId: def.id,
        seasonResolution: null,
        displayLabel: def.name,
      };
    }
  } catch {
    // Silent zero-crash fallback to Classic Parish Default
  }

  return {
    mode: 'classic',
    effectiveThemeId: 'classic',
    seasonResolution: null,
    displayLabel: 'Classic Parish Default',
  };
}

/**
 * Applies the selected theme purely via `data-theme` on `:root` without re-mounting trees.
 */
export function applyThemeToDocument(themeId: ThemeId): void {
  if (typeof document === 'undefined') return;
  const safeId: ThemeId = VALID_THEME_IDS.has(themeId) ? themeId : 'classic';
  document.documentElement.setAttribute('data-theme', safeId);

  const def = THEME_BY_ID.get(safeId);
  if (def) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', def.themeColorMeta);
    }
  }
}
