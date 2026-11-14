import { useEffect } from 'react';
import { ExternalLink, FileText, X } from 'lucide-react';
import { sanitizeActionUrl } from '../lib/sanitize';

interface FlyerLightboxProps {
  isOpen: boolean;
  title: string;
  url: string;
  mimeType?: string | null;
  onClose: () => void;
}

export function FlyerLightbox({ isOpen, title, url, mimeType, onClose }: FlyerLightboxProps) {
  const safeUrl = sanitizeActionUrl(url);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !safeUrl) return null;

  const isPdf =
    mimeType === 'application/pdf' || /\.pdf(\?|$)/i.test(safeUrl);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-3 backdrop-blur-xs sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E7E2DA] bg-[#FAF8F5] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-[#1E3A5F]" />
            <h3 className="truncate text-sm font-semibold text-[#1E293B]">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-[#E7E2DA] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1E3A5F] hover:bg-slate-50"
            >
              Open <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close flyer preview"
              className="rounded-lg p-1.5 text-[#526071] hover:bg-slate-200/70 hover:text-[#1E293B]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-slate-100 p-2 sm:p-4">
          {isPdf ? (
            <div className="flex flex-col items-center gap-3">
              <iframe
                src={safeUrl}
                title={title}
                className="h-[68vh] w-full rounded-lg border border-slate-200 bg-white"
              />
              <p className="text-center text-xs text-[#526071]">
                On some mobile browsers, tap <strong>Open</strong> above to view or download the full PDF.
              </p>
            </div>
          ) : (
            <img
              src={safeUrl}
              alt={title}
              className="mx-auto max-h-[75vh] w-auto rounded-lg object-contain shadow-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
