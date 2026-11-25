import { useState } from 'react';
import { Clock, Globe, Mail, MapPin, Navigation, Phone, Receipt, Shield, Type, Users } from 'lucide-react';
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

interface AboutParishViewProps {
  info: ParishInfo;
  onOpenAdmin: () => void;
  onOpenReimbursements?: () => void;
}

export function AboutParishView({ info, onOpenAdmin, onOpenReimbursements }: AboutParishViewProps) {
  const [textScale, setTextScale] = useState<TextScaleLevel>(() => getStoredTextScale());
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
    <div className="space-y-4">
      {/* Church Identity & One-Tap GPS Card */}
      <section className="rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
        <p className="text-xs font-bold uppercase tracking-wider text-parish-gold-ink">
          {info.diocese_name}
        </p>
        <h2 className="mt-1 font-serif text-xl font-bold text-parish-navy">{info.parish_name}</h2>

        <div className="mt-4 flex items-start gap-2.5 text-sm text-parish-ink">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-parish-navy" />
          <span>{info.address_line}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
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

      {/* Install & Share Parish App Card */}
      <InstallShareBanner variant="card" />

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

      {/* Parishioner Expense Reimbursement Portal */}
      {PHASE_FLAGS.reimbursements && onOpenReimbursements && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
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

      {/* Parish Clergy & Trustees */}
      <section className="rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
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
      <section className="rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-parish-navy" />
          <h3 className="text-base font-bold text-parish-ink">Office Hours & Sacraments</h3>
        </div>
        {info.office_hours && (
          <p className="mt-2 text-sm leading-relaxed text-parish-ink">{info.office_hours}</p>
        )}
        {info.general_notes && (
          <p className="mt-2 text-sm leading-relaxed text-parish-muted">{info.general_notes}</p>
        )}
        {safeWebsiteUrl && (
          <a
            href={safeWebsiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-parish-navy underline"
          >
            <Globe className="h-3.5 w-3.5" />
            Visit Official Website ({info.website_url})
          </a>
        )}
      </section>

      {/* Discreet Admin Portal Entry */}
      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={onOpenAdmin}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-parish-muted hover:bg-white hover:text-parish-navy"
        >
          <Shield className="h-3.5 w-3.5" />
          Vicar & Trustee Admin Portal
        </button>
      </div>
    </div>
  );
}
