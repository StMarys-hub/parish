import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
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
  Search,
  X,
} from 'lucide-react';
import { CalendarActionMenu } from '../../components/CalendarActionMenu';
import { CollapsibleAnnouncementCard } from '../../components/CollapsibleAnnouncementCard';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { FlyerLightbox } from '../../components/FlyerLightbox';
import { FormattedRichBlocks } from '../../components/FormattedText';
import { InAppWebViewerModal } from '../../components/InAppWebViewerModal';
import { ScrollablePillBar } from '../../components/ScrollablePillBar';
import { SpecialNoticeBody } from '../../components/SpecialNoticeBody';
import { PHASE_FLAGS } from '../../config/features';
import { computeAttentionBadges } from '../../lib/announcementSignals';
import { findNextParishService } from '../../lib/nextServiceHelper';
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
  RegularScheduleItem,
  SpecialAnnouncement,
  WeeklyBulletin,
} from '../../types/parish';
import { MinistryUpdatesView } from '../ministries/MinistryUpdatesView';
import { PushOptInCard } from '../notifications/PushOptInCard';
import { SpecialAnnouncementsFeed } from '../special/SpecialAnnouncementsFeed';
import { CollectionHighlightCard } from './CollectionHighlightCard';
import { ParishInstantSearch, SearchHit } from './ParishInstantSearch';

interface BulletinViewProps {
  bulletins: WeeklyBulletin[];
  isLoading: boolean;
  source: 'live' | 'cache' | 'sample';
  seasonLabel?: string;
  specialAnnouncements?: SpecialAnnouncement[];
  ministryUpdates?: MinistryUpdate[];
  regularSchedules?: RegularScheduleItem[];
  isPreview?: boolean;
  resetSignal?: number;
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
  regularSchedules = [],
  isPreview = false,
  resetSignal = 0,
}: BulletinViewProps) {
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<
    'All' | 'Ministry' | AnnouncementCategory
  >('All');
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [deferredMoveKeys, setDeferredMoveKeys] = useState<Set<string>>(() => new Set());
  const [weeklyExpanded, setWeeklyExpanded] = useState(true);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchHit, setActiveSearchHit] = useState<SearchHit | null>(null);
  const [lightboxFlyer, setLightboxFlyer] = useState<{
    title: string;
    url: string;
    mimeType?: string | null;
  } | null>(null);
  const [webViewer, setWebViewer] = useState<{ title: string; url: string } | null>(null);
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

  const nextService = useMemo(
    () =>
      activeBulletin
        ? findNextParishService(activeBulletin.daily_schedule, regularSchedules)
        : null,
    [activeBulletin, regularSchedules]
  );

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

  const dismissSearchSpotlight = useCallback(
    (options?: { resetCategory?: boolean; scrollToWeekly?: boolean }) => {
      setActiveSearchHit((prev) => {
        if (!prev) return null;
        return null;
      });
      setSelectedWeekIndex(0);
      setWeeklyExpanded(true);
      if (options?.resetCategory) {
        setSelectedCategory('All');
      }
      if (options?.scrollToWeekly) {
        window.setTimeout(() => {
          document
            .getElementById('weekly-announcements-section')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 60);
      }
    },
    []
  );

  const handleOtherInteract = useCallback(() => {
    if (!activeSearchHit) return;
    dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
  }, [activeSearchHit, dismissSearchSpotlight]);

  useEffect(() => {
    if (resetSignal <= 0) return;
    setActiveSearchHit(null);
    setSearchOpen(false);
    setSearchQuery('');
    setSelectedWeekIndex(0);
    setSelectedCategory('All');
    setWeeklyExpanded(true);
  }, [resetSignal]);

  const toggleCardExpand = (readKey: string) => {
    if (activeSearchHit) {
      dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
    }
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

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSearchOpen((prev) => !prev);
                if (searchOpen) setSearchQuery('');
              }}
              aria-label="Search parish notices and schedules"
              title="Search notices, schedules & past 4 weeks"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-colors ${
                searchOpen
                  ? 'border-white/60 bg-white text-parish-navy'
                  : 'border-white/25 bg-white/15 text-white hover:bg-white/25'
              }`}
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            {bulletins.length > 1 && (
              <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/90">
                <span className="sr-only">Select archive week</span>
                <select
                  aria-label="Bulletin week selector"
                  value={selectedWeekIndex}
                  onChange={(e) => {
                    setActiveSearchHit(null);
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

        {nextService && selectedWeekIndex === 0 && (
          <button
            type="button"
            onClick={() => {
              setScheduleExpanded(true);
              window.setTimeout(() => {
                document
                  .getElementById('weekly-qurbana-schedule')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 80);
            }}
            className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[11px] font-medium text-white/95 transition-colors hover:bg-white/20 active:scale-[0.99]"
          >
            <Clock className="h-3 w-3 shrink-0 text-amber-200" aria-hidden="true" />
            <span className="truncate">
              <strong className="font-semibold text-white">Next:</strong> {nextService.fullText}
            </span>
          </button>
        )}
      </section>

      {searchOpen && (
        <ParishInstantSearch
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
          bulletins={bulletins}
          specialAnnouncements={specialAnnouncements}
          ministryUpdates={ministryUpdates}
          onSelectHit={(hit: SearchHit) => {
            setSearchOpen(false);
            setSearchQuery('');
            setActiveSearchHit(hit);
            window.setTimeout(() => {
              document
                .getElementById('search-result-spotlight')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 40);
          }}
        />
      )}

      {/* Search Result Spotlight Card — opens directly on top; collapsing or tapping another card/tab focuses Current Week */}
      {activeSearchHit && (() => {
        const closeAndFocusCurrentWeek = (markReadKey?: string) => {
          if (markReadKey) markRead(markReadKey);
          dismissSearchSpotlight({ resetCategory: true, scrollToWeekly: true });
        };

        let spotlightCard: ReactNode = null;

        if (activeSearchHit.kind === 'bulletin' && activeSearchHit.announcementId) {
          const hitBulletin = bulletins[activeSearchHit.weekIndex ?? 0] ?? bulletins[0];
          const card = hitBulletin?.announcements.find(
            (a) => a.id === activeSearchHit.announcementId
          );
          if (hitBulletin && card) {
            const readKey = `bulletin:${card.id}`;
            const unread = PHASE_FLAGS.unreadIndicators && isUnread(readKey);
            const badges = computeAttentionBadges({
              postedAtIso: hitBulletin.published_at || hitBulletin.updated_at,
              dateTimeLabel: card.dateTimeLabel,
              title: card.title,
              body: card.body,
              actions: card.actions,
            });
            spotlightCard = (
              <CollapsibleAnnouncementCard
                key={`spotlight-bulletin-${card.id}`}
                id={`spotlight-${card.id}`}
                title={card.title}
                previewText={card.body}
                categoryLabel={card.category}
                dateTimeLabel={card.dateTimeLabel}
                locationLabel={card.locationLabel}
                highlighted={true}
                isExpanded={true}
                onToggle={() => closeAndFocusCurrentWeek(readKey)}
                unread={unread}
                onDwellMarkRead={() => markRead(readKey)}
                canMoveToRead={false}
                badges={badges}
                reactionTargetType={PHASE_FLAGS.reactions ? 'bulletin' : undefined}
                reactionSummary={reactions[reactionKey('bulletin', card.id)]}
                onToggleReaction={(t, id) => {
                  markRead(readKey);
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

                <FormattedRichBlocks lines={[card.body]} className="text-base leading-[1.6]" />

                {card.dateTimeLabel && (
                  <div className="mt-3">
                    <CalendarActionMenu
                      event={{
                        title: card.title,
                        description: card.body,
                        dateTimeLabel: card.dateTimeLabel,
                        location: card.locationLabel,
                      }}
                    />
                  </div>
                )}

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
          }
        } else if (activeSearchHit.kind === 'special' && activeSearchHit.specialId) {
          const notice = specialAnnouncements.find((s) => s.id === activeSearchHit.specialId);
          if (notice) {
            const readKey = `special:${notice.id}`;
            const unread = PHASE_FLAGS.unreadIndicators && isUnread(readKey);
            const hasLink = Boolean(
              notice.web_url ||
                notice.maps_url ||
                (notice.structured_blocks?.mediaLinks?.length ?? 0) > 0 ||
                (notice.structured_blocks?.externalLinks?.length ?? 0) > 0
            );
            const hasFlyer = Boolean(notice.flyer_url && sanitizeActionUrl(notice.flyer_url));
            const badges = computeAttentionBadges({
              postedAtIso: notice.published_at || notice.created_at,
              dateTimeLabel: notice.structured_blocks?.eventDateLabel ?? notice.event_date_label,
              title: notice.title,
              body: notice.summary_preview || notice.description,
              hasExplicitFlyer: hasFlyer,
              hasExplicitLink: hasLink,
            });
            const previewText = (notice.summary_preview || notice.description || '')
              .replace(/\s+/g, ' ')
              .trim();
            const firstLoc = notice.structured_blocks?.locations?.[0]?.label ?? notice.location_label;
            spotlightCard = (
              <CollapsibleAnnouncementCard
                key={`spotlight-special-${notice.id}`}
                id={`spotlight-${notice.id}`}
                title={notice.title}
                previewText={previewText}
                categoryLabel={notice.category_badge ?? 'Vicar Note'}
                featuredLabel={notice.is_pinned ? 'Pinned' : undefined}
                dateTimeLabel={notice.structured_blocks?.eventDateLabel ?? notice.event_date_label}
                locationLabel={firstLoc}
                highlighted={true}
                isExpanded={true}
                onToggle={() => closeAndFocusCurrentWeek(readKey)}
                unread={unread}
                onDwellMarkRead={() => markRead(readKey)}
                canMoveToRead={false}
                badges={badges}
                reactionTargetType={PHASE_FLAGS.reactions ? 'special' : undefined}
                reactionSummary={reactions[reactionKey('special', notice.id)]}
                onToggleReaction={(t, id) => {
                  markRead(readKey);
                  handleToggleReaction(t, id);
                }}
              >
                <SpecialNoticeBody
                  notice={notice}
                  onOpenFlyer={(url, title) =>
                    setLightboxFlyer({ url, title, mimeType: notice.flyer_mime_type })
                  }
                />
              </CollapsibleAnnouncementCard>
            );
          }
        } else if (activeSearchHit.kind === 'ministry' && activeSearchHit.ministryId) {
          const item = ministryUpdates.find((m) => m.id === activeSearchHit.ministryId);
          if (item) {
            const readKey = `ministry:${item.id}`;
            const unread = PHASE_FLAGS.unreadIndicators && isUnread(readKey);
            const safeUrl = item.action_url ? sanitizeActionUrl(item.action_url) : null;
            const badges = computeAttentionBadges({
              postedAtIso: item.updated_at || item.created_at,
              dateTimeLabel: item.event_date_label,
              title: item.title,
              body: item.body,
              hasExplicitLink: Boolean(safeUrl),
            });
            spotlightCard = (
              <CollapsibleAnnouncementCard
                key={`spotlight-ministry-${item.id}`}
                id={`spotlight-${item.id}`}
                title={item.title}
                previewText={item.body}
                categoryLabel={item.ministry_name}
                featuredLabel={item.week_label}
                dateTimeLabel={item.event_date_label}
                locationLabel={item.location_label}
                highlighted={true}
                isExpanded={true}
                onToggle={() => closeAndFocusCurrentWeek(readKey)}
                unread={unread}
                onDwellMarkRead={() => markRead(readKey)}
                canMoveToRead={false}
                badges={badges}
                reactionTargetType={PHASE_FLAGS.reactions ? 'ministry' : undefined}
                reactionSummary={reactions[reactionKey('ministry', item.id)]}
                onToggleReaction={(t, id) => {
                  markRead(readKey);
                  handleToggleReaction(t, id);
                }}
              >
                {(item.event_date_label || item.location_label) && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {item.event_date_label && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-navy">
                        <Calendar className="h-3.5 w-3.5 text-parish-gold" />
                        {item.event_date_label}
                      </span>
                    )}
                    {item.location_label && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-muted">
                        <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                        {item.location_label}
                      </span>
                    )}
                  </div>
                )}
                <FormattedRichBlocks lines={[item.body]} className="text-base leading-[1.6]" />
                {safeUrl && (
                  <div className="mt-3">
                    <a
                      href={safeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {item.action_label || 'Open Link'}
                    </a>
                  </div>
                )}
              </CollapsibleAnnouncementCard>
            );
          }
        } else if (activeSearchHit.kind === 'schedule' && activeSearchHit.scheduleDate) {
          const hitBulletin = bulletins[activeSearchHit.weekIndex ?? 0] ?? bulletins[0];
          const day = hitBulletin?.daily_schedule.find(
            (d) => d.date === activeSearchHit.scheduleDate
          );
          if (day) {
            const previewText = day.items
              .map((it) => `${it.time} ${it.title}`.trim())
              .join(' • ');
            spotlightCard = (
              <CollapsibleAnnouncementCard
                key={`spotlight-schedule-${day.date}`}
                id={`spotlight-schedule-${day.date}`}
                title={`${day.dayLabel} (${formatShortDate(day.date)})${day.feastNote ? ` — ${day.feastNote}` : ''}`}
                previewText={previewText}
                categoryLabel="Liturgy & Sacraments"
                highlighted={true}
                isExpanded={true}
                onToggle={() => closeAndFocusCurrentWeek()}
                unread={false}
                canMoveToRead={false}
              >
                <ul className="space-y-2">
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
              </CollapsibleAnnouncementCard>
            );
          }
        }

        if (!spotlightCard) return null;

        return (
          <section
            id="search-result-spotlight"
            aria-label="Selected Search Result"
            className="scroll-mt-20 space-y-2 rounded-2xl border border-parish-navy/25 bg-parish-navy/[0.03] p-2.5 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <Search className="h-3.5 w-3.5 shrink-0 text-parish-navy" aria-hidden="true" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-parish-navy">
                  Search Result
                </span>
                <span className="truncate rounded-full border border-parish-border bg-white px-2 py-0.5 text-[10px] font-semibold text-parish-muted">
                  {activeSearchHit.badge}
                </span>
              </div>
              <button
                type="button"
                onClick={() => closeAndFocusCurrentWeek()}
                aria-label="Close search result and return to current week announcements"
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-parish-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                Close
              </button>
            </div>
            {spotlightCard}
          </section>
        );
      })()}

      {/* Standalone Vicar / Special Announcements (Highlighted immediately below slim header) */}
      {PHASE_FLAGS.specialAnnouncements && specialAnnouncements.length > 0 && (
        <ErrorBoundary>
          <SpecialAnnouncementsFeed
            items={specialAnnouncements}
            reactions={reactions}
            onToggleReaction={handleToggleReaction}
            isUnread={isUnread}
            onMarkRead={markRead}
            onCardInteract={handleOtherInteract}
          />
        </ErrorBoundary>
      )}

      {/* Horizontal Category Filter Pills with Dynamic Edge Fades, Floating Scroll Hints & Consistent Unread Dots */}
      <ScrollablePillBar ariaLabel="Filter announcements by category">
        <button
          type="button"
          role="tab"
          aria-selected={selectedCategory === 'All'}
          onClick={() => {
            if (activeSearchHit) {
              dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
            }
            setSelectedCategory('All');
          }}
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
            onClick={() => {
              if (activeSearchHit) {
                dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
              }
              setSelectedCategory('Ministry');
            }}
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
              onClick={() => {
                if (activeSearchHit) {
                  dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
                }
                setSelectedCategory(cat);
              }}
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
            onCardInteract={handleOtherInteract}
          />
        </ErrorBoundary>
      ) : (
        <section
          id="weekly-announcements-section"
          className="scroll-mt-20 space-y-2"
          aria-label="Weekly Announcements"
        >
          {/* Clean Editorial Section Header (no heavy card border competing with announcement cards) */}
          <button
            type="button"
            aria-expanded={weeklyExpanded}
            onClick={() => {
              if (activeSearchHit) {
                dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
              }
              setWeeklyExpanded((v) => !v);
            }}
            className="group flex w-full min-w-0 items-center gap-2 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-parish-navy/[0.04] active:scale-[0.99]"
          >
            <Calendar className="h-4 w-4 shrink-0 text-parish-navy" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <h2 className="truncate text-[14px] font-bold tracking-tight text-parish-navy sm:text-[15px]">
                Weekly Announcements
              </h2>
              <span className="shrink-0 text-[11px] font-medium text-parish-muted">
                · {formatNumericMonthDay(activeBulletin.week_start)}–
                {formatNumericMonthDay(activeBulletin.week_end)}
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-parish-navy/8 px-2 py-0.5 text-[10px] font-bold text-parish-navy">
                {visibleAnnouncements.length}
                {PHASE_FLAGS.unreadIndicators && unreadVisibleKeys.length > 0 && (
                  <span
                    aria-label={`${unreadVisibleKeys.length} unread`}
                    className="h-[6px] w-[6px] rounded-full bg-red-500"
                  />
                )}
              </span>
            </div>
            <ChevronDown
              className={`ml-auto h-4 w-4 shrink-0 text-parish-navy transition-transform duration-200 ${
                weeklyExpanded ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          <div className="parish-accordion-panel" data-open={weeklyExpanded}>
            <div className="parish-accordion-inner">
              <div className="space-y-2.5 pt-1">
          {/* Compact inline utility row ONLY when unread announcements exist (all-read merges into Read bar below) */}
          {unreadAnnouncements.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-[11px] font-semibold text-parish-muted">
                {PHASE_FLAGS.unreadIndicators && unreadVisibleKeys.length > 0
                  ? `${unreadVisibleKeys.length} unread`
                  : `${unreadAnnouncements.length} active`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleExpandAllVisible}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-parish-navy hover:bg-parish-navy/8"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  {allVisibleExpanded ? 'Collapse All' : 'Expand All'}
                </button>
                {PHASE_FLAGS.unreadIndicators && unreadVisibleKeys.length > 0 && (
                  <button
                    type="button"
                    onClick={() => markManyRead(unreadVisibleKeys)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full border border-parish-border bg-white px-2.5 py-0.5 text-[11px] font-semibold text-parish-navy hover:bg-parish-canvas"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Mark {unreadVisibleKeys.length} Read
                  </button>
                )}
              </div>
            </div>
          )}
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

                <FormattedRichBlocks lines={[card.body]} className="text-base leading-[1.6]" />

                {card.dateTimeLabel && (
                  <div className="mt-3">
                    <CalendarActionMenu
                      event={{
                        title: card.title,
                        description: card.body,
                        dateTimeLabel: card.dateTimeLabel,
                        location: card.locationLabel,
                      }}
                    />
                  </div>
                )}

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
            <div className={`space-y-2.5 ${unreadAnnouncements.length > 0 ? 'pt-2' : ''}`}>
              <div
                className={`flex flex-wrap items-center justify-between gap-2 px-1 ${
                  unreadAnnouncements.length > 0 ? 'border-t border-parish-border pt-3' : ''
                }`}
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-parish-muted">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Read ({readAnnouncements.length})</span>
                </div>
                <div className="flex items-center gap-2.5">
                  {unreadAnnouncements.length === 0 && (
                    <button
                      type="button"
                      onClick={toggleExpandAllVisible}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-parish-navy hover:bg-parish-navy/8"
                    >
                      <ChevronsUpDown className="h-3.5 w-3.5" />
                      {allVisibleExpanded ? 'Collapse All' : 'Expand All'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDeferredMoveKeys(new Set());
                      resetAllRead();
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-parish-navy hover:underline"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                </div>
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

                    <FormattedRichBlocks lines={[card.body]} className="text-base leading-[1.6]" />

                    {card.dateTimeLabel && (
                      <div className="mt-3">
                        <CalendarActionMenu
                          event={{
                            title: card.title,
                            description: card.body,
                            dateTimeLabel: card.dateTimeLabel,
                            location: card.locationLabel,
                          }}
                        />
                      </div>
                    )}

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

          {/* Tap-to-Reveal Weekly Offertory / Contribution Card grouped under Weekly Announcements */}
          {activeBulletin.collection_summary && (
            <div className="pt-1">
              <CollectionHighlightCard
                key={activeBulletin.id}
                collection={activeBulletin.collection_summary}
              />
            </div>
          )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Weekly Holy Qurbana Schedule placed cleanly below primary updates */}
      {activeBulletin.daily_schedule.length > 0 && (
        <section
          id="weekly-qurbana-schedule"
          className="overflow-hidden rounded-2xl border border-parish-border bg-white shadow-xs"
        >
          <button
            type="button"
            onClick={() => {
              if (activeSearchHit) {
                dismissSearchSpotlight({ resetCategory: false, scrollToWeekly: false });
              }
              setScheduleExpanded((v) => !v);
            }}
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
            <button
              type="button"
              onClick={() =>
                setWebViewer({
                  title: "St. Mary's Official Website",
                  url: sanitizeActionUrl(activeBulletin.sign_off.website)!,
                })
              }
              className="font-medium text-parish-navy underline hover:opacity-80"
            >
              stmarysyroclt.org
            </button>
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

      <InAppWebViewerModal
        isOpen={Boolean(webViewer)}
        title={webViewer?.title ?? ''}
        url={webViewer?.url ?? ''}
        onClose={() => setWebViewer(null)}
      />
    </div>
  );
}
