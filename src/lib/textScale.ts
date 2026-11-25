export type TextScaleLevel = 'normal' | 'large' | 'xlarge';

const STORAGE_KEY = 'parish_text_scale_v1';
const SCALE_ORDER: TextScaleLevel[] = ['normal', 'large', 'xlarge'];

export function getStoredTextScale(): TextScaleLevel {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'large' || val === 'xlarge' || val === 'normal') return val;
  } catch {
    // Ignore storage errors
  }
  return 'normal';
}

export function applyTextScaleToDocument(level: TextScaleLevel): void {
  if (typeof document === 'undefined') return;
  if (level === 'normal') {
    delete document.documentElement.dataset.textScale;
  } else {
    document.documentElement.dataset.textScale = level;
  }
  try {
    localStorage.setItem(STORAGE_KEY, level);
  } catch {
    // Ignore storage errors
  }
}

export function stepTextScale(current: TextScaleLevel, delta: -1 | 1): TextScaleLevel {
  const idx = SCALE_ORDER.indexOf(current);
  const nextIdx = Math.max(0, Math.min(SCALE_ORDER.length - 1, idx + delta));
  return SCALE_ORDER[nextIdx];
}

export function formatTextScaleLabel(level: TextScaleLevel): string {
  if (level === 'large') return 'Large (112%)';
  if (level === 'xlarge') return 'Extra Large (122%)';
  return 'Standard (100%)';
}
