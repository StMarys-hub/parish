import { Fragment } from 'react';
import { parseInlineFormattedText } from '../lib/textFormat';

interface FormattedTextProps {
  text: string;
}

/**
 * Renders announcement/notice descriptions with safe inline **bold** and ==highlight== styling.
 * Pure React JSX rendering (zero dangerouslySetInnerHTML).
 */
export function FormattedText({ text }: FormattedTextProps) {
  const segments = parseInlineFormattedText(text);
  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.type === 'bold') {
          return (
            <strong key={idx} className="font-bold text-parish-ink">
              {seg.value}
            </strong>
          );
        }
        if (seg.type === 'highlight') {
          return (
            <mark
              key={idx}
              className="rounded bg-parish-gold-soft px-1 py-0.5 font-medium text-parish-gold-ink"
            >
              {seg.value}
            </mark>
          );
        }
        if (seg.type === 'bold-highlight') {
          return (
            <mark
              key={idx}
              className="rounded bg-parish-gold-soft px-1 py-0.5 font-bold text-parish-gold-ink"
            >
              {seg.value}
            </mark>
          );
        }
        return <Fragment key={idx}>{seg.value}</Fragment>;
      })}
    </>
  );
}
