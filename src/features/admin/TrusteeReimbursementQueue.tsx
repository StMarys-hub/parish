import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  DollarSign,
  ExternalLink,
  Eye,
  Receipt,
  RefreshCw,
  ShieldAlert,
  X,
  XCircle,
} from 'lucide-react';
import {
  fetchAdminReimbursements,
  reviewAdminReimbursement,
} from '../../services/phase3Repository';
import {
  AdminUserProfile,
  ReimbursementClaim,
  ReimbursementStatus,
} from '../../types/parish';

interface TrusteeReimbursementQueueProps {
  currentUser: AdminUserProfile | null;
  isSandbox: boolean;
}

const FILTERS: Array<{ key: ReimbursementStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid', label: 'Paid' },
  { key: 'declined', label: 'Declined' },
];

export function TrusteeReimbursementQueue({
  currentUser,
  isSandbox,
}: TrusteeReimbursementQueueProps) {
  const [filter, setFilter] = useState<ReimbursementStatus | 'all'>('pending_review');
  const [claims, setClaims] = useState<ReimbursementClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [previewClaim, setPreviewClaim] = useState<ReimbursementClaim | null>(null);
  const [declineTarget, setDeclineTarget] = useState<ReimbursementClaim | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  const canReviewFinancials =
    isSandbox ||
    currentUser?.role === 'trustee' ||
    currentUser?.role === 'vicar' ||
    currentUser?.role === 'super_admin';

  const loadQueue = useCallback(async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      const rows = await fetchAdminReimbursements(filter);
      setClaims(rows);
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load reimbursements.',
      });
    } finally {
      setLoading(false);
    }
  }, [filter, isSandbox]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  const handleAction = async (
    claim: ReimbursementClaim,
    nextStatus: 'approved' | 'paid' | 'declined',
    notes?: string
  ) => {
    setBusyId(claim.id);
    setToast(null);
    try {
      const updated = await reviewAdminReimbursement({
        id: claim.id,
        status: nextStatus,
        trusteeNotes: notes,
      });
      setClaims((prev) => {
        if (filter !== 'all' && updated.status !== filter) {
          return prev.filter((c) => c.id !== updated.id);
        }
        return prev.map((c) => (c.id === updated.id ? updated : c));
      });
      setToast({
        type: 'ok',
        text: `${updated.reference_code} marked as ${updated.status.replace('_', ' ')} (Audit logged).`,
      });
      setDeclineTarget(null);
      setDeclineReason('');
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Action failed.',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (isSandbox) {
    return (
      <div className="rounded-2xl border border-parish-border bg-white p-6 text-center text-xs text-parish-muted">
        Connect Supabase to review live parishioner reimbursement submissions and signed receipts.
      </div>
    );
  }

  if (!canReviewFinancials) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Only verified <strong>Trustees</strong> and <strong>Super Admin / Vicar</strong> accounts
          may inspect private receipts and approve or pay reimbursements.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-parish-border bg-white p-4">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-parish-ink">Trustee Reimbursement Queue</h3>
            <p className="text-xs text-parish-muted">
              Private receipts load via 5-minute signed URLs; every approval/payout is audit logged.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadQueue}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-xl border border-parish-border px-3 py-1.5 text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {toast && (
        <div
          className={`rounded-xl border p-3 text-xs font-medium ${
            toast.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          {toast.text}
        </div>
      )}

      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-parish-navy text-white'
                : 'border border-parish-border bg-white text-parish-muted hover:text-parish-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && claims.length === 0 ? (
        <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
          Loading reimbursement requests...
        </div>
      ) : claims.length === 0 ? (
        <div className="rounded-2xl border border-parish-border bg-white p-8 text-center text-xs text-parish-muted">
          No reimbursement requests in "{filter.replace('_', ' ')}".
        </div>
      ) : (
        <div className="space-y-3">
          {claims.map((claim) => {
            const amountDisplay = `$${(claim.amount_cents / 100).toFixed(2)}`;
            const isBusy = busyId === claim.id;

            return (
              <article
                key={claim.id}
                className="rounded-2xl border border-parish-border bg-white p-4 shadow-2xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-parish-navy">
                        {claim.reference_code}
                      </span>
                      <span className="rounded-full bg-parish-canvas px-2.5 py-0.5 text-[11px] font-semibold text-parish-navy">
                        {claim.ministry}
                      </span>
                      <span className="rounded-full border border-parish-border px-2.5 py-0.5 text-[11px] font-medium text-parish-muted">
                        {claim.payout_method}
                      </span>
                    </div>
                    <h4 className="mt-1 text-base font-bold text-parish-ink">
                      {claim.full_name} — <span className="text-parish-navy">{amountDisplay}</span>
                    </h4>
                    <p className="text-xs text-parish-muted">
                      {claim.contact_info} • Expense Date: {claim.expense_date}
                    </p>
                  </div>

                  <span className="rounded-full bg-parish-canvas px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-parish-ink">
                    {claim.status.replace('_', ' ')}
                  </span>
                </div>

                <p className="mt-2.5 text-sm text-parish-ink">{claim.description}</p>

                {claim.trustee_notes && (
                  <p className="mt-2 rounded-xl bg-parish-canvas px-3 py-2 text-xs text-parish-muted">
                    <strong>Note:</strong> {claim.trustee_notes}
                    {claim.reviewed_by_name ? ` (by ${claim.reviewed_by_name})` : ''}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-parish-border pt-3">
                  <div>
                    {claim.receipt_signed_url && (
                      <button
                        type="button"
                        onClick={() => setPreviewClaim(claim)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-parish-navy/25 bg-parish-navy/5 px-3 py-1.5 text-xs font-semibold text-parish-navy hover:bg-parish-navy/10"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Inspect Receipt
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {claim.status === 'pending_review' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAction(claim, 'approved')}
                        className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                    )}
                    {(claim.status === 'pending_review' || claim.status === 'approved') && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleAction(claim, 'paid')}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        Mark Paid
                      </button>
                    )}
                    {claim.status !== 'declined' && claim.status !== 'paid' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setDeclineTarget(claim);
                          setDeclineReason('');
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Decline
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Inline Secure Receipt Preview Modal */}
      {previewClaim && previewClaim.receipt_signed_url && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-parish-border pb-2.5">
              <div>
                <h4 className="text-sm font-bold text-parish-ink">
                  Receipt • {previewClaim.reference_code} ({previewClaim.full_name})
                </h4>
                <p className="text-[11px] text-parish-muted">
                  Signed private link expires in 5 minutes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewClaim(null)}
                className="rounded-lg p-1 text-parish-muted hover:bg-parish-canvas"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex flex-col items-center justify-center">
              {previewClaim.receipt_mime_type === 'application/pdf' ? (
                <iframe
                  title="Receipt PDF"
                  src={previewClaim.receipt_signed_url}
                  className="h-[65vh] w-full rounded-xl border border-parish-border"
                />
              ) : (
                <img
                  src={previewClaim.receipt_signed_url}
                  alt={`Receipt for ${previewClaim.reference_code}`}
                  className="max-h-[65vh] rounded-xl object-contain"
                />
              )}
              <a
                href={previewClaim.receipt_signed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-parish-navy underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Original in New Tab
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Mandatory Decline Reason Modal */}
      {declineTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h4 className="text-sm font-bold text-parish-ink">
              Decline {declineTarget.reference_code}?
            </h4>
            <p className="text-xs text-parish-muted">
              Enter a reason note so <strong>{declineTarget.full_name}</strong> knows what is
              missing or needs correction.
            </p>
            <textarea
              rows={3}
              required
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g., Receipt image is blurry — please upload itemized receipt."
              className="w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeclineTarget(null)}
                className="rounded-xl border border-parish-border px-3.5 py-2 text-xs font-semibold text-parish-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={declineReason.trim().length < 3 || busyId === declineTarget.id}
                onClick={() => handleAction(declineTarget, 'declined', declineReason.trim())}
                className="rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
