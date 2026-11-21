/**
 * Tests only: give supertest's throwaway servers ports OUTSIDE the system's ephemeral range.
 *
 * WHY (found 21 Nov 2026): the suite failed 1–3 RANDOM tests on most full runs — a sign-in that
 * returned no token, an address that was never created — and every one passed when re-run alone.
 * Logging the responses showed the culprit: `POST /auth/otp/verify` answered `404 {}`, a body this
 * API never sends. The request had reached a DIFFERENT program.
 *
 * supertest starts a server per request with `listen(0)`: a wildcard bind on a port the kernel picks
 * from the ephemeral range (49152–65535 on macOS). Desktop apps and local tools keep listeners on
 * 127.0.0.1 / ::1 in that same range, a wildcard bind can be handed one of those port numbers, and
 * supertest then connects to 127.0.0.1:<port> — where the more specific listener, the other
 * program, takes the request.
 *
 * Binding to 127.0.0.1 explicitly would fix it but makes `listen` asynchronous, and supertest reads
 * the port immediately. So instead each test process walks its own sequence of ports in 20000–39999,
 * a range nothing allocates automatically; the bind stays synchronous and cannot land on a port
 * another program was handed by the kernel.
 */
import http from 'node:http';
import { execSync } from 'node:child_process';

const LOW = 20000;
const SPAN = 20000;
let next = LOW + Math.floor(Math.random() * SPAN);

// Ports other programs are already listening on (a local proxy can sit in this range too — a 407
// "proxy authentication required" from one was the last random failure). Read once per test file;
// if the tool is missing (some CI images), there is simply nothing to skip.
const taken = new Set();
for (const cmd of ['lsof -nP -iTCP -sTCP:LISTEN', 'ss -ltnH']) {
  try {
    const out = execSync(cmd, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    for (const m of out.matchAll(/:(\d+)(?:\s+\(LISTEN\)|\s)/g)) taken.add(Number(m[1]));
    if (taken.size) break;
  } catch {
    /* tool missing: try the next one, or skip nothing */
  }
}

// macOS only. Linux (CI) never hands a wildcard bind a port another socket already holds on
// 127.0.0.1, so there the kernel's own choice is the safe one — and a fixed sequence there collided
// with ports still in use (EADDRINUSE on CI, 21 Nov 2026).
const listen = http.Server.prototype.listen;
if (process.platform === 'darwin')
  http.Server.prototype.listen = function patchedListen(...args) {
    if (args[0] === 0 && (args.length === 1 || typeof args[1] === 'function')) {
      do next = LOW + ((next - LOW + 1) % SPAN);
      while (taken.has(next));
      return listen.call(this, next, ...args.slice(1));
    }
    return listen.apply(this, args);
  };
