import { ThemeId } from '../types/parish';

export interface ParishThemeDefinition {
  id: ThemeId;
  orderLabel: string;
  name: string;
  syriacOrMalayalamSubtitle: string;
  description: string;
  primarySwatch: string;
  accentSwatch: string;
  softSwatch: string;
  themeColorMeta: string;
}

export const PARISH_THEMES: readonly ParishThemeDefinition[] = [
  {
    id: 'subara',
    orderLabel: 'Season 1',
    name: 'Subara (Annunciation)',
    syriacOrMalayalamSubtitle: 'Season of Annunciation & Nativity',
    description: 'Royal Marian Blue & Warm Gold accents',
    primarySwatch: '#1D3F72',
    accentSwatch: '#B8860B',
    softSwatch: '#FEF8E7',
    themeColorMeta: '#1D3F72',
  },
  {
    id: 'denaha',
    orderLabel: 'Season 2',
    name: 'Denaha (Epiphany)',
    syriacOrMalayalamSubtitle: 'Manifestation of the Lord',
    description: 'Radiant Ivory, Epiphany Blue & Warm Gold',
    primarySwatch: '#0F4C81',
    accentSwatch: '#B45309',
    softSwatch: '#F0F8FF',
    themeColorMeta: '#0F4C81',
  },
  {
    id: 'sauma-ramba',
    orderLabel: 'Season 3',
    name: 'Sauma Ramba (Great Fast)',
    syriacOrMalayalamSubtitle: '50-Day Great Fast / Lent',
    description: 'Deep Liturgical Violet & Muted Slate',
    primarySwatch: '#4C1D57',
    accentSwatch: '#6D28D9',
    softSwatch: '#F5F0F9',
    themeColorMeta: '#4C1D57',
  },
  {
    id: 'qyamta',
    orderLabel: 'Season 4',
    name: 'Qyamta (Resurrection)',
    syriacOrMalayalamSubtitle: 'Easter & the 50 Great Days',
    description: 'Paschal White, Burnished Gold & Soft Amber',
    primarySwatch: '#7A4E00',
    accentSwatch: '#B45309',
    softSwatch: '#FEF9E6',
    themeColorMeta: '#7A4E00',
  },
  {
    id: 'sliha',
    orderLabel: 'Season 5',
    name: 'Sliha (Season of Apostles)',
    syriacOrMalayalamSubtitle: 'Pentecost & Apostolic Mission',
    description: 'Fiery Pentecost Crimson & Warm Cream',
    primarySwatch: '#8B1E24',
    accentSwatch: '#B45309',
    softSwatch: '#FEF2F2',
    themeColorMeta: '#8B1E24',
  },
  {
    id: 'qaita',
    orderLabel: 'Season 6',
    name: 'Qaita (Summer)',
    syriacOrMalayalamSubtitle: 'Fruits of the Spirit & Martyrs',
    description: 'Deep Emerald / Olive Green & Warm Sand',
    primarySwatch: '#1B5E3A',
    accentSwatch: '#9A6B11',
    softSwatch: '#ECFDF3',
    themeColorMeta: '#1B5E3A',
  },
  {
    id: 'elijah-sliba-moses',
    orderLabel: 'Season 7',
    name: 'Elijah–Sliba–Moses',
    syriacOrMalayalamSubtitle: 'Eliya, Holy Cross & Moses',
    description: 'Warm Saffron Amber & Deep Maroon',
    primarySwatch: '#6E2323',
    accentSwatch: '#C2590C',
    softSwatch: '#FFF7ED',
    themeColorMeta: '#6E2323',
  },
  {
    id: 'mushah',
    orderLabel: 'Season 8',
    name: 'Mushah (Season of Moses)',
    syriacOrMalayalamSubtitle: 'Fulfillment of the Law',
    description: 'Rich Terracotta, Warm Ochre & Charcoal',
    primarySwatch: '#7C3A21',
    accentSwatch: '#B45309',
    softSwatch: '#FDF3EC',
    themeColorMeta: '#7C3A21',
  },
  {
    id: 'qudash-edta',
    orderLabel: 'Season 9',
    name: 'Qudash Edta (Dedication)',
    syriacOrMalayalamSubtitle: 'Dedication of the Church',
    description: 'Regal Burgundy / Imperial Purple & Gold',
    primarySwatch: '#581C4A',
    accentSwatch: '#B8860B',
    softSwatch: '#FAF0F7',
    themeColorMeta: '#581C4A',
  },
  {
    id: 'classic',
    orderLabel: 'Theme 10',
    name: 'Classic Parish Default',
    syriacOrMalayalamSubtitle: 'Original Sanctuary Navy & Gold',
    description: 'Sanctuary Navy (#1E3A5F) & Liturgical Gold',
    primarySwatch: '#1E3A5F',
    accentSwatch: '#B8860B',
    softSwatch: '#FEF7E0',
    themeColorMeta: '#1E3A5F',
  },
] as const;

export const THEME_BY_ID: ReadonlyMap<ThemeId, ParishThemeDefinition> = new Map(
  PARISH_THEMES.map((theme) => [theme.id, theme])
);
