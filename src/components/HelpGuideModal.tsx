import { ReactNode, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface HelpGuideModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function HelpGuideModal({
  open,
  onClose,
  title,
  subtitle,
  children,
}: HelpGuideModalProps) {
  useEffect(() => {
    if (!open) return;
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
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-guide-modal-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#E7E2DA] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[#E7E2DA] bg-white px-5 py-4">
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1E3A5F]/10 text-[#1E3A5F]">
              <HelpCircle className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 id="help-guide-modal-title" className="text-base font-bold text-[#1E293B]">
                {title}
              </h3>
              {subtitle && <p className="text-xs text-[#526071]">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help dialog"
            className="rounded-lg p-1.5 text-[#526071] hover:bg-slate-100 hover:text-[#1E293B]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-sm text-[#1E293B]">{children}</div>

        <div className="flex justify-end border-t border-[#E7E2DA] bg-[#FAF8F5] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#1E3A5F] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#152943]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
