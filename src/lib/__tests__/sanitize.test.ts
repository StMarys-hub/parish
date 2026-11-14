import { describe, expect, it } from 'vitest';
import {
  normalizePastedUrl,
  sanitizeActionUrl,
  sanitizePlainText,
  sanitizeStorageFileName,
} from '../sanitize';

describe('sanitize utilities', () => {
  it('repairs broken space after https: from PDF copy-paste', () => {
    expect(
      normalizePastedUrl('https: //docs.google.com/forms/d/1mukLEikLdzj8LGTdcj8sMab4l5Gli3mMwEtf_Fq1-v8/edit')
    ).toBe('https://docs.google.com/forms/d/1mukLEikLdzj8LGTdcj8sMab4l5Gli3mMwEtf_Fq1-v8/edit');
  });

  it('allows https and mailto URLs and blocks javascript/data/http URLs', () => {
    expect(sanitizeActionUrl('https://www.jesusyouth.us/event/zion/')).toBe(
      'https://www.jesusyouth.us/event/zion/'
    );
    expect(sanitizeActionUrl('mailto:vicar@stmarysyroclt.org')).toBe(
      'mailto:vicar@stmarysyroclt.org'
    );
    expect(sanitizeActionUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeActionUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(sanitizeActionUrl('http://insecure.example.com')).toBeNull();
  });

  it('strips HTML and script tags from pasted bulletin text without double-encoding ampersands', () => {
    expect(sanitizePlainText('Hello <script>alert("xss")</script><b>Parish</b> & Friends')).toBe(
      'Hello Parish & Friends'
    );
  });

  it('sanitizes flyer storage filenames', () => {
    expect(sanitizeStorageFileName('Pre-Cana 2027 (Final)!.PDF')).toBe('pre-cana-2027-final-.pdf');
  });
});
