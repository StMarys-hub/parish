import { useState } from 'react';
import { Calendar, ExternalLink, Image as ImageIcon, MapPin, Megaphone } from 'lucide-react';
import { FlyerLightbox } from '../../components/FlyerLightbox';
import { ReactionButton } from '../../components/ReactionButton';
import { UnreadDotBadge } from '../../components/UnreadDotBadge';
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
  const [lightboxFlyer, setLightboxFlyer] = useState<{
    title: string;
    url: string;
    mimeType?: string | null;
  } | null>(null);

  if (items.length === 0) return null;

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
              Urgent &amp; mid-week announcements (separate from weekly archive)
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const readKey = `special:${item.id}`;
          const unread = isUnread(readKey);
          const safeMapsUrl = item.maps_url ? sanitizeActionUrl(item.maps_url) : null;
          const safeWebUrl = item.web_url ? sanitizeActionUrl(item.web_url) : null;
          const safeFlyerUrl = item.flyer_url ? sanitizeActionUrl(item.flyer_url) : null;
          const isImageFlyer =
            safeFlyerUrl &&
            (!item.flyer_mime_type || item.flyer_mime_type.startsWith('image/'));

          return (
            <article
              key={item.id}
              onClick={() => onMarkRead(readKey)}
              className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-2xs transition-all hover:shadow-sm ${
                unread ? 'border-rose-200 ring-1 ring-rose-100' : 'border-parish-border'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <UnreadDotBadge unread={unread} />
                  <h3 className="text-base font-bold leading-snug text-parish-ink">
                    {item.title}
                  </h3>
                </div>
                <span className="shrink-0 rounded-full border border-parish-gold/40 bg-parish-gold-soft px-2.5 py-0.5 text-[11px] font-semibold text-parish-gold-ink">
                  Special Notice
                </span>
              </div>

              {(item.event_date_label || item.location_label || safeMapsUrl) && (
                <div className="mt-2.5 flex flex-wrap gap-2">
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
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkRead(readKey);
                        }}
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

              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-parish-ink sm:text-base">
                {item.description}
              </p>

              {safeFlyerUrl && isImageFlyer && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMarkRead(readKey);
                    setLightboxFlyer({
                      title: item.title,
                      url: safeFlyerUrl,
                      mimeType: item.flyer_mime_type,
                    });
                  }}
                  className="mt-3 block overflow-hidden rounded-xl border border-parish-border bg-parish-canvas transition-opacity hover:opacity-90"
                >
                  <img
                    src={safeFlyerUrl}
                    alt={`${item.title} flyer`}
                    className="max-h-48 w-full object-cover"
                    loading="lazy"
                  />
                  <span className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-parish-navy">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Tap to Zoom Flyer
                  </span>
                </button>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-2">
                  {safeWebUrl && (
                    <a
                      href={safeWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkRead(readKey);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-parish-navy-dark"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {item.web_link_label || 'Learn More'}
                    </a>
                  )}
                  {safeFlyerUrl && !isImageFlyer && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkRead(readKey);
                        setLightboxFlyer({
                          title: item.title,
                          url: safeFlyerUrl,
                          mimeType: item.flyer_mime_type,
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-parish-navy/25 bg-parish-navy/5 px-3 py-1.5 text-xs font-semibold text-parish-navy"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                      View Flyer
                    </button>
                  )}
                </div>

                <ReactionButton
                  targetType="special"
                  targetId={item.id}
                  summary={reactions[reactionKey('special', item.id)]}
                  onToggle={(t, id) => {
                    onMarkRead(readKey);
                    onToggleReaction(t, id);
                  }}
                />
              </div>
            </article>
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
