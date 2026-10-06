/**
 * SigV4, checked against the vector AWS publishes for it.
 *
 * Signing code either matches AWS byte for byte or every request is rejected, and without an
 * account there is no way to find out which from a live call. AWS's documented example
 * ("GET Object" from the Signature Version 4 test suite) pins the canonical request, the string to
 * sign and the final signature, so each step is verified separately — which means a failure says
 * WHICH step drifted, not just that the whole thing is wrong.
 */
import { describe, expect, it } from 'vitest';
import { signV4, uriEncode } from '../src/lib/s3.js';

// From the AWS documentation's worked example for S3 GET Object.
const EXAMPLE = {
  method: 'GET',
  host: 'examplebucket.s3.amazonaws.com',
  path: '/test.txt',
  query: '',
  payload: '',
  region: 'us-east-1',
  service: 's3',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  now: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
  // The published example is a ranged GET; the signature only matches with this header covered.
  extraHeaders: { range: 'bytes=0-9' },
};

describe('S3 request signing', () => {
  const out = signV4(EXAMPLE);

  it('hashes an empty payload the way AWS does', () => {
    expect(out.headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('stamps the date in AWS basic format', () => {
    expect(out.headers['x-amz-date']).toBe('20130524T000000Z');
  });

  it('builds the canonical request AWS documents', () => {
    expect(out.canonicalRequest).toBe(
      [
        'GET',
        '/test.txt',
        '',
        'host:examplebucket.s3.amazonaws.com',
        'range:bytes=0-9',
        'x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        'x-amz-date:20130524T000000Z',
        '',
        'host;range;x-amz-content-sha256;x-amz-date',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      ].join('\n'),
    );
  });

  it('builds the string to sign AWS documents', () => {
    expect(out.stringToSign).toBe(
      [
        'AWS4-HMAC-SHA256',
        '20130524T000000Z',
        '20130524/us-east-1/s3/aws4_request',
        '7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972',
      ].join('\n'),
    );
  });

  it('produces the signature AWS documents', () => {
    expect(out.signature).toBe('f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  });

  it('assembles the Authorization header in the documented shape', () => {
    expect(out.headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
  });

  it('changes the signature when the object key changes', () => {
    const other = signV4({ ...EXAMPLE, path: '/other.txt' });
    expect(other.signature).not.toBe(out.signature);
  });

  it('encodes a key for the URL without eating its slashes', () => {
    expect(uriEncode('ord_1/a b.jpg', true)).toBe('ord_1/a%20b.jpg');
    expect(uriEncode('ord_1/a.jpg')).toBe('ord_1%2Fa.jpg');
  });
});
