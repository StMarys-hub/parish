import { useRef, useState } from 'react';
import { Bold, ChevronDown, Highlighter, Palette } from 'lucide-react';
import {
  applyTaggedWrapFormat,
  applyWrapFormat,
  HighlightColorTone,
  TextColorTone,
} from '../lib/textFormat';

interface FormattedTextareaProps {
  value: string;
  onChange: (nextValue: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}

const FONT_COLOR_OPTIONS: {
  tone: TextColorTone;
  label: string;
  swatchClass: string;
  textClass: string;
}[] = [
  { tone: 'navy', label: 'Parish Navy', swatchClass: 'bg-[#1E3A5F]', textClass: 'text-[#1E3A5F]' },
  { tone: 'crimson', label: 'Urgent Red', swatchClass: 'bg-rose-700', textClass: 'text-rose-700' },
  { tone: 'emerald', label: 'Parish Green', swatchClass: 'bg-emerald-700', textClass: 'text-emerald-700' },
  { tone: 'gold', label: 'Liturgical Gold', swatchClass: 'bg-amber-700', textClass: 'text-amber-800' },
  { tone: 'purple', label: 'Royal Purple', swatchClass: 'bg-purple-800', textClass: 'text-purple-800' },
];

const HIGHLIGHT_COLOR_OPTIONS: {
  tone: HighlightColorTone;
  label: string;
  swatchClass: string;
  pillClass: string;
}[] = [
  {
    tone: 'gold',
    label: 'Warm Gold',
    swatchClass: 'bg-amber-200 ring-amber-400',
    pillClass: 'bg-amber-100 text-amber-900',
  },
  {
    tone: 'rose',
    label: 'Urgent Rose',
    swatchClass: 'bg-rose-200 ring-rose-400',
    pillClass: 'bg-rose-100 text-rose-900',
  },
  {
    tone: 'emerald',
    label: 'Soft Green',
    swatchClass: 'bg-emerald-200 ring-emerald-400',
    pillClass: 'bg-emerald-100 text-emerald-900',
  },
  {
    tone: 'sky',
    label: 'Info Blue',
    swatchClass: 'bg-sky-200 ring-sky-400',
    pillClass: 'bg-sky-100 text-sky-900',
  },
];

/**
 * Easy-to-use description editor with 1-click Bold (**text**), Font Color ({c:tone}...{/c}),
 * and Highlight Color (==text== / {h:tone}...{/h}) toolbar controls.
 * Supports Ctrl/Cmd+B for Bold and Ctrl/Cmd+Shift+H for Gold Highlight.
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
  const [openMenu, setOpenMenu] = useState<'color' | 'highlight' | null>(null);

  const commitEdit = (nextValue: string, nextStart: number, nextEnd: number) => {
    onChange(nextValue);
    setOpenMenu(null);
    window.requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(nextStart, nextEnd);
    });
  };

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
    commitEdit(nextValue, nextStart, nextEnd);
  };

  const handleTextColor = (tone: TextColorTone) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { nextValue, nextStart, nextEnd } = applyTaggedWrapFormat(
      value,
      start,
      end,
      `{c:${tone}}`,
      '{/c}',
      'colored text'
    );
    commitEdit(nextValue, nextStart, nextEnd);
  };

  const handleHighlightColor = (tone: HighlightColorTone) => {
    if (tone === 'gold') {
      handleFormat('==', 'highlighted text');
      return;
    }
    const el = textareaRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const { nextValue, nextStart, nextEnd } = applyTaggedWrapFormat(
      value,
      start,
      end,
      `{h:${tone}}`,
      '{/h}',
      'highlighted text'
    );
    commitEdit(nextValue, nextStart, nextEnd);
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
    <div className="rounded-lg border border-[#E7E2DA] bg-white focus-within:border-[#1E3A5F]">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b border-[#E7E2DA] bg-[#FAF8F5] px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Bold */}
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

          {/* Font Color Picker */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpenMenu((m) => (m === 'color' ? null : 'color'))}
              title="Choose liturgical font color for selected text"
              aria-expanded={openMenu === 'color'}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                openMenu === 'color'
                  ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white'
                  : 'border-[#E7E2DA] bg-white text-[#1E3A5F] hover:bg-slate-100'
              }`}
            >
              <Palette className="h-3 w-3" />
              Text Color
              <ChevronDown className="h-3 w-3 opacity-75" />
            </button>

            {openMenu === 'color' && (
              <div className="absolute left-0 top-full z-20 mt-1 flex flex-wrap gap-1 rounded-xl border border-[#E7E2DA] bg-white p-1.5 shadow-lg sm:w-max">
                {FONT_COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.tone}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleTextColor(opt.tone)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-[11px] font-semibold hover:border-[#E7E2DA] hover:bg-[#FAF8F5]"
                  >
                    <span className={`h-3 w-3 rounded-full ${opt.swatchClass}`} />
                    <span className={opt.textClass}>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Highlight Color Picker */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpenMenu((m) => (m === 'highlight' ? null : 'highlight'))}
              title="Highlight selected text with color — Ctrl+Shift+H for Gold"
              aria-expanded={openMenu === 'highlight'}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                openMenu === 'highlight'
                  ? 'border-amber-500 bg-amber-100 text-[#92400E]'
                  : 'border-amber-300 bg-amber-50 text-[#92400E] hover:bg-amber-100'
              }`}
            >
              <Highlighter className="h-3 w-3" />
              Highlight
              <ChevronDown className="h-3 w-3 opacity-75" />
            </button>

            {openMenu === 'highlight' && (
              <div className="absolute left-0 top-full z-20 mt-1 flex flex-wrap gap-1 rounded-xl border border-[#E7E2DA] bg-white p-1.5 shadow-lg sm:w-max">
                {HIGHLIGHT_COLOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.tone}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleHighlightColor(opt.tone)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold transition-opacity hover:opacity-90 ${opt.pillClass}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ring-1 ${opt.swatchClass}`} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <span className="text-[10px] text-[#526071]">
          Select text &amp; choose Bold, Color, or Highlight
        </span>
      </div>
      <textarea
        ref={textareaRef}
        rows={rows}
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpenMenu(null)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={`block w-full resize-y rounded-b-lg border-0 bg-white px-3 py-2 text-sm text-[#1E293B] focus:outline-none ${className}`}
      />
    </div>
  );
}
