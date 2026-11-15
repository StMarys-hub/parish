import { useState } from 'react';
import { DollarSign, Eye, EyeOff } from 'lucide-react';
import { CollectionSummary } from '../../types/parish';

interface CollectionHighlightCardProps {
  collection: CollectionSummary;
}

export function CollectionHighlightCard({ collection }: CollectionHighlightCardProps) {
  const [revealed, setRevealed] = useState(false);

  const toggleReveal = () => setRevealed((prev) => !prev);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleReveal();
    }
  };

  return (
    <section
      role="button"
      tabIndex={0}
      aria-expanded={revealed}
      aria-label={`${collection.label}. ${revealed ? `Amount ${collection.amountDisplay}. Tap to hide` : 'Tap to reveal collection amount'}`}
      onClick={toggleReveal}
      onKeyDown={handleKeyDown}
      className="group flex cursor-pointer select-none items-center justify-between gap-3 rounded-2xl border border-parish-gold/30 bg-parish-gold-soft/75 p-4 transition-all hover:border-parish-gold/55 focus:outline-none focus:ring-2 focus:ring-parish-navy/40"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0 rounded-xl bg-parish-gold/15 p-2.5 text-parish-gold-ink">
          <DollarSign className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-parish-gold-ink">
            Weekly Offertory
          </p>
          <p className="truncate text-sm font-bold text-parish-ink">{collection.label}</p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end">
        <span className="inline-flex items-center gap-2 rounded-xl border border-parish-gold/30 bg-white px-3.5 py-1.5 shadow-2xs transition-colors group-hover:border-parish-gold/60">
          {revealed ? (
            <>
              <span className="text-lg font-extrabold tracking-tight text-parish-navy transition-opacity duration-200">
                {collection.amountDisplay}
              </span>
              <EyeOff className="h-4 w-4 text-parish-muted" aria-hidden="true" />
            </>
          ) : (
            <>
              <span className="font-mono text-base font-bold tracking-wider text-parish-navy">
                $ •••.••
              </span>
              <Eye className="h-4 w-4 text-parish-gold-ink" aria-hidden="true" />
            </>
          )}
        </span>
        <span className="mt-1 text-[10px] font-medium text-parish-gold-ink">
          {revealed ? 'Tap to hide' : 'Tap to view'}
        </span>
      </div>
    </section>
  );
}
