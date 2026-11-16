import { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, KeyRound, Lock, Receipt, ShieldAlert, Upload } from 'lucide-react';
import { MAX_RECEIPT_BYTES, resolveReceiptMimeType } from '../../lib/imageCompression';
import {
  submitReimbursementRequest,
  verifyReimbursementParishPin,
} from '../../services/phase3Repository';
import {
  PARISH_MINISTRIES,
  PayoutMethod,
  ReimbursementAccessStatus,
  ReimbursementClaim,
} from '../../types/parish';

interface ReimbursementFormProps {
  accessStatus: ReimbursementAccessStatus;
  onAccessVerified: () => void;
  onSubmitted: (claim: ReimbursementClaim) => void;
}

interface DraftFields {
  fullName: string;
  contactInfo: string;
  ministry: string;
  customMinistry: string;
  expenseDate: string;
  amountDollars: string;
  description: string;
  payoutMethod: PayoutMethod;
}

const DRAFT_STORAGE_KEY = 'parish_reimb_draft_v1';

const PAYOUT_METHODS: readonly PayoutMethod[] = [
  'Check',
  'Zelle',
  'Direct Reimbursement',
];

function loadSavedDraft(defaultEmail: string): DraftFields {
  const defaults: DraftFields = {
    fullName: '',
    contactInfo: defaultEmail,
    ministry: PARISH_MINISTRIES[0],
    customMinistry: '',
    expenseDate: new Date().toISOString().slice(0, 10),
    amountDollars: '',
    description: '',
    payoutMethod: 'Check',
  };
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<DraftFields>;
    return {
      ...defaults,
      ...parsed,
      contactInfo: parsed.contactInfo || defaultEmail,
    };
  } catch {
    return defaults;
  }
}

export function ReimbursementForm({
  accessStatus,
  onAccessVerified,
  onSubmitted,
}: ReimbursementFormProps) {
  const [initial] = useState<DraftFields>(() => loadSavedDraft(accessStatus.email || ''));
  const [fullName, setFullName] = useState(initial.fullName);
  const [contactInfo, setContactInfo] = useState(initial.contactInfo);
  const [ministry, setMinistry] = useState<string>(initial.ministry);
  const [customMinistry, setCustomMinistry] = useState(initial.customMinistry);
  const [expenseDate, setExpenseDate] = useState(initial.expenseDate);
  const [amountDollars, setAmountDollars] = useState(initial.amountDollars);
  const [description, setDescription] = useState(initial.description);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>(initial.payoutMethod);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [companyWebsite, setCompanyWebsite] = useState(''); // Anti-bot honeypot

  // Parish Access PIN state (when gateMode === 'pin_and_login' and not yet verified)
  const [parishPin, setParishPin] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    referenceCode: string;
    compressionNote: string | null;
  } | null>(null);

  // Persist typed form draft across mobile camera/file picker focus transitions
  useEffect(() => {
    try {
      const snapshot: DraftFields = {
        fullName,
        contactInfo,
        ministry,
        customMinistry,
        expenseDate,
        amountDollars,
        description,
        payoutMethod,
      };
      sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage quota issues
    }
  }, [
    fullName,
    contactInfo,
    ministry,
    customMinistry,
    expenseDate,
    amountDollars,
    description,
    payoutMethod,
  ]);

  const handleUnlockPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parishPin.trim()) return;
    setVerifyingPin(true);
    setError(null);
    try {
      await verifyReimbursementParishPin(parishPin.trim());
      setParishPin('');
      onAccessVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid Parish Submission PIN.');
    } finally {
      setVerifyingPin(false);
    }
  };

  if (accessStatus.isBlocked) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-xs text-rose-950">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
        <div>
          <p className="font-bold">Reimbursement Submissions Disabled for This Account</p>
          <p className="mt-1 leading-relaxed">
            Your account ({accessStatus.email}) has been blocked by a Parish Trustee. Please contact
            the Parish Office or a Trustee if you believe this is an error.
          </p>
        </div>
      </div>
    );
  }

  if (!accessStatus.canSubmit) {
    return (
      <div className="space-y-4 rounded-2xl border border-parish-border bg-white p-5 shadow-2xs">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-parish-navy/10 p-2.5 text-parish-navy">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-parish-ink">
              Parish Anti-Spam Verification Required
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-parish-muted">
              {accessStatus.gateMode === 'allowlist_only'
                ? `Only Trustee-approved ministry leads & parishioners can upload receipts. Ask a Parish Trustee to approve "${accessStatus.email}" under Admin → Reimbursements.`
                : accessStatus.hasPinConfigured
                  ? 'Enter the Parish Submission PIN provided by the Vicar or Trustees once to unlock receipt uploads on this account.'
                  : `Ask a Parish Trustee to set a Parish Submission PIN (or approve "${accessStatus.email}") under Admin → Reimbursements before uploading receipts.`}
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
            {error}
          </div>
        )}

        {accessStatus.gateMode === 'pin_and_login' && accessStatus.hasPinConfigured && (
          <form onSubmit={handleUnlockPin} className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <KeyRound className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-parish-muted" />
              <input
                type="password"
                required
                value={parishPin}
                onChange={(e) => setParishPin(e.target.value)}
                placeholder="Enter Parish Submission PIN..."
                className="w-full rounded-xl border border-parish-border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={verifyingPin || !parishPin.trim()}
              className="rounded-xl bg-parish-navy px-4 py-2 text-xs font-semibold text-white hover:bg-parish-navy-dark disabled:opacity-50"
            >
              {verifyingPin ? 'Verifying...' : 'Unlock Receipt Uploads'}
            </button>
          </form>
        )}
      </div>
    );
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      setReceiptFile(null);
      return;
    }
    const mime = resolveReceiptMimeType(file);
    if (mime !== 'application/pdf' && !mime.startsWith('image/')) {
      setError('Unsupported file format. Please choose a photo (JPG, PNG, WEBP, HEIC) or PDF.');
      e.target.value = '';
      return;
    }
    if (mime === 'application/pdf' && file.size > MAX_RECEIPT_BYTES) {
      setError('PDF exceeds 5 MB limit. Please upload a smaller file.');
      e.target.value = '';
      return;
    }
    setReceiptFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiptFile) {
      setError('Please attach a receipt image or PDF before submitting.');
      return;
    }
    if (accessStatus.remainingToday <= 0) {
      setError(
        `Daily anti-spam limit reached (${accessStatus.maxPer24h} submissions per 24 hours). Please try again tomorrow.`
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessInfo(null);

    try {
      const resolvedMinistry =
        ministry === 'Other' && customMinistry.trim() ? customMinistry.trim() : ministry;

      const result = await submitReimbursementRequest({
        fullName,
        contactInfo,
        ministry: resolvedMinistry,
        expenseDate,
        amountDollars,
        description,
        payoutMethod,
        receiptFile,
        companyWebsite,
      });

      setSuccessInfo({
        referenceCode: result.claim.reference_code,
        compressionNote: result.compressionNote,
      });
      onSubmitted(result.claim);
      onAccessVerified();

      setAmountDollars('');
      setDescription('');
      setReceiptFile(null);
      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }
      const fileInput = document.getElementById('reimbursement-receipt-input') as HTMLInputElement | null;
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit reimbursement request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-parish-border bg-white p-5 shadow-2xs"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-parish-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-parish-navy/10 p-2 text-parish-navy">
            <Receipt className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-parish-ink">Submit Bill / Expense Receipt</h3>
            <p className="text-xs text-parish-muted">
              Receipts are stored privately and viewable only by you &amp; Parish Trustees.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-parish-canvas px-2.5 py-1 text-[11px] font-semibold text-parish-navy">
          {accessStatus.remainingToday} of {accessStatus.maxPer24h} left today
        </span>
      </div>

      {/* Invisible anti-bot honeypot field */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={companyWebsite}
        onChange={(e) => setCompanyWebsite(e.target.value)}
        className="hidden"
      />

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-900">
          {error}
        </div>
      )}

      {successInfo && (
        <div className="space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            Submitted! Claim Reference: <span className="font-mono text-sm">{successInfo.referenceCode}</span>
          </div>
          <p>
            Track approval anytime under <strong>My Submissions</strong> whenever signed in.
          </p>
          {successInfo.compressionNote && (
            <p className="text-[11px] text-emerald-800">{successInfo.compressionNote}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-parish-muted">Full Name *</label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
            className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-parish-muted">
            Contact Phone or Email *
          </label>
          <input
            type="text"
            required
            value={contactInfo}
            onChange={(e) => setContactInfo(e.target.value)}
            placeholder="(704) 555-0199 or you@email.com"
            className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold text-parish-muted">
            Ministry / Purpose *
          </label>
          <select
            value={ministry}
            onChange={(e) => setMinistry(e.target.value)}
            className="mt-1 w-full rounded-xl border border-parish-border bg-white px-3 py-2 text-sm"
          >
            {PARISH_MINISTRIES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-parish-muted">Expense Date *</label>
          <input
            type="date"
            required
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-parish-muted">Amount ($) *</label>
          <input
            type="number"
            required
            min="0.01"
            step="0.01"
            value={amountDollars}
            onChange={(e) => setAmountDollars(e.target.value)}
            placeholder="45.80"
            className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {ministry === 'Other' && (
        <div>
          <label className="block text-xs font-semibold text-parish-muted">Specify Purpose *</label>
          <input
            type="text"
            required
            value={customMinistry}
            onChange={(e) => setCustomMinistry(e.target.value)}
            placeholder="e.g., Feast Day Decorations"
            className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-parish-muted">
          Short Description of Items Purchased *
        </label>
        <textarea
          required
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Paper plates, liturgical candles, bottled water for Sunday gathering..."
          className="mt-1 w-full rounded-xl border border-parish-border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-parish-muted">
            Preferred Payout Method *
          </label>
          <select
            value={payoutMethod}
            onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
            className="mt-1 w-full rounded-xl border border-parish-border bg-white px-3 py-2 text-sm"
          >
            {PAYOUT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-parish-muted">
            Receipt Upload (Photo, JPG, PNG, PDF • Max 5 MB) *
          </label>
          <label
            htmlFor="reimbursement-receipt-input"
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-parish-navy/35 bg-parish-canvas px-3 py-2 text-xs font-semibold text-parish-navy hover:bg-slate-100"
          >
            {receiptFile ? (
              <>
                <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-700" />
                <span className="truncate">
                  {receiptFile.name} ({Math.max(1, Math.round(receiptFile.size / 1024))} KB)
                </span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 shrink-0" />
                <span>Choose photo or PDF receipt...</span>
              </>
            )}
          </label>
          <input
            id="reimbursement-receipt-input"
            type="file"
            accept="image/*,application/pdf,.heic,.heif"
            onChange={handleFileChange}
            className="sr-only"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || accessStatus.remainingToday <= 0}
        className="w-full rounded-xl bg-parish-navy px-4 py-2.5 text-sm font-semibold text-white shadow-2xs hover:bg-parish-navy-dark disabled:opacity-50"
      >
        {submitting ? 'Compressing & Uploading Receipt...' : 'Submit Reimbursement Request'}
      </button>
    </form>
  );
}
