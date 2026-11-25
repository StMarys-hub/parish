import { CalendarPlus, ExternalLink } from 'lucide-react';
import {
  buildGoogleCalendarUrl,
  CalendarEventInput,
  downloadIcsEvent,
  parseParishDateTimeRange,
} from '../lib/calendarExport';

interface CalendarActionMenuProps {
  event: CalendarEventInput;
}

/**
 * Compact inline "Add to Calendar" (.ics) + Google Calendar actions.
 * Renders nothing if dateTimeLabel does not contain a parseable calendar date.
 */
export function CalendarActionMenu({ event }: CalendarActionMenuProps) {
  const parsed = parseParishDateTimeRange(event.dateTimeLabel);
  if (!parsed) return null;

  const googleUrl = buildGoogleCalendarUrl(event);

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          downloadIcsEvent(event);
        }}
        title="Download .ics calendar invite (Apple, Outlook, Android)"
        className="inline-flex items-center gap-1.5 rounded-xl border border-parish-border bg-parish-canvas px-2.5 py-1.5 text-xs font-semibold text-parish-navy transition-colors hover:bg-parish-navy hover:text-white"
      >
        <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" />
        Add to Calendar (.ics)
      </button>
      {googleUrl && (
        <a
          href={googleUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Add directly to Google Calendar"
          className="inline-flex items-center gap-1 rounded-xl border border-parish-border bg-white px-2.5 py-1.5 text-xs font-semibold text-parish-muted hover:bg-parish-canvas hover:text-parish-navy"
        >
          Google Cal
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}
    </div>
  );
}
