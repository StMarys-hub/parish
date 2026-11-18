import { describe, expect, it } from 'vitest';
import { buildReceiptDownloadFilename } from '../receiptDownload';

describe('receiptDownload utilities', () => {
  it('formats descriptive receipt filename cleanly matching Receipt_YYYY-MM-DD_Ministry_Amount.ext', () => {
    expect(
      buildReceiptDownloadFilename({
        expense_date: '2026-11-15',
        ministry: 'CML',
        amount_cents: 4550,
        receipt_mime_type: 'application/pdf',
        receipt_file_name: 'scan001.pdf',
      })
    ).toBe('Receipt_2026-11-15_CML_45.50.pdf');

    expect(
      buildReceiptDownloadFilename({
        expense_date: '2026-11-17',
        ministry: "Marian Women's Forum",
        amount_cents: 1200,
        receipt_mime_type: 'image/png',
        receipt_file_name: 'photo.png',
      })
    ).toBe('Receipt_2026-11-17_Marian_Women_s_Forum_12.00.png');
  });
});
