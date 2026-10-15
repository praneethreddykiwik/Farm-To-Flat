/**
 * The in-app notification centre (contract, authenticated).
 *
 * GET    /notifications               → the customer's feed, newest first
 * GET    /notifications/unread-count  → { count } for the bell badge
 * POST   /notifications/:id/read      → mark one as read
 * POST   /notifications/read-all      → mark the whole feed as read
 *
 * Notifications are written server-side whenever the customer is told something (order placed,
 * packed, out for delivery, delivered, cancelled, refund, feedback invite, complaint reply), so the
 * feed is the durable record of every WhatsApp / push the customer received.
 */
import { Router } from 'express';
import { asyncHandler } from '../http.js';
import {
  listNotifications,
  unreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from '../customer-store.js';

export const notificationsRouter = Router();

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = listNotifications(req.customerId, { limit: 50 });
    res.json({ notifications: items, unread: unreadNotificationCount(req.customerId) });
  }),
);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    res.json({ count: unreadNotificationCount(req.customerId) });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    const updated = markAllNotificationsRead(req.customerId);
    res.json({ ok: true, updated });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const n = markNotificationRead(req.customerId, req.params.id);
    res.json({ ok: true, notification: n });
  }),
);
