import { useMemo } from 'react';
import { Calendar, Megaphone, Search, Users, X } from 'lucide-react';
import { stripFormattingMarkers } from '../../lib/textFormat';
import { MinistryUpdate, SpecialAnnouncement, WeeklyBulletin } from '../../types/parish';

export interface SearchHit {
  id: string;
  kind: 'special' | 'bulletin' | 'ministry' | 'schedule';
  title: string;
  snippet: string;
  badge: string;
  weekIndex?: number;
  announcementId?: string;
  specialId?: string;
  ministryId?: string;
  scheduleDate?: string;
}

interface ParishInstantSearchProps {
  query: string;
  onQueryChange: (next: string) => void;
  onClose: () => void;
  bulletins: WeeklyBulletin[];
  specialAnnouncements: SpecialAnnouncement[];
  ministryUpdates: MinistryUpdate[];
  onSelectHit: (hit: SearchHit) => void;
}

export function ParishInstantSearch({
  query,
  onQueryChange,
  onClose,
  bulletins,
  specialAnnouncements,
  ministryUpdates,
  onSelectHit,
}: ParishInstantSearchProps) {
  const results = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: SearchHit[] = [];

    for (const notice of specialAnnouncements) {
      const hay = `${notice.title} ${notice.summary_preview ?? ''} ${notice.description} ${notice.location_label ?? ''} ${notice.event_date_label ?? ''}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push({
          id: `special:${notice.id}`,
          kind: 'special',
          title: notice.title,
          snippet: stripFormattingMarkers(notice.summary_preview || notice.description).slice(0, 120),
          badge: notice.category_badge ?? 'Special Notice',
          specialId: notice.id,
        });
      }
    }

    const recentBulletins = bulletins.slice(0, 4);
    recentBulletins.forEach((b, weekIdx) => {
      const weekLabel = weekIdx === 0 ? 'Current Week' : b.title.replace(/^Weekly Schedule\s*/i, '');
      for (const card of b.announcements) {
        const hay = `${card.title} ${card.body} ${card.category} ${card.locationLabel ?? ''} ${card.dateTimeLabel ?? ''}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({
            id: `bulletin:${b.id}:${card.id}`,
            kind: 'bulletin',
            title: card.title,
            snippet: stripFormattingMarkers(card.body).slice(0, 120),
            badge: `${card.category} • ${weekLabel}`,
            weekIndex: weekIdx,
            announcementId: card.id,
          });
        }
      }

      for (const day of b.daily_schedule) {
        const itemsText = day.items
          .map((it) => `${it.time} ${it.title} ${it.celebrant ?? ''}`)
          .join(' • ');
        const hay = `${day.dayLabel} ${day.date} ${day.feastNote ?? ''} ${itemsText}`.toLowerCase();
        if (hay.includes(q)) {
          hits.push({
            id: `schedule:${b.id}:${day.date}`,
            kind: 'schedule',
            title: `${day.dayLabel} (${day.date})${day.feastNote ? ` — ${day.feastNote}` : ''}`,
            snippet: itemsText.slice(0, 120),
            badge: `Schedule • ${weekLabel}`,
            weekIndex: weekIdx,
            scheduleDate: day.date,
          });
        }
      }
    });

    for (const m of ministryUpdates) {
      const hay = `${m.ministry_name} ${m.title} ${m.body} ${m.location_label ?? ''}`.toLowerCase();
      if (hay.includes(q)) {
        hits.push({
          id: `ministry:${m.id}`,
          kind: 'ministry',
          title: m.title,
          snippet: stripFormattingMarkers(m.body).slice(0, 120),
          badge: `Ministry • ${m.ministry_name}`,
          ministryId: m.id,
        });
      }
    }

    return hits.slice(0, 20);
  }, [query, bulletins, specialAnnouncements, ministryUpdates]);

  return (
    <div className="rounded-2xl border border-parish-navy/25 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas px-3 py-2 focus-within:border-parish-navy">
        <Search className="h-4 w-4 shrink-0 text-parish-navy" aria-hidden="true" />
        <input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search notices, CCD, Ward 3, Confession, schedules (4 weeks)..."
          aria-label="Search parish notices and schedules"
          className="min-w-0 flex-1 bg-transparent text-xs text-parish-ink placeholder:text-parish-muted focus:outline-none sm:text-sm"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            aria-label="Clear search"
            className="rounded p-0.5 text-parish-muted hover:text-parish-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-parish-border bg-white px-2 py-0.5 text-[11px] font-semibold text-parish-muted hover:text-parish-ink"
        >
          Done
        </button>
      </div>

      {query.trim().length >= 2 && (
        <div className="mt-2.5 max-h-72 space-y-1.5 overflow-y-auto">
          {results.length === 0 ? (
            <p className="py-3 text-center text-xs text-parish-muted">
              No matches found for “{query.trim()}” across notices, ministries, or the last 4 weeks.
            </p>
          ) : (
            results.map((hit) => (
              <button
                key={hit.id}
                type="button"
                onClick={() => onSelectHit(hit)}
                className="flex w-full items-start gap-2.5 rounded-xl border border-parish-border/70 bg-parish-canvas/55 px-3 py-2 text-left transition-colors hover:border-parish-navy/35 hover:bg-parish-canvas"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-parish-navy ring-1 ring-parish-border">
                  {hit.kind === 'special' ? (
                    <Megaphone className="h-3.5 w-3.5 text-parish-gold" />
                  ) : hit.kind === 'ministry' ? (
                    <Users className="h-3.5 w-3.5 text-teal-700" />
                  ) : (
                    <Calendar className="h-3.5 w-3.5 text-parish-navy" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-parish-navy ring-1 ring-parish-border/80">
                      {hit.badge}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-bold text-parish-ink">{hit.title}</p>
                  {hit.snippet && (
                    <p className="truncate text-[11px] text-parish-muted">{hit.snippet}</p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
