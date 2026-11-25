import { stripFormattingMarkers } from './textFormat';

export interface ShareNoticeInput {
  title: string;
  body?: string | null;
  dateTimeLabel?: string | null;
  locationLabel?: string | null;
}

export function buildShareNoticeText(input: ShareNoticeInput): string {
  const lines: string[] = [];
  lines.push(`*${stripFormattingMarkers(input.title).trim()}*`);
  if (input.dateTimeLabel?.trim()) {
    lines.push(`Date/Time: ${input.dateTimeLabel.trim()}`);
  }
  if (input.locationLabel?.trim()) {
    lines.push(`Location: ${input.locationLabel.trim()}`);
  }
  const cleanBody = stripFormattingMarkers(input.body ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleanBody) {
    lines.push(cleanBody.length > 260 ? `${cleanBody.slice(0, 257).trimEnd()}...` : cleanBody);
  }
  lines.push("— St. Mary's Syro-Malabar Parish, Charlotte NC");
  return lines.join('\n');
}

/**
 * Shares an individual notice via Web Share API (WhatsApp/Messages/Email on mobile),
 * falling back cleanly to clipboard copy on desktop browsers.
 */
export async function shareParishNotice(
  input: ShareNoticeInput
): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = typeof window !== 'undefined' ? window.location.origin : 'https://parish-7tg.pages.dev';
  const text = buildShareNoticeText(input);

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: stripFormattingMarkers(input.title).trim(),
        text,
        url,
      });
      return 'shared';
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to clipboard copy if share failed
    }
  }

  const fullClipboard = `${text}\n${url}`;
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(fullClipboard);
    return 'copied';
  }
  return 'cancelled';
}
