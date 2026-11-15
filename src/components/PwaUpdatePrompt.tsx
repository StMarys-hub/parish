import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md rounded-2xl border border-parish-navy/20 bg-parish-navy p-3.5 text-white shadow-lg sm:bottom-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium">A new version of the parish app is available.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => updateServiceWorker(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-xs font-bold text-[#152943]"
          >
            <RefreshCw className="h-3 w-3" /> Update
          </button>
          <button
            type="button"
            onClick={() => setNeedRefresh(false)}
            aria-label="Dismiss update prompt"
            className="rounded p-1 text-slate-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
