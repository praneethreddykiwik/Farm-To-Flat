/** Review #36 (21 Nov 2026): GPS / camera metadata is cut out of customer photos before storage. */
import { describe, expect, it } from 'vitest';
import zlib from 'node:zlib';

const { stripImageMetadata } = await import('../src/lib/strip-metadata.js');

const seg = (marker, payload) => {
  const len = Buffer.alloc(2);
  len.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), len, payload]);
};

describe('JPEG', () => {
  it('drops the Exif (GPS) segment and keeps image data byte for byte', () => {
    const exif = seg(0xe1, Buffer.from('Exif\0\0GPSLatitude=17.4401;GPSLongitude=78.3489'));
    const jfif = seg(0xe0, Buffer.from('JFIF\0\x01\x01'));
    const dqt = seg(0xdb, Buffer.alloc(67, 1));
    const scan = Buffer.concat([
      Buffer.from([0xff, 0xda]),
      Buffer.from([0, 8, 1, 2, 3, 4, 5, 6]),
      Buffer.alloc(40, 7),
      Buffer.from([0xff, 0xd9]),
    ]);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, exif, dqt, scan]);
    const out = stripImageMetadata(jpg);
    expect(out.includes(Buffer.from('GPSLatitude'))).toBe(false);
    expect(out.includes(jfif)).toBe(true);
    expect(out.includes(dqt)).toBe(true);
    expect(out.subarray(out.length - scan.length).equals(scan)).toBe(true);
    expect(out.length).toBe(jpg.length - exif.length);
  });

  it('leaves a file it cannot parse untouched', () => {
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8, 0x00, 0x11]), Buffer.alloc(20)]);
    expect(stripImageMetadata(broken).equals(broken)).toBe(true);
  });
});

describe('PNG', () => {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(Buffer.concat([Buffer.from(type), data])) : 0);
    return Buffer.concat([len, Buffer.from(type), data, crc]);
  };
  it('drops eXIf and text chunks, keeps IHDR/IDAT/IEND', () => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = chunk('IHDR', Buffer.alloc(13, 1));
    const exif = chunk('eXIf', Buffer.from('GPS 17.44,78.34'));
    const text = chunk('tEXt', Buffer.from('Comment\0taken at home'));
    const idat = chunk('IDAT', Buffer.alloc(30, 9));
    const iend = chunk('IEND', Buffer.alloc(0));
    const out = stripImageMetadata(Buffer.concat([sig, ihdr, exif, text, idat, iend]));
    expect(out.equals(Buffer.concat([sig, ihdr, idat, iend]))).toBe(true);
  });
});

describe('WebP', () => {
  const ch = (fourcc, data) => {
    const size = Buffer.alloc(4);
    size.writeUInt32LE(data.length);
    return Buffer.concat([
      Buffer.from(fourcc, 'ascii'),
      size,
      data,
      data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0),
    ]);
  };
  it('drops EXIF/XMP, clears the VP8X flags and fixes the RIFF size', () => {
    const vp8xData = Buffer.alloc(10);
    vp8xData[0] = 0x08 | 0x04; // EXIF + XMP present
    const body = Buffer.concat([
      ch('VP8X', vp8xData),
      ch('VP8 ', Buffer.alloc(20, 3)),
      ch('EXIF', Buffer.from('GPS here!')),
      ch('XMP ', Buffer.from('<x/>')),
    ]);
    const head = Buffer.alloc(12);
    head.write('RIFF', 0, 'ascii');
    head.writeUInt32LE(4 + body.length, 4);
    head.write('WEBP', 8, 'ascii');
    const out = stripImageMetadata(Buffer.concat([head, body]));
    expect(out.includes(Buffer.from('GPS here'))).toBe(false);
    expect(out.readUInt32LE(4)).toBe(out.length - 8);
    expect(out[12 + 8] & 0x0c).toBe(0);
    expect(out.includes(Buffer.alloc(20, 3))).toBe(true);
  });
});
