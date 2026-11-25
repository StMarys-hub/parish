import { useCallback, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronsDownUp, ChevronsUpDown, Megaphone } from 'lucide-react';
import { CollapsibleAnnouncementCard } from '../../components/CollapsibleAnnouncementCard';
import { FlyerLightbox } from '../../components/FlyerLightbox';
import { SpecialNoticeBody } from '../../components/SpecialNoticeBody';
import { computeAttentionBadges } from '../../lib/announcementSignals';
import { sanitizeActionUrl } from '../../lib/sanitize';
import { useSmartAnnouncementOrder } from '../../lib/useSmartAnnouncementOrder';
import { ReactionSummary, ReactionTargetType, SpecialAnnouncement } from '../../types/parish';

interface SpecialAnnouncementsFeedProps {
  items: SpecialAnnouncement[];
  reactions: Record<string, ReactionSummary>;
  onToggleReaction: (targetType: ReactionTargetType, targetId: string) => void;
  isUnread: (key: string) => boolean;
  onMarkRead: (key: string) => void;
  onCardInteract?: () => void;
}

export function SpecialAnnouncementsFeed({
  items,
  reactions,
  onToggleReaction,
  isUnread,
  onMarkRead,
  onCardInteract,
}: SpecialAnnouncementsFeedProps) {
  const [lightbox, setLightbox] = useState<{
    url: string;
    title: string;
    mimeType?: string | null;
  } | null>(null);

  // Every Special Notice starts collapsed by default (data-open="false") per UX spec.
  // Keys follow `special:${id}` so read receipts & anti-jump deferral match cleanly.
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set<string>());
  const [deferredKeys, setDeferredKeys] = useState<Set<string>>(() => new Set<string>());
  const [showReadSection, setShowReadSection] = useState(false);

  const prioritizedItems = useMemo(() => {
    const getTimestamp = (item: SpecialAnnouncement) =>
      Date.parse(item.published_at || item.created_at || item.updated_at || '') || 0;

    return [...items].sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      return getTimestamp(b) - getTimestamp(a);
    });
  }, [items]);

  const getReadKey = useCallback((item: SpecialAnnouncement) => `special:${item.id}`, []);

  const { unreadItems, readItems } = useSmartAnnouncementOrder(
    prioritizedItems,
    getReadKey,
    isUnread,
    expandedKeys,
    deferredKeys
  );

  const releaseDeferred = useCallback((readKey: string) => {
    setDeferredKeys((prev) => {
      if (!prev.has(readKey)) return prev;
      const next = new Set(prev);
      next.delete(readKey);
      return next;
    });
  }, []);

  const deferItem = useCallback((readKey: string) => {
    setDeferredKeys((prev) => {
      if (prev.has(readKey)) return prev;
      const next = new Set(prev);
      next.add(readKey);
      return next;
    });
  }, []);

  const toggleCard = useCallback(
    (itemId: string) => {
      onCardInteract?.();
      const readKey = `special:${itemId}`;
      const nextExpanded = !expandedKeys.has(readKey);
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (nextExpanded) next.add(readKey);
        else next.delete(readKey);
        return next;
      });
      if (!nextExpanded) {
        releaseDeferred(readKey);
      }
    },
    [expandedKeys, onCardInteract, releaseDeferred]
  );

  const handleToggleAll = useCallback(() => {
    onCardInteract?.();
    const visibleItems = showReadSection ? prioritizedItems : unreadItems;
    const targetKeys = visibleItems.map(getReadKey);
    const allExpanded = targetKeys.length > 0 && targetKeys.every((k) => expandedKeys.has(k));

    if (allExpanded) {
      setExpandedKeys(new Set<string>());
      setDeferredKeys(new Set<string>());
    } else if (unreadItems.length === 0 && readItems.length > 0) {
      setShowReadSection(true);
      setExpandedKeys(new Set(prioritizedItems.map(getReadKey)));
    } else {
      setExpandedKeys(new Set(targetKeys));
    }
  }, [expandedKeys, getReadKey, prioritizedItems, readItems.length, showReadSection, unreadItems]);

  if (items.length === 0) return null;

  const visibleItemsForToggle = showReadSection ? prioritizedItems : unreadItems;
  const areAllExpanded =
    visibleItemsForToggle.length > 0 &&
    visibleItemsForToggle.every((i) => expandedKeys.has(getReadKey(i)));

  const renderSpecialCard = (item: SpecialAnnouncement) => {
    const readKey = getReadKey(item);
    const unread = isUnread(readKey);
    const isExpanded = expandedKeys.has(readKey);

    const hasLink = Boolean(
      item.web_url ||
        item.maps_url ||
        (item.structured_blocks?.mediaLinks?.length ?? 0) > 0 ||
        (item.structured_blocks?.externalLinks?.length ?? 0) > 0
    );
    const hasFlyer = Boolean(item.flyer_url && sanitizeActionUrl(item.flyer_url));

    const badges = computeAttentionBadges({
      postedAtIso: item.published_at || item.created_at,
      dateTimeLabel: item.structured_blocks?.eventDateLabel ?? item.event_date_label,
      title: item.title,
      body: item.summary_preview || item.description,
      hasExplicitFlyer: hasFlyer,
      hasExplicitLink: hasLink,
    });

    const previewText =
      (item.summary_preview || item.description || '').replace(/\s+/g, ' ').trim();

    const firstLoc = item.structured_blocks?.locations?.[0]?.label ?? item.location_label;
    const categoryLabel = item.category_badge ?? 'Vicar Note';

    return (
      <CollapsibleAnnouncementCard
        key={item.id}
        id={item.id}
        title={item.title}
        previewText={previewText}
        categoryLabel={categoryLabel}
        featuredLabel={item.is_pinned ? 'Pinned' : undefined}
        dateTimeLabel={item.structured_blocks?.eventDateLabel ?? item.event_date_label}
        locationLabel={firstLoc}
        highlighted={item.is_pinned || categoryLabel === 'Urgent'}
        isExpanded={isExpanded}
        onToggle={() => toggleCard(item.id)}
        unread={unread}
        onDwellMarkRead={() => {
          deferItem(readKey);
          onMarkRead(readKey);
        }}
        canMoveToRead={!unread}
        onMarkDoneAndMove={() => {
          onMarkRead(readKey);
          releaseDeferred(readKey);
          setExpandedKeys((prev) => {
            const next = new Set(prev);
            next.delete(readKey);
            return next;
          });
        }}
        badges={badges}
        reactionTargetType="special"
        reactionSummary={reactions[`special:${item.id}`]}
        onToggleReaction={onToggleReaction}
      >
        <SpecialNoticeBody
          notice={item}
          onOpenFlyer={(url, title) =>
            setLightbox({ url, title, mimeType: item.flyer_mime_type })
          }
        />
      </CollapsibleAnnouncementCard>
    );
  };

  return (
    <section className="space-y-2.5" aria-label="Special Notices from Parish Vicar">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
        <button
          type="button"
          aria-expanded={sectionExpanded}
          onClick={() => {
            onCardInteract?.();
            setSectionExpanded((prev) => !prev);
          }}
          className="group flex w-full min-w-0 items-center gap-2 rounded-xl border-l-[3px] border-l-parish-gold bg-parish-gold-soft/85 px-2.5 py-2 text-left shadow-2xs transition-all hover:bg-parish-gold-soft active:scale-[0.99] sm:flex-1"
        >
          <div className="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-lg bg-white/90 text-parish-gold-ink shadow-2xs">
            <Megaphone className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <h2 className="truncate text-[13px] font-bold tracking-tight text-parish-navy sm:text-sm">
              Special Vicar &amp; Parish Notices
            </h2>
            {unreadItems.length > 0 ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-[7px] w-[7px] rounded-full bg-red-500 ring-1 ring-white" />
                {unreadItems.length} New
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-white/85 px-2 py-0.5 text-[10px] font-semibold text-parish-muted ring-1 ring-parish-border/70">
                {items.length}
              </span>
            )}
          </div>
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 text-parish-navy transition-transform duration-200 ${
              sectionExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {sectionExpanded && (
          <div className="flex justify-end sm:shrink-0">
            <button
              type="button"
              onClick={handleToggleAll}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-parish-border bg-white px-2.5 py-1 text-[11px] font-semibold text-parish-navy hover:bg-parish-canvas"
            >
              {areAllExpanded ? (
                <>
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                  Collapse All
                </>
              ) : (
                <>
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  Expand All
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="parish-accordion-panel" data-open={sectionExpanded}>
        <div className="parish-accordion-inner">
          <div className="space-y-3 pt-3">
            {/* Priority Unread / Pinned Notices */}
            {unreadItems.length > 0 && (
              <div className="space-y-2.5">{unreadItems.map((item) => renderSpecialCard(item))}</div>
            )}

            {/* Read Notices Archive Tray */}
            {readItems.length > 0 && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowReadSection((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-xl border border-dashed border-parish-border bg-parish-canvas/70 px-3.5 py-2 text-xs font-semibold text-parish-muted hover:text-parish-ink"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    Read Notices ({readItems.length})
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${
                      showReadSection ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {showReadSection && (
                  <div className="space-y-2.5">{readItems.map((item) => renderSpecialCard(item))}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightbox && (
        <FlyerLightbox
          isOpen
          url={lightbox.url}
          title={lightbox.title}
          mimeType={lightbox.mimeType}
          onClose={() => setLightbox(null)}
        />
      )}
    </section>
  );
}
