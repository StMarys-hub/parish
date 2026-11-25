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
 * Normalizes messy copy-pasted WhatsApp / Word / Markdown formatting into clean parish markup:
 * - Collapses nested/broken bold markers like "** *Title:* **" or "***Title***" -> "**Title**"
 * - Converts WhatsApp single-asterisk bold (*word* or *multiple words*) to **bold**
 *   without touching bullet markers ("* item") or math ("5 * 3")
 * - Fixes common paste spacing glitches like "($50)to" -> "($50) to"
 */
export function normalizeWhatsAppFormatting(raw: string): string {
  if (!raw) return '';
  let text = raw
    .replace(INVISIBLE_CHARS_RE, '')
    .replace(UNICODE_SPACES_RE, ' ');

  // 1. Collapse double+single nested wrappers like "** *Important Ward Updates:* **" -> "**Important Ward Updates:**"
  text = text.replace(/\*\*\s*\*([^*\n]+?)\*\s*\*\*/g, (_, inner: string) => `**${inner.trim()}**`);
  // 2. Collapse triple+ asterisks like "***Important***" -> "**Important**"
  text = text.replace(/\*{3,}([^*\n]+?)\*{3,}/g, (_, inner: string) => `**${inner.trim()}**`);
  // 3. Trim stray whitespace just inside ** ... **
  text = text.replace(/\*\*[ ]+([^*\n]+?)[ ]+\*\*/g, (_, inner: string) => `**${inner.trim()}**`);
  // 4. Convert WhatsApp single-asterisk *bold* to **bold** (preserves **bold** and "* bullet")
  text = text.replace(
    /(^|[^\w*])\*([^\s*](?:[^*\n]*?[^\s*])?)\*(?![\w*])/g,
    '$1**$2**'
  );
  // 5. Fix missing space after closing parenthesis before a letter, e.g. "($50)to" -> "($50) to"
  text = text.replace(/\)(?=[A-Za-z])/g, ') ');
  // 6. Collapse repeated horizontal spaces
  text = text.replace(/[ ]{2,}/g, ' ');

  return text;
}

/**
 * Removes inline **bold**, *whatsapp bold*, and ==highlight== markers for plain-text previews & titles.
 */
export function stripFormattingMarkers(text: string): string {
  if (!text) return '';
  return normalizeWhatsAppFormatting(text)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/==([^=]+)==/g, '$1');
}

/**
 * Cleans an announcement or special notice title:
 * - Removes invisible characters, extra spaces, leading bullets/numbering, and trailing commas/colons/dashes
 * - Strips **bold** / *bold* / ==highlight== markers so titles stay clean & uniform
 */
export function cleanAnnouncementTitle(raw: string): string {
  if (!raw) return '';
  let text = stripLeadingBullet(raw);
  text = stripFormattingMarkers(text);
  // Also strip WhatsApp single-asterisk title wrappers like "*Youth Retreat*" or stray leading/trailing "*"
  text = text.replace(/^\*([^*\n]+)\*$/, '$1').replace(/^\*+\s*/, '').replace(/\s*\*+$/, '');
  // Clean stray leading/trailing punctuation or extra spaces
  text = text
    .replace(LEADING_BULLET_RE, '')
    .replace(/\s+([,:;!?])/g, '$1')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/[,:\-–—\s]+$/, '')
    .trim();
  return text;
}

/**
 * Cleans description prose while preserving intentional **bold**, ==highlight==,
 * numbered lists (1. / 2.), and bullet lists (- / •).
 * Automatically upgrades WhatsApp *bold* and repairs common paste spacing glitches.
 */
export function cleanDescriptionText(raw: string): string {
  if (!raw) return '';
  return cleanMultilineWhitespace(raw)
    .split('\n')
    .map((line) => {
      let cleaned = normalizeWhatsAppFormatting(line);
      // Standardize Unicode bullet glyphs at start of line to clean "- " bullets
      cleaned = cleaned.replace(/^[•◦▪▫‣⁃∙●○■□◆◇➤➢➔→»❖✦★]\s+/, '- ');
      cleaned = cleaned.replace(/\s+([,.;:!?])/g, '$1');
      return cleaned.trim();
    })
    .join('\n')
    .trim();
}

export type FormattedBlock =
  | { type: 'heading'; text: string; highlighted: boolean }
  | { type: 'ordered-list'; items: { num: string; content: string }[] }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'paragraph'; text: string };

const ORDERED_ITEM_BOLD_RE = /^\*\*(\d{1,2})[.)]\s+([^*\n]+?)\*\*(\s*[:\-–—]?\s*.*)$/;
const ORDERED_ITEM_PLAIN_RE = /^(\d{1,2})[.)]\s+(.+)$/;
const BULLET_ITEM_RE = /^(?:[•◦▪▫‣⁃∙●○■□◆◇➤➢➔→»❖✦★–—-]|\*(?!\*))\s+(.+)$/;

/**
 * Parses cleaned lines/paragraphs into structured visual blocks:
 * - Standalone bold/highlighted section headings (e.g. "**Important Ward Updates:**")
 * - Numbered lists (supporting both "1. Title: ..." and "**1. Title**: ...")
 * - Bulleted lists ("• ...", "- ...", "* ...")
 * - Regular formatted paragraphs
 */
export function parseFormattedBlocks(rawLines: string[]): FormattedBlock[] {
  const blocks: FormattedBlock[] = [];
  const normalizedLines = rawLines
    .flatMap((chunk) => chunk.split('\n'))
    .map((line) => normalizeWhatsAppFormatting(line).trim())
    .filter(Boolean);

  for (const line of normalizedLines) {
    // 1. Numbered list item with bold prefix: "**1. Prayer Meeting**: Please note..."
    const boldNum = line.match(ORDERED_ITEM_BOLD_RE);
    if (boldNum) {
      const num = boldNum[1];
      const boldTitle = boldNum[2].trim();
      const rest = boldNum[3] ?? '';
      const content = `**${boldTitle}**${rest}`;
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'ordered-list') {
        last.items.push({ num, content });
      } else {
        blocks.push({ type: 'ordered-list', items: [{ num, content }] });
      }
      continue;
    }

    // 2. Plain numbered list item: "1. Prayer Meeting: Please note..."
    const plainNum = line.match(ORDERED_ITEM_PLAIN_RE);
    if (plainNum) {
      const num = plainNum[1];
      const content = plainNum[2].trim();
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'ordered-list') {
        last.items.push({ num, content });
      } else {
        blocks.push({ type: 'ordered-list', items: [{ num, content }] });
      }
      continue;
    }

    // 3. Bullet list item: "• ...", "- ...", "* ..."
    const bullet = line.match(BULLET_ITEM_RE);
    if (bullet) {
      const content = bullet[1].trim();
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'bullet-list') {
        last.items.push(content);
      } else {
        blocks.push({ type: 'bullet-list', items: [content] });
      }
      continue;
    }

    // 4. Standalone section heading: entirely wrapped in **...** or ==...== and concise
    const fullHighlightHeading = line.match(/^==(?:\*\*)?([^=\n]+?)(?:\*\*)?==$/);
    if (fullHighlightHeading && fullHighlightHeading[1].trim().length <= 85) {
      blocks.push({
        type: 'heading',
        text: fullHighlightHeading[1].trim(),
        highlighted: true,
      });
      continue;
    }

    const fullBoldHeading = line.match(/^\*\*([^*\n]+?)\*\*$/);
    if (fullBoldHeading && fullBoldHeading[1].trim().length <= 85) {
      blocks.push({
        type: 'heading',
        text: fullBoldHeading[1].trim(),
        highlighted: false,
      });
      continue;
    }

    // 5. Regular paragraph
    blocks.push({ type: 'paragraph', text: line });
  }

  return blocks;
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
  const normalized = normalizeWhatsAppFormatting(text);
  const segments: InlineTextSegment[] = [];
  let lastIndex = 0;

  INLINE_TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_TOKEN_RE.exec(normalized)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: normalized.slice(lastIndex, match.index) });
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

  if (lastIndex < normalized.length) {
    segments.push({ type: 'text', value: normalized.slice(lastIndex) });
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
