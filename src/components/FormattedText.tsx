import { Fragment } from 'react';
import {
  HighlightColorTone,
  parseFormattedBlocks,
  parseInlineFormattedText,
  TextColorTone,
} from '../lib/textFormat';

interface FormattedTextProps {
  text: string;
}

const TEXT_COLOR_CLASSES: Record<TextColorTone, string> = {
  navy: 'text-parish-navy',
  crimson: 'text-rose-700',
  emerald: 'text-emerald-700',
  gold: 'text-amber-800',
  purple: 'text-purple-800',
};

const HIGHLIGHT_BG_CLASSES: Record<HighlightColorTone, string> = {
  gold: 'bg-parish-gold-soft',
  rose: 'bg-rose-100',
  emerald: 'bg-emerald-100',
  sky: 'bg-sky-100',
};

const HIGHLIGHT_DEFAULT_TEXT_CLASSES: Record<HighlightColorTone, string> = {
  gold: 'text-parish-gold-ink',
  rose: 'text-rose-900',
  emerald: 'text-emerald-900',
  sky: 'text-sky-900',
};

/**
 * Renders announcement/notice descriptions with safe inline **bold**, ==highlight==,
 * font colors ({c:tone}...{/c}), and highlight colors ({h:tone}...{/h}) — including any nested combination.
 * Pure React JSX rendering (zero dangerouslySetInnerHTML).
 */
export function FormattedText({ text }: FormattedTextProps) {
  const segments = parseInlineFormattedText(text);
  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.highlight) {
          const bgClass = HIGHLIGHT_BG_CLASSES[seg.highlight];
          const textClass = seg.color
            ? TEXT_COLOR_CLASSES[seg.color]
            : HIGHLIGHT_DEFAULT_TEXT_CLASSES[seg.highlight];
          const weightClass = seg.bold ? 'font-bold' : seg.color ? 'font-semibold' : 'font-medium';
          return (
            <mark key={idx} className={`rounded px-1 py-0.5 ${bgClass} ${textClass} ${weightClass}`}>
              {seg.value}
            </mark>
          );
        }
        if (seg.color) {
          return (
            <span
              key={idx}
              className={`${TEXT_COLOR_CLASSES[seg.color]} ${seg.bold ? 'font-bold' : 'font-semibold'}`}
            >
              {seg.value}
            </span>
          );
        }
        if (seg.bold) {
          return (
            <strong key={idx} className="font-bold text-parish-ink">
              {seg.value}
            </strong>
          );
        }
        return <Fragment key={idx}>{seg.value}</Fragment>;
      })}
    </>
  );
}

interface FormattedRichBlocksProps {
  lines: string[];
  className?: string;
}

/**
 * Renders multi-line announcement / special notice prose as structured visual blocks:
 * - Styled section subheadings
 * - Clean numbered lists with circular number badges
 * - Clean bulleted lists with hanging indentation
 * - Inline **bold** and ==highlight== (including auto-upgraded WhatsApp *bold*)
 */
export function FormattedRichBlocks({ lines, className = '' }: FormattedRichBlocksProps) {
  const blocks = parseFormattedBlocks(lines);
  if (blocks.length === 0) return null;

  return (
    <div className={`parish-readable-body space-y-2.5 ${className}`.trim()}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <div
              key={idx}
              className={`rounded-lg border-l-[3px] px-2.5 py-1 text-sm font-bold tracking-tight ${
                block.highlighted
                  ? 'border-l-parish-gold bg-parish-gold-soft/75 text-parish-gold-ink'
                  : 'border-l-parish-navy bg-parish-canvas/90 text-parish-navy'
              }`}
            >
              {block.text}
            </div>
          );
        }

        if (block.type === 'ordered-list') {
          return (
            <ol key={idx} className="space-y-2">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-parish-navy/10 text-[11px] font-bold text-parish-navy ring-1 ring-parish-navy/15"
                  >
                    {item.num}
                  </span>
                  <span className="min-w-0 flex-1 leading-relaxed text-parish-ink">
                    <FormattedText text={item.content} />
                  </span>
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'bullet-list') {
          return (
            <ul key={idx} className="space-y-1.5">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-parish-gold"
                  />
                  <span className="min-w-0 flex-1 leading-relaxed text-parish-ink">
                    <FormattedText text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-line leading-relaxed text-parish-ink">
            <FormattedText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
