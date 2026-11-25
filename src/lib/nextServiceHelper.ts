import { DailyScheduleEntry, RegularScheduleItem } from '../types/parish';

export interface NextServiceSummary {
  whenLabel: string;
  title: string;
  fullText: string;
}

function parseStartMinutes(timeStr: string | undefined | null): number | null {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = Number(m[2] ?? '0');
  const period = m[3].toLowerCase();
  if (period === 'pm' && hours < 12) hours += 12;
  if (period === 'am' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function toLocalIsoDate(dt: Date): string {
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Computes the single next upcoming parish service (Holy Qurbana / Rosary / Adoration)
 * from the active weekly bulletin's daily_schedule, falling back to regularSchedules.
 */
export function findNextParishService(
  dailySchedule: readonly DailyScheduleEntry[],
  regularSchedules: readonly RegularScheduleItem[] = [],
  now: Date = new Date()
): NextServiceSummary | null {
  const todayIso = toLocalIsoDate(now);
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrowIso = toLocalIsoDate(tomorrow);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const sortedDays = [...dailySchedule].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sortedDays) {
    if (!day.date || day.date < todayIso) continue;
    for (const item of day.items) {
      const cleanTitle = (item.title || '').trim();
      if (!cleanTitle || /no scheduled|n\/a/i.test(cleanTitle)) continue;

      const mins = parseStartMinutes(item.time);
      if (day.date === todayIso && mins !== null && mins < nowMinutes - 15) {
        continue; // Already passed today
      }

      const dayWord =
        day.date === todayIso
          ? 'Today'
          : day.date === tomorrowIso
            ? 'Tomorrow'
            : (day.dayLabel || day.date).slice(0, 3);
      const whenLabel = item.time ? `${dayWord} ${item.time}` : dayWord;
      return {
        whenLabel,
        title: cleanTitle,
        fullText: `${whenLabel} — ${cleanTitle}`,
      };
    }
  }

  // Graceful fallback to active regular schedule (preferring Sunday Holy Qurbana)
  const activeRegular = regularSchedules.filter((r) => r.is_active);
  const sundayQurbana =
    activeRegular.find(
      (r) => (/sunday/i.test(r.day_label) || /sunday/i.test(r.group_name)) && /qurbana/i.test(r.title)
    ) ?? activeRegular[0];

  if (sundayQurbana) {
    const whenLabel = `${sundayQurbana.day_label} ${sundayQurbana.time_label}`.trim();
    return {
      whenLabel,
      title: sundayQurbana.title,
      fullText: `${whenLabel} — ${sundayQurbana.title}`,
    };
  }

  return null;
}
