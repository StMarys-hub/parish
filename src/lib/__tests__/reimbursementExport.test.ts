import { describe, expect, it } from 'vitest';
import { ReimbursementClaim } from '../../types/parish';
import {
  buildReimbursementsCsv,
  extractClaimMonths,
  summarizeReimbursements,
} from '../reimbursementExport';

const SAMPLE_CLAIMS: ReimbursementClaim[] = [
  {
    id: '1',
    reference_code: 'CLM-AAA111',
    full_name: 'Linet Jose',
    contact_info: 'linet@example.com',
    ministry: 'CML',
    expense_date: '2026-11-16',
    amount_cents: 2500,
    description: 'Altar flowers, candles',
    payout_method: 'Check',
    status: 'paid',
    created_at: '2026-11-16T10:00:00Z',
    updated_at: '2026-11-16T12:00:00Z',
  },
  {
    id: '2',
    reference_code: 'CLM-BBB222',
    full_name: '=SUM(A1:A2)',
    contact_info: 'test@example.com',
    ministry: 'Choir',
    expense_date: '2026-10-20',
    amount_cents: 4050,
    description: 'Sheet music',
    payout_method: 'Zelle',
    status: 'approved',
    created_at: '2026-10-20T10:00:00Z',
    updated_at: '2026-10-20T12:00:00Z',
  },
];

describe('reimbursementExport utilities', () => {
  it('extracts sorted unique months and computes accurate totals by ministry', () => {
    expect(extractClaimMonths(SAMPLE_CLAIMS)).toEqual(['2026-11', '2026-10']);
    const summary = summarizeReimbursements(SAMPLE_CLAIMS);
    expect(summary.totalCount).toBe(2);
    expect(summary.totalCents).toBe(6550);
    expect(summary.paidCents).toBe(2500);
    expect(summary.approvedCents).toBe(4050);
    expect(summary.byMinistry[0]).toEqual({ ministry: 'Choir', count: 1, totalCents: 4050 });
  });

  it('escapes commas and neutralizes CSV formula injection cleanly', () => {
    const csv = buildReimbursementsCsv(SAMPLE_CLAIMS);
    expect(csv).toContain('"Altar flowers, candles"');
    expect(csv).toContain("'=SUM(A1:A2)");
  });
});
