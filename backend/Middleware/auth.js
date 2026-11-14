import jwt from 'jsonwebtoken';
import { db, publicUser } from '../store.js';

export const secret = process.env.JWT_SECRET || db.secret;
export function tokenFor(user, sessionId) {
  return jwt.sign({ userId: user.id, sessionId }, secret, { algorithm: 'HS256', expiresIn: '15m', issuer: 'commonground', audience: 'commonground-web' });
}
export function verifyToken(token) {
  const payload = jwt.verify(token, secret, { algorithms: ['HS256'], issuer: 'commonground', audience: 'commonground-web' });
  const session = db.sessions.find(item => item.id === payload.sessionId && item.userId === payload.userId && item.expiresAt > Date.now());
  const user = db.users.find(item => item.id === payload.userId);
  if (!session || !user) throw new Error('Session expired');
  return { ...publicUser(user), sessionId: session.id };
}
export function auth(req, res, next) {
  try {
    req.user = verifyToken(req.headers.authorization?.replace(/^Bearer /, ''));
    next();
  } catch {
    res.status(401).json({ message: 'Please sign in again.' });
  }
}
export function admin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required.' });
  next();
}
