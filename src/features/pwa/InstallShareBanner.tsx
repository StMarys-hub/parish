import { useEffect, useState } from 'react';
import { CheckCircle2, Download, Share2, Smartphone, X } from 'lucide-react';
import {
  getDeferredInstallPrompt,
  isIosSafariDevice,
  isRunningStandalone,
  shareParishAppLink,
  subscribeInstallPrompt,
  triggerNativeInstall,
} from '../../lib/pwaInstall';

const DISMISS_STORAGE_KEY = 'parish_install_banner_dismissed_v1';

interface InstallShareBannerProps {
  variant?: 'banner' | 'card';
}

export function InstallShareBanner({ variant = 'banner' }: InstallShareBannerProps) {
  const [hasNativePrompt, setHasNativePrompt] = useState(() => Boolean(getDeferredInstallPrompt()));
  const [isStandalone, setIsStandalone] = useState(() => isRunningStandalone());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [showInstructions, setShowInstructions] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setIsStandalone(isRunningStandalone());
    return subscribeInstallPrompt(() => {
      setHasNativePrompt(Boolean(getDeferredInstallPrompt()));
      setIsStandalone(isRunningStandalone());
    });
  }, []);

  const isIos = isIosSafariDevice();

  const handleInstallClick = async () => {
    setFeedback(null);
    if (hasNativePrompt) {
      const outcome = await triggerNativeInstall();
      if (outcome === 'accepted') {
        setFeedback('Parish app installed to your device!');
        return;
      }
      if (outcome === 'dismissed') {
        return;
      }
    }
    setShowInstructions((prev) => !prev);
  };

  const handleShareClick = async () => {
    const result = await shareParishAppLink();
    if (result === 'shared') {
      setFeedback('App link shared!');
    } else if (result === 'copied') {
      setFeedback('Install link copied! Paste in WhatsApp or text to share with parishioners.');
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    } catch {
      // ignore
    }
  };

  if (variant === 'banner' && (dismissed || isStandalone)) {
    return null;
  }

  return (
    <section
      aria-label="Install and Share Parish App"
      className={
        variant === 'card'
          ? 'rounded-2xl border border-parish-border bg-white p-4 shadow-2xs'
          : 'mb-4 rounded-2xl border border-parish-gold/35 bg-white p-3.5 shadow-2xs'
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Smartphone className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-parish-ink">
                {isStandalone ? 'Parish App Installed' : "Install St. Mary's Parish App"}
              </h3>
              {isStandalone && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  <CheckCircle2 className="h-3 w-3" /> Active
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-parish-muted">
              {isStandalone
                ? 'Share this app link with family & ward members so they can install it too.'
                : 'Add to your home screen for one-tap schedules, offline bulletins & alerts, or share it with others.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isStandalone && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3.5 py-2 text-xs font-semibold text-white shadow-2xs hover:bg-parish-navy-dark"
            >
              <Download className="h-3.5 w-3.5" />
              Install App
            </button>
          )}

          <button
            type="button"
            onClick={handleShareClick}
            className="inline-flex items-center gap-1.5 rounded-xl border border-parish-border bg-parish-canvas px-3.5 py-2 text-xs font-semibold text-parish-navy hover:bg-slate-100"
          >
            <Share2 className="h-3.5 w-3.5" />
            Share Install Link
          </button>

          {variant === 'banner' && (
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss install banner"
              className="rounded-lg p-1.5 text-parish-muted hover:bg-slate-100 hover:text-parish-ink"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {showInstructions && !isStandalone && (
        <div className="mt-3 rounded-xl border border-parish-border bg-parish-canvas p-3 text-xs leading-relaxed text-parish-ink">
          {isIos ? (
            <p>
              <strong>iPhone / iPad (Safari):</strong> Tap Safari’s <strong>Share</strong> icon at the
              bottom bar, then scroll and tap <strong>Add to Home Screen</strong>.
            </p>
          ) : (
            <p>
              <strong>Android / Desktop Browser:</strong> Open your browser menu (⋮ or address-bar install
              icon) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </p>
          )}
        </div>
      )}

      {feedback && (
        <p className="mt-2 text-xs font-medium text-emerald-800">{feedback}</p>
      )}
    </section>
  );
}
