/**
 * The admin audit trail: who did what, to which order, and when.
 *
 * Deliberately NOT built on `persist.*`. Those writes are fire-and-forget — they catch their own
 * errors and return, which is right for a cache of state we already hold in memory and wrong here.
 * An audit row that silently fails to write is worse than having no audit at all, because everyone
 * then believes there is a record. So this awaits the write, and a caller that cannot record an
 * action must not perform it.
 *
 * Append-only. Nothing in the codebase updates or deletes a row; a correction is a new row.
 */
import { prisma } from '../db.js';
import { isPersistenceEnabled } from '../persistence.js';
import { id } from './ids.js';

/** In-memory fallback for dev and tests, where there is no database. Never used in production. */
const memory = [];
export const _memoryTrail = memory;

/**
 * Record one action. Throws if it cannot be recorded.
 *
 * @param {{ staff: { email?: string, role?: string, viaGoogle?: boolean } | undefined,
 *           action: string, target?: string|null, details?: any }} input
 */
export async function recordAction({ staff, action, target = null, details = {} }) {
  const row = {
    id: id('aud', 10),
    at: new Date(),
    // The shared ADMIN_TOKEN names nobody. Recording that fact is the point: it is the case where
    // the question "who did this" has no answer, and the log should say so rather than look complete.
    actor: staff?.email || 'shared-token',
    role: staff?.role || 'UNKNOWN',
    via: staff?.viaGoogle ? 'google' : 'shared-token',
    action,
    target,
    details,
  };
  if (!isPersistenceEnabled()) {
    memory.push(row);
    return row;
  }
  await prisma.adminAction.create({ data: row });
  return row;
}

/**
 * Read the trail, newest first.
 * @param {{ limit?: number, target?: string }} [opts]
 */
export async function listActions({ limit = 100, target } = {}) {
  if (!isPersistenceEnabled())
    return memory
      .filter((r) => !target || r.target === target)
      .slice(-limit)
      .reverse();
  return prisma.adminAction.findMany({
    where: target ? { target } : undefined,
    orderBy: { at: 'desc' },
    take: Math.min(limit, 500),
  });
}
