import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  MapPin,
  RotateCcw,
} from 'lucide-react';
import { CollapsibleAnnouncementCard } from '../../components/CollapsibleAnnouncementCard';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FlyerLightbox } from '../../components/FlyerLightbox';
import { ScrollablePillBar } from '../../components/ScrollablePillBar';
import { PHASE_FLAGS } from '../../config/features';
import { computeAttentionBadges } from '../../lib/announcementSignals';
import { useReadAnnouncements } from '../../lib/readReceipts';
import { sanitizeActionUrl } from '../../lib/sanitize';
import { useSmartAnnouncementOrder } from '../../lib/useSmartAnnouncementOrder';
import {
  fetchReactionSummaries,
  ReactionMap,
  reactionKey,
  toggleReactionRemote,
} from '../../services/reactionsService';
import {
  ActionAttachment,
  AnnouncementCategory,
  MinistryUpdate,
  ReactionTargetType,
  SpecialAnnouncement,
  WeeklyBulletin,
} from '../../types/parish';
import { MinistryUpdatesView } from '../ministries/MinistryUpdatesView';
import { PushOptInCard } from '../notifications/PushOptInCard';
import { SpecialAnnouncementsFeed } from '../special/SpecialAnnouncementsFeed';
import { CollectionHighlightCard } from './CollectionHighlightCard';

interface BulletinViewProps {
  bulletins: WeeklyBulletin[];
  isLoading: boolean;
  source: 'live' | 'cache' | 'sample';
  seasonLabel?: string;
  specialAnnouncements?: SpecialAnnouncement[];
  ministryUpdates?: MinistryUpdate[];
  isPreview?: boolean;
}

const ARCHIVE_LABELS = ['Current', 'Last Week', '2 Wks Ago', '3 Wks Ago'] as const;

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatNumericMonthDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  return `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
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

export function BulletinView({
  bulletins,
  isLoading,
  source,
  seasonLabel,
  specialAnnouncements = [],
  ministryUpdates = [],
  isPreview = false,
}: BulletinViewProps) {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<
    'All' | 'Ministry' | AnnouncementCategory
  >('All');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [deferredMoveKeys, setDeferredMoveKeys] = useState<Set<string>>(() => new Set());
  const [weeklyExpanded, setWeeklyExpanded] = useState(true);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [lightboxFlyer, setLightboxFlyer] = useState<{
    title: string;
    url: string;
    mimeType?: string | null;
  } | null>(null);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const { isUnread, markRead, markManyRead, resetAllRead } = useReadAnnouncements();

  useEffect(() => {
    if (!PHASE_FLAGS.reactions) return;
    let cancelled = false;
    fetchReactionSummaries().then((map) => {
      if (!cancelled) setReactions(map);
    });
    return () => {
      cancelled = true;
    };
  }, [bulletins, specialAnnouncements, ministryUpdates]);

  const handleToggleReaction = useCallback(
    (targetType: ReactionTargetType, targetId: string) => {
      const key = reactionKey(targetType, targetId);
      const previous = reactions[key] ?? { count: 0, reactedByMe: false };

      // Instantaneous 0ms Optimistic UI update
      setReactions((prev) => {
        const cur = prev[key] ?? { count: 0, reactedByMe: false };
        return {
          ...prev,
          [key]: {
            reactedByMe: !cur.reactedByMe,
            count: Math.max(0, cur.count + (cur.reactedByMe ? -1 : 1)),
          },
        };
      });

      toggleReactionRemote(targetType, targetId)
        .then((confirmed) => {
          setReactions((prev) => ({ ...prev, [key]: confirmed }));
        })
        .catch(() => {
          // Revert only if remote toggle fails
          setReactions((prev) => ({ ...prev, [key]: previous }));
        });
    },
    [reactions]
  );

  const activeBulletin = bulletins[selectedWeekIndex] ?? bulletins[0];

  const categoryCounts = useMemo(() => {
    const counts = new Map<AnnouncementCategory, number>();
    if (!activeBulletin) return counts;
    for (const item of activeBulletin.announcements) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [activeBulletin]);

  const { unreadByCategory, unreadAllBulletinCount } = useMemo(() => {
    const map = new Map<AnnouncementCategory, number>();
    let totalUnread = 0;
    if (!activeBulletin) return { unreadByCategory: map, unreadAllBulletinCount: 0 };
    for (const item of activeBulletin.announcements) {
      if (isUnread(`bulletin:${item.id}`)) {
        totalUnread += 1;
        map.set(item.category, (map.get(item.category) ?? 0) + 1);
      }
    }
    return { unreadByCategory: map, unreadAllBulletinCount: totalUnread };
  }, [activeBulletin, isUnread]);

  const visibleAnnouncements = useMemo(() => {
    if (!activeBulletin || selectedCategory === 'Ministry') return [];
    const sorted = [...activeBulletin.announcements].sort((a, b) => a.order - b.order);
    if (selectedCategory === 'All') return sorted;
    return sorted.filter((a) => a.category === selectedCategory);
  }, [activeBulletin, selectedCategory]);

  const { unreadItems: unreadAnnouncements, readItems: readAnnouncements } =
    useSmartAnnouncementOrder(
      visibleAnnouncements,
      (c) => `bulletin:${c.id}`,
      isUnread,
      expandedKeys,
      deferredMoveKeys
    );

  const unreadMinistryCount = useMemo(
    () => ministryUpdates.filter((m) => isUnread(`ministry:${m.id}`)).length,
    [ministryUpdates, isUnread]
  );

  const unreadVisibleKeys = useMemo(
    () =>
      visibleAnnouncements
        .map((c) => `bulletin:${c.id}`)
        .filter((k) => isUnread(k)),
    [visibleAnnouncements, isUnread]
  );

  const allVisibleExpanded =
    visibleAnnouncements.length > 0 &&
    visibleAnnouncements.every((c) => expandedKeys.has(`bulletin:${c.id}`));

  const toggleCardExpand = (readKey: string) => {
    const isCurrentlyOpen = expandedKeys.has(readKey);
    if (isCurrentlyOpen) {
      // Collapse: commit read state and allow smart sort to move to Read section cleanly
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      setDeferredMoveKeys((prev) => {
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      markRead(readKey);
    } else {
      // Expand: keep anchored in top position while user reads (badge fades via 1.2s dwell)
      setExpandedKeys((prev) => new Set(prev).add(readKey));
      if (isUnread(readKey)) {
        setDeferredMoveKeys((prev) => new Set(prev).add(readKey));
      }
    }
  };

  const handleDwellMarkRead = useCallback(
    (readKey: string) => {
      setDeferredMoveKeys((prev) => new Set(prev).add(readKey));
      markRead(readKey);
    },
    [markRead]
  );

  const handleMarkDoneAndMove = useCallback(
    (readKey: string) => {
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      setDeferredMoveKeys((prev) => {
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      markRead(readKey);
    },
    [markRead]
  );

  const toggleExpandAllVisible = () => {
    if (allVisibleExpanded) {
      setExpandedKeys(new Set());
      setDeferredMoveKeys(new Set());
      if (unreadVisibleKeys.length > 0) {
        markManyRead(unreadVisibleKeys);
      }
    } else {
      const allKeys = visibleAnnouncements.map((c) => `bulletin:${c.id}`);
      setExpandedKeys(new Set(allKeys));
      setDeferredMoveKeys(new Set(allKeys));
    }
  };

  if (isLoading && bulletins.length === 0) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-parish-border/60" />
        <div className="h-10 animate-pulse rounded-xl bg-parish-border/50" />
        <div className="h-44 animate-pulse rounded-2xl bg-parish-border/50" />
        <div className="h-44 animate-pulse rounded-2xl bg-parish-border/50" />
      </div>
    );
  }

  if (!activeBulletin) {
    return (
      <div className="rounded-2xl border border-parish-border bg-white p-8 text-center">
        <p className="text-base font-medium text-parish-ink">No published parish bulletins yet.</p>
      </div>
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3.5">
      {/* Compact Slim Liturgical Header + Inline Week Archive Selector */}
      <section className="rounded-2xl bg-gradient-to-br from-parish-navy to-parish-navy-dark px-3 py-2.5 text-white shadow-sm sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              style={{
                color: 'var(--parish-hero-badge-text)',
                borderColor: 'var(--parish-hero-badge-border)',
                backgroundColor: 'var(--parish-hero-badge-bg)',
              }}
            >
              <Calendar className="h-3 w-3" />
              {formatShortDate(activeBulletin.week_start)} – {formatShortDate(activeBulletin.week_end)}
            </span>
            {seasonLabel && (
              <span className="rounded-full bg-white/12 px-2.5 py-0.5 text-[11px] font-medium text-white/95">
                {seasonLabel}
              </span>
            )}
            {source !== 'live' && (
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-200">
                {source === 'cache' ? 'Offline Copy' : 'Sample Preview'}
              </span>
            )}
          </div>

          {bulletins.length > 1 && (
            <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
              <span className="sr-only">Select archive week</span>
              <select
                aria-label="Bulletin week selector"
                value={selectedWeekIndex}
                onChange={(e) => {
                  setSelectedWeekIndex(Number(e.target.value));
                  setSelectedCategory('All');
                  setExpandedKeys(new Set());
                  setDeferredMoveKeys(new Set());
                }}
                className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-xs focus:outline-none focus:ring-2 focus:ring-white/40"
              >
                {bulletins.slice(0, 4).map((b, idx) => (
                  <option key={b.id} value={idx} className="bg-slate-900 text-white">
                    {ARCHIVE_LABELS[idx] ?? `Week ${idx + 1}`} ({formatShortDate(b.week_start)})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="truncate font-serif text-sm font-medium text-[#FAF8F5]/95 sm:text-base">
            {activeBulletin.greeting &&
            !/^praise be to jesus christ/i.test(activeBulletin.greeting.trim())
              ? `“${activeBulletin.greeting}”`
              : activeBulletin.title}
          </p>
          {PHASE_FLAGS.unreadIndicators && unreadVisibleKeys.length > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {unreadVisibleKeys.length} Unread
            </span>
          )}
        </div>
      </section>

      {/* Standalone Vicar / Special Announcements (Highlighted immediately below slim header) */}
      {PHASE_FLAGS.specialAnnouncements && specialAnnouncements.length > 0 && (
        <ErrorBoundary>
          <SpecialAnnouncementsFeed
            items={specialAnnouncements}
            reactions={reactions}
            onToggleReaction={handleToggleReaction}
            isUnread={isUnread}
            onMarkRead={markRead}
          />
        </ErrorBoundary>
      )}

      {/* Horizontal Category Filter Pills with Dynamic Edge Fades, Floating Scroll Hints & Consistent Unread Dots */}
      <ScrollablePillBar ariaLabel="Filter announcements by category">
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'All'}
          onClick={() => setSelectedCategory('All')}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
            selectedCategory === 'All'
              ? 'bg-parish-navy text-white'
              : 'border border-parish-border bg-white text-parish-muted hover:text-parish-ink'
          }`}
        >
          <span>All ({activeBulletin.announcements.length})</span>
          {PHASE_FLAGS.unreadIndicators && unreadAllBulletinCount > 0 && (
            <span
              aria-label={`${unreadAllBulletinCount} unread weekly announcements`}
              className="h-[7px] w-[7px] shrink-0 rounded-full bg-red-500 ring-1 ring-white"
            />
          )}
        </button>

        {PHASE_FLAGS.ministryUpdates && (
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === 'Ministry'}
            onClick={() => setSelectedCategory('Ministry')}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              selectedCategory === 'Ministry'
                ? 'bg-parish-navy text-white'
                : 'border border-parish-border bg-white text-parish-muted hover:text-parish-ink'
            }`}
          >
            <span>Ministry ({ministryUpdates.length})</span>
            {unreadMinistryCount > 0 && (
              <span
                aria-label={`${unreadMinistryCount} unread ministry updates`}
                className="h-[7px] w-[7px] shrink-0 rounded-full bg-red-500 ring-1 ring-white"
              />
            )}
          </button>
        )}

        {Array.from(categoryCounts.entries()).map(([cat, count]) => {
          const catUnread = PHASE_FLAGS.unreadIndicators
            ? unreadByCategory.get(cat) ?? 0
            : 0;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              onClick={() => setSelectedCategory(cat)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedCategory === cat
                  ? 'bg-parish-navy text-white'
                  : 'border border-parish-border bg-white text-parish-muted hover:text-parish-ink'
              }`}
            >
              <span>
                {cat} ({count})
              </span>
              {catUnread > 0 && (
                <span
                  aria-label={`${catUnread} unread in ${cat}`}
                  className="h-[7px] w-[7px] shrink-0 rounded-full bg-red-500 ring-1 ring-white"
                />
              )}
            </button>
          );
        })}
      </ScrollablePillBar>

      {/* Categorized Announcement Cards or Grouped Ministry Updates */}
      {selectedCategory === 'Ministry' && PHASE_FLAGS.ministryUpdates ? (
        <ErrorBoundary
          fallback={
            <div className="rounded-2xl border border-parish-border bg-white p-6 text-center text-xs text-parish-muted">
              Unable to load Ministry Updates right now. Please tap "All" to view weekly notices.
            </div>
          }
        >
          <MinistryUpdatesView
            updates={ministryUpdates}
            reactions={reactions}
            onToggleReaction={handleToggleReaction}
            isUnread={isUnread}
            onMarkRead={markRead}
            onMarkAllRead={markManyRead}
            onResetAllRead={resetAllRead}
          />
        </ErrorBoundary>
      ) : (
        <section
          className="rounded-2xl border border-parish-border/80 bg-white/80 p-2.5 shadow-2xs sm:p-3"
          aria-label="Weekly Announcements"
        >
          {/* Collapsible Weekly Announcements Master Header */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={weeklyExpanded}
              onClick={() => setWeeklyExpanded((v) => !v)}
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:bg-parish-canvas/70"
            >
              <Calendar className="h-4 w-4 shrink-0 text-parish-navy" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                <h2 className="text-[13px] font-bold tracking-tight text-parish-ink group-hover:text-parish-navy sm:text-sm">
                  Weekly Announcements ({formatNumericMonthDay(activeBulletin.week_start)} –{' '}
                  {formatNumericMonthDay(activeBulletin.week_end)})
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-parish-border bg-parish-canvas px-2 py-0.5 text-[10px] font-semibold text-parish-navy">
                  {visibleAnnouncements.length}
                  {PHASE_FLAGS.unreadIndicators && unreadVisibleKeys.length > 0 && (
                    <span
                      aria-label={`${unreadVisibleKeys.length} unread`}
                      className="h-[6px] w-[6px] rounded-full bg-red-500"
                    />
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-parish-navy transition-transform duration-200 ${
                    weeklyExpanded ? 'rotate-180' : ''
                  }`}
                  aria-hidden="true"
                />
              </div>
            </button>

            {weeklyExpanded && visibleAnnouncements.length > 0 && (
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={toggleExpandAllVisible}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-parish-border bg-white px-2.5 py-1 text-[11px] font-semibold text-parish-navy hover:bg-parish-canvas"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  {allVisibleExpanded ? 'Collapse All' : 'Expand All'}
                </button>
                {PHASE_FLAGS.unreadIndicators && unreadVisibleKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => markManyRead(unreadVisibleKeys)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-parish-border bg-white px-2.5 py-1 text-[11px] font-semibold text-parish-navy hover:bg-parish-canvas"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark {unreadVisibleKeys.length} Read
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="parish-accordion-panel" data-open={weeklyExpanded}>
            <div className="parish-accordion-inner">
              <div className="space-y-2.5 pt-2.5">
          {[
            ...unreadAnnouncements.map((card) => ({ card, inReadSection: false })),
          ].map(({ card }) => {
            const readKey = `bulletin:${card.id}`;
            const unread = PHASE_FLAGS.unreadIndicators && isUnread(readKey);
            const isExpanded = expandedKeys.has(readKey);
            const badges = computeAttentionBadges({
              postedAtIso: activeBulletin.published_at || activeBulletin.updated_at,
              dateTimeLabel: card.dateTimeLabel,
              title: card.title,
              body: card.body,
              actions: card.actions,
            });

            return (
              <CollapsibleAnnouncementCard
                key={card.id}
                id={card.id}
                title={card.title}
                previewText={card.body}
                categoryLabel={card.category}
                dateTimeLabel={card.dateTimeLabel}
                locationLabel={card.locationLabel}
                isExpanded={isExpanded}
                onToggle={() => toggleCardExpand(readKey)}
                unread={unread}
                onDwellMarkRead={() => handleDwellMarkRead(readKey)}
                canMoveToRead={true}
                onMarkDoneAndMove={() => handleMarkDoneAndMove(readKey)}
                badges={badges}
                reactionTargetType={PHASE_FLAGS.reactions ? 'bulletin' : undefined}
                reactionSummary={reactions[reactionKey('bulletin', card.id)]}
                onToggleReaction={(t, id) => {
                  handleDwellMarkRead(readKey);
                  handleToggleReaction(t, id);
                }}
              >
                {(card.dateTimeLabel || card.locationLabel) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {card.dateTimeLabel && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-navy">
                        <Calendar className="h-3.5 w-3.5 text-parish-gold" />
                        {card.dateTimeLabel}
                      </span>
                    )}
                    {card.locationLabel && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-muted">
                        <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                        {card.locationLabel}
                      </span>
                    )}
                  </div>
                )}

                <p className="whitespace-pre-line text-base leading-[1.6] text-parish-ink">
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
                            onClick={() => {
                              handleDwellMarkRead(readKey);
                              setLightboxFlyer({
                                title: action.label || card.title,
                                url: safeUrl,
                                mimeType: action.mimeType,
                              });
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-parish-navy/20 bg-parish-navy/5 px-3.5 py-2 text-sm font-semibold text-parish-navy hover:bg-parish-navy/10"
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
                          onClick={() => handleDwellMarkRead(readKey)}
                          className="inline-flex items-center gap-2 rounded-xl bg-parish-navy px-3.5 py-2 text-sm font-semibold text-white shadow-2xs hover:bg-parish-navy-dark"
                        >
                          {getActionIcon(action.kind)}
                          {action.label}
                        </a>
                      );
                    })}
                  </div>
                )}
              </CollapsibleAnnouncementCard>
            );
          })}

          {readAnnouncements.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-parish-border pt-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-parish-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-parish-navy" />
                  <span>Read Announcements ({readAnnouncements.length})</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeferredMoveKeys(new Set());
                    resetAllRead();
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-parish-navy underline hover:opacity-80"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset Read Status
                </button>
              </div>

              {readAnnouncements.map((card) => {
                const readKey = `bulletin:${card.id}`;
                const isExpanded = expandedKeys.has(readKey);
                const badges = computeAttentionBadges({
                  postedAtIso: activeBulletin.published_at || activeBulletin.updated_at,
                  dateTimeLabel: card.dateTimeLabel,
                  title: card.title,
                  body: card.body,
                  actions: card.actions,
                });

                return (
                  <CollapsibleAnnouncementCard
                    key={card.id}
                    id={card.id}
                    title={card.title}
                    previewText={card.body}
                    categoryLabel={card.category}
                    dateTimeLabel={card.dateTimeLabel}
                    locationLabel={card.locationLabel}
                    isExpanded={isExpanded}
                    onToggle={() => toggleCardExpand(readKey)}
                    unread={false}
                    canMoveToRead={false}
                    badges={badges}
                    reactionTargetType={PHASE_FLAGS.reactions ? 'bulletin' : undefined}
                    reactionSummary={reactions[reactionKey('bulletin', card.id)]}
                    onToggleReaction={handleToggleReaction}
                  >
                    {(card.dateTimeLabel || card.locationLabel) && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {card.dateTimeLabel && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-navy">
                            <Calendar className="h-3.5 w-3.5 text-parish-gold" />
                            {card.dateTimeLabel}
                          </span>
                        )}
                        {card.locationLabel && (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-muted">
                            <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                            {card.locationLabel}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="whitespace-pre-line text-base leading-[1.6] text-parish-ink">
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
                                className="inline-flex items-center gap-2 rounded-xl border border-parish-navy/20 bg-parish-navy/5 px-3.5 py-2 text-sm font-semibold text-parish-navy hover:bg-parish-navy/10"
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
                              className="inline-flex items-center gap-2 rounded-xl bg-parish-navy px-3.5 py-2 text-sm font-semibold text-white shadow-2xs hover:bg-parish-navy-dark"
                            >
                              {getActionIcon(action.kind)}
                              {action.label}
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </CollapsibleAnnouncementCard>
                );
              })}
            </div>
          )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Weekly Holy Qurbana Schedule & Offertory placed cleanly below primary updates */}
      {activeBulletin.daily_schedule.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-parish-border bg-white shadow-2xs">
          <button
            type="button"
            onClick={() => setScheduleExpanded((v) => !v)}
            aria-expanded={scheduleExpanded}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left hover:bg-parish-canvas/70"
          >
            <div className="flex items-center gap-2.5">
              <div className="rounded-lg bg-parish-navy/10 p-2 text-parish-navy">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-parish-ink">
                  This Week’s Holy Qurbana &amp; Services
                </h2>
                <p className="text-xs text-parish-muted">
                  {scheduleExpanded
                    ? 'Tap to collapse daily times'
                    : 'Tap to expand full 7-day parish schedule'}
                </p>
              </div>
            </div>
            {scheduleExpanded ? (
              <ChevronUp className="h-5 w-5 text-parish-muted" />
            ) : (
              <ChevronDown className="h-5 w-5 text-parish-muted" />
            )}
          </button>

          {scheduleExpanded && (
            <div className="divide-y divide-parish-border border-t border-parish-border">
              {activeBulletin.daily_schedule.map((day) => {
                const isToday = day.date === todayIso;
                return (
                  <div
                    key={day.date}
                    className={`px-4 py-3 ${isToday ? 'bg-parish-gold-soft/60' : 'bg-white'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-parish-ink">{day.dayLabel}</span>
                        <span className="text-xs text-parish-muted">
                          {formatShortDate(day.date)}
                        </span>
                        {isToday && (
                          <span className="rounded-full bg-parish-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                            Today
                          </span>
                        )}
                      </div>
                      {day.feastNote && (
                        <span className="rounded-full border border-parish-gold/30 bg-parish-gold-soft px-2.5 py-0.5 text-[11px] font-semibold text-parish-gold-ink">
                          {day.feastNote}
                        </span>
                      )}
                    </div>

                    <ul className="mt-2 space-y-1.5">
                      {day.items.map((svc, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm">
                          {svc.time && (
                            <span className="inline-flex shrink-0 items-center gap-1 pt-0.5 font-semibold text-parish-navy">
                              <Clock className="h-3.5 w-3.5 text-parish-gold" />
                              {svc.time}
                            </span>
                          )}
                          <span className="text-parish-ink">
                            {svc.title}
                            {svc.celebrant && (
                              <span className="ml-1.5 text-xs font-medium text-parish-muted">
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

      {/* Dismissible Push Opt-In Prompt ONLY if not yet subscribed (hidden once enabled or in preview) */}
      {!isPreview && selectedWeekIndex === 0 && <PushOptInCard compact />}

      {/* Tap-to-Reveal Sunday Collection Highlight Card */}
      {activeBulletin.collection_summary && (
        <CollectionHighlightCard
          key={activeBulletin.id}
          collection={activeBulletin.collection_summary}
        />
      )}

      {/* Pastoral Sign-Off Footer */}
      <footer className="rounded-2xl border border-parish-border bg-white p-5 text-center">
        <p className="text-sm italic text-parish-muted">{activeBulletin.sign_off.closing}</p>
        <p className="mt-1 font-serif text-base font-bold text-parish-navy">
          {activeBulletin.sign_off.name}
        </p>
        <p className="text-xs text-parish-muted">{activeBulletin.sign_off.title}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
          {sanitizeActionUrl(`mailto:${activeBulletin.sign_off.email}`) && (
            <a
              href={`mailto:${activeBulletin.sign_off.email}`}
              className="font-medium text-parish-navy underline"
            >
              {activeBulletin.sign_off.email}
            </a>
          )}
          {sanitizeActionUrl(activeBulletin.sign_off.website) && (
            <a
              href={activeBulletin.sign_off.website}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-parish-navy underline"
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
