import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Globe, Loader2, RefreshCw, X } from 'lucide-react';
import { sanitizeActionUrl } from '../lib/sanitize';

interface InAppWebViewerModalProps {
  isOpen: boolean;
  title: string;
  url: string;
  onClose: () => void;
}

/**
 * Full-height in-app web viewer sheet for official St. Mary's Parish website pages
 * so parishioners stay inside the PWA without leaving to a separate browser tab.
 */
export function InAppWebViewerModal({
  isOpen,
  title,
  url,
  onClose,
}: InAppWebViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [reloadNonce, setReloadNonce] = useState(0);

  const safeUrl = sanitizeActionUrl(url);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
  }, [isOpen, url, reloadNonce]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !safeUrl) return null;

  let hostLabel = 'stmarysyroclt.org';
  try {
    hostLabel = new URL(safeUrl).hostname.replace(/^www\./, '');
  } catch {
    // fallback to default hostLabel
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-white"
    >
      {/* Native-feeling top navigation bar */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-parish-border bg-parish-navy px-2.5 py-2.5 text-white shadow-xs sm:px-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white/12 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20 active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate text-xs font-bold text-white sm:text-sm">{title}</h2>
          <p className="inline-flex max-w-full items-center gap-1 truncate text-[10px] text-white/75">
            <Globe className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{hostLabel}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            aria-label="Reload page"
            title="Reload page"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <a
            href={safeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open in external browser"
            title="Open in external browser"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            title="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Embedded official parish page */}
      <div className="relative flex-1 bg-parish-canvas">
        {loading && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-parish-canvas/90 text-xs font-semibold text-parish-navy">
            <Loader2 className="h-5 w-5 animate-spin text-parish-navy" />
            <span>Loading {title}...</span>
          </div>
        )}
        <iframe
          key={`${safeUrl}-${reloadNonce}`}
          src={safeUrl}
          title={title}
          onLoad={() => setLoading(false)}
          referrerPolicy="no-referrer-when-downgrade"
          allow="fullscreen"
          className="h-full w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
