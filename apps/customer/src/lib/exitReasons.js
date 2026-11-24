/**
 * "Before you go" — the reasons offered when a customer starts deleting their account. The keys
 * match apps/api/src/lib/exit-reasons.js. `help`: a way to fix that problem without leaving, shown
 * once beside the answer. It never replaces or delays "Continue".
 */
export const EXIT_REASONS = [
  { key: 'QUALITY', help: 'Support' },
  { key: 'DELIVERY', help: 'Support' },
  { key: 'PRICE' },
  { key: 'RANGE', help: 'Support' },
  { key: 'APP', help: 'Support' },
  { key: 'NOTIFICATIONS', help: 'Notify' },
  { key: 'MOVED', help: 'Moved' },
  { key: 'PRIVACY', help: 'Privacy' },
  { key: 'OTHER' },
];

export const EXIT_NOTE_MAX = 300;

/** What goes to the server: null when the question was skipped. */
export function exitAnswer(reason, note) {
  if (!EXIT_REASONS.some((r) => r.key === reason)) return null;
  const words = String(note || '')
    .trim()
    .slice(0, EXIT_NOTE_MAX);
  return words ? { reason, note: words } : { reason };
}
