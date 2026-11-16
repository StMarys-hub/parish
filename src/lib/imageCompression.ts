const DIRECT_PASSTHROUGH_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

export interface CompressedReceiptResult {
  file: File;
  originalBytes: number;
  finalBytes: number;
  wasCompressed: boolean;
}

export function resolveReceiptMimeType(file: File): string {
  const explicit = (file.type || '').toLowerCase().trim();
  if (explicit) return explicit;
  const name = file.name.toLowerCase();
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.webp')) return 'image/webp';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.heic')) return 'image/heic';
  if (name.endsWith('.heif')) return 'image/heif';
  return '';
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to read image file for compression.'));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mimeType, quality));
}

/**
 * Validates receipt mime type & size (<= 5 MB), converts HEIC/HEIF or large raster images
 * client-side on an offscreen canvas (max 1600px) to compact JPG/WEBP, and passes PDFs cleanly.
 */
export async function prepareReceiptUploadFile(file: File): Promise<CompressedReceiptResult> {
  const mimeType = resolveReceiptMimeType(file);
  const isPdf = mimeType === 'application/pdf';
  const isImage = mimeType.startsWith('image/');

  if (!isPdf && !isImage) {
    throw new Error('Please upload a JPG, PNG, WEBP, HEIC image or PDF receipt (max 5 MB).');
  }

  const originalBytes = file.size;
  if (isPdf) {
    if (originalBytes > MAX_RECEIPT_BYTES) {
      throw new Error('PDF receipt exceeds the 5 MB limit. Please upload a smaller PDF.');
    }
    const normalizedPdf =
      file.type === 'application/pdf'
        ? file
        : new File([file], file.name || 'receipt.pdf', { type: 'application/pdf' });
    return {
      file: normalizedPdf,
      originalBytes,
      finalBytes: originalBytes,
      wasCompressed: false,
    };
  }

  const needsFormatConversion = !DIRECT_PASSTHROUGH_IMAGE_TYPES.has(mimeType);

  // Skip canvas pass ONLY if already JPG/PNG/WEBP and tiny (< 220 KB)
  if (!needsFormatConversion && originalBytes <= 220 * 1024) {
    const normalizedFile =
      file.type === mimeType ? file : new File([file], file.name || 'receipt.jpg', { type: mimeType });
    return {
      file: normalizedFile,
      originalBytes,
      finalBytes: originalBytes,
      wasCompressed: false,
    };
  }

  try {
    const img = await loadImageFromFile(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(img.width || 1, img.height || 1));
    const targetW = Math.max(1, Math.round(img.width * scale));
    const targetH = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (needsFormatConversion || originalBytes > MAX_RECEIPT_BYTES) {
        throw new Error('Image could not be converted in this browser. Please upload JPG, PNG, or PDF.');
      }
      return { file, originalBytes, finalBytes: originalBytes, wasCompressed: false };
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const targetMime = mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const ext = targetMime === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';

    let bestBlob: Blob | null = null;
    for (const quality of [0.84, 0.7, 0.56]) {
      const candidate = await canvasToBlob(canvas, targetMime, quality);
      if (!candidate) continue;
      bestBlob = candidate;
      if (candidate.size <= 1.2 * 1024 * 1024) break;
    }

    if (
      bestBlob &&
      bestBlob.size <= MAX_RECEIPT_BYTES &&
      (needsFormatConversion || bestBlob.size < originalBytes || originalBytes > MAX_RECEIPT_BYTES)
    ) {
      const compressedFile = new File([bestBlob], `${baseName}.${ext}`, { type: targetMime });
      return {
        file: compressedFile,
        originalBytes,
        finalBytes: compressedFile.size,
        wasCompressed: compressedFile.size < originalBytes,
      };
    }
  } catch (err) {
    if (needsFormatConversion) {
      throw new Error(
        'This photo format (e.g. HEIC) could not be converted in this browser. Try JPG, PNG, or PDF.'
      );
    }
    if (originalBytes > MAX_RECEIPT_BYTES) {
      throw err instanceof Error
        ? err
        : new Error('Image exceeds 5 MB and could not be compressed automatically.');
    }
  }

  if (needsFormatConversion) {
    throw new Error('Unsupported image format. Please upload JPG, PNG, WEBP, or PDF.');
  }
  if (originalBytes > MAX_RECEIPT_BYTES) {
    throw new Error('Receipt file exceeds the 5 MB limit.');
  }
  const safeFile =
    file.type === mimeType ? file : new File([file], file.name || 'receipt.jpg', { type: mimeType });
  return { file: safeFile, originalBytes, finalBytes: originalBytes, wasCompressed: false };
}
