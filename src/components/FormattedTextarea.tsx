import { useRef } from 'react';
import { Bold, Highlighter } from 'lucide-react';
import { applyWrapFormat } from '../lib/textFormat';

interface FormattedTextareaProps {
  value: string;
  onChange: (nextValue: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Easy-to-use description editor with 1-click Bold (**text**) and Highlight (==text==) buttons.
 * Supports Ctrl/Cmd+B for Bold and Ctrl/Cmd+Shift+H for Highlight.
 */
export function FormattedTextarea({
  value,
  onChange,
  rows = 3,
  placeholder,
  className = '',
  ariaLabel,
}: FormattedTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleFormat = (marker: '**' | '==', placeholderText: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { nextValue, nextStart, nextEnd } = applyWrapFormat(
      value,
      start,
      end,
      marker,
      placeholderText
    );
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextStart, nextEnd);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (e.key.toLowerCase() === 'b' && !e.shiftKey) {
        e.preventDefault();
        handleFormat('**', 'bold text');
      } else if (e.key.toLowerCase() === 'h' && e.shiftKey) {
        e.preventDefault();
        handleFormat('==', 'highlighted text');
      }
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-[#E7E2DA] bg-white focus-within:border-[#1E3A5F]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E2DA] bg-[#FAF8F5] px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat('**', 'bold text')}
            title="Bold selected text (**text**) — Ctrl+B"
            className="inline-flex items-center gap-1 rounded-md border border-[#E7E2DA] bg-white px-2 py-0.5 text-[11px] font-bold text-[#1E3A5F] hover:bg-slate-100"
          >
            <Bold className="h-3 w-3" />
            Bold
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => handleFormat('==', 'highlighted text')}
            title="Highlight selected text (==text==) — Ctrl+Shift+H"
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-[#92400E] hover:bg-amber-100"
          >
            <Highlighter className="h-3 w-3" />
            Highlight
          </button>
        </div>
        <span className="text-[10px] text-[#526071]">
          Select text &amp; tap Bold or Highlight
        </span>
      </div>
      <textarea
        ref={textareaRef}
        rows={rows}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`block w-full resize-y border-0 bg-white px-3 py-2 text-sm text-[#1E293B] focus:outline-none ${className}`}
      />
    </div>
  );
}
