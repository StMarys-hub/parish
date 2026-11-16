import { normalizePastedUrl, sanitizeActionUrl, sanitizePlainText } from './sanitize';

export interface ParsedSpecialAnnouncement {
  title: string;
  description: string;
  eventDateLabel: string;
  locationLabel: string;
  mapsUrl: string;
  webUrl: string;
  webLinkLabel: string;
}

const URL_REGEX = /https?:\s*\/\/[^\s<>()]+/gi;
const MAPS_HOST_REGEX = /(maps\.google\.|google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i;

const DATE_LINE_REGEX =
  /\b(?:(?:mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?[,\s]+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*,?\s*\d{4})?(?:\s*(?:at|@|,|-)?\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?|\b\d{1,2}:\d{2}\s*(?:am|pm)\b/i;

function isMapsUrl(url: string): boolean {
  return MAPS_HOST_REGEX.test(url);
}

function inferWebLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('forms.gle') || lower.includes('docs.google.com/forms')) return 'Open Registration Form';
  if (lower.includes('drive.google.com')) return 'View Shared Folder';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'Watch Video / Stream';
  if (lower.includes('zoom.us') || lower.includes('meet.google.com')) return 'Join Online Meeting';
  return 'Learn More';
}

/**
 * Deterministically parses pasted WhatsApp / email plain text into a structured
 * Standalone Vicar / Special Announcement card schema while sanitizing URLs & text.
 */
export function parseSpecialAnnouncementText(rawText: string): ParsedSpecialAnnouncement {
  const cleanedRaw = sanitizePlainText(rawText).replace(/\r\n/g, '\n').trim();
  if (!cleanedRaw) {
    return {
      title: '',
      description: '',
      eventDateLabel: '',
      locationLabel: '',
      mapsUrl: '',
      webUrl: '',
      webLinkLabel: '',
    };
  }

  let mapsUrl = '';
  let webUrl = '';
  let webLinkLabel = '';

  const rawUrls = cleanedRaw.match(URL_REGEX) ?? [];
  for (const candidate of rawUrls) {
    const normalized = normalizePastedUrl(candidate).replace(/[.,;:!?)]+$/, '');
    const safe = sanitizeActionUrl(normalized);
    if (!safe) continue;
    if (isMapsUrl(safe) && !mapsUrl) {
      mapsUrl = safe;
    } else if (!isMapsUrl(safe) && !webUrl) {
      webUrl = safe;
      webLinkLabel = inferWebLabel(safe);
    }
  }

  const lines = cleanedRaw
    .split('\n')
    .map((line) => line.replace(/^[*•\-–]+\s*/, '').trim())
    .filter(Boolean);

  let title = '';
  let eventDateLabel = '';
  let locationLabel = '';
  const bodyLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check explicit labels like "Title:", "Subject:", "Date:", "Time:", "Location:", "Venue:"
    const labelMatch = line.match(
      /^(title|subject|notice|announcement|date\s*&?\s*time|date|when|time|location|venue|where|address|link|register|rsvp)\s*[:\-–]\s*(.+)$/i
    );
    if (labelMatch) {
      const key = labelMatch[1].toLowerCase();
      const val = labelMatch[2].trim();
      if ((key === 'title' || key === 'subject' || key === 'notice' || key === 'announcement') && !title) {
        title = val;
        continue;
      }
      if ((key.startsWith('date') || key === 'when' || key === 'time') && !eventDateLabel) {
        eventDateLabel = val;
        continue;
      }
      if ((key === 'location' || key === 'venue' || key === 'where' || key === 'address') && !locationLabel) {
        locationLabel = val.replace(URL_REGEX, '').trim();
        continue;
      }
      if ((key === 'link' || key === 'register' || key === 'rsvp') && !val.replace(URL_REGEX, '').trim()) {
        continue;
      }
    }

    // Use first concise non-URL line as title
    if (!title) {
      const lineWithoutUrl = line.replace(URL_REGEX, '').trim();
      if (lineWithoutUrl) {
        title = lineWithoutUrl.replace(/^\*+|\*+$/g, '').slice(0, 120);
        continue;
      }
    }

    // Detect standalone short date/time line if not yet set
    if (!eventDateLabel && line.length <= 85 && DATE_LINE_REGEX.test(line)) {
      const cleanedDateLine = line.replace(URL_REGEX, '').trim();
      if (cleanedDateLine) {
        eventDateLabel = cleanedDateLine;
      }
    }

    // Detect location cue in concise lines
    if (
      !locationLabel &&
      line.length <= 100 &&
      /\b(main church|parish hall|church hall|social hall|arrowood|charlotte|gym|pavilion|chapel)\b/i.test(line)
    ) {
      const cleanedLoc = line
        .replace(URL_REGEX, '')
        .replace(/^(at|@|in)\s+/i, '')
        .trim();
      if (cleanedLoc && cleanedLoc !== title) {
        locationLabel = cleanedLoc;
      }
    }

    // Strip bare URLs from body paragraph lines unless helpful context remains
    const textWithoutUrls = line.replace(URL_REGEX, '').replace(/\s{2,}/g, ' ').trim();
    if (textWithoutUrls) {
      bodyLines.push(textWithoutUrls);
    }
  }

  if (!title && bodyLines.length > 0) {
    title = bodyLines[0].slice(0, 100);
  }

  const description = bodyLines.join('\n').trim() || title;

  return {
    title,
    description,
    eventDateLabel,
    locationLabel,
    mapsUrl,
    webUrl,
    webLinkLabel,
  };
}
