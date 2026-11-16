import { ReactionSummary, ReactionTargetType } from '../types/parish';

interface ReactionButtonProps {
  targetType: ReactionTargetType;
  targetId: string;
  summary?: ReactionSummary;
  onToggle: (targetType: ReactionTargetType, targetId: string) => void;
}

export function ReactionButton({
  targetType,
  targetId,
  summary,
  onToggle,
}: ReactionButtonProps) {
  const count = summary?.count ?? 0;
  const active = summary?.reactedByMe ?? false;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `Remove appreciation (${count})` : `Appreciate announcement (${count})`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(targetType, targetId);
      }}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all active:scale-95 ${
        active
          ? 'border-parish-gold/60 bg-parish-gold-soft text-parish-gold-ink shadow-2xs'
          : 'border-parish-border bg-parish-canvas text-parish-muted hover:border-parish-gold/40 hover:text-parish-ink'
      }`}
    >
      <span aria-hidden="true" className="text-sm leading-none">
        {active ? '🙏' : '🙏'}
      </span>
      <span>{active ? 'Appreciated' : 'Appreciate'}</span>
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none ${
            active ? 'bg-white text-parish-gold-ink' : 'bg-white text-parish-ink'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
