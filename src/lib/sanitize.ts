import DOMPurify from 'dompurify';

const ALLOWED_WEB_PROTOCOLS = new Set(['https:', 'mailto:']);
const ALLOWED_CONTACT_PROTOCOLS = new Set(['https:', 'mailto:', 'tel:']);

function getPurifier() {
  if (DOMPurify.isSupported) return DOMPurify;
  if (typeof window !== 'undefined') {
    const instance = DOMPurify(window as unknown as Window & typeof globalThis);
    if (instance.isSupported) return instance;
  }
  return null;
}

/**
 * Strips all HTML tags/scripts and returns clean plain text (without double-encoding & as &amp;).
 */
export function sanitizePlainText(input: string): string {
  if (!input) return '';
  const purifier = getPurifier();
  let stripped: string;

  if (purifier) {
    const fragment = purifier.sanitize(input, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      RETURN_DOM_FRAGMENT: true,
    });
    stripped = fragment.textContent ?? '';
  } else {
    stripped = input
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '');
  }

  return stripped.replace(/\u0000/g, '').trim();
}

/**
 * Repairs common PDF/WhatsApp copy-paste corruptions such as "https: //docs.google.com".
 */
export function normalizePastedUrl(raw: string): string {
  return raw
    .trim()
    .replace(/^(https?):\s+\/\//i, '$1://')
    .replace(/\s+/g, '');
}

/**
 * Strictly validates external URLs against an explicit protocol allow-list.
 * Rejects javascript:, data:, vbscript:, file:, and unencrypted http: links.
 */
export function sanitizeActionUrl(rawUrl: string, allowTel = false): string | null {
  if (!rawUrl) return null;
  const cleaned = normalizePastedUrl(rawUrl);
  try {
    const parsed = new URL(cleaned);
    const allowed = allowTel ? ALLOWED_CONTACT_PROTOCOLS : ALLOWED_WEB_PROTOCOLS;
    if (!allowed.has(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Produces a safe storage object filename for flyer uploads.
 */
export function sanitizeStorageFileName(fileName: string): string {
  const clean = fileName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || 'flyer.pdf';
}
