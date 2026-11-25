import {
  ActionAttachment,
  AnnouncementCard,
  AnnouncementCategory,
  CollectionSummary,
  DailyScheduleEntry,
  DailyScheduleService,
} from '../types/parish';
import { sanitizeActionUrl, sanitizePlainText } from './sanitize';
import {
  cleanAnnouncementTitle,
  cleanDescriptionText,
  cleanMultilineWhitespace,
  LEADING_BULLET_RE,
  stripLeadingBullet,
} from './textFormat';

export interface ParsedBulletinDraft {
  weekStart?: string;
  weekEnd?: string;
  title?: string;
  greeting?: string;
  dailySchedule: DailyScheduleEntry[];
  announcements: AnnouncementCard[];
  collectionSummary?: CollectionSummary | null;
  warnings: string[];
}

const DATE_RANGE_RE = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*[-–—]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const SCHEDULE_ROW_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|First\s+Friday)(.*)$/i;
const URL_IN_TEXT_RE = /https?:\/\/[^\s<>()]+/gi;

function toIsoDate(month: string, day: string, year: string): string {
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function makeId(prefix: string, idx: number): string {
  return `${prefix}-${Date.now().toString(36)}-${idx}`;
}

/**
 * Normalizes PDF/Word/WhatsApp line breaks and broken URLs (e.g. "https: //..." or "? \n usp=...").
 */
export function normalizeRawBulletinText(raw: string): string {
  let text = cleanMultilineWhitespace(raw);

  // Fix spaces inserted after protocol ("https: //docs.google.com")
  text = text.replace(/(https?):\s+\/\//gi, '$1://');

  // Rejoin URLs wrapped across a newline (e.g. ending with ?, &, =, /, -, or _)
  const lines = text.split('\n');
  const merged: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const prev = merged[merged.length - 1] ?? '';

    const prevEndsWithBrokenUrl =
      /https?:\/\/\S*[?&=/_-]$/i.test(prev) &&
      trimmed.length > 0 &&
      !LEADING_BULLET_RE.test(trimmed) &&
      !/^[A-Z][A-Za-z0-9\s’'–-]{2,55}:\s/.test(trimmed);

    const isOrphanUrlSuffix =
      /https?:\/\/\S+$/i.test(prev) &&
      /^(usp=|viewform|edit\b)/i.test(trimmed);

    if (prevEndsWithBrokenUrl || isOrphanUrlSuffix) {
      merged[merged.length - 1] = `${prev}${trimmed}`;
    } else {
      merged.push(line);
    }
  }

  return merged.join('\n');
}

function inferActionAttachment(rawUrl: string): ActionAttachment | null {
  const safeUrl = sanitizeActionUrl(rawUrl);
  if (!safeUrl) return null;

  const lower = safeUrl.toLowerCase();
  if (lower.includes('docs.google.com/forms')) {
    return { label: 'Open Registration / Sign-Up Form', kind: 'form', url: safeUrl };
  }
  if (lower.includes('drive.google.com')) {
    return { label: 'View Photos & Shared Folder', kind: 'drive', url: safeUrl };
  }
  return { label: 'Open Event Link', kind: 'external_url', url: safeUrl };
}

function classifyAnnouncement(title: string, body: string): AnnouncementCategory {
  const hay = `${title} ${body}`.toLowerCase();
  if (
    /\bward\s*\d*\b|\bprayer meeting\b|\bpotluck\b|\bfriendsgiving\b|\bcaroling\b|\bbake sale\b|\bpicnic\b|\bfestival\b|\bsunday lunch\b|\bdecorating\b/.test(
      hay
    )
  ) {
    return 'Parish Events & Wards';
  }
  if (
    /\bccd\b|\bvbs\b|\bcatechism\b|\bgraduation\b|\bbaccalaureate\b|\bvacation bible\b|\bbible quiz\b|\bdei verbum\b|\bfaith formation\b/.test(
      hay
    )
  ) {
    return 'Faith & CCD';
  }
  if (
    /\byouth\b|\bvocations\b|\bquo vadis\b|\bduc in altum\b|\btalitha koum\b|\bzion\b|\bjesus youth\b|\bcml\b|\bwomen'?s forum\b|\bmen of st\.\s*joseph\b|\bchoir\b|\brespect life\b|\bministry\b|\bapostolate\b/.test(
      hay
    )
  ) {
    return 'Youth & Ministries';
  }
  if (
    /\bqurbana\b|\bmass\b|\badoration\b|\bconfession\b|\bnovena\b|\brosary\b|\ball souls\b|\bjubilee\b|\bfeast\b|\bpre-?cana\b|\bsolemn holy communion\b|\bliturgical\b|\bsacrament\b/.test(
      hay
    )
  ) {
    return 'Liturgy & Sacraments';
  }
  return 'General & Parish';
}

function extractDateTimeLabel(text: string): string | null {
  const monthDayRe =
    /\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:[–-]\d{1,2})?(?:,\s*\d{4})?\b/i;
  const timeRe = /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i;

  const dateMatch = text.match(monthDayRe)?.[0];
  const timeMatch = text.match(timeRe)?.[0];
  if (dateMatch && timeMatch) return `${dateMatch} • ${timeMatch}`;
  return dateMatch ?? timeMatch ?? null;
}

function extractLocationLabel(text: string): string | null {
  const residenceMatch = text.match(/hosted at (?:the )?residence of ([^.,\n]+)/i);
  if (residenceMatch) {
    return `Residence of ${residenceMatch[1].trim()}`;
  }
  const atCollegeMatch = text.match(/\bat ([A-Z][A-Za-z\s]+(?:College|Church|Hall))\b/);
  if (atCollegeMatch) {
    return atCollegeMatch[1].trim();
  }
  return null;
}

function parseCollectionSummary(title: string, body: string): CollectionSummary | null {
  if (!/collection/i.test(title)) return null;
  const amountMatch = body.match(/\$[\d,]+(?:\.\d{2})?/);
  const dateMatch = body.match(
    /(?:for\s+)?(?:Sunday,?\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})/i
  );
  if (!amountMatch) return null;

  const amountRaw = amountMatch[0];
  const normalizedAmount = amountRaw.includes('.') ? amountRaw : `${amountRaw}.00`;
  const label = dateMatch ? `Sunday Collection (${dateMatch[1]})` : 'Sunday Collection';

  return {
    label: sanitizePlainText(label),
    amountDisplay: sanitizePlainText(normalizedAmount),
  };
}

function parseDailyScheduleBlock(lines: string[]): DailyScheduleEntry[] {
  const entries: DailyScheduleEntry[] = [];
  let current: DailyScheduleEntry | null = null;

  const pushServiceLine = (rawItem: string) => {
    if (!current) return;
    const clean = sanitizePlainText(stripLeadingBullet(rawItem));
    if (!clean || /^n\/?a$/i.test(clean)) {
      if (current.items.length === 0) {
        current.items.push({ time: '', title: 'No scheduled church services' });
      }
      return;
    }

    const timeSplit = clean.match(
      /^(\d{1,2}:\d{2}\s*(?:AM|PM)(?:\s*(?:to|–|-)\s*\d{1,2}:\d{2}\s*(?:AM|PM))?)\s*(?:[-–—]\s*|\s+)(.+)$/i
    );
    let time = '';
    let rest = clean;
    if (timeSplit) {
      time = timeSplit[1].trim();
      rest = timeSplit[2].trim();
    }

    let celebrant: string | null = null;
    const celebrantMatch = rest.match(/\((Fr\.[^)]+)\)/i);
    if (celebrantMatch) {
      celebrant = celebrantMatch[1].trim();
      rest = rest.replace(celebrantMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    }

    const service: DailyScheduleService = { time, title: rest, celebrant };
    current.items.push(service);
  };

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || /^(Date\s+Day|Weekly Schedule)/i.test(trimmed)) continue;

    const rowMatch = trimmed.match(SCHEDULE_ROW_DATE_RE);
    if (rowMatch) {
      if (current) entries.push(current);
      const isoDate = toIsoDate(rowMatch[1], rowMatch[2], rowMatch[3]);
      const dayLabel = rowMatch[4].trim();
      let remainder = rowMatch[5].trim();
      let feastNote: string | null = null;

      // Check if remainder starts with a bullet or a feast note
      if (LEADING_BULLET_RE.test(remainder)) {
        current = { date: isoDate, dayLabel, feastNote: null, items: [] };
        pushServiceLine(remainder);
      } else {
        if (remainder) {
          feastNote = sanitizePlainText(remainder);
        } else if (i + 1 < lines.length && /^(Feast|First|Solemnity|Palm|Good|Easter|Christmas)/i.test(lines[i + 1].trim())) {
          feastNote = sanitizePlainText(lines[i + 1].trim());
          i++;
        }
        current = { date: isoDate, dayLabel, feastNote, items: [] };
      }
      continue;
    }

    if (current) {
      pushServiceLine(trimmed);
    }
  }

  if (current) entries.push(current);
  return entries;
}

/**
 * Deterministic Smart Paste & Auto-Split parser.
 * Converts pasted Word, email, WhatsApp, or PDF text into structured cards & schedule rows.
 */
export function parseRawBulletin(rawText: string): ParsedBulletinDraft {
  const warnings: string[] = [];
  const normalized = normalizeRawBulletinText(rawText);
  const lines = normalized.split('\n');

  let weekStart: string | undefined;
  let weekEnd: string | undefined;
  let title: string | undefined;
  let greeting: string | undefined;

  const dateMatch = normalized.match(DATE_RANGE_RE);
  if (dateMatch) {
    weekStart = toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]);
    weekEnd = toIsoDate(dateMatch[4], dateMatch[5], dateMatch[6]);
    title = `Weekly Schedule (${dateMatch[1].padStart(2, '0')}/${dateMatch[2].padStart(2, '0')}/${dateMatch[3]} - ${dateMatch[4].padStart(2, '0')}/${dateMatch[5].padStart(2, '0')}/${dateMatch[6]})`;
  }

  const greetingLine = lines.find((l) => /praise be to jesus christ/i.test(l));
  if (greetingLine) {
    greeting = sanitizePlainText(greetingLine);
  }

  // Split sections: schedule block vs announcements block vs sign-off
  const scheduleLines: string[] = [];
  const announcementLines: string[] = [];
  let mode: 'header' | 'schedule' | 'announcements' | 'signoff' = 'header';

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (mode === 'announcements') announcementLines.push('');
      continue;
    }

    if (/^Announcements\b/i.test(trimmed)) {
      mode = 'announcements';
      continue;
    }
    if (/^With Prayers,?/i.test(trimmed)) {
      mode = 'signoff';
      continue;
    }
    if (mode === 'signoff') continue;

    if (mode === 'header') {
      if (SCHEDULE_ROW_DATE_RE.test(trimmed) || /^Date\s+Day/i.test(trimmed)) {
        mode = 'schedule';
        scheduleLines.push(trimmed);
        continue;
      }
      if (LEADING_BULLET_RE.test(trimmed) || /^[A-Z][A-Za-z0-9\s’'–-]{2,55}:\s+/.test(trimmed)) {
        mode = 'announcements';
        announcementLines.push(trimmed);
        continue;
      }
    } else if (mode === 'schedule') {
      scheduleLines.push(trimmed);
    } else if (mode === 'announcements') {
      announcementLines.push(trimmed);
    }
  }

  const dailySchedule = parseDailyScheduleBlock(scheduleLines);

  // Group announcement lines into raw item strings
  const rawItems: string[] = [];
  for (const line of announcementLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isNewBullet = LEADING_BULLET_RE.test(trimmed);
    const cleanedLine = stripLeadingBullet(trimmed);
    const isNewTitleColon = /^[A-Z][A-Za-z0-9\s.’'–()-]{2,60}:\s+/.test(cleanedLine);

    if (isNewBullet || isNewTitleColon || rawItems.length === 0) {
      rawItems.push(cleanedLine);
    } else {
      rawItems[rawItems.length - 1] = `${rawItems[rawItems.length - 1]} ${cleanedLine}`;
    }
  }

  const announcements: AnnouncementCard[] = [];
  let collectionSummary: CollectionSummary | null = null;

  for (let i = 0; i < rawItems.length; i++) {
    const itemText = rawItems[i].trim();

    // Handle orphan URL bullet (e.g., Sunday Lunch Program link on its own bullet)
    const standaloneUrlMatch = itemText.match(/^(https?:\/\/\S+)$/i);
    if (standaloneUrlMatch) {
      const action = inferActionAttachment(standaloneUrlMatch[1]);
      if (action && announcements.length > 0) {
        announcements[announcements.length - 1].actions.push(action);
      } else {
        warnings.push(`Skipped orphan URL that could not be attached: ${standaloneUrlMatch[1]}`);
      }
      continue;
    }

    // Extract Title: Body
    const colonIdx = itemText.indexOf(':');
    let cardTitle = '';
    let cardBody = itemText;

    if (colonIdx > 2 && colonIdx <= 70 && !itemText.slice(0, colonIdx).includes('http')) {
      cardTitle = itemText.slice(0, colonIdx).trim();
      cardBody = itemText.slice(colonIdx + 1).trim();
    } else {
      const firstSentence = itemText.split(/[.!?]\s+/)[0] ?? itemText;
      cardTitle = firstSentence.slice(0, 56);
    }

    // Check for Sunday Collection highlight
    const maybeCollection = parseCollectionSummary(cardTitle, cardBody);
    if (maybeCollection) {
      collectionSummary = maybeCollection;
      continue;
    }

    // Extract URLs into clean Action CTA buttons and strip raw URLs from body text
    const urls = cardBody.match(URL_IN_TEXT_RE) ?? [];
    const actions: ActionAttachment[] = [];
    for (const rawUrl of urls) {
      const action = inferActionAttachment(rawUrl);
      if (action) actions.push(action);
      cardBody = cardBody.replace(rawUrl, '').trim();
    }
    // Clean trailing "link:" or "use this link:" phrasing left behind after URL extraction
    cardBody = cardBody.replace(/\s*(?:use (?:the |this )?link(?: below)?[^:]*:|\bhere is the link[^:]*:)\s*$/i, '.').trim();
    cardBody = cardBody.replace(/\.\.+$/, '.');

    const cleanTitle = cleanAnnouncementTitle(sanitizePlainText(cardTitle));
    const cleanBody = cleanDescriptionText(sanitizePlainText(cardBody));
    const category = classifyAnnouncement(cleanTitle, cleanBody);
    const dateTimeLabel = extractDateTimeLabel(`${cleanTitle} ${cleanBody}`);
    const locationLabel = extractLocationLabel(cleanBody);

    announcements.push({
      id: makeId('ann', i),
      order: announcements.length + 1,
      title: cleanTitle,
      category,
      dateTimeLabel,
      locationLabel,
      body: cleanBody,
      actions,
    });
  }

  if (announcements.length === 0 && dailySchedule.length === 0) {
    warnings.push('No structured bullets or schedule rows detected. Try formatting items as "Title: Description".');
  }

  return {
    weekStart,
    weekEnd,
    title,
    greeting,
    dailySchedule,
    announcements,
    collectionSummary,
    warnings,
  };
}
