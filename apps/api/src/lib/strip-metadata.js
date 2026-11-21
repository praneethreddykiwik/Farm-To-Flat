/**
 * Remove location and camera metadata from a customer's photo before it is stored (review #36,
 * 21 Nov 2026).
 *
 * Complaint and meal photos are taken at someone's door or in their kitchen; a phone's EXIF block can
 * carry the exact GPS position, the time and the device. The app already asks the picker not to
 * include EXIF, but an older app, a third-party camera or a gallery editor can still put it back. This
 * is the server's own guarantee, done without an image library: the pixels are never decoded or
 * re-encoded, only the metadata blocks are cut out.
 *
 *   JPEG — drop APP1 (Exif / XMP), APP13 (IPTC) and COM segments; keep everything else byte for byte.
 *   PNG  — drop eXIf, tEXt, iTXt, zTXt and tIME chunks.
 *   WebP — drop EXIF and XMP chunks, fix the RIFF size and the VP8X flags.
 * Anything it does not recognise, or cannot parse safely, is returned unchanged.
 */

/** @param {Buffer} buf @returns {Buffer} */
export function stripImageMetadata(buf) {
  try {
    if (!Buffer.isBuffer(buf) || buf.length < 12) return buf;
    if (buf[0] === 0xff && buf[1] === 0xd8) return stripJpeg(buf);
    if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
      return stripPng(buf);
    if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
      return stripWebp(buf);
  } catch {
    /* fall through: never lose a photo over metadata */
  }
  return buf;
}

const JPEG_DROP = new Set([0xe1, 0xed, 0xfe]); // APP1 (Exif/XMP), APP13 (IPTC), COM

function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) return buf; // not where a marker should be: leave the file alone
    const marker = buf[i + 1];
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // start of scan: the rest is image data
      return Buffer.concat(out);
    }
    if (
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01 ||
      marker === 0xff
    ) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) return buf;
    if (!JPEG_DROP.has(marker)) out.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return buf;
}

const PNG_DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);

function stripPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('ascii', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) return buf;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') return Buffer.concat(out);
  }
  return buf;
}

function stripWebp(buf) {
  const chunks = [];
  let i = 12;
  let dropped = false;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('ascii', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const end = i + 8 + size + (size % 2);
    if (end > buf.length + 1) return buf;
    if (fourcc === 'EXIF' || fourcc === 'XMP ') dropped = true;
    else chunks.push(Buffer.from(buf.subarray(i, Math.min(end, buf.length))));
    i = end;
  }
  if (!dropped) return buf;
  const vp8x = chunks.find((c) => c.toString('ascii', 0, 4) === 'VP8X');
  if (vp8x) vp8x[8] &= ~(0x08 | 0x04); // clear the EXIF and XMP "present" flags
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(4 + body.length, 4);
  head.write('WEBP', 8, 'ascii');
  return Buffer.concat([head, body]);
}
