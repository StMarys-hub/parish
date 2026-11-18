import { describe, expect, it } from 'vitest';
import { buildReceiptDownloadFilename } from '../receiptDownload';

describe('receiptDownload utilities', () => {
  it('includes owner name and reference code so same-date, same-amount receipts never overwrite', () => {
    const linetFile = buildReceiptDownloadFilename({
      full_name: 'Linet Jose',
      reference_code: 'CLM-2TRJAB',
      expense_date: '2026-11-16',
      ministry: 'CML',
      amount_cents: 2500,
      receipt_mime_type: 'application/pdf',
      receipt_file_name: 'scan001.pdf',
    });

    const jimmyFile = buildReceiptDownloadFilename({
      full_name: 'Jimmy',
      reference_code: 'CLM-356FQ6',
      expense_date: '2026-11-16',
      ministry: 'CML',
      amount_cents: 2500,
      receipt_mime_type: 'application/pdf',
      receipt_file_name: 'scan002.pdf',
    });

    expect(linetFile).toBe('Receipt_2026-11-16_Linet_Jose_CML_25.00_CLM-2TRJAB.pdf');
    expect(jimmyFile).toBe('Receipt_2026-11-16_Jimmy_CML_25.00_CLM-356FQ6.pdf');
    expect(linetFile).not.toBe(jimmyFile);

    expect(
      buildReceiptDownloadFilename({
        full_name: 'Mary Thomas',
        reference_code: 'CLM-999AAA',
        expense_date: '2026-11-17',
        ministry: "Marian Women's Forum",
        amount_cents: 1200,
        receipt_mime_type: 'image/png',
        receipt_file_name: 'photo.png',
      })
    ).toBe('Receipt_2026-11-17_Mary_Thomas_Marian_Women_s_Forum_12.00_CLM-999AAA.png');
  });
});
