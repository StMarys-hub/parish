import {
  Calendar,
  Clock,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  MapPin,
  PlayCircle,
  UserCheck,
} from 'lucide-react';
import { sanitizeActionUrl } from '../lib/sanitize';
import { NoticeLinkItem, SpecialAnnouncement } from '../types/parish';
import { FormattedText } from './FormattedText';

interface SpecialNoticeBodyProps {
  notice: Pick<
    SpecialAnnouncement,
    | 'title'
    | 'description'
    | 'sign_off'
    | 'event_date_label'
    | 'location_label'
    | 'maps_url'
    | 'web_url'
    | 'web_link_label'
    | 'flyer_url'
    | 'flyer_mime_type'
    | 'structured_blocks'
  >;
  onOpenFlyer?: (url: string, title: string) => void;
}

function renderMediaIcon(link: NoticeLinkItem) {
  if (link.kind === 'video') {
    return <PlayCircle className="h-4.5 w-4.5 shrink-0 text-amber-600" />;
  }
  return <FolderOpen className="h-4.5 w-4.5 shrink-0 text-parish-navy" />;
}

export function SpecialNoticeBody({ notice, onOpenFlyer }: SpecialNoticeBodyProps) {
  const blocks = notice.structured_blocks;
  const paragraphs =
    blocks?.paragraphs && blocks.paragraphs.length > 0
      ? blocks.paragraphs
      : notice.description
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
  const timeline = blocks?.timeline ?? [];
  const mediaLinks = blocks?.mediaLinks ?? [];
  const externalLinks = [...(blocks?.externalLinks ?? [])];
  const locations = [...(blocks?.locations ?? [])];

  // Ensure legacy flat links show cleanly if not already in structured_blocks
  if (mediaLinks.length === 0 && externalLinks.length === 0 && notice.web_url) {
    const safeWeb = sanitizeActionUrl(notice.web_url);
    if (safeWeb) {
      externalLinks.push({
        label: notice.web_link_label || 'Open Link',
        url: safeWeb,
        kind: 'web',
      });
    }
  }

  if (locations.length === 0 && (notice.location_label || notice.maps_url)) {
    const safeMaps = notice.maps_url ? sanitizeActionUrl(notice.maps_url) : null;
    if (notice.location_label || safeMaps) {
      locations.push({
        label: notice.location_label || 'Event Location',
        mapsUrl: safeMaps,
      });
    }
  }

  const eventDateLabel = blocks?.eventDateLabel || notice.event_date_label;
  const safeFlyerUrl = notice.flyer_url ? sanitizeActionUrl(notice.flyer_url) : null;
  const isPdfFlyer =
    Boolean(safeFlyerUrl) &&
    (notice.flyer_mime_type === 'application/pdf' ||
      safeFlyerUrl?.toLowerCase().includes('.pdf'));

  return (
    <div className="space-y-3.5 text-sm leading-relaxed text-parish-ink/90">
      {/* Metadata row */}
      {(eventDateLabel || locations.length > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {eventDateLabel && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-parish-gold/35 bg-parish-gold-soft px-3 py-1 font-semibold text-parish-gold-ink">
              <Calendar className="h-3.5 w-3.5 text-parish-gold" />
              {eventDateLabel}
            </span>
          )}
          {locations.map((loc) => {
            const safeMaps = loc.mapsUrl ? sanitizeActionUrl(loc.mapsUrl) : null;
            return safeMaps ? (
              <a
                key={`${loc.label}-${safeMaps}`}
                href={safeMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-parish-border bg-parish-canvas px-3 py-1 font-semibold text-parish-navy hover:bg-parish-navy hover:text-white transition-colors"
              >
                <MapPin className="h-3.5 w-3.5 text-parish-gold" />
                {loc.label}
                <ExternalLink className="h-3 w-3 opacity-75" />
              </a>
            ) : (
              <span
                key={loc.label}
                className="inline-flex items-center gap-1.5 rounded-full border border-parish-border bg-parish-canvas px-3 py-1 font-semibold text-parish-navy"
              >
                <MapPin className="h-3.5 w-3.5 text-parish-gold" />
                {loc.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Structured Liturgical / Event Timeline */}
      {timeline.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-parish-border/80 bg-parish-canvas/75">
          <div className="flex items-center gap-1.5 border-b border-parish-border/60 bg-parish-canvas px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-parish-navy">
            <Clock className="h-3.5 w-3.5 text-parish-gold" />
            Schedule & Timings
          </div>
          <ul className="divide-y divide-parish-border/50">
            {timeline.map((row, idx) => (
              <li
                key={`${row.time}-${idx}`}
                className="flex flex-col gap-1 px-3.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-3"
              >
                <span className="inline-flex w-22 shrink-0 items-center rounded-md bg-white px-2 py-0.5 font-mono text-xs font-bold text-parish-navy ring-1 ring-parish-border">
                  {row.time}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-parish-ink">{row.activity}</span>
                  {row.note && (
                    <span className="ml-2 inline-block rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-parish-muted ring-1 ring-parish-border/80">
                      {row.note}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Clean Pastoral / Explanatory Paragraphs */}
      {paragraphs.length > 0 && (
        <div className="space-y-2">
          {paragraphs.map((p, idx) => (
            <p key={idx} className="whitespace-pre-line">
              <FormattedText text={p} />
            </p>
          ))}
        </div>
      )}

      {/* Tappable Media / Drive / Video Resource Grid */}
      {mediaLinks.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {mediaLinks.map((media) => {
            const safeUrl = sanitizeActionUrl(media.url);
            if (!safeUrl) return null;
            return (
              <a
                key={safeUrl}
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-2.5 rounded-xl border border-parish-border bg-parish-canvas px-3.5 py-2.5 text-xs font-semibold text-parish-navy shadow-xs transition-all hover:-translate-y-0.5 hover:border-parish-gold hover:bg-white hover:shadow-sm"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-parish-border">
                    {renderMediaIcon(media)}
                  </span>
                  <span className="truncate">{media.label}</span>
                </span>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-parish-muted group-hover:text-parish-navy" />
              </a>
            );
          })}
        </div>
      )}

      {/* External CTA Buttons */}
      {externalLinks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {externalLinks.map((link) => {
            const safeUrl = sanitizeActionUrl(link.url);
            if (!safeUrl) return null;
            return (
              <a
                key={safeUrl}
                href={safeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-2 text-xs font-semibold text-white hover:opacity-95"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {link.label}
              </a>
            );
          })}
        </div>
      )}

      {/* Flyer Preview or PDF button */}
      {safeFlyerUrl && (
        <div>
          {isPdfFlyer ? (
            <a
              href={safeFlyerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-parish-border bg-parish-canvas px-3.5 py-2 text-xs font-semibold text-parish-navy hover:bg-white"
            >
              <ExternalLink className="h-3.5 w-3.5 text-parish-gold" />
              View Attached Notice PDF
            </a>
          ) : (
            <button
              type="button"
              onClick={() => onOpenFlyer?.(safeFlyerUrl, notice.title)}
              className="group relative block overflow-hidden rounded-xl border border-parish-border bg-parish-canvas text-left"
            >
              <img
                src={safeFlyerUrl}
                alt={`${notice.title} flyer`}
                className="max-h-60 w-full object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                loading="lazy"
              />
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-parish-navy">
                <ImageIcon className="h-3.5 w-3.5 text-parish-gold" />
                Tap to view full notice flyer
              </span>
            </button>
          )}
        </div>
      )}

      {/* Attribution badge */}
      {notice.sign_off && (
        <div className="flex items-center gap-1.5 pt-0.5 text-xs font-medium text-parish-muted">
          <UserCheck className="h-3.5 w-3.5 text-parish-gold" />
          <span>— {notice.sign_off}</span>
        </div>
      )}
    </div>
  );
}
