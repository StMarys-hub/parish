import { ReimbursementClaim } from '../types/parish';

const IDB_NAME = 'parish_admin_prefs_v1';
const IDB_STORE = 'handles';
const RECEIPT_DIR_KEY = 'parish_receipt_dir_handle';

interface FileSystemHandlePermission {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

type DirectoryPickerFn = (options?: {
  id?: string;
  mode?: 'read' | 'readwrite';
}) => Promise<FileSystemDirectoryHandle>;

export function isDirectoryPickerSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: DirectoryPickerFn }).showDirectoryPicker ===
      'function'
  );
}

function getExtensionFromClaim(claim: Pick<ReimbursementClaim, 'receipt_mime_type' | 'receipt_file_name'>): string {
  const mime = (claim.receipt_mime_type ?? '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 'jpg';

  const fileMatch = (claim.receipt_file_name ?? '').toLowerCase().match(/\.([a-z0-9]{2,5})$/);
  return fileMatch ? fileMatch[1] : 'jpg';
}

/**
 * Generates a descriptive receipt filename such as `Receipt_2026-11-15_CML_45.50.pdf`.
 */
export function buildReceiptDownloadFilename(
  claim: Pick<
    ReimbursementClaim,
    'expense_date' | 'ministry' | 'amount_cents' | 'receipt_mime_type' | 'receipt_file_name'
  >
): string {
  const safeDate = (claim.expense_date || new Date().toISOString().slice(0, 10)).replace(
    /[^0-9-]/g,
    ''
  );
  const safeMinistry =
    (claim.ministry || 'Parish')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 24) || 'Parish';
  const amount = (claim.amount_cents / 100).toFixed(2);
  const ext = getExtensionFromClaim(claim);
  return `Receipt_${safeDate}_${safeMinistry}_${amount}.${ext}`;
}

function openPrefsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Unable to open preferences store'));
  });
}

export async function getSavedReceiptDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openPrefsDb();
    return await new Promise<FileSystemDirectoryHandle | null>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(RECEIPT_DIR_KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveReceiptDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openPrefsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      const req = store.put(handle, RECEIPT_DIR_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Best-effort persistence only
  }
}

export async function pickPreferredReceiptDirectory(): Promise<{ folderName: string } | null> {
  if (!isDirectoryPickerSupported()) return null;
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPickerFn }).showDirectoryPicker;
  const handle = await picker({ id: 'parish-receipts', mode: 'readwrite' });
  await saveReceiptDirectoryHandle(handle);
  return { folderName: handle.name };
}

async function ensureReadWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const permHandle = handle as unknown as FileSystemHandlePermission;
  if (typeof permHandle.queryPermission === 'function') {
    const status = await permHandle.queryPermission({ mode: 'readwrite' });
    if (status === 'granted') return true;
  }
  if (typeof permHandle.requestPermission === 'function') {
    const requested = await permHandle.requestPermission({ mode: 'readwrite' });
    return requested === 'granted';
  }
  return true;
}

function triggerBrowserBlobDownload(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  }
}

export interface ReceiptDownloadOutcome {
  mode: 'folder' | 'browser';
  fileName: string;
  folderName?: string;
}

/**
 * Downloads the receipt blob from a short-lived signed URL and saves it directly
 * into the remembered directory handle (when File System Access API is available),
 * falling back cleanly to a browser blob download on Safari/Firefox/Mobile or if dismissed.
 */
export async function downloadReceiptWithRememberedFolder(params: {
  claim: Pick<
    ReimbursementClaim,
    'expense_date' | 'ministry' | 'amount_cents' | 'receipt_mime_type' | 'receipt_file_name'
  >;
  signedUrl: string;
}): Promise<ReceiptDownloadOutcome> {
  const fileName = buildReceiptDownloadFilename(params.claim);
  const res = await fetch(params.signedUrl);
  if (!res.ok) {
    throw new Error('Failed to fetch signed receipt attachment.');
  }
  const blob = await res.blob();

  if (isDirectoryPickerSupported()) {
    try {
      let dirHandle = await getSavedReceiptDirectoryHandle();
      if (!dirHandle) {
        const picker = (window as unknown as { showDirectoryPicker: DirectoryPickerFn })
          .showDirectoryPicker;
        dirHandle = await picker({ id: 'parish-receipts', mode: 'readwrite' });
        await saveReceiptDirectoryHandle(dirHandle);
      }

      const granted = await ensureReadWritePermission(dirHandle);
      if (granted) {
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { mode: 'folder', fileName, folderName: dirHandle.name };
      }
    } catch {
      // User dismissed picker, denied permission, or folder unavailable — fall back cleanly
    }
  }

  triggerBrowserBlobDownload(blob, fileName);
  return { mode: 'browser', fileName };
}
