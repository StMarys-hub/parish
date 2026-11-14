import { useEffect, useState } from 'react';
import { Bell, BellOff, CheckCircle2, Share, Smartphone } from 'lucide-react';
import {
  getCurrentPushSubscription,
  getPushSupportState,
  hasLocalPushPreference,
  PushSupportState,
  subscribeToParishPush,
  unsubscribeFromParishPush,
} from '../../services/pushService';

export function PushOptInCard({ compact = false }: { compact?: boolean }) {
  const [support, setSupport] = useState<PushSupportState>('unsupported');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const state = getPushSupportState();
    setSupport(state);
    if (state === 'supported') {
      getCurrentPushSubscription()
        .then((sub) => setIsSubscribed(Boolean(sub) || hasLocalPushPreference()))
        .catch(() => setIsSubscribed(hasLocalPushPreference()));
    }
  }, []);

  if (support === 'unconfigured' || support === 'unsupported') {
    return null;
  }

  const handleSubscribe = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await subscribeToParishPush();
      setIsSubscribed(true);
      setFeedback('Weekly bulletin alerts are now enabled on this device.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to enable alerts.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    setFeedback(null);
    try {
      await unsubscribeFromParishPush();
      setIsSubscribed(false);
      setFeedback('Alerts turned off for this device.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Unable to turn off alerts.');
    } finally {
      setLoading(false);
    }
  };

  if (support === 'ios-needs-homescreen') {
    return (
      <div className="rounded-2xl border border-[#E7E2DA] bg-[#FEF7E0]/70 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#1E3A5F] p-2 text-white">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-[#1E293B]">
              Enable Push Alerts on iPhone / iPad
            </h3>
            <p className="text-xs leading-relaxed text-[#526071]">
              Apple requires adding the parish app to your Home Screen before alerts can be enabled:
            </p>
            <ol className="list-inside list-decimal space-y-1 text-xs font-medium text-[#1E293B]">
              <li className="flex items-center gap-1.5">
                <span>1. Tap Safari’s</span>
                <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold shadow-2xs">
                  <Share className="h-3 w-3 text-[#1E3A5F]" /> Share
                </span>
                <span>button, then tap <strong>Add to Home Screen</strong>.</span>
              </li>
              <li>2. Open <strong>St. Mary’s</strong> from your Home Screen and tap <strong>Enable Alerts</strong>.</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  if (compact && isSubscribed) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          Parish alerts enabled on this device
        </span>
        <button
          type="button"
          onClick={handleUnsubscribe}
          disabled={loading}
          className="font-semibold text-emerald-800 underline hover:text-emerald-950"
        >
          {loading ? 'Updating...' : 'Turn off'}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#E7E2DA] bg-white p-4 shadow-2xs">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#1E3A5F]/10 p-2.5 text-[#1E3A5F]">
            {isSubscribed ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <Bell className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#1E293B]">
              {isSubscribed ? 'Weekly Parish Alerts Active' : 'Get Weekly Bulletin Alerts'}
            </h3>
            <p className="mt-0.5 text-xs leading-relaxed text-[#526071]">
              {isSubscribed
                ? 'You will receive an instant notification when Fr. Rajeev publishes a new schedule or urgent announcement.'
                : 'Receive an instant alert when the weekly Qurbana schedule or urgent parish notices are published.'}
            </p>
          </div>
        </div>

        {isSubscribed ? (
          <button
            type="button"
            onClick={handleUnsubscribe}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[#E7E2DA] bg-slate-50 px-3.5 py-2 text-xs font-semibold text-[#526071] hover:bg-slate-100 disabled:opacity-60"
          >
            <BellOff className="h-3.5 w-3.5" />
            {loading ? 'Updating...' : 'Disable Alerts'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#1E3A5F] px-4 py-2.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#152943] disabled:opacity-60"
          >
            <Bell className="h-3.5 w-3.5" />
            {loading ? 'Enabling...' : 'Enable Alerts'}
          </button>
        )}
      </div>
      {feedback && <p className="mt-2 text-xs font-medium text-[#1E3A5F]">{feedback}</p>}
    </div>
  );
}
