import { LiturgicalSeasonId } from '../types/parish';

const MS_PER_DAY = 86_400_000;

export interface LiturgicalSeasonResolution {
  seasonId: LiturgicalSeasonId;
  liturgicalYear: string;
  seasonStartIso: string;
  seasonEndIso: string;
  weekOfSeason: number;
  isNativityWindow: boolean;
}

function utcMsToIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Pure O(1) Gregorian Anonymous Computus algorithm for Qyamta (Easter Sunday).
 * Returns UTC midnight timestamp for Easter Sunday of the given Gregorian year.
 */
export function getEasterSundayUtcMs(year: number): number {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(year, month - 1, day);
}

/**
 * Syro-Malabar liturgical year anchor:
 * Subara always starts on the Sunday on or between November 27 and December 3.
 */
export function getSubaraStartUtcMs(startYear: number): number {
  const nov27 = new Date(Date.UTC(startYear, 10, 27));
  const dayOfWeek = nov27.getUTCDay(); // 0 = Sunday
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  return Date.UTC(startYear, 10, 27 + daysUntilSunday);
}

/**
 * Denaha (Epiphany) begins on the Sunday falling between January 2 and January 6,
 * or on January 6 if no Sunday falls in January 2..5 (when Jan 1 is Sunday).
 */
export function getDenahaStartUtcMs(year: number): number {
  for (let day = 2; day <= 6; day++) {
    const candidate = new Date(Date.UTC(year, 0, day));
    if (candidate.getUTCDay() === 0) {
      return candidate.getTime();
    }
  }
  return Date.UTC(year, 0, 6);
}

function parseInputToUtcMidnightMs(input?: Date | string): number {
  if (typeof input === 'string') {
    const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
    const parsed = new Date(input);
    if (Number.isFinite(parsed.getTime())) {
      return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
    }
  }

  const now = input instanceof Date && Number.isFinite(input.getTime()) ? input : new Date();
  // Use device local calendar Y/M/D normalized to UTC midnight so late-evening local time
  // doesn't prematurely cross midnight into the next UTC day.
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Resolves the active Syro-Malabar liturgical season deterministically in O(1) time.
 * Accepts a YYYY-MM-DD string (interpreted as exact calendar date) or a Date (device local day).
 */
export function resolveLiturgicalSeason(input?: Date | string): LiturgicalSeasonResolution {
  const targetMs = parseInputToUtcMidnightMs(input);
  const year = new Date(targetMs).getUTCFullYear();

  const subaraCurrentYear = getSubaraStartUtcMs(year);
  const startYear = targetMs >= subaraCurrentYear ? year : year - 1;
  const easterYear = startYear + 1;

  const subaraStart = getSubaraStartUtcMs(startYear);
  const nextSubaraStart = getSubaraStartUtcMs(easterYear);
  const denahaStart = getDenahaStartUtcMs(easterYear);

  const qyamtaStart = getEasterSundayUtcMs(easterYear);
  const saumaRambaStart = qyamtaStart - 49 * MS_PER_DAY;
  const slihaStart = qyamtaStart + 49 * MS_PER_DAY;
  const qaitaStart = slihaStart + 49 * MS_PER_DAY;
  const elijahStart = qaitaStart + 49 * MS_PER_DAY;

  const qudashEdtaStart = nextSubaraStart - 28 * MS_PER_DAY; // Last 4 Sundays before Subara
  const mushahCandidate = nextSubaraStart - 49 * MS_PER_DAY; // 7 Sundays before Subara
  const mushahStart = elijahStart < mushahCandidate ? mushahCandidate : elijahStart;

  const boundaries: Array<{ id: LiturgicalSeasonId; start: number }> = [
    { id: 'subara', start: subaraStart },
    { id: 'denaha', start: denahaStart },
    { id: 'sauma-ramba', start: saumaRambaStart },
    { id: 'qyamta', start: qyamtaStart },
    { id: 'sliha', start: slihaStart },
    { id: 'qaita', start: qaitaStart },
    { id: 'elijah-sliba-moses', start: elijahStart },
  ];

  // If Easter falls late enough that Mushah merges cleanly before Qudash Edta, skip zero-length Mushah
  if (mushahStart < qudashEdtaStart) {
    boundaries.push({ id: 'mushah', start: mushahStart });
  }
  boundaries.push({ id: 'qudash-edta', start: qudashEdtaStart });

  let activeIdx = 0;
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (targetMs >= boundaries[i].start) {
      activeIdx = i;
      break;
    }
  }

  const active = boundaries[activeIdx];
  const nextStart = activeIdx + 1 < boundaries.length ? boundaries[activeIdx + 1].start : nextSubaraStart;
  const daysSinceStart = Math.max(0, Math.floor((targetMs - active.start) / MS_PER_DAY));
  const weekOfSeason = Math.floor(daysSinceStart / 7) + 1;

  const dec25Ms = Date.UTC(startYear, 11, 25);
  const isNativityWindow = active.id === 'subara' && targetMs >= dec25Ms && targetMs < denahaStart;

  return {
    seasonId: active.id,
    liturgicalYear: `${startYear}-${easterYear}`,
    seasonStartIso: utcMsToIso(active.start),
    seasonEndIso: utcMsToIso(nextStart - MS_PER_DAY),
    weekOfSeason,
    isNativityWindow,
  };
}
