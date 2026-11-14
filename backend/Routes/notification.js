import express from 'express';
import { db, id, now, save } from '../store.js';
import { auth } from '../Middleware/auth.js';

const router = express.Router();
const clients = new Map();
router.use(auth);
router.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const userId = req.user.id;
  if (!clients.has(userId)) clients.set(userId, new Set());
  if (clients.get(userId).size >= 10) { res.end(); return; }
  res.sessionId = req.user.sessionId;
  clients.get(userId).add(res);
  res.write(': connected\n\n');
  res.write('data: {"type":"sync"}\n\n');
  const timer = setInterval(() => {
    if (!db.sessions.some(s => s.id === req.user.sessionId && s.expiresAt > Date.now())) { res.end(); return; }
    res.write(': heartbeat\n\n');
  }, 20000);
  req.on('close', () => {
    clearInterval(timer);
    clients.get(userId)?.delete(res);
    if (!clients.get(userId)?.size) clients.delete(userId);
  });
});
router.get('/', (req, res) => res.json(db.notifications.filter(n => n.userId === req.user.id).slice().reverse()));
router.post('/read-all', (req, res) => {
  db.notifications.filter(n => n.userId === req.user.id).forEach(n => { n.isRead = true; });
  save();
  syncUser(req.user.id);
  res.json({ ok: true });
});
router.post('/:id/read', (req, res) => {
  const notification = db.notifications.find(n => n.id === req.params.id && n.userId === req.user.id);
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  notification.isRead = true;
  save();
  syncUser(req.user.id);
  res.json(notification);
});
export function syncUser(userId) {
  for (const res of clients.get(userId) || []) res.write('data: {"type":"sync"}\n\n');
}
export function notifyUser(userId, message, threadId) {
  const notification = { id: id(), userId, message, threadId, isRead: false, createdAt: now() };
  db.notifications.push(notification);
  save();
  for (const res of clients.get(userId) || []) res.write(`data: ${JSON.stringify(notification)}\n\n`);
  return notification;
}
export function closeUserStreams(userId, sessionId) {
  for (const res of clients.get(userId) || []) if (!sessionId || res.sessionId === sessionId) res.end();
}
export function closeAllStreams() {
  for (const responses of clients.values()) for (const res of responses) res.end();
}
export default router;
