import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, database, closeStore, dataDir, id, now, save, publicUser, presentThread } from './store.js';
import { config } from './config.js';
import { security, rateLimit } from './security.js';
import { auth, admin, tokenFor } from './Middleware/auth.js';
import notifications, { notifyUser, closeUserStreams, closeAllStreams, syncUser } from './Routes/notification.js';
import upload from './Config/upload.js';
import { configureSocket } from './socket.js';

const derive = promisify(scrypt);
const app = express();
const httpServer = createServer(app);
const io = configureSocket(httpServer);
const uploadDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);
app.use(security);
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use('/api', rateLimit({ windowMs: 60000, limit: 600 }));
const writeLimit = rateLimit({ windowMs: 60000, limit: 120 });
app.use(express.json({ limit: '128kb' }));
app.use((req, res, next) => {
  if (['POST', 'PATCH'].includes(req.method) && !req.body) req.body = {};
  next();
});
app.use('/uploads', express.static(uploadDir, { dotfiles: 'deny', index: false, maxAge: '1d', immutable: true, setHeaders: res => res.setHeader('Cache-Control', 'public, max-age=86400, immutable') }));
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/ready', (req, res) => {
  try { database.prepare('SELECT 1').get(); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});
const hash = token => createHash('sha256').update(token).digest('hex');
const refreshCookie = req => req.headers.cookie?.split(';').map(c => c.trim()).find(c => c.startsWith('refreshToken='))?.slice(13);
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/auth', maxAge: 7 * 86400000 };
function openSession(user, res) {
  const refreshToken = randomBytes(48).toString('hex');
  const session = { id: id(), userId: user.id, hash: hash(refreshToken), expiresAt: Date.now() + 7 * 86400000 };
  db.sessions = db.sessions.filter(s => s.expiresAt > Date.now());
  db.sessions.push(session);
  const ownSessions = db.sessions.filter(s => s.userId === user.id);
  if (ownSessions.length > 20) { const oldest = ownSessions.slice(0, ownSessions.length - 20); db.sessions = db.sessions.filter(s => !oldest.includes(s)); }
  save();
  res.cookie('refreshToken', refreshToken, cookieOptions);
  return { user: publicUser(user), accessToken: tokenFor(user, session.id) };
}
const loginLimit = rateLimit({ windowMs: 900000, limit: 30 });
function text(value, min, max) { return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max; }
app.post('/api/auth/register', loginLimit, async (req, res) => {
  const { name, email, password } = req.body;
  if (!text(name, 2, 60) || !text(email, 3, 254) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Use a name (2–60 characters), valid email, and password (8–128 characters).' });
  const normalized = email.trim().toLowerCase();
  if (db.users.some(u => u.email === normalized)) return res.status(409).json({ message: 'This email is already registered.' });
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await derive(password, salt, 64)).toString('hex');
  // Recheck after asynchronous password hashing to prevent duplicate registrations.
  if (db.users.some(u => u.email === normalized)) return res.status(409).json({ message: 'This email is already registered.' });
  const user = { id: id(), name: name.trim(), email: normalized, salt, passwordHash, role: config.production || db.users.length ? 'member' : 'admin', createdAt: now(), avatar: '' };
  db.users.push(user);
  res.status(201).json(openSession(user, res));
});
app.post('/api/auth/login', loginLimit, async (req, res) => {
  const { email, password } = req.body;
  if (!text(email, 3, 254) || typeof password !== 'string' || password.length > 128) return res.status(400).json({ message: 'Enter your email and password.' });
  const user = db.users.find(u => u.email === email.trim().toLowerCase());
  const candidate = await derive(password, user?.salt || 'invalid-user', 64);
  if (!user || !timingSafeEqual(candidate, Buffer.from(user.passwordHash, 'hex'))) return res.status(401).json({ message: 'Incorrect email or password.' });
  res.json(openSession(user, res));
});
app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = refreshCookie(req);
  const session = refreshToken && db.sessions.find(s => s.hash === hash(refreshToken) && s.expiresAt > Date.now());
  const user = session && db.users.find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ message: 'Please sign in.' });
  res.json({ user: publicUser(user), accessToken: tokenFor(user, session.id) });
});
app.post('/api/auth/logout', (req, res) => {
  const refreshToken = refreshCookie(req);
  const session = refreshToken && db.sessions.find(s => s.hash === hash(refreshToken));
  db.sessions = db.sessions.filter(s => s !== session);
  if (session) {
    for (const socket of io.sockets.sockets.values()) if (socket.data.user.sessionId === session.id) socket.disconnect(true);
    closeUserStreams(session.userId, session.id);
  }
  save();
  res.clearCookie('refreshToken', { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});
app.get('/api/auth/me', auth, (req, res) => res.json(publicUser(db.users.find(u => u.id === req.user.id))));
app.get('/api/threads', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase().slice(0, 200);
  res.json(db.threads.map(presentThread).filter(t => `${t.title} ${t.content} ${t.author}`.toLowerCase().includes(search)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});
app.post('/api/threads', auth, writeLimit, (req, res) => {
  const { title, content } = req.body;
  if (!text(title, 1, 150) || !text(content, 1, 10000)) return res.status(400).json({ message: 'A title (up to 150 characters) and content (up to 10,000 characters) are required.' });
  const thread = { id: id(), title: title.trim(), content: content.trim(), authorId: req.user.id, createdAt: now() };
  db.threads.push(thread);
  save();
  res.status(201).json(presentThread(thread));
});
app.get('/api/threads/:id', (req, res) => {
  const thread = db.threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  res.json({ ...presentThread(thread), replies: db.replies.filter(r => r.threadId === thread.id).map(r => ({ ...r, author: db.users.find(u => u.id === r.authorId)?.name || 'Deleted user' })) });
});
app.post('/api/threads/:id/replies', auth, writeLimit, (req, res) => {
  const thread = db.threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (!text(req.body.content, 1, 10000)) return res.status(400).json({ message: 'A reply must contain 1–10,000 characters.' });
  const reply = { id: id(), threadId: thread.id, authorId: req.user.id, content: req.body.content.trim(), createdAt: now() };
  db.replies.push(reply);
  save();
  if (thread.authorId !== req.user.id) notifyUser(thread.authorId, `${req.user.name} replied to “${thread.title}”.`, thread.id);
  res.status(201).json({ ...reply, author: req.user.name });
});
app.delete('/api/threads/:id', auth, writeLimit, (req, res) => {
  const thread = db.threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: 'Thread not found.' });
  if (thread.authorId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'Only the author or an administrator can delete this thread.' });
  db.threads = db.threads.filter(t => t !== thread);
  db.replies = db.replies.filter(r => r.threadId !== thread.id);
  db.messages = db.messages.filter(m => m.threadId !== thread.id);
  const affectedUsers = new Set(db.notifications.filter(n => n.threadId === thread.id).map(n => n.userId));
  db.notifications = db.notifications.filter(n => n.threadId !== thread.id);
  save();
  for (const userId of affectedUsers) syncUser(userId);
  io.to(thread.id).emit('thread:deleted', thread.id);
  io.in(thread.id).socketsLeave(thread.id);
  res.json({ ok: true });
});
app.use('/api/notifications', notifications);
app.get('/api/admin/users', auth, admin, (req, res) => res.json(db.users.map(publicUser)));
app.patch('/api/profile', auth, writeLimit, (req, res) => {
  if (!text(req.body.name, 2, 60)) return res.status(400).json({ message: 'Name must contain 2–60 characters.' });
  const user = db.users.find(u => u.id === req.user.id);
  user.name = req.body.name.trim();
  save();
  res.json(publicUser(user));
});
app.post('/api/upload', auth, rateLimit({ windowMs: 60000, limit: 10 }), upload.single('avatar'), (req, res) => {
  const buffer = req.file?.buffer;
  if (!buffer) return res.status(400).json({ message: 'Choose an image first.' });
  let ext;
  if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = 'png';
  else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) ext = 'jpg';
  else if (['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString())) ext = 'gif';
  else if (buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP') ext = 'webp';
  if (!ext) return res.status(400).json({ message: 'The file does not have a supported image signature.' });
  const user = db.users.find(u => u.id === req.user.id);
  const filename = `${id()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, filename), buffer);
  const previous = user.avatar;
  user.avatar = `/uploads/${filename}`;
  save();
  if (previous?.startsWith('/uploads/')) fs.rmSync(path.join(uploadDir, path.basename(previous)), { force: true });
  res.json({ url: user.avatar, user: publicUser(user) });
});
app.use('/api', (req, res) => res.status(404).json({ message: 'API endpoint not found.' }));
const frontendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir, { index: false, maxAge: '1h' }));
  app.get(/.*/, (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    res.sendFile(path.join(frontendDir, 'index.html'));
  });
}
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.code === 'LIMIT_FILE_SIZE' || err.status === 413 ? 413 : err instanceof SyntaxError || err.status === 400 || err.name === 'MulterError' || err.message.startsWith('Only ') ? 400 : 500;
  if (status === 500) console.error(JSON.stringify({ event: 'request_error', requestId: req.requestId, name: err.name, code: err.code || 'INTERNAL_ERROR' }));
  res.status(status).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Image must not exceed 5 MB.' : err.status === 413 ? 'Request is too large.' : status === 500 ? 'Something went wrong on the server.' : err.message });
});
httpServer.requestTimeout = 30000;
httpServer.headersTimeout = 15000;
httpServer.keepAliveTimeout = 65000;
httpServer.listen(config.port, config.host, () => console.log(JSON.stringify({ event: 'listening', host: config.host, port: config.port, mode: config.production ? 'production' : 'development' })));
let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  closeAllStreams();
  const timer = setTimeout(() => process.exit(1), 10000); timer.unref();
  io.close();
  httpServer.close(() => { clearTimeout(timer); closeStore(); process.exit(0); });
  httpServer.closeIdleConnections();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
