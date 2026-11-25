import { CardTitleColor } from '../types/parish';

export const TITLE_COLOR_TEXT_CLASSES: Record<CardTitleColor, string> = {
  navy: 'text-parish-navy',
  crimson: 'text-rose-700',
  emerald: 'text-emerald-700',
  gold: 'text-amber-800',
  purple: 'text-purple-800',
};

const TITLE_COLOR_SWATCHES: {
  value: CardTitleColor | null;
  label: string;
  dotClass: string;
}[] = [
  { value: null, label: 'Default', dotClass: 'bg-slate-800' },
  { value: 'navy', label: 'Parish Navy', dotClass: 'bg-[#1E3A5F]' },
  { value: 'crimson', label: 'Urgent Red', dotClass: 'bg-rose-700' },
  { value: 'emerald', label: 'Parish Green', dotClass: 'bg-emerald-700' },
  { value: 'gold', label: 'Liturgical Gold', dotClass: 'bg-amber-700' },
  { value: 'purple', label: 'Royal Purple', dotClass: 'bg-purple-800' },
];

interface TitleColorPickerProps {
  value?: CardTitleColor | null;
  onChange: (next: CardTitleColor | null) => void;
}

/**
 * Compact 1-tap swatch bar for choosing an announcement or special notice card title color.
 */
export function TitleColorPicker({ value = null, onChange }: TitleColorPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Title font color">
      <span className="text-[11px] font-semibold text-[#526071]">Title Color:</span>
      {TITLE_COLOR_SWATCHES.map((opt) => {
        const selected = (value ?? null) === opt.value;
        return (
          <button
            key={opt.label}
            type="button"
            title={opt.label}
            aria-label={`Set title color to ${opt.label}`}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-all ${
              selected
                ? 'border-[#1E3A5F] bg-[#1E3A5F]/10 text-[#1E3A5F] ring-1 ring-[#1E3A5F]/40'
                : 'border-[#E7E2DA] bg-white text-[#526071] hover:bg-[#FAF8F5]'
            }`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${opt.dotClass}`} aria-hidden="true" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
