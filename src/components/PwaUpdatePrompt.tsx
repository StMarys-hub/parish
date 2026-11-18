import { useEffect, useRef, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const RELOAD_GUARD_KEY = 'parish_sw_auto_reloaded_at';

export function PwaUpdatePrompt() {
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  const [swActivatedPrompt, setSwActivatedPrompt] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      swRegRef.current = registration ?? null;
      void registration?.update();
    },
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const hadController = Boolean(navigator.serviceWorker.controller);

    const handleControllerChange = () => {
      if (!hadController) return;
      // If a newer Service Worker activates immediately after opening/reloading,
      // refresh once automatically so the user doesn't see stale precached assets.
      // Otherwise (e.g., while editing an admin form), show a non-destructive Update banner.
      const lastReloadAt = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || '0');
      const withinCooldown = Date.now() - lastReloadAt < 15_000;
      if (performance.now() < 8000 && !withinCooldown) {
        sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
        window.location.reload();
      } else {
        setSwActivatedPrompt(true);
      }
    };

    const checkForUpdatesOnVisible = () => {
      if (document.visibilityState === 'visible') {
        void swRegRef.current?.update();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    document.addEventListener('visibilitychange', checkForUpdatesOnVisible);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', checkForUpdatesOnVisible);
    };
  }, []);

  if (!needRefresh && !swActivatedPrompt) return null;

  const handleApplyUpdate = () => {
    if (needRefresh) {
      void updateServiceWorker(true);
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-40 mx-auto max-w-md rounded-2xl border border-parish-navy/20 bg-parish-navy p-3.5 text-white shadow-lg sm:bottom-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium">A new version of the parish app is available.</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApplyUpdate}
            className="inline-flex items-center gap-1 rounded-lg bg-[#D4AF37] px-2.5 py-1 text-xs font-bold text-[#152943]"
          >
            <RefreshCw className="h-3 w-3" /> Update
          </button>
          <button
            type="button"
            onClick={() => {
              setNeedRefresh(false);
              setSwActivatedPrompt(false);
            }}
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
