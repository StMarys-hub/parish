import { ReimbursementClaim } from '../types/parish';

export interface MinistrySummaryRow {
  ministry: string;
  count: number;
  totalCents: number;
}

export interface ReimbursementSummary {
  totalCount: number;
  totalCents: number;
  paidCents: number;
  approvedCents: number;
  pendingCents: number;
  byMinistry: MinistrySummaryRow[];
}

export function extractClaimMonths(claims: readonly ReimbursementClaim[]): string[] {
  const months = new Set<string>();
  for (const c of claims) {
    const m = (c.expense_date || c.created_at || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) months.add(m);
  }
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function formatMonthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  if (!y || !m) return yyyyMm;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function summarizeReimbursements(
  claims: readonly ReimbursementClaim[]
): ReimbursementSummary {
  const ministryMap = new Map<string, MinistrySummaryRow>();
  let totalCents = 0;
  let paidCents = 0;
  let approvedCents = 0;
  let pendingCents = 0;

  for (const c of claims) {
    const cents = Number(c.amount_cents) || 0;
    totalCents += cents;
    if (c.status === 'paid') paidCents += cents;
    else if (c.status === 'approved') approvedCents += cents;
    else if (c.status === 'pending_review') pendingCents += cents;

    const key = c.ministry || 'Other';
    const existing = ministryMap.get(key) ?? { ministry: key, count: 0, totalCents: 0 };
    existing.count += 1;
    existing.totalCents += cents;
    ministryMap.set(key, existing);
  }

  const byMinistry = Array.from(ministryMap.values()).sort(
    (a, b) => b.totalCents - a.totalCents
  );

  return {
    totalCount: claims.length,
    totalCents,
    paidCents,
    approvedCents,
    pendingCents,
    byMinistry,
  };
}

function escapeCsvCell(raw: string | number | null | undefined): string {
  let str = String(raw ?? '').replace(/\r?\n/g, ' ');
  // Neutralize spreadsheet formula injection (=, +, -, @)
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildReimbursementsCsv(claims: readonly ReimbursementClaim[]): string {
  const headers = [
    'Reference Code',
    'Expense Date',
    'Submitter Name',
    'Contact / Email',
    'Ministry',
    'Amount (USD)',
    'Payout Method',
    'Status',
    'Description',
    'Trustee Notes',
    'Reviewed By',
    'Paid At',
  ];

  const rows = claims.map((c) => [
    c.reference_code,
    c.expense_date,
    c.full_name,
    c.contact_info ?? '',
    c.ministry,
    (c.amount_cents / 100).toFixed(2),
    c.payout_method,
    c.status,
    c.description,
    c.trustee_notes ?? '',
    c.reviewed_by_name ?? '',
    c.paid_at ? c.paid_at.slice(0, 10) : '',
  ]);

  return [headers, ...rows]
    .map((line) => line.map(escapeCsvCell).join(','))
    .join('\r\n');
}

export function downloadReimbursementsCsv(
  claims: readonly ReimbursementClaim[],
  periodTag: string
): string {
  const csv = buildReimbursementsCsv(claims);
  const safeTag = periodTag.replace(/[^A-Za-z0-9_-]+/g, '_') || 'all';
  const fileName = `Parish_Reimbursements_${safeTag}.csv`;
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  return fileName;
}
