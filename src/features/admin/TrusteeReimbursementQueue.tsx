import { useCallback, useEffect, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FolderCog,
  Lock,
  Plus,
  Receipt,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { ScrollablePillBar } from '../../components/ScrollablePillBar';
import {
  clearPreferredReceiptDirectory,
  downloadReceiptWithRememberedFolder,
  getSavedReceiptDirectoryHandle,
  isDirectoryPickerSupported,
  pickPreferredReceiptDirectory,
} from '../../lib/receiptDownload';
import {
  deleteReimbursementSubmitter,
  fetchAdminReimbursements,
  fetchReimbursementSecurity,
  getFreshReceiptDownloadUrl,
  reviewAdminReimbursement,
  updateReimbursementSecurity,
  upsertReimbursementSubmitter,
} from '../../services/phase3Repository';
import {
  AdminUserProfile,
  ReimbursementClaim,
  ReimbursementGateMode,
  ReimbursementSecurityConfig,
  ReimbursementStatus,
  ReimbursementSubmitter,
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [savedFolderName, setSavedFolderName] = useState<string | null>(null);
  const [declineTarget, setDeclineTarget] = useState<ReimbursementClaim | null>(null);
  const [declineReason, setDeclineReason] = useState('');

  // Anti-spam access control state
  const [securityOpen, setSecurityOpen] = useState(false);
  const [secConfig, setSecConfig] = useState<ReimbursementSecurityConfig>({
    gateMode: 'pin_and_login',
    hasPinConfigured: false,
    maxSubmissionsPer24h: 3,
  });
  const [newPin, setNewPin] = useState('');
  const [savingSec, setSavingSec] = useState(false);
  const [submitters, setSubmitters] = useState<ReimbursementSubmitter[]>([]);
  const [newApproveEmail, setNewApproveEmail] = useState('');
  const [newApproveName, setNewApproveName] = useState('');

  const canReviewFinancials =
    isSandbox ||
    currentUser?.role === 'trustee' ||
    currentUser?.role === 'vicar' ||
    currentUser?.role === 'super_admin';

  const loadQueue = useCallback(async () => {
    if (isSandbox) return;
    setLoading(true);
    try {
      const [rows, secRes] = await Promise.all([
        fetchAdminReimbursements(filter),
        fetchReimbursementSecurity(),
      ]);
      setClaims(rows);
      setSecConfig(secRes.config);
      setSubmitters(secRes.submitters);
      if (!secRes.config.hasPinConfigured && secRes.config.gateMode === 'pin_and_login') {
        setSecurityOpen(true);
      }
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

  useEffect(() => {
    if (!isDirectoryPickerSupported()) return;
    getSavedReceiptDirectoryHandle().then((h) => {
      if (h?.name) setSavedFolderName(h.name);
    });
  }, []);

  const handleChooseReceiptFolder = async () => {
    try {
      const picked = await pickPreferredReceiptDirectory();
      if (picked?.folderName) {
        setSavedFolderName(picked.folderName);
        setToast({
          type: 'ok',
          text: `Receipts will now save automatically to folder "${picked.folderName}".`,
        });
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to select download folder.',
      });
    }
  };

  const handleClearReceiptFolder = async () => {
    await clearPreferredReceiptDirectory();
    setSavedFolderName(null);
    setToast({
      type: 'ok',
      text: 'Cleared saved download folder. You will be prompted on your next receipt download.',
    });
  };

  const handleDownloadReceipt = async (claim: ReimbursementClaim) => {
    setDownloadingId(claim.id);
    setToast(null);
    try {
      const signedUrl = await getFreshReceiptDownloadUrl(claim);
      const outcome = await downloadReceiptWithRememberedFolder({ claim, signedUrl });
      if (outcome.mode === 'folder' && outcome.folderName) {
        setSavedFolderName(outcome.folderName);
        setToast({
          type: 'ok',
          text: `Saved ${outcome.fileName} to folder "${outcome.folderName}".`,
        });
      } else {
        setToast({
          type: 'ok',
          text: `Downloaded ${outcome.fileName}.`,
        });
      }
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Receipt download failed.',
      });
    } finally {
      setDownloadingId(null);
    }
  };

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

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSec(true);
    setToast(null);
    try {
      await updateReimbursementSecurity({
        gateMode: secConfig.gateMode,
        maxSubmissionsPer24h: secConfig.maxSubmissionsPer24h,
        ...(newPin.trim() ? { newPin: newPin.trim() } : {}),
      });
      setNewPin('');
      setToast({
        type: 'ok',
        text: 'Reimbursement anti-spam & access control updated cleanly.',
      });
      await loadQueue();
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to save anti-spam settings.',
      });
    } finally {
      setSavingSec(false);
    }
  };

  const handleApproveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApproveEmail.trim()) return;
    setSavingSec(true);
    setToast(null);
    try {
      await upsertReimbursementSubmitter({
        email: newApproveEmail.trim().toLowerCase(),
        fullName: newApproveName.trim() || undefined,
        isApproved: true,
        isBlocked: false,
      });
      setNewApproveEmail('');
      setNewApproveName('');
      await loadQueue();
      setToast({ type: 'ok', text: 'Ministry submitter approved.' });
    } catch (err) {
      setToast({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to approve email.',
      });
    } finally {
      setSavingSec(false);
    }
  };

  const handleToggleSubmitter = async (
    sub: ReimbursementSubmitter,
    patch: { isApproved?: boolean; isBlocked?: boolean }
  ) => {
    await upsertReimbursementSubmitter({
      email: sub.email,
      fullName: sub.full_name ?? undefined,
      ministry: sub.ministry ?? undefined,
      isApproved: patch.isApproved ?? sub.is_approved,
      isBlocked: patch.isBlocked ?? sub.is_blocked,
    });
    await loadQueue();
  };

  if (isSandbox) {
    return (
      <div className="rounded-2xl border border-parish-border bg-white p-6 text-center text-xs text-parish-muted">
        Connect Supabase to review live parishioner reimbursement submissions and anti-spam settings.
      </div>
    );
  }

  if (!canReviewFinancials) {
    return (
      <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Only verified <strong>Trustees</strong> and <strong>Super Admin / Vicar</strong> accounts
          may inspect private receipts and manage reimbursement anti-spam settings.
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
              Device login + anti-spam gate protects uploads; receipts load via 5-min signed URLs.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isDirectoryPickerSupported() && (
            <div className="inline-flex items-center overflow-hidden rounded-xl border border-parish-border bg-parish-canvas/70">
              <button
                type="button"
                onClick={handleChooseReceiptFolder}
                title={
                  savedFolderName
                    ? `Current folder: ${savedFolderName} — click to change folder`
                    : 'Choose preferred local folder for downloaded receipts'
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-parish-navy hover:bg-parish-canvas"
              >
                <FolderCog className="h-3.5 w-3.5 shrink-0" />
                {savedFolderName ? (
                  <>
                    <span className="max-w-28 truncate">{savedFolderName}</span>
                    <span className="text-[11px] font-medium underline opacity-85">Change</span>
                  </>
                ) : (
                  <span>Set Receipt Folder</span>
                )}
              </button>
              {savedFolderName && (
                <button
                  type="button"
                  onClick={handleClearReceiptFolder}
                  title="Forget saved folder & ask next time"
                  aria-label="Reset saved download folder"
                  className="border-l border-parish-border px-2 py-1.5 text-parish-muted hover:bg-rose-50 hover:text-rose-700"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          )}
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
      </div>

      {/* Collapsible Anti-Spam & Access Control Panel */}
      <section className="overflow-hidden rounded-2xl border border-parish-border bg-white shadow-2xs">
        <button
          type="button"
          aria-expanded={securityOpen}
          onClick={() => setSecurityOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-parish-canvas/60"
        >
          <div className="flex items-center gap-2.5">
            <Lock className="h-4 w-4 text-parish-navy" />
            <div>
              <p className="text-xs font-bold text-parish-ink">
                Anti-Spam &amp; Access Control (Mode:{' '}
                <span className="text-parish-navy">
                  {secConfig.gateMode === 'pin_and_login'
                    ? 'Device Login + Parish PIN'
                    : secConfig.gateMode === 'allowlist_only'
                      ? 'Approved Emails Only'
                      : 'Device Login + Daily Limit'}
                </span>
                )
              </p>
              {!secConfig.hasPinConfigured && secConfig.gateMode === 'pin_and_login' && (
                <p className="text-[11px] font-semibold text-amber-800">
                  Set a Parish Submission PIN below so ministry leads can unlock receipt uploads.
                </p>
              )}
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-parish-navy transition-transform duration-200 ${
              securityOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {securityOpen && (
          <div className="space-y-4 border-t border-parish-border p-4 text-xs">
            <form onSubmit={handleSaveSecurity} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block font-semibold text-parish-muted">Protection Mode</label>
                  <select
                    value={secConfig.gateMode}
                    onChange={(e) =>
                      setSecConfig((c) => ({
                        ...c,
                        gateMode: e.target.value as ReimbursementGateMode,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-parish-border bg-white px-3 py-2 text-xs font-medium"
                  >
                    <option value="pin_and_login">
                      Device Login + Parish PIN (Recommended)
                    </option>
                    <option value="allowlist_only">Approved Emails Only (Strict)</option>
                    <option value="login_with_rate_limit">Device Login + Rate Limit</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-parish-muted">
                    {secConfig.hasPinConfigured
                      ? 'Rotate Parish PIN (Leave blank to keep)'
                      : 'Set Parish Submission PIN *'}
                  </label>
                  <input
                    type="text"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value)}
                    placeholder={secConfig.hasPinConfigured ? '•••••• (Configured)' : 'e.g. STMARY2026'}
                    className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-parish-muted">
                    Max Uploads / User / 24h
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={25}
                    value={secConfig.maxSubmissionsPer24h}
                    onChange={(e) =>
                      setSecConfig((c) => ({
                        ...c,
                        maxSubmissionsPer24h: Number(e.target.value) || 3,
                      }))
                    }
                    className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingSec}
                className="rounded-xl bg-parish-navy px-4 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
              >
                {savingSec ? 'Saving...' : 'Save Anti-Spam Settings'}
              </button>
            </form>

            {/* Approved Submitters & Block List */}
            <div className="space-y-2 border-t border-parish-border pt-3">
              <p className="font-bold text-parish-ink">
                Pre-Approved Emails &amp; Blocked Accounts ({submitters.length})
              </p>
              <form onSubmit={handleApproveEmail} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="email"
                  required
                  value={newApproveEmail}
                  onChange={(e) => setNewApproveEmail(e.target.value)}
                  placeholder="ministry.lead@email.com"
                  className="rounded-xl border border-parish-border px-3 py-1.5 text-xs"
                />
                <input
                  type="text"
                  value={newApproveName}
                  onChange={(e) => setNewApproveName(e.target.value)}
                  placeholder="Name (optional)"
                  className="rounded-xl border border-parish-border px-3 py-1.5 text-xs"
                />
                <button
                  type="submit"
                  disabled={savingSec}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-parish-navy/30 bg-parish-navy/5 px-3 py-1.5 text-xs font-semibold text-parish-navy hover:bg-parish-navy/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Pre-Approve Email
                </button>
              </form>

              {submitters.length > 0 && (
                <div className="max-h-48 space-y-1.5 overflow-y-auto pt-1">
                  {submitters.map((sub) => (
                    <div
                      key={sub.email}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-parish-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-parish-ink">{sub.email}</span>
                        {sub.full_name && (
                          <span className="ml-1.5 text-parish-muted">({sub.full_name})</span>
                        )}
                        <div className="flex flex-wrap gap-1.5 pt-0.5 text-[10px]">
                          {sub.is_approved && (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                              Approved
                            </span>
                          )}
                          {sub.pin_verified_at && (
                            <span className="rounded bg-sky-50 px-1.5 py-0.5 font-semibold text-sky-700">
                              PIN Verified
                            </span>
                          )}
                          {sub.is_blocked && (
                            <span className="rounded bg-rose-50 px-1.5 py-0.5 font-semibold text-rose-700">
                              Blocked
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleSubmitter(sub, { isBlocked: !sub.is_blocked })
                          }
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${
                            sub.is_blocked
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-rose-200 bg-rose-50 text-rose-700'
                          }`}
                        >
                          {sub.is_blocked ? (
                            <>
                              <ShieldCheck className="h-3 w-3" /> Unblock
                            </>
                          ) : (
                            <>
                              <Ban className="h-3 w-3" /> Block
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            await deleteReimbursementSubmitter(sub.email);
                            await loadQueue();
                          }}
                          className="rounded-lg border border-parish-border p-1 text-parish-muted hover:text-rose-700"
                          aria-label="Remove entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

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

      <ScrollablePillBar ariaLabel="Filter reimbursement claims by status">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.key
                ? 'bg-parish-navy text-white'
                : 'border border-parish-border bg-white text-parish-muted hover:text-parish-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </ScrollablePillBar>

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
                  <div className="flex items-center gap-1.5">
                    {(claim.receipt_signed_url || claim.receipt_path) && (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewClaim(claim)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-parish-navy/25 bg-parish-navy/5 px-3 py-1.5 text-xs font-semibold text-parish-navy hover:bg-parish-navy/10"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Inspect Receipt
                        </button>
                        <button
                          type="button"
                          disabled={downloadingId === claim.id}
                          onClick={() => handleDownloadReceipt(claim)}
                          title="Download Receipt"
                          aria-label="Download Receipt"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-parish-border bg-white text-parish-navy hover:bg-parish-canvas disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
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
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <a
                  href={previewClaim.receipt_signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-parish-navy underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Original in New Tab
                </a>
                <button
                  type="button"
                  disabled={downloadingId === previewClaim.id}
                  onClick={() => handleDownloadReceipt(previewClaim)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-parish-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  {downloadingId === previewClaim.id ? 'Downloading...' : 'Download Receipt'}
                </button>
              </div>
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
