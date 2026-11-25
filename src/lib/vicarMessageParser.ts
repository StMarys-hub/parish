import {
  NoticeLinkItem,
  NoticeLocationItem,
  NoticeTimelineItem,
  SpecialNoticeCategory,
  SpecialNoticeStructuredBlocks,
} from '../types/parish';
import { normalizePastedUrl, sanitizeActionUrl, sanitizePlainText } from './sanitize';
import {
  cleanAnnouncementTitle,
  cleanDescriptionText,
  cleanMultilineWhitespace,
  stripFormattingMarkers,
} from './textFormat';

export interface ParsedVicarMessage {
  title: string;
  categoryBadge: SpecialNoticeCategory;
  summaryPreview: string;
  signOff: string;
  structuredBlocks: SpecialNoticeStructuredBlocks;
  // Backward-compatible flat fields for search/cards/forms
  description: string;
  eventDateLabel: string;
  locationLabel: string;
  mapsUrl: string;
  webUrl: string;
  webLinkLabel: string;
}

const URL_REGEX = /https?:\s*\/\/[^\s<>()]+/gi;
const STRICT_URL_ONLY_REGEX = /^https?:\s*\/\/[^\s<>()]+$/i;
const MAPS_HOST_REGEX = /(maps\.google\.|google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i;

const GREETING_LINE_REGEX =
  /^(?:dear\s+(?:parish(?:ioners| family)?|brothers?(?:\s*(?:&|and)\s*sisters?)?|friends|all|beloved|parents|youth)[^.!\n]{0,60}[,!.:-]*|praise\s+be\s+to\s+jesus\s+christ[^.!?\n]*[.!?]*|praised\s+be\s+jesus\s+christ[^.!?\n]*[.!?]*|slamo\s+alaikum|shlama)$/i;

const SIGNOFF_LINE_REGEX =
  /^(?:[-–—]+\s*)?(?:with\s+prayers(?:\s+and\s+blessings)?,?|god\s+bless(?:\s+you(?:\s+all)?)?[!.]*|in\s+christ(?:\s+jesus)?,?|prayerfully,?|sincerely,?|yours\s+in\s+christ,?|fr\.?\s*rajeev(?:\s+achan)?|rajeev\s+achan|rev\.?\s*fr\.?\s*rajeev[^.\n]*|vicar(?:,\s*st\.?\s*mary'?s[^.\n]*)?)$/i;

const TIMELINE_LINE_REGEX =
  /^\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))\s*(?:[-–—:]|\s+)\s*(.+)$/i;

const DATE_LINE_REGEX =
  /\b(?:(?:mon|tue|wed|thu|fri|sat|sun)(?:day|sday|nesday|rsday|urday)?[,\s]+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:\s*,?\s*\d{4})?(?:\s*(?:[-–—]|at|@)\s*[^,\n]{2,45})?/i;

const KNOWN_MISSION_LOCATION_REGEX =
  /(st\.?\s*sebastian\s+mission[^;\n.]*(?:blythe?wood[^;\n.]*)?|greer(?:\s+mission)?[^;\n.]*|transfiguration\s+catholic\s+church[^;\n.]*|main\s+church|parish\s+hall|sanctuary|catechism\s+hall)/i;

function isMapsUrl(url: string): boolean {
  return MAPS_HOST_REGEX.test(url);
}

function classifyLinkKind(url: string, label: string): NoticeLinkItem['kind'] {
  const lowerUrl = url.toLowerCase();
  const lowerLabel = label.toLowerCase();
  if (lowerUrl.includes('drive.google.com')) return 'drive';
  if (
    lowerUrl.includes('youtube.com') ||
    lowerUrl.includes('youtu.be') ||
    lowerUrl.includes('vimeo.com') ||
    lowerLabel.includes('video') ||
    lowerLabel.includes('stream') ||
    lowerLabel.includes('recording') ||
    lowerLabel.includes('highlight')
  ) {
    return 'video';
  }
  if (
    lowerUrl.includes('forms.gle') ||
    lowerUrl.includes('docs.google.com/forms') ||
    lowerLabel.includes('form') ||
    lowerLabel.includes('register') ||
    lowerLabel.includes('rsvp')
  ) {
    return 'form';
  }
  return 'web';
}

function inferDefaultLinkLabel(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('forms.gle') || lower.includes('docs.google.com/forms')) return 'Open Registration Form';
  if (lower.includes('drive.google.com/drive/folders')) return 'Open Shared Photos / Folder';
  if (lower.includes('drive.google.com')) return 'View Shared Media';
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com')) {
    return 'Watch Video / Stream';
  }
  if (lower.includes('zoom.us') || lower.includes('meet.google.com')) return 'Join Online Meeting';
  return 'Open Link';
}

function stripUrls(text: string): string {
  return text.replace(URL_REGEX, '').replace(/\s{2,}/g, ' ').trim();
}

function stripInlineGreetingPrefix(line: string): string {
  return line
    .replace(
      /^(?:dear\s+(?:parish(?:ioners| family)?|brothers?(?:\s*(?:&|and)\s*sisters?)?|friends|all|beloved)[,!.:-]*\s*)/i,
      ''
    )
    .replace(/^(?:praise\s+be\s+to\s+jesus\s+christ[!.,:-]*\s*)/i, '')
    .trim();
}

function normalizeTimeToken(raw: string): string {
  return raw.replace(/\./g, '').replace(/\s+/g, ' ').trim().toUpperCase();
}

function cleanLabelPunctuation(label: string): string {
  return label.replace(/[:\-–—\s]+$/, '').trim();
}

function buildMapsUrlForLocation(label: string, explicitMapsUrl?: string | null): string | null {
  if (explicitMapsUrl) return explicitMapsUrl;
  const cleaned = label.trim();
  if (!cleaned) return null;
  if (/main\s+church|parish\s+hall|sanctuary/i.test(cleaned) && !cleaned.includes(',')) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleaned)}`;
}

function detectCategoryBadge(params: {
  title: string;
  rawText: string;
  timelineCount: number;
  mediaCount: number;
  externalCount: number;
}): SpecialNoticeCategory {
  const combined = `${params.title}\n${params.rawText}`.toLowerCase();
  if (
    /\b(urgent|important\s+notice|cancelled|canceled|postponed|rescheduled|weather\s+alert|time\s+change|emergency)\b/i.test(
      combined
    )
  ) {
    return 'Urgent';
  }
  if (
    params.mediaCount >= 2 ||
    (params.mediaCount >= 1 &&
      /\b(highlight|photo|photos|gallery|album|recording|recorded|drive\s+link|video)\b/i.test(combined))
  ) {
    return 'Media & Highlights';
  }
  if (
    params.timelineCount >= 2 ||
    /\b(holy\s+qurbana|sunday\s+liturgy|feast\s+day\s+schedule|solemn\s+raz|dedication\s+of\s+the\s+church|pentecost|palm\s+sunday|easter|christmas\s+schedule|good\s+friday)\b/i.test(
      combined
    )
  ) {
    return 'Sunday Liturgy';
  }
  if (
    params.externalCount >= 1 ||
    /\b(youth|jesus\s+youth|cml|ccd|catechism|choir|retreat|register|registration|rsvp|camp|tournament|picnic|vacation\s+bible)\b/i.test(
      combined
    )
  ) {
    return 'Youth & Events';
  }
  return 'Vicar Note';
}

function deriveSmartTitle(params: {
  explicitTitle: string;
  categoryBadge: SpecialNoticeCategory;
  paragraphs: string[];
  timeline: NoticeTimelineItem[];
  mediaLinks: NoticeLinkItem[];
  eventDateLabel: string;
}): string {
  if (params.explicitTitle) {
    return cleanAnnouncementTitle(params.explicitTitle).slice(0, 120);
  }
  for (const p of params.paragraphs) {
    const candidate = cleanAnnouncementTitle(cleanLabelPunctuation(stripUrls(p)));
    if (
      candidate.length >= 4 &&
      candidate.length <= 95 &&
      !/^please\s+find\b|^below\s+(?:are|is)\b|^schedule$/i.test(candidate)
    ) {
      return candidate;
    }
  }
  if (params.mediaLinks.length > 0) {
    if (params.mediaLinks.length === 1) return params.mediaLinks[0].label;
    return 'Shared Parish Media & Highlights';
  }
  if (params.timeline.length > 0) {
    return params.eventDateLabel ? `Liturgical Schedule — ${params.eventDateLabel}` : 'Sunday Liturgical Schedule';
  }
  if (params.categoryBadge === 'Urgent') return 'Important Parish Notice';
  return 'Pastoral Note from the Vicar';
}

function buildSummaryPreview(params: {
  title: string;
  paragraphs: string[];
  timeline: NoticeTimelineItem[];
  mediaLinks: NoticeLinkItem[];
  externalLinks: NoticeLinkItem[];
  locations: NoticeLocationItem[];
}): string {
  const meaningfulParagraph = params.paragraphs.find((p) => {
    const cleaned = p.trim();
    if (!cleaned) return false;
    if (cleaned.toLowerCase() === params.title.toLowerCase()) return false;
    if (/^schedule\s*:?$/i.test(cleaned)) return false;
    return true;
  });

  const parts: string[] = [];
  if (meaningfulParagraph) {
    parts.push(meaningfulParagraph);
  } else if (params.timeline.length > 0) {
    const snippet = params.timeline
      .slice(0, 2)
      .map((item) => `${item.time} ${item.activity}`)
      .join(' • ');
    parts.push(
      params.timeline.length > 2 ? `${snippet} (+${params.timeline.length - 2} more)` : snippet
    );
  } else if (params.mediaLinks.length > 0) {
    parts.push(params.mediaLinks.map((m) => m.label).join(' • '));
  } else if (params.externalLinks.length > 0) {
    parts.push(params.externalLinks.map((l) => l.label).join(' • '));
  }

  if (parts.length === 0 && params.locations.length > 0) {
    parts.push(params.locations[0].label);
  }

  const joined =
    stripFormattingMarkers(parts.join(' ').replace(/\s+/g, ' ').trim()) || params.title;
  return joined.length > 140 ? `${joined.slice(0, 137).trimEnd()}...` : joined;
}

/**
 * Deterministic, synchronous (<2ms) smart parser for Vicar / Special Notices pasted from
 * WhatsApp, Microsoft Word, email, or typed directly.
 *
 * Extracts:
 * - Clean title & summary preview (greeting & sign-off boilerplate stripped)
 * - Category badge ('Vicar Note' | 'Sunday Liturgy' | 'Media & Highlights' | 'Youth & Events' | 'Urgent')
 * - Structured timeline rows (8:00 AM, 9:30 AM, 4:30 PM, etc.)
 * - Media / Drive / Video & external CTA links paired from "Label:\nhttps://..." or "Label: https://..."
 * - Mission / venue location chips with optional Google Maps links
 * - Sign-off attribution (default "Rajeev Achan")
 */
export function parseVicarMessage(rawText: string): ParsedVicarMessage {
  const cleanedRaw = cleanMultilineWhitespace(sanitizePlainText(rawText));
  if (!cleanedRaw) {
    return {
      title: '',
      categoryBadge: 'Vicar Note',
      summaryPreview: '',
      signOff: 'Rajeev Achan',
      structuredBlocks: { paragraphs: [], timeline: [], mediaLinks: [], externalLinks: [], locations: [] },
      description: '',
      eventDateLabel: '',
      locationLabel: '',
      mapsUrl: '',
      webUrl: '',
      webLinkLabel: '',
    };
  }

  const rawLines = cleanedRaw
    .split('\n')
    .map((line) => cleanDescriptionText(line))
    .filter(Boolean);

  let explicitTitle = '';
  let eventDateLabel = '';
  let locationLabel = '';
  let explicitMapsUrl = '';
  let signOff = '';

  const paragraphs: string[] = [];
  const timeline: NoticeTimelineItem[] = [];
  const mediaLinks: NoticeLinkItem[] = [];
  const externalLinks: NoticeLinkItem[] = [];
  const locations: NoticeLocationItem[] = [];
  const seenUrls = new Set<string>();
  const seenLocations = new Set<string>();

  const registerLink = (urlCandidate: string, labelCandidate?: string) => {
    const normalized = normalizePastedUrl(urlCandidate).replace(/[.,;:!?)]+$/, '');
    const safeUrl = sanitizeActionUrl(normalized);
    if (!safeUrl || seenUrls.has(safeUrl)) return;
    seenUrls.add(safeUrl);

    if (isMapsUrl(safeUrl)) {
      if (!explicitMapsUrl) explicitMapsUrl = safeUrl;
      return;
    }

    const cleanedLabel = cleanLabelPunctuation(labelCandidate || '') || inferDefaultLinkLabel(safeUrl);
    const kind = classifyLinkKind(safeUrl, cleanedLabel);
    const item: NoticeLinkItem = { label: cleanedLabel, url: safeUrl, kind };
    if (kind === 'drive' || kind === 'video') {
      mediaLinks.push(item);
    } else {
      externalLinks.push(item);
    }
  };

  const registerLocation = (label: string, mapsUrl?: string | null) => {
    const cleaned = cleanLabelPunctuation(label);
    if (!cleaned) return;
    const key = cleaned.toLowerCase();
    if (seenLocations.has(key)) return;
    seenLocations.add(key);
    if (!locationLabel) locationLabel = cleaned;
    locations.push({
      label: cleaned,
      mapsUrl: buildMapsUrlForLocation(cleaned, mapsUrl),
    });
  };

  let pendingLinkLabel = '';

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    // Sign-off detection at end of message (or explicit Fr./Rajeev Achan closing)
    if (SIGNOFF_LINE_REGEX.test(line)) {
      const cleanedSignOff = line.replace(/^[-–—]+\s*/, '').replace(/,$/, '').trim();
      if (/achan|fr\.?|vicar/i.test(cleanedSignOff)) {
        signOff = cleanedSignOff;
      }
      pendingLinkLabel = '';
      continue;
    }

    // Pure greeting line? Strip it from collapsed summary/title clutter
    if (GREETING_LINE_REGEX.test(line)) {
      pendingLinkLabel = '';
      continue;
    }

    // Strip inline greeting prefix at start of first paragraph
    if (i <= 2) {
      const withoutGreeting = stripInlineGreetingPrefix(line);
      if (!withoutGreeting) continue;
      line = withoutGreeting;
    }

    // Bare URL line paired with previous label (e.g. "Youth Retreat Video:\nhttps://...")
    if (STRICT_URL_ONLY_REGEX.test(line)) {
      registerLink(line, pendingLinkLabel);
      pendingLinkLabel = '';
      continue;
    }

    // Check explicit key-value metadata ("Title:", "Date:", "Location:", "Address:", etc.)
    const kvMatch = line.match(
      /^(title|subject|notice|announcement|date\s*&?\s*time|date|when|location|venue|where|address|sign\s*-?\s*off|from)\s*[:\-–]\s*(.+)$/i
    );
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase().replace(/\s+/g, '');
      const val = kvMatch[2].trim();

      const inlineUrls = val.match(URL_REGEX) ?? [];
      for (const u of inlineUrls) {
        registerLink(u, cleanLabelPunctuation(stripUrls(val)));
      }

      if ((key === 'title' || key === 'subject' || key === 'notice' || key === 'announcement') && !explicitTitle) {
        explicitTitle = stripUrls(val);
        pendingLinkLabel = '';
        continue;
      }
      if ((key === 'date&time' || key === 'date' || key === 'when') && !eventDateLabel) {
        eventDateLabel = stripUrls(val);
        pendingLinkLabel = '';
        continue;
      }
      if (key === 'location' || key === 'venue' || key === 'where' || key === 'address') {
        registerLocation(stripUrls(val), explicitMapsUrl || null);
        pendingLinkLabel = '';
        continue;
      }
      if (key === 'signoff' || key === 'from') {
        signOff = stripUrls(val);
        pendingLinkLabel = '';
        continue;
      }
    }

    // Inline "Label: https://..." on same line
    const inlineLabelUrlMatch = line.match(/^(.+?)\s*[:\-–]\s*(https?:\s*\/\/[^\s<>()]+)(.*)$/i);
    if (inlineLabelUrlMatch) {
      const lbl = inlineLabelUrlMatch[1].trim();
      const url = inlineLabelUrlMatch[2].trim();
      const tail = inlineLabelUrlMatch[3].trim();
      registerLink(url, lbl);
      if (tail) {
        const extraUrls = tail.match(URL_REGEX) ?? [];
        for (const extra of extraUrls) registerLink(extra, lbl);
        const cleanTail = stripUrls(tail);
        if (cleanTail.length > 8) paragraphs.push(cleanTail);
      }
      pendingLinkLabel = '';
      continue;
    }

    // Standalone URLs embedded in prose line
    const lineUrls = line.match(URL_REGEX) ?? [];
    if (lineUrls.length > 0) {
      const textOnly = cleanLabelPunctuation(stripUrls(line));
      for (const u of lineUrls) {
        registerLink(u, textOnly.length > 0 && textOnly.length <= 70 ? textOnly : pendingLinkLabel);
      }
      if (textOnly.length > 40) {
        paragraphs.push(textOnly);
      }
      pendingLinkLabel = '';
      continue;
    }

    // Heading-style label ending with ":" right before a URL line ("First Communion Photos:")
    if (
      line.endsWith(':') &&
      i + 1 < rawLines.length &&
      STRICT_URL_ONLY_REGEX.test(rawLines[i + 1])
    ) {
      pendingLinkLabel = cleanLabelPunctuation(line);
      continue;
    }

    // Timestamped schedule item ("8:00 AM - Holy Qurbana", "4:30 PM - Holy Qurbana at St. Sebastian Mission")
    const timelineMatch = line.match(TIMELINE_LINE_REGEX);
    if (timelineMatch) {
      const time = normalizeTimeToken(timelineMatch[1]);
      let activity = timelineMatch[2].trim();
      let note: string | null = null;

      const parenNoteMatch = activity.match(/^(.+?)\s*\(([^)]{2,60})\)\s*$/);
      if (parenNoteMatch) {
        activity = parenNoteMatch[1].trim();
        note = parenNoteMatch[2].trim();
      }

      timeline.push({ time, activity, note });

      const missionMatch = activity.match(KNOWN_MISSION_LOCATION_REGEX);
      if (missionMatch) {
        registerLocation(missionMatch[1]);
      }
      pendingLinkLabel = '';
      continue;
    }

    // Standalone label ending with ":" (like "Schedule:" or "Notes:")
    if (/^(?:schedule|liturgical\s+schedule|program|timings)\s*:?$/i.test(line)) {
      pendingLinkLabel = '';
      continue;
    }

    // Check for date expressions if not explicitly provided
    if (!eventDateLabel) {
      const dMatch = line.match(DATE_LINE_REGEX);
      if (dMatch) {
        eventDateLabel = dMatch[0].trim();
      }
    }

    // Detect mission/venue location mentioned in prose
    const venueMatch = line.match(KNOWN_MISSION_LOCATION_REGEX);
    if (venueMatch) {
      registerLocation(venueMatch[1]);
    }

    // Treat short standalone header first line as title if it isn't a long sentence
    if (
      !explicitTitle &&
      paragraphs.length === 0 &&
      timeline.length === 0 &&
      mediaLinks.length === 0 &&
      line.length <= 85 &&
      !/[.!?]$/.test(line)
    ) {
      explicitTitle = cleanLabelPunctuation(line);
      pendingLinkLabel = '';
      continue;
    }

    paragraphs.push(line);
    pendingLinkLabel = '';
  }

  // Attach explicit Maps URL to primary location if one wasn't linked directly
  if (explicitMapsUrl) {
    if (locations.length > 0 && !locations[0].mapsUrl) {
      locations[0].mapsUrl = explicitMapsUrl;
    } else if (locations.length === 0) {
      locations.push({ label: locationLabel || 'Event Venue', mapsUrl: explicitMapsUrl });
    }
  }

  const finalSignOff = signOff || 'Rajeev Achan';

  const categoryBadge = detectCategoryBadge({
    title: explicitTitle,
    rawText: cleanedRaw,
    timelineCount: timeline.length,
    mediaCount: mediaLinks.length,
    externalCount: externalLinks.length,
  });

  const title = deriveSmartTitle({
    explicitTitle,
    categoryBadge,
    paragraphs,
    timeline,
    mediaLinks,
    eventDateLabel,
  });

  const summaryPreview = buildSummaryPreview({
    title,
    paragraphs,
    timeline,
    mediaLinks,
    externalLinks,
    locations,
  });

  const allCtaLinks = [...mediaLinks, ...externalLinks];
  const primaryWeb = allCtaLinks[0];

  // Clean description without raw URLs for legacy display fallbacks
  const cleanDescriptionLines = [
    ...paragraphs,
    ...timeline.map((t) => `${t.time} – ${t.activity}${t.note ? ` (${t.note})` : ''}`),
  ];

  return {
    title,
    categoryBadge,
    summaryPreview,
    signOff: finalSignOff,
    structuredBlocks: {
      paragraphs,
      timeline,
      mediaLinks,
      externalLinks,
      locations,
      eventDateLabel: eventDateLabel || null,
      locationLabel: locationLabel || null,
    },
    description: cleanDescriptionLines.join('\n') || summaryPreview,
    eventDateLabel,
    locationLabel,
    mapsUrl: locations.find((l) => Boolean(l.mapsUrl))?.mapsUrl || explicitMapsUrl,
    webUrl: primaryWeb?.url ?? '',
    webLinkLabel: primaryWeb?.label ?? '',
  };
}
