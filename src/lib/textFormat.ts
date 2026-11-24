/**
 * Shared text cleansing & safe inline formatting utilities for Parish Bulletins & Special Notices.
 *
 * Cleansing:
 * - Normalizes invisible Unicode spaces (NBSP, zero-width chars, tabs) and collapses extra spaces
 * - Strips unwanted leading bullet symbols (•, *, -, –, —, ◦, ▪, ●, ➤, numbered prefixes like "1. ")
 * - Strips formatting markers (** / ==) from titles and collapsed plain previews
 *
 * Inline formatting (descriptions only — never uses dangerouslySetInnerHTML):
 * - **text** -> bold
 * - ==text== -> liturgical highlight
 */

const INVISIBLE_CHARS_RE = /[\u200B-\u200D\uFEFF\u00AD]/g;
const UNICODE_SPACES_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\t]+/g;

// Matches leading bullet symbols (without eating **bold** or *Word*) or numbered list prefixes like "1. " / "2) "
export const LEADING_BULLET_RE =
  /^(?:[•◦▪▫‣⁃∙●○■□◆◇➤➢➔→»❖✦★–—-]+\s*|\*(?!\*)\s+|\d{1,2}[.)]\s+)+/;

/**
 * Cleans unwanted invisible characters, tabs, and repeated horizontal spaces within each line
 * while preserving intentional line breaks and **bold** / ==highlight== markers.
 */
export function cleanMultilineWhitespace(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(UNICODE_SPACES_RE, ' ')
    .split('\n')
    .map((line) => line.replace(/[ ]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Strips leading bullet glyphs / numbering / stray spaces from a pasted line,
 * preserving **bold** or ==highlight== syntax at the start of a description line.
 */
export function stripLeadingBullet(line: string): string {
  const cleaned = line
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(UNICODE_SPACES_RE, ' ')
    .trim();
  return cleaned.replace(LEADING_BULLET_RE, '').replace(/[ ]{2,}/g, ' ').trim();
}

/**
 * Removes inline **bold** and ==highlight== markers for plain-text previews & titles.
 */
export function stripFormattingMarkers(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1');
}

/**
 * Cleans an announcement or special notice title:
 * - Removes invisible characters, extra spaces, leading bullets/numbering, and trailing colons/dashes
 * - Strips **bold** / ==highlight== markers so titles stay clean & uniform
 */
export function cleanAnnouncementTitle(raw: string): string {
  if (!raw) return '';
  let text = stripLeadingBullet(raw);
  text = stripFormattingMarkers(text);
  // Also strip WhatsApp single-asterisk title wrappers like "*Youth Retreat*"
  text = text.replace(/^\*([^*\n]+)\*$/, '$1');
  // Clean stray leading/trailing punctuation or extra spaces
  text = text
    .replace(LEADING_BULLET_RE, '')
    .replace(/\s+([,:;!?])/g, '$1')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/[:\-–—\s]+$/, '')
    .trim();
  return text;
}

/**
 * Cleans description prose while preserving intentional **bold** and ==highlight== markers.
 */
export function cleanDescriptionText(raw: string): string {
  if (!raw) return '';
  return cleanMultilineWhitespace(raw)
    .split('\n')
    .map((line) => line.replace(/\s+([,.;:!?])/g, '$1'))
    .join('\n')
    .trim();
}

export type InlineTextSegment =
  | { type: 'text'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'highlight'; value: string }
  | { type: 'bold-highlight'; value: string };

// Tokenizes ==**both**==, **==both==**, **bold**, and ==highlight== cleanly in linear time
const INLINE_TOKEN_RE =
  /(==\*\*([^*\n]+?)\*\*==|\*\*==([^=\n]+?)==\*\*|\*\*([^*\n]+?)\*\*|==([^=\n]+?)==)/g;

/**
 * Parses safe inline formatting markers into typed segments for React rendering.
 * Never interprets HTML tags.
 */
export function parseInlineFormattedText(text: string): InlineTextSegment[] {
  if (!text) return [];
  const segments: InlineTextSegment[] = [];
  let lastIndex = 0;

  INLINE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    if (match[2] !== undefined) {
      segments.push({ type: 'bold-highlight', value: match[2] });
    } else if (match[3] !== undefined) {
      segments.push({ type: 'bold-highlight', value: match[3] });
    } else if (match[4] !== undefined) {
      segments.push({ type: 'bold', value: match[4] });
    } else if (match[5] !== undefined) {
      segments.push({ type: 'highlight', value: match[5] });
    }
    lastIndex = INLINE_TOKEN_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/**
 * Wraps or unwraps the selected range in a textarea with `**` (bold) or `==` (highlight).
 */
export function applyWrapFormat(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  marker: '**' | '==',
  placeholder: string
): { nextValue: string; nextStart: number; nextEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));
  const selected = value.slice(start, end);
  const mLen = marker.length;

  // Toggle off if already wrapped immediately outside selection
  if (
    start >= mLen &&
    value.slice(start - mLen, start) === marker &&
    value.slice(end, end + mLen) === marker
  ) {
    const nextValue =
      value.slice(0, start - mLen) + selected + value.slice(end + mLen);
    return {
      nextValue,
      nextStart: start - mLen,
      nextEnd: end - mLen,
    };
  }

  // Toggle off if selection itself starts and ends with marker
  if (
    selected.length > mLen * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const unwrapped = selected.slice(mLen, -mLen);
    const nextValue = value.slice(0, start) + unwrapped + value.slice(end);
    return {
      nextValue,
      nextStart: start,
      nextEnd: start + unwrapped.length,
    };
  }

  const inner = selected || placeholder;
  const wrapped = `${marker}${inner}${marker}`;
  const nextValue = value.slice(0, start) + wrapped + value.slice(end);
  return {
    nextValue,
    nextStart: start + mLen,
    nextEnd: start + mLen + inner.length,
  };
}
