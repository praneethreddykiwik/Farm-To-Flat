import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { clientIp } from '../src/lib/edge.js';

/**
 * Every place that counts or records a client address must go through clientIp.
 *
 * `req.ip` behind Cloudflare is an edge datacentre address. Three call sites read it directly
 * before this: the planner limiter, the vision limiter, and the admin sign-in audit entry. The
 * first two would have become GLOBAL caps — fifteen vegetable photographs per five minutes for
 * the entire customer base, with whoever asked first spending the budget — and the third would
 * have recorded every sign-in as arriving from the same place, which is most of the value of
 * recording it at all.
 *
 * Failure mode worth naming: none of that throws. The limiters keep returning 429 and the audit
 * trail keeps filling with plausible addresses.
 */
const SECRET = 'secret-used-only-by-this-file';
const before = process.env.ORIGIN_SHARED_SECRET;
beforeEach(() => {
  process.env.ORIGIN_SHARED_SECRET = SECRET;
});
afterEach(() => {
  if (before === undefined) delete process.env.ORIGIN_SHARED_SECRET;
  else process.env.ORIGIN_SHARED_SECRET = before;
});

/** Two customers behind one Cloudflare edge node, as the origin sees them. */
function asTwoCustomersBehindOneEdge() {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/x', (req, res) => res.json({ bucket: clientIp(req) }));
  const hit = (realClient) =>
    request(app).get('/x').set('x-origin-secret', SECRET).set('cf-connecting-ip', realClient);
  return hit;
}

describe('the address every limiter counts', () => {
  it('separates two customers arriving through the same edge node', async () => {
    const hit = asTwoCustomersBehindOneEdge();
    const a = await hit('49.37.1.1');
    const b = await hit('49.37.2.2');
    expect(a.body.bucket).toBe('49.37.1.1');
    expect(b.body.bucket).toBe('49.37.2.2');
    expect(a.body.bucket).not.toBe(b.body.bucket);
  });

  it('no source file counts or records an address off req.ip directly', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const offenders = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name.endsWith('.js')) {
          // edge.js is where the fallback legitimately lives; rate-limit.js only names it in prose.
          if (full.endsWith('lib/edge.js')) continue;
          for (const [i, line] of readFileSync(full, 'utf8').split('\n').entries()) {
            if (line.trim().startsWith('*') || line.trim().startsWith('//')) continue;
            if (/\breq\.ip\b|\breq\.socket\?\.remoteAddress\b/.test(line)) {
              offenders.push(`${full}:${i + 1}`);
            }
          }
        }
      }
    };
    walk(new URL('../src', import.meta.url).pathname);
    expect(offenders).toEqual([]);
  });
});
