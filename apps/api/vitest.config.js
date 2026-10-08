import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * One file at a time.
     *
     * Every test here drives the real Express app through supertest, which starts an ephemeral
     * server per request, and the app holds its state in module-level memory. Run 52 such files
     * at once and they compete for sockets and for each other's timing: the suite failed roughly
     * two runs in five, with a DIFFERENT test each time — xlsx one run, cash-on-delivery the
     * next, a 407 from nowhere the run after. Nothing was wrong with any of them.
     *
     * That pattern is worse than a broken test. A gate that fails at random teaches you to re-run
     * it until it passes, which is the same as not having one — and this suite is about to be the
     * thing standing between a bad commit and real customers' money.
     *
     * The cost is wall-clock: a few seconds longer. Worth it for a result you can act on.
     */
    fileParallelism: false,
    // A hung request should fail loudly rather than sit until the whole run times out.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
