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
let native;
function loadNative() {
  if (native !== undefined) return native;
  // Each module separately, and each probe separately. Requiring expo-sharing on a binary without
  // it throws "Cannot find native module 'ExpoSharing'", and so does merely READING a property of
  // expo-file-system's Paths — these objects throw from getters, not only from calls, so every
  // touch has to be guarded or the throw escapes as an uncaught error.
  const probe = (fn) => {
    try {
      return fn();
    } catch {
      return null;
    }
  };
  const fs = probe(() => require('expo-file-system'));
  const sharing = probe(() => require('expo-sharing'));
  const ok =
    !!probe(() => fs?.File) &&
    !!probe(() => fs?.Paths?.cache) &&
    !!probe(() => sharing?.shareAsync);
  native = ok ? { fs, sharing } : null;
  return native;
}

/** Whether this build can write and share a file at all. False on an older binary. */
export function canShareFiles() {
  return !!loadNative();
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

/**
 * @param {{ url: string, filename: string, token?: string|null, mime?: string, uti?: string, dialogTitle?: string }} opts
 * @returns {Promise<{ shared: boolean, reason?: string }>}
 */
export async function downloadAndShare(opts) {
  // Nothing in here may throw past this point. A staff screen losing its whole round to a red error
  // because a file could not be saved is a far worse outcome than being told the download failed.
  try {
    return await run(opts);
  } catch (e) {
    return { shared: false, reason: e?.message || 'Could not download the list.' };
  }
}

/** @param {{ url: string, filename: string, token?: string|null, mime?: string, uti?: string, dialogTitle?: string }} opts */
async function run({ url, filename, token, mime = XLSX_MIME, uti = XLSX_UTI, dialogTitle }) {
  const mods = loadNative();
  if (!mods) {
    return {
      shared: false,
      reason: 'Update the app from the link you were sent to download the spreadsheet.',
    };
  }
  const { fs, sharing: Sharing } = mods;
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
