import { Clock, Globe, Mail, MapPin, Navigation, Phone, Shield, Users } from 'lucide-react';
import { sanitizeActionUrl } from '../../lib/sanitize';
import { ParishInfo } from '../../types/parish';
import { PushOptInCard } from '../notifications/PushOptInCard';

interface AboutParishViewProps {
  info: ParishInfo;
  onOpenAdmin: () => void;
}

export function AboutParishView({ info, onOpenAdmin }: AboutParishViewProps) {
  const safeMapsUrl = sanitizeActionUrl(info.maps_url);
  const safeWebsiteUrl = sanitizeActionUrl(info.website_url);
  const safeEmailUrl = sanitizeActionUrl(`mailto:${info.email}`, true);
  const telHref = `tel:${info.phone.replace(/[^+\d]/g, '')}`;

  return (
    <div className="space-y-4">
      {/* Church Identity & One-Tap GPS Card */}
      <section className="rounded-2xl border border-[#E7E2DA] bg-white p-5 shadow-2xs">
        <p className="text-xs font-bold uppercase tracking-wider text-[#B8860B]">
          {info.diocese_name}
        </p>
        <h2 className="mt-1 font-serif text-xl font-bold text-[#1E3A5F]">{info.parish_name}</h2>

        <div className="mt-4 flex items-start gap-2.5 text-sm text-[#1E293B]">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#1E3A5F]" />
          <span>{info.address_line}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {safeMapsUrl && (
            <a
              href={safeMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#152943]"
            >
              <Navigation className="h-4 w-4" />
              Directions (GPS)
            </a>
          )}
          <a
            href={telHref}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] px-3.5 py-2.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
          >
            <Phone className="h-4 w-4" />
            Call {info.phone}
          </a>
          {safeEmailUrl && (
            <a
              href={safeEmailUrl}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E7E2DA] bg-[#FAF8F5] px-3.5 py-2.5 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-100"
            >
              <Mail className="h-4 w-4" />
              Email Vicar
            </a>
          )}
        </div>
      </section>

      {/* Push Notification Settings */}
      <PushOptInCard />

      {/* Parish Clergy & Trustees */}
      <section className="rounded-2xl border border-[#E7E2DA] bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#1E3A5F]" />
          <h3 className="text-base font-bold text-[#1E293B]">Parish Leadership</h3>
        </div>

        <div className="mt-3 divide-y divide-[#E7E2DA]">
          <div className="py-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#B8860B]">
              {info.vicar_title}
            </p>
            <p className="text-sm font-bold text-[#1E293B]">{info.vicar_name}</p>
            <p className="text-xs text-[#526071]">
              {info.email} • {info.phone}
            </p>
          </div>

          {info.trustees.map((t, idx) => (
            <div key={idx} className="py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#526071]">
                {t.role}
              </p>
              <p className="text-sm font-bold text-[#1E293B]">{t.name}</p>
              {(t.phone || t.email) && (
                <p className="text-xs text-[#526071]">
                  {[t.phone, t.email].filter(Boolean).join(' • ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Office Hours & General Info */}
      <section className="rounded-2xl border border-[#E7E2DA] bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#1E3A5F]" />
          <h3 className="text-base font-bold text-[#1E293B]">Office Hours & Sacraments</h3>
        </div>
        {info.office_hours && (
          <p className="mt-2 text-sm leading-relaxed text-[#1E293B]">{info.office_hours}</p>
        )}
        {info.general_notes && (
          <p className="mt-2 text-sm leading-relaxed text-[#526071]">{info.general_notes}</p>
        )}
        {safeWebsiteUrl && (
          <a
            href={safeWebsiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1E3A5F] underline"
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
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-[#526071] hover:bg-white hover:text-[#1E3A5F]"
        >
          <Shield className="h-3.5 w-3.5" />
          Vicar & Trustee Admin Portal
        </button>
      </div>
    </div>
  );
}
