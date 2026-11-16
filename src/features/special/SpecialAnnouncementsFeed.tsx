import { useState } from 'react';
import { Calendar, ExternalLink, Image as ImageIcon, MapPin, Megaphone } from 'lucide-react';
import { CollapsibleAnnouncementCard } from '../../components/CollapsibleAnnouncementCard';
import { FlyerLightbox } from '../../components/FlyerLightbox';
import { computeAttentionBadges } from '../../lib/announcementSignals';
import { sanitizeActionUrl } from '../../lib/sanitize';
import { ReactionMap, reactionKey } from '../../services/reactionsService';
import { ReactionTargetType, SpecialAnnouncement } from '../../types/parish';

interface SpecialAnnouncementsFeedProps {
  items: SpecialAnnouncement[];
  reactions: ReactionMap;
  onToggleReaction: (targetType: ReactionTargetType, targetId: string) => void;
  isUnread: (key: string) => boolean;
  onMarkRead: (key: string) => void;
}

export function SpecialAnnouncementsFeed({
  items,
  reactions,
  onToggleReaction,
  isUnread,
  onMarkRead,
}: SpecialAnnouncementsFeedProps) {
  // Von Restorff Effect: auto-expand ONLY Pinned Special Vicar Notices; keep unpinned collapsed
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.is_pinned).map((item) => item.id))
  );
  const [lightboxFlyer, setLightboxFlyer] = useState<{
    title: string;
    url: string;
    mimeType?: string | null;
  } | null>(null);

  if (items.length === 0) return null;

  const toggleItem = (item: SpecialAnnouncement) => {
    const key = `special:${item.id}`;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
        onMarkRead(key);
      }
      return next;
    });
  };

  return (
    <section
      aria-label="Special Vicar Announcements"
      className="space-y-3 rounded-2xl border border-parish-gold/45 bg-parish-gold-soft/55 p-3.5 sm:p-4"
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-parish-navy p-1.5 text-white">
            <Megaphone className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-parish-navy">
              Vicar &amp; Special Notices
            </h2>
            <p className="text-[11px] text-parish-muted">
              Highlighted separately from weekly bulletin archive
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        {items.map((item) => {
          const readKey = `special:${item.id}`;
          const unread = isUnread(readKey);
          const isExpanded = expandedIds.has(item.id);
          const safeMapsUrl = item.maps_url ? sanitizeActionUrl(item.maps_url) : null;
          const safeWebUrl = item.web_url ? sanitizeActionUrl(item.web_url) : null;
          const safeFlyerUrl = item.flyer_url ? sanitizeActionUrl(item.flyer_url) : null;
          const isImageFlyer =
            safeFlyerUrl &&
            (!item.flyer_mime_type || item.flyer_mime_type.startsWith('image/'));

          const badges = computeAttentionBadges({
            postedAtIso: item.published_at || item.updated_at,
            dateTimeLabel: item.event_date_label,
            title: item.title,
            body: item.description,
            hasExplicitFlyer: Boolean(safeFlyerUrl),
            hasExplicitLink: Boolean(safeWebUrl || safeMapsUrl),
          });

          return (
            <CollapsibleAnnouncementCard
              key={item.id}
              id={item.id}
              title={item.title}
              previewText={item.description}
              categoryLabel="Special Notice"
              featuredLabel={item.is_pinned ? "Vicar's Note" : 'Featured'}
              highlighted={true}
              dateTimeLabel={item.event_date_label}
              locationLabel={item.location_label}
              isExpanded={isExpanded}
              onToggle={() => toggleItem(item)}
              unread={unread}
              badges={badges}
              reactionTargetType="special"
              reactionSummary={reactions[reactionKey('special', item.id)]}
              onToggleReaction={(t, id) => {
                onMarkRead(readKey);
                onToggleReaction(t, id);
              }}
            >
              {(item.event_date_label || item.location_label || safeMapsUrl) && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {item.event_date_label && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-navy">
                      <Calendar className="h-3.5 w-3.5 text-parish-gold" />
                      {item.event_date_label}
                    </span>
                  )}
                  {(item.location_label || safeMapsUrl) &&
                    (safeMapsUrl ? (
                      <a
                        href={safeMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => onMarkRead(readKey)}
                        className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-semibold text-parish-navy underline decoration-parish-navy/30 hover:bg-slate-100"
                      >
                        <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                        {item.location_label || 'Open Map'}
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-parish-canvas px-2.5 py-1 text-xs font-medium text-parish-muted">
                        <MapPin className="h-3.5 w-3.5 text-parish-navy" />
                        {item.location_label}
                      </span>
                    ))}
                </div>
              )}

              <p className="whitespace-pre-line text-sm leading-relaxed text-parish-ink sm:text-base">
                {item.description}
              </p>

              {safeFlyerUrl && isImageFlyer && (
                <button
                  type="button"
                  onClick={() => {
                    onMarkRead(readKey);
                    setLightboxFlyer({
                      title: item.title,
                      url: safeFlyerUrl,
                      mimeType: item.flyer_mime_type,
                    });
                  }}
                  className="mt-3 block w-full overflow-hidden rounded-xl border border-parish-border bg-parish-canvas transition-opacity hover:opacity-90"
                >
                  <img
                    src={safeFlyerUrl}
                    alt={`${item.title} flyer`}
                    className="max-h-52 w-full object-cover"
                    loading="lazy"
                  />
                  <span className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-parish-navy">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Tap to Zoom Flyer
                  </span>
                </button>
              )}

              {(safeWebUrl || (safeFlyerUrl && !isImageFlyer)) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {safeWebUrl && (
                    <a
                      href={safeWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => onMarkRead(readKey)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {item.web_link_label || 'Learn More'}
                    </a>
                  )}
                  {safeFlyerUrl && !isImageFlyer && (
                    <button
                      type="button"
                      onClick={() => {
                        onMarkRead(readKey);
                        setLightboxFlyer({
                          title: item.title,
                          url: safeFlyerUrl,
                          mimeType: item.flyer_mime_type,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-parish-navy/25 bg-parish-navy/5 px-3 py-2 text-xs font-semibold text-parish-navy"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      View Flyer
                    </button>
                  )}
                </div>
              )}
            </CollapsibleAnnouncementCard>
          );
        })}
      </div>

      <FlyerLightbox
        isOpen={Boolean(lightboxFlyer)}
        title={lightboxFlyer?.title ?? ''}
        url={lightboxFlyer?.url ?? ''}
        mimeType={lightboxFlyer?.mimeType}
        onClose={() => setLightboxFlyer(null)}
      />
    </section>
  );
}
