import { useMemo } from 'react';
import { Calendar, CheckCheck, ExternalLink, MapPin, Users } from 'lucide-react';
import { ReactionButton } from '../../components/ReactionButton';
import { UnreadDotBadge } from '../../components/UnreadDotBadge';
import { sanitizeActionUrl } from '../../lib/sanitize';
import { ReactionMap, reactionKey } from '../../services/reactionsService';
import { MinistryUpdate, ReactionTargetType } from '../../types/parish';

interface MinistryUpdatesViewProps {
  updates: MinistryUpdate[];
  reactions: ReactionMap;
  onToggleReaction: (targetType: ReactionTargetType, targetId: string) => void;
  isUnread: (key: string) => boolean;
  onMarkRead: (key: string) => void;
  onMarkAllRead: (keys: string[]) => void;
}

export function MinistryUpdatesView({
  updates,
  reactions,
  onToggleReaction,
  isUnread,
  onMarkRead,
  onMarkAllRead,
}: MinistryUpdatesViewProps) {
  const grouped = useMemo(() => {
    const groups = new Map<string, MinistryUpdate[]>();
    for (const item of updates) {
      const list = groups.get(item.ministry_name) ?? [];
      list.push(item);
      groups.set(item.ministry_name, list);
    }
    return Array.from(groups.entries());
  }, [updates]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-parish-border bg-white px-4 py-3">
        <div>
          <h3 className="text-sm font-bold text-parish-ink">Ministry Weekly Updates</h3>
          <p className="text-xs text-parish-muted">
            Grouped by ministry ({grouped.length} {grouped.length === 1 ? 'ministry' : 'ministries'})
          </p>
        </div>
        {unreadKeys.length > 0 && (
          <button
            type="button"
            onClick={() => onMarkAllRead(unreadKeys)}
            className="inline-flex items-center gap-1 rounded-full border border-parish-border bg-parish-canvas px-3 py-1 text-xs font-semibold text-parish-navy hover:bg-slate-100"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark {unreadKeys.length} Read
          </button>
        )}
      </div>

      {grouped.map(([ministryName, items]) => (
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

          {items.map((item) => {
            const readKey = `ministry:${item.id}`;
            const unread = isUnread(readKey);
            const safeUrl = item.action_url ? sanitizeActionUrl(item.action_url) : null;

            return (
              <article
                key={item.id}
                onClick={() => onMarkRead(readKey)}
                className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-2xs transition-all hover:shadow-sm sm:p-5 ${
                  unread ? 'border-rose-200 ring-1 ring-rose-100' : 'border-parish-border'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <UnreadDotBadge unread={unread} />
                    <h4 className="text-base font-bold text-parish-ink">{item.title}</h4>
                  </div>
                  {item.week_label && (
                    <span className="rounded-full bg-parish-canvas px-2.5 py-0.5 text-[11px] font-semibold text-parish-muted">
                      {item.week_label}
                    </span>
                  )}
                </div>

                {(item.event_date_label || item.location_label) && (
                  <div className="mt-2 flex flex-wrap gap-2">
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

                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-parish-ink sm:text-base">
                  {item.body}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    {safeUrl && (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(readKey);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-parish-navy-dark"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {item.action_label || 'Open Link'}
                      </a>
                    )}
                  </div>

                  <ReactionButton
                    targetType="ministry"
                    targetId={item.id}
                    summary={reactions[reactionKey('ministry', item.id)]}
                    onToggle={(t, id) => {
                      onMarkRead(readKey);
                      onToggleReaction(t, id);
                    }}
                  />
                </div>
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}
