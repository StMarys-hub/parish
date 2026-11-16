const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MB

export interface CompressedReceiptResult {
  file: File;
  originalBytes: number;
  finalBytes: number;
  wasCompressed: boolean;
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
 * Validates receipt mime type & size (<= 5 MB), and compresses raster images client-side
 * on an offscreen canvas (max 1600px, targeting readable mobile uploads under ~1 MB).
 */
export async function prepareReceiptUploadFile(file: File): Promise<CompressedReceiptResult> {
  if (!ALLOWED_RECEIPT_TYPES.has(file.type)) {
    throw new Error('Please upload a JPG, PNG, WEBP image or PDF receipt (max 5 MB).');
  }

  const originalBytes = file.size;
  if (file.type === 'application/pdf') {
    if (originalBytes > MAX_RECEIPT_BYTES) {
      throw new Error('PDF receipt exceeds the 5 MB limit. Please upload a smaller PDF.');
    }
    return { file, originalBytes, finalBytes: originalBytes, wasCompressed: false };
  }

  // Skip compression if already tiny (< 220 KB)
  if (originalBytes <= 220 * 1024) {
    return { file, originalBytes, finalBytes: originalBytes, wasCompressed: false };
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
      if (originalBytes > MAX_RECEIPT_BYTES) {
        throw new Error('Image exceeds 5 MB and canvas compression is unavailable.');
      }
      return { file, originalBytes, finalBytes: originalBytes, wasCompressed: false };
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // Output JPEG or WEBP so PNG receipt screenshots compress cleanly too
    const targetMime = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    const ext = targetMime === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'receipt';

    let bestBlob: Blob | null = null;
    for (const quality of [0.82, 0.68, 0.54]) {
      const candidate = await canvasToBlob(canvas, targetMime, quality);
      if (!candidate) continue;
      bestBlob = candidate;
      if (candidate.size <= 1.2 * 1024 * 1024) break;
    }

    if (bestBlob && bestBlob.size < originalBytes && bestBlob.size <= MAX_RECEIPT_BYTES) {
      const compressedFile = new File([bestBlob], `${baseName}.${ext}`, { type: targetMime });
      return {
        file: compressedFile,
        originalBytes,
        finalBytes: compressedFile.size,
        wasCompressed: true,
      };
    }

    if (bestBlob && bestBlob.size <= MAX_RECEIPT_BYTES && originalBytes > MAX_RECEIPT_BYTES) {
      const compressedFile = new File([bestBlob], `${baseName}.${ext}`, { type: targetMime });
      return {
        file: compressedFile,
        originalBytes,
        finalBytes: compressedFile.size,
        wasCompressed: true,
      };
    }
  } catch {
    if (originalBytes > MAX_RECEIPT_BYTES) {
      throw new Error('Image exceeds 5 MB and could not be compressed automatically.');
    }
  }

  if (originalBytes > MAX_RECEIPT_BYTES) {
    throw new Error('Receipt file exceeds the 5 MB limit.');
  }
  return { file, originalBytes, finalBytes: originalBytes, wasCompressed: false };
}
