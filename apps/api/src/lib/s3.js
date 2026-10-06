/**
 * S3, spoken directly over its REST API.
 *
 * No SDK: `npm install` cannot run on this machine (the npm cache holds root-owned files and the
 * fix needs sudo), and the three things the platform actually asks of object storage — put an
 * object, get an object, list a prefix — are a few lines each once requests are signed. The AWS
 * SDK is 10 MB to do that. If it is ever wanted, this file is the only thing it replaces.
 *
 * SigV4 is implemented here rather than trusted blindly: the signing steps are checked against the
 * test vectors AWS publishes for them (see test/s3-signing.test.js), so this is verified the only
 * way it can be without an account.
 */
import crypto from 'node:crypto';

const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** Everything in a path segment must be encoded except the unreserved set — and S3 keeps "/". */
export const uriEncode = (str, keepSlash = false) =>
  String(str)
    .replace(
      /[^A-Za-z0-9\-._~/]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .replace(keepSlash ? /\0/g : /\//g, '%2F');

/**
 * Sign a request the way AWS Signature Version 4 requires.
 *
 * Exported so the test can drive it with AWS's own published vectors; nothing else should call it.
 * @returns {{ headers: Record<string,string> }}
 */
export function signV4({
  method,
  host,
  path,
  query = '',
  payload = '',
  region,
  service = 's3',
  accessKeyId,
  secretAccessKey,
  sessionToken,
  now = new Date(),
  contentType,
  // Any further headers that must be covered by the signature (Range, metadata, ACLs).
  extraHeaders = {},
}) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash =
    typeof payload === 'string' && payload === 'UNSIGNED-PAYLOAD'
      ? 'UNSIGNED-PAYLOAD'
      : sha256hex(payload);

  const headers = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...(sessionToken ? { 'x-amz-security-token': sessionToken } : {}),
    ...(contentType ? { 'content-type': contentType } : {}),
    ...Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k.toLowerCase(), v])),
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((k) => `${k}:${String(headers[k]).trim()}\n`)
    .join('');

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join(
    '\n',
  );

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n');

  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  return {
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    canonicalRequest,
    stringToSign,
    signature,
  };
}

const cfg = () => ({
  bucket: process.env.S3_BUCKET,
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  // Set for S3-compatible providers; otherwise AWS's own host is derived from bucket + region.
  endpoint: process.env.S3_ENDPOINT,
});

export const s3Enabled = () => {
  const c = cfg();
  return !!(c.bucket && c.accessKeyId && c.secretAccessKey);
};

function target(key) {
  const c = cfg();
  const host = c.endpoint ? new URL(c.endpoint).host : `${c.bucket}.s3.${c.region}.amazonaws.com`;
  // Path-style for a custom endpoint (most S3-compatible services), virtual-host for AWS.
  const path = c.endpoint ? `/${c.bucket}/${uriEncode(key, true)}` : `/${uriEncode(key, true)}`;
  return { host, path, url: `https://${host}${path}`, ...c };
}

/** @returns {Promise<{ buffer: Buffer, contentType: string } | null>} */
export async function s3Get(key) {
  if (!s3Enabled()) return null;
  const t = target(key);
  const { headers } = signV4({ method: 'GET', host: t.host, path: t.path, ...t });
  const res = await fetch(t.url, { headers });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`[s3] GET ${key} -> ${res.status}`);
    return null;
  }
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type') || 'application/octet-stream',
  };
}

/** @returns {Promise<string>} the key it was stored under */
export async function s3Put(key, buffer, contentType) {
  if (!s3Enabled()) throw new Error('S3 is not configured');
  const t = target(key);
  const { headers } = signV4({
    method: 'PUT',
    host: t.host,
    path: t.path,
    payload: buffer,
    contentType,
    ...t,
  });
  const res = await fetch(t.url, { method: 'PUT', headers, body: buffer });
  if (!res.ok) throw new Error(`[s3] PUT ${key} -> ${res.status} ${await res.text()}`);
  return key;
}
