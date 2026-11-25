import { stripFormattingMarkers } from './textFormat';

export interface CalendarEventInput {
  title: string;
  description?: string | null;
  dateTimeLabel?: string | null;
  location?: string | null;
  referenceYear?: number;
}

export interface ParsedCalendarRange {
  start: Date;
  end: Date;
  allDay: boolean;
}

const MONTH_MAP: Record<string, number> = {
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

/**
 * Parses common parish date/time strings such as:
 * - "Thu, Nov 19 at 7:00 PM"
 * - "Nov 24 • 6:30 PM"
 * - "June 14, 2026"
 * - "2026-11-29 10:00 AM"
 */
export function parseParishDateTimeRange(
  dateTimeLabel: string | null | undefined,
  now: Date = new Date()
): ParsedCalendarRange | null {
  if (!dateTimeLabel?.trim()) return null;
  const text = dateTimeLabel.trim();

  let year = now.getFullYear();
  let month: number | null = null;
  let day: number | null = null;

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]) - 1;
    day = Number(isoMatch[3]);
  } else {
    const monthDayMatch = text.match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?/i
    );
    if (monthDayMatch) {
      month = MONTH_MAP[monthDayMatch[1].toLowerCase()] ?? null;
      day = Number(monthDayMatch[2]);
      if (monthDayMatch[3]) {
        year = Number(monthDayMatch[3]);
      } else if (month !== null) {
        // If date is > 180 days in the past, assume next year
        const candidate = new Date(year, month, day);
        if (now.getTime() - candidate.getTime() > 180 * 86_400_000) {
          year += 1;
        }
      }
    }
  }

  if (month === null || day === null || day < 1 || day > 31) return null;

  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] ?? '0');
    const period = timeMatch[3].toLowerCase();
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;

    const start = new Date(year, month, day, hours, minutes, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000); // Default 1 hour
    return { start, end, allDay: false };
  }

  const start = new Date(year, month, day, 0, 0, 0, 0);
  const end = new Date(year, month, day + 1, 0, 0, 0, 0);
  return { start, end, allDay: true };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatIcsLocalDateTime(dt: Date): string {
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
}

function formatIcsDateOnly(dt: Date): string {
  return `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;
}

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildIcsContent(input: CalendarEventInput, now: Date = new Date()): string | null {
  const range = parseParishDateTimeRange(input.dateTimeLabel, now);
  if (!range) return null;

  const summary = escapeIcsText(stripFormattingMarkers(input.title).trim());
  const description = escapeIcsText(
    stripFormattingMarkers(input.description ?? '').trim().slice(0, 800)
  );
  const location = escapeIcsText(
    (input.location || "St. Mary's Syro-Malabar Catholic Church, Charlotte, NC").trim()
  );
  const uid = `parish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@stmarysyroclt.org`;
  const dtStamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;

  const dtStartLine = range.allDay
    ? `DTSTART;VALUE=DATE:${formatIcsDateOnly(range.start)}`
    : `DTSTART:${formatIcsLocalDateTime(range.start)}`;
  const dtEndLine = range.allDay
    ? `DTEND;VALUE=DATE:${formatIcsDateOnly(range.end)}`
    : `DTEND:${formatIcsLocalDateTime(range.end)}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//St. Mary's Syro-Malabar Parish//Parish PWA//EN",
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    dtStartLine,
    dtEndLine,
    `SUMMARY:${summary}`,
    ...(description ? [`DESCRIPTION:${description}`] : []),
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

export function buildGoogleCalendarUrl(
  input: CalendarEventInput,
  now: Date = new Date()
): string | null {
  const range = parseParishDateTimeRange(input.dateTimeLabel, now);
  if (!range) return null;

  const dates = range.allDay
    ? `${formatIcsDateOnly(range.start)}/${formatIcsDateOnly(range.end)}`
    : `${formatIcsLocalDateTime(range.start)}/${formatIcsLocalDateTime(range.end)}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: stripFormattingMarkers(input.title).trim(),
    dates,
    details: stripFormattingMarkers(input.description ?? '').trim().slice(0, 600),
    location: (input.location || "St. Mary's Syro-Malabar Catholic Church, Charlotte, NC").trim(),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcsEvent(input: CalendarEventInput): boolean {
  const ics = buildIcsContent(input);
  if (!ics) return false;

  const slug =
    stripFormattingMarkers(input.title)
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32) || 'Parish_Event';

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return true;
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}
