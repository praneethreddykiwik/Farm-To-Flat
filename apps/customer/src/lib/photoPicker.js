/**
 * Take or choose a photograph, as base64 ready to hand to the API.
 *
 * expo-image-picker is a NATIVE module and is loaded LAZILY on purpose: an over-the-air update
 * reaches phones running the binary it was built before, where the module does not exist, and a
 * top-level import would throw as the screen mounted. Required inside the call instead, so an older
 * install is simply told to update rather than crashing.
 *
 * Images come back downscaled and re-compressed. A modern phone camera produces 4–8 MB files, which
 * is slow on a flat's wifi and far more resolution than anyone needs to see that a tomato is
 * bruised — and the API refuses anything over 6 MB anyway.
 */
let native = null;
function picker() {
  if (native) return native;
  native = require('expo-image-picker');
  return native;
}

/** Whether this build can take a photo at all. False on a binary built before this feature. */
export function canTakePhotos() {
  try {
    const p = picker();
    return !!(p?.launchCameraAsync && p?.launchImageLibraryAsync);
  } catch {
    return false;
  }
}

const OPTS = {
  quality: 0.55,
  base64: true,
  exif: false, // a complaint photo does not need to carry the customer's GPS coordinates
  allowsMultipleSelection: false,
};

/**
 * @param {'camera'|'library'} source
 * @returns {Promise<{ contentType: string, dataBase64: string, uri: string } | null>} null if cancelled
 */
export async function pickPhoto(source = 'camera') {
  const p = picker();
  if (source === 'camera') {
    const perm = await p.requestCameraPermissionsAsync();
    if (!perm.granted) {
      const e = /** @type {Error & { code?: string }} */ (
        new Error('Allow camera access to send a photo, or choose one from your gallery.')
      );
      e.code = 'PERMISSION';
      throw e;
    }
  }
  const res =
    source === 'camera'
      ? await p.launchCameraAsync(OPTS)
      : await p.launchImageLibraryAsync({ ...OPTS, mediaTypes: ['images'] });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  if (!a.base64) throw new Error('Could not read that photo. Try another one.');
  // The picker reports the real type; default to JPEG, which is what the camera gives us.
  const contentType = a.mimeType && a.mimeType.startsWith('image/') ? a.mimeType : 'image/jpeg';
  return { contentType, dataBase64: a.base64, uri: a.uri };
}
