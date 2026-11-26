import { AlertTriangle, Minus, Star } from 'lucide-react';
import { AnnouncementPriority, normalizeAnnouncementPriority } from '../types/parish';

interface PrioritySelectorProps {
  value?: AnnouncementPriority | null;
  onChange: (next: AnnouncementPriority) => void;
  showAlertFatigueHint?: boolean;
}

const PRIORITY_OPTIONS: {
  value: AnnouncementPriority;
  label: string;
  activeClass: string;
  Icon: typeof Minus;
}[] = [
  {
    value: 'normal',
    label: 'Normal',
    activeClass: 'bg-parish-navy text-white shadow-2xs',
    Icon: Minus,
  },
  {
    value: 'important',
    label: 'Important',
    activeClass: 'bg-amber-600 text-white shadow-2xs',
    Icon: Star,
  },
  {
    value: 'urgent',
    label: 'Urgent',
    activeClass: 'bg-rose-600 text-white shadow-2xs',
    Icon: AlertTriangle,
  },
];

/**
 * Zero-friction 1-tap 3-segment priority selector (defaults to Normal).
 */
export function PrioritySelector({
  value,
  onChange,
  showAlertFatigueHint = false,
}: PrioritySelectorProps) {
  const current = normalizeAnnouncementPriority(value);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-[#526071]">Priority:</span>
        <div
          role="radiogroup"
          aria-label="Announcement priority"
          className="inline-flex items-center rounded-lg border border-[#E7E2DA] bg-[#FAF8F5] p-0.5"
        >
          {PRIORITY_OPTIONS.map(({ value: optVal, label, activeClass, Icon }) => {
            const active = current === optVal;
            return (
              <button
                key={optVal}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(optVal)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  active ? activeClass : 'text-[#526071] hover:bg-white hover:text-[#1E293B]'
                }`}
              >
                <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {showAlertFatigueHint && (
        <p className="text-[10px] font-medium text-amber-800">
          Tip: Reserve Urgent for critical changes so parishioners notice them immediately.
        </p>
      )}
    </div>
  );
}
