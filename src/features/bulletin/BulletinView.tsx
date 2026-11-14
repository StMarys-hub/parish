import { useMemo, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MapPin,
  Sparkles,
} from 'lucide-react';
import { CategoryBadge } from '../../components/CategoryBadge';
import { FlyerLightbox } from '../../components/FlyerLightbox';
import { sanitizeActionUrl } from '../../lib/sanitize';
import {
  ActionAttachment,
  AnnouncementCategory,
  WeeklyBulletin,
} from '../../types/parish';
import { PushOptInCard } from '../notifications/PushOptInCard';

interface BulletinViewProps {
  bulletins: WeeklyBulletin[];
  isLoading: boolean;
  source: 'live' | 'cache' | 'sample';
}

const ARCHIVE_LABELS = ['Current', 'Last Week', '2 Wks Ago', '3 Wks Ago'] as const;

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function getActionIcon(kind: ActionAttachment['kind']) {
  switch (kind) {
    case 'form':
      return <FileText className="h-4 w-4" />;
    case 'flyer':
      return <ImageIcon className="h-4 w-4" />;
    case 'drive':
      return <FolderOpen className="h-4 w-4" />;
    default:
      return <ExternalLink className="h-4 w-4" />;
  }
}

export function BulletinView({ bulletins, isLoading, source }: BulletinViewProps) {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<'All' | AnnouncementCategory>('All');
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [lightboxFlyer, setLightboxFlyer] = useState<{
    title: string;
    url: string;
    mimeType?: string | null;
  } | null>(null);

  const activeBulletin = bulletins[selectedWeekIndex] ?? bulletins[0];

  const categoryCounts = useMemo(() => {
    const counts = new Map<AnnouncementCategory, number>();
    if (!activeBulletin) return counts;
    for (const item of activeBulletin.announcements) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [activeBulletin]);

  const visibleAnnouncements = useMemo(() => {
    if (!activeBulletin) return [];
    const sorted = [...activeBulletin.announcements].sort((a, b) => a.order - b.order);
    if (selectedCategory === 'All') return sorted;
    return sorted.filter((a) => a.category === selectedCategory);
  }, [activeBulletin, selectedCategory]);

  if (isLoading && bulletins.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-[#E7E2DA]/60" />
        <div className="h-10 animate-pulse rounded-xl bg-[#E7E2DA]/50" />
        <div className="h-44 animate-pulse rounded-2xl bg-[#E7E2DA]/50" />
        <div className="h-44 animate-pulse rounded-2xl bg-[#E7E2DA]/50" />
      </div>
    );
  }

  if (!activeBulletin) {
    return (
      <div className="rounded-2xl border border-[#E7E2DA] bg-white p-8 text-center">
        <p className="text-base font-medium text-[#1E293B]">No published parish bulletins yet.</p>
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      {/* Pastoral Greeting Banner */}
      <section className="rounded-2xl bg-gradient-to-br from-[#1E3A5F] to-[#152943] p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D4AF37]/40 bg-[#D4AF37]/15 px-3 py-1 text-xs font-semibold text-[#FDE68A]">
            <Sparkles className="h-3.5 w-3.5" />
            {formatShortDate(activeBulletin.week_start)} – {formatShortDate(activeBulletin.week_end)}
          </span>
          {source !== 'live' && (
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-200">
              {source === 'cache' ? 'Offline Copy' : 'Sample Preview'}
            </span>
          )}
        </div>
        <p className="mt-3 font-serif text-lg font-semibold leading-snug text-[#FAF8F5] sm:text-xl">
          “{activeBulletin.greeting}”
        </p>
        <p className="mt-1 text-xs text-slate-300">{activeBulletin.title}</p>
      </section>

      {/* 3-Week Rolling Archive Switcher */}
      {bulletins.length > 1 && (
        <nav aria-label="Bulletin archive weeks" className="grid grid-cols-4 gap-1.5 rounded-xl border border-[#E7E2DA] bg-white p-1">
          {bulletins.slice(0, 4).map((b, idx) => {
            const active = idx === selectedWeekIndex;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSelectedWeekIndex(idx);
                  setSelectedCategory('All');
                }}
                className={`rounded-lg px-2 py-2 text-center text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#1E3A5F] text-white shadow-2xs'
                    : 'text-[#526071] hover:bg-[#FAF8F5] hover:text-[#1E293B]'
                }`}
              >
                <span className="block truncate">{ARCHIVE_LABELS[idx] ?? `Week ${idx + 1}`}</span>
                <span className={`block text-[10px] font-normal ${active ? 'text-slate-200' : 'text-slate-400'}`}>
                  {formatShortDate(b.week_start)}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Push Opt-In Banner (Compact when already subscribed) */}
      {selectedWeekIndex === 0 && <PushOptInCard compact />}

      {/* This Week's Dynamic Liturgical Schedule Accordion */}
      {activeBulletin.daily_schedule.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-[#E7E2DA] bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setScheduleExpanded((v) => !v)}
            aria-expanded={scheduleExpanded}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-[#FAF8F5]/70"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-[#1E3A5F]/10 p-2 text-[#1E3A5F]">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#1E293B]">
                  This Week’s Holy Qurbana & Services
                </h2>
                <p className="text-xs text-[#526071]">
                  {scheduleExpanded ? 'Tap to collapse daily times' : 'Tap to expand full 7-day parish schedule'}
                </p>
              </div>
            </div>
            {scheduleExpanded ? (
              <ChevronUp className="h-5 w-5 text-[#526071]" />
            ) : (
              <ChevronDown className="h-5 w-5 text-[#526071]" />
            )}
          </button>

          {scheduleExpanded && (
            <div className="divide-y divide-[#E7E2DA] border-t border-[#E7E2DA]">
              {activeBulletin.daily_schedule.map((day) => {
                const isToday = day.date === todayIso;
                return (
                  <div
                    key={day.date}
                    className={`px-4 py-3 ${isToday ? 'bg-[#FEF7E0]/60' : 'bg-white'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[#1E293B]">
                          {day.dayLabel}
                        </span>
                        <span className="text-xs text-[#526071]">
                          {formatShortDate(day.date)}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-[#1E3A5F] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            Today
                          </span>
                        )}
                      </div>
                      {day.feastNote && (
                        <span className="rounded-full border border-[#B8860B]/30 bg-[#FEF7E0] px-2.5 py-0.5 text-[11px] font-semibold text-[#8A6508]">
                          {day.feastNote}
                        </span>
                      )}
                    </div>

                    <ul className="mt-2 space-y-1.5">
                      {day.items.map((svc, sIdx) => (
                        <li key={sIdx} className="flex items-start gap-2 text-sm text-[#1E293B]">
                          {svc.time ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-[#1E3A5F]">
                              <Clock className="h-3 w-3" />
                              {svc.time}
                            </span>
                          ) : (
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                          )}
                          <span>
                            {svc.title}
                            {svc.celebrant && (
                              <span className="ml-1.5 text-xs font-medium text-[#526071]">
                                ({svc.celebrant})
                              </span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Horizontal Category Filter Pills */}
      <div
        role="tablist"
        aria-label="Filter announcements by category"
        className="no-scrollbar flex gap-2 overflow-x-auto pb-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'All'}
          onClick={() => setSelectedCategory('All')}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
            selectedCategory === 'All'
              ? 'bg-[#1E3A5F] text-white'
              : 'border border-[#E7E2DA] bg-white text-[#526071] hover:text-[#1E293B]'
          }`}
        >
          All ({activeBulletin.announcements.length})
        </button>
        {Array.from(categoryCounts.entries()).map(([cat, count]) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat}
            onClick={() => setSelectedCategory(cat)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              selectedCategory === cat
                ? 'bg-[#1E3A5F] text-white'
                : 'border border-[#E7E2DA] bg-white text-[#526071] hover:text-[#1E293B]'
            }`}
          >
            {cat} ({count})
          </button>
        ))}
      </div>

      {/* Categorized Announcement Cards */}
      <div className="space-y-3.5">
        {visibleAnnouncements.map((card) => (
          <article
            key={card.id}
            className="rounded-2xl border border-[#E7E2DA] bg-white p-4 shadow-2xs transition-shadow hover:shadow-sm sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="text-base font-bold leading-snug text-[#1E293B] sm:text-lg">
                {card.title}
              </h3>
              <CategoryBadge category={card.category} />
            </div>

            {(card.dateTimeLabel || card.locationLabel) && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {card.dateTimeLabel && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF8F5] px-2.5 py-1 text-xs font-medium text-[#1E3A5F]">
                    <Calendar className="h-3.5 w-3.5 text-[#B8860B]" />
                    {card.dateTimeLabel}
                  </span>
                )}
                {card.locationLabel && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-[#FAF8F5] px-2.5 py-1 text-xs font-medium text-[#526071]">
                    <MapPin className="h-3.5 w-3.5 text-[#1E3A5F]" />
                    {card.locationLabel}
                  </span>
                )}
              </div>
            )}

            <p className="mt-3 whitespace-pre-line text-base leading-[1.6] text-[#1E293B]">
              {card.body}
            </p>

            {card.actions.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {card.actions.map((action, idx) => {
                  const safeUrl = sanitizeActionUrl(action.url);
                  if (!safeUrl) return null;

                  if (action.kind === 'flyer') {
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          setLightboxFlyer({
                            title: action.label || card.title,
                            url: safeUrl,
                            mimeType: action.mimeType,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-xl border border-[#1E3A5F]/20 bg-[#1E3A5F]/5 px-3.5 py-2 text-sm font-semibold text-[#1E3A5F] hover:bg-[#1E3A5F]/10"
                      >
                        {getActionIcon(action.kind)}
                        {action.label}
                      </button>
                    );
                  }

                  return (
                    <a
                      key={idx}
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A5F] px-3.5 py-2 text-sm font-semibold text-white shadow-2xs hover:bg-[#152943]"
                    >
                      {getActionIcon(action.kind)}
                      {action.label}
                    </a>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>

      {/* Sunday Collection Highlight Card */}
      {activeBulletin.collection_summary && (
        <section className="flex items-center justify-between rounded-2xl border border-[#B8860B]/30 bg-[#FEF7E0]/60 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#B8860B]/15 p-2.5 text-[#8A6508]">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8A6508]">
                Weekly Offertory
              </p>
              <p className="text-sm font-bold text-[#1E293B]">
                {activeBulletin.collection_summary.label}
              </p>
            </div>
          </div>
          <span className="text-xl font-extrabold text-[#1E3A5F]">
            {activeBulletin.collection_summary.amountDisplay}
          </span>
        </section>
      )}

      {/* Pastoral Sign-Off Footer */}
      <footer className="rounded-2xl border border-[#E7E2DA] bg-white p-5 text-center">
        <p className="text-sm italic text-[#526071]">{activeBulletin.sign_off.closing}</p>
        <p className="mt-1 font-serif text-base font-bold text-[#1E3A5F]">
          {activeBulletin.sign_off.name}
        </p>
        <p className="text-xs text-[#526071]">{activeBulletin.sign_off.title}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
          {sanitizeActionUrl(`mailto:${activeBulletin.sign_off.email}`) && (
            <a
              href={`mailto:${activeBulletin.sign_off.email}`}
              className="font-medium text-[#1E3A5F] underline"
            >
              {activeBulletin.sign_off.email}
            </a>
          )}
          {sanitizeActionUrl(activeBulletin.sign_off.website) && (
            <a
              href={activeBulletin.sign_off.website}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#1E3A5F] underline"
            >
              stmarysyroclt.org
            </a>
          )}
        </div>
      </footer>

      <FlyerLightbox
        isOpen={Boolean(lightboxFlyer)}
        title={lightboxFlyer?.title ?? ''}
        url={lightboxFlyer?.url ?? ''}
        mimeType={lightboxFlyer?.mimeType}
        onClose={() => setLightboxFlyer(null)}
      />
    </div>
  );
}
