import { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCheck,
  CheckCircle2,
  ChevronsUpDown,
  ExternalLink,
  MapPin,
  RotateCcw,
  Users,
} from 'lucide-react';
import { CollapsibleAnnouncementCard } from '../../components/CollapsibleAnnouncementCard';
import { computeAttentionBadges } from '../../lib/announcementSignals';
import { sanitizeActionUrl } from '../../lib/sanitize';
import { useSmartAnnouncementOrder } from '../../lib/useSmartAnnouncementOrder';
import { ReactionMap, reactionKey } from '../../services/reactionsService';
import { MinistryUpdate, ReactionTargetType } from '../../types/parish';

interface MinistryUpdatesViewProps {
  updates: MinistryUpdate[];
  reactions: ReactionMap;
  onToggleReaction: (targetType: ReactionTargetType, targetId: string) => void;
  isUnread: (key: string) => boolean;
  onMarkRead: (key: string) => void;
  onMarkAllRead: (keys: string[]) => void;
  onResetAllRead?: () => void;
}

export function MinistryUpdatesView({
  updates,
  reactions,
  onToggleReaction,
  isUnread,
  onMarkRead,
  onMarkAllRead,
  onResetAllRead,
}: MinistryUpdatesViewProps) {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [deferredKeys, setDeferredKeys] = useState<Set<string>>(() => new Set());

  const { unreadItems, readItems } = useSmartAnnouncementOrder(
    updates,
    (u) => `ministry:${u.id}`,
    isUnread,
    expandedKeys,
    deferredKeys
  );

  const groupedUnread = useMemo(() => {
    const groups = new Map<string, MinistryUpdate[]>();
    for (const item of unreadItems) {
      const list = groups.get(item.ministry_name) ?? [];
      list.push(item);
      groups.set(item.ministry_name, list);
    }
    return Array.from(groups.entries());
  }, [unreadItems]);

  const unreadKeys = useMemo(
    () => updates.map((u) => `ministry:${u.id}`).filter((k) => isUnread(k)),
    [updates, isUnread]
  );

  if (updates.length === 0) {
    return (
      <div className="rounded-2xl border border-parish-border bg-white p-8 text-center">
        <Users className="mx-auto h-7 w-7 text-parish-navy/60" />
        <p className="mt-2 text-sm font-bold text-parish-ink">No Ministry Weekly Updates Yet</p>
        <p className="mt-1 text-xs text-parish-muted">
          Updates from CML, CCD, Jesus Youth, Choir, and Parish Ministries will appear here.
        </p>
      </div>
    );
  }

  const allExpanded = updates.every((u) => expandedKeys.has(`ministry:${u.id}`));

  const toggleExpandAll = () => {
    if (allExpanded) {
      setExpandedKeys(new Set());
      setDeferredKeys(new Set());
      if (unreadKeys.length > 0) onMarkAllRead(unreadKeys);
    } else {
      const allKeys = updates.map((u) => `ministry:${u.id}`);
      setExpandedKeys(new Set(allKeys));
      setDeferredKeys(new Set(allKeys));
    }
  };

  const toggleItem = (readKey: string) => {
    if (expandedKeys.has(readKey)) {
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      setDeferredKeys((prev) => {
        const next = new Set(prev);
        next.delete(readKey);
        return next;
      });
      onMarkRead(readKey);
    } else {
      setExpandedKeys((prev) => new Set(prev).add(readKey));
      if (isUnread(readKey)) {
        setDeferredKeys((prev) => new Set(prev).add(readKey));
      }
    }
  };

  const handleDwell = (readKey: string) => {
    setDeferredKeys((prev) => new Set(prev).add(readKey));
    onMarkRead(readKey);
  };

  const handleDoneAndMove = (readKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      next.delete(readKey);
      return next;
    });
    setDeferredKeys((prev) => {
      const next = new Set(prev);
      next.delete(readKey);
      return next;
    });
    onMarkRead(readKey);
  };

  const renderCard = (item: MinistryUpdate, canMoveToRead: boolean) => {
    const readKey = `ministry:${item.id}`;
    const unread = isUnread(readKey);
    const isExpanded = expandedKeys.has(readKey);
    const safeUrl = item.action_url ? sanitizeActionUrl(item.action_url) : null;
    const badges = computeAttentionBadges({
      postedAtIso: item.updated_at || item.created_at,
      dateTimeLabel: item.event_date_label,
      title: item.title,
      body: item.body,
      hasExplicitLink: Boolean(safeUrl),
    });

    return (
      <CollapsibleAnnouncementCard
        key={item.id}
        id={item.id}
        title={item.title}
        previewText={item.body}
        categoryLabel={item.ministry_name}
        featuredLabel={item.week_label}
        dateTimeLabel={item.event_date_label}
        locationLabel={item.location_label}
        isExpanded={isExpanded}
        onToggle={() => toggleItem(readKey)}
        unread={unread}
        onDwellMarkRead={() => handleDwell(readKey)}
        canMoveToRead={canMoveToRead}
        onMarkDoneAndMove={() => handleDoneAndMove(readKey)}
        badges={badges}
        reactionTargetType="ministry"
        reactionSummary={reactions[reactionKey('ministry', item.id)]}
        onToggleReaction={(t, id) => {
          handleDwell(readKey);
          onToggleReaction(t, id);
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

        <p className="whitespace-pre-line text-sm leading-relaxed text-parish-ink sm:text-base">
          {item.body}
        </p>

        {safeUrl && (
          <div className="mt-3">
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleDwell(readKey)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {item.action_label || 'Open Link'}
            </a>
          </div>
        )}
      </CollapsibleAnnouncementCard>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-parish-border bg-white px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-parish-ink">Ministry Weekly Updates</h3>
          <p className="text-xs text-parish-muted">
            Grouped by ministry ({groupedUnread.length} active)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleExpandAll}
            className="inline-flex items-center gap-1 rounded-full border border-parish-border bg-parish-canvas px-3 py-1 text-xs font-semibold text-parish-navy hover:bg-slate-100"
          >
            <ChevronsUpDown className="h-3.5 w-3.5" />
            {allExpanded ? 'Collapse All' : 'Expand All'}
          </button>
          {unreadKeys.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeferredKeys(new Set());
                onMarkAllRead(unreadKeys);
              }}
              className="inline-flex items-center gap-1 rounded-full border border-parish-border bg-parish-canvas px-3 py-1 text-xs font-semibold text-parish-navy hover:bg-slate-100"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark {unreadKeys.length} Read
            </button>
          )}
        </div>
      </div>

      {groupedUnread.map(([ministryName, items]) => (
        <section key={ministryName} className="space-y-2.5">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-parish-navy px-3 py-1 text-xs font-bold text-white">
              <Users className="h-3.5 w-3.5" />
              {ministryName}
            </span>
            <span className="text-xs text-parish-muted">
              {items.length} {items.length === 1 ? 'update' : 'updates'}
            </span>
          </div>

          {items.map((item) => renderCard(item, true))}
        </section>
      ))}

      {readItems.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-parish-border pt-3">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-parish-muted">
              <CheckCircle2 className="h-3.5 w-3.5 text-parish-navy" />
              <span>Read Announcements ({readItems.length})</span>
            </div>
            {onResetAllRead && (
              <button
                type="button"
                onClick={() => {
                  setDeferredKeys(new Set());
                  onResetAllRead();
                }}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-parish-navy underline hover:opacity-80"
              >
                <RotateCcw className="h-3 w-3" />
                Reset Read Status
              </button>
            )}
          </div>
          {readItems.map((item) => renderCard(item, false))}
        </div>
      )}
    </div>
  );
}
