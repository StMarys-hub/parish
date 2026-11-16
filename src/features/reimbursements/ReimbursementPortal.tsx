import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, RefreshCw, Search } from 'lucide-react';
import { fetchTrackedReimbursements } from '../../services/phase3Repository';
import { ReimbursementClaim, ReimbursementStatus } from '../../types/parish';
import { ReimbursementForm } from './ReimbursementForm';

interface ReimbursementPortalProps {
  onBackToParish: () => void;
}

const STATUS_BADGE: Record<ReimbursementStatus, { label: string; className: string }> = {
  pending_review: {
    label: 'Pending Review',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  approved: {
    label: 'Approved',
    className: 'border-blue-200 bg-blue-50 text-blue-800',
  },
  paid: {
    label: 'Paid',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  declined: {
    label: 'Needs Info / Rejected',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
  },
};

export function ReimbursementPortal({ onBackToParish }: ReimbursementPortalProps) {
  const [subTab, setSubTab] = useState<'submit' | 'tracker'>('submit');
  const [claims, setClaims] = useState<ReimbursementClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupRef, setLookupRef] = useState('');
  const [lookupContact, setLookupContact] = useState('');

  const loadClaims = useCallback(async () => {
    setLoading(true);
    setLookupError(null);
    try {
      const list = await fetchTrackedReimbursements();
      setClaims(list);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Unable to refresh submissions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClaims();
  }, [loadClaims]);

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupRef.trim() || !lookupContact.trim()) return;
    setLoading(true);
    setLookupError(null);
    try {
      const list = await fetchTrackedReimbursements({
        referenceCode: lookupRef.trim().toUpperCase(),
        contactInfo: lookupContact.trim(),
      });
      setClaims(list);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Claim lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBackToParish}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-parish-navy hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Parish Info
        </button>

        <div className="flex gap-1.5 rounded-xl border border-parish-border bg-white p-1">
          <button
            type="button"
            onClick={() => setSubTab('submit')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === 'submit'
                ? 'bg-parish-navy text-white'
                : 'text-parish-muted hover:text-parish-ink'
            }`}
          >
            Submit Receipt
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('tracker');
              loadClaims();
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
              subTab === 'tracker'
                ? 'bg-parish-navy text-white'
                : 'text-parish-muted hover:text-parish-ink'
            }`}
          >
            My Submissions ({claims.length})
          </button>
        </div>
      </div>

      {subTab === 'submit' && (
        <ReimbursementForm
          onSubmitted={(newClaim) => {
            setClaims((prev) => [newClaim, ...prev.filter((c) => c.id !== newClaim.id)]);
          }}
        />
      )}

      {subTab === 'tracker' && (
        <div className="space-y-4">
          <form
            onSubmit={handleManualLookup}
            className="space-y-3 rounded-2xl border border-parish-border bg-white p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wider text-parish-muted">
                Track a Claim from Any Device
              </p>
              <button
                type="button"
                onClick={loadClaims}
                disabled={loading}
                className="inline-flex items-center gap-1 text-xs font-semibold text-parish-navy hover:underline disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value)}
                placeholder="Ref Code (e.g. CLM-7A9K2P)"
                className="rounded-xl border border-parish-border px-3 py-2 text-xs font-mono uppercase"
              />
              <input
                type="text"
                value={lookupContact}
                onChange={(e) => setLookupContact(e.target.value)}
                placeholder="Matching Phone or Email"
                className="rounded-xl border border-parish-border px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-parish-navy px-3 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
              >
                <Search className="h-3.5 w-3.5" />
                Find Claim
              </button>
            </div>
            {lookupError && (
              <p className="text-xs font-medium text-rose-700">{lookupError}</p>
            )}
          </form>

          {claims.length === 0 ? (
            <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
              No reimbursement submissions recorded on this device yet. Submit a receipt or look up a
              claim using your Reference Code and Phone/Email above.
            </div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim) => {
                const badge = STATUS_BADGE[claim.status];
                const amountDisplay = `$${(claim.amount_cents / 100).toFixed(2)}`;
                return (
                  <article
                    key={claim.id}
                    className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-parish-navy">
                          {claim.reference_code}
                        </span>
                        <h4 className="text-sm font-bold text-parish-ink">
                          {claim.ministry} • {amountDisplay}
                        </h4>
                        <p className="text-xs text-parish-muted">
                          Expense Date: {claim.expense_date} • Payout: {claim.payout_method}
                        </p>
                      </div>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>

                    <p className="mt-2 text-xs leading-relaxed text-parish-ink">
                      {claim.description}
                    </p>

                    {claim.trustee_notes && (
                      <div className="mt-2 rounded-xl border border-parish-border bg-parish-canvas p-2.5 text-xs text-parish-ink">
                        <span className="font-semibold">Trustee Note:</span> {claim.trustee_notes}
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-parish-muted">
                      <span>
                        Submitted {new Date(claim.created_at).toLocaleDateString()}
                        {claim.reviewed_by_name ? ` • Reviewed by ${claim.reviewed_by_name}` : ''}
                      </span>
                      {claim.receipt_signed_url && (
                        <a
                          href={claim.receipt_signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-parish-navy underline"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View Receipt (5-min secure link)
                        </a>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
