/**
 * Download an authenticated file from the API and hand it to the OS share sheet.
 *
 * The spreadsheet has to arrive as a FILE, not as text: a purchase list pasted into WhatsApp is an
 * unreadable wall of commas, and nobody standing in a market can work from that. The bytes are
 * fetched with the staff member's own token (the export endpoints are not public), written into the
 * app's cache, and shared from there — so it lands in WhatsApp, Drive or Files as a real .xlsx that
 * opens in Excel.
 *
 * Uses the SDK 54+ File/Paths API (`FileSystem.downloadAsync` was removed).
 *
 * expo-file-system and expo-sharing are NATIVE modules, and they are loaded LAZILY on purpose. An
 * over-the-air update reaches phones running the binary they were built before, where these modules
 * do not exist — a top-level import would throw as the screen mounted and take the whole staff app
 * down. Required inside the call instead, so those installs simply get told to update the app.
 */
let native = null;
function loadNative() {
  if (native) return native;
  native = { fs: require('expo-file-system'), sharing: require('expo-sharing') };
  return native;
}

/** Whether this build can write and share a file at all. False on an older binary. */
export function canShareFiles() {
  try {
    const { fs, sharing } = loadNative();
    return !!(fs?.File && fs?.Paths && sharing?.shareAsync);
  } catch {
    return false;
  }
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

/**
 * @param {{ url: string, filename: string, token?: string|null, mime?: string, uti?: string, dialogTitle?: string }} opts
 * @returns {Promise<{ shared: boolean, reason?: string }>}
 */
export async function downloadAndShare({
  url,
  filename,
  token,
  mime = XLSX_MIME,
  uti = XLSX_UTI,
  dialogTitle,
}) {
  if (!canShareFiles()) {
    return {
      shared: false,
      reason: 'Update the app from the link you were sent to download the spreadsheet.',
    };
  }
  const { fs, sharing: Sharing } = loadNative();
  const { Directory, File, Paths } = fs;

  // Its own folder in the cache, so a stale file from a previous export can never be shared by
  // mistake and cleanup is a single delete.
  const dir = new Directory(Paths.cache, 'exports');
  try {
    if (!dir.exists) dir.create({ intermediates: true });
  } catch {
    return { shared: false, reason: 'No writable storage on this device.' };
  }

  let file;
  try {
    file = await File.downloadFileAsync(url, new File(dir, filename), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      idempotent: true, // re-exporting the same day must overwrite, not throw
    });
  } catch (e) {
    // A 401 here means the session expired mid-download — say that, rather than "download failed".
    const msg = String(e?.message || '');
    throw new Error(
      /401|unauthor/i.test(msg)
        ? 'Your session expired. Sign in again to download the list.'
        : 'Could not download the list. Check your connection and try again.',
    );
  }

  if (!(await Sharing.isAvailableAsync())) {
    return { shared: false, reason: 'Sharing is not available on this device.' };
  }
  try {
    await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: uti, dialogTitle });
    return { shared: true };
  } finally {
    // The share sheet reads the file while it is open, so clean up afterwards rather than
    // immediately — otherwise the cache grows by one workbook per export.
    setTimeout(() => {
      try {
        file.delete();
      } catch {
        /* already gone, or the OS cleaned the cache — nothing to do */
      }
    }, 60000);
  }
}
