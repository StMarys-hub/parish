import { ActionAttachment } from '../types/parish';

export interface AttentionBadgesResult {
  isNew48h: boolean;
  urgencyLabel: 'TOMORROW' | 'TODAY' | 'THIS WEEK' | null;
  actionRequired: boolean;
  hasFlyer: boolean;
  hasLink: boolean;
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

function parseUpcomingEventUtcMs(dateTimeLabel: string | null | undefined, now: Date): number | null {
  if (!dateTimeLabel) return null;
  const text = dateTimeLabel.trim();
  if (!text) return null;

  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  // 1. Explicit "Month Day" (e.g., "Nov 16", "Fri, Nov 21 at 7:00 PM", "Dec 25, 2026")
  const monthDayMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i
  );
  if (monthDayMatch) {
    const month = MONTH_INDEX[monthDayMatch[1].toLowerCase()];
    const day = Number(monthDayMatch[2]);
    let year = monthDayMatch[3] ? Number(monthDayMatch[3]) : now.getFullYear();
    if (month !== undefined && day >= 1 && day <= 31) {
      let candidate = Date.UTC(year, month, day);
      if (!monthDayMatch[3] && candidate < todayUtc - 180 * MS_PER_DAY) {
        year += 1;
        candidate = Date.UTC(year, month, day);
      }
      return candidate;
    }
  }

  // 2. Numeric MM/DD(/YYYY) or YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    return Date.UTC(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }

  // 3. Weekday mention without date (e.g., "Tomorrow", "This Saturday 5:00 PM")
  if (/\btoday\b/i.test(text)) return todayUtc;
  if (/\btomorrow\b/i.test(text)) return todayUtc + MS_PER_DAY;

  const weekdayMatch = text.match(
    /\b(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)\b/i
  );
  if (weekdayMatch && !/\bevery\b/i.test(text)) {
    const targetDow = WEEKDAY_INDEX[weekdayMatch[1].toLowerCase()];
    if (targetDow !== undefined) {
      const todayDow = new Date(todayUtc).getUTCDay();
      const delta = (targetDow - todayDow + 7) % 7;
      return todayUtc + delta * MS_PER_DAY;
    }
  }

  return null;
}

/**
 * Computes pre-attentive urgency & metadata micro-badges in O(1) time.
 */
export function computeAttentionBadges(input: {
  postedAtIso?: string | null;
  dateTimeLabel?: string | null;
  title?: string;
  body?: string;
  actions?: ActionAttachment[];
  hasExplicitFlyer?: boolean;
  hasExplicitLink?: boolean;
  now?: Date;
}): AttentionBadgesResult {
  const now = input.now ?? new Date();
  const nowMs = now.getTime();

  let isNew48h = false;
  if (input.postedAtIso) {
    const postedMs = Date.parse(input.postedAtIso);
    if (Number.isFinite(postedMs)) {
      const ageHours = (nowMs - postedMs) / MS_PER_HOUR;
      // Within last 72 hours per progressive disclosure NEW badge lifecycle
      isNew48h = ageHours >= -2 && ageHours <= 72;
    }
  }

  let urgencyLabel: AttentionBadgesResult['urgencyLabel'] = null;
  const eventUtc = parseUpcomingEventUtcMs(input.dateTimeLabel, now);
  if (eventUtc !== null) {
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((eventUtc - todayUtc) / MS_PER_DAY);
    if (diffDays === 0) urgencyLabel = 'TODAY';
    else if (diffDays === 1) urgencyLabel = 'TOMORROW';
    else if (diffDays >= 2 && diffDays <= 3) urgencyLabel = 'THIS WEEK';
  }

  const actions = input.actions ?? [];
  const hasFormAction = actions.some((a) => a.kind === 'form');
  const hasFlyer = Boolean(input.hasExplicitFlyer) || actions.some((a) => a.kind === 'flyer');
  const hasLink =
    Boolean(input.hasExplicitLink) ||
    actions.some((a) => a.kind === 'external_url' || a.kind === 'drive');

  const combinedText = `${input.title ?? ''} ${input.body ?? ''}`;
  const actionRequired =
    hasFormAction ||
    /\b(rsvp|register|registration|sign[- ]?up|deadline|due\s+(by|date)|submit\s+form|annual\s+dues|contribution\s+due)\b/i.test(
      combinedText
    );

  return {
    isNew48h,
    urgencyLabel,
    actionRequired,
    hasFlyer,
    hasLink,
  };
}

/**
 * Picks which schedule group should expand by default based on today's day of week:
 * - Saturday or Sunday -> Sunday Holy Qurbana group
 * - Monday through Friday -> Weekday group (falling back to Sunday if no Weekday group exists)
 */
export function inferDefaultScheduleGroupKey(
  groupNames: readonly string[],
  now: Date = new Date()
): string | null {
  if (groupNames.length === 0) return null;
  const dow = now.getDay(); // 0 = Sun, 6 = Sat
  const isWeekendFocus = dow === 0 || dow === 6;

  if (isWeekendFocus) {
    const sundayGroup = groupNames.find((g) => /sunday/i.test(g));
    if (sundayGroup) return sundayGroup;
  } else {
    const weekdayGroup = groupNames.find((g) => /weekday|tue|wed|thu|fri|daily/i.test(g));
    if (weekdayGroup) return weekdayGroup;
    const sundayGroup = groupNames.find((g) => /sunday/i.test(g));
    if (sundayGroup) return sundayGroup;
  }

  return groupNames[0] ?? null;
}

/**
 * Checks whether a DailyScheduleEntry dayLabel corresponds to today's day of week
 * (falling back to Sunday on Sunday/Saturday or Monday).
 */
export function isTodayOrUpcomingDayLabel(dayLabel: string, now: Date = new Date()): boolean {
  const dow = now.getDay();
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const todayName = names[dow];
  if (dayLabel.toLowerCase().includes(todayName)) return true;
  // Special handling for labels like "First Friday" on Fridays
  if (dow === 5 && /friday/i.test(dayLabel)) return true;
  return false;
}
