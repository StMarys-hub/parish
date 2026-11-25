import { useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Landmark,
  Mail,
  MapPin,
  Navigation,
  Phone,
  Receipt,
  Settings,
  Shield,
  Type,
  Users,
  Video,
  Wrench,
} from 'lucide-react';
import { InAppWebViewerModal } from '../../components/InAppWebViewerModal';
import { PHASE_FLAGS } from '../../config/features';
import { sanitizeActionUrl } from '../../lib/sanitize';
import {
  applyTextScaleToDocument,
  formatTextScaleLabel,
  getStoredTextScale,
  stepTextScale,
  TextScaleLevel,
} from '../../lib/textScale';
import { ParishInfo } from '../../types/parish';
import { PushOptInCard } from '../notifications/PushOptInCard';
import { InstallShareBanner } from '../pwa/InstallShareBanner';

export type ParishSegment = 'info' | 'services' | 'settings';

interface AboutParishViewProps {
  info: ParishInfo;
  initialSegment?: ParishSegment;
  onOpenAdmin: () => void;
  onOpenReimbursements?: () => void;
}

const PARISH_ON_NET_URL = 'https://stthomas.parishon.net/charlotte/site/login';
const OFFICIAL_YOUTUBE_URL = 'https://www.youtube.com/channel/UCbtWOIgoDaKHZ-8D0p860Pg';
const OFFICIAL_FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=100009197673005';
const OFFICIAL_LITURGICAL_BOOKS_URL =
  'https://stmarysyroclt.org/website%20pages/liturgy/liturgical-books.html';
const OFFICIAL_SACRAMENTS_URL =
  'https://stmarysyroclt.org/website%20pages/liturgy/sacraments.html';
const OFFICIAL_MINISTRIES_URL =
  'https://stmarysyroclt.org/website%20pages/ministries.html';
const OFFICIAL_HISTORY_URL =
  'https://stmarysyroclt.org/website%20pages/about/parish-history.html';

export function AboutParishView({
  info,
  initialSegment = 'info',
  onOpenAdmin,
  onOpenReimbursements,
}: AboutParishViewProps) {
  const [segment, setSegment] = useState<ParishSegment>(initialSegment);
  const [textScale, setTextScale] = useState<TextScaleLevel>(() => getStoredTextScale());
  const [webViewer, setWebViewer] = useState<{ title: string; url: string } | null>(null);

  useEffect(() => {
    setSegment(initialSegment);
  }, [initialSegment]);

  const safeMapsUrl = sanitizeActionUrl(info.maps_url);
  const safeWebsiteUrl = sanitizeActionUrl(info.website_url);
  const safeEmailUrl = sanitizeActionUrl(`mailto:${info.email}`, true);
  const telHref = `tel:${info.phone.replace(/[^+\d]/g, '')}`;

  const handleScaleChange = (delta: -1 | 1) => {
    const next = stepTextScale(textScale, delta);
    setTextScale(next);
    applyTextScaleToDocument(next);
  };

  return (
    <div className="space-y-3.5">
      {/* 3-Segment Switcher: Church Info | Services & Forms | Settings */}
      <div
        role="tablist"
        aria-label="Parish sections"
        className="grid grid-cols-3 gap-1 rounded-2xl border border-parish-border bg-white p-1 shadow-2xs"
      >
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'info'}
          onClick={() => setSegment('info')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
            segment === 'info'
              ? 'bg-parish-navy text-white shadow-2xs'
              : 'text-parish-muted hover:bg-parish-canvas hover:text-parish-ink'
          }`}
        >
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Church Info</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'services'}
          onClick={() => setSegment('services')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
            segment === 'services'
              ? 'bg-parish-navy text-white shadow-2xs'
              : 'text-parish-muted hover:bg-parish-canvas hover:text-parish-ink'
          }`}
        >
          <Wrench className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Services</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={segment === 'settings'}
          onClick={() => setSegment('settings')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition-colors ${
            segment === 'settings'
              ? 'bg-parish-navy text-white shadow-2xs'
              : 'text-parish-muted hover:bg-parish-canvas hover:text-parish-ink'
          }`}
        >
          <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Settings</span>
        </button>
      </div>

      {/* SEGMENT 1: CHURCH INFO */}
      {segment === 'info' && (
        <div className="space-y-3.5">
          {/* Church Identity & One-Tap GPS Card */}
          <section className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-parish-gold-ink">
              {info.diocese_name}
            </p>
            <h2 className="mt-1 font-serif text-xl font-bold text-parish-navy">
              {info.parish_name}
            </h2>

            <div className="mt-3.5 flex items-start gap-2.5 text-sm text-parish-ink">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-parish-navy" />
              <span>{info.address_line}</span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {safeMapsUrl && (
                <a
                  href={safeMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-parish-navy px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-parish-navy-dark"
                >
                  <Navigation className="h-4 w-4" />
                  Directions (GPS)
                </a>
              )}
              <a
                href={telHref}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-parish-border bg-parish-canvas px-3.5 py-2.5 text-xs font-semibold text-parish-navy hover:bg-slate-100"
              >
                <Phone className="h-4 w-4" />
                Call {info.phone}
              </a>
              {safeEmailUrl && (
                <a
                  href={safeEmailUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-parish-border bg-parish-canvas px-3.5 py-2.5 text-xs font-semibold text-parish-navy hover:bg-slate-100"
                >
                  <Mail className="h-4 w-4" />
                  Email Vicar
                </a>
              )}
            </div>
          </section>

          {/* Official Website Resources & Parish On Net */}
          <section className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-parish-navy" />
                <h3 className="text-sm font-bold text-parish-ink">
                  Official Parish Links &amp; Resources
                </h3>
              </div>
              <a
                href={PARISH_ON_NET_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-parish-navy-dark"
              >
                <Landmark className="h-3.5 w-3.5 text-amber-200" />
                Parish On Net
                <ExternalLink className="h-3 w-3 opacity-80" />
              </a>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button
                type="button"
                onClick={() =>
                  setWebViewer({ title: 'Liturgical Books', url: OFFICIAL_LITURGICAL_BOOKS_URL })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas/75 px-3 py-2 text-left text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-parish-gold" />
                <span className="truncate">Liturgical Books</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setWebViewer({ title: 'Sacraments', url: OFFICIAL_SACRAMENTS_URL })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas/75 px-3 py-2 text-left text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <Landmark className="h-3.5 w-3.5 shrink-0 text-parish-gold" />
                <span className="truncate">Sacraments</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setWebViewer({ title: 'Parish Ministries', url: OFFICIAL_MINISTRIES_URL })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas/75 px-3 py-2 text-left text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <Users className="h-3.5 w-3.5 shrink-0 text-parish-gold" />
                <span className="truncate">Ministries</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setWebViewer({ title: 'Parish History', url: OFFICIAL_HISTORY_URL })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas/75 px-3 py-2 text-left text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <Info className="h-3.5 w-3.5 shrink-0 text-parish-gold" />
                <span className="truncate">Parish History</span>
              </button>
              <a
                href={OFFICIAL_YOUTUBE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas/75 px-3 py-2 text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <Video className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                <span className="truncate">YouTube Channel</span>
              </a>
              <a
                href={OFFICIAL_FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-parish-border bg-parish-canvas/75 px-3 py-2 text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-sky-700" />
                <span className="truncate">Facebook Page</span>
              </a>
            </div>
          </section>

          {/* Parish Clergy & Trustees */}
          <section className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs sm:p-5">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-parish-navy" />
              <h3 className="text-base font-bold text-parish-ink">Parish Leadership</h3>
            </div>

            <div className="mt-3 divide-y divide-parish-border">
              <div className="py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-parish-gold-ink">
                  {info.vicar_title}
                </p>
                <p className="text-sm font-bold text-parish-ink">{info.vicar_name}</p>
                <p className="text-xs text-parish-muted">
                  {info.email} • {info.phone}
                </p>
              </div>

              {info.trustees.map((t, idx) => (
                <div key={idx} className="py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-parish-muted">
                    {t.role}
                  </p>
                  <p className="text-sm font-bold text-parish-ink">{t.name}</p>
                  {(t.phone || t.email) && (
                    <p className="text-xs text-parish-muted">
                      {[t.phone, t.email].filter(Boolean).join(' • ')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Office Hours & General Info */}
          <section className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs sm:p-5">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-parish-navy" />
              <h3 className="text-base font-bold text-parish-ink">Office Hours &amp; Sacraments</h3>
            </div>
            {info.office_hours && (
              <p className="parish-readable-body mt-2 text-sm leading-relaxed text-parish-ink">
                {info.office_hours}
              </p>
            )}
            {info.general_notes && (
              <p className="parish-readable-body mt-2 text-sm leading-relaxed text-parish-muted">
                {info.general_notes}
              </p>
            )}
            {safeWebsiteUrl && (
              <button
                type="button"
                onClick={() =>
                  setWebViewer({ title: info.parish_name, url: safeWebsiteUrl })
                }
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-parish-navy underline hover:opacity-80"
              >
                <Globe className="h-3.5 w-3.5" />
                Visit Official Website ({info.website_url})
              </button>
            )}
          </section>
        </div>
      )}

      {/* SEGMENT 2: SERVICES & FORMS */}
      {segment === 'services' && (
        <div className="space-y-3.5">
          {/* Parish On Net Member Portal */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-gold/40 bg-white p-4 shadow-2xs sm:p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-parish-gold-soft p-2.5 text-parish-gold-ink">
                <Landmark className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-parish-ink">Parish On Net Portal</h3>
                <p className="mt-0.5 text-xs text-parish-muted">
                  Sign in to St. Mary&apos;s Parish On Net for family directory, contributions, and parish records.
                </p>
              </div>
            </div>
            <a
              href={PARISH_ON_NET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-4 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark"
            >
              Open Parish On Net
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </section>

          {/* Parishioner Expense Reimbursement Portal */}
          {PHASE_FLAGS.reimbursements && onOpenReimbursements && (
            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white p-4 shadow-2xs sm:p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-parish-navy/10 p-2.5 text-parish-navy">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-parish-ink">
                    Expense Reimbursement Portal
                  </h3>
                  <p className="mt-0.5 text-xs text-parish-muted">
                    Submit ministry bills &amp; receipts to Parish Trustees or track reimbursement status.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenReimbursements}
                className="rounded-xl bg-parish-navy px-4 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark"
              >
                Submit / Track Receipt
              </button>
            </section>
          )}

          {/* Install & Share Parish App Card */}
          <InstallShareBanner variant="card" />
        </div>
      )}

      {/* SEGMENT 3: SETTINGS & PREFERENCES */}
      {segment === 'settings' && (
        <div className="space-y-3.5">
          {/* Push Notification Settings */}
          <div id="parish-alerts-section">
            <PushOptInCard />
          </div>

          {/* Compact Reading Text Size Control (A- / A+) */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white px-4 py-3.5 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
                <Type className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-parish-ink">Reading Text Size</h3>
                <p className="text-xs text-parish-muted">{formatTextScaleLabel(textScale)}</p>
              </div>
            </div>
            <div className="inline-flex items-center overflow-hidden rounded-xl border border-parish-border bg-parish-canvas">
              <button
                type="button"
                disabled={textScale === 'normal'}
                onClick={() => handleScaleChange(-1)}
                aria-label="Decrease reading text size"
                className="px-3 py-1.5 text-xs font-bold text-parish-navy hover:bg-white disabled:opacity-40"
              >
                A-
              </button>
              <span className="h-4 w-px bg-parish-border" aria-hidden="true" />
              <button
                type="button"
                disabled={textScale === 'xlarge'}
                onClick={() => handleScaleChange(1)}
                aria-label="Increase reading text size"
                className="px-3 py-1.5 text-sm font-bold text-parish-navy hover:bg-white disabled:opacity-40"
              >
                A+
              </button>
            </div>
          </section>

          {/* Discreet Admin Portal Entry */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 rounded-xl border border-parish-border bg-white px-4 py-2 text-xs font-semibold text-parish-muted hover:text-parish-navy"
            >
              <Shield className="h-3.5 w-3.5" />
              Vicar &amp; Trustee Admin Portal
            </button>
          </div>
        </div>
      )}
      <InAppWebViewerModal
        isOpen={Boolean(webViewer)}
        title={webViewer?.title ?? ''}
        url={webViewer?.url ?? ''}
        onClose={() => setWebViewer(null)}
      />
    </div>
  );
}
