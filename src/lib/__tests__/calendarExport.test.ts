import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarUrl,
  buildIcsContent,
  parseParishDateTimeRange,
} from '../calendarExport';

describe('calendarExport utilities', () => {
  const fixedNow = new Date(2026, 10, 15, 10, 0, 0); // Nov 15, 2026

  it('parses natural parish date & time chips into 1-hour timed events', () => {
    const range = parseParishDateTimeRange('Thu, Nov 19 at 7:00 PM', fixedNow);
    expect(range).not.toBeNull();
    expect(range?.allDay).toBe(false);
    expect(range?.start.getFullYear()).toBe(2026);
    expect(range?.start.getMonth()).toBe(10);
    expect(range?.start.getDate()).toBe(19);
    expect(range?.start.getHours()).toBe(19);
    expect(range?.end.getHours()).toBe(20);
  });

  it('builds valid RFC 5545 ICS content and Google Calendar URL', () => {
    const ics = buildIcsContent(
      {
        title: 'Feast Choir Practice',
        description: 'Arrive by **6:45 PM** at ==Main Church==.',
        dateTimeLabel: 'Nov 20 • 7:00 PM',
        location: 'Main Church',
      },
      fixedNow
    );
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Feast Choir Practice');
    expect(ics).toContain('DESCRIPTION:Arrive by 6:45 PM at Main Church.');
    expect(ics).toContain('DTSTART:20261120T190000');

    const gcal = buildGoogleCalendarUrl(
      {
        title: 'Feast Choir Practice',
        dateTimeLabel: 'Nov 20 • 7:00 PM',
      },
      fixedNow
    );
    expect(gcal).toContain('https://calendar.google.com/calendar/render?');
    expect(gcal).toContain('20261120T190000');
  });

  it('returns null gracefully when no recognizable date is present', () => {
    expect(parseParishDateTimeRange('Every Sunday', fixedNow)).toBeNull();
  });
});
